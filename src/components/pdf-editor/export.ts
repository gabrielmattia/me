import {
	BlendMode,
	concatTransformationMatrix,
	degrees,
	LineCapStyle,
	type PDFOperatorNames as Ops,
	type PDFArray,
	PDFDict,
	PDFDocument,
	type PDFFont,
	PDFHexString,
	type PDFImage,
	PDFName,
	PDFNumber,
	PDFOperator,
	PDFPage,
	PDFPageTree,
	PDFRef,
	popGraphicsState,
	pushGraphicsState,
	rgb,
	StandardFonts,
} from "pdf-lib";
import {
	baselineRatio,
	embeddedFont,
	extraFontBytes,
	fallbackSpaceEm,
	getPdfFont,
	isExtraFamily,
	type LineLayout,
	layoutLines,
	lineHeightOf,
	lineOffsets,
	pdfSpaceCode,
	textLines,
	underlineRects,
	withTextSize,
} from "./fonts";
import { arrowHeadPath, arrowShaftEnd, chain, invert } from "./geometry";
import {
	reserveObjectNumbers,
	snapshotObjects,
	writeIncremental,
} from "./incremental";
import { getPrimarySource, type PdfSource } from "./pdf-source";
import { removalRefs } from "./snapping";
import { isUnchangedSourceEdit } from "./state";
import {
	describeBlock,
	getLibDoc,
	type RunStyle,
	stripPage,
} from "./text-removal";
import type {
	BoxObject,
	DocState,
	EditorObject,
	Matrix,
	PageModel,
	PdfTextStyle,
	StandardFamily,
	TextObject,
} from "./types";

export class ExportError extends Error {}

function color(hex: string) {
	const h = hex.replace("#", "");
	const full =
		h.length === 3 ? [...h].map((c) => c + c).join("") : h.padEnd(6, "0");
	return rgb(
		Number.parseInt(full.slice(0, 2), 16) / 255,
		Number.parseInt(full.slice(2, 4), 16) / 255,
		Number.parseInt(full.slice(4, 6), 16) / 255,
	);
}

const FONT_VARIANTS: Record<
	StandardFamily,
	[StandardFonts, StandardFonts, StandardFonts, StandardFonts]
> = {
	Helvetica: [
		StandardFonts.Helvetica,
		StandardFonts.HelveticaBold,
		StandardFonts.HelveticaOblique,
		StandardFonts.HelveticaBoldOblique,
	],
	Times: [
		StandardFonts.TimesRoman,
		StandardFonts.TimesRomanBold,
		StandardFonts.TimesRomanItalic,
		StandardFonts.TimesRomanBoldItalic,
	],
	Courier: [
		StandardFonts.Courier,
		StandardFonts.CourierBold,
		StandardFonts.CourierOblique,
		StandardFonts.CourierBoldOblique,
	],
};

/** Espaço base (y para baixo) → espaço do usuário do PDF. */
function baseToPdf(page: PageModel): Matrix {
	return invert(page.viewTransform);
}

/**
 * Matriz do espaço local de um objeto de caixa (origem no canto inferior
 * esquerdo do conteúdo, y para cima, sem rotação) para o espaço do PDF.
 */
function boxMatrix(obj: BoxObject, page: PageModel): Matrix {
	const r = (obj.rotation * Math.PI) / 180;
	const cos = Math.cos(r);
	const sin = Math.sin(r);
	const toCenter: Matrix = [1, 0, 0, -1, -obj.w / 2, obj.h / 2];
	const rotate: Matrix = [
		cos,
		sin,
		-sin,
		cos,
		obj.x + obj.w / 2,
		obj.y + obj.h / 2,
	];
	return chain(toCenter, rotate, baseToPdf(page));
}

/** Espaço base com y para cima (para `drawSvgPath`, que inverte o eixo y). */
function baseUpMatrix(page: PageModel): Matrix {
	return chain([1, 0, 0, -1, 0, 0], baseToPdf(page));
}

function withMatrix(page: PDFPage, m: Matrix, draw: () => void) {
	page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...m));
	draw();
	page.pushOperators(popGraphicsState());
}

/** Fontes padrão usam WinAnsi (cobre os acentos do português): o resto vira "?". */
function sanitize(text: string, font: PDFFont): string {
	// Padrão: codificação WinAnsi; TTF (fontkit): mapa de caracteres da fonte.
	const charset = new Set(font.getCharacterSet());
	let out = "";
	for (const ch of text) out += charset.has(ch.codePointAt(0) ?? -1) ? ch : "?";
	return out;
}

/**
 * Dá à página um /Resources próprio (com subdicionários diretos): fontes e
 * imagens novas não alteram recursos compartilhados com outras páginas.
 */
function ownResources(doc: PDFDocument, page: PDFPage) {
	const ctx = doc.context;
	const name = PDFName.of("Resources");
	const inherited =
		page.node.get(name) ?? page.node.getInheritableAttribute(name);
	const dict = inherited ? ctx.lookupMaybe(inherited, PDFDict) : undefined;
	const copy = dict ? dict.clone(ctx) : ctx.obj({});
	for (const key of copy.keys()) {
		const sub = copy.lookup(key);
		if (sub instanceof PDFDict) copy.set(key, sub.clone(ctx));
	}
	page.node.set(PDFName.of("Resources"), copy);
}

/**
 * Página sem nenhuma alteração em relação ao arquivo aberto? Nesse caso o
 * download devolve os bytes originais.
 */
function isPristine(
	doc: DocState,
	objects: EditorObject[],
	primary: PdfSource,
): boolean {
	return (
		objects.length === 0 &&
		doc.pages.length === primary.pdf.numPages &&
		doc.pages.every(
			(p, i) =>
				p.source?.docId === primary.id &&
				p.source.index === i &&
				p.rotation === 0,
		)
	);
}

/**
 * Monta a árvore de páginas na ordem final (só quando a ordem/conjunto mudou).
 * Atributos herdados são copiados para cada folha antes de trocar o pai.
 */
function rebuildPageTree(doc: PDFDocument, pages: PDFPage[]) {
	const ctx = doc.context;
	for (const page of pages) {
		for (const key of ["Resources", "MediaBox", "CropBox", "Rotate"]) {
			const name = PDFName.of(key);
			if (page.node.get(name)) continue;
			const v = page.node.getInheritableAttribute(name);
			if (v) page.node.set(name, v);
		}
	}
	const tree = PDFPageTree.withContext(ctx);
	tree.set(PDFName.of("Kids"), ctx.obj(pages.map((p) => p.ref)));
	tree.set(PDFName.of("Count"), ctx.obj(pages.length));
	const ref = ctx.register(tree);
	for (const page of pages) page.node.setParent(ref);
	doc.catalog.set(PDFName.of("Pages"), ref);
}

/**
 * Exporta o documento. A base é sempre o PDF aberto, carregado de novo e
 * alterado no lugar; a saída é uma atualização incremental (bytes originais +
 * objetos alterados). Sem nenhuma alteração, devolve os bytes originais.
 */
export async function exportPdf(doc: DocState): Promise<Uint8Array> {
	const primary = getPrimarySource();
	if (!primary) throw new ExportError("Documento de origem não encontrado.");
	const objects = doc.objects.filter((o) => !isUnchangedSourceEdit(o));
	if (isPristine(doc, objects, primary)) return primary.bytes.slice();

	const base = await PDFDocument.load(primary.bytes, {
		ignoreEncryption: true,
		updateMetadata: false,
	});
	if (base.isEncrypted) {
		throw new ExportError(
			"PDF criptografado: só é possível baixar sem alterações.",
		);
	}
	reserveObjectNumbers(primary.bytes, base.context);
	const snap = snapshotObjects(base.context);
	const originals = base.getPages();

	// 1. Páginas finais: originais reaproveitadas; cópias para duplicadas/mescladas.
	const used = new Set<number>();
	const finalPages: PDFPage[] = [];
	for (const model of doc.pages) {
		const src = model.source;
		let page: PDFPage;
		if (src?.docId === primary.id && !used.has(src.index)) {
			used.add(src.index);
			page = originals[src.index];
		} else if (src) {
			const srcDoc =
				src.docId === primary.id ? base : await getLibDoc(src.docId);
			if (!srcDoc)
				throw new ExportError("Não foi possível ler um PDF mesclado.");
			[page] = await base.copyPages(srcDoc, [src.index]);
		} else {
			page = PDFPage.create(base);
			page.setSize(model.width, model.height);
		}
		finalPages.push(page);
	}
	const order = (ps: PDFPage[]) => ps.map((p) => p.ref.tag).join(",");
	if (order(finalPages) !== order(originals)) rebuildPageTree(base, finalPages);

	const embedCtx: EmbedContext = {
		primaryId: primary.id,
		originals,
		imported: new Map(),
	};

	// 2. Rotação e objetos de cada página.
	const fonts = new Map<string, PDFFont>();
	const images = new Map<string, PDFImage>();
	const getFont = async (t: TextObject) => {
		const variant = (t.bold ? 1 : 0) + (t.italic ? 2 : 0);
		const family = t.fontFamily;
		const name = isExtraFamily(family)
			? `${family}:${variant}`
			: FONT_VARIANTS[family][variant];
		let f = fonts.get(name);
		if (!f) {
			if (isExtraFamily(family)) {
				// Mesmo TTF da tela, só com os glifos usados (subset).
				const { default: fontkit } = await import("@pdf-lib/fontkit");
				base.registerFontkit(fontkit);
				const bytes = await extraFontBytes(family, t.bold, t.italic);
				f = await base.embedFont(bytes, { subset: true });
			} else {
				f = await base.embedFont(name as StandardFonts);
			}
			fonts.set(name, f);
		}
		return f;
	};
	const getImage = async (src: string) => {
		let img = images.get(src);
		if (!img) {
			const bytes = new Uint8Array(await (await fetch(src)).arrayBuffer());
			img = src.startsWith("data:image/png")
				? await base.embedPng(bytes)
				: await base.embedJpg(bytes);
			images.set(src, img);
		}
		return img;
	};

	for (let i = 0; i < doc.pages.length; i++) {
		const model = doc.pages[i];
		const page = finalPages[i];
		if (model.rotation !== 0) {
			page.setRotation(degrees((model.baseRotation + model.rotation) % 360));
		}
		const pageObjects = objects.filter((o) => o.pageId === model.id);
		if (pageObjects.length === 0) continue;

		ownResources(base, page);

		const sourceTexts = pageObjects.filter(
			(o): o is TextObject => o.type === "text" && o.source !== undefined,
		);
		// Textos editados (bloco inteiro) e linhas substituídas por texto novo.
		const removal = removalRefs(pageObjects);
		let removed = new Set<string>();
		if (removal.length > 0 && model.source) {
			const strip = await stripPage(model, removal);
			if (strip.content) {
				page.node.set(
					PDFName.of("Contents"),
					base.context.register(base.context.flateStream(strip.content)),
				);
				removed = strip.removed;
			}
		}

		// Coberturas (só para textos que não puderam ser removidos) abaixo de tudo.
		for (const t of sourceTexts) {
			if (!t.cover || (t.source && removed.has(t.source.key))) continue;
			const c = t.cover;
			withMatrix(page, baseToPdf(model), () => {
				page.drawRectangle({
					x: c.x,
					y: c.y,
					width: c.w,
					height: c.h,
					color: color(c.color),
				});
			});
		}

		for (const obj of pageObjects) {
			await drawObject(base, page, model, obj, getFont, getImage, embedCtx);
		}
	}

	await base.flush();
	return (
		writeIncremental(primary.bytes, base.context, snap) ??
		(await base.save({ useObjectStreams: false }))
	);
}

const op = (name: string, args: Parameters<typeof PDFOperator.of>[1] = []) =>
	PDFOperator.of(name as Ops, args);

interface EmbedContext {
	primaryId: string;
	/** Páginas originais do PDF principal (antes de reordenar). */
	originals: PDFPage[];
	/** Nomes já criados para fontes trazidas de outra página. */
	imported: Map<string, string>;
}

const baseFontOf = (doc: PDFDocument, ref: unknown): string | undefined => {
	const dict = doc.context.lookupMaybe(ref as PDFRef, PDFDict);
	const name = dict?.get(PDFName.of("BaseFont"));
	return name instanceof PDFName ? name.decodeText() : undefined;
};

/**
 * Nome do recurso /Font da fonte embutida nesta página. Na página de origem é
 * o próprio recurso; em outra página do PDF principal, a mesma fonte (mesmo
 * objeto) é referenciada sob um nome novo. `null` = não disponível.
 */
function resolveFontRes(
	doc: PDFDocument,
	page: PDFPage,
	model: PageModel,
	style: PdfTextStyle,
	baseFont: string,
	ctx: EmbedContext,
): string | null {
	const fontDict = page.node
		.Resources()
		?.lookupMaybe(PDFName.of("Font"), PDFDict);
	if (!fontDict) return null;
	const samePage =
		model.source?.docId === style.docId &&
		model.source.index === style.pageIndex;
	if (samePage && style.fontRes) {
		const ref = fontDict.get(PDFName.of(style.fontRes));
		if (ref && (!baseFont || baseFontOf(doc, ref) === baseFont))
			return style.fontRes;
	}
	if (samePage) {
		for (const [key, ref] of fontDict.entries())
			if (baseFontOf(doc, ref) === baseFont) return key.decodeText();
	}
	if (style.docId !== ctx.primaryId) return null;
	const srcFonts = ctx.originals[style.pageIndex]?.node
		.Resources()
		?.lookupMaybe(PDFName.of("Font"), PDFDict);
	if (!srcFonts) return null;
	let ref: ReturnType<PDFDict["get"]>;
	const byRes = style.fontRes
		? srcFonts.get(PDFName.of(style.fontRes))
		: undefined;
	if (byRes && (!baseFont || baseFontOf(doc, byRes) === baseFont)) ref = byRes;
	else
		for (const [, r] of srcFonts.entries())
			if (baseFontOf(doc, r) === baseFont) ref = r;
	if (!(ref instanceof PDFRef)) return null;
	// A página já usa o mesmo objeto de fonte?
	for (const [key, r] of fontDict.entries())
		if (r instanceof PDFRef && r.tag === ref.tag) return key.decodeText();
	let name = ctx.imported.get(ref.tag);
	if (!name || fontDict.get(PDFName.of(name))) {
		let n = 1;
		while (fontDict.get(PDFName.of(`EdF${n}`))) n++;
		name = `EdF${n}`;
		ctx.imported.set(ref.tag, name);
	}
	fontDict.set(PDFName.of(name), ref);
	return name;
}

/** Estilo do texto original (blocos editados sem `pdfStyle`, ex.: antigos). */
async function legacyStyle(
	model: PageModel,
	t: TextObject,
): Promise<PdfTextStyle | null> {
	if (!t.source || !model.source) return null;
	const desc: RunStyle | null = await describeBlock(model, t.source.lines);
	if (!desc?.run.fontRes) return null;
	return {
		docId: model.source.docId,
		pageIndex: model.source.index,
		fontRes: desc.run.fontRes,
		charSpacing: desc.run.charSpacing * desc.scale,
		wordSpacing: desc.run.wordSpacing * desc.scale,
		hScale: desc.run.hScale,
		fill: desc.run.fill,
		gs: desc.run.gs,
		color: t.source.color,
	};
}

/**
 * Texto com a fonte embutida do próprio PDF: mesmo objeto /Font, Tc/Tw/Tz, cor
 * original e o ajuste de cada caractere (o mesmo layout da tela).
 * `false` = não foi possível, usar fonte padrão.
 */
async function drawEmbeddedText(
	doc: PDFDocument,
	page: PDFPage,
	model: PageModel,
	t: TextObject,
	loadedName: string,
	ctx: EmbedContext,
): Promise<boolean> {
	const info = getPdfFont(loadedName);
	if (!info) return false;
	const style = t.pdfStyle ?? (await legacyStyle(model, t));
	if (!style) return false;
	const fontRes = resolveFontRes(doc, page, model, style, info.baseFont, ctx);
	if (!fontRes) return false;
	const samePage =
		model.source?.docId === style.docId &&
		model.source.index === style.pageIndex;
	const obj: TextObject = { ...t, pdfStyle: style };

	const space = pdfSpaceCode(info);
	const bytesPerCode = info.composite ? 4 : 2;
	const encodeLine = (line: LineLayout): PDFArray => {
		const arr = doc.context.obj([]) as PDFArray;
		let hex = "";
		const flush = () => {
			if (hex) arr.push(PDFHexString.of(hex));
			hex = "";
		};
		const chars = Array.from(line.text);
		chars.forEach((ch, i) => {
			const code = ch === " " ? space : info.codes.get(ch);
			const last = i === chars.length - 1;
			const kern = last ? 0 : (line.kerns[i] ?? 0);
			if (code === undefined) {
				// Espaço sem glifo: só deslocamento (mesmo modelo de `pdfAdvance`).
				flush();
				arr.push(
					PDFNumber.of(round4(-fallbackSpaceEm(t.fontFamily) * 1000 + kern)),
				);
				return;
			}
			hex += code.toString(16).padStart(bytesPerCode, "0");
			if (kern) {
				flush();
				arr.push(PDFNumber.of(round4(kern)));
			}
		});
		flush();
		return arr;
	};

	const lines = layoutLines(obj);
	const offsets = lineOffsets(obj);
	const lh = lineHeightOf(t) * t.fontSize;
	const first = t.h - baselineRatio(t) * t.fontSize;
	const sameColor = t.color === style.color;

	const ops: PDFOperator[] = [
		pushGraphicsState(),
		concatTransformationMatrix(...boxMatrix(t, model)),
	];
	// gs e cores com nome (espaço de cor/padrão) só existem na página de origem.
	if (samePage)
		for (const name of style.gs) ops.push(op("gs", [PDFName.of(name)]));
	if (t.opacity < 1) {
		const gs = page.node.newExtGState(
			"GS",
			doc.context.obj({ Type: "ExtGState", ca: t.opacity, CA: t.opacity }),
		);
		ops.push(op("gs", [gs]));
	}
	const namedFill = style.fill.some((f) =>
		f.args.some((a) => typeof a !== "number"),
	);
	if (sameColor && style.fill.length && (samePage || !namedFill)) {
		for (const f of style.fill) {
			ops.push(
				op(
					f.op,
					f.args.map((a) =>
						typeof a === "number" ? PDFNumber.of(a) : PDFName.of(a.name),
					),
				),
			);
		}
	} else {
		const c = color(t.color);
		ops.push(
			op("rg", [
				PDFNumber.of(c.red),
				PDFNumber.of(c.green),
				PDFNumber.of(c.blue),
			]),
		);
	}
	ops.push(
		op("BT"),
		op("Tf", [PDFName.of(fontRes), PDFNumber.of(t.fontSize)]),
		op("Tr", [PDFNumber.of(0)]),
	);
	if (style.charSpacing) ops.push(op("Tc", [PDFNumber.of(style.charSpacing)]));
	if (style.wordSpacing) ops.push(op("Tw", [PDFNumber.of(style.wordSpacing)]));
	if (style.hScale !== 100) ops.push(op("Tz", [PDFNumber.of(style.hScale)]));
	lines.forEach((line, i) => {
		if (!line.text) return;
		ops.push(
			op("Tm", [
				PDFNumber.of(1),
				PDFNumber.of(0),
				PDFNumber.of(0),
				PDFNumber.of(1),
				PDFNumber.of(offsets[i] ?? 0),
				PDFNumber.of(first - i * lh),
			]),
			op("TJ", [encodeLine(line)]),
		);
	});
	ops.push(op("ET"), popGraphicsState());
	page.pushOperators(...ops);
	return true;
}

const round4 = (v: number) => Math.round(v * 10000) / 10000;

/** Sublinhado: retângulos com a mesma geometria desenhada na tela. */
function drawUnderline(page: PDFPage, model: PageModel, t: TextObject) {
	if (!t.underline) return;
	const rects = underlineRects(t);
	withMatrix(page, boxMatrix(t, model), () => {
		for (const r of rects) {
			page.drawRectangle({
				x: r.x,
				y: t.h - r.y - r.h,
				width: r.w,
				height: r.h,
				color: color(t.color),
				opacity: t.opacity,
			});
		}
	});
}

async function drawObject(
	doc: PDFDocument,
	page: PDFPage,
	model: PageModel,
	obj: EditorObject,
	getFont: (t: TextObject) => Promise<PDFFont>,
	getImage: (src: string) => Promise<PDFImage>,
	ctx: EmbedContext,
) {
	if (obj.type === "line") {
		const [ex, ey] = obj.arrow
			? arrowShaftEnd(obj.x1, obj.y1, obj.x2, obj.y2, obj.strokeWidth)
			: [obj.x2, obj.y2];
		const path = `M ${obj.x1} ${obj.y1} L ${ex} ${ey}`;
		withMatrix(page, baseUpMatrix(model), () => {
			page.drawSvgPath(path, {
				x: 0,
				y: 0,
				borderColor: color(obj.color),
				borderWidth: obj.strokeWidth,
				borderOpacity: obj.opacity,
				borderLineCap: LineCapStyle.Round,
			});
			if (obj.arrow) {
				page.drawSvgPath(
					arrowHeadPath(obj.x1, obj.y1, obj.x2, obj.y2, obj.strokeWidth),
					{
						x: 0,
						y: 0,
						color: color(obj.color),
						opacity: obj.opacity,
					},
				);
			}
		});
		return;
	}

	if (obj.type === "text") {
		const embedded = embeddedFont(obj);
		if (
			embedded &&
			(await drawEmbeddedText(doc, page, model, obj, embedded, ctx))
		) {
			drawUnderline(page, model, obj);
			return;
		}
		// Sem a fonte embutida, a posição usa as métricas da fonte padrão.
		const t: TextObject = embedded
			? withTextSize({ ...obj, pdfFont: undefined })
			: obj;
		const font = await getFont(t);
		const lines = textLines(t);
		const offsets = lineOffsets(t);
		const first = t.h - baselineRatio(t) * t.fontSize;
		const lh = lineHeightOf(t) * t.fontSize;
		withMatrix(page, boxMatrix(t, model), () => {
			lines.forEach((line, i) => {
				if (!line) return;
				page.drawText(sanitize(line, font), {
					x: offsets[i] ?? 0,
					y: first - i * lh,
					size: t.fontSize,
					font,
					color: color(t.color),
					opacity: t.opacity,
				});
			});
		});
		drawUnderline(page, model, t);
		return;
	}

	if (obj.type === "image") {
		const img = await getImage(obj.src);
		withMatrix(page, boxMatrix(obj, model), () => {
			page.drawImage(img, {
				x: 0,
				y: 0,
				width: obj.w,
				height: obj.h,
				opacity: obj.opacity,
			});
		});
		return;
	}

	if (obj.type === "ink") {
		if (obj.points.length === 0) return;
		const path = obj.points
			.map(([px, py], i) => `${i ? "L" : "M"} ${px * obj.w} ${py * obj.h}`)
			.join(" ");
		// drawSvgPath inverte o y em torno de `y`: com y = h o path em
		// coordenadas y-para-baixo cai na posição certa do espaço local.
		withMatrix(page, boxMatrix(obj, model), () => {
			page.drawSvgPath(obj.points.length === 1 ? `${path} l 0.01 0` : path, {
				x: 0,
				y: obj.h,
				borderColor: color(obj.color),
				borderWidth: obj.strokeWidth,
				borderOpacity: obj.opacity,
				borderLineCap: LineCapStyle.Round,
			});
		});
		return;
	}

	withMatrix(page, boxMatrix(obj, model), () => {
		if (obj.type === "whiteout") {
			page.drawRectangle({
				x: 0,
				y: 0,
				width: obj.w,
				height: obj.h,
				color: color(obj.color),
			});
		} else if (obj.type === "highlight") {
			page.drawRectangle({
				x: 0,
				y: 0,
				width: obj.w,
				height: obj.h,
				color: color(obj.color),
				opacity: obj.opacity,
				blendMode: BlendMode.Multiply,
			});
		} else if (obj.type === "rect") {
			const sw = obj.stroke ? obj.strokeWidth : 0;
			page.drawRectangle({
				x: sw / 2,
				y: sw / 2,
				width: Math.max(0, obj.w - sw),
				height: Math.max(0, obj.h - sw),
				color: obj.fill ? color(obj.fill) : undefined,
				opacity: obj.opacity,
				borderColor: obj.stroke && sw > 0 ? color(obj.stroke) : undefined,
				borderWidth: sw > 0 ? sw : undefined,
				borderOpacity: obj.opacity,
			});
		} else if (obj.type === "ellipse") {
			const sw = obj.stroke ? obj.strokeWidth : 0;
			page.drawEllipse({
				x: obj.w / 2,
				y: obj.h / 2,
				xScale: Math.max(0, obj.w / 2 - sw / 2),
				yScale: Math.max(0, obj.h / 2 - sw / 2),
				color: obj.fill ? color(obj.fill) : undefined,
				opacity: obj.opacity,
				borderColor: obj.stroke && sw > 0 ? color(obj.stroke) : undefined,
				borderWidth: sw > 0 ? sw : undefined,
				borderOpacity: obj.opacity,
			});
		}
	});
}

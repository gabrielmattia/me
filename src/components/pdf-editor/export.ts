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
	popGraphicsState,
	pushGraphicsState,
	rgb,
	StandardFonts,
} from "pdf-lib";
import {
	baselineRatio,
	embeddedFont,
	fallbackSpaceEm,
	getPdfFont,
	lineHeightOf,
	measureLines,
	pdfFontHasGlyph,
} from "./fonts";
import { arrowHeadPath, arrowShaftEnd, chain, invert } from "./geometry";
import {
	reserveObjectNumbers,
	snapshotObjects,
	writeIncremental,
} from "./incremental";
import { getPrimarySource, type PdfSource } from "./pdf-source";
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
	FontFamily,
	Matrix,
	PageModel,
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
	FontFamily,
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
	let out = "";
	for (const ch of text) {
		try {
			font.encodeText(ch);
			out += ch;
		} catch {
			out += "?";
		}
	}
	return out;
}

/** Deslocamento x de cada linha conforme o alinhamento (mesma medida da tela). */
function lineOffsets(t: TextObject): number[] {
	const widths = measureLines(t);
	return widths.map((w) =>
		t.align === "right" ? t.w - w : t.align === "center" ? (t.w - w) / 2 : 0,
	);
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

	// 2. Rotação e objetos de cada página.
	const fonts = new Map<StandardFonts, PDFFont>();
	const images = new Map<string, PDFImage>();
	const getFont = async (t: TextObject) => {
		const name =
			FONT_VARIANTS[t.fontFamily][(t.bold ? 1 : 0) + (t.italic ? 2 : 0)];
		let f = fonts.get(name);
		if (!f) {
			f = await base.embedFont(name);
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
		let removed = new Set<string>();
		if (sourceTexts.length > 0 && model.source) {
			const strip = await stripPage(
				model,
				sourceTexts.map((t) => ({
					key: (t.source as NonNullable<TextObject["source"]>).key,
					lines: (t.source as NonNullable<TextObject["source"]>).lines,
				})),
			);
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
			await drawObject(base, page, model, obj, getFont, getImage);
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

/**
 * Texto com a fonte embutida do próprio PDF (mesmo recurso /Font da página,
 * com Tc/Tz e cor originais). `false` = não foi possível, usar fonte padrão.
 */
async function drawEmbeddedText(
	doc: PDFDocument,
	page: PDFPage,
	model: PageModel,
	t: TextObject,
	loadedName: string,
): Promise<boolean> {
	const info = getPdfFont(loadedName);
	if (!info || !t.source) return false;
	const style: RunStyle | null = await describeBlock(model, t.source.lines);
	const fontRes = style?.run.fontRes;
	if (!style || !fontRes) return false;
	const res = page.node.Resources();
	const fontDict = res?.lookupMaybe(PDFName.of("Font"), PDFDict);
	if (!fontDict?.get(PDFName.of(fontRes))) return false;

	const { run, scale } = style;
	const hScale = run.hScale / 100 || 1;
	const spaceCode = pdfFontHasGlyph(loadedName, " ")
		? info.codes.get(" ")
		: undefined;
	const spaceAdjust = (-fallbackSpaceEm(t.fontFamily) * 1000) / hScale;
	const bytesPerCode = info.composite ? 4 : 2;

	const encodeLine = (line: string): PDFArray => {
		const arr = doc.context.obj([]) as PDFArray;
		let hex = "";
		const flush = () => {
			if (hex) arr.push(PDFHexString.of(hex));
			hex = "";
		};
		for (const ch of line) {
			const code = ch === " " ? spaceCode : info.codes.get(ch);
			if (code === undefined) {
				flush();
				arr.push(PDFNumber.of(Math.round(spaceAdjust)));
			} else {
				hex += code.toString(16).padStart(bytesPerCode, "0");
			}
		}
		flush();
		return arr;
	};

	const lines = t.content.split("\n");
	const offsets = lineOffsets(t);
	const lh = lineHeightOf(t) * t.fontSize;
	const first = t.h - baselineRatio(t) * t.fontSize;
	const sameColor = t.color === t.source.color;

	const ops: PDFOperator[] = [
		pushGraphicsState(),
		concatTransformationMatrix(...boxMatrix(t, model)),
	];
	for (const name of run.gs) ops.push(op("gs", [PDFName.of(name)]));
	if (t.opacity < 1) {
		const gs = page.node.newExtGState(
			"GS",
			doc.context.obj({ Type: "ExtGState", ca: t.opacity, CA: t.opacity }),
		);
		ops.push(op("gs", [gs]));
	}
	if (sameColor) {
		for (const f of run.fill) {
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
	if (run.charSpacing)
		ops.push(op("Tc", [PDFNumber.of(run.charSpacing * scale)]));
	if (run.wordSpacing)
		ops.push(op("Tw", [PDFNumber.of(run.wordSpacing * scale)]));
	if (run.hScale !== 100) ops.push(op("Tz", [PDFNumber.of(run.hScale)]));
	lines.forEach((line, i) => {
		if (!line) return;
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

async function drawObject(
	doc: PDFDocument,
	page: PDFPage,
	model: PageModel,
	obj: EditorObject,
	getFont: (t: TextObject) => Promise<PDFFont>,
	getImage: (src: string) => Promise<PDFImage>,
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
		if (embedded && (await drawEmbeddedText(doc, page, model, obj, embedded)))
			return;
		// Sem a fonte embutida, a posição usa as métricas da fonte padrão.
		const t: TextObject = embedded ? { ...obj, pdfFont: undefined } : obj;
		const font = await getFont(t);
		const lines = t.content.split("\n");
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

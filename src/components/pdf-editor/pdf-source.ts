import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import {
	clearPdfFonts,
	getPdfFont,
	matchStandardFont,
	registerPdfFont,
} from "./fonts";
import { multiply } from "./geometry";
import { uid } from "./state";
import type {
	FontFamily,
	Matrix,
	PageModel,
	TextBlock,
	TextLine,
} from "./types";

/**
 * PDFs carregados ficam fora do reducer (não fazem parte do undo): o histórico
 * só guarda referências `{ docId, index }`.
 */
export interface PdfSource {
	id: string;
	name: string;
	/** Bytes originais — usados pelo pdf-lib na exportação. */
	bytes: Uint8Array;
	pdf: PDFDocumentProxy;
}

const sources = new Map<string, PdfSource>();
/** Primeiro PDF aberto: a exportação parte dele (atualização incremental). */
let primaryId: string | null = null;
const textCache = new Map<string, Promise<TextBlock[]>>();

export async function loadPdfjs() {
	const lib = await import("pdfjs-dist");
	if (!lib.GlobalWorkerOptions.workerSrc) {
		lib.GlobalWorkerOptions.workerSrc = new URL(
			"pdfjs-dist/build/pdf.worker.mjs",
			import.meta.url,
		).href;
	}
	return lib;
}

export function getSource(id: string): PdfSource | undefined {
	return sources.get(id);
}

export function getPrimarySource(): PdfSource | undefined {
	return primaryId ? sources.get(primaryId) : undefined;
}

const clearListeners = new Set<() => void>();

/** Outros caches (ex.: remoção de texto) se registram para limpar junto. */
export function onSourcesCleared(fn: () => void) {
	clearListeners.add(fn);
}

export function clearSources() {
	for (const s of sources.values()) s.pdf.destroy().catch(() => {});
	sources.clear();
	textCache.clear();
	primaryId = null;
	clearPdfFonts();
	for (const fn of clearListeners) fn();
}

export class PdfLoadError extends Error {}

export async function loadPdfFile(
	file: File,
): Promise<{ source: PdfSource; pages: PageModel[] }> {
	const bytes = new Uint8Array(await file.arrayBuffer());
	const pdfjs = await loadPdfjs();
	let pdf: PDFDocumentProxy;
	try {
		// pdfjs transfere o buffer para o worker — passa uma cópia.
		pdf = await pdfjs.getDocument({
			data: bytes.slice(),
			// Expõe toUnicode/larguras das fontes para reutilizar a fonte embutida.
			fontExtraProperties: true,
		}).promise;
	} catch (err) {
		if ((err as { name?: string }).name === "PasswordException") {
			throw new PdfLoadError("PDF protegido por senha não é suportado.");
		}
		throw new PdfLoadError("Não foi possível ler este arquivo como PDF.");
	}
	const source: PdfSource = { id: uid(), name: file.name, bytes, pdf };
	sources.set(source.id, source);
	primaryId ??= source.id;
	const pages: PageModel[] = [];
	for (let i = 0; i < pdf.numPages; i++) {
		const page = await pdf.getPage(i + 1);
		const vp = page.getViewport({ scale: 1 });
		pages.push({
			id: uid(),
			source: { docId: source.id, index: i },
			width: vp.width,
			height: vp.height,
			viewTransform: vp.transform as Matrix,
			baseRotation: page.rotate,
			rotation: 0,
		});
	}
	return { source, pages };
}

export function blankPage(width = 595.28, height = 841.89): PageModel {
	return {
		id: uid(),
		source: null,
		width,
		height,
		viewTransform: [1, 0, 0, -1, 0, height],
		baseRotation: 0,
		rotation: 0,
	};
}

export async function getPdfPage(
	docId: string,
	index: number,
): Promise<PDFPageProxy | null> {
	const src = sources.get(docId);
	if (!src) return null;
	return src.pdf.getPage(index + 1);
}

// ─── Detecção de texto existente ─────────────────────────────────────────────

interface RawItem {
	str: string;
	transform: number[];
	width: number;
	height: number;
	fontName: string;
	hasEOL?: boolean;
}

interface FontData {
	name?: string;
	fallbackName?: string;
	bold?: boolean;
	black?: boolean;
	italic?: boolean;
	loadedName?: string;
	missingFile?: boolean;
	isType3Font?: boolean;
	vertical?: boolean;
	composite?: boolean;
	cMap?: {
		name?: string;
		codespaceRanges?: number[][];
		_map?: Array<number | undefined>;
	};
	toUnicode?: {
		_map?: Array<string | undefined>;
		firstChar?: number;
		lastChar?: number;
	};
	widths?: Record<number, number>;
	defaultWidth?: number;
}

function fontData(page: PDFPageProxy, fontName: string): FontData {
	try {
		if (page.commonObjs.has(fontName)) {
			return page.commonObjs.get(fontName) as FontData;
		}
	} catch {
		/* fonte ainda não resolvida */
	}
	return {};
}

/** Código de 2 bytes = CID (Identity-H, inclusive CMaps embutidos equivalentes). */
function isIdentityCMap(cm: FontData["cMap"]): boolean {
	if (!cm) return false;
	if (cm.name === "Identity-H") return true;
	const r = cm.codespaceRanges;
	const twoByteOnly =
		r?.[1]?.length === 2 &&
		r[1][0] === 0 &&
		r[1][1] === 0xffff &&
		[0, 2, 3].every((i) => !r[i]?.length);
	return Boolean(twoByteOnly) && (cm._map ?? []).every((v, i) => v === i);
}

/** Registra a fonte embutida para reutilização, se o pdfjs a carregou como fonte de verdade. */
function registerFont(font: FontData, family: FontFamily) {
	const name = font.loadedName;
	if (!name || getPdfFont(name)) return;
	if (font.missingFile || font.isType3Font || font.vertical) return;
	const composite = Boolean(font.composite);
	if (composite && !isIdentityCMap(font.cMap)) return;
	const codes = new Map<string, number>();
	const map = font.toUnicode?._map;
	if (Array.isArray(map)) {
		map.forEach((u, code) => {
			if (typeof u === "string" && [...u].length === 1 && !codes.has(u))
				codes.set(u, code);
		});
	} else if (font.toUnicode && typeof font.toUnicode.firstChar === "number") {
		const last = font.toUnicode.lastChar ?? 0xffff;
		for (let c = font.toUnicode.firstChar; c <= last; c++)
			codes.set(String.fromCharCode(c), c);
	}
	if (codes.size === 0) return;
	registerPdfFont({
		loadedName: name,
		composite,
		codes,
		widths: font.widths ?? {},
		defaultWidth: font.defaultWidth ?? 0,
		family,
	});
}

/** Linha detectada + fonte do pdfjs (para agrupar em parágrafos). */
export interface DetectedLine extends TextLine {
	fontName: string;
}

/**
 * Agrupa os itens de `getTextContent` em linhas (itens na mesma baseline,
 * mesmo tamanho e próximos na horizontal). Só considera texto horizontal no
 * espaço base. Função pura: também usada para verificar a remoção de texto.
 */
export function extractLines(
	content: { items: unknown[]; styles: unknown },
	viewTransform: Matrix,
): DetectedLine[] {
	const styles = content.styles as Record<
		string,
		{ fontFamily?: string; ascent?: number; descent?: number }
	>;
	const lines: DetectedLine[] = [];
	let cur: (DetectedLine & { right: number }) | null = null;

	const flush = () => {
		if (cur?.str.trim()) {
			const { right: _r, ...line } = cur;
			lines.push({ ...line, str: line.str.trim() });
		}
		cur = null;
	};

	for (const raw of content.items) {
		if (!raw || typeof raw !== "object" || !("str" in raw)) continue;
		const item = raw as RawItem;
		const tx = multiply(item.transform as Matrix, viewTransform);
		const horizontal = Math.abs(tx[1]) < 0.01 && Math.abs(tx[2]) < 0.01;
		const size = Math.hypot(tx[2], tx[3]);
		if (!horizontal || tx[0] <= 0 || size < 1) {
			flush();
			continue;
		}
		const style = styles[item.fontName] ?? {};
		const ascent = style.ascent && style.ascent > 0 ? style.ascent : 0.8;
		const descent = style.descent ? Math.abs(style.descent) : 0.2;
		const left = tx[4];
		const baseline = tx[5];
		const width = item.width;

		const c = cur as (DetectedLine & { right: number }) | null;
		const sameLine =
			c &&
			Math.abs(c.baseline - baseline) < c.fontSize * 0.3 &&
			Math.abs(c.fontSize - size) < c.fontSize * 0.2 &&
			left - c.right > -c.fontSize * 0.5 &&
			left - c.right < c.fontSize * 1.2;

		if (!item.str.trim()) {
			if (c && sameLine) {
				c.str += " ";
				c.right = Math.max(c.right, left + width);
				c.w = c.right - c.x;
			}
			if (item.hasEOL) flush();
			continue;
		}

		if (c && sameLine) {
			const gap = left - c.right;
			const needsSpace =
				gap > c.fontSize * 0.15 &&
				!c.str.endsWith(" ") &&
				!item.str.startsWith(" ");
			c.str += (needsSpace ? " " : "") + item.str;
			c.right = Math.max(c.right, left + width);
			c.w = c.right - c.x;
		} else {
			flush();
			cur = {
				str: item.str,
				x: left,
				y: baseline - ascent * size,
				w: width,
				h: (ascent + descent) * size,
				baseline,
				fontSize: size,
				fontName: item.fontName,
				right: left + width,
			};
		}
		if (item.hasEOL) flush();
	}
	flush();
	return lines;
}

/** Chave estável de uma linha (texto + posição arredondada). */
export const lineKey = (l: TextLine) =>
	`${l.str}|${Math.round(l.x)}|${Math.round(l.baseline)}`;

/**
 * Une linhas consecutivas de um mesmo parágrafo: mesma fonte e tamanho,
 * alinhadas à esquerda e com espaçamento regular entre baselines.
 */
function groupParagraphs(lines: DetectedLine[]): DetectedLine[][] {
	const groups: DetectedLine[][] = [];
	for (const line of lines) {
		const g = groups[groups.length - 1];
		const last = g?.[g.length - 1];
		if (g && last) {
			const size = last.fontSize;
			const gap = line.baseline - last.baseline;
			const prevGap =
				g.length > 1 ? last.baseline - g[g.length - 2].baseline : gap;
			if (
				line.fontName === last.fontName &&
				Math.abs(line.fontSize - size) < size * 0.05 &&
				Math.abs(line.x - g[0].x) < size * 0.5 &&
				gap > size * 0.95 &&
				gap < size * 1.75 &&
				Math.abs(gap - prevGap) < size * 0.1
			) {
				g.push(line);
				continue;
			}
		}
		groups.push([line]);
	}
	return groups;
}

export function getTextBlocks(page: PageModel): Promise<TextBlock[]> {
	const src = page.source;
	if (!src) return Promise.resolve([]);
	const cacheKey = `${src.docId}:${src.index}`;
	const cached = textCache.get(cacheKey);
	if (cached) return cached;
	const promise = (async () => {
		const pdfPage = await getPdfPage(src.docId, src.index);
		if (!pdfPage) return [];
		// Garante que as fontes da página foram carregadas (commonObjs).
		await pdfPage.getOperatorList();
		const content = await pdfPage.getTextContent();
		const lines = extractLines(content, page.viewTransform);
		return groupParagraphs(lines).map((group, n): TextBlock => {
			const first = group[0];
			const font = fontData(pdfPage, first.fontName);
			const style = (content.styles as Record<string, { fontFamily?: string }>)[
				first.fontName
			];
			const match = matchStandardFont(
				font.name ?? "",
				`${font.fallbackName ?? ""} ${style?.fontFamily ?? ""}`,
			);
			registerFont(font, match.family);
			const x = Math.min(...group.map((l) => l.x));
			const y = Math.min(...group.map((l) => l.y));
			const right = Math.max(...group.map((l) => l.x + l.w));
			const bottom = Math.max(...group.map((l) => l.y + l.h));
			return {
				key: `${cacheKey}:${n}`,
				str: group.map((l) => l.str).join("\n"),
				lines: group.map(({ fontName: _f, ...l }) => l),
				x,
				y,
				w: right - x,
				h: bottom - y,
				baseline: first.baseline,
				fontSize: first.fontSize,
				leading:
					group.length > 1
						? (group[group.length - 1].baseline - first.baseline) /
							(group.length - 1)
						: 0,
				fontFamily: match.family,
				bold: Boolean(font.bold || font.black) || match.bold,
				italic: Boolean(font.italic) || match.italic,
				fontName: first.fontName,
			};
		});
	})();
	textCache.set(cacheKey, promise);
	promise.catch(() => textCache.delete(cacheKey));
	return promise;
}

// ─── Amostragem de cor no canvas renderizado ─────────────────────────────────

const toHex = (r: number, g: number, b: number) =>
	`#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;

/**
 * Cor de fundo = cor mais frequente num anel em volta da caixa;
 * cor do texto = pixel dentro da caixa mais distante do fundo.
 * `rect` em pixels do canvas.
 */
export function sampleColors(
	canvas: HTMLCanvasElement,
	rect: { x: number; y: number; w: number; h: number },
): { background: string; foreground: string } {
	const fallback = { background: "#ffffff", foreground: "#000000" };
	const ctx = canvas.getContext("2d", { willReadFrequently: true });
	if (!ctx || canvas.width === 0) return fallback;
	const pad = 3;
	const x0 = Math.max(0, Math.floor(rect.x) - pad);
	const y0 = Math.max(0, Math.floor(rect.y) - pad);
	const x1 = Math.min(canvas.width, Math.ceil(rect.x + rect.w) + pad);
	const y1 = Math.min(canvas.height, Math.ceil(rect.y + rect.h) + pad);
	if (x1 - x0 < 2 || y1 - y0 < 2) return fallback;
	let data: Uint8ClampedArray;
	try {
		data = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
	} catch {
		return fallback;
	}
	const width = x1 - x0;
	const height = y1 - y0;
	const counts = new Map<number, number>();
	const px = (i: number) =>
		[data[i * 4], data[i * 4 + 1], data[i * 4 + 2]] as const;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const ring = x < pad || y < pad || x >= width - pad || y >= height - pad;
			if (!ring) continue;
			const [r, g, b] = px(y * width + x);
			const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
			counts.set(key, (counts.get(key) ?? 0) + 1);
		}
	}
	let bestKey = 0;
	let best = -1;
	for (const [k, c] of counts) {
		if (c > best) {
			best = c;
			bestKey = k;
		}
	}
	const bg: [number, number, number] = [
		((bestKey >> 10) & 31) * 8 + 4,
		((bestKey >> 5) & 31) * 8 + 4,
		(bestKey & 31) * 8 + 4,
	];
	// Refina o fundo com a média dos pixels do anel próximos da moda.
	let sr = 0;
	let sg = 0;
	let sb = 0;
	let sn = 0;
	let fg: [number, number, number] = [0, 0, 0];
	let fgDist = -1;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const [r, g, b] = px(y * width + x);
			const dist =
				Math.abs(r - bg[0]) + Math.abs(g - bg[1]) + Math.abs(b - bg[2]);
			const ring = x < pad || y < pad || x >= width - pad || y >= height - pad;
			if (ring) {
				if (dist < 24) {
					sr += r;
					sg += g;
					sb += b;
					sn++;
				}
			} else if (dist > fgDist) {
				fgDist = dist;
				fg = [r, g, b];
			}
		}
	}
	const background = sn
		? toHex(Math.round(sr / sn), Math.round(sg / sn), Math.round(sb / sn))
		: toHex(...bg);
	return {
		background,
		foreground: fgDist > 60 ? toHex(...fg) : "#000000",
	};
}

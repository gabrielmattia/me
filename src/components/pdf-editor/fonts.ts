import { rotateVec } from "./geometry";
import type { FontFamily, TextObject } from "./types";

export const LINE_HEIGHT = 1.2;

export const FONT_OPTIONS: Array<{
	value: FontFamily;
	label: string;
	css: string;
}> = [
	{
		value: "Helvetica",
		label: "Helvetica",
		css: "Helvetica, Arial, 'Liberation Sans', sans-serif",
	},
	{
		value: "Times",
		label: "Times",
		css: "'Times New Roman', Times, 'Liberation Serif', serif",
	},
	{
		value: "Courier",
		label: "Courier",
		css: "'Courier New', Courier, 'Liberation Mono', monospace",
	},
];

/**
 * Métricas (ascent/descent em em) aproximadas das fontes de sistema de cada
 * família padrão — usadas só quando o navegador não informa as métricas reais.
 */
const METRICS: Record<FontFamily, { ascent: number; descent: number }> = {
	Helvetica: { ascent: 0.905, descent: 0.212 },
	Times: { ascent: 0.891, descent: 0.216 },
	Courier: { ascent: 0.833, descent: 0.3 },
};

export function cssFont(family: FontFamily): string {
	return FONT_OPTIONS.find((o) => o.value === family)?.css ?? "sans-serif";
}

// ─── Fontes embutidas do PDF ─────────────────────────────────────────────────

/** Dados de uma fonte embutida (vindos do pdfjs com `fontExtraProperties`). */
export interface PdfFontInfo {
	loadedName: string;
	/** Type0 Identity-H: códigos de 2 bytes. */
	composite: boolean;
	/** Caractere Unicode → código no PDF. */
	codes: Map<string, number>;
	/** Larguras em milésimos de em, por código. */
	widths: Record<number, number>;
	defaultWidth: number;
	family: FontFamily;
}

const pdfFonts = new Map<string, PdfFontInfo>();

export function registerPdfFont(info: PdfFontInfo) {
	pdfFonts.set(info.loadedName, info);
}

export function getPdfFont(name: string | undefined): PdfFontInfo | undefined {
	return name ? pdfFonts.get(name) : undefined;
}

export function clearPdfFonts() {
	pdfFonts.clear();
	glyphCache.clear();
	metricsCache.clear();
}

let measureCtx: CanvasRenderingContext2D | null = null;
function ctx2d(): CanvasRenderingContext2D | null {
	if (typeof document === "undefined") return null;
	if (!measureCtx)
		measureCtx = document.createElement("canvas").getContext("2d");
	return measureCtx;
}

function fontFaceLoaded(name: string): boolean {
	if (typeof document === "undefined" || !document.fonts) return false;
	for (const face of document.fonts) {
		if (face.family.replace(/^"|"$/g, "") === name && face.status === "loaded")
			return true;
	}
	return false;
}

const glyphCache = new Map<string, boolean>();

/**
 * A fonte embutida desenha `ch`? Mede com dois fallbacks diferentes: se a
 * largura não muda, o glifo veio da própria fonte.
 */
export function pdfFontHasGlyph(name: string, ch: string): boolean {
	const key = `${name}\u0000${ch}`;
	const cached = glyphCache.get(key);
	if (cached !== undefined) return cached;
	const c = ctx2d();
	if (!c || !fontFaceLoaded(name)) return false;
	c.font = `40px "${name}", monospace`;
	const a = c.measureText(ch).width;
	c.font = `40px "${name}", serif`;
	const b = c.measureText(ch).width;
	const ok = a === b && a > 0;
	glyphCache.set(key, ok);
	return ok;
}

/**
 * A fonte embutida cobre o texto todo? Espaço sem glifo é aceito (vira ajuste
 * de posição no TJ, como fazem PDFs gerados pelo LaTeX).
 */
export function pdfFontSupports(name: string, text: string): boolean {
	const info = pdfFonts.get(name);
	if (!info) return false;
	for (const ch of new Set(text)) {
		if (ch === "\n" || ch === " ") continue;
		if (info.codes.get(ch) === undefined || !pdfFontHasGlyph(name, ch))
			return false;
	}
	return true;
}

type FontLike = Pick<
	TextObject,
	"content" | "fontFamily" | "bold" | "italic" | "pdfFont"
>;

/** Fonte embutida que será usada (na tela e no PDF), ou `null` = fonte padrão. */
export function embeddedFont(t: FontLike): string | null {
	return t.pdfFont && pdfFontSupports(t.pdfFont, t.content) ? t.pdfFont : null;
}

/** Fonte CSS efetiva do texto — a mesma decisão vale para a exportação. */
export function textFont(t: FontLike): {
	family: string;
	weight: number;
	style: "normal" | "italic";
	embedded: string | null;
} {
	const embedded = embeddedFont(t);
	if (embedded) {
		// A fonte embutida já tem o peso/estilo dela: não sintetizar negrito/itálico.
		return {
			family: `"${embedded}", ${cssFont(t.fontFamily)}`,
			weight: 400,
			style: "normal",
			embedded,
		};
	}
	return {
		family: cssFont(t.fontFamily),
		weight: t.bold ? 700 : 400,
		style: t.italic ? "italic" : "normal",
		embedded: null,
	};
}

const metricsCache = new Map<string, { ascent: number; descent: number }>();

/** Ascent/descent (em) da fonte que o navegador realmente usa. */
function fontMetrics(t: FontLike): { ascent: number; descent: number } {
	const f = textFont(t);
	const key = `${f.style} ${f.weight} ${f.family}`;
	const cached = metricsCache.get(key);
	if (cached) return cached;
	const fallback = METRICS[t.fontFamily];
	const c = ctx2d();
	if (!c) return fallback;
	c.font = `${f.style} ${f.weight} 100px ${f.family}`;
	const m = c.measureText("Hg");
	if (!m.fontBoundingBoxAscent) return fallback;
	const out = {
		ascent: m.fontBoundingBoxAscent / 100,
		descent: m.fontBoundingBoxDescent / 100,
	};
	if (!f.embedded || fontFaceLoaded(f.embedded)) metricsCache.set(key, out);
	return out;
}

export function lineHeightOf(t: Pick<TextObject, "lineHeight">): number {
	return t.lineHeight ?? LINE_HEIGHT;
}

/**
 * Distância (em em) do topo da caixa até a baseline da primeira linha. No CSS
 * o conteúdo da linha fica centralizado na line-box (half-leading).
 */
export function baselineRatio(
	t: FontLike & Pick<TextObject, "lineHeight">,
): number {
	const { ascent, descent } = fontMetrics(t);
	return (lineHeightOf(t) - (ascent + descent)) / 2 + ascent;
}

/** Largura de cada linha (pt) com a fonte usada na tela. */
export function measureLines(
	t: Pick<
		TextObject,
		"content" | "fontFamily" | "fontSize" | "bold" | "italic" | "pdfFont"
	>,
): number[] {
	const lines = t.content.split("\n");
	const c = ctx2d();
	if (!c) return lines.map((l) => l.length * t.fontSize * 0.55);
	const f = textFont(t);
	c.font = `${f.style} ${f.weight} ${t.fontSize}px ${f.family}`;
	// Igual ao PDF (e ao CSS do editor): sem kerning automático.
	if ("fontKerning" in c) c.fontKerning = "none";
	return lines.map((l) => c.measureText(l).width);
}

/** Mede o texto com a mesma fonte usada na tela (em pontos, zoom 100%). */
export function measureText(
	t: Pick<
		TextObject,
		| "content"
		| "fontFamily"
		| "fontSize"
		| "bold"
		| "italic"
		| "pdfFont"
		| "lineHeight"
	>,
): { w: number; h: number } {
	const widths = measureLines(t);
	const h = Math.max(1, widths.length) * t.fontSize * lineHeightOf(t);
	const w = Math.max(0, ...widths);
	return { w: Math.max(t.fontSize * 0.5, Math.ceil(w + 1)), h };
}

/** Largura do espaço (em) na fonte padrão usada como fallback. */
export function fallbackSpaceEm(family: FontFamily): number {
	const c = ctx2d();
	if (!c) return family === "Courier" ? 0.6 : 0.25;
	c.font = `100px ${cssFont(family)}`;
	return c.measureText(" ").width / 100;
}

/**
 * Recalcula w/h do texto mantendo fixo o canto superior esquerdo LOCAL
 * (onde a leitura começa), inclusive quando o texto está girado. Com
 * alinhamento à direita/centro, fixa a borda/centro correspondente.
 */
export function withTextSize(t: TextObject): TextObject {
	const { w, h } = measureText(t);
	const anchor = t.align === "right" ? 1 : t.align === "center" ? 0.5 : 0;
	const lx = (t.w - w) * anchor;
	if (t.rotation === 0) return { ...t, w, h, x: t.x + lx };
	const [ox, oy] = rotateVec(-t.w / 2 + lx, -t.h / 2, t.rotation);
	const px = t.x + t.w / 2 + ox;
	const py = t.y + t.h / 2 + oy;
	const [nx, ny] = rotateVec(w / 2, h / 2, t.rotation);
	return { ...t, w, h, x: px + nx - w / 2, y: py + ny - h / 2 };
}

/** Mapeia o nome de uma fonte embutida no PDF para a fonte padrão mais próxima. */
export function matchStandardFont(
	name: string,
	fallback = "",
): { family: FontFamily; bold: boolean; italic: boolean } {
	const n = name.replace(/^[A-Z]{6}\+/, "");
	const lower = `${n} ${fallback}`.toLowerCase();
	let family: FontFamily = "Helvetica";
	if (/courier|mono|consol|menlo|typewriter/.test(lower)) family = "Courier";
	else if (/sans|arial|helvet|verdana|calibri|segoe|roboto|inter/.test(lower))
		family = "Helvetica";
	else if (
		/times|serif|roman|georgia|garamond|cambria|book|minion|palat/.test(lower)
	)
		family = "Times";
	return {
		family,
		bold: /bold|black|heavy|semibold|demi|,b\b/i.test(n),
		italic: /italic|oblique|,i\b/i.test(n),
	};
}

export const SIGNATURE_FONTS = [
	{
		label: "Cursiva",
		css: "'Brush Script MT', 'Segoe Script', 'Snell Roundhand', cursive",
	},
	{
		label: "Caligráfica",
		css: "'Snell Roundhand', 'Lucida Handwriting', 'Apple Chancery', cursive",
	},
	{
		label: "Manuscrita",
		css: "'Bradley Hand', 'Segoe Print', 'Comic Sans MS', cursive",
	},
];

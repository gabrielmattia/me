import { rotateVec } from "./geometry";
import type {
	ExtraFamily,
	FontFamily,
	PdfTextStyle,
	StandardFamily,
	TextObject,
} from "./types";

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
	{ value: "Roboto", label: "Roboto", css: "'PdfEd Roboto', sans-serif" },
	{
		value: "OpenSans",
		label: "Open Sans",
		css: "'PdfEd Open Sans', sans-serif",
	},
	{
		value: "Montserrat",
		label: "Montserrat",
		css: "'PdfEd Montserrat', sans-serif",
	},
	{ value: "Lora", label: "Lora", css: "'PdfEd Lora', serif" },
];

// ─── Fontes extras (TTF subset latin, embutidas na exportação) ───────────────

const EXTRA: Record<ExtraFamily, { face: string; file: string }> = {
	Roboto: { face: "PdfEd Roboto", file: "roboto" },
	OpenSans: { face: "PdfEd Open Sans", file: "open-sans" },
	Montserrat: { face: "PdfEd Montserrat", file: "montserrat" },
	Lora: { face: "PdfEd Lora", file: "lora" },
};

// Só as URLs entram no bundle; os arquivos são baixados quando a fonte é usada.
const FONT_URLS = import.meta.glob<string>("./font-files/*.ttf", {
	eager: true,
	query: "?url",
	import: "default",
});

export function isExtraFamily(f: FontFamily): f is ExtraFamily {
	return f in EXTRA;
}

function extraUrl(f: ExtraFamily, bold: boolean, italic: boolean): string {
	const name = `./font-files/${EXTRA[f].file}-${bold ? 700 : 400}-${italic ? "italic" : "normal"}.ttf`;
	const url = FONT_URLS[name];
	if (!url) throw new Error(`Fonte ausente: ${name}`);
	return url;
}

const bytesCache = new Map<string, Promise<ArrayBuffer>>();

/** Bytes do TTF da variante (mesmo arquivo usado na tela). */
export function extraFontBytes(
	f: ExtraFamily,
	bold: boolean,
	italic: boolean,
): Promise<ArrayBuffer> {
	const url = extraUrl(f, bold, italic);
	let p = bytesCache.get(url);
	if (!p) {
		p = fetch(url).then((r) => {
			if (!r.ok) throw new Error(`Falha ao baixar a fonte (${r.status}).`);
			return r.arrayBuffer();
		});
		bytesCache.set(url, p);
		p.catch(() => bytesCache.delete(url));
	}
	return p;
}

const faceCache = new Map<string, Promise<void>>();

/**
 * Garante que a variante da fonte extra está carregada no navegador antes de
 * medir/desenhar (senão a medida usaria a fonte de fallback).
 */
export function ensureFont(
	t: Pick<TextObject, "fontFamily" | "bold" | "italic">,
): Promise<void> {
	const f = t.fontFamily;
	if (!isExtraFamily(f) || typeof document === "undefined")
		return Promise.resolve();
	const key = `${f}:${t.bold}:${t.italic}`;
	let p = faceCache.get(key);
	if (!p) {
		p = extraFontBytes(f, t.bold, t.italic).then(async (bytes) => {
			const face = new FontFace(EXTRA[f].face, bytes, {
				weight: t.bold ? "700" : "400",
				style: t.italic ? "italic" : "normal",
			});
			await face.load();
			document.fonts.add(face);
			faceLoadedKeys.add(key);
			metricsCache.clear();
		});
		faceCache.set(key, p);
		p.catch(() => faceCache.delete(key));
	}
	return p;
}

function extraLoaded(t: Pick<TextObject, "fontFamily" | "bold" | "italic">) {
	return !isExtraFamily(t.fontFamily) || faceLoadedKeys.has(fontKey(t));
}
const faceLoadedKeys = new Set<string>();
const fontKey = (t: Pick<TextObject, "fontFamily" | "bold" | "italic">) =>
	`${t.fontFamily}:${t.bold}:${t.italic}`;

/**
 * Métricas (ascent/descent em em) aproximadas das fontes de sistema de cada
 * família padrão — usadas só quando o navegador não informa as métricas reais.
 */
const METRICS: Record<FontFamily, { ascent: number; descent: number }> = {
	Helvetica: { ascent: 0.905, descent: 0.212 },
	Times: { ascent: 0.891, descent: 0.216 },
	Courier: { ascent: 0.833, descent: 0.3 },
	Roboto: { ascent: 0.928, descent: 0.244 },
	OpenSans: { ascent: 1.069, descent: 0.293 },
	Montserrat: { ascent: 0.968, descent: 0.251 },
	Lora: { ascent: 1.006, descent: 0.274 },
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
	family: StandardFamily;
	bold: boolean;
	italic: boolean;
	/** BaseFont (com o prefixo de subset), para achar o recurso /Font. */
	baseFont: string;
	/** Primeira página onde a fonte foi vista. */
	docId: string;
	pageIndex: number;
}

const pdfFonts = new Map<string, PdfFontInfo>();

export function registerPdfFont(info: PdfFontInfo) {
	pdfFonts.set(info.loadedName, info);
}

export function getPdfFont(name: string | undefined): PdfFontInfo | undefined {
	return name ? pdfFonts.get(name) : undefined;
}

/** Fontes embutidas registradas (ordem de descoberta). */
export function listPdfFonts(): PdfFontInfo[] {
	return [...pdfFonts.values()];
}

/** Nome legível da fonte embutida (sem o prefixo de subset). */
export function pdfFontLabel(info: PdfFontInfo): string {
	return info.baseFont.replace(/^[A-Z]{6}\+/, "") || info.loadedName;
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
> &
	Partial<Pick<TextObject, "pdfStyle">>;

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
export function fontMetrics(t: FontLike): { ascent: number; descent: number } {
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
	if (f.embedded ? fontFaceLoaded(f.embedded) : extraLoaded(t))
		metricsCache.set(key, out);
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

type MeasureLike = Pick<
	TextObject,
	"content" | "fontFamily" | "fontSize" | "bold" | "italic" | "pdfFont"
> &
	Partial<Pick<TextObject, "wrapWidth" | "pdfStyle">>;

// ─── Layout por glifo (fonte embutida) ───────────────────────────────────────
// Com a fonte embutida, a posição de cada caractere segue o modelo do PDF:
// largura do /Widths + Tc (+ Tw no espaço) − ajuste do TJ, vezes a escala
// horizontal. A tela posiciona cada glifo nessas coordenadas e a exportação
// escreve exatamente esses números, então as duas batem.

/** Código do espaço na fonte embutida (`undefined` = sem glifo: vira ajuste no TJ). */
export function pdfSpaceCode(info: PdfFontInfo): number | undefined {
	return pdfFontHasGlyph(info.loadedName, " ")
		? info.codes.get(" ")
		: undefined;
}

/** Ajuste do TJ (milésimos de em) para o caractere `i` de `content`. */
export function kernAt(
	style: PdfTextStyle | undefined,
	chars: string[],
	i: number,
): number {
	if (!style) return 0;
	const k = style.kerning;
	if (k && k.length === chars.length) return k[i] ?? 0;
	return style.kernByChar?.[chars[i]] ?? 0;
}

/** Avanço (pt) de um caractere com a fonte embutida, já com o ajuste `kern`. */
export function pdfAdvance(
	info: PdfFontInfo,
	t: Pick<TextObject, "fontSize" | "fontFamily"> & { pdfStyle?: PdfTextStyle },
	ch: string,
	kern: number,
	space: number | undefined,
): number {
	const st = t.pdfStyle;
	const h = (st?.hScale ?? 100) / 100;
	const fs = t.fontSize;
	const code = ch === " " ? space : info.codes.get(ch);
	if (code === undefined)
		return (fallbackSpaceEm(t.fontFamily) * fs - (kern / 1000) * fs) * h;
	const w = (info.widths[code] ?? info.defaultWidth) / 1000;
	let adv = w * fs + (st?.charSpacing ?? 0);
	if (!info.composite && code === 32) adv += st?.wordSpacing ?? 0;
	return (adv - (kern / 1000) * fs) * h;
}

export interface LineLayout {
	text: string;
	/** Posição de cada caractere a partir do início da linha (pt); só com fonte embutida. */
	xs: number[] | null;
	/** Ajuste do TJ de cada caractere (para a exportação). */
	kerns: number[];
	width: number;
}

/**
 * Linhas visuais com a largura de cada uma e, com a fonte embutida, a posição
 * de cada glifo. A tela e o PDF usam este mesmo layout.
 */
export function layoutLines(t: MeasureLike): LineLayout[] {
	const lines = textLines(t);
	const name = embeddedFont(t);
	const info = name ? pdfFonts.get(name) : undefined;
	if (!info) {
		const width = measurer(t);
		return lines.map((text) => ({
			text,
			xs: null,
			kerns: [],
			width: width(text),
		}));
	}
	const space = pdfSpaceCode(info);
	const chars = Array.from(t.content);
	// Índice de cada linha em `content` (só sem quebra automática).
	let start = t.wrapWidth ? -1 : 0;
	return lines.map((text) => {
		const lc = Array.from(text);
		const xs: number[] = [];
		const kerns: number[] = [];
		let x = 0;
		lc.forEach((ch, i) => {
			const kern =
				start >= 0
					? kernAt(t.pdfStyle, chars, start + i)
					: (t.pdfStyle?.kernByChar?.[ch] ?? 0);
			xs.push(x);
			kerns.push(kern);
			// O ajuste depois do último caractere não conta na largura.
			x += pdfAdvance(info, t, ch, i === lc.length - 1 ? 0 : kern, space);
		});
		if (start >= 0) start += lc.length + 1;
		return { text, xs, kerns, width: x };
	});
}

function measurer(t: MeasureLike): (s: string) => number {
	const name = embeddedFont(t);
	const info = name ? pdfFonts.get(name) : undefined;
	if (info) {
		const space = pdfSpaceCode(info);
		return (l) => {
			let w = 0;
			const lc = Array.from(l);
			lc.forEach((ch, i) => {
				const kern =
					i === lc.length - 1 ? 0 : (t.pdfStyle?.kernByChar?.[ch] ?? 0);
				w += pdfAdvance(info, t, ch, kern, space);
			});
			return w;
		};
	}
	const c = ctx2d();
	if (!c) return (l) => l.length * t.fontSize * 0.55;
	const f = textFont(t);
	const font = `${f.style} ${f.weight} ${t.fontSize}px ${f.family}`;
	return (l) => {
		c.font = font;
		// Igual ao PDF (e ao CSS do editor): sem kerning automático.
		if ("fontKerning" in c) c.fontKerning = "none";
		return c.measureText(l).width;
	};
}

/**
 * Linhas visuais do texto: as quebras digitadas e, com `wrapWidth`, quebra
 * automática por palavra (palavra maior que a caixa quebra por caractere). A
 * tela e a exportação usam exatamente estas linhas.
 */
export function textLines(t: MeasureLike): string[] {
	const hard = t.content.split("\n");
	if (!t.wrapWidth) return hard;
	const max = t.wrapWidth;
	const width = measurer(t);
	const out: string[] = [];
	for (const para of hard) {
		const words = para.split(/(\s+)/);
		let line = "";
		for (const token of words) {
			if (!token) continue;
			const candidate = line + token;
			if (width(candidate) <= max || !line.trim()) {
				line = candidate;
			} else if (/^\s+$/.test(token)) {
				// Espaço no fim da linha "pendura" (como no CSS) e some na quebra.
				out.push(line);
				line = "";
				continue;
			} else {
				out.push(line.trimEnd());
				line = token;
			}
			// Palavra sozinha maior que a caixa: quebra por caractere.
			while (width(line) > max && line.length > 1) {
				let cut = line.length - 1;
				while (cut > 1 && width(line.slice(0, cut)) > max) cut--;
				out.push(line.slice(0, cut));
				line = line.slice(cut);
			}
		}
		out.push(line.trimEnd());
	}
	return out;
}

/** Largura de cada linha visual (pt) com a fonte usada na tela. */
export function measureLines(t: MeasureLike): number[] {
	return layoutLines(t).map((l) => l.width);
}

/**
 * Troca o conteúdo mantendo os ajustes por caractere do original: o trecho
 * igual no início e no fim preserva os seus; o digitado usa o típico de cada
 * caractere.
 */
export function withContent(t: TextObject, content: string): TextObject {
	const st = t.pdfStyle;
	// Mesmo texto da linha do PDF do auto-estilo: ajustes do original.
	const ak = t.autoKerning;
	if (st && ak && content === ak.text)
		return { ...t, content, pdfStyle: { ...st, kerning: ak.kerning } };
	if (!st?.kerning) return { ...t, content };
	const prev = Array.from(t.content);
	const next = Array.from(content);
	if (st.kerning.length !== prev.length)
		return { ...t, content, pdfStyle: { ...st, kerning: undefined } };
	let a = 0;
	while (a < prev.length && a < next.length && prev[a] === next[a]) a++;
	let b = 0;
	while (
		b < prev.length - a &&
		b < next.length - a &&
		prev[prev.length - 1 - b] === next[next.length - 1 - b]
	)
		b++;
	const kerning = [
		...st.kerning.slice(0, a),
		...next.slice(a, next.length - b).map((ch) => st.kernByChar?.[ch] ?? 0),
		...st.kerning.slice(prev.length - b),
	];
	return { ...t, content, pdfStyle: { ...st, kerning } };
}

/** Tamanho de fonte sem ruído de ponto flutuante (mantém 3 casas: 6.84, 10.125). */
export const roundSize = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Estilo de um texto para o conta-gotas: fonte (inclusive a embutida do PDF),
 * tamanho exato, cor, espaçamento e escala. Os ajustes por posição ficam de
 * fora (o conteúdo é outro); os típicos de cada caractere seguem.
 */
export function styleOf(t: TextObject): Partial<TextObject> {
	return {
		fontFamily: t.fontFamily,
		bold: t.bold,
		italic: t.italic,
		fontSize: t.fontSize,
		color: t.color,
		pdfFont: t.pdfFont,
		pdfStyle: t.pdfStyle && { ...t.pdfStyle, kerning: undefined },
	};
}

/** Mede o texto com a mesma fonte usada na tela (em pontos, zoom 100%). */
export function measureText(t: MeasureLike & Pick<TextObject, "lineHeight">): {
	w: number;
	h: number;
} {
	const widths = measureLines(t);
	const h = Math.max(1, widths.length) * t.fontSize * lineHeightOf(t);
	if (t.wrapWidth) return { w: t.wrapWidth, h };
	const w = Math.max(0, ...widths);
	return { w: Math.max(t.fontSize * 0.5, Math.ceil(w + 1)), h };
}

/** Deslocamento x de cada linha conforme o alinhamento (tela e PDF). */
export function lineOffsets(
	t: MeasureLike & Pick<TextObject, "w" | "align">,
): number[] {
	return measureLines(t).map((w) =>
		t.align === "right" ? t.w - w : t.align === "center" ? (t.w - w) / 2 : 0,
	);
}

/**
 * Sublinhado de cada linha, no espaço local da caixa (y para baixo). A tela
 * desenha estes retângulos (não `text-decoration`) para bater com o PDF.
 */
export function underlineRects(
	t: MeasureLike & Pick<TextObject, "w" | "align" | "lineHeight">,
): Array<{ x: number; y: number; w: number; h: number }> {
	const widths = measureLines(t);
	const offsets = lineOffsets(t);
	const lh = lineHeightOf(t) * t.fontSize;
	const base = baselineRatio(t) * t.fontSize;
	const h = Math.max(0.5, t.fontSize * 0.065);
	return widths.flatMap((w, i) =>
		w > 0
			? [{ x: offsets[i] ?? 0, y: base + i * lh + t.fontSize * 0.1, w, h }]
			: [],
	);
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
): { family: StandardFamily; bold: boolean; italic: boolean } {
	const n = name.replace(/^[A-Z]{6}\+/, "");
	const lower = `${n} ${fallback}`.toLowerCase();
	let family: StandardFamily = "Helvetica";
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

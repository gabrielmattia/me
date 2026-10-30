/**
 * Encaixe (snapping) ao mover/redimensionar/criar objetos: baseline e início/
 * fim de cada linha de texto do PDF e dos textos do editor, bordas e centro
 * dos outros objetos. Tudo no espaço base da página; o limiar vem em pontos
 * (pixels de tela / zoom). O encaixe posiciona o objeto com a mesma conta
 * usada no Duplicar (`y = baseline − baselineRatio × tamanho`), então a
 * baseline fica exatamente na do original, sem arredondar.
 */
import {
	baselineRatio,
	layoutLines,
	lineHeightOf,
	lineOffsets,
	styleOf,
	withContent,
	withTextSize,
} from "./fonts";
import { getBounds, type Handle, isBox } from "./geometry";
import type { BoxObject, EditorObject, TextBlock, TextObject } from "./types";

/** Distância máxima (px de tela) para encaixar. */
export const SNAP_PX = 5;

/** Linha `line` de um bloco de texto do PDF. */
export interface PdfLineRef {
	block: TextBlock;
	line: number;
}

/** start = borda esquerda / início da linha; end = borda direita / fim. */
type XKind = "start" | "end" | "center";
type YKind = "baseline" | "edge" | "center";

interface XTarget {
	v: number;
	kind: XKind;
	y0: number;
	y1: number;
	pdf?: PdfLineRef;
}

interface YTarget {
	v: number;
	kind: YKind;
	x0: number;
	x1: number;
	pdf?: PdfLineRef;
}

export interface SnapTargets {
	xs: XTarget[];
	ys: YTarget[];
}

/** Guia desenhada enquanto encaixa (espaço base). */
export interface Guide {
	axis: "x" | "y";
	v: number;
	from: number;
	to: number;
	/** Encaixe numa linha de texto do PDF (cor própria). */
	pdf: boolean;
}

export interface SnapResult<T extends EditorObject = EditorObject> {
	obj: T;
	guides: Guide[];
	/** Baseline encaixada numa linha do PDF (`movingLine` = linha do objeto). */
	pdfY?: PdfLineRef & { movingLine: number };
	/** x encaixado no início/fim de uma linha do PDF. */
	pdfX?: PdfLineRef & { kind: "start" | "end" };
}

interface MovingRef<K> {
	off: number;
	kind: K;
	line?: number;
}

/** Início e fim do texto (pt, relativos a `x`): as linhas, não a caixa com folga. */
export function textSpan(t: TextObject): [number, number] {
	const lines = layoutLines(t);
	const offs = lineOffsets(t);
	let a = Number.POSITIVE_INFINITY;
	let b = Number.NEGATIVE_INFINITY;
	lines.forEach((l, i) => {
		const o = offs[i] ?? 0;
		a = Math.min(a, o);
		b = Math.max(b, o + l.width);
	});
	return Number.isFinite(a) ? [a, b] : [0, t.w];
}

/** Distância do topo da caixa até a baseline da linha `i`. */
export function baselineOffset(t: TextObject, i = 0): number {
	return baselineRatio(t) * t.fontSize + i * lineHeightOf(t) * t.fontSize;
}

const flatText = (o: EditorObject): o is TextObject =>
	o.type === "text" && o.rotation === 0;

function movingRefs(obj: BoxObject) {
	const b = getBounds(obj);
	const dx = b.x - obj.x;
	const dy = b.y - obj.y;
	const xs: MovingRef<XKind>[] = [
		{ off: dx, kind: "start" },
		{ off: dx + b.w / 2, kind: "center" },
		{ off: dx + b.w, kind: "end" },
	];
	const ys: MovingRef<YKind>[] = [
		{ off: dy, kind: "edge" },
		{ off: dy + b.h / 2, kind: "center" },
		{ off: dy + b.h, kind: "edge" },
	];
	if (flatText(obj)) {
		// Texto: início/fim são os da linha (sem a folga da caixa).
		const [a, z] = textSpan(obj);
		xs[0] = { off: a, kind: "start" };
		xs[2] = { off: z, kind: "end" };
		layoutLines(obj).forEach((_, i) => {
			ys.push({ off: baselineOffset(obj, i), kind: "baseline", line: i });
		});
	}
	return { xs, ys, bounds: b };
}

/** Alvos da página: linhas do PDF (`blocks`) e os outros objetos. */
export function buildTargets(
	blocks: TextBlock[],
	objects: EditorObject[],
): SnapTargets {
	const xs: XTarget[] = [];
	const ys: YTarget[] = [];
	for (const block of blocks) {
		block.lines.forEach((l, line) => {
			const pdf = { block, line };
			xs.push({ v: l.x, kind: "start", y0: l.y, y1: l.y + l.h, pdf });
			xs.push({ v: l.x + l.w, kind: "end", y0: l.y, y1: l.y + l.h, pdf });
			ys.push({ v: l.baseline, kind: "baseline", x0: l.x, x1: l.x + l.w, pdf });
		});
	}
	for (const o of objects) {
		if (!isBox(o)) continue;
		const b = getBounds(o);
		const y1 = b.y + b.h;
		const x1 = b.x + b.w;
		if (flatText(o)) {
			const [a, z] = textSpan(o);
			xs.push({ v: o.x + a, kind: "start", y0: b.y, y1 });
			xs.push({ v: o.x + z, kind: "end", y0: b.y, y1 });
			layoutLines(o).forEach((_, i) => {
				ys.push({
					v: o.y + baselineOffset(o, i),
					kind: "baseline",
					x0: o.x + a,
					x1: o.x + z,
				});
			});
		} else {
			xs.push({ v: b.x, kind: "start", y0: b.y, y1 });
			xs.push({ v: x1, kind: "end", y0: b.y, y1 });
		}
		xs.push({ v: b.x + b.w / 2, kind: "center", y0: b.y, y1 });
		ys.push({ v: b.y, kind: "edge", x0: b.x, x1 });
		ys.push({ v: y1, kind: "edge", x0: b.x, x1 });
		ys.push({ v: b.y + b.h / 2, kind: "center", x0: b.x, x1 });
	}
	return { xs, ys };
}

// Centro só com centro; início/fim entre si; baseline só com baseline.
const xCompat = (a: XKind, b: XKind) => (a === "center") === (b === "center");
const yCompat = (a: YKind, b: YKind) => a === b;

function best<K, T extends { v: number; kind: K; pdf?: PdfLineRef }>(
	pos: number,
	refs: MovingRef<K>[],
	targets: T[],
	compat: (a: K, b: K) => boolean,
	tol: number,
	prefer?: PdfLineRef,
): { ref: MovingRef<K>; target: T } | null {
	let found: { ref: MovingRef<K>; target: T; d: number } | null = null;
	for (const ref of refs) {
		for (const target of targets) {
			if (!compat(ref.kind, target.kind)) continue;
			const d = Math.abs(target.v - (pos + ref.off));
			if (d > tol) continue;
			// Empate: linha do PDF primeiro (é o caso de sobrepor um texto).
			// A linha cuja baseline já encaixou vence as outras no eixo x.
			const same =
				prefer &&
				target.pdf?.block.key === prefer.block.key &&
				target.pdf.line === prefer.line;
			const score = d - (target.pdf ? 1e-3 : 0) - (same ? tol : 0);
			if (!found || score < found.d) found = { ref, target, d: score };
		}
	}
	return found;
}

/**
 * Encaixa a posição de um objeto de caixa. Objetos girados só encaixam pelas
 * bordas/centro; linhas (segmentos) não encaixam.
 */
export function snapBox<T extends EditorObject>(
	obj: T,
	targets: SnapTargets,
	tol: number,
): SnapResult<T> {
	if (!isBox(obj)) return { obj, guides: [] };
	const { xs, ys, bounds } = movingRefs(obj);
	const by = best(obj.y, ys, targets.ys, yCompat, tol);
	const bx = best(obj.x, xs, targets.xs, xCompat, tol, by?.target.pdf);
	let x = obj.x;
	let y = obj.y;
	if (bx) x = bx.target.v - bx.ref.off;
	if (by) y = by.target.v - by.ref.off;
	const moved = { ...obj, x, y } as T;
	const guides: Guide[] = [];
	const top = bounds.y + (y - obj.y);
	const left = bounds.x + (x - obj.x);
	if (bx)
		guides.push({
			axis: "x",
			v: bx.target.v,
			from: Math.min(bx.target.y0, top),
			to: Math.max(bx.target.y1, top + bounds.h),
			pdf: Boolean(bx.target.pdf),
		});
	if (by)
		guides.push({
			axis: "y",
			v: by.target.v,
			from: Math.min(by.target.x0, left),
			to: Math.max(by.target.x1, left + bounds.w),
			pdf: Boolean(by.target.pdf),
		});
	const result: SnapResult<T> = { obj: moved, guides };
	if (by?.target.pdf && by.ref.kind === "baseline")
		result.pdfY = { ...by.target.pdf, movingLine: by.ref.line ?? 0 };
	if (bx?.target.pdf && bx.target.kind !== "center")
		result.pdfX = { ...bx.target.pdf, kind: bx.target.kind };
	return result;
}

/**
 * Redimensionar: encaixa a borda que a alça move (x nas bordas/linhas; y nas
 * bordas, exceto texto, cujo tamanho segue a largura). Devolve o
 * deslocamento corrigido e as guias.
 */
export function snapResize(
	obj: EditorObject,
	handle: Handle | "p1" | "p2",
	dx: number,
	dy: number,
	targets: SnapTargets,
	tol: number,
): { dx: number; dy: number; guides: Guide[] } {
	if (!isBox(obj) || obj.rotation !== 0 || handle === "p1" || handle === "p2")
		return { dx, dy, guides: [] };
	const guides: Guide[] = [];
	const hx = handle.includes("e") ? 1 : handle.includes("w") ? -1 : 0;
	const hy = handle.includes("s") ? 1 : handle.includes("n") ? -1 : 0;
	if (hx !== 0) {
		const edge = hx > 0 ? obj.x + obj.w + dx : obj.x + dx;
		const hit = best(
			edge,
			[{ off: 0, kind: hx > 0 ? "end" : "start" } as MovingRef<XKind>],
			targets.xs,
			xCompat,
			tol,
		);
		if (hit) {
			dx += hit.target.v - edge;
			guides.push({
				axis: "x",
				v: hit.target.v,
				from: Math.min(hit.target.y0, obj.y),
				to: Math.max(hit.target.y1, obj.y + obj.h),
				pdf: Boolean(hit.target.pdf),
			});
		}
	}
	if (hy !== 0 && obj.type !== "text") {
		const edge = hy > 0 ? obj.y + obj.h + dy : obj.y + dy;
		const hit = best(
			edge,
			[{ off: 0, kind: "edge" } as MovingRef<YKind>],
			targets.ys,
			yCompat,
			tol,
		);
		if (hit) {
			dy += hit.target.v - edge;
			guides.push({
				axis: "y",
				v: hit.target.v,
				from: Math.min(hit.target.x0, obj.x),
				to: Math.max(hit.target.x1, obj.x + obj.w),
				pdf: Boolean(hit.target.pdf),
			});
		}
	}
	return { dx, dy, guides };
}

/** Linha do PDF sob o ponto (com folga horizontal de `tol`). */
export function pdfLineAt(
	blocks: TextBlock[],
	x: number,
	y: number,
	tol: number,
): PdfLineRef | null {
	for (const block of blocks) {
		const line = block.lines.findIndex(
			(l) =>
				x >= l.x - tol && x <= l.x + l.w + tol && y >= l.y && y <= l.y + l.h,
		);
		if (line >= 0) return { block, line };
	}
	return null;
}

/**
 * Ajustes por posição (TJ) da linha `line` dentro do estilo exato do bloco
 * (`kerning` cobre o bloco inteiro, linhas unidas por "\n").
 */
export function lineKerning(
	kerning: number[] | undefined,
	ref: PdfLineRef,
): number[] | undefined {
	const { block, line } = ref;
	if (!kerning) return undefined;
	const strs = block.lines.map((l) => l.str);
	if (strs.join("\n") !== block.str) return undefined;
	if (kerning.length !== Array.from(block.str).length) return undefined;
	let start = 0;
	for (let i = 0; i < line; i++) start += Array.from(strs[i] ?? "").length + 1;
	return kerning.slice(start, start + Array.from(strs[line] ?? "").length);
}

/** Texto que ainda aceita o estilo da linha do PDF onde é encaixado. */
export const acceptsAutoStyle = (t: TextObject) =>
	t.rotation === 0 && !t.source && t.styleOrigin !== "manual";

/**
 * Texto `t` com o estilo da linha do PDF `ref` (o mesmo do conta-gotas:
 * `exact` é o texto exato do bloco) e, se o conteúdo for igual ao da linha,
 * os ajustes por posição do original. A baseline fica na da linha; com
 * `anchor`, o início/fim também.
 */
export function styleForLine(
	t: TextObject,
	exact: TextObject,
	ref: PdfLineRef & { movingLine: number },
	anchor: "start" | "end" | null,
): TextObject {
	const l = ref.block.lines[ref.line];
	const kerning = lineKerning(exact.pdfStyle?.kerning, ref);
	let n: TextObject = {
		...t,
		...styleOf(exact),
		styleOrigin: "auto",
		autoKerning:
			kerning && exact.pdfStyle ? { text: l.str, kerning } : undefined,
	};
	n = withTextSize(withContent(n, t.content));
	const [a, z] = textSpan(n);
	return {
		...n,
		x: anchor === "start" ? l.x - a : anchor === "end" ? l.x + l.w - z : n.x,
		y: l.baseline - baselineOffset(n, ref.movingLine),
	};
}

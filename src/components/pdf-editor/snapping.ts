/**
 * Encaixe (snapping) ao mover/redimensionar/criar objetos: baseline e início/
 * fim de cada linha de texto do PDF e dos textos do editor, bordas e centro
 * dos outros objetos. Tudo no espaço base da página; o limiar vem em pontos
 * (pixels de tela / zoom). O encaixe posiciona o objeto com a mesma conta
 * usada no Duplicar (`y = baseline − baselineRatio × tamanho`), então a
 * baseline fica exatamente na do original, sem arredondar.
 *
 * Texto solto por cima de uma linha do PDF (sobreposição vertical de pelo
 * menos `OVERLAP_MIN` e horizontal) encaixa nela mesmo fora do limiar: é o
 * caso de "colocar o texto em cima da linha original".
 */
import {
	baselineRatio,
	fontMetrics,
	layoutLines,
	lineHeightOf,
	lineOffsets,
	styleOf,
	withContent,
	withTextSize,
} from "./fonts";
import { getBounds, type Handle, isBox } from "./geometry";
import type {
	BoxObject,
	EditorObject,
	ReplacedLine,
	TextBlock,
	TextLine,
	TextObject,
} from "./types";

/** Distância máxima (px de tela) para encaixar. */
export const SNAP_PX = 5;

/**
 * Sobreposição mínima (fração da altura da menor das duas linhas) para um
 * texto solto em cima de uma linha do PDF encaixar nela.
 */
export const OVERLAP_MIN = 0.3;

/** Linha `line` de um bloco de texto do PDF. */
export interface PdfLineRef {
	block: TextBlock;
	line: number;
}

/** Identificador estável de uma linha do PDF (chave do bloco + índice). */
export const lineId = (ref: PdfLineRef) => `${ref.block.key}#${ref.line}`;

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

/** Caixa da linha do PDF alvo, realçada durante o arraste (espaço base). */
export interface LineBox {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface SnapResult<T extends EditorObject = EditorObject> {
	obj: T;
	guides: Guide[];
	/** Linha do PDF onde o texto vai encaixar (realce). */
	target?: LineBox;
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
	/** Linhas (`lineId`) já substituídas por outro texto: não são alvo. */
	skip: ReadonlySet<string> = new Set(),
): SnapTargets {
	const xs: XTarget[] = [];
	const ys: YTarget[] = [];
	for (const block of blocks) {
		block.lines.forEach((l, line) => {
			const pdf = { block, line };
			if (skip.has(lineId(pdf))) return;
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
	const over = flatText(obj) ? overlapSnap(obj, targets, tol) : null;
	if (over) return over as SnapResult<T>;
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
	if (by?.target.pdf && by.ref.kind === "baseline") {
		result.pdfY = { ...by.target.pdf, movingLine: by.ref.line ?? 0 };
		result.target = lineBox(by.target.pdf);
	}
	if (bx?.target.pdf && bx.target.kind !== "center")
		result.pdfX = { ...bx.target.pdf, kind: bx.target.kind };
	return result;
}

export function lineBox(ref: PdfLineRef): LineBox {
	const l = ref.block.lines[ref.line];
	return { x: l.x, y: l.y, w: l.w, h: l.h };
}

/**
 * Texto solto por cima de uma linha do PDF: a linha com maior sobreposição
 * vertical (≥ `OVERLAP_MIN` da menor altura) que também se sobrepõe na
 * horizontal. A baseline vai para a da linha; o x vai para o início/fim mais
 * próximo se estiver a até 2 × o tamanho da fonte da linha (texto posto no
 * meio de uma linha mantém o x).
 */
function overlapSnap(
	obj: TextObject,
	targets: SnapTargets,
	tol: number,
): SnapResult<TextObject> | null {
	const { ascent, descent } = fontMetrics(obj);
	const [a, z] = textSpan(obj);
	const x0 = obj.x + a;
	const x1 = obj.x + z;
	let found: {
		ref: PdfLineRef;
		movingLine: number;
		ratio: number;
		d: number;
	} | null = null;
	const n = layoutLines(obj).length;
	for (const t of targets.ys) {
		if (!t.pdf || t.kind !== "baseline") continue;
		const l = t.pdf.block.lines[t.pdf.line];
		const hx = Math.min(x1, l.x + l.w) - Math.max(x0, l.x);
		if (hx <= 0 || hx < 0.3 * Math.min(z - a, l.w)) continue;
		for (let i = 0; i < n; i++) {
			const bl = obj.y + baselineOffset(obj, i);
			const top = bl - ascent * obj.fontSize;
			const bottom = bl + descent * obj.fontSize;
			const hy = Math.min(bottom, l.y + l.h) - Math.max(top, l.y);
			const ratio = hy / Math.min(bottom - top, l.h);
			if (ratio < OVERLAP_MIN) continue;
			const d = Math.abs(bl - l.baseline);
			if (
				!found ||
				ratio > found.ratio + 1e-6 ||
				(Math.abs(ratio - found.ratio) <= 1e-6 && d < found.d)
			)
				found = { ref: t.pdf, movingLine: i, ratio, d };
		}
	}
	if (!found) return null;
	const { ref, movingLine } = found;
	const l = ref.block.lines[ref.line];
	const reach = Math.max(tol, 2 * ref.block.fontSize);
	const ds = Math.abs(l.x - x0);
	const de = Math.abs(l.x + l.w - x1);
	const kind: "start" | "end" | null =
		Math.min(ds, de) > reach ? null : ds <= de ? "start" : "end";
	const x = kind === "start" ? l.x - a : kind === "end" ? l.x + l.w - z : obj.x;
	const y = l.baseline - baselineOffset(obj, movingLine);
	const box = lineBox(ref);
	const moved = { ...obj, x, y };
	const guides: Guide[] = [
		{
			axis: "y",
			v: l.baseline,
			from: Math.min(l.x, x + a),
			to: Math.max(l.x + l.w, x + z),
			pdf: true,
		},
	];
	if (kind)
		guides.push({
			axis: "x",
			v: kind === "start" ? l.x : l.x + l.w,
			from: Math.min(l.y, y),
			to: Math.max(l.y + l.h, y + obj.h),
			pdf: true,
		});
	return {
		obj: moved,
		guides,
		target: box,
		pdfY: { ...ref, movingLine },
		pdfX: kind ? { ...ref, kind } : undefined,
	};
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
	skip: ReadonlySet<string> = new Set(),
): PdfLineRef | null {
	for (const block of blocks) {
		const line = block.lines.findIndex(
			(l, i) =>
				x >= l.x - tol &&
				x <= l.x + l.w + tol &&
				y >= l.y &&
				y <= l.y + l.h &&
				!skip.has(lineId({ block, line: i })),
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

/**
 * Texto que recebe o estilo da linha do PDF onde é solto: qualquer texto novo
 * sem rotação (inclusive com estilo mudado à mão), exceto na linha em que o
 * usuário já clicou "Desfazer estilo".
 */
export const acceptsAutoStyle = (t: TextObject, ref?: PdfLineRef) =>
	t.rotation === 0 && !t.source && !(ref && t.styleKept === lineId(ref));

/** Referência de remoção da linha `ref` (para `TextObject.replaces`). */
export function replacedLine(ref: PdfLineRef): ReplacedLine {
	const l = ref.block.lines[ref.line];
	return { key: lineId(ref), text: l.str, lines: [l] };
}

/**
 * Textos do PDF a remover do content stream da página: os editados
 * (`source`, bloco inteiro) e as linhas substituídas (`replaces`). Uma linha
 * de um bloco que também está sendo editado sai com o bloco.
 */
export function removalRefs(
	objects: EditorObject[],
): { key: string; lines: TextLine[] }[] {
	const refs = new Map<string, { key: string; lines: TextLine[] }>();
	for (const o of objects)
		if (o.type === "text" && o.source)
			refs.set(o.source.key, { key: o.source.key, lines: o.source.lines });
	for (const o of objects) {
		if (o.type !== "text" || !o.replaces) continue;
		const block = o.replaces.key.slice(0, o.replaces.key.lastIndexOf("#"));
		if (refs.has(block)) continue;
		refs.set(o.replaces.key, { key: o.replaces.key, lines: o.replaces.lines });
	}
	return [...refs.values()];
}

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

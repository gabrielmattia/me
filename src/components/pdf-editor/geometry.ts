import type {
	BoxObject,
	EditorObject,
	Matrix,
	PageModel,
	Rotation,
} from "./types";

/** Aplica `first` e depois `second` (convenção PDF: x' = a·x + c·y + e). */
export function multiply(first: Matrix, second: Matrix): Matrix {
	const [a1, b1, c1, d1, e1, f1] = first;
	const [a2, b2, c2, d2, e2, f2] = second;
	return [
		a1 * a2 + b1 * c2,
		a1 * b2 + b1 * d2,
		c1 * a2 + d1 * c2,
		c1 * b2 + d1 * d2,
		e1 * a2 + f1 * c2 + e2,
		e1 * b2 + f1 * d2 + f2,
	];
}

/** Compõe matrizes na ordem de aplicação. */
export function chain(...ms: Matrix[]): Matrix {
	return ms.reduce((acc, m) => multiply(acc, m));
}

export function invert(m: Matrix): Matrix {
	const [a, b, c, d, e, f] = m;
	const det = a * d - b * c;
	return [
		d / det,
		-b / det,
		-c / det,
		a / det,
		(c * f - d * e) / det,
		(b * e - a * f) / det,
	];
}

export function applyMatrix(m: Matrix, x: number, y: number): [number, number] {
	return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Rotação no sentido horário em coordenadas y-para-baixo (igual ao CSS). */
export function rotateVec(x: number, y: number, deg: number): [number, number] {
	const r = (deg * Math.PI) / 180;
	const cos = Math.cos(r);
	const sin = Math.sin(r);
	return [x * cos - y * sin, x * sin + y * cos];
}

export function normalizeRotation(deg: number): Rotation {
	return ((((Math.round(deg / 90) * 90) % 360) + 360) % 360) as Rotation;
}

/** Dimensões da página como aparecem na tela (com a rotação do editor). */
export function displaySize(page: PageModel): { w: number; h: number } {
	return page.rotation % 180 === 0
		? { w: page.width, h: page.height }
		: { w: page.height, h: page.width };
}

/** Converte um ponto da tela para o espaço base da página. */
export function clientToBase(
	clientX: number,
	clientY: number,
	frame: HTMLElement,
	page: PageModel,
	zoom: number,
): [number, number] {
	const rect = frame.getBoundingClientRect();
	const dx = clientX - (rect.left + rect.width / 2);
	const dy = clientY - (rect.top + rect.height / 2);
	const [lx, ly] = rotateVec(dx, dy, -page.rotation);
	return [lx / zoom + page.width / 2, ly / zoom + page.height / 2];
}

/** Converte um deslocamento da tela (px) para o espaço base. */
export function screenDeltaToBase(
	dx: number,
	dy: number,
	page: PageModel,
	zoom: number,
): [number, number] {
	const [x, y] = rotateVec(dx, dy, -page.rotation);
	return [x / zoom, y / zoom];
}

export function isBox(obj: EditorObject): obj is BoxObject {
	return obj.type !== "line";
}

/** Caixa alinhada aos eixos no espaço base. */
export function getBounds(obj: EditorObject): {
	x: number;
	y: number;
	w: number;
	h: number;
} {
	if (obj.type === "line") {
		const x = Math.min(obj.x1, obj.x2);
		const y = Math.min(obj.y1, obj.y2);
		return { x, y, w: Math.abs(obj.x2 - obj.x1), h: Math.abs(obj.y2 - obj.y1) };
	}
	if (obj.rotation % 180 === 0) {
		return { x: obj.x, y: obj.y, w: obj.w, h: obj.h };
	}
	const cx = obj.x + obj.w / 2;
	const cy = obj.y + obj.h / 2;
	return { x: cx - obj.h / 2, y: cy - obj.w / 2, w: obj.h, h: obj.w };
}

export function translateObject<T extends EditorObject>(
	obj: T,
	dx: number,
	dy: number,
): T {
	if (obj.type === "line") {
		return {
			...obj,
			x1: obj.x1 + dx,
			y1: obj.y1 + dy,
			x2: obj.x2 + dx,
			y2: obj.y2 + dy,
		};
	}
	return { ...obj, x: obj.x + dx, y: obj.y + dy };
}

export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

const HANDLE_DIR: Record<Handle, [number, number]> = {
	nw: [-1, -1],
	n: [0, -1],
	ne: [1, -1],
	e: [1, 0],
	se: [1, 1],
	s: [0, 1],
	sw: [-1, 1],
	w: [-1, 0],
};

export const CORNER_HANDLES: Handle[] = ["nw", "ne", "se", "sw"];
/** Texto: cantos escalam a fonte; laterais mudam a largura (quebra de linha). */
export const TEXT_HANDLES: Handle[] = ["nw", "ne", "se", "sw", "e", "w"];
export const ALL_HANDLES: Handle[] = [
	"nw",
	"n",
	"ne",
	"e",
	"se",
	"s",
	"sw",
	"w",
];

/**
 * Redimensiona uma caixa (possivelmente girada) mantendo fixo o lado/canto
 * oposto ao handle. `dx, dy` é o deslocamento do ponteiro no espaço base.
 */
export function resizeBox(
	box: { x: number; y: number; w: number; h: number; rotation: Rotation },
	handle: Handle,
	dx: number,
	dy: number,
	lockAspect: boolean,
	min = 4,
): { x: number; y: number; w: number; h: number } {
	const [hx, hy] = HANDLE_DIR[handle];
	// Deslocamento no referencial local da caixa.
	const [lx, ly] = rotateVec(dx, dy, -box.rotation);
	let w = Math.max(min, box.w + hx * lx);
	let h = Math.max(min, box.h + hy * ly);
	if (lockAspect && hx !== 0 && hy !== 0) {
		const ratio = box.w / box.h;
		if (w / h > ratio) h = w / ratio;
		else w = h * ratio;
	}
	if (hx === 0) w = lockAspect ? box.w : w;
	if (hy === 0) h = lockAspect ? box.h : h;
	// Canto/lado oposto fica parado: o centro anda metade da variação.
	const shiftLocalX = (hx * (w - box.w)) / 2;
	const shiftLocalY = (hy * (h - box.h)) / 2;
	const [sx, sy] = rotateVec(shiftLocalX, shiftLocalY, box.rotation);
	const cx = box.x + box.w / 2 + sx;
	const cy = box.y + box.h / 2 + sy;
	return { x: cx - w / 2, y: cy - h / 2, w, h };
}

export function handleCursor(handle: Handle, rotation: number): string {
	const order: Handle[] = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];
	const idx = (order.indexOf(handle) + Math.round(rotation / 45)) % 8;
	const cursors = [
		"ns-resize",
		"nesw-resize",
		"ew-resize",
		"nwse-resize",
		"ns-resize",
		"nesw-resize",
		"ew-resize",
		"nwse-resize",
	];
	return cursors[idx] ?? "move";
}

export const clamp = (v: number, min: number, max: number) =>
	Math.min(max, Math.max(min, v));

export function arrowHeadPath(
	x1: number,
	y1: number,
	x2: number,
	y2: number,
	width: number,
) {
	const len = Math.max(8, width * 4);
	const ang = Math.atan2(y2 - y1, x2 - x1);
	const [ax, ay] = rotateVec(-len, len * 0.5, (ang * 180) / Math.PI);
	const [bx, by] = rotateVec(-len, -len * 0.5, (ang * 180) / Math.PI);
	return `M ${x2} ${y2} L ${x2 + ax} ${y2 + ay} L ${x2 + bx} ${y2 + by} Z`;
}

/** Fim da haste da seta, recuado para a ponta não ficar coberta pelo traço. */
export function arrowShaftEnd(
	x1: number,
	y1: number,
	x2: number,
	y2: number,
	width: number,
): [number, number] {
	const len = Math.hypot(x2 - x1, y2 - y1);
	if (len === 0) return [x2, y2];
	const back = Math.min(len, Math.max(8, width * 4) * 0.7);
	return [x2 - ((x2 - x1) / len) * back, y2 - ((y2 - y1) / len) * back];
}

/** Posiciona uma caixa (girada) para que o canto superior esquerdo LOCAL fique em (px, py). */
export function placeLocalTopLeft(
	w: number,
	h: number,
	rotation: number,
	px: number,
	py: number,
): { x: number; y: number } {
	const [ox, oy] = rotateVec(w / 2, h / 2, rotation);
	return { x: px + ox - w / 2, y: py + oy - h / 2 };
}

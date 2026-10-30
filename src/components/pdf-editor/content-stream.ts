/**
 * Leitura mínima de content streams PDF: tokeniza os operadores (guardando o
 * intervalo de bytes de cada um) e acompanha o estado de texto/gráfico o
 * suficiente para saber ONDE começa cada operador que mostra texto.
 *
 * É usado para remover do content stream só os operadores de texto de um bloco
 * editado (ver `text-removal.ts`), sem tocar em mais nada: o resto do stream é
 * copiado byte a byte.
 */
import { applyMatrix, multiply } from "./geometry";
import type { Matrix } from "./types";

export type Operand =
	| number
	| { name: string }
	| { str: true; bytes: Uint8Array }
	| Operand[]
	| { dict: true }
	| boolean
	| null;

export interface ContentOp {
	op: string;
	operands: Operand[];
	/** Início do primeiro operando (ou do operador) e fim do operador. */
	start: number;
	end: number;
}

/** Operador de cor de preenchimento/estado gráfico, para reproduzir no texto novo. */
export interface ReplayOp {
	op: string;
	args: Array<number | { name: string }>;
}

export interface TextRun {
	id: number;
	/** Índices em `ops` dos operadores que mostram texto. */
	ops: number[];
	/** Origem do primeiro glifo no espaço do usuário. */
	origin: [number, number];
	/** Matriz texto → usuário no início do run (sem a fonte). */
	matrix: Matrix;
	fontRes: string | null;
	fontSize: number;
	charSpacing: number;
	wordSpacing: number;
	hScale: number;
	rise: number;
	renderMode: number;
	fill: ReplayOp[];
	gs: string[];
	/** Estado de cada operador de texto do run (Tc/Tw podem mudar no meio). */
	shows: Array<{ op: number; tc: number; tw: number }>;
}

export interface PageAnalysis {
	ops: ContentOp[];
	runs: TextRun[];
	/** `false` quando o stream tem algo que impede editar com segurança. */
	safe: boolean;
}

const WS = new Set([0, 9, 10, 12, 13, 32]);
const DELIM = new Set([40, 41, 60, 62, 91, 93, 123, 125, 47, 37]);

const isRegular = (c: number) => !WS.has(c) && !DELIM.has(c);

class Lexer {
	pos = 0;
	constructor(readonly b: Uint8Array) {}

	skipSpace() {
		const { b } = this;
		while (this.pos < b.length) {
			const c = b[this.pos];
			if (WS.has(c)) this.pos++;
			else if (c === 37) {
				while (this.pos < b.length && b[this.pos] !== 10 && b[this.pos] !== 13)
					this.pos++;
			} else break;
		}
	}

	/** Lê um objeto ou um operador. `undefined` = fim. */
	next():
		| { kind: "operand"; value: Operand }
		| { kind: "op"; op: string }
		| { kind: "close"; ch: string }
		| undefined {
		this.skipSpace();
		const { b } = this;
		if (this.pos >= b.length) return undefined;
		const c = b[this.pos];
		if (c === 40) {
			const start = this.pos;
			this.skipLiteral();
			return {
				kind: "operand",
				value: { str: true, bytes: literalBytes(b, start + 1, this.pos - 1) },
			};
		}
		if (c === 60) {
			if (b[this.pos + 1] === 60) {
				this.pos += 2;
				this.readDictBody();
				return { kind: "operand", value: { dict: true } };
			}
			const end = b.indexOf(62, this.pos);
			const bytes = hexBytes(
				b.subarray(this.pos + 1, end < 0 ? b.length : end),
			);
			this.pos = end < 0 ? b.length : end + 1;
			return { kind: "operand", value: { str: true, bytes } };
		}
		if (c === 91) {
			this.pos++;
			const arr: Operand[] = [];
			for (;;) {
				const t = this.next();
				if (!t || (t.kind === "close" && t.ch === "]")) break;
				if (t.kind === "operand") arr.push(t.value);
				else throw new Error("operador dentro de array");
			}
			return { kind: "operand", value: arr };
		}
		if (c === 93 || c === 62 || c === 41 || c === 125 || c === 123) {
			this.pos++;
			if (c === 62 && b[this.pos] === 62) this.pos++;
			return { kind: "close", ch: String.fromCharCode(c) };
		}
		if (c === 47) {
			this.pos++;
			const s = this.pos;
			while (this.pos < b.length && isRegular(b[this.pos])) this.pos++;
			return {
				kind: "operand",
				value: { name: decodeName(b.subarray(s, this.pos)) },
			};
		}
		const s = this.pos;
		while (this.pos < b.length && isRegular(b[this.pos])) this.pos++;
		const word = latin1(b.subarray(s, this.pos));
		if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word))
			return { kind: "operand", value: Number(word) };
		if (word === "true" || word === "false")
			return { kind: "operand", value: word === "true" };
		if (word === "null") return { kind: "operand", value: null };
		return { kind: "op", op: word };
	}

	skipLiteral() {
		const { b } = this;
		let depth = 0;
		while (this.pos < b.length) {
			const c = b[this.pos++];
			if (c === 92) this.pos++;
			else if (c === 40) depth++;
			else if (c === 41 && --depth === 0) return;
		}
	}

	readDictBody() {
		for (;;) {
			const t = this.next();
			if (!t || (t.kind === "close" && t.ch === ">")) return;
			if (t.kind === "op") throw new Error("operador dentro de dicionário");
		}
	}
}

/** Bytes de uma string literal `( … )` (sem os parênteses), com os escapes resolvidos. */
function literalBytes(b: Uint8Array, from: number, to: number): Uint8Array {
	const out: number[] = [];
	const ESC: Record<number, number> = {
		110: 10, // n
		114: 13, // r
		116: 9, // t
		98: 8, // b
		102: 12, // f
	};
	for (let i = from; i < to; i++) {
		const c = b[i];
		if (c !== 92) {
			// Fim de linha não escapado vira \n.
			if (c === 13) {
				out.push(10);
				if (b[i + 1] === 10) i++;
			} else out.push(c);
			continue;
		}
		const n = b[++i];
		if (n === undefined) break;
		if (n in ESC) out.push(ESC[n]);
		else if (n >= 48 && n <= 55) {
			let v = n - 48;
			for (let k = 0; k < 2 && b[i + 1] >= 48 && b[i + 1] <= 55; k++)
				v = v * 8 + (b[++i] - 48);
			out.push(v & 255);
		} else if (n === 13) {
			if (b[i + 1] === 10) i++;
		} else if (n !== 10) out.push(n);
	}
	return Uint8Array.from(out);
}

function hexBytes(b: Uint8Array): Uint8Array {
	const digits = latin1(b).replace(/[^0-9a-fA-F]/g, "");
	const even = digits.length % 2 ? `${digits}0` : digits;
	const out = new Uint8Array(even.length / 2);
	for (let i = 0; i < out.length; i++)
		out[i] = Number.parseInt(even.slice(i * 2, i * 2 + 2), 16);
	return out;
}

function latin1(b: Uint8Array): string {
	let s = "";
	for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
	return s;
}

function decodeName(b: Uint8Array): string {
	return latin1(b).replace(/#([0-9a-fA-F]{2})/g, (_, h) =>
		String.fromCharCode(Number.parseInt(h, 16)),
	);
}

/** Primeiro byte do token a partir de `pos` (pula espaços e comentários). */
function tokenStart(b: Uint8Array, pos: number): number {
	let s = pos;
	while (s < b.length && (WS.has(b[s]) || b[s] === 37)) {
		if (b[s] === 37) {
			while (s < b.length && b[s] !== 10 && b[s] !== 13) s++;
		} else s++;
	}
	return s;
}

const SHOW_OPS = new Set(["Tj", "TJ", "'", '"']);
const FILL_OPS = new Set(["g", "rg", "k", "sc", "scn"]);

interface GState {
	ctm: Matrix;
	font: string | null;
	size: number;
	tc: number;
	tw: number;
	tz: number;
	tl: number;
	ts: number;
	tr: number;
	fillCs: ReplayOp | null;
	fill: ReplayOp[];
	gs: string[];
}

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

const nums = (o: Operand[]) =>
	o.filter((v): v is number => typeof v === "number");

function replayArgs(o: Operand[]): ReplayOp["args"] | null {
	const out: ReplayOp["args"] = [];
	for (const v of o) {
		if (typeof v === "number") out.push(v);
		else if (v && typeof v === "object" && "name" in v) out.push(v);
		else return null;
	}
	return out;
}

/** Tokeniza e interpreta o content stream (já decodificado) de uma página. */
export function analyzeContent(bytes: Uint8Array): PageAnalysis {
	const lx = new Lexer(bytes);
	const ops: ContentOp[] = [];
	const runs: TextRun[] = [];
	let safe = true;
	let operands: Operand[] = [];
	let opStart = -1;

	let gs: GState = {
		ctm: IDENTITY,
		font: null,
		size: 0,
		tc: 0,
		tw: 0,
		tz: 100,
		tl: 0,
		ts: 0,
		tr: 0,
		fillCs: null,
		fill: [],
		gs: [],
	};
	const stack: GState[] = [];
	let tm: Matrix = IDENTITY;
	let tlm: Matrix = IDENTITY;
	let run: TextRun | null = null;
	const endRun = () => {
		run = null;
	};
	const moveLine = (tx: number, ty: number) => {
		tlm = multiply([1, 0, 0, 1, tx, ty], tlm);
		tm = tlm;
		endRun();
	};

	try {
		for (;;) {
			const before = lx.pos;
			const t = lx.next();
			if (!t) break;
			if (t.kind === "close") {
				safe = false;
				continue;
			}
			if (t.kind === "operand") {
				if (opStart < 0) opStart = tokenStart(bytes, before);
				operands.push(t.value);
				continue;
			}
			const op = t.op;
			const start = opStart < 0 ? tokenStart(bytes, before) : opStart;
			const rec: ContentOp = { op, operands, start, end: lx.pos };
			ops.push(rec);
			const idx = ops.length - 1;
			const n = nums(operands);
			operands = [];
			opStart = -1;

			switch (op) {
				case "BI":
					// Imagem inline: dados binários sem delimitação confiável.
					safe = false;
					return { ops, runs, safe };
				case "q":
					stack.push({ ...gs, fill: [...gs.fill], gs: [...gs.gs] });
					break;
				case "Q":
					gs = stack.pop() ?? gs;
					endRun();
					break;
				case "cm":
					if (n.length === 6) gs.ctm = multiply(n as Matrix, gs.ctm);
					endRun();
					break;
				case "gs": {
					const name = rec.operands[0];
					if (name && typeof name === "object" && "name" in name)
						gs.gs.push(name.name);
					break;
				}
				case "cs":
				case "CS": {
					if (op === "cs") {
						const args = replayArgs(rec.operands);
						gs.fillCs = args ? { op, args } : null;
						gs.fill = [];
					}
					break;
				}
				case "BT":
					tm = IDENTITY;
					tlm = IDENTITY;
					endRun();
					break;
				case "ET":
					endRun();
					break;
				case "Tc":
					gs.tc = n[0] ?? 0;
					break;
				case "Tw":
					gs.tw = n[0] ?? 0;
					break;
				case "Tz":
					gs.tz = n[0] ?? 100;
					break;
				case "TL":
					gs.tl = n[0] ?? 0;
					break;
				case "Ts":
					gs.ts = n[0] ?? 0;
					break;
				case "Tr":
					gs.tr = n[0] ?? 0;
					break;
				case "Tf": {
					const name = rec.operands[0];
					gs.font =
						name && typeof name === "object" && "name" in name
							? name.name
							: null;
					gs.size = n[0] ?? 0;
					break;
				}
				case "Td":
					moveLine(n[0] ?? 0, n[1] ?? 0);
					break;
				case "TD":
					gs.tl = -(n[1] ?? 0);
					moveLine(n[0] ?? 0, n[1] ?? 0);
					break;
				case "T*":
					moveLine(0, -gs.tl);
					break;
				case "Tm":
					if (n.length === 6) {
						tlm = n as Matrix;
						tm = tlm;
					}
					endRun();
					break;
				default:
					break;
			}

			if (FILL_OPS.has(op)) {
				const args = replayArgs(rec.operands);
				if (args) {
					const fill: ReplayOp = { op, args };
					gs.fill =
						(op === "sc" || op === "scn") && gs.fillCs
							? [gs.fillCs, fill]
							: [fill];
				}
			}

			if (SHOW_OPS.has(op)) {
				if (op === "'" || op === '"') {
					if (op === '"') {
						gs.tw = n[0] ?? gs.tw;
						gs.tc = n[1] ?? gs.tc;
					}
					moveLine(0, -gs.tl);
				}
				if (!run) {
					const fontM: Matrix = [
						gs.size * (gs.tz / 100),
						0,
						0,
						gs.size,
						0,
						gs.ts,
					];
					const m = multiply(tm, gs.ctm);
					const full = multiply(fontM, m);
					const r: TextRun = {
						id: runs.length,
						ops: [],
						origin: applyMatrix(full, 0, 0),
						matrix: m,
						fontRes: gs.font,
						fontSize: gs.size,
						charSpacing: gs.tc,
						wordSpacing: gs.tw,
						hScale: gs.tz,
						rise: gs.ts,
						renderMode: gs.tr,
						fill: gs.fill.length ? gs.fill : [{ op: "g", args: [0] }],
						gs: [...gs.gs],
						shows: [],
					};
					runs.push(r);
					run = r;
				}
				(run as TextRun).ops.push(idx);
				(run as TextRun).shows.push({ op: idx, tc: gs.tc, tw: gs.tw });
				if (gs.tr >= 4) (run as TextRun).renderMode = gs.tr;
			}
		}
	} catch {
		safe = false;
	}
	return { ops, runs, safe };
}

const enc = new TextEncoder();

/**
 * Remove do stream os operadores de texto indicados, preservando os efeitos de
 * posicionamento de `'` e `"`. O resto do conteúdo é copiado sem alteração.
 */
export function removeTextOps(
	bytes: Uint8Array,
	analysis: PageAnalysis,
	opIndexes: Iterable<number>,
): Uint8Array {
	const sorted = [...new Set(opIndexes)].sort((a, b) => a - b);
	const parts: Uint8Array[] = [];
	let cursor = 0;
	let total = 0;
	const push = (p: Uint8Array) => {
		parts.push(p);
		total += p.length;
	};
	for (const i of sorted) {
		const op = analysis.ops[i];
		if (!op || op.start < cursor) continue;
		push(bytes.subarray(cursor, op.start));
		let replacement = " ";
		if (op.op === "'") replacement = " T* ";
		else if (op.op === '"') {
			const [aw, ac] = nums(op.operands);
			replacement = ` ${fmt(aw ?? 0)} Tw ${fmt(ac ?? 0)} Tc T* `;
		}
		push(enc.encode(replacement));
		cursor = op.end;
	}
	push(bytes.subarray(cursor));
	const out = new Uint8Array(total);
	let o = 0;
	for (const p of parts) {
		out.set(p, o);
		o += p.length;
	}
	return out;
}

const fmt = (n: number) => String(Math.round(n * 10000) / 10000);

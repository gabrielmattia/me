import raw from "@/data/megasena-stats.json";

export type NumberStat = {
	n: number;
	count: number;
	countFirstHalf: number;
	countSecondHalf: number;
	currentDelay: number;
	maxGap: number;
};

export type DrawRef = { concurso: number; date: string };

export type MegaSenaStats = {
	meta: {
		source: string;
		firstDraw: DrawRef;
		lastDraw: DrawRef & { numbers: number[] };
		totalDraws: number;
		expectedPerNumber: number;
		oddsSena: number;
		generatedAt: string;
	};
	numbers: NumberStat[];
	topPairs: { pair: number[]; count: number }[];
	topTrios: { trio: number[]; count: number }[];
	evenCountDistribution: { evens: number; draws: number }[];
	sum: {
		min: number;
		minConcurso: number;
		max: number;
		maxConcurso: number;
		avg: number;
		histogram: { from: number; to: number; draws: number }[];
	};
	consecutive: { drawsWithConsecutive: number };
	repeatFromPrevious: { repeated: number; draws: number }[];
	notableRepeats: {
		from: number;
		to: number;
		date: string;
		repeated: number[];
	}[];
	decades: { range: string; count: number }[];
	duplicateCombinations: number;
	prizes: {
		accumulatedDraws: number;
		longestAccumulatedStreak: { length: number; endedAtConcurso: number };
		topTotalPrizes: (DrawRef & {
			total: number;
			perWinner: number;
			winners: number;
		})[];
		topSinglePrizes: (DrawRef & { prize: number })[];
		mostWinners: (DrawRef & { winners: number; perWinner: number })[];
	};
	byYear: {
		year: string;
		draws: number;
		accumulated: number;
		maxPrize: number;
		winners: number;
	}[];
	randomnessTests: {
		label: string;
		chiSquare: number;
		pValueSimulated: number;
		degreesOfFreedom: number;
	}[];
	randomnessCaveat: string;
};

export const stats: MegaSenaStats = raw;

/* ---------- Formatação (pt-BR) ---------- */

const intFmt = new Intl.NumberFormat("pt-BR");
const dec1Fmt = new Intl.NumberFormat("pt-BR", {
	minimumFractionDigits: 1,
	maximumFractionDigits: 1,
});
const pctFmt = new Intl.NumberFormat("pt-BR", {
	style: "percent",
	minimumFractionDigits: 1,
	maximumFractionDigits: 1,
});
const brlFmt = new Intl.NumberFormat("pt-BR", {
	style: "currency",
	currency: "BRL",
	maximumFractionDigits: 0,
});
const compactFmt = new Intl.NumberFormat("pt-BR", {
	maximumFractionDigits: 1,
	minimumFractionDigits: 0,
});

export const fmtInt = (v: number) => intFmt.format(v);
export const fmtDec = (v: number) => dec1Fmt.format(v);
export const fmtPct = (v: number) => pctFmt.format(v);
export const fmtBRL = (v: number) => brlFmt.format(v);

/** R$ 1,09 bi · R$ 324,9 mi · R$ 850 mil — para títulos, cards e eixos. */
export function fmtBRLShort(v: number): string {
	const abs = Math.abs(v);
	if (abs >= 1e9) return `R$ ${compactFmt.format(v / 1e9)} bi`;
	if (abs >= 1e6) return `R$ ${compactFmt.format(v / 1e6)} mi`;
	if (abs >= 1e3) return `R$ ${compactFmt.format(v / 1e3)} mil`;
	return fmtBRL(v);
}

/** R$ 1,09 bilhão · R$ 324,9 milhões — forma por extenso, para leitores de tela. */
export function fmtBRLLong(v: number): string {
	const abs = Math.abs(v);
	if (abs >= 1e9) {
		const n = v / 1e9;
		return `R$ ${compactFmt.format(n)} ${n < 2 ? "bilhão" : "bilhões"}`;
	}
	if (abs >= 1e6) {
		const n = v / 1e6;
		return `R$ ${compactFmt.format(n)} ${n < 2 ? "milhão" : "milhões"}`;
	}
	return fmtBRL(v);
}

export const pad2 = (n: number) => String(n).padStart(2, "0");

/* ---------- Derivados (apenas leitura, nada é recalculado) ---------- */

const byCount = [...stats.numbers].sort((a, b) => b.count - a.count);
export const mostDrawn = byCount[0];
export const leastDrawn = byCount[byCount.length - 1];
export const mostDelayed = [...stats.numbers].sort(
	(a, b) => b.currentDelay - a.currentDelay,
)[0];
export const longestGap = [...stats.numbers].sort(
	(a, b) => b.maxGap - a.maxGap,
)[0];

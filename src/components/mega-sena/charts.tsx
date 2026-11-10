import { type ReactNode, useEffect, useRef, useState } from "react";
import { fmtBRLShort, fmtDec, fmtInt, pad2, stats } from "./data";
import { NUM } from "./ui";

/**
 * Largura real do contêiner — os gráficos desenham em pixels, então o texto
 * dos eixos mantém o mesmo tamanho no celular e no desktop. No SSR usa um
 * valor padrão e ajusta na hidratação.
 */
function useWidth<T extends HTMLElement>(fallback = 720) {
	const ref = useRef<T>(null);
	const [width, setWidth] = useState(fallback);
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const ro = new ResizeObserver(([entry]) => {
			setWidth(Math.max(240, Math.floor(entry.contentRect.width)));
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, []);
	return [ref, width] as const;
}

function niceMax(v: number, steps = 4): { max: number; step: number } {
	const raw = v / steps;
	const pow = 10 ** Math.floor(Math.log10(raw));
	const n = raw / pow;
	const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
	const step = nice * pow;
	return { max: Math.ceil(v / step) * step, step };
}

const AXIS_TEXT = "fill-(--ms-muted) text-[11px]";

/* ------------------------------------------------------------------ */
/* Frequência dos 60 números                                          */
/* ------------------------------------------------------------------ */

export function FrequencyChart() {
	const [ref, width] = useWidth<HTMLDivElement>();
	const [hover, setHover] = useState<number | null>(null);
	const { numbers, meta } = stats;
	const expected = meta.expectedPerNumber;
	const height = width < 520 ? 240 : 300;
	const m = { t: 28, r: 8, b: 26, l: 34 };
	const iw = width - m.l - m.r;
	const ih = height - m.t - m.b;
	const { max, step } = niceMax(Math.max(...numbers.map((d) => d.count)));
	const y = (v: number) => m.t + ih - (v / max) * ih;
	const band = iw / numbers.length;
	const gap = band > 10 ? 2 : 1;
	const ticks = Array.from({ length: max / step + 1 }, (_, i) => i * step);
	const labelEvery = width < 520 ? 10 : 5;
	const shown = hover ? numbers[hover - 1] : null;

	return (
		<div ref={ref} className="relative">
			<p
				aria-hidden="true"
				className={`mb-2 h-5 text-sm text-(--ms-muted) ${NUM}`}
			>
				{shown ? (
					<>
						<strong className="text-(--ms-ink)">{pad2(shown.n)}</strong> ·{" "}
						{fmtInt(shown.count)} vezes · {shown.count >= expected ? "+" : "−"}
						{fmtDec(Math.abs(shown.count - expected))} do esperado
					</>
				) : (
					"Passe o mouse ou toque numa barra"
				)}
			</p>
			<svg
				width={width}
				height={height}
				role="img"
				aria-label={`Gráfico de barras com a frequência dos 60 números em ${fmtInt(meta.totalDraws)} concursos. Valor esperado: ${fmtDec(expected)}. Mais sorteado: 10, com 361 vezes. Menos sorteado: 26, com 250 vezes.`}
				className="block overflow-visible"
				onMouseLeave={() => setHover(null)}
			>
				{ticks.map((t) => (
					<g key={t}>
						<line
							x1={m.l}
							x2={width - m.r}
							y1={y(t)}
							y2={y(t)}
							className="stroke-(--ms-line)"
							strokeDasharray={t === 0 ? undefined : "2 4"}
						/>
						<text
							x={m.l - 6}
							y={y(t)}
							dy="0.32em"
							textAnchor="end"
							className={AXIS_TEXT}
						>
							{fmtInt(t)}
						</text>
					</g>
				))}
				{numbers.map((d, i) => {
					const above = d.count >= expected;
					const x = m.l + i * band;
					const dim = hover !== null && hover !== d.n;
					return (
						// biome-ignore lint/a11y/noStaticElementInteractions: realce visual; o dado está no aria-label do SVG e no volante
						<g
							key={d.n}
							onMouseEnter={() => setHover(d.n)}
							onTouchStart={() => setHover(d.n)}
						>
							<rect x={x} y={m.t} width={band} height={ih} fill="transparent" />
							<rect
								x={x + gap / 2}
								y={y(d.count)}
								width={Math.max(1, band - gap)}
								height={y(0) - y(d.count)}
								rx={band > 8 ? 2 : 1}
								className={above ? "fill-(--ms-green)" : "fill-(--ms-gold)"}
								opacity={dim ? 0.35 : 1}
							>
								<title>{`${pad2(d.n)}: ${fmtInt(d.count)} vezes`}</title>
							</rect>
							{(d.n === 1 || d.n % labelEvery === 0) && (
								<text
									x={x + band / 2}
									y={height - m.b + 16}
									textAnchor="middle"
									className={AXIS_TEXT}
								>
									{pad2(d.n)}
								</text>
							)}
						</g>
					);
				})}
				<line
					x1={m.l}
					x2={width - m.r}
					y1={y(expected)}
					y2={y(expected)}
					className="stroke-(--ms-ink)"
					strokeWidth={1.5}
					strokeDasharray="6 4"
				/>
				<text
					x={width - m.r}
					y={y(expected) - 8}
					textAnchor="end"
					className="fill-(--ms-ink) text-[12px] font-semibold"
				>
					esperado: {fmtDec(expected)}
				</text>
			</svg>
		</div>
	);
}

/* ------------------------------------------------------------------ */
/* Colunas genéricas (pares/ímpares, soma, repetição, dezenas)        */
/* ------------------------------------------------------------------ */

export type Column = {
	label: string;
	value: number;
	highlight?: boolean;
	title?: string;
};

export function ColumnChart({
	data,
	ariaLabel,
	height = 200,
	format = fmtInt,
	showValues = true,
	labelEvery = 1,
	xCaption,
}: {
	data: Column[];
	ariaLabel: string;
	height?: number;
	format?: (v: number) => string;
	showValues?: boolean;
	labelEvery?: number;
	xCaption?: ReactNode;
}) {
	const [ref, width] = useWidth<HTMLDivElement>(360);
	const m = { t: showValues ? 20 : 8, r: 2, b: 22, l: 2 };
	const iw = width - m.l - m.r;
	const ih = height - m.t - m.b;
	const max = Math.max(...data.map((d) => d.value));
	const band = iw / data.length;
	const gap = Math.min(10, band * 0.22);
	const narrow = band < 34;

	return (
		<div ref={ref}>
			<svg
				width={width}
				height={height}
				role="img"
				aria-label={ariaLabel}
				className="block overflow-visible"
			>
				<line
					x1={m.l}
					x2={width - m.r}
					y1={m.t + ih}
					y2={m.t + ih}
					className="stroke-(--ms-line-strong)"
				/>
				{data.map((d, i) => {
					const h = max === 0 ? 0 : (d.value / max) * ih;
					const x = m.l + i * band + gap / 2;
					const w = band - gap;
					const showLabel = i % labelEvery === 0;
					return (
						<g key={d.label}>
							<rect
								x={x}
								y={m.t + ih - h}
								width={w}
								height={Math.max(h, d.value > 0 ? 1.5 : 0)}
								rx={Math.min(4, w / 4)}
								className={
									d.highlight ? "fill-(--ms-gold)" : "fill-(--ms-green-soft)"
								}
							>
								<title>{d.title ?? `${d.label}: ${format(d.value)}`}</title>
							</rect>
							{showValues && !(narrow && !d.highlight) ? (
								<text
									x={x + w / 2}
									y={m.t + ih - h - 6}
									textAnchor="middle"
									className={`fill-(--ms-ink) text-[11px] font-semibold ${NUM}`}
								>
									{format(d.value)}
								</text>
							) : null}
							{showLabel ? (
								<text
									x={x + w / 2}
									y={height - 6}
									textAnchor="middle"
									className={`${AXIS_TEXT} ${NUM}`}
								>
									{d.label}
								</text>
							) : null}
						</g>
					);
				})}
			</svg>
			{xCaption ? (
				<p className="mt-2 text-center text-xs text-(--ms-muted)">{xCaption}</p>
			) : null}
		</div>
	);
}

/* ------------------------------------------------------------------ */
/* Por ano: maior prêmio (colunas) + concursos e acumulados (empilhado) */
/* ------------------------------------------------------------------ */

export function YearChart() {
	const [ref, width] = useWidth<HTMLDivElement>();
	const [hover, setHover] = useState<number | null>(null);
	const years = stats.byYear;
	const m = { t: 12, r: 8, b: 24, l: 52 };
	const topH = width < 520 ? 170 : 220;
	const botH = 90;
	const between = 30;
	const height = m.t + topH + between + botH + m.b;
	const iw = width - m.l - m.r;
	const band = iw / years.length;
	const gap = Math.max(1, band * 0.25);

	const prize = niceMax(Math.max(...years.map((d) => d.maxPrize)));
	const yPrize = (v: number) => m.t + topH - (v / prize.max) * topH;
	const prizeTicks = Array.from(
		{ length: prize.max / prize.step + 1 },
		(_, i) => i * prize.step,
	);

	const drawsMax = niceMax(Math.max(...years.map((d) => d.draws)), 2);
	const botTop = m.t + topH + between;
	const yDraws = (v: number) => botTop + botH - (v / drawsMax.max) * botH;
	const labelEvery = width < 520 ? 10 : 5;
	const peak = years.reduce((a, b) => (b.maxPrize > a.maxPrize ? b : a));
	const shown = hover !== null ? years[hover] : null;

	return (
		<div ref={ref}>
			<p
				aria-hidden="true"
				className={`mb-3 min-h-5 text-sm text-(--ms-muted) ${NUM}`}
			>
				{shown ? (
					<>
						<strong className="text-(--ms-ink)">{shown.year}</strong> · maior
						prêmio {fmtBRLShort(shown.maxPrize)} · {fmtInt(shown.draws)}{" "}
						concursos, {fmtInt(shown.accumulated)} acumulados ·{" "}
						{fmtInt(shown.winners)} ganhadores
					</>
				) : (
					"Passe o mouse ou toque num ano"
				)}
			</p>
			<svg
				width={width}
				height={height}
				role="img"
				aria-label={`Evolução por ano de 1996 a 2026. Em cima, o maior prêmio pago em cada ano; o pico é ${peak.year}, com ${fmtBRLShort(peak.maxPrize)}. Embaixo, a quantidade de concursos por ano, destacando quantos acumularam.`}
				className="block overflow-visible"
				onMouseLeave={() => setHover(null)}
			>
				{prizeTicks.map((t) => (
					<g key={t}>
						<line
							x1={m.l}
							x2={width - m.r}
							y1={yPrize(t)}
							y2={yPrize(t)}
							className="stroke-(--ms-line)"
							strokeDasharray={t === 0 ? undefined : "2 4"}
						/>
						<text
							x={m.l - 6}
							y={yPrize(t)}
							dy="0.32em"
							textAnchor="end"
							className={AXIS_TEXT}
						>
							{t === 0 ? "0" : fmtBRLShort(t).replace("R$ ", "")}
						</text>
					</g>
				))}
				<text x={m.l} y={botTop - 10} className={`${AXIS_TEXT} font-semibold`}>
					Concursos no ano (dourado = acumulou)
				</text>
				<line
					x1={m.l}
					x2={width - m.r}
					y1={botTop + botH}
					y2={botTop + botH}
					className="stroke-(--ms-line-strong)"
				/>
				<text
					x={m.l - 6}
					y={yDraws(drawsMax.max)}
					dy="0.32em"
					textAnchor="end"
					className={AXIS_TEXT}
				>
					{fmtInt(drawsMax.max)}
				</text>
				{years.map((d, i) => {
					const x = m.l + i * band + gap / 2;
					const w = band - gap;
					const dim = hover !== null && hover !== i;
					const isPeak = d.year === peak.year;
					return (
						// biome-ignore lint/a11y/noStaticElementInteractions: realce visual; o resumo está no aria-label
						<g
							key={d.year}
							opacity={dim ? 0.4 : 1}
							onMouseEnter={() => setHover(i)}
							onTouchStart={() => setHover(i)}
						>
							<rect
								x={m.l + i * band}
								y={m.t}
								width={band}
								height={height - m.t - m.b}
								fill="transparent"
							/>
							<rect
								x={x}
								y={yPrize(d.maxPrize)}
								width={w}
								height={yPrize(0) - yPrize(d.maxPrize)}
								rx={Math.min(3, w / 4)}
								className={isPeak ? "fill-(--ms-gold)" : "fill-(--ms-green)"}
							>
								<title>{`${d.year}: ${fmtBRLShort(d.maxPrize)}`}</title>
							</rect>
							<rect
								x={x}
								y={yDraws(d.draws)}
								width={w}
								height={yDraws(0) - yDraws(d.draws)}
								className="fill-(--ms-green-soft)"
							/>
							<rect
								x={x}
								y={yDraws(d.accumulated)}
								width={w}
								height={yDraws(0) - yDraws(d.accumulated)}
								className="fill-(--ms-gold)"
							>
								<title>{`${d.year}: ${d.draws} concursos, ${d.accumulated} acumulados`}</title>
							</rect>
							{((i === 0 && labelEvery < 10) ||
								Number(d.year) % labelEvery === 0) && (
								<text
									x={x + w / 2}
									y={height - 6}
									textAnchor="middle"
									className={`${AXIS_TEXT} ${NUM}`}
								>
									{d.year}
								</text>
							)}
						</g>
					);
				})}
			</svg>
		</div>
	);
}

/* ------------------------------------------------------------------ */
/* Ranking em barras horizontais (HTML, lê bem no celular)            */
/* ------------------------------------------------------------------ */

export function RankBars({
	items,
	ariaLabel,
}: {
	items: { key: string; label: ReactNode; meta: ReactNode; value: number }[];
	ariaLabel: string;
}) {
	const max = Math.max(...items.map((d) => d.value));
	return (
		<ol aria-label={ariaLabel} className="flex flex-col gap-4">
			{items.map((d, i) => (
				<li key={d.key} className="grid grid-cols-[1.5rem_1fr] gap-x-2">
					<span
						className={`pt-0.5 text-sm font-semibold text-(--ms-muted) ${NUM}`}
					>
						{i + 1}
					</span>
					<div>
						<div className="flex items-baseline justify-between gap-3">
							<span className={`font-semibold whitespace-nowrap ${NUM}`}>
								{d.label}
							</span>
							<span className={`text-right text-xs text-(--ms-muted) ${NUM}`}>
								{d.meta}
							</span>
						</div>
						<div
							aria-hidden="true"
							className="mt-1.5 h-2 overflow-hidden rounded-full bg-(--ms-cell)"
						>
							<div
								className={`h-full rounded-full ${i === 0 ? "bg-(--ms-gold)" : "bg-(--ms-green)"}`}
								style={{ width: `${(d.value / max) * 100}%` }}
							/>
						</div>
					</div>
				</li>
			))}
		</ol>
	);
}

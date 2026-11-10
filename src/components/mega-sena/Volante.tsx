import { useId, useState } from "react";
import { fmtDec, fmtInt, type NumberStat, pad2, stats } from "./data";
import { Card, DISPLAY, LABEL, NUM } from "./ui";

type Metric = "count" | "delay" | "halves";

const METRICS: { id: Metric; label: string; legend: [string, string] }[] = [
	{
		id: "count",
		label: "Frequência total",
		legend: ["abaixo do esperado", "acima do esperado"],
	},
	{
		id: "delay",
		label: "Atraso atual",
		legend: ["saiu há pouco", "mais atrasado"],
	},
	{
		id: "halves",
		label: "1ª × 2ª metade",
		legend: ["saiu menos na 2ª metade", "saiu mais na 2ª metade"],
	},
];

const { numbers, meta } = stats;
const expected = meta.expectedPerNumber;
const maxDev = Math.max(...numbers.map((d) => Math.abs(d.count - expected)));
const maxDelay = Math.max(...numbers.map((d) => d.currentDelay));
const maxHalfDiff = Math.max(
	...numbers.map((d) => Math.abs(d.countSecondHalf - d.countFirstHalf)),
);

/**
 * Intensidade em [-1, 1]: negativo puxa para `--ms-lo` (dourado),
 * positivo para `--ms-hi` (verde). As duas cores extremas foram escolhidas
 * para manter o número em `--ms-ink` com contraste AA em qualquer intensidade.
 */
function intensity(d: NumberStat, metric: Metric): number {
	if (metric === "count") return (d.count - expected) / maxDev;
	if (metric === "delay") return -(d.currentDelay / maxDelay);
	return (d.countSecondHalf - d.countFirstHalf) / maxHalfDiff;
}

function cellColor(t: number): string {
	const pct = Math.round(Math.min(1, Math.abs(t)) * 100);
	const target = t >= 0 ? "var(--ms-hi)" : "var(--ms-lo)";
	return `color-mix(in oklab, ${target} ${pct}%, var(--ms-cell))`;
}

function describe(d: NumberStat): string {
	const dev = d.count - expected;
	return `Número ${pad2(d.n)}: sorteado ${fmtInt(d.count)} vezes, ${dev >= 0 ? "+" : "−"}${fmtDec(Math.abs(dev))} em relação ao esperado; atraso atual de ${fmtInt(d.currentDelay)} concursos; maior jejum de ${fmtInt(d.maxGap)} concursos.`;
}

export function Volante() {
	const [metric, setMetric] = useState<Metric>("count");
	const [active, setActive] = useState<number>(meta.lastDraw.numbers[0]);
	const detailId = useId();
	const current = numbers[active - 1];
	const legend = METRICS.find((m) => m.id === metric)?.legend ?? ["", ""];
	const delta = current.count - expected;
	const halfDelta = current.countSecondHalf - current.countFirstHalf;

	return (
		<div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
			<Card className="p-3 sm:p-6">
				<fieldset className="mb-5 grid min-w-0 grid-cols-3 gap-1 rounded-xl border border-(--ms-line) bg-(--ms-bg) p-1 sm:rounded-full">
					<legend className="sr-only">Métrica do volante</legend>
					{METRICS.map((m) => {
						const selected = metric === m.id;
						return (
							<button
								key={m.id}
								type="button"
								aria-pressed={selected}
								onClick={() => setMetric(m.id)}
								className={`rounded-lg px-2 py-2 text-xs leading-tight font-medium sm:rounded-full sm:px-3 sm:text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--ms-focus) ${
									selected
										? "bg-(--ms-green) text-(--ms-on-green)"
										: "text-(--ms-muted) hover:text-(--ms-ink)"
								}`}
							>
								{m.label}
							</button>
						);
					})}
				</fieldset>

				<h3 className="sr-only">Volante com os números de 01 a 60</h3>
				<div className="grid grid-cols-10 gap-1 sm:gap-1.5">
					{numbers.map((d) => {
						const t = intensity(d, metric);
						const isActive = d.n === active;
						const inLast = meta.lastDraw.numbers.includes(d.n);
						return (
							<button
								key={d.n}
								type="button"
								aria-pressed={isActive}
								aria-label={describe(d)}
								onMouseEnter={() => setActive(d.n)}
								onFocus={() => setActive(d.n)}
								onClick={() => setActive(d.n)}
								style={{ backgroundColor: cellColor(t) }}
								className={`relative flex aspect-square items-center justify-center rounded-md text-xs font-semibold text-(--ms-ink) transition-[transform,box-shadow] sm:rounded-lg sm:text-base ${NUM} focus-visible:z-10 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-(--ms-focus) ${
									isActive
										? "z-10 scale-110 shadow-[0_0_0_2px_var(--ms-ink)]"
										: "hover:scale-105"
								}`}
							>
								{pad2(d.n)}
								{inLast ? (
									<span
										aria-hidden="true"
										className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-(--ms-ink) sm:top-1 sm:right-1"
									/>
								) : null}
							</button>
						);
					})}
				</div>

				<div className="mt-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-xs text-(--ms-muted)">
					<div className="flex items-center gap-2">
						<span>{legend[0]}</span>
						<span
							aria-hidden="true"
							className="h-2.5 w-28 rounded-full"
							style={{
								background:
									metric === "delay"
										? "linear-gradient(90deg, var(--ms-cell), var(--ms-lo))"
										: "linear-gradient(90deg, var(--ms-lo), var(--ms-cell), var(--ms-hi))",
							}}
						/>
						<span>{legend[1]}</span>
					</div>
					<div className="flex items-center gap-1.5">
						<span
							aria-hidden="true"
							className="size-1.5 rounded-full bg-(--ms-ink)"
						/>
						<span>saiu no concurso {fmtInt(meta.lastDraw.concurso)}</span>
					</div>
				</div>
			</Card>

			<Card className="lg:sticky lg:top-6 lg:self-start">
				<div id={detailId} aria-live="polite">
					<p className={LABEL}>Número selecionado</p>
					<p className={`mt-2 ${DISPLAY} text-6xl font-semibold ${NUM}`}>
						{pad2(current.n)}
					</p>
					<dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
						<Stat label="Sorteado" value={`${fmtInt(current.count)}×`} />
						<Stat
							label="Desvio do esperado"
							value={`${delta >= 0 ? "+" : "−"}${fmtDec(Math.abs(delta))}`}
							hint={`${delta >= 0 ? "+" : "−"}${fmtDec(Math.abs((delta / expected) * 100))}%`}
						/>
						<Stat
							label="Atraso atual"
							value={`${fmtInt(current.currentDelay)}`}
							hint="concursos"
						/>
						<Stat
							label="Maior jejum"
							value={`${fmtInt(current.maxGap)}`}
							hint="concursos"
						/>
						<Stat label="1ª metade" value={fmtInt(current.countFirstHalf)} />
						<Stat
							label="2ª metade"
							value={fmtInt(current.countSecondHalf)}
							hint={`${halfDelta >= 0 ? "+" : "−"}${fmtInt(Math.abs(halfDelta))}`}
						/>
					</dl>
					<p className="mt-5 border-t border-(--ms-line) pt-4 text-xs leading-relaxed text-(--ms-muted)">
						Esperado por número: {fmtDec(expected)} em {fmtInt(meta.totalDraws)}{" "}
						concursos (6 ÷ 60 de cada sorteio).
					</p>
				</div>
			</Card>
		</div>
	);
}

function Stat({
	label,
	value,
	hint,
}: {
	label: string;
	value: string;
	hint?: string;
}) {
	return (
		<div>
			<dt className="text-xs text-(--ms-muted)">{label}</dt>
			<dd className={`mt-0.5 text-xl font-semibold ${NUM}`}>
				{value}
				{hint ? (
					<span className="ml-1.5 text-xs font-medium text-(--ms-muted)">
						{hint}
					</span>
				) : null}
			</dd>
		</div>
	);
}

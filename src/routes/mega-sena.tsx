import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Info, ShieldAlert, Sigma, Trophy } from "lucide-react";
import {
	ColumnChart,
	FrequencyChart,
	RankBars,
	YearChart,
} from "@/components/mega-sena/charts";
import {
	fmtBRLShort,
	fmtDec,
	fmtInt,
	fmtPct,
	leastDrawn,
	longestGap,
	mostDelayed,
	mostDrawn,
	pad2,
	stats,
} from "@/components/mega-sena/data";
import {
	Ball,
	Card,
	CardTitle,
	DISPLAY,
	Kpi,
	LABEL,
	Money,
	NUM,
	Section,
} from "@/components/mega-sena/ui";
import { Volante } from "@/components/mega-sena/Volante";

/**
 * Paleta "volante de lotérica": verde Mega-Sena sobre papel, acento dourado.
 * Tudo vive em variáveis CSS (`--ms-*`) para trocar entre claro e escuro
 * (prefers-color-scheme ou classe `.dark` no ancestral, padrão do projeto).
 *
 *              claro      escuro
 *   bg         #F6F4EC    #0C1813   papel / fundo
 *   surface    #FFFFFF    #12211A   cards
 *   cell       #ECE8DB    #1B2D24   célula neutra do volante
 *   ink        #0F2219    #EAF2EC   texto (15.9:1 / 14.8:1)
 *   muted      #4A5B52    #A3B5AA   texto secundário (6.6:1 / 8.0:1)
 *   green      #0A6E3C    #3DBE7E   marca, barras acima do esperado
 *   gold       #E0AC2E    #EDBE4C   acento, destaques, abaixo do esperado
 *   gold-text  #855B00    #F0C350   dourado para texto (5.6:1 / 10.2:1)
 *   hi / lo    #5FA982 / #DDB04F  ·  #22714A / #7F5D10
 *              extremos do heatmap — escolhidos para o número em `ink`
 *              manter contraste AA (≥ 4.5:1) em qualquer intensidade.
 *   hero       #0A3D24    #07130E   faixa de abertura (texto #F4F1E6)
 */
const PALETTE_CSS = `
.ms-root {
	--ms-bg: #F6F4EC;
	--ms-surface: #FFFFFF;
	--ms-cell: #ECE8DB;
	--ms-ink: #0F2219;
	--ms-muted: #4A5B52;
	--ms-line: #E2DDCD;
	--ms-line-strong: #B5AD95;
	--ms-green: #0A6E3C;
	--ms-on-green: #FFFFFF;
	--ms-green-soft: #A6CBB5;
	--ms-gold: #E0AC2E;
	--ms-on-gold: #1E1704;
	--ms-gold-text: #855B00;
	--ms-hi: #5FA982;
	--ms-lo: #DDB04F;
	--ms-hero: #0A3D24;
	--ms-focus: #0F2219;
	color-scheme: light;
}
@media (prefers-color-scheme: dark) {
	.ms-root {
		--ms-bg: #0C1813;
		--ms-surface: #12211A;
		--ms-cell: #1B2D24;
		--ms-ink: #EAF2EC;
		--ms-muted: #A3B5AA;
		--ms-line: #23382D;
		--ms-line-strong: #3E5A4B;
		--ms-green: #3DBE7E;
		--ms-on-green: #04140B;
		--ms-green-soft: #2C5A43;
		--ms-gold: #EDBE4C;
		--ms-on-gold: #1E1704;
		--ms-gold-text: #F0C350;
		--ms-hi: #22714A;
		--ms-lo: #7F5D10;
		--ms-hero: #07130E;
		--ms-focus: #F0C350;
		color-scheme: dark;
	}
}
.dark .ms-root {
	--ms-bg: #0C1813;
	--ms-surface: #12211A;
	--ms-cell: #1B2D24;
	--ms-ink: #EAF2EC;
	--ms-muted: #A3B5AA;
	--ms-line: #23382D;
	--ms-line-strong: #3E5A4B;
	--ms-green: #3DBE7E;
	--ms-on-green: #04140B;
	--ms-green-soft: #2C5A43;
	--ms-gold: #EDBE4C;
	--ms-on-gold: #1E1704;
	--ms-gold-text: #F0C350;
	--ms-hi: #22714A;
	--ms-lo: #7F5D10;
	--ms-hero: #07130E;
	--ms-focus: #F0C350;
	color-scheme: dark;
}
`;

export const Route = createFileRoute("/mega-sena")({
	head: () => ({
		meta: [
			{
				title: "Mega-Sena em números, 1996–2026 — Wellington Gabriel de Mattia",
			},
			{
				name: "description",
				content:
					"Análise estatística de 3.083 concursos da Mega-Sena: frequência das dezenas, atrasos, padrões, prêmios e um teste de aleatoriedade.",
			},
		],
		links: [
			{ rel: "preconnect", href: "https://fonts.googleapis.com" },
			{
				rel: "preconnect",
				href: "https://fonts.gstatic.com",
				crossOrigin: "anonymous",
			},
			{
				rel: "stylesheet",
				href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Public+Sans:wght@400;500;600;700&display=swap",
			},
		],
	}),
	component: MegaSena,
});

const { meta, prizes } = stats;
const accumulatedShare = prizes.accumulatedDraws / meta.totalDraws;
const topSingle = prizes.topSinglePrizes[0];
const consecutiveShare =
	stats.consecutive.drawsWithConsecutive / meta.totalDraws;
const fiveRepeat = stats.notableRepeats.find((r) => r.repeated.length === 5);
const firstYear = meta.firstDraw.date.slice(-4);
const lastYear = meta.lastDraw.date.slice(-4);

function MegaSena() {
	return (
		<div className="ms-root min-h-screen bg-(--ms-bg) font-[Public_Sans,ui-sans-serif,system-ui,sans-serif] text-(--ms-ink) antialiased">
			<style>{PALETTE_CSS}</style>

			<Hero />

			<main className="mx-auto w-full max-w-6xl px-4 sm:px-6">
				<KpiRow />

				<Section
					kicker="O volante"
					title="Quais números saem mais — e quais estão sumidos"
					lead={
						<>
							Cada dezena deveria aparecer, em média,{" "}
							{fmtDec(meta.expectedPerNumber)} vezes. Passe o mouse, toque ou
							navegue com o teclado para ver o histórico de cada uma. Troque a
							métrica para ver o atraso atual ou a diferença entre a primeira e
							a segunda metade do histórico.
						</>
					}
				>
					<Volante />
				</Section>

				<Section
					kicker="Frequência"
					title="Os 60 números, lado a lado"
					lead={
						<>
							A diferença entre o mais sorteado ({mostDrawn.n}, com{" "}
							{fmtInt(mostDrawn.count)} vezes) e o menos sorteado (
							{leastDrawn.n}, com {fmtInt(leastDrawn.count)}) parece grande, mas
							é o tipo de oscilação que o acaso produz em 3 mil sorteios.
						</>
					}
				>
					<Card>
						<FrequencyChart />
						<div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-(--ms-muted)">
							<Legend swatch="bg-(--ms-green)">acima do esperado</Legend>
							<Legend swatch="bg-(--ms-gold)">abaixo do esperado</Legend>
							<Legend swatch="!h-0 !w-4 rounded-none border-t-2 border-dashed border-(--ms-ink)">
								valor esperado
							</Legend>
						</div>
					</Card>
				</Section>

				<Patterns />
				<Prizes />
				<Randomness />
			</main>

			<Footer />
		</div>
	);
}

function Legend({
	swatch,
	children,
}: {
	swatch: string;
	children: React.ReactNode;
}) {
	return (
		<span className="inline-flex items-center gap-1.5">
			<span
				aria-hidden="true"
				className={`inline-block w-3 h-3 rounded-sm ${swatch}`}
			/>
			{children}
		</span>
	);
}

/* ------------------------------------------------------------------ */

function Hero() {
	return (
		<header className="relative overflow-hidden bg-(--ms-hero) text-[#F4F1E6]">
			<div
				aria-hidden="true"
				className="absolute inset-0 opacity-[0.07] [background-image:radial-gradient(circle,#F4F1E6_1.5px,transparent_1.6px)] [background-size:22px_22px]"
			/>
			<div
				aria-hidden="true"
				className="absolute -top-32 -right-32 size-96 rounded-full bg-[radial-gradient(circle,rgba(224,172,46,0.28)_0%,rgba(224,172,46,0)_70%)]"
			/>
			<div className="relative mx-auto w-full max-w-6xl px-4 pt-6 pb-14 sm:px-6 sm:pb-20">
				<Link
					to="/"
					className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 -ml-2 text-sm text-[#C9D8CE] transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-[#F0C350]"
				>
					<ArrowLeft className="size-4" aria-hidden="true" />
					Portfólio
				</Link>

				<p className="mt-10 text-[11px] font-semibold tracking-[0.16em] text-[#F0C350] uppercase sm:mt-14">
					Reportagem de dados · Loterias Caixa
				</p>
				<h1
					className={`${DISPLAY} mt-4 max-w-3xl text-[2.6rem] leading-[1.02] font-semibold text-balance sm:text-6xl lg:text-7xl`}
				>
					{Number(lastYear) - Number(firstYear)} anos de{" "}
					<span className="whitespace-nowrap">Mega-Sena</span> em números
				</h1>
				<p className="mt-6 max-w-2xl text-lg leading-relaxed text-pretty text-[#C9D8CE] sm:text-xl">
					De {meta.firstDraw.date} a {meta.lastDraw.date}:{" "}
					{fmtInt(meta.totalDraws)} concursos, 60 dezenas e uma pergunta antiga
					— existe padrão no sorteio? Os dados contam uma história interessante,
					mas não ajudam a ganhar.
				</p>

				<dl className="mt-10 grid max-w-3xl grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
					<HeroStat label="Período" value={`${firstYear}–${lastYear}`} />
					<HeroStat label="Concursos" value={fmtInt(meta.totalDraws)} />
					<HeroStat
						label="Chance da sena"
						value={`1 em ${fmtInt(meta.oddsSena)}`}
						className="col-span-2 sm:col-span-1"
					/>
				</dl>

				<div className="mt-10 rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm sm:inline-block sm:p-5">
					<p className="text-xs font-semibold tracking-[0.14em] text-[#C9D8CE] uppercase">
						Último resultado · concurso {fmtInt(meta.lastDraw.concurso)} ·{" "}
						{meta.lastDraw.date}
					</p>
					<ul
						aria-label={`Números sorteados no concurso ${meta.lastDraw.concurso}`}
						className="mt-3 flex flex-wrap gap-2 sm:gap-3"
					>
						{meta.lastDraw.numbers.map((n) => (
							<li key={n}>
								<Ball n={n} size="lg" tone="gold" />
							</li>
						))}
					</ul>
				</div>
			</div>
		</header>
	);
}

function HeroStat({
	label,
	value,
	className = "",
}: {
	label: string;
	value: string;
	className?: string;
}) {
	return (
		<div className={className}>
			<dt className="text-xs text-[#C9D8CE]">{label}</dt>
			<dd
				className={`${DISPLAY} ${NUM} mt-1 text-2xl font-semibold sm:text-3xl`}
			>
				{value}
			</dd>
		</div>
	);
}

/* ------------------------------------------------------------------ */

function KpiRow() {
	const exp = meta.expectedPerNumber;
	return (
		<section
			aria-label="Destaques"
			className="relative z-10 -mt-8 grid grid-cols-1 gap-3 pb-14 sm:grid-cols-2 sm:gap-4 lg:grid-cols-5"
		>
			<Kpi
				label="Mais sorteado"
				accent={<Ball n={mostDrawn.n} tone="green" />}
				value={`${fmtInt(mostDrawn.count)}×`}
				detail={`+${fmtDec(mostDrawn.count - exp)} acima do esperado`}
			/>
			<Kpi
				label="Menos sorteado"
				accent={<Ball n={leastDrawn.n} tone="gold" />}
				value={`${fmtInt(leastDrawn.count)}×`}
				detail={`−${fmtDec(exp - leastDrawn.count)} abaixo do esperado`}
			/>
			<Kpi
				label="Mais atrasado agora"
				accent={<Ball n={mostDelayed.n} tone="outline" />}
				value={fmtInt(mostDelayed.currentDelay)}
				detail={`concursos sem sair. Maior jejum da história: o ${pad2(longestGap.n)}, ${fmtInt(longestGap.maxGap)} concursos`}
			/>
			<Kpi
				label="Maior prêmio individual"
				value={<Money value={topSingle.prize} />}
				detail={`Concurso ${fmtInt(topSingle.concurso)}, em ${topSingle.date}`}
			/>
			<Kpi
				label="Concursos acumulados"
				value={fmtPct(accumulatedShare)}
				detail={`${fmtInt(prizes.accumulatedDraws)} de ${fmtInt(meta.totalDraws)} terminaram sem ganhador`}
			/>
		</section>
	);
}

/* ------------------------------------------------------------------ */

function Patterns() {
	const even = stats.evenCountDistribution;
	const evenMode = even.reduce((a, b) => (b.draws > a.draws ? b : a));
	const sumBins = stats.sum.histogram;
	const repeat = stats.repeatFromPrevious;
	const noRepeat = repeat.find((r) => r.repeated === 0);

	return (
		<Section
			kicker="Padrões"
			title="O que se repete no formato dos sorteios"
			lead="Alguns formatos são muito mais comuns que outros — não por preferência do globo, mas porque existem muito mais combinações com esse formato."
		>
			<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
				<Card>
					<CardTitle
						sub={`O mais comum é ${evenMode.evens} pares e ${6 - evenMode.evens} ímpares (${fmtPct(evenMode.draws / meta.totalDraws)} dos concursos).`}
					>
						Pares e ímpares
					</CardTitle>
					<ColumnChart
						ariaLabel={`Distribuição de concursos pela quantidade de números pares: ${even.map((e) => `${e.evens} pares, ${e.draws} concursos`).join("; ")}.`}
						data={even.map((e) => ({
							label: String(e.evens),
							value: e.draws,
							highlight: e.evens === evenMode.evens,
							title: `${e.evens} pares e ${6 - e.evens} ímpares: ${fmtInt(e.draws)} concursos`,
						}))}
						xCaption="quantidade de números pares no sorteio"
					/>
				</Card>

				<Card>
					<CardTitle
						sub={
							<>
								Média de {fmtDec(stats.sum.avg)}. Menor soma: {stats.sum.min}{" "}
								(concurso {fmtInt(stats.sum.minConcurso)}). Maior:{" "}
								{stats.sum.max} (concurso {fmtInt(stats.sum.maxConcurso)}).
							</>
						}
					>
						Soma das seis dezenas
					</CardTitle>
					<ColumnChart
						ariaLabel={`Histograma da soma das seis dezenas, em faixas de 20. A soma média é ${fmtDec(stats.sum.avg)}; a faixa mais comum é de 180 a 199, com 591 concursos.`}
						data={sumBins.map((b) => ({
							label: String(b.from),
							value: b.draws,
							highlight: stats.sum.avg >= b.from && stats.sum.avg <= b.to,
							title: `Soma de ${b.from} a ${b.to}: ${fmtInt(b.draws)} concursos`,
						}))}
						labelEvery={2}
						xCaption="soma dos números sorteados (faixas de 20)"
					/>
				</Card>

				<Card>
					<CardTitle
						sub={`Em ${fmtPct((noRepeat?.draws ?? 0) / meta.totalDraws)} dos concursos, nenhum número do sorteio anterior voltou.`}
					>
						Repetidos do concurso anterior
					</CardTitle>
					<ColumnChart
						ariaLabel={`Quantos números se repetiram em relação ao concurso anterior: ${repeat.map((r) => `${r.repeated} repetidos, ${r.draws} concursos`).join("; ")}.`}
						data={repeat.map((r) => ({
							label: String(r.repeated),
							value: r.draws,
							highlight: r.repeated >= 4,
						}))}
						xCaption="números repetidos do concurso anterior"
					/>
					{fiveRepeat ? (
						<div className="mt-5 rounded-xl border border-(--ms-gold) bg-[color-mix(in_oklab,var(--ms-gold)_12%,transparent)] p-4">
							<p className="text-sm font-semibold">
								Caso único: 5 números repetidos
							</p>
							<p className="mt-1 text-sm text-(--ms-muted)">
								Do concurso {fiveRepeat.from} para o {fiveRepeat.to} (
								{fiveRepeat.date}), cinco dezenas saíram de novo:
							</p>
							<ul
								aria-label="Números repetidos"
								className="mt-3 flex flex-wrap gap-2"
							>
								{fiveRepeat.repeated.map((n) => (
									<li key={n}>
										<Ball n={n} size="sm" tone="gold" />
									</li>
								))}
							</ul>
						</div>
					) : null}
				</Card>

				<Card>
					<CardTitle sub="Total de vezes que números de cada faixa foram sorteados. Todas ficam perto de 3.083 — o esperado.">
						Dezenas por faixa
					</CardTitle>
					<ColumnChart
						ariaLabel={`Total de sorteios por faixa de dezenas: ${stats.decades.map((d) => `${d.range}, ${d.count}`).join("; ")}.`}
						data={stats.decades.map((d) => ({
							label: d.range,
							value: d.count,
						}))}
					/>
					<div className="mt-5 grid grid-cols-2 gap-3 border-t border-(--ms-line) pt-4 text-sm">
						<div>
							<p className={`${DISPLAY} ${NUM} text-2xl font-semibold`}>
								{fmtPct(consecutiveShare)}
							</p>
							<p className="text-(--ms-muted)">
								dos concursos tiveram ao menos dois números seguidos (ex.: 14 e
								15)
							</p>
						</div>
						<div>
							<p className={`${DISPLAY} ${NUM} text-2xl font-semibold`}>
								{fmtInt(stats.duplicateCombinations)}
							</p>
							<p className="text-(--ms-muted)">
								combinações repetidas: nenhum resultado saiu duas vezes
							</p>
						</div>
					</div>
				</Card>

				<Card>
					<CardTitle sub="Duplas que mais saíram juntas no mesmo concurso.">
						Pares mais frequentes
					</CardTitle>
					<ComboList
						items={stats.topPairs.map((p) => ({
							nums: p.pair,
							count: p.count,
						}))}
						label="Pares mais frequentes"
					/>
				</Card>

				<Card>
					<CardTitle sub="Trincas que mais saíram juntas. Oito vezes em 3 mil concursos é o máximo.">
						Trios mais frequentes
					</CardTitle>
					<ComboList
						items={stats.topTrios.map((t) => ({
							nums: t.trio,
							count: t.count,
						}))}
						label="Trios mais frequentes"
					/>
				</Card>
			</div>
		</Section>
	);
}

function ComboList({
	items,
	label,
}: {
	items: { nums: number[]; count: number }[];
	label: string;
}) {
	return (
		<ol aria-label={label} className="divide-y divide-(--ms-line)">
			{items.map((it) => (
				<li
					key={it.nums.join("-")}
					className="flex items-center justify-between gap-3 py-2.5"
				>
					<span className="flex gap-1.5">
						{it.nums.map((n) => (
							<Ball key={n} n={n} size="sm" tone="outline" />
						))}
					</span>
					<span className={`text-sm text-(--ms-muted) ${NUM}`}>
						<strong className="text-base text-(--ms-ink)">{it.count}</strong>{" "}
						vezes
					</span>
				</li>
			))}
		</ol>
	);
}

/* ------------------------------------------------------------------ */

function Prizes() {
	const streak = prizes.longestAccumulatedStreak;
	return (
		<Section
			kicker="Prêmios"
			title="Prêmios cada vez maiores, e a Virada no topo"
			lead={
				<>
					{fmtPct(accumulatedShare)} dos concursos acumulam. Isso empurra os
					prêmios para cima — e os cinco maiores totais da história são da Mega
					da Virada, em 31 de dezembro ou 1º de janeiro.
				</>
			}
		>
			<div className="grid grid-cols-1 gap-4">
				<Card>
					<CardTitle sub="Barras de cima: maior prêmio pago no ano (dourado = recorde). Barras de baixo: quantos concursos houve e quantos acumularam.">
						Evolução por ano
					</CardTitle>
					<YearChart />
				</Card>

				<div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
					<Card>
						<CardTitle sub="Prêmio total da sena, somando todos os ganhadores.">
							Maiores prêmios totais
						</CardTitle>
						<RankBars
							ariaLabel="Maiores prêmios totais"
							items={prizes.topTotalPrizes.map((p) => ({
								key: String(p.concurso),
								value: p.total,
								label: <Money value={p.total} />,
								meta: `${p.date} · ${p.winners} ganhadores`,
							}))}
						/>
					</Card>
					<Card>
						<CardTitle sub="Quanto levou cada ganhador da sena.">
							Maiores prêmios individuais
						</CardTitle>
						<RankBars
							ariaLabel="Maiores prêmios individuais"
							items={prizes.topSinglePrizes.map((p) => ({
								key: String(p.concurso),
								value: p.prize,
								label: <Money value={p.prize} />,
								meta: `concurso ${fmtInt(p.concurso)} · ${p.date}`,
							}))}
						/>
					</Card>
					<Card>
						<CardTitle sub="Mais gente acertando = prêmio dividido em mais partes.">
							Mais ganhadores num concurso
						</CardTitle>
						<RankBars
							ariaLabel="Concursos com mais ganhadores"
							items={prizes.mostWinners.map((p) => ({
								key: String(p.concurso),
								value: p.winners,
								label: `${p.winners} ganhadores`,
								meta: `${p.date} · ${fmtBRLShort(p.perWinner)} cada`,
							}))}
						/>
					</Card>
				</div>

				<Card className="flex flex-col gap-4 sm:flex-row sm:items-center">
					<span
						aria-hidden="true"
						className="flex size-14 shrink-0 items-center justify-center rounded-full bg-(--ms-gold) text-(--ms-on-gold)"
					>
						<Trophy className="size-7" />
					</span>
					<div>
						<p className={LABEL}>Maior sequência de acúmulos</p>
						<p className={`${DISPLAY} ${NUM} mt-1 text-3xl font-semibold`}>
							{streak.length} concursos seguidos sem ganhador
						</p>
						<p className="mt-1 text-sm text-(--ms-muted)">
							Recorde mais recente, encerrado no concurso{" "}
							{fmtInt(streak.endedAtConcurso)}. Logo depois, no concurso{" "}
							{fmtInt(topSingle.concurso)}, saiu o maior prêmio individual da
							história: {fmtBRLShort(topSingle.prize)} para um único apostador.
						</p>
					</div>
				</Card>
			</div>
		</Section>
	);
}

/* ------------------------------------------------------------------ */

function Randomness() {
	const MIN_P = 1 / 500;
	return (
		<Section
			kicker="Curiosidade estatística"
			title="O sorteio é mesmo aleatório?"
			lead={
				<>
					O teste qui-quadrado mede se a frequência das 60 dezenas está distante
					demais do que o acaso produziria. Quanto menor o p-valor, mais
					improvável é aquela desigualdade num sorteio perfeitamente uniforme.
					Abaixo de 0,05 costuma-se dizer que a diferença é “significativa”.
				</>
			}
		>
			<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
				{stats.randomnessTests.map((t) => {
					const below = t.pValueSimulated < 0.05;
					const pText =
						t.pValueSimulated < MIN_P
							? `< ${fmtDec3(MIN_P)}`
							: fmtDec3(t.pValueSimulated);
					return (
						<Card key={t.label} className="flex flex-col gap-4">
							<p className="text-sm font-semibold">{t.label}</p>
							<div className="flex flex-wrap items-end justify-between gap-3">
								<div>
									<p className="text-xs text-(--ms-muted)">p-valor</p>
									<p
										className={`${DISPLAY} ${NUM} text-4xl leading-none font-semibold whitespace-nowrap`}
									>
										{pText}
									</p>
								</div>
								<span
									className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
										below
											? "bg-(--ms-gold) text-(--ms-on-gold)"
											: "bg-(--ms-green) text-(--ms-on-green)"
									}`}
								>
									{below ? "Mais desigual que o acaso" : "Compatível com acaso"}
								</span>
							</div>
							<PGauge p={t.pValueSimulated} />
							<p className={`text-xs text-(--ms-muted) ${NUM}`}>
								χ² = {fmtDec(t.chiSquare)} · {t.degreesOfFreedom} graus de
								liberdade
							</p>
						</Card>
					);
				})}
			</div>

			<div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
				<Card>
					<div className="flex gap-3">
						<Sigma
							className="mt-0.5 size-5 shrink-0 text-(--ms-gold-text)"
							aria-hidden="true"
						/>
						<div className="text-sm leading-relaxed text-(--ms-muted)">
							<p className="text-base font-semibold text-(--ms-ink)">
								Como ler isso
							</p>
							<p className="mt-2">
								Na primeira metade do histórico (até 2013) a frequência das
								dezenas é compatível com acaso (p = 0,318). Na segunda metade
								ela fica bem mais desigual (p menor que 0,002) — é ali que o 10
								dispara, com 199 aparições contra 162 na primeira metade. O
								teste aponta que algo mudou, mas não diz o quê.
							</p>
							<p className="mt-3">{stats.randomnessCaveat}</p>
						</div>
					</div>
				</Card>
				<Card className="border-(--ms-gold) bg-[color-mix(in_oklab,var(--ms-gold)_10%,var(--ms-surface))]">
					<div className="flex gap-3">
						<ShieldAlert
							className="mt-0.5 size-5 shrink-0 text-(--ms-gold-text)"
							aria-hidden="true"
						/>
						<div className="text-sm leading-relaxed">
							<p className="text-base font-semibold">
								Isso não ajuda a prever resultados
							</p>
							<p className="mt-2 text-(--ms-muted)">
								Um desvio no passado não diz qual número sai amanhã. Número
								“atrasado” não está “devendo”, e número “quente” não tem mais
								chance. Cada combinação de seis dezenas tem a mesma chance: 1 em{" "}
								{fmtInt(meta.oddsSena)}.
							</p>
						</div>
					</div>
				</Card>
			</div>
		</Section>
	);
}

const dec3 = new Intl.NumberFormat("pt-BR", {
	minimumFractionDigits: 3,
	maximumFractionDigits: 3,
});
function fmtDec3(v: number) {
	return dec3.format(v);
}

/** Régua do p-valor em escala log (0,001 → 1) com a marca de 0,05. */
function PGauge({ p }: { p: number }) {
	const lo = Math.log10(0.001);
	const pos = (v: number) =>
		((Math.log10(Math.max(v, 0.001)) - lo) / (0 - lo)) * 100;
	return (
		<div aria-hidden="true" className="pt-1">
			<div className="relative h-2 rounded-full bg-(--ms-cell)">
				<div
					className="absolute inset-y-0 left-0 rounded-l-full bg-[color-mix(in_oklab,var(--ms-gold)_45%,transparent)]"
					style={{ width: `${pos(0.05)}%` }}
				/>
				<div
					className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-(--ms-surface) bg-(--ms-ink)"
					style={{ left: `${pos(p)}%` }}
				/>
				<div
					className="absolute -top-1 -bottom-1 w-px bg-(--ms-ink)"
					style={{ left: `${pos(0.05)}%` }}
				/>
			</div>
			<div className="relative mt-1.5 h-4 text-[10px] text-(--ms-muted)">
				<span className="absolute left-0">0,001</span>
				<span
					className="absolute -translate-x-1/2"
					style={{ left: `${pos(0.05)}%` }}
				>
					0,05
				</span>
				<span className="absolute right-0">1</span>
			</div>
		</div>
	);
}

/* ------------------------------------------------------------------ */

function Footer() {
	return (
		<footer className="mt-10 border-t border-(--ms-line) bg-(--ms-surface)">
			<div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-8 px-4 py-10 text-sm text-(--ms-muted) sm:px-6 md:grid-cols-2">
				<div className="flex gap-3">
					<Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
					<div>
						<p className="font-semibold text-(--ms-ink)">Fonte dos dados</p>
						<p className="mt-1 leading-relaxed">
							{meta.source}. Concursos {meta.firstDraw.concurso} a{" "}
							{fmtInt(meta.lastDraw.concurso)}, atualizado em{" "}
							{meta.generatedAt.split("-").reverse().join("/")}. Análise
							independente, sem vínculo com a Caixa.
						</p>
					</div>
				</div>
				<div className="flex gap-3">
					<ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
					<div>
						<p className="font-semibold text-(--ms-ink)">
							Jogue com responsabilidade
						</p>
						<p className="mt-1 leading-relaxed">
							Loteria é entretenimento, não investimento. Aposte só o que pode
							perder. Proibido para menores de 18 anos. Se o jogo estiver
							causando problemas, procure ajuda — o CVV atende 24h pelo 188.
						</p>
					</div>
				</div>
			</div>
		</footer>
	);
}

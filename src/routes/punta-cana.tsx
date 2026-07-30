import { createFileRoute } from "@tanstack/react-router";
import { Heart, Plane, Sun, Waves } from "lucide-react";
import { useEffect, useId, useState } from "react";

/**
 * Paleta (pôr do sol no Caribe + acentos de rosa):
 *   #06283D  noite      — topo do céu
 *   #123E58  crepúsculo
 *   #A8415A  rosa fundo — acentos sobre papel (5.35:1 em #FDF3E3)
 *   #F5B9C4  rosa claro — acentos sobre o céu (9.1:1 em #06283D)
 *   #E8825A  coral      — banda do horizonte
 *   #FFC46B  sol
 *   #FDF3E3  papel      — carta / convite
 *   #2FB3AE  mar        — oceano / ondas
 */

/** 9 de setembro de 2026, 11:00 — horário local do navegador. */
const TARGET = new Date(2026, 8, 9, 11, 0, 0);

type Remaining = {
	days: number;
	hours: number;
	minutes: number;
	seconds: number;
	done: boolean;
};

function getRemaining(): Remaining {
	const diff = TARGET.getTime() - Date.now();

	if (diff <= 0) {
		return { days: 0, hours: 0, minutes: 0, seconds: 0, done: true };
	}

	const total = Math.floor(diff / 1000);

	return {
		days: Math.floor(total / 86400),
		hours: Math.floor((total % 86400) / 3600),
		minutes: Math.floor((total % 3600) / 60),
		seconds: total % 60,
		done: false,
	};
}

function pad(value: number): string {
	return String(value).padStart(2, "0");
}

export const Route = createFileRoute("/punta-cana")({
	head: () => ({
		meta: [
			{
				title: "Punta Cana 2026 — Wellington Gabriel de Mattia",
			},
			{
				name: "description",
				content:
					"Contagem regressiva para 9 de setembro de 2026: a primeira viagem juntos, destino Punta Cana.",
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
				href: "https://fonts.googleapis.com/css2?family=Caveat:wght@500;600&family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Mulish:wght@400;500;600&display=swap",
			},
		],
	}),
	component: PuntaCana,
});

/** Serifado clássico e caloroso — títulos, dígitos (tem tabular figures) e dados. */
const DISPLAY = "font-[EB_Garamond,ui-serif,Georgia,serif]";
/** Manuscrita — só para os toques pessoais (nota, assinatura, selo). */
const SCRIPT = "font-[Caveat,ui-serif,cursive]";
/** Rótulos: sans humanista, sem cara de etiqueta técnica. */
const LABEL = "text-[10px] font-semibold uppercase tracking-[0.2em]";

const HIGHLIGHTS = [
	{ icon: Waves, label: "O primeiro mar da gente" },
	{ icon: Sun, label: "Sol de setembro, sem pressa" },
	{ icon: Heart, label: "Só nós dois" },
];

/** Coraçõezinhos flutuando no céu — decorativos, bem discretos. */
const SKY_HEARTS = [
	{ className: "top-[9%] left-[6%] size-4", duration: "7s", delay: "0s" },
	{ className: "top-[24%] right-[9%] size-6", duration: "9s", delay: "1.5s" },
	{ className: "top-[46%] left-[13%] size-3", duration: "8s", delay: "3s" },
	{ className: "top-[62%] right-[7%] size-5", duration: "10s", delay: "2s" },
];

function PuntaCana() {
	const inviteTitleId = useId();
	// `null` até hidratar: o servidor não sabe o fuso do navegador.
	const [remaining, setRemaining] = useState<Remaining | null>(null);

	useEffect(() => {
		setRemaining(getRemaining());

		const id = setInterval(() => {
			setRemaining(getRemaining());
		}, 1000);

		return () => clearInterval(id);
	}, []);

	const units = [
		{ label: "dias", value: remaining?.days },
		{ label: "horas", value: remaining?.hours },
		{ label: "min", value: remaining?.minutes },
		{ label: "seg", value: remaining?.seconds },
	];

	return (
		<div className="relative isolate flex min-h-screen flex-col overflow-hidden bg-[#06283D] font-[Mulish,ui-sans-serif,system-ui,sans-serif] text-[#FBEEDD]">
			{/* Céu: noite no topo descendo para a água. O calor do pôr do sol
			    fica concentrado na faixa do horizonte, para o texto manter contraste. */}
			<div
				aria-hidden="true"
				className="absolute inset-0 -z-20 bg-[linear-gradient(180deg,#06283D_0%,#123E58_45%,#1C5872_100%)]"
			/>
			{/* Brilho rosado, só o suficiente para aquecer o topo. */}
			<div
				aria-hidden="true"
				className="absolute -top-40 -right-24 -z-20 size-128 rounded-full bg-[radial-gradient(circle,rgba(232,130,140,0.22)_0%,rgba(232,130,140,0)_70%)] blur-2xl"
			/>
			<div aria-hidden="true" className="absolute inset-0 -z-10">
				{SKY_HEARTS.map((heart) => (
					<Heart
						key={heart.className}
						className={`absolute animate-pulse text-[#F0A6B8]/40 motion-reduce:animate-none ${heart.className}`}
						style={{
							animationDuration: heart.duration,
							animationDelay: heart.delay,
						}}
						fill="currentColor"
					/>
				))}
			</div>

			<main className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 pt-14 pb-10 sm:px-6 sm:pt-20">
				<header className="animate-in fade-in slide-in-from-bottom-4 duration-700 motion-reduce:animate-none">
					<p className={`flex items-center gap-2 text-[#F5B9C4] ${LABEL}`}>
						<Heart
							className="size-3.5 shrink-0"
							fill="currentColor"
							aria-hidden="true"
						/>
						Nossa primeira viagem
					</p>
					<h1
						className={`mt-4 text-6xl leading-[0.9] tracking-tight text-[#FFF4E4] sm:text-8xl md:text-9xl ${DISPLAY}`}
					>
						Punta Cana
					</h1>
					<p className={`mt-3 text-2xl text-[#F5B9C4] sm:text-3xl ${SCRIPT}`}>
						nove de setembro, onze da manhã
					</p>
					<p className="mt-5 max-w-md text-base leading-relaxed text-[#FBEEDD]/85 sm:text-lg">
						República Dominicana. Duas malas, um voo e o primeiro mar que a
						gente vai ver junto.
					</p>
				</header>

				{/* Convite — mais carta do que documento. O contador vive dentro dele. */}
				<section
					aria-labelledby={inviteTitleId}
					className="mt-10 overflow-hidden rounded-4xl bg-[#FDF3E3] text-[#06283D] shadow-[0_30px_70px_-25px_rgba(3,20,32,0.7)] ring-1 ring-[#A8415A]/15 animate-in fade-in slide-in-from-bottom-6 duration-700 delay-150 motion-reduce:animate-none sm:mt-12"
				>
					<div
						aria-hidden="true"
						className="h-1.5 bg-[linear-gradient(90deg,#E8A0AE_0%,#E8825A_45%,#FFC46B_100%)]"
					/>
					<div className="flex flex-col md:flex-row">
						<div className="flex-1 p-6 sm:p-8">
							<div className="mt-2 flex items-center gap-3 sm:gap-4">
								<span
									className={`text-2xl leading-none tracking-tight sm:text-4xl ${DISPLAY}`}
								>
									Casa
								</span>
								<span
									aria-hidden="true"
									className="flex flex-1 items-center gap-2"
								>
									<span className="hidden h-px flex-1 bg-[#A8415A]/30 sm:block" />
									<Plane className="size-4 shrink-0 text-[#A8415A]" />
									<Heart
										className="size-3 shrink-0 text-[#A8415A]/60"
										fill="currentColor"
									/>
									<span className="h-px flex-1 bg-[#A8415A]/30" />
								</span>
								<span
									className={`text-2xl leading-none tracking-tight whitespace-nowrap sm:text-4xl ${DISPLAY}`}
								>
									Punta Cana
								</span>
							</div>

							<dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3">
								<div>
									<dt className={`${LABEL} text-[#6B4A3C]`}>Quem vai</dt>
									<dd className={`mt-1 text-xl ${DISPLAY}`}>nós dois</dd>
								</div>
								<div>
									<dt className={`${LABEL} text-[#6B4A3C]`}>Data</dt>
									<dd className={`mt-1 text-xl ${DISPLAY}`}>9 de setembro</dd>
								</div>
								<div>
									<dt className={`${LABEL} text-[#6B4A3C]`}>Embarque</dt>
									<dd className={`mt-1 text-xl tabular-nums ${DISPLAY}`}>
										11:00
									</dd>
								</div>
							</dl>

							<div className="mt-7 border-t border-[#A8415A]/20 pt-6">
								{remaining?.done ? (
									<div>
										<p className={`${LABEL} text-[#A8415A]`}>Chegou o dia</p>
										<p
											className={`mt-2 text-4xl tracking-tight sm:text-5xl ${DISPLAY}`}
										>
											Hora de embarcar.
										</p>
									</div>
								) : (
									<div>
										<p className={`text-2xl text-[#A8415A] ${SCRIPT}`}>
											falta só...
										</p>
										<p className="sr-only">
											A contagem termina em 9 de setembro de 2026, às 11:00.
										</p>
										<div
											aria-hidden="true"
											className="mt-3 grid grid-cols-4 gap-2 sm:gap-3"
										>
											{units.map((unit) => (
												<div
													key={unit.label}
													className="rounded-2xl bg-[#FCE7E2] px-1 py-3 text-center text-[#4A1B2A] ring-1 ring-[#A8415A]/10 sm:py-4"
												>
													{/* Sem remontagem por tick: o fade reiniciando a cada
													    segundo piscava o dígito dos segundos. */}
													<span
														className={`block text-3xl leading-none tabular-nums sm:text-5xl ${DISPLAY}`}
													>
														{unit.value === undefined ? "--" : pad(unit.value)}
													</span>
													<span
														className={`mt-2 block ${LABEL} text-[#4A1B2A]/70`}
													>
														{unit.label}
													</span>
												</div>
											))}
										</div>
									</div>
								)}
							</div>

							{/* Bilhete escrito à mão — o toque pessoal da carta. */}
							<div className="mt-7 border-t border-dashed border-[#A8415A]/25 pt-5">
								<p
									className={`text-2xl leading-snug text-[#123E58] sm:text-3xl ${SCRIPT}`}
								>
									que esse seja o primeiro de muitos aviões que a gente pega
									junto — e o primeiro de muitos mares.
								</p>
								<p className={`mt-2 text-xl text-[#A8415A] ${SCRIPT}`}>
									— eu e você, sempre
								</p>
							</div>
						</div>

						{/* Selo de carta, no lugar do canhoto de cartão de embarque. */}
						<div className="relative flex items-center justify-center gap-5 border-t border-dashed border-[#A8415A]/30 bg-[#F9E7DC] p-6 md:w-52 md:flex-col md:border-t-0 md:border-l md:border-dashed">
							<div className="flex size-20 shrink-0 items-center justify-center rounded-full bg-[#A8415A] text-[#FDF3E3] shadow-[inset_0_0_0_2px_rgba(253,243,227,0.35)] sm:size-24">
								<Heart
									className="size-8 sm:size-9"
									fill="currentColor"
									aria-hidden="true"
								/>
							</div>
							<div className="text-center">
								<span
									className={`block text-4xl leading-none tabular-nums text-[#06283D] ${DISPLAY}`}
								>
									09.09
								</span>
								<span
									className={`mt-1 block text-2xl text-[#A8415A] ${SCRIPT}`}
								>
									nós dois
								</span>
							</div>
						</div>
					</div>
				</section>

				<ul className="mt-8 grid gap-3 sm:grid-cols-3">
					{HIGHLIGHTS.map(({ icon: Icon, label }) => (
						<li
							key={label}
							className="flex items-center gap-3 rounded-full border border-[#F5B9C4]/25 bg-[#06283D]/30 px-4 py-3 backdrop-blur-sm"
						>
							<Icon
								className="size-4 shrink-0 text-[#F5B9C4]"
								aria-hidden="true"
							/>
							<span className="text-sm text-[#FBEEDD]/90">{label}</span>
						</li>
					))}
				</ul>

				<p className="mt-8 max-w-lg text-base leading-relaxed text-[#FBEEDD]/85 sm:text-lg">
					{remaining?.done
						? "É hoje. O primeiro mar da gente começa agora — e eu só quero ver você olhando pra ele."
						: "Quando esse contador zerar, a gente vai estar de mãos dadas com o pé na areia pela primeira vez. Falta pouco, amor."}
				</p>
			</main>

			{/* Horizonte: o sol se pondo no mar.
			    Sem `overflow-hidden`: o halo do sol precisa sangrar para cima e morrer
			    sozinho no céu. Clipar um elemento com `blur` desenha uma aresta reta
			    exatamente onde o brilho ainda é opaco — era daí que vinha a emenda. */}
			<div
				aria-hidden="true"
				className="pointer-events-none relative h-48 shrink-0 sm:h-64"
			>
				{/* A banda entra transparente na cor do céu (#1C5872) e só depois vira
				    crepúsculo, para não haver salto de matiz no encontro das camadas. */}
				<div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(28,88,114,0)_0%,rgba(80,88,122,0.4)_12%,#5A5C7C_26%,#A65F6E_42%,#DC7259_62%,#FFB56A_84%)]" />
				{/* Halo: centrado no disco do sol, com cauda longa até alpha 0. */}
				<div className="absolute -top-32 left-1/2 size-96 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,224,190,0.55)_0%,rgba(255,196,140,0.26)_26%,rgba(255,169,94,0.09)_48%,rgba(255,150,90,0)_72%)] blur-2xl sm:-top-46 sm:size-128" />
				<div className="absolute top-4 left-1/2 size-24 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,#FFF3D8_0%,#FFD08A_48%,#F79A78_100%)] sm:top-2 sm:size-32" />
				<svg
					className="absolute inset-0 size-full"
					viewBox="0 0 1440 200"
					preserveAspectRatio="none"
					role="presentation"
				>
					<path
						d="M0,96 C180,56 420,136 720,96 C1020,56 1260,136 1440,96 L1440,200 L0,200 Z"
						fill="#2FB3AE"
					/>
					<path
						d="M0,138 C240,102 480,172 720,138 C960,102 1200,172 1440,138 L1440,200 L0,200 Z"
						fill="#0E5C6B"
					/>
				</svg>
			</div>
		</div>
	);
}

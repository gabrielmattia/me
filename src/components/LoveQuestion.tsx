import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Vec2 = { x: number; y: number };

export default function LoveQuestion() {
	const containerRef = useRef<HTMLElement | null>(null);
	const noBtnRef = useRef<HTMLButtonElement | null>(null);

	const [saidYes, setSaidYes] = useState(false);
	const [noPos, setNoPos] = useState<Vec2>({ x: 0, y: 0 });
	const [isReady, setIsReady] = useState(false);

	const padding = 16;

	const question = useMemo(() => "Paraguai amanhã?", []);

	// Centraliza o botão "NÃO" na primeira renderização (depois que medir)
	useEffect(() => {
		const placeInitial = () => {
			const container = containerRef.current;
			const noBtn = noBtnRef.current;
			if (!container || !noBtn) return;

			const c = container.getBoundingClientRect();
			const b = noBtn.getBoundingClientRect();

			// coloca o NÃO perto do SIM, mas com posição absoluta dentro do container
			const x = Math.max(
				padding,
				Math.min(c.width - b.width - padding, c.width * 0.55),
			);
			const y = Math.max(
				padding,
				Math.min(c.height - b.height - padding, c.height * 0.62),
			);

			setNoPos({ x, y });
			setIsReady(true);
		};

		placeInitial();
		window.addEventListener("resize", placeInitial);
		return () => window.removeEventListener("resize", placeInitial);
	}, []);

	const randomPosInside = () => {
		const container = containerRef.current;
		const noBtn = noBtnRef.current;
		if (!container || !noBtn) return;

		const c = container.getBoundingClientRect();
		const b = noBtn.getBoundingClientRect();

		const maxX = Math.max(padding, c.width - b.width - padding);
		const maxY = Math.max(padding, c.height - b.height - padding);

		// tenta evitar ficar muito perto do canto (fica mais “natural”)
		const x = Math.floor(padding + Math.random() * (maxX - padding));
		const y = Math.floor(padding + Math.random() * (maxY - padding));

		setNoPos({ x, y });
	};

	const runAwayIfClose = (clientX: number, clientY: number) => {
		const container = containerRef.current;
		const noBtn = noBtnRef.current;
		if (!container || !noBtn) return;

		const c = container.getBoundingClientRect();

		// posição do botão atual (absoluta dentro do container)
		const btnLeft = c.left + noPos.x;
		const btnTop = c.top + noPos.y;

		const b = noBtn.getBoundingClientRect();
		const btnCenterX = btnLeft + b.width / 2;
		const btnCenterY = btnTop + b.height / 2;

		// distância do cursor ao centro do botão
		const dx = clientX - btnCenterX;
		const dy = clientY - btnCenterY;
		const dist = Math.sqrt(dx * dx + dy * dy);

		// quanto menor, mais “arisco”
		if (dist < 120) randomPosInside();
	};

	if (saidYes) {
		return (
			<div className="min-h-screen w-full bg-linear-to-b from-rose-50 to-pink-100 flex items-center justify-center p-4">
				<Card className="w-full max-w-lg rounded-3xl shadow-xl">
					<CardHeader className="text-center">
						<CardTitle className="text-2xl">AAAAA SIM! ❤️</CardTitle>
					</CardHeader>
					<CardContent className="text-center space-y-4">
						<p className="text-base text-muted-foreground">OK</p>

						<Button
							variant="outline"
							className="rounded-2xl"
							onClick={() => setSaidYes(false)}
						>
							Voltar
						</Button>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="min-h-screen w-full bg-linear-to-b from-rose-50 to-pink-100 flex items-center justify-center p-4">
			<section
				ref={containerRef}
				aria-label="Área interativa da pergunta"
				tabIndex={-1}
				onMouseMove={(e) => runAwayIfClose(e.clientX, e.clientY)}
				onTouchStart={(e) => {
					// no mobile, "foge" ao tentar tocar
					const t = e.touches?.[0];
					if (t) runAwayIfClose(t.clientX, t.clientY);
				}}
				className="relative w-full max-w-xl rounded-3xl"
			>
				<Card className="rounded-3xl shadow-xl">
					<CardHeader className="text-center">
						<CardTitle className="text-2xl">{question}</CardTitle>
					</CardHeader>

					<CardContent className="text-center space-y-6 pb-10">
						<div className="flex items-center justify-center gap-3">
							<Button
								className="rounded-2xl"
								size="lg"
								onClick={() => setSaidYes(true)}
							>
								SIM
							</Button>

							{/* Espaço visual onde o "NÃO" normalmente ficaria */}
							<div className="h-11 w-28" />
						</div>
					</CardContent>
				</Card>

				{/* Botão "NÃO" fugindo (posição absoluta dentro do container) */}
				<Button
					ref={noBtnRef}
					variant="secondary"
					size="lg"
					className={[
						"absolute rounded-2xl select-none",
						"transition-[left,top] duration-150 ease-out",
						// evita clique acidental no mobile quando tá “fugindo”
						"active:scale-100",
					].join(" ")}
					style={{
						left: isReady ? noPos.x : 0,
						top: isReady ? noPos.y : 0,
					}}
					onMouseEnter={() => randomPosInside()}
					onFocus={() => randomPosInside()}
					onClick={() => randomPosInside()} // se conseguir clicar, ainda assim foge kkk
				>
					NÃO 😅
				</Button>
			</section>
		</div>
	);
}

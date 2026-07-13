import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Download, Flame } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

type OS = "windows" | "mac" | "linux";

const DOWNLOADS: Record<OS, { label: string; url: string }> = {
	mac: {
		label: "macOS (.dmg)",
		url: "https://emberwake.wgmattia.com/downloads/Emberwake.dmg",
	},
	windows: {
		label: "Windows (.zip)",
		url: "https://emberwake.wgmattia.com/downloads/Emberwake-windows.zip",
	},
	linux: {
		label: "Linux (.zip)",
		url: "https://emberwake.wgmattia.com/downloads/Emberwake-linux.zip",
	},
};

function detectOS(): OS {
	const platform = `${navigator.userAgent} ${navigator.platform}`.toLowerCase();
	if (platform.includes("win")) return "windows";
	if (platform.includes("linux")) return "linux";
	return "mac";
}

export const Route = createFileRoute("/emberwake")({
	head: () => ({
		meta: [
			{
				title: "Emberwake — Wellington Gabriel de Mattia",
			},
		],
	}),
	component: Emberwake,
});

function Emberwake() {
	const [os, setOs] = useState<OS | null>(null);

	useEffect(() => {
		setOs(detectOS());
	}, []);

	const detected = os ?? "mac";

	return (
		<div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-16">
			<header className="flex flex-col gap-4">
				<div className="flex items-center gap-2 text-orange-500">
					<Flame className="size-6" />
					<span className="text-sm font-medium uppercase tracking-widest">
						Em desenvolvimento
					</span>
				</div>
				<h1 className="text-5xl font-bold tracking-tight">Emberwake</h1>
				<p className="text-lg text-muted-foreground">
					MMO Action RPG — itemização estilo{" "}
					<span className="font-medium text-foreground">Path of Exile</span>,
					combate em tempo real estilo{" "}
					<span className="font-medium text-foreground">
						Dota 2 / Albion Online
					</span>
					, mundo aberto estilo{" "}
					<span className="font-medium text-foreground">Diablo 4</span>, com
					direção de arte estilizada e low-poly no espírito de{" "}
					<span className="font-medium text-foreground">
						Risk of Rain 2
					</span>{" "}
					e <span className="font-medium text-foreground">V Rising</span>.
				</p>
			</header>

			<Card>
				<CardHeader>
					<CardTitle className="text-2xl">Baixar</CardTitle>
					<CardDescription>
						Faça o download da build de teste mais recente do Emberwake.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					<Button asChild size="lg">
						<a href={DOWNLOADS[detected].url}>
							<Download />
							Baixar para {DOWNLOADS[detected].label}
						</a>
					</Button>
					<div className="flex flex-wrap gap-3 text-sm">
						<span className="text-muted-foreground">Não é o seu SO?</span>
						{(Object.keys(DOWNLOADS) as OS[])
							.filter((key) => key !== detected)
							.map((key) => (
								<a
									key={key}
									href={DOWNLOADS[key].url}
									className="font-medium text-foreground underline underline-offset-4 hover:text-orange-500"
								>
									{DOWNLOADS[key].label}
								</a>
							))}
					</div>
				</CardContent>
			</Card>

			<Card className="border-yellow-500/50 bg-yellow-500/10">
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
						<AlertTriangle className="size-5" />
						Aviso
					</CardTitle>
					<CardDescription className="text-yellow-700 dark:text-yellow-300">
						Esta é uma build de teste/protótipo em desenvolvimento ativo. Ela
						não representa a versão final do jogo: espere bugs, instabilidade
						e mudanças significativas antes do lançamento.
						<br />
						<br />
						<strong>macOS:</strong> o app não é assinado/notarizado, então o
						Gatekeeper vai bloquear a primeira abertura. Clique com o botão
						direito no app → <em>Abrir</em> → confirme "Abrir mesmo assim".
						<br />
						<strong>Windows:</strong> o SmartScreen pode avisar que é um app
						desconhecido — clique em "Mais informações" → "Executar assim
						mesmo".
					</CardDescription>
				</CardHeader>
			</Card>
		</div>
	);
}

import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Download, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

// TODO: substituir pelo link real do build de teste
const DOWNLOAD_URL = "#";

export const Route = createFileRoute("/emberwake")({ component: Emberwake });

function Emberwake() {
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
				<CardContent>
					<Button asChild size="lg">
						<a href={DOWNLOAD_URL}>
							<Download />
							Baixar build de teste
						</a>
					</Button>
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
					</CardDescription>
				</CardHeader>
			</Card>
		</div>
	);
}

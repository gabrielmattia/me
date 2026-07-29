import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/poe-pobbin-trade/privacy")({
	head: () => ({
		meta: [
			{
				title:
					"Política de Privacidade — PoB (pobb.in) → PoE Trade | Wellington Gabriel de Mattia",
			},
			{
				name: "description",
				content:
					"Política de privacidade da extensão de navegador PoB (pobb.in) → PoE Trade: nenhum dado pessoal é coletado, armazenado ou transmitido.",
			},
		],
	}),
	component: PoePobbinTradePrivacy,
});

function PoePobbinTradePrivacy() {
	return (
		<div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-10 px-6 py-16">
			<header className="flex flex-col gap-4">
				<div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
					<ShieldCheck className="size-6" />
					<span className="text-sm font-medium uppercase tracking-widest">
						Privacidade
					</span>
				</div>
				<h1 className="text-4xl font-bold tracking-tight">
					Política de Privacidade — PoB (pobb.in) → PoE Trade
				</h1>
				<p className="text-sm text-muted-foreground">
					<strong className="font-medium text-foreground">
						Última atualização:
					</strong>{" "}
					29 de julho de 2026
				</p>
			</header>

			<Card className="border-emerald-500/50 bg-emerald-500/10">
				<CardContent>
					<p className="text-emerald-800 dark:text-emerald-200">
						<strong className="font-semibold">Resumo:</strong> esta extensão{" "}
						<strong className="font-semibold">
							não coleta, armazena, transmite nem compartilha nenhum dado
							pessoal do usuário
						</strong>
						. Todo o processamento acontece localmente, no navegador do próprio
						usuário, e as únicas comunicações de rede são chamadas diretas às
						APIs públicas e oficiais do Path of Exile (
						<code className="rounded bg-emerald-500/20 px-1 py-0.5 font-mono text-sm">
							pathofexile.com
						</code>
						).
					</p>
				</CardContent>
			</Card>

			<section className="flex flex-col gap-4">
				<h2 className="text-2xl font-bold tracking-tight">
					O que a extensão faz
				</h2>
				<p className="text-muted-foreground">
					A extensão "PoB (pobb.in) → PoE Trade" adiciona um botão nos itens de
					build exibidos em páginas do site{" "}
					<a
						href="https://pobb.in"
						target="_blank"
						rel="noreferrer"
						className="font-medium text-foreground underline underline-offset-4 hover:text-emerald-600 dark:hover:text-emerald-400"
					>
						pobb.in
					</a>
					. Ao ser clicado, esse botão:
				</p>
				<ol className="flex list-decimal flex-col gap-3 pl-6 text-muted-foreground marker:text-foreground">
					<li>
						Lê,{" "}
						<strong className="font-medium text-foreground">
							localmente no navegador do usuário
						</strong>
						, o conteúdo que já está presente na própria página do pobb.in —
						especificamente, decodifica o código de build do Path of Building
						(formato base64 + zlib) que já vem embutido em um elemento{" "}
						<code className="rounded bg-muted px-1 py-0.5 font-mono text-sm text-foreground">
							&lt;textarea&gt;
						</code>{" "}
						da página. Essa decodificação é usada apenas para extrair os itens
						de equipamento e joias da build e seus respectivos mods.
					</li>
					<li>
						Monta uma consulta de busca e chama as{" "}
						<strong className="font-medium text-foreground">
							APIs públicas e oficiais do Path of Exile
						</strong>
						, em{" "}
						<code className="rounded bg-muted px-1 py-0.5 font-mono text-sm text-foreground">
							pathofexile.com/api/trade/*
						</code>{" "}
						(lista de stats, lista de ligas e o endpoint de busca de trade).
					</li>
					<li>
						Abre o resultado dessa busca em uma{" "}
						<strong className="font-medium text-foreground">nova aba</strong>,
						no domínio oficial{" "}
						<code className="rounded bg-muted px-1 py-0.5 font-mono text-sm text-foreground">
							pathofexile.com/trade/search/...
						</code>
						.
					</li>
				</ol>
				<p className="text-muted-foreground">
					Nenhuma dessas ações envolve um servidor próprio da extensão — não
					existe backend, API própria ou serviço intermediário. As requisições
					saem diretamente do navegador do usuário para os domínios{" "}
					<code className="rounded bg-muted px-1 py-0.5 font-mono text-sm text-foreground">
						pobb.in
					</code>{" "}
					e{" "}
					<code className="rounded bg-muted px-1 py-0.5 font-mono text-sm text-foreground">
						pathofexile.com
					</code>
					.
				</p>
			</section>

			<section className="flex flex-col gap-4">
				<h2 className="text-2xl font-bold tracking-tight">
					Dados armazenados localmente
				</h2>
				<p className="text-muted-foreground">
					A extensão utiliza exclusivamente os mecanismos nativos de
					armazenamento do próprio navegador (
					<code className="rounded bg-muted px-1 py-0.5 font-mono text-sm text-foreground">
						chrome.storage
					</code>
					), sem qualquer envio a servidores externos:
				</p>
				<ul className="flex list-disc flex-col gap-3 pl-6 text-muted-foreground marker:text-foreground">
					<li>
						<code className="rounded bg-muted px-1 py-0.5 font-mono text-sm text-foreground">
							chrome.storage.sync
						</code>{" "}
						— guarda a liga (league) do Path of Exile detectada ou selecionada
						pelo usuário, para reutilizá-la em buscas futuras.
					</li>
					<li>
						<code className="rounded bg-muted px-1 py-0.5 font-mono text-sm text-foreground">
							chrome.storage.local
						</code>{" "}
						— usado como cache, com expiração (tipicamente entre 6 e 24 horas),
						da lista pública de stats e da lista de ligas obtidas da API oficial
						de trade. Isso evita requisições repetidas às mesmas APIs.
					</li>
				</ul>
				<p className="text-muted-foreground">
					Esses dados permanecem apenas no navegador do próprio usuário, sob
					controle do{" "}
					<code className="rounded bg-muted px-1 py-0.5 font-mono text-sm text-foreground">
						chrome.storage
					</code>{" "}
					do Chrome, e nunca são enviados a nenhum servidor da extensão — porque
					nenhum servidor da extensão existe.
				</p>
			</section>

			<section className="flex flex-col gap-4">
				<h2 className="text-2xl font-bold tracking-tight">
					O que NÃO é coletado
				</h2>
				<p className="text-muted-foreground">
					A extensão{" "}
					<strong className="font-medium text-foreground">
						não coleta, não registra e não transmite
					</strong>
					:
				</p>
				<ul className="flex list-disc flex-col gap-2 pl-6 text-muted-foreground marker:text-foreground">
					<li>Dados de identificação pessoal (nome, e-mail, endereço, etc.);</li>
					<li>Senhas, tokens ou qualquer credencial de autenticação;</li>
					<li>Cookies ou dados de sessão do usuário;</li>
					<li>Histórico de navegação;</li>
					<li>Localização geográfica;</li>
					<li>Atividade do usuário (cliques, digitação, telemetria de uso);</li>
					<li>
						Conteúdo de qualquer site que não seja{" "}
						<code className="rounded bg-muted px-1 py-0.5 font-mono text-sm text-foreground">
							pobb.in
						</code>{" "}
						ou{" "}
						<code className="rounded bg-muted px-1 py-0.5 font-mono text-sm text-foreground">
							pathofexile.com
						</code>
						.
					</li>
				</ul>
				<p className="text-muted-foreground">
					Não há analytics, rastreamento ou telemetria de nenhum tipo embutidos
					na extensão.
				</p>
			</section>

			<section className="flex flex-col gap-4">
				<h2 className="text-2xl font-bold tracking-tight">
					Compartilhamento de dados
				</h2>
				<p className="text-muted-foreground">
					Não há compartilhamento, venda ou aluguel de dados a terceiros —
					simplesmente porque não existe dado do usuário saindo do navegador
					dele além das chamadas descritas acima, feitas diretamente às APIs
					oficiais e públicas do próprio Path of Exile.
				</p>
				<p className="text-muted-foreground">
					Um detalhe técnico importante: as chamadas às APIs de trade da{" "}
					<code className="rounded bg-muted px-1 py-0.5 font-mono text-sm text-foreground">
						pathofexile.com
					</code>{" "}
					são feitas com a opção{" "}
					<code className="rounded bg-muted px-1 py-0.5 font-mono text-sm text-foreground">
						credentials: include
					</code>
					. Isso significa apenas que a extensão{" "}
					<strong className="font-medium text-foreground">
						aproveita a sessão já autenticada do usuário no site oficial do jogo
					</strong>
					, exatamente como qualquer aba comum do navegador já autenticada faria
					ao acessar{" "}
					<code className="rounded bg-muted px-1 py-0.5 font-mono text-sm text-foreground">
						pathofexile.com
					</code>
					. Isso{" "}
					<strong className="font-medium text-foreground">
						não é coleta de credenciais
					</strong>
					: a extensão em nenhum momento lê, armazena ou transmite senha, cookie
					ou qualquer credencial — ela apenas se beneficia de uma sessão de
					navegador que já existe, sem ter acesso ao seu conteúdo.
				</p>
			</section>

			<section className="flex flex-col gap-4">
				<h2 className="text-2xl font-bold tracking-tight">
					Permissões de host
				</h2>
				<p className="text-muted-foreground">
					A extensão declara{" "}
					<code className="rounded bg-muted px-1 py-0.5 font-mono text-sm text-foreground">
						host_permissions
					</code>{" "}
					para dois domínios, estritamente necessários ao seu funcionamento:
				</p>
				<ul className="flex list-disc flex-col gap-3 pl-6 text-muted-foreground marker:text-foreground">
					<li>
						<code className="rounded bg-muted px-1 py-0.5 font-mono text-sm text-foreground">
							pobb.in
						</code>{" "}
						— necessário para que o content script da extensão possa ler o
						código de build (PoB) já presente na página que o próprio usuário
						está visitando, e inserir o botão de busca na interface.
					</li>
					<li>
						<code className="rounded bg-muted px-1 py-0.5 font-mono text-sm text-foreground">
							pathofexile.com
						</code>{" "}
						— necessário para chamar as APIs públicas e oficiais de trade do
						jogo (stats, ligas e busca) e para abrir a aba com o resultado da
						busca no site oficial.
					</li>
				</ul>
				<p className="text-muted-foreground">
					Nenhuma outra permissão de host é utilizada, e nenhum desses acessos é
					usado para finalidade diferente da descrita nas seções acima.
				</p>
			</section>

			<section className="flex flex-col gap-4">
				<h2 className="text-2xl font-bold tracking-tight">Código aberto</h2>
				<p className="text-muted-foreground">
					O código-fonte completo desta extensão é público e pode ser auditado
					por qualquer pessoa em:
				</p>
				<p>
					<a
						href="https://github.com/gabrielmattia/pobin-trade-extension"
						target="_blank"
						rel="noreferrer"
						className="font-semibold text-foreground underline underline-offset-4 hover:text-emerald-600 dark:hover:text-emerald-400"
					>
						https://github.com/gabrielmattia/pobin-trade-extension
					</a>
				</p>
			</section>

			<section className="flex flex-col gap-4">
				<h2 className="text-2xl font-bold tracking-tight">Contato</h2>
				<p className="text-muted-foreground">
					Dúvidas, sugestões ou solicitações relacionadas a esta política de
					privacidade podem ser feitas abrindo uma issue no repositório do
					GitHub acima.
				</p>
			</section>
		</div>
	);
}

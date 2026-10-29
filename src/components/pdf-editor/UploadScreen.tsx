import {
	ArrowLeft,
	Files,
	FileText,
	PenLine,
	ShieldCheck,
	Signature,
	TextCursorInput,
	Upload,
} from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./ThemeToggle";

const FEATURES = [
	{ icon: TextCursorInput, label: "Editar texto existente" },
	{ icon: PenLine, label: "Anotar, desenhar e destacar" },
	{ icon: Signature, label: "Assinar documentos" },
	{ icon: Files, label: "Organizar e mesclar páginas" },
];

export function UploadScreen({
	onFile,
	isLoading,
	error,
	theme,
	onToggleTheme,
}: {
	onFile: (f: File) => void;
	isLoading: boolean;
	error: string | null;
	theme: "light" | "dark";
	onToggleTheme: () => void;
}) {
	const [isDragging, setIsDragging] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	return (
		<div className="flex min-h-dvh flex-col bg-background text-foreground">
			<header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
				<a
					href="/"
					className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
				>
					<ArrowLeft className="size-4" /> Portfólio
				</a>
				<ThemeToggle theme={theme} onToggle={onToggleTheme} />
			</header>

			<main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-8 px-4 pb-16 sm:px-6">
				<div className="space-y-3 text-center">
					<div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-600/25">
						<FileText className="size-6" />
					</div>
					<h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
						Editor de PDF
					</h1>
					<p className="text-muted-foreground">
						Edite textos, adicione imagens, assine e organize páginas — direto
						no navegador.
					</p>
				</div>

				<button
					type="button"
					disabled={isLoading}
					onClick={() => inputRef.current?.click()}
					onDragOver={(e) => {
						e.preventDefault();
						setIsDragging(true);
					}}
					onDragLeave={() => setIsDragging(false)}
					onDrop={(e) => {
						e.preventDefault();
						setIsDragging(false);
						const f = e.dataTransfer.files[0];
						if (f) onFile(f);
					}}
					className={cn(
						"flex w-full flex-col items-center gap-4 rounded-2xl border-2 border-dashed px-6 py-14 transition-all outline-none focus-visible:ring-4 focus-visible:ring-blue-600/30",
						isDragging
							? "scale-[1.01] border-blue-600 bg-blue-600/5"
							: "border-border hover:border-blue-600/50 hover:bg-muted/50",
					)}
				>
					{isLoading ? (
						<>
							<div className="size-12 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
							<p className="font-medium">Carregando PDF…</p>
						</>
					) : (
						<>
							<span className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-base font-semibold text-white shadow-md shadow-blue-600/20">
								<Upload className="size-5" /> Selecionar PDF
							</span>
							<span className="text-sm text-muted-foreground">
								{isDragging
									? "Solte o arquivo aqui"
									: "ou arraste e solte o arquivo aqui"}
							</span>
						</>
					)}
				</button>
				<input
					ref={inputRef}
					type="file"
					accept=".pdf,application/pdf"
					className="hidden"
					onChange={(e) => {
						const f = e.target.files?.[0];
						if (f) onFile(f);
						e.target.value = "";
					}}
				/>

				{error && (
					<p
						role="alert"
						className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive-foreground"
					>
						{error}
					</p>
				)}

				<ul className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
					{FEATURES.map(({ icon: Icon, label }) => (
						<li
							key={label}
							className="flex flex-col items-center gap-2 rounded-xl border bg-card px-3 py-4 text-center text-xs text-muted-foreground"
						>
							<Icon className="size-5 text-blue-600 dark:text-blue-400" />
							{label}
						</li>
					))}
				</ul>

				<p className="flex items-center gap-2 text-xs text-muted-foreground">
					<ShieldCheck className="size-4 text-emerald-600" />
					100% local: o arquivo nunca sai do seu navegador.
				</p>
			</main>
		</div>
	);
}

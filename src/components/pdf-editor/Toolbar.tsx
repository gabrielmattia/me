import {
	Download,
	FileText,
	ImagePlus,
	LoaderCircle,
	PanelLeft,
	Redo2,
	Signature,
	SlidersHorizontal,
	Undo2,
	X,
} from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TOOLS } from "./constants";
import { ThemeToggle } from "./ThemeToggle";
import type { Tool } from "./types";

function ToolButton({
	active,
	label,
	shortcut,
	onClick,
	children,
}: {
	active?: boolean;
	label: string;
	shortcut?: string;
	onClick: () => void;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={active}
			title={shortcut ? `${label} (${shortcut.toUpperCase()})` : label}
			className={cn(
				"flex h-12 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg px-2 text-[11px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
				active
					? "bg-blue-600 text-white shadow-sm shadow-blue-600/30"
					: "text-muted-foreground hover:bg-accent hover:text-foreground",
			)}
		>
			{children}
			<span className="whitespace-nowrap leading-none">{label}</span>
		</button>
	);
}

const Divider = () => <div className="mx-1 h-8 w-px shrink-0 bg-border" />;

export function Toolbar({
	fileName,
	tool,
	onToolChange,
	onInsertImage,
	onSignature,
	canUndo,
	canRedo,
	onUndo,
	onRedo,
	onDownload,
	isExporting,
	onClose,
	theme,
	onToggleTheme,
	onTogglePages,
	onToggleProps,
}: {
	fileName: string;
	tool: Tool;
	onToolChange: (t: Tool) => void;
	onInsertImage: () => void;
	onSignature: () => void;
	canUndo: boolean;
	canRedo: boolean;
	onUndo: () => void;
	onRedo: () => void;
	onDownload: () => void;
	isExporting: boolean;
	onClose: () => void;
	theme: "light" | "dark";
	onToggleTheme: () => void;
	onTogglePages: () => void;
	onToggleProps: () => void;
}) {
	const groups = ["edit", "annotate", "shape"] as const;
	return (
		<header className="flex h-16 shrink-0 items-center gap-2 border-b bg-background px-2 sm:px-3">
			<div className="flex min-w-0 shrink-0 items-center gap-1.5">
				<Button
					type="button"
					size="icon-sm"
					variant="ghost"
					className="md:hidden"
					aria-label="Páginas"
					onClick={onTogglePages}
				>
					<PanelLeft />
				</Button>
				<div className="hidden size-8 items-center justify-center rounded-lg bg-blue-600 text-white sm:flex">
					<FileText className="size-4" />
				</div>
				<div className="hidden min-w-0 max-w-40 flex-col lg:flex xl:max-w-56">
					<span className="text-[11px] leading-none text-muted-foreground">
						Editor de PDF
					</span>
					<span className="truncate text-sm font-medium" title={fileName}>
						{fileName}
					</span>
				</div>
			</div>

			<nav
				aria-label="Ferramentas"
				className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] lg:justify-center"
			>
				{groups.map((g, gi) => (
					<div key={g} className="flex items-center gap-0.5">
						{gi > 0 && <Divider />}
						{TOOLS.filter((t) => t.group === g).map((t) => (
							<ToolButton
								key={t.id}
								active={tool === t.id}
								label={t.label}
								shortcut={t.key}
								onClick={() => onToolChange(t.id)}
							>
								<t.icon className="size-[18px]" />
							</ToolButton>
						))}
					</div>
				))}
				<Divider />
				<ToolButton label="Imagem" shortcut="i" onClick={onInsertImage}>
					<ImagePlus className="size-[18px]" />
				</ToolButton>
				<ToolButton label="Assinar" shortcut="s" onClick={onSignature}>
					<Signature className="size-[18px]" />
				</ToolButton>
			</nav>

			<div className="flex shrink-0 items-center gap-0.5">
				<Button
					type="button"
					size="icon-sm"
					variant="ghost"
					disabled={!canUndo}
					onClick={onUndo}
					aria-label="Desfazer"
					title="Desfazer (Ctrl+Z)"
				>
					<Undo2 />
				</Button>
				<Button
					type="button"
					size="icon-sm"
					variant="ghost"
					disabled={!canRedo}
					onClick={onRedo}
					aria-label="Refazer"
					title="Refazer (Ctrl+Shift+Z)"
				>
					<Redo2 />
				</Button>
				<Button
					type="button"
					size="icon-sm"
					variant="ghost"
					className="lg:hidden"
					aria-label="Propriedades"
					onClick={onToggleProps}
				>
					<SlidersHorizontal />
				</Button>
				<span className="hidden sm:inline-flex">
					<ThemeToggle theme={theme} onToggle={onToggleTheme} />
				</span>
				<Button
					type="button"
					onClick={onDownload}
					disabled={isExporting}
					className="ml-1 bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500"
				>
					{isExporting ? (
						<LoaderCircle className="animate-spin" />
					) : (
						<Download />
					)}
					<span className="hidden sm:inline">
						{isExporting ? "Gerando…" : "Baixar PDF"}
					</span>
				</Button>
				<Button
					type="button"
					size="icon-sm"
					variant="ghost"
					onClick={onClose}
					aria-label="Fechar documento"
					title="Fechar documento"
				>
					<X />
				</Button>
			</div>
		</header>
	);
}

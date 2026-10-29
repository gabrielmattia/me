import {
	Copy,
	FilePlus,
	Plus,
	RotateCcw,
	RotateCw,
	Trash2,
} from "lucide-react";
import { type DragEvent, memo, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { displaySize } from "./geometry";
import { getPdfPage } from "./pdf-source";
import type { PageModel } from "./types";

const THUMB_WIDTH = 124;

const Thumbnail = memo(function Thumbnail({ page }: { page: PageModel }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const disp = displaySize(page);
	const scale = THUMB_WIDTH / Math.max(disp.w, disp.h * 0.75);
	const docId = page.source?.docId;
	const srcIndex = page.source?.index;

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas || docId === undefined || srcIndex === undefined) return;
		let cancelled = false;
		let task: { cancel: () => void; promise: Promise<unknown> } | null = null;
		(async () => {
			const pdfPage = await getPdfPage(docId, srcIndex);
			if (!pdfPage || cancelled) return;
			const viewport = pdfPage.getViewport({
				scale: scale * (window.devicePixelRatio || 1),
			});
			canvas.width = Math.ceil(viewport.width);
			canvas.height = Math.ceil(viewport.height);
			const ctx = canvas.getContext("2d");
			if (!ctx) return;
			task = pdfPage.render({ canvas, canvasContext: ctx, viewport });
			await task.promise;
		})().catch(() => {});
		return () => {
			cancelled = true;
			task?.cancel();
		};
	}, [docId, srcIndex, scale]);

	return (
		<div
			className="relative mx-auto"
			style={{ width: disp.w * scale, height: disp.h * scale }}
		>
			<div
				className="absolute bg-white shadow-sm ring-1 ring-black/10"
				style={{
					width: page.width * scale,
					height: page.height * scale,
					left: ((disp.w - page.width) * scale) / 2,
					top: ((disp.h - page.height) * scale) / 2,
					transform: page.rotation ? `rotate(${page.rotation}deg)` : undefined,
					transition: "transform 160ms ease",
				}}
			>
				{page.source && <canvas ref={canvasRef} className="block size-full" />}
			</div>
		</div>
	);
});

function IconAction({
	label,
	onClick,
	children,
	danger,
	disabled,
}: {
	label: string;
	onClick: () => void;
	children: React.ReactNode;
	danger?: boolean;
	disabled?: boolean;
}) {
	return (
		<button
			type="button"
			title={label}
			aria-label={label}
			disabled={disabled}
			onClick={(e) => {
				e.stopPropagation();
				onClick();
			}}
			className={cn(
				"flex size-6 items-center justify-center rounded-md bg-background/95 text-muted-foreground shadow-sm ring-1 ring-border transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
				danger && "hover:bg-destructive hover:text-white",
			)}
		>
			{children}
		</button>
	);
}

export function PagesPanel({
	pages,
	currentPageId,
	objectCount,
	onSelectPage,
	onMove,
	onRotate,
	onDuplicate,
	onDelete,
	onInsertBlank,
	onMergePdf,
}: {
	pages: PageModel[];
	currentPageId: string | null;
	objectCount: Map<string, number>;
	onSelectPage: (id: string) => void;
	onMove: (id: string, to: number) => void;
	onRotate: (id: string, delta: number) => void;
	onDuplicate: (id: string) => void;
	onDelete: (id: string) => void;
	onInsertBlank: (at: number) => void;
	onMergePdf: () => void;
}) {
	const [dragId, setDragId] = useState<string | null>(null);
	const [dropIndex, setDropIndex] = useState<number | null>(null);

	const onDragOver = (e: DragEvent<HTMLDivElement>, index: number) => {
		if (!dragId) return;
		e.preventDefault();
		const rect = e.currentTarget.getBoundingClientRect();
		const after = e.clientY > rect.top + rect.height / 2;
		setDropIndex(index + (after ? 1 : 0));
	};

	const onDrop = (e: DragEvent<HTMLDivElement>) => {
		if (!dragId || dropIndex === null) return;
		e.preventDefault();
		const from = pages.findIndex((p) => p.id === dragId);
		const to = dropIndex > from ? dropIndex - 1 : dropIndex;
		if (to !== from) onMove(dragId, to);
		setDragId(null);
		setDropIndex(null);
	};

	return (
		<div className="flex h-full flex-col">
			<div className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
				<p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					Páginas <span className="tabular-nums">({pages.length})</span>
				</p>
				<div className="flex gap-1">
					<IconAction
						label="Mesclar outro PDF (adicionar ao final)"
						onClick={onMergePdf}
					>
						<FilePlus className="size-3.5" />
					</IconAction>
					<IconAction
						label="Página em branco no final"
						onClick={() => onInsertBlank(pages.length)}
					>
						<Plus className="size-3.5" />
					</IconAction>
				</div>
			</div>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: só limpa o indicador de soltura do arraste */}
			<div
				className="flex-1 space-y-1 overflow-y-auto p-2"
				onDragLeave={(e) => {
					if (!e.currentTarget.contains(e.relatedTarget as Node))
						setDropIndex(null);
				}}
			>
				{pages.map((page, i) => {
					const active = page.id === currentPageId;
					const count = objectCount.get(page.id) ?? 0;
					return (
						<div key={page.id}>
							{dropIndex === i && (
								<div className="mx-2 mb-1 h-0.5 rounded bg-blue-600" />
							)}
							{/* biome-ignore lint/a11y/useSemanticElements: precisa conter botões de ação; o item é focável e acionável por teclado */}
							<div
								role="button"
								tabIndex={0}
								draggable
								aria-label={`Página ${i + 1}`}
								aria-current={active ? "page" : undefined}
								onClick={() => onSelectPage(page.id)}
								onKeyDown={(e) => {
									if (e.key === "Enter" || e.key === " ") {
										e.preventDefault();
										onSelectPage(page.id);
									}
									if (e.altKey && e.key === "ArrowUp" && i > 0)
										onMove(page.id, i - 1);
									if (e.altKey && e.key === "ArrowDown" && i < pages.length - 1)
										onMove(page.id, i + 1);
								}}
								onDragStart={(e) => {
									setDragId(page.id);
									e.dataTransfer.effectAllowed = "move";
									e.dataTransfer.setData("text/plain", page.id);
								}}
								onDragEnd={() => {
									setDragId(null);
									setDropIndex(null);
								}}
								onDragOver={(e) => onDragOver(e, i)}
								onDrop={onDrop}
								className={cn(
									"group relative flex cursor-grab flex-col items-center gap-1.5 rounded-lg px-2 pt-2.5 pb-1.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing",
									active
										? "bg-accent ring-1 ring-blue-600/60"
										: "hover:bg-accent/60",
									dragId === page.id && "opacity-40",
								)}
							>
								<Thumbnail page={page} />
								<span
									className={cn(
										"text-xs tabular-nums",
										active
											? "font-semibold text-foreground"
											: "text-muted-foreground",
									)}
								>
									{i + 1}
									{count > 0 && (
										<span className="ml-1 rounded bg-blue-600/15 px-1 text-[10px] text-blue-700 dark:text-blue-300">
											{count} edição{count > 1 ? "ões" : ""}
										</span>
									)}
								</span>
								<div className="absolute top-1 right-1 flex flex-col gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
									<IconAction
										label="Girar à direita"
										onClick={() => onRotate(page.id, 90)}
									>
										<RotateCw className="size-3.5" />
									</IconAction>
									<IconAction
										label="Girar à esquerda"
										onClick={() => onRotate(page.id, -90)}
									>
										<RotateCcw className="size-3.5" />
									</IconAction>
									<IconAction
										label="Duplicar página"
										onClick={() => onDuplicate(page.id)}
									>
										<Copy className="size-3.5" />
									</IconAction>
									<IconAction
										label="Inserir página em branco depois"
										onClick={() => onInsertBlank(i + 1)}
									>
										<Plus className="size-3.5" />
									</IconAction>
									<IconAction
										label="Excluir página"
										danger
										disabled={pages.length <= 1}
										onClick={() => onDelete(page.id)}
									>
										<Trash2 className="size-3.5" />
									</IconAction>
								</div>
							</div>
						</div>
					);
				})}
				{dropIndex === pages.length && (
					<div className="mx-2 h-0.5 rounded bg-blue-600" />
				)}
			</div>
		</div>
	);
}

import { Eraser, ImageUp, Trash2, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { SIGNATURE_FONTS } from "./fonts";
import {
	loadSignatures,
	readImageFile,
	type SavedSignature,
	storeSignatures,
	trimCanvas,
} from "./signatures";
import { uid } from "./state";

type Mode = "draw" | "type" | "upload";

const INK_COLORS = ["#111827", "#1d4ed8", "#b91c1c"];

function DrawPad({
	color,
	onChange,
}: {
	color: string;
	onChange: (c: HTMLCanvasElement | null) => void;
}) {
	const ref = useRef<HTMLCanvasElement>(null);
	const drawing = useRef(false);

	useEffect(() => {
		const canvas = ref.current;
		if (!canvas) return;
		const dpr = window.devicePixelRatio || 1;
		const rect = canvas.getBoundingClientRect();
		canvas.width = rect.width * dpr;
		canvas.height = rect.height * dpr;
		const ctx = canvas.getContext("2d");
		ctx?.scale(dpr, dpr);
	}, []);

	const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
		const r = e.currentTarget.getBoundingClientRect();
		return [e.clientX - r.left, e.clientY - r.top] as const;
	};

	const clear = () => {
		const canvas = ref.current;
		const ctx = canvas?.getContext("2d");
		if (!canvas || !ctx) return;
		ctx.save();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		ctx.restore();
		onChange(null);
	};

	return (
		<div className="space-y-2">
			<canvas
				ref={ref}
				aria-label="Área para desenhar a assinatura"
				className="h-44 w-full touch-none rounded-lg border-2 border-dashed bg-white"
				onPointerDown={(e) => {
					e.currentTarget.setPointerCapture(e.pointerId);
					drawing.current = true;
					const ctx = e.currentTarget.getContext("2d");
					if (!ctx) return;
					const [x, y] = pos(e);
					ctx.strokeStyle = color;
					ctx.fillStyle = color;
					ctx.lineWidth = 2.5;
					ctx.lineCap = "round";
					ctx.lineJoin = "round";
					ctx.beginPath();
					ctx.arc(x, y, 1.2, 0, Math.PI * 2);
					ctx.fill();
					ctx.beginPath();
					ctx.moveTo(x, y);
				}}
				onPointerMove={(e) => {
					if (!drawing.current) return;
					const ctx = e.currentTarget.getContext("2d");
					if (!ctx) return;
					const [x, y] = pos(e);
					ctx.lineTo(x, y);
					ctx.stroke();
					ctx.beginPath();
					ctx.moveTo(x, y);
				}}
				onPointerUp={(e) => {
					drawing.current = false;
					onChange(e.currentTarget);
				}}
			/>
			<Button type="button" size="sm" variant="ghost" onClick={clear}>
				<Eraser /> Limpar
			</Button>
		</div>
	);
}

function renderTyped(
	text: string,
	font: string,
	color: string,
): HTMLCanvasElement {
	const canvas = document.createElement("canvas");
	const size = 96;
	const ctx = canvas.getContext("2d");
	if (!ctx) return canvas;
	ctx.font = `${size}px ${font}`;
	const width = Math.ceil(ctx.measureText(text).width) + size;
	canvas.width = width;
	canvas.height = size * 2;
	ctx.font = `${size}px ${font}`;
	ctx.fillStyle = color;
	ctx.textBaseline = "middle";
	ctx.fillText(text, size / 2, size);
	return canvas;
}

export function SignatureDialog({
	open,
	onOpenChange,
	onInsert,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onInsert: (sig: { src: string; width: number; height: number }) => void;
}) {
	const [mode, setMode] = useState<Mode>("draw");
	const [color, setColor] = useState(INK_COLORS[0]);
	const [drawn, setDrawn] = useState<HTMLCanvasElement | null>(null);
	const [typed, setTyped] = useState("");
	const [fontIdx, setFontIdx] = useState(0);
	const [uploaded, setUploaded] = useState<{
		src: string;
		width: number;
		height: number;
	} | null>(null);
	const [saved, setSaved] = useState<SavedSignature[]>([]);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (open) {
			setSaved(loadSignatures());
			setDrawn(null);
			setUploaded(null);
			setError(null);
		}
	}, [open]);

	const build = (): { src: string; width: number; height: number } | null => {
		if (mode === "draw") return drawn ? trimCanvas(drawn) : null;
		if (mode === "type") {
			if (!typed.trim()) return null;
			return trimCanvas(
				renderTyped(typed.trim(), SIGNATURE_FONTS[fontIdx].css, color),
			);
		}
		return uploaded;
	};

	const create = () => {
		const sig = build();
		if (!sig) {
			setError(
				mode === "draw"
					? "Desenhe sua assinatura na área acima."
					: mode === "type"
						? "Digite seu nome."
						: "Escolha uma imagem.",
			);
			return;
		}
		const entry: SavedSignature = { id: uid(), ...sig };
		storeSignatures([entry, ...saved.filter((s) => s.src !== sig.src)]);
		onInsert(sig);
		onOpenChange(false);
	};

	const remove = (id: string) => {
		const next = saved.filter((s) => s.id !== id);
		setSaved(next);
		storeSignatures(next);
	};

	return (
		<Dialog.Root open={open} onOpenChange={onOpenChange}>
			<Dialog.Portal>
				<Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
				<Dialog.Content className="fixed top-1/2 left-1/2 z-50 flex max-h-[92dvh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-xl border bg-background p-5 text-foreground shadow-2xl data-[state=open]:animate-in data-[state=open]:zoom-in-95">
					<div className="flex items-start justify-between gap-4">
						<div>
							<Dialog.Title className="text-lg font-semibold">
								Assinatura
							</Dialog.Title>
							<Dialog.Description className="text-sm text-muted-foreground">
								Crie uma assinatura ou reutilize uma salva. Fica guardada só
								neste navegador.
							</Dialog.Description>
						</div>
						<Dialog.Close asChild>
							<Button
								type="button"
								size="icon-sm"
								variant="ghost"
								aria-label="Fechar"
							>
								<X />
							</Button>
						</Dialog.Close>
					</div>

					{saved.length > 0 && (
						<div className="space-y-2">
							<p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
								Salvas
							</p>
							<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
								{saved.map((s) => (
									<div key={s.id} className="group relative">
										<button
											type="button"
											onClick={() => {
												onInsert(s);
												onOpenChange(false);
											}}
											className="flex h-16 w-full items-center justify-center rounded-lg border bg-white p-2 transition hover:ring-2 hover:ring-blue-600"
											aria-label="Inserir assinatura salva"
										>
											<img
												src={s.src}
												alt=""
												className="max-h-full max-w-full object-contain"
											/>
										</button>
										<button
											type="button"
											onClick={() => remove(s.id)}
											aria-label="Remover assinatura salva"
											className="absolute -top-1.5 -right-1.5 hidden size-5 items-center justify-center rounded-full bg-destructive text-white shadow group-hover:flex group-focus-within:flex"
										>
											<Trash2 className="size-3" />
										</button>
									</div>
								))}
							</div>
						</div>
					)}

					<div
						className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1"
						role="tablist"
					>
						{(
							[
								["draw", "Desenhar"],
								["type", "Digitar"],
								["upload", "Imagem"],
							] as const
						).map(([m, label]) => (
							<button
								key={m}
								type="button"
								role="tab"
								aria-selected={mode === m}
								onClick={() => {
									setMode(m);
									setError(null);
								}}
								className={cn(
									"rounded-md py-1.5 text-sm font-medium transition-colors",
									mode === m
										? "bg-background shadow-sm"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								{label}
							</button>
						))}
					</div>

					{mode !== "upload" && (
						<div className="flex items-center gap-2">
							<span className="text-xs text-muted-foreground">Cor</span>
							{INK_COLORS.map((c) => (
								<button
									key={c}
									type="button"
									aria-label={`Cor ${c}`}
									aria-pressed={color === c}
									onClick={() => setColor(c)}
									className={cn(
										"size-6 rounded-full border border-black/10",
										color === c &&
											"ring-2 ring-blue-600 ring-offset-2 ring-offset-background",
									)}
									style={{ background: c }}
								/>
							))}
						</div>
					)}

					{mode === "draw" && <DrawPad color={color} onChange={setDrawn} />}

					{mode === "type" && (
						<div className="space-y-3">
							<Input
								value={typed}
								onChange={(e) => setTyped(e.target.value)}
								placeholder="Seu nome"
								aria-label="Nome para a assinatura"
								maxLength={60}
							/>
							<div className="grid gap-2">
								{SIGNATURE_FONTS.map((f, i) => (
									<button
										key={f.label}
										type="button"
										onClick={() => setFontIdx(i)}
										aria-pressed={fontIdx === i}
										className={cn(
											"truncate rounded-lg border bg-white px-4 py-2 text-left text-3xl",
											fontIdx === i && "ring-2 ring-blue-600",
										)}
										style={{ fontFamily: f.css, color }}
									>
										{typed.trim() || "Seu nome"}
									</button>
								))}
							</div>
						</div>
					)}

					{mode === "upload" && (
						<label className="flex h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed bg-muted/40 text-sm text-muted-foreground hover:bg-muted">
							{uploaded ? (
								<img
									src={uploaded.src}
									alt="Pré-visualização"
									className="max-h-32 max-w-full object-contain"
								/>
							) : (
								<>
									<ImageUp className="size-6" />
									PNG ou JPG (fundo transparente fica melhor)
								</>
							)}
							<input
								type="file"
								accept="image/png,image/jpeg,image/webp"
								className="sr-only"
								onChange={async (e) => {
									const f = e.target.files?.[0];
									if (!f) return;
									try {
										setUploaded(await readImageFile(f));
										setError(null);
									} catch {
										setError("Não foi possível ler esta imagem.");
									}
								}}
							/>
						</label>
					)}

					{error && (
						<p className="text-sm text-destructive-foreground">{error}</p>
					)}

					<div className="flex justify-end gap-2">
						<Dialog.Close asChild>
							<Button type="button" variant="outline">
								Cancelar
							</Button>
						</Dialog.Close>
						<Button type="button" onClick={create}>
							Inserir assinatura
						</Button>
					</div>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}

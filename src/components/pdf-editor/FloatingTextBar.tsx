import {
	AlignCenter,
	AlignLeft,
	AlignRight,
	Bold,
	Copy,
	Italic,
	Minus,
	Plus,
	Trash2,
	Underline,
} from "lucide-react";
import {
	type ReactNode,
	useEffect,
	useId,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ensureFont, FONT_OPTIONS, LINE_HEIGHT, lineHeightOf } from "./fonts";
import type { FontFamily, TextAlign, TextObject } from "./types";

const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72];
const LINE_HEIGHTS = [1, 1.15, LINE_HEIGHT, 1.5, 2];
const OPACITIES = [1, 0.75, 0.5, 0.25];
const PDF_FONT = "__pdf";
/** Distância entre a caixa e a barra (as alças ficam no meio). */
const GAP = 16;

const ALIGNS: Array<{
	value: TextAlign;
	label: string;
	icon: typeof AlignLeft;
}> = [
	{ value: "left", label: "Alinhar à esquerda", icon: AlignLeft },
	{ value: "center", label: "Centralizar", icon: AlignCenter },
	{ value: "right", label: "Alinhar à direita", icon: AlignRight },
];

function BarButton({
	label,
	active,
	onClick,
	children,
	className,
}: {
	label: string;
	active?: boolean;
	onClick: () => void;
	children: ReactNode;
	className?: string;
}) {
	return (
		<button
			type="button"
			title={label}
			aria-label={label}
			aria-pressed={active}
			onClick={onClick}
			className={cn(
				"inline-flex size-7 shrink-0 items-center justify-center rounded-md text-foreground/80 hover:bg-accent hover:text-foreground [&_svg]:size-4",
				active && "bg-blue-600/15 text-blue-700 dark:text-blue-300",
				className,
			)}
		>
			{children}
		</button>
	);
}

const Divider = () => <div className="mx-0.5 h-5 w-px shrink-0 bg-border" />;

const fmtLh = (v: number) => (Math.round(v * 100) / 100).toString();

/**
 * Barra de formatação acima da caixa de texto selecionada/em edição. Segue a
 * caixa ao mover, dar zoom e rolar, sempre dentro da área do visualizador.
 */
export function FloatingTextBar({
	viewer,
	target,
	editing,
	onApply,
	onDuplicate,
	onDelete,
}: {
	viewer: HTMLElement | null;
	target: TextObject | null;
	editing: boolean;
	onApply: (patch: Partial<TextObject>, field?: string) => void;
	onDuplicate: (t: TextObject) => void;
	onDelete: (t: TextObject) => void;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const sizesId = useId();
	const id = target?.id;

	// Posição lida do quadro de seleção a cada frame: acompanha arraste,
	// zoom, rolagem e redimensionamento da janela sem eventos extras.
	useLayoutEffect(() => {
		const bar = ref.current;
		if (!bar || !id || !viewer) return;
		let raf = 0;
		const place = () => {
			raf = requestAnimationFrame(place);
			const anchor = viewer.querySelector<HTMLElement>(
				`[data-object-frame="${id}"]`,
			);
			const v = viewer.getBoundingClientRect();
			if (!anchor) {
				bar.style.visibility = "hidden";
				return;
			}
			const r = anchor.getBoundingClientRect();
			if (r.bottom < v.top || r.top > v.bottom) {
				bar.style.visibility = "hidden";
				return;
			}
			const bw = bar.offsetWidth;
			const bh = bar.offsetHeight;
			let top = r.top - GAP - bh;
			if (top < v.top + 4) top = r.bottom + GAP;
			top = Math.min(Math.max(top, v.top + 4), v.bottom - bh - 4);
			const left = Math.min(
				Math.max(r.left + r.width / 2 - bw / 2, v.left + 4),
				Math.max(v.left + 4, v.right - bw - 4),
			);
			bar.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
			bar.style.visibility = "visible";
		};
		place();
		return () => cancelAnimationFrame(raf);
	}, [id, viewer]);

	// Tamanho digitável: rascunho local, aplicado quando é um valor válido.
	const [sizeText, setSizeText] = useState("");
	const sizeFocused = useRef(false);
	const fontSize = target?.fontSize;
	useEffect(() => {
		if (!sizeFocused.current && fontSize !== undefined)
			setSizeText(String(Math.round(fontSize * 10) / 10));
	}, [fontSize]);

	if (!target) return null;
	const t = target;
	const original = t.source?.font;
	const fontValue = t.pdfFont ? PDF_FONT : t.fontFamily;
	const lh = lineHeightOf(t);
	const lineHeights = LINE_HEIGHTS.some((v) => Math.abs(v - lh) < 0.005)
		? LINE_HEIGHTS
		: [...LINE_HEIGHTS, lh].sort((a, b) => a - b);
	const opacities = OPACITIES.includes(t.opacity)
		? OPACITIES
		: [...OPACITIES, t.opacity].sort((a, b) => b - a);

	const step = (dir: 1 | -1) => {
		const cur = t.fontSize;
		const next =
			dir > 0
				? (SIZES.find((s) => s > cur + 0.01) ?? Math.min(200, cur + 4))
				: ([...SIZES].reverse().find((s) => s < cur - 0.01) ??
					Math.max(4, cur - 1));
		onApply({ fontSize: next });
	};

	return (
		<div
			ref={ref}
			role="toolbar"
			aria-label="Formatação do texto"
			// Botões não tiram o foco do texto em edição.
			onMouseDown={(e) => {
				const el = e.target as HTMLElement;
				if (!el.closest("input, [role=combobox]")) e.preventDefault();
			}}
			className="fixed top-0 left-0 z-50 flex max-w-[calc(100vw-16px)] flex-wrap items-center gap-0.5 rounded-lg border bg-background/95 p-1 text-xs shadow-lg backdrop-blur"
			style={{ visibility: "hidden" }}
		>
			<Select
				value={fontValue}
				onOpenChange={(open) => {
					// Prévia das fontes extras no próprio menu.
					if (open)
						for (const f of FONT_OPTIONS)
							ensureFont({
								fontFamily: f.value,
								bold: false,
								italic: false,
							}).catch(() => {});
				}}
				onValueChange={(v) => {
					if (v === PDF_FONT) {
						if (original) onApply({ ...original });
						return;
					}
					onApply({ fontFamily: v as FontFamily });
				}}
			>
				<SelectTrigger
					size="sm"
					className="h-7 w-34 gap-1 px-2 text-xs"
					aria-label="Fonte"
				>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{original && (
						<SelectItem value={PDF_FONT}>Fonte original do PDF</SelectItem>
					)}
					{FONT_OPTIONS.map((f) => (
						<SelectItem key={f.value} value={f.value}>
							<span style={{ fontFamily: f.css }}>{f.label}</span>
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			<Divider />
			<BarButton label="Diminuir fonte" onClick={() => step(-1)}>
				<Minus />
			</BarButton>
			<input
				type="number"
				inputMode="decimal"
				min={4}
				max={200}
				step={0.5}
				list={sizesId}
				aria-label="Tamanho da fonte"
				value={sizeText}
				onFocus={() => {
					sizeFocused.current = true;
				}}
				onBlur={() => {
					sizeFocused.current = false;
					setSizeText(String(Math.round(t.fontSize * 10) / 10));
				}}
				onChange={(e) => {
					setSizeText(e.target.value);
					const v = Number(e.target.value);
					if (v >= 4 && v <= 200) onApply({ fontSize: v }, "fontSize");
				}}
				onKeyDown={(e) => {
					e.stopPropagation();
					if (e.key === "Enter") (e.target as HTMLInputElement).blur();
				}}
				className="h-7 w-12 rounded-md border bg-transparent px-1 text-center tabular-nums outline-none focus:ring-2 focus:ring-blue-600/40 [&::-webkit-inner-spin-button]:appearance-none"
			/>
			<datalist id={sizesId}>
				{SIZES.map((s) => (
					<option key={s} value={s} />
				))}
			</datalist>
			<BarButton label="Aumentar fonte" onClick={() => step(1)}>
				<Plus />
			</BarButton>

			<Divider />
			<label
				title="Cor do texto"
				className="relative inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md hover:bg-accent"
			>
				<span className="sr-only">Cor do texto</span>
				<span
					className="size-4 rounded-sm border border-black/15 dark:border-white/25"
					style={{ background: t.color }}
				/>
				<input
					type="color"
					value={t.color}
					onChange={(e) => onApply({ color: e.target.value }, "color")}
					className="absolute inset-0 size-full cursor-pointer opacity-0"
				/>
			</label>
			<BarButton
				label="Negrito"
				active={t.bold}
				onClick={() => onApply({ bold: !t.bold })}
			>
				<Bold />
			</BarButton>
			<BarButton
				label="Itálico"
				active={t.italic}
				onClick={() => onApply({ italic: !t.italic })}
			>
				<Italic />
			</BarButton>
			<BarButton
				label="Sublinhado"
				active={Boolean(t.underline)}
				onClick={() => onApply({ underline: !t.underline })}
			>
				<Underline />
			</BarButton>

			<Divider />
			{ALIGNS.map(({ value, label, icon: Icon }) => (
				<BarButton
					key={value}
					label={label}
					active={(t.align ?? "left") === value}
					onClick={() => onApply({ align: value })}
				>
					<Icon />
				</BarButton>
			))}

			<Divider />
			<Select
				value={fmtLh(lh)}
				onValueChange={(v) => onApply({ lineHeight: Number(v) })}
			>
				<SelectTrigger
					size="sm"
					className="h-7 gap-1 px-2 text-xs"
					aria-label="Entrelinha"
					title="Entrelinha"
				>
					<span className="text-muted-foreground">↕</span>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{lineHeights.map((v) => (
						<SelectItem key={v} value={fmtLh(v)}>
							{fmtLh(v)}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<Select
				value={String(t.opacity)}
				onValueChange={(v) => onApply({ opacity: Number(v) })}
			>
				<SelectTrigger
					size="sm"
					className="h-7 gap-1 px-2 text-xs"
					aria-label="Opacidade"
					title="Opacidade"
				>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{opacities.map((v) => (
						<SelectItem key={v} value={String(v)}>
							{Math.round(v * 100)}%
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			<Divider />
			<BarButton
				label={editing ? "Duplicar (confirma a edição)" : "Duplicar"}
				onClick={() => onDuplicate(t)}
			>
				<Copy />
			</BarButton>
			<BarButton
				label="Excluir"
				onClick={() => onDelete(t)}
				className="text-red-600 hover:text-red-700 dark:text-red-400"
			>
				<Trash2 />
			</BarButton>
		</div>
	);
}

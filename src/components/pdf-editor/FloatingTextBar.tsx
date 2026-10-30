import {
	AlertTriangle,
	AlignCenter,
	AlignLeft,
	AlignRight,
	Bold,
	ChevronDown,
	Copy,
	Italic,
	Minus,
	Pipette,
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
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
	embeddedFont,
	ensureFont,
	FONT_OPTIONS,
	LINE_HEIGHT,
	lineHeightOf,
	type PdfFontInfo,
	pdfFontLabel,
	roundSize,
} from "./fonts";
import type { FontFamily, TextAlign, TextObject } from "./types";

const SIZES = [
	6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72, 96,
];
const MIN_SIZE = 1;
const MAX_SIZE = 400;
const LINE_HEIGHTS = [1, 1.15, LINE_HEIGHT, 1.5, 2];
const OPACITIES = [1, 0.75, 0.5, 0.25];
const PDF_FONT = "__pdf";
/** Prefixo das fontes do documento no select (`pdf:<loadedName>`). */
const DOC_FONT = "pdf:";
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

/** Tamanho exibido: até 2 casas, sem zeros à direita (6.84, 12, 10.5). */
const fmtSize = (v: number) => String(Math.round(v * 100) / 100);

/** Volta o foco ao texto em edição (depois de usar um controle da barra). */
function focusDraft() {
	document
		.querySelector<HTMLTextAreaElement>("textarea[data-text-draft]")
		?.focus({ preventScroll: true });
}

/** Lê "6,96", "6.96", " 12 " → número válido dentro dos limites, ou `null`. */
function parseSize(text: string): number | null {
	const v = Number(text.trim().replace(",", "."));
	if (!Number.isFinite(v) || v < MIN_SIZE || v > MAX_SIZE) return null;
	return roundSize(v);
}

/**
 * Tamanho da fonte: campo decimal + lista própria (não é <select> nem
 * <datalist>, que brigam com o foco do texto em edição e não abrem bem no
 * celular). A lista não pega o foco: escolher um tamanho mantém o cursor no
 * texto. O valor digitado vale ao dar Enter, Tab ou sair do campo.
 */
function FontSizeBox({
	id,
	value,
	editing,
	onApply,
}: {
	id: string;
	value: number;
	editing: boolean;
	onApply: (size: number) => void;
}) {
	const listId = useId();
	const wrapRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	/** Texto digitado e o objeto a que ele pertence (`null` = mostra o valor atual). */
	const [typed, setTyped] = useState<{ id: string; text: string } | null>(null);
	const [open, setOpen] = useState(false);
	const [up, setUp] = useState(false);
	const shown = typed && typed.id === id ? typed.text : fmtSize(value);

	// Valor mudou por fora (botões, lista, undo, outro objeto): mostra o novo.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reage à troca de valor/objeto
	useEffect(() => {
		setTyped(null);
	}, [value, id]);

	// Fecha a lista ao clicar/tocar fora.
	useEffect(() => {
		if (!open) return;
		const onDown = (e: PointerEvent) => {
			if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
		};
		window.addEventListener("pointerdown", onDown, true);
		return () => window.removeEventListener("pointerdown", onDown, true);
	}, [open]);

	const commitTyped = () => {
		if (!typed || typed.id !== id) return;
		const v = parseSize(typed.text);
		setTyped(null);
		if (v !== null && v !== value) onApply(v);
	};
	const commitRef = useRef(commitTyped);
	commitRef.current = commitTyped;

	// Clique fora com valor digitado: aplica ANTES do clique mudar a seleção
	// (senão a barra some junto com o valor, sem aplicar).
	useEffect(() => {
		if (!typed) return;
		const onDown = (e: PointerEvent) => {
			if (!wrapRef.current?.contains(e.target as Node)) commitRef.current();
		};
		window.addEventListener("pointerdown", onDown, true);
		return () => window.removeEventListener("pointerdown", onDown, true);
	}, [typed]);

	const toggle = () => {
		if (!open && wrapRef.current) {
			// Abre para cima se não couber abaixo.
			const r = wrapRef.current.getBoundingClientRect();
			setUp(window.innerHeight - r.bottom < 240 && r.top > 240);
		}
		setOpen((o) => !o);
	};

	const choose = (v: number) => {
		setTyped(null);
		setOpen(false);
		if (v !== value) onApply(v);
	};

	return (
		<div ref={wrapRef} className="relative flex shrink-0 items-center">
			<input
				ref={inputRef}
				type="text"
				inputMode="decimal"
				autoComplete="off"
				role="combobox"
				aria-expanded={open}
				aria-controls={listId}
				aria-label="Tamanho da fonte"
				value={shown}
				onFocus={(e) => e.currentTarget.select()}
				onChange={(e) => setTyped({ id, text: e.target.value })}
				onBlur={commitTyped}
				onKeyDown={(e) => {
					// O texto do campo não aciona atalhos do editor.
					e.stopPropagation();
					if (e.key === "Enter") {
						e.preventDefault();
						commitTyped();
						setOpen(false);
						if (editing) focusDraft();
						else inputRef.current?.blur();
					} else if (e.key === "Escape") {
						e.preventDefault();
						setTyped(null);
						setOpen(false);
						if (editing) focusDraft();
					} else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
						e.preventDefault();
						const cur = parseSize(shown) ?? value;
						const step = e.shiftKey ? 10 : 1;
						const next = Math.min(
							MAX_SIZE,
							Math.max(
								MIN_SIZE,
								roundSize(cur + (e.key === "ArrowUp" ? step : -step)),
							),
						);
						setTyped(null);
						if (next !== value) onApply(next);
					}
				}}
				className="h-7 w-12 rounded-l-md border border-r-0 bg-transparent px-1 text-center tabular-nums outline-none focus:ring-2 focus:ring-blue-600/40"
			/>
			<button
				type="button"
				tabIndex={-1}
				aria-label="Lista de tamanhos"
				aria-haspopup="listbox"
				aria-expanded={open}
				// Não tira o foco do texto em edição (nem no toque).
				onPointerDown={(e) => e.preventDefault()}
				onClick={toggle}
				className="inline-flex h-7 w-5 items-center justify-center rounded-r-md border text-muted-foreground hover:bg-accent [&_svg]:size-3.5"
			>
				<ChevronDown />
			</button>
			{open && (
				<div
					id={listId}
					role="listbox"
					aria-label="Tamanhos"
					className={cn(
						"absolute left-0 z-10 max-h-56 w-[4.25rem] overflow-y-auto overscroll-contain rounded-md border bg-popover p-1 text-popover-foreground shadow-md",
						up ? "bottom-full mb-1" : "top-full mt-1",
					)}
				>
					{SIZES.map((v) => (
						<button
							key={v}
							type="button"
							role="option"
							aria-selected={Math.abs(v - value) < 0.001}
							tabIndex={-1}
							onPointerDown={(e) => e.preventDefault()}
							onClick={() => choose(v)}
							className={cn(
								"block w-full rounded-sm px-2 py-1 text-left tabular-nums hover:bg-accent",
								Math.abs(v - value) < 0.001 &&
									"bg-blue-600/15 text-blue-700 dark:text-blue-300",
							)}
						>
							{v}
						</button>
					))}
				</div>
			)}
		</div>
	);
}

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
	docFonts,
	picking,
	onPickStyle,
	onFocusLeave,
}: {
	viewer: HTMLElement | null;
	target: TextObject | null;
	editing: boolean;
	onApply: (patch: Partial<TextObject>, field?: string) => void;
	onDuplicate: (t: TextObject) => void;
	onDelete: (t: TextObject) => void;
	/** Fontes embutidas do PDF que o texto desta página pode usar. */
	docFonts: (pageId: string) => PdfFontInfo[];
	/** Conta-gotas ativo. */
	picking: boolean;
	onPickStyle: (t: TextObject) => void;
	/** O foco saiu da barra para fora do texto em edição. */
	onFocusLeave: () => void;
}) {
	const ref = useRef<HTMLDivElement>(null);
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

	if (!target) return null;
	const t = target;
	const original = t.source?.font;
	const fonts = docFonts(t.pageId).filter(
		(f) => f.loadedName !== original?.pdfFont,
	);
	const fontValue = !t.pdfFont
		? t.fontFamily
		: t.pdfFont === original?.pdfFont
			? PDF_FONT
			: `${DOC_FONT}${t.pdfFont}`;
	// Fonte do PDF escolhida mas sem todos os glifos: usa a padrão.
	const missingGlyphs = Boolean(t.pdfFont) && embeddedFont(t) === null;
	const fallbackLabel =
		FONT_OPTIONS.find((f) => f.value === t.fontFamily)?.label ?? t.fontFamily;
	const popupProps = {
		"data-text-toolbar-popup": "",
		// Ao fechar, o foco volta ao texto em edição (não ao botão do select).
		onCloseAutoFocus: (e: Event) => {
			if (!editing) return;
			e.preventDefault();
			focusDraft();
		},
	};
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
				? (SIZES.find((s) => s > cur + 0.01) ?? Math.min(MAX_SIZE, cur + 4))
				: ([...SIZES].reverse().find((s) => s < cur - 0.01) ??
					Math.max(MIN_SIZE, roundSize(cur - 1)));
		onApply({ fontSize: next });
	};

	return (
		<div
			ref={ref}
			role="toolbar"
			aria-label="Formatação do texto"
			data-text-toolbar=""
			// Botões não tiram o foco do texto em edição.
			onMouseDown={(e) => {
				const el = e.target as HTMLElement;
				if (!el.closest("input, [role=combobox]")) e.preventDefault();
			}}
			// Foco saiu da barra para fora do texto em edição: confirma a edição
			// (como clicar fora). Dentro da barra/menus/texto, a edição continua.
			onBlur={(e) => {
				if (!editing) return;
				const to = e.relatedTarget as HTMLElement | null;
				if (
					to &&
					(e.currentTarget.contains(to) ||
						to.closest("[data-text-toolbar-popup], textarea[data-text-draft]"))
				)
					return;
				onFocusLeave();
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
						if (original)
							onApply({
								...original,
								pdfStyle: original.pdfStyle ?? t.pdfStyle,
							});
						return;
					}
					if (v.startsWith(DOC_FONT)) {
						const f = fonts.find((x) => `${DOC_FONT}${x.loadedName}` === v);
						if (!f) return;
						// Mesma fonte do estilo atual: mantém espaçamentos e ajustes.
						const keep = t.pdfStyle?.font === f.loadedName;
						onApply({
							pdfFont: f.loadedName,
							fontFamily: f.family,
							bold: f.bold,
							italic: f.italic,
							pdfStyle: keep
								? t.pdfStyle
								: {
										font: f.loadedName,
										docId: f.docId,
										pageIndex: f.pageIndex,
										charSpacing: 0,
										wordSpacing: 0,
										hScale: 100,
										fill: [],
										gs: [],
										color: t.color,
									},
						});
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
				<SelectContent {...popupProps}>
					{original && (
						<SelectItem value={PDF_FONT}>Fonte original do PDF</SelectItem>
					)}
					{fonts.length > 0 && (
						<SelectGroup>
							<SelectLabel>Fontes do documento</SelectLabel>
							{fonts.map((f) => (
								<SelectItem
									key={f.loadedName}
									value={`${DOC_FONT}${f.loadedName}`}
								>
									<span style={{ fontFamily: `"${f.loadedName}"` }}>
										{pdfFontLabel(f)} (PDF)
									</span>
								</SelectItem>
							))}
						</SelectGroup>
					)}
					{(original || fonts.length > 0) && <SelectSeparator />}
					{FONT_OPTIONS.map((f) => (
						<SelectItem key={f.value} value={f.value}>
							<span style={{ fontFamily: f.css }}>{f.label}</span>
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			{missingGlyphs && (
				<span
					role="img"
					aria-label={`A fonte do PDF não tem todos os caracteres: usando ${fallbackLabel}`}
					title={`A fonte do PDF não tem todos os caracteres deste texto (é um subconjunto). Usando ${fallbackLabel}.`}
					className="inline-flex size-7 shrink-0 items-center justify-center text-amber-600 [&_svg]:size-4"
				>
					<AlertTriangle />
				</span>
			)}
			<BarButton
				label={
					picking
						? "Cancelar conta-gotas (Esc)"
						: "Copiar estilo de um texto do PDF (conta-gotas)"
				}
				active={picking}
				onClick={() => onPickStyle(t)}
			>
				<Pipette />
			</BarButton>

			<Divider />
			<BarButton label="Diminuir fonte" onClick={() => step(-1)}>
				<Minus />
			</BarButton>
			<FontSizeBox
				id={t.id}
				value={t.fontSize}
				editing={editing}
				onApply={(fontSize) => onApply({ fontSize })}
			/>
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
				<SelectContent {...popupProps}>
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
				<SelectContent {...popupProps}>
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

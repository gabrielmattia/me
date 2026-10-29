import {
	AlignCenter,
	AlignLeft,
	AlignRight,
	Bold,
	BringToFront,
	Copy,
	Italic,
	RotateCw,
	SendToBack,
	Trash2,
	Undo2,
	X,
} from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { HIGHLIGHT_SWATCHES, SWATCHES, TOOLS } from "./constants";
import { embeddedFont, FONT_OPTIONS } from "./fonts";
import type {
	EditorObject,
	FontFamily,
	TextAlign,
	Tool,
	ToolDefaults,
} from "./types";

const ALIGNS: Array<{
	value: TextAlign;
	label: string;
	icon: typeof AlignLeft;
}> = [
	{ value: "left", label: "Alinhar à esquerda", icon: AlignLeft },
	{ value: "center", label: "Centralizar", icon: AlignCenter },
	{ value: "right", label: "Alinhar à direita", icon: AlignRight },
];

type Patch = Record<string, unknown>;

function Field({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="space-y-2">
			<Label className="text-xs font-medium text-muted-foreground">
				{label}
			</Label>
			{children}
		</div>
	);
}

function ColorField({
	label,
	value,
	onChange,
	swatches = SWATCHES,
	allowNone,
}: {
	label: string;
	value: string | null;
	onChange: (v: string | null) => void;
	swatches?: string[];
	allowNone?: boolean;
}) {
	return (
		<Field label={label}>
			<div className="flex flex-wrap items-center gap-1.5">
				{allowNone && (
					<button
						type="button"
						title="Sem cor"
						aria-label="Sem cor"
						aria-pressed={value === null}
						onClick={() => onChange(null)}
						className={cn(
							"relative size-6 overflow-hidden rounded-md border bg-background",
							value === null &&
								"ring-2 ring-blue-600 ring-offset-1 ring-offset-background",
						)}
					>
						<span className="absolute top-1/2 left-1/2 h-px w-8 -translate-x-1/2 -rotate-45 bg-red-500" />
					</button>
				)}
				{swatches.map((c) => (
					<button
						key={c}
						type="button"
						title={c}
						aria-label={`Cor ${c}`}
						aria-pressed={value?.toLowerCase() === c}
						onClick={() => onChange(c)}
						className={cn(
							"size-6 rounded-md border border-black/10 dark:border-white/20",
							value?.toLowerCase() === c &&
								"ring-2 ring-blue-600 ring-offset-1 ring-offset-background",
						)}
						style={{ background: c }}
					/>
				))}
				<label
					title="Cor personalizada"
					className="relative size-6 cursor-pointer overflow-hidden rounded-md border bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)]"
				>
					<span className="sr-only">Cor personalizada</span>
					<input
						type="color"
						value={value ?? "#000000"}
						onChange={(e) => onChange(e.target.value)}
						className="absolute inset-0 size-full cursor-pointer opacity-0"
					/>
				</label>
			</div>
		</Field>
	);
}

function RangeField({
	label,
	value,
	min,
	max,
	step = 1,
	format = (v) => String(v),
	onChange,
}: {
	label: string;
	value: number;
	min: number;
	max: number;
	step?: number;
	format?: (v: number) => string;
	onChange: (v: number) => void;
}) {
	return (
		<Field label={label}>
			<div className="flex items-center gap-3">
				<Slider
					aria-label={label}
					value={[value]}
					min={min}
					max={max}
					step={step}
					onValueChange={([v]) => onChange(v)}
				/>
				<span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
					{format(value)}
				</span>
			</div>
		</Field>
	);
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

function TextFields({
	values,
	onChange,
}: {
	values: {
		fontFamily: FontFamily;
		fontSize: number;
		color: string;
		bold: boolean;
		italic: boolean;
		align?: TextAlign;
		content?: string;
		pdfFont?: string;
	};
	onChange: (p: Patch) => void;
}) {
	const usingPdfFont =
		values.content !== undefined &&
		embeddedFont({ ...values, content: values.content }) !== null;
	return (
		<>
			<Field label="Fonte">
				<div className="flex gap-2">
					<Select
						value={values.fontFamily}
						onValueChange={(v) => onChange({ fontFamily: v as FontFamily })}
					>
						<SelectTrigger
							size="sm"
							className="flex-1"
							aria-label="Família da fonte"
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{FONT_OPTIONS.map((f) => (
								<SelectItem
									key={f.value}
									value={f.value}
									style={{ fontFamily: f.css }}
								>
									{f.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<input
						type="number"
						aria-label="Tamanho da fonte"
						min={4}
						max={200}
						value={values.fontSize}
						onChange={(e) => {
							const v = Number(e.target.value);
							if (v >= 4 && v <= 200) onChange({ fontSize: v });
						}}
						className="h-8 w-16 rounded-md border bg-transparent px-2 text-sm tabular-nums shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-input/30"
					/>
				</div>
				<div className="flex gap-1">
					<Button
						type="button"
						size="icon-sm"
						variant={values.bold ? "default" : "outline"}
						aria-pressed={values.bold}
						aria-label="Negrito"
						onClick={() => onChange({ bold: !values.bold })}
					>
						<Bold />
					</Button>
					<Button
						type="button"
						size="icon-sm"
						variant={values.italic ? "default" : "outline"}
						aria-pressed={values.italic}
						aria-label="Itálico"
						onClick={() => onChange({ italic: !values.italic })}
					>
						<Italic />
					</Button>
					<div className="mx-1 w-px bg-border" />
					{ALIGNS.map(({ value, label, icon: Icon }) => (
						<Button
							key={value}
							type="button"
							size="icon-sm"
							variant={
								(values.align ?? "left") === value ? "default" : "outline"
							}
							aria-pressed={(values.align ?? "left") === value}
							aria-label={label}
							title={label}
							onClick={() => onChange({ align: value })}
						>
							<Icon />
						</Button>
					))}
				</div>
				{usingPdfFont && (
					<p className="text-xs text-muted-foreground">
						Usando a fonte original do PDF. Trocar fonte, negrito ou itálico
						passa a usar a fonte padrão escolhida.
					</p>
				)}
			</Field>
			<ColorField
				label="Cor do texto"
				value={values.color}
				onChange={(c) => c && onChange({ color: c })}
			/>
		</>
	);
}

/** Campos de estilo para um tipo de objeto (usado tanto no objeto selecionado quanto nos padrões da ferramenta). */
function StyleFields({
	kind,
	values,
	onChange,
}: {
	kind: EditorObject["type"];
	values: Patch;
	onChange: (p: Patch) => void;
}) {
	const v = values as Record<string, never>;
	switch (kind) {
		case "text":
			return (
				<TextFields
					values={
						values as unknown as Parameters<typeof TextFields>[0]["values"]
					}
					onChange={onChange}
				/>
			);
		case "rect":
		case "ellipse":
			return (
				<>
					<ColorField
						label="Contorno"
						value={v.stroke}
						allowNone
						onChange={(c) => onChange({ stroke: c })}
					/>
					<ColorField
						label="Preenchimento"
						value={v.fill}
						allowNone
						onChange={(c) => onChange({ fill: c })}
					/>
					<RangeField
						label="Espessura"
						value={v.strokeWidth}
						min={1}
						max={20}
						onChange={(n) => onChange({ strokeWidth: n })}
						format={(n) => `${n} pt`}
					/>
					<RangeField
						label="Opacidade"
						value={v.opacity}
						min={0.1}
						max={1}
						step={0.05}
						format={pct}
						onChange={(n) => onChange({ opacity: n })}
					/>
				</>
			);
		case "highlight":
			return (
				<>
					<ColorField
						label="Cor"
						value={v.color}
						swatches={HIGHLIGHT_SWATCHES}
						onChange={(c) => c && onChange({ color: c })}
					/>
					<RangeField
						label="Intensidade"
						value={v.opacity}
						min={0.15}
						max={0.8}
						step={0.05}
						format={pct}
						onChange={(n) => onChange({ opacity: n })}
					/>
				</>
			);
		case "whiteout":
			return (
				<ColorField
					label="Cor de cobertura"
					value={v.color}
					onChange={(c) => c && onChange({ color: c })}
				/>
			);
		case "ink":
		case "line":
			return (
				<>
					<ColorField
						label="Cor"
						value={v.color}
						onChange={(c) => c && onChange({ color: c })}
					/>
					<RangeField
						label="Espessura"
						value={v.strokeWidth}
						min={0.5}
						max={20}
						step={0.5}
						format={(n) => `${n} pt`}
						onChange={(n) => onChange({ strokeWidth: n })}
					/>
					<RangeField
						label="Opacidade"
						value={v.opacity}
						min={0.1}
						max={1}
						step={0.05}
						format={pct}
						onChange={(n) => onChange({ opacity: n })}
					/>
				</>
			);
		case "image":
			return (
				<RangeField
					label="Opacidade"
					value={v.opacity}
					min={0.1}
					max={1}
					step={0.05}
					format={pct}
					onChange={(n) => onChange({ opacity: n })}
				/>
			);
		default:
			return null;
	}
}

const OBJECT_LABEL: Record<EditorObject["type"], string> = {
	text: "Texto",
	rect: "Retângulo",
	ellipse: "Elipse",
	highlight: "Marca-texto",
	whiteout: "Área apagada",
	image: "Imagem",
	ink: "Desenho",
	line: "Linha",
};

const TOOL_DEFAULTS_KEY: Partial<
	Record<Tool, { key: keyof ToolDefaults; kind: EditorObject["type"] }>
> = {
	text: { key: "text", kind: "text" },
	pen: { key: "pen", kind: "ink" },
	highlight: { key: "highlight", kind: "highlight" },
	whiteout: { key: "whiteout", kind: "whiteout" },
	rect: { key: "shape", kind: "rect" },
	ellipse: { key: "shape", kind: "ellipse" },
	line: { key: "line", kind: "line" },
	arrow: { key: "line", kind: "line" },
};

const SHORTCUTS: Array<[string, string]> = [
	["Ctrl/⌘ + Z", "Desfazer"],
	["Ctrl/⌘ + Shift + Z", "Refazer"],
	["Delete", "Excluir seleção"],
	["Ctrl/⌘ + D", "Duplicar objeto"],
	["Setas", "Mover 1 pt (Shift: 10 pt)"],
	["Esc", "Cancelar / soltar seleção"],
	["Shift ao arrastar", "Proporção / ângulo fixo"],
];

export function PropertiesPanel({
	selected,
	tool,
	defaults,
	onObjectChange,
	onDefaultsChange,
	onDelete,
	onDuplicate,
	onReorder,
	onRotate,
	onClose,
}: {
	selected: EditorObject | null;
	tool: Tool;
	defaults: ToolDefaults;
	onObjectChange: (patch: Patch, field: string) => void;
	onDefaultsChange: (key: keyof ToolDefaults, patch: Patch) => void;
	onDelete: () => void;
	onDuplicate: () => void;
	onReorder: (to: "front" | "back") => void;
	onRotate: () => void;
	onClose?: () => void;
}) {
	const toolDefaults = TOOL_DEFAULTS_KEY[tool];
	const toolInfo = TOOLS.find((t) => t.id === tool);
	const title = selected
		? selected.type === "text" && selected.cover
			? "Texto editado"
			: OBJECT_LABEL[selected.type]
		: toolDefaults
			? `${toolInfo?.label ?? ""} — padrão`
			: "Propriedades";

	return (
		<div className="flex h-full flex-col">
			<div className="flex items-center justify-between border-b px-4 py-2.5">
				<p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					{title}
				</p>
				{onClose && (
					<Button
						type="button"
						size="icon-xs"
						variant="ghost"
						aria-label="Fechar painel"
						onClick={onClose}
					>
						<X />
					</Button>
				)}
			</div>
			<div className="flex-1 space-y-5 overflow-y-auto p-4">
				{selected ? (
					<>
						<StyleFields
							kind={selected.type}
							values={selected as unknown as Patch}
							onChange={(p) => onObjectChange(p, Object.keys(p).join(","))}
						/>
						{selected.type === "text" && (
							<RangeField
								label="Opacidade"
								value={selected.opacity}
								min={0.1}
								max={1}
								step={0.05}
								format={pct}
								onChange={(n) => onObjectChange({ opacity: n }, "opacity")}
							/>
						)}
						{selected.type === "line" && (
							<Field label="Ponta">
								<div className="flex gap-1">
									<Button
										type="button"
										size="sm"
										variant={selected.arrow ? "outline" : "default"}
										onClick={() => onObjectChange({ arrow: false }, "arrow")}
									>
										Linha
									</Button>
									<Button
										type="button"
										size="sm"
										variant={selected.arrow ? "default" : "outline"}
										onClick={() => onObjectChange({ arrow: true }, "arrow")}
									>
										Seta
									</Button>
								</div>
							</Field>
						)}
						{selected.type === "text" && selected.cover && (
							<>
								<ColorField
									label="Cor de fundo (cobre o original)"
									value={selected.cover.color}
									onChange={(c) =>
										c &&
										selected.cover &&
										onObjectChange(
											{ cover: { ...selected.cover, color: c } },
											"cover",
										)
									}
								/>
								<p className="rounded-md bg-muted p-2.5 text-xs leading-relaxed text-muted-foreground">
									Original: “{selected.source?.text}”. Sempre que possível o
									texto original é removido do PDF; quando não é seguro, ele é
									coberto com esta cor. A fonte embutida do PDF é reutilizada se
									tiver todos os caracteres digitados.
								</p>
							</>
						)}
						<div className="grid grid-cols-2 gap-2 border-t pt-4">
							<Button
								type="button"
								size="sm"
								variant="outline"
								onClick={onDuplicate}
							>
								<Copy /> Duplicar
							</Button>
							{selected.type !== "line" ? (
								<Button
									type="button"
									size="sm"
									variant="outline"
									onClick={onRotate}
								>
									<RotateCw /> Girar 90°
								</Button>
							) : (
								<span />
							)}
							<Button
								type="button"
								size="sm"
								variant="outline"
								onClick={() => onReorder("front")}
							>
								<BringToFront /> Frente
							</Button>
							<Button
								type="button"
								size="sm"
								variant="outline"
								onClick={() => onReorder("back")}
							>
								<SendToBack /> Trás
							</Button>
							<Button
								type="button"
								size="sm"
								variant="destructive"
								className="col-span-2"
								onClick={onDelete}
							>
								{selected.type === "text" && selected.cover ? (
									<>
										<Undo2 /> Restaurar original
									</>
								) : (
									<>
										<Trash2 /> Excluir
									</>
								)}
							</Button>
						</div>
					</>
				) : toolDefaults ? (
					<StyleFields
						kind={toolDefaults.kind}
						values={defaults[toolDefaults.key] as unknown as Patch}
						onChange={(p) => onDefaultsChange(toolDefaults.key, p)}
					/>
				) : (
					<div className="space-y-4 text-sm text-muted-foreground">
						<p>
							{tool === "editText"
								? "Clique em qualquer trecho de texto do PDF para editá-lo. O texto novo substitui o original na mesma posição."
								: "Selecione um objeto para editar suas propriedades, ou escolha uma ferramenta na barra superior."}
						</p>
						<div className="space-y-1.5">
							<p className="text-xs font-semibold uppercase tracking-wider">
								Atalhos
							</p>
							<ul className="space-y-1 text-xs">
								{TOOLS.map((t) => (
									<li key={t.id} className="flex justify-between gap-2">
										<span>{t.label}</span>
										<kbd className="rounded border bg-muted px-1.5 font-mono text-[10px] uppercase">
											{t.key}
										</kbd>
									</li>
								))}
								{SHORTCUTS.map(([k, label]) => (
									<li key={k} className="flex justify-between gap-2">
										<span>{label}</span>
										<kbd className="rounded border bg-muted px-1.5 font-mono text-[10px]">
											{k}
										</kbd>
									</li>
								))}
							</ul>
						</div>
						<p className="flex items-start gap-1.5 text-xs">
							Tudo é processado no seu navegador — o PDF nunca é enviado a um
							servidor.
						</p>
					</div>
				)}
			</div>
		</div>
	);
}

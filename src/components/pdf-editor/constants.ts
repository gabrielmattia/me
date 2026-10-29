import {
	Circle,
	Eraser,
	Highlighter,
	type LucideIcon,
	Minus,
	MousePointer2,
	MoveUpRight,
	PenLine,
	Square,
	TextCursorInput,
	Type,
} from "lucide-react";
import type { Tool, ToolDefaults } from "./types";

export const TOOLS: Array<{
	id: Tool;
	label: string;
	icon: LucideIcon;
	key: string;
	group: "edit" | "annotate" | "shape";
}> = [
	{
		id: "select",
		label: "Selecionar",
		icon: MousePointer2,
		key: "v",
		group: "edit",
	},
	{
		id: "editText",
		label: "Editar texto",
		icon: TextCursorInput,
		key: "e",
		group: "edit",
	},
	{ id: "text", label: "Texto", icon: Type, key: "t", group: "edit" },
	{ id: "pen", label: "Desenhar", icon: PenLine, key: "p", group: "annotate" },
	{
		id: "highlight",
		label: "Marca-texto",
		icon: Highlighter,
		key: "h",
		group: "annotate",
	},
	{
		id: "whiteout",
		label: "Apagar",
		icon: Eraser,
		key: "w",
		group: "annotate",
	},
	{ id: "rect", label: "Retângulo", icon: Square, key: "r", group: "shape" },
	{ id: "ellipse", label: "Elipse", icon: Circle, key: "o", group: "shape" },
	{ id: "line", label: "Linha", icon: Minus, key: "l", group: "shape" },
	{ id: "arrow", label: "Seta", icon: MoveUpRight, key: "a", group: "shape" },
];

export const DEFAULTS: ToolDefaults = {
	text: {
		fontFamily: "Helvetica",
		fontSize: 14,
		color: "#111827",
		bold: false,
		italic: false,
		underline: false,
		align: "left",
	},
	shape: { fill: null, stroke: "#2563eb", strokeWidth: 2, opacity: 1 },
	pen: { color: "#2563eb", strokeWidth: 2, opacity: 1 },
	highlight: { color: "#facc15", opacity: 0.4 },
	line: { color: "#dc2626", strokeWidth: 2, opacity: 1 },
	whiteout: { color: "#ffffff" },
};

export const SWATCHES = [
	"#111827",
	"#ffffff",
	"#dc2626",
	"#ea580c",
	"#facc15",
	"#16a34a",
	"#2563eb",
	"#7c3aed",
	"#db2777",
];

export const HIGHLIGHT_SWATCHES = [
	"#facc15",
	"#4ade80",
	"#22d3ee",
	"#f472b6",
	"#fb923c",
];

export const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3];

/** Cor de seleção (handles/contornos) — fixa para contrastar com qualquer PDF. */
export const ACCENT = "#2563eb";

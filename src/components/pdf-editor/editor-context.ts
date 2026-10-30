import {
	createContext,
	type Dispatch,
	type SetStateAction,
	useContext,
} from "react";
import type { DocAction } from "./state";
import type {
	DocState,
	EditorObject,
	TextObject,
	Tool,
	ToolDefaults,
} from "./types";

export interface TextDraft {
	object: TextObject;
	/** `true` = ainda não existe no documento (texto novo ou bloco do PDF). */
	isNew: boolean;
}

export interface NoticeAction {
	label: string;
	run: () => void;
}

export interface EditorContextValue {
	doc: DocState;
	dispatch: Dispatch<DocAction>;
	zoom: number;
	tool: Tool;
	setTool: (tool: Tool) => void;
	selectedId: string | null;
	select: (id: string | null) => void;
	defaults: ToolDefaults;
	draft: TextDraft | null;
	setDraft: Dispatch<SetStateAction<TextDraft | null>>;
	/** Confirma o rascunho de texto; com `id`, só se ainda for o rascunho atual. */
	commitDraft: (id?: string) => void;
	/** Aviso curto no topo do visualizador (com ações opcionais). */
	notify: (msg: string, action?: NoticeAction | NoticeAction[]) => void;
	/** Cria uma cópia (texto: uma linha abaixo, mesma tipografia) e seleciona. */
	duplicate: (obj: EditorObject) => void;
	/** Conta-gotas: id do texto que vai receber o estilo clicado. */
	stylePick: string | null;
	/** Aplica o estilo copiado ao texto alvo do conta-gotas e sai do modo. */
	applyPickedStyle: (patch: Partial<TextObject>) => void;
	cancelStylePick: () => void;
}

export const EditorContext = createContext<EditorContextValue | null>(null);

export function useEditor(): EditorContextValue {
	const ctx = useContext(EditorContext);
	if (!ctx) throw new Error("useEditor fora do EditorContext");
	return ctx;
}

/** Ferramentas que desenham sobre a página: objetos não capturam o clique. */
export const DRAWING_TOOLS: ReadonlySet<Tool> = new Set<Tool>([
	"pen",
	"highlight",
	"whiteout",
	"rect",
	"ellipse",
	"line",
	"arrow",
]);

/** Acompanha o ponteiro na janela inteira até soltar (funciona fora do elemento). */
export function trackPointer(
	onMove: (ev: PointerEvent) => void,
	onEnd: (ev: PointerEvent) => void,
) {
	const move = (ev: PointerEvent) => onMove(ev);
	const end = (ev: PointerEvent) => {
		window.removeEventListener("pointermove", move);
		window.removeEventListener("pointerup", end);
		window.removeEventListener("pointercancel", end);
		document.body.style.userSelect = "";
		onEnd(ev);
	};
	document.body.style.userSelect = "none";
	window.addEventListener("pointermove", move);
	window.addEventListener("pointerup", end);
	window.addEventListener("pointercancel", end);
}

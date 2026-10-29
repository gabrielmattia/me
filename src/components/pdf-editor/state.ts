import { normalizeRotation } from "./geometry";
import type { DocState, EditorObject, PageModel, TextObject } from "./types";

const HISTORY_LIMIT = 100;

export interface HistoryState {
	past: DocState[];
	present: DocState;
	future: DocState[];
	/** Chave da última alteração registrada — alterações seguidas com a mesma chave viram um único passo de undo. */
	lastKey: string | null;
}

export type DocAction =
	| { type: "reset"; doc: DocState }
	| { type: "undo" }
	| { type: "redo" }
	/** Grava o estado atual no histórico (início de um arraste). */
	| { type: "checkpoint" }
	| { type: "addObject"; object: EditorObject }
	| {
			type: "updateObject";
			id: string;
			patch: Partial<EditorObject>;
			/** `false` = não grava no histórico (movimentos intermediários de arraste). */
			record?: boolean;
			coalesce?: string;
	  }
	| {
			type: "replaceObject";
			object: EditorObject;
			record?: boolean;
			coalesce?: string;
	  }
	| { type: "removeObject"; id: string }
	| { type: "reorderObject"; id: string; to: "front" | "back" }
	| { type: "addPages"; pages: PageModel[]; at?: number }
	| { type: "movePage"; id: string; to: number }
	| { type: "rotatePage"; id: string; delta: number }
	| { type: "deletePage"; id: string }
	| { type: "duplicatePage"; id: string };

export const uid = () => crypto.randomUUID();

/** Propriedades que, se mudarem, tornam a edição de um texto existente real. */
export function sourceSnapshot(t: TextObject): string {
	return JSON.stringify([
		t.content,
		t.x,
		t.y,
		t.rotation,
		t.opacity,
		t.fontFamily,
		t.fontSize,
		t.color,
		t.bold,
		t.italic,
		t.align ?? "left",
		t.pdfFont ?? null,
	]);
}

/**
 * Texto existente "editado" mas idêntico ao original: não deve gerar nenhuma
 * mudança (nem cobertura, nem diferença na exportação).
 */
export function isUnchangedSourceEdit(o: EditorObject): boolean {
	return (
		o.type === "text" &&
		o.source !== undefined &&
		sourceSnapshot(o) === o.source.initial
	);
}

export function initHistory(doc: DocState): HistoryState {
	return { past: [], present: doc, future: [], lastKey: null };
}

function reduceDoc(doc: DocState, action: DocAction): DocState {
	switch (action.type) {
		case "addObject":
			return { ...doc, objects: [...doc.objects, action.object] };
		case "updateObject":
			return {
				...doc,
				objects: doc.objects.map((o) =>
					o.id === action.id ? ({ ...o, ...action.patch } as EditorObject) : o,
				),
			};
		case "replaceObject":
			return {
				...doc,
				objects: doc.objects.map((o) =>
					o.id === action.object.id ? action.object : o,
				),
			};
		case "removeObject":
			return { ...doc, objects: doc.objects.filter((o) => o.id !== action.id) };
		case "reorderObject": {
			const obj = doc.objects.find((o) => o.id === action.id);
			if (!obj) return doc;
			const rest = doc.objects.filter((o) => o.id !== action.id);
			return {
				...doc,
				objects: action.to === "front" ? [...rest, obj] : [obj, ...rest],
			};
		}
		case "addPages": {
			const pages = [...doc.pages];
			pages.splice(action.at ?? pages.length, 0, ...action.pages);
			return { ...doc, pages };
		}
		case "movePage": {
			const from = doc.pages.findIndex((p) => p.id === action.id);
			if (from < 0) return doc;
			const pages = [...doc.pages];
			const [page] = pages.splice(from, 1);
			pages.splice(Math.max(0, Math.min(pages.length, action.to)), 0, page);
			return { ...doc, pages };
		}
		case "rotatePage":
			return {
				...doc,
				pages: doc.pages.map((p) =>
					p.id === action.id
						? { ...p, rotation: normalizeRotation(p.rotation + action.delta) }
						: p,
				),
			};
		case "deletePage":
			if (doc.pages.length <= 1) return doc;
			return {
				pages: doc.pages.filter((p) => p.id !== action.id),
				objects: doc.objects.filter((o) => o.pageId !== action.id),
			};
		case "duplicatePage": {
			const idx = doc.pages.findIndex((p) => p.id === action.id);
			const page = doc.pages[idx];
			if (!page) return doc;
			const copy: PageModel = { ...page, id: uid() };
			const pages = [...doc.pages];
			pages.splice(idx + 1, 0, copy);
			const copies = doc.objects
				.filter((o) => o.pageId === page.id)
				.map((o) => ({ ...o, id: uid(), pageId: copy.id }));
			return { pages, objects: [...doc.objects, ...copies] };
		}
		default:
			return doc;
	}
}

export function historyReducer(
	state: HistoryState,
	action: DocAction,
): HistoryState {
	switch (action.type) {
		case "reset":
			return initHistory(action.doc);
		case "undo": {
			const prev = state.past[state.past.length - 1];
			if (!prev) return state;
			return {
				past: state.past.slice(0, -1),
				present: prev,
				future: [state.present, ...state.future],
				lastKey: null,
			};
		}
		case "redo": {
			const [next, ...future] = state.future;
			if (!next) return state;
			return {
				past: [...state.past, state.present],
				present: next,
				future,
				lastKey: null,
			};
		}
		case "checkpoint":
			return {
				past: [...state.past, state.present].slice(-HISTORY_LIMIT),
				present: state.present,
				future: [],
				lastKey: null,
			};
		default: {
			const next = reduceDoc(state.present, action);
			if (next === state.present) return state;
			const record =
				!("record" in action) || action.record === undefined || action.record;
			if (!record) return { ...state, present: next };
			const coalesce = "coalesce" in action ? action.coalesce : undefined;
			if (coalesce && coalesce === state.lastKey) {
				return { ...state, present: next };
			}
			return {
				past: [...state.past, state.present].slice(-HISTORY_LIMIT),
				present: next,
				future: [],
				lastKey: coalesce ?? null,
			};
		}
	}
}

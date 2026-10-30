import {
	type PointerEvent as ReactPointerEvent,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { ACCENT } from "./constants";
import {
	DRAWING_TOOLS,
	type NoticeAction,
	trackPointer,
	useEditor,
} from "./editor-context";
import {
	baselineRatio,
	getPdfFont,
	roundSize,
	styleOf,
	withContent,
	withTextSize,
} from "./fonts";
import {
	clientToBase,
	displaySize,
	type Handle,
	normalizeRotation,
	placeLocalTopLeft,
	resizeBox,
	screenDeltaToBase,
	translateObject,
} from "./geometry";
import {
	LineSvg,
	ObjectView,
	SelectionFrame,
	TextDraftEditor,
} from "./objects";
import { getPdfPage, getTextBlocks, sampleColors } from "./pdf-source";
import {
	acceptsAutoStyle,
	baselineOffset,
	buildTargets,
	type Guide,
	type LineBox,
	lineId,
	type PdfLineRef,
	pdfLineAt,
	removalRefs,
	replacedLine,
	SNAP_PX,
	type SnapResult,
	snapBox,
	snapResize,
	styleForLine,
	textSpan,
} from "./snapping";
import { sourceSnapshot, uid } from "./state";
import type { StripResult } from "./text-removal";
import type {
	EditorObject,
	InkObject,
	LineObject,
	PageModel,
	PdfTextStyle,
	TextBlock,
	TextObject,
} from "./types";

type Preview =
	| { kind: "box"; x: number; y: number; w: number; h: number }
	| { kind: "ink"; points: Array<[number, number]> }
	| { kind: "line"; x1: number; y1: number; x2: number; y2: number };

const MAX_CANVAS_PIXELS = 16_000_000;

/** Duplo toque/clique: mesmo alvo, perto no tempo e no espaço. */
const DOUBLE_TAP_MS = 400;
const DOUBLE_TAP_PX = 12;

const MOD_KEY =
	typeof navigator !== "undefined" && /Mac|iP(hone|ad)/.test(navigator.platform)
		? "⌘"
		: "Ctrl+";

/** Estilo de um texto (o que o auto-estilo troca e "Desfazer estilo" devolve). */
type TextStyle = Pick<
	TextObject,
	| "fontFamily"
	| "bold"
	| "italic"
	| "fontSize"
	| "color"
	| "pdfFont"
	| "pdfStyle"
	| "styleOrigin"
	| "autoKerning"
>;

const styleSnapshot = (t: TextObject): TextStyle => ({
	fontFamily: t.fontFamily,
	bold: t.bold,
	italic: t.italic,
	fontSize: t.fontSize,
	color: t.color,
	pdfFont: t.pdfFont,
	pdfStyle: t.pdfStyle,
	styleOrigin: t.styleOrigin,
	autoKerning: t.autoKerning,
});

/** Mesma aparência (estilo, posição e ajustes), ignorando a origem do estilo. */
const looksSame = (a: TextObject, b: TextObject) => {
	const k = (t: TextObject) =>
		JSON.stringify([
			{ ...styleSnapshot(t), styleOrigin: undefined },
			t.x,
			t.y,
			t.pdfStyle?.kerning,
		]);
	return k(a) === k(b);
};

const NO_TEXT_NOTICE =
	"Esta página não tem texto editável: o conteúdo é uma imagem (PDF digitalizado). Use Texto para escrever por cima ou Apagar para cobrir.";

export function PageView({
	page,
	index,
	scrollRoot,
}: {
	page: PageModel;
	index: number;
	scrollRoot: HTMLElement | null;
}) {
	const {
		doc,
		dispatch,
		zoom,
		tool,
		setTool,
		selectedId,
		select,
		defaults,
		draft,
		setDraft,
		commitDraft,
		notify,
		duplicate,
		stylePick,
		applyPickedStyle,
		cancelStylePick,
	} = useEditor();
	const outerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [near, setNear] = useState(false);
	/** Blocos de texto existentes; `null` = ainda não carregados. */
	const [blocks, setBlocks] = useState<TextBlock[] | null>(null);
	const lastTap = useRef<{ key: string; t: number; x: number; y: number }>(
		null,
	);
	const [hoverBlock, setHoverBlock] = useState<string | null>(null);
	/** Guias de encaixe visíveis durante o arraste. */
	const [guides, setGuides] = useState<Guide[]>([]);
	/** Linha do PDF onde o texto arrastado vai encaixar (realce). */
	const [snapLine, setSnapLine] = useState<LineBox | null>(null);
	/** Estilo exato de cada bloco do PDF (para o auto-estilo), por chave. */
	const styleCache = useRef(new Map<string, Promise<TextObject | null>>());
	const [preview, setPreview] = useState<Preview | null>(null);
	const [strip, setStrip] = useState<{
		key: string;
		result: StripResult;
	} | null>(null);
	/** Blocos cujo texto original já não aparece no canvas desenhado. */
	const [paintedRemoved, setPaintedRemoved] = useState<Set<string>>(
		() => new Set(),
	);

	const objects = useMemo(
		() => doc.objects.filter((o) => o.pageId === page.id),
		[doc.objects, page.id],
	);
	const objectsRef = useRef(objects);
	objectsRef.current = objects;
	const disp = displaySize(page);
	const pageDraft = draft?.object.pageId === page.id ? draft : null;
	const draftRef = useRef(draft);
	draftRef.current = draft;

	// Textos existentes editados e linhas substituídas nesta página (inclusive
	// pelo rascunho).
	const draftSource = pageDraft?.object.source;
	const draftReplaces = pageDraft?.object.replaces;
	// biome-ignore lint/correctness/useExhaustiveDependencies: só o que muda a remoção
	const sourceRefs = useMemo(() => {
		const d = draftRef.current?.object;
		return removalRefs(d && d.pageId === page.id ? [...objects, d] : objects);
	}, [objects, draftSource, draftReplaces, page.id]);
	const stripKey = sourceRefs
		.map((r) => r.key)
		.sort()
		.join(",");

	// Remove do content stream os textos substituídos (com verificação); o
	// canvas passa a desenhar a página sem eles.
	// biome-ignore lint/correctness/useExhaustiveDependencies: `sourceRefs` muda junto com `stripKey`
	useEffect(() => {
		if (!stripKey || !page.source) {
			setStrip(null);
			return;
		}
		let cancelled = false;
		const refs = sourceRefs;
		import("./text-removal")
			.then((m) => m.stripPage(page, refs))
			.then((result) => {
				if (!cancelled) setStrip({ key: stripKey, result });
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [stripKey, page]);
	// Enquanto a nova remoção não fica pronta, mantém a anterior se ela só
	// remove blocos que continuam editados (evita piscar o texto original).
	const currentKeys = new Set(stripKey ? stripKey.split(",") : []);
	const usable =
		strip &&
		strip.result.removed.size > 0 &&
		[...strip.result.removed].every((k) => currentKeys.has(k))
			? strip.result
			: null;
	const previewDoc = usable?.preview ?? null;
	const previewRemoved = usable?.removed;

	// Só renderiza páginas próximas da área visível.
	useEffect(() => {
		const el = outerRef.current;
		if (!el) return;
		const obs = new IntersectionObserver(
			([entry]) => setNear(Boolean(entry?.isIntersecting)),
			{ root: scrollRoot, rootMargin: "800px 0px" },
		);
		obs.observe(el);
		return () => obs.disconnect();
	}, [scrollRoot]);

	const docId = page.source?.docId;
	const srcIndex = page.source?.index;
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas || !near || docId === undefined || srcIndex === undefined)
			return;
		let cancelled = false;
		let task: { cancel: () => void; promise: Promise<unknown> } | null = null;
		(async () => {
			const pdfPage = previewDoc
				? await previewDoc.getPage(1)
				: await getPdfPage(docId, srcIndex);
			if (!pdfPage || cancelled) return;
			const dpr = window.devicePixelRatio || 1;
			let scale = zoom * dpr;
			const area = page.width * page.height * scale * scale;
			if (area > MAX_CANVAS_PIXELS)
				scale *= Math.sqrt(MAX_CANVAS_PIXELS / area);
			const viewport = pdfPage.getViewport({ scale });
			// Renderiza fora da tela e troca no fim: sem flash branco ao dar zoom.
			const off = document.createElement("canvas");
			off.width = Math.ceil(viewport.width);
			off.height = Math.ceil(viewport.height);
			const offCtx = off.getContext("2d");
			if (!offCtx) return;
			task = pdfPage.render({ canvas: off, canvasContext: offCtx, viewport });
			await task.promise;
			if (cancelled) return;
			canvas.width = off.width;
			canvas.height = off.height;
			canvas.getContext("2d")?.drawImage(off, 0, 0);
			setPaintedRemoved(previewRemoved ?? new Set());
		})().catch(() => {
			/* render cancelado */
		});
		return () => {
			cancelled = true;
			task?.cancel();
		};
	}, [
		near,
		zoom,
		docId,
		srcIndex,
		page.width,
		page.height,
		previewDoc,
		previewRemoved,
	]);

	// Texto existente fica editável com Selecionar (duplo clique) e com
	// Editar texto (um clique): carrega os blocos de toda página próxima.
	const wantsBlocks = !DRAWING_TOOLS.has(tool) || Boolean(stylePick);
	useEffect(() => {
		if (!wantsBlocks || !near) return;
		let cancelled = false;
		getTextBlocks(page)
			.then((b) => {
				if (cancelled) return;
				styleCache.current.clear();
				setBlocks(b);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [wantsBlocks, near, page]);

	const isDoubleTap = (key: string, e: ReactPointerEvent<Element>) => {
		const now = performance.now();
		const last = lastTap.current;
		const hit =
			last !== null &&
			last.key === key &&
			now - last.t < DOUBLE_TAP_MS &&
			Math.hypot(e.clientX - last.x, e.clientY - last.y) < DOUBLE_TAP_PX;
		lastTap.current = hit ? null : { key, t: now, x: e.clientX, y: e.clientY };
		return hit;
	};

	const noEditableText =
		Boolean(page.source) && blocks !== null && blocks.length === 0;

	const toBase = (clientX: number, clientY: number) => {
		const el = outerRef.current;
		if (!el) return [0, 0] as [number, number];
		return clientToBase(clientX, clientY, el, page, zoom);
	};

	// ── Criação de objetos ────────────────────────────────────────────────

	const addAndSelect = (obj: EditorObject) => {
		dispatch({ type: "addObject", object: obj });
		select(obj.id);
	};

	const startTextDraft = (bx: number, by: number, noSnap: boolean) => {
		const rotation = normalizeRotation(-page.rotation);
		let obj: TextObject = withTextSize({
			id: uid(),
			type: "text",
			pageId: page.id,
			x: 0,
			y: 0,
			w: 1,
			h: 1,
			rotation: 0,
			opacity: 1,
			content: "",
			...defaults.text,
		});
		const top = by - obj.h / 2;
		obj = {
			...obj,
			rotation,
			...placeLocalTopLeft(obj.w, obj.h, rotation, bx, top),
		};
		// Clique em cima de uma linha do PDF: o texto nasce na baseline dela
		// (no início, se o clique foi perto) e recebe o estilo dela.
		let snap: SnapResult<TextObject> | null = null;
		const tol = SNAP_PX / zoom;
		const hit =
			!noSnap && rotation === 0 && blocks
				? pdfLineAt(unreplacedBlocks(), bx, by, tol, replacedLines())
				: null;
		if (hit) {
			const l = hit.block.lines[hit.line];
			const atStart = Math.abs(bx - l.x) <= tol;
			obj = {
				...obj,
				x: atStart ? l.x : bx,
				y: l.baseline - baselineOffset(obj),
			};
			snap = {
				obj,
				guides: [],
				pdfY: { ...hit, movingLine: 0 },
				pdfX: atStart ? { ...hit, kind: "start" } : undefined,
			};
		} else if (!noSnap) {
			obj = snapBox(obj, snapTargets(obj.id), tol).obj;
		}
		// Como no Google Slides/Canva/iLovePDF: criou a caixa, volta para
		// Selecionar (o próximo clique na página não cria outra caixa).
		setTool("select");
		select(null);
		setDraft({ object: obj, isNew: true });
		if (snap) dropOnLine(snap, true);
	};

	const blockColors = (block: TextBlock) => {
		const canvas = canvasRef.current;
		if (!canvas || canvas.width === 0)
			return { background: "#ffffff", foreground: "#000000" };
		const k = canvas.width / page.width;
		return sampleColors(canvas, {
			x: block.x * k,
			y: block.y * k,
			w: block.w * k,
			h: block.h * k,
		});
	};

	/**
	 * Objeto de texto idêntico ao bloco do PDF: fonte embutida (se houver),
	 * tamanho, cor e, com `pdfStyle`, Tc/Tw/Tz e ajuste de cada caractere.
	 */
	const blockText = (
		block: TextBlock,
		id: string,
		color: string,
		background: string,
		pdfFont: string | undefined,
		pdfStyle: PdfTextStyle | undefined,
	): TextObject => {
		const base: TextObject = {
			id,
			type: "text",
			pageId: page.id,
			x: block.x,
			y: 0,
			w: block.w,
			h: block.h,
			rotation: 0,
			opacity: 1,
			content: block.str,
			fontFamily: block.fontFamily,
			fontSize: roundSize(block.fontSize),
			lineHeight:
				block.lines.length > 1 ? block.leading / block.fontSize : undefined,
			color,
			bold: block.bold,
			italic: block.italic,
			align: "left",
			pdfFont,
			pdfStyle: pdfStyle && { ...pdfStyle, color },
			cover: {
				x: block.x - 1,
				y: block.y - 1,
				w: block.w + 2,
				h: block.h + 2,
				color: background,
			},
		};
		// A baseline da primeira linha fica exatamente na baseline original.
		const placed = withTextSize({
			...base,
			y: block.baseline - baselineRatio(base) * base.fontSize,
		});
		return {
			...placed,
			source: {
				key: block.key,
				text: block.str,
				lines: block.lines,
				color,
				initial: sourceSnapshot(placed),
				font: pdfFont
					? {
							pdfFont,
							fontFamily: block.fontFamily,
							bold: block.bold,
							italic: block.italic,
							pdfStyle: placed.pdfStyle,
						}
					: undefined,
			},
		};
	};

	/** Estilo exato do content stream (cor, fonte reutilizável, espaçamentos). */
	const exactBlockText = async (
		block: TextBlock,
		id: string,
		colors: { background: string; foreground: string },
	) => {
		const m = await import("./text-removal");
		const res = await m.blockTextStyle(page, block).catch(() => null);
		const pdfFont =
			res && getPdfFont(block.fontName) ? block.fontName : undefined;
		return blockText(
			block,
			id,
			res?.color ?? colors.foreground,
			colors.background,
			pdfFont,
			pdfFont ? res?.style : undefined,
		);
	};

	const startBlockEdit = (block: TextBlock) => {
		if (draft) commitDraft();
		const colors = blockColors(block);
		const id = uid();
		const pdfFont = getPdfFont(block.fontName) ? block.fontName : undefined;
		const initial = blockText(
			block,
			id,
			colors.foreground,
			colors.background,
			pdfFont,
			undefined,
		);
		select(null);
		setDraft({ object: initial, isNew: true });

		// Estilo exato do content stream: cor original e se a fonte embutida
		// pode ser reutilizada (precisa casar com um operador de texto).
		exactBlockText(block, id, colors)
			.then((exact) => {
				setDraft((d) => {
					if (!d || d.object.id !== id) return d;
					const o = d.object;
					// O que o usuário já digitou/mudou prevalece.
					const kept = withContent(exact, o.content);
					return {
						...d,
						object: withTextSize({
							...kept,
							color: o.color === initial.color ? exact.color : o.color,
						}),
					};
				});
			})
			.catch(() => {});
	};

	/** Duplica um texto do PDF sem tocar no original: cria só um objeto novo. */
	const duplicateBlock = (block: TextBlock) => {
		const colors = blockColors(block);
		exactBlockText(block, uid(), colors)
			.then((exact) => duplicate(exact))
			.catch(() => {});
	};

	/** Conta-gotas: estilo de um bloco do PDF para o texto alvo. */
	const pickBlockStyle = (block: TextBlock) => {
		const colors = blockColors(block);
		exactBlockText(block, uid(), colors)
			.then((exact) => applyPickedStyle(styleOf(exact)))
			.catch(() => {});
	};

	// ── Encaixe e auto-estilo ─────────────────────────────────────────────

	/** Blocos do PDF ainda desenhados (os substituídos por edição saem). */
	const unreplacedBlocks = () => {
		const replaced = new Set(sourceRefs.map((r) => r.key));
		return (blocks ?? []).filter((b) => !replaced.has(b.key));
	};

	/** Bloco editado inteiro ou com todas as linhas substituídas por textos. */
	const isReplaced = (b: TextBlock) => {
		const keys = new Set(sourceRefs.map((r) => r.key));
		return (
			keys.has(b.key) ||
			b.lines.every((_, line) => keys.has(lineId({ block: b, line })))
		);
	};

	/** Linhas do PDF substituídas por textos (menos o `excludeId`). */
	const replacedLines = (excludeId?: string) => {
		const keys = new Set<string>();
		const d = draftRef.current?.object;
		for (const o of d ? [...objectsRef.current, d] : objectsRef.current)
			if (o.type === "text" && o.replaces && o.id !== excludeId)
				keys.add(o.replaces.key);
		return keys;
	};

	/** Alvos de encaixe da página, sem o próprio objeto. */
	const snapTargets = (excludeId: string) => {
		const others = objectsRef.current.filter((o) => o.id !== excludeId);
		const d = pageDraft?.object;
		if (d && d.id !== excludeId && pageDraft?.isNew) others.push(d);
		return buildTargets(unreplacedBlocks(), others, replacedLines(excludeId));
	};

	/** Estilo exato de um bloco (cacheado: o arraste já pede ao encaixar). */
	const blockStyle = (block: TextBlock) => {
		let p = styleCache.current.get(block.key);
		if (!p) {
			p = exactBlockText(block, uid(), blockColors(block)).catch(() => null);
			styleCache.current.set(block.key, p);
		}
		return p;
	};

	/** Arraste com encaixe: devolve o objeto encaixado e guarda o último resultado. */
	const snapper = (excludeId: string) => {
		const targets = snapTargets(excludeId);
		let last: SnapResult | null = null;
		return {
			move<T extends EditorObject>(obj: T, ev: PointerEvent): T {
				if (ev.altKey) {
					last = null;
					setGuides([]);
					setSnapLine(null);
					return obj;
				}
				const r = snapBox(obj, targets, SNAP_PX / zoom);
				last = r;
				setGuides(r.guides);
				setSnapLine(r.obj.type === "text" ? (r.target ?? null) : null);
				if (r.pdfY) blockStyle(r.pdfY.block);
				return r.obj;
			},
			end() {
				setGuides([]);
				setSnapLine(null);
				return last;
			},
		};
	};

	/**
	 * Muda o texto `id`: o rascunho, se ainda estiver em edição; senão o
	 * objeto (uma entrada de undo).
	 */
	const patchText = (id: string, fn: (t: TextObject) => TextObject) => {
		if (draftRef.current?.object.id === id) {
			setDraft((d) =>
				d && d.object.id === id ? { ...d, object: fn(d.object) } : d,
			);
			return;
		}
		const cur = objectsRef.current.find((o) => o.id === id);
		if (cur?.type === "text")
			dispatch({ type: "replaceObject", object: fn(cur) });
	};

	/**
	 * Volta o estilo anterior ao auto-estilo, mantendo a baseline e o x, e
	 * lembra a escolha para essa linha. Se o original tinha saído junto com o
	 * estilo (conteúdo igual), ele volta.
	 */
	const revertStyle = (
		id: string,
		prev: TextStyle,
		ref: PdfLineRef,
		restoreOriginal: boolean,
	) =>
		patchText(id, (t) => {
			const baseline = t.y + baselineOffset(t);
			const n = withTextSize({
				...t,
				...prev,
				styleOrigin: "manual",
				styleKept: lineId(ref),
				replaces:
					restoreOriginal && t.replaces?.key === lineId(ref)
						? undefined
						: t.replaces,
			});
			return { ...n, y: baseline - baselineOffset(n) };
		});

	/** A linha pode sair do content stream (remoção verificada)? */
	const canRemoveLine = (ref: PdfLineRef) => {
		const r = replacedLine(ref);
		return import("./text-removal")
			.then((m) => m.stripPage(page, [{ key: r.key, lines: r.lines }]))
			.then((res) => res.removed.has(r.key))
			.catch(() => false);
	};

	/**
	 * Solto/criado em cima de uma linha do PDF (baseline encaixada nela e
	 * sobreposto na horizontal):
	 * - aplica o estilo da linha, mesmo que o usuário tenha mudado o estilo à
	 *   mão (só não na linha em que ele clicou "Desfazer estilo");
	 * - se o conteúdo e o estilo ficam iguais aos da linha, o texto substitui
	 *   o original (sem isso a sobreposição escurece as bordas);
	 * - avisa com "Desfazer estilo" e "Substituir original"/"Manter original".
	 * No arraste, tudo entra no mesmo passo de undo do movimento.
	 */
	const dropOnLine = (r: SnapResult, isDraft: boolean) => {
		const ref = r.pdfY;
		const moved = r.obj;
		if (!ref || moved.type !== "text" || moved.rotation !== 0 || moved.source)
			return;
		const l = ref.block.lines[ref.line];
		const [a, z] = textSpan(moved);
		if (moved.x + z < l.x || moved.x + a > l.x + l.w) return;
		const anchor =
			r.pdfX && r.pdfX.block.key === ref.block.key && r.pdfX.line === ref.line
				? r.pdfX.kind
				: null;
		const key = lineId(ref);
		const taken = replacedLines(moved.id).has(key);
		Promise.all([
			blockStyle(ref.block),
			taken ? false : canRemoveLine(ref),
		]).then(([exact, removable]) => {
			const base = isDraft
				? draftRef.current?.object
				: objectsRef.current.find((o) => o.id === moved.id);
			if (base?.type !== "text" || base.id !== moved.id) return;
			// O último passo do arraste pode ainda não ter renderizado.
			const t: TextObject = isDraft
				? base
				: { ...base, x: moved.x, y: moved.y };
			let n = t;
			let prev: TextStyle | null = null;
			if (exact && acceptsAutoStyle(t, ref)) {
				const styled = styleForLine(t, exact, ref, anchor);
				if (!looksSame(styled, t)) {
					prev = styleSnapshot(t);
					n = styled;
				}
			}
			const lineStyle =
				exact !== null && looksSame(styleForLine(n, exact, ref, anchor), n);
			let autoReplaced = false;
			if (
				removable &&
				lineStyle &&
				n.content === l.str &&
				n.replaces?.key !== key
			) {
				n = { ...n, replaces: replacedLine(ref) };
				autoReplaced = true;
			}
			if (n !== t) {
				const next = n;
				if (isDraft)
					setDraft((d) =>
						d && d.object.id === moved.id ? { ...d, object: next } : d,
					);
				else dispatch({ type: "replaceObject", object: next, record: false });
			}
			const actions: NoticeAction[] = [];
			if (autoReplaced)
				actions.push({
					label: "Manter original",
					run: () =>
						patchText(moved.id, (o) =>
							o.replaces?.key === key ? { ...o, replaces: undefined } : o,
						),
				});
			else if (removable && n.content.trim() && n.replaces?.key !== key)
				actions.push({
					label: "Substituir original",
					run: () =>
						patchText(moved.id, (o) => ({ ...o, replaces: replacedLine(ref) })),
				});
			const before: TextStyle | null = prev;
			if (before)
				actions.push({
					label: "Desfazer estilo",
					run: () => revertStyle(moved.id, before, ref, autoReplaced),
				});
			if (actions.length === 0) return;
			notify(
				autoReplaced
					? "Texto encaixado no lugar da linha do PDF (original substituído)."
					: before
						? "Estilo da linha do PDF aplicado."
						: "Texto encaixado na linha do PDF.",
				actions,
			);
		});
	};

	// Ctrl/Cmd+D com o ponteiro sobre um texto do PDF duplica esse texto.
	const hovered =
		blocks?.find((b) => b.key === hoverBlock && !isReplaced(b)) ?? null;
	const duplicateRef = useRef(duplicateBlock);
	duplicateRef.current = duplicateBlock;
	useEffect(() => {
		if (!hovered) return;
		const onKey = (e: KeyboardEvent) => {
			if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "d") return;
			const el = e.target as HTMLElement | null;
			if (el?.closest("input, textarea, select, [contenteditable=true]"))
				return;
			e.preventDefault();
			duplicateRef.current(hovered);
		};
		// Captura: roda antes do atalho global de duplicar o objeto selecionado.
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	}, [hovered]);

	const onOverlayPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
		if (e.button !== 0) return;
		if (stylePick) {
			// Clique fora de um texto cancela o conta-gotas (sem sair da edição).
			e.preventDefault();
			cancelStylePick();
			return;
		}
		if (draft) commitDraft();
		const [sx, sy] = toBase(e.clientX, e.clientY);

		if (tool === "select" || tool === "editText") {
			select(null);
			const dbl = isDoubleTap("page", e);
			if (noEditableText && (tool === "editText" || dbl))
				notify(NO_TEXT_NOTICE);
			return;
		}
		e.preventDefault();
		if (tool === "text") {
			startTextDraft(sx, sy, e.altKey);
			return;
		}

		if (tool === "pen") {
			const points: Array<[number, number]> = [[sx, sy]];
			setPreview({ kind: "ink", points: [...points] });
			trackPointer(
				(ev) => {
					const p = toBase(ev.clientX, ev.clientY);
					const last = points[points.length - 1];
					if (Math.hypot(p[0] - last[0], p[1] - last[1]) * zoom < 1.5) return;
					points.push(p);
					setPreview({ kind: "ink", points: [...points] });
				},
				() => {
					setPreview(null);
					const { color, strokeWidth, opacity } = defaults.pen;
					const pad = strokeWidth / 2;
					const xs = points.map((p) => p[0]);
					const ys = points.map((p) => p[1]);
					const x = Math.min(...xs) - pad;
					const y = Math.min(...ys) - pad;
					const w = Math.max(...xs) + pad - x;
					const h = Math.max(...ys) + pad - y;
					const ink: InkObject = {
						id: uid(),
						type: "ink",
						pageId: page.id,
						x,
						y,
						w,
						h,
						rotation: 0,
						opacity,
						color,
						strokeWidth,
						points: points.map(([px, py]) => [(px - x) / w, (py - y) / h]),
					};
					dispatch({ type: "addObject", object: ink });
				},
			);
			return;
		}

		if (tool === "line" || tool === "arrow") {
			let end: [number, number] = [sx, sy];
			setPreview({ kind: "line", x1: sx, y1: sy, x2: sx, y2: sy });
			trackPointer(
				(ev) => {
					end = snapAngle(sx, sy, toBase(ev.clientX, ev.clientY), ev.shiftKey);
					setPreview({ kind: "line", x1: sx, y1: sy, x2: end[0], y2: end[1] });
				},
				() => {
					setPreview(null);
					if (Math.hypot(end[0] - sx, end[1] - sy) < 3) return;
					const line: LineObject = {
						id: uid(),
						type: "line",
						pageId: page.id,
						x1: sx,
						y1: sy,
						x2: end[0],
						y2: end[1],
						arrow: tool === "arrow",
						...defaults.line,
					};
					addAndSelect(line);
				},
			);
			return;
		}

		// Ferramentas de caixa: retângulo, elipse, marca-texto, apagar.
		let box = { x: sx, y: sy, w: 0, h: 0 };
		setPreview({ kind: "box", ...box });
		trackPointer(
			(ev) => {
				const [cx, cy] = toBase(ev.clientX, ev.clientY);
				let w = cx - sx;
				let h = cy - sy;
				if (ev.shiftKey && (tool === "rect" || tool === "ellipse")) {
					const s = Math.max(Math.abs(w), Math.abs(h));
					w = Math.sign(w || 1) * s;
					h = Math.sign(h || 1) * s;
				}
				box = {
					x: Math.min(sx, sx + w),
					y: Math.min(sy, sy + h),
					w: Math.abs(w),
					h: Math.abs(h),
				};
				setPreview({ kind: "box", ...box });
			},
			() => {
				setPreview(null);
				if (box.w < 3 || box.h < 3) return;
				const common = {
					id: uid(),
					pageId: page.id,
					rotation: 0 as const,
					...box,
				};
				if (tool === "highlight") {
					addAndSelect({ ...common, type: "highlight", ...defaults.highlight });
				} else if (tool === "whiteout") {
					addAndSelect({
						...common,
						type: "whiteout",
						opacity: 1,
						...defaults.whiteout,
					});
				} else if (tool === "rect" || tool === "ellipse") {
					addAndSelect({ ...common, type: tool, ...defaults.shape });
				}
			},
		);
	};

	// ── Interação com objetos existentes ─────────────────────────────────

	/**
	 * Arraste genérico: `apply` recebe o deslocamento (espaço base) desde o
	 * início. Só começa depois de `threshold` px — clique sem mover não altera
	 * nada (nem histórico).
	 */
	const drag = (
		e: ReactPointerEvent<Element>,
		threshold: number,
		onStart: () => void,
		apply: (dx: number, dy: number, ev: PointerEvent) => void,
		onEnd?: (started: boolean) => void,
	) => {
		const startX = e.clientX;
		const startY = e.clientY;
		let started = false;
		trackPointer(
			(ev) => {
				const sdx = ev.clientX - startX;
				const sdy = ev.clientY - startY;
				if (!started) {
					if (Math.hypot(sdx, sdy) < threshold) return;
					started = true;
					onStart();
				}
				const [dx, dy] = screenDeltaToBase(sdx, sdy, page, zoom);
				apply(dx, dy, ev);
			},
			() => onEnd?.(started),
		);
	};

	/** Objeto do documento: um checkpoint por gesto, passos intermediários fora do histórico. */
	const dragDocObject = (
		e: ReactPointerEvent<Element>,
		threshold: number,
		next: (dx: number, dy: number, ev: PointerEvent) => EditorObject | null,
		onEnd?: (started: boolean) => void,
	) =>
		drag(
			e,
			threshold,
			() => dispatch({ type: "checkpoint" }),
			(dx, dy, ev) => {
				const object = next(dx, dy, ev);
				if (object) dispatch({ type: "replaceObject", object, record: false });
			},
			onEnd,
		);

	/** Texto em edição: altera só o rascunho (vira uma entrada ao confirmar). */
	const dragDraft = (
		e: ReactPointerEvent<Element>,
		threshold: number,
		next: (
			start: TextObject,
			dx: number,
			dy: number,
			ev: PointerEvent,
		) => TextObject,
		onEnd?: (started: boolean) => void,
	) => {
		const start = draft?.object;
		if (!start) return;
		drag(
			e,
			threshold,
			() => {},
			(dx, dy, ev) =>
				setDraft((d) =>
					d && d.object.id === start.id
						? { ...d, object: next(start, dx, dy, ev) }
						: d,
				),
			onEnd,
		);
	};

	/** Alça de redimensionar com encaixe da borda que ela move. */
	const resizeSnapper = (obj: EditorObject) => {
		const targets = snapTargets(obj.id);
		return (
			handle: Handle | "p1" | "p2",
			dx: number,
			dy: number,
			ev: PointerEvent,
		): [number, number] => {
			if (ev.altKey) {
				setGuides([]);
				return [dx, dy];
			}
			const r = snapResize(obj, handle, dx, dy, targets, SNAP_PX / zoom);
			setGuides(r.guides);
			return [r.dx, r.dy];
		};
	};

	const onObjectPointerDown = (
		e: ReactPointerEvent<Element>,
		obj: EditorObject,
	) => {
		if (e.button !== 0 || DRAWING_TOOLS.has(tool)) return;
		e.stopPropagation();
		e.preventDefault();
		if (stylePick) {
			if (obj.type === "text" && obj.id !== stylePick)
				applyPickedStyle(styleOf(obj));
			else cancelStylePick();
			return;
		}
		if (draft && draft.object.id !== obj.id) commitDraft();
		// Clicar num objeto com a ferramenta Texto é para mexer nele.
		if (tool === "text") setTool("select");
		select(obj.id);
		if (obj.type === "text" && isDoubleTap(obj.id, e)) {
			setDraft({ object: obj, isNew: false });
			return;
		}
		const snap = snapper(obj.id);
		dragDocObject(
			e,
			3,
			(dx, dy, ev) => snap.move(translateObject(obj, dx, dy), ev),
			(started) => {
				const r = snap.end();
				if (started && r) dropOnLine(r, false);
			},
		);
	};

	const onHandleDown = (
		e: ReactPointerEvent<HTMLDivElement>,
		handle: Handle | "p1" | "p2",
		obj: EditorObject,
	) => {
		if (e.button !== 0) return;
		e.stopPropagation();
		e.preventDefault();
		const snap = resizeSnapper(obj);
		dragDocObject(
			e,
			1,
			(dx, dy, ev) => {
				const [sx, sy] = snap(handle, dx, dy, ev);
				return resizeObject(obj, handle, sx, sy, ev.shiftKey);
			},
			() => setGuides([]),
		);
	};

	const onDraftMoveDown = (e: ReactPointerEvent<HTMLDivElement>) => {
		if (e.button !== 0) return;
		// preventDefault mantém o foco no textarea: continua digitando depois.
		e.stopPropagation();
		e.preventDefault();
		const id = draft?.object.id;
		if (!id) return;
		const snap = snapper(id);
		dragDraft(
			e,
			1,
			(start, dx, dy, ev) => snap.move(translateObject(start, dx, dy), ev),
			(started) => {
				const r = snap.end();
				if (started && r) dropOnLine(r, true);
			},
		);
	};

	const onDraftHandleDown = (
		e: ReactPointerEvent<HTMLDivElement>,
		handle: Handle | "p1" | "p2",
	) => {
		if (e.button !== 0) return;
		e.stopPropagation();
		e.preventDefault();
		const start = draft?.object;
		if (!start) return;
		const snap = resizeSnapper(start);
		dragDraft(
			e,
			1,
			(s0, dx, dy, ev) => {
				const [sx, sy] = snap(handle, dx, dy, ev);
				const next = resizeObject(s0, handle, sx, sy, ev.shiftKey);
				return next?.type === "text" ? next : s0;
			},
			() => setGuides([]),
		);
	};

	const onBlockPointerDown = (
		e: ReactPointerEvent<HTMLButtonElement>,
		b: TextBlock,
	) => {
		if (e.button !== 0) return;
		e.stopPropagation();
		if (stylePick) {
			// preventDefault: o texto em edição não perde o foco.
			e.preventDefault();
			pickBlockStyle(b);
			return;
		}
		if (tool === "editText") {
			e.preventDefault();
			startBlockEdit(b);
			return;
		}
		// Selecionar: um clique é clique na página; duplo clique edita.
		if (draft) commitDraft();
		select(null);
		if (isDoubleTap(b.key, e)) {
			e.preventDefault();
			startBlockEdit(b);
		}
	};

	// ── Render ────────────────────────────────────────────────────────────

	const objectsInteractive = !DRAWING_TOOLS.has(tool) || Boolean(stylePick);
	const showBlocks =
		tool === "editText" || tool === "select" || Boolean(stylePick);

	const replacedBlocks = new Set(
		(blocks ?? []).filter((b) => isReplaced(b)).map((b) => b.key),
	);

	// Cobertura só para textos cujo original ainda está desenhado no canvas
	// (remoção pendente ou não segura).
	const covered = (o: TextObject) =>
		Boolean(o.cover) && !(o.source && paintedRemoved.has(o.source.key));
	const covers = objects
		.filter((o): o is TextObject => o.type === "text" && covered(o))
		.map((o) => ({ id: o.id, cover: o.cover }));
	if (pageDraft?.isNew && covered(pageDraft.object)) {
		covers.push({ id: pageDraft.object.id, cover: pageDraft.object.cover });
	}

	const selected = objects.find((o) => o.id === selectedId);
	const cursor = stylePick
		? "copy"
		: tool === "select" || tool === "editText"
			? "default"
			: tool === "text"
				? "text"
				: "crosshair";

	return (
		<div
			ref={outerRef}
			data-page-id={page.id}
			data-page-index={index}
			className="relative shrink-0 shadow-[0_2px_12px_rgba(0,0,0,0.18)] ring-1 ring-black/5 dark:shadow-[0_4px_24px_rgba(0,0,0,0.5)]"
			style={{ width: disp.w * zoom, height: disp.h * zoom }}
		>
			<div
				className="absolute bg-white"
				style={{
					width: page.width * zoom,
					height: page.height * zoom,
					left: ((disp.w - page.width) * zoom) / 2,
					top: ((disp.h - page.height) * zoom) / 2,
					transform: page.rotation ? `rotate(${page.rotation}deg)` : undefined,
				}}
			>
				{page.source && (
					<canvas
						ref={canvasRef}
						className="absolute inset-0 block"
						style={{ width: "100%", height: "100%" }}
					/>
				)}
				<div
					className="absolute inset-0"
					style={{
						cursor,
						touchAction: tool === "select" ? "pan-y pinch-zoom" : "none",
					}}
					onPointerDown={onOverlayPointerDown}
				>
					{covers.map(({ id, cover }) =>
						cover ? (
							<div
								key={`cover-${id}`}
								style={{
									position: "absolute",
									left: cover.x * zoom,
									top: cover.y * zoom,
									width: cover.w * zoom,
									height: cover.h * zoom,
									background: cover.color,
									pointerEvents: "none",
								}}
							/>
						) : null,
					)}

					{showBlocks &&
						blocks
							?.filter((b) => !replacedBlocks.has(b.key))
							.map((b) => (
								<button
									key={b.key}
									type="button"
									title={
										stylePick
											? "Clique para copiar o estilo deste texto"
											: tool === "editText"
												? "Clique para editar este texto (Ctrl+D duplica)"
												: "Duplo clique para editar este texto (Ctrl+D duplica)"
									}
									onPointerDown={(e) => onBlockPointerDown(e, b)}
									onMouseEnter={() => setHoverBlock(b.key)}
									onMouseLeave={() => setHoverBlock(null)}
									style={{
										position: "absolute",
										left: b.x * zoom - 1,
										top: b.y * zoom - 1,
										width: b.w * zoom + 2,
										height: b.h * zoom + 2,
										cursor: stylePick ? "copy" : "text",
										touchAction:
											tool === "select" ? "pan-y pinch-zoom" : "none",
										// Nada visível por padrão: só indica o bloco no hover.
										background:
											hoverBlock === b.key
												? tool === "editText"
													? "rgba(37,99,235,0.08)"
													: "rgba(37,99,235,0.04)"
												: "transparent",
										outline:
											hoverBlock === b.key
												? `1.5px ${tool === "editText" ? "solid" : "dashed"} ${ACCENT}`
												: "none",
										borderRadius: 2,
										padding: 0,
										border: 0,
									}}
								/>
							))}

					{objects.map((obj) =>
						pageDraft &&
						!pageDraft.isNew &&
						pageDraft.object.id === obj.id ? null : (
							<ObjectView
								key={obj.id}
								obj={obj}
								page={page}
								zoom={zoom}
								interactive={objectsInteractive}
								onPointerDown={onObjectPointerDown}
							/>
						),
					)}

					{preview?.kind === "box" && (
						<div
							style={{
								position: "absolute",
								left: preview.x * zoom,
								top: preview.y * zoom,
								width: preview.w * zoom,
								height: preview.h * zoom,
								pointerEvents: "none",
								...(tool === "highlight"
									? {
											background: defaults.highlight.color,
											opacity: defaults.highlight.opacity,
											mixBlendMode: "multiply",
										}
									: tool === "whiteout"
										? {
												background: defaults.whiteout.color,
												outline: "1px dashed #94a3b8",
											}
										: {
												border: `${Math.max(1, defaults.shape.strokeWidth * zoom)}px solid ${defaults.shape.stroke ?? ACCENT}`,
												background: defaults.shape.fill ?? "transparent",
												borderRadius: tool === "ellipse" ? "50%" : 0,
												opacity: defaults.shape.opacity,
											}),
							}}
						/>
					)}
					{preview?.kind === "ink" && (
						<svg
							aria-hidden="true"
							className="pointer-events-none absolute inset-0 overflow-visible"
							width={page.width * zoom}
							height={page.height * zoom}
							viewBox={`0 0 ${page.width} ${page.height}`}
						>
							<polyline
								points={preview.points.map((p) => p.join(",")).join(" ")}
								fill="none"
								stroke={defaults.pen.color}
								strokeOpacity={defaults.pen.opacity}
								strokeWidth={defaults.pen.strokeWidth}
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						</svg>
					)}
					{preview?.kind === "line" && (
						<LineSvg
							obj={{
								id: "preview",
								type: "line",
								pageId: page.id,
								...preview,
								...defaults.line,
								arrow: tool === "arrow",
							}}
							page={page}
							zoom={zoom}
							interactive={false}
						/>
					)}

					{selected && !pageDraft && (
						<SelectionFrame
							obj={selected}
							zoom={zoom}
							onHandleDown={(e, h) => onHandleDown(e, h, selected)}
						/>
					)}

					{pageDraft && (
						<SelectionFrame
							obj={pageDraft.object}
							zoom={zoom}
							onHandleDown={onDraftHandleDown}
							onMoveDown={onDraftMoveDown}
						/>
					)}

					{snapLine && (
						<div
							aria-hidden="true"
							className="pointer-events-none absolute rounded-[2px]"
							style={{
								zIndex: 45,
								left: snapLine.x * zoom - 2,
								top: snapLine.y * zoom - 2,
								width: snapLine.w * zoom + 4,
								height: snapLine.h * zoom + 4,
								background: "rgba(219, 39, 119, 0.12)",
								boxShadow: "inset 0 0 0 1px rgba(219, 39, 119, 0.55)",
							}}
						/>
					)}

					{guides.map((g) => (
						<div
							key={`${g.axis}:${g.v}`}
							aria-hidden="true"
							style={{
								position: "absolute",
								pointerEvents: "none",
								zIndex: 46,
								background: g.pdf ? "#db2777" : "#0891b2",
								...(g.axis === "x"
									? {
											left: g.v * zoom - 0.5,
											top: g.from * zoom - 4,
											width: 1,
											height: (g.to - g.from) * zoom + 8,
										}
									: {
											left: g.from * zoom - 4,
											top: g.v * zoom - 0.5,
											width: (g.to - g.from) * zoom + 8,
											height: 1,
										}),
							}}
						/>
					))}

					{hovered &&
						showBlocks &&
						!stylePick &&
						!pageDraft &&
						guides.length === 0 && (
							<div
								aria-hidden="true"
								className="pointer-events-none absolute z-40 select-none whitespace-nowrap rounded bg-neutral-900/85 px-1.5 py-0.5 text-[11px] leading-4 text-white shadow"
								style={{
									left: hovered.x * zoom,
									top:
										hovered.y * zoom >= 24
											? hovered.y * zoom - 22
											: (hovered.y + hovered.h) * zoom + 4,
								}}
							>
								{tool === "editText" ? "Clique" : "Duplo clique"} para editar ·{" "}
								{MOD_KEY}D para duplicar
							</div>
						)}

					{tool === "editText" && noEditableText && (
						<div className="pointer-events-none absolute inset-x-3 top-3 select-none rounded-md border border-amber-300 bg-amber-50/95 px-3 py-2 text-xs text-amber-900 shadow-sm">
							{NO_TEXT_NOTICE}
						</div>
					)}

					{pageDraft && (
						<TextDraftEditor
							key={pageDraft.object.id}
							obj={pageDraft.object}
							zoom={zoom}
							onChange={(content) =>
								setDraft((d) =>
									d
										? {
												...d,
												object: withTextSize(withContent(d.object, content)),
											}
										: d,
								)
							}
							onCommit={() => commitDraft(pageDraft.object.id)}
						/>
					)}
				</div>
			</div>
		</div>
	);
}

/** Resultado de arrastar uma alça (`null` = alça não se aplica ao objeto). */
function resizeObject(
	obj: EditorObject,
	handle: Handle | "p1" | "p2",
	dx: number,
	dy: number,
	shift: boolean,
): EditorObject | null {
	if (obj.type === "line") {
		if (handle === "p1") {
			const [x, y] = snapAngle(
				obj.x2,
				obj.y2,
				[obj.x1 + dx, obj.y1 + dy],
				shift,
			);
			return { ...obj, x1: x, y1: y };
		}
		if (handle === "p2") {
			const [x, y] = snapAngle(
				obj.x1,
				obj.y1,
				[obj.x2 + dx, obj.y2 + dy],
				shift,
			);
			return { ...obj, x2: x, y2: y };
		}
		return null;
	}
	if (handle === "p1" || handle === "p2") return null;
	if (obj.type === "text") {
		if (handle === "e" || handle === "w") {
			// Lateral: largura fixa, o texto quebra linha e a altura acompanha.
			const box = resizeBox(obj, handle, dx, dy, false, obj.fontSize);
			return withTextSize({ ...obj, ...box, wrapWidth: box.w });
		}
		// Canto: escala o texto inteiro (fonte e largura de quebra).
		const box = resizeBox(obj, handle, dx, dy, true, 2);
		return {
			...obj,
			...box,
			// Mudou o tamanho à mão: o auto-estilo não troca mais o estilo.
			styleOrigin: "manual",
			fontSize: Math.max(
				2,
				Math.round(obj.fontSize * (box.w / obj.w) * 10) / 10,
			),
			wrapWidth: obj.wrapWidth ? box.w : undefined,
		};
	}
	const lock = obj.type === "image" ? !shift : shift;
	return { ...obj, ...resizeBox(obj, handle, dx, dy, lock, 4) };
}

function snapAngle(
	ox: number,
	oy: number,
	p: [number, number],
	snap: boolean,
): [number, number] {
	if (!snap) return p;
	const dx = p[0] - ox;
	const dy = p[1] - oy;
	const len = Math.hypot(dx, dy);
	const step = Math.PI / 12;
	const ang = Math.round(Math.atan2(dy, dx) / step) * step;
	return [ox + Math.cos(ang) * len, oy + Math.sin(ang) * len];
}

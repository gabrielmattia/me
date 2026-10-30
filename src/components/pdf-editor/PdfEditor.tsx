import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import {
	type SetStateAction,
	useCallback,
	useEffect,
	useMemo,
	useReducer,
	useRef,
	useState,
} from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DEFAULTS, TOOLS, ZOOM_STEPS } from "./constants";
import {
	EditorContext,
	type EditorContextValue,
	type TextDraft,
} from "./editor-context";
import { FloatingTextBar } from "./FloatingTextBar";
import {
	embeddedFont,
	ensureFont,
	listPdfFonts,
	type PdfFontInfo,
	withTextSize,
} from "./fonts";
import {
	clamp,
	clientToBase,
	displaySize,
	normalizeRotation,
	translateObject,
} from "./geometry";
import { PagesPanel } from "./PagesPanel";
import { PageView } from "./PageView";
import { PropertiesPanel } from "./PropertiesPanel";
import {
	blankPage,
	clearSources,
	getPrimarySource,
	loadPdfFile,
	PdfLoadError,
} from "./pdf-source";
import { SignatureDialog } from "./SignatureDialog";
import { readImageFile } from "./signatures";
import {
	historyReducer,
	initHistory,
	isUnchangedSourceEdit,
	uid,
} from "./state";
import { useEditorTheme } from "./ThemeToggle";
import { Toolbar } from "./Toolbar";
import type {
	EditorObject,
	ImageObject,
	TextObject,
	Tool,
	ToolDefaults,
} from "./types";
import { UploadScreen } from "./UploadScreen";

const DEFAULT_KEY: Partial<Record<EditorObject["type"], keyof ToolDefaults>> = {
	text: "text",
	rect: "shape",
	ellipse: "shape",
	ink: "pen",
	highlight: "highlight",
	whiteout: "whiteout",
	line: "line",
};

const isPdf = (f: File) =>
	f.type === "application/pdf" || /\.pdf$/i.test(f.name);
const isImage = (f: File) => f.type.startsWith("image/");

function isTypingTarget(el: EventTarget | null) {
	if (!(el instanceof HTMLElement)) return false;
	return (
		el.isContentEditable ||
		el.tagName === "INPUT" ||
		el.tagName === "TEXTAREA" ||
		el.tagName === "SELECT" ||
		Boolean(el.closest("[role=dialog]"))
	);
}

export function PdfEditor() {
	const [history, dispatch] = useReducer(
		historyReducer,
		initHistory({ pages: [], objects: [] }),
	);
	const doc = history.present;
	const [status, setStatus] = useState<"empty" | "loading" | "ready">("empty");
	const [error, setError] = useState<string | null>(null);
	const [fileName, setFileName] = useState("");
	const [tool, setToolState] = useState<Tool>("select");
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [zoom, setZoom] = useState(1);
	const [defaults, setDefaults] = useState<ToolDefaults>(DEFAULTS);
	const [draft, setDraftState] = useState<TextDraft | null>(null);
	const [currentPageId, setCurrentPageId] = useState<string | null>(null);
	const [signatureOpen, setSignatureOpen] = useState(false);
	const [pagesOpen, setPagesOpen] = useState(false);
	const [propsOpen, setPropsOpen] = useState(false);
	const [isExporting, setIsExporting] = useState(false);
	const [notice, setNotice] = useState<string | null>(null);
	const [viewer, setViewer] = useState<HTMLDivElement | null>(null);
	/** Conta-gotas ativo: id do texto que recebe o estilo. */
	const [stylePick, setStylePick] = useState<string | null>(null);
	const { theme, toggle: toggleTheme } = useEditorTheme();

	const imageInputRef = useRef<HTMLInputElement>(null);
	const mergeInputRef = useRef<HTMLInputElement>(null);
	const needsFitRef = useRef(false);

	// O rascunho vive num ref também: commit/blur podem acontecer antes do re-render.
	const draftRef = useRef<TextDraft | null>(null);
	const setDraft = useCallback((v: SetStateAction<TextDraft | null>) => {
		const next = typeof v === "function" ? v(draftRef.current) : v;
		draftRef.current = next;
		setDraftState(next);
	}, []);

	const commitDraft = useCallback(
		(id?: string) => {
			const d = draftRef.current;
			if (!d || (id && d.object.id !== id)) return;
			setDraft(null);
			const o = d.object;
			const empty = !o.content.trim();
			if (d.isNew) {
				// Texto existente só vira edição se algo mudou (conteúdo, posição,
				// tamanho, estilo); texto novo vazio é descartado.
				if (o.source) {
					if (isUnchangedSourceEdit(o)) return;
				} else if (empty) return;
				dispatch({ type: "addObject", object: o });
				setSelectedId(o.id);
				return;
			}
			if (isUnchangedSourceEdit(o)) {
				// Voltou a ser idêntico ao original: some a edição (o PDF volta ao original).
				dispatch({ type: "removeObject", id: o.id });
				setSelectedId(null);
				return;
			}
			if (empty && !o.source) {
				dispatch({ type: "removeObject", id: o.id });
				setSelectedId(null);
				return;
			}
			// Conteúdo, posição e estilo alterados durante a edição: uma entrada só.
			const current = history.present.objects.find((x) => x.id === o.id);
			if (current && JSON.stringify(current) !== JSON.stringify(o)) {
				dispatch({ type: "replaceObject", object: o });
			}
		},
		[history.present.objects, setDraft],
	);

	const setTool = useCallback(
		(t: Tool) => {
			commitDraft();
			setToolState(t);
			if (t !== "select") setSelectedId(null);
		},
		[commitDraft],
	);

	const showNotice = useCallback((msg: string) => {
		setNotice(msg);
		window.setTimeout(() => setNotice((n) => (n === msg ? null : n)), 3500);
	}, []);

	// ── Arquivo ────────────────────────────────────────────────────────────

	const openFile = useCallback(
		async (file: File) => {
			if (!isPdf(file)) {
				setError("Escolha um arquivo .pdf.");
				return;
			}
			setStatus("loading");
			setError(null);
			try {
				clearSources();
				const { pages } = await loadPdfFile(file);
				dispatch({ type: "reset", doc: { pages, objects: [] } });
				setFileName(file.name);
				setSelectedId(null);
				setDraft(null);
				setToolState("select");
				setCurrentPageId(pages[0]?.id ?? null);
				needsFitRef.current = true;
				setStatus("ready");
			} catch (err) {
				setError(
					err instanceof PdfLoadError ? err.message : "Falha ao abrir o PDF.",
				);
				setStatus("empty");
			}
		},
		[setDraft],
	);

	const closeFile = () => {
		if (
			history.past.length > 0 &&
			!window.confirm("Descartar as alterações deste documento?")
		) {
			return;
		}
		clearSources();
		dispatch({ type: "reset", doc: { pages: [], objects: [] } });
		setDraft(null);
		setSelectedId(null);
		setStatus("empty");
	};

	const mergePdf = useCallback(
		async (file: File) => {
			try {
				const { pages } = await loadPdfFile(file);
				dispatch({ type: "addPages", pages });
				showNotice(
					`${pages.length} página(s) de “${file.name}” adicionadas ao final.`,
				);
			} catch (err) {
				showNotice(
					err instanceof PdfLoadError ? err.message : "Falha ao mesclar o PDF.",
				);
			}
		},
		[showNotice],
	);

	// Ajusta o zoom à largura logo depois de abrir.
	const fitWidth = useCallback(() => {
		if (!viewer || doc.pages.length === 0) return;
		const maxW = Math.max(...doc.pages.map((p) => displaySize(p).w));
		const available = viewer.clientWidth - (window.innerWidth < 640 ? 24 : 64);
		setZoom(clamp(Math.floor((available / maxW) * 100) / 100, 0.25, 2));
	}, [viewer, doc.pages]);

	useEffect(() => {
		if (status !== "ready" || !viewer || !needsFitRef.current) return;
		needsFitRef.current = false;
		const maxW = Math.max(...doc.pages.map((p) => displaySize(p).w));
		const available = viewer.clientWidth - (window.innerWidth < 640 ? 24 : 64);
		setZoom(clamp(Math.floor((available / maxW) * 100) / 100, 0.25, 1.25));
	}, [status, viewer, doc.pages]);

	// ── Página atual (a mais visível) ──────────────────────────────────────

	const pageIds = doc.pages.map((p) => p.id).join(",");
	useEffect(() => {
		if (!viewer || !pageIds) return;
		const ratios = new Map<string, number>();
		const obs = new IntersectionObserver(
			(entries) => {
				for (const e of entries) {
					ratios.set(
						(e.target as HTMLElement).dataset.pageId ?? "",
						e.intersectionRatio,
					);
				}
				let best: string | null = null;
				let bestRatio = 0;
				for (const [id, r] of ratios) {
					if (r > bestRatio) {
						best = id;
						bestRatio = r;
					}
				}
				if (best) setCurrentPageId(best);
			},
			{ root: viewer, threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] },
		);
		for (const el of viewer.querySelectorAll("[data-page-id]")) obs.observe(el);
		return () => obs.disconnect();
	}, [viewer, pageIds]);

	const scrollToPage = useCallback(
		(id: string) => {
			setCurrentPageId(id);
			viewer
				?.querySelector(`[data-page-id="${id}"]`)
				?.scrollIntoView({ behavior: "smooth", block: "start" });
			setPagesOpen(false);
		},
		[viewer],
	);

	// ── Objetos ────────────────────────────────────────────────────────────

	const selected = useMemo(
		() => doc.objects.find((o) => o.id === selectedId) ?? null,
		[doc.objects, selectedId],
	);

	const currentPage =
		doc.pages.find((p) => p.id === currentPageId) ?? doc.pages[0] ?? null;

	/** Insere uma imagem centralizada na parte visível da página atual. */
	const insertImage = useCallback(
		(
			img: { src: string; width: number; height: number },
			signature: boolean,
		) => {
			const page = currentPage;
			if (!page) return;
			const disp = displaySize(page);
			const maxW = signature ? Math.min(200, disp.w * 0.4) : disp.w * 0.5;
			const maxH = disp.h * 0.4;
			const ratio = img.width / img.height;
			let w = Math.min(maxW, img.width * 0.75);
			let h = w / ratio;
			if (h > maxH) {
				h = maxH;
				w = h * ratio;
			}
			let cx = page.width / 2;
			let cy = page.height / 2;
			const el = viewer?.querySelector<HTMLElement>(
				`[data-page-id="${page.id}"]`,
			);
			if (viewer && el) {
				const vr = viewer.getBoundingClientRect();
				const [bx, by] = clientToBase(
					vr.left + vr.width / 2,
					vr.top + vr.height / 2,
					el,
					page,
					zoom,
				);
				cx = clamp(bx, w / 2, page.width - w / 2);
				cy = clamp(by, h / 2, page.height - h / 2);
			}
			const obj: ImageObject = {
				id: uid(),
				type: "image",
				pageId: page.id,
				x: cx - w / 2,
				y: cy - h / 2,
				w,
				h,
				rotation: normalizeRotation(-page.rotation),
				opacity: 1,
				src: img.src,
				signature,
			};
			dispatch({ type: "addObject", object: obj });
			setToolState("select");
			setSelectedId(obj.id);
		},
		[currentPage, viewer, zoom],
	);

	const pickImage = useCallback(
		async (file: File) => {
			try {
				insertImage(await readImageFile(file), false);
			} catch {
				showNotice("Não foi possível ler esta imagem.");
			}
		},
		[insertImage, showNotice],
	);

	/**
	 * Aplica `patch` ao objeto selecionado. Com `field`, alterações seguidas do
	 * mesmo campo viram um passo de undo (slider, digitação); sem, cada uma é
	 * um passo.
	 */
	const updateSelected = useCallback(
		async (patch: Record<string, unknown>, field?: string) => {
			if (!selected) return;
			let next = { ...selected, ...patch } as EditorObject;
			if (next.type === "text") {
				// Trocar a fonte abandona a fonte embutida do PDF.
				if (
					("fontFamily" in patch || "bold" in patch || "italic" in patch) &&
					!("pdfFont" in patch)
				)
					next.pdfFont = undefined;
				// Fonte extra: mede só depois de carregada (senão mede o fallback).
				await ensureFont(next).catch(() => {});
				next = withTextSize(next);
			}
			dispatch({
				type: "replaceObject",
				object: next,
				coalesce: field ? `${selected.id}:${field}` : undefined,
			});
			const key = DEFAULT_KEY[selected.type];
			if (key) {
				setDefaults((d) => {
					const section = { ...d[key] } as Record<string, unknown>;
					for (const [k, v] of Object.entries(patch))
						if (k in section) section[k] = v;
					return { ...d, [key]: section };
				});
			}
		},
		[selected],
	);

	/** Barra flutuante: aplica no rascunho (se editando) ou no objeto selecionado. */
	const applyTextPatch = useCallback(
		async (patch: Partial<TextObject>, field?: string) => {
			const d = draftRef.current;
			if (!d) {
				await updateSelected(patch, field);
				return;
			}
			const id = d.object.id;
			const fontChange =
				("fontFamily" in patch || "bold" in patch || "italic" in patch) &&
				!("pdfFont" in patch);
			const probe = { ...d.object, ...patch };
			await ensureFont(probe).catch(() => {});
			setDraft((cur) => {
				if (!cur || cur.object.id !== id) return cur;
				const next: TextObject = { ...cur.object, ...patch };
				if (fontChange) next.pdfFont = undefined;
				return { ...cur, object: withTextSize(next) };
			});
			setDefaults((def) => {
				const section = { ...def.text } as Record<string, unknown>;
				for (const [k, v] of Object.entries(patch))
					if (k in section) section[k] = v;
				return { ...def, text: section as ToolDefaults["text"] };
			});
		},
		[updateSelected, setDraft],
	);

	const removeSelected = useCallback(() => {
		if (!selected) return;
		dispatch({ type: "removeObject", id: selected.id });
		setSelectedId(null);
	}, [selected]);

	/**
	 * A tipografia do PDF (fonte embutida) só pode ir para uma página que tenha
	 * acesso à fonte: a própria página de origem ou qualquer página do PDF
	 * principal. Senão o texto usa a fonte padrão mais próxima.
	 */
	const fitPdfStyle = useCallback(
		<T extends Partial<TextObject>>(t: T, pageId: string): T => {
			const st = t.pdfStyle;
			if (!st) return t;
			const page = doc.pages.find((p) => p.id === pageId);
			const ok =
				st.docId === getPrimarySource()?.id ||
				(page?.source?.docId === st.docId &&
					page.source.index === st.pageIndex);
			return ok ? t : { ...t, pdfFont: undefined, pdfStyle: undefined };
		},
		[doc.pages],
	);

	/** Fontes embutidas que um texto desta página pode usar. */
	const docFonts = useCallback(
		(pageId: string): PdfFontInfo[] =>
			listPdfFonts().filter(
				(f) =>
					fitPdfStyle(
						{
							pdfStyle: {
								docId: f.docId,
								pageIndex: f.pageIndex,
								charSpacing: 0,
								wordSpacing: 0,
								hScale: 100,
								fill: [],
								gs: [],
								color: "#000000",
							},
						},
						pageId,
					).pdfStyle !== undefined,
			),
		[fitPdfStyle],
	);

	const duplicateObject = useCallback(
		(obj: EditorObject) => {
			let copy: EditorObject;
			if (obj.type === "text") {
				// Mesma tipografia (inclusive a fonte embutida do PDF), uma linha
				// abaixo e no mesmo x: só um objeto novo, o original não muda.
				const t = translateObject(obj, 0, obj.h) as TextObject;
				copy = fitPdfStyle(
					{ ...t, id: uid(), cover: undefined, source: undefined },
					t.pageId,
				);
			} else {
				copy = { ...translateObject(obj, 12, 12), id: uid() } as EditorObject;
			}
			dispatch({ type: "addObject", object: copy });
			setSelectedId(copy.id);
		},
		[fitPdfStyle],
	);

	const applyPickedStyle = useCallback(
		(patch: Partial<TextObject>) => {
			const target = stylePick;
			setStylePick(null);
			const t =
				draftRef.current?.object.id === target
					? draftRef.current.object
					: selected?.id === target && selected?.type === "text"
						? selected
						: null;
			if (!t) return;
			const fitted = fitPdfStyle(patch, t.pageId);
			if (patch.pdfFont && !fitted.pdfFont)
				showNotice(
					"A fonte desse texto é de outro PDF: usando a fonte padrão mais próxima.",
				);
			else if (
				fitted.pdfFont &&
				!embeddedFont({ ...t, ...fitted, content: t.content })
			)
				showNotice(
					"A fonte do PDF não tem todos os caracteres deste texto: usando a fonte padrão mais próxima.",
				);
			applyTextPatch(fitted);
		},
		[stylePick, selected, fitPdfStyle, applyTextPatch, showNotice],
	);

	const duplicateSelected = useCallback(() => {
		if (!selected) return;
		duplicateObject(selected);
	}, [selected, duplicateObject]);

	const rotateSelected = useCallback(() => {
		if (!selected || selected.type === "line") return;
		dispatch({
			type: "replaceObject",
			object: {
				...selected,
				rotation: normalizeRotation(selected.rotation + 90),
			},
		});
	}, [selected]);

	// ── Exportação ─────────────────────────────────────────────────────────

	const download = useCallback(async () => {
		commitDraft();
		setIsExporting(true);
		try {
			const { exportPdf } = await import("./export");
			const bytes = await exportPdf(history.present);
			const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `${fileName.replace(/\.pdf$/i, "")}-editado.pdf`;
			document.body.appendChild(a);
			a.click();
			a.remove();
			window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
		} catch (err) {
			console.error(err);
			showNotice("Falha ao gerar o PDF. Veja o console para detalhes.");
		} finally {
			setIsExporting(false);
		}
	}, [commitDraft, history.present, fileName, showNotice]);

	// ── Zoom ───────────────────────────────────────────────────────────────

	const zoomStep = useCallback((dir: 1 | -1) => {
		setZoom((z) => {
			if (dir > 0) return ZOOM_STEPS.find((s) => s > z + 0.001) ?? z;
			return [...ZOOM_STEPS].reverse().find((s) => s < z - 0.001) ?? z;
		});
	}, []);

	useEffect(() => {
		if (!viewer) return;
		const onWheel = (e: WheelEvent) => {
			if (!e.ctrlKey && !e.metaKey) return;
			e.preventDefault();
			setZoom((z) =>
				clamp(Math.round(z * Math.exp(-e.deltaY * 0.01) * 100) / 100, 0.25, 4),
			);
		};
		viewer.addEventListener("wheel", onWheel, { passive: false });
		return () => viewer.removeEventListener("wheel", onWheel);
	}, [viewer]);

	// ── Atalhos de teclado ─────────────────────────────────────────────────

	useEffect(() => {
		if (status !== "ready") return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape" && stylePick) {
				setStylePick(null);
				return;
			}
			if (e.defaultPrevented || signatureOpen || isTypingTarget(e.target))
				return;
			const mod = e.metaKey || e.ctrlKey;
			const key = e.key.toLowerCase();
			if (mod && key === "z") {
				e.preventDefault();
				setDraft(null);
				dispatch({ type: e.shiftKey ? "redo" : "undo" });
				return;
			}
			if (mod && key === "y") {
				e.preventDefault();
				dispatch({ type: "redo" });
				return;
			}
			if (mod && key === "d") {
				e.preventDefault();
				duplicateSelected();
				return;
			}
			if (mod && (key === "=" || key === "+" || key === "-")) {
				e.preventDefault();
				zoomStep(key === "-" ? -1 : 1);
				return;
			}
			if (mod || e.altKey) return;
			if (e.key === "Enter" && selected?.type === "text") {
				e.preventDefault();
				setDraft({ object: selected, isNew: false });
				return;
			}
			if ((e.key === "Delete" || e.key === "Backspace") && selected) {
				e.preventDefault();
				removeSelected();
				return;
			}
			if (e.key === "Escape") {
				setSelectedId(null);
				setToolState("select");
				return;
			}
			if (e.key.startsWith("Arrow") && selected) {
				e.preventDefault();
				const step = e.shiftKey ? 10 : 1;
				const dx =
					e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
				const dy =
					e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
				dispatch({
					type: "replaceObject",
					object: translateObject(selected, dx, dy),
					coalesce: `nudge:${selected.id}`,
				});
				return;
			}
			if (key === "i") {
				imageInputRef.current?.click();
				return;
			}
			if (key === "s") {
				setSignatureOpen(true);
				return;
			}
			const t = TOOLS.find((x) => x.key === key);
			if (t) setTool(t.id);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [
		status,
		stylePick,
		signatureOpen,
		selected,
		setDraft,
		duplicateSelected,
		removeSelected,
		setTool,
		zoomStep,
	]);

	// O alvo do conta-gotas deixou de estar selecionado/em edição: cancela.
	useEffect(() => {
		if (stylePick && draft?.object.id !== stylePick && selectedId !== stylePick)
			setStylePick(null);
	}, [stylePick, draft, selectedId]);

	// Aviso ao sair com alterações não exportadas.
	const dirty = history.past.length > 0;
	useEffect(() => {
		if (!dirty) return;
		const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
		window.addEventListener("beforeunload", onBeforeUnload);
		return () => window.removeEventListener("beforeunload", onBeforeUnload);
	}, [dirty]);

	useEffect(() => () => clearSources(), []);

	const objectCount = useMemo(() => {
		const m = new Map<string, number>();
		for (const o of doc.objects) m.set(o.pageId, (m.get(o.pageId) ?? 0) + 1);
		return m;
	}, [doc.objects]);

	const ctx: EditorContextValue = {
		doc,
		dispatch,
		zoom,
		tool,
		setTool,
		selectedId,
		select: setSelectedId,
		defaults,
		draft,
		setDraft,
		commitDraft,
		notify: showNotice,
		duplicate: duplicateObject,
		stylePick,
		applyPickedStyle,
		cancelStylePick: () => setStylePick(null),
	};

	if (status !== "ready") {
		return (
			<UploadScreen
				onFile={openFile}
				isLoading={status === "loading"}
				error={error}
				theme={theme}
				onToggleTheme={toggleTheme}
			/>
		);
	}

	const currentIndex = currentPage ? doc.pages.indexOf(currentPage) : 0;

	const pagesPanel = (
		<PagesPanel
			pages={doc.pages}
			currentPageId={currentPage?.id ?? null}
			objectCount={objectCount}
			onSelectPage={scrollToPage}
			onMove={(id, to) => dispatch({ type: "movePage", id, to })}
			onRotate={(id, delta) => dispatch({ type: "rotatePage", id, delta })}
			onDuplicate={(id) => dispatch({ type: "duplicatePage", id })}
			onDelete={(id) => {
				dispatch({ type: "deletePage", id });
				setSelectedId(null);
			}}
			onInsertBlank={(at) => {
				const ref = doc.pages[Math.max(0, at - 1)];
				dispatch({
					type: "addPages",
					pages: [ref ? blankPage(ref.width, ref.height) : blankPage()],
					at,
				});
			}}
			onMergePdf={() => mergeInputRef.current?.click()}
		/>
	);

	const propertiesPanel = (onClose?: () => void) => (
		<PropertiesPanel
			selected={selected}
			tool={tool}
			defaults={defaults}
			onObjectChange={updateSelected}
			onDefaultsChange={(key, patch) => {
				setDefaults((d) => {
					const next = { ...d, [key]: { ...d[key], ...patch } };
					// Pré-carrega a fonte extra escolhida para o próximo texto.
					if (key === "text") ensureFont(next.text).catch(() => {});
					return next;
				});
			}}
			onDelete={removeSelected}
			onDuplicate={duplicateSelected}
			onReorder={(to) =>
				selected && dispatch({ type: "reorderObject", id: selected.id, to })
			}
			onRotate={rotateSelected}
			onClose={onClose}
		/>
	);

	return (
		<EditorContext.Provider value={ctx}>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: alvo de soltar arquivos (PDF para mesclar, imagem para inserir) */}
			<div
				className="flex h-dvh flex-col overflow-hidden bg-background text-foreground"
				onDragOver={(e) => {
					if (e.dataTransfer.types.includes("Files")) e.preventDefault();
				}}
				onDrop={(e) => {
					const f = e.dataTransfer.files[0];
					if (!f) return;
					e.preventDefault();
					if (isPdf(f)) mergePdf(f);
					else if (isImage(f)) pickImage(f);
				}}
			>
				<Toolbar
					fileName={fileName}
					tool={tool}
					onToolChange={setTool}
					onInsertImage={() => imageInputRef.current?.click()}
					onSignature={() => setSignatureOpen(true)}
					canUndo={history.past.length > 0}
					canRedo={history.future.length > 0}
					onUndo={() => {
						setDraft(null);
						dispatch({ type: "undo" });
					}}
					onRedo={() => dispatch({ type: "redo" })}
					onDownload={download}
					isExporting={isExporting}
					onClose={closeFile}
					theme={theme}
					onToggleTheme={toggleTheme}
					onTogglePages={() => setPagesOpen((v) => !v)}
					onToggleProps={() => setPropsOpen((v) => !v)}
				/>

				<div className="relative flex min-h-0 flex-1">
					<aside className="hidden w-48 shrink-0 border-r bg-background md:block">
						{pagesPanel}
					</aside>
					{pagesOpen && (
						<>
							<button
								type="button"
								aria-label="Fechar páginas"
								className="absolute inset-0 z-30 bg-black/40 md:hidden"
								onClick={() => setPagesOpen(false)}
							/>
							<aside className="absolute inset-y-0 left-0 z-40 w-56 border-r bg-background shadow-xl md:hidden">
								{pagesPanel}
							</aside>
						</>
					)}

					<main className="relative flex min-w-0 flex-1 flex-col">
						<div
							ref={setViewer}
							className="flex-1 overflow-auto bg-muted/60 dark:bg-muted/30"
							onPointerDown={(e) => {
								if (e.target === e.currentTarget) {
									commitDraft();
									setSelectedId(null);
								}
							}}
						>
							<div className="mx-auto flex w-max min-w-full flex-col items-center gap-6 px-3 py-6 sm:px-8 sm:py-8">
								{doc.pages.map((page, i) => (
									<div
										key={page.id}
										className="flex flex-col items-center gap-1.5"
									>
										<PageView page={page} index={i} scrollRoot={viewer} />
										<span className="text-[11px] tabular-nums text-muted-foreground">
											{i + 1}
										</span>
									</div>
								))}
							</div>
						</div>

						<div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-3">
							<div className="pointer-events-auto flex items-center gap-1 rounded-full border bg-background/95 px-2 py-1 text-xs shadow-lg backdrop-blur">
								<span className="px-2 tabular-nums text-muted-foreground">
									{currentIndex + 1} / {doc.pages.length}
								</span>
								<div className="h-4 w-px bg-border" />
								<Button
									type="button"
									size="icon-xs"
									variant="ghost"
									aria-label="Diminuir zoom"
									onClick={() => zoomStep(-1)}
								>
									<ZoomOut />
								</Button>
								<span className="w-11 text-center tabular-nums">
									{Math.round(zoom * 100)}%
								</span>
								<Button
									type="button"
									size="icon-xs"
									variant="ghost"
									aria-label="Aumentar zoom"
									onClick={() => zoomStep(1)}
								>
									<ZoomIn />
								</Button>
								<Button
									type="button"
									size="icon-xs"
									variant="ghost"
									aria-label="Ajustar à largura"
									title="Ajustar à largura"
									onClick={fitWidth}
								>
									<Maximize2 />
								</Button>
							</div>
						</div>

						<FloatingTextBar
							viewer={viewer}
							target={
								draft?.object ?? (selected?.type === "text" ? selected : null)
							}
							editing={Boolean(draft)}
							onApply={applyTextPatch}
							docFonts={docFonts}
							picking={stylePick !== null}
							onPickStyle={(t) => {
								if (stylePick) {
									setStylePick(null);
									return;
								}
								setStylePick(t.id);
								showNotice(
									"Clique num texto do PDF (ou outro texto) para copiar o estilo. Esc cancela.",
								);
							}}
							onFocusLeave={() => commitDraft()}
							onDuplicate={(t) => {
								commitDraft();
								duplicateObject(t);
							}}
							onDelete={(t) => {
								const inDoc = doc.objects.some((o) => o.id === t.id);
								setDraft(null);
								setSelectedId(null);
								if (t.source) {
									// Texto do PDF: excluir = substituir por vazio (o original
									// sai do content stream; desfazer traz de volta).
									const object = withTextSize({ ...t, content: "" });
									dispatch(
										inDoc
											? { type: "replaceObject", object }
											: { type: "addObject", object },
									);
								} else if (inDoc) {
									dispatch({ type: "removeObject", id: t.id });
								}
							}}
						/>

						{notice && (
							<output className="absolute top-3 left-1/2 z-20 max-w-[90%] -translate-x-1/2 rounded-lg border bg-background px-4 py-2 text-sm shadow-lg">
								{notice}
							</output>
						)}
					</main>

					<aside className="hidden w-72 shrink-0 border-l bg-background lg:block">
						{propertiesPanel()}
					</aside>
					{/* No celular, texto usa a barra flutuante; o painel abre pelo botão. */}
					{(propsOpen || (selected && !draft && selected.type !== "text")) && (
						<aside
							className={cn(
								"absolute inset-x-0 bottom-0 z-40 max-h-[50%] overflow-hidden rounded-t-2xl border-t bg-background shadow-2xl lg:hidden",
							)}
						>
							{propertiesPanel(() => {
								setPropsOpen(false);
								setSelectedId(null);
							})}
						</aside>
					)}
				</div>

				<input
					ref={imageInputRef}
					type="file"
					accept="image/png,image/jpeg,image/webp,image/gif"
					className="hidden"
					onChange={(e) => {
						const f = e.target.files?.[0];
						if (f) pickImage(f);
						e.target.value = "";
					}}
				/>
				<input
					ref={mergeInputRef}
					type="file"
					accept=".pdf,application/pdf"
					className="hidden"
					onChange={(e) => {
						const f = e.target.files?.[0];
						if (f) mergePdf(f);
						e.target.value = "";
					}}
				/>
				<SignatureDialog
					open={signatureOpen}
					onOpenChange={setSignatureOpen}
					onInsert={(sig) => insertImage(sig, true)}
				/>
			</div>
		</EditorContext.Provider>
	);
}

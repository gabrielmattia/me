import {
	type PointerEvent as ReactPointerEvent,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { ACCENT } from "./constants";
import { trackPointer, useEditor } from "./editor-context";
import { baselineRatio, getPdfFont, withTextSize } from "./fonts";
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
import { sourceSnapshot, uid } from "./state";
import type { StripResult } from "./text-removal";
import type {
	EditorObject,
	InkObject,
	LineObject,
	PageModel,
	TextBlock,
	TextObject,
} from "./types";

type Preview =
	| { kind: "box"; x: number; y: number; w: number; h: number }
	| { kind: "ink"; points: Array<[number, number]> }
	| { kind: "line"; x1: number; y1: number; x2: number; y2: number };

const MAX_CANVAS_PIXELS = 16_000_000;

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
		selectedId,
		select,
		defaults,
		draft,
		setDraft,
		commitDraft,
	} = useEditor();
	const outerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [near, setNear] = useState(false);
	const [blocks, setBlocks] = useState<TextBlock[]>([]);
	const [hoverBlock, setHoverBlock] = useState<string | null>(null);
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
	const disp = displaySize(page);
	const pageDraft = draft?.object.pageId === page.id ? draft : null;

	// Textos existentes substituídos nesta página (inclusive o rascunho).
	const sourceRefs = useMemo(() => {
		const refs = new Map<string, TextObject["source"]>();
		for (const o of objects)
			if (o.type === "text" && o.source) refs.set(o.source.key, o.source);
		const d = pageDraft?.object.source;
		if (d) refs.set(d.key, d);
		return [...refs.values()].filter((r): r is NonNullable<typeof r> => !!r);
	}, [objects, pageDraft?.object.source]);
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
		const refs = sourceRefs.map((r) => ({ key: r.key, lines: r.lines }));
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

	useEffect(() => {
		if (tool !== "editText" || !near) return;
		let cancelled = false;
		getTextBlocks(page)
			.then((b) => {
				if (!cancelled) setBlocks(b);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [tool, near, page]);

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

	const startTextDraft = (bx: number, by: number) => {
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
		select(null);
		setDraft({ object: obj, isNew: true });
	};

	const startBlockEdit = (block: TextBlock) => {
		if (draft) commitDraft();
		const canvas = canvasRef.current;
		let colors = { background: "#ffffff", foreground: "#000000" };
		if (canvas && canvas.width > 0) {
			const k = canvas.width / page.width;
			colors = sampleColors(canvas, {
				x: block.x * k,
				y: block.y * k,
				w: block.w * k,
				h: block.h * k,
			});
		}
		const build = (color: string, pdfFont: string | undefined): TextObject => {
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
				fontSize: Math.round(block.fontSize * 100) / 100,
				lineHeight:
					block.lines.length > 1 ? block.leading / block.fontSize : undefined,
				color,
				bold: block.bold,
				italic: block.italic,
				align: "left",
				pdfFont,
				cover: {
					x: block.x - 1,
					y: block.y - 1,
					w: block.w + 2,
					h: block.h + 2,
					color: colors.background,
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
				},
			};
		};
		const id = uid();
		const pdfFont = getPdfFont(block.fontName) ? block.fontName : undefined;
		const initial = build(colors.foreground, pdfFont);
		select(null);
		setDraft({ object: initial, isNew: true });

		// Estilo exato do content stream: cor original e se a fonte embutida
		// pode ser reutilizada (precisa casar com um operador de texto).
		import("./text-removal")
			.then((m) => m.describeBlock(page, block.lines))
			.then((style) => {
				const exact = build(
					style?.color ?? colors.foreground,
					style ? pdfFont : undefined,
				);
				setDraft((d) => {
					if (!d || d.object.id !== id) return d;
					const o = d.object;
					return {
						...d,
						object: withTextSize({
							...exact,
							content: o.content,
							color: o.color === initial.color ? exact.color : o.color,
						}),
					};
				});
			})
			.catch(() => {});
	};

	const onOverlayPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
		if (e.button !== 0) return;
		if (draft) commitDraft();
		const [sx, sy] = toBase(e.clientX, e.clientY);

		if (tool === "select" || tool === "editText") {
			select(null);
			return;
		}
		e.preventDefault();
		if (tool === "text") {
			startTextDraft(sx, sy);
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

	const startMove = (e: ReactPointerEvent<Element>, obj: EditorObject) => {
		const startX = e.clientX;
		const startY = e.clientY;
		let moved = false;
		trackPointer(
			(ev) => {
				const sdx = ev.clientX - startX;
				const sdy = ev.clientY - startY;
				if (!moved) {
					if (Math.hypot(sdx, sdy) < 3) return;
					moved = true;
					dispatch({ type: "checkpoint" });
				}
				const [dx, dy] = screenDeltaToBase(sdx, sdy, page, zoom);
				dispatch({
					type: "replaceObject",
					object: translateObject(obj, dx, dy),
					record: false,
				});
			},
			() => {},
		);
	};

	const onObjectPointerDown = (
		e: ReactPointerEvent<Element>,
		obj: EditorObject,
	) => {
		if (e.button !== 0) return;
		e.stopPropagation();
		if (draft && draft.object.id !== obj.id) commitDraft();
		if (obj.type === "text" && (tool === "text" || tool === "editText")) {
			e.preventDefault();
			select(obj.id);
			setDraft({ object: obj, isNew: false });
			return;
		}
		if (tool !== "select") return;
		e.preventDefault();
		select(obj.id);
		startMove(e, obj);
	};

	const onObjectDoubleClick = (obj: EditorObject) => {
		if (obj.type === "text") {
			select(obj.id);
			setDraft({ object: obj, isNew: false });
		}
	};

	const onHandleDown = (
		e: ReactPointerEvent<HTMLDivElement>,
		handle: Handle | "p1" | "p2",
		obj: EditorObject,
	) => {
		if (e.button !== 0) return;
		e.stopPropagation();
		e.preventDefault();
		const startX = e.clientX;
		const startY = e.clientY;
		let started = false;
		trackPointer(
			(ev) => {
				if (!started) {
					started = true;
					dispatch({ type: "checkpoint" });
				}
				const [dx, dy] = screenDeltaToBase(
					ev.clientX - startX,
					ev.clientY - startY,
					page,
					zoom,
				);
				let next: EditorObject;
				if (obj.type === "line") {
					if (handle === "p1") {
						const [x, y] = snapAngle(
							obj.x2,
							obj.y2,
							[obj.x1 + dx, obj.y1 + dy],
							ev.shiftKey,
						);
						next = { ...obj, x1: x, y1: y };
					} else {
						const [x, y] = snapAngle(
							obj.x1,
							obj.y1,
							[obj.x2 + dx, obj.y2 + dy],
							ev.shiftKey,
						);
						next = { ...obj, x2: x, y2: y };
					}
				} else if (handle === "p1" || handle === "p2") {
					return;
				} else {
					const lock =
						obj.type === "text" ||
						(obj.type === "image" ? !ev.shiftKey : ev.shiftKey);
					const box = resizeBox(
						obj,
						handle,
						dx,
						dy,
						lock,
						obj.type === "text" ? 2 : 4,
					);
					next =
						obj.type === "text"
							? {
									...obj,
									...box,
									fontSize: Math.max(
										2,
										Math.round(obj.fontSize * (box.w / obj.w) * 10) / 10,
									),
								}
							: { ...obj, ...box };
				}
				dispatch({ type: "replaceObject", object: next, record: false });
			},
			() => {},
		);
	};

	// ── Render ────────────────────────────────────────────────────────────

	const objectsInteractive = (obj: EditorObject) =>
		tool === "select" ||
		(obj.type === "text" && (tool === "text" || tool === "editText"));

	const replacedBlocks = new Set(sourceRefs.map((r) => r.key));

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
	const cursor =
		tool === "select" || tool === "editText"
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

					{objects.map((obj) =>
						pageDraft &&
						!pageDraft.isNew &&
						pageDraft.object.id === obj.id ? null : (
							<ObjectView
								key={obj.id}
								obj={obj}
								page={page}
								zoom={zoom}
								interactive={objectsInteractive(obj)}
								onPointerDown={onObjectPointerDown}
								onDoubleClick={onObjectDoubleClick}
							/>
						),
					)}

					{tool === "editText" &&
						blocks
							.filter((b) => !replacedBlocks.has(b.key))
							.map((b) => (
								<button
									key={b.key}
									type="button"
									title="Clique para editar este texto"
									onPointerDown={(e) => {
										e.stopPropagation();
										e.preventDefault();
										startBlockEdit(b);
									}}
									onMouseEnter={() => setHoverBlock(b.key)}
									onMouseLeave={() => setHoverBlock(null)}
									style={{
										position: "absolute",
										left: b.x * zoom - 1,
										top: b.y * zoom - 1,
										width: b.w * zoom + 2,
										height: b.h * zoom + 2,
										cursor: "text",
										// Nada visível por padrão: só indica o bloco no hover.
										background:
											hoverBlock === b.key
												? "rgba(37,99,235,0.08)"
												: "transparent",
										outline:
											hoverBlock === b.key ? `1.5px solid ${ACCENT}` : "none",
										borderRadius: 2,
										padding: 0,
										border: 0,
									}}
								/>
							))}

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
						<TextDraftEditor
							key={pageDraft.object.id}
							obj={pageDraft.object}
							zoom={zoom}
							selectAll={!pageDraft.isNew}
							onChange={(content) =>
								setDraft((d) =>
									d
										? { ...d, object: withTextSize({ ...d.object, content }) }
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

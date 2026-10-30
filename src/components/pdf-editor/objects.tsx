import {
	type CSSProperties,
	type PointerEvent,
	useEffect,
	useLayoutEffect,
	useRef,
} from "react";
import { ACCENT } from "./constants";
import {
	baselineRatio,
	layoutLines,
	lineHeightOf,
	lineOffsets,
	textFont,
	textLines,
	underlineRects,
} from "./fonts";
import {
	ALL_HANDLES,
	arrowHeadPath,
	arrowShaftEnd,
	CORNER_HANDLES,
	type Handle,
	handleCursor,
	TEXT_HANDLES,
} from "./geometry";
import type {
	BoxObject,
	EditorObject,
	LineObject,
	PageModel,
	TextObject,
} from "./types";

function boxStyle(obj: BoxObject, zoom: number): CSSProperties {
	return {
		position: "absolute",
		left: obj.x * zoom,
		top: obj.y * zoom,
		width: obj.w * zoom,
		height: obj.h * zoom,
		transform: obj.rotation ? `rotate(${obj.rotation}deg)` : undefined,
	};
}

export function textStyle(t: TextObject, zoom: number): CSSProperties {
	const font = textFont(t);
	return {
		fontFamily: font.family,
		fontSize: t.fontSize * zoom,
		fontWeight: font.weight,
		fontStyle: font.style,
		lineHeight: lineHeightOf(t),
		textAlign: t.align ?? "left",
		color: t.color,
		whiteSpace: "pre",
		fontKerning: "none",
	};
}

export function LineSvg({
	obj,
	page,
	zoom,
	interactive,
	onPointerDown,
}: {
	obj: LineObject;
	page: PageModel;
	zoom: number;
	interactive: boolean;
	onPointerDown?: (e: PointerEvent<SVGElement>) => void;
}) {
	const [ex, ey] = obj.arrow
		? arrowShaftEnd(obj.x1, obj.y1, obj.x2, obj.y2, obj.strokeWidth)
		: [obj.x2, obj.y2];
	return (
		<svg
			aria-hidden="true"
			width={page.width * zoom}
			height={page.height * zoom}
			viewBox={`0 0 ${page.width} ${page.height}`}
			style={{
				position: "absolute",
				inset: 0,
				overflow: "visible",
				pointerEvents: "none",
				opacity: obj.opacity,
			}}
		>
			<line
				x1={obj.x1}
				y1={obj.y1}
				x2={ex}
				y2={ey}
				stroke={obj.color}
				strokeWidth={obj.strokeWidth}
				strokeLinecap="round"
			/>
			{obj.arrow && (
				<path
					d={arrowHeadPath(obj.x1, obj.y1, obj.x2, obj.y2, obj.strokeWidth)}
					fill={obj.color}
				/>
			)}
			{interactive && (
				<line
					x1={obj.x1}
					y1={obj.y1}
					x2={obj.x2}
					y2={obj.y2}
					stroke="transparent"
					strokeWidth={Math.max(12 / zoom, obj.strokeWidth + 8)}
					style={{ pointerEvents: "stroke", cursor: "move" }}
					onPointerDown={onPointerDown}
				/>
			)}
		</svg>
	);
}

/** Sublinhado desenhado com a mesma geometria da exportação. */
function Underlines({ t, zoom }: { t: TextObject; zoom: number }) {
	if (!t.underline) return null;
	return (
		<>
			{underlineRects(t).map((r, i) => (
				<span
					// biome-ignore lint/suspicious/noArrayIndexKey: uma faixa por linha, na ordem
					key={i}
					style={{
						position: "absolute",
						left: r.x * zoom,
						top: r.y * zoom,
						width: r.w * zoom,
						height: Math.max(1, r.h * zoom),
						background: t.color,
						pointerEvents: "none",
					}}
				/>
			))}
		</>
	);
}

function hexRgb(hex: string): [number, number, number] {
	const h = hex.replace("#", "");
	const full =
		h.length === 3 ? [...h].map((c) => c + c).join("") : h.padEnd(6, "0");
	return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16)) as [
		number,
		number,
		number,
	];
}

/** Tamanho de fonte mínimo/máximo que o pdfjs usa no canvas (depois escala). */
const PDFJS_MIN_FONT = 16;
const PDFJS_MAX_FONT = 100;

/**
 * Texto com a fonte embutida: cada glifo na posição do layout do PDF (largura
 * do /Widths, Tc/Tw, ajustes do TJ e escala horizontal), igual à exportação.
 * É desenhado num canvas como o pdfjs desenha a página (fillText por glifo,
 * fonte de 16px+ escalada, posição fracionária), alinhado aos pixels da página:
 * no DOM o navegador ajusta a baseline à grade e suaviza diferente.
 */
function PdfGlyphs({ t, zoom }: { t: TextObject; zoom: number }) {
	const ref = useRef<HTMLCanvasElement>(null);
	const embedded = textFont(t).embedded;
	const fs = t.fontSize;
	const pad = fs * 2;
	const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
	const k = zoom * dpr;
	// Canvas começa num pixel inteiro do dispositivo (como o canvas da página).
	const left = Math.floor((t.x - pad) * k) / k;
	const top = Math.floor((t.y - pad) * k) / k;
	const w = Math.ceil((t.w + 2 * pad) * k);
	const h = Math.ceil((t.h + 2 * pad) * k);

	useLayoutEffect(() => {
		const c = ref.current;
		const out = c?.getContext("2d");
		if (!c || !out || !embedded || w === 0 || h === 0) return;
		c.width = w;
		c.height = h;
		// Desenha em preto sobre branco opaco (a suavização do texto é a mesma
		// do canvas da página) e converte a cobertura em alfa na cor do texto.
		const off = document.createElement("canvas");
		off.width = w;
		off.height = h;
		const ctx = off.getContext("2d", { willReadFrequently: true });
		if (!ctx) return;
		ctx.fillStyle = "#ffffff";
		ctx.fillRect(0, 0, w, h);
		const lines = layoutLines(t);
		const offsets = lineOffsets(t);
		const lh = lineHeightOf(t) * fs;
		const base = baselineRatio(t) * fs;
		const hs = (t.pdfStyle?.hScale ?? 100) / 100;
		const size = Math.min(PDFJS_MAX_FONT, Math.max(PDFJS_MIN_FONT, fs));
		ctx.setTransform(k, 0, 0, k, (t.x - left) * k, (t.y - top) * k);
		ctx.fillStyle = "#000000";
		ctx.font = `${size}px "${embedded}"`;
		lines.forEach((line, i) => {
			Array.from(line.text).forEach((ch, j) => {
				if (ch === " ") return;
				ctx.save();
				ctx.translate((offsets[i] ?? 0) + (line.xs?.[j] ?? 0), base + i * lh);
				ctx.scale((hs * fs) / size, fs / size);
				ctx.fillText(ch, 0, 0);
				ctx.restore();
			});
		});
		const img = ctx.getImageData(0, 0, w, h);
		const d = img.data;
		const rgb = hexRgb(t.color);
		for (let i = 0; i < d.length; i += 4) {
			const a = 255 - d[i];
			d[i] = rgb[0];
			d[i + 1] = rgb[1];
			d[i + 2] = rgb[2];
			d[i + 3] = a;
		}
		out.putImageData(img, 0, 0);
	});

	return (
		<canvas
			ref={ref}
			style={{
				position: "absolute",
				left: (left - t.x) * zoom,
				top: (top - t.y) * zoom,
				width: w / dpr,
				height: h / dpr,
				pointerEvents: "none",
			}}
		/>
	);
}

export function ObjectView({
	obj,
	page,
	zoom,
	interactive,
	onPointerDown,
}: {
	obj: EditorObject;
	page: PageModel;
	zoom: number;
	interactive: boolean;
	onPointerDown: (e: PointerEvent<Element>, obj: EditorObject) => void;
}) {
	if (obj.type === "line") {
		return (
			<LineSvg
				obj={obj}
				page={page}
				zoom={zoom}
				interactive={interactive}
				onPointerDown={(e) => onPointerDown(e, obj)}
			/>
		);
	}

	const style: CSSProperties = {
		...boxStyle(obj, zoom),
		opacity: obj.opacity,
		pointerEvents: interactive ? "auto" : "none",
		cursor: interactive ? "move" : undefined,
		touchAction: "none",
	};
	const handlers = {
		"data-object-id": obj.id,
		onPointerDown: (e: PointerEvent<HTMLDivElement>) => onPointerDown(e, obj),
	};

	switch (obj.type) {
		case "text":
			return (
				<div {...handlers} style={{ ...style, ...textStyle(obj, zoom) }}>
					{textFont(obj).embedded ? (
						<PdfGlyphs t={obj} zoom={zoom} />
					) : (
						textLines(obj).join("\n")
					)}
					<Underlines t={obj} zoom={zoom} />
				</div>
			);
		case "whiteout":
			return <div {...handlers} style={{ ...style, background: obj.color }} />;
		case "highlight":
			return (
				<div
					{...handlers}
					style={{ ...style, background: obj.color, mixBlendMode: "multiply" }}
				/>
			);
		case "image":
			return (
				<div {...handlers} style={style}>
					<img
						src={obj.src}
						alt=""
						draggable={false}
						style={{ width: "100%", height: "100%", display: "block" }}
					/>
				</div>
			);
		case "ink": {
			const pts = obj.points
				.map(([x, y]) => `${x * obj.w},${y * obj.h}`)
				.join(" ");
			return (
				<div {...handlers} style={style}>
					<svg
						aria-hidden="true"
						width="100%"
						height="100%"
						viewBox={`0 0 ${Math.max(obj.w, 0.01)} ${Math.max(obj.h, 0.01)}`}
						preserveAspectRatio="none"
						style={{ overflow: "visible", display: "block" }}
					>
						<polyline
							points={obj.points.length === 1 ? `${pts} ${pts}` : pts}
							fill="none"
							stroke={obj.color}
							strokeWidth={obj.strokeWidth}
							strokeLinecap="round"
							strokeLinejoin="round"
							vectorEffect="non-scaling-stroke"
							style={{ strokeWidth: obj.strokeWidth * zoom }}
						/>
					</svg>
				</div>
			);
		}
		default: {
			const sw = obj.stroke ? obj.strokeWidth : 0;
			return (
				<div {...handlers} style={style}>
					<svg
						aria-hidden="true"
						width="100%"
						height="100%"
						viewBox={`0 0 ${obj.w} ${obj.h}`}
						preserveAspectRatio="none"
						style={{ display: "block", overflow: "visible" }}
					>
						{obj.type === "rect" ? (
							<rect
								x={sw / 2}
								y={sw / 2}
								width={Math.max(0, obj.w - sw)}
								height={Math.max(0, obj.h - sw)}
								fill={obj.fill ?? "none"}
								stroke={obj.stroke ?? "none"}
								strokeWidth={sw}
							/>
						) : (
							<ellipse
								cx={obj.w / 2}
								cy={obj.h / 2}
								rx={Math.max(0, obj.w / 2 - sw / 2)}
								ry={Math.max(0, obj.h / 2 - sw / 2)}
								fill={obj.fill ?? "none"}
								stroke={obj.stroke ?? "none"}
								strokeWidth={sw}
							/>
						)}
					</svg>
				</div>
			);
		}
	}
}

const HANDLE_SIZE = 10;
/** Área de toque das alças (maior que o desenho, para dedo). */
const HANDLE_HIT = 22;
/** Espessura da borda de arrastar ao redor da caixa em edição. */
const MOVE_BORDER = 10;
/**
 * Caixa baixa na tela (texto pequeno): alças laterais se sobreporiam às de
 * canto e ao próprio texto — ficam só os cantos, com área de toque menor.
 */
const SMALL_BOX = 24;
const HANDLE_HIT_SMALL = 14;

export function SelectionFrame({
	obj,
	zoom,
	onHandleDown,
	onMoveDown,
}: {
	obj: EditorObject;
	zoom: number;
	onHandleDown: (
		e: PointerEvent<HTMLDivElement>,
		handle: Handle | "p1" | "p2",
	) => void;
	/** Presente = mostra uma borda que move a caixa (texto em edição). */
	onMoveDown?: (e: PointerEvent<HTMLDivElement>) => void;
}) {
	const small = obj.type !== "line" && obj.h * zoom < SMALL_BOX;
	const hit = small ? HANDLE_HIT_SMALL : HANDLE_HIT;
	const handleStyle = (cursor: string): CSSProperties => ({
		position: "absolute",
		width: hit,
		height: hit,
		marginLeft: -hit / 2,
		marginTop: -hit / 2,
		display: "grid",
		placeItems: "center",
		cursor,
		pointerEvents: "auto",
		touchAction: "none",
		zIndex: 2,
	});
	const dot = (round: boolean) => (
		<span
			style={{
				width: HANDLE_SIZE,
				height: HANDLE_SIZE,
				background: "#fff",
				border: `2px solid ${ACCENT}`,
				borderRadius: round ? "50%" : 3,
				boxSizing: "border-box",
				pointerEvents: "none",
			}}
		/>
	);

	if (obj.type === "line") {
		return (
			<>
				{(["p1", "p2"] as const).map((p) => (
					<div
						key={p}
						role="presentation"
						onPointerDown={(e) => onHandleDown(e, p)}
						style={{
							...handleStyle("crosshair"),
							left: (p === "p1" ? obj.x1 : obj.x2) * zoom,
							top: (p === "p1" ? obj.y1 : obj.y2) * zoom,
							zIndex: 30,
						}}
					>
						{dot(true)}
					</div>
				))}
			</>
		);
	}

	const handles =
		obj.type === "image" || small
			? CORNER_HANDLES
			: obj.type === "text"
				? TEXT_HANDLES
				: ALL_HANDLES;
	const pos: Record<Handle, [number, number]> = {
		nw: [0, 0],
		n: [0.5, 0],
		ne: [1, 0],
		e: [1, 0.5],
		se: [1, 1],
		s: [0.5, 1],
		sw: [0, 1],
		w: [0, 0.5],
	};
	const b = MOVE_BORDER;
	const strips: CSSProperties[] = [
		{ left: -b, top: -b, right: -b, height: b },
		{ left: -b, bottom: -b, right: -b, height: b },
		{ left: -b, top: 0, bottom: 0, width: b },
		{ right: -b, top: 0, bottom: 0, width: b },
	];
	return (
		<div
			data-object-frame={obj.id}
			style={{
				...boxStyle(obj, zoom),
				outline: `1.5px ${onMoveDown ? "dashed" : "solid"} ${ACCENT}`,
				outlineOffset: 2,
				pointerEvents: "none",
				zIndex: 45,
			}}
		>
			{onMoveDown &&
				strips.map((st, i) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: quatro bordas fixas
						key={i}
						role="presentation"
						title="Arraste para mover"
						onPointerDown={onMoveDown}
						style={{
							...st,
							position: "absolute",
							cursor: "move",
							pointerEvents: "auto",
							touchAction: "none",
						}}
					/>
				))}
			{handles.map((h) => (
				<div
					key={h}
					role="presentation"
					onPointerDown={(e) => onHandleDown(e, h)}
					style={{
						...handleStyle(handleCursor(h, obj.rotation)),
						left: `${pos[h][0] * 100}%`,
						top: `${pos[h][1] * 100}%`,
					}}
				>
					{dot(false)}
				</div>
			))}
		</div>
	);
}

export function TextDraftEditor({
	obj,
	zoom,
	onChange,
	onCommit,
}: {
	obj: TextObject;
	zoom: number;
	onChange: (content: string) => void;
	onCommit: () => void;
}) {
	const ref = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		// Espera o layout (o textarea nasce durante o pointerdown).
		const t = window.setTimeout(() => {
			el.focus({ preventScroll: true });
			el.setSelectionRange(el.value.length, el.value.length);
		}, 0);
		return () => window.clearTimeout(t);
	}, []);

	// Folga para o próximo caractere não quebrar o layout antes da remedição.
	// Com largura fixa o textarea quebra linha igual à caixa (sem folga).
	const wrap = Boolean(obj.wrapWidth);
	const extra = wrap ? 0 : obj.fontSize;
	const shift =
		obj.align === "right" ? extra : obj.align === "center" ? extra / 2 : 0;
	return (
		<textarea
			ref={ref}
			value={obj.content}
			wrap={wrap ? "soft" : "off"}
			spellCheck={false}
			aria-label="Editar texto"
			data-text-draft=""
			onChange={(e) => onChange(e.target.value)}
			onBlur={(e) => {
				// Foco foi para a barra de formatação (tamanho, fonte, cor…):
				// a edição continua; ela mesma confirma se o foco sair dela.
				const to = e.relatedTarget as HTMLElement | null;
				if (to?.closest("[data-text-toolbar], [data-text-toolbar-popup]"))
					return;
				onCommit();
			}}
			onPointerDown={(e) => e.stopPropagation()}
			onKeyDown={(e) => {
				e.stopPropagation();
				if (
					e.key === "Escape" ||
					(e.key === "Enter" && (e.metaKey || e.ctrlKey))
				) {
					e.preventDefault();
					onCommit();
				}
			}}
			style={{
				...textStyle(obj, zoom),
				whiteSpace: wrap ? "pre-wrap" : "pre",
				overflowWrap: wrap ? "anywhere" : undefined,
				textDecoration: obj.underline ? "underline" : undefined,
				position: "absolute",
				left: (obj.x - shift) * zoom,
				top: obj.y * zoom,
				width: (obj.w + extra) * zoom,
				height: obj.h * zoom,
				transform: obj.rotation ? `rotate(${obj.rotation}deg)` : undefined,
				transformOrigin: `${((obj.w / 2 + shift) * zoom).toFixed(3)}px ${(obj.h * zoom) / 2}px`,
				padding: 0,
				margin: 0,
				border: 0,
				outline: "none",
				background: "transparent",
				resize: "none",
				overflow: "hidden",
				zIndex: 40,
				opacity: obj.opacity,
			}}
		/>
	);
}

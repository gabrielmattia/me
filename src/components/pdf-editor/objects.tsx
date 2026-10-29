import {
	type CSSProperties,
	type PointerEvent,
	useEffect,
	useRef,
} from "react";
import { ACCENT } from "./constants";
import { lineHeightOf, textFont } from "./fonts";
import {
	ALL_HANDLES,
	arrowHeadPath,
	arrowShaftEnd,
	CORNER_HANDLES,
	type Handle,
	handleCursor,
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

export function ObjectView({
	obj,
	page,
	zoom,
	interactive,
	onPointerDown,
	onDoubleClick,
}: {
	obj: EditorObject;
	page: PageModel;
	zoom: number;
	interactive: boolean;
	onPointerDown: (e: PointerEvent<Element>, obj: EditorObject) => void;
	onDoubleClick: (obj: EditorObject) => void;
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
		cursor: interactive ? (obj.type === "text" ? "text" : "move") : undefined,
		touchAction: "none",
	};
	const handlers = {
		onPointerDown: (e: PointerEvent<HTMLDivElement>) => onPointerDown(e, obj),
		onDoubleClick: () => onDoubleClick(obj),
	};

	switch (obj.type) {
		case "text":
			return (
				<div {...handlers} style={{ ...style, ...textStyle(obj, zoom) }}>
					{obj.content}
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

export function SelectionFrame({
	obj,
	zoom,
	onHandleDown,
}: {
	obj: EditorObject;
	zoom: number;
	onHandleDown: (
		e: PointerEvent<HTMLDivElement>,
		handle: Handle | "p1" | "p2",
	) => void;
}) {
	const handleStyle = (cursor: string): CSSProperties => ({
		position: "absolute",
		width: HANDLE_SIZE,
		height: HANDLE_SIZE,
		marginLeft: -HANDLE_SIZE / 2,
		marginTop: -HANDLE_SIZE / 2,
		background: "#fff",
		border: `2px solid ${ACCENT}`,
		borderRadius: 3,
		cursor,
		pointerEvents: "auto",
		touchAction: "none",
		boxSizing: "border-box",
	});

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
							borderRadius: "50%",
							left: (p === "p1" ? obj.x1 : obj.x2) * zoom,
							top: (p === "p1" ? obj.y1 : obj.y2) * zoom,
							zIndex: 30,
						}}
					/>
				))}
			</>
		);
	}

	const handles =
		obj.type === "text" || obj.type === "image" ? CORNER_HANDLES : ALL_HANDLES;
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
	return (
		<div
			style={{
				...boxStyle(obj, zoom),
				outline: `1.5px solid ${ACCENT}`,
				outlineOffset: 2,
				pointerEvents: "none",
				zIndex: 30,
			}}
		>
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
				/>
			))}
		</div>
	);
}

export function TextDraftEditor({
	obj,
	zoom,
	selectAll,
	onChange,
	onCommit,
}: {
	obj: TextObject;
	zoom: number;
	selectAll: boolean;
	onChange: (content: string) => void;
	onCommit: () => void;
}) {
	const ref = useRef<HTMLTextAreaElement>(null);
	const selectAllRef = useRef(selectAll);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		// Espera o layout (o textarea nasce durante o pointerdown).
		const t = window.setTimeout(() => {
			el.focus({ preventScroll: true });
			if (selectAllRef.current) el.select();
			else el.setSelectionRange(el.value.length, el.value.length);
		}, 0);
		return () => window.clearTimeout(t);
	}, []);

	// Folga para o próximo caractere não quebrar o layout antes da remedição.
	const extra = obj.fontSize;
	const shift =
		obj.align === "right" ? extra : obj.align === "center" ? extra / 2 : 0;
	return (
		<textarea
			ref={ref}
			value={obj.content}
			wrap="off"
			spellCheck={false}
			aria-label="Editar texto"
			onChange={(e) => onChange(e.target.value)}
			onBlur={onCommit}
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
				outline: `1.5px dashed ${ACCENT}`,
				outlineOffset: 2,
				background: "transparent",
				resize: "none",
				overflow: "hidden",
				zIndex: 40,
				opacity: obj.opacity,
			}}
		/>
	);
}

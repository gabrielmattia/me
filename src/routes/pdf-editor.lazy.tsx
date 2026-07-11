import { createLazyFileRoute } from "@tanstack/react-router";
import {
  Circle,
  Download,
  FilePlus,
  FileText,
  MousePointer,
  Square,
  Type,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { type MouseEvent, useCallback, useEffect, useRef, useState } from "react";

async function loadPdfjs() {
  const lib = await import("pdfjs-dist");
  if (!lib.GlobalWorkerOptions.workerSrc) {
    lib.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.mjs",
      import.meta.url,
    ).href;
  }
  return lib;
}

interface PdfDoc {
  numPages: number;
  getPage(n: number): Promise<any>;
  destroy(): Promise<void>;
}

export const Route = createLazyFileRoute("/pdf-editor")({ component: PdfEditor });

// ─── Types ───────────────────────────────────────────────────────────────────

type Tool = "select" | "text" | "rect" | "ellipse" | "whiteover";

type FontFamily = "Helvetica" | "Times" | "Courier";

const FONT_OPTIONS: Array<{ value: FontFamily; label: string; css: string }> = [
  { value: "Helvetica", label: "Helvetica", css: "Helvetica, Arial, sans-serif" },
  { value: "Times",     label: "Times",     css: "'Times New Roman', Times, serif" },
  { value: "Courier",   label: "Courier",   css: "'Courier New', Courier, monospace" },
];

function cssFontFamily(f: FontFamily): string {
  return FONT_OPTIONS.find((o) => o.value === f)?.css ?? "Helvetica, Arial, sans-serif";
}

interface TextAnn {
  id: string;
  type: "text";
  pageNum: number;
  x: number;
  y: number;
  content: string;
  fontSize: number;
  color: string;
  bold: boolean;
  italic: boolean;
  fontFamily: FontFamily;
}

interface ShapeAnn {
  id: string;
  type: "rect" | "ellipse" | "whiteover";
  pageNum: number;
  x: number;
  y: number;
  w: number;
  h: number;
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  opacity: number;
}

type Annotation = TextAnn | ShapeAnn;

interface DrawState {
  pageNum: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface DragState {
  id: string;
  startMX: number;
  startMY: number;
  startAX: number;
  startAY: number;
}

type ResizeHandle = "tl" | "tr" | "bl" | "br";

interface ResizeState {
  id: string;
  handle: ResizeHandle;
  startMX: number;
  startMY: number;
  origX: number;
  origY: number;
  origW: number;
  origH: number;
}

const ZOOM_LEVELS = [0.5, 0.75, 1.0, 1.25, 1.5] as const;
type ZoomLevel = (typeof ZOOM_LEVELS)[number];

// ─── PDF Text Types ───────────────────────────────────────────────────────────

/** A text item extracted from pdfjs — represents one run of text in the PDF. */
interface PdfTextItem {
  id: string;
  pageNum: number;
  str: string;
  /** Relative position (0–1) — left edge of bounding box */
  x: number;
  /** Relative position (0–1) — top edge of bounding box */
  y: number;
  width: number;  // relative (0–1)
  height: number; // relative (0–1)
  /** Font size in PDF points (= CSS px at zoom=1) */
  fontSize: number;
  fontName: string;
  /** Baseline X in PDF coordinate space (bottom-left origin) — used for download */
  pdfX: number;
  /** Baseline Y in PDF coordinate space — used for download */
  pdfY: number;
  pdfWidth: number;
  pdfHeight: number;
}

/** A user's replacement for an existing PDF text item. */
interface TextEdit {
  id: string;
  originalItemId: string;
  pageNum: number;
  originalText: string;
  newText: string;
  pdfX: number;
  pdfY: number;
  pdfWidth: number;
  pdfHeight: number;
  fontSize: number;
}

/** Combined undo snapshot — both annotations and text edits. */
interface UndoSnapshot {
  annotations: Annotation[];
  textEdits: TextEdit[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hexToRgbPdf(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return rgb(r, g, b);
}

// ─── UploadZone ──────────────────────────────────────────────────────────────

function UploadZone({ onFile, isLoading }: { onFile: (f: File) => void; isLoading: boolean }) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      className="h-screen w-screen flex flex-col items-center justify-center select-none"
      style={{ background: "#0d0d1a" }}
    >
      <div className="mb-10 text-center">
        <h1 className="text-4xl font-bold text-white mb-3 tracking-tight">PDF Editor</h1>
        <p className="text-slate-500">Edite, anote e salve seu PDF — 100% local</p>
      </div>
      <div
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const f = e.dataTransfer.files[0];
          if (f?.type === "application/pdf") onFile(f);
        }}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onClick={() => !isLoading && inputRef.current?.click()}
        className={[
          "w-[520px] rounded-2xl border-2 border-dashed p-16 flex flex-col items-center gap-6 cursor-pointer transition-all duration-200",
          isDragging
            ? "border-indigo-500 bg-indigo-600/10 scale-[1.02]"
            : "border-white/10 hover:border-indigo-500/40 hover:bg-white/3",
        ].join(" ")}
      >
        {isLoading ? (
          <>
            <div className="w-14 h-14 rounded-full border-2 border-t-transparent border-indigo-500 animate-spin" />
            <p className="text-slate-300 font-medium">Carregando PDF…</p>
          </>
        ) : (
          <>
            <div
              className="w-24 h-24 rounded-3xl flex items-center justify-center"
              style={{ background: "rgba(99,102,241,0.12)" }}
            >
              <Upload size={36} className="text-indigo-400" />
            </div>
            <div className="text-center">
              <p className="text-white font-semibold text-xl mb-2">
                {isDragging ? "Solte aqui" : "Arraste seu PDF aqui"}
              </p>
              <p className="text-slate-500">ou clique para escolher o arquivo</p>
            </div>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
        />
      </div>
    </div>
  );
}

// ─── ThumbnailPage ────────────────────────────────────────────────────────────

function ThumbnailPage({
  pdfDoc,
  pageNum,
  isActive,
  onClick,
}: {
  pdfDoc: PdfDoc;
  pageNum: number;
  isActive: boolean;
  onClick: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const page = await pdfDoc.getPage(pageNum);
      if (cancelled) return;
      const viewport = page.getViewport({ scale: 0.18 });
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      if (!ctx || cancelled) return;
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    })().catch(console.error);
    return () => { cancelled = true; };
  }, [pdfDoc, pageNum]);

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "w-full px-2.5 py-2 rounded-xl flex flex-col items-center gap-2 transition-colors",
        isActive ? "bg-indigo-600/20 ring-1 ring-inset ring-indigo-500/50" : "hover:bg-white/5",
      ].join(" ")}
    >
      <div className="rounded-sm overflow-hidden shadow-md" style={{ background: "white" }}>
        <canvas ref={canvasRef} style={{ display: "block" }} />
      </div>
      <span className={`text-xs font-medium ${isActive ? "text-indigo-300" : "text-slate-500"}`}>
        {pageNum}
      </span>
    </button>
  );
}

// ─── TextAnnotationEl ─────────────────────────────────────────────────────────

function TextAnnotationEl({
  ann,
  isSelected,
  activeTool,
  zoom,
  onSelect,
  onContentChange,
  onDelete,
  onDragStart,
}: {
  ann: TextAnn;
  isSelected: boolean;
  activeTool: Tool;
  zoom: number;
  onSelect: (id: string) => void;
  onContentChange: (id: string, content: string) => void;
  onDelete: (id: string) => void;
  onDragStart: (id: string, mx: number, my: number, ax: number, ay: number) => void;
}) {
  const [editing, setEditing] = useState(ann.content === "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

  return (
    <div
      style={{
        position: "absolute",
        left: `${ann.x * 100}%`,
        top: `${ann.y * 100}%`,
        zIndex: isSelected ? 10 : 5,
        cursor: activeTool === "select" ? "move" : "text",
        userSelect: "none",
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
        onSelect(ann.id);
        if (activeTool === "select" && !editing) {
          onDragStart(ann.id, e.clientX, e.clientY, ann.x, ann.y);
        }
      }}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
    >
      {isSelected && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(ann.id); }}
          style={{
            position: "absolute",
            top: -22,
            right: 0,
            background: "#ef4444",
            border: "none",
            borderRadius: 3,
            padding: "1px 6px",
            cursor: "pointer",
            color: "white",
            fontSize: 11,
            lineHeight: "18px",
          }}
        >
          ✕
        </button>
      )}
      {editing ? (
        <textarea
          ref={textareaRef}
          value={ann.content}
          onChange={(e) => onContentChange(ann.id, e.target.value)}
          onBlur={() => { if (!ann.content.trim()) onDelete(ann.id); else setEditing(false); }}
          onKeyDown={(e) => {
            if (e.key === "Escape") { if (!ann.content.trim()) onDelete(ann.id); else setEditing(false); }
          }}
          rows={2}
          style={{
            fontSize: ann.fontSize * zoom,
            color: ann.color,
            fontWeight: ann.bold ? "bold" : "normal",
            fontStyle: ann.italic ? "italic" : "normal",
            minWidth: 140,
            background: "rgba(255,255,255,0.97)",
            border: "2px solid #6366f1",
            borderRadius: 4,
            padding: "4px 8px",
            outline: "none",
            resize: "both",
            fontFamily: cssFontFamily(ann.fontFamily),
            boxShadow: "0 2px 12px rgba(0,0,0,0.3)",
          }}
        />
      ) : (
        <div
          style={{
            fontSize: ann.fontSize * zoom,
            color: ann.color,
            fontWeight: ann.bold ? "bold" : "normal",
            fontStyle: ann.italic ? "italic" : "normal",
            padding: "3px 8px",
            background: isSelected ? "rgba(99,102,241,0.08)" : "transparent",
            border: isSelected ? "1.5px dashed #6366f1" : "1.5px solid transparent",
            borderRadius: 4,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            lineHeight: 1.4,
            fontFamily: cssFontFamily(ann.fontFamily),
          }}
        >
          {ann.content}
        </div>
      )}
    </div>
  );
}

// ─── ShapeAnnotationEl ────────────────────────────────────────────────────────

function ShapeAnnotationEl({
  ann,
  isSelected,
  activeTool,
  onSelect,
  onDelete,
  onDragStart,
  onResizeStart,
}: {
  ann: ShapeAnn;
  isSelected: boolean;
  activeTool: Tool;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onDragStart: (id: string, mx: number, my: number, ax: number, ay: number) => void;
  onResizeStart: (id: string, handle: ResizeHandle, mx: number, my: number, x: number, y: number, w: number, h: number) => void;
}) {
  const isWhiteover = ann.type === "whiteover";

  const HANDLES: Array<{ h: ResizeHandle; top?: number | string; bottom?: number | string; left?: number | string; right?: number | string; cursor: string }> = [
    { h: "tl", top: -5, left: -5, cursor: "nw-resize" },
    { h: "tr", top: -5, right: -5, cursor: "ne-resize" },
    { h: "bl", bottom: -5, left: -5, cursor: "sw-resize" },
    { h: "br", bottom: -5, right: -5, cursor: "se-resize" },
  ];

  return (
    <div
      style={{
        position: "absolute",
        left: `${ann.x * 100}%`,
        top: `${ann.y * 100}%`,
        width: `${ann.w * 100}%`,
        height: `${ann.h * 100}%`,
        background: isWhiteover ? "#ffffff" : ann.fillColor,
        opacity: isWhiteover ? 1 : ann.opacity,
        border: isWhiteover
          ? isSelected ? "2px dashed #6366f1" : "none"
          : `${ann.strokeWidth}px solid ${ann.strokeColor}`,
        borderRadius: ann.type === "ellipse" ? "50%" : 2,
        cursor: activeTool === "select" ? "move" : "default",
        zIndex: isWhiteover ? 2 : isSelected ? 8 : 4,
        boxSizing: "border-box",
        overflow: "visible",
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
        onSelect(ann.id);
        if (activeTool === "select") {
          onDragStart(ann.id, e.clientX, e.clientY, ann.x, ann.y);
        }
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {isSelected && activeTool === "select" && (
        <>
          {/* Delete button */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(ann.id); }}
            style={{
              position: "absolute",
              top: -22,
              right: 0,
              background: "#ef4444",
              border: "none",
              borderRadius: 3,
              padding: "1px 6px",
              cursor: "pointer",
              color: "white",
              fontSize: 11,
              lineHeight: "18px",
              zIndex: 20,
            }}
          >
            ✕
          </button>

          {/* Resize handles — one per corner */}
          {HANDLES.map(({ h, cursor, ...pos }) => (
            <div
              key={h}
              style={{
                position: "absolute",
                width: 10,
                height: 10,
                background: "white",
                border: "2px solid #6366f1",
                borderRadius: 2,
                cursor,
                zIndex: 25,
                boxSizing: "border-box",
                ...pos,
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
                onResizeStart(ann.id, h, e.clientX, e.clientY, ann.x, ann.y, ann.w, ann.h);
              }}
            />
          ))}
        </>
      )}

      {/* Show delete even when not in select mode so user can always remove */}
      {isSelected && activeTool !== "select" && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(ann.id); }}
          style={{
            position: "absolute",
            top: -22,
            right: 0,
            background: "#ef4444",
            border: "none",
            borderRadius: 3,
            padding: "1px 6px",
            cursor: "pointer",
            color: "white",
            fontSize: 11,
            lineHeight: "18px",
            zIndex: 20,
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
}

// ─── PageView ─────────────────────────────────────────────────────────────────

function PageView({
  pdfDoc,
  pageNum,
  zoom,
  activeTool,
  annotations,
  selectedId,
  drawState,
  textEdits,
  onSelect,
  onAnnotationAdd,
  onAnnotationMove,
  onContentChange,
  onAnnotationDelete,
  onVisible,
  onAnnotationResize,
  onDrawStart,
  onDrawMove,
  onDrawEnd,
  onTextEditAdd,
  onTextEditDelete,
  textColor,
  fontSize,
  bold,
  italic,
  fontFamily,
  fillColor,
  strokeColor,
  strokeWidth,
  shapeOpacity,
}: {
  pdfDoc: PdfDoc;
  pageNum: number;
  zoom: number;
  activeTool: Tool;
  annotations: Annotation[];
  selectedId: string | null;
  drawState: DrawState | null;
  textEdits: TextEdit[];
  onSelect: (id: string | null) => void;
  onAnnotationAdd: (ann: Annotation) => void;
  onAnnotationMove: (id: string, x: number, y: number) => void;
  onAnnotationResize: (id: string, x: number, y: number, w: number, h: number) => void;
  onContentChange: (id: string, content: string) => void;
  onAnnotationDelete: (id: string) => void;
  onVisible: (n: number) => void;
  onDrawStart: (ds: DrawState) => void;
  onDrawMove: (endX: number, endY: number) => void;
  onDrawEnd: () => void;
  onTextEditAdd: (edit: TextEdit) => void;
  onTextEditDelete: (id: string) => void;
  textColor: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  fontFamily: FontFamily;
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  shapeOpacity: number;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);

  // ── Text layer state ──────────────────────────────────────────────────────
  const [textItems, setTextItems] = useState<PdfTextItem[]>([]);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);

  // IntersectionObserver
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry && entry.intersectionRatio > 0.3) onVisible(pageNum); },
      { threshold: 0.3 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [pageNum, onVisible]);

  // Render page to canvas
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const page = await pdfDoc.getPage(pageNum);
      if (cancelled) return;
      const viewport = page.getViewport({ scale: zoom });
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      if (!ctx || cancelled) return;
      renderTaskRef.current?.cancel();
      const task = page.render({ canvas, canvasContext: ctx, viewport });
      renderTaskRef.current = task;
      try { await task.promise; } catch { /* cancelled */ }
    })().catch(console.error);
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
    };
  }, [pdfDoc, pageNum, zoom]);

  // Extract text items — runs once per page (positions are zoom-invariant as relative values)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const page = await pdfDoc.getPage(pageNum);
      if (cancelled) return;
      // Use scale=1 so PDF coords === CSS px — makes relative positions zoom-invariant
      const viewport = page.getViewport({ scale: 1 });
      const textContent = await page.getTextContent();
      if (cancelled) return;

      const items: PdfTextItem[] = [];
      for (const raw of textContent.items) {
        // Skip TextMarkedContent items (no `str` property)
        if (!("str" in raw)) continue;
        const itm = raw as {
          str: string;
          transform: number[];
          width: number;
          height: number;
          fontName: string;
        };
        if (!itm.str.trim()) continue;

        const tx = itm.transform[4]; // baseline X in PDF coords
        const ty = itm.transform[5]; // baseline Y in PDF coords (bottom-left origin)
        // transform[3] is the scaleY factor ≈ font size in PDF points for upright text
        const fs = Math.abs(itm.transform[3]) || itm.height || 12;

        // Convert baseline from PDF coords to CSS/viewport coords (Y-flipped, scale=1)
        const [cssX, cssBaseline] = viewport.convertToViewportPoint(tx, ty);
        // Top of the text bounding box = baseline minus font height
        const topY = cssBaseline - fs;

        const rX = cssX / viewport.width;
        const rY = topY / viewport.height;
        const rW = itm.width / viewport.width;
        const rH = fs / viewport.height;

        // Skip items fully outside page bounds
        if (rX > 1.05 || rY > 1.05 || rX + rW < -0.05 || rY + rH < -0.05) continue;

        items.push({
          id: crypto.randomUUID(),
          pageNum,
          str: itm.str,
          x: Math.max(0, rX),
          y: Math.max(0, rY),
          width: Math.max(0.001, rW),
          height: Math.max(0.003, rH),
          fontSize: fs,
          fontName: itm.fontName ?? "",
          pdfX: tx,
          pdfY: ty,
          pdfWidth: itm.width,
          pdfHeight: fs,
        });
      }
      setTextItems(items);
    })().catch(console.error);
    return () => { cancelled = true; };
  }, [pdfDoc, pageNum]); // NOT zoom — relative positions are invariant

  // Focus textarea when editing starts
  useEffect(() => {
    if (editingItemId) {
      const t = setTimeout(() => editTextareaRef.current?.focus(), 10);
      return () => clearTimeout(t);
    }
  }, [editingItemId]);

  // Global drag — mousemove + mouseup tracked on window so drag works even
  // when the cursor leaves the overlay div (fast movements, scroll edges, etc.)
  useEffect(() => {
    if (!dragState) return;

    const handleMove = (e: globalThis.MouseEvent) => {
      const overlay = overlayRef.current;
      if (!overlay) return;
      const { width, height } = overlay.getBoundingClientRect();
      const dx = (e.clientX - dragState.startMX) / width;
      const dy = (e.clientY - dragState.startMY) / height;
      onAnnotationMove(
        dragState.id,
        Math.max(0, Math.min(0.98, dragState.startAX + dx)),
        Math.max(0, Math.min(0.98, dragState.startAY + dy)),
      );
    };

    const handleUp = () => setDragState(null);

    // Visual feedback during drag
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragState, onAnnotationMove]);

  // Global resize — same global pattern as drag
  useEffect(() => {
    if (!resizeState) return;

    const CURSOR_MAP: Record<ResizeHandle, string> = {
      tl: "nw-resize", tr: "ne-resize", bl: "sw-resize", br: "se-resize",
    };
    const MIN = 0.008;

    const handleMove = (e: globalThis.MouseEvent) => {
      const overlay = overlayRef.current;
      if (!overlay) return;
      const { width, height } = overlay.getBoundingClientRect();
      const dx = (e.clientX - resizeState.startMX) / width;
      const dy = (e.clientY - resizeState.startMY) / height;
      const { origX, origY, origW, origH, handle } = resizeState;

      let x = origX, y = origY, w = origW, h = origH;

      // Horizontal: left handles shrink/grow from left, right handles from right
      if (handle === "tl" || handle === "bl") {
        const nw = origW - dx;
        if (nw >= MIN) { x = origX + dx; w = nw; }
      } else {
        const nw = origW + dx;
        if (nw >= MIN) w = nw;
      }

      // Vertical: top handles from top, bottom handles from bottom
      if (handle === "tl" || handle === "tr") {
        const nh = origH - dy;
        if (nh >= MIN) { y = origY + dy; h = nh; }
      } else {
        const nh = origH + dy;
        if (nh >= MIN) h = nh;
      }

      onAnnotationResize(resizeState.id, x, y, w, h);
    };

    const handleUp = () => setResizeState(null);

    document.body.style.cursor = CURSOR_MAP[resizeState.handle];
    document.body.style.userSelect = "none";

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [resizeState, onAnnotationResize]);

  // ── Text editing callbacks ─────────────────────────────────────────────────

  const startEditing = useCallback((item: PdfTextItem) => {
    const existing = textEdits.find((e) => e.originalItemId === item.id);
    setEditingItemId(item.id);
    setEditingText(existing ? existing.newText : item.str);
  }, [textEdits]);

  const confirmEdit = useCallback(() => {
    if (!editingItemId) return;
    const item = textItems.find((ti) => ti.id === editingItemId);
    if (item) {
      const newText = editingText.trim();
      const existing = textEdits.find((e) => e.originalItemId === item.id);

      if (newText === item.str && existing) {
        // User restored original text — delete the existing edit
        onTextEditDelete(existing.id);
      } else if (newText !== item.str || existing) {
        // Something changed — upsert the edit
        const hasChange = !existing || existing.newText !== newText;
        if (hasChange) {
          onTextEditAdd({
            id: crypto.randomUUID(),
            originalItemId: item.id,
            pageNum: item.pageNum,
            originalText: item.str,
            newText,
            pdfX: item.pdfX,
            pdfY: item.pdfY,
            pdfWidth: item.pdfWidth,
            pdfHeight: item.pdfHeight,
            fontSize: item.fontSize,
          });
        }
      }
    }
    setEditingItemId(null);
    setEditingText("");
  }, [editingItemId, editingText, textItems, textEdits, onTextEditAdd, onTextEditDelete]);

  const cancelEdit = useCallback(() => {
    setEditingItemId(null);
    setEditingText("");
  }, []);

  // ── Mouse handlers for annotations ────────────────────────────────────────

  const getRelPos = (e: MouseEvent<HTMLDivElement>) => {
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    return {
      rx: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      ry: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  };

  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    e.preventDefault();
    onSelect(null);
    const { rx, ry } = getRelPos(e);

    if (activeTool === "text") {
      onAnnotationAdd({
        id: crypto.randomUUID(),
        type: "text",
        pageNum,
        x: rx,
        y: ry,
        content: "",
        fontSize,
        color: textColor,
        bold,
        italic,
        fontFamily,
      });
    } else if (activeTool === "rect" || activeTool === "ellipse" || activeTool === "whiteover") {
      onDrawStart({ pageNum, startX: rx, startY: ry, endX: rx, endY: ry });
    }
  };

  // Drag is handled globally (see useEffect above); this only updates draw preview
  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (drawState?.pageNum === pageNum) {
      const { rx, ry } = getRelPos(e);
      onDrawMove(rx, ry);
    }
  };

  const handleMouseUp = () => {
    setDragState(null);
    if (drawState?.pageNum === pageNum) {
      const x = Math.min(drawState.startX, drawState.endX);
      const y = Math.min(drawState.startY, drawState.endY);
      const w = Math.abs(drawState.endX - drawState.startX);
      const h = Math.abs(drawState.endY - drawState.startY);
      if (w > 0.005 && h > 0.005) {
        const type = activeTool as "rect" | "ellipse" | "whiteover";
        onAnnotationAdd({
          id: crypto.randomUUID(),
          type,
          pageNum,
          x,
          y,
          w,
          h,
          fillColor: activeTool === "whiteover" ? "#ffffff" : fillColor,
          strokeColor,
          strokeWidth,
          opacity: activeTool === "whiteover" ? 1 : shapeOpacity,
        });
      }
      onDrawEnd();
    }
  };

  const cursor =
    activeTool === "text" ? "text"
    : activeTool === "rect" || activeTool === "ellipse" || activeTool === "whiteover" ? "crosshair"
    : "default";

  // Preview while drawing on this page
  const preview =
    drawState?.pageNum === pageNum
      ? {
          x: Math.min(drawState.startX, drawState.endX),
          y: Math.min(drawState.startY, drawState.endY),
          w: Math.abs(drawState.endX - drawState.startX),
          h: Math.abs(drawState.endY - drawState.startY),
        }
      : null;

  return (
    <div
      ref={wrapperRef}
      data-page={pageNum}
      className="relative mb-8"
      style={{ filter: "drop-shadow(0 8px 32px rgba(0,0,0,0.55))" }}
    >
      <canvas ref={canvasRef} style={{ display: "block" }} />

      {/* Annotation overlay — sits on top of canvas */}
      <div
        ref={overlayRef}
        style={{
          position: "absolute",
          inset: 0,
          cursor: dragState ? "grabbing" : cursor,
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        {annotations.map((ann) =>
          ann.type === "text" ? (
            <TextAnnotationEl
              key={ann.id}
              ann={ann}
              isSelected={selectedId === ann.id}
              activeTool={activeTool}
              zoom={zoom}
              onSelect={onSelect}
              onContentChange={onContentChange}
              onDelete={onAnnotationDelete}
              onDragStart={(id, mx, my, ax, ay) =>
                setDragState({ id, startMX: mx, startMY: my, startAX: ax, startAY: ay })
              }
            />
          ) : (
            <ShapeAnnotationEl
              key={ann.id}
              ann={ann}
              isSelected={selectedId === ann.id}
              activeTool={activeTool}
              onSelect={onSelect}
              onDelete={onAnnotationDelete}
              onDragStart={(id, mx, my, ax, ay) =>
                setDragState({ id, startMX: mx, startMY: my, startAX: ax, startAY: ay })
              }
              onResizeStart={(id, handle, mx, my, x, y, w, h) =>
                setResizeState({ id, handle, startMX: mx, startMY: my, origX: x, origY: y, origW: w, origH: h })
              }
            />
          ),
        )}

        {preview && preview.w > 0 && preview.h > 0 && (
          <div
            style={{
              position: "absolute",
              left: `${preview.x * 100}%`,
              top: `${preview.y * 100}%`,
              width: `${preview.w * 100}%`,
              height: `${preview.h * 100}%`,
              background: activeTool === "whiteover" ? "white" : fillColor,
              opacity: activeTool === "whiteover" ? 0.85 : shapeOpacity,
              border: activeTool === "whiteover" ? "1px dashed #aaa" : `${strokeWidth}px dashed ${strokeColor}`,
              borderRadius: activeTool === "ellipse" ? "50%" : 2,
              pointerEvents: "none",
              boxSizing: "border-box",
            }}
          />
        )}

        {/* ── PDF text items layer — visible in select mode ── */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 6,
            // Container is ALWAYS pointer-events:none — it must never block shapes/overlay.
            // Individual text item divs control their own pointer-events.
            pointerEvents: "none",
          }}
        >
          {textItems.map((item) => {
            const existingEdit = textEdits.find((e) => e.originalItemId === item.id);
            const isEdited = Boolean(existingEdit);
            const isHovered = hoveredItemId === item.id;
            const isEditing = editingItemId === item.id;

            return (
              <div
                key={item.id}
                style={{
                  position: "absolute",
                  left: `${item.x * 100}%`,
                  top: `${item.y * 100}%`,
                  width: `${item.width * 100}%`,
                  height: `${item.height * 100}%`,
                  // Expand container when editing so textarea fits
                  ...(isEditing ? { minWidth: 160, overflow: "visible" } : {}),
                  zIndex: isEditing ? 20 : 1,
                  cursor: "text",
                  // Only intercept events in select mode; otherwise shapes/overlay get priority
                  pointerEvents: activeTool === "select" ? "auto" : "none",
                  boxSizing: "border-box",
                  // Hover/edited outline — stays transparent to not distract during drawing
                  outline: isEditing
                    ? "none"
                    : isHovered
                    ? "1px dashed rgba(99,102,241,0.6)"
                    : isEdited
                    ? "1px dashed rgba(99,102,241,0.35)"
                    : "1px solid transparent",
                  background: isEdited && !isEditing
                    ? "rgba(99,102,241,0.06)"
                    : "transparent",
                  transition: "outline 0.1s, background 0.1s",
                }}
                title={
                  isEdited
                    ? `Editado: "${existingEdit?.newText ?? ""}"`
                    : `"${item.str}"`
                }
                onMouseEnter={() => { if (!isEditing) setHoveredItemId(item.id); }}
                onMouseLeave={() => { if (!isEditing) setHoveredItemId(null); }}
                // Prevent mousedown from bubbling to the annotation overlay
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isEditing) startEditing(item);
                }}
              >
                {isEditing && (
                  <textarea
                    ref={editTextareaRef}
                    value={editingText}
                    rows={1}
                    onChange={(e) => setEditingText(e.target.value)}
                    onBlur={confirmEdit}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
                      // Enter without Shift = confirm; Shift+Enter = newline
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); confirmEdit(); }
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      display: "block",
                      width: "100%",
                      minWidth: 160,
                      minHeight: `${Math.max(26, item.fontSize * zoom * 1.35)}px`,
                      fontSize: `${item.fontSize * zoom}px`,
                      lineHeight: 1.3,
                      background: "rgba(255,255,255,0.97)",
                      border: "2px solid #6366f1",
                      borderRadius: 4,
                      padding: "2px 6px",
                      outline: "none",
                      resize: "both",
                      fontFamily: "Helvetica, Arial, sans-serif",
                      boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
                      color: "#1a1a1a",
                      boxSizing: "border-box",
                      zIndex: 21,
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Toolbar ─────────────────────────────────────────────────────────────────

function Toolbar({
  fileName,
  currentPage,
  numPages,
  zoom,
  activeTool,
  textColor,
  fontSize,
  bold,
  italic,
  fontFamily,
  fillColor,
  strokeColor,
  strokeWidth,
  shapeOpacity,
  onZoomIn,
  onZoomOut,
  onZoomSet,
  onToolChange,
  onTextColorChange,
  onFontSizeChange,
  onBoldChange,
  onItalicChange,
  onFontFamilyChange,
  onFillColorChange,
  onStrokeColorChange,
  onStrokeWidthChange,
  onShapeOpacityChange,
  onDownload,
  onNewFile,
  isExporting,
}: {
  fileName: string;
  currentPage: number;
  numPages: number;
  zoom: ZoomLevel;
  activeTool: Tool;
  textColor: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  fontFamily: FontFamily;
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  shapeOpacity: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomSet: (z: number) => void;
  onToolChange: (t: Tool) => void;
  onTextColorChange: (c: string) => void;
  onFontSizeChange: (s: number) => void;
  onBoldChange: (v: boolean) => void;
  onItalicChange: (v: boolean) => void;
  onFontFamilyChange: (f: FontFamily) => void;
  onFillColorChange: (c: string) => void;
  onStrokeColorChange: (c: string) => void;
  onStrokeWidthChange: (w: number) => void;
  onShapeOpacityChange: (o: number) => void;
  onDownload: () => void;
  onNewFile: () => void;
  isExporting: boolean;
}) {
  const tools: Array<{ id: Tool; icon: React.ReactNode; label: string }> = [
    { id: "select", icon: <MousePointer size={13} />, label: "Selecionar" },
    { id: "text", icon: <Type size={13} />, label: "Texto" },
    { id: "rect", icon: <Square size={13} />, label: "Retângulo" },
    { id: "ellipse", icon: <Circle size={13} />, label: "Elipse" },
    { id: "whiteover", icon: <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1 }}>◻</span>, label: "Cobrir" },
  ];

  const sep = <div className="w-px h-5 bg-white/10 shrink-0 mx-1" />;

  return (
    <div
      className="flex items-center gap-1.5 px-3 h-13 shrink-0 border-b border-white/10 overflow-x-auto"
      style={{ background: "#16213e", minHeight: 52 }}
    >
      {/* File name */}
      <div className="flex items-center gap-1.5 min-w-0 shrink-0" style={{ maxWidth: 180 }}>
        <FileText size={12} className="text-slate-500 shrink-0" />
        <span className="text-xs text-slate-400 truncate">{fileName}</span>
      </div>

      {sep}

      {/* Page counter */}
      <span className="text-xs tabular-nums shrink-0">
        <span className="text-white font-semibold">{currentPage}</span>
        <span className="text-slate-600 mx-0.5">/</span>
        <span className="text-slate-400">{numPages}</span>
      </span>

      {sep}

      {/* Zoom */}
      <div className="flex items-center gap-0.5 shrink-0">
        <button type="button" onClick={onZoomOut} disabled={zoom <= ZOOM_LEVELS[0]}
          className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-30 transition-colors">
          <ZoomOut size={13} />
        </button>
        <select value={zoom} onChange={(e) => onZoomSet(Number(e.target.value))}
          className="text-xs text-slate-300 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 outline-none focus:border-indigo-500 cursor-pointer">
          {ZOOM_LEVELS.map((z) => (
            <option key={z} value={z} style={{ background: "#16213e" }}>{Math.round(z * 100)}%</option>
          ))}
        </select>
        <button type="button" onClick={onZoomIn} disabled={zoom >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
          className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-30 transition-colors">
          <ZoomIn size={13} />
        </button>
      </div>

      {sep}

      {/* Tool buttons */}
      <div className="flex items-center gap-0.5 shrink-0">
        {tools.map((t) => (
          <button key={t.id} type="button" onClick={() => onToolChange(t.id)} title={t.label}
            className={[
              "flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap",
              activeTool === t.id
                ? "bg-indigo-600 text-white"
                : "text-slate-400 hover:text-white hover:bg-white/10",
            ].join(" ")}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Select mode hint */}
      {activeTool === "select" && (
        <>
          {sep}
          <span className="text-[10px] text-slate-500 shrink-0">Clique em texto do PDF para editar</span>
        </>
      )}

      {/* Text options */}
      {activeTool === "text" && (
        <>
          {sep}
          <div className="flex items-center gap-2 shrink-0">
            <label className="text-[10px] text-slate-500 uppercase tracking-wider">Cor</label>
            <input type="color" value={textColor} onChange={(e) => onTextColorChange(e.target.value)}
              className="w-6 h-6 rounded cursor-pointer border border-white/10" style={{ padding: 1 }} />
            <label className="text-[10px] text-slate-500 uppercase tracking-wider">Tam</label>
            <input type="number" value={fontSize} min={8} max={72}
              onChange={(e) => onFontSizeChange(Number(e.target.value))}
              className="w-12 text-xs text-slate-300 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 outline-none focus:border-indigo-500" />
            <button type="button" onClick={() => onBoldChange(!bold)}
              className={["px-2 py-0.5 rounded text-xs font-bold transition-colors", bold ? "bg-indigo-600 text-white" : "text-slate-400 hover:bg-white/10"].join(" ")}>
              B
            </button>
            <button type="button" onClick={() => onItalicChange(!italic)}
              className={["px-2 py-0.5 rounded text-xs italic transition-colors", italic ? "bg-indigo-600 text-white" : "text-slate-400 hover:bg-white/10"].join(" ")}>
              I
            </button>
            <label className="text-[10px] text-slate-500 uppercase tracking-wider">Fonte</label>
            <select
              value={fontFamily}
              onChange={(e) => onFontFamilyChange(e.target.value as FontFamily)}
              className="text-xs text-slate-300 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 outline-none focus:border-indigo-500 cursor-pointer"
            >
              {FONT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value} style={{ background: "#16213e", fontFamily: o.css }}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      {/* Shape options */}
      {(activeTool === "rect" || activeTool === "ellipse") && (
        <>
          {sep}
          <div className="flex items-center gap-2 shrink-0">
            <label className="text-[10px] text-slate-500 uppercase tracking-wider">Preench.</label>
            <input type="color" value={fillColor} onChange={(e) => onFillColorChange(e.target.value)}
              className="w-6 h-6 rounded cursor-pointer border border-white/10" style={{ padding: 1 }} />
            <label className="text-[10px] text-slate-500 uppercase tracking-wider">Borda</label>
            <input type="color" value={strokeColor} onChange={(e) => onStrokeColorChange(e.target.value)}
              className="w-6 h-6 rounded cursor-pointer border border-white/10" style={{ padding: 1 }} />
            <label className="text-[10px] text-slate-500 uppercase tracking-wider">Esp.</label>
            <input type="number" value={strokeWidth} min={0} max={20}
              onChange={(e) => onStrokeWidthChange(Number(e.target.value))}
              className="w-10 text-xs text-slate-300 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 outline-none focus:border-indigo-500" />
            <label className="text-[10px] text-slate-500 uppercase tracking-wider">Opac.</label>
            <input type="range" min={0.1} max={1} step={0.05} value={shapeOpacity}
              onChange={(e) => onShapeOpacityChange(Number(e.target.value))}
              className="w-16 accent-indigo-500" />
          </div>
        </>
      )}

      {activeTool === "whiteover" && (
        <>
          {sep}
          <span className="text-xs text-slate-400 shrink-0">Arraste para cobrir conteúdo existente</span>
        </>
      )}

      {sep}

      <button type="button" onClick={onDownload} disabled={isExporting}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0">
        <Download size={13} />
        {isExporting ? "Exportando…" : "Download"}
      </button>

      <button type="button" onClick={onNewFile}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-slate-400 hover:text-white hover:bg-white/10 transition-colors whitespace-nowrap shrink-0">
        <FilePlus size={13} />
        Novo
      </button>
    </div>
  );
}

// ─── PdfEditor ────────────────────────────────────────────────────────────────

function PdfEditor() {
  const [file, setFile] = useState<File | null>(null);
  const [pdfDoc, setPdfDoc] = useState<PdfDoc | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState<ZoomLevel>(1.0);
  const [activeTool, setActiveTool] = useState<Tool>("select");
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [textEdits, setTextEdits] = useState<TextEdit[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawState, setDrawState] = useState<DrawState | null>(null);

  // Text options
  const [textColor, setTextColor] = useState("#1a1a1a");
  const [fontSize, setFontSize] = useState(14);
  const [bold, setBold] = useState(false);
  const [italic, setItalic] = useState(false);
  const [fontFamily, setFontFamily] = useState<FontFamily>("Helvetica");

  // Shape options
  const [fillColor, setFillColor] = useState("rgba(99,102,241,0.2)");
  const [strokeColor, setStrokeColor] = useState("#6366f1");
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [shapeOpacity, setShapeOpacity] = useState(0.5);

  const mainAreaRef = useRef<HTMLDivElement>(null);

  // Mutable refs so undo snapshots can capture latest values without closure staleness
  const annotationsRef = useRef<Annotation[]>([]);
  const textEditsRef = useRef<TextEdit[]>([]);
  // Keep refs in sync on every render (safe: refs are mutable, no side effects)
  annotationsRef.current = annotations;
  textEditsRef.current = textEdits;

  // Unified undo stack — snapshots of both annotations and textEdits
  const undoStack = useRef<UndoSnapshot[]>([]);

  const pushUndo = useCallback(() => {
    undoStack.current.push({
      annotations: [...annotationsRef.current],
      textEdits: [...textEditsRef.current],
    });
    if (undoStack.current.length > 60) undoStack.current.shift();
  }, []);

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (prev) {
      setAnnotations(prev.annotations);
      setTextEdits(prev.textEdits);
    }
  }, []);

  // Cmd+Z / Ctrl+Z undo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        const tag = (document.activeElement?.tagName ?? "").toLowerCase();
        if (tag !== "input" && tag !== "textarea") {
          pushUndo();
          setAnnotations((prev) => prev.filter((a) => a.id !== selectedId));
          setSelectedId(null);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, selectedId, pushUndo]);

  const loadFile = useCallback(async (f: File) => {
    setIsLoading(true);
    setFile(f);
    setCurrentPage(1);
    setPdfDoc(null);
    setAnnotations([]);
    setTextEdits([]);
    setSelectedId(null);
    undoStack.current = [];
    try {
      const buf = await f.arrayBuffer();
      const pdfjs = await loadPdfjs();
      const doc = await pdfjs.getDocument({ data: buf }).promise;
      setPdfDoc(doc);
      setNumPages(doc.numPages);
    } catch (err) {
      console.error("Falha ao carregar PDF:", err);
      setFile(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleAnnotationAdd = useCallback((ann: Annotation) => {
    pushUndo();
    setAnnotations((prev) => [...prev, ann]);
    if (ann.type !== "text") setSelectedId(ann.id);
  }, [pushUndo]);

  const handleAnnotationMove = useCallback((id: string, x: number, y: number) => {
    setAnnotations((prev) => prev.map((a) => (a.id === id ? { ...a, x, y } : a)));
  }, []);

  const handleAnnotationResize = useCallback((id: string, x: number, y: number, w: number, h: number) => {
    setAnnotations((prev) =>
      prev.map((a) => (a.id === id && a.type !== "text" ? { ...a, x, y, w, h } : a)),
    );
  }, []);

  const handleContentChange = useCallback((id: string, content: string) => {
    setAnnotations((prev) =>
      prev.map((a) => (a.id === id && a.type === "text" ? { ...a, content } : a)),
    );
  }, []);

  const handleAnnotationDelete = useCallback((id: string) => {
    pushUndo();
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
    setSelectedId(null);
  }, [pushUndo]);

  const handleTextEditAdd = useCallback((edit: TextEdit) => {
    pushUndo();
    setTextEdits((prev) => {
      // Replace any existing edit for the same original text item
      const filtered = prev.filter((e) => e.originalItemId !== edit.originalItemId);
      return [...filtered, edit];
    });
  }, [pushUndo]);

  const handleTextEditDelete = useCallback((id: string) => {
    pushUndo();
    setTextEdits((prev) => prev.filter((e) => e.id !== id));
  }, [pushUndo]);

  const handleZoomIn = useCallback(() => {
    setZoom((z) => {
      const idx = ZOOM_LEVELS.indexOf(z);
      return (idx < ZOOM_LEVELS.length - 1 ? ZOOM_LEVELS[idx + 1] : z) as ZoomLevel;
    });
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((z) => {
      const idx = ZOOM_LEVELS.indexOf(z);
      return (idx > 0 ? ZOOM_LEVELS[idx - 1] : z) as ZoomLevel;
    });
  }, []);

  const handleZoomSet = useCallback((val: number) => {
    const found = ZOOM_LEVELS.find((l) => l === val);
    if (found !== undefined) setZoom(found);
  }, []);

  const handlePageVisible = useCallback((n: number) => setCurrentPage(n), []);

  const handleThumbnailClick = useCallback((n: number) => {
    setCurrentPage(n);
    mainAreaRef.current
      ?.querySelector(`[data-page="${n}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const handleNewFile = useCallback(() => {
    pdfDoc?.destroy().catch(console.error);
    setFile(null);
    setPdfDoc(null);
    setNumPages(0);
    setCurrentPage(1);
    setAnnotations([]);
    setTextEdits([]);
    setSelectedId(null);
    undoStack.current = [];
  }, [pdfDoc]);

  const handleDownload = useCallback(async () => {
    if (!file) return;
    setIsExporting(true);
    try {
      const pdfBytes = await file.arrayBuffer();
      const doc = await PDFDocument.load(pdfBytes);
      const pages = doc.getPages();

      // Embed all font variants for each family: [regular, bold, italic, boldItalic]
      const embeddedFonts: Record<FontFamily, [any, any, any, any]> = {
        Helvetica: [
          await doc.embedFont(StandardFonts.Helvetica),
          await doc.embedFont(StandardFonts.HelveticaBold),
          await doc.embedFont(StandardFonts.HelveticaOblique),
          await doc.embedFont(StandardFonts.HelveticaBoldOblique),
        ],
        Times: [
          await doc.embedFont(StandardFonts.TimesRoman),
          await doc.embedFont(StandardFonts.TimesRomanBold),
          await doc.embedFont(StandardFonts.TimesRomanItalic),
          await doc.embedFont(StandardFonts.TimesRomanBoldItalic),
        ],
        Courier: [
          await doc.embedFont(StandardFonts.Courier),
          await doc.embedFont(StandardFonts.CourierBold),
          await doc.embedFont(StandardFonts.CourierOblique),
          await doc.embedFont(StandardFonts.CourierBoldOblique),
        ],
      };
      // Shorthand: default font for text edits (Helvetica regular)
      const font = embeddedFonts.Helvetica[0];

      // ── 1. Apply text edits (cover original + write replacement) ──────────
      for (const edit of textEdits) {
        const page = pages[edit.pageNum - 1];
        if (!page) continue;

        // Draw white rectangle to cover the original text
        // Extend slightly beyond the text bounds to cover ascenders/descenders
        page.drawRectangle({
          x: edit.pdfX - 1,
          y: edit.pdfY - edit.pdfHeight * 0.3,
          width: Math.max(edit.pdfWidth + 2, 4),
          height: edit.pdfHeight * 1.55,
          color: rgb(1, 1, 1),
          opacity: 1,
        });

        // Draw the replacement text at the original baseline position
        if (edit.newText.trim()) {
          page.drawText(edit.newText, {
            x: edit.pdfX,
            y: edit.pdfY,  // baseline in PDF coords (bottom-left origin)
            size: edit.fontSize,
            font,
            color: rgb(0, 0, 0),
          });
        }
      }

      // ── 2. Apply annotation overlays (existing logic) ─────────────────────
      for (const ann of annotations) {
        const page = pages[ann.pageNum - 1];
        if (!page) continue;
        const { width: pdfW, height: pdfH } = page.getSize();

        if (ann.type === "text" && ann.content.trim()) {
          const [fBase, fBold, fItalic, fBoldItalic] = embeddedFonts[ann.fontFamily ?? "Helvetica"];
          const f = ann.bold && ann.italic ? fBoldItalic : ann.bold ? fBold : ann.italic ? fItalic : fBase;
          const lines = ann.content.split("\n");
          const lineHeight = ann.fontSize * 1.4; // matches CSS lineHeight: 1.4
          // ann.y is the top of the div (relative 0-1).
          // drawText y = baseline, which sits ~0.8 * fontSize below the div top.
          // Add 8pt for the CSS left-padding (3px top-padding is negligible).
          const x = ann.x * pdfW + 8;
          let baseY = pdfH - ann.y * pdfH - ann.fontSize * 0.8;
          for (const line of lines) {
            if (line) {
              page.drawText(line, {
                x,
                y: baseY,
                size: ann.fontSize,
                font: f,
                color: hexToRgbPdf(ann.color),
              });
            }
            baseY -= lineHeight;
          }
        } else if (ann.type === "whiteover") {
          page.drawRectangle({
            x: ann.x * pdfW,
            y: pdfH - (ann.y + ann.h) * pdfH,
            width: ann.w * pdfW,
            height: ann.h * pdfH,
            color: rgb(1, 1, 1),
            opacity: 1,
          });
        } else if (ann.type === "rect") {
          page.drawRectangle({
            x: ann.x * pdfW,
            y: pdfH - (ann.y + ann.h) * pdfH,
            width: ann.w * pdfW,
            height: ann.h * pdfH,
            color: hexToRgbPdf(ann.fillColor),
            opacity: ann.opacity,
            borderColor: ann.strokeWidth > 0 ? hexToRgbPdf(ann.strokeColor) : undefined,
            borderWidth: ann.strokeWidth > 0 ? ann.strokeWidth : undefined,
          });
        } else if (ann.type === "ellipse") {
          page.drawEllipse({
            x: ann.x * pdfW + (ann.w * pdfW) / 2,
            y: pdfH - ann.y * pdfH - (ann.h * pdfH) / 2,
            xScale: (ann.w * pdfW) / 2,
            yScale: (ann.h * pdfH) / 2,
            color: hexToRgbPdf(ann.fillColor),
            opacity: ann.opacity,
            borderColor: ann.strokeWidth > 0 ? hexToRgbPdf(ann.strokeColor) : undefined,
            borderWidth: ann.strokeWidth > 0 ? ann.strokeWidth : undefined,
          });
        }
      }

      const output = await doc.save();
      const blob = new Blob([output.buffer as ArrayBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name.replace(/\.pdf$/i, "_editado.pdf");
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Falha ao exportar:", err);
    } finally {
      setIsExporting(false);
    }
  }, [file, annotations, textEdits]);

  if (!file || !pdfDoc || isLoading) {
    return <UploadZone onFile={loadFile} isLoading={isLoading} />;
  }

  return (
    <div
      className="h-screen w-screen flex flex-col overflow-hidden"
      style={{ background: "#0d0d1a", color: "white" }}
    >
      <Toolbar
        fileName={file.name}
        currentPage={currentPage}
        numPages={numPages}
        zoom={zoom}
        activeTool={activeTool}
        textColor={textColor}
        fontSize={fontSize}
        bold={bold}
        italic={italic}
        fontFamily={fontFamily}
        fillColor={fillColor}
        strokeColor={strokeColor}
        strokeWidth={strokeWidth}
        shapeOpacity={shapeOpacity}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomSet={handleZoomSet}
        onToolChange={setActiveTool}
        onTextColorChange={setTextColor}
        onFontSizeChange={setFontSize}
        onBoldChange={setBold}
        onItalicChange={setItalic}
        onFontFamilyChange={setFontFamily}
        onFillColorChange={setFillColor}
        onStrokeColorChange={setStrokeColor}
        onStrokeWidthChange={setStrokeWidth}
        onShapeOpacityChange={setShapeOpacity}
        onDownload={handleDownload}
        onNewFile={handleNewFile}
        isExporting={isExporting}
      />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Sidebar */}
        <div
          className="w-[200px] shrink-0 overflow-y-auto flex flex-col gap-1 p-2 border-r border-white/8"
          style={{ background: "#111128" }}
        >
          <p className="text-[10px] text-slate-600 uppercase tracking-widest font-medium px-2 py-1.5">Páginas</p>
          {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => (
            <ThumbnailPage
              key={n}
              pdfDoc={pdfDoc}
              pageNum={n}
              isActive={n === currentPage}
              onClick={() => handleThumbnailClick(n)}
            />
          ))}
        </div>

        {/* Main canvas area */}
        <div
          ref={mainAreaRef}
          className="flex-1 overflow-y-auto flex flex-col items-center py-10 px-8"
          style={{ background: "#1a1a2e" }}
          onClick={() => setSelectedId(null)}
        >
          {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => (
            <PageView
              key={n}
              pdfDoc={pdfDoc}
              pageNum={n}
              zoom={zoom}
              activeTool={activeTool}
              annotations={annotations.filter((a) => a.pageNum === n)}
              selectedId={selectedId}
              drawState={drawState}
              textEdits={textEdits.filter((e) => e.pageNum === n)}
              onSelect={setSelectedId}
              onAnnotationAdd={handleAnnotationAdd}
              onAnnotationMove={handleAnnotationMove}
              onAnnotationResize={handleAnnotationResize}
              onContentChange={handleContentChange}
              onAnnotationDelete={handleAnnotationDelete}
              onVisible={handlePageVisible}
              onDrawStart={setDrawState}
              onDrawMove={(endX, endY) =>
                setDrawState((s) => (s ? { ...s, endX, endY } : null))
              }
              onDrawEnd={() => setDrawState(null)}
              onTextEditAdd={handleTextEditAdd}
              onTextEditDelete={handleTextEditDelete}
              textColor={textColor}
              fontSize={fontSize}
              bold={bold}
              italic={italic}
              fontFamily={fontFamily}
              fillColor={fillColor}
              strokeColor={strokeColor}
              strokeWidth={strokeWidth}
              shapeOpacity={shapeOpacity}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

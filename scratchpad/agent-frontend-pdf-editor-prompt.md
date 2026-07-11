You are a frontend-senior-developer working on a portfolio project. Your task is to create a /pdf-editor route.

## Project Context

- Stack: TanStack React Start (file-based routing), React 19, TypeScript, Tailwind CSS v4, Radix UI, lucide-react, shadcn/ui (via components.json), Vite
- Working dir: /Users/joinads/dev/portfolio
- Routing: file-based via @tanstack/react-router. New routes go in src/routes/<name>.tsx
- Route file pattern:
  ```tsx
  import { createFileRoute } from "@tanstack/react-router";
  export const Route = createFileRoute("/pdf-editor")({ component: PdfEditor });
  function PdfEditor() { ... }
  ```
- Alias: @/ maps to src/
- Styles: Tailwind CSS v4 (no config file, utility classes only), dark-mode-friendly

## Task

Create a high-quality PDF editor page at src/routes/pdf-editor.tsx, inspired by pdfe.com — a clean, professional browser-based PDF editor.

### Features to implement (client-side only, no backend needed):

1. **Upload zone** — Drag & drop or click to upload a PDF file. Use the File API.
2. **PDF rendering** — Use pdfjs-dist (install it) to render PDF pages as canvas elements. Show all pages scrollably.
3. **Toolbar** — Fixed top bar with:
   - File name display
   - Page count (e.g., "1 / 5")
   - Zoom controls (50% / 75% / 100% / 125% / 150%)
   - Tool selector: Select, Text, Highlight, Draw (visual only — not all tools need full implementation)
   - Download button (download the original file for now)
   - New file button (reset)
4. **Sidebar** — Left panel with page thumbnails (rendered at small scale using canvas)
5. **Canvas area** — Main scrollable area showing PDF pages, each as a <canvas> element rendered by pdf.js
6. **Annotations layer** — On top of each page canvas, a transparent overlay <canvas> for drawing/text (basic implementation: freehand draw with mouse when Draw tool is selected)
7. **Empty state** — Beautiful upload prompt when no file is loaded

### Design spec:
- Dark theme preferred (like pdfe.com or Figma-style)
- Sidebar: ~240px, dark (#1a1a2e or similar)
- Toolbar: top, full-width, slightly lighter dark
- Canvas bg: dark gray (#2d2d2d)
- Pages: white with subtle shadow, centered in canvas area
- Use lucide-react icons throughout
- Smooth, professional feel — not toy-like

### Dependencies to install:
Run: `cd /Users/joinads/dev/portfolio && pnpm add pdfjs-dist`

pdfjs-dist setup note: you MUST set the worker src before using it:
```ts
import * as pdfjsLib from "pdfjs-dist";
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url
).href;
```

### Risk: Low
- Pure frontend, no sensitive data, fully reversible
- No tests needed, no commits needed

### Implementation notes:
- Keep everything in one file: src/routes/pdf-editor.tsx (use sub-components within the file)
- Do NOT use any backend routes or server functions
- The route must be self-contained and work as a client-side-only feature
- Use React hooks (useState, useRef, useEffect, useCallback) for state management
- Handle PDF loading asynchronously with proper loading states
- Type everything properly with TypeScript

## When done:
1. Verify the file is created and TypeScript compiles (run: cd /Users/joinads/dev/portfolio && pnpm exec tsc --noEmit)
2. Save a summary to scratchpad/agent-frontend-pdf-editor.md including: files created/modified, any issues encountered, pnpm packages installed
3. Signal completion: cmux wait-for --signal pdf-editor-done

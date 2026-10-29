/**
 * Remoção real de texto existente do content stream.
 *
 * Critério (o que for inseguro cai para a cobertura com retângulo):
 * 1. O content stream da página precisa ser decodificável e sem imagem inline
 *    (`BI … ID … EI` não tem delimitação confiável).
 * 2. Cada linha do bloco precisa casar com pelo menos um "run" de texto: a
 *    sequência de operadores Tj/TJ/'/" entre dois posicionamentos (BT, Td, TD,
 *    Tm, T*). Como o deslocamento de um Tj só afeta o texto seguinte do MESMO
 *    run, remover runs inteiros não move nenhum outro texto. Texto dentro de
 *    Form XObjects não aparece no stream da página → não casa → cobertura.
 * 3. Runs em modo de renderização de recorte (Tr 4–7) não são removidos.
 * 4. Verificação: a página resultante é reaberta no pdfjs e o texto extraído
 *    tem que ser exatamente o original menos as linhas do bloco. Se não for,
 *    o bloco usa cobertura.
 * Só os bytes dos operadores de texto do bloco saem do stream; o resto é
 * copiado sem alteração.
 */
import {
	decodePDFRawStream,
	PDFArray,
	PDFDocument,
	PDFName,
	PDFRawStream,
} from "pdf-lib";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
	analyzeContent,
	type PageAnalysis,
	removeTextOps,
	type TextRun,
} from "./content-stream";
import { applyMatrix, multiply } from "./geometry";
import {
	extractLines,
	getSource,
	lineKey,
	loadPdfjs,
	onSourcesCleared,
} from "./pdf-source";
import type { PageModel, TextLine } from "./types";

export interface SourceRef {
	key: string;
	lines: TextLine[];
}

export interface StripResult {
	/** Blocos cujo texto original foi removido do stream. */
	removed: Set<string>;
	/** Content stream da página sem esses textos (`null` se nada foi removido). */
	content: Uint8Array | null;
	/** Página sem os textos removidos, para desenhar na tela. */
	preview: PDFDocumentProxy | null;
}

export interface RunStyle {
	run: TextRun;
	/** Tamanho efetivo (espaço base) / tamanho do Tf. */
	scale: number;
	/** Cor hex quando o preenchimento é cinza/RGB/CMYK simples. */
	color: string | null;
}

interface Analyzed {
	bytes: Uint8Array;
	analysis: PageAnalysis;
}

const libDocs = new Map<string, Promise<PDFDocument | null>>();
const analyses = new Map<string, Promise<Analyzed | null>>();
const strips = new Map<string, Promise<StripResult>>();
const STRIP_CACHE = 24;

onSourcesCleared(() => {
	for (const p of strips.values())
		p.then((r) => r.preview?.destroy()).catch(() => {});
	strips.clear();
	analyses.clear();
	libDocs.clear();
});

/** Documento pdf-lib somente leitura de uma fonte (para ler content streams). */
export function getLibDoc(docId: string): Promise<PDFDocument | null> {
	let p = libDocs.get(docId);
	if (!p) {
		const src = getSource(docId);
		p = src
			? PDFDocument.load(src.bytes, {
					ignoreEncryption: true,
					updateMetadata: false,
				}).then((d) => (d.isEncrypted ? null : d))
			: Promise.resolve(null);
		p.catch(() => libDocs.delete(docId));
		libDocs.set(docId, p);
	}
	return p;
}

/** Content streams da página, decodificados e concatenados. */
function pageContent(doc: PDFDocument, index: number): Uint8Array | null {
	const page = doc.getPage(index);
	const contents = page.node.Contents();
	const streams: unknown[] = [];
	if (contents instanceof PDFArray) {
		for (let i = 0; i < contents.size(); i++)
			streams.push(doc.context.lookup(contents.get(i)));
	} else if (contents) {
		streams.push(contents);
	}
	const parts: Uint8Array[] = [];
	for (const s of streams) {
		if (!(s instanceof PDFRawStream)) return null;
		parts.push(decodePDFRawStream(s).decode());
	}
	const total = parts.reduce((n, p) => n + p.length + 1, 0);
	const out = new Uint8Array(total);
	let o = 0;
	for (const p of parts) {
		out.set(p, o);
		o += p.length;
		out[o++] = 10;
	}
	return out;
}

function analyze(docId: string, index: number): Promise<Analyzed | null> {
	const key = `${docId}:${index}`;
	let p = analyses.get(key);
	if (!p) {
		p = (async () => {
			const doc = await getLibDoc(docId);
			if (!doc) return null;
			try {
				const bytes = pageContent(doc, index);
				if (!bytes) return null;
				return { bytes, analysis: analyzeContent(bytes) };
			} catch {
				return null;
			}
		})();
		analyses.set(key, p);
	}
	return p;
}

/** Runs do content stream que começam dentro de cada linha. `null` se alguma linha não casar. */
function matchRuns(
	analysis: PageAnalysis,
	lines: TextLine[],
	page: PageModel,
): TextRun[][] | null {
	const out: TextRun[][] = [];
	for (const line of lines) {
		const tol = line.fontSize;
		const runs = analysis.runs.filter((run) => {
			const m = multiply(run.matrix, page.viewTransform);
			if (Math.abs(m[1]) > 1e-3 * Math.abs(m[0]) || m[0] <= 0) return false;
			const [x, y] = applyMatrix(page.viewTransform, ...run.origin);
			return (
				Math.abs(y - line.baseline) < tol * 0.3 &&
				x > line.x - tol * 0.6 &&
				x < line.x + line.w - tol * 0.05
			);
		});
		if (runs.length === 0) return null;
		out.push(runs);
	}
	return out;
}

const hex2 = (v: number) =>
	Math.round(Math.max(0, Math.min(1, v)) * 255)
		.toString(16)
		.padStart(2, "0");

function fillToHex(run: TextRun): string | null {
	const last = run.fill[run.fill.length - 1];
	if (!last) return null;
	const n = last.args.filter((a): a is number => typeof a === "number");
	if (last.op === "g" && n.length === 1) return `#${hex2(n[0]).repeat(3)}`;
	if (last.op === "rg" && n.length === 3) return `#${n.map(hex2).join("")}`;
	if (last.op === "k" && n.length === 4) {
		const [c, m, y, k] = n;
		return `#${[c, m, y].map((v) => hex2((1 - v) * (1 - k))).join("")}`;
	}
	return null;
}

/**
 * Estilo original (fonte do PDF, Tc/Tw/Tz, cor) do primeiro run do bloco.
 * `null` quando o bloco não casa com o content stream.
 */
export async function describeBlock(
	page: PageModel,
	lines: TextLine[],
): Promise<RunStyle | null> {
	if (!page.source) return null;
	const a = await analyze(page.source.docId, page.source.index);
	if (!a) return null;
	const matched = matchRuns(a.analysis, lines, page);
	const run = matched?.[0]?.[0];
	if (!run || !run.fontRes || run.fontSize === 0) return null;
	const m = multiply(run.matrix, page.viewTransform);
	return {
		run,
		scale: Math.hypot(m[2], m[3]),
		color: fillToHex(run),
	};
}

async function verify(
	page: PageModel,
	doc: PDFDocument,
	content: Uint8Array,
	expected: Map<string, number>,
): Promise<PDFDocumentProxy | null> {
	const src = page.source;
	if (!src) return null;
	const out = await PDFDocument.create({ updateMetadata: false });
	const [copy] = await out.copyPages(doc, [src.index]);
	copy.node.set(
		PDFName.of("Contents"),
		out.context.register(out.context.flateStream(content)),
	);
	out.addPage(copy);
	const bytes = await out.save();
	const pdfjs = await loadPdfjs();
	const pdf = await pdfjs.getDocument({
		data: bytes,
		fontExtraProperties: true,
	}).promise;
	try {
		const p = await pdf.getPage(1);
		const vt = p.getViewport({ scale: 1 })
			.transform as PageModel["viewTransform"];
		const got = new Map<string, number>();
		for (const l of extractLines(await p.getTextContent(), vt)) {
			const k = lineKey(l);
			got.set(k, (got.get(k) ?? 0) + 1);
		}
		const same =
			got.size === expected.size &&
			[...expected].every(([k, n]) => got.get(k) === n);
		if (same) return pdf;
	} catch {
		/* falha na verificação = não remove */
	}
	await pdf.destroy();
	return null;
}

async function computeStrip(
	page: PageModel,
	refs: SourceRef[],
): Promise<StripResult> {
	const none: StripResult = {
		removed: new Set(),
		content: null,
		preview: null,
	};
	const src = page.source;
	if (!src) return none;
	const [a, doc] = await Promise.all([
		analyze(src.docId, src.index),
		getLibDoc(src.docId),
	]);
	if (!a || !doc || !a.analysis.safe) return none;

	const pdfPage = await getSource(src.docId)?.pdf.getPage(src.index + 1);
	if (!pdfPage) return none;
	const original = extractLines(
		await pdfPage.getTextContent(),
		page.viewTransform,
	);

	const candidates = new Map<string, number[]>();
	for (const ref of refs) {
		const matched = matchRuns(a.analysis, ref.lines, page);
		if (!matched) continue;
		const runs = matched.flat();
		if (runs.some((r) => r.renderMode >= 4)) continue;
		candidates.set(
			ref.key,
			runs.flatMap((r) => r.ops),
		);
	}

	const attempt = async (keys: string[]) => {
		const removedLines = new Map<string, number>();
		for (const ref of refs) {
			if (!keys.includes(ref.key)) continue;
			for (const l of ref.lines)
				removedLines.set(lineKey(l), (removedLines.get(lineKey(l)) ?? 0) + 1);
		}
		const expected = new Map<string, number>();
		for (const l of original) {
			const k = lineKey(l);
			const drop = removedLines.get(k) ?? 0;
			if (drop > 0) removedLines.set(k, drop - 1);
			else expected.set(k, (expected.get(k) ?? 0) + 1);
		}
		const content = removeTextOps(
			a.bytes,
			a.analysis,
			keys.flatMap((k) => candidates.get(k) ?? []),
		);
		const preview = await verify(page, doc, content, expected);
		return preview ? { content, preview } : null;
	};

	let keys = [...candidates.keys()];
	if (keys.length === 0) return none;
	let ok = await attempt(keys);
	if (!ok && keys.length > 1) {
		// Isola o(s) bloco(s) problemático(s).
		const good: string[] = [];
		for (const k of keys) {
			const single = await attempt([k]);
			if (single) {
				good.push(k);
				await single.preview.destroy();
			}
		}
		keys = good;
		ok = keys.length ? await attempt(keys) : null;
	}
	if (!ok) return none;
	return { removed: new Set(keys), content: ok.content, preview: ok.preview };
}

/** Resultado (em cache) da remoção dos blocos `refs` na página. */
export function stripPage(
	page: PageModel,
	refs: SourceRef[],
): Promise<StripResult> {
	const src = page.source;
	const sorted = [...refs].sort((x, y) => (x.key < y.key ? -1 : 1));
	const key = `${src?.docId}:${src?.index}|${sorted.map((r) => r.key).join(",")}`;
	let p = strips.get(key);
	if (p) {
		// LRU: move para o fim.
		strips.delete(key);
		strips.set(key, p);
		return p;
	}
	p = computeStrip(page, sorted).catch(
		(): StripResult => ({ removed: new Set(), content: null, preview: null }),
	);
	strips.set(key, p);
	if (strips.size > STRIP_CACHE) {
		const oldest = strips.keys().next().value;
		if (oldest !== undefined) {
			strips
				.get(oldest)
				?.then((r) => r.preview?.destroy())
				.catch(() => {});
			strips.delete(oldest);
		}
	}
	return p;
}

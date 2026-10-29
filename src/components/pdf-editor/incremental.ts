/**
 * Atualização incremental (PDF 7.5.6): os bytes originais ficam intactos e só
 * os objetos novos/alterados são anexados no fim, com uma nova seção de xref
 * apontando para a anterior (/Prev). Páginas não editadas continuam sendo
 * exatamente os mesmos objetos do arquivo original.
 */
import {
	type PDFContext,
	type PDFDict,
	type PDFObject,
	PDFStream,
} from "pdf-lib";

interface Snapshot {
	objects: Map<string, { obj: PDFObject; sig: string }>;
}

const signature = (obj: PDFObject) =>
	obj instanceof PDFStream ? `stream:${obj.dict.toString()}` : obj.toString();

/** Estado dos objetos indiretos logo após carregar (antes de qualquer mudança). */
export function snapshotObjects(context: PDFContext): Snapshot {
	const objects = new Map<string, { obj: PDFObject; sig: string }>();
	for (const [ref, obj] of context.enumerateIndirectObjects()) {
		objects.set(ref.tag, { obj, sig: signature(obj) });
	}
	return { objects };
}

function changedObjects(context: PDFContext, snap: Snapshot) {
	const out: ReturnType<PDFContext["enumerateIndirectObjects"]> = [];
	for (const [ref, obj] of context.enumerateIndirectObjects()) {
		const before = snap.objects.get(ref.tag);
		if (!before || before.obj !== obj || before.sig !== signature(obj)) {
			out.push([ref, obj]);
		}
	}
	return out;
}

const latin1 = (b: Uint8Array) => {
	let s = "";
	for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
	return s;
};

interface PrevXref {
	offset: number;
	kind: "table" | "stream";
	size: number;
}

/** Localiza a última seção xref do arquivo; `null` se não for confiável. */
function findPrevXref(bytes: Uint8Array): PrevXref | null {
	const tail = latin1(bytes.subarray(Math.max(0, bytes.length - 4096)));
	const all = [...tail.matchAll(/startxref\s+(\d+)/g)];
	const last = all[all.length - 1];
	if (!last) return null;
	const offset = Number(last[1]);
	if (!Number.isFinite(offset) || offset <= 0 || offset >= bytes.length)
		return null;
	const head = latin1(
		bytes.subarray(offset, Math.min(bytes.length, offset + 8192)),
	);
	if (head.startsWith("xref")) {
		const trailerAt = latin1(
			bytes.subarray(offset, Math.min(bytes.length, offset + 4 * 1024 * 1024)),
		).indexOf("trailer");
		const trailer =
			trailerAt >= 0
				? latin1(bytes.subarray(offset + trailerAt, offset + trailerAt + 4096))
				: "";
		const size = Number(/\/Size\s+(\d+)/.exec(trailer)?.[1] ?? 0);
		return { offset, kind: "table", size };
	}
	if (/^\d+\s+\d+\s+obj/.test(head) && /\/Type\s*\/XRef/.test(head)) {
		const size = Number(/\/Size\s+(\d+)/.exec(head)?.[1] ?? 0);
		return { offset, kind: "stream", size };
	}
	return null;
}

/**
 * O pdf-lib descarta object streams e xref streams ao carregar e passaria a
 * reutilizar esses números para objetos novos — o que colidiria com as seções
 * de xref anteriores. Reserva todos os números já usados no arquivo.
 */
export function reserveObjectNumbers(
	original: Uint8Array,
	context: PDFContext,
) {
	let max = findPrevXref(original)?.size ?? 0;
	const text = latin1(original);
	for (const m of text.matchAll(/(?:^|[\s>\]])(\d+)\s+\d+\s+obj\b/g)) {
		const n = Number(m[1]);
		if (n + 1 > max) max = n + 1;
	}
	context.largestObjectNumber = Math.max(context.largestObjectNumber, max - 1);
}

const enc = new TextEncoder();

/**
 * Anexa ao arquivo original os objetos alterados desde `snap`.
 * Retorna `null` quando não dá para fazer incremental com segurança.
 */
export function writeIncremental(
	original: Uint8Array,
	context: PDFContext,
	snap: Snapshot,
): Uint8Array | null {
	const prev = findPrevXref(original);
	if (!prev) return null;
	const changed = changedObjects(context, snap);
	if (changed.length === 0) return original.slice();

	const chunks: Uint8Array[] = [];
	let length = original.length;
	const push = (b: Uint8Array) => {
		chunks.push(b);
		length += b.length;
	};
	const last = original[original.length - 1];
	if (last !== 10 && last !== 13) push(enc.encode("\n"));

	const offsets = new Map<number, { offset: number; gen: number }>();
	for (const [ref, obj] of changed) {
		offsets.set(ref.objectNumber, {
			offset: length,
			gen: ref.generationNumber,
		});
		push(enc.encode(`${ref.objectNumber} ${ref.generationNumber} obj\n`));
		const body = new Uint8Array(obj.sizeInBytes());
		obj.copyBytesInto(body, 0);
		push(body);
		push(enc.encode("\nendobj\n"));
	}

	const { Root, Info, ID } = context.trailerInfo;
	const trailerEntries: Record<string, PDFObject> = {};
	if (Root) trailerEntries.Root = Root;
	if (Info) trailerEntries.Info = Info;
	if (ID) trailerEntries.ID = ID;

	let maxNum = Math.max(context.largestObjectNumber, ...offsets.keys());
	const xrefOffset = length;

	if (prev.kind === "stream") {
		const xrefNum = maxNum + 1;
		maxNum = xrefNum;
		offsets.set(xrefNum, { offset: xrefOffset, gen: 0 });
		const nums = [...offsets.keys()].sort((a, b) => a - b);
		const index: number[] = [];
		for (const n of nums) {
			const lastRange = index.length - 2;
			if (lastRange >= 0 && index[lastRange] + index[lastRange + 1] === n)
				index[lastRange + 1]++;
			else index.push(n, 1);
		}
		const rows = new Uint8Array(nums.length * 7);
		nums.forEach((n, i) => {
			const { offset, gen } = offsets.get(n) as { offset: number; gen: number };
			const o = i * 7;
			rows[o] = 1;
			rows[o + 1] = (offset >>> 24) & 255;
			rows[o + 2] = (offset >>> 16) & 255;
			rows[o + 3] = (offset >>> 8) & 255;
			rows[o + 4] = offset & 255;
			rows[o + 5] = (gen >>> 8) & 255;
			rows[o + 6] = gen & 255;
		});
		const dict = context.obj({
			Type: "XRef",
			Size: Math.max(prev.size, maxNum + 1),
			W: [1, 4, 2],
			Index: index,
			Prev: prev.offset,
			...trailerEntries,
		}) as PDFDict;
		const stream = context.stream(rows, {});
		for (const [k, v] of dict.entries()) stream.dict.set(k, v);
		push(enc.encode(`${xrefNum} 0 obj\n`));
		const body = new Uint8Array(stream.sizeInBytes());
		stream.copyBytesInto(body, 0);
		push(body);
		push(enc.encode("\nendobj\n"));
	} else {
		const nums = [...offsets.keys()].sort((a, b) => a - b);
		let table = "xref\n";
		let i = 0;
		while (i < nums.length) {
			let j = i;
			while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
			table += `${nums[i]} ${j - i + 1}\n`;
			for (let k = i; k <= j; k++) {
				const { offset, gen } = offsets.get(nums[k]) as {
					offset: number;
					gen: number;
				};
				table += `${String(offset).padStart(10, "0")} ${String(gen).padStart(5, "0")} n\r\n`;
			}
			i = j + 1;
		}
		const trailer = context.obj({
			Size: Math.max(prev.size, maxNum + 1),
			Prev: prev.offset,
			...trailerEntries,
		}) as PDFDict;
		push(enc.encode(`${table}trailer\n${trailer.toString()}\n`));
	}
	push(enc.encode(`startxref\n${xrefOffset}\n%%EOF\n`));

	const out = new Uint8Array(length);
	out.set(original, 0);
	let o = original.length;
	for (const c of chunks) {
		out.set(c, o);
		o += c.length;
	}
	return out;
}

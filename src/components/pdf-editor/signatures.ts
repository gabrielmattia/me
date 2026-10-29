/** Assinaturas salvas ficam só no localStorage do navegador. */
const KEY = "pdf-editor:signatures";
const MAX = 6;

export interface SavedSignature {
	id: string;
	src: string;
	width: number;
	height: number;
}

export function loadSignatures(): SavedSignature[] {
	try {
		const raw = localStorage.getItem(KEY);
		const list = raw ? (JSON.parse(raw) as SavedSignature[]) : [];
		return Array.isArray(list)
			? list.filter((s) => typeof s?.src === "string")
			: [];
	} catch {
		return [];
	}
}

export function storeSignatures(list: SavedSignature[]) {
	try {
		localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
	} catch {
		/* cota cheia ou storage bloqueado: segue só em memória */
	}
}

/** Recorta as bordas transparentes de um canvas e devolve PNG. */
export function trimCanvas(
	canvas: HTMLCanvasElement,
	pad = 6,
): { src: string; width: number; height: number } | null {
	const ctx = canvas.getContext("2d");
	if (!ctx) return null;
	const { width, height } = canvas;
	const data = ctx.getImageData(0, 0, width, height).data;
	let minX = width;
	let minY = height;
	let maxX = -1;
	let maxY = -1;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			if (data[(y * width + x) * 4 + 3] > 8) {
				if (x < minX) minX = x;
				if (x > maxX) maxX = x;
				if (y < minY) minY = y;
				if (y > maxY) maxY = y;
			}
		}
	}
	if (maxX < 0) return null;
	minX = Math.max(0, minX - pad);
	minY = Math.max(0, minY - pad);
	maxX = Math.min(width - 1, maxX + pad);
	maxY = Math.min(height - 1, maxY + pad);
	const out = document.createElement("canvas");
	out.width = maxX - minX + 1;
	out.height = maxY - minY + 1;
	out.getContext("2d")?.drawImage(canvas, -minX, -minY);
	return {
		src: out.toDataURL("image/png"),
		width: out.width,
		height: out.height,
	};
}

/** Normaliza qualquer imagem para PNG/JPEG (os formatos que o pdf-lib embute). */
export async function readImageFile(
	file: File,
): Promise<{ src: string; width: number; height: number }> {
	const dataUrl = await new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(file);
	});
	const img = await loadImage(dataUrl);
	const supported = /^data:image\/(png|jpe?g);/.test(dataUrl);
	if (supported)
		return { src: dataUrl, width: img.naturalWidth, height: img.naturalHeight };
	const canvas = document.createElement("canvas");
	canvas.width = img.naturalWidth;
	canvas.height = img.naturalHeight;
	canvas.getContext("2d")?.drawImage(img, 0, 0);
	return {
		src: canvas.toDataURL("image/png"),
		width: canvas.width,
		height: canvas.height,
	};
}

export function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error("Imagem inválida."));
		img.src = src;
	});
}

/**
 * Modelo de dados do editor.
 *
 * Sistema de coordenadas "base": cada página tem um espaço próprio em pontos PDF
 * (1pt = 1px CSS no zoom 100%), origem no canto superior esquerdo, y para baixo,
 * já com a rotação ORIGINAL do arquivo (/Rotate) aplicada — é o que o usuário vê
 * ao abrir. A rotação feita no editor (`PageModel.rotation`) é aplicada por cima,
 * via CSS na tela e via `/Rotate` na exportação, então os objetos acompanham a
 * página sem precisar ter as coordenadas recalculadas.
 */

export type Matrix = [number, number, number, number, number, number];

export type Rotation = 0 | 90 | 180 | 270;

export type FontFamily = "Helvetica" | "Times" | "Courier";

export type TextAlign = "left" | "center" | "right";

export interface PageModel {
	id: string;
	/** Página de um PDF carregado; `null` = página em branco. */
	source: { docId: string; index: number } | null;
	/** Dimensões no espaço base (pt). */
	width: number;
	height: number;
	/** Transform PDF user space → espaço base (viewport do pdfjs em escala 1). */
	viewTransform: Matrix;
	/** /Rotate original do arquivo. */
	baseRotation: number;
	/** Rotação adicional aplicada no editor. */
	rotation: Rotation;
}

interface ObjectBase {
	id: string;
	pageId: string;
	opacity: number;
}

/**
 * Objetos de caixa: (x, y, w, h) é a caixa do conteúdo SEM rotação, e `rotation`
 * gira essa caixa em torno do centro (como `transform: rotate()` no CSS).
 */
interface BoxBase extends ObjectBase {
	x: number;
	y: number;
	w: number;
	h: number;
	rotation: Rotation;
}

export interface TextCover {
	x: number;
	y: number;
	w: number;
	h: number;
	color: string;
}

export interface TextObject extends BoxBase {
	type: "text";
	content: string;
	fontFamily: FontFamily;
	fontSize: number;
	color: string;
	bold: boolean;
	italic: boolean;
	align?: TextAlign;
	/** Altura da linha em múltiplos do tamanho da fonte (padrão `LINE_HEIGHT`). */
	lineHeight?: number;
	/**
	 * Fonte embutida do PDF a reutilizar (`loadedName` do pdfjs). Só é usada se
	 * contiver todos os glifos do texto; senão vale `fontFamily`.
	 */
	pdfFont?: string;
	/**
	 * Cobertura usada só quando o texto original não pode ser removido do
	 * content stream com segurança.
	 */
	cover?: TextCover;
	/** Presente quando o objeto substitui um texto existente do PDF. */
	source?: SourceText;
}

/** Texto original substituído por um objeto de texto. */
export interface SourceText {
	/** Chave do bloco detectado (`docId:index:n`). */
	key: string;
	text: string;
	lines: TextLine[];
	/** Cor inicial: enquanto não mudar, o texto novo reusa os operadores de cor originais. */
	color: string;
	/** Propriedades iniciais (JSON) — permite saber se o objeto ainda é idêntico ao original. */
	initial: string;
}

export interface ShapeObject extends BoxBase {
	type: "rect" | "ellipse";
	fill: string | null;
	stroke: string | null;
	strokeWidth: number;
}

export interface FillObject extends BoxBase {
	type: "whiteout" | "highlight";
	color: string;
}

export interface ImageObject extends BoxBase {
	type: "image";
	src: string;
	signature?: boolean;
}

export interface InkObject extends BoxBase {
	type: "ink";
	/** Pontos normalizados (0–1) dentro da caixa. */
	points: Array<[number, number]>;
	color: string;
	strokeWidth: number;
}

export interface LineObject extends ObjectBase {
	type: "line";
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	color: string;
	strokeWidth: number;
	arrow: boolean;
}

export type BoxObject =
	| TextObject
	| ShapeObject
	| FillObject
	| ImageObject
	| InkObject;

export type EditorObject = BoxObject | LineObject;

export type ObjectType = EditorObject["type"];

export type Tool =
	| "select"
	| "editText"
	| "text"
	| "pen"
	| "highlight"
	| "rect"
	| "ellipse"
	| "line"
	| "arrow"
	| "whiteout";

export interface DocState {
	pages: PageModel[];
	objects: EditorObject[];
}

export interface ToolDefaults {
	text: {
		fontFamily: FontFamily;
		fontSize: number;
		color: string;
		bold: boolean;
		italic: boolean;
		align: TextAlign;
	};
	shape: {
		fill: string | null;
		stroke: string | null;
		strokeWidth: number;
		opacity: number;
	};
	pen: { color: string; strokeWidth: number; opacity: number };
	highlight: { color: string; opacity: number };
	line: { color: string; strokeWidth: number; opacity: number };
	whiteout: { color: string };
}

/** Linha de texto existente (itens do pdfjs na mesma baseline), no espaço base. */
export interface TextLine {
	str: string;
	x: number;
	y: number;
	w: number;
	h: number;
	baseline: number;
	fontSize: number;
}

/** Bloco de texto existente (linha ou parágrafo) detectado via pdfjs `getTextContent`. */
export interface TextBlock {
	key: string;
	/** Linhas unidas por "\n". */
	str: string;
	lines: TextLine[];
	/** Caixa no espaço base. */
	x: number;
	y: number;
	w: number;
	h: number;
	baseline: number;
	fontSize: number;
	/** Distância entre baselines (pt); igual a 0 em blocos de uma linha. */
	leading: number;
	fontFamily: FontFamily;
	bold: boolean;
	italic: boolean;
	/** `loadedName` da fonte no pdfjs. */
	fontName: string;
}

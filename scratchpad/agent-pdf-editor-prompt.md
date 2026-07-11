Você é um frontend senior developer. Trabalhe diretamente no projeto sem criar splits ou agents adicionais.

## Projeto
Portfolio pessoal em React + TypeScript + TanStack Router + Vite. Localizado em `/Users/joinads/dev/portfolio`.

## Tarefa: PDF Editor — Edição de texto existente + adição de texto

### Contexto
O arquivo `/Users/joinads/dev/portfolio/src/routes/pdf-editor.lazy.tsx` já tem:
- Renderização de PDF via `pdfjs-dist` em canvas
- Ferramenta de texto que adiciona anotações sobre o PDF
- Ferramentas de shapes (rect, ellipse, whiteover)
- Download com `pdf-lib` embeddando anotações no PDF
- Toolbar, sidebar com thumbnails, zoom, undo

### Problema
O usuário não consegue editar o texto **existente** do PDF. A ferramenta atual só adiciona texto novo por cima. Precisa também que a adição de texto novo funcione corretamente.

### O que implementar

#### 1. Edição de texto existente do PDF (feature principal)

Usar `page.getTextContent()` do pdfjs para extrair todos os text items de cada página com suas posições. Renderizar uma camada HTML transparente por cima do canvas onde cada text item do PDF é um `<div>` clicável. Quando o usuário clica num texto existente do PDF:
- O texto entra em modo de edição (contenteditable ou textarea)
- A posição e o tamanho do elemento editável correspondem ao texto original
- O texto original fica visualmente "coberto" (usando whiteover/rect branco na camada de anotações ou via CSS)
- O usuário digita o novo texto
- Ao confirmar (blur/Enter), o texto editado é armazenado como um "text edit" especial
- No download: usa whiteover para cobrir o texto original + escreve o novo texto com pdf-lib

#### 2. Camada de texto interativa

Estrutura de dados para text items extraídos:
```typescript
interface PdfTextItem {
  id: string;
  pageNum: number;
  str: string;                 // texto original
  x: number;                   // posição relativa (0-1) no espaço do PDF
  y: number;
  width: number;               // largura relativa
  height: number;              // altura relativa
  fontSize: number;            // em pontos PDF
  fontName: string;
}

interface TextEdit {
  id: string;
  originalItemId: string;      // referência ao PdfTextItem
  pageNum: number;
  x: number;                   // coords relativas (0-1)
  y: number;
  width: number;
  height: number;
  originalText: string;
  newText: string;
  fontSize: number;
  fontName: string;
}
```

#### 3. Extração de coordenadas

O pdfjs usa sistema de coordenadas com origem no canto inferior esquerdo. Para converter para CSS (origem superior esquerda):

```typescript
// page.getTextContent() retorna items com transform matrix:
// transform = [scaleX, skewX, skewY, scaleY, translateX, translateY]
// onde translateX, translateY são as coords no espaço do PDF
// fontSize estimado: Math.sqrt(transform[2]^2 + transform[3]^2) ou usar item.height

// Para converter para coordenadas relativas (0-1) na página:
// pdfX = transform[4]
// pdfY = transform[5]
// viewport = page.getViewport({ scale: zoom })
// [cssX, cssY] = viewport.convertToViewportPoint(pdfX, pdfY)
// relX = cssX / viewport.width
// relY = cssY / viewport.height  — mas cssY já está em coords CSS (origem top-left)

// Para width e height:
// item.width e item.height estão no espaço do PDF (não CSS)
// relWidth = (item.width * zoom) / viewport.width
```

#### 4. Camada de overlay

No `PageView`, adicionar uma camada adicional `<div style="position: absolute; inset: 0;">` que contém:
- Os text items como spans/divs posicionados absolutamente
- Visíveis apenas quando activeTool === "select" (ou sempre, mas com pointer-events controlado)
- Cada item: `position: absolute; left: X%; top: Y%; width: W%; cursor: text; user-select: text`
- Texto com `color: transparent; font-size: Xpx` (invisível mas clicável na mesma posição)
- Ao hover: mostrar outline sutil para indicar que é editável
- Ao clicar: mostrar textarea/contenteditable com o texto

#### 5. Integração com download

No `handleDownload`, antes de processar anotações normais, processar os `TextEdit[]`:
- Para cada TextEdit: `page.drawRectangle` branco cobrindo o texto original
- Depois: `page.drawText` com o novo texto nas mesmas coordenadas

Use as coordenadas relativas convertidas para coordenadas absolutas do PDF:
```typescript
x: textEdit.x * pdfW
y: pdfH - (textEdit.y * pdfH) - (textEdit.height * pdfH)  // inverter eixo Y
width: textEdit.width * pdfW
height: textEdit.height * pdfH
```

#### 6. UX

- Quando a ferramenta ativa é "select": mostrar a camada de texto editável (cursor text)
- Texto existente editável deve ter outline sutil ao hover (ex: `outline: 1px dashed rgba(99,102,241,0.4)`)
- Ao entrar em edição: textarea com fundo branco, borda indigo, z-index alto
- Suporte a undo: push para undoStack antes de confirmar edit
- Tecla Escape cancela a edição sem salvar
- TextEdits aparecem no sidebar ou não (a critério do dev)

### Restrições técnicas
- NÃO criar novos arquivos — apenas modificar `src/routes/pdf-editor.lazy.tsx`
- NÃO usar `git add -A` ou `git add .`
- NÃO commitar
- NÃO rodar testes
- NÃO fazer deploy
- Manter toda a funcionalidade existente (shapes, whiteover, undo, download, zoom, thumbnails)

### Nível de risco
Medium — modificação significativa em arquivo único, sem dados sensíveis, sem integração externa.

### Conclusão
Ao terminar, salvar resumo em `scratchpad/agent-pdf-editor.md` com:
- O que foi implementado
- Como usar (UX flow)
- Quaisquer limitações conhecidas

# PDF Editor — Text Editing Feature

## O que foi implementado

### Novos tipos
- `PdfTextItem` — representa um run de texto extraído do PDF via pdfjs, com posição relativa (0–1) e coordenadas absolutas em espaço PDF (para download)
- `TextEdit` — substituição de um text item: texto novo, posição e tamanho originais do PDF
- `UndoSnapshot` — snapshot combinado de `annotations + textEdits`, para undo unificado

### Extração de texto (PageView)
- Novo `useEffect` por página que chama `page.getTextContent()` com `scale=1`
- Converte posições do espaço PDF (origem canto inferior-esquerdo) para coordenadas CSS relativas (0–1) usando `viewport.convertToViewportPoint()`
- As posições relativas são invariantes ao zoom — calculadas uma vez por página, não re-extraídas ao mudar zoom
- Filtra items sem texto (whitespace) e fora dos bounds da página

### Camada de texto interativa (PageView)
- `div` com `position: absolute; inset: 0` sobre a camada de anotações existente
- `pointerEvents: "auto"` apenas quando `activeTool === "select"`, para não interferir com outras ferramentas
- Cada text item renderiza um `div` absolutamente posicionado com `cursor: text`
- Hover: `outline: 1px dashed rgba(99,102,241,0.6)` sutil indicando que é clicável
- Items já editados têm `outline` permanente e fundo levemente azulado
- Tooltip (`title`) mostra o texto original ou o texto editado

### Fluxo de edição
1. Ferramenta `Selecionar` ativa → layer de texto aparece
2. Hover sobre texto do PDF → outline indigo sutil
3. Clique → textarea aparece sobre o texto com fundo branco, borda indigo
4. Font size do textarea = `item.fontSize * zoom` (tamanho correspondente ao texto do PDF)
5. Confirmação: `Enter` (sem Shift) ou `blur` (clique fora)
6. Cancelamento: `Escape` — restaura sem salvar
7. Se o usuário apagar tudo e confirmar com string vazia: cobre o texto original sem escrever nada
8. Se o usuário restaurar o texto original exato: o `TextEdit` é removido (undo do edit)

### Integração com Download
No `handleDownload`, antes de processar as anotações normais:
1. Para cada `TextEdit`: `drawRectangle` branco cobrindo o texto original (com margem para ascenders/descenders: `height * 1.55`, ligeiramente abaixo da baseline)
2. Se `newText` não for vazio: `drawText` no mesmo `pdfX, pdfY` (baseline original) com a fonte Helvetica

As coordenadas `pdfX, pdfY` vêm diretamente de `transform[4], transform[5]` do pdfjs (espaço PDF, bottom-left), compatíveis diretamente com pdf-lib.

### Undo unificado
- `undoStack` agora armazena `UndoSnapshot = { annotations, textEdits }` 
- `pushUndo()` (zero args) captura o estado atual via refs mutáveis (`annotationsRef`, `textEditsRef`) — atualizados inline no render, sem `useEffect`, evitando stale closures
- `Cmd+Z / Ctrl+Z` restaura ambos: anotações e edições de texto

## Como usar (UX flow)

```
1. Abra um PDF
2. Certifique-se que a ferramenta "Selecionar" está ativa (primeiro botão, padrão)
3. Passe o mouse sobre o texto do PDF — ele fica com outline azul/indigo
4. Clique no texto → textarea aparece com o texto original pré-preenchido
5. Edite o texto
6. Pressione Enter ou clique fora para confirmar
7. O item fica com destaque indigo indicando que foi editado
8. Clique em Download → o PDF gerado terá o texto substituído
```

## Limitações conhecidas

1. **Preview na tela não muda** — o canvas renderiza o PDF original; a substituição visual só é visível no arquivo exportado. O overlay mostra um destaque mas não esconde o texto original do canvas.

2. **Fonte sempre Helvetica no export** — pdf-lib só suporta StandardFonts de forma simples; a fonte original do PDF não é recuperada. Textos em fontes customizadas serão substituídos por Helvetica.

3. **Tamanho exato do texto** — `item.fontSize` é estimado a partir de `transform[3]` (scaleY da matrix) que é uma boa aproximação para texto horizontal, mas pode ser levemente impreciso para texto transformado/rotacionado.

4. **Cobertura do whiteover** — a área branca usa `height * 1.55` e `y - height * 0.3` para cobrir ascenders e descenders. Pode não cobrir perfeitamente textos com grandes ascenders ou kerning incomum.

5. **Texto RTL / vertical** — não suportado; text items em direções não-LTR podem ter posicionamento incorreto.

6. **Multi-line text items** — pdfjs fragmenta texto em runs; cada run é editável individualmente. Editar palavras adjacentes fragmentadas requer editar cada fragment separadamente.

7. **Items com width=0** — raros, mas possíveis (ex: caracteres compostos). São cobertos com retângulo de 4pt mínimo.

## Arquivos modificados

- `src/routes/pdf-editor.lazy.tsx` — único arquivo modificado

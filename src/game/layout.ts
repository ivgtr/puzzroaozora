import { graphemes } from "./text.ts";

export const CELL = 29;
export const PAD = 14;
export const BODY_SIZE = 22;
export interface Glyph { text: string; x: number; y: number; advance: number; index: number }
export interface ManuscriptLayout { glyphs: Glyph[]; width: number; height: number; rows: number; columns: number }
const opening = /^[「『（【〈《]$/u;
const closing = /^[、。，．！？!?」』）】〉》ぁぃぅぇぉっゃゅょァィゥェォッャュョー]$/u;
export function advanceOf(text: string): number { return /^[\x20-\x7e]+$/u.test(text) ? .5 : 1; }

// Only visual line breaking lives here. The original and puzzle strings never
// receive padding, newlines, replacement glyphs, or source-position information.
export function layoutManuscript(text: string, columns: number): ManuscriptLayout {
  columns = Math.max(6, Math.floor(columns));
  const chars = graphemes(text.replace(/\r\n?/g, "\n"));
  const glyphs: Glyph[] = [];
  let col = 0, row = 0, widest = 0;
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    if (char === "\n") { widest = Math.max(widest, col); row++; col = 0; continue; }
    const advance = advanceOf(char);
    const next = chars[i + 1];
    const reserve = next && closing.test(next) ? advanceOf(next) : 0;
    if (col > 0 && (col + advance > columns || (opening.test(char) && col + advance >= columns) || col + advance + reserve > columns)) {
      widest = Math.max(widest, col); row++; col = 0;
    }
    glyphs.push({ text: char, x: PAD + col * CELL, y: PAD + row * CELL, advance: advance * CELL, index: i });
    col += advance;
  }
  widest = Math.max(widest, col);
  const usedColumns = Math.max(1, Math.ceil(widest));
  return { glyphs, columns: usedColumns, rows: row + 1, width: usedColumns * CELL + PAD * 2, height: (row + 1) * CELL + PAD * 2 };
}

// Deal in the already shuffled order. Pack by actual paper width, never by the
// source sentence or fixed column count; narrow screens grow downward, not sideways.
export function dealManuscript(texts: readonly string[], columns: number, viewportWidth: number): { x: number; y: number }[] {
  const margin = viewportWidth < 700 ? 28 : 32, gap = viewportWidth < 700 ? 24 : 38;
  const available = Math.max(260, viewportWidth - margin * 2);
  let x = 0, y = 32, rowHeight = 0;
  return texts.map((text) => {
    const paper = layoutManuscript(text, columns);
    if (x > 0 && x + paper.width > available) { x = 0; y += rowHeight + gap; rowHeight = 0; }
    const point = { x: margin + x, y };
    x += paper.width + gap;
    rowHeight = Math.max(rowHeight, paper.height);
    return point;
  });
}

import { comparisonText, graphemes } from "./text.ts";
import type { Point } from "./model.ts";
import type { Bounds } from "./hint-context.ts";

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

// Map canonical fragments back onto the displayed manuscript, retaining the
// original paragraph breaks/indentation. Layout glyph indices are graphemes.
export function manuscriptFragmentRanges(text: string, fragments: readonly string[]): { start: number; end: number }[] {
  const chars = graphemes(text.replace(/\r\n?/g, "\n"));
  const positions: number[] = [];
  let lineStart = true;
  chars.forEach((char, index) => {
    if (char === "\n") { lineStart = true; return; }
    if (lineStart && (char === " " || char === "　")) return;
    lineStart = false;
    positions.push(index);
  });
  if (fragments.map(comparisonText).join("") !== comparisonText(text)) {
    throw new Error("原稿の本文と紙片の区切りが一致しません。");
  }
  let offset = 0;
  return fragments.map((part) => {
    const length = graphemes(comparisonText(part)).length;
    const start = positions[offset] ?? chars.length;
    const end = length ? positions[offset + length - 1] + 1 : start;
    offset += length;
    return { start, end };
  });
}

/** Hit the displayed character cell, including wrapped and half-width text. */
export function fragmentAt(layout: ManuscriptLayout, ranges: readonly { start: number; end: number }[], point: Point): number {
  const glyph = layout.glyphs.find((glyph) => point.x >= glyph.x && point.x < glyph.x + glyph.advance && point.y >= glyph.y && point.y < glyph.y + CELL);
  return glyph ? ranges.findIndex((range) => glyph.index >= range.start && glyph.index < range.end) : -1;
}

/** Retain reading order and the original anchor where free, without covering other papers. */
export function detachedPositions(parts: readonly { width: number; height: number }[], origin: Point, obstacles: readonly Bounds[]): Point[] {
  let y = origin.y;
  return parts.map(({ width, height }) => {
    const x = origin.x;
    let collision: Bounds | undefined;
    while ((collision = obstacles.find((other) => x < other.x + other.width + 24 && x + width + 24 > other.x && y < other.y + other.height + 24 && y + height + 24 > other.y))) y = collision.y + collision.height + 24;
    const point = { x, y };
    y += height + 24;
    return point;
  });
}

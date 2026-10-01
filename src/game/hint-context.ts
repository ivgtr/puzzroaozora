import { graphemes } from "./text.ts";

export interface Bounds { x: number; y: number; width: number; height: number }

/** Explicit navigation only: keep readable zoom and move just enough to reveal. */
export function revealOffset(view: Bounds, fragment: Bounds, margin = 12, firstGlyph?: Bounds): { x: number; y: number } {
  const axis = (start: number, size: number, visibleStart: number, visibleSize: number, firstStart: number, firstSize: number): number => {
    const low = visibleStart + margin, high = visibleStart + visibleSize - margin;
    // A very long fragment cannot fit at the current zoom. Show its beginning
    // rather than silently shrinking every paper or centering on its middle.
    // A wrapped fragment's first glyph need not be at its bounding box's left.
    if (size > high - low) { start = firstStart; size = Math.min(firstSize, high - low); }
    if (start < low) return start - low;
    return Math.max(0, start + size - high);
  };
  const first = firstGlyph ?? fragment;
  return { x: axis(fragment.x, fragment.width, view.x, view.width, first.x, first.width), y: axis(fragment.y, fragment.height, view.y, view.height, first.y, first.height) };
}

/** Keep the selected fragment's ending beside the successor's beginning. */
export function hintExcerpt(text: string, edge: "start" | "end", limit: number): string {
  const chars = graphemes(text);
  limit = Math.max(1, Math.floor(limit));
  if (chars.length <= limit) return text;
  return edge === "end" ? `…${chars.slice(-limit).join("")}` : `${chars.slice(0, limit).join("")}…`;
}

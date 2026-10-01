import type { Point } from "./model.ts";
import type { Bounds } from "./hint-context.ts";

/** One 44px control row with 4px breathing room at each edge. */
export const DESK_BAR = 52;

export function deskViewport(width: number, height: number, contextOpen = false): Bounds {
  return { x: 0, y: DESK_BAR, width: Math.max(0, width), height: Math.max(0, height - DESK_BAR * (contextOpen ? 3 : 2)) };
}

/** Rendering, gestures and connection targets share the same clipping rectangle. */
export function insideBoard(board: Bounds, point: Point, inset = 0): boolean {
  return point.x >= board.x + inset && point.x < board.x + board.width - inset && point.y >= board.y + inset && point.y < board.y + board.height - inset;
}

/** Keep a live drag's grab point visible; releasing outside still cancels it. */
export function constrainPointer(board: Bounds, point: Point): Point {
  const xInset = Math.min(8, board.width / 2), yInset = Math.min(8, board.height / 2);
  return { x: Math.max(board.x + xInset, Math.min(board.x + board.width - xInset, point.x)), y: Math.max(board.y + yInset, Math.min(board.y + board.height - yInset, point.y)) };
}

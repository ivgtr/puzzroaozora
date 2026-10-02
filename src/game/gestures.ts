import type { Point } from "./model.ts";

export function primaryPress(pointer: { wasTouch: boolean; buttons: number }): boolean {
  return pointer.wasTouch || pointer.buttons === 1;
}

type Tap = Point & { tile: string; time: number };

/** Screen-space taps only: a drag, cancellation or second finger breaks the pair. */
export class TouchTaps {
  private previous?: Tap;
  private active?: Tap;

  start(tile: string, point: Point, time: number): void {
    this.active = { tile, x: point.x, y: point.y, time };
  }
  move(point: Point): void {
    if (this.active && Math.hypot(point.x - this.active.x, point.y - this.active.y) > 6) this.cancel();
  }
  end(tile: string | undefined, point: Point, time: number): boolean {
    this.move(point);
    const active = this.active, previous = this.previous;
    this.active = undefined;
    if (!active || active.tile !== tile || time - active.time > 250) { this.cancel(); return false; }
    const double = !!previous && previous.tile === tile && time - previous.time <= 350
      && Math.hypot(point.x - previous.x, point.y - previous.y) <= 24;
    this.previous = double ? undefined : { tile, x: point.x, y: point.y, time };
    return double;
  }
  cancel(): void { this.active = undefined; this.previous = undefined; }
}

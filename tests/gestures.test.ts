import test from "node:test";
import assert from "node:assert/strict";
import { primaryPress, TouchTaps } from "../src/game/gestures.ts";

test("only two brief stationary touches on the same fragment detach; mouse and interruptions do not", () => {
  assert.equal(primaryPress({ wasTouch: false, buttons: 1 }), true);
  for (const buttons of [2, 3, 4]) assert.equal(primaryPress({ wasTouch: false, buttons }), false);
  assert.equal(primaryPress({ wasTouch: true, buttons: 1 }), true);
  const taps = new TouchTaps(), point = { x: 100, y: 100 };
  const tap = (tile: string, time: number, hold = 40, x = 100) => {
    taps.start(tile, { ...point, x }, time);
    return taps.end(tile, { ...point, x }, time + hold);
  };
  assert.equal(tap("A", 0), false);
  assert.equal(tap("A", 180), true);
  assert.equal(tap("A", 300), false); // A third tap starts a fresh pair.
  assert.equal(tap("B", 400), false);
  assert.equal(tap("B", 900), false); // Too late.
  assert.equal(tap("B", 1000, 40, 160), false); // Same fragment, far apart.
  taps.cancel(); // Pinch, pointer cancellation, HUD, hint selection or mode change.
  assert.equal(tap("B", 1100), false);
  taps.start("B", point, 1200); taps.move({ x: 110, y: 100 }); taps.move(point);
  assert.equal(taps.end("B", point, 1240), false); // A drag back to its start is not a tap.
  assert.equal(tap("B", 1300), false);
  assert.equal(tap("B", 1400, 400), false); // Long press.
  assert.equal(tap("B", 1900), false);
});

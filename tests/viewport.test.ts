import test from "node:test";
import assert from "node:assert/strict";
import { deskViewport, insideBoard, constrainPointer } from "../src/game/viewport.ts";

test("desk reserves only two touch-sized rows, plus context when requested", () => {
  for (const [width, height] of [[1280, 800], [390, 844], [320, 568], [568, 320], [844, 390]]) {
    assert.deepEqual(deskViewport(width, height), { x: 0, y: 52, width, height: height - 104 });
    assert.deepEqual(deskViewport(width, height, true), { x: 0, y: 52, width, height: height - 156 });
  }
  assert.equal(deskViewport(320, 90, true).height, 0);
});

test("board excludes all HUD/outside points and fully clipped connection targets", () => {
  const board = deskViewport(320, 568);
  assert.equal(insideBoard(board, { x: 0, y: 52 }), true);
  for (const point of [{ x: -1, y: 100 }, { x: 320, y: 100 }, { x: 1, y: 51 }, { x: 1, y: 516 }]) assert.equal(insideBoard(board, point), false);
  assert.equal(insideBoard(board, { x: 20, y: 66 }, 15), false);
  assert.equal(insideBoard(board, { x: 20, y: 67 }, 15), true);
  assert.equal(insideBoard(board, { x: 20, y: 501 }, 15), false);
});

test("live drags retain a visible grip at all four edges without changing paper scale", () => {
  const board = deskViewport(320, 568);
  assert.deepEqual(constrainPointer(board, { x: -40, y: 0 }), { x: 8, y: 60 });
  assert.deepEqual(constrainPointer(board, { x: 400, y: 700 }), { x: 312, y: 508 });
  assert.deepEqual(constrainPointer(board, { x: 120, y: 280 }), { x: 120, y: 280 });
});

import test from "node:test";
import assert from "node:assert/strict";
import { hintExcerpt, revealOffset } from "../src/game/hint-context.ts";
import { CELL, layoutManuscript } from "../src/game/layout.ts";
import { graphemes } from "../src/game/text.ts";

test("explicit hint navigation leaves an already visible fragment and readable scale alone", () => {
  assert.deepEqual(revealOffset({ x: 20, y: 50, width: 300, height: 200 }, { x: 60, y: 80, width: 200, height: 100 }), { x: 0, y: 0 });
});

test("hint navigation uses the smallest pan including its margin in every direction", () => {
  const view = { x: 20, y: 50, width: 300, height: 200 };
  assert.deepEqual(revealOffset(view, { x: 300, y: 230, width: 60, height: 60 }), { x: 52, y: 52 });
  assert.deepEqual(revealOffset(view, { x: -20, y: 0, width: 60, height: 60 }), { x: -52, y: -62 });
  assert.deepEqual(revealOffset(view, { x: 32, y: 62, width: 276, height: 176 }), { x: 0, y: 0 });
});

test("oversized fragments show their beginning without fitting the entire board", () => {
  assert.deepEqual(revealOffset({ x: 0, y: 80, width: 200, height: 120 }, { x: 40, y: 30, width: 300, height: 250 }), { x: 28, y: -62 });
});

test("high-zoom navigation reveals the actual first glyph of a fragment starting mid-row", () => {
  const prefix = "運転し始めた。書生が動くのか自分だけが動くのか";
  const layout = layoutManuscript(prefix + "よい心持に坐っておったが、", 8);
  const glyphs = layout.glyphs.filter((glyph) => glyph.index >= graphemes(prefix).length);
  const first = { x: glyphs[0].x, y: glyphs[0].y, width: glyphs[0].advance, height: CELL };
  const fragment = { x: Math.min(...glyphs.map((glyph) => glyph.x)), y: first.y, width: 8 * CELL, height: 3 * CELL };
  assert.ok(first.x > fragment.x + 100);
  const view = { x: 0, y: 0, width: 320 / 1.7, height: 380 / 1.7 }, margin = 12 / 1.7;
  const offset = revealOffset(view, fragment, margin, first);
  assert.ok(first.x >= view.x + offset.x + margin);
  assert.ok(first.x + first.width <= view.x + offset.x + view.width - margin + 1e-9);
  assert.ok(first.y >= view.y + offset.y + margin);
  assert.ok(first.y + first.height <= view.y + offset.y + view.height - margin + 1e-9);
});

test("hint context shows actual ending and beginning without splitting graphemes", () => {
  assert.equal(hintExcerpt("猫が歩いた。", "end", 4), "…歩いた。");
  assert.equal(hintExcerpt("猫が歩いた。", "start", 4), "猫が歩い…");
  assert.equal(hintExcerpt("短い。", "end", 4), "短い。");
  assert.equal(hintExcerpt("aか\u3099👨‍👩‍👧", "end", 2), "…か\u3099👨‍👩‍👧");
});

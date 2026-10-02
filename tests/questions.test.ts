import test from "node:test";
import assert from "node:assert/strict";
import { PASSAGES } from "../src/data/passages.ts";
import { drawPassage, passageOrder } from "../src/game/questions.ts";

test("random questions stay in the selected work and exclude its last excerpt", () => {
  for (const workId of new Set(PASSAGES.map((passage) => passage.workId))) {
    const choices = PASSAGES.filter((passage) => passage.workId === workId);
    assert.ok(choices.length >= 2);
    assert.equal(drawPassage(PASSAGES, workId, undefined, () => 0), choices[0]);
    assert.equal(drawPassage(PASSAGES, workId, undefined, () => .999), choices.at(-1));
    for (const previous of choices) for (const value of [0, .5, .999]) {
      const next = drawPassage(PASSAGES, workId, previous.id, () => value);
      assert.equal(next.workId, workId);
      assert.notEqual(next.id, previous.id);
      assert.notEqual(next.original, previous.original);
    }
  }
});

test("random question selection validates its inputs without changing the catalog", () => {
  const before = structuredClone(PASSAGES);
  assert.throws(() => drawPassage(PASSAGES, "unknown"), /見つかりません/);
  for (const value of [NaN, -1, 1, Infinity]) assert.throws(() => drawPassage(PASSAGES, PASSAGES[0].workId, undefined, () => value), /乱数/);
  assert.equal(drawPassage([PASSAGES[0]], PASSAGES[0].workId, PASSAGES[0].id), PASSAGES[0]);
  assert.deepEqual(PASSAGES, before);
});


test("a run draws a finite permutation of every excerpt exactly once", () => {
  for (const workId of new Set(PASSAGES.map((passage) => passage.workId))) {
    const expected = PASSAGES.filter((passage) => passage.workId === workId).map((passage) => passage.id);
    for (const draw of [0, .5, .999]) {
      const order = passageOrder(PASSAGES, workId, () => draw);
      assert.deepEqual([...order].sort(), [...expected].sort());
      assert.equal(new Set(order).size, expected.length);
    }
  }
  assert.throws(() => passageOrder(PASSAGES, "missing"), /見つかりません/);
  assert.throws(() => passageOrder([PASSAGES[0], PASSAGES[0]], PASSAGES[0].workId), /重複/);
  assert.throws(() => passageOrder(PASSAGES, PASSAGES[0].workId, () => NaN), /乱数/);
});

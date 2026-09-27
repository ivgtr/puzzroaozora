import assert from "node:assert/strict";
import { test } from "node:test";
import { PuzzleSession, canPlaceTogether, comparisonText, type Difficulty } from "../src/game/session";

function game(texts: string[], difficulty: Difficulty = "normal") {
  const session = new PuzzleSession({ title: "test", author: "", originalText: texts.join(""), pieces: texts.map((text, i) => ({ id: String(i), text })) }, difficulty);
  session.dispatch({ type: "begin" });
  return session;
}
const join = (s: PuzzleSession, moving: string, target: string, end: "before" | "after" = "after") => s.dispatch({ type: "join", moving, target, end });

test("Normal: start in the middle, confirm at three, extend both ends, merge the tail and complete once", () => {
  const s = game(["A", "B", "C", "D", "E", "F", "G", "H"]);
  assert.equal(join(s, "3", "2")?.confirmed, false);
  assert.equal(join(s, "4", "2")?.confirmed, true);
  assert.equal(join(s, "1", "2", "before")?.confirmed, true);
  assert.equal(join(s, "5", "2")?.confirmed, true);
  assert.equal(join(s, "7", "6")?.confirmed, false);
  assert.equal(join(s, "6", "2")?.confirmed, true);
  assert.equal(join(s, "0", "2", "before")?.completed, true);
  assert.equal(s.phase, "complete");
  assert.equal(s.dispatch({ type: "begin" }), null);
  assert.equal(join(s, "0", "2"), null);
});

test("Easy confirms two; wrong joins preserve internal locks and only temporary boundaries split", () => {
  const s = game(["A", "B", "C", "D", "E", "F"], "easy");
  assert.equal(join(s, "1", "0")?.confirmed, true);
  assert.equal(join(s, "5", "4")?.confirmed, true);
  assert.equal(join(s, "4", "0")?.confirmed, false);
  assert.deepEqual(s.chains.find((c) => c.id === "0")?.confirmed, [true, false, true]);
  assert.equal(s.dispatch({ type: "split", chain: "0", boundary: 0 }), null);
  assert.ok(s.dispatch({ type: "split", chain: "0", boundary: 1 }));
  assert.deepEqual(s.chains.map((c) => c.pieces).flat().sort(), ["0", "1", "2", "3", "4", "5"]);
});

test("same-text pieces are interchangeable, and ambiguous blocks are not fixed to their first match", () => {
  const s = game(["A", "B", "A", "B", "C"], "easy");
  assert.equal(join(s, "3", "0")?.confirmed, true);
  assert.equal(join(s, "1", "2")?.confirmed, true);
  assert.equal(join(s, "4", "0")?.confirmed, true);
  assert.equal(join(s, "2", "0", "before")?.completed, true);
  assert.equal(canPlaceTogether("ABXABY", ["AB", "ABY"]), true);
  assert.equal(canPlaceTogether("ABXABY", ["ABX", "BX"]), false);
});

test("a locally matching but globally conflicting join remains tentative", () => {
  const s = game(["A", "B", "X", "B", "Y"], "easy");
  join(s, "1", "0");
  assert.equal(join(s, "3", "2", "before")?.confirmed, false);
  assert.deepEqual(s.chains.find((c) => c.id === "2")?.confirmed, [false]);
  assert.equal(s.dispatch({ type: "split", chain: "2", boundary: 0 })?.kind, "split");
});

test("commands cannot create duplicates, cycles, incomplete completion or partial auto-confirmation", () => {
  const s = game(["A", "B", "C", "D"]);
  assert.equal(join(s, "0", "0"), null);
  assert.equal(join(s, "missing", "0"), null);
  join(s, "2", "0");
  assert.equal(join(s, "1", "0")?.confirmed, false);
  assert.equal(s.phase, "assembling");
  assert.deepEqual(s.chains.find((c) => c.id === "0")?.confirmed, [false, false]);
  assert.equal(join(s, "2", "3"), null);
  assert.equal(new Set(s.chains.flatMap((c) => c.pieces)).size, 4);
  assert.throws(() => new PuzzleSession({ title: "", author: "", originalText: "AB", pieces: [{ id: "x", text: "A" }, { id: "x", text: "B" }] }, "easy"));
});

test("comparison ignores display newlines, not punctuation or spaces; canonically equivalent marks compare", () => {
  assert.equal(comparisonText("か\u3099、\r\n。 A"), "が、。 A");
  assert.notEqual(comparisonText("文、"), comparisonText("文。"));
});

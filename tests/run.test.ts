import test from "node:test";
import assert from "node:assert/strict";
import { Run } from "../src/game/run.ts";
import { makeProblem, Session, type CuratedPassage } from "../src/game/model.ts";

function fixtures(count = 3, fragments = [..."ABCDEFGH"]): CuratedPassage[] {
  return Array.from({ length: count }, (_, i) => ({ id: `scene-${i}`, workId: "test", title: "test", author: "test", sourceUrl: "https://example.com",
    original: fragments.join(""), fragments: [...fragments], note: "fixture", location: "fixture", difficulty: "normal", curatedVersion: 1,
    sceneTitle: "試しの情景", premise: "静かな机。", hints: ["語り手を考える。", "前後を考える。"] }));
}
function begin(run: Run): void { run.begin(run.session.problem.tiles.map((_, i) => ({ x: i * 100, y: i * 30 }))); }
function setup(count = 3, fragments?: string[]) {
  const passages = fixtures(count, fragments);
  const run = new Run(passages, "test", { random: () => .5 });
  begin(run);
  return { run, passages };
}
function chain(run: Run, text: string): string {
  const found = run.session.state.chains.find((candidate) => run.session.text(candidate) === text);
  assert.ok(found, `missing ${text}`);
  return found.id;
}
function assemble(run: Run, fragments: readonly string[] = [..."ABCDEFGH"]): void {
  let text = fragments[0];
  for (const fragment of fragments.slice(1)) {
    assert.equal(run.dispatch({ type: "join", source: chain(run, fragment), target: chain(run, text), side: "after" }), "tentative");
    text += fragment;
  }
}
function restore(run: Run, passages: CuratedPassage[]): Run { return Run.restore(run.serialize(), passages); }

test("a finite run spends no life on success, never repeats, and ends after its final clear", () => {
  const { run } = setup();
  const seen = new Set<string>();
  for (let i = 0; i < run.total; i++) {
    assert.ok(!seen.has(run.currentPassage.id));
    seen.add(run.currentPassage.id);
    assemble(run);
    const submission = run.submit()!;
    assert.ok(submission.correct);
    assert.equal(run.clears, i + 1);
    assert.equal(run.lives, 3);
    assert.equal(run.session.state.phase, "assembling");
    assert.equal(run.settle(submission.id), true);
    assert.equal(run.settle(submission.id), false);
    assert.equal(run.dispatch({ type: "undo" }), "none");
    if (i + 1 < run.total) { assert.equal(run.advance(), true); assert.equal(run.session.state.phase, "reading"); begin(run); }
  }
  assert.equal(run.status, "ended");
  assert.equal(run.endReason, "conquered");
  assert.equal(run.canAdvance, false);
  assert.equal(run.advance(), false);
  assert.equal(run.submit(), null);
  assert.equal(run.seen.length, run.total);
});

test("wrong submission books a single life and detaches only the intact wrong suffix at settlement", () => {
  const { run } = setup();
  assemble(run, [..."ABDCHEFG"]);
  const before = run.session.state;
  const submission = run.submit()!;
  assert.equal(submission.correctPrefix, 2);
  assert.equal(run.lives, 2);
  assert.equal(run.submit(), submission);
  assert.equal(run.lives, 2);
  assert.equal(run.session.state, before);
  assert.equal(run.dispatch({ type: "undo" }), "none");
  assert.equal(run.session.dispatch({ type: "undo" }), "none");
  assert.equal(run.settle("outdated"), false);
  assert.equal(run.settle(submission.id), true);
  assert.deepEqual(run.session.state.chains.map((item) => run.session.text(item)), ["AB", "DCHEFG"]);
  assert.equal(run.dispatch({ type: "undo" }), "none");
  assert.equal(run.lives, 2);
  const [prefix, suffix] = run.session.state.chains;
  assert.ok(prefix.bonds.every((bond) => !bond));
  assert.ok(suffix.bonds.every((bond) => !bond));
  run.dispatch({ type: "move", chain: prefix.id, point: { x: prefix.x + 100, y: prefix.y + 100 } });
  assert.equal(run.dispatch({ type: "undo" }), "undo");
  assert.equal(run.lives, 2);
});

test("first tile wrong leaves the whole chain intact and the third miss ends the run", () => {
  const { run } = setup();
  assemble(run, [..."BACDEFGH"]);
  const board = run.session.state;
  for (let attempt = 0; attempt < 3; attempt++) {
    const submission = run.submit()!;
    assert.equal(submission.correctPrefix, 0);
    assert.equal(submission.firstWrongTileId, board.chains[0].tiles[0]);
    assert.equal(run.lives, 2 - attempt);
    run.settle(submission.id);
    assert.equal(run.session.state, board);
  }
  assert.equal(run.endReason, "failed");
  assert.equal(run.clears, 0);
  assert.equal(run.session.canUndo, false);
  assert.equal(run.session.canCheck, false);
  assert.equal(run.submit(), null);
  assert.equal(run.dispatch({ type: "split", chain: board.chains[0].id, boundary: 0 }), "none");
});

test("one shared hint survives Undo, settlement, the next question, and storage", () => {
  const { run, passages } = setup();
  assert.equal(run.hintsRemaining, 1);
  assert.equal(run.hintFor("missing").kind, "unavailable");
  assert.equal(run.hintFor(chain(run, "H")).kind, "unavailable");
  assert.equal(run.hintsRemaining, 1);
  const anchor = chain(run, "A");
  const hint = run.hintFor(anchor);
  assert.equal(hint.kind, "revealed");
  assert.equal(run.hintsRemaining, 0);
  const again = run.hintFor(anchor);
  assert.ok(again.kind === "revealed" && again.repeated);
  run.dispatch({ type: "move", chain: anchor, point: { x: 2, y: 3 } });
  run.dispatch({ type: "undo" });
  assert.equal(run.hintsRemaining, 0);
  const continued = restore(run, passages);
  assert.equal(continued.hintsRemaining, 0);
  assert.deepEqual(continued.hintFor(anchor), again);
  assemble(continued);
  continued.settle(continued.submit()!.id);
  continued.advance(); begin(continued);
  assert.equal(continued.hintsRemaining, 0);
  assert.equal(continued.hintFor(chain(continued, "A")).kind, "exhausted");
  const resumedNext = restore(continued, passages);
  assert.equal(resumedNext.hintsRemaining, 0);
  assert.equal(resumedNext.hintFor(chain(resumedNext, "B")).kind, "exhausted");
});

test("reload during narration restores the durable receipt without loss or double charging", () => {
  const { run, passages } = setup();
  assemble(run, [..."ABDCHEFG"]);
  const receipt = run.submit()!;
  const continued = restore(run, passages);
  assert.equal(continued.lives, 2);
  assert.deepEqual(continued.pending, receipt);
  assert.deepEqual(continued.submit(), receipt);
  assert.equal(continued.session.canCheck, false);
  assert.equal(continued.settle(receipt.id), true);
  const finished = restore(continued, passages);
  assert.equal(finished.pending, undefined);
  assert.equal(finished.lives, 2);
  assert.deepEqual(finished.lastSubmission, receipt);
  assert.equal(finished.settle(receipt.id), false);
  assert.deepEqual(finished.session.state.chains.map((item) => finished.session.text(item)), ["AB", "DCHEFG"]);
});

test("final narration can be restored and settled even though its run is already booked as ended", () => {
  for (const result of ["conquered", "failed"]) {
    const { run, passages } = setup(1);
    assemble(run, result === "conquered" ? [..."ABCDEFGH"] : [..."BACDEFGH"]);
    if (result === "failed") for (let i = 0; i < 2; i++) run.settle(run.submit()!.id);
    const receipt = run.submit()!;
    const resumed = restore(run, passages);
    assert.equal(resumed.endReason, result);
    assert.equal(resumed.pending?.id, receipt.id);
    assert.equal(resumed.settle(receipt.id), true);
    assert.equal(restore(resumed, passages).endReason, result);
    assert.equal(resumed.session.canCheck, false);
  }
});

test("only a fresh run resets budgets; abandoning cannot advance or undo", () => {
  const { run, passages } = setup();
  run.hintFor(chain(run, "A"));
  assemble(run, [..."BACDEFGH"]);
  run.submit();
  run.abandon();
  assert.equal(run.pending, undefined);
  assert.equal(run.endReason, "abandoned");
  assert.equal(run.lives, 2);
  assert.equal(run.hintsRemaining, 0);
  assert.equal(restore(run, passages).endReason, "abandoned");
  assert.equal(run.advance(), false);
  assert.equal(run.dispatch({ type: "undo" }), "none");
  const fresh = run.restart();
  assert.notEqual(fresh.id, run.id);
  assert.equal(fresh.lives, 3);
  assert.equal(fresh.hintsRemaining, 1);
  assert.equal(fresh.clears, 0);
  assert.equal(fresh.seen.length, 1);
});

test("retry narration skips only whole unchanged correct-prefix text", () => {
  const { run } = setup();
  assemble(run, [..."ABDCHEFG"]);
  const first = run.submit()!;
  assert.equal(first.skipPrefixCount, 0);
  run.settle(first.id);
  const [prefix, suffix] = run.session.state.chains;
  run.dispatch({ type: "join", source: suffix.id, target: prefix.id, side: "after" });
  const second = run.submit()!;
  assert.equal(second.correctPrefix, 2);
  assert.equal(second.skipPrefixCount, 2);
  run.settle(second.id);
  const prefixId = chain(run, "AB");
  run.dispatch({ type: "split", chain: prefixId, boundary: 0 });
  run.dispatch({ type: "join", source: chain(run, "A"), target: chain(run, "B"), side: "after" });
  run.dispatch({ type: "join", source: chain(run, "DCHEFG"), target: chain(run, "BA"), side: "after" });
  assert.equal(run.submit()!.skipPrefixCount, 0);
});

test("whole-tile prefix never marks the partly matching wrong tile as correct", () => {
  const { run } = setup(1, ["ab", "ac", "d", "e"]);
  assemble(run, ["ac", "ab", "d", "e"]);
  const receipt = run.submit()!;
  assert.equal(receipt.correctPrefix, 0);
  assert.equal(receipt.firstWrongTileId, receipt.tiles[0]);
});

test("normal and hard use authored fragment variants and restore the same IDs and arrangement", () => {
  const passages = fixtures(1, ["AB", "CD", "EF", "GH"]);
  passages[0] = { ...passages[0], hardFragments: [..."ABCDEFGH"] };
  for (const difficulty of ["normal", "hard"] as const) {
    const run = new Run(passages, "test", { difficulty, random: () => .5 }); begin(run);
    assert.equal(run.session.problem.tiles.length, difficulty === "normal" ? 4 : 8);
    const tile = run.session.state.chains[0];
    run.dispatch({ type: "move", chain: tile.id, point: { x: 321, y: -42 } });
    const resumed = restore(run, passages);
    assert.equal(resumed.difficulty, difficulty);
    assert.deepEqual(resumed.session.snapshot(), run.session.snapshot());
    assert.equal(resumed.dispatch({ type: "undo" }), "undo");
  }
});

test("malformed or inconsistent local snapshots are rejected without substituting another passage", () => {
  const { run, passages } = setup();
  run.hintFor(chain(run, "A"));
  assemble(run, [..."ABDCHEFG"]);
  run.submit();
  const original = run.snapshot();
  const corruptions: Array<(snapshot: ReturnType<Run["snapshot"]>) => void> = [
    (snapshot) => { Object.assign(snapshot, { version: 99 }); },
    (snapshot) => { Object.assign(snapshot, { lives: 3 }); },
    (snapshot) => { Object.assign(snapshot, { clears: 1 }); },
    (snapshot) => { Object.assign(snapshot, { hintsUsed: 0 }); },
    (snapshot) => { Object.assign(snapshot, { pendingId: "missing" }); },
    (snapshot) => { Object.assign(snapshot, { pendingId: null }); },
    (snapshot) => { Object.assign(snapshot, { index: 1 }); },
    (snapshot) => { Object.assign(snapshot, { endReason: "conquered" }); },
    (snapshot) => { Object.assign(snapshot, { order: [snapshot.order[0], snapshot.order[0], snapshot.order[2]] }); },
    (snapshot) => { Object.assign(snapshot.session.tiles[0], { text: "foreign text" }); },
    (snapshot) => { Object.assign(snapshot.session.state.chains[0], { x: Infinity }); },
    (snapshot) => { Object.assign(snapshot.session.state.chains[0], { tiles: [snapshot.session.tiles[0].id] }); },
    (snapshot) => { Object.assign(snapshot.submissions[0], { correct: true }); },
    (snapshot) => { Object.assign(snapshot.submissions[0], { correctPrefix: 3 }); },
    (snapshot) => { Object.assign(snapshot.submissions[0], { skipPrefixCount: 1 }); },
    (snapshot) => { Object.assign(snapshot.session.hints[0], { targetId: "missing" }); },
  ];
  for (const corrupt of corruptions) {
    const snapshot = structuredClone(original);
    corrupt(snapshot);
    assert.throws(() => Run.restore(snapshot, passages));
  }
  assert.throws(() => Run.restore("not json", passages));
  assert.throws(() => Run.restore(original, passages.slice(1)));
  assert.deepEqual(run.snapshot(), original);
});

test("snapshots are copies, and reading/complete states cannot contain a hidden Undo history", () => {
  const passages = fixtures(1);
  const session = new Session(makeProblem(passages[0]));
  const snap = session.snapshot();
  assert.equal(Session.restore(snap, passages).state.phase, "reading");
  Object.assign(snap.tiles[0], { text: "changed" });
  assert.notEqual(session.problem.tiles[0].text, "changed");
  const { run } = setup(1);
  assemble(run); run.settle(run.submit()!.id);
  const result = run.snapshot();
  Object.assign(result.session, { history: [{ ...result.session.state, phase: "assembling" }] });
  assert.throws(() => Run.restore(result, passages));
});

test("interchangeable identical tiles retain the text-based retry skip", () => {
  const { run } = setup(2, ["A", "B", "A", "C", "D", "E", "F", "G"]);
  assemble(run, ["A", "B", "D", "A", "C", "E", "F", "G"]);
  const first = run.submit()!;
  assert.equal(first.correctPrefix, 2);
  run.settle(first.id);
  while (run.session.state.chains.some((item) => item.tiles.length > 1)) {
    const group = run.session.state.chains.find((item) => item.tiles.length > 1)!;
    run.dispatch({ type: "split", chain: group.id, boundary: 0 });
  }
  const anotherA = run.session.state.chains.find((item) => run.session.text(item) === "A" && item.id !== first.tiles[0])!;
  run.dispatch({ type: "join", source: chain(run, "B"), target: anotherA.id, side: "after" });
  for (const text of ["A", "C", "D", "E", "F", "G"]) {
    run.dispatch({ type: "join", source: chain(run, text), target: anotherA.id, side: "after" });
  }
  const correct = run.submit()!;
  assert.equal(correct.correct, true);
  assert.notEqual(correct.tiles[0], first.tiles[0]);
  assert.equal(correct.skipPrefixCount, 2);
  assert.equal(run.lives, 2);
});

test("submission receipts cannot be edited to refund lives or overwrite the pending outcome", () => {
  const { run, passages } = setup();
  assemble(run, [..."BACDEFGH"]);
  const receipt = run.submit()!;
  assert.throws(() => Object.assign(receipt, { correct: true }));
  assert.throws(() => Object.assign(receipt.tiles, { 0: "forged" }));
  const restored = restore(run, passages);
  assert.throws(() => Object.assign(restored.pending!, { correctPrefix: 8 }));
  assert.equal(restored.lives, 2);
  assert.equal(restored.settle(receipt.id), true);
});

test("settlement can place the intact suffix below the prefix and restores that position", () => {
  const { run, passages } = setup();
  assemble(run, [..."ABDCHEFG"]);
  const receipt = run.submit()!;
  const before = run.snapshot();
  for (const point of [{ x: NaN, y: 10 }, { x: 10, y: Infinity }, { x: -1e7 - 1, y: 0 }, { x: 0, y: 1e7 + 1 }]) {
    assert.throws(() => run.settle(receipt.id, point), /位置/);
    assert.deepEqual(run.snapshot(), before);
    assert.equal(run.pending?.id, receipt.id);
  }
  const original = run.session.state.chains[0];
  assert.equal(run.settle(receipt.id, { x: original.x, y: original.y + 420 }), true);
  const [prefix, suffix] = run.session.state.chains;
  assert.equal(prefix.x, original.x);
  assert.equal(prefix.y, original.y);
  assert.equal(suffix.x, original.x);
  assert.equal(suffix.y, original.y + 420);
  assert.equal(run.session.text(suffix), "DCHEFG");
  assert.equal(run.session.canUndo, false);
  assert.equal(run.lives, 2);
  const resumed = restore(run, passages);
  assert.deepEqual(resumed.session.state, run.session.state);
  assert.equal(resumed.settle(receipt.id, { x: 0, y: 0 }), false);
});

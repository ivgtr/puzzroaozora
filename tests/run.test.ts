import test from "node:test";
import assert from "node:assert/strict";
import { Run } from "../src/game/run.ts";
import { type CuratedPassage } from "../src/game/model.ts";

function fixtures(count = 3, fragments = [..."ABCD"]): CuratedPassage[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `scene-${i}`, workId: "test", title: "test", author: "test", sourceUrl: "https://example.com",
    original: fragments.join(""), fragments: [...fragments], note: "fixture", location: "fixture",
    difficulty: "normal", curatedVersion: 1, sceneTitle: "試しの情景", premise: "静かな机。",
    hints: ["語り手を考える。", "前後を考える。"],
  }));
}
function begin(run: Run): void {
  run.begin(run.session.problem.tiles.map((_, i) => ({ x: i * 100, y: i * 30 })));
}
function setup(count = 3) {
  const passages = fixtures(count);
  const run = new Run(passages, "test", { random: () => .5 });
  begin(run);
  return { run, passages };
}
function chain(run: Run, text: string): string {
  const found = run.session.state.chains.find((candidate) => run.session.text(candidate) === text);
  assert.ok(found, `missing ${text}`);
  return found.id;
}
function assemble(run: Run, fragments = [..."ABCD"]): void {
  let text = fragments[0];
  for (const fragment of fragments.slice(1)) {
    assert.equal(run.dispatch({ type: "join", source: chain(run, fragment), target: chain(run, text), side: "after" }), "tentative");
    text += fragment;
  }
}
function restore(run: Run, passages: CuratedPassage[]): Run {
  return Run.restore(run.serialize(), passages);
}

test("a successful run visits every passage once and restores its final pending clear", () => {
  const { run, passages } = setup();
  const seen = new Set<string>();
  for (let i = 0; i < run.total; i++) {
    assert.ok(!seen.has(run.currentPassage.id));
    seen.add(run.currentPassage.id);
    assemble(run);
    const receipt = run.submit()!;
    assert.equal(receipt.correct, true);
    assert.equal(run.submit(), receipt);
    assert.equal(run.clears, i + 1);
    assert.equal(run.lives, 3);
    if (i + 1 < run.total) {
      run.settle(receipt.id);
      assert.equal(run.advance(), true);
      begin(run);
    }
  }
  const resumed = restore(run, passages);
  assert.equal(resumed.endReason, "conquered");
  assert.equal(resumed.settle(resumed.pending!.id), true);
  assert.equal(resumed.advance(), false);
  assert.equal(resumed.submit(), null);
  assert.equal(resumed.dispatch({ type: "undo" }), "none");
});

test("a wrong submission survives reload, charges once, and preserves its detached suffix", () => {
  const { run, passages } = setup();
  assemble(run, [..."ABDC"]);
  const receipt = run.submit()!;
  assert.equal(receipt.correctPrefix, 2);
  assert.equal(run.lives, 2);
  assert.equal(run.submit(), receipt);
  assert.throws(() => Object.assign(receipt, { correct: true }));
  assert.equal(run.dispatch({ type: "undo" }), "none");

  const resumed = restore(run, passages);
  assert.deepEqual(resumed.submit(), receipt);
  const before = resumed.snapshot();
  assert.throws(() => resumed.settle(receipt.id, { x: 0, y: Infinity }));
  assert.deepEqual(resumed.snapshot(), before);
  assert.equal(resumed.settle(receipt.id, { x: 100, y: 420 }), true);
  assert.equal(resumed.settle(receipt.id), false);
  assert.deepEqual(resumed.session.state.chains.map((item) => resumed.session.text(item)), ["AB", "DC"]);
  assert.equal(resumed.session.state.chains[1].y, 420);
  assert.equal(resumed.dispatch({ type: "undo" }), "none");
  resumed.dispatch({ type: "move", chain: chain(resumed, "AB"), point: { x: 20, y: 30 } });
  assert.equal(resumed.dispatch({ type: "undo" }), "undo");

  const settled = restore(resumed, passages);
  assert.equal(settled.lives, 2);
  assert.equal(settled.pending, undefined);
  assert.deepEqual(settled.session.state, resumed.session.state);
  assert.equal(settled.settle(receipt.id), false);
});

test("the third miss ends a run even if its final reading is interrupted", () => {
  const { run, passages } = setup();
  assemble(run, [..."BACD"]);
  for (let attempt = 0; attempt < 2; attempt++) run.settle(run.submit()!.id);
  const receipt = run.submit()!;
  assert.equal(receipt.correctPrefix, 0);
  const resumed = restore(run, passages);
  assert.equal(resumed.endReason, "failed");
  assert.equal(resumed.lives, 0);
  assert.equal(resumed.settle(receipt.id), true);
  assert.equal(resumed.session.text(resumed.session.state.chains[0]), "BACD");
  assert.equal(resumed.submit(), null);
  assert.equal(resumed.dispatch({ type: "undo" }), "none");
});

test("one shared hint stays spent through Undo, reload, the next passage, and abandonment", () => {
  const { run, passages } = setup();
  assert.equal(run.hintFor("missing").kind, "unavailable");
  assert.equal(run.hintFor(chain(run, "D")).kind, "unavailable");
  assert.equal(run.hintsRemaining, 1);
  const anchor = chain(run, "A");
  const board = run.session.state;
  assert.deepEqual(run.hintFor(anchor), { kind: "revealed", anchorId: anchor, targetId: chain(run, "B"), repeated: false });
  assert.equal(run.session.state, board);
  run.dispatch({ type: "move", chain: anchor, point: { x: 2, y: 3 } });
  run.dispatch({ type: "undo" });
  const resumed = restore(run, passages);
  assert.equal(resumed.hintsRemaining, 0);
  assert.deepEqual(resumed.hintFor(anchor), { kind: "revealed", anchorId: anchor, targetId: chain(resumed, "B"), repeated: true });
  assemble(resumed);
  resumed.settle(resumed.submit()!.id);
  resumed.advance();
  begin(resumed);
  assert.equal(resumed.hintFor(chain(resumed, "A")).kind, "exhausted");
  assemble(resumed, [..."BACD"]);
  resumed.submit();
  resumed.abandon();
  const abandoned = restore(resumed, passages);
  assert.equal(abandoned.endReason, "abandoned");
  assert.equal(abandoned.hintsRemaining, 0);
  assert.equal(abandoned.lives, 2);
  const fresh = abandoned.restart();
  assert.equal(fresh.hintsRemaining, 1);
  assert.equal(fresh.lives, 3);
  assert.equal(fresh.clears, 0);
});

test("saved arrangements retain authored difficulty, tile IDs, and usable Undo", () => {
  const passages = fixtures(1, ["AB", "CD", "EF", "GH"]);
  passages[0] = { ...passages[0], hardFragments: [..."ABCDEFGH"] };
  const run = new Run(passages, "test", { difficulty: "hard" });
  begin(run);
  assert.equal(run.session.problem.tiles.length, 8);
  const original = run.session.state;
  run.dispatch({ type: "move", chain: chain(run, "A"), point: { x: 321, y: -42 } });
  const resumed = restore(run, passages);
  assert.deepEqual(resumed.snapshot(), run.snapshot());
  assert.equal(resumed.dispatch({ type: "undo" }), "undo");
  assert.deepEqual(resumed.session.state, original);
});

test("damaged saves cannot alter source text, lose tiles, or refund a recorded expense", () => {
  const { run, passages } = setup();
  run.hintFor(chain(run, "A"));
  assemble(run, [..."ABDC"]);
  run.submit();
  const original = run.snapshot();
  const corruptions: Array<(snapshot: typeof original) => void> = [
    (snapshot) => { Object.assign(snapshot, { lives: 3 }); },
    (snapshot) => { Object.assign(snapshot, { hintsUsed: 0 }); },
    (snapshot) => { Object.assign(snapshot.session.tiles[0], { text: "foreign text" }); },
    (snapshot) => { Object.assign(snapshot.session.state.chains[0], { tiles: [snapshot.session.tiles[0].id] }); },
    (snapshot) => { Object.assign(snapshot.session.state.chains[0], { x: Infinity }); },
    (snapshot) => { Object.assign(snapshot.submissions[0], { correct: true }); },
  ];
  for (const corrupt of corruptions) {
    const snapshot = run.snapshot();
    corrupt(snapshot);
    assert.throws(() => Run.restore(snapshot, passages));
  }
  assert.throws(() => Run.restore("not json", passages));
  assert.throws(() => Run.restore(original, []));
  assert.deepEqual(run.snapshot(), original);
});

test("retry narration can skip only the unchanged, previously confirmed prefix", () => {
  const { run } = setup();
  assemble(run, [..."ABDC"]);
  const first = run.submit()!;
  assert.equal(first.skipPrefixCount, 0);
  run.settle(first.id);
  assemble(run, ["AB", "DC"]);
  const retry = run.submit()!;
  assert.equal(retry.skipPrefixCount, 2);
  run.settle(retry.id);
  run.dispatch({ type: "split", chain: chain(run, "AB"), boundary: 0 });
  assemble(run, ["B", "A", "DC"]);
  assert.equal(run.submit()!.skipPrefixCount, 0);
});

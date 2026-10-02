import test from "node:test";
import assert from "node:assert/strict";
import { Session, makeProblem, type CuratedPassage } from "../src/game/model.ts";

function fixture(fragments = [..."ABCDEFGH"]): CuratedPassage {
  return { id: "hints", workId: "hints", title: "test", author: "test", sourceUrl: "https://example.com", original: fragments.join(""), fragments, note: "fixture", location: "fixture", difficulty: "easy", curatedVersion: 1, sceneTitle: "試しの情景", premise: "静かな机。", hints: ["語り手の視点を考える。", "動作の前後を考える。"] };
}

function setup(fragments = [..."ABCDEFGH"], begin = true) {
  const problem = makeProblem(fixture(fragments), "easy", () => .5);
  const session = new Session(problem, { hintLimit: 3 });
  const positions = problem.tiles.map((_, i) => ({ x: i * 80, y: i * 13 }));
  if (begin) session.begin(positions);
  const tile = (text: string) => {
    const found = problem.tiles.find((candidate) => candidate.text === text);
    assert.ok(found, `missing tile ${text}`);
    return found.id;
  };
  const chain = (text: string) => {
    const found = session.state.chains.find((candidate) => session.text(candidate) === text);
    assert.ok(found, `missing chain ${text}`);
    return found.id;
  };
  const join = (left: string, right: string) => session.dispatch({ type: "join", source: chain(right), target: chain(left), side: "after" });
  return { session, problem, positions, tile, chain, join };
}

test("hints reveal only tile IDs without changing the desk or Undo history", () => {
  const { session, positions, tile } = setup(undefined, false);
  assert.equal(session.hintsRemaining, 3);
  assert.deepEqual(session.hintFor(tile("A")), { kind: "unavailable" });
  assert.equal(session.hintsRemaining, 3);
  session.begin(positions);
  const before = session.state;
  assert.deepEqual(session.hintFor(tile("A")), { kind: "revealed", anchorId: tile("A"), targetId: tile("B"), repeated: false });
  assert.equal(session.hintsRemaining, 2);
  assert.equal(session.state, before);
  assert.equal(session.canUndo, false);
  assert.equal(session.dispatch({ type: "undo" }), "none");
  assert.equal(session.hintsRemaining, 2);
  assert.throws(() => session.begin(positions), /開始状態/);
  assert.equal(session.hintsRemaining, 2);
});

test("three distinct anchors exhaust the budget while repeated pairs stay free", () => {
  const { session, tile } = setup();
  for (const [anchor, target, remaining] of [["A", "B", 2], ["B", "C", 1], ["C", "D", 0]] as const) {
    assert.deepEqual(session.hintFor(tile(anchor)), { kind: "revealed", anchorId: tile(anchor), targetId: tile(target), repeated: false });
    assert.equal(session.hintsRemaining, remaining);
    assert.deepEqual(session.hintFor(tile(anchor)), { kind: "revealed", anchorId: tile(anchor), targetId: tile(target), repeated: true });
    assert.equal(session.hintsRemaining, remaining);
  }
  for (let i = 0; i < 5; i++) {
    assert.deepEqual(session.hintFor(tile("D")), { kind: "exhausted" });
    assert.deepEqual(session.hintFor(tile("A")), { kind: "revealed", anchorId: tile("A"), targetId: tile("B"), repeated: true });
    assert.deepEqual(session.hintFor(tile("H")), { kind: "exhausted" });
    assert.deepEqual(session.hintFor("missing"), { kind: "unavailable" });
    assert.equal(session.hintsRemaining, 0);
  }
  assert.equal(session.canUndo, false);
});

test("correct and wrong provisional groups use their last tile without validating the group", () => {
  const { session, tile, chain, join } = setup();
  assert.equal(join("A", "B"), "tentative");
  const correct = session.state;
  assert.deepEqual(session.hintFor(chain("AB")), { kind: "revealed", anchorId: tile("B"), targetId: tile("C"), repeated: false });
  assert.equal(session.state, correct);
  assert.equal(join("E", "D"), "tentative");
  const wrong = session.state;
  // The target can even be inside the same wrong group; nothing is joined or fixed.
  assert.deepEqual(session.hintFor(chain("ED")), { kind: "revealed", anchorId: tile("D"), targetId: tile("E"), repeated: false });
  assert.equal(session.state, wrong);
  assert.ok(session.state.chains.every((candidate) => candidate.bonds.every((bond) => bond === false)));
  assert.equal(session.dispatch({ type: "undo" }), "undo");
  assert.equal(session.state, correct);
  assert.equal(session.hintsRemaining, 1);
  assert.deepEqual(session.hintFor(chain("D")), { kind: "revealed", anchorId: tile("D"), targetId: tile("E"), repeated: true });
});

test("a target in the middle of another group is revealed by its exact tile ID", () => {
  const { session, tile, chain, join } = setup();
  join("E", "B");
  join("EB", "G");
  const before = session.state;
  assert.notEqual(chain("EBG"), tile("B"));
  assert.deepEqual(session.hintFor(chain("A")), { kind: "revealed", anchorId: tile("A"), targetId: tile("B"), repeated: false });
  assert.equal(session.state, before);
  assert.equal(session.dispatch({ type: "undo" }), "undo");
  assert.ok(session.state.chains.some((candidate) => session.text(candidate) === "EB"));
  assert.equal(session.hintsRemaining, 2);
});

test("cached anchor-target pairs survive movement, splitting, prepending, and Undo", () => {
  const { session, tile, chain, join } = setup();
  const repeated = { kind: "revealed", anchorId: tile("B"), targetId: tile("C"), repeated: true };
  session.hintFor(chain("B"));
  session.hintFor(chain("D"));
  session.hintFor(chain("E"));
  assert.equal(session.hintsRemaining, 0);
  const initial = session.state;
  assert.equal(session.dispatch({ type: "move", chain: chain("B"), point: { x: 10, y: 20 } }), "move");
  assert.deepEqual(session.hintFor(chain("B")), repeated);
  assert.equal(session.dispatch({ type: "undo" }), "undo");
  assert.equal(session.state, initial);
  assert.equal(session.dispatch({ type: "join", source: chain("A"), target: chain("B"), side: "before" }), "tentative");
  assert.deepEqual(session.hintFor(chain("AB")), repeated);
  join("AB", "C");
  assert.equal(session.dispatch({ type: "split", chain: chain("ABC"), boundary: 1 }), "split");
  assert.deepEqual(session.hintFor(chain("AB")), repeated);
  assert.equal(session.dispatch({ type: "split", chain: chain("AB"), boundary: 0 }), "split");
  assert.deepEqual(session.hintFor(chain("B")), repeated);
  assert.equal(session.dispatch({ type: "undo" }), "undo");
  assert.deepEqual(session.hintFor(chain("AB")), repeated);
  assert.equal(session.hintsRemaining, 0);
  assert.equal(session.dispatch({ type: "undo" }), "undo");
  assert.equal(session.dispatch({ type: "undo" }), "undo");
  assert.deepEqual(session.hintFor(chain("AB")), repeated);
  assert.equal(session.hintsRemaining, 0);
});

test("invalid, removed, and final anchors are unavailable without spending a hint", () => {
  const { session, tile, chain, join } = setup();
  join("A", "B");
  join("G", "H");
  const before = session.state;
  for (const id of ["", "missing", tile("B"), chain("GH")]) {
    assert.deepEqual(session.hintFor(id), { kind: "unavailable" });
    assert.equal(session.hintsRemaining, 3);
    assert.equal(session.state, before);
  }
});

test("completion blocks hints and Undo without resetting spending", () => {
  const { session, problem, positions, tile, join } = setup();
  session.hintFor(tile("A"));
  let block = "A";
  for (const next of "BCDEFGH") { join(block, next); block += next; }
  assert.equal(session.dispatch({ type: "check" }), "complete");
  const complete = session.state;
  assert.deepEqual(session.hintFor(tile("A")), { kind: "unavailable" });
  assert.equal(session.hintsRemaining, 2);
  assert.equal(session.dispatch({ type: "undo" }), "none");
  assert.equal(session.state, complete);
  const fresh = new Session(problem);
  fresh.begin(positions);
  assert.equal(fresh.hintsRemaining, 1);
  assert.equal(fresh.hintFor(tile("A")).kind, "revealed");
  assert.equal(fresh.hintsRemaining, 0);
  assert.deepEqual(fresh.hintFor(tile("B")), { kind: "exhausted" });
});

test("identical text never chooses an arbitrary anchor occurrence or target tile", () => {
  const { session, problem, tile } = setup(["A", "B", "A", "C", "D", "E", "F", "G"]);
  for (const duplicate of problem.tiles.filter((candidate) => candidate.text === "A")) {
    assert.deepEqual(session.hintFor(duplicate.id), { kind: "unavailable" });
  }
  assert.deepEqual(session.hintFor(tile("B")), { kind: "unavailable" });
  assert.equal(session.hintsRemaining, 3);
  assert.deepEqual(session.hintFor(tile("C")), { kind: "revealed", anchorId: tile("C"), targetId: tile("D"), repeated: false });
  assert.equal(session.hintsRemaining, 2);
});

test("ambiguous fragment boundaries are unavailable while unambiguous successors still work", () => {
  // Both a + aa and aa + a reconstruct the first three characters.
  const { session, tile } = setup(["a", "aa", "X", "B", "C", "D", "E", "F"]);
  assert.deepEqual(session.hintFor(tile("a")), { kind: "unavailable" });
  assert.deepEqual(session.hintFor(tile("aa")), { kind: "unavailable" });
  assert.equal(session.hintsRemaining, 3);
  assert.deepEqual(session.hintFor(tile("X")), { kind: "revealed", anchorId: tile("X"), targetId: tile("B"), repeated: false });
  session.hintFor(tile("B"));
  session.hintFor(tile("C"));
  assert.equal(session.hintsRemaining, 0);
  for (const anchor of ["a", "aa", "D", "F"]) {
    assert.deepEqual(session.hintFor(tile(anchor)), { kind: "exhausted" });
  }
});

test("reconstruction backtracks rather than treating overlapping text as source positions", () => {
  const { session, tile } = setup(["ab", "a", "bc", "C", "D", "E", "F", "G"]);
  // a matches the first character but cannot start a complete reconstruction.
  // Its actual position is after ab, followed by bc.
  assert.deepEqual(session.hintFor(tile("ab")), { kind: "revealed", anchorId: tile("ab"), targetId: tile("a"), repeated: false });
  assert.deepEqual(session.hintFor(tile("a")), { kind: "revealed", anchorId: tile("a"), targetId: tile("bc"), repeated: false });
  assert.deepEqual(session.hintFor(tile("bc")), { kind: "revealed", anchorId: tile("bc"), targetId: tile("C"), repeated: false });
});

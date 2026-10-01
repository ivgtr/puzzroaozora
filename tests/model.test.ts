import test from "node:test";
import assert from "node:assert/strict";
import { Session, canReconstruct, makeProblem, type CuratedPassage } from "../src/game/model.ts";
import { type Difficulty, type Passage } from "../src/game/text.ts";

function fixture(fragments = [..."ABCDEFGH"], difficulty: Difficulty = "easy"): CuratedPassage {
  return { id: "test", workId: "test", title: "test", author: "test", sourceUrl: "https://example.com", original: fragments.join(""), fragments, note: "fixture", location: "fixture", difficulty, curatedVersion: 1, sceneTitle: "試しの情景", premise: "静かな机。", hints: ["語り手の視点を考える。", "動作の前後を考える。"] };
}
function start(fragments = [..."ABCDEFGH"], difficulty: Difficulty = "easy") {
  const session = new Session(makeProblem(fixture(fragments, difficulty), difficulty, () => .5));
  session.begin(session.problem.tiles.map((_, i) => ({ x: i * 80, y: i * 13 })));
  const id = (text: string) => {
    const chain = session.state.chains.find((chain) => session.text(chain) === text);
    assert.ok(chain, `missing chain ${text}`);
    return chain.id;
  };
  const join = (left: string, right: string) => session.dispatch({ type: "join", source: id(right), target: id(left), side: "after" });
  const assemble = (parts = fragments) => {
    let block = parts[0];
    for (const part of parts.slice(1)) { assert.equal(join(block, part), "tentative"); block += part; }
    return block;
  };
  return { session, id, join, assemble };
}
function conserved(session: Session) {
  const ids = session.state.chains.flatMap((chain) => [...chain.tiles]);
  assert.equal(new Set(ids).size, session.problem.tiles.length);
  assert.equal(ids.length, session.problem.tiles.length);
  assert.equal(new Set(session.state.chains.map((chain) => chain.id)).size, session.state.chains.length);
  for (const chain of session.state.chains) {
    assert.equal(chain.id, chain.tiles[0]);
    assert.equal(chain.bonds.length, chain.tiles.length - 1);
    assert.ok(chain.bonds.every((bond) => bond === false), "no seam may expose correctness or become locked");
  }
}

test("every join is provisional in all legacy difficulty settings; only an explicit full check completes", () => {
  for (const difficulty of ["easy", "normal", "hard"] as Difficulty[]) {
    const { session, join } = start(undefined, difficulty);
    assert.equal(session.canCheck, false);
    let block = "A";
    for (const part of "BCDEFGH") {
      assert.equal(join(block, part), "tentative"); block += part;
      assert.equal(session.state.phase, "assembling");
      conserved(session);
      if (block.length < 8) {
        const before = session.state;
        assert.equal(session.canCheck, false);
        assert.equal(session.dispatch({ type: "check" }), "none");
        assert.equal(session.state, before);
      }
    }
    assert.equal(session.canCheck, true);
    const assembled = session.state;
    assert.equal(session.dispatch({ type: "check" }), "complete");
    assert.equal(session.state.phase, "complete");
    assert.equal(session.state.chains, assembled.chains);
    assert.equal(session.canCheck, false);
    assert.equal(session.dispatch({ type: "check" }), "none");
    assert.equal(session.dispatch({ type: "undo" }), "undo");
    assert.equal(session.state, assembled);
  }
});

test("correct and incorrect partial joins emit identical events and keep every boundary open", () => {
  const { session, id, join } = start();
  assert.equal(join("B", "C"), "tentative");
  assert.equal(join("BC", "A"), "tentative");
  assert.equal(join("E", "D"), "tentative");
  conserved(session);
  const before = session.state;
  assert.equal(session.dispatch({ type: "split", chain: id("BCA"), boundary: 0 }), "split");
  conserved(session);
  assert.equal(session.dispatch({ type: "undo" }), "undo");
  assert.equal(session.state, before);
  assert.equal(session.dispatch({ type: "split", chain: id("BCA"), boundary: 1 }), "split");
  conserved(session);
});

test("failed and repeated checks preserve exact chains, coordinates, and useful undo history", () => {
  const { session, join } = start();
  let block = "B";
  for (const part of "ACDEFG") { join(block, part); block += part; }
  const beforeLastJoin = session.state;
  assert.equal(join(block, "H"), "tentative");
  const wrong = session.state;
  // More failed checks than the undo limit must still leave the last join undoable.
  for (let i = 0; i < 70; i++) {
    assert.equal(session.dispatch({ type: "check" }), "incorrect");
    assert.equal(session.state, wrong);
    assert.equal(session.canCheck, true);
  }
  assert.equal(session.dispatch({ type: "undo" }), "undo");
  assert.equal(session.state, beforeLastJoin);
  conserved(session);
});

test("every boundary can split, rejoin, and undo repeatedly without losing or duplicating tiles", () => {
  const { session, id, assemble } = start();
  assemble();
  const assembled = session.state;
  for (let boundary = 0; boundary < 7; boundary++) {
    assert.equal(session.dispatch({ type: "split", chain: id("ABCDEFGH"), boundary }), "split");
    conserved(session);
    const split = session.state;
    const [left, right] = split.chains;
    assert.equal(session.dispatch({ type: "join", source: right.id, target: left.id, side: "after" }), "tentative");
    conserved(session);
    assert.equal(session.dispatch({ type: "undo" }), "undo");
    assert.equal(session.state, split);
    assert.equal(session.dispatch({ type: "undo" }), "undo");
    assert.equal(session.state, assembled);
  }
});

test("prepending and splitting preserve chain identity and all unrelated positions", () => {
  const { session, id } = start();
  const unrelated = session.state.chains.find((chain) => session.text(chain) === "E")!;
  session.dispatch({ type: "join", source: id("B"), target: id("D"), side: "before" });
  session.dispatch({ type: "split", chain: id("BD"), boundary: 0 });
  conserved(session);
  assert.equal(session.state.chains.find((chain) => chain.id === unrelated.id), unrelated);
});

test("identical text tiles remain interchangeable at the full-text check", () => {
  const { session, id } = start(["A", "B", "A", "C", "D", "E", "F", "G"]);
  const as = session.state.chains.filter((chain) => session.text(chain) === "A");
  session.dispatch({ type: "join", source: id("B"), target: as[1].id, side: "after" });
  session.dispatch({ type: "join", source: id("C"), target: as[0].id, side: "after" });
  assert.equal(session.dispatch({ type: "join", source: as[0].id, target: as[1].id, side: "after" }), "tentative");
  for (const text of "DEFG") session.dispatch({ type: "join", source: id(text), target: as[1].id, side: "after" });
  assert.equal(session.dispatch({ type: "check" }), "complete");
  conserved(session);
  assert.equal(canReconstruct("abcXabcY", ["abc", "Xabc", "Y"]), true);
  assert.equal(canReconstruct("abcXabcY", ["bcXa", "abc", "Y"]), false);
});

test("invalid commands create no undo entries; movement and checking can be undone separately", () => {
  const { session, id, assemble } = start();
  const before = session.state;
  assert.equal(session.dispatch({ type: "move", chain: id("A"), point: { x: NaN, y: 0 } }), "none");
  assert.equal(session.dispatch({ type: "join", source: id("A"), target: id("A"), side: "after" }), "none");
  assert.equal(session.dispatch({ type: "split", chain: id("A"), boundary: 0 }), "none");
  assert.equal(session.dispatch({ type: "check" }), "none");
  assert.equal(session.canUndo, false);
  session.dispatch({ type: "move", chain: id("A"), point: { x: 100, y: 200 } });
  session.dispatch({ type: "undo" }); assert.equal(session.state, before);
  assert.equal(session.dispatch({ type: "undo" }), "none");
  assemble();
  const assembled = session.state;
  session.dispatch({ type: "check" });
  session.dispatch({ type: "undo" }); assert.equal(session.state, assembled);
  session.dispatch({ type: "undo" }); assert.equal(session.state.chains.length, 2);
});

test("a new session safely replays an unchanged problem after completion", () => {
  const { session, assemble } = start();
  assemble(); session.dispatch({ type: "check" });
  for (let replay = 0; replay < 3; replay++) {
    const next = new Session(session.problem);
    next.begin(next.problem.tiles.map((_, i) => ({ x: i * 10, y: i * 20 })));
    assert.equal(next.state.chains.length, 8);
    assert.equal(next.canUndo, false);
    assert.equal(next.canCheck, false);
    conserved(next);
    assert.throws(() => next.begin(next.problem.tiles.map(() => ({ x: 0, y: 0 }))));
  }
  assert.equal(session.state.phase, "complete");
});

test("curated validation refuses legacy imports or malformed scenes without changing them", () => {
  const current = fixture();
  const { curatedVersion: _curatedVersion, sceneTitle: _sceneTitle, premise: _premise, hints: _hints, ...legacy } = current;
  void _curatedVersion; void _sceneTitle; void _premise; void _hints;
  const saved = structuredClone(legacy);
  assert.throws(() => makeProblem(legacy as Passage), /選定シーン/);
  assert.deepEqual(legacy, saved);
  assert.throws(() => makeProblem({ ...current, curatedVersion: 2 } as unknown as Passage), /選定シーン/);
  assert.throws(() => makeProblem({ ...current, hints: [] } as CuratedPassage), /選定シーン/);
  assert.throws(() => makeProblem(fixture(["A", "B"])), /8〜12/);
  assert.throws(() => makeProblem({ ...current, original: "not the text" }), /一致/);
  const problem = makeProblem(current);
  assert.equal(problem.version, 3);
  assert.equal(problem.curatedVersion, 1);
  assert.equal(problem.sceneTitle, current.sceneTitle);
  assert.deepEqual(problem.hints, current.hints);
  assert.throws(() => new Session({ ...problem, version: 2 } as unknown as typeof problem));
  assert.throws(() => new Session({ ...problem, tiles: problem.tiles.map((tile) => ({ ...tile, id: "duplicate" })) }));
});

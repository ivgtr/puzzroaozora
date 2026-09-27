import test from "node:test";
import assert from "node:assert/strict";
import { Session, canReconstruct, makeProblem } from "../src/game/model.ts";
import { RULES, type Difficulty, type Passage } from "../src/game/text.ts";

function start(fragments: string[], difficulty: Difficulty = "easy") {
  const passage: Passage = { id: "test", workId: "test", title: "test", author: "test", sourceUrl: "https://example.com", original: fragments.join(""), fragments, note: "fixture", location: "fixture", difficulty };
  const session = new Session(makeProblem(passage, difficulty, () => .5));
  session.begin(session.problem.tiles.map((_, i) => ({ x: i * 80, y: i * 13 })));
  const id = (text: string) => {
    const chain = session.state.chains.find((chain) => session.text(chain) === text);
    assert.ok(chain, `missing chain ${text}`);
    return chain.id;
  };
  const join = (left: string, right: string) => session.dispatch({ type: "join", source: id(right), target: id(left), side: "after" });
  return { session, id, join };
}
function conserved(session: Session) {
  const ids = session.state.chains.flatMap((chain) => [...chain.tiles]);
  assert.equal(new Set(ids).size, session.problem.tiles.length);
  assert.equal(ids.length, session.problem.tiles.length);
  assert.equal(new Set(session.state.chains.map((chain) => chain.id)).size, session.state.chains.length);
  for (const chain of session.state.chains) { assert.equal(chain.id, chain.tiles[0]); assert.equal(chain.bonds.length, chain.tiles.length - 1); }
}

test("2/3/4 original pieces confirm in the middle; one-piece extensions and tail complete", () => {
  for (const difficulty of ["easy", "normal", "hard"] as Difficulty[]) {
    const { session, join } = start(["A", "B", "C", "D", "E", "F", "G"], difficulty);
    const threshold = RULES[difficulty].threshold;
    let block = "B";
    for (const part of ["C", "D", "E"].slice(0, threshold - 1)) {
      const result = join(block, part); block += part;
      assert.equal(result, block.length === threshold ? "new" : "tentative");
    }
    assert.equal(join("A", block), "extend"); block = "A" + block;
    for (const part of "ABCDEFG".slice(block.length)) { join(block, part); block += part; }
    assert.equal(session.state.phase, "complete"); conserved(session);
  }
});

test("mismatch keeps the hypothesis and known boundaries; split/undo preserve pieces and positions", () => {
  const { session, id, join } = start(["A", "B", "C", "D", "E"]);
  const unrelated = session.state.chains.find((chain) => session.text(chain) === "E")!;
  assert.equal(join("B", "C"), "new");
  assert.equal(join("BC", "A"), "tentative");
  const chain = session.state.chains.find((chain) => session.text(chain) === "BCA")!;
  assert.deepEqual(chain.bonds, [true, false]);
  assert.equal(session.dispatch({ type: "split", chain: chain.id, boundary: 0 }), "none");
  const before = session.state;
  assert.equal(session.dispatch({ type: "split", chain: chain.id, boundary: 1 }), "split");
  conserved(session);
  assert.equal(session.dispatch({ type: "undo" }), "undo"); assert.equal(session.state, before);
  assert.deepEqual(session.state.chains.find((chain) => chain.id === unrelated.id), unrelated);
  assert.equal(session.dispatch({ type: "join", source: id("D"), target: id("D"), side: "after" }), "none");
});

test("prepending then splitting cannot duplicate a chain identity", () => {
  const { session, id } = start(["A", "B", "C", "D"], "normal");
  session.dispatch({ type: "join", source: id("B"), target: id("D"), side: "before" });
  session.dispatch({ type: "split", chain: id("BD"), boundary: 0 });
  conserved(session);
});

test("identical tiles are interchangeable and repeated phrases retain all possible placements", () => {
  const { session } = start(["A", "B", "A", "C"]);
  const as = session.state.chains.filter((chain) => session.text(chain) === "A");
  const b = session.state.chains.find((chain) => session.text(chain) === "B")!;
  const c = session.state.chains.find((chain) => session.text(chain) === "C")!;
  session.dispatch({ type: "join", source: b.id, target: as[1].id, side: "after" });
  session.dispatch({ type: "join", source: c.id, target: as[0].id, side: "after" });
  assert.equal(session.dispatch({ type: "join", source: as[0].id, target: as[1].id, side: "after" }), "complete");
  conserved(session);
  assert.equal(canReconstruct("abcXabcY", ["abc", "Xabc", "Y"]), true);
  assert.equal(canReconstruct("abcXabcY", ["bcXa", "abc", "Y"]), false);
});

test("completion and movement undo immediately; invalid actions do not add history", () => {
  const { session, id, join } = start(["A", "B"]);
  const before = session.state;
  assert.equal(session.dispatch({ type: "move", chain: id("A"), point: { x: NaN, y: 0 } }), "none");
  assert.equal(session.canUndo, false);
  assert.equal(join("A", "B"), "complete");
  session.dispatch({ type: "undo" }); assert.equal(session.state, before);
  session.dispatch({ type: "move", chain: id("A"), point: { x: 100, y: 200 } });
  session.dispatch({ type: "undo" }); assert.equal(session.state, before);
});

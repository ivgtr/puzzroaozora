import test from "node:test";
import assert from "node:assert/strict";
import { Session, makeProblem, type CuratedPassage } from "../src/game/model.ts";
import { detachedPositions, layoutManuscript } from "../src/game/layout.ts";

function start(fragments = [..."ABCD"]) {
  const passage: CuratedPassage = {
    id: "test", workId: "test", title: "test", author: "test", sourceUrl: "https://example.com",
    original: fragments.join(""), fragments, note: "fixture", location: "fixture", difficulty: "normal",
    curatedVersion: 1, sceneTitle: "試しの情景", premise: "静かな机。", hints: ["語り手を考える。", "前後を考える。"],
  };
  const session = new Session(makeProblem(passage, "normal", () => .5));
  session.begin(session.problem.tiles.map((_, i) => ({ x: i * 80, y: i * 13 })));
  const id = (text: string) => {
    const chain = session.state.chains.find((chain) => session.text(chain) === text);
    assert.ok(chain, `missing chain ${text}`);
    return chain.id;
  };
  const join = (left: string, right: string) => session.dispatch({ type: "join", source: id(right), target: id(left), side: "after" });
  return { session, id, join };
}

test("joins remain provisional, and splitting and Undo preserve every tile and position", () => {
  const { session, id, join } = start();
  assert.equal(join("B", "C"), "tentative");
  assert.equal(join("BC", "A"), "tentative");
  assert.equal(session.canCheck, false);
  const joined = session.state;
  assert.ok(joined.chains.every((chain) => chain.bonds.every((bond) => !bond)));
  assert.equal(session.dispatch({ type: "split", chain: id("BCA"), boundary: 0 }), "split");
  assert.deepEqual(session.state.chains.flatMap((chain) => chain.tiles).sort(), session.problem.tiles.map((tile) => tile.id).sort());
  assert.equal(session.dispatch({ type: "undo" }), "undo");
  assert.deepEqual(session.state, joined);
  session.dispatch({ type: "move", chain: id("D"), point: { x: 100, y: 200 } });
  session.dispatch({ type: "undo" });
  assert.deepEqual(session.state, joined);
  join("BCA", "D");
  const wrong = session.state;
  assert.equal(session.dispatch({ type: "check" }), "incorrect");
  assert.equal(session.dispatch({ type: "check" }), "incorrect");
  assert.deepEqual(session.state, wrong);
  assert.equal(session.dispatch({ type: "undo" }), "undo");
  assert.deepEqual(session.state, joined);
});

test("invalid edits leave the board and its Undo history untouched", () => {
  const { session, id } = start();
  const before = session.state;
  assert.equal(session.dispatch({ type: "move", chain: id("A"), point: { x: NaN, y: 0 } }), "none");
  assert.equal(session.dispatch({ type: "join", source: id("A"), target: id("A"), side: "after" }), "none");
  assert.equal(session.dispatch({ type: "split", chain: id("A"), boundary: 0 }), "none");
  assert.equal(session.dispatch({ type: "check" }), "none");
  assert.deepEqual(session.state, before);
  assert.equal(session.canUndo, false);
});

test("detaching a middle fragment keeps both neighbours intact and takes one Undo", () => {
  const { session, id, join } = start();
  join("A", "B"); join("AB", "C"); join("ABC", "D");
  const before = session.state, chain = before.chains[0];
  const obstacle = { x: chain.x, y: chain.y + 80, width: 200, height: 180 };
  const sizes = ["A", "B", "CD"].map((text) => layoutManuscript(text, 8));
  const positions = detachedPositions(sizes, chain, [obstacle]);
  assert.equal(session.dispatch({ type: "detach", chain: id("ABCD"), tile: chain.tiles[1], positions }), "split");
  assert.deepEqual(session.state.chains.map((part) => session.text(part)), ["A", "B", "CD"]);
  assert.deepEqual(session.state.chains.flatMap((part) => part.tiles), chain.tiles);
  assert.deepEqual(session.state.chains.map((part) => part.bonds.length), [0, 0, 1]);
  positions.forEach((point, index) => {
    assert.ok(point.y + sizes[index].height <= obstacle.y || point.y >= obstacle.y + obstacle.height);
    if (index) assert.ok(point.y >= positions[index - 1].y + sizes[index - 1].height + 24);
  });
  assert.equal(session.dispatch({ type: "undo" }), "undo");
  assert.deepEqual(session.state, before);
});

test("identical text is interchangeable for completion but never an arbitrary hint", () => {
  const { session, id } = start(["A", "B", "A", "C"]);
  const duplicates = session.state.chains.filter((chain) => session.text(chain) === "A");
  assert.equal(session.hintFor(duplicates[0].id).kind, "unavailable");
  assert.equal(session.hintsRemaining, 1);
  session.dispatch({ type: "join", source: id("B"), target: duplicates[1].id, side: "after" });
  session.dispatch({ type: "join", source: id("C"), target: duplicates[0].id, side: "after" });
  session.dispatch({ type: "join", source: duplicates[0].id, target: duplicates[1].id, side: "after" });
  assert.equal(session.state.phase, "assembling");
  assert.equal(session.dispatch({ type: "check" }), "complete");
  assert.equal(session.dispatch({ type: "undo" }), "none");
});

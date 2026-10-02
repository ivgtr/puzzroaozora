import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PASSAGES } from "../src/data/passages.ts";
import { makeProblem } from "../src/game/model.ts";
import { comparisonText } from "../src/game/text.ts";

test("the curated catalog and both playable difficulties preserve their source text", () => {
  assert.equal(PASSAGES.length, 15);
  assert.equal(new Set(PASSAGES.map(({ id }) => id)).size, PASSAGES.length);
  assert.deepEqual(["000789", "000424", "000456"].map((id) => PASSAGES.filter(({ workId }) => workId === id).length), [4, 7, 4]);
  for (const passage of PASSAGES) {
    for (const difficulty of ["normal", "hard"] as const) {
      const fragments = difficulty === "hard" ? passage.hardFragments! : passage.fragments;
      assert.equal(fragments.join(""), comparisonText(passage.original), passage.id);
      const problem = makeProblem(passage, difficulty);
      assert.deepEqual(problem.tiles.map(({ text }) => text).sort(), [...fragments].sort(), passage.id);
      assert.equal(problem.original, passage.original);
    }
  }
});

test("audio generation inputs stay aligned with the displayed text and authored readings", () => {
  const requests = JSON.parse(readFileSync(new URL("../audio-assets/requests.json", import.meta.url), "utf8")) as Array<{
    id: string; original: string; fragments: { text: string; reading: string }[]; normalGroups: number[][];
  }>;
  assert.deepEqual(requests.map(({ id }) => id).sort(), PASSAGES.map(({ id }) => id).sort());
  for (const passage of PASSAGES) {
    const request = requests.find(({ id }) => id === passage.id)!;
    assert.equal(request.original, comparisonText(passage.original), passage.id);
    assert.deepEqual(request.fragments.map(({ text }) => text), passage.hardFragments, passage.id);
    assert.deepEqual(request.fragments.map(({ reading }) => reading), passage.speechReadings, passage.id);
    assert.deepEqual(request.normalGroups.map((group) => group.map((i) => request.fragments[i].text).join("")), passage.fragments, passage.id);
  }
});

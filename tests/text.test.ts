import test from "node:test";
import assert from "node:assert/strict";
import { PASSAGES } from "../src/data/passages.ts";
import { comparisonText, extractPassages, graphemes, type Difficulty } from "../src/game/text.ts";
import { makeProblem } from "../src/game/model.ts";
import { dealManuscript, CELL, PAD, layoutManuscript } from "../src/game/layout.ts";
import { cleanAozora } from "../src/lib/aozora.ts";
import { parseImportUrl } from "../src/lib/books.ts";

test("fifteen curated scenes preserve source text and provide atmosphere plus reasoning hints", () => {
  assert.equal(PASSAGES.length, 15);
  assert.equal(new Set(PASSAGES.map((passage) => passage.original)).size, 15);
  assert.equal(new Set(PASSAGES.map((passage) => passage.workId)).size, 3);
  for (const passage of PASSAGES) {
    assert.equal(passage.fragments.join(""), comparisonText(passage.original));
    assert.ok(passage.sourceUrl.startsWith("https://www.aozora.gr.jp/cards/"));
    assert.ok(passage.location && passage.note);
    assert.equal(passage.curatedVersion, 1);
    assert.equal(passage.sceneTitle, passage.title, "selection uses the original work title");
    assert.ok(passage.sceneTitle && passage.premise);
    assert.ok(passage.hints.length >= 2 && passage.hints.length <= 3);
    assert.ok(passage.hints.every((hint) => hint.trim().length > 0));
    for (const fragments of [passage.fragments, passage.hardFragments!]) {
      assert.ok(fragments.length >= 4 && fragments.length <= 12);
      assert.ok(fragments.every((fragment) => graphemes(fragment).length >= 3));
      assert.equal(fragments.join(""), comparisonText(passage.original));
    }
    for (const difficulty of ["normal", "hard"] as Difficulty[]) {
      const problem = makeProblem(passage, difficulty);
      const fragments = difficulty === "hard" ? passage.hardFragments! : passage.fragments;
      assert.equal(problem.tiles.length, fragments.length);
      assert.deepEqual(problem.tiles.map(({ text }) => text).sort(), [...fragments].sort());
      assert.equal(problem.original, passage.original);
    }
  }
});

test("both settings use the same short scene and preserve meaningful noun phrases", () => {
  const passage = PASSAGES.find((scene) => scene.id === "lemon-shop-v4")!;
  assert.ok(passage.hardFragments!.length > passage.fragments.length);
  assert.ok(passage.hardFragments!.includes("それからあの丈の詰まった紡錘形の恰好も。――"));
  assert.ok(passage.original.endsWith("結局私はそれを一つだけ買うことにした。"));
  assert.equal(makeProblem(passage, "normal").original, makeProblem(passage, "hard").original);
});

test("graphemes, source line breaks, half-width Latin, and square grid stay separate", () => {
  const text = "「𠮷がABC、小っ。」\n旧かな。";
  assert.ok(graphemes(text).includes("が"));
  const layout = layoutManuscript(text, 8);
  assert.equal(layout.glyphs.map((glyph) => glyph.text).join(""), text.replace(/\n/g, ""));
  assert.equal((layout.width - PAD * 2) % CELL, 0);
  assert.equal((layout.height - PAD * 2) % CELL, 0);
  assert.ok(layout.glyphs.some((glyph) => glyph.advance === CELL / 2));
  assert.equal(comparisonText("　旧字。\n　が𠮷。"), "旧字。が𠮷。");
});

test("finite natural extraction never slices an unbroken sentence or fabricates a passage", () => {
  assert.deepEqual(extractPassages("字".repeat(500) + "。", "easy"), []);
  assert.deepEqual(extractPassages("短い。", "hard"), []);
  const source = PASSAGES.map((passage) => passage.original).join("\n");
  const candidates = extractPassages(source, "easy");
  assert.ok(candidates.length > 0 && candidates.length <= 8);
  for (const candidate of candidates) {
    assert.ok(source.includes(candidate.original));
    assert.equal(candidate.fragments.join(""), comparisonText(candidate.original));
  }
});

test("import validates its source and refuses unknown characters instead of replacing them", () => {
  assert.deepEqual(parseImportUrl("https://www.aozora.gr.jp/cards/000148/card789.html"), { workId: "000789", sourceUrl: "https://www.aozora.gr.jp/cards/000148/card789.html" });
  assert.throws(() => parseImportUrl("https://www.aozora.gr.jp.evil.example/cards/000148/card789.html"));
  assert.equal(cleanAozora("｜漢字《かんじ》\n※［＃U+20BB7］。"), "漢字\n𠮷。");
  assert.throws(() => cleanAozora("未解決※［＃外字］。"));
});


test("dealing uses paper widths without overlap or sideways overflow", () => {
  const texts = PASSAGES[0].fragments;
  for (const width of [320, 390, 1280]) {
    const columns = Math.max(8, Math.min(16, Math.floor((width - 88) / CELL)));
    const positions = dealManuscript(texts, columns, width);
    const boxes = texts.map((text, index) => ({ ...positions[index], ...layoutManuscript(text, columns) }));
    assert.equal(positions.length, texts.length);
    boxes.forEach((box, index) => {
      assert.ok(box.x >= 28 && box.x + box.width <= width - 28);
      for (const other of boxes.slice(index + 1)) assert.ok(box.x + box.width <= other.x || other.x + other.width <= box.x || box.y + box.height <= other.y || other.y + other.height <= box.y);
    });
  }
});

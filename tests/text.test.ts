import test from "node:test";
import assert from "node:assert/strict";
import { PASSAGES } from "../src/data/passages.ts";
import { comparisonText, extractPassages, graphemes, type Difficulty } from "../src/game/text.ts";
import { makeProblem } from "../src/game/model.ts";
import { dealManuscript, CELL, PAD, layoutManuscript } from "../src/game/layout.ts";
import { cleanAozora } from "../src/lib/aozora.ts";
import { parseImportUrl } from "../src/lib/books.ts";

test("ten distinct sourced manuscripts preserve every original character and phrase boundary", () => {
  assert.equal(PASSAGES.length, 10);
  assert.equal(new Set(PASSAGES.map((passage) => passage.original)).size, 10);
  assert.equal(new Set(PASSAGES.map((passage) => passage.workId)).size, 3);
  for (const passage of PASSAGES) {
    assert.equal(passage.fragments.join(""), comparisonText(passage.original));
    assert.ok(passage.sourceUrl.startsWith("https://www.aozora.gr.jp/cards/"));
    assert.ok(passage.location && passage.note);
    assert.ok(passage.fragments.length >= 10 && passage.fragments.length <= 30);
    assert.ok(passage.fragments.every((fragment) => graphemes(fragment).length >= 3));
    for (const difficulty of ["easy", "normal", "hard"] as Difficulty[]) assert.doesNotThrow(() => makeProblem(passage, difficulty));
    console.log(`${passage.id}: ${graphemes(comparisonText(passage.original)).length} characters, ${passage.fragments.length} pieces (${passage.difficulty})`);
  }
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

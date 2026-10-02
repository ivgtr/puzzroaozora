import test from "node:test";
import assert from "node:assert/strict";
import { comparisonText, graphemes } from "../src/game/text.ts";
import { layoutManuscript } from "../src/game/layout.ts";
import { cleanAozora } from "../src/lib/aozora.ts";

test("comparison removes paragraph layout without normalizing spelling, punctuation, or inner spaces", () => {
  assert.equal(comparisonText("　舊字、ABC ＡＢＣ。\r\n　が𠮷。"), "舊字、ABC ＡＢＣ。が𠮷。");
  assert.deepEqual(graphemes("が𠮷👨‍👩‍👧"), ["が", "𠮷", "👨‍👩‍👧"]);
  const text = "「𠮷がABC、小っ。」\n旧かな。";
  assert.equal(layoutManuscript(text, 8).glyphs.map((glyph) => glyph.text).join(""), text.replace(/\n/g, ""));
});

test("Aozora cleanup removes readings and resolves known characters without silently replacing unknown ones", () => {
  assert.equal(cleanAozora("｜漢字《かんじ》\n※［＃U+20BB7］。"), "漢字\n𠮷。");
  assert.throws(() => cleanAozora("未解決※［＃外字］。"));
});

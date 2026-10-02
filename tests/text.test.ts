import test from "node:test";
import assert from "node:assert/strict";
import { prepareText } from "../src/game/fonts.ts";
import { comparisonText, graphemes } from "../src/game/text.ts";
import { fragmentAt, layoutManuscript, manuscriptFragmentRanges } from "../src/game/layout.ts";

test("comparison removes paragraph layout without normalizing spelling, punctuation, or inner spaces", () => {
  assert.equal(comparisonText("　舊字、ABC ＡＢＣ。\r\n　が𠮷。"), "舊字、ABC ＡＢＣ。が𠮷。");
  assert.deepEqual(graphemes("が𠮷👨‍👩‍👧"), ["が", "𠮷", "👨‍👩‍👧"]);
  const text = "「𠮷がABC、小っ。」\n旧かな。";
  const layout = layoutManuscript(text, 8);
  assert.equal(layout.glyphs.map((glyph) => glyph.text).join(""), text.replace(/\n/g, ""));
  const ranges = manuscriptFragmentRanges(text, ["「𠮷が", "ABC、小っ。」", "旧かな。"]);
  for (const glyph of layout.glyphs) {
    const expected = ranges.findIndex((range) => glyph.index >= range.start && glyph.index < range.end);
    assert.equal(fragmentAt(layout, ranges, { x: glyph.x + glyph.advance / 2, y: glyph.y + 14 }), expected);
  }
  assert.equal(fragmentAt(layout, ranges, { x: 0, y: 0 }), -1);
});

test("a failed extra font is retried without reloading fonts already prepared", async (t) => {
  const loaded: string[] = [], attempts: string[] = [];
  let fail = true;
  t.mock.method(globalThis, "fetch", async () => ({ ok: true, json: async () => [
    { family: "DeskSerif", file: "first", weight: "400", ranges: [[65, 65]] },
    { family: "DeskSerif", file: "next", weight: "400", ranges: [[66, 66]] },
    { family: "DeskSans", file: "labels", weight: "400", ranges: [[65, 66]] },
  ] }) as Response);
  const globals = ["document", "FontFace"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  t.after(() => { for (const [key, descriptor] of globals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { fonts: { add: (face: { source: string }) => loaded.push(face.source) } } });
  Object.defineProperty(globalThis, "FontFace", { configurable: true, value: class {
    source: string;
    constructor(_family: string, source: string) { this.source = source; }
    async load() {
      attempts.push(this.source);
      if (fail && this.source.includes("next")) throw new Error("offline");
      return this;
    }
  } });
  await prepareText("A", "A");
  await assert.rejects(prepareText("AB", "AB"), /書体の読み込みに失敗/);
  fail = false;
  await prepareText("AB", "AB");
  assert.equal(attempts.filter((source) => source.includes("next")).length, 2);
  assert.equal(attempts.filter((source) => source.includes("first")).length, 1);
  assert.equal(loaded.length, 3);
});

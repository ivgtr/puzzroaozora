import test from "node:test";
import assert from "node:assert/strict";
import { PASSAGES } from "../src/data/passages.ts";

// Offline source fixtures checked against these Aozora HTML editions on
// 2026-10-01. Ruby readings and paragraph indentation are not body text.
// These guard the reviewed wording; the test suite makes no network requests.
const reviewedAdditions = [
  {
    id: "cat-pond-v3",
    sourceUrl: "https://www.aozora.gr.jp/cards/000148/files/789_14547.html",
    original: "ようやくの思いで笹原を這い出すと向うに大きな池がある。吾輩は池の前に坐ってどうしたらよかろうと考えて見た。別にこれという分別も出ない。しばらくして泣いたら書生がまた迎に来てくれるかと考え付いた。ニャー、ニャーと試みにやって見たが誰も来ない。そのうち池の上をさらさらと風が渡って日が暮れかかる。腹が非常に減って来た。泣きたくても声が出ない。",
  },
  {
    id: "lemon-coolness-v3",
    sourceUrl: "https://www.aozora.gr.jp/cards/000074/files/424_19826.html",
    original: "その檸檬の冷たさはたとえようもなくよかった。その頃私は肺尖を悪くしていていつも身体に熱が出た。事実友達の誰彼に私の熱を見せびらかすために手の握り合いなどをしてみるのだが、私の掌が誰のよりも熱かった。その熱い故だったのだろう、握っている掌から身内に浸み透ってゆくようなその冷たさは快いものだった。",
  },
  {
    id: "galaxy-path-v3",
    sourceUrl: "https://www.aozora.gr.jp/cards/000081/files/456_15050.html",
    original: "ジョバンニは、もう露の降りかかった小さな林のこみちを、どんどんのぼって行きました。まっくらな草や、いろいろな形に見えるやぶのしげみの間を、その小さなみちが、一すじ白く星あかりに照らしだされてあったのです。草の中には、ぴかぴか青びかりを出す小さな虫もいて、ある葉は青くすかし出され、ジョバンニは、さっきみんなの持って行った烏瓜のあかりのようだとも思いました。",
  },
] as const;

test("each original work has two distinct curated passages with consistent attribution", () => {
  assert.equal(PASSAGES.length, 6);
  assert.equal(new Set(PASSAGES.map(({ id }) => id)).size, PASSAGES.length);
  assert.deepEqual([...new Set(PASSAGES.map(({ workId }) => workId))].sort(), ["000424", "000456", "000789"]);
  for (const workId of new Set(PASSAGES.map(({ workId }) => workId))) {
    const passages = PASSAGES.filter((passage) => passage.workId === workId);
    assert.equal(passages.length, 2, workId);
    const [first, second] = passages;
    assert.equal(first.title, second.title);
    assert.equal(first.author, second.author);
    assert.equal(first.sourceUrl, second.sourceUrl);
    assert.notEqual(first.location, second.location);
    assert.ok(!first.original.includes(second.original));
    assert.ok(!second.original.includes(first.original));
  }
});

test("new excerpts retain the exact reviewed source spelling and punctuation", () => {
  for (const reviewed of reviewedAdditions) {
    const passage = PASSAGES.find(({ id }) => id === reviewed.id);
    assert.ok(passage, reviewed.id);
    assert.equal(passage.sourceUrl, reviewed.sourceUrl);
    assert.equal(passage.original, reviewed.original);
    assert.equal(passage.fragments.join(""), reviewed.original);
    assert.equal(passage.fragments.length, 9);
  }
});

test("curated boundaries keep freely swappable descriptions and sentence transitions together", () => {
  const fragments = (id: string) => PASSAGES.find((passage) => passage.id === id)!.fragments;
  assert.ok(fragments("cat-pond-v3").includes("向うに大きな池がある。吾輩は池の前に坐って"));
  assert.ok(fragments("cat-pond-v3").includes("さらさらと風が渡って日が暮れかかる。腹が"));
  assert.ok(fragments("lemon-coolness-v3").includes("私の掌が誰のよりも熱かった。その熱い故だったのだろう、"));
  assert.ok(fragments("galaxy-path-v3").includes("星あかりに照らしだされてあったのです。草の中には、"));
  assert.ok(fragments("galaxy-path-v3").includes("ぴかぴか青びかりを出す小さな虫もいて、ある葉は青くすかし出され、"));
});

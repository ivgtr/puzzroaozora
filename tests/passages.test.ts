import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PASSAGES } from "../src/data/passages.ts";
import { comparisonText } from "../src/game/text.ts";

// Offline fixtures checked against the three linked Aozora HTML editions on
// 2026-10-02. Ruby readings are not part of original text. The one paragraph
// break is preserved for display and excluded only from comparison text.
// These guard reviewed wording; the permanent suite never fetches sources.
const reviewed = [
  { id: "lemon-opening-v4", normal: 5, hard: 8, original: "えたいの知れない不吉な塊が私の心を始終圧えつけていた。焦躁と言おうか、嫌悪と言おうか――酒を飲んだあとに宿酔があるように、酒を毎日飲んでいると宿酔に相当した時期がやって来る。それが来たのだ。" },
  { id: "cat-palm-v4", normal: 5, hard: 7, original: "この書生の掌の裏でしばらくはよい心持に坐っておったが、しばらくすると非常な速力で運転し始めた。書生が動くのか自分だけが動くのか分らないが無暗に眼が廻る。胸が悪くなる。" },
  { id: "cat-pond-v4", normal: 4, hard: 6, original: "しばらくして泣いたら書生がまた迎に来てくれるかと考え付いた。ニャー、ニャーと試みにやって見たが誰も来ない。そのうち池の上をさらさらと風が渡って日が暮れかかる。腹が非常に減って来た。泣きたくても声が出ない。" },
  { id: "cat-home-v4", normal: 5, hard: 7, original: "主人は鼻の下の黒い毛を撚りながら吾輩の顔をしばらく眺めておったが、やがてそんなら内へ置いてやれといったまま奥へ這入ってしまった。主人はあまり口を聞かぬ人と見えた。" },
  { id: "cat-study-v4", normal: 5, hard: 8, original: "大飯を食った後でタカジヤスターゼを飲む。飲んだ後で書物をひろげる。二三ページ読むと眠くなる。涎を本の上へ垂らす。これが彼の毎夜繰り返す日課である。" },
  { id: "lemon-shop-v4", normal: 4, hard: 6, original: "いったい私はあの檸檬が好きだ。レモンエロウの絵具をチューブから搾り出して固めたようなあの単純な色も、それからあの丈の詰まった紡錘形の恰好も。――結局私はそれを一つだけ買うことにした。" },
  { id: "lemon-coolness-v4", normal: 5, hard: 8, original: "事実友達の誰彼に私の熱を見せびらかすために手の握り合いなどをしてみるのだが、私の掌が誰のよりも熱かった。その熱い故だったのだろう、握っている掌から身内に浸み透ってゆくようなその冷たさは快いものだった。" },
  { id: "lemon-fragrance-v4", normal: 4, hard: 6, original: "私は何度も何度もその果実を鼻に持っていっては嗅いでみた。それの産地だというカリフォルニヤが想像に上って来る。漢文で習った「売柑者之言」の中に書いてあった「鼻を撲つ」という言葉が断れぎれに浮かんで来る。" },
  { id: "lemon-street-v4", normal: 5, hard: 8, original: "雨や風が蝕んでやがて土に帰ってしまう、と言ったような趣きのある街で、土塀が崩れていたり家並が傾きかかっていたり――勢いのいいのは植物だけで、時とするとびっくりさせるような向日葵があったりカンナが咲いていたりする。" },
  { id: "lemon-castle-v4", normal: 5, hard: 7, original: "奇怪な幻想的な城が、そのたびに赤くなったり青くなったりした。\n\n　やっとそれはでき上がった。そして軽く跳りあがる心を制しながら、その城壁の頂きに恐る恐る檸檬を据えつけた。そしてそれは上出来だった。" },
  { id: "lemon-glass-v4", normal: 5, hard: 9, original: "あのびいどろの味ほど幽かな涼しい味があるものか。私は幼い時よくそれを口に入れては父母に叱られたものだが、その幼時のあまい記憶が大きくなって落ち魄れた私に蘇えってくる故だろうか、まったくあの味には幽かな爽やかななんとなく詩美と言ったような味覚が漂って来る。" },
  { id: "galaxy-wages-v4", normal: 5, hard: 8, original: "ジョバンニは俄かに顔いろがよくなって威勢よくおじぎをすると台の下に置いた鞄をもっておもてへ飛びだしました。それから元気よく口笛を吹きながらパン屋へ寄ってパンの塊を一つと角砂糖を一袋買いますと一目散に走りだしました。" },
  { id: "galaxy-path-v4", normal: 5, hard: 7, original: "ジョバンニは、もう露の降りかかった小さな林のこみちを、どんどんのぼって行きました。まっくらな草や、いろいろな形に見えるやぶのしげみの間を、その小さなみちが、一すじ白く星あかりに照らしだされてあったのです。" },
  { id: "galaxy-platform-v4", normal: 5, hard: 7, original: "さわやかな秋の時計の盤面には、青く灼かれたはがねの二本の針が、くっきり十一時を指しました。みんなは、一ぺんに下りて、車室の中はがらんとなってしまいました。" },
  { id: "galaxy-water-v4", normal: 4, hard: 6, original: "ジョバンニは、走ってその渚に行って、水に手をひたしました。けれどもあやしいその銀河の水は、水素よりももっとすきとおっていたのです。" },
] as const;

interface AudioRequest {
  id: string;
  original: string;
  fragments: { text: string; reading: string }[];
  normalGroups: number[][];
  sourceUrl: string;
  speechText: string;
  speechFragments: string[];
}
const requests = JSON.parse(readFileSync(new URL("../audio-assets/requests.json", import.meta.url), "utf8")) as AudioRequest[];

test("the three works keep 4/7/4 distinct short curated passages", () => {
  assert.equal(PASSAGES.length, 15);
  assert.equal(new Set(PASSAGES.map(({ id }) => id)).size, PASSAGES.length);
  assert.deepEqual([...new Set(PASSAGES.map(({ workId }) => workId))].sort(), ["000424", "000456", "000789"]);
  for (const workId of new Set(PASSAGES.map(({ workId }) => workId))) {
    const passages = PASSAGES.filter((passage) => passage.workId === workId);
    assert.equal(passages.length, workId === "000424" ? 7 : 4, workId);
    for (const first of passages) for (const second of passages) {
      if (first.id === second.id) continue;
      assert.equal(first.title, second.title);
      assert.equal(first.author, second.author);
      assert.equal(first.sourceUrl, second.sourceUrl);
      assert.notEqual(first.location, second.location);
      assert.ok(!comparisonText(first.original).includes(comparisonText(second.original)));
    }
  }
});

test("both authored difficulties retain exact reviewed source spelling and punctuation", () => {
  for (const fixture of reviewed) {
    const passage = PASSAGES.find(({ id }) => id === fixture.id);
    assert.ok(passage, fixture.id);
    assert.equal(passage.original, fixture.original, fixture.id);
    assert.equal(passage.fragments.length, fixture.normal, fixture.id);
    assert.equal(passage.hardFragments?.length, fixture.hard, fixture.id);
    for (const pieces of [passage.fragments, passage.hardFragments!]) {
      assert.ok(pieces.length >= 4 && pieces.length <= 12, fixture.id);
      assert.ok(pieces.every((piece) => piece.trim().length > 0), fixture.id);
      assert.equal(pieces.join(""), comparisonText(fixture.original), fixture.id);
      // Neither setting turns punctuation or particles into their own tiles.
      assert.ok(pieces.every((piece) => !/^[、。――！？「」]+$|^[がをにはへとのもで]+$/u.test(piece)), fixture.id);
    }
    assert.ok(passage.hardFragments!.length > passage.fragments.length, fixture.id);
  }
});

test("audio requests map every fine source range and kana reading to normal aggregates", () => {
  assert.equal(requests.length, PASSAGES.length);
  assert.deepEqual(requests.map(({ id }) => id).sort(), PASSAGES.map(({ id }) => id).sort());
  for (const passage of PASSAGES) {
    const request = requests.find(({ id }) => id === passage.id)!;
    assert.equal(request.original, comparisonText(passage.original), passage.id);
    assert.equal(request.sourceUrl, passage.sourceUrl, passage.id);
    assert.deepEqual(request.fragments.map(({ text }) => text), passage.hardFragments, passage.id);
    assert.deepEqual(request.fragments.map(({ reading }) => reading), passage.speechReadings, passage.id);
    assert.deepEqual(request.normalGroups.flat(), request.fragments.map((_, index) => index), passage.id);
    assert.deepEqual(request.normalGroups.map((group) => group.map((index) => request.fragments[index].text).join("")), passage.fragments, passage.id);
    let offset = 0;
    for (const fragment of request.fragments) {
      const next = offset + fragment.text.length;
      assert.equal(request.original.slice(offset, next), fragment.text, passage.id);
      assert.match(fragment.reading, /^[\p{Script=Hiragana}\p{Script=Katakana}ー、。！？「」――…]+$/u, passage.id);
      offset = next;
    }
    assert.equal(offset, request.original.length);
    assert.ok(request.speechText.length > 0);
    assert.equal(request.speechFragments.length, request.fragments.length);
    assert.equal(request.speechFragments.join(""), request.speechText);
    assert.ok(!request.speechText.includes("|"));
  }
});

test("readings stay separate and retain original literary spelling", () => {
  const opening = PASSAGES.find(({ id }) => id === "lemon-opening-v4")!;
  assert.ok(opening.original.includes("宿酔"));
  assert.ok(!opening.original.includes("ふつかよい"));
  assert.ok(opening.speechReadings!.join("").includes("ふつかよい"));
  const platform = PASSAGES.find(({ id }) => id === "galaxy-platform-v4")!;
  assert.ok(platform.original.includes("盤面"));
  assert.ok(platform.speechReadings!.join("").includes("だいある"));
  const castle = PASSAGES.find(({ id }) => id === "lemon-castle-v4")!;
  assert.ok(castle.original.includes("\n\n　やっと"));
  assert.ok(castle.fragments.every((piece) => !piece.includes("\n")));
});

test("normal curation preserves meaningful comparisons and complete actions", () => {
  const normal = (id: string) => PASSAGES.find((passage) => passage.id === id)!.fragments;
  assert.ok(normal("lemon-opening-v4").includes("酒を飲んだあとに宿酔があるように、酒を毎日飲んでいると"));
  assert.ok(normal("lemon-street-v4").includes("時とするとびっくりさせるような向日葵があったりカンナが咲いていたりする。"));
  assert.ok(normal("lemon-glass-v4").includes("私は幼い時よくそれを口に入れては父母に叱られたものだが、"));
  assert.ok(normal("cat-study-v4").includes("タカジヤスターゼを飲む。飲んだ後で"));
  assert.ok(normal("galaxy-wages-v4").includes("パン屋へ寄ってパンの塊を一つと角砂糖を一袋買いますと"));
});

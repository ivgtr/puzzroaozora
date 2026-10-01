import test from "node:test";
import assert from "node:assert/strict";
import { PASSAGES } from "../src/data/passages.ts";
import { comparisonText } from "../src/game/text.ts";

// Offline source fixtures checked against these Aozora HTML editions on
// 2026-10-01. Ruby readings are omitted; originals retain internal paragraph
// breaks and indentation, which comparisonText excludes from playable text.
// These guard the reviewed wording; the test suite makes no network requests.
const reviewedAdditions = [
  {
    id: "cat-pond-v3",
    pieces: 9,
    sourceUrl: "https://www.aozora.gr.jp/cards/000148/files/789_14547.html",
    original: "ようやくの思いで笹原を這い出すと向うに大きな池がある。吾輩は池の前に坐ってどうしたらよかろうと考えて見た。別にこれという分別も出ない。しばらくして泣いたら書生がまた迎に来てくれるかと考え付いた。ニャー、ニャーと試みにやって見たが誰も来ない。そのうち池の上をさらさらと風が渡って日が暮れかかる。腹が非常に減って来た。泣きたくても声が出ない。",
  },
  {
    id: "lemon-coolness-v3",
    pieces: 9,
    sourceUrl: "https://www.aozora.gr.jp/cards/000074/files/424_19826.html",
    original: "その檸檬の冷たさはたとえようもなくよかった。その頃私は肺尖を悪くしていていつも身体に熱が出た。事実友達の誰彼に私の熱を見せびらかすために手の握り合いなどをしてみるのだが、私の掌が誰のよりも熱かった。その熱い故だったのだろう、握っている掌から身内に浸み透ってゆくようなその冷たさは快いものだった。",
  },
  {
    id: "galaxy-path-v3",
    pieces: 9,
    sourceUrl: "https://www.aozora.gr.jp/cards/000081/files/456_15050.html",
    original: "ジョバンニは、もう露の降りかかった小さな林のこみちを、どんどんのぼって行きました。まっくらな草や、いろいろな形に見えるやぶのしげみの間を、その小さなみちが、一すじ白く星あかりに照らしだされてあったのです。草の中には、ぴかぴか青びかりを出す小さな虫もいて、ある葉は青くすかし出され、ジョバンニは、さっきみんなの持って行った烏瓜のあかりのようだとも思いました。",
  },
  {
    id: "cat-home-v3",
    pieces: 10,
    sourceUrl: "https://www.aozora.gr.jp/cards/000148/files/789_14547.html",
    original: "吾輩が最後につまみ出されようとしたときに、この家の主人が騒々しい何だといいながら出て来た。下女は吾輩をぶら下げて主人の方へ向けてこの宿なしの小猫がいくら出しても出しても御台所へ上って来て困りますという。主人は鼻の下の黒い毛を撚りながら吾輩の顔をしばらく眺めておったが、やがてそんなら内へ置いてやれといったまま奥へ這入ってしまった。主人はあまり口を聞かぬ人と見えた。下女は口惜しそうに吾輩を台所へ抛り出した。かくして吾輩はついにこの家を自分の住家と極める事にしたのである。",
  },
  {
    id: "lemon-fragrance-v3",
    pieces: 10,
    sourceUrl: "https://www.aozora.gr.jp/cards/000074/files/424_19826.html",
    original: "私は何度も何度もその果実を鼻に持っていっては嗅いでみた。それの産地だというカリフォルニヤが想像に上って来る。漢文で習った「売柑者之言」の中に書いてあった「鼻を撲つ」という言葉が断れぎれに浮かんで来る。そしてふかぶかと胸一杯に匂やかな空気を吸い込めば、ついぞ胸一杯に呼吸したことのなかった私の身体や顔には温い血のほとぼりが昇って来てなんだか身内に元気が目覚めて来たのだった。……",
  },
  {
    id: "galaxy-platform-v3",
    pieces: 10,
    sourceUrl: "https://www.aozora.gr.jp/cards/000081/files/456_15050.html",
    original: "早くも、シグナルの緑の燈と、ぼんやり白い柱とが、ちらっと窓のそとを過ぎ、それから硫黄のほのおのようなくらいぼんやりした転てつ機の前のあかりが窓の下を通り、汽車はだんだんゆるやかになって、間もなくプラットホームの一列の電燈が、うつくしく規則正しくあらわれ、それがだんだん大きくなってひろがって、二人は丁度白鳥停車場の、大きな時計の前に来てとまりました。\n\n　さわやかな秋の時計の盤面には、青く灼かれたはがねの二本の針が、くっきり十一時を指しました。みんなは、一ぺんに下りて、車室の中はがらんとなってしまいました。",
  },
  {
    id: "cat-study-v3",
    pieces: 10,
    sourceUrl: "https://www.aozora.gr.jp/cards/000148/files/789_14547.html",
    original: "吾輩は時々忍び足に彼の書斎を覗いて見るが、彼はよく昼寝をしている事がある。時々読みかけてある本の上に涎をたらしている。彼は胃弱で皮膚の色が淡黄色を帯びて弾力のない不活溌な徴候をあらわしている。その癖に大飯を食う。大飯を食った後でタカジヤスターゼを飲む。飲んだ後で書物をひろげる。二三ページ読むと眠くなる。涎を本の上へ垂らす。これが彼の毎夜繰り返す日課である。",
  },
  {
    id: "lemon-castle-v3",
    pieces: 10,
    sourceUrl: "https://www.aozora.gr.jp/cards/000074/files/424_19826.html",
    original: "「あ、そうだそうだ」その時私は袂の中の檸檬を憶い出した。本の色彩をゴチャゴチャに積みあげて、一度この檸檬で試してみたら。「そうだ」\n\n　私にまた先ほどの軽やかな昂奮が帰って来た。私は手当たり次第に積みあげ、また慌しく潰し、また慌しく築きあげた。新しく引き抜いてつけ加えたり、取り去ったりした。奇怪な幻想的な城が、そのたびに赤くなったり青くなったりした。\n\n　やっとそれはでき上がった。そして軽く跳りあがる心を制しながら、その城壁の頂きに恐る恐る檸檬を据えつけた。そしてそれは上出来だった。",
  },
  {
    id: "galaxy-water-v3",
    pieces: 8,
    sourceUrl: "https://www.aozora.gr.jp/cards/000081/files/456_15050.html",
    original: "ジョバンニは、走ってその渚に行って、水に手をひたしました。けれどもあやしいその銀河の水は、水素よりももっとすきとおっていたのです。それでもたしかに流れていたことは、二人の手首の、水にひたったとこが、少し水銀いろに浮いたように見え、その手首にぶっつかってできた波は、うつくしい燐光をあげて、ちらちらと燃えるように見えたのでもわかりました。",
  },
  {
    id: "lemon-opening-v3",
    pieces: 11,
    sourceUrl: "https://www.aozora.gr.jp/cards/000074/files/424_19826.html",
    original: "えたいの知れない不吉な塊が私の心を始終圧えつけていた。焦躁と言おうか、嫌悪と言おうか――酒を飲んだあとに宿酔があるように、酒を毎日飲んでいると宿酔に相当した時期がやって来る。それが来たのだ。これはちょっといけなかった。結果した肺尖カタルや神経衰弱がいけないのではない。また背を焼くような借金などがいけないのではない。いけないのはその不吉な塊だ。以前私を喜ばせたどんな美しい音楽も、どんな美しい詩の一節も辛抱がならなくなった。蓄音器を聴かせてもらいにわざわざ出かけて行っても、最初の二三小節で不意に立ち上がってしまいたくなる。何かが私を居堪らずさせるのだ。それで始終私は街から街を浮浪し続けていた。",
  },
  {
    id: "lemon-street-v3",
    pieces: 9,
    sourceUrl: "https://www.aozora.gr.jp/cards/000074/files/424_19826.html",
    original: "何故だかその頃私は見すぼらしくて美しいものに強くひきつけられたのを覚えている。風景にしても壊れかかった街だとか、その街にしてもよそよそしい表通りよりもどこか親しみのある、汚い洗濯物が干してあったりがらくたが転がしてあったりむさくるしい部屋が覗いていたりする裏通りが好きであった。雨や風が蝕んでやがて土に帰ってしまう、と言ったような趣きのある街で、土塀が崩れていたり家並が傾きかかっていたり――勢いのいいのは植物だけで、時とするとびっくりさせるような向日葵があったりカンナが咲いていたりする。",
  },
  {
    id: "lemon-glass-v3",
    pieces: 12,
    sourceUrl: "https://www.aozora.gr.jp/cards/000074/files/424_19826.html",
    original: "私はまたあの花火というやつが好きになった。花火そのものは第二段として、あの安っぽい絵具で赤や紫や黄や青や、さまざまの縞模様を持った花火の束、中山寺の星下り、花合戦、枯れすすき。それから鼠花火というのは一つずつ輪になっていて箱に詰めてある。そんなものが変に私の心を唆った。\n\n　それからまた、びいどろという色硝子で鯛や花を打ち出してあるおはじきが好きになったし、南京玉が好きになった。またそれを嘗めてみるのが私にとってなんともいえない享楽だったのだ。あのびいどろの味ほど幽かな涼しい味があるものか。私は幼い時よくそれを口に入れては父母に叱られたものだが、その幼時のあまい記憶が大きくなって落ち魄れた私に蘇えってくる故だろうか、まったくあの味には幽かな爽やかななんとなく詩美と言ったような味覚が漂って来る。",
  },
] as const;

test("all three works have distinct curated passages with consistent attribution", () => {
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

test("new excerpts retain the exact reviewed source spelling and punctuation", () => {
  for (const reviewed of reviewedAdditions) {
    const passage = PASSAGES.find(({ id }) => id === reviewed.id);
    assert.ok(passage, reviewed.id);
    assert.equal(passage.sourceUrl, reviewed.sourceUrl);
    assert.equal(passage.original, reviewed.original);
    assert.equal(passage.fragments.join(""), comparisonText(reviewed.original));
    assert.equal(passage.fragments.length, reviewed.pieces);
  }
});

test("curated boundaries keep freely swappable descriptions and sentence transitions together", () => {
  const fragments = (id: string) => PASSAGES.find((passage) => passage.id === id)!.fragments;
  assert.ok(fragments("cat-pond-v3").includes("向うに大きな池がある。吾輩は池の前に坐って"));
  assert.ok(fragments("cat-pond-v3").includes("さらさらと風が渡って日が暮れかかる。腹が"));
  assert.ok(fragments("lemon-coolness-v3").includes("私の掌が誰のよりも熱かった。その熱い故だったのだろう、"));
  assert.ok(fragments("galaxy-path-v3").includes("星あかりに照らしだされてあったのです。草の中には、"));
  assert.ok(fragments("galaxy-path-v3").includes("ぴかぴか青びかりを出す小さな虫もいて、ある葉は青くすかし出され、"));
  assert.ok(fragments("cat-home-v3").includes("口惜しそうに吾輩を台所へ抛り出した。かくして吾輩はついに"));
  assert.ok(fragments("lemon-fragrance-v3").includes("カリフォルニヤが想像に上って来る。漢文で習った"));
  assert.ok(fragments("galaxy-platform-v3").includes("大きな時計の前に来てとまりました。さわやかな秋の時計の盤面には、"));
  assert.ok(fragments("cat-study-v3").includes("タカジヤスターゼを飲む。飲んだ後で"));
  assert.ok(fragments("cat-study-v3").includes("書物をひろげる。二三ページ読むと"));
  assert.ok(fragments("lemon-castle-v3").includes("手当たり次第に積みあげ、また慌しく潰し、また慌しく築きあげた。新しく"));
  assert.ok(fragments("lemon-castle-v3").includes("そのたびに赤くなったり青くなったりした。やっとそれは"));
  assert.ok(fragments("galaxy-water-v3").includes("水に手をひたしました。けれどもあやしいその銀河の水は、"));
  assert.ok(fragments("lemon-opening-v3").includes("肺尖カタルや神経衰弱がいけないのではない。また背を焼くような借金などが"));
  assert.ok(fragments("lemon-opening-v3").includes("どんな美しい音楽も、どんな美しい詩の一節も"));
  assert.ok(fragments("lemon-street-v3").includes("何故だかその頃私は見すぼらしくて美しいものに"));
  assert.ok(fragments("lemon-street-v3").includes("土塀が崩れていたり家並が傾きかかっていたり――勢いのいいのは植物だけで、"));
  assert.ok(fragments("lemon-glass-v3").includes("箱に詰めてある。そんなものが変に私の心を唆った。それからまた、"));
  assert.ok(fragments("lemon-glass-v3").includes("父母に叱られたものだが、その幼時のあまい記憶が"));
});

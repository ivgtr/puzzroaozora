import type { CuratedPassage } from "../game/model.ts";
import { comparisonText } from "../game/text.ts";

const works = {
  cat: { workId: "000789", title: "吾輩は猫である", author: "夏目漱石", sourceUrl: "https://www.aozora.gr.jp/cards/000148/files/789_14547.html" },
  lemon: { workId: "000424", title: "檸檬", author: "梶井基次郎", sourceUrl: "https://www.aozora.gr.jp/cards/000074/files/424_19826.html" },
  galaxy: { workId: "000456", title: "銀河鉄道の夜", author: "宮沢賢治", sourceUrl: "https://www.aozora.gr.jp/cards/000081/files/456_15050.html" },
};

function scene(id: string, work: keyof typeof works, premise: string, marked: string, location: string, hints: readonly string[], note: string): CuratedPassage {
  const original = marked.replaceAll("|", "");
  return { id, ...works[work], curatedVersion: 1, difficulty: "easy", sceneTitle: works[work].title, premise, original, fragments: comparisonText(marked).split("|"), location, hints, note };
}

// Reviewed against the linked Aozora originals on 2026-10-01. These are three
// contiguous excerpts, with original spelling and punctuation, not adapted prose.
// | denotes an authored boundary. Freely swappable descriptions stay together;
// some chunks cross a sentence boundary to retain the surrounding relationship.
// Source/location/original/editorial notes are for the completion view only.
export const PASSAGES: CuratedPassage[] = [
  scene(
    "cat-palm-v3", "cat",
    "小さな目に映る、まだよくわからない人間の世界。",
    "この書生の掌の裏でしばらくは|よい心持に坐っておったが、|しばらくすると非常な速力で|運転し始めた。書生が動くのか自分だけが動くのか|分らないが無暗に眼が廻る。胸が悪くなる。|到底助からないと思っていると、どさりと音がして|眼から火が出た。それまでは記憶しているが|あとは何の事やらいくら考え出そうとしても分らない。",
    "一・『この書生の掌の裏で』の段落",
    [
      "語り手の体の感じは、何をきっかけに変わっているでしょう。",
      "動いているのが誰なのか、語り手には判断できません。",
      "覚えていることと、思い出せないことの対比に注目しましょう。",
    ],
    "動く主体の二つの可能性と、二つの身体症状はそれぞれ一片に保持。衝撃と記憶の境も一片に含め、独立した文の入れ替えを減らした。",
  ),
  scene(
    "lemon-shop-v3", "lemon",
    "見慣れた街角にも、ふと心を引くものがある。",
    "その日私はいつになく|その店で買物をした。|というのはその店には|珍しい檸檬が|出ていたのだ。檸檬などごくありふれている。がその店というのも|見すぼらしくはないまでも|ただあたりまえの八百屋に過ぎなかったので、|それまであまり見かけたことはなかった。",
    "『その日私はいつになく』〜『それまであまり見かけたことはなかった。』",
    [
      "出来事そのものと、その理由を説明する部分を見分けましょう。",
      "物そのものの珍しさと、その場所で見かける珍しさは別です。",
      "店の様子は、語り手のそれまでの経験とどう関係するでしょう。",
    ],
    "檸檬が店に出ていた説明から『ありふれている』という対比、店へ話題を戻す部分までを一片に保持。店の説明を先に読んでからその日の買物へ戻せる、独立した二群への分離を避けた。",
  ),
  scene(
    "galaxy-wages-v3", "galaxy",
    "仕事場と通りに残る、夕方のざわめき。",
    "ジョバンニはおじぎをすると扉をあけて|さっきの計算台のところに来ました。すると|さっきの白服を着た人がやっぱりだまって|小さな銀貨を一つジョバンニに渡しました。|ジョバンニは俄かに顔いろがよくなって|威勢よくおじぎをすると台の下に置いた|鞄をもっておもてへ飛びだしました。|それから元気よく口笛を吹きながら|パン屋へ寄ってパンの塊を一つと|角砂糖を一袋買いますと一目散に走りだしました。",
    "二・活版所『ジョバンニはおじぎをすると扉をあけて』の段落",
    [
      "人の様子が変わるとき、そのきっかけになった出来事を考えましょう。",
      "二度のおじぎは、それぞれどんな場面の動作でしょう。",
      "建物の中と外で、できることの違いにも注目しましょう。",
    ],
    "反復する副詞を対応する動作とまとめ、買う二品を助詞込みで保持。計算台から受け渡し、退店から買物へ、場所と行動で追える境界とした。",
  ),
];

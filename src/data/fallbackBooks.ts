import type { BookSummary } from "@/types/puzzle";

export type FallbackWork = {
  book: BookSummary;
  content: string;
};

export const FALLBACK_WORKS: FallbackWork[] = [
  {
    book: {
      id: "0001",
      title: "吾輩は猫である",
      author: "夏目漱石",
      kanaType: "新字新仮名",
    },
    content:
      "吾輩は猫である。名前はまだ無い。どこで生れたかとんと見当がつかぬ。何でも薄暗いじめじめした所でニャーニャー泣いていた事だけは記憶している。",
  },
  {
    book: {
      id: "0002",
      title: "走れメロス",
      author: "太宰治",
      kanaType: "新字新仮名",
    },
    content:
      "メロスは激怒した。必ず、かの邪智暴虐の王を除かなければならぬと決意した。メロスには政治がわからぬ。けれども邪悪に対しては、人一倍に敏感であった。",
  },
  {
    book: {
      id: "0003",
      title: "羅生門",
      author: "芥川龍之介",
      kanaType: "新字新仮名",
    },
    content:
      "ある日の暮方の事である。一人の下人が、羅生門の下で雨やみを待っていた。広い門の下には、この男のほかに誰もいない。",
  },
  {
    book: {
      id: "0004",
      title: "銀河鉄道の夜",
      author: "宮沢賢治",
      kanaType: "新字新仮名",
    },
    content:
      "ではみなさんは、そういうふうに川だと言いながら、実はそれが天の川だということを知っているのでした。ジョバンニは、まるで鉄砲玉のように立ちあがりました。",
  },
  {
    book: {
      id: "0005",
      title: "こころ",
      author: "夏目漱石",
      kanaType: "新字新仮名",
    },
    content:
      "私はその人を常に先生と呼んでいた。だからここでもただ先生と書くだけで本名は打ち明けない。これは世間を憚る遠慮というより、むしろその方が私にとって自然だからである。",
  },
];

export const FALLBACK_BY_ID = new Map(FALLBACK_WORKS.map((work) => [work.book.id, work]));

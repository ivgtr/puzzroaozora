import type { BookSummary } from "@/types/puzzle";

export type FixedWork = {
  book: BookSummary;
  assetPath: string;
  fallbackContent: string;
};

export const FIXED_WORKS: FixedWork[] = [
  {
    book: {
      id: "fixed:lemon",
      title: "檸檬",
      author: "梶井基次郎",
      kanaType: "新字新仮名",
    },
    assetPath: "assets/books/lemon.txt",
    fallbackContent:
      "えたいの知れない不吉な塊が私の心を始終押えつけていた。焦躁とも不安ともつかぬその塊は、私を街へ追い出した。私は京都の町をあてもなく歩き、丸善の店先で足を止めた。",
  },
  {
    book: {
      id: "fixed:gingatetsudo",
      title: "銀河鉄道の夜",
      author: "宮沢賢治",
      kanaType: "新字新仮名",
    },
    assetPath: "assets/books/gingatetsudo.txt",
    fallbackContent:
      "ではみなさんは、そういうふうに川だと言いながら、ほんとうはそれが天の川だということを知っているのでした。ジョバンニは、まるで鉄砲玉のように立ちあがって、窓の外を見ました。",
  },
  {
    book: {
      id: "fixed:wagahai",
      title: "吾輩は猫である",
      author: "夏目漱石",
      kanaType: "新字新仮名",
    },
    assetPath: "assets/books/wagahai.txt",
    fallbackContent:
      "吾輩は猫である。名前はまだ無い。どこで生れたかとんと見当がつかぬ。何でも薄暗いじめじめした所でニャーニャー泣いていた事だけは記憶している。",
  },
  {
    book: {
      id: "fixed:harutoshura",
      title: "春と修羅",
      author: "宮沢賢治",
      kanaType: "旧字旧仮名",
    },
    assetPath: "assets/books/harutoshura.txt",
    fallbackContent:
      "わたくしといふ現象は、仮定された有機交流電燈のひとつの青い照明です。風景やみんなといっしょに、せはしくせはしく明滅しながら、いかにもたしかにともりつづける因果交流電燈です。",
  },
  {
    book: {
      id: "fixed:kasugakyosou",
      title: "春日狂想",
      author: "宮沢賢治",
      kanaType: "旧字旧仮名",
    },
    assetPath: "assets/books/kasugakyosou.txt",
    fallbackContent:
      "薄明の風が丘をわたり、若い草の匂ひを運んできました。空はやはらかな灰青に澄み、遠くの樹々はまだ眠りの色を残してゐます。",
  },
];

export const FIXED_BY_ID = new Map(FIXED_WORKS.map((work) => [work.book.id, work]));

import type { BookSummary } from "@/types/puzzle";

export type FixedWork = {
  book: BookSummary;
  assetPath: string;
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
  },
  {
    book: {
      id: "fixed:gingatetsudo",
      title: "銀河鉄道の夜",
      author: "宮沢賢治",
      kanaType: "新字新仮名",
    },
    assetPath: "assets/books/gingatetsudo.txt",
  },
  {
    book: {
      id: "fixed:wagahai",
      title: "吾輩は猫である",
      author: "夏目漱石",
      kanaType: "新字新仮名",
    },
    assetPath: "assets/books/wagahai.txt",
  },
  {
    book: {
      id: "fixed:harutoshura",
      title: "春と修羅",
      author: "宮沢賢治",
      kanaType: "新字旧仮名",
    },
    assetPath: "assets/books/harutoshura.txt",
  },
  {
    book: {
      id: "fixed:arishihinouta",
      title: "在りし日の歌",
      author: "中原中也",
      kanaType: "新字旧仮名",
    },
    assetPath: "assets/books/arishihinouta.txt",
  },
];

export const FIXED_BOOK_SUMMARIES: BookSummary[] = FIXED_WORKS.map((w) => w.book);

export const FIXED_BY_ID = new Map(FIXED_WORKS.map((work) => [work.book.id, work]));

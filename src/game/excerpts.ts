import type { Puzzle } from './session';

/** Transcribed from the linked Aozora editions. Ruby and paragraph indent omitted, no rewriting. */
export const EXCERPTS = [
  {
    id: 'cat', title: '吾輩は猫である', author: '夏目漱石', range: '第一章冒頭〜「記憶している。」',
    source: 'https://www.aozora.gr.jp/cards/000148/files/789_14547.html',
    chunks: ['吾輩は', '猫である。', '名前は', 'まだ無い。', 'どこで', '生れたか', 'とんと', '見当が', 'つかぬ。', '何でも', '薄暗い', 'じめじめした', '所で', 'ニャーニャー', '泣いていた', '事だけは', '記憶している。'],
  },
  {
    id: 'lemon', title: '檸檬', author: '梶井基次郎', range: '冒頭第一文',
    source: 'https://www.aozora.gr.jp/cards/000074/files/424_19826.html',
    chunks: ['えたいの', '知れない', '不吉な', '塊が', '私の', '心を', '始終', '圧えつけていた。'],
  },
  {
    id: 'melos', title: '走れメロス', author: '太宰治', range: '冒頭〜「シラクスの市にやって来た。」',
    source: 'https://www.aozora.gr.jp/cards/000035/files/1567_14913.html',
    chunks: ['メロスは', '激怒した。', '必ず、', 'かの', '邪智暴虐の', '王を', '除かなければ', 'ならぬと', '決意した。', 'メロスには', '政治が', 'わからぬ。', 'メロスは、', '村の', '牧人である。', '笛を吹き、', '羊と', '遊んで', '暮して来た。', 'けれども', '邪悪に対しては、', '人一倍に', '敏感であった。', 'きょう未明', 'メロスは', '村を出発し、', '野を越え山越え、', '十里はなれた', '此のシラクスの市に', 'やって来た。'],
  },
  {
    id: 'mikan', title: '蜜柑', author: '芥川龍之介', range: '冒頭二文（新字旧仮名）',
    source: 'https://www.aozora.gr.jp/cards/000879/files/98_15272.html',
    chunks: ['或曇つた', '冬の日暮である。', '私は', '横須賀発', '上り', '二等客車の', '隅に', '腰を下して、', 'ぼんやり', '発車の笛を', '待つてゐた。'],
  },
] as const;

export function excerptPuzzle(id: string): Puzzle {
  const excerpt = EXCERPTS.find((item) => item.id === id);
  if (!excerpt) throw new Error('抜粋が見つかりません。');
  return { title: excerpt.title, author: excerpt.author, source: excerpt.source,
    originalText: excerpt.chunks.join(''), pieces: excerpt.chunks.map((text, index) => ({ id: `piece-${index}`, text })) };
}

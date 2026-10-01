import type { CuratedPassage } from "./model.ts";

/** Draw a different curated excerpt, rather than merely reshuffling its pieces. */
export function drawPassage(passages: readonly CuratedPassage[], workId: string, previousId?: string, random: () => number = Math.random): CuratedPassage {
  const matching = passages.filter((passage) => passage.workId === workId);
  if (!matching.length) throw new Error("この作品の問題が見つかりません。");
  const choices = matching.length > 1 ? matching.filter((passage) => passage.id !== previousId) : matching;
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error("問題を選ぶ乱数が不正です。");
  return choices[Math.floor(value * choices.length)];
}

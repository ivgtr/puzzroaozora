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

/** A finite shuffled deck. Every curated excerpt in this work appears once. */
export function passageOrder(passages: readonly CuratedPassage[], workId: string, random: () => number = Math.random): string[] {
  const order = passages.filter((passage) => passage.workId === workId).map((passage) => passage.id);
  if (!order.length) throw new Error("この作品の問題が見つかりません。");
  if (new Set(order).size !== order.length) throw new Error("選定問題のIDが重複しています。");
  for (let i = order.length - 1; i > 0; i--) {
    const draw = random();
    if (!Number.isFinite(draw) || draw < 0 || draw >= 1) throw new Error("問題を選ぶ乱数が不正です。");
    const j = Math.floor(draw * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

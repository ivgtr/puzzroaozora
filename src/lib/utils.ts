import type { Difficulty } from "@/types/puzzle";

const AOZORA_URL_RE = /\/cards\/\d+\/(?:card|files\/)(\d+)[_.]/;

export function parseAozoraUrl(url: string): string | null {
  const match = AOZORA_URL_RE.exec(url);
  if (!match?.[1]) return null;
  return match[1].padStart(6, "0");
}

export function formatSeconds(totalSeconds: number): string {
  const min = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const sec = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${min}:${sec}`;
}

export function isFixedBook(bookId: string): boolean {
  return bookId.startsWith("fixed:");
}

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: "\u5165\u9580",
  normal: "\u901A\u5E38",
  hard: "\u9054\u4EBA",
};

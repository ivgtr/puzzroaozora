import type { Difficulty, PartOfSpeech, PuzzleSegment } from "@/types/puzzle";
import { DIFFICULTY_CONFIG } from "@/lib/puzzle/difficulty";

const PARTICLES = new Set([
  "は",
  "が",
  "を",
  "に",
  "へ",
  "と",
  "で",
  "の",
  "も",
  "や",
  "か",
  "ね",
  "よ",
  "ぞ",
  "さ",
  "な",
  "から",
  "まで",
  "より",
  "だけ",
  "ほど",
  "しか",
  "でも",
]);

const AUXILIARIES = new Set(["だ", "です", "ます", "ない", "たい", "た", "れる", "られる"]);
const CONNECTIVES = ["そして", "しかし", "また", "だから", "それから", "ところが"];
const ADVERBS = ["とても", "とくに", "すぐ", "ゆっくり", "まるで", "かなり"];
const PUNCTUATION_RE = /^[、。！？!?「」『』（）()…―ー・,.]$/;

function isPunctuation(char: string): boolean {
  return PUNCTUATION_RE.test(char);
}

function getRandomInt(min: number, max: number, random: () => number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

function splitToChunks(text: string, difficulty: Difficulty, random: () => number): string[] {
  const config = DIFFICULTY_CONFIG[difficulty];
  const chars = [...text.replace(/\s+/g, "")];

  const chunks: string[] = [];
  let index = 0;

  while (index < chars.length) {
    if (isPunctuation(chars[index])) {
      if (chunks.length === 0) {
        chunks.push(chars[index]);
      } else {
        chunks[chunks.length - 1] += chars[index];
      }
      index += 1;
      continue;
    }

    const length = getRandomInt(config.minChunk, config.maxChunk, random);
    let chunk = chars.slice(index, index + length).join("");
    index += length;

    while (index < chars.length && isPunctuation(chars[index])) {
      chunk += chars[index];
      index += 1;
    }

    chunks.push(chunk);
  }

  return chunks.filter((chunk) => chunk.length > 0);
}

function mergeClosestChunks(chunks: string[]): string[] {
  if (chunks.length <= 1) {
    return chunks;
  }

  let minIndex = 0;
  let minCombinedLength = Number.POSITIVE_INFINITY;

  for (let i = 0; i < chunks.length - 1; i += 1) {
    const combined = chunks[i].length + chunks[i + 1].length;
    if (combined < minCombinedLength) {
      minCombinedLength = combined;
      minIndex = i;
    }
  }

  const result = [...chunks];
  result[minIndex] = result[minIndex] + result[minIndex + 1];
  result.splice(minIndex + 1, 1);
  return result;
}

function splitLongestChunk(chunks: string[]): string[] {
  let maxIndex = -1;
  let maxLength = 0;

  for (let i = 0; i < chunks.length; i += 1) {
    if (chunks[i].length > maxLength) {
      maxLength = chunks[i].length;
      maxIndex = i;
    }
  }

  if (maxIndex === -1 || maxLength <= 1) {
    return chunks;
  }

  const chunk = chunks[maxIndex];
  const mid = Math.floor(chunk.length / 2);
  const result = [...chunks];
  result.splice(maxIndex, 1, chunk.slice(0, mid), chunk.slice(mid));
  return result;
}

function normalizeSegmentCount(chunks: string[], difficulty: Difficulty): string[] {
  const config = DIFFICULTY_CONFIG[difficulty];
  let result = [...chunks];

  while (result.length > config.maxSegments) {
    result = mergeClosestChunks(result);
  }

  while (result.length < config.minSegments) {
    const next = splitLongestChunk(result);
    if (next.length === result.length) {
      break;
    }
    result = next;
  }

  return result;
}

function estimatePartOfSpeech(text: string): PartOfSpeech {
  const plain = text.replace(/[、。！？!?「」『』（）()…―ー・,.]/g, "");

  if (!plain) {
    return "記号";
  }

  if (PARTICLES.has(plain)) {
    return "助詞";
  }

  if (AUXILIARIES.has(plain)) {
    return "助動詞";
  }

  if (CONNECTIVES.some((word) => plain.startsWith(word))) {
    return "接続詞";
  }

  if (ADVERBS.some((word) => plain.startsWith(word))) {
    return "副詞";
  }

  if (/(する|した|して|ます|ない|れる|られる|いた|った|く|ぐ|す|つ|ぬ|む|ぶ|う|る)$/.test(plain)) {
    return "動詞";
  }

  if (/い$/.test(plain) && plain.length >= 2) {
    return "形容詞";
  }

  return "名詞";
}

export function createPuzzleSegments(text: string, difficulty: Difficulty, random: () => number): PuzzleSegment[] {
  const chunks = normalizeSegmentCount(splitToChunks(text, difficulty, random), difficulty);

  return chunks.map((chunk, index) => ({
    id: `seg-${index + 1}-${Math.floor(random() * 1_000_000).toString(36)}`,
    text: chunk,
    position: index,
    partOfSpeech: estimatePartOfSpeech(chunk),
  }));
}

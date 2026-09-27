import crypto from "node:crypto";
import { getBookContent } from "@/lib/aozora/client";
import { normalizeAozoraText, pickPassageByLength } from "@/lib/aozora/cleaner";
import { DIFFICULTY_CONFIG } from "@/lib/puzzle/difficulty";
import { decryptPassage } from "@/lib/puzzle/passageCrypto";
import { buildSeededRandom, shuffleWithRandom } from "@/lib/puzzle/random";
import { createPuzzleSegments } from "@/lib/puzzle/segmenter";
import type { Difficulty, PuzzleData } from "@/types/puzzle";

export async function generatePuzzle(options: {
  bookId: string;
  difficulty: Difficulty;
  seed?: string;
  title?: string;
  author?: string;
  encryptedPassage?: string;
  excludeText?: string;
}): Promise<PuzzleData> {
  const seed = options.seed ?? crypto.randomUUID();
  const random = buildSeededRandom(seed);
  const difficultyConfig = DIFFICULTY_CONFIG[options.difficulty];

  let passage: string;
  let title: string;
  let author: string;

  if (options.encryptedPassage) {
    passage = decryptPassage(options.encryptedPassage);
    title = options.title ?? "";
    author = options.author ?? "";
  } else {
    const content = await getBookContent(options.bookId);
    const normalizedText = normalizeAozoraText(content.text);
    passage = pickPassageByLength(
      normalizedText,
      difficultyConfig.textMin,
      difficultyConfig.textMax,
      random,
      options.excludeText,
    );
    title = content.title;
    author = content.author;
  }

  const segments = createPuzzleSegments(passage, options.difficulty, random);
  if (segments.length < 2) {
    throw new Error("\u30D1\u30BA\u30EB\u751F\u6210\u306B\u5FC5\u8981\u306A\u6587\u91CF\u304C\u4E0D\u8DB3\u3057\u3066\u3044\u307E\u3059");
  }

  const shuffledSegments = shuffleWithRandom(segments, random);
  const puzzleId = crypto.randomUUID();

  return {
    id: puzzleId,
    bookId: options.bookId,
    title,
    author,
    originalText: passage,
    segments,
    shuffledSegments,
    difficulty: options.difficulty,
    textLength: passage.length,
    createdAt: new Date().toISOString(),
  };
}

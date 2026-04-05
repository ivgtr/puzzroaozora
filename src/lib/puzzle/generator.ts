import crypto from "node:crypto";
import { getBookContent, listBooks } from "@/lib/aozora/client";
import { normalizeAozoraText, pickPassageByLength } from "@/lib/aozora/cleaner";
import { createAnswerToken } from "@/lib/puzzle/answerToken";
import { DIFFICULTY_CONFIG } from "@/lib/puzzle/difficulty";
import { buildSeededRandom, shuffleWithRandom } from "@/lib/puzzle/random";
import { createPuzzleSegments } from "@/lib/puzzle/segmenter";
import type { Difficulty, PuzzleData } from "@/types/puzzle";

async function resolveBookId(bookId: string | undefined, random: () => number): Promise<string> {
  if (bookId) {
    return bookId;
  }

  const books = await listBooks({ limit: 30, offset: 0 });
  if (books.books.length === 0) {
    throw new Error("作品一覧を取得できませんでした");
  }

  const randomIndex = Math.floor(random() * books.books.length);
  return books.books[randomIndex].id;
}

export async function generatePuzzle(options: {
  bookId?: string;
  difficulty: Difficulty;
  seed?: string;
}): Promise<PuzzleData> {
  const seed = options.seed ?? crypto.randomUUID();
  const random = buildSeededRandom(seed);
  const difficultyConfig = DIFFICULTY_CONFIG[options.difficulty];

  const bookId = await resolveBookId(options.bookId, random);
  const content = await getBookContent(bookId);

  const normalizedText = normalizeAozoraText(content.text);
  const passage = pickPassageByLength(
    normalizedText,
    difficultyConfig.textMin,
    difficultyConfig.textMax,
    random,
  );

  const segments = createPuzzleSegments(passage, options.difficulty, random);
  if (segments.length < 2) {
    throw new Error("パズル生成に必要な文量が不足しています");
  }

  const fixedSegmentId = difficultyConfig.showFixedFirstSegment
    ? segments[0]?.id
    : undefined;

  const poolSegments = fixedSegmentId
    ? segments.filter((segment) => segment.id !== fixedSegmentId)
    : segments;

  const shuffledSegments = shuffleWithRandom(poolSegments, random);
  const puzzleId = crypto.randomUUID();
  const answerToken = createAnswerToken({
    puzzleId,
    difficulty: options.difficulty,
    order: segments.map((segment) => segment.id),
    correctText: segments.map((segment) => segment.text).join(""),
    issuedAt: Date.now(),
  });

  return {
    id: puzzleId,
    bookId,
    title: content.title,
    author: content.author,
    originalText: passage,
    segments,
    shuffledSegments,
    difficulty: options.difficulty,
    textLength: passage.length,
    createdAt: new Date().toISOString(),
    fixedSegmentId,
    answerToken,
  };
}

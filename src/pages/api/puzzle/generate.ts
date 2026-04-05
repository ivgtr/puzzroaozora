import type { NextApiRequest, NextApiResponse } from "next";
import { parseDifficulty } from "@/lib/puzzle/difficulty";
import { generatePuzzle } from "@/lib/puzzle/generator";
import type { ApiResponse, PuzzleData } from "@/types/puzzle";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<PuzzleData>>,
): Promise<void> {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    res.status(405).json({
      success: false,
      error: {
        code: "METHOD_NOT_ALLOWED",
        message: "GET のみ利用できます",
      },
    });
    return;
  }

  const difficulty = parseDifficulty(
    typeof req.query.difficulty === "string" ? req.query.difficulty : undefined,
  );

  const bookId = typeof req.query.bookId === "string" ? req.query.bookId : undefined;
  const seed = typeof req.query.seed === "string" ? req.query.seed : undefined;

  try {
    const puzzle = await generatePuzzle({
      bookId,
      difficulty,
      seed,
    });

    res.setHeader("Cache-Control", "public, max-age=120, s-maxage=600");
    res.status(200).json({
      success: true,
      data: puzzle,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: "PUZZLE_GENERATE_FAILED",
        message: error instanceof Error ? error.message : "パズル生成に失敗しました",
      },
    });
  }
}

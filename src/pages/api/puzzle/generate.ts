import type { NextApiRequest, NextApiResponse } from "next";
import { generatePuzzle } from "@/lib/puzzle/generator";
import { PassageDecryptionError } from "@/lib/puzzle/passageCrypto";
import type { ApiResponse, PuzzleData } from "@/types/puzzle";

type GenerateBody = {
  difficulty?: string;
  bookId?: string;
  seed?: string;
  title?: string;
  author?: string;
  encryptedPassage?: string;
  excludeText?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<PuzzleData>>,
): Promise<void> {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    res.status(405).json({
      success: false,
      error: {
        code: "METHOD_NOT_ALLOWED",
        message: "POST \u306E\u307F\u5229\u7528\u3067\u304D\u307E\u3059",
      },
    });
    return;
  }

  const body = req.body as GenerateBody;
  if (body.difficulty !== "easy" && body.difficulty !== "normal") {
    res.status(400).json({ success: false, error: { code: "INVALID_DIFFICULTY", message: "現在はEasyとNormalで遊べます。" } });
    return;
  }
  const difficulty = body.difficulty;
  const bookId = body.bookId;

  if (!bookId || typeof bookId !== "string") {
    res.status(400).json({
      success: false,
      error: {
        code: "INVALID_INPUT",
        message: "bookId \u306F\u5FC5\u9808\u3067\u3059",
      },
    });
    return;
  }

  try {
    const puzzle = await generatePuzzle({
      bookId,
      difficulty,
      seed: typeof body.seed === "string" ? body.seed : undefined,
      title: typeof body.title === "string" ? body.title : undefined,
      author: typeof body.author === "string" ? body.author : undefined,
      encryptedPassage:
        typeof body.encryptedPassage === "string"
          ? body.encryptedPassage
          : undefined,
      excludeText:
        typeof body.excludeText === "string"
          ? body.excludeText
          : undefined,
    });

    res.status(200).json({
      success: true,
      data: puzzle,
    });
  } catch (error) {
    if (error instanceof PassageDecryptionError) {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_PASSAGE",
          message: "\u7121\u52B9\u306A\u6697\u53F7\u5316\u30C7\u30FC\u30BF\u3067\u3059",
        },
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: {
        code: "PUZZLE_GENERATE_FAILED",
        message:
          error instanceof Error ? error.message : "\u30D1\u30BA\u30EB\u751F\u6210\u306B\u5931\u6557\u3057\u307E\u3057\u305F",
      },
    });
  }
}

import crypto from "node:crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { normalizeAozoraText, pickPassageByLength } from "@/lib/aozora/cleaner";
import { importBookFromApi } from "@/lib/aozora/client";
import { DIFFICULTY_CONFIG } from "@/lib/puzzle/difficulty";
import { encryptPassage } from "@/lib/puzzle/passageCrypto";
import { buildSeededRandom } from "@/lib/puzzle/random";
import type { ApiResponse, Difficulty } from "@/types/puzzle";

type EncryptedPassageDto = {
  difficulty: Difficulty;
  encrypted: string;
};

type ImportResult = {
  book: {
    id: string;
    title: string;
    author: string;
    kanaType: string;
  };
  passages: EncryptedPassageDto[];
};

const PASSAGES_PER_DIFFICULTY = 30;

function extractPassages(
  normalizedText: string,
  difficulty: Difficulty,
  count: number,
  workId: string,
): string[] {
  const config = DIFFICULTY_CONFIG[difficulty];
  const passages = new Set<string>();
  const nonce = crypto.randomUUID();

  for (let i = 0; i < count * 3 && passages.size < count; i++) {
    const seed = `${workId}-${difficulty}-${i}-${nonce}`;
    const random = buildSeededRandom(seed);
    const passage = pickPassageByLength(
      normalizedText,
      config.textMin,
      config.textMax,
      random,
    );
    if (passage.length >= config.textMin) {
      passages.add(passage);
    }
  }

  return [...passages];
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<ImportResult>>,
): Promise<void> {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    res.status(405).json({
      success: false,
      error: { code: "METHOD_NOT_ALLOWED", message: "POST \u306E\u307F\u5229\u7528\u3067\u304D\u307E\u3059" },
    });
    return;
  }

  const { workId } = req.body as { workId?: string };

  const normalizedWorkId = typeof workId === "string" ? workId.padStart(6, "0") : "";

  if (!workId || typeof workId !== "string" || !/^\d+$/.test(workId)) {
    res.status(400).json({
      success: false,
      error: { code: "INVALID_INPUT", message: "\u6709\u52B9\u306A\u4F5C\u54C1ID\u3092\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044" },
    });
    return;
  }

  try {
    const { book, text } = await importBookFromApi(normalizedWorkId);
    const normalizedText = normalizeAozoraText(text);

    if (normalizedText.length < 30) {
      res.status(422).json({
        success: false,
        error: {
          code: "TEXT_TOO_SHORT",
          message: "\u30D1\u30BA\u30EB\u306B\u5FC5\u8981\u306A\u6587\u91CF\u304C\u4E0D\u8DB3\u3057\u3066\u3044\u307E\u3059",
        },
      });
      return;
    }

    const passages: EncryptedPassageDto[] = [];
    for (const difficulty of ["easy", "normal", "hard"] as Difficulty[]) {
      const extracted = extractPassages(
        normalizedText,
        difficulty,
        PASSAGES_PER_DIFFICULTY,
        normalizedWorkId,
      );
      for (const passage of extracted) {
        passages.push({
          difficulty,
          encrypted: encryptPassage(passage),
        });
      }
    }

    res.status(200).json({
      success: true,
      data: { book, passages },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: "IMPORT_FAILED",
        message:
          error instanceof Error ? error.message : "\u4F5C\u54C1\u306E\u53D6\u308A\u8FBC\u307F\u306B\u5931\u6557\u3057\u307E\u3057\u305F",
      },
    });
  }
}

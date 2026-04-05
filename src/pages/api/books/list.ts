import type { NextApiRequest, NextApiResponse } from "next";
import { listBooks } from "@/lib/aozora/client";
import type { ApiResponse, BookSummary } from "@/types/puzzle";

type BooksListData = {
  books: BookSummary[];
  total: number;
  hasMore: boolean;
  source: "fixed" | "api" | "fallback";
};

function parsePositiveInt(value: string | string[] | undefined, fallback: number): number {
  if (typeof value !== "string") {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<BooksListData>>,
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

  const limit = Math.max(1, Math.min(parsePositiveInt(req.query.limit, 20), 50));
  const offset = parsePositiveInt(req.query.offset, 0);
  const query =
    typeof req.query.query === "string"
      ? req.query.query
      : typeof req.query.author === "string"
        ? req.query.author
        : undefined;

  try {
    const data = await listBooks({ limit, offset, query });
    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: "BOOKS_FETCH_FAILED",
        message: error instanceof Error ? error.message : "作品一覧の取得に失敗しました",
      },
    });
  }
}

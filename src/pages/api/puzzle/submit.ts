import type { NextApiRequest, NextApiResponse } from "next";
import { judgeAnswer, validateAnswerPayload } from "@/lib/puzzle/validator";
import type { AnswerData, ApiResponse, ResultData } from "@/types/puzzle";

type SubmitRequestBody = {
  answer?: AnswerData;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<ResultData>>,
): Promise<void> {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    res.status(405).json({
      success: false,
      error: {
        code: "METHOD_NOT_ALLOWED",
        message: "POST のみ利用できます",
      },
    });
    return;
  }

  const body = req.body as SubmitRequestBody;
  if (!body?.answer) {
    res.status(400).json({
      success: false,
      error: {
        code: "INVALID_REQUEST",
        message: "answer が必要です",
      },
    });
    return;
  }

  const invalidReason = validateAnswerPayload(body.answer);
  if (invalidReason) {
    res.status(400).json({
      success: false,
      error: {
        code: "INVALID_REQUEST",
        message: invalidReason,
      },
    });
    return;
  }

  try {
    const result = judgeAnswer(body.answer);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: {
        code: "SUBMIT_FAILED",
        message: error instanceof Error ? error.message : "解答判定に失敗しました",
      },
    });
  }
}

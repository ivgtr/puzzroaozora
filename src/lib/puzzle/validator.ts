import { verifyAnswerToken } from "@/lib/puzzle/answerToken";
import { calculateResult } from "@/lib/puzzle/scoring";
import type { AnswerData, ResultData } from "@/types/puzzle";

export function validateAnswerPayload(answer: AnswerData): string | null {
  if (!answer.puzzleId) {
    return "puzzleId は必須です";
  }
  if (!Array.isArray(answer.userAnswer)) {
    return "userAnswer は配列で指定してください";
  }
  if (!answer.answerToken) {
    return "answerToken が不足しています";
  }
  return null;
}

export function judgeAnswer(answer: AnswerData): ResultData {
  const token = verifyAnswerToken(answer.answerToken);
  if (!token) {
    throw new Error("解答トークンが無効です。問題を再取得してください。");
  }

  if (token.puzzleId !== answer.puzzleId) {
    throw new Error("問題IDが一致しません。問題を再取得してください。");
  }

  return calculateResult({
    puzzleId: answer.puzzleId,
    difficulty: token.difficulty,
    correctOrder: token.order,
    userOrder: answer.userAnswer,
    timeSpent: answer.timeSpent,
    correctText: token.correctText,
  });
}

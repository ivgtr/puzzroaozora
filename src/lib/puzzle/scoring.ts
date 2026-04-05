import type { Difficulty, ResultData } from "@/types/puzzle";
import { DIFFICULTY_CONFIG } from "@/lib/puzzle/difficulty";

function buildFeedback(isCorrect: boolean, ratio: number): string {
  if (isCorrect) {
    return "正解です。語順の記憶がしっかり定着しています。";
  }

  if (ratio >= 0.8) {
    return "あと一歩です。ほぼ正しい並びです。";
  }

  if (ratio >= 0.5) {
    return "半分以上は合っています。句読点の位置も意識してみましょう。";
  }

  return "もう一度挑戦して、文頭から順に声に出して確認してみましょう。";
}

export function calculateResult(params: {
  puzzleId: string;
  difficulty: Difficulty;
  correctOrder: string[];
  userOrder: string[];
  timeSpent: number;
  correctText: string;
}): ResultData {
  const total = params.correctOrder.length;
  const correctPositions = params.correctOrder.reduce((count, id, index) => {
    return count + (params.userOrder[index] === id ? 1 : 0);
  }, 0);

  const ratio = total > 0 ? correctPositions / total : 0;
  const isCorrect = ratio === 1;

  const baseScore = Math.round(ratio * 100);
  const targetTime = DIFFICULTY_CONFIG[params.difficulty].targetTimeSeconds;
  const timeBonusScore = isCorrect
    ? Math.max(0, Math.round(((targetTime - Math.max(params.timeSpent, 0)) / targetTime) * 20))
    : 0;

  const score = Math.min(100, baseScore + timeBonusScore);

  return {
    puzzleId: params.puzzleId,
    isCorrect,
    score,
    correctPositions,
    totalSegments: total,
    timeBonusScore,
    feedback: buildFeedback(isCorrect, ratio),
    correctText: params.correctText,
  };
}

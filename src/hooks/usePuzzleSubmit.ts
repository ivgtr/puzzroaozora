import { useRouter } from "next/router";
import { useAppContext } from "@/contexts/AppContext";
import { useGameContext } from "@/contexts/GameContext";
import { requestJson, normalizeErrorMessage } from "@/lib/api/client";
import type { ApiResponse, ResultData } from "@/types/puzzle";

export function usePuzzleSubmit() {
  const router = useRouter();
  const { showNotice } = useAppContext();
  const { state, dispatch } = useGameContext();

  const submitAnswer = async () => {
    const { puzzle, answerIds, startedAtMs } = state;
    if (!puzzle || !startedAtMs) return;

    dispatch({ type: "START_SUBMITTING" });

    try {
      const now = new Date();
      const timeSpent = Math.floor((now.getTime() - startedAtMs) / 1000);

      const response = await requestJson<ApiResponse<ResultData>>("/api/puzzle/submit", {
        method: "POST",
        body: JSON.stringify({
          answer: {
            puzzleId: puzzle.id,
            userAnswer: answerIds,
            startedAt: new Date(startedAtMs).toISOString(),
            submittedAt: now.toISOString(),
            timeSpent,
            answerToken: puzzle.answerToken,
          },
        }),
      });

      if (!response.success) throw new Error(response.error.message);

      dispatch({ type: "SUBMIT_SUCCESS", payload: response.data });
      await router.push("/result");
    } catch (error) {
      dispatch({ type: "SUBMIT_FAILED" });
      showNotice(
        normalizeErrorMessage(error, "\u89E3\u7B54\u9001\u4FE1\u306B\u5931\u6557\u3057\u307E\u3057\u305F"),
      );
    }
  };

  return { submitAnswer, isSubmitting: state.status === "submitting" };
}

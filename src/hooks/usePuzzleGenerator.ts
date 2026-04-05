import { useRouter } from "next/router";
import { useAppContext } from "@/contexts/AppContext";
import { useGameContext } from "@/contexts/GameContext";
import { requestJson, normalizeErrorMessage } from "@/lib/api/client";
import { pickRandomPassage } from "@/lib/store/bookStore";
import { isFixedBook } from "@/lib/utils";
import type { ApiResponse, PuzzleData } from "@/types/puzzle";

export function usePuzzleGenerator() {
  const router = useRouter();
  const { showNotice } = useAppContext();
  const { state, dispatch } = useGameContext();

  const generatePuzzle = async () => {
    dispatch({ type: "START_GENERATING" });

    let usedEncrypted: string | undefined;

    try {
      const body: Record<string, string> = {
        difficulty: state.difficulty,
        bookId: state.selectedBookId,
      };

      if (!isFixedBook(state.selectedBookId)) {
        const stored = state.userBooks.find((b) => b.id === state.selectedBookId);
        if (!stored)
          throw new Error(
            "\u4F5C\u54C1\u304C\u30ED\u30FC\u30AB\u30EB\u30B9\u30C8\u30EC\u30FC\u30B8\u306B\u898B\u3064\u304B\u308A\u307E\u305B\u3093",
          );

        const encrypted = pickRandomPassage(
          stored,
          state.difficulty,
          state.lastEncryptedPassage ?? undefined,
        );
        if (!encrypted)
          throw new Error(
            "\u3053\u306E\u96E3\u6613\u5EA6\u3067\u4F7F\u7528\u53EF\u80FD\u306A\u4E00\u7BC0\u304C\u3042\u308A\u307E\u305B\u3093",
          );

        usedEncrypted = encrypted;
        body.encryptedPassage = encrypted;
        body.title = stored.title;
        body.author = stored.author;
      } else if (state.lastOriginalText) {
        body.excludeText = state.lastOriginalText;
      }

      const response = await requestJson<ApiResponse<PuzzleData>>("/api/puzzle/generate", {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (!response.success) throw new Error(response.error.message);

      dispatch({
        type: "PUZZLE_READY",
        payload: response.data,
        encryptedPassage: usedEncrypted,
      });
      await router.push("/play");
    } catch (error) {
      dispatch({ type: "GENERATION_FAILED" });
      showNotice(
        normalizeErrorMessage(error, "\u30D1\u30BA\u30EB\u751F\u6210\u306B\u5931\u6557\u3057\u307E\u3057\u305F"),
      );
    }
  };

  return { generatePuzzle, isGenerating: state.status === "generating" };
}

import { useState } from "react";
import { useAppContext } from "@/contexts/AppContext";
import { useGameContext } from "@/contexts/GameContext";
import { requestJson, normalizeErrorMessage } from "@/lib/api/client";
import { putBook, type StoredBook } from "@/lib/store/bookStore";
import { parseAozoraUrl } from "@/lib/utils";
import type { ApiResponse, BookSummary, Difficulty } from "@/types/puzzle";

export function useImportBook() {
  const { showNotice } = useAppContext();
  const { state, dispatch } = useGameContext();
  const [importUrl, setImportUrl] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  const importBook = async () => {
    const workId = parseAozoraUrl(importUrl);
    if (!workId) {
      showNotice("\u7121\u52B9\u306A\u9752\u7A7A\u6587\u5EAB\u306EURL\u3067\u3059");
      return;
    }

    if (state.userBooks.some((b) => b.id === workId)) {
      showNotice("\u3053\u306E\u4F5C\u54C1\u306F\u65E2\u306B\u8FFD\u52A0\u3055\u308C\u3066\u3044\u307E\u3059");
      return;
    }

    setIsImporting(true);

    try {
      const res = await requestJson<
        ApiResponse<{
          book: BookSummary;
          passages: { difficulty: Difficulty; encrypted: string }[];
        }>
      >("/api/books/import", {
        method: "POST",
        body: JSON.stringify({ workId }),
      });

      if (!res.success) throw new Error(res.error.message);

      const stored: StoredBook = {
        id: res.data.book.id,
        title: res.data.book.title,
        author: res.data.book.author,
        kanaType: res.data.book.kanaType,
        passages: res.data.passages,
        addedAt: new Date().toISOString(),
      };

      await putBook(stored);
      dispatch({ type: "ADD_USER_BOOK", payload: stored });
      dispatch({ type: "SET_SELECTED_BOOK", payload: stored.id });
      setImportUrl("");
      showNotice(`\u300C${stored.title}\u300D\u2014 ${stored.author}`);
    } catch (error) {
      showNotice(
        normalizeErrorMessage(error, "\u4F5C\u54C1\u306E\u53D6\u308A\u8FBC\u307F\u306B\u5931\u6557\u3057\u307E\u3057\u305F"),
      );
    } finally {
      setIsImporting(false);
    }
  };

  return { importUrl, setImportUrl, isImporting, importBook };
}

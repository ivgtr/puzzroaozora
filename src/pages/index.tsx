import { useCallback, useEffect, useMemo, useState } from "react";
import { FIXED_WORKS } from "@/data/fixedBooks";
import {
  type StoredBook,
  deleteBook,
  getAllBooks,
  pickRandomPassage,
  putBook,
  toBookSummary,
} from "@/lib/store/bookStore";
import type { ApiResponse, BookSummary, Difficulty, PuzzleData, ResultData } from "@/types/puzzle";

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: "\u5165\u9580",
  normal: "\u901A\u5E38",
  hard: "\u9054\u4EBA",
};

const FIXED_BOOK_SUMMARIES: BookSummary[] = FIXED_WORKS.map((w) => w.book);

const AOZORA_URL_RE = /\/cards\/\d+\/(?:card|files\/)(\d+)[_.]/;

function parseAozoraUrl(url: string): string | null {
  const match = AOZORA_URL_RE.exec(url);
  if (!match?.[1]) return null;
  return match[1].padStart(6, "0");
}

function formatSeconds(totalSeconds: number): string {
  const min = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const sec = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${min}:${sec}`;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

  let json: T;
  try {
    json = (await response.json()) as T;
  } catch {
    throw new Error(`HTTP ${response.status}`);
  }
  return json;
}

function normalizeErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  return fallback;
}

function isFixedBook(bookId: string): boolean {
  return bookId.startsWith("fixed:");
}

export default function Home() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [userBooks, setUserBooks] = useState<StoredBook[]>([]);
  const [selectedBookId, setSelectedBookId] = useState<string>(
    FIXED_BOOK_SUMMARIES[0]?.id ?? "",
  );

  const [puzzle, setPuzzle] = useState<PuzzleData | null>(null);
  const [answerIds, setAnswerIds] = useState<string[]>([]);
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [result, setResult] = useState<ResultData | null>(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeKey, setNoticeKey] = useState(0);

  const [editMode, setEditMode] = useState(false);
  const [importUrl, setImportUrl] = useState("");

  const books: BookSummary[] = useMemo(
    () => [...FIXED_BOOK_SUMMARIES, ...userBooks.map(toBookSummary)],
    [userBooks],
  );

  useEffect(() => {
    const stored = document.documentElement.getAttribute("data-theme");
    if (stored === "dark" || stored === "light") setTheme(stored);
  }, []);

  useEffect(() => {
    void getAllBooks().then(setUserBooks);
  }, []);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    setNoticeKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(""), 5000);
    return () => window.clearTimeout(id);
  }, [notice, noticeKey]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try {
        localStorage.setItem("theme", next);
      } catch {
        /* noop */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!puzzle || result) return;
    const timerId = window.setInterval(() => {
      if (startedAtMs) {
        setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)));
      }
    }, 1000);
    return () => window.clearInterval(timerId);
  }, [puzzle, result, startedAtMs]);

  const segmentById = useMemo(() => {
    const map = new Map<string, PuzzleData["segments"][number]>();
    if (puzzle) {
      puzzle.segments.forEach((seg) => map.set(seg.id, seg));
    }
    return map;
  }, [puzzle]);

  const answerSegments = useMemo(
    () =>
      answerIds
        .map((id) => segmentById.get(id))
        .filter((s): s is NonNullable<typeof s> => Boolean(s)),
    [answerIds, segmentById],
  );

  const fixedSegment = useMemo(() => {
    if (!puzzle?.fixedSegmentId) return null;
    return segmentById.get(puzzle.fixedSegmentId) ?? null;
  }, [puzzle, segmentById]);

  const availableSegments = useMemo(() => {
    if (!puzzle) return [];
    const selected = new Set(answerIds);
    return puzzle.shuffledSegments.filter((seg) => !selected.has(seg.id));
  }, [puzzle, answerIds]);

  const progressRate = useMemo(() => {
    if (!puzzle || puzzle.segments.length === 0) return 0;
    return Math.round((answerSegments.length / puzzle.segments.length) * 100);
  }, [puzzle, answerSegments.length]);

  const importBook = useCallback(async () => {
    const workId = parseAozoraUrl(importUrl);
    if (!workId) {
      showNotice("\u7121\u52B9\u306A\u9752\u7A7A\u6587\u5EAB\u306EURL\u3067\u3059");
      return;
    }

    if (userBooks.some((b) => b.id === workId)) {
      showNotice("\u3053\u306E\u4F5C\u54C1\u306F\u65E2\u306B\u8FFD\u52A0\u3055\u308C\u3066\u3044\u307E\u3059");
      return;
    }

    setIsImporting(true);
    setNotice("");

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
      setUserBooks((prev) => [...prev, stored]);
      setSelectedBookId(stored.id);
      setImportUrl("");
      showNotice(`\u300C${stored.title}\u300D\u2014 ${stored.author}`);
    } catch (error) {
      showNotice(normalizeErrorMessage(error, "\u4F5C\u54C1\u306E\u53D6\u308A\u8FBC\u307F\u306B\u5931\u6557\u3057\u307E\u3057\u305F"));
    } finally {
      setIsImporting(false);
    }
  }, [importUrl, userBooks]);

  const removeBook = useCallback(async (id: string) => {
    await deleteBook(id);
    setUserBooks((prev) => {
      const next = prev.filter((b) => b.id !== id);
      if (next.length === 0) setEditMode(false);
      return next;
    });
    setSelectedBookId((prev) => (prev === id ? FIXED_BOOK_SUMMARIES[0]?.id ?? "" : prev));
  }, []);

  const generatePuzzle = useCallback(async () => {
    setIsGenerating(true);
    setNotice("");

    try {
      const body: Record<string, string> = {
        difficulty,
        bookId: selectedBookId,
      };

      if (!isFixedBook(selectedBookId)) {
        const stored = userBooks.find((b) => b.id === selectedBookId);
        if (!stored) throw new Error("\u4F5C\u54C1\u304C\u30ED\u30FC\u30AB\u30EB\u30B9\u30C8\u30EC\u30FC\u30B8\u306B\u898B\u3064\u304B\u308A\u307E\u305B\u3093");

        const encrypted = pickRandomPassage(stored, difficulty);
        if (!encrypted) throw new Error("\u3053\u306E\u96E3\u6613\u5EA6\u3067\u4F7F\u7528\u53EF\u80FD\u306A\u4E00\u7BC0\u304C\u3042\u308A\u307E\u305B\u3093");

        body.encryptedPassage = encrypted;
        body.title = stored.title;
        body.author = stored.author;
      }

      const response = await requestJson<ApiResponse<PuzzleData>>(
        "/api/puzzle/generate",
        { method: "POST", body: JSON.stringify(body) },
      );

      if (!response.success) throw new Error(response.error.message);

      const nextPuzzle = response.data;
      setPuzzle(nextPuzzle);
      setAnswerIds(nextPuzzle.fixedSegmentId ? [nextPuzzle.fixedSegmentId] : []);
      setResult(null);
      setElapsedSeconds(0);
      setStartedAtMs(Date.now());
    } catch (error) {
      showNotice(normalizeErrorMessage(error, "\u30D1\u30BA\u30EB\u751F\u6210\u306B\u5931\u6557\u3057\u307E\u3057\u305F"));
    } finally {
      setIsGenerating(false);
    }
  }, [difficulty, selectedBookId, userBooks]);

  const addSegmentToAnswer = useCallback((segmentId: string) => {
    setAnswerIds((prev) => (prev.includes(segmentId) ? prev : [...prev, segmentId]));
  }, []);

  const removeSegmentFromAnswer = useCallback(
    (index: number) => {
      if (!puzzle) return;
      const fixedId = puzzle.fixedSegmentId;
      setAnswerIds((prev) => {
        const targetId = prev[index];
        if (!targetId || (fixedId && targetId === fixedId)) return prev;
        return prev.filter((_, i) => i !== index);
      });
    },
    [puzzle],
  );

  const moveAnswerSegment = useCallback(
    (index: number, direction: "left" | "right") => {
      if (!puzzle) return;
      const fixedId = puzzle.fixedSegmentId;
      setAnswerIds((prev) => {
        const nextIndex = direction === "left" ? index - 1 : index + 1;
        if (nextIndex < 0 || nextIndex >= prev.length) return prev;
        if (fixedId && (prev[index] === fixedId || prev[nextIndex] === fixedId)) return prev;
        const next = [...prev];
        [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
        return next;
      });
    },
    [puzzle],
  );

  const resetAnswer = useCallback(() => {
    if (!puzzle) return;
    setAnswerIds(puzzle.fixedSegmentId ? [puzzle.fixedSegmentId] : []);
    setResult(null);
    setElapsedSeconds(0);
    setStartedAtMs(Date.now());
  }, [puzzle]);

  const canSubmit = Boolean(
    puzzle && !isSubmitting && !result && answerIds.length === puzzle.segments.length,
  );

  const submitAnswer = useCallback(async () => {
    if (!puzzle || !startedAtMs) return;

    setIsSubmitting(true);
    setNotice("");

    try {
      const now = new Date();
      const response = await requestJson<ApiResponse<ResultData>>("/api/puzzle/submit", {
        method: "POST",
        body: JSON.stringify({
          answer: {
            puzzleId: puzzle.id,
            userAnswer: answerIds,
            startedAt: new Date(startedAtMs).toISOString(),
            submittedAt: now.toISOString(),
            timeSpent: elapsedSeconds,
            answerToken: puzzle.answerToken,
          },
        }),
      });

      if (!response.success) throw new Error(response.error.message);
      setResult(response.data);
    } catch (error) {
      showNotice(normalizeErrorMessage(error, "\u89E3\u7B54\u9001\u4FE1\u306B\u5931\u6557\u3057\u307E\u3057\u305F"));
    } finally {
      setIsSubmitting(false);
    }
  }, [answerIds, elapsedSeconds, puzzle, startedAtMs]);

  const selectedBook = useMemo(
    () => books.find((b) => b.id === selectedBookId),
    [books, selectedBookId],
  );

  return (
  <>
    <div className="aozora-root">
      <header className="site-header">
        <div>
          <h1>青空パズル</h1>
          <p>文学作品の語順を静かに組み直す、読解トレーニング</p>
        </div>
        <button type="button" className="theme-toggle" onClick={toggleTheme}>
          {theme === "dark" ? "light" : "dark"}
        </button>
      </header>
      <hr className="divider" />

      <section className="controls">
        <div className="control-row">
          <span className="control-label">難易度</span>
          <div className="difficulty-group">
            {(Object.keys(DIFFICULTY_LABEL) as Difficulty[]).map((level) => (
              <button
                key={level}
                type="button"
                className={`btn ${difficulty === level ? "active" : ""}`}
                onClick={() => setDifficulty(level)}
                disabled={isGenerating || isSubmitting}
              >
                {DIFFICULTY_LABEL[level]}
              </button>
            ))}
          </div>
        </div>

        <div className="control-row">
          <label htmlFor="book-select" className="control-label">
            作品
          </label>
          <div className="book-select-row">
            <select
              id="book-select"
              value={selectedBookId}
              onChange={(e) => setSelectedBookId(e.target.value)}
              disabled={isGenerating || books.length === 0}
            >
              {FIXED_BOOK_SUMMARIES.length > 0 && (
                <optgroup label="固定作品">
                  {FIXED_BOOK_SUMMARIES.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.title} / {b.author}
                    </option>
                  ))}
                </optgroup>
              )}
              {userBooks.length > 0 && (
                <optgroup label="取り込み作品">
                  {userBooks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.title} / {b.author}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            {userBooks.length > 0 && (
              <button
                type="button"
                className="btn"
                onClick={() => setEditMode((prev) => !prev)}
              >
                {editMode ? "\u9589\u3058\u308B" : "\u7DE8\u96C6"}
              </button>
            )}
          </div>
        </div>

        <div className="import-row">
          <input
            type="text"
            value={importUrl}
            placeholder="https://www.aozora.gr.jp/cards/.../files/..."
            onChange={(e) => setImportUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void importBook();
              }
            }}
            disabled={isImporting}
          />
          <button
            type="button"
            className="btn"
            onClick={() => void importBook()}
            disabled={isImporting || importUrl.trim().length === 0}
          >
            {isImporting ? "\u53D6\u8FBC\u4E2D\u2026" : "\u8FFD\u52A0"}
          </button>
        </div>

        {editMode && userBooks.length > 0 && (
          <ul className="book-list">
            {userBooks.map((b) => (
              <li key={b.id} className="book-list-item">
                <span>
                  {b.title} / {b.author}
                </span>
                <button
                  type="button"
                  className="btn btn-delete"
                  onClick={() => void removeBook(b.id)}
                >
                  削除
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="action-row">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void generatePuzzle()}
            disabled={isGenerating || isSubmitting}
          >
            {isGenerating ? "生成中\u2026" : puzzle ? "次の問題" : "問題を生成"}
          </button>
        </div>
      </section>

      {puzzle ? (
        <main>
          <div className="game-status">
            <span>{DIFFICULTY_LABEL[difficulty]}</span>
            <span>{formatSeconds(elapsedSeconds)}</span>
          </div>

          <section className="work-meta">
            <h2>{puzzle.title}</h2>
            <p>{puzzle.author}</p>
            {selectedBook ? <small>選択中: {selectedBook.title}</small> : null}
          </section>
          <hr className="divider" />

          <section className="progress-section">
            <div className="progress-bar" aria-hidden="true">
              <div className="progress-fill" style={{ width: `${progressRate}%` }} />
            </div>
            <div className="stats-row">
              <span>
                {answerSegments.length}/{puzzle.segments.length} 配置
              </span>
              <span>{availableSegments.length} 残り</span>
              <span>{progressRate}%</span>
              {fixedSegment ? <span>固定: {fixedSegment.text}</span> : null}
            </div>
          </section>

          <section className="game-board">
            <div>
              <p className="section-label">
                解答欄 — {answerSegments.length}/{puzzle.segments.length}
              </p>
              <div className="answer-area">
                {answerSegments.length === 0 ? (
                  <p className="placeholder">断片をクリックして文を組み立ててください</p>
                ) : (
                  <div className="answer-flow">
                    {answerSegments.map((segment, index) => {
                      const isPinned = puzzle.fixedSegmentId === segment.id;
                      if (isPinned) {
                        return (
                          <span key={segment.id} className="fragment pinned">
                            {segment.text}
                          </span>
                        );
                      }
                      return (
                        <div key={segment.id} className="answer-chip-wrap">
                          <button
                            type="button"
                            className="fragment"
                            onClick={() => removeSegmentFromAnswer(index)}
                            disabled={Boolean(result)}
                            title="クリックで戻す"
                          >
                            {segment.text}
                          </button>
                          <div className="mini-actions">
                            <button
                              type="button"
                              onClick={() => moveAnswerSegment(index, "left")}
                              disabled={Boolean(result) || index === 0}
                              aria-label="左へ移動"
                            >
                              ←
                            </button>
                            <button
                              type="button"
                              onClick={() => moveAnswerSegment(index, "right")}
                              disabled={Boolean(result) || index === answerSegments.length - 1}
                              aria-label="右へ移動"
                            >
                              →
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="pool-area">
              <p className="section-label">断片 — {availableSegments.length}語</p>
              <div className="pool-scatter">
                {availableSegments.map((segment) => (
                  <button
                    key={segment.id}
                    type="button"
                    className="fragment"
                    onClick={() => addSegmentToAnswer(segment.id)}
                    disabled={Boolean(result)}
                  >
                    {segment.text}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <div className="game-actions">
            <button type="button" className="btn" onClick={resetAnswer} disabled={isSubmitting}>
              リセット
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={submitAnswer}
              disabled={!canSubmit}
            >
              {isSubmitting ? "送信中\u2026" : "答え合わせ"}
            </button>
          </div>

          {result ? (
            <section className={`result-card ${result.isCorrect ? "ok" : "ng"}`}>
              <h3>{result.isCorrect ? "正解" : "不正解"}</h3>
              <p>{result.feedback}</p>
              <p>
                スコア: <strong>{result.score}</strong>
                {" / "}
                正答配置: {result.correctPositions}/{result.totalSegments}
              </p>
              {result.timeBonusScore > 0 ? <p>時間ボーナス: +{result.timeBonusScore}</p> : null}
              <p className="correct-text">正解文: {result.correctText}</p>
            </section>
          ) : null}
        </main>
      ) : (
        <main className="intro-section">
          <h2>準備完了</h2>
          <p>
            難易度と作品を選び、<strong>問題を生成</strong>を押してください。
            文を正しい順に戻すことで、語順記憶と読解力を鍛えられます。
          </p>
        </main>
      )}
    </div>

    {notice && (
      <div key={noticeKey} className="toast" role="status">
        <p className="toast-text">{notice}</p>
      </div>
    )}
  </>
  );
}

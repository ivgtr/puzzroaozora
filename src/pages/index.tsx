import { useCallback, useEffect, useMemo, useState } from "react";
import type { ApiResponse, BookSummary, Difficulty, PuzzleData, ResultData } from "@/types/puzzle";

type BooksListData = {
  books: BookSummary[];
  total: number;
  hasMore: boolean;
  source: "api" | "fallback";
};

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: "入門",
  normal: "通常",
  hard: "達人",
};

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
    headers: {
      "Content-Type": "application/json",
    },
    ...init,
  });

  const json = (await response.json()) as T;
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return json;
}

function normalizeErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}

export default function Home() {
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [books, setBooks] = useState<BookSummary[]>([]);
  const [booksSource, setBooksSource] = useState<"api" | "fallback">("api");
  const [selectedBookId, setSelectedBookId] = useState<string>("");

  const [puzzle, setPuzzle] = useState<PuzzleData | null>(null);
  const [answerIds, setAnswerIds] = useState<string[]>([]);
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [result, setResult] = useState<ResultData | null>(null);

  const [isLoadingBooks, setIsLoadingBooks] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>("");

  const loadBooks = useCallback(async () => {
    setIsLoadingBooks(true);
    setErrorMessage("");
    try {
      const response = await requestJson<ApiResponse<BooksListData>>("/api/books/list?limit=30&offset=0");

      if (!response.success) {
        throw new Error(response.error.message);
      }

      setBooks(response.data.books);
      setBooksSource(response.data.source);

      setSelectedBookId((prev) => {
        if (prev || response.data.books.length === 0) {
          return prev;
        }
        return response.data.books[0].id;
      });
    } catch (error) {
      setErrorMessage(normalizeErrorMessage(error, "作品一覧の読み込みに失敗しました"));
    } finally {
      setIsLoadingBooks(false);
    }
  }, []);

  useEffect(() => {
    void loadBooks();
  }, [loadBooks]);

  useEffect(() => {
    if (!puzzle || result) {
      return;
    }

    const timerId = window.setInterval(() => {
      if (startedAtMs) {
        setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)));
      }
    }, 1000);

    return () => {
      window.clearInterval(timerId);
    };
  }, [puzzle, result, startedAtMs]);

  const segmentById = useMemo(() => {
    const map = new Map<string, PuzzleData["segments"][number]>();
    if (puzzle) {
      puzzle.segments.forEach((segment) => {
        map.set(segment.id, segment);
      });
    }
    return map;
  }, [puzzle]);

  const answerSegments = useMemo(() => {
    return answerIds
      .map((id) => segmentById.get(id))
      .filter((segment): segment is NonNullable<typeof segment> => Boolean(segment));
  }, [answerIds, segmentById]);

  const fixedSegment = useMemo(() => {
    if (!puzzle?.fixedSegmentId) {
      return null;
    }
    return segmentById.get(puzzle.fixedSegmentId) ?? null;
  }, [puzzle, segmentById]);

  const availableSegments = useMemo(() => {
    if (!puzzle) {
      return [];
    }
    const selectedIds = new Set(answerIds);
    return puzzle.shuffledSegments.filter((segment) => !selectedIds.has(segment.id));
  }, [puzzle, answerIds]);

  const progressRate = useMemo(() => {
    if (!puzzle || puzzle.segments.length === 0) {
      return 0;
    }
    return Math.round((answerSegments.length / puzzle.segments.length) * 100);
  }, [puzzle, answerSegments.length]);

  const generatePuzzle = useCallback(async () => {
    setIsGenerating(true);
    setErrorMessage("");

    try {
      const query = new URLSearchParams({
        difficulty,
      });

      if (selectedBookId) {
        query.set("bookId", selectedBookId);
      }

      const response = await requestJson<ApiResponse<PuzzleData>>(`/api/puzzle/generate?${query.toString()}`);

      if (!response.success) {
        throw new Error(response.error.message);
      }

      const nextPuzzle = response.data;
      setPuzzle(nextPuzzle);

      const initialAnswer = nextPuzzle.fixedSegmentId ? [nextPuzzle.fixedSegmentId] : [];
      setAnswerIds(initialAnswer);

      setResult(null);
      setElapsedSeconds(0);
      setStartedAtMs(Date.now());
    } catch (error) {
      setErrorMessage(normalizeErrorMessage(error, "パズル生成に失敗しました"));
    } finally {
      setIsGenerating(false);
    }
  }, [difficulty, selectedBookId]);

  const addSegmentToAnswer = useCallback((segmentId: string) => {
    setAnswerIds((prev) => {
      if (prev.includes(segmentId)) {
        return prev;
      }
      return [...prev, segmentId];
    });
  }, []);

  const removeSegmentFromAnswer = useCallback(
    (index: number) => {
      if (!puzzle) {
        return;
      }

      const fixedId = puzzle.fixedSegmentId;
      setAnswerIds((prev) => {
        const targetId = prev[index];
        if (!targetId) {
          return prev;
        }

        if (fixedId && targetId === fixedId) {
          return prev;
        }

        return prev.filter((_, itemIndex) => itemIndex !== index);
      });
    },
    [puzzle],
  );

  const moveAnswerSegment = useCallback(
    (index: number, direction: "left" | "right") => {
      if (!puzzle) {
        return;
      }

      const fixedId = puzzle.fixedSegmentId;
      setAnswerIds((prev) => {
        const nextIndex = direction === "left" ? index - 1 : index + 1;
        if (nextIndex < 0 || nextIndex >= prev.length) {
          return prev;
        }

        if (fixedId && (prev[index] === fixedId || prev[nextIndex] === fixedId)) {
          return prev;
        }

        const next = [...prev];
        [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
        return next;
      });
    },
    [puzzle],
  );

  const resetAnswer = useCallback(() => {
    if (!puzzle) {
      return;
    }

    const initialAnswer = puzzle.fixedSegmentId ? [puzzle.fixedSegmentId] : [];
    setAnswerIds(initialAnswer);
    setResult(null);
    setElapsedSeconds(0);
    setStartedAtMs(Date.now());
  }, [puzzle]);

  const canSubmit = Boolean(
    puzzle && !isSubmitting && !result && answerIds.length === puzzle.segments.length,
  );

  const submitAnswer = useCallback(async () => {
    if (!puzzle || !startedAtMs) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

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

      if (!response.success) {
        throw new Error(response.error.message);
      }

      setResult(response.data);
    } catch (error) {
      setErrorMessage(normalizeErrorMessage(error, "解答送信に失敗しました"));
    } finally {
      setIsSubmitting(false);
    }
  }, [answerIds, elapsedSeconds, puzzle, startedAtMs]);

  const selectedBook = useMemo(
    () => books.find((book) => book.id === selectedBookId),
    [books, selectedBookId],
  );

  return (
    <div className="aozora-root">
      <header className="paper-header">
        <div>
          <h1>青空パズル</h1>
          <p>文学作品の語順を静かに組み直す、読解トレーニング</p>
        </div>
      </header>

      <section className="control-panel">
        <div className="header-meta">
          <span>難易度: {DIFFICULTY_LABEL[difficulty]}</span>
          <span>経過: {formatSeconds(elapsedSeconds)}</span>
        </div>
        <hr className="section-divider" />

        <div className="control-row">
          <span className="control-label">難易度</span>
          <div className="difficulty-group">
            {(Object.keys(DIFFICULTY_LABEL) as Difficulty[]).map((level) => (
              <button
                key={level}
                type="button"
                className={`difficulty-button ${difficulty === level ? "active" : ""}`}
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
              onChange={(event) => setSelectedBookId(event.target.value)}
              disabled={isLoadingBooks || isGenerating || books.length === 0}
            >
              {books.map((book) => (
                <option key={book.id} value={book.id}>
                  {book.title} / {book.author}
                </option>
              ))}
            </select>
            <button type="button" className="secondary-button" onClick={loadBooks} disabled={isLoadingBooks}>
              {isLoadingBooks ? "読込中..." : "再読込"}
            </button>
          </div>
        </div>

        <div className="action-row">
          <button type="button" className="primary-button" onClick={generatePuzzle} disabled={isGenerating || isSubmitting}>
            {isGenerating ? "生成中..." : puzzle ? "別の問題を生成" : "問題を開始"}
          </button>
        </div>
        <p className="source-line">
          {booksSource === "fallback" ? "フォールバック作品で動作中" : "libroaozora API に接続中"}
        </p>
      </section>

      {errorMessage ? (
        <p className="error-text" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {puzzle ? (
        <main className="game-area">
          <section className="work-meta">
            <h2>{puzzle.title}</h2>
            <p>{puzzle.author}</p>
            {selectedBook ? <small>選択中: {selectedBook.title}</small> : null}
          </section>
          <hr className="section-divider" />

          <section className="rich-metrics" aria-label="パズル情報">
            <div className="panel-head">
              <h3>進行状況</h3>
              <span>{progressRate}%</span>
            </div>
            <div className="progress-meter" aria-hidden="true">
              <div className="progress-fill" style={{ width: `${progressRate}%` }} />
            </div>
            <dl className="metrics-grid">
              <div>
                <dt>全語句</dt>
                <dd>{puzzle.segments.length}</dd>
              </div>
              <div>
                <dt>配置済み</dt>
                <dd>{answerSegments.length}</dd>
              </div>
              <div>
                <dt>残り</dt>
                <dd>{availableSegments.length}</dd>
              </div>
              <div>
                <dt>固定語句</dt>
                <dd>{fixedSegment ? fixedSegment.text : "-"}</dd>
              </div>
            </dl>
          </section>
          <section className="rich-zone">
            <section className="answer-area">
              <div className="panel-head">
                <h3>解答欄</h3>
                <span>
                  {answerSegments.length}/{puzzle.segments.length}
                </span>
              </div>
              {answerSegments.length === 0 ? (
                <p className="placeholder">下の語句をクリックして並べてください。</p>
              ) : (
                <div className="chips-wrap">
                  {answerSegments.map((segment, index) => {
                    const isFixed = puzzle.fixedSegmentId === segment.id;
                    return (
                      <div key={segment.id} className="answer-chip-wrap">
                        <button
                          type="button"
                          className="segment-chip"
                          data-pos={segment.partOfSpeech}
                          onClick={() => removeSegmentFromAnswer(index)}
                          disabled={Boolean(result) || isFixed}
                          title={isFixed ? "固定済み" : "クリックで戻す"}
                        >
                          {segment.text}
                        </button>
                        <div className="mini-actions">
                          <button
                            type="button"
                            onClick={() => moveAnswerSegment(index, "left")}
                            disabled={Boolean(result) || isFixed || index === 0}
                            aria-label="左へ移動"
                          >
                            ←
                          </button>
                          <button
                            type="button"
                            onClick={() => moveAnswerSegment(index, "right")}
                            disabled={Boolean(result) || isFixed || index === answerSegments.length - 1}
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
            </section>

            <section className="pool-area">
              <div className="panel-head">
                <h3>語句プール</h3>
                <span>{availableSegments.length}語</span>
              </div>
              <p className="panel-note">語句を押すと解答欄に追加されます</p>
              <div className="chips-wrap">
                {availableSegments.map((segment) => (
                  <button
                    key={segment.id}
                    type="button"
                    className="segment-chip pool-chip"
                    data-pos={segment.partOfSpeech}
                    onClick={() => addSegmentToAnswer(segment.id)}
                    disabled={Boolean(result)}
                  >
                    <span className="chip-main">{segment.text}</span>
                    <small className="chip-sub">{segment.partOfSpeech}</small>
                  </button>
                ))}
              </div>
            </section>
          </section>

          <section className="game-actions">
            <button type="button" className="secondary-button" onClick={resetAnswer} disabled={isSubmitting}>
              配置をリセット
            </button>
            <button type="button" className="primary-button" onClick={submitAnswer} disabled={!canSubmit}>
              {isSubmitting ? "送信中..." : "答え合わせ"}
            </button>
          </section>

          {result ? (
            <section className={`result-card ${result.isCorrect ? "ok" : "ng"}`}>
              <h3>{result.isCorrect ? "正解" : "不正解"}</h3>
              <p>{result.feedback}</p>
              <p>
                スコア: <strong>{result.score}</strong>
                {" / "}
                正答配置: {result.correctPositions} / {result.totalSegments}
              </p>
              {result.timeBonusScore > 0 ? <p>時間ボーナス: +{result.timeBonusScore}</p> : null}
              <p className="correct-text">正解文: {result.correctText}</p>
            </section>
          ) : null}
        </main>
      ) : (
        <main className="intro-card">
          <h2>準備完了</h2>
          <p>
            難易度と作品を選び、<strong>問題を開始</strong>を押してください。
            文を正しい順に戻すことで、語順記憶と読解力を鍛えられます。
          </p>
        </main>
      )}
    </div>
  );
}

import { useEffect } from "react";
import { useRouter } from "next/router";
import { useGameContext } from "@/contexts/GameContext";
import { usePuzzleGenerator } from "@/hooks/usePuzzleGenerator";
import { PageShell } from "@/components/layout/PageShell";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

export default function ResultPage() {
  const router = useRouter();
  const { state, dispatch } = useGameContext();
  const { generatePuzzle, isGenerating } = usePuzzleGenerator();
  const { result } = state;

  useEffect(() => {
    if (state.status === "idle") {
      void router.replace("/");
    }
  }, [state.status, router]);

  if (!result) return null;

  const handleRetry = () => {
    void generatePuzzle();
  };

  const handleReturn = () => {
    dispatch({ type: "RETURN_TO_SETUP" });
    void router.push("/");
  };

  return (
    <PageShell>
      <div className="result-root">
        <div className="result-header">
          <ThemeToggle />
        </div>

        <div className="result-body">
          <h1 className="result-verdict">
            {result.isCorrect ? "\u6B63\u89E3" : "\u4E0D\u6B63\u89E3"}
          </h1>
          <p className="result-feedback">{result.feedback}</p>

          <div className="result-scores">
            <div className="result-score-main">
              <span className="result-score-label">スコア</span>
              <span className="result-score-value">{result.score}</span>
            </div>
            <div className="result-score-details">
              <span>
                正答配置: {result.correctPositions}/{result.totalSegments}
              </span>
              {result.timeBonusScore > 0 && (
                <span>時間ボーナス: +{result.timeBonusScore}</span>
              )}
            </div>
          </div>

          <div className="result-correct-text">
            <p className="section-label">正解文</p>
            <p>{result.correctText}</p>
          </div>
        </div>

        <div className="result-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleRetry}
            disabled={isGenerating}
          >
            {isGenerating ? "\u751F\u6210\u4E2D\u2026" : "\u3082\u3046\u4E00\u56DE"}
          </button>
          <button type="button" className="btn" onClick={handleReturn}>
            タイトルに戻る
          </button>
        </div>
      </div>
    </PageShell>
  );
}

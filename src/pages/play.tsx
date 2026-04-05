import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useGameContext } from "@/contexts/GameContext";
import { usePuzzleGame } from "@/hooks/usePuzzleGame";
import { usePuzzleSubmit } from "@/hooks/usePuzzleSubmit";
import { PageShell } from "@/components/layout/PageShell";
import { GameHeader } from "@/components/play/GameHeader";
import { ProgressBar } from "@/components/play/ProgressBar";
import { AnswerArea } from "@/components/play/AnswerArea";
import { FragmentPool } from "@/components/play/FragmentPool";
import { GameActions } from "@/components/play/GameActions";

export default function PlayPage() {
  const router = useRouter();
  const { state, dispatch } = useGameContext();
  const game = usePuzzleGame();
  const { submitAnswer, isSubmitting } = usePuzzleSubmit();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (state.status !== "playing" && state.status !== "submitting") {
      void router.replace(state.status === "done" ? "/result" : "/");
    }
  }, [state.status, router]);

  useEffect(() => {
    if (!state.startedAtMs || state.result) return;
    const timerId = window.setInterval(() => {
      const started = state.startedAtMs;
      if (started === null) return;
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - started) / 1000)));
    }, 1000);
    return () => window.clearInterval(timerId);
  }, [state.startedAtMs, state.result]);

  if (!state.puzzle) return null;

  const handleReturn = () => {
    if (window.confirm("\u73FE\u5728\u306E\u30B2\u30FC\u30E0\u304C\u7834\u68C4\u3055\u308C\u307E\u3059\u3002\u30BF\u30A4\u30C8\u30EB\u306B\u623B\u308A\u307E\u3059\u304B\uFF1F")) {
      dispatch({ type: "RETURN_TO_SETUP" });
      void router.push("/");
    }
  };

  return (
    <PageShell>
      <GameHeader
        difficulty={state.difficulty}
        elapsedSeconds={elapsedSeconds}
        onReturn={handleReturn}
      />

      <section className="work-meta">
        <h2>{state.puzzle.title}</h2>
        <p>{state.puzzle.author}</p>
      </section>
      <hr className="divider" />

      <ProgressBar
        answerCount={game.answerSegments.length}
        totalCount={state.puzzle.segments.length}
        availableCount={game.availableSegments.length}
        progressRate={game.progressRate}
        fixedSegmentText={game.fixedSegment?.text}
      />

      <section className="game-board">
        <AnswerArea
          segments={game.answerSegments}
          fixedSegmentId={state.puzzle.fixedSegmentId}
          totalCount={state.puzzle.segments.length}
          onRemove={game.removeSegment}
          onMove={game.moveSegment}
          disabled={game.hasResult}
        />
        <FragmentPool
          segments={game.availableSegments}
          onSelect={game.addSegment}
          disabled={game.hasResult}
        />
      </section>

      <GameActions
        canSubmit={game.canSubmit}
        onReset={game.resetAnswer}
        onSubmit={() => void submitAnswer()}
        isSubmitting={isSubmitting}
      />
    </PageShell>
  );
}

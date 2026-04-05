import { useMemo } from "react";
import { useGameContext } from "@/contexts/GameContext";
import type { PuzzleData } from "@/types/puzzle";

export function usePuzzleGame() {
  const { state, dispatch } = useGameContext();
  const { puzzle, answerIds, result } = state;

  const segmentById = useMemo(() => {
    const map = new Map<string, PuzzleData["segments"][number]>();
    if (puzzle) {
      for (const seg of puzzle.segments) map.set(seg.id, seg);
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

  const canSubmit = Boolean(
    puzzle && state.status === "playing" && !result && answerIds.length === puzzle.segments.length,
  );

  const addSegment = (segmentId: string) => {
    dispatch({ type: "ADD_SEGMENT", payload: segmentId });
  };

  const removeSegment = (index: number) => {
    dispatch({ type: "REMOVE_SEGMENT", payload: index });
  };

  const moveSegment = (index: number, direction: "left" | "right") => {
    dispatch({ type: "MOVE_SEGMENT", payload: { index, direction } });
  };

  const resetAnswer = () => {
    dispatch({ type: "RESET_ANSWER" });
  };

  return {
    puzzle,
    answerIds,
    answerSegments,
    fixedSegment,
    availableSegments,
    progressRate,
    canSubmit,
    hasResult: Boolean(result),
    addSegment,
    removeSegment,
    moveSegment,
    resetAnswer,
  };
}

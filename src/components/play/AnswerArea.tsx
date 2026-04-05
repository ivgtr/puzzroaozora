import type { PuzzleSegment } from "@/types/puzzle";

interface AnswerAreaProps {
  segments: PuzzleSegment[];
  fixedSegmentId?: string;
  totalCount: number;
  onRemove: (index: number) => void;
  onMove: (index: number, direction: "left" | "right") => void;
  disabled: boolean;
}

export function AnswerArea({
  segments,
  fixedSegmentId,
  totalCount,
  onRemove,
  onMove,
  disabled,
}: AnswerAreaProps) {
  return (
    <div>
      <p className="section-label">
        解答欄 &mdash; {segments.length}/{totalCount}
      </p>
      <div className="answer-area">
        {segments.length === 0 ? (
          <p className="placeholder">断片をクリックして文を組み立ててください</p>
        ) : (
          <div className="answer-flow">
            {segments.map((segment, index) => {
              const isPinned = fixedSegmentId === segment.id;
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
                    onClick={() => onRemove(index)}
                    disabled={disabled}
                    title="クリックで戻す"
                  >
                    {segment.text}
                  </button>
                  <div className="mini-actions">
                    <button
                      type="button"
                      onClick={() => onMove(index, "left")}
                      disabled={disabled || index === 0}
                      aria-label="左へ移動"
                    >
                      &larr;
                    </button>
                    <button
                      type="button"
                      onClick={() => onMove(index, "right")}
                      disabled={disabled || index === segments.length - 1}
                      aria-label="右へ移動"
                    >
                      &rarr;
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

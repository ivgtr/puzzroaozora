import type { PuzzleSegment } from "@/types/puzzle";

interface FragmentPoolProps {
  segments: PuzzleSegment[];
  onSelect: (id: string) => void;
  disabled: boolean;
}

export function FragmentPool({ segments, onSelect, disabled }: FragmentPoolProps) {
  return (
    <div className="pool-area">
      <p className="section-label">断片 &mdash; {segments.length}語</p>
      <div className="pool-scatter">
        {segments.map((segment) => (
          <button
            key={segment.id}
            type="button"
            className="fragment"
            onClick={() => onSelect(segment.id)}
            disabled={disabled}
          >
            {segment.text}
          </button>
        ))}
      </div>
    </div>
  );
}

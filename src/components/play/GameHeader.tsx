import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { DIFFICULTY_LABEL, formatSeconds } from "@/lib/utils";
import type { Difficulty } from "@/types/puzzle";

interface GameHeaderProps {
  difficulty: Difficulty;
  elapsedSeconds: number;
  onReturn: () => void;
}

export function GameHeader({ difficulty, elapsedSeconds, onReturn }: GameHeaderProps) {
  return (
    <header className="play-header">
      <button type="button" className="btn btn-back" onClick={onReturn}>
        &larr; 戻る
      </button>
      <div className="play-header-info">
        <span>{DIFFICULTY_LABEL[difficulty]}</span>
        <span>{formatSeconds(elapsedSeconds)}</span>
      </div>
      <ThemeToggle />
    </header>
  );
}

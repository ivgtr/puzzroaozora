import { useGameContext } from "@/contexts/GameContext";
import { DIFFICULTY_LABEL } from "@/lib/utils";
import type { Difficulty } from "@/types/puzzle";

export function DifficultySelector({ disabled }: { disabled?: boolean }) {
  const { state, dispatch } = useGameContext();

  return (
    <div className="control-row">
      <span className="control-label">難易度</span>
      <div className="difficulty-group">
        {(Object.keys(DIFFICULTY_LABEL) as Difficulty[]).map((level) => (
          <button
            key={level}
            type="button"
            className={`btn ${state.difficulty === level ? "active" : ""}`}
            onClick={() => dispatch({ type: "SET_DIFFICULTY", payload: level })}
            disabled={disabled}
          >
            {DIFFICULTY_LABEL[level]}
          </button>
        ))}
      </div>
    </div>
  );
}

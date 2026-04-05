import { useGameContext } from "@/contexts/GameContext";
import { FIXED_BOOK_SUMMARIES } from "@/data/fixedBooks";

interface BookSelectorProps {
  disabled?: boolean;
  editMode: boolean;
  onToggleEdit: () => void;
}

export function BookSelector({ disabled, editMode, onToggleEdit }: BookSelectorProps) {
  const { state, dispatch } = useGameContext();

  return (
    <div className="control-row">
      <label htmlFor="book-select" className="control-label">
        作品
      </label>
      <div className="book-select-row">
        <select
          id="book-select"
          value={state.selectedBookId}
          onChange={(e) => dispatch({ type: "SET_SELECTED_BOOK", payload: e.target.value })}
          disabled={disabled}
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
          {state.userBooks.length > 0 && (
            <optgroup label="取り込み作品">
              {state.userBooks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title} / {b.author}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        {state.userBooks.length > 0 && (
          <button type="button" className="btn" onClick={onToggleEdit}>
            {editMode ? "\u9589\u3058\u308B" : "\u7DE8\u96C6"}
          </button>
        )}
      </div>
    </div>
  );
}

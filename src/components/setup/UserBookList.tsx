import { useGameContext } from "@/contexts/GameContext";
import { deleteBook } from "@/lib/store/bookStore";

export function UserBookList() {
  const { state, dispatch } = useGameContext();

  const handleRemove = async (id: string) => {
    await deleteBook(id);
    dispatch({ type: "REMOVE_USER_BOOK", payload: id });
  };

  if (state.userBooks.length === 0) return null;

  return (
    <ul className="book-list">
      {state.userBooks.map((b) => (
        <li key={b.id} className="book-list-item">
          <span>
            {b.title} / {b.author}
          </span>
          <button
            type="button"
            className="btn btn-delete"
            onClick={() => void handleRemove(b.id)}
          >
            削除
          </button>
        </li>
      ))}
    </ul>
  );
}

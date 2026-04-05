import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  type Dispatch,
  type ReactNode,
} from "react";
import { FIXED_BOOK_SUMMARIES } from "@/data/fixedBooks";
import { getAllBooks, type StoredBook } from "@/lib/store/bookStore";
import type { Difficulty, PuzzleData, ResultData } from "@/types/puzzle";

export interface GameState {
  difficulty: Difficulty;
  selectedBookId: string;
  userBooks: StoredBook[];
  puzzle: PuzzleData | null;
  answerIds: string[];
  startedAtMs: number | null;
  result: ResultData | null;
  status: "idle" | "generating" | "playing" | "submitting" | "done";
  lastOriginalText: string | null;
  lastEncryptedPassage: string | null;
}

export type GameAction =
  | { type: "SET_DIFFICULTY"; payload: Difficulty }
  | { type: "SET_SELECTED_BOOK"; payload: string }
  | { type: "SET_USER_BOOKS"; payload: StoredBook[] }
  | { type: "ADD_USER_BOOK"; payload: StoredBook }
  | { type: "REMOVE_USER_BOOK"; payload: string }
  | { type: "START_GENERATING" }
  | { type: "PUZZLE_READY"; payload: PuzzleData; encryptedPassage?: string }
  | { type: "GENERATION_FAILED" }
  | { type: "ADD_SEGMENT"; payload: string }
  | { type: "REMOVE_SEGMENT"; payload: number }
  | { type: "MOVE_SEGMENT"; payload: { index: number; direction: "left" | "right" } }
  | { type: "RESET_ANSWER" }
  | { type: "START_SUBMITTING" }
  | { type: "SUBMIT_SUCCESS"; payload: ResultData }
  | { type: "SUBMIT_FAILED" }
  | { type: "RETURN_TO_SETUP" };

const initialState: GameState = {
  difficulty: "easy",
  selectedBookId: FIXED_BOOK_SUMMARIES[0]?.id ?? "",
  userBooks: [],
  puzzle: null,
  answerIds: [],
  startedAtMs: null,
  result: null,
  status: "idle",
  lastOriginalText: null,
  lastEncryptedPassage: null,
};

function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "SET_DIFFICULTY":
      return { ...state, difficulty: action.payload };

    case "SET_SELECTED_BOOK":
      return { ...state, selectedBookId: action.payload };

    case "SET_USER_BOOKS":
      return { ...state, userBooks: action.payload };

    case "ADD_USER_BOOK":
      return { ...state, userBooks: [...state.userBooks, action.payload] };

    case "REMOVE_USER_BOOK": {
      const next = state.userBooks.filter((b) => b.id !== action.payload);
      return {
        ...state,
        userBooks: next,
        selectedBookId:
          state.selectedBookId === action.payload
            ? (FIXED_BOOK_SUMMARIES[0]?.id ?? "")
            : state.selectedBookId,
      };
    }

    case "START_GENERATING":
      return { ...state, status: "generating" };

    case "PUZZLE_READY": {
      const puzzle = action.payload;
      return {
        ...state,
        puzzle,
        answerIds: puzzle.fixedSegmentId ? [puzzle.fixedSegmentId] : [],
        startedAtMs: Date.now(),
        result: null,
        status: "playing",
        lastOriginalText: puzzle.originalText,
        lastEncryptedPassage: action.encryptedPassage ?? null,
      };
    }

    case "GENERATION_FAILED":
      return { ...state, status: state.puzzle ? "playing" : "idle" };

    case "ADD_SEGMENT":
      if (state.answerIds.includes(action.payload)) return state;
      return { ...state, answerIds: [...state.answerIds, action.payload] };

    case "REMOVE_SEGMENT": {
      if (!state.puzzle) return state;
      const targetId = state.answerIds[action.payload];
      if (!targetId || targetId === state.puzzle.fixedSegmentId) return state;
      return {
        ...state,
        answerIds: state.answerIds.filter((_, i) => i !== action.payload),
      };
    }

    case "MOVE_SEGMENT": {
      if (!state.puzzle) return state;
      const { index, direction } = action.payload;
      const fixedId = state.puzzle.fixedSegmentId;
      const nextIndex = direction === "left" ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= state.answerIds.length) return state;
      if (fixedId && (state.answerIds[index] === fixedId || state.answerIds[nextIndex] === fixedId))
        return state;
      const next = [...state.answerIds];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return { ...state, answerIds: next };
    }

    case "RESET_ANSWER": {
      if (!state.puzzle) return state;
      return {
        ...state,
        answerIds: state.puzzle.fixedSegmentId ? [state.puzzle.fixedSegmentId] : [],
        result: null,
        startedAtMs: Date.now(),
      };
    }

    case "START_SUBMITTING":
      return { ...state, status: "submitting" };

    case "SUBMIT_SUCCESS":
      return { ...state, result: action.payload, status: "done" };

    case "SUBMIT_FAILED":
      return { ...state, status: "playing" };

    case "RETURN_TO_SETUP":
      return {
        ...state,
        puzzle: null,
        answerIds: [],
        startedAtMs: null,
        result: null,
        status: "idle",
      };

    default:
      return state;
  }
}

interface GameContextValue {
  state: GameState;
  dispatch: Dispatch<GameAction>;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, initialState);

  useEffect(() => {
    void getAllBooks().then((books) => {
      dispatch({ type: "SET_USER_BOOKS", payload: books });
    });
  }, []);

  return <GameContext value={{ state, dispatch }}>{children}</GameContext>;
}

export function useGameContext(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGameContext must be used within GameProvider");
  return ctx;
}

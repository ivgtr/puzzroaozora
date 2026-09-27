export type Difficulty = "easy" | "normal" | "hard";

export type PartOfSpeech =
  | "名詞"
  | "動詞"
  | "形容詞"
  | "助詞"
  | "助動詞"
  | "副詞"
  | "接続詞"
  | "感動詞"
  | "記号"
  | "その他";

export interface PuzzleSegment {
  id: string;
  text: string;
  position: number;
  partOfSpeech: PartOfSpeech;
  reading?: string;
}

export interface PuzzleData {
  id: string;
  bookId: string;
  title: string;
  author: string;
  originalText: string;
  segments: PuzzleSegment[];
  shuffledSegments: PuzzleSegment[];
  difficulty: Difficulty;
  textLength: number;
  createdAt: string;
}

export interface BookSummary {
  id: string;
  title: string;
  author: string;
  kanaType: string;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

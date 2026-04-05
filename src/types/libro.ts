export type LibroPersonRef = {
  id: string;
  role: "author" | "translator" | "editor" | "reviser";
  lastName: string;
  firstName: string;
  lastNameReading: string;
  firstNameReading: string;
};

export type LibroWork = {
  id: string;
  title: string;
  titleReading: string;
  subtitle?: string;
  authors: LibroPersonRef[];
  ndc?: string;
  firstSentence?: string;
  publishedAt: string;
  updatedAt: string;
  copyrightFlag: boolean;
  orthography?: string;
};

export type LibroSearchResult<T> = {
  total: number;
  page: number;
  perPage: number;
  items: T[];
};

export type LibroWorkContent = {
  workId: string;
  format: "plain" | "raw";
  content: string;
};

export type Difficulty = "easy" | "normal" | "hard";

const characters = new Intl.Segmenter("ja", { granularity: "grapheme" });

export function graphemes(text: string): string[] {
  return Array.from(characters.segment(text), ({ segment }) => segment);
}

// Paragraph indentation and line breaks belong to the manuscript, not its joins.
// No NFKC, spelling conversion, punctuation removal, or arbitrary whitespace collapse.
export function comparisonText(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/(^|\n)[ \u3000]+/g, "$1").replace(/\n/g, "");
}

export interface Passage {
  id: string;
  workId: string;
  title: string;
  author: string;
  sourceUrl: string;
  location: string;
  original: string;
  fragments: string[];
  note: string;
  difficulty: Difficulty;
}

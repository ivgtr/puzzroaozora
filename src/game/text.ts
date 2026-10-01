export type Difficulty = "easy" | "normal" | "hard";

export const RULES = {
  easy: { label: "Easy", threshold: 2, min: 100, max: 160, pieces: [10, 14] },
  normal: { label: "Normal", threshold: 3, min: 160, max: 240, pieces: [16, 22] },
  hard: { label: "Hard", threshold: 4, min: 220, max: 320, pieces: [22, 30] },
} as const;

const characters = new Intl.Segmenter("ja", { granularity: "grapheme" });
const words = new Intl.Segmenter("ja", { granularity: "word" });
const sentences = new Intl.Segmenter("ja", { granularity: "sentence" });

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

export function splitPassage(original: string, difficulty: Difficulty): string[] {
  const text = comparisonText(original);
  const rule = RULES[difficulty];
  const target = Math.max(5, Math.floor(graphemes(text).length / ((rule.pieces[0] + rule.pieces[1]) / 2)));
  const tokens = Array.from(words.segment(text), ({ segment }) => segment);
  const result: string[] = [];
  let chunk = "";
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    chunk += token;
    const length = graphemes(chunk).length;
    const next = tokens[i + 1];
    const nextIsPunctuation = next !== undefined && /^[、。，．！？!?」』）】…ー]+$/u.test(next);
    const naturalEnd = /[、。！？!?」』]$/u.test(token) || /^(は|が|を|に|へ|で|と|から|まで|より|ので|ながら|けれども)$/u.test(token);
    if (!nextIsPunctuation && !/[「『（【]$/u.test(chunk) && ((length >= target && naturalEnd) || length >= target + 4)) {
      result.push(chunk);
      chunk = "";
    }
  }
  if (chunk) {
    if (result.length && graphemes(chunk).length < 4) result[result.length - 1] += chunk;
    else result.push(chunk);
  }
  if (result.join("") !== text) throw new Error("分割で原文が変化しました。");
  if (result.length < rule.pieces[0] || result.length > rule.pieces[1] || result.some((piece) => graphemes(piece).length < 3 || graphemes(piece).length > 28)) {
    throw new Error("意味のまとまりを保ったまま、この難易度の紙片数に分けられません。");
  }
  return result;
}

function balanced(text: string): boolean {
  const pairs: Record<string, string> = { "「": "」", "『": "』", "（": "）", "【": "】" };
  const stack: string[] = [];
  for (const char of text) {
    if (pairs[char]) stack.push(pairs[char]);
    else if (Object.values(pairs).includes(char) && stack.pop() !== char) return false;
  }
  return stack.length === 0;
}

export function extractPassages(text: string, difficulty: Difficulty): Array<{ original: string; fragments: string[]; location: string }> {
  const rule = RULES[difficulty];
  const units = Array.from(sentences.segment(text), ({ segment }) => segment).slice(0, 600);
  const found: Array<{ original: string; fragments: string[]; location: string }> = [];
  const seen = new Set<string>();
  for (let start = 0; start < units.length && found.length < 8; start++) {
    let original = "";
    for (let end = start; end < units.length; end++) {
      original += units[end];
      const canonical = comparisonText(original.trim());
      const length = graphemes(canonical).length;
      if (length > rule.max) break;
      if (length < rule.min || !balanced(canonical) || seen.has(canonical) || !/[。！？!?」』]$/u.test(canonical)) continue;
      // A rejected candidate is skipped; text is never cut in the middle of a word.
      let fragments: string[];
      try { fragments = splitPassage(original.trim(), difficulty); }
      catch { continue; }
      found.push({ original: original.trim(), fragments, location: `本文の第${start + 1}文〜第${end + 1}文（整形後）` });
      seen.add(canonical);
      break;
    }
  }
  return found;
}

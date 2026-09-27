/** The only comparison normalization: display line breaks and canonical Unicode. */
export const comparisonText = (text: string) => text.replace(/\r\n?|\n/g, "").normalize("NFC");

export type Difficulty = "easy" | "normal";
export type Piece = Readonly<{ id: string; text: string }>;
export type Chain = Readonly<{
  id: string;
  pieces: readonly string[];
  /** Boundary i joins pieces[i] and pieces[i + 1]. */
  confirmed: readonly boolean[];
}>;
export type Puzzle = Readonly<{
  title: string;
  author: string;
  originalText: string;
  pieces: readonly Piece[];
  source?: string;
}>;
export type Phase = "reading" | "assembling" | "complete";
export type Command =
  | { type: "begin" }
  | { type: "join"; moving: string; target: string; end: "before" | "after" }
  | { type: "split"; chain: string; boundary: number };
export type Change = Readonly<{
  kind: "begin" | "join" | "split";
  added: readonly string[];
  removed: readonly string[];
  confirmed: boolean;
  completed: boolean;
}>;

function occurrences(original: string, text: string): bigint[] {
  const masks: bigint[] = [];
  for (let start = original.indexOf(text); start !== -1; start = original.indexOf(text, start + 1)) {
    masks.push(((1n << BigInt(text.length)) - 1n) << BigInt(start));
  }
  return masks;
}

/** Existence only: never pin an ambiguous block to its first occurrence. */
export function canPlaceTogether(original: string, blocks: readonly string[]): boolean {
  if (blocks.reduce((sum, text) => sum + text.length, 0) > original.length) return false;
  const candidates = blocks.map((text) => occurrences(original, text)).sort((a, b) => a.length - b.length);
  if (candidates.some((masks) => masks.length === 0)) return false;
  const failed = new Set<string>();
  const place = (index: number, occupied: bigint): boolean => {
    if (index === candidates.length) return true;
    const key = `${index}:${occupied}`;
    if (failed.has(key)) return false;
    for (const mask of candidates[index]) {
      if ((occupied & mask) === 0n && place(index + 1, occupied | mask)) return true;
    }
    failed.add(key);
    return false;
  };
  return place(0, 0n);
}

export class PuzzleSession {
  private readonly pieces: ReadonlyMap<string, Piece>;
  private readonly original: string;
  private currentChains: Chain[];
  private currentPhase: Phase = "reading";

  constructor(readonly puzzle: Puzzle, readonly difficulty: Difficulty) {
    this.pieces = new Map(puzzle.pieces.map((piece) => [piece.id, piece]));
    this.original = comparisonText(puzzle.originalText);
    if (this.pieces.size !== puzzle.pieces.length || puzzle.pieces.length < 2 ||
        puzzle.pieces.some((piece) => !piece.id || !comparisonText(piece.text)) ||
        comparisonText(puzzle.pieces.map((piece) => piece.text).join("")) !== this.original) {
      throw new Error("原文と紙片の構成が一致しません。この問題は開始できません。");
    }
    this.currentChains = puzzle.pieces.map(({ id }) => ({ id, pieces: [id], confirmed: [] }));
  }

  get phase(): Phase { return this.currentPhase; }
  get chains(): readonly Chain[] { return this.currentChains; }
  text(chain: Chain): string { return chain.pieces.map((id) => this.pieces.get(id)!.text).join(""); }
  piece(id: string): Piece { const piece = this.pieces.get(id); if (!piece) throw new Error("Unknown piece"); return piece; }

  private blocks(chain: Chain): string[] {
    const blocks: string[] = [];
    let start = 0;
    for (let i = 0; i < chain.pieces.length; i++) {
      if (chain.confirmed[i]) continue;
      if (i > start) blocks.push(comparisonText(chain.pieces.slice(start, i + 1).map((id) => this.piece(id).text).join("")));
      start = i + 1;
    }
    return blocks;
  }

  dispatch(command: Command): Change | null {
    if (command.type === "begin") {
      if (this.currentPhase !== "reading") return null;
      this.currentPhase = "assembling";
      return { kind: "begin", added: this.currentChains.map((chain) => chain.id), removed: [], confirmed: false, completed: false };
    }
    if (this.currentPhase !== "assembling") return null;
    if (command.type === "split") {
      const chain = this.currentChains.find((item) => item.id === command.chain);
      const boundary = command.boundary;
      if (!chain || !Number.isInteger(boundary) || boundary < 0 || boundary >= chain.confirmed.length || chain.confirmed[boundary]) return null;
      const left: Chain = { id: chain.id, pieces: chain.pieces.slice(0, boundary + 1), confirmed: chain.confirmed.slice(0, boundary) };
      const right: Chain = { id: chain.pieces[boundary + 1], pieces: chain.pieces.slice(boundary + 1), confirmed: chain.confirmed.slice(boundary + 1) };
      this.currentChains = this.currentChains.flatMap((item) => item.id === chain.id ? [left, right] : [item]);
      return { kind: "split", added: [left.id, right.id], removed: [chain.id], confirmed: false, completed: false };
    }
    if (command.moving === command.target) return null;
    const moving = this.currentChains.find((item) => item.id === command.moving);
    const target = this.currentChains.find((item) => item.id === command.target);
    if (!moving || !target) return null;
    const [left, right] = command.end === "before" ? [moving, target] : [target, moving];
    const pieces = [...left.pieces, ...right.pieces];
    const previous = [...left.confirmed, false, ...right.confirmed];
    const rest = this.currentChains.filter((item) => item !== moving && item !== target);
    const text = comparisonText(pieces.map((id) => this.piece(id).text).join(""));
    const eligible = previous.some(Boolean) || pieces.length >= (this.difficulty === "easy" ? 2 : 3) || pieces.length === this.pieces.size;
    const confirmed = eligible && canPlaceTogether(this.original, [text, ...rest.flatMap((chain) => this.blocks(chain))]);
    const chain: Chain = { id: target.id, pieces, confirmed: confirmed ? previous.map(() => true) : previous };
    this.currentChains = [...rest, chain];
    const completed = pieces.length === this.pieces.size && text === this.original;
    if (completed) this.currentPhase = "complete";
    return { kind: "join", added: [chain.id], removed: [moving.id, target.id], confirmed, completed };
  }
}

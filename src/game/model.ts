import { comparisonText, RULES, type Difficulty, type Passage } from "./text.ts";

export interface Tile { readonly id: string; readonly text: string }
export interface Problem extends Omit<Passage, "fragments"> { readonly tiles: readonly Tile[]; readonly difficulty: Difficulty; readonly version: 2 }
export interface Point { x: number; y: number }
export interface Chain extends Point { readonly id: string; readonly tiles: readonly string[]; readonly bonds: readonly boolean[] }
export interface DeskState { readonly phase: "reading" | "assembling" | "complete"; readonly chains: readonly Chain[] }
export type JoinEvent = "none" | "move" | "split" | "tentative" | "new" | "extend" | "bridge" | "complete" | "undo";
export type Command = { type: "join"; source: string; target: string; side: "before" | "after" } | { type: "split"; chain: string; boundary: number } | { type: "move"; chain: string; point: Point } | { type: "undo" };

export function makeProblem(passage: Passage, difficulty: Difficulty = passage.difficulty, random: () => number = Math.random): Problem {
  if (passage.fragments.join("") !== comparisonText(passage.original)) throw new Error("紙片と原文が一致しません。");
  if (passage.fragments.length < RULES[difficulty].threshold || passage.fragments.length > 30 || passage.fragments.some((text) => !text)) throw new Error("紙片数が不正です。");
  const tiles = passage.fragments.map((text) => ({ id: crypto.randomUUID(), text }));
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  const { fragments: _fragments, ...metadata } = passage;
  void _fragments;
  return { ...metadata, version: 2, difficulty, tiles };
}

// Confirmed blocks must still admit a complete reconstruction. Group identical
// strings, retain every possible occurrence, and memoize only failed placements.
// This avoids greedy occurrence assignment and conflicting repeated-word locks.
export function canReconstruct(original: string, blocks: readonly string[]): boolean {
  const counts = new Map<string, number>();
  for (const block of blocks) {
    if (!block) return false;
    counts.set(block, (counts.get(block) ?? 0) + 1);
  }
  const texts = [...counts.keys()].sort((a, b) => b.length - a.length);
  const remaining = texts.map((text) => counts.get(text)!);
  const failed = new Set<string>();
  function visit(offset: number): boolean {
    if (offset === original.length) return remaining.every((n) => n === 0);
    const key = `${offset}:${remaining.join(",")}`;
    if (failed.has(key)) return false;
    for (let i = 0; i < texts.length; i++) {
      if (!remaining[i] || !original.startsWith(texts[i], offset)) continue;
      remaining[i]--;
      if (visit(offset + texts[i].length)) { remaining[i]++; return true; }
      remaining[i]++;
    }
    failed.add(key);
    return false;
  }
  return visit(0);
}

export class Session {
  readonly problem: Problem;
  private readonly tileText: Map<string, string>;
  private current: DeskState = { phase: "reading", chains: [] };
  private history: DeskState[] = [];

  constructor(problem: Problem) {
    this.problem = problem;
    this.tileText = new Map(problem.tiles.map((tile) => [tile.id, tile.text]));
    if (this.tileText.size !== problem.tiles.length || problem.tiles.length < RULES[problem.difficulty].threshold || !canReconstruct(comparisonText(problem.original), problem.tiles.map((tile) => tile.text))) throw new Error("問題の紙片が不正です。");
  }
  get state(): DeskState { return this.current; }
  get canUndo(): boolean { return this.history.length > 0; }
  text(chain: Chain): string { return chain.tiles.map((id) => this.tileText.get(id)!).join(""); }

  begin(positions: readonly Point[]): void {
    if (this.current.phase !== "reading" || positions.length !== this.problem.tiles.length || positions.some(({ x, y }) => !Number.isFinite(x) || !Number.isFinite(y))) throw new Error("開始状態が不正です。");
    this.current = { phase: "assembling", chains: this.problem.tiles.map((tile, i) => ({ id: tile.id, tiles: [tile.id], bonds: [], ...positions[i] })) };
    this.history = [];
  }
  private commit(next: DeskState): void {
    this.history.push(this.current);
    if (this.history.length > 64) this.history.shift();
    this.current = next;
  }
  private blocks(chains: readonly Chain[]): string[] {
    return chains.flatMap((chain) => {
      const blocks: string[] = [];
      let text = "";
      chain.tiles.forEach((id, index) => {
        text += this.tileText.get(id)!;
        if (!chain.bonds[index]) { blocks.push(text); text = ""; }
      });
      return blocks;
    });
  }

  dispatch(command: Command): JoinEvent {
    if (command.type === "undo") {
      const previous = this.history.pop();
      if (!previous) return "none";
      this.current = previous;
      return "undo";
    }
    if (this.current.phase !== "assembling") return "none";
    const chains = this.current.chains;
    if (command.type === "move") {
      const chain = chains.find((c) => c.id === command.chain);
      const { x, y } = command.point;
      if (!chain || !Number.isFinite(x) || !Number.isFinite(y) || (chain.x === x && chain.y === y)) return "none";
      this.commit({ ...this.current, chains: chains.map((c) => c === chain ? { ...c, x, y } : c) });
      return "move";
    }
    if (command.type === "split") {
      const chain = chains.find((c) => c.id === command.chain);
      const at = command.boundary;
      if (!chain || !Number.isInteger(at) || at < 0 || at >= chain.bonds.length || chain.bonds[at]) return "none";
      const leftTiles = chain.tiles.slice(0, at + 1);
      const rightTiles = chain.tiles.slice(at + 1);
      const left: Chain = { ...chain, id: leftTiles[0], tiles: leftTiles, bonds: chain.bonds.slice(0, at) };
      const right: Chain = { id: rightTiles[0], tiles: rightTiles, bonds: chain.bonds.slice(at + 1), x: chain.x + 56, y: chain.y + 70 };
      this.commit({ phase: "assembling", chains: chains.flatMap((c) => c === chain ? [left, right] : [c]) });
      return "split";
    }
    if (command.source === command.target) return "none";
    const source = chains.find((c) => c.id === command.source);
    const target = chains.find((c) => c.id === command.target);
    if (!source || !target) return "none";
    const [left, right] = command.side === "before" ? [source, target] : [target, source];
    // Chain identity is its first tile, not whichever object happened to be the
    // drop target. Prepending and later splitting cannot create duplicate IDs.
    let joined: Chain = { id: left.tiles[0], tiles: [...left.tiles, ...right.tiles], bonds: [...left.bonds, false, ...right.bonds], x: target.x, y: target.y };
    const sourceKnown = source.bonds.some(Boolean);
    const targetKnown = target.bonds.some(Boolean);
    let event: JoinEvent = "tentative";
    const replace = (value: Chain) => chains.flatMap((c) => c === source ? [] : c === target ? [value] : [c]);
    if (sourceKnown || targetKnown || joined.tiles.length >= RULES[this.problem.difficulty].threshold) {
      const confirmed = { ...joined, bonds: joined.bonds.map(() => true) };
      if (canReconstruct(comparisonText(this.problem.original), this.blocks(replace(confirmed)))) {
        joined = confirmed;
        event = sourceKnown && targetKnown ? "bridge" : sourceKnown || targetKnown ? "extend" : "new";
      }
    }
    const next = replace(joined);
    const complete = next.length === 1 && joined.tiles.length === this.problem.tiles.length && this.text(joined) === comparisonText(this.problem.original);
    this.commit({ phase: complete ? "complete" : "assembling", chains: next });
    return complete ? "complete" : event;
  }
}

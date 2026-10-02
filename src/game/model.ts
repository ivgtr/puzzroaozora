import { comparisonText, type Difficulty, type Passage } from "./text.ts";

// Only editor-reviewed scenes belong to the reconstruction game. Existing saved
// imports keep their Passage shape and remain readable without being migrated.
export interface CuratedPassage extends Passage {
  readonly curatedVersion: 1;
  readonly sceneTitle: string;
  readonly premise: string;
  readonly hints: readonly string[];
  readonly hardFragments?: readonly string[];
  readonly speechReadings?: readonly string[];
}
export interface Tile { readonly id: string; readonly text: string }
export interface Problem extends Omit<CuratedPassage, "fragments"> { readonly tiles: readonly Tile[]; readonly difficulty: Difficulty; readonly version: 3 }
export interface Point { x: number; y: number }
// Bonds remain as presentation boundaries for Paper; they are always provisional.
export interface Chain extends Point { readonly id: string; readonly tiles: readonly string[]; readonly bonds: readonly boolean[] }
export interface DeskState { readonly phase: "reading" | "assembling" | "complete"; readonly chains: readonly Chain[] }
export type JoinEvent = "none" | "move" | "split" | "tentative" | "incorrect" | "complete" | "undo";
export type HintResult = { readonly kind: "revealed"; readonly anchorId: string; readonly targetId: string; readonly repeated: boolean } | { readonly kind: "unavailable" | "exhausted" };
export type Command = { type: "join"; source: string; target: string; side: "before" | "after" } | { type: "split"; chain: string; boundary: number } | { type: "detach"; chain: string; tile: string; positions: readonly Point[] } | { type: "move"; chain: string; point: Point } | { type: "check" } | { type: "undo" };

/** Remove only the touched fragment's adjacent joins; never join its neighbours. */
export function detachedChains(chain: Chain, tile: string): Chain[] {
  const at = chain.tiles.indexOf(tile);
  if (at < 0 || chain.tiles.length < 2) return [];
  return [[0, at], [at, at + 1], [at + 1, chain.tiles.length]].filter(([start, end]) => start < end).map(([start, end]) => ({
    ...chain, id: chain.tiles[start], tiles: chain.tiles.slice(start, end), bonds: chain.bonds.slice(start, end - 1),
  }));
}

function hasCuration(passage: Passage | Problem): passage is CuratedPassage | Problem {
  const scene = passage as Partial<CuratedPassage>;
  return scene.curatedVersion === 1
    && typeof scene.sceneTitle === "string" && scene.sceneTitle.trim().length > 0
    && typeof scene.premise === "string" && scene.premise.trim().length > 0
    && Array.isArray(scene.hints) && scene.hints.length >= 2 && scene.hints.length <= 3
    && scene.hints.every((hint) => typeof hint === "string" && hint.trim().length > 0);
}
function validPieces(pieces: readonly string[]): boolean {
  return pieces.length >= 4 && pieces.length <= 12 && pieces.every((text) => typeof text === "string" && text.trim().length > 0);
}

export function fragmentsFor(passage: CuratedPassage, difficulty: Difficulty): readonly string[] {
  return difficulty === "hard" && passage.hardFragments ? passage.hardFragments : passage.fragments;
}

export function makeProblem(passage: Passage, difficulty: Difficulty = passage.difficulty, random: () => number = Math.random): Problem {
  if (!hasCuration(passage)) throw new Error("この原稿は新しい遊び方の選定シーンではありません。保存した本は変更していません。");
  const fragments = fragmentsFor(passage, difficulty);
  if (!Array.isArray(fragments) || !validPieces(fragments)) throw new Error("選定シーンの紙片は4〜12枚必要です。");
  if (fragments.join("") !== comparisonText(passage.original)) throw new Error("紙片と原文が一致しません。");
  const tiles = fragments.map((text) => ({ id: crypto.randomUUID(), text }));
  for (let i = tiles.length - 1; i > 0; i--) {
    const draw = random();
    if (!Number.isFinite(draw) || draw < 0 || draw >= 1) throw new Error("紙片を並べる乱数が不正です。");
    const j = Math.floor(draw * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  const { fragments: _fragments, ...metadata } = passage;
  void _fragments;
  return { ...metadata, version: 3, difficulty, tiles };
}

// A legacy validation utility, used only when loading a complete problem. It is
// deliberately absent from gameplay commands: no partial join is ever checked.
// Identical text remains interchangeable rather than tied to original positions.
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

// Resolve only edges shared by every full reconstruction. Tile IDs carry no
// source position; repeated text and ambiguous chunk boundaries must never lead
// to an arbitrary "correct" tile. At most 12 pieces keep this subset search small.
// This answer lookup is called only by an explicit hint, never by a join.
function unambiguousSuccessors(original: string, tiles: readonly Tile[]): Map<string, string> {
  const allUsed = (1 << tiles.length) - 1;
  const choices = new Map<number, number[]>();
  function next(used: number, offset: number): number[] {
    const cached = choices.get(used);
    if (cached) return cached;
    const possible: number[] = [];
    for (let i = 0; i < tiles.length; i++) {
      if ((used & (1 << i)) || !original.startsWith(tiles[i].text, offset)) continue;
      const nextUsed = used | (1 << i);
      const nextOffset = offset + tiles[i].text.length;
      if (nextUsed === allUsed ? nextOffset === original.length : next(nextUsed, nextOffset).length > 0) possible.push(i);
    }
    // The used subset determines the offset, even when prefixes are ambiguous.
    choices.set(used, possible);
    return possible;
  }
  const successors = tiles.map(() => new Set<number>());
  const visited = new Set<number>();
  function collect(used: number, offset: number): void {
    if (visited.has(used)) return;
    visited.add(used);
    for (const i of next(used, offset)) {
      const nextUsed = used | (1 << i);
      const nextOffset = offset + tiles[i].text.length;
      if (nextUsed === allUsed) successors[i].add(-1);
      else {
        for (const successor of next(nextUsed, nextOffset)) successors[i].add(successor);
        collect(nextUsed, nextOffset);
      }
    }
  }
  collect(0, 0);
  const result = new Map<string, string>();
  successors.forEach((candidates, i) => {
    const [successor] = candidates;
    if (candidates.size === 1 && successor >= 0) result.set(tiles[i].id, tiles[successor].id);
  });
  return result;
}

export class Session {
  readonly problem: Problem;
  private readonly tileText: Map<string, string>;
  private current: DeskState = { phase: "reading", chains: [] };
  private history: DeskState[] = [];
  private hintTargets?: ReadonlyMap<string, string>;
  private readonly revealedHints = new Map<string, string>();
  private readonly hintLimit: number;
  private inputLocked = false;
  private settledId: string | null = null;

  constructor(problem: Problem, options: { hintLimit?: number } = {}) {
    this.hintLimit = options.hintLimit ?? 1;
    if (!Number.isInteger(this.hintLimit) || this.hintLimit < 0 || this.hintLimit > 3) throw new Error("ヒント回数が不正です。");
    this.problem = problem;
    this.tileText = new Map(problem.tiles.map((tile) => [tile.id, tile.text]));
    if (problem.version !== 3 || !hasCuration(problem) || this.tileText.size !== problem.tiles.length || problem.tiles.some((tile) => !tile.id) || !validPieces(problem.tiles.map((tile) => tile.text)) || !canReconstruct(comparisonText(problem.original), problem.tiles.map((tile) => tile.text))) throw new Error("問題の紙片が不正です。");
  }
  get state(): DeskState { return this.current; }
  get canUndo(): boolean { return !this.inputLocked && this.current.phase === "assembling" && this.history.length > 0; }
  get canCheck(): boolean { return !this.inputLocked && this.current.phase === "assembling" && this.current.chains.length === 1; }
  get hintsRemaining(): number { return this.hintLimit - this.revealedHints.size; }
  get hintUses(): number { return this.revealedHints.size; }
  get settledSubmissionId(): string | null { return this.settledId; }
  text(chain: Chain): string { return chain.tiles.map((id) => this.tileText.get(id)!).join(""); }

  hintFor(chainId: string, remainingBudget = this.hintsRemaining): HintResult {
    if (this.inputLocked || this.current.phase !== "assembling") return { kind: "unavailable" };
    const chain = this.current.chains.find((candidate) => candidate.id === chainId);
    const anchorId = chain?.tiles.at(-1);
    if (!anchorId) return { kind: "unavailable" };
    const revealed = this.revealedHints.get(anchorId);
    if (revealed) return { kind: "revealed", anchorId, targetId: revealed, repeated: true };
    // Once spent, new requests reveal nothing about whether a successor exists.
    if (this.hintsRemaining <= 0 || remainingBudget <= 0) return { kind: "exhausted" };
    this.hintTargets ??= unambiguousSuccessors(comparisonText(this.problem.original), this.problem.tiles);
    const targetId = this.hintTargets.get(anchorId);
    if (!targetId) return { kind: "unavailable" };
    // Hint spending is session state, independent of arrangement and Undo.
    this.revealedHints.set(anchorId, targetId);
    return { kind: "revealed", anchorId, targetId, repeated: false };
  }

  /** Judge only a deliberate full-chain submission; ordinary joins never call this. */
  judge(): Judgement | null {
    if (!this.canCheck) return null;
    const tiles = [...this.current.chains[0].tiles];
    const tileTexts = tiles.map((id) => this.tileText.get(id)!);
    const correctPrefix = matchingPrefix(comparisonText(this.problem.original), tileTexts);
    return { tiles, tileTexts, correctPrefix, correct: correctPrefix === tiles.length,
      firstWrongTileId: tiles[correctPrefix] ?? null };
  }

  /** The run locks input while its durable submission is being presented. */
  lock(): void { this.inputLocked = true; }

  /** Outcomes form an Undo boundary. A suffix is detached once and kept intact. */
  settle(judgement: Judgement, submissionId: string, suffixPoint?: Point): void {
    if (suffixPoint && (!Number.isFinite(suffixPoint.x) || !Number.isFinite(suffixPoint.y) || Math.abs(suffixPoint.x) > 1e7 || Math.abs(suffixPoint.y) > 1e7)) throw new Error("分離する紙片の位置が不正です。");
    if (!validId(submissionId)) throw new Error("読み通しのIDが不正です。");
    const chain = this.current.chains[0];
    if (this.current.phase !== "assembling" || this.current.chains.length !== 1 ||
      chain.tiles.join("\0") !== judgement.tiles.join("\0")) throw new Error("読み通した配置が変わっています。");
    const texts = chain.tiles.map((id) => this.tileText.get(id)!);
    const prefix = matchingPrefix(comparisonText(this.problem.original), texts);
    if (judgement.correctPrefix !== prefix || judgement.correct !== (prefix === texts.length) ||
      judgement.firstWrongTileId !== (chain.tiles[prefix] ?? null) || !sameTexts(judgement.tileTexts, texts)) throw new Error("読み通しの判定が不正です。");
    this.history = [];
    this.settledId = submissionId;
    this.inputLocked = false;
    if (judgement.correct) {
      this.current = { ...this.current, phase: "complete" };
    } else if (judgement.correctPrefix > 0) {
      const leftTiles = chain.tiles.slice(0, judgement.correctPrefix);
      const rightTiles = chain.tiles.slice(judgement.correctPrefix);
      this.current = { phase: "assembling", chains: [
        { ...chain, id: leftTiles[0], tiles: leftTiles, bonds: leftTiles.slice(1).map(() => false) },
        { id: rightTiles[0], tiles: rightTiles, bonds: rightTiles.slice(1).map(() => false), x: suffixPoint?.x ?? chain.x + 56, y: suffixPoint?.y ?? chain.y + 70 },
      ] };
    }
  }

  snapshot(): SessionSnapshot {
    return { version: 1, passageId: this.problem.id, difficulty: this.problem.difficulty,
      tiles: this.problem.tiles.map((tile) => ({ ...tile })), state: copyState(this.current),
      settledSubmissionId: this.settledId, history: this.history.map(copyState), hints: [...this.revealedHints].map(([anchorId, targetId]) => ({ anchorId, targetId })) };
  }

  static restore(value: unknown, passages: readonly CuratedPassage[], options: { hintLimit?: number } = {}): Session {
    if (!isRecord(value) || value.version !== 1 || typeof value.passageId !== "string" || !isDifficulty(value.difficulty)) throw new Error("保存した盤面の形式が不正です。");
    const passage = passages.find((candidate) => candidate.id === value.passageId);
    if (!passage) throw new Error("保存した問題が現在の選定原稿にありません。");
    const tiles = validateTiles(value.tiles, fragmentsFor(passage, value.difficulty));
    const { fragments: _fragments, ...metadata } = passage;
    void _fragments;
    const session = new Session({ ...metadata, version: 3, difficulty: value.difficulty, tiles }, options);
    session.current = validateState(value.state, session.problem);
    if (value.settledSubmissionId !== null && !validId(value.settledSubmissionId)) throw new Error("保存した読み通しの区切りが不正です。");
    session.settledId = value.settledSubmissionId as string | null;
    if (session.current.phase === "reading" && session.settledId) throw new Error("開始前の読み通しが不正です。");
    if (!Array.isArray(value.history) || value.history.length > 64) throw new Error("保存した操作履歴が不正です。");
    session.history = value.history.map((state) => validateState(state, session.problem));
    if (session.history.some((state) => state.phase !== "assembling") ||
      (session.current.phase !== "assembling" && session.history.length)) throw new Error("保存した操作履歴が不正です。");
    if (!Array.isArray(value.hints) || value.hints.length > session.hintLimit) throw new Error("保存したヒントが不正です。");
    const targets = unambiguousSuccessors(comparisonText(passage.original), tiles);
    for (const hint of value.hints) {
      if (!isRecord(hint) || typeof hint.anchorId !== "string" || typeof hint.targetId !== "string" ||
        session.revealedHints.has(hint.anchorId) || targets.get(hint.anchorId) !== hint.targetId) throw new Error("保存したヒントが不正です。");
      session.revealedHints.set(hint.anchorId, hint.targetId);
    }
    if (session.current.phase === "reading" && session.hintUses) throw new Error("開始前のヒントが不正です。");
    return session;
  }

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

  dispatch(command: Command): JoinEvent {
    if (this.inputLocked || this.current.phase !== "assembling") return "none";
    if (command.type === "undo") {
      const previous = this.history.pop();
      if (!previous) return "none";
      this.current = previous;
      return "undo";
    }
    if (this.current.phase !== "assembling") return "none";
    const chains = this.current.chains;
    if (command.type === "check") {
      if (!this.canCheck) return "none";
      // An unsuccessful reading does not change the arrangement or consume Undo.
      if (this.text(chains[0]) !== comparisonText(this.problem.original)) return "incorrect";
      this.current = { ...this.current, phase: "complete" };
      this.history = [];
      return "complete";
    }
    if (command.type === "move") {
      const chain = chains.find((c) => c.id === command.chain);
      const { x, y } = command.point;
      if (!chain || !Number.isFinite(x) || !Number.isFinite(y) || (chain.x === x && chain.y === y)) return "none";
      this.commit({ ...this.current, chains: chains.map((c) => c === chain ? { ...c, x, y } : c) });
      return "move";
    }
    if (command.type === "detach") {
      const chain = chains.find((c) => c.id === command.chain);
      const parts = chain ? detachedChains(chain, command.tile) : [];
      if (!parts.length || command.positions.length !== parts.length || command.positions.some(({ x, y }) => !Number.isFinite(x) || !Number.isFinite(y))) return "none";
      const detached = parts.map((part, index) => ({ ...part, ...command.positions[index] }));
      this.commit({ phase: "assembling", chains: chains.flatMap((c) => c === chain ? detached : [c]) });
      return "split";
    }
    if (command.type === "split") {
      const chain = chains.find((c) => c.id === command.chain);
      const at = command.boundary;
      if (!chain || !Number.isInteger(at) || at < 0 || at >= chain.tiles.length - 1) return "none";
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
    // The first tile owns chain identity, including after a prepend or split.
    const joined: Chain = { id: left.tiles[0], tiles: [...left.tiles, ...right.tiles], bonds: [...left.bonds, false, ...right.bonds], x: target.x, y: target.y };
    const next = chains.flatMap((c) => c === source ? [] : c === target ? [joined] : [c]);
    this.commit({ phase: "assembling", chains: next });
    return "tentative";
  }
}

export interface Judgement {
  readonly tiles: readonly string[];
  readonly tileTexts: readonly string[];
  readonly correctPrefix: number;
  readonly firstWrongTileId: string | null;
  readonly correct: boolean;
}
export interface SessionSnapshot {
  readonly version: 1;
  readonly passageId: string;
  readonly difficulty: Difficulty;
  readonly tiles: readonly Tile[];
  readonly state: DeskState;
  readonly settledSubmissionId: string | null;
  readonly history: readonly DeskState[];
  readonly hints: readonly { readonly anchorId: string; readonly targetId: string }[];
}

export function matchingPrefix(original: string, texts: readonly string[]): number {
  let offset = 0;
  for (let index = 0; index < texts.length; index++) {
    if (!original.startsWith(texts[index], offset)) return index;
    offset += texts[index].length;
  }
  return texts.length;
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function isDifficulty(value: unknown): value is Difficulty {
  return value === "easy" || value === "normal" || value === "hard";
}
export function validId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128 && !/[\u0000-\u001f]/u.test(value);
}
export function sameTexts(actual: readonly string[], expected: readonly string[]): boolean {
  if (actual.length !== expected.length) return false;
  const left = [...actual].sort(), right = [...expected].sort();
  return left.every((text, i) => text === right[i]);
}
export function validateTiles(value: unknown, fragments: readonly string[]): Tile[] {
  if (!Array.isArray(value) || value.length !== fragments.length || value.some((tile) => !isRecord(tile) || !validId(tile.id) || typeof tile.text !== "string")) throw new Error("保存した紙片が不正です。");
  const tiles = value.map((tile) => ({ id: tile.id as string, text: tile.text as string }));
  if (new Set(tiles.map((tile) => tile.id)).size !== tiles.length || !sameTexts(tiles.map((tile) => tile.text), fragments)) throw new Error("保存した紙片が現在の選定原稿と一致しません。");
  return tiles;
}
function copyState(state: DeskState): DeskState {
  return { phase: state.phase, chains: state.chains.map((chain) => ({ ...chain, tiles: [...chain.tiles], bonds: [...chain.bonds] })) };
}
function validateState(value: unknown, problem: Problem): DeskState {
  if (!isRecord(value) || !["reading", "assembling", "complete"].includes(value.phase as string) || !Array.isArray(value.chains) || value.chains.length > problem.tiles.length) throw new Error("保存した配置が不正です。");
  const chains: Chain[] = value.chains.map((chain) => {
    if (!isRecord(chain) || !Array.isArray(chain.tiles) || !chain.tiles.length || chain.tiles.some((id) => !validId(id)) ||
      chain.id !== chain.tiles[0] || !Array.isArray(chain.bonds) || chain.bonds.length !== chain.tiles.length - 1 || chain.bonds.some((bond) => bond !== false) ||
      typeof chain.x !== "number" || typeof chain.y !== "number" || !Number.isFinite(chain.x) || !Number.isFinite(chain.y) || Math.abs(chain.x) > 1e7 || Math.abs(chain.y) > 1e7) throw new Error("保存した紙片の配置が不正です。");
    return { id: chain.id as string, tiles: [...chain.tiles] as string[], bonds: [...chain.bonds] as boolean[], x: chain.x, y: chain.y };
  });
  if (value.phase === "reading") {
    if (chains.length) throw new Error("開始前の配置が不正です。");
  } else {
    const ids = chains.flatMap((chain) => [...chain.tiles]);
    if (ids.length !== problem.tiles.length || new Set(ids).size !== ids.length || !sameTexts(ids, problem.tiles.map((tile) => tile.id))) throw new Error("保存した配置に紙片の重複か欠落があります。");
    if (value.phase === "complete") {
      const text = new Map(problem.tiles.map((tile) => [tile.id, tile.text]));
      if (chains.length !== 1 || chains[0].tiles.map((id) => text.get(id)).join("") !== comparisonText(problem.original)) throw new Error("保存した完成原稿が不正です。");
    }
  }
  return { phase: value.phase as DeskState["phase"], chains };
}

import {
  Session, fragmentsFor, isDifficulty, isRecord, makeProblem, matchingPrefix, sameTexts, validId, validateTiles,
  type Command, type CuratedPassage, type HintResult, type JoinEvent, type Judgement, type Point, type SessionSnapshot, type Tile,
} from "./model.ts";
import { passageOrder } from "./questions.ts";
import { comparisonText, type Difficulty } from "./text.ts";

export const RUN_STORAGE_KEY = "aozora-puzzle:run:v1";
export const STARTING_LIVES = 3;
export const RUN_HINTS = 1;
export type RunEndReason = "failed" | "conquered" | "abandoned";
export interface Submission extends Judgement {
  readonly id: string;
  readonly passageId: string;
  readonly skipPrefixCount: number;
}
interface HintUse {
  readonly passageId: string;
  readonly anchorId: string;
  readonly targetId: string;
  readonly tiles: readonly Tile[];
}
export interface RunSnapshot {
  readonly version: 1;
  readonly id: string;
  readonly workId: string;
  readonly difficulty: Difficulty;
  readonly order: readonly string[];
  readonly index: number;
  readonly lives: number;
  readonly clears: number;
  readonly hintsUsed: number;
  readonly endReason: RunEndReason | null;
  readonly session: SessionSnapshot;
  readonly submissions: readonly Submission[];
  readonly pendingId: string | null;
  readonly hint: HintUse | null;
}
interface RunOptions { readonly difficulty?: Difficulty; readonly random?: () => number }

/** One finite challenge. Only this owner books lives, clears, and hint spending. */
export class Run {
  readonly id: string;
  readonly workId: string;
  readonly difficulty: Difficulty;
  private readonly passages: readonly CuratedPassage[];
  private readonly random: () => number;
  private readonly order: readonly string[];
  private index = 0;
  private current: Session;
  private records: Submission[] = [];
  private pendingId: string | null = null;
  private hint: HintUse | null = null;
  private reason: RunEndReason | null = null;

  constructor(passages: readonly CuratedPassage[], workId: string, options: RunOptions = {}) {
    this.passages = passages;
    this.workId = workId;
    this.difficulty = options.difficulty ?? "normal";
    if (!isDifficulty(this.difficulty)) throw new Error("難易度が不正です。");
    this.random = options.random ?? Math.random;
    this.order = passageOrder(passages, workId, this.random);
    this.id = crypto.randomUUID();
    this.current = this.newSession();
  }
  get session(): Session { return this.current; }
  get currentSession(): Session { return this.current; }
  get currentPassage(): CuratedPassage { return this.passages.find((passage) => passage.id === this.order[this.index])!; }
  get lives(): number { return STARTING_LIVES - this.records.filter((record) => !record.correct).length; }
  get clears(): number { return this.records.filter((record) => record.correct).length; }
  get total(): number { return this.order.length; }
  get hintsRemaining(): number { return RUN_HINTS - (this.hint ? 1 : 0); }
  get status(): "playing" | "ended" { return this.reason ? "ended" : "playing"; }
  get endReason(): RunEndReason | null { return this.reason; }
  get pending(): Submission | undefined { return this.pendingId ? this.records.find((record) => record.id === this.pendingId) : undefined; }
  get lastSubmission(): Submission | undefined { return this.records.at(-1); }
  get seen(): readonly string[] { return this.order.slice(0, this.index + 1); }
  get reviewPassages(): readonly CuratedPassage[] { return this.seen.map((id) => this.passages.find((passage) => passage.id === id)!); }
  get canSubmit(): boolean { return this.status === "playing" && !this.pendingId && this.current.canCheck; }
  get canAdvance(): boolean { return this.status === "playing" && !this.pendingId && this.current.state.phase === "complete" && this.index + 1 < this.total; }

  private newSession(): Session { return new Session(makeProblem(this.currentPassage, this.difficulty, this.random)); }
  begin(positions: readonly Point[]): void {
    if (this.status !== "playing" || this.pendingId) throw new Error("この挑戦は開始できません。");
    this.current.begin(positions);
  }
  dispatch(command: Command): JoinEvent {
    if (this.status !== "playing" || this.pendingId || command.type === "check") return "none";
    return this.current.dispatch(command);
  }
  hintFor(chainId: string): HintResult {
    if (this.status !== "playing" || this.pendingId) return { kind: "unavailable" };
    const result = this.current.hintFor(chainId, this.hintsRemaining);
    if (result.kind === "revealed" && !result.repeated) {
      this.hint = { passageId: this.currentPassage.id, anchorId: result.anchorId, targetId: result.targetId,
        tiles: this.current.problem.tiles.map((tile) => ({ ...tile })) };
    }
    return result;
  }
  /** Book once before any audio/animation. Repeated clicks return the same receipt. */
  submit(): Submission | null {
    if (this.pending) return this.pending;
    if (!this.canSubmit) return null;
    const judgement = this.current.judge();
    if (!judgement) return null;
    const previous = this.records.at(-1);
    const knownText = previous?.passageId === this.currentPassage.id
      ? previous.tileTexts.slice(0, previous.correctPrefix).join("") : "";
    const submission = freezeSubmission({ ...judgement, id: crypto.randomUUID(), passageId: this.currentPassage.id,
      skipPrefixCount: Math.min(judgement.correctPrefix, matchingPrefix(knownText, judgement.tileTexts)) });
    this.records.push(submission);
    this.pendingId = submission.id;
    this.current.lock();
    if (this.lives === 0) this.reason = "failed";
    else if (this.clears === this.total) this.reason = "conquered";
    return submission;
  }
  /** Settle even after the final life. Audio success, failure, mute, and Skip use this. */
  settle(id: string, suffixPoint?: Point): boolean {
    const pending = this.pending;
    if (!pending || pending.id !== id) return false;
    this.current.settle(pending, pending.id, suffixPoint);
    this.pendingId = null;
    if (this.reason) this.current.lock();
    return true;
  }
  advance(): boolean {
    if (!this.canAdvance) return false;
    this.index++;
    this.current = this.newSession();
    return true;
  }
  abandon(): void {
    if (this.pending) this.settle(this.pending.id);
    this.reason ??= "abandoned";
    this.current.lock();
  }
  restart(): Run { return new Run(this.passages, this.workId, { difficulty: this.difficulty, random: this.random }); }
  snapshot(): RunSnapshot {
    return { version: 1, id: this.id, workId: this.workId, difficulty: this.difficulty, order: [...this.order], index: this.index,
      lives: this.lives, clears: this.clears, hintsUsed: RUN_HINTS - this.hintsRemaining, endReason: this.reason,
      session: this.current.snapshot(), submissions: this.records.map(copySubmission), pendingId: this.pendingId,
      hint: this.hint ? { ...this.hint, tiles: this.hint.tiles.map((tile) => ({ ...tile })) } : null };
  }
  serialize(): string { return JSON.stringify(this.snapshot()); }

  /** Never trust saved text, outcomes, budgets, IDs, or coordinates. No DB migration. */
  static restore(input: unknown, passages: readonly CuratedPassage[]): Run {
    const value: unknown = typeof input === "string" ? JSON.parse(input.length <= 500_000 ? input : "invalid") : input;
    if (!isRecord(value) || value.version !== 1 || !validId(value.id) || !validId(value.workId) || !isDifficulty(value.difficulty) ||
      !Array.isArray(value.order) || !value.order.length || value.order.length > 100 || value.order.some((id) => !validId(id)) || new Set(value.order).size !== value.order.length ||
      !Number.isInteger(value.index) || (value.index as number) < 0 || (value.index as number) >= value.order.length ||
      ![null, "failed", "conquered", "abandoned"].includes(value.endReason as RunEndReason | null)) throw new Error("保存した挑戦の形式が不正です。");
    const catalog = passages.filter((passage) => passage.workId === value.workId);
    if (!sameTexts(value.order as string[], catalog.map((passage) => passage.id))) throw new Error("保存した問題一覧が現在の選定原稿と一致しません。");
    const session = Session.restore(value.session, catalog);
    if (session.problem.id !== value.order[value.index as number] || session.problem.difficulty !== value.difficulty) throw new Error("保存した挑戦と盤面が一致しません。");
    if (!Array.isArray(value.submissions) || value.submissions.length > value.order.length + STARTING_LIVES) throw new Error("保存した読み通しの履歴が不正です。");
    const records: Submission[] = [];
    const identifiers = new Set<string>();
    const mappings = new Map<string, string>();
    let cleared = 0;
    let lives = STARTING_LIVES;
    for (const raw of value.submissions) {
      if (!isRecord(raw) || !validId(raw.id) || identifiers.has(raw.id) || raw.passageId !== value.order[cleared] || lives === 0 ||
        !Array.isArray(raw.tiles) || raw.tiles.length < 4 || raw.tiles.length > 12 || raw.tiles.some((id) => !validId(id)) || new Set(raw.tiles).size !== raw.tiles.length ||
        !Array.isArray(raw.tileTexts) || raw.tileTexts.some((text) => typeof text !== "string") || raw.tiles.length !== raw.tileTexts.length) throw new Error("保存した読み通しが不正です。");
      const passage = catalog.find((candidate) => candidate.id === raw.passageId)!;
      const tiles = raw.tiles as string[];
      const tileTexts = raw.tileTexts as string[];
      if (!sameTexts(tileTexts, fragmentsFor(passage, value.difficulty))) throw new Error("保存した読み通しの本文が不正です。");
      for (let i = 0; i < tiles.length; i++) {
        const key = `${passage.id}\0${tiles[i]}`;
        if (mappings.has(key) && mappings.get(key) !== tileTexts[i]) throw new Error("保存した紙片の対応が不正です。");
        mappings.set(key, tileTexts[i]);
      }
      const previous = records.at(-1);
      if (previous?.passageId === passage.id && !sameTexts(tiles, previous.tiles)) throw new Error("保存した紙片のIDが変わっています。");
      const correctPrefix = matchingPrefix(comparisonText(passage.original), tileTexts);
      const correct = correctPrefix === tiles.length;
      const firstWrongTileId = tiles[correctPrefix] ?? null;
      const knownText = previous?.passageId === passage.id ? previous.tileTexts.slice(0, previous.correctPrefix).join("") : "";
      const skipPrefixCount = Math.min(correctPrefix, matchingPrefix(knownText, tileTexts));
      if (raw.correctPrefix !== correctPrefix || raw.correct !== correct || raw.firstWrongTileId !== firstWrongTileId || raw.skipPrefixCount !== skipPrefixCount) throw new Error("保存した読み通しの判定が不正です。");
      records.push(freezeSubmission({ id: raw.id, passageId: passage.id, tiles, tileTexts, correctPrefix, firstWrongTileId, correct, skipPrefixCount }));
      identifiers.add(raw.id);
      if (correct) cleared++; else lives--;
    }
    if (value.lives !== lives || value.clears !== cleared) throw new Error("保存したライフか完成数が不正です。");
    const index = value.index as number;
    const last = records.at(-1);
    const currentLast = last?.passageId === session.problem.id ? last : undefined;
    if (index !== cleared && !(index === cleared - 1 && currentLast?.correct)) throw new Error("保存した進行位置が不正です。");
    if (currentLast && (!sameTexts(currentLast.tiles, session.problem.tiles.map((tile) => tile.id)) || session.problem.tiles.some((tile) => mappings.get(`${session.problem.id}\0${tile.id}`) !== tile.text))) throw new Error("保存した盤面と読み通しが一致しません。");
    if (value.pendingId !== null && (!validId(value.pendingId) || value.pendingId !== currentLast?.id)) throw new Error("保存した読み通しの待機状態が不正です。");
    if (value.pendingId !== null) {
      if (session.state.phase !== "assembling" || session.state.chains.length !== 1 || session.state.chains[0].tiles.join("\0") !== currentLast!.tiles.join("\0")) throw new Error("読み通し中の盤面が不正です。");
    } else if ((session.state.phase === "complete") !== Boolean(currentLast?.correct)) throw new Error("保存した完成状態が不正です。");
    const lastSettled = value.pendingId === null ? currentLast : records.at(-2);
    const expectedBoundary = lastSettled?.passageId === session.problem.id ? lastSettled.id : null;
    if (session.settledSubmissionId !== expectedBoundary) throw new Error("保存した読み通しの確定状態が一致しません。");
    if (currentLast && session.state.phase === "reading") throw new Error("読み通し後に開始前へ戻っています。");
    const automaticReason: RunEndReason | null = lives === 0 ? "failed" : cleared === value.order.length ? "conquered" : null;
    if ((automaticReason && value.endReason !== automaticReason) || (!automaticReason && value.endReason !== null && value.endReason !== "abandoned")) throw new Error("保存した終了状態が不正です。");
    let hint: HintUse | null = null;
    if (value.hint !== null) {
      const raw = value.hint;
      if (!isRecord(raw) || !validId(raw.passageId) || !(value.order as string[]).slice(0, index + 1).includes(raw.passageId) || !validId(raw.anchorId) || !validId(raw.targetId)) throw new Error("保存したヒントの消費が不正です。");
      const passage = catalog.find((candidate) => candidate.id === raw.passageId)!;
      const tiles = validateTiles(raw.tiles, fragmentsFor(passage, value.difficulty));
      const probe = Session.restore({ version: 1, passageId: passage.id, difficulty: value.difficulty, tiles,
        state: { phase: "assembling", chains: tiles.map((tile) => ({ id: tile.id, tiles: [tile.id], bonds: [], x: 0, y: 0 })) }, history: [], settledSubmissionId: null,
        hints: [{ anchorId: raw.anchorId, targetId: raw.targetId }] }, catalog);
      if (probe.hintUses !== 1) throw new Error("保存したヒントが不正です。");
      hint = { passageId: passage.id, anchorId: raw.anchorId, targetId: raw.targetId, tiles };
    }
    const currentHints = session.snapshot().hints;
    if (value.hintsUsed !== (hint ? 1 : 0) || currentHints.length !== (hint?.passageId === session.problem.id ? 1 : 0) ||
      (currentHints.length && (currentHints[0].anchorId !== hint!.anchorId || currentHints[0].targetId !== hint!.targetId ||
        !sameTexts(hint!.tiles.map((tile) => `${tile.id}\0${tile.text}`), session.problem.tiles.map((tile) => `${tile.id}\0${tile.text}`))))) throw new Error("保存したヒント回数が不正です。");
    // Construct without randomness or a new problem; all fields above are checked.
    const run = Object.create(Run.prototype) as Run;
    Object.assign(run, { id: value.id, workId: value.workId, difficulty: value.difficulty, passages, random: Math.random,
      order: [...value.order], index, current: session, records, pendingId: value.pendingId, hint, reason: value.endReason });
    if (run.pendingId || run.reason) session.lock();
    return run;
  }
}
function copySubmission(submission: Submission): Submission {
  return { ...submission, tiles: [...submission.tiles], tileTexts: [...submission.tileTexts] };
}

function freezeSubmission(submission: Submission): Submission {
  return Object.freeze({ ...submission, tiles: Object.freeze([...submission.tiles]), tileTexts: Object.freeze([...submission.tileTexts]) });
}

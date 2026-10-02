import type { NarrationClip } from "../data/narration.ts";
import { comparisonText, graphemes } from "./text.ts";

export interface NarrationFragment { index: number; start: number; end: number }
export interface NarrationPlan {
  url: string;
  offset: number;
  end: number;
  duration: number;
  firstFragment: number;
  correctPrefix: number;
  fragments: readonly NarrationFragment[];
  safeToPlay: boolean;
  safeSeekFragments: readonly number[];
}

function validateRange(fragments: readonly string[], correctPrefix: number, startFragment: number): void {
  if (!Number.isInteger(correctPrefix) || correctPrefix < 0 || correctPrefix > fragments.length ||
      !Number.isInteger(startFragment) || startFragment < 0 || startFragment > correctPrefix) {
    throw new Error("朗読する紙片の範囲が不正です。");
  }
}

/** Resolve whole, exact text boundaries; never estimate a cut within spoken text. */
export function buildNarrationPlan(clip: NarrationClip, fragments: readonly string[], correctPrefix: number, startFragment = 0): NarrationPlan {
  validateRange(fragments, correctPrefix, startFragment);
  if (!Number.isFinite(clip.duration) || clip.duration <= 0 || !Number.isFinite(clip.sampleRate) || clip.sampleRate <= 0 || !clip.cues.length) {
    throw new Error("朗読音声の時刻情報が不正です。");
  }
  const boundaries = new Map<number, number>([[0, 0]]);
  const safeBoundaries = new Set<number>([0]);
  let text = "", end = 0;
  for (const cue of clip.cues) {
    const part = comparisonText(cue.text);
    if (!part || !Number.isFinite(cue.start) || !Number.isFinite(cue.end) ||
        cue.start !== end || cue.end <= cue.start || cue.end > clip.duration) {
      throw new Error("朗読音声の区切りが連続していません。");
    }
    text += part;
    end = cue.end;
    boundaries.set(text.length, end);
    if (cue.safeEnd === true || end === clip.duration) safeBoundaries.add(text.length);
  }
  if (end !== clip.duration) throw new Error("朗読音声の終端が一致しません。");
  const cues: NarrationFragment[] = [];
  let position = 0, time = 0;
  const safeSeekFragments: number[] = [];
  for (let index = 0; index < correctPrefix; index++) {
    if (safeBoundaries.has(position)) safeSeekFragments.push(index);
    const part = comparisonText(fragments[index]);
    if (!part || text.slice(position, position + part.length) !== part) throw new Error("朗読音声と紙片の本文が一致しません。");
    position += part.length;
    const boundary = boundaries.get(position);
    if (boundary === undefined) throw new Error("朗読音声に紙片の区切りがありません。");
    cues.push({ index, start: time, end: boundary });
    time = boundary;
  }
  const offset = cues[startFragment]?.start ?? time;
  const safeToPlay = (startFragment === correctPrefix || safeSeekFragments.includes(startFragment)) && safeBoundaries.has(position);
  return { url: clip.url, offset, end: time, duration: time - offset, firstFragment: startFragment, correctPrefix, fragments: cues, safeToPlay, safeSeekFragments };
}

/** Silent progress uses the same cue sheet when present; this is only for absent/invalid audio data. */
export function buildVisualNarrationPlan(fragments: readonly string[], correctPrefix: number, startFragment = 0): NarrationPlan {
  validateRange(fragments, correctPrefix, startFragment);
  let time = 0;
  const cues = fragments.slice(0, correctPrefix).map((text, index) => {
    const start = time;
    time += Math.max(.4, graphemes(comparisonText(text)).length / 9);
    return { index, start, end: time };
  });
  const offset = cues[startFragment]?.start ?? time;
  return { url: "", offset, end: time, duration: time - offset, firstFragment: startFragment, correctPrefix, fragments: cues, safeToPlay: false, safeSeekFragments: cues.map(({ index }) => index) };
}

export interface NarrationRequest {
  track?: NarrationClip;
  /** Submitted order. Only the already-judged correct prefix is ever read. */
  fragments: readonly string[];
  correctPrefix: number;
  volume: number;
  startFragment?: number;
  /** Last previously confirmed boundary; the current check cannot increase it. */
  maximumSkipFragment?: number;
  onProgress: (activeIndex: number, confirmedCount: number) => void;
  /** Presentation only. Game judgment/life changes must already be settled. */
  onFinish: () => void;
  onFallback: (message: string) => void;
}

export interface NarrationClock {
  now: () => number;
  schedule: (callback: () => void, milliseconds: number) => unknown;
  cancel: (handle: unknown) => void;
}
interface NarrationPlayerOptions {
  /** Phaser's existing context and sound.destination; never create a second context. */
  context?: AudioContext;
  output?: AudioNode;
  clock?: NarrationClock;
  fetch?: typeof globalThis.fetch;
  loadTimeoutMs?: number;
}
interface Reading {
  generation: number;
  request: NarrationRequest;
  plan: NarrationPlan;
  mode: "loading" | "audio" | "visual";
  offset: number;
  started: number;
  nextFragment: number;
  announced: boolean;
  fallbackReported: boolean;
  abort?: AbortController;
  timer?: unknown;
  timeout?: unknown;
  source?: AudioBufferSourceNode;
  gain?: GainNode;
  buffer?: AudioBuffer;
}
const defaultClock: NarrationClock = {
  now: () => performance.now() / 1000,
  schedule: (callback, milliseconds) => setTimeout(callback, milliseconds),
  cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};
const FALLBACK = "朗読音声を再生できません。紙面の印で読み進めます。";

/** One continuous source, cut by the audio clock, with generation-safe cancellation. */
export class NarrationPlayer {
  private readonly options: NarrationPlayerOptions;
  private readonly clock: NarrationClock;
  private readonly fetchAudio: typeof globalThis.fetch;
  private readonly buffers = new Map<string, AudioBuffer>();
  private current?: Reading;
  private generation = 0;
  private disposed = false;
  private volume = 1;

  constructor(options: NarrationPlayerOptions = {}) {
    this.options = options;
    this.clock = options.clock ?? defaultClock;
    this.fetchAudio = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  get playing(): boolean { return !!this.current; }

  play(request: NarrationRequest): void {
    this.stop();
    if (this.disposed) return;
    const startFragment = request.startFragment ?? 0;
    // Invalid engine input is a programming error, not permission to read more.
    validateRange(request.fragments, request.correctPrefix, startFragment);
    this.volume = boundedVolume(request.volume);
    let plan: NarrationPlan;
    let fallback = false;
    try {
      if (!request.track) throw new Error("音声データがありません。");
      plan = buildNarrationPlan(request.track, request.fragments, request.correctPrefix, startFragment);
      fallback = !plan.safeToPlay;
    } catch {
      fallback = true;
      plan = buildVisualNarrationPlan(request.fragments, request.correctPrefix, startFragment);
    }
    const run: Reading = { generation: this.generation, request, plan, mode: "loading", offset: plan.offset,
      started: 0, nextFragment: startFragment, announced: false, fallbackReported: false };
    this.current = run;
    // Zero-prefix checks must not fetch, resume, or start even one audio sample.
    if (plan.duration === 0) {
      run.timer = this.clock.schedule(() => this.finish(run), 0);
      return;
    }
    if (this.volume === 0) { this.startVisual(run, fallback); return; }
    if (fallback || !this.options.context) { this.startVisual(run, true); return; }
    run.abort = new AbortController();
    run.timeout = this.clock.schedule(() => this.startVisual(run, true), this.options.loadTimeoutMs ?? 10_000);
    void this.loadAndPlay(run);
  }

  stop(): void {
    this.generation++;
    const run = this.current;
    this.current = undefined;
    if (run) this.release(run);
  }

  destroy(): void {
    this.stop();
    this.disposed = true;
    this.buffers.clear();
  }

  setVolume(volume: number): void {
    this.volume = boundedVolume(volume);
    const run = this.current;
    if (run?.gain) run.gain.gain.setValueAtTime(this.volume, this.options.context!.currentTime);
    // Muting during a slow load still gives immediate, cancellable visual progress.
    if (run?.mode === "loading" && this.volume === 0) this.startVisual(run, false);
  }

  /** Explicit fast-forward, restricted to the already-judged prefix in this request. */
  skipToFragment(index: number): boolean {
    const run = this.current;
    if (!run) return false;
    const limit = Number.isInteger(run.request.maximumSkipFragment) ? Math.max(0, Math.min(run.plan.correctPrefix, run.request.maximumSkipFragment!)) : 0;
    if (!Number.isInteger(index) || index < run.plan.firstFragment || index > limit) return false;
    const offset = run.plan.fragments[index]?.start ?? run.plan.end;
    if (offset <= this.position(run)) return false;
    if (index === run.plan.correctPrefix) { this.finish(run); return true; }
    this.clearTimer(run);
    this.stopSource(run);
    run.offset = offset;
    run.started = run.mode === "audio" ? this.options.context!.currentTime : this.clock.now();
    run.nextFragment = index;
    run.announced = false;
    if (run.mode === "audio" && run.buffer) {
      if (run.plan.safeSeekFragments.includes(index)) this.startAudio(run, run.buffer);
      else this.startVisual(run, true);
    }
    else if (run.mode === "visual") this.startVisual(run, false);
    else if (!run.plan.safeSeekFragments.includes(index)) this.startVisual(run, true);
    return true;
  }

  private active(run: Reading): boolean { return this.current === run && run.generation === this.generation && !this.disposed; }

  private async loadAndPlay(run: Reading): Promise<void> {
    const context = this.options.context!;
    try {
      // Called from the user's reading gesture; Phaser owns the autoplay context.
      const resume = context.state === "running" ? Promise.resolve() : context.resume();
      const load = async (): Promise<AudioBuffer | undefined> => {
        const cached = this.buffers.get(run.plan.url);
        if (cached) return cached;
        const response = await this.fetchAudio(run.plan.url, { signal: run.abort!.signal, mode: "cors", credentials: "omit" });
        if (!response.ok) throw new Error("朗読音声の取得に失敗しました。");
        const bytes = await response.arrayBuffer();
        if (!this.active(run) || run.mode !== "loading") return;
        return context.decodeAudioData(bytes);
      };
      // Attach both rejection handlers immediately: a denied resume must not
      // become an unhandled rejection while a network request is still pending.
      const [, buffer] = await Promise.all([resume, load()]);
      if (!this.active(run) || run.mode !== "loading") return;
      if (!buffer || context.state !== "running" || buffer.duration + 1 / buffer.sampleRate < run.plan.end) throw new Error("朗読音声が最後まで読み込めませんでした。");
      // Keep only a small working set; decoded full-book-style PCM is expensive.
      this.buffers.delete(run.plan.url);
      this.buffers.set(run.plan.url, buffer);
      while (this.buffers.size > 2) this.buffers.delete(this.buffers.keys().next().value!);
      this.clearLoad(run);
      this.startAudio(run, buffer);
    } catch {
      if (this.active(run) && run.mode === "loading") this.startVisual(run, true);
    }
  }

  private startAudio(run: Reading, buffer: AudioBuffer): void {
    if (!this.active(run)) return;
    const context = this.options.context!;
    try {
      const source = context.createBufferSource();
      const gain = context.createGain();
      run.buffer = buffer;
      run.source = source;
      run.gain = gain;
      source.buffer = buffer;
      source.loop = false;
      gain.gain.setValueAtTime(this.volume, context.currentTime);
      source.connect(gain);
      gain.connect(this.options.output ?? context.destination);
      run.mode = "audio";
      run.started = context.currentTime;
      source.onended = () => {
        if (this.active(run) && run.source === source) this.finish(run);
      };
      // Hardware/audio-thread termination, not timeupdate or a JS timer. No wrong
      // piece or true continuation can sound when rendering/the tab is delayed.
      source.start(run.started, run.offset, run.plan.end - run.offset);
      this.advance(run, run.offset);
      this.tick(run);
    } catch {
      this.startVisual(run, true);
    }
  }

  private startVisual(run: Reading, report: boolean): void {
    if (!this.active(run)) return;
    const offset = this.position(run);
    this.clearLoad(run);
    this.clearTimer(run);
    this.stopSource(run);
    run.mode = "visual";
    run.offset = offset;
    run.started = this.clock.now();
    if (report && !run.fallbackReported) {
      run.fallbackReported = true;
      run.request.onFallback(FALLBACK);
      if (!this.active(run)) return;
    }
    this.advance(run, offset);
    this.tick(run);
  }

  private position(run: Reading): number {
    const elapsed = run.mode === "loading" ? 0 : Math.max(0, (run.mode === "audio" ? this.options.context!.currentTime : this.clock.now()) - run.started);
    return Math.min(run.plan.end, run.offset + elapsed);
  }

  private tick(run: Reading): void {
    if (!this.active(run)) return;
    if (run.mode === "audio" && this.options.context!.state !== "running") { this.startVisual(run, true); return; }
    const position = this.position(run);
    this.advance(run, position);
    if (!this.active(run)) return;
    if (position >= run.plan.end) { this.finish(run); return; }
    run.timer = this.clock.schedule(() => { run.timer = undefined; this.tick(run); }, 40);
  }

  private advance(run: Reading, position: number): void {
    // Catch up all crossed boundaries after a background tab resumes. Timers
    // only affect ink; source.start(..., duration) already enforced the audio cut.
    while (this.active(run) && run.nextFragment < run.plan.correctPrefix) {
      const fragment = run.plan.fragments[run.nextFragment];
      if (!run.announced) {
        run.announced = true;
        run.request.onProgress(fragment.index, fragment.index);
      }
      if (position < fragment.end) break;
      run.nextFragment++;
      run.announced = false;
    }
  }

  private finish(run: Reading): void {
    if (!this.active(run)) return;
    this.advance(run, run.plan.end);
    if (!this.active(run)) return;
    this.current = undefined;
    this.release(run);
    run.request.onProgress(-1, run.plan.correctPrefix);
    // A progress handler can synchronously navigate away/start a new reading.
    if (run.generation === this.generation && !this.disposed) run.request.onFinish();
  }

  private clearTimer(run: Reading): void {
    if (run.timer !== undefined) this.clock.cancel(run.timer);
    run.timer = undefined;
  }

  private clearLoad(run: Reading): void {
    if (run.timeout !== undefined) this.clock.cancel(run.timeout);
    run.timeout = undefined;
    run.abort?.abort();
    run.abort = undefined;
  }

  private stopSource(run: Reading): void {
    if (run.source) {
      run.source.onended = null;
      try { run.source.stop(); } catch { /* A source which failed to start is already silent. */ }
      run.source.disconnect();
      run.source = undefined;
    }
    run.gain?.disconnect();
    run.gain = undefined;
  }

  private release(run: Reading): void {
    this.clearLoad(run);
    this.clearTimer(run);
    this.stopSource(run);
  }
}

function boundedVolume(volume: number): number { return Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0; }

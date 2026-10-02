import test from "node:test";
import assert from "node:assert/strict";
import { buildNarrationPlan, buildVisualNarrationPlan, NarrationPlayer, type NarrationClock, type NarrationRequest } from "../src/game/narration.ts";
import { manuscriptFragmentRanges, layoutManuscript } from "../src/game/layout.ts";
import { NARRATION, NARRATION_ASSET_REVISION, type NarrationClip } from "../src/data/narration.ts";
import { PASSAGES } from "../src/data/passages.ts";

const clip: NarrationClip = { passageId: "fixture", voice: "female", url: "https://example.com/master.wav", duration: 1.4, sampleRate: 1000, sha256: "fixture",
  cues: [{ text: "甲", start: 0, end: .2, safeEnd: true }, { text: "乙", start: .2, end: .6, safeEnd: true }, { text: "丙", start: .6, end: 1, safeEnd: true }, { text: "丁", start: 1, end: 1.4, safeEnd: true }] };

class Clock implements NarrationClock {
  time = 0;
  id = 0;
  tasks = new Map<number, { at: number; callback: () => void }>();
  now = () => this.time;
  schedule = (callback: () => void, milliseconds: number) => {
    const id = ++this.id;
    this.tasks.set(id, { at: this.time + milliseconds / 1000, callback });
    return id;
  };
  cancel = (handle: unknown) => { this.tasks.delete(handle as number); };
  advance(seconds: number): void {
    const end = this.time + seconds;
    for (;;) {
      const first = [...this.tasks].sort((a, b) => a[1].at - b[1].at)[0];
      if (!first || first[1].at > end + 1e-9) break;
      this.tasks.delete(first[0]);
      this.time = first[1].at;
      first[1].callback();
    }
    this.time = end;
  }
}
class Source {
  buffer: unknown;
  loop = false;
  onended: (() => void) | null = null;
  starts: number[][] = [];
  stops = 0;
  disconnected = false;
  failStart = false;
  connect() { return this; }
  disconnect() { this.disconnected = true; }
  start(...values: number[]) { if (this.failStart) throw new Error("closed"); this.starts.push(values); }
  stop() { this.stops++; }
}
class Gain {
  values: number[] = [];
  disconnected = false;
  gain = { setValueAtTime: (value: number) => { this.values.push(value); } };
  connect() { return this; }
  disconnect() { this.disconnected = true; }
}
class Context {
  clock: Clock;
  state = "running";
  destination = {};
  sources: Source[] = [];
  gains: Gain[] = [];
  resumes = 0;
  failStart = false;
  decodedDuration = 1.4;
  decode: (() => Promise<AudioBuffer>) | undefined;
  constructor(clock: Clock) { this.clock = clock; }
  get currentTime() { return this.clock.now(); }
  resume() { this.resumes++; this.state = "running"; return Promise.resolve(); }
  createBufferSource() { const source = new Source(); source.failStart = this.failStart; this.sources.push(source); return source; }
  createGain() { const gain = new Gain(); this.gains.push(gain); return gain; }
  decodeAudioData() { return this.decode?.() ?? Promise.resolve({ duration: this.decodedDuration, sampleRate: 1000 } as AudioBuffer); }
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function settled() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
function harness(fetcher: typeof fetch = async () => new Response(new ArrayBuffer(2)), options: { loadTimeoutMs?: number } = {}) {
  const clock = new Clock(), context = new Context(clock);
  const progress: number[][] = [], fallbacks: string[] = [];
  let finishes = 0;
  const player = new NarrationPlayer({ context: context as unknown as AudioContext, clock, fetch: fetcher, ...options });
  const request: NarrationRequest = { track: clip, fragments: ["甲", "乙", "間違い", "丁"], correctPrefix: 2, maximumSkipFragment: 2, volume: .7,
    onProgress: (active, confirmed) => { progress.push([active, confirmed]); }, onFinish: () => { finishes++; }, onFallback: (message) => { fallbacks.push(message); } };
  return { clock, context, player, request, progress, fallbacks, get finishes() { return finishes; } };
}

test("exact hard cues and merged normal fragments use a single contiguous master slice", () => {
  const hard = buildNarrationPlan(clip, ["甲", "乙", "wrong", "丁"], 2);
  assert.deepEqual(hard.fragments, [{ index: 0, start: 0, end: .2 }, { index: 1, start: .2, end: .6 }]);
  assert.deepEqual([hard.offset, hard.end, hard.duration], [0, .6, .6]);
  const normal = buildNarrationPlan(clip, ["甲乙", "丙丁"], 2);
  assert.deepEqual(normal.fragments, [{ index: 0, start: 0, end: .6 }, { index: 1, start: .6, end: 1.4 }]);
  assert.equal(normal.duration, 1.4);
  const review = buildNarrationPlan(clip, ["甲", "乙", "丙", "丁"], 4, 2);
  assert.equal(review.offset, .6);
  assert.equal(review.duration, 1.4 - .6);
  const zero = buildNarrationPlan(clip, ["wrong"], 0);
  assert.equal(zero.duration, 0);
  assert.equal(zero.end, 0);
  assert.deepEqual(zero.fragments, []);
});

test("only exact text/cue boundaries may be read, including paragraph normalization", () => {
  assert.throws(() => buildNarrationPlan(clip, ["乙", "甲"], 1), /本文/);
  const grouped = { ...clip, cues: [{ text: "甲乙", start: 0, end: .6 }, ...clip.cues.slice(2)] };
  assert.throws(() => buildNarrationPlan(grouped, ["甲", "乙", "丙丁"], 1), /区切り/);
  assert.throws(() => buildNarrationPlan(clip, ["甲"], 2), /範囲/);
  assert.throws(() => buildNarrationPlan(clip, ["甲"], NaN), /範囲/);
  assert.throws(() => buildNarrationPlan(clip, ["甲"], 1, 2), /範囲/);
  assert.throws(() => buildNarrationPlan({ ...clip, cues: [{ ...clip.cues[0], end: .3 }, ...clip.cues.slice(1)] }, ["甲"], 1), /連続/);
  assert.equal(buildNarrationPlan(clip, ["甲\n\n　乙", "wrong"], 1).end, .6);
  assert.equal(buildVisualNarrationPlan(["甲", "乙"], 0).duration, 0);
});

test("WebAudio receives one exact duration and progress never enters the wrong fragment", async () => {
  const h = harness();
  h.player.play(h.request);
  await settled();
  assert.equal(h.context.sources.length, 1);
  const source = h.context.sources[0], ended = source.onended;
  assert.deepEqual(source.starts, [[0, 0, .6]]);
  assert.deepEqual(h.progress, [[0, 0]]);
  h.clock.advance(.2);
  assert.deepEqual(h.progress, [[0, 0], [1, 1]]);
  h.clock.advance(.5);
  assert.deepEqual(h.progress, [[0, 0], [1, 1], [-1, 2]]);
  assert.equal(h.finishes, 1);
  assert.equal(source.stops, 1);
  assert.equal(source.disconnected, true);
  assert.equal(h.context.gains[0].disconnected, true);
  ended?.();
  assert.equal(h.finishes, 1);
  assert.equal(h.clock.tasks.size, 0);
});

test("zero prefix never fetches, resumes, or starts audio and finishes once", async () => {
  let fetches = 0;
  const h = harness(async () => { fetches++; throw new Error("must not fetch"); });
  h.context.state = "suspended";
  h.player.play({ ...h.request, correctPrefix: 0 });
  await settled();
  h.clock.advance(1);
  assert.equal(fetches, 0);
  assert.equal(h.context.resumes, 0);
  assert.equal(h.context.sources.length, 0);
  assert.deepEqual(h.progress, [[-1, 0]]);
  assert.equal(h.finishes, 1);
  assert.deepEqual(h.fallbacks, []);
});

test("muted reading follows the same fragment cue times without waiting for audio", () => {
  const h = harness(async () => { throw new Error("must not fetch"); });
  h.player.play({ ...h.request, volume: 0 });
  assert.deepEqual(h.progress, [[0, 0]]);
  h.clock.advance(.2);
  assert.deepEqual(h.progress, [[0, 0], [1, 1]]);
  h.clock.advance(.5);
  assert.deepEqual(h.progress, [[0, 0], [1, 1], [-1, 2]]);
  assert.equal(h.finishes, 1);
  assert.equal(h.context.sources.length, 0);
  assert.deepEqual(h.fallbacks, []);
});

test("muting an active source only changes gain and preserves presentation events", async () => {
  const h = harness();
  h.player.play(h.request);
  await settled();
  h.player.setVolume(0);
  assert.deepEqual(h.context.gains[0].values, [.7, 0]);
  assert.equal(h.context.sources[0].stops, 0);
  h.clock.advance(1);
  assert.equal(h.finishes, 1);
  assert.deepEqual(h.progress.at(-1), [-1, 2]);
});

test("replacement and stop discard late fetch/decode callbacks without duplicate endings", async () => {
  const fetchResult = deferred<Response>();
  let calls = 0;
  const h = harness(async () => ++calls === 1 ? fetchResult.promise : new Response(new ArrayBuffer(2)));
  h.player.play(h.request);
  h.player.play({ ...h.request, correctPrefix: 1 });
  await settled();
  fetchResult.resolve(new Response(new ArrayBuffer(2)));
  await settled();
  assert.equal(h.context.sources.length, 1);
  assert.deepEqual(h.context.sources[0].starts, [[0, 0, .2]]);
  h.clock.advance(.3);
  assert.equal(h.finishes, 1);

  const decodeResult = deferred<AudioBuffer>();
  const later = harness();
  later.context.decode = () => decodeResult.promise;
  later.player.play(later.request);
  await settled();
  later.player.stop();
  decodeResult.resolve({ duration: 1.4, sampleRate: 1000 } as AudioBuffer);
  await settled();
  later.clock.advance(20);
  assert.equal(later.context.sources.length, 0);
  assert.equal(later.finishes, 0);
  assert.deepEqual(later.fallbacks, []);
});

test("load failures and hung requests disclose one visual fallback then finish normally", async () => {
  const h = harness(async () => { throw new Error("offline"); });
  h.player.play(h.request);
  await settled();
  assert.equal(h.fallbacks.length, 1);
  h.clock.advance(1);
  assert.equal(h.finishes, 1);
  assert.deepEqual(h.progress, [[0, 0], [1, 1], [-1, 2]]);

  const pending = deferred<Response>();
  const slow = harness(async () => pending.promise, { loadTimeoutMs: 100 });
  slow.player.play(slow.request);
  slow.clock.advance(.1);
  assert.equal(slow.fallbacks.length, 1);
  pending.resolve(new Response(new ArrayBuffer(2)));
  await settled();
  slow.clock.advance(1);
  assert.equal(slow.context.sources.length, 0);
  assert.equal(slow.finishes, 1);
  assert.equal(slow.fallbacks.length, 1);
});

test("source failure, truncated audio, and context suspension use safe visual progress", async () => {
  for (const problem of ["start", "short", "suspended"] as const) {
    const h = harness();
    if (problem === "start") h.context.failStart = true;
    if (problem === "short") h.context.decodedDuration = .1;
    h.player.play(h.request);
    await settled();
    if (problem === "suspended") { h.clock.advance(.24); h.context.state = "suspended"; }
    h.clock.advance(1);
    assert.equal(h.fallbacks.length, 1, problem);
    assert.equal(h.finishes, 1, problem);
    assert.deepEqual(h.progress, [[0, 0], [1, 1], [-1, 2]], problem);
    assert.equal(h.clock.tasks.size, 0, problem);
  }
});

test("explicit fast-forward is bounded by the proven prefix and retires the old source", async () => {
  const h = harness();
  h.player.play(h.request);
  await settled();
  const oldEnded = h.context.sources[0].onended;
  assert.equal(h.player.skipToFragment(3), false);
  assert.equal(h.player.skipToFragment(1), true);
  assert.equal(h.context.sources[0].stops, 1);
  assert.deepEqual(h.context.sources[1].starts, [[0, .2, .6 - .2]]);
  oldEnded?.();
  assert.equal(h.finishes, 0);
  assert.equal(h.player.skipToFragment(0), false);
  assert.equal(h.player.skipToFragment(2), true);
  assert.equal(h.finishes, 1);
  h.clock.advance(2);
  assert.equal(h.finishes, 1);
});

test("callbacks may cancel or replace playback and destroyed players never restart", async () => {
  const h = harness();
  h.player.play({ ...h.request, onProgress: () => h.player.stop() });
  await settled();
  h.clock.advance(1);
  assert.equal(h.finishes, 0);
  assert.equal(h.context.sources[0].stops, 1);
  assert.equal(h.clock.tasks.size, 0);
  h.player.destroy();
  h.player.play(h.request);
  await settled();
  assert.equal(h.context.sources.length, 1);
});


test("full manuscript reading marks retain exact fragment glyphs across paragraphs and graphemes", () => {
  const text = "　甲乙。\n\n　𠮷が丙。\n 丁。";
  const ranges = manuscriptFragmentRanges(text, ["甲乙。", "𠮷が", "丙。丁。"]);
  const layout = layoutManuscript(text, 8);
  const marked = ranges.map(({ start, end }) => layout.glyphs.filter((glyph) => glyph.index >= start && glyph.index < end).map((glyph) => glyph.text).join(""));
  assert.deepEqual(marked, ["甲乙。", "𠮷が", "丙。 丁。"]);
  assert.deepEqual(manuscriptFragmentRanges("甲乙", ["甲", "乙"]), [{ start: 0, end: 1 }, { start: 1, end: 2 }]);
  assert.throws(() => manuscriptFragmentRanges(text, ["違う本文"]), /一致/);
});


test("uncertain partial cuts fail closed while the whole continuous master remains playable", async () => {
  const uncertain = { ...clip, cues: clip.cues.map(({ text, start, end }) => ({ text, start, end })) };
  const partial = buildNarrationPlan(uncertain, ["甲", "乙", "wrong", "丁"], 2);
  assert.equal(partial.safeToPlay, false);
  assert.equal(partial.duration, .6, "visuals retain the known cue timing");
  assert.equal(buildNarrationPlan(uncertain, ["甲乙", "丙丁"], 2).safeToPlay, true);
  assert.equal(buildNarrationPlan(uncertain, ["甲乙", "丙丁"], 2, 1).safeToPlay, false);
  const h = harness();
  h.player.play({ ...h.request, track: uncertain });
  await settled();
  assert.equal(h.context.sources.length, 0);
  assert.equal(h.fallbacks.length, 1);
  h.clock.advance(1);
  assert.equal(h.finishes, 1);
});

test("fast-forward cannot skip beyond the historical confirmation limit", async () => {
  const h = harness();
  h.player.play({ ...h.request, maximumSkipFragment: 1 });
  await settled();
  assert.equal(h.player.skipToFragment(2), false);
  assert.equal(h.player.skipToFragment(1), true);
  h.player.stop();
  h.player.play({ ...h.request, maximumSkipFragment: undefined });
  await settled();
  assert.equal(h.player.skipToFragment(1), false);
  h.player.destroy();
});


test("unsafe fast-forward start switches to visual progress without playing that seam", async () => {
  const h = harness();
  const uncertainStart = { ...clip, cues: clip.cues.map((cue, index) => ({ ...cue, safeEnd: index === 0 ? false : true })) };
  h.player.play({ ...h.request, track: uncertainStart });
  await settled();
  assert.equal(h.context.sources.length, 1);
  h.clock.advance(.08);
  assert.equal(h.player.skipToFragment(1), true);
  assert.equal(h.context.sources.length, 1);
  assert.equal(h.context.sources[0].stops, 1);
  assert.equal(h.fallbacks.length, 1);
  h.clock.advance(.6);
  assert.equal(h.finishes, 1);
  assert.deepEqual(h.progress, [[0, 0], [1, 1], [-1, 2]]);
});

test("muting a hung load begins visuals immediately and ignores the late result", async () => {
  const pending = deferred<Response>();
  const h = harness(async () => pending.promise);
  h.player.play(h.request);
  h.player.setVolume(0);
  assert.deepEqual(h.progress, [[0, 0]]);
  pending.resolve(new Response(new ArrayBuffer(2)));
  await settled();
  h.clock.advance(1);
  assert.equal(h.context.sources.length, 0);
  assert.equal(h.finishes, 1);
  assert.deepEqual(h.fallbacks, []);
});

// A small offline corpus contract catches content edits that would otherwise
// silently disable a production prefix or accidentally point at mutable audio.
test("all curated variants have two immutable continuous masters with safe exact prefix boundaries", () => {
  assert.match(NARRATION_ASSET_REVISION, /^[0-9a-f]{40}$/);
  assert.equal(Object.keys(NARRATION).length, PASSAGES.length);
  for (const passage of PASSAGES) for (const voice of ["female", "male"] as const) {
    const track = NARRATION[passage.id]?.[voice];
    assert.ok(track, `${passage.id}/${voice}`);
    assert.equal(track.passageId, passage.id);
    assert.equal(track.voice, voice);
    assert.equal(track.sampleRate, 48000);
    assert.match(track.sha256, /^[0-9a-f]{64}$/);
    assert.ok(track.duration > 0 && track.duration <= 30);
    assert.equal(track.url, `https://raw.githubusercontent.com/ivgtr/puzzroaozora/${NARRATION_ASSET_REVISION}/audio-assets/masters/${passage.id}-${voice}.wav`);
    for (const fragments of [passage.fragments, passage.hardFragments ?? passage.fragments]) {
      for (let prefix = 1; prefix <= fragments.length; prefix++) {
        const plan = buildNarrationPlan(track, fragments, prefix);
        assert.equal(plan.safeToPlay, true, `${passage.id}/${voice}/${prefix}`);
        assert.equal(plan.correctPrefix, prefix);
        assert.ok(plan.end <= track.duration);
      }
      assert.equal(buildNarrationPlan(track, fragments, fragments.length).end, track.duration);
    }
  }
});

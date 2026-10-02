import test from "node:test";
import assert from "node:assert/strict";
import { buildNarrationPlan, NarrationPlayer, NARRATION_MESSAGES, type NarrationClock, type NarrationRequest, type NarrationState } from "../src/game/narration.ts";
import { NARRATION, type NarrationClip } from "../src/data/narration.ts";
import { PASSAGES } from "../src/data/passages.ts";

const clip: NarrationClip = {
  passageId: "fixture", voice: "female", url: "https://example.com/master.wav", duration: 1.4, sampleRate: 1000, sha256: "fixture",
  cues: [{ text: "甲", start: 0, end: .2, safeEnd: true }, { text: "乙", start: .2, end: .6, safeEnd: true },
    { text: "丙", start: .6, end: 1, safeEnd: true }, { text: "丁", start: 1, end: 1.4, safeEnd: true }],
};

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
  onended: (() => void) | null = null;
  starts: number[][] = [];
  stops = 0;
  connect() { return this; }
  disconnect() {}
  start(...values: number[]) { this.starts.push(values); }
  stop() { this.stops++; }
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}
async function settled() { for (let i = 0; i < 16; i++) await Promise.resolve(); }
function harness(fetcher: typeof fetch = async () => new Response(new ArrayBuffer(2))) {
  const clock = new Clock(), sources: Source[] = [], states: NarrationState[] = [];
  const progress: number[][] = [], failures: { message: string; retryable: boolean }[] = [];
  let finishes = 0;
  const context = {
    state: "running", destination: {},
    get currentTime() { return clock.now(); },
    createBufferSource() { const source = new Source(); sources.push(source); return source; },
    createGain() { return { gain: { setValueAtTime() {} }, connect() {}, disconnect() {} }; },
    decodeAudioData: async () => ({ duration: 1.4, sampleRate: 1000 } as AudioBuffer),
  } as unknown as AudioContext;
  const player = new NarrationPlayer({ context, clock, fetch: fetcher, loadTimeoutMs: 100 });
  const request: NarrationRequest = {
    track: clip, fragments: ["甲", "乙", "間違い", "丁"], correctPrefix: 2, maximumSkipFragment: 1, volume: .7,
    onProgress: (active, confirmed) => { progress.push([active, confirmed]); }, onFinish: () => { finishes++; },
    onFallback: (message, retryable) => { failures.push({ message, retryable }); }, onState: (state) => { states.push(state); },
  };
  return { clock, context, sources, states, player, request, progress, failures, get finishes() { return finishes; } };
}

test("only exact, safe text boundaries can be read from a continuous master", () => {
  const plan = buildNarrationPlan(clip, ["甲", "乙", "wrong", "丁"], 2);
  assert.deepEqual([plan.offset, plan.end, plan.duration, plan.safeToPlay], [0, .6, .6, true]);
  assert.equal(buildNarrationPlan(clip, ["甲乙", "丙丁"], 2, 1).offset, .6);
  assert.throws(() => buildNarrationPlan(clip, ["乙", "甲"], 1), /本文/);
  const uncertain = { ...clip, cues: clip.cues.map(({ text, start, end }) => ({ text, start, end })) };
  assert.equal(buildNarrationPlan(uncertain, ["甲", "乙", "wrong"], 2).safeToPlay, false);
  assert.equal(buildNarrationPlan(uncertain, ["甲乙", "丙丁"], 2).safeToPlay, true);
});

test("audio stops before the wrong piece; skip and late endings cannot advance twice", async () => {
  const h = harness();
  h.player.play(h.request);
  await settled();
  const oldEnded = h.sources[0].onended;
  assert.deepEqual(h.sources[0].starts, [[0, 0, .6]]);
  assert.equal(h.player.skipToFragment(2), false, "skip is limited by prior confirmation");
  assert.equal(h.player.skipToFragment(1), true);
  assert.deepEqual(h.sources[1].starts, [[0, .2, .6 - .2]]);
  oldEnded?.();
  assert.equal(h.finishes, 0);
  h.clock.advance(1);
  assert.deepEqual(h.progress.at(-1), [-1, 2]);
  assert.ok(h.progress.every(([active]) => active < 2));
  assert.equal(h.finishes, 1);
  assert.equal(h.clock.tasks.size, 0);
});

test("zero-prefix and muted checks stay silent without reporting an audio error", async () => {
  let fetches = 0;
  const h = harness(async () => { fetches++; throw new Error("must not fetch"); });
  h.player.play({ ...h.request, correctPrefix: 0 });
  h.clock.advance(1);
  assert.deepEqual(h.progress, [[-1, 0]]);
  h.player.play({ ...h.request, track: undefined, volume: 0 });
  h.clock.advance(1);
  await settled();
  assert.equal(fetches, 0);
  assert.equal(h.sources.length, 0);
  assert.deepEqual(h.failures, []);
  assert.equal(h.finishes, 2);
});

test("replacing or stopping a reading discards late network and decoding results", async () => {
  const pending = deferred<Response>();
  let calls = 0;
  const h = harness(async () => ++calls === 1 ? pending.promise : new Response(new ArrayBuffer(2)));
  h.player.play(h.request);
  h.player.play({ ...h.request, correctPrefix: 1 });
  await settled();
  pending.resolve(new Response(new ArrayBuffer(2)));
  await settled();
  assert.equal(h.sources.length, 1);
  assert.deepEqual(h.sources[0].starts, [[0, 0, .2]]);
  h.player.stop();
  h.clock.advance(1);
  assert.equal(h.finishes, 0);

  const decode = deferred<AudioBuffer>();
  h.context.decodeAudioData = () => decode.promise;
  h.player.play({ ...h.request, track: { ...clip, url: "https://example.com/other.wav" } });
  await settled();
  h.player.stop();
  decode.resolve({ duration: 1.4, sampleRate: 1000 } as AudioBuffer);
  await settled();
  assert.equal(h.sources.length, 1);
  assert.deepEqual(h.failures, []);
});

test("loading is not failure; a network failure is actionable and a new attempt plays", async () => {
  let calls = 0;
  const h = harness(async () => { if (++calls === 1) throw new Error("offline"); return new Response(new ArrayBuffer(2)); });
  h.player.play(h.request);
  assert.deepEqual(h.states, ["loading"]);
  assert.deepEqual(h.failures, []);
  await settled();
  assert.deepEqual(h.failures, [{ message: NARRATION_MESSAGES.network, retryable: true }]);
  assert.equal(h.states.at(-1), "visual");
  h.player.play(h.request);
  await settled();
  assert.equal(h.states.at(-1), "audio");
  assert.equal(h.sources.length, 1);
  h.clock.advance(1);
  assert.equal(h.finishes, 1);
});

test("a timeout falls back once, while muting a pending load never warns", async () => {
  for (const muted of [false, true]) {
    const pending = deferred<Response>();
    const h = harness(async () => pending.promise);
    h.player.play(h.request);
    if (muted) h.player.setVolume(0);
    h.clock.advance(.1);
    assert.deepEqual(h.failures, muted ? [] : [{ message: NARRATION_MESSAGES.timeout, retryable: true }]);
    pending.resolve(new Response(new ArrayBuffer(2)));
    await settled();
    h.clock.advance(1);
    assert.equal(h.sources.length, 0);
    assert.equal(h.finishes, 1);
  }
});

test("authored normal/fine variants use matching continuous narration for both voices", () => {
  for (const passage of PASSAGES) for (const voice of ["female", "male"] as const) {
    const track = NARRATION[passage.id]?.[voice];
    assert.ok(track, `${passage.id}/${voice}`);
    for (const fragments of [passage.fragments, passage.hardFragments ?? passage.fragments]) {
      assert.equal(buildNarrationPlan(track, fragments, fragments.length).end, track.duration);
      assert.equal(buildNarrationPlan(track, fragments, 1).safeToPlay, true);
    }
  }
});

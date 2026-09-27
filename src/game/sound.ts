import Phaser from "phaser";
import type { JoinEvent } from "./model.ts";

type Cue = JoinEvent | "lift" | "land";
const notes: Partial<Record<Cue, number[]>> = {
  lift: [0], land: [0], tentative: [0], split: [0], undo: [0],
  new: [523, 659], extend: [659], bridge: [523, 659, 784], complete: [523, 659, 784, 1047],
};

// Small original PCM cues, owned by Phaser's existing sound manager. No second
// audio runtime, network samples, or sound-completion-driven state changes.
export function prepareSounds(scene: Phaser.Scene): boolean {
  if (!(scene.sound instanceof Phaser.Sound.WebAudioSoundManager)) return false;
  const context = scene.sound.context;
  for (const [name, pitches] of Object.entries(notes)) {
    const key = `paper-${name}`;
    if (scene.cache.audio.exists(key)) continue;
    const duration = pitches.length * .07 + .14;
    const buffer = context.createBuffer(1, Math.ceil(duration * context.sampleRate), context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < channel.length; i++) {
      const t = i / context.sampleRate;
      let sample = 0;
      pitches.forEach((pitch, index) => {
        const age = t - index * .07;
        if (age < 0) return;
        const envelope = Math.min(1, age * 600) * Math.exp(-age * (pitch ? 24 : 75));
        const wave = pitch ? Math.sin(2 * Math.PI * pitch * age) + .2 * Math.sin(2 * Math.PI * pitch * 2 * age) : (Math.random() - .5);
        sample += wave * envelope * (pitch ? .12 : .09);
      });
      channel[i] = sample;
    }
    scene.cache.audio.add(key, buffer);
  }
  return true;
}

export function playCue(scene: Phaser.Scene, cue: Cue, volume: number): void {
  if (volume <= 0 || !notes[cue] || !scene.cache.audio.exists(`paper-${cue}`)) return;
  scene.sound.play(`paper-${cue}`, { volume });
}

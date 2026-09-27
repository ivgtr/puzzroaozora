// Original synthesized paper/ringing cues. No external recordings or runtime synth.
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('public/audio', { recursive: true });
for (const [name, seconds, notes] of [['place', 0.075, [240]], ['join', 0.32, [660, 990]], ['complete', 0.65, [523.25, 659.25, 783.99]]]) {
  const rate = 22050, count = Math.ceil(seconds * rate);
  const data = Buffer.alloc(44 + count * 2);
  data.write('RIFF', 0); data.writeUInt32LE(36 + count * 2, 4); data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
  data.write('data', 36); data.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; i++) {
    const t = i / rate;
    const envelope = Math.min(1, t / 0.008) * Math.exp(-7 * t / seconds) * (1 - t / seconds);
    const wave = notes.reduce((sum, frequency, n) => sum + Math.sin(2 * Math.PI * frequency * t + n * 0.2), 0) / notes.length;
    data.writeInt16LE(Math.round(wave * envelope * 11000), 44 + i * 2);
  }
  await writeFile(`public/audio/${name}.wav`, data);
}

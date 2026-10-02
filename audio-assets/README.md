# 青空パズル narration assets

These are real, continuous synthetic Japanese readings generated with **Irodori-TTS v4.1 Small**. Each passage has one female and one male master; normal and hard modes use different groups of cue points in the **same recording**. There are no concatenated per-fragment clips and no browser-TTS replacements.

- `masters/`: 48 kHz mono, signed 16-bit PCM WAV files
- `requests.json`: original text, reviewed hard fragments/readings, normal groups, source links and speech-only pronunciation text
- `provenance.json`: shared exact sampling settings/model revisions and compact per-clip hashes, durations, seeds and saved-watermark checks
- `cues.json`: final cue ends/safe flags and one compact qualification summary per clip
- `licenses/`: attribution and model/code license notice

The two `lemon-opening-v4` masters were first created without a human reference, from generic fictional female/male captions. Every other master uses the corresponding synthetic master as its reference. No real person's voice was uploaded or cloned.

Irodori's official SilentCipher watermarking stage is required for generation. It is not disabled or intentionally removed. WAV saving only attenuates excessive peaks uniformly before PCM16 quantization. Saved WAV watermark detection is recorded per clip as `watermarkVerified` in `provenance.json`; `enabled` alone is not a detection claim. Detailed runtime/alignment traces stay outside the repository.

These files are intentionally excluded from Vercel by `.vercelignore`; the application uses immutable GitHub raw URLs pinned in `src/data/narration.ts`. Never move/copy the WAVs into `public/` or import them as application modules.

See [`../docs/narration.md`](../docs/narration.md) for reproduction, alignment limitations and deployment instructions.

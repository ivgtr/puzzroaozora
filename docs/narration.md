# Continuous narration pipeline

## Contract

Each curated passage has **two real continuous master WAVs**, female and male, rather than separately generated pieces. Normal/hard modes refer to the same audio and differ only in contiguous groups of the finest reviewed textual boundaries. A source is started once for the selected continuous range; no fragment-level stitching is needed.

`src/data/narration.ts` exports `NARRATION`, `NarrationVoice`, `NarrationClip`, and `NarrationCue`. Cue text must exactly cover the canonical source after the game’s comparison normalization. A cue’s `safeEnd` is fail-closed: a partial reading may stop there only when the acoustic boundary is qualified. The final cue is safe because it ends the complete master. Seek/restart positions must also be qualified boundaries and remain within the historical confirmed prefix.

A machine-qualified gap is not the same as human listening. `cues.json` states `listeningVerified: false` and preserves a compact gap/qualification summary; detailed CTC brackets and waveforms remain in external audit state. No claim of human listening is made by the scripts. See the final qualification summary below.

## Pinned runtime

- Irodori code `89f9d8fbd4d51ea019867ee1197725ede1df13c5`
- Irodori-TTS-v4.1-Small model `2b28324dc263ed5e6638b3cf3dd94c82ead07b4b`
- Semantic-DACVAE-Japanese-32dim codec `47376ee24834d7a05a48ebabfe3cde29b3c5e214`
- Japanese XLSR CTC alignment model `cf031e020336460d15a417eba710bbc5bb43be9a`
- Python 3.10.21; PyTorch/torchaudio 2.10.0+cpu; transformers 5.12.1
- CPU FP32, 8 inference threads, 40 RF steps, automatic duration (30-second maximum), text/caption CFG 3, reference speaker CFG 5
- Generic synthetic seed narrators: female seed 20261002, male seed 20261003. Later deterministic seeds, full requests and reference hashes are in `provenance.json`
- SilentCipher enabled; generation fails if its backend is unavailable

Use the official pinned Irodori checkout and its unchanged upstream dependency lock, installed with `uv sync --frozen --extra cpu`. Download the exact pinned model/codec snapshots through their official Hugging Face repositories first. No model download or remote code is performed by our scripts. Do not substitute a similarly named checkpoint or execute arbitrary downloaded model Python.

## Reproduce

Run from the repository using the official Irodori environment:

```sh
/path/to/Irodori-TTS/.venv/bin/python scripts/generate-narration.py \
  --irodori-root /path/to/Irodori-TTS \
  --checkpoint /path/to/hf-cache/hub/models--Aratako--Irodori-TTS-v4.1-Small/snapshots/2b28324dc263ed5e6638b3cf3dd94c82ead07b4b/model.safetensors \
  --hf-home /path/to/hf-cache \
  --state-dir /path/to/scratch/narration-state

/path/to/Irodori-TTS/.venv/bin/python scripts/align-narration.py \
  --model-dir /path/to/hf-cache/hub/models--jonatasgrosman--wav2vec2-large-xlsr-53-japanese/snapshots/cf031e020336460d15a417eba710bbc5bb43be9a \
  --state-dir /path/to/scratch/narration-state
```

To verify the watermark in saved WAV bytes, add `--watermark-model-dir /path/to/hf-cache/hub/models--sony--silentcipher/snapshots/a1c4d021905e0dc5b24be5f68db5fc4dba410ee1` to the alignment command. This uses the exact local Sony model, decodes the expected IRDTS payload, and records the small result in `provenance.json`; detailed decoder output stays in external state. Existing matching successful checks are reused.

Keep the checkpoint filename ending in `.safetensors` (do not resolve the Hugging Face snapshot symlink to its extensionless blob). Existing assets resume only when both their bytes and generation input fingerprints match. Without existing masters, the lemon seed voices are generated first, then used as fixed synthetic references. `--ids` allows a bounded rerun; regenerate a seed before changing dependent clips. Verbose resumable reports, CTC token traces, and decoder checks belong in `--state-dir` (default: a temporary directory), never in the Git repository. Identical seeds/settings improve reproducibility but do not guarantee byte-identical output across different runtime/hardware versions.

Generation is deliberately sequential. Do not run TTS and CTC model inference together on an 8–10 GiB machine. An external supervising process should keep at least 550 MiB host reserve and stop its own generation worker if RSS exceeds 7.5 GiB; resume from the saved manifest after investigating. Generation logs/model caches should remain outside the repository.

## Text and acoustic alignment

1. Editorial `original` and `fragments[].text` preserve the source. `speechText` changes only pronunciation spelling and speech punctuation. `fragments[].reading` records the reviewed kana reading separately.
2. Every original fragment boundary maps to a speech-text boundary without interpolation. A boundary inside a spelling replacement is rejected.
3. The full continuous waveform is passed once through the pinned Japanese CTC model, then force-aligned against the known synthesis text. Explicit recorded replacements cover out-of-vocabulary lexical items; no spoken character is silently dropped.
4. CTC token spikes locate neighborhoods, not complete phoneme edges. Within each preceding/following token bracket, 10 ms RMS windows locate low-energy gaps. A gap of at least 80 ms plus 25 ms margins qualifies a machine candidate. Short/no-gap points remain `review_needed`, even if an attractive waveform minimum exists.
5. Unsafe seams are resolved editorially by grouping continuous phrases or moving the split to an existing meaningful pause. A speech-only punctuation change and selective master regeneration is an alternative if editorially justified. The full source text is never shortened just to satisfy a timestamp heuristic.
6. Exact PCM reassembly verifies that the cue ranges cover the unchanged master with no dropped or duplicated samples. This is an integrity check, not a pronunciation/perception check.

CTC blank frames are not silence; silence can be a stop-consonant closure. The strict waveform heuristic and textual context reduce risk but cannot establish a universal perceptual guarantee. Human review remains valuable, especially for difficult names/readings. The app must never turn an unqualified prefix boundary into a permissive playback stop.

## Asset publication

1. Commit `audio-assets/` independently (with script/document changes as desired)
2. Record that immutable commit’s full SHA in `NARRATION_ASSET_REVISION`
3. Commit the manifest and app integration in a later commit
4. Fetch representative raw URLs and verify they return the intended WAV bytes/hash before publishing the app

The URL shape is `https://raw.githubusercontent.com/ivgtr/puzzroaozora/<asset-commit>/audio-assets/masters/<passage>-<voice>.wav`. `.vercelignore` excludes `audio-assets/**`, and no local `/public` fallback is allowed. This keeps 52.66 MiB of audio out of the Vercel deployment while retaining normal Git versioning. The repository must remain publicly readable for unauthenticated players.

## Final qualification summary

All **30/30 masters** (15 excerpts × 2 voices) passed saved-file SHA-256, PCM-format, finite/non-silent signal, peak-safety, exact cue-partition reconstruction and tail-margin checks. The files total **55,216,680 bytes (52.66 MiB)** and **575.16 seconds**. Individual natural readings span **12.24–26.20 seconds**; concise complete scenes are deliberately shorter than the soft 20–25-second target, with no padding or time stretching. Neither glass reading hit the 30-second cap, and both decoded tails include the final phrase.

All **186 internal boundaries** are waveform-gap-qualified, plus 30 complete-master ends (**216 safe cue ends total**). The shortest measured qualifying gap is **246 ms**. The shortest-gap example from each work/voice combination was also visually inspected on its waveform. Editorial grouping resolved every initially ambiguous seam; no unsafe prefix boundary remains in the delivered manifest. Normal and hard modes share these masters.

All **30/30 saved PCM WAVs** independently decoded the expected SilentCipher IRDTS payload after any peak attenuation and PCM16 saving. Exact model/code revisions and voice-reference hashes are retained in the compact provenance. **Human listening was not performed by this pipeline**; acoustic qualification, ASR-tail checks and watermark detection are not a claim of perfect pronunciation or perceptual quality.


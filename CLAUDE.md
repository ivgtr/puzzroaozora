# Repository guide

Next.js Pages Router hosts a Phaser 4 manuscript reconstruction game. Read README.md and the current specifications in 計画/ before changing behavior. The 2026-10-02 finite-run/narration design (Issues #7–10) supersedes the earlier no-lives, per-question hints, long excerpts, and completion-source-unlock rules.

## Constraints

- `Run` owns the finite work deck, three shared lives, one shared hint, immutable submissions, and validated resume state. It owns the engine-independent `Session` for the current puzzle. Phaser owns Run; React only projects snapshots and owns the mount
- Keep the exact title 青空パズル and the three works: 吾輩は猫である 4, 檸檬 7, 銀河鉄道の夜 4. Fifteen contiguous, source-verified short excerpts. Natural reading around 20–25 seconds is a soft target, not a forced character cap
- Normal/hard use authored meaningful divisions of the same text and audio. Counts are guidance, not fixed quotas. Never split particles mechanically, infer difficulty from legacy import thresholds, or restore initial memorization screens
- Every ordinary join remains provisional with identical feedback. Only a complete one-chain submission judges the exact original order. The correct whole-tile prefix may be revealed by that submission; stop before the first wrong tile, then detach the intact unjudged suffix. No ordinary join exposes correctness
- Book each submission once before asynchronous audio/animation. Settlement is durable and idempotent. Undo cannot refund lives/hints or cross submission boundaries. No puzzle skipping or re-drawing within a run. All cleared ends the work; zero lives ends the challenge
- Hints remain explicit successor reveals without joining or camera jumps. Cancellation, unavailable successors, and repeats are free. Keep the existing source/target marks and explicit context navigation
- Source/original review opens only after run end. A completed puzzle may display the player's assembled text. Resume preserves the board, deck, budgets and pending result, without unlocking source links
- Use continuous pre-generated Irodori male/female masters. Original text and speech reading are separate. Cues come from known-text alignment and waveform review, never proportional character timestamps. Stop risky unverified cuts with a disclosed visual fallback; do not call uncertain audio boundaries verified
- Keep audio in audio-assets/, outside public/ and imports. `.vercelignore` excludes it. Runtime has one centralized immutable raw GitHub base URL. Preserve watermark and license/ethical notices. Never commit models, caches or generated font binaries
- Selection is one paper invitation on the desk, controls are plain and compact, and the paper play area remains primary. No dashboard/bookshelf, fake decorative books or generic scoring layer
- Existing IndexedDB records stay untouched and read-only. Imports/reimports remain paused. Never migrate, overwrite, decrypt, silently substitute or route archived data into current play
- Solve content ambiguity editorially; exact original order is the goal, not judging alternative Japanese as incorrect. Layout/DPI/graphemes never change comparison text. No language-model answer judging, approximate acceptance, answer-submit APIs, or parallel DOM game
- Node built-in tests, typecheck, lint, build and representative play are enough. Do not add permanent browser/seed-sweep CI or network-source tests. Keep executed checks brief in the draft PR; no accumulated screenshots/logs/workflows
- Implementation and draft PR are authorized; merging or deploying main is not

## Commands

Node 22; `npm ci`, `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`. Development serves port 5678. `AOZORA_API_BASE_URL` does not enable the paused import flow.

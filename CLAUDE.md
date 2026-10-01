# Repository guide

This is a Next.js Pages Router host for a Phaser 4 manuscript reconstruction game. Read README.md and the three current game, UI, and source-data specifications in 計画/ before changing behavior. The second redesign (2026-10-01) supersedes the initial-reading, difficulty-threshold, and confirmed-join rules. The 2024 directory-structure proposal and prior verification entries are historical, not current requirements.

## Constraints

- The engine-independent `Session` in `src/game/model.ts` is the single authoritative puzzle state. Phaser owns one session. React only projects snapshots and owns the mount.
- Keep the current three works: four editor-curated excerpts for 吾輩は猫である, seven for 檸檬, and four for 銀河鉄道の夜 (15 total), selected randomly without an immediate repeat within that work. Preserve 8–12 meaningful chunks per scene. Choose excerpts for literary value and source-position coverage, not equal counts or equal thirds. `makeProblem` accepts only `curatedVersion: 1` passages and creates `Problem` v3. Existing saved/imported passages are not implicitly eligible.
- Every join is provisional and gives identical feedback regardless of correctness. Never check partial joins or lock seams. Reveal a correct neighbor only through the player-requested, three-use hint described below. Never encode original positions in IDs, paper patterns, layout, sound, or accessibility output. Identical text remains interchangeable.
- Check exact original order only when the player explicitly chooses 読み通す after assembling all chunks into one chain. A mismatch preserves the arrangement and gives no seam-level feedback. A successful join alone never completes the scene.
- Keep split and Undo. The explicit hint action selects a chain and highlights the successor of its last tile without joining it or validating the chain. Three unique reveals per Session; cancellation, unavailable successors, and repeated reveals are free. Undo never refunds uses; only a new attempt resets them. Authored semantic clues remain under 遊び方 → 読む手掛かり and do not reveal exact seams. No initial reading, difficulty selector, or original/source-link access before completion.
- Selection is one paper invitation on the same desk, with small edge controls. Completion reveals the original manuscript and source. Do not bring back a dashboard or bookshelf selection surface.
- Existing IndexedDB records remain untouched and are listed read-only. Imports and reimports are explicitly paused; do not migrate, delete, overwrite, decrypt, silently substitute, or route old data into new play. Retain dormant source/import utilities without expanding infrastructure.
- Solve ambiguity through passage and chunk curation, not grammar engines, language-model judging, or approximate-answer acceptance. Layout, DPI, line breaks, and blank manuscript cells never change comparison text. Use graphemes for visual boundaries.
- Do not silently replace source text, spellings, missing glyphs, unavailable APIs, or a failed renderer. Report the failure. Do not add scoring, answer-submit APIs, a parallel DOM game, or a generic engine abstraction.
- Use built-in Node tests for a few invariants. Do not expand permanent CI with large seed sweeps, browsers, or source-network requests. Fonts come from pinned packages during predev/prebuild; do not commit font binaries.
- Record only executed checks, briefly in the PR body. Do not accumulate screenshots, verification logs, or temporary QA workflows in the repository. Human legibility, play balance, and listening remain separate from automated checks.
- Keep PR #6 in draft. No merge or production deployment is authorized by this redesign work.

## Commands

Node 22; `npm ci`, `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`. `npm run dev` serves port 5678. `AOZORA_API_BASE_URL` belongs to dormant import utilities; it does not enable imports in the current game.

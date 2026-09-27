# Repository guide

This is a Next.js Pages Router host for a Phaser 4 manuscript jigsaw game. Read README.md and the three current specifications in 計画/ before changing game behavior.

## Constraints

- The engine-independent `Session` in `src/game/model.ts` is the single authoritative puzzle state. Phaser owns one session. React only projects snapshots, owns the mount, and supplies the native import input.
- Never assign correct-order tile IDs or unique occurrence positions to visually identical tiles. Confirmed blocks must admit reconstruction of the entire original with remaining tiles.
- A hypothesis stays visible when it does not confirm. Only tentative seams can split; Undo is the deliberate way to roll back confirmed joins.
- Do not silently replace source text, spellings, missing glyphs, short passages, unavailable APIs, or a failed renderer. Report failure and let the player choose/retry.
- Do not add scoring, answer-submit APIs, a parallel DOM game, a generic engine abstraction, or a migration/decryption fallback for the previous encrypted excerpts.
- Layout, DPI, line breaks, and blank manuscript cells never change puzzle identity or comparison text. Use graphemes, not UTF-16 slicing, for visual text boundaries.
- Use built-in Node tests for a few invariants. A new edge-case test does not imply adding it, large seed sweeps, browsers, or source-network requests to permanent CI.
- Fonts are generated during predev/prebuild from pinned packages; do not commit font binaries. Human legibility/play balance/listening are separate from automated checks.

## Commands

Node 22; `npm ci`, `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`. `npm run dev` serves port 5678. Existing source API integration uses `AOZORA_API_BASE_URL` only for explicit import requests.

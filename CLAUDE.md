# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

青空パズル（Aozora Puzzle） — 青空文庫の文学作品から抜粋した一節を並び替えるワードパズルゲーム。Next.js (Pages Router) + TypeScript + Tailwind CSS v4 で構成。

外部APIとして libroaozora（青空文庫データ取得）を使用し、API不通時は `src/data/fallbackBooks.ts` のハードコードデータにフォールバックする。

## コマンド

```bash
npm run dev          # 開発サーバー (Turbopack, port 5678)
npm run build        # プロダクションビルド
npm start            # プロダクションサーバー
npm run lint         # ESLint
```

## 環境変数

`.env.example` を参照。必須: `AOZORA_API_BASE_URL`。`PUZZLE_TOKEN_SECRET` は未設定時にdev用デフォルト値が使われる。

## アーキテクチャ

### データフロー

1. **書籍一覧**: `GET /api/books/list` → `lib/aozora/client.ts` → libroaozora API (失敗時 fallbackBooks)
2. **パズル生成**: `GET /api/puzzle/generate` → `lib/puzzle/generator.ts` が本文取得→テキスト正規化→一節抽出→分割→シャッフル→HMAC署名トークン生成
3. **回答送信**: `POST /api/puzzle/submit` → トークン検証→正答判定→スコア計算

### 主要モジュール

- **`lib/aozora/cleaner.ts`** — 青空文庫テキストの正規化（ルビ除去、注記除去、ヘッダー/フッター除去）
- **`lib/puzzle/segmenter.ts`** — テキストをチャンク分割。品詞推定はヒューリスティック（形態素解析ではない）
- **`lib/puzzle/answerToken.ts`** — HMAC-SHA256による回答トークン生成・検証（改ざん防止）
- **`lib/puzzle/random.ts`** — シード付きRNG（xmur3 + mulberry32）で決定論的パズル生成
- **`lib/puzzle/difficulty.ts`** — 難易度設定（easy/normal/hard）。文字数範囲・セグメント数・制限時間を定義

### フロントエンド

`src/pages/index.tsx` に全ゲームロジックが集約。状態管理はReact hooksのみ（外部ライブラリなし）。CSSカスタムプロパティでライト/ダークモード対応。

### 型定義

- `src/types/puzzle.ts` — パズル関連型（PuzzleData, AnswerData, ResultData, Difficulty, PartOfSpeech）
- `src/types/libro.ts` — libroaozora API型

## 技術スタック

- React 19 / Next.js 15 (Pages Router) / TypeScript 5
- Tailwind CSS v4 (@tailwindcss/postcss)
- ESLint 9
- テストフレームワークは未導入

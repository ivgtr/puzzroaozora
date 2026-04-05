# 青空パズル（puzzroaozora）

青空文庫の文学作品から抜粋した一節を並び替えるワードパズルゲーム。

[libroaozora](https://github.com/ivgtr/libroaozora) の API を利用して作品一覧と本文を取得します。API 不通時は内蔵フォールバック作品で動作します。

## セットアップ

```bash
npm install
cp .env.example .env.local
npm run dev
```

開発サーバー: http://localhost:5678

## コマンド

| コマンド        | 説明                           |
| --------------- | ------------------------------ |
| `npm run dev`   | 開発サーバー (Turbopack, 5678) |
| `npm run build` | プロダクションビルド           |
| `npm start`     | プロダクションサーバー         |
| `npm run lint`  | ESLint                         |

## 環境変数

| 変数                  | 必須 | 説明                                       |
| --------------------- | ---- | ------------------------------------------ |
| `AOZORA_API_BASE_URL` | Yes  | libroaozora API のベース URL               |
| `PUZZLE_TOKEN_SECRET`  | No   | 解答トークン署名キー（未指定時は開発用既定値） |

## 技術スタック

- Next.js 15 (Pages Router) / React 19 / TypeScript 5
- Tailwind CSS v4

<div align="center">

# 青空パズル

青空文庫の文学作品から抜粋した一節を並び替えるワードパズルゲーム

[Demo](https://puzzroaozora.vercel.app/)

</div>

作品データの取得に [libroaozora](https://github.com/ivgtr/libroaozora) を利用しています。

## セットアップ

```bash
npm install
cp .env.example .env.local
npm run dev
```

## コマンド

| コマンド        | 説明                           |
| --------------- | ------------------------------ |
| `npm run dev`   | 開発サーバー (Turbopack, 5678) |
| `npm run build` | プロダクションビルド           |
| `npm start`     | プロダクションサーバー         |
| `npm run lint`  | ESLint                         |

## 環境変数

| 変数                  | 必須 | 説明                                         |
| --------------------- | ---- | -------------------------------------------- |
| `AOZORA_API_BASE_URL` | Yes  | libroaozora API のベース URL                 |
| `PUZZLE_TOKEN_SECRET`  | No   | 解答トークン署名キー（未指定時は開発用既定値） |

## ライセンス

MIT ©[ivgtr](https://github.com/ivgtr)

# 青空パズル（puzzroaozora）

青空文庫作品の一節を語句パズル化し、語順再構成で記憶力を鍛える Next.js アプリです。  
`libroaozora`（https://github.com/ivgtr/libroaozora）の API を利用して作品一覧と本文を取得します。

## 現在の実装範囲

- 作品一覧取得: `GET /api/books/list`
- パズル生成: `GET /api/puzzle/generate`
- 解答判定: `POST /api/puzzle/submit`
- ヘルスチェック: `GET /api/health`
- UI: 難易度選択、作品選択、語句配置、並び替え、採点結果表示

`AOZORA_API_BASE_URL` に接続できない場合は、内蔵フォールバック作品で動作します。

## セットアップ

```bash
npm install
cp .env.example .env.local
npm run dev
```

開発サーバー: `http://localhost:5678`

## 環境変数

- `AOZORA_API_BASE_URL`: libroaozora API のベース URL（例: `http://localhost:8787`）
- `PUZZLE_TOKEN_SECRET`: 解答トークン署名キー（任意、未指定時は開発用既定値）

## API 仕様（このリポジトリ側）

### `GET /api/books/list`

クエリ:
- `limit` (number, optional)
- `offset` (number, optional)
- `author` (string, optional)

レスポンス:
- `success: true`
- `data.books`: 作品配列
- `data.total`: 総件数
- `data.hasMore`: 次ページ有無
- `data.source`: `api` または `fallback`

### `GET /api/puzzle/generate`

クエリ:
- `bookId` (string, optional)
- `difficulty` (`easy` | `normal` | `hard`)
- `seed` (string, optional)

レスポンス:
- `success: true`
- `data`: パズル本体（語句配列、シャッフル配列、`answerToken` を含む）

### `POST /api/puzzle/submit`

ボディ:

```json
{
  "answer": {
    "puzzleId": "...",
    "userAnswer": ["seg-..."],
    "startedAt": "2026-04-05T00:00:00.000Z",
    "submittedAt": "2026-04-05T00:00:12.000Z",
    "timeSpent": 12,
    "answerToken": "..."
  }
}
```

レスポンス:
- `success: true`
- `data.isCorrect`, `data.score`, `data.correctPositions` など

## 備考

- `libroaozora` の `GET /v1/works` / `GET /v1/works/:id/content?format=plain` を利用
- 青空文庫の注記（ルビ・注釈・ヘッダ/フッタ）を簡易正規化してパズル化
- 品詞は厳密な形態素解析ではなく、現在はヒューリスティック分類

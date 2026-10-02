# 青空パズル

青空文庫の一場面を、ばらばらの紙片から原文の順序へつなぎ直すブラウザゲーム。つないだ文章を朗読で確かめながら、3ライフで何問読み通せるかに挑みます。

[ブラウザで遊ぶ](https://puzzroaozora.vercel.app/)

『吾輩は猫である』『檸檬』『銀河鉄道の夜』の3作品・15問を収録しています。詳しい操作はゲーム内の「遊び方」を参照してください。

## 開発

Next.js / React / Phaserで実装しています。Node.js 22系の最新パッチ版を使用します。

```sh
npm ci
npm run dev       # http://localhost:5678
```

書体は起動・ビルド時に自動生成します。環境変数の設定は不要です。

```sh
npm test
npm run lint
npm run typecheck
npm run build
npm start         # ビルド後の本番モードで起動
```

朗読音声は事前生成済みで、Vercelには含めずGitHubから配信します。音声を更新する場合は[生成・配信手順](docs/narration.md)を参照してください。

## 出典・クレジット

- 本文：[青空文庫](https://www.aozora.gr.jp/)。各作品の出典は[抜粋の選定方針](docs/passage-curation.md)に記載しています
- 朗読：Irodori-TTSによる合成音声。[生成元・利用条件](audio-assets/licenses/ATTRIBUTION.md)
- 書体：Noto Serif JP / Noto Sans JP（SIL OFL）。ライセンスは書体生成時に `public/fonts/` へ同梱します
- ライブラリ：[第三者ライセンス](public/third-party-notices.txt)

# UIデザイン仕様書

## 1. 概要

本書は、青空パズルゲームのUI設計仕様を定義します。
日本近代文学の格調と美しさを表現し、活版印刷時代の趣を現代的に解釈したデザインを採用します。

## 2. デザインコンセプト

### 2.1 基本方針
- **文学的品格**: 日本近代文学の格調高さを表現
- **端正な美しさ**: 明朝体を基調とした落ち着いた佇まい
- **読みやすさ**: 縦書き文学を意識した文字組みと余白設計
- **静謐な操作感**: 派手な演出を抑えた上品なインタラクション
- **時代性**: 大正・昭和初期の活版印刷を思わせる質感

### 2.2 カラーテーマ

#### メインカラー
- **背景**: 和紙のような温かみのあるオフホワイト（#FAF8F3）
- **文字**: 墨色に近い濃紺（#2C3E50）
- **罫線**: 薄墨色（#95A5A6）

#### 品詞別カラー（彩度を抑えた和色）
- **基調**: 日本の伝統色をベースに、彩度を抑えた上品な配色
- **統一感**: 全体的にトーンを揃え、落ち着いた印象を保持

#### アクセントカラー
- **正解**: 深緑（#27AE60）- 松葉色
- **不正解**: 朱赤（#C0392B）- 紅殻色
- **情報**: 藍色（#2980B9）- 瑠璃紺

## 3. レイアウト構造

```
╔═══════════════════════════════════════════════╗
║                                               ║
║         青 空 パ ズ ル                        ║
║         夏目漱石「吾輩は猫である」            ║
║                                               ║
║     [入門] [通常] [達人]   得点: 〇〇〇      ║
║                                               ║
╠═══════════════════════════════════════════════╣
║                                               ║
║     問題 壱 / 拾                             ║
║                                               ║
║     ┌──────────────────────┐    ║
║     │                                    │    ║
║     │     （解答欄）                     │    ║
║     │                                    │    ║
║     └──────────────────────┘    ║
║                                               ║
║     ～～～～～～～～～～～～～～～～～～     ║
║                                               ║
║     【吾】【輩】【は】【猫】【で】         ║
║     【あ】【る】【。】                     ║
║                                               ║
║     ～～～～～～～～～～～～～～～～～～     ║
║                                               ║
║        [消去]    [答合]    [跳過]           ║
║                                               ║
╚═══════════════════════════════════════════════╝
```

## 4. コンポーネント詳細設計

### 4.1 GameHeader

#### デザイン仕様
- **高さ**: 80px
- **背景**: 和紙テクスチャを想起させるグラデーション
- **境界線**: 下部に2px の筆線風ボーダー
- **フォント**: 游明朝体または同等の明朝体

#### 要素配置
```
青空パズル －○○○○－ （作品名・著者名）
[入門] [通常] [達人]  |  得点: 〇〇〇
```

#### バッジスタイル
```css
.difficulty-badge {
  background: transparent;
  color: #2C3E50;
  border: 1px solid #7F8C8D;
  padding: 6px 16px;
  border-radius: 4px;
  font-size: 14px;
  font-family: 'Yu Mincho', serif;
  letter-spacing: 0.1em;
}

.difficulty-badge.active {
  background: #2C3E50;
  color: #FAF8F3;
  border-color: #2C3E50;
}

.mode-badge {
  background: transparent;
  color: #546E7A;
  border: 1px solid #90A4AE;
  padding: 6px 16px;
  border-radius: 4px;
  font-size: 13px;
  font-family: 'Yu Mincho', serif;
}
```

### 4.2 GameInfoBar

#### デザイン仕様
- **高さ**: 50px
- **レイアウト**: Flexbox（両端揃え）
- **フォントサイズ**: 14px

#### 要素
- **左側**: 問題番号（例：問題: 1/10）
- **中央**: 現在の得点（例：現在の得点: 0.00）
- **右側**: トグルスイッチ群

### 4.3 AnswerArea（ドロップゾーン）

#### デザイン仕様
```css
.answer-area {
  min-height: 100px;
  margin: 30px 20px;
  padding: 20px;
  border: 1px solid #B0B0B0;
  border-radius: 2px;
  background: linear-gradient(180deg, #FFFFFF 0%, #FAF8F3 100%);
  box-shadow: inset 0 1px 3px rgba(0,0,0,0.05);
  transition: all 0.2s ease;
  position: relative;
}

/* 原稿用紙風の罫線 */
.answer-area::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 20px;
  right: 20px;
  height: 1px;
  background: repeating-linear-gradient(
    90deg,
    transparent,
    transparent 10px,
    #E0E0E0 10px,
    #E0E0E0 11px
  );
  pointer-events: none;
}

.answer-area.drag-over {
  border-color: #546E7A;
  background: linear-gradient(180deg, #FAFAFA 0%, #F5F3F0 100%);
}

.answer-area.has-items {
  border-color: #2C3E50;
}
```

#### プレースホルダー
```css
.placeholder-text {
  color: #999;
  text-align: center;
  font-size: 14px;
}
```

### 4.4 SegmentChip（形態素チップ）

#### デザイン仕様
```css
.segment-chip {
  display: inline-block;
  padding: 10px 20px;
  margin: 6px;
  border: 1px solid rgba(0,0,0,0.1);
  border-radius: 4px;
  font-size: 18px;
  font-family: 'Yu Mincho', 'Hiragino Mincho Pro', serif;
  font-weight: normal;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
  position: relative;
}

/* 筆文字風の微妙な傾き */
.segment-chip::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, transparent 0%, rgba(255,255,255,0.3) 100%);
  border-radius: 4px;
  pointer-events: none;
}

.segment-chip:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 6px rgba(0,0,0,0.12);
}

.segment-chip.selected {
  opacity: 0.4;
  cursor: not-allowed;
  border-style: dashed;
}
```

#### 品詞別カラーパレット（日本の伝統色）

| 品詞 | 背景色 | 文字色 | 伝統色名 | 意味 |
|------|--------|--------|----------|------|
| 名詞 | #E8D4A1 | #4A4A4A | 黄朽葉 | 事物の基盤 |
| 動詞 | #C8A882 | #4A4A4A | 胡桃色 | 動作の温かみ |
| 形容詞 | #9B90B6 | #FFFFFF | 藤色 | 修飾の優雅さ |
| 助詞 | #7BA7BC | #FFFFFF | 浅縹 | 文をつなぐ静けさ |
| 助動詞 | #86A697 | #FFFFFF | 青磁色 | 補助の調和 |
| 副詞 | #91AD70 | #4A4A4A | 柳葉色 | 修飾の自然さ |
| 連体詞 | #C4A06F | #4A4A4A | 枯色 | 連体の落ち着き |
| 接続詞 | #A08072 | #FFFFFF | 茶鼠 | 接続の渋み |
| 感動詞 | #B88B7A | #4A4A4A | 赤香色 | 感情の温もり |
| 記号 | #B5B5B5 | #4A4A4A | 灰白色 | 記号の中立性 |
| その他 | #D4D4D4 | #4A4A4A | 素鼠 | 標準 |

### 4.5 GameActions（アクションボタン）

#### ボタンスタイル
```css
.action-button {
  padding: 12px 28px;
  margin: 10px;
  border: 1px solid #7F8C8D;
  border-radius: 2px;
  font-size: 16px;
  font-family: 'Yu Mincho', serif;
  font-weight: normal;
  letter-spacing: 0.15em;
  cursor: pointer;
  transition: all 0.15s ease;
  background: transparent;
  color: #2C3E50;
}

.action-button:hover {
  background: #2C3E50;
  color: #FAF8F3;
  border-color: #2C3E50;
}

.clear-button {
  border-color: #95A5A6;
  color: #7F8C8D;
}

.clear-button:hover {
  background: #7F8C8D;
  color: #FFFFFF;
}

.submit-button {
  background: #2C3E50;
  color: #FAF8F3;
  font-size: 18px;
  padding: 14px 36px;
  border-color: #2C3E50;
}

.submit-button:hover {
  background: #1A252F;
  border-color: #1A252F;
}

.skip-button {
  border-color: #7F8C8D;
  color: #546E7A;
}

.skip-button:hover {
  background: #546E7A;
  color: #FAF8F3;
}

.action-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

### 4.6 ToggleSwitch

#### デザイン仕様
```css
.toggle-container {
  display: inline-flex;
  align-items: center;
  margin: 0 8px;
}

.toggle-label {
  margin-right: 8px;
  font-size: 14px;
}

.toggle-switch {
  width: 44px;
  height: 24px;
  background: #CCC;
  border-radius: 12px;
  position: relative;
  cursor: pointer;
  transition: background 0.3s;
}

.toggle-switch.active {
  background: #4CAF50;
}

.toggle-knob {
  width: 20px;
  height: 20px;
  background: white;
  border-radius: 50%;
  position: absolute;
  top: 2px;
  left: 2px;
  transition: transform 0.3s;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
}

.toggle-switch.active .toggle-knob {
  transform: translateX(20px);
}
```

## 5. アニメーション仕様

### 5.1 形態素選択時
```css
@keyframes chip-select {
  0% { transform: scale(1); }
  50% { transform: scale(1.1); }
  100% { transform: scale(1) translateY(-20px); opacity: 0; }
}

.segment-chip.selecting {
  animation: chip-select 0.3s ease-out;
}
```

### 5.2 配置時
```css
@keyframes chip-place {
  0% { transform: scale(0.8); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}

.placed-chip {
  animation: chip-place 0.2s ease-out;
}
```

### 5.3 正解時
```css
@keyframes success-fade {
  0% { 
    opacity: 0;
    border-color: #27AE60;
  }
  50% { 
    opacity: 0.3;
    background-color: rgba(39, 174, 96, 0.05);
  }
  100% { 
    opacity: 1;
    background-color: transparent;
  }
}

.success {
  animation: success-fade 0.8s ease;
  border-color: #27AE60;
}
```

### 5.4 不正解時
```css
@keyframes error-pulse {
  0%, 100% { 
    opacity: 1;
  }
  50% { 
    opacity: 0.7;
    border-color: #C0392B;
  }
}

.error {
  animation: error-pulse 0.5s ease;
  border-color: #C0392B;
}
```

## 6. レスポンシブデザイン

### 6.1 ブレークポイント
```css
/* モバイル（デフォルト） */
@media (max-width: 639px) {
  .segment-pool {
    grid-template-columns: repeat(3, 1fr);
  }
}

/* タブレット */
@media (min-width: 640px) and (max-width: 1023px) {
  .segment-pool {
    grid-template-columns: repeat(5, 1fr);
  }
}

/* デスクトップ */
@media (min-width: 1024px) {
  .segment-pool {
    grid-template-columns: repeat(8, 1fr);
  }
}
```

### 6.2 タッチデバイス対応
```css
@media (hover: none) {
  .segment-chip {
    /* タッチデバイスではホバー効果を無効化 */
    transition: none;
  }
  
  .segment-chip:active {
    transform: scale(0.95);
  }
}
```

## 7. アクセシビリティ

### 7.1 キーボード操作
- **Tab**: フォーカス移動
- **Enter/Space**: 選択・決定
- **Escape**: キャンセル
- **矢印キー**: 形態素間の移動

### 7.2 ARIA属性
```html
<div role="button" 
     aria-label="形態素: まあ（感動詞）"
     aria-pressed="false"
     tabindex="0">
  まあ
</div>

<div role="region"
     aria-label="解答エリア"
     aria-live="polite">
  <!-- 配置済み形態素 -->
</div>
```

### 7.3 色覚多様性対応
- 色だけでなく、形状やパターンでも区別
- 高コントラストモード対応
- 品詞名のツールチップ表示

## 8. パフォーマンス最適化

### 8.1 CSS最適化
- CSS-in-JSではなくCSS Modulesを使用
- 不要なリフローを避ける
- will-changeの適切な使用

### 8.2 アニメーション最適化
- transformとopacityのみを使用
- requestAnimationFrameの活用
- GPUアクセラレーションの利用

## 9. フォント設計

### 9.1 フォントファミリー
```css
:root {
  --font-serif-primary: 'Yu Mincho', 'YuMincho', 'Hiragino Mincho ProN', 
                        'Hiragino Mincho Pro', 'HG明朝E', serif;
  --font-serif-display: 'Shippori Mincho', var(--font-serif-primary);
  --font-sans-fallback: 'Hiragino Sans', 'Yu Gothic', sans-serif;
}
```

### 9.2 文字サイズ階層
- **見出し大**: 24px - 作品タイトル
- **見出し中**: 20px - 著者名
- **本文**: 18px - 形態素チップ
- **補助**: 14px - UI要素、説明文
- **注記**: 12px - 細かい情報

### 9.3 文字組み
- **行間**: 1.8em - 読みやすさを重視
- **字間**: 0.05em～0.15em - 用途により調整
- **禁則処理**: 日本語組版ルールに準拠

## 10. 実装の優先順位

### Phase 1（MVP）
1. 基本的なレイアウト（和風デザイン）
2. 日本の伝統色を使用したSegmentChip
3. 明朝体フォントの適用
4. 答え合わせ機能

### Phase 2（拡張）
1. ドラッグ&ドロップ（控えめなアニメーション）
2. 和紙風テクスチャの追加
3. 縦書きモードの検討
4. レスポンシブ対応

### Phase 3（改善）
1. アクセシビリティ
2. パフォーマンス最適化
3. 環境音（ページめくり音など）
4. 季節に応じた背景変化

---

**文書バージョン**: 1.0.0  
**作成日**: 2024  
**最終更新日**: 2024  
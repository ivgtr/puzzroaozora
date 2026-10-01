import Phaser from "phaser";
import { PASSAGES } from "../data/passages.ts";
import { importWork, isCurrent, readBooks, removeBook, saveBook, type LibraryBook } from "../lib/books.ts";
import { Session, makeProblem, type Chain, type Command, type Point } from "./model.ts";
import { graphemes, RULES, type Difficulty, type Passage } from "./text.ts";
import { CELL, dealManuscript, layoutManuscript } from "./layout.ts";
import { prepareFont, prepareText } from "./fonts.ts";
import { Paper, PAPER, MAT } from "./paper.ts";
import { playCue, prepareSounds } from "./sound.ts";
import type { DeskSnapshot, HostBridge } from "./bridge.ts";

export const UI_TEXT = `余白で移動・紙片を選ぶ 相手の端へ 読み終えたら、自分のペースで。 言葉をほどき、情景をもどす。 一冊を選んで、記憶のつづきを。 はじめの一節 本をひらく 原稿を伏せて、はじめる つながるたび、情景になる。 ゆっくり読む ひと息ついて読み返す 復元できました 読了 つなぐ ここに置く 紙片を選んで、相手の端へ。 仮のつながり 切れ目で外せます 確定まであと この先にも紙片があります 余白を動かして探す 紙片 残り 一節 しおり この原稿は 読む 組む 仕上がり · ↖ ↗ ↙ ↘ ↓ ← ＋ − × 確定 練習 音を消す 音を出す 手引き 同じ一節で遊ぶ ` + `青空の修復机 記憶をたよりに言葉をつなぐ 原稿を読む 組み立てる 原文 戻す 机全体 設定 本棚 前 後 頁 次 閉じる 作品を取り込む 作品カードURL 貼り付ける 取り込み 再取り込み 保存した本 削除 本を削除しますか 保存した抜粋だけを削除します 戻る この本を削除 この原稿を閉じますか 組立途中の配置は保存されません 原稿に戻る 本棚へ 音量 小 大 音なし 動きを控える 有効 無効 机へ戻る 出典 もう一度 読み終えたら組み立ててください。机の余白をドラッグすると原稿を動かせます。好きな箇所から、紙片をつないでください。切れ目をタップすると仮組みを外せます。選んだ紙片を相手の前か後につなぎます。一枚の原稿に戻りました。好きなところから読み返してください。紙片がつながりました。少し長い仮組みを作ってみましょう。原文を手掛かりに組み直せます。仮の切れ目を外しました。一つ前の操作に戻しました。準備中です。読み込めませんでした。再試行 旧保存形式です。元の作品カードから再取り込みしてください。まだ保存した本はありません。この難易度の抜粋はありません。同じ原稿で連結枚数を比較 原稿の追加 このブラウザでは音を利用できません。表示できない文字があります。読み込みを完了できませんでした。接続と保存設定を確認してください。原文は変更していません。自然な文のまとまりで出題できる抜粋が見つかりませんでした。別の作品を選んでください。作品取り込み先が未設定です。推奨原稿は通信なしで選べます。原稿を保存しました。削除しました。操作の手引き 紙片を選ぶ 確定した部分 仮組み 選択した紙片を前につなぐ 選択した紙片を後につなぐ 原文を見る 原稿の端は左が前、右が後です。選択してから端をタップしてもつながります。机の余白をドラッグ、二本指かホイールで拡大縮小。矢印で選択先を移動、Enterで紙片を選び、[と]で前後につなぎます。Deleteで仮の切れ目を外し、Zで戻す、Rで原文、Escで取消。青空文庫の作品カードのURLを貼り付けてください。保存された原文は削除されません。ページ 再読 回 音 書体 対応 接続 失敗 理由 変更 不正 入力 一覧 完了 キャンセル 再開 中止 続ける 生成 取得 表示 難易度 枚 印刷 小さい 大きい 紙片 未接続 この原稿の新規確定は枚です。ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 /:.-_+[]()%…「」、。→`;

export const passagePreview = (text: string): string => graphemes(text.replace(/\n/g, "")).slice(0, 16).join("") + "…";

type Overlay = "review" | "settings" | "import" | "leave" | "books" | "delete" | "help";
type View = { paper: Paper; signature: string };
type Target = { id: string; side: "before" | "after"; distance: number; point: Point };
type Gesture = { kind: "paper"; id: string; down: Point; offset: Point; moved: boolean } | { kind: "pan"; down: Point; scroll: Point };
interface ButtonAction { label: string; invoke: () => void; bounds: Phaser.Geom.Rectangle }

export class DeskScene extends Phaser.Scene {
  private bridge: HostBridge;
  private onReady: () => void;
  private world!: Phaser.GameObjects.Container;
  private hud!: Phaser.GameObjects.Container;
  private ports!: Phaser.GameObjects.Graphics;
  private focusRing!: Phaser.GameObjects.Graphics;
  private boardCamera!: Phaser.Cameras.Scene2D.Camera;
  private uiCamera!: Phaser.Cameras.Scene2D.Camera;
  private views = new Map<string, View>();
  private manuscript?: Paper;
  private manuscriptFrame?: Phaser.GameObjects.Container;
  private session?: Session;
  private currentPassage?: Passage;
  private selected?: string;
  private focused?: string;
  private gesture?: Gesture;
  private target?: Target;
  private pinch?: { distance: number; zoom: number; world: Point };
  private suppressRelease = false;
  private overlay?: Overlay;
  private reviewPage = 0;
  private libraryPage = 0;
  private difficulty: Difficulty = "easy";
  private saved: LibraryBook[] = [];
  private deleteId?: string;
  private importInitial = "";
  private pending?: AbortController;
  private busy = false;
  private notice = "";
  private actions = new Map<string, ButtonAction>();
  private volume = .7;
  private reduced = false;
  private hasAudio = false;
  private serial = 0;
  private alive = true;

  constructor(bridge: HostBridge, onReady: () => void) { super({ key: "Desk" }); this.bridge = bridge; this.onReady = onReady; }
  private get w(): number { return this.scale.width; }
  private get h(): number { return this.scale.height; }
  private get top(): number { return this.w < 700 ? 108 : 88; }
  private get columns(): number { return Math.max(8, Math.min(this.assembling ? 16 : 22, Math.floor((this.w - 88) / CELL))); }
  private get assembling(): boolean { return this.session?.state.phase === "assembling"; }

  create(): void {
    this.world = this.add.container(0, 0);
    this.hud = this.add.container(0, 0).setDepth(1000);
    this.ports = this.add.graphics();
    this.world.add(this.ports);
    this.boardCamera = this.cameras.main;
    this.boardCamera.setBackgroundColor(MAT);
    this.uiCamera = this.cameras.add(0, 0, this.w, this.h, false, "interface");
    this.boardCamera.ignore(this.hud);
    this.uiCamera.ignore(this.world);
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.hasAudio = prepareSounds(this);
    this.input.on("pointerdown", this.onDown, this);
    this.input.on("pointermove", this.onMove, this);
    this.input.on("pointerup", this.onUp, this);
    this.input.on("pointerupoutside", this.cancelGesture, this);
    this.input.on("wheel", this.onWheel, this);
    this.scale.on("resize", this.resize, this);
    this.game.events.on(Phaser.Core.Events.BLUR, this.cancelGesture, this);
    this.game.canvas.tabIndex = 0;
    this.game.canvas.setAttribute("aria-label", "青空の修復机。操作の手引きはHキー。Tabキーで同じ操作の読み上げ用ボタンへ移動します。");
    this.game.canvas.addEventListener("keydown", this.onKey);
    this.game.canvas.addEventListener("pointercancel", this.cancelGesture);
    this.game.canvas.addEventListener("touchcancel", this.cancelGesture);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.resize();
    void this.loadBooks();
    this.onReady();
  }

  private shutdown(): void {
    this.alive = false;
    this.serial++;
    this.pending?.abort();
    this.scale.off("resize", this.resize, this);
    this.game.events.off(Phaser.Core.Events.BLUR, this.cancelGesture, this);
    this.game.canvas.removeEventListener("keydown", this.onKey);
    this.game.canvas.removeEventListener("pointercancel", this.cancelGesture);
    this.game.canvas.removeEventListener("touchcancel", this.cancelGesture);
    this.views.clear();
  }

  private resize(): void {
    this.cancelGesture();
    this.boardCamera.setViewport(0, this.top, this.w, Math.max(80, this.h - this.top - 60));
    this.uiCamera.setSize(this.w, this.h);
    this.syncPaper();
    if (this.manuscript) this.readingCamera();
    this.render();
  }

  private label(text: string, x: number, y: number, size = 16, width = 0, color = "#292c25", serif = false): Phaser.GameObjects.Text {
    const label = this.add.text(x, y, text, { fontFamily: serif ? "DeskSerif" : "DeskSans", fontSize: `${size}px`, color, lineSpacing: 6, wordWrap: width ? { width, useAdvancedWrap: true } : undefined }).setResolution(Math.min(2, devicePixelRatio || 1));
    this.hud.add(label);
    return label;
  }

  private fitLabel(text: string, x: number, y: number, size: number, width: number, color: string, lines = 1, serif = true): Phaser.GameObjects.Text {
    const label = this.label(text, x, y, size, width, color, serif);
    if (label.getWrappedText().length <= lines) return label;
    const chars = graphemes(text);
    let low = 0, high = chars.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      label.setText(chars.slice(0, middle).join("") + "…");
      if (label.getWrappedText().length <= lines) low = middle; else high = middle - 1;
    }
    return label.setText(chars.slice(0, low).join("") + "…");
  }

  private panel(x: number, y: number, width: number, height: number): void {
    const ground = this.add.graphics();
    ground.fillStyle(0x172c21, .3).fillRoundedRect(x + 4, y + 7, width, height, 3);
    ground.fillStyle(PAPER).fillRect(x, y, width, height);
    ground.lineStyle(1, 0xb47664, .45).strokeRect(x + 9, y + 9, width - 18, height - 18);
    this.hud.add(ground);
  }

  private button(id: string, text: string, x: number, y: number, width: number, height: number, invoke: () => void, accent = false): void {
    const bounds = new Phaser.Geom.Rectangle(x, y, width, height);
    this.actions.set(id, { label: text, invoke, bounds });
    const container = this.add.container(x, y);
    const shape = this.add.graphics().fillStyle(accent ? 0xa3503e : 0xebe3cf).fillRoundedRect(0, 0, width, height, 2);
    shape.lineStyle(1, accent ? 0x8e5848 : 0xbcb092, .7).lineBetween(0, height - 1, width, height - 1);
    const label = this.add.text(width / 2, height / 2, text, { fontFamily: "DeskSans", fontSize: width < 95 ? "13px" : "15px", color: accent ? "#fffaf0" : "#292c25", align: "center", wordWrap: width >= 40 ? { width: width - 16, useAdvancedWrap: true } : undefined }).setOrigin(.5).setResolution(Math.min(2, devicePixelRatio || 1));
    container.add([shape, label]).setSize(width, height).setInteractive(new Phaser.Geom.Rectangle(0, 0, width, height), Phaser.Geom.Rectangle.Contains);
    let armed = false;
    container.on("pointerover", () => { shape.setAlpha(.84); this.game.canvas.style.cursor = "pointer"; });
    container.on("pointerdown", () => { armed = true; container.y = y + 2; this.game.canvas.focus({ preventScroll: true }); });
    container.on("pointerout", () => { armed = false; container.y = y; shape.setAlpha(1); this.game.canvas.style.cursor = "default"; });
    container.on("pointerup", () => { container.y = y; if (armed) { armed = false; this.dispatch(id); } });
    this.hud.add(container);
  }

  dispatch(id: string): void {
    if (this.busy || !this.alive) return;
    if (id.startsWith("piece:")) {
      if (!this.assembling || this.overlay) return;
      this.selected = id.slice(6); this.focused = this.selected;
      this.syncSelection(); this.render(); return;
    }
    if (id.startsWith("join:")) {
      const [, side, target] = id.split(":");
      if (this.selected && (side === "before" || side === "after") && !this.overlay) this.apply({ type: "join", source: this.selected, target, side });
      return;
    }
    if (id.startsWith("split:")) {
      const [, chain, boundary] = id.split(":");
      if (!this.overlay) this.apply({ type: "split", chain, boundary: Number(boundary) });
      return;
    }
    this.actions.get(id)?.invoke();
  }

  focus(id: string): void {
    if (!this.alive || this.busy) return;
    if (id.startsWith("piece:") && !this.overlay) {
      this.focused = id.slice(6);
      this.syncSelection();
      const paper = this.views.get(this.focused)?.paper;
      if (paper) this.boardCamera.centerOn(paper.x + paper.width / 2, paper.y + paper.height / 2);
      return;
    }
    const action = this.actions.get(id);
    this.focusRing?.clear();
    if (action) this.focusRing.lineStyle(3, 0xe4bd6d).strokeRectShape(action.bounds);
  }

  private render(): void {
    if (!this.alive) return;
    this.hud.removeAll(true);
    this.actions.clear();
    if (!this.session) this.renderLibrary();
    else this.renderDesk();
    if (this.overlay) this.renderOverlay();
    this.focusRing = this.add.graphics();
    this.hud.add(this.focusRing);
    this.publish();
  }

  private renderLibrary(): void {
    const short = this.h < 680;
    const compact = this.w < 700 || short;
    const margin = compact ? 24 : Math.max(48, (this.w - 1112) / 2);
    const span = this.w - margin * 2;
    const background = this.add.graphics().fillStyle(MAT).fillRect(0, 0, this.w, this.h);
    background.lineStyle(1, 0xd4c5a7, .25).lineBetween(margin, 28, this.w - margin, 28);
    background.lineStyle(1, 0xd4c5a7, .2).lineBetween(margin, this.h - 78, this.w - margin, this.h - 78);
    this.hud.add(background);
    if (!short) this.label("AOZORA  /  LITERARY PUZZLE", margin, 43, 10, 0, "#bebfae");
    this.label("青空の修復机", margin - 2, short ? 36 : compact ? 69 : 76, short ? 26 : compact ? 32 : 44, 0, "#f6efdc", true);
    this.label(this.notice || "言葉をほどき、情景をもどす。", margin, short ? 77 : compact ? 119 : 142, 13, span, "#c6ccbd");
    const tabY = short ? 96 : compact ? 165 : 200;
    const tabWidth = Math.min(126, span / 3);
    (["easy", "normal", "hard"] as Difficulty[]).forEach((difficulty, index) => {
      this.button(`difficulty-${difficulty}`, `${RULES[difficulty].label} · ${RULES[difficulty].threshold}枚`, margin + index * tabWidth, tabY, tabWidth - 6, 38, () => {
        this.difficulty = difficulty; this.libraryPage = 0; this.notice = ""; this.render();
      }, this.difficulty === difficulty);
    });
    const entries = PASSAGES.filter((passage) => passage.difficulty === this.difficulty).concat(this.saved.flatMap((book) => isCurrent(book) ? book.passages.filter((passage) => passage.difficulty === this.difficulty) : []));
    if (this.difficulty !== "easy") entries.push(PASSAGES[0]);
    const cardY = tabY + (short ? 50 : 63);
    const columns = compact ? 1 : 3;
    const cardHeight = compact ? short ? 100 : 138 : Math.max(210, Math.min(350, this.h - cardY - 134));
    const rows = compact ? Math.max(1, Math.floor((this.h - cardY - 90) / (cardHeight + 16))) : 1;
    const perPage = rows * columns;
    const maxPage = Math.max(0, Math.ceil(entries.length / perPage) - 1);
    this.libraryPage = Math.min(this.libraryPage, maxPage);
    const gap = compact ? 16 : 28;
    const cardWidth = (span - (columns - 1) * gap) / columns;
    entries.slice(this.libraryPage * perPage, (this.libraryPage + 1) * perPage).forEach((passage, index) => {
      const x = margin + index % columns * (cardWidth + gap);
      const y = cardY + Math.floor(index / columns) * (cardHeight + gap);
      const color = passage.workId === "000424" ? 0xb7984d : passage.workId === "000456" ? 0x516977 : 0x916553;
      const coverWidth = compact ? 75 : cardWidth;
      const coverHeight = compact ? cardHeight : cardHeight - 58;
      const book = this.add.graphics();
      book.fillStyle(0x142621, .35).fillRect(x + 5, y + 7, cardWidth, cardHeight);
      book.fillStyle(0xf0e7d2).fillRect(x, y, cardWidth, cardHeight);
      book.fillStyle(color).fillRect(x, y, coverWidth, coverHeight);
      book.fillStyle(0x142621, .16).fillRect(x + 5, y, 8, coverHeight);
      book.lineStyle(1, 0xf2e4bb, .48).strokeRect(x + 20, y + 14, coverWidth - 32, coverHeight - 28);
      for (let line = 0; line < 3; line++) book.lineStyle(1, 0x9c9074, .2).lineBetween(x + 9, y + cardHeight - 4 - line * 3, x + cardWidth - 4, y + cardHeight - 4 - line * 3);
      this.hud.add(book);
      if (compact) {
        this.label(String(this.libraryPage * perPage + index + 1).padStart(2, "0"), x + 28, y + 52, 23, 0, "#f5ead0", true);
        this.fitLabel(passage.title, x + 94, y + (short ? 10 : 17), short ? 17 : 20, cardWidth - 108, "#343b33");
        this.fitLabel(short ? passagePreview(passage.original) : passage.author, x + 96, y + (short ? 35 : 50), 11, cardWidth - 112, "#777766", 1, false);
        if (!short) this.fitLabel(passagePreview(passage.original), x + 96, y + 74, 10, cardWidth - 112, "#777766", 1, false);
        this.button(`open-${passage.id}`, "本をひらく →", x + 94, y + cardHeight - 44, cardWidth - 110, 34, () => { void this.openPassage(passage); });
      } else {
        this.label(String(this.libraryPage * perPage + index + 1).padStart(2, "0"), x + 31, y + 27, 12, 0, "#e8dabc");
        this.fitLabel(passage.title, x + 32, y + 57, 27, cardWidth - 62, "#fbf1d9", 2);
        this.label(passage.author, x + 34, y + 148, 13, cardWidth - 64, "#e6dac2");
        this.fitLabel(passagePreview(passage.original), x + 34, y + 183, 11, cardWidth - 70, "#eadfc8", 1, false);
        const motif = this.add.graphics().lineStyle(1, 0xf2e4bb, .5);
        const mx = x + cardWidth - 62, my = y + coverHeight - 51;
        // A shared printer's ornament, unrelated to manuscript order.
        motif.strokeCircle(mx, my, 18).strokeCircle(mx - 13, my, 18).strokeCircle(mx + 13, my, 18);
        this.hud.add(motif);
        this.button(`open-${passage.id}`, "本をひらく →", x + 20, y + cardHeight - 48, cardWidth - 40, 34, () => { void this.openPassage(passage); });
      }
      this.actions.get(`open-${passage.id}`)!.label = `${passage.title}（${passage.author}）・${passage.location}を読む`;
    });
    if (!entries.length) this.label("この難易度の抜粋はありません。", margin, cardY, 16, span, "#f8f1df");
    const y = this.h - 59;
    const utilityWidth = compact ? Math.min(98, (span - 104) / 2) : 112;
    this.button("import", "原稿の追加", margin, y, utilityWidth, 36, () => this.openOverlay("import"));
    this.button("books", "保存した本", margin + utilityWidth + 8, y, utilityWidth, 36, () => { this.reviewPage = 0; this.openOverlay("books"); });
    if (maxPage) {
      this.button("previous-page", "←", this.w - margin - 88, y, 26, 36, () => { this.libraryPage = Math.max(0, this.libraryPage - 1); this.render(); });
      this.label(`${this.libraryPage + 1}/${maxPage + 1}`, this.w - margin - 54, y + 11, 11, 0, "#f8f1df");
      this.button("next-page", "→", this.w - margin - 26, y, 26, 36, () => { this.libraryPage = Math.min(maxPage, this.libraryPage + 1); this.render(); });
    }
  }

  private renderDesk(): void {
    const problem = this.session!.problem;
    const compact = this.w < 700;
    const phase = this.session!.state.phase;
    const background = this.add.graphics().fillStyle(MAT).fillRect(0, 0, this.w, this.top).fillRect(0, this.h - 60, this.w, 60);
    background.lineStyle(1, 0xd4c5a7, .22).lineBetween(24, this.top - 1, this.w - 24, this.top - 1).lineBetween(24, this.h - 60, this.w - 24, this.h - 60);
    this.hud.add(background);
    this.fitLabel(problem.title, 24, 16, compact ? 21 : 25, compact ? this.w - 48 : this.w - 410, "#f8f1df");
    this.label(compact ? problem.author : `${problem.author}  /  ${RULES[problem.difficulty].label}`, 26, compact ? 49 : 52, 11, 150, "#b9c4b4");
    const labels = [["review", "原文", () => { this.reviewPage = 0; this.openOverlay("review"); }], ["undo", "戻す", () => this.apply({ type: "undo" })], ["overview", "机全体", () => this.overview()], ["settings", "設定", () => this.openOverlay("settings")]] as const;
    const bw = compact ? (this.w - 48) / 4 : 82;
    const bx = compact ? 24 : this.w - 356;
    labels.forEach(([id, label, invoke], index) => {
      this.button(id, label, bx + index * bw, compact ? 69 : 23, bw - 6, compact ? 30 : 36, invoke);
    });
    const y = this.h - 49;
    if (phase === "reading") {
      this.button("begin", "原稿を伏せて、はじめる", 24, y, Math.min(224, this.w - 134), 38, () => this.begin(), true);
    } else if (phase === "complete") {
      this.button("again", "もう一度", 24, y, 100, 38, () => { if (this.currentPassage) void this.openPassage(this.currentPassage); });
      if (!compact) this.label("復元できました。ひと息ついて読み返す。", 150, y + 10, 13, 400, "#e3dfc8");
    } else {
      this.button("help", "手引き", 24, y, 70, 38, () => this.openOverlay("help"));
      const text = this.selected ? "相手の端へ" : "紙片を選ぶ";
      this.label(compact ? this.selected ? text : "余白で移動・紙片を選ぶ" : this.notice || `${text}  /  余白を動かして探す`, 112, y + 11, 12, this.w - 228, "#d3d7c7");
    }
    this.button("library", "本棚", this.w - 92, y, 68, 38, () => this.assembling ? this.openOverlay("leave") : this.leave());
  }

  private renderOverlay(): void {
    this.actions.clear();
    const veil = this.add.graphics().fillStyle(0x14231b, .84).fillRect(0, 0, this.w, this.h);
    this.hud.add(veil);
    const width = Math.min(680, this.w - 32);
    const x = (this.w - width) / 2;
    const height = Math.min(this.h - 32, this.overlay === "review" || this.overlay === "books" ? 760 : 430);
    const y = (this.h - height) / 2;
    this.panel(x, y, width, height);
    if (this.overlay === "review") {
      const columns = Math.max(6, Math.floor((width - 58) / CELL));
      const layout = layoutManuscript(this.session!.problem.original, columns);
      const rows = Math.max(2, Math.floor((height - 150) / CELL));
      const pageCount = Math.ceil(layout.rows / rows);
      this.reviewPage = Math.min(this.reviewPage, pageCount - 1);
      const from = this.reviewPage * rows;
      const page = Array.from({ length: Math.min(rows, layout.rows - from) }, (_, index) => layout.glyphs.filter((glyph) => Math.round((glyph.y - 14) / CELL) === from + index).map((glyph) => glyph.text).join("")).join("\n");
      this.label("原文", x + 24, y + 17, 20);
      this.label(`${this.reviewPage + 1} / ${pageCount}`, x + width - 96, y + 22, 13);
      const paper = new Paper(this, page, columns).setPosition(x + 16, y + 52);
      this.hud.add(paper);
      const bottom = y + height - 54;
      this.button("review-prev", "前頁", x + 20, bottom, 58, 36, () => { this.reviewPage = Math.max(0, this.reviewPage - 1); this.render(); });
      this.button("review-next", "次頁", x + 84, bottom, 58, 36, () => { this.reviewPage = Math.min(pageCount - 1, this.reviewPage + 1); this.render(); });
      this.button("source", "出典", x + 148, bottom, 58, 36, () => window.open(this.session!.problem.sourceUrl, "_blank", "noopener,noreferrer"));
      this.button("close", "机へ戻る", x + width - 114, bottom, 94, 36, () => this.closeOverlay());
    } else if (this.overlay === "settings") {
      this.label("設定", x + 26, y + 23, 22);
      this.label(this.hasAudio ? `音量 ${Math.round(this.volume * 100)}%` : "このブラウザでは音を利用できません。", x + 28, y + 72, 16, width - 56);
      this.button("quieter", "小", x + 28, y + 112, 58, 42, () => { this.volume = Math.max(0, this.volume - .1); this.render(); });
      this.button("louder", "大", x + 94, y + 112, 58, 42, () => { this.volume = Math.min(1, this.volume + .1); playCue(this, "extend", this.volume); this.render(); });
      this.button("mute", "音なし", x + 160, y + 112, 86, 42, () => { this.volume = this.volume ? 0 : .7; this.render(); }, this.volume === 0);
      this.button("motion", `動きを控える：${this.reduced ? "有効" : "無効"}`, x + 28, y + 177, width - 56, 44, () => { this.reduced = !this.reduced; this.render(); });
      this.button("close", "閉じる", x + width - 118, y + height - 60, 90, 40, () => this.closeOverlay());
    } else if (this.overlay === "import") {
      this.label("作品を取り込む", x + 24, y + 22, 21);
      this.label("青空文庫の作品カードのURLを貼り付けてください。", x + 26, y + 64, 14, width - 52);
      this.label(this.busy ? "準備中です。" : this.notice, x + 26, y + 166, 13, width - 52);
      this.button("import-submit", "取り込み", x + 24, y + height - 60, 114, 40, () => { void this.importBook(); }, true);
      this.button("close", "閉じる", x + width - 114, y + height - 60, 90, 40, () => this.closeOverlay());
    } else if (this.overlay === "books") {
      this.label("保存した本", x + 24, y + 22, 21);
      const perPage = Math.max(1, Math.min(3, Math.floor((height - 134) / 110)));
      this.reviewPage = Math.min(this.reviewPage, Math.max(0, Math.ceil(this.saved.length / perPage) - 1));
      const visible = this.saved.slice(this.reviewPage * perPage, (this.reviewPage + 1) * perPage);
      if (!visible.length) this.label("まだ保存した本はありません。", x + 26, y + 76, 16, width - 52);
      visible.forEach((book, index) => {
        const yy = y + 70 + index * 110;
        this.label(`${book.title} · ${book.author}`, x + 26, yy, 15, width - 52);
        this.button(`reimport-${book.id}`, "再取り込み", x + 26, yy + 44, 112, 38, () => { this.importInitial = isCurrent(book) ? book.sourceUrl : ""; this.notice = isCurrent(book) ? "" : "旧保存形式です。元の作品カードから再取り込みしてください。"; this.openOverlay("import"); });
        this.button(`delete-${book.id}`, "削除", x + 150, yy + 44, 66, 38, () => { this.deleteId = book.id; this.openOverlay("delete"); });
      });
      const bottom = y + height - 54;
      this.button("books-prev", "前", x + 24, bottom, 44, 36, () => { this.reviewPage = Math.max(0, this.reviewPage - 1); this.render(); });
      this.button("books-next", "次", x + 76, bottom, 44, 36, () => { this.reviewPage = Math.min(Math.max(0, Math.ceil(this.saved.length / perPage) - 1), this.reviewPage + 1); this.render(); });
      this.button("close", "閉じる", x + width - 114, bottom, 90, 36, () => this.closeOverlay());
    } else if (this.overlay === "help") {
      this.label("操作の手引き", x + 24, y + 22, 21);
      this.label("原稿の端は左が前、右が後です。選択してから端をタップしてもつながります。\n切れ目をタップすると仮組みを外せます。\n机の余白をドラッグ、二本指かホイールで拡大縮小。\n矢印で選択先を移動、Enterで紙片を選び、[と]で前後につなぎます。Deleteで仮の切れ目を外し、Zで戻す、Rで原文、Escで取消。", x + 26, y + 64, 14, width - 52);
      this.button("close", "閉じる", x + width - 114, y + height - 60, 90, 40, () => this.closeOverlay());
    } else {
      const deleting = this.overlay === "delete";
      this.label(deleting ? "この本を削除しますか" : "この原稿を閉じますか", x + 24, y + 30, 21, width - 48);
      this.label(deleting ? "保存した抜粋だけを削除します。" : "組立途中の配置は保存されません。", x + 26, y + 97, 15, width - 52);
      this.button("confirm", deleting ? "この本を削除" : "本棚へ", x + 24, y + height - 62, 134, 42, () => deleting ? void this.deleteBook() : this.leave(), true);
      this.button("close", "戻る", x + width - 114, y + height - 62, 90, 42, () => this.closeOverlay());
    }
  }

  private publish(): void {
    const actions = [...this.actions].map(([id, action]) => ({ id, label: action.label }));
    const snapshot: DeskSnapshot = { mode: this.overlay ?? this.session?.state.phase ?? "library", title: this.session?.problem.title ?? "青空の修復机", status: this.notice, actions, pieces: [] };
    if (this.session && (!this.overlay || this.overlay === "review")) {
      if (!this.assembling || this.overlay === "review") snapshot.original = this.session.problem.original;
      else {
        snapshot.pieces = this.session.state.chains.map((chain) => ({ id: chain.id, text: this.session!.text(chain), selected: chain.id === this.selected }));
        if (this.selected) this.session.state.chains.forEach((chain) => {
          if (chain.id !== this.selected) {
            actions.push({ id: `join:before:${chain.id}`, label: `「${this.session!.text(chain)}」の前につなぐ` }, { id: `join:after:${chain.id}`, label: `「${this.session!.text(chain)}」の後につなぐ` });
          } else chain.bonds.forEach((known, index) => { if (!known) actions.push({ id: `split:${chain.id}:${index}`, label: `${index + 1}番目の仮の切れ目を外す` }); });
        });
      }
    }
    if (this.overlay === "import") {
      const width = Math.min(680, this.w - 32), height = Math.min(this.h - 32, 430);
      snapshot.importField = { x: (this.w - width) / 2 + 26, y: (this.h - height) / 2 + 111, width: width - 52, initial: this.importInitial };
    }
    this.bridge.publish(snapshot);
  }

  private async loadBooks(): Promise<void> {
    try {
      const books = await readBooks();
      await prepareFont(books.map((book) => `${book.title}${book.author}${isCurrent(book) ? book.passages.map((passage) => passagePreview(passage.original)).join("") : ""}`).join(""), "DeskSans");
      await prepareFont(books.map((book) => book.title).join(""), "DeskSerif");
      if (!this.alive) return;
      this.saved = books;
      this.render();
    } catch (error) { if (this.alive) await this.report(error); }
  }

  private async report(error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : "読み込みを完了できませんでした。";
    try { await prepareFont(message, "DeskSans"); }
    catch { this.bridge.fail(new Error(message)); return; }
    if (this.alive) { this.notice = message; this.busy = false; this.render(); }
  }

  private async openPassage(passage: Passage): Promise<void> {
    const request = ++this.serial;
    this.busy = true; this.notice = "準備中です。"; this.render();
    try {
      await prepareText(passage.original + passage.title, `${UI_TEXT}${passage.title}${passage.author}`);
      const problem = makeProblem(passage, this.difficulty);
      if (!this.alive || request !== this.serial) return;
      this.clearPapers();
      this.currentPassage = passage;
      this.session = new Session(problem);
      this.selected = undefined; this.focused = undefined; this.overlay = undefined; this.busy = false; this.notice = "";
      this.syncPaper(); this.readingCamera(); this.render();
    } catch (error) { if (this.alive && request === this.serial) await this.report(error); }
  }

  private async importBook(): Promise<void> {
    this.busy = true; this.notice = "準備中です。";
    const request = ++this.serial;
    const controller = new AbortController();
    this.pending = controller;
    const value = this.bridge.readImport();
    this.render();
    try {
      const book = await importWork(value, controller.signal);
      // Check all saved excerpts before replacing any legacy/current record.
      await prepareText(book.title + book.passages.map((passage) => passage.original).join(""), book.title + book.author + book.passages.map((passage) => passagePreview(passage.original)).join(""));
      book.passages.forEach((passage) => makeProblem(passage));
      if (!this.alive || request !== this.serial) return;
      await saveBook(book);
      if (!this.alive || request !== this.serial) return;
      this.saved = this.saved.filter((old) => old.id !== book.id).concat(book);
      this.busy = false; this.pending = undefined; this.overlay = undefined; this.notice = "原稿を保存しました。"; this.libraryPage = 0;
      this.render();
    } catch (error) { if (this.alive && request === this.serial) { this.pending = undefined; await this.report(error); } }
  }

  private async deleteBook(): Promise<void> {
    if (!this.deleteId) return;
    this.busy = true;
    try {
      await removeBook(this.deleteId);
      if (!this.alive) return;
      this.saved = this.saved.filter((book) => book.id !== this.deleteId);
      this.deleteId = undefined; this.busy = false; this.overlay = undefined; this.notice = "削除しました。"; this.render();
    } catch (error) { await this.report(error); }
  }

  private openOverlay(overlay: Overlay): void { this.cancelGesture(); this.overlay = overlay; this.render(); }
  private closeOverlay(): void { this.overlay = undefined; this.notice = ""; this.render(); this.game.canvas.focus({ preventScroll: true }); }
  private leave(): void {
    this.cancelGesture(); this.clearPapers(); this.session = undefined; this.currentPassage = undefined; this.overlay = undefined; this.selected = undefined; this.focused = undefined; this.notice = "";
    this.boardCamera.setZoom(1).setScroll(0, 0); this.render();
  }

  private clearPapers(): void {
    for (const view of this.views.values()) { this.tweens.killTweensOf(view.paper); view.paper.destroy(); }
    this.views.clear(); this.manuscript?.destroy(); this.manuscript = undefined; this.manuscriptFrame?.destroy(); this.manuscriptFrame = undefined; this.ports.clear();
  }

  private syncPaper(): void {
    if (!this.session) return;
    if (!this.assembling) {
      for (const view of this.views.values()) { this.tweens.killTweensOf(view.paper); view.paper.destroy(); }
      this.views.clear(); this.ports.clear();
      this.manuscript?.destroy();
      this.manuscriptFrame?.destroy();
      this.manuscript = new Paper(this, this.session.problem.original, this.columns).setPosition(30, 94);
      const { width, height } = this.manuscript;
      const complete = this.session.state.phase === "complete";
      this.manuscriptFrame = this.add.container(30, 20);
      const backing = this.add.graphics();
      backing.fillStyle(0x18291f, .17).fillRect(3, 6, width, height + 142);
      backing.fillStyle(PAPER).fillRect(0, 0, width, height + 142);
      backing.lineStyle(1, 0xa96555, .35).lineBetween(14, 59, width - 14, 59);
      const heading = this.add.text(15, 20, complete ? "読了" : "原稿を読む", { fontFamily: "DeskSans", fontSize: "13px", color: "#8f5140" });
      const title = this.add.text(width - 16, 22, this.session.problem.author, { fontFamily: "DeskSans", fontSize: "11px", color: "#74715f" }).setOrigin(1, 0);
      const footer = this.add.text(15, height + 103, complete ? "一枚の原稿に戻りました。" : "読み終えたら、自分のペースで。", { fontFamily: "DeskSans", fontSize: "11px", color: "#74715f" });
      this.manuscriptFrame.add([backing, heading, title, footer]);
      this.world.add([this.manuscriptFrame, this.manuscript]);
      return;
    }
    this.manuscript?.destroy(); this.manuscript = undefined;
    this.manuscriptFrame?.destroy(); this.manuscriptFrame = undefined;
    const byTile = new Map(this.session.problem.tiles.map((tile) => [tile.id, tile.text]));
    const active = new Set(this.session.state.chains.map((chain) => chain.id));
    for (const [id, view] of this.views) if (!active.has(id)) { this.tweens.killTweensOf(view.paper); view.paper.destroy(); this.views.delete(id); }
    for (const chain of this.session.state.chains) {
      const parts = chain.tiles.map((id) => byTile.get(id)!);
      const signature = JSON.stringify([parts, chain.bonds, this.columns]);
      let view = this.views.get(chain.id);
      if (!view || view.signature !== signature) {
        if (view) { this.tweens.killTweensOf(view.paper); view.paper.destroy(); }
        const paper = new Paper(this, parts.join(""), this.columns, parts, chain.bonds);
        this.world.add(paper);
        view = { paper, signature }; this.views.set(chain.id, view);
      }
      view.paper.setPosition(chain.x, chain.y);
    }
    this.world.bringToTop(this.ports);
    this.syncSelection();
  }

  private begin(): void {
    if (!this.session || this.session.state.phase !== "reading") return;
    const positions = dealManuscript(this.session.problem.tiles.map((tile) => tile.text), this.columns, this.w);
    this.session.begin(positions);
    this.notice = "";
    this.focused = undefined;
    this.syncPaper();
    this.boardCamera.setZoom(1).setScroll(0, 0);
    if (!this.reduced) for (const { paper } of this.views.values()) {
      paper.lift(false);
      paper.settle(true);
    }
    playCue(this, "land", this.volume); this.render();
  }

  private apply(command: Command): void {
    if (!this.session || this.overlay) return;
    this.cancelGesture();
    const wasComplete = this.session.state.phase === "complete";
    const event = this.session.dispatch(command);
    if (event === "none") return;
    if (command.type === "join") {
      this.selected = this.session.state.chains.find((chain) => chain.id === command.target || chain.id === command.source)?.id;
      this.focused = this.selected;
    } else if (command.type === "undo") { this.selected = undefined; this.focused = undefined; }
    this.notice = event === "tentative" ? "原文を手掛かりに組み直せます。" : event === "split" ? "仮の切れ目を外しました。" : event === "undo" ? "一つ前の操作に戻しました。" : event === "complete" ? "一枚の原稿に戻りました。" : event === "move" ? "" : "紙片がつながりました。";
    this.syncPaper();
    if (event === "complete") this.readingCamera();
    else if (wasComplete && event === "undo") this.overview();
    const paper = this.manuscript ?? (this.selected ? this.views.get(this.selected)?.paper : undefined);
    if (paper && ["new", "extend", "bridge", "complete"].includes(event)) paper.confirm(!this.reduced);
    else paper?.settle(!this.reduced);
    playCue(this, event, this.volume); this.render();
  }

  private readingCamera(): void {
    if (!this.manuscript) return;
    this.boardCamera.setZoom(1).setScroll(this.manuscript.x + this.manuscript.width / 2 - this.w / 2, 0);
  }
  private overview(): void {
    this.cancelGesture();
    if (!this.assembling) { this.readingCamera(); return; }
    const papers = [...this.views.values()].map((view) => view.paper);
    if (!papers.length) return;
    const left = Math.min(...papers.map((paper) => paper.x)), top = Math.min(...papers.map((paper) => paper.y));
    const right = Math.max(...papers.map((paper) => paper.x + paper.width)), bottom = Math.max(...papers.map((paper) => paper.y + paper.height));
    this.boardCamera.setZoom(Math.max(.65, Math.min(1, this.boardCamera.width / (right - left + 60), this.boardCamera.height / (bottom - top + 60))));
    this.boardCamera.centerOn((left + right) / 2, (top + bottom) / 2);
    this.syncSelection();
  }

  private syncSelection(): void {
    for (const [id, view] of this.views) view.paper.focus(id === this.selected, id === this.focused);
    this.ports.clear();
    if (!this.selected || !this.assembling || this.overlay) return;
    const zoom = this.boardCamera.zoom;
    for (const [id, { paper }] of this.views) {
      if (id === this.selected) continue;
      for (const [side, local] of [["before", paper.front], ["after", paper.back]] as const) {
        const x = paper.x + local.x, y = paper.y + local.y;
        this.ports.fillStyle(0xe9ddc1, .98).fillCircle(x, y, 15 / zoom);
        this.ports.lineStyle(1.5 / zoom, 0x705a42).strokeCircle(x, y, 15 / zoom);
        const direction = side === "before" ? -1 : 1;
        this.ports.lineBetween(x - 5 * direction / zoom, y, x + 5 * direction / zoom, y);
        this.ports.lineBetween(x + 5 * direction / zoom, y, x, y - 5 / zoom);
        this.ports.lineBetween(x + 5 * direction / zoom, y, x, y + 5 / zoom);
      }
    }
    if (this.target) this.ports.lineStyle(3 / zoom, 0xe4bd6d).strokeCircle(this.target.point.x, this.target.point.y, 22 / zoom);
  }

  private worldPoint(pointer: Point): Phaser.Math.Vector2 {
    this.boardCamera.preRender();
    return this.boardCamera.getWorldPoint(pointer.x, pointer.y);
  }
  private onBoard(pointer: Point): boolean { return pointer.y >= this.top && pointer.y < this.h - 60; }
  private touching(): Phaser.Input.Pointer[] { return this.input.manager.pointers.filter((pointer) => pointer.isDown && this.onBoard(pointer)); }
  private hitPaper(point: Point): { id: string; paper: Paper } | undefined {
    const views = [...this.views].sort((a, b) => this.world.getIndex(b[1].paper) - this.world.getIndex(a[1].paper));
    for (const [id, view] of views) if (point.x >= view.paper.x && point.x <= view.paper.x + view.paper.width && point.y >= view.paper.y && point.y <= view.paper.y + view.paper.height) return { id, paper: view.paper };
    return undefined;
  }

  private tapTarget(point: Point): Target | undefined {
    let nearest: Target | undefined;
    for (const [id, { paper }] of this.views) {
      if (id === this.selected) continue;
      for (const [side, local] of [["before", paper.front], ["after", paper.back]] as const) {
        const world = { x: paper.x + local.x, y: paper.y + local.y };
        const distance = Phaser.Math.Distance.Between(point.x, point.y, world.x, world.y) * this.boardCamera.zoom;
        if (distance <= 24 && (!nearest || distance < nearest.distance)) nearest = { id, side, distance, point: world };
      }
    }
    return nearest;
  }

  private onDown(pointer: Phaser.Input.Pointer): void {
    if (this.overlay || this.busy || !this.session || !this.onBoard(pointer)) return;
    this.game.canvas.focus({ preventScroll: true });
    const touches = this.touching();
    if (touches.length >= 2) {
      this.cancelGesture();
      this.suppressRelease = true;
      const [a, b] = touches;
      this.pinch = { distance: Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y), zoom: this.boardCamera.zoom, world: this.worldPoint({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }) };
      return;
    }
    this.suppressRelease = false;
    const point = this.worldPoint(pointer);
    if (this.assembling) {
      const target = this.selected ? this.tapTarget(point) : undefined;
      if (target) { this.target = target; this.gesture = { kind: "pan", down: { x: pointer.x, y: pointer.y }, scroll: { x: this.boardCamera.scrollX, y: this.boardCamera.scrollY } }; return; }
      const hit = this.hitPaper(point);
      if (hit) {
        this.gesture = { kind: "paper", id: hit.id, down: { x: pointer.x, y: pointer.y }, offset: { x: point.x - hit.paper.x, y: point.y - hit.paper.y }, moved: false };
        this.tweens.killTweensOf(hit.paper); hit.paper.setAlpha(1); hit.paper.lift(!this.reduced);
        this.world.bringToTop(hit.paper); this.world.bringToTop(this.ports);
        this.game.canvas.style.cursor = "grabbing";
        return;
      }
    }
    this.gesture = { kind: "pan", down: { x: pointer.x, y: pointer.y }, scroll: { x: this.boardCamera.scrollX, y: this.boardCamera.scrollY } };
  }

  private onMove(pointer: Phaser.Input.Pointer): void {
    if (this.overlay || this.busy) return;
    if (this.pinch) {
      const touches = this.touching();
      if (touches.length < 2) return;
      const [a, b] = touches;
      const zoom = Phaser.Math.Clamp(this.pinch.zoom * Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y) / Math.max(1, this.pinch.distance), .65, 1.7);
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      this.boardCamera.setZoom(zoom);
      const after = this.worldPoint(center);
      this.boardCamera.setScroll(this.boardCamera.scrollX + this.pinch.world.x - after.x, this.boardCamera.scrollY + this.pinch.world.y - after.y);
      this.syncSelection(); return;
    }
    const gesture = this.gesture;
    if (!gesture || !pointer.isDown || this.suppressRelease) return;
    const distance = Phaser.Math.Distance.Between(pointer.x, pointer.y, gesture.down.x, gesture.down.y);
    if (gesture.kind === "pan") {
      if (distance > 6) { this.target = undefined; this.boardCamera.setScroll(gesture.scroll.x - (pointer.x - gesture.down.x) / this.boardCamera.zoom, gesture.scroll.y - (pointer.y - gesture.down.y) / this.boardCamera.zoom); this.syncSelection(); }
      return;
    }
    if (!gesture.moved && distance <= 6) return;
    if (!gesture.moved) { gesture.moved = true; this.selected = gesture.id; playCue(this, "lift", this.volume); }
    const paper = this.views.get(gesture.id)!.paper;
    const point = this.worldPoint(pointer);
    paper.setPosition(Phaser.Math.Clamp(point.x - gesture.offset.x, -4000, 8000), Phaser.Math.Clamp(point.y - gesture.offset.y, -4000, 8000));
    let nearest: Target | undefined;
    let current: Target | undefined;
    for (const [id, view] of this.views) {
      if (id === gesture.id) continue;
      for (const side of ["before", "after"] as const) {
        const local = side === "before" ? view.paper.front : view.paper.back;
        const source = side === "before" ? paper.back : paper.front;
        const target = { x: view.paper.x + local.x, y: view.paper.y + local.y };
        const d = Phaser.Math.Distance.Between(paper.x + source.x, paper.y + source.y, target.x, target.y) * this.boardCamera.zoom;
        const candidate = { id, side, point: target, distance: d };
        if (d <= 42 && (!nearest || d < nearest.distance)) nearest = candidate;
        if (this.target?.id === id && this.target.side === side && d <= 58) current = candidate;
      }
    }
    this.target = current && (!nearest || nearest.distance + 10 >= current.distance) ? current : nearest;
    this.syncSelection();
  }

  update(_time: number, delta: number): void {
    if (this.overlay || this.busy || this.pinch || this.gesture?.kind !== "paper" || !this.gesture.moved) return;
    const pointer = this.input.activePointer;
    if (!pointer.isDown || !this.onBoard(pointer)) return;
    const edge = 30;
    const drift = (value: number, min: number, max: number) => value < min + edge ? -(min + edge - value) / edge : value > max - edge ? (value - max + edge) / edge : 0;
    const dx = drift(pointer.x, 0, this.w), dy = drift(pointer.y, this.top, this.h - 60);
    if (!dx && !dy) return;
    const speed = Math.min(delta, 32) * .36 / this.boardCamera.zoom;
    this.boardCamera.setScroll(this.boardCamera.scrollX + dx * speed, this.boardCamera.scrollY + dy * speed);
    this.onMove(pointer);
  }

  private onUp(pointer: Phaser.Input.Pointer): void {
    if (this.pinch || this.suppressRelease) {
      if (this.touching().length < 2) this.pinch = undefined;
      if (this.touching().length === 0) this.suppressRelease = false;
      this.gesture = undefined; return;
    }
    const gesture = this.gesture;
    if (!gesture || !this.session || this.overlay || this.busy) return;
    if (!this.onBoard(pointer) || pointer.x < 0 || pointer.x > this.w) { this.cancelGesture(); return; }
    this.gesture = undefined;
    this.game.canvas.style.cursor = "default";
    if (gesture.kind === "paper") this.views.get(gesture.id)?.paper.settle(!this.reduced);
    if (gesture.kind === "pan") {
      const target = this.target;
      this.target = undefined;
      if (target && this.selected && Phaser.Math.Distance.Between(pointer.x, pointer.y, gesture.down.x, gesture.down.y) <= 6) this.apply({ type: "join", source: this.selected, target: target.id, side: target.side });
      return;
    }
    const view = this.views.get(gesture.id)!;
    if (gesture.moved) {
      const target = this.target;
      const position = { x: view.paper.x, y: view.paper.y };
      this.target = undefined;
      if (target) this.apply({ type: "join", source: gesture.id, target: target.id, side: target.side });
      else this.apply({ type: "move", chain: gesture.id, point: position });
      return;
    }
    const point = this.worldPoint(pointer);
    const seam = view.paper.seams.find((seam) => Phaser.Math.Distance.Between(point.x, point.y, view.paper.x + seam.x, view.paper.y + seam.y) * this.boardCamera.zoom <= 19);
    if (this.selected === gesture.id && seam) this.apply({ type: "split", chain: gesture.id, boundary: seam.boundary });
    else { this.selected = gesture.id; this.focused = gesture.id; this.syncSelection(); this.render(); }
  }

  private cancelGesture = (): void => {
    if (this.game?.canvas) this.game.canvas.style.cursor = "default";
    const gesture = this.gesture;
    if (gesture?.kind === "paper" && this.session) {
      const stable = this.session.state.chains.find((chain) => chain.id === gesture.id);
      const view = stable && this.views.get(stable.id);
      if (stable && view) { view.paper.setPosition(stable.x, stable.y); view.paper.settle(false); }
    }
    this.gesture = undefined; this.pinch = undefined; this.target = undefined;
    if (this.ports) this.syncSelection();
  };

  private zoomAt(point: Point, factor: number): void {
    this.cancelGesture();
    const before = this.worldPoint(point);
    this.boardCamera.setZoom(Phaser.Math.Clamp(this.boardCamera.zoom * factor, .65, 1.7));
    const after = this.worldPoint(point);
    this.boardCamera.setScroll(this.boardCamera.scrollX + before.x - after.x, this.boardCamera.scrollY + before.y - after.y);
    this.syncSelection();
  }
  private onWheel(pointer: Phaser.Input.Pointer, _objects: Phaser.GameObjects.GameObject[], _dx: number, dy: number): void {
    if (!this.overlay && this.session && this.onBoard(pointer)) this.zoomAt(pointer, Math.exp(-dy * .001));
  }

  private onKey = (event: KeyboardEvent): void => {
    if (event.target !== this.game.canvas || this.busy || event.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault(); this.cancelGesture();
      if (this.overlay) this.closeOverlay();
      else { this.selected = undefined; this.syncSelection(); this.render(); }
      return;
    }
    if (this.overlay || !this.session) return;
    const key = event.key.toLowerCase();
    if (["z", "r", "h", "m", "[", "]", "delete", "enter", "arrowleft", "arrowright", "arrowup", "arrowdown", "+", "-", "="].includes(key)) event.preventDefault();
    if (key === "z") this.apply({ type: "undo" });
    else if (key === "r") { this.reviewPage = 0; this.openOverlay("review"); }
    else if (key === "h") this.openOverlay("help");
    else if (key === "m") this.openOverlay("settings");
    else if (key === "+" || key === "=" || key === "-") this.zoomAt({ x: this.w / 2, y: (this.top + this.h - 60) / 2 }, key === "-" ? .9 : 1.1);
    else if (this.assembling) {
      const chains = this.session.state.chains;
      if (key.startsWith("arrow")) {
        const current = chains.findIndex((chain) => chain.id === this.focused);
        const direction = key === "arrowleft" || key === "arrowup" ? -1 : 1;
        this.focused = chains[(current + direction + chains.length) % chains.length].id;
        this.focus(`piece:${this.focused}`); this.publish();
      } else if (key === "enter" && this.focused) this.dispatch(`piece:${this.focused}`);
      else if ((key === "[" || key === "]") && this.selected && this.focused) this.apply({ type: "join", source: this.selected, target: this.focused, side: key === "[" ? "before" : "after" });
      else if (key === "delete") {
        const chain: Chain | undefined = chains.find((chain) => chain.id === (this.selected ?? this.focused));
        const boundary = chain?.bonds.findIndex((known) => !known) ?? -1;
        if (chain && boundary >= 0) this.apply({ type: "split", chain: chain.id, boundary });
      }
    }
  };
}

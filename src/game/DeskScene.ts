import Phaser from "phaser";
import { PASSAGES } from "../data/passages.ts";
import { readBooks, type LibraryBook } from "../lib/books.ts";
import { Session, makeProblem, type Chain, type Command, type Point, type CuratedPassage } from "./model.ts";
import { graphemes } from "./text.ts";
import { CELL, dealManuscript } from "./layout.ts";
import { prepareFont, prepareText } from "./fonts.ts";
import { Paper, PAPER, MAT } from "./paper.ts";
import { playCue, prepareSounds } from "./sound.ts";
import type { DeskSnapshot, HostBridge } from "./bridge.ts";

export const UI_TEXT = `つなぎ方 読了 枚の紙片 ↗ 青空の修復机 三つの情景 紙片から、一節をつなぐ。 つなぐ 手掛かり 読み通す 別の情景 同じ情景 もう一度 つながりを見直す 原文 出典を読む 全体 戻す 操作 音と動き 設定 閉じる 以前の保存 保存した本 作品の取り込みは休止しています。保存データはそのまま残っています。新しいルールでは、手で選び直した三つの情景で遊べます。 この情景を離れますか 途中の配置は保存されません。 続ける 選び直す 一枚の原稿になりました。 紙片を選び、相手の端へ 余白を動かすと、ほかの紙片が見つかります 左端が前、右端が後。選んだ紙片をつなぎます。 切れ目をタップして、いつでも外せます。 つながりを作りました。 つながりを外しました。 一つ前の操作に戻しました。 原文とは、まだ少し違うようです。切れ目を外して読み直してみましょう。 ひとつにつながりました。読み通して確かめましょう。 音量 小 大 音なし 動きを控える 有効 無効 このブラウザでは音を利用できません。 紙片をドラッグして、相手の端へ。 紙片を選んでから相手の端をタップしてもつながります。 正誤は最後に読み通すまで分かりません。 選んだ紙片の切れ目をタップすると外せます。 余白をドラッグして移動。二本指・ホイールで拡大縮小。 矢印で移動、Enterで選択、[ と ]で前後へ。 Deleteで分離、Zで戻す、Hで手引き、Escで取消。 次の手掛かり 前へ 次へ 準備中です。 読み込めませんでした。 読み込みを完了できませんでした。 段落の順序を確かめる 紙片 残り 組 つながり 確認 正解の場所は示しません まだ保存した本はありません。 記録 この三問は手作業で選んだ抜粋です。 答えは、つなぎ終えたあとに。 選択した紙片を前につなぐ 選択した紙片を後につなぐ 番目の切れ目を外す 01 02 03 / · ← → ＋ − × ↶ … ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789[]()%「」、。`;

type Overlay = "settings" | "leave" | "books" | "help" | "hint";
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
  private currentPassage?: CuratedPassage;
  private selected?: string;
  private focused?: string;
  private gesture?: Gesture;
  private target?: Target;
  private pinch?: { distance: number; zoom: number; world: Point };
  private suppressRelease = false;
  private overlay?: Overlay;
  private reviewPage = 0;
  private libraryPage = 0;
  private hintIndex = 0;
  private saved: LibraryBook[] = [];
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
  private get top(): number { return 76; }
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
    this.scale.off("resize", this.resize, this);
    this.game.events.off(Phaser.Core.Events.BLUR, this.cancelGesture, this);
    this.game.canvas.removeEventListener("keydown", this.onKey);
    this.game.canvas.removeEventListener("pointercancel", this.cancelGesture);
    this.game.canvas.removeEventListener("touchcancel", this.cancelGesture);
    this.views.clear();
  }

  private resize(): void {
    this.cancelGesture();
    this.boardCamera.setViewport(0, this.top, this.w, Math.max(80, this.h - this.top - 112));
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
    ground.fillStyle(0x283b32, .055).fillRect(x + 4, y + 8, width, height);
    ground.fillStyle(PAPER).fillRect(x, y, width, height);
    ground.lineStyle(1, 0xc2bca9, .45).strokeRect(x, y, width, height);
    this.hud.add(ground);
  }

  private button(id: string, text: string, x: number, y: number, width: number, height: number, invoke: () => void, accent = false): void {
    const bounds = new Phaser.Geom.Rectangle(x, y, width, height);
    this.actions.set(id, { label: text, invoke, bounds });
    const container = this.add.container(x, y);
    const shape = this.add.graphics();
    if (accent) shape.fillStyle(0x354c42).fillRoundedRect(0, 0, width, height, height / 2);
    const label = this.add.text(width / 2, height / 2, text, { fontFamily: "DeskSans", fontSize: width < 70 ? "13px" : "14px", color: accent ? "#faf5e7" : "#4c5c50", align: "center" }).setOrigin(.5).setResolution(Math.min(2, devicePixelRatio || 1));
    container.add([shape, label]).setInteractive(new Phaser.Geom.Rectangle(0, 0, width, height), Phaser.Geom.Rectangle.Contains);
    let armed = false;
    container.on("pointerover", () => { label.setAlpha(.65); this.game.canvas.style.cursor = "pointer"; });
    container.on("pointerdown", () => { armed = true; label.y = height / 2 + 1; this.game.canvas.focus({ preventScroll: true }); });
    container.on("pointerout", () => { armed = false; label.y = height / 2; label.setAlpha(1); this.game.canvas.style.cursor = "default"; });
    container.on("pointerup", () => { label.y = height / 2; if (armed) { armed = false; this.dispatch(id); } });
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
    if (action) this.focusRing.lineStyle(3, 0x9f4f3d).strokeRectShape(action.bounds);
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
    const compact = this.w < 700;
    const short = this.h < 580;
    const passage = PASSAGES[this.libraryPage % PASSAGES.length];
    const width = Math.min(620, this.w - 40);
    const height = Math.min(short ? 292 : 472, this.h - 132);
    const x = (this.w - width) / 2, y = Math.max(68, (this.h - height) / 2 - 14);
    const ground = this.add.graphics().fillStyle(MAT).fillRect(0, 0, this.w, this.h);
    // The same unbounded working surface holds the invitation and the puzzle.
    ground.lineStyle(1, 0x8f9c8d, .16).lineBetween(28, 44, this.w - 28, 44);
    this.hud.add(ground);
    this.label("青空の修復机", 28, 20, 12, 0, "#637267");
    this.button("settings", "音と動き", this.w - 118, 10, 90, 44, () => this.openOverlay("settings"));
    this.panel(x, y, width, height);
    const margin = compact ? 28 : 54;
    this.label(`0${this.libraryPage + 1}  /  03`, x + margin, y + 28, 11, 0, "#8b7463");
    this.label("三つの情景", x + width - margin - 70, y + 28, 11, 0, "#8b7463");
    const titleY = y + (short ? 74 : 116);
    this.fitLabel(passage.sceneTitle, x + margin - 2, titleY, compact ? 32 : 44, width - margin * 2, "#33483e", 2);
    this.label(`${passage.title}  ·  ${passage.author}`, x + margin, titleY + (short ? 49 : compact ? 68 : 74), compact ? 11 : 12, width - margin * 2, "#727668");
    if (!short) this.label(passage.premise, x + margin, y + height - 165, compact ? 13 : 14, width - margin * 2, "#626e61", true);
    const rule = this.add.graphics().lineStyle(1, 0xaa6652, .42).lineBetween(x + margin, y + height - 83, x + width - margin, y + height - 83);
    this.hud.add(rule);
    this.label(`${passage.fragments.length} 枚の紙片`, x + margin, y + height - 53, 12, 0, "#7d7b6c");
    this.button(`open-${passage.id}`, "つなぐ →", x + width - margin - 126, y + height - 71, 126, 48, () => { void this.openPassage(passage); }, true);
    this.actions.get(`open-${passage.id}`)!.label = `${passage.sceneTitle}（${passage.title}）をつなぐ`;
    const navY = y + height + 16;
    const navWidth = Math.min(120, (this.w - 40) / 3);
    const navX = (this.w - navWidth * 3) / 2;
    PASSAGES.forEach((item, index) => {
      this.button(`scene-${index}`, `0${index + 1}  ${item.sceneTitle}`, navX + index * navWidth, navY, navWidth, 44, () => { this.libraryPage = index; this.notice = ""; this.render(); });
      if (index === this.libraryPage) {
        const mark = this.add.graphics().fillStyle(0xa05c47).fillCircle(navX + index * navWidth + navWidth / 2, navY + 45, 2);
        this.hud.add(mark);
      }
    });
    if (this.saved.length) this.button("books", "以前の保存", 14, this.h - 46, 104, 44, () => this.openOverlay("books"));
    if (this.notice) this.label(this.notice, 28, this.h - 30, 12, this.w - 56, "#735746");
  }

  private renderDesk(): void {
    const session = this.session!, problem = session.problem;
    const compact = this.w < 700;
    const complete = session.state.phase === "complete";
    const background = this.add.graphics().fillStyle(MAT).fillRect(0, 0, this.w, this.top).fillRect(0, this.h - 112, this.w, 112);
    this.hud.add(background);
    this.button("library", "←", 12, 14, 44, 44, () => this.assembling ? this.openOverlay("leave") : this.leave());
    this.actions.get("library")!.label = "別の情景を選ぶ";
    this.fitLabel(problem.sceneTitle, 68, 17, compact ? 20 : 24, this.w - 208, "#354b40");
    this.label(`${problem.title} · ${problem.author}`, 70, 49, 10, this.w - 166, "#768074");
    this.button("overview", "全体", this.w - 112, 16, 52, 44, () => this.overview());
    this.button("settings", "…", this.w - 60, 16, 44, 44, () => this.openOverlay("settings"));
    this.actions.get("settings")!.label = "音と動きの設定";
    const y = this.h - 61;
    if (session.canUndo) this.button("undo", "↶ 戻す", 14, y, 78, 44, () => this.apply({ type: "undo" }));
    if (complete) {
      this.label("一枚の原稿になりました。", 24, this.h - 108, 12, this.w - 48, "#647465");
      this.button("source", "出典を読む ↗", this.w / 2 - Math.min(152, this.w - 216) / 2, y, Math.min(152, this.w - 216), 44, () => window.open(problem.sourceUrl, "_blank", "noopener,noreferrer"), true);
      this.button("again", "もう一度", this.w - 104, y, 90, 44, () => { if (this.currentPassage) void this.openPassage(this.currentPassage); });
    } else {
      this.fitLabel(this.notice || (session.canCheck ? "ひとつにつながりました。読み通して確かめましょう。" : this.selected ? "左端が前、右端が後。選んだ紙片をつなぎます。" : "紙片を選び、相手の端へ。余白を動かすと、ほかの紙片が見つかります"), 24, this.h - 108, 12, this.w - 48, "#647465", 2, false);
      if (session.canCheck) this.button("check", "読み通す →", this.w / 2 - Math.min(152, this.w - 216) / 2, y, Math.min(152, this.w - 216), 44, () => this.apply({ type: "check" }), true);
      else this.button("help", "操作", this.w / 2 - 30, y, 60, 44, () => this.openOverlay("help"));
      this.button("hint", "手掛かり", this.w - 104, y, 90, 44, () => this.openOverlay("hint"));
    }
  }

  private renderOverlay(): void {
    this.actions.clear();
    this.hud.add(this.add.graphics().fillStyle(MAT, .95).fillRect(0, 0, this.w, this.h));
    const width = Math.min(560, this.w - 32);
    const height = Math.min(this.h - 32, this.overlay === "help" ? 490 : 400);
    const x = (this.w - width) / 2, y = (this.h - height) / 2;
    this.panel(x, y, width, height);
    const bottom = y + height - 64;
    if (this.overlay === "settings") {
      this.label("音と動き", x + 28, y + 28, 25, 0, "#354b40", true);
      this.label(this.hasAudio ? `音量 ${Math.round(this.volume * 100)}%` : "このブラウザでは音を利用できません。", x + 28, y + 90, 14, width - 56);
      this.button("quieter", "−", x + 28, y + 125, 48, 44, () => { this.volume = Math.max(0, this.volume - .1); this.render(); });
      this.button("louder", "＋", x + 84, y + 125, 48, 44, () => { this.volume = Math.min(1, this.volume + .1); playCue(this, "land", this.volume); this.render(); });
      this.button("mute", "音なし", x + 152, y + 125, 86, 44, () => { this.volume = this.volume ? 0 : .7; this.render(); }, this.volume === 0);
      this.button("motion", `動きを控える：${this.reduced ? "有効" : "無効"}`, x + 20, y + 190, width - 40, 44, () => { this.reduced = !this.reduced; this.render(); });
    } else if (this.overlay === "books") {
      this.label("以前の保存", x + 28, y + 28, 25, 0, "#354b40", true);
      this.label("作品の取り込みは休止しています。保存データはそのまま残っています。新しいルールでは、手で選び直した三つの情景で遊べます。", x + 28, y + 82, 14, width - 56);
      const book = this.saved[this.reviewPage];
      if (book) {
        this.fitLabel(`${book.title} · ${book.author}`, x + 28, y + 208, 16, width - 56, "#354b40", 2);
        this.button("books-prev", "←", x + 24, bottom, 44, 44, () => { this.reviewPage = Math.max(0, this.reviewPage - 1); this.render(); });
        this.button("books-next", "→", x + 72, bottom, 44, 44, () => { this.reviewPage = Math.min(this.saved.length - 1, this.reviewPage + 1); this.render(); });
      }
    } else if (this.overlay === "hint") {
      this.label("手掛かり", x + 28, y + 28, 25, 0, "#354b40", true);
      const hints = this.session!.problem.hints;
      this.label(`${this.hintIndex + 1} / ${hints.length}`, x + width - 74, y + 38, 11, 0, "#817462");
      this.label(hints[this.hintIndex], x + 28, y + 99, 18, width - 56, "#475a4c", true);
      if (this.hintIndex < hints.length - 1) this.button("hint-next", "次の手掛かり", x + 20, bottom, 144, 44, () => { this.hintIndex++; this.render(); });
    } else if (this.overlay === "help") {
      this.label("つなぎ方", x + 28, y + 28, 25, 0, "#354b40", true);
      this.label(`紙片をドラッグして、相手の端へ。
紙片を選んでから相手の端をタップしてもつながります。

選んだ紙片の切れ目をタップすると外せます。正誤は最後に読み通すまで分かりません。

余白をドラッグして移動。二本指・ホイールで拡大縮小。`, x + 28, y + 80, 14, width - 56);
      if (height >= 460) this.label(`矢印で移動、Enterで選択、[ と ]で前後へ。
Deleteで分離、Zで戻す、Hで手引き、Escで取消。`, x + 28, bottom - 72, 11, width - 56, "#727668");
    } else {
      this.label("この情景を離れますか", x + 28, y + 34, 23, width - 56, "#354b40", true);
      this.label("途中の配置は保存されません。", x + 28, y + 106, 14, width - 56);
      this.button("confirm", "選び直す", x + 24, bottom, 134, 44, () => this.leave());
    }
    this.button("close", this.overlay === "leave" ? "続ける" : "閉じる", x + width - 126, bottom, 102, 44, () => this.closeOverlay(), true);
  }

  private publish(): void {
    const actions = [...this.actions].map(([id, action]) => ({ id, label: action.label }));
    const snapshot: DeskSnapshot = { mode: this.overlay ?? this.session?.state.phase ?? "selection", title: this.session?.problem.sceneTitle ?? "青空の修復机", status: this.notice, actions, pieces: [] };
    if (this.session && !this.overlay) {
      if (this.session.state.phase === "complete") snapshot.original = this.session.problem.original;
      else if (this.assembling) {
        snapshot.pieces = this.session.state.chains.map((chain) => ({ id: chain.id, text: this.session!.text(chain), selected: chain.id === this.selected }));
        if (this.selected) this.session.state.chains.forEach((chain) => {
          if (chain.id !== this.selected) actions.push({ id: `join:before:${chain.id}`, label: `「${this.session!.text(chain)}」の前につなぐ` }, { id: `join:after:${chain.id}`, label: `「${this.session!.text(chain)}」の後につなぐ` });
          else chain.bonds.forEach((_, index) => actions.push({ id: `split:${chain.id}:${index}`, label: `${index + 1}番目の切れ目を外す` }));
        });
      }
    }
    this.bridge.publish(snapshot);
  }

  private async loadBooks(): Promise<void> {
    try {
      const books = await readBooks();
      await prepareText(books.map((book) => book.title + book.author).join(""), books.map((book) => book.title + book.author).join(""));
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

  private async openPassage(passage: CuratedPassage): Promise<void> {
    const request = ++this.serial;
    this.busy = true; this.notice = "準備中です。"; this.render();
    try {
      await prepareText(passage.original + passage.title + passage.sceneTitle + passage.hints.join(""), `${UI_TEXT}${passage.title}${passage.author}`);
      const problem = makeProblem(passage);
      if (!this.alive || request !== this.serial) return;
      this.clearPapers();
      this.currentPassage = passage;
      this.session = new Session(problem);
      this.selected = undefined; this.focused = undefined; this.overlay = undefined; this.busy = false; this.notice = "";
      this.hintIndex = 0; this.begin();
    } catch (error) { if (this.alive && request === this.serial) await this.report(error); }
  }

  private openOverlay(overlay: Overlay): void { if (overlay === "hint" && !this.assembling) return; this.cancelGesture(); this.overlay = overlay; this.render(); }
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
    if (this.session.state.phase === "complete") {
      for (const view of this.views.values()) { this.tweens.killTweensOf(view.paper); view.paper.destroy(); }
      this.views.clear(); this.ports.clear();
      this.manuscript?.destroy();
      this.manuscriptFrame?.destroy();
      this.manuscript = new Paper(this, this.session.problem.original, this.columns).setPosition(30, 94);
      const { width, height } = this.manuscript;
            this.manuscriptFrame = this.add.container(30, 20);
      const backing = this.add.graphics();
      backing.fillStyle(0x18291f, .17).fillRect(3, 6, width, height + 142);
      backing.fillStyle(PAPER).fillRect(0, 0, width, height + 142);
      backing.lineStyle(1, 0xa96555, .35).lineBetween(14, 59, width - 14, 59);
      const heading = this.add.text(15, 20, "読了", { fontFamily: "DeskSans", fontSize: "13px", color: "#8f5140" });
      const title = this.add.text(width - 16, 22, this.session.problem.author, { fontFamily: "DeskSans", fontSize: "11px", color: "#74715f" }).setOrigin(1, 0);
      const footer = this.add.text(15, height + 103, "一枚の原稿になりました。", { fontFamily: "DeskSans", fontSize: "11px", color: "#74715f" });
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
    this.notice = event === "incorrect" ? "原文とは、まだ少し違うようです。切れ目を外して読み直してみましょう。" : event === "split" ? "つながりを外しました。" : event === "undo" ? "一つ前の操作に戻しました。" : event === "complete" ? "一枚の原稿になりました。" : "";
    this.syncPaper();
    if (event === "complete") this.readingCamera();
    else if (wasComplete && event === "undo") this.overview();
    const paper = this.manuscript ?? (this.selected ? this.views.get(this.selected)?.paper : undefined);
    if (paper && ["tentative", "complete"].includes(event)) paper.confirm(!this.reduced);
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
    if (this.target) this.ports.lineStyle(3 / zoom, 0x9f4f3d).strokeCircle(this.target.point.x, this.target.point.y, 22 / zoom);
  }

  private worldPoint(pointer: Point): Phaser.Math.Vector2 {
    this.boardCamera.preRender();
    return this.boardCamera.getWorldPoint(pointer.x, pointer.y);
  }
  private onBoard(pointer: Point): boolean { return pointer.y >= this.top && pointer.y < this.h - 112; }
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
    const dx = drift(pointer.x, 0, this.w), dy = drift(pointer.y, this.top, this.h - 112);
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
    else if (key === "r" && this.session.canCheck) this.apply({ type: "check" });
    else if (key === "h") this.openOverlay("help");
    else if (key === "m") this.openOverlay("settings");
    else if (key === "+" || key === "=" || key === "-") this.zoomAt({ x: this.w / 2, y: (this.top + this.h - 112) / 2 }, key === "-" ? .9 : 1.1);
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

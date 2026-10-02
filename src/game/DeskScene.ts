import Phaser from "phaser";
import { PASSAGES } from "../data/passages.ts";
import { Run, type Submission } from "./run.ts";
import { NarrationPlayer, NARRATION_MESSAGES, type NarrationState } from "./narration.ts";
import { NARRATION, type NarrationVoice } from "../data/narration.ts";
import { hintExcerpt, revealOffset } from "./hint-context.ts";
import { deskViewport, insideBoard, constrainPointer } from "./viewport.ts";
import { primaryPress, TouchTaps } from "./gestures.ts";

import { detachedChains, type Chain, type Command, type Point, type CuratedPassage } from "./model.ts";
import { comparisonText, graphemes, type Difficulty } from "./text.ts";
import { CELL, dealManuscript, detachedPositions, layoutManuscript } from "./layout.ts";
import { prepareFont, prepareText } from "./fonts.ts";
import { Paper, PAPER, MAT } from "./paper.ts";
import { playCue, prepareSounds } from "./sound.ts";
import type { DeskSnapshot, HostBridge } from "./bridge.ts";

const WORKS = PASSAGES.filter((passage, index) => PASSAGES.findIndex((other) => other.workId === passage.workId) === index);

const PREPARATION_ERROR = "原稿の書体を読み込めませんでした。接続を確認して再試行してください。進み具合は変わりません。";
export const UI_TEXT = PREPARATION_ERROR + Object.values(NARRATION_MESSAGES).join("") + `原稿の準備 書体を再試行 ライセンス 再試行 朗読を再試行 ライフ 片 別のタブで挑戦が更新されました。ここから再開できます。別のタブの更新を読み込めません。このタブを読み直してください。 前の結果を見る 原文の順序をどこまで思い出せるか 挑戦全体 細かめ ふつう 中断した挑戦を再開 挑戦を中断・終了する 今回の結果へ戻る ライフ 読み通しています 確認済みを早送り ここで途切れました ここから先は未判定です 読み通せました 前の抜粋を読み返す 次の抜粋を読み返す 停止 聴く この作品を読み通しました ここまで読み通せました 問クリア 今回の挑戦 続きを聴く 読み返す もう一度挑む 朗読の声 女性 男性 紙片の細かさ 合成音声 Irodori-TTS v4.1 Small 新しい挑戦を始めますか 中断した挑戦は終了します 新しい挑戦は3ライフ・ヒント1回で始まります 中断しても盤面・ライフ・ヒントはこの端末に残ります 原文と出典は挑戦を終えた後に読めます 中断して戻る 挑戦を終える 新しく始める すべての紙片を一つにつないでください 片目で途切れました 離れた塊の中は未判定です この端末では設定を保存できません 設定を読み込めません 挑戦を保存できません この画面を閉じると再開できない場合があります 保存した挑戦を読み込めません 新しい挑戦を始められます 青空文庫の原文 誤答でライフが1減ります 原文の順序を復元しましょう  隠す ヒントを隠す。紙片の印は残ります ヒントを見る。選んだ紙片と続き ヒントを隠す ヒントを見る 通知を閉じる 紙片を選ぶ ヒントを閉じても印は残ります。 PCは右クリック、スマホはダブルタップで紙片を外します。 選んだ紙片を見る 続きを見る 緑の下線が選んだ紙片、黄色が続きです。画面下の一節を押すとその場所へ移動できます。 ヒント 残り 回 取消 次の問題 ランダム出題 読む手掛かり 続きを知りたい紙片を選ぶ。塊は末尾が対象です。 色のついた部分が続きです。自動ではつなぎません。 前に見たヒントです。 続きを表示できません。別の紙片を選んでください。 残り0回です。前に見た紙片は再表示できます。 ヒントは挑戦全体で1回。取消・再表示は減りません。 誤答でライフが1減ります。原文の順序を復元しましょう。 同じ作品の別の抜粋をランダムに出題します。 問からランダムに出題 ヒントで続きを表示した紙片だけ色がつきます。 作品を選ぶ 作品選択に戻る パズルを続ける パズルを始める すべての紙片を表示 原稿全体を表示 音量を下げる 音量を上げる 消音を解除 消音にする 紙片をひろげる 遊び方 読了 枚の紙片 ↗ 青空パズル つなぐ 手掛かり 読み通す 別の情景 同じ情景 もう一度 つながりを見直す 原文 出典を読む 全体表示 元に戻す 遊び方 設定 閉じる 作品選択に戻りますか 途中の配置は保存されません。 続ける 選び直す 一枚の原稿になりました。 紙片を選び、相手の端へ 余白を動かすと、ほかの紙片が見つかります 左端が前、右端が後。選んだ紙片をつなぎます。 右クリック・ダブルタップで紙片を外せます。 つながりを作りました。 つながりを外しました。 一つ前の操作に戻しました。 原文とは、まだ少し違うようです。紙片を外して読み直してみましょう。 ひとつにつながりました。読み通して確かめましょう。 音量 小 大 音なし 動きを控える 有効 無効 このブラウザでは音を利用できません。 紙片をドラッグして、相手の端へ。 紙片を選んでから相手の端をタップしてもつながります。 正誤は最後に読み通すまで分かりません。 外したい紙片を、PCは右クリック、スマホはダブルタップ。 余白をドラッグして移動。二本指・ホイールで拡大縮小。 矢印で移動、Enterで選択、[ と ]で前後へ。 Deleteで分離、Zで元に戻す、Hで遊び方、Escで取消。 次の手掛かり 前へ 次へ 準備中です。 読み込めませんでした。 読み込みを完了できませんでした。 段落の順序を確かめる 紙片 残り 組 つながり 確認 正解の場所は示しません 記録 この三問は手作業で選んだ抜粋です。 答えは、つなぎ終えたあとに。 選択した紙片を前につなぐ 選択した紙片を後につなぐ 番目の切れ目を外す 01 02 03 / · ← → ＋ − × … ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789[]()%「」、。`;

type Overlay = "settings" | "leave" | "replace" | "prepare" | "help" | "hint";
const SAVE_KEY = "aozora-puzzle-run-v1";
const SETTINGS_KEY = "aozora-puzzle-settings-v1";
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
  private run?: Run;
  private atSelection = true;
  private reviewing = false;
  private startingWork?: string;
  private reviewIndex = 0;
  private difficulty: Difficulty = "normal";
  private voice: NarrationVoice = "female";
  private narration?: NarrationPlayer;
  private presentation?: { submission: Submission; active: number; confirmed: number; stage: "reading" | "stopped" | "celebrating"; lives: number; clears: number };
  private outcomeMark?: Submission;
  private suspendedHint?: { anchor: string; target: string; expanded: boolean };
  private audioNotice = "";
  private audioRetryable = false;
  private narrationState: NarrationState = "loading";
  private replayStart = 0;
  private replaying = false;
  private replayActive = -1;
  private replayConfirmed = 0;
  private saveError = "";
  private savedRunValue: string | null = null;
  private get session() { return this.atSelection ? undefined : this.run?.session; }
  private get currentPassage(): CuratedPassage | undefined { return this.run?.currentPassage; }
  private get ended(): boolean { return !!this.run && this.run.status === "ended" && !this.run.pending && !this.presentation; }
  private get reviewPassages(): CuratedPassage[] { return this.run ? this.run.seen.map((id) => PASSAGES.find((p) => p.id === id)!).filter(Boolean) : []; }
  private get reviewPassage(): CuratedPassage | undefined { return this.reviewPassages[this.reviewIndex]; }
  private get hintsRemaining(): number { return this.run?.hintsRemaining ?? 1; }
  private get canEdit(): boolean { return !!this.session && this.assembling && !this.presentation && !this.ended; }
  private hintSelecting = false;
  private hintAnchor?: string;
  private hintTarget?: string;
  private hintDescription = "";
  private hintExpanded = false;
  private selected?: string;
  private focused?: string;
  private gesture?: Gesture;
  private touchTaps = new TouchTaps();
  private target?: Target;
  private pinch?: { distance: number; zoom: number; world: Point };
  private suppressRelease = false;
  private overlay?: Overlay;
  private libraryPage = 0;
  private hintIndex = 0;
  private retryPreparation?: () => Promise<void>;
  private busy = false;
  private notice = "";
  private reportedError = "";
  private actions = new Map<string, ButtonAction>();
  private volume = .7;
  private reduced = false;
  private hasAudio = false;
  private serial = 0;
  private alive = true;

  constructor(bridge: HostBridge, onReady: () => void) { super({ key: "Desk" }); this.bridge = bridge; this.onReady = onReady; }
  private get w(): number { return this.scale.width; }
  private get h(): number { return this.scale.height; }
  private get top(): number { return 52; }
  private get hasHintContext(): boolean { return !!(this.assembling && this.hintAnchor && this.hintTarget); }
  private get contextNotice(): string {
    if (!this.session) return "";
    if (this.saveError) return this.saveError;
    if (this.audioNotice && (this.presentation?.stage === "reading" || this.replaying)) return this.audioNotice;
    return this.assembling && (!!this.notice && this.notice === this.reportedError || /^(原文の順序と|原文とは|残り0回です|続きを表示できません)/.test(this.notice)) ? this.notice : "";
  }
  private get contextOpen(): boolean { return !!this.contextNotice || (this.hasHintContext && this.hintExpanded); }
  private get boardBottom(): number { return this.boardCamera.y + this.boardCamera.height; }
  private get columns(): number { return Math.max(8, Math.min(this.assembling ? 16 : 22, Math.floor((this.w - 88) / CELL))); }
  private get assembling(): boolean { return this.session?.state.phase === "assembling" && !this.reviewing; }

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
    this.restoreSettings();
    const manager = this.sound instanceof Phaser.Sound.WebAudioSoundManager ? this.sound : undefined;
    this.narration = new NarrationPlayer({ context: manager?.context, output: manager?.destination });
    this.restoreRun();
    window.addEventListener("pagehide", this.onPageHide);
    window.addEventListener("storage", this.onStorage);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    this.input.on("pointerdown", this.onDown, this);
    this.input.on("pointermove", this.onMove, this);
    this.input.on("pointerup", this.onUp, this);
    this.input.on("pointerupoutside", this.cancelGesture, this);
    this.input.on("wheel", this.onWheel, this);
    this.scale.on("resize", this.resize, this);
    this.game.events.on(Phaser.Core.Events.BLUR, this.cancelGesture, this);
    this.game.canvas.tabIndex = 0;
    this.game.canvas.setAttribute("aria-label", "青空パズル。遊び方はHキー。Tabキーで同じ操作の読み上げ用ボタンへ移動します。");
    this.game.canvas.addEventListener("keydown", this.onKey);
    this.game.canvas.addEventListener("pointercancel", this.cancelGesture);
    this.game.canvas.addEventListener("touchcancel", this.cancelGesture);
    this.game.canvas.addEventListener("contextmenu", this.onContextMenu);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.resize();
    this.onReady();
  }

  private shutdown(): void {
    this.saveRun();
    this.narration?.destroy();
    window.removeEventListener("pagehide", this.onPageHide);
    window.removeEventListener("storage", this.onStorage);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.alive = false;
    this.serial++;
    this.scale.off("resize", this.resize, this);
    this.game.events.off(Phaser.Core.Events.BLUR, this.cancelGesture, this);
    this.game.canvas.removeEventListener("keydown", this.onKey);
    this.game.canvas.removeEventListener("pointercancel", this.cancelGesture);
    this.game.canvas.removeEventListener("touchcancel", this.cancelGesture);
    this.game.canvas.removeEventListener("contextmenu", this.onContextMenu);
    this.views.clear();
  }

  private resize(): void {
    this.cancelGesture();
    this.updateBoardViewport();
    this.uiCamera.setSize(this.w, this.h);
    this.syncPaper();
    if (this.manuscript) this.readingCamera();
    this.render();
  }

  private updateBoardViewport(): void {
    const camera = this.boardCamera;
    const bounds = deskViewport(this.w, this.h, this.contextOpen);
    if (camera.x === bounds.x && camera.y === bounds.y && camera.width === bounds.width && camera.height === bounds.height) return;
    // Phaser zooms around the viewport centre. Resizing a tray must only change
    // the clipping rectangle, never move the paper the player was looking at.
    const screen = { x: camera.x, y: camera.y };
    const before = this.worldPoint(screen);
    camera.setViewport(bounds.x, bounds.y, bounds.width, bounds.height);
    const after = this.worldPoint(screen);
    camera.setScroll(camera.scrollX + before.x - after.x, camera.scrollY + before.y - after.y);
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
    let armed: number | undefined;
    container.on("pointerover", () => { label.setAlpha(.65); this.game.canvas.style.cursor = "pointer"; });
    container.on("pointerdown", (pointer: Phaser.Input.Pointer) => { armed = primaryPress(pointer) && this.touching().length <= 1 ? pointer.id : undefined; if (armed !== undefined) { label.y = height / 2 + 1; this.game.canvas.focus({ preventScroll: true }); } });
    container.on("pointerout", () => { armed = undefined; label.y = height / 2; label.setAlpha(1); this.game.canvas.style.cursor = "default"; });
    container.on("pointerup", (pointer: Phaser.Input.Pointer) => { label.y = height / 2; const activate = armed === pointer.id && !pointer.wasCanceled && !this.suppressRelease && (pointer.wasTouch || pointer.button === 0); armed = undefined; if (activate) this.dispatch(id); });
    this.hud.add(container);
  }

  dispatch(id: string): void {
    if (!this.alive || (this.busy && !(this.overlay === "prepare" && id === "close"))) return;
    this.touchTaps.cancel();
    if (id.startsWith("piece:")) {
      if (!this.canEdit || this.overlay) return;
      if (this.hintSelecting) { this.revealHint(id.slice(6)); return; }
      this.clearHint(); this.notice = "";
      this.selected = id.slice(6); this.focused = this.selected;
      this.syncSelection(); this.render(); return;
    }
    if (id.startsWith("join:")) {
      const [, side, target] = id.split(":");
      if (this.canEdit && this.selected && (side === "before" || side === "after") && !this.overlay && !this.hintSelecting) this.apply({ type: "join", source: this.selected, target, side });
      return;
    }
    if (id.startsWith("split:")) {
      const [, chain, boundary] = id.split(":");
      if (this.canEdit && !this.overlay && !this.hintSelecting) this.apply({ type: "split", chain, boundary: Number(boundary) });
      return;
    }
    this.actions.get(id)?.invoke();
  }

  focus(id: string): void {
    if (!this.alive || this.busy) return;
    if (id.startsWith("piece:") && !this.overlay) {
      this.focused = id.slice(6);
      const paper = this.views.get(this.focused)?.paper;
      if (paper) this.boardCamera.centerOn(paper.x + paper.width / 2, paper.y + paper.height / 2);
      this.syncSelection();
      return;
    }
    const action = this.actions.get(id);
    this.focusRing?.clear();
    if (action) this.focusRing.lineStyle(3, 0x9f4f3d).strokeRectShape(action.bounds);
  }

  private render(): void {
    if (!this.alive) return;
    this.updateBoardViewport();
    this.syncSelection();
    this.hud.removeAll(true);
    this.actions.clear();
    this.world.setVisible(!!this.session && (!this.ended || this.reviewing));
    if (!this.session) this.renderLibrary();
    else if (this.ended && !this.reviewing) this.renderResult();
    else this.renderDesk();
    if (this.overlay) this.renderOverlay();
    this.focusRing = this.add.graphics();
    this.hud.add(this.focusRing);
    this.publish();
  }

  private renderLibrary(): void {
    const compact = this.w < 700;
    const short = this.h < 580;
    const passage = WORKS[this.libraryPage % WORKS.length];
    const count = PASSAGES.filter((item) => item.workId === passage.workId).length;
    const width = Math.min(600, this.w - 48);
    const height = Math.min(short ? 246 : compact ? 342 : 286, this.h - (this.run ? 184 : 132));
    const x = (this.w - width) / 2, y = Math.max(this.run ? 110 : 68, (this.h - height) / 2 - 14);
    const ground = this.add.graphics().fillStyle(MAT).fillRect(0, 0, this.w, this.h);
    // The same unbounded working surface holds the invitation and the puzzle.
    ground.lineStyle(1, 0x8f9c8d, .16).lineBetween(28, 44, this.w - 28, 44);
    this.hud.add(ground);
    this.label("青空パズル", 28, 16, 16, 0, "#637267");
    this.button("settings", "設定", this.w - 118, 10, 90, 44, () => this.openOverlay("settings"));
    this.panel(x, y, width, height);
    const margin = compact ? 28 : 40;
    const tinyCard = height < 190, compressed = short && !!this.run;
    if (!tinyCard) {
      this.label(`0${this.libraryPage + 1}  /  03`, x + margin, y + 28, 11, 0, "#8b7463");
      this.label("作品を選ぶ", x + width - margin - 70, y + 28, 11, 0, "#8b7463");
    }
    const titleY = y + (tinyCard ? 20 : compressed ? 47 : short ? 65 : compact ? 80 : 62);
    const titleSize = tinyCard ? 28 : compressed ? 34 : this.w < 380 ? 30 : compact ? 32 : 44;
    this.fitLabel(passage.title, x + margin - 2, titleY, titleSize, width - margin * 2, "#33483e", tinyCard ? 1 : 2);
    if (height >= 155) this.label(passage.author, x + margin, titleY + (compressed || tinyCard ? 46 : compact ? 55 : 64), compact ? 11 : 12, width - margin * 2, "#727668");
    if (!short) this.label("3ライフで、原文の順序をどこまで思い出せるか。", x + margin, y + (compact ? 186 : 166), 13, width - margin * 2, "#626e61", true);
    const rule = this.add.graphics().lineStyle(1, 0xaa6652, .42).lineBetween(x + margin, y + height - 65, x + width - margin, y + height - 65);
    this.hud.add(rule);
    this.label(`${count}問 · ${this.difficulty === "hard" ? "細かめ" : "ふつう"}`, x + margin, y + height - 42, 12, 0, "#7d7b6c");
    this.label("始める →", x + width - margin - 68, y + height - 42, 13, 0, "#354c42");
    const id = `open-${passage.id}`;
    const bounds = new Phaser.Geom.Rectangle(x, y, width, height);
    this.actions.set(id, { label: `『${passage.title}』の${count}問からランダムに始める`, invoke: () => { this.requestStartWork(passage.workId); }, bounds });
    const sheet = this.add.zone(x, y, width, height).setOrigin(0).setInteractive();
    let armed: number | undefined;
    sheet.on("pointerover", () => { this.game.canvas.style.cursor = "pointer"; });
    sheet.on("pointerdown", (pointer: Phaser.Input.Pointer) => { armed = primaryPress(pointer) && this.touching().length <= 1 ? pointer.id : undefined; if (armed !== undefined) this.game.canvas.focus({ preventScroll: true }); });
    sheet.on("pointerout", () => { armed = undefined; this.game.canvas.style.cursor = "default"; });
    sheet.on("pointerup", (pointer: Phaser.Input.Pointer) => { const activate = armed === pointer.id && !pointer.wasCanceled && !this.suppressRelease && (pointer.wasTouch || pointer.button === 0); armed = undefined; if (activate) this.dispatch(id); });
    this.hud.add(sheet);
    const navY = y + height + 16;
    const navWidth = Math.min(390, this.w - 40);
    const titleWidths = WORKS.map((item) => graphemes(item.title).length + 2);
    const totalWidth = titleWidths.reduce((sum, value) => sum + value, 0);
    let navX = (this.w - navWidth) / 2;
    WORKS.forEach((item, index) => {
      const itemWidth = navWidth * titleWidths[index] / totalWidth;
      this.button(`scene-${index}`, item.title, navX, navY, itemWidth, 44, () => { this.libraryPage = index; this.notice = ""; this.render(); });
      this.actions.get(`scene-${index}`)!.label = `『${item.title}』を選ぶ`;
      if (index === this.libraryPage) {
        const mark = this.add.graphics().fillStyle(0xa05c47).fillCircle(navX + itemWidth / 2, navY + 45, 2);
        this.hud.add(mark);
      }
      navX += itemWidth;
    });
    if (this.run) {
      this.button("resume", `${this.run.status === "ended" && !this.run.pending ? "前の結果を見る" : "中断した挑戦を再開"} · ${this.run.clears}/${this.run.total}問`, Math.max(12, this.w / 2 - 145), 54, 290, 44, () => { void this.resumeRun(); }, true);
    }
    if (this.notice) this.label(this.notice, 28, this.h - 30, 12, this.w - 56, "#735746");
  }

  private renderDesk(): void {
    const session = this.session!, run = this.run!;
    const complete = session.state.phase === "complete";
    this.hud.add(this.add.graphics().fillStyle(MAT).fillRect(0, 0, this.w, this.top).fillRect(0, this.boardBottom, this.w, this.h - this.boardBottom));
    this.button("library", "←", 4, 4, 40, 44, () => this.ended ? this.showResult() : this.openOverlay("leave"));
    this.actions.get("library")!.label = this.ended ? "今回の結果へ戻る" : "挑戦を中断・終了する";
    this.label("青空パズル", 48, 16, this.w < 400 ? 14 : 16, 0, "#354b40");
    const lives = this.presentation?.lives ?? run.lives, clears = this.presentation?.clears ?? run.clears;
    const statusX = this.w < 400 ? 138 : 155;
    if (this.w < 480) {
      this.label(`ライフ ${lives}`, statusX, 8, 10, 0, lives === 1 ? "#8b6048" : "#697365");
      this.label(`${clears} / ${run.total} 問`, statusX, 27, 11, 0, "#697365", true);
    } else this.label(`ライフ ${lives}　 ${clears} / ${run.total} 問`, statusX, 17, 12, 0, "#697365", true);
    this.button("overview", "全体", this.w - 96, 4, 48, 44, () => this.overview());
    this.button("settings", "設定", this.w - 48, 4, 44, 44, () => this.openOverlay("settings"));
    this.actions.get("overview")!.label = complete || this.reviewing ? "原稿全体を表示" : "すべての紙片を表示";
    const y = this.h - 48;
    if (this.reviewing) {
      this.renderPlaybackNotice();
      const passage = this.reviewPassage!;
      this.button("review-prev", "←", 4, y, 40, 44, () => { void this.openReview((this.reviewIndex + this.reviewPassages.length - 1) % this.reviewPassages.length); });
      this.button("review-next", "→", 46, y, 40, 44, () => { void this.openReview((this.reviewIndex + 1) % this.reviewPassages.length); });
      this.actions.get("review-prev")!.label = "前の抜粋を読み返す";
      this.actions.get("review-next")!.label = "次の抜粋を読み返す";
      this.button("review-play", this.replaying ? "停止" : "聴く", this.w / 2 - 38, y, 76, 44, () => this.replaying ? this.stopReview() : this.playReview(0), !this.replaying);
      this.button("source", "出典 ↗", this.w - 88, y, 84, 44, () => window.open(passage.sourceUrl, "_blank", "noopener,noreferrer"));
      this.actions.get("source")!.label = "青空文庫で出典を読む";
      return;
    }
    if (this.presentation) {
      this.renderPlaybackNotice();
      const p = this.presentation;
      const text = p.stage === "stopped" ? "ここで途切れました" : p.stage === "celebrating" ? "読み通せました" : this.readingStatus(p.active, p.submission.tiles.length);
      this.fitLabel(text, 14, y + 13, 12, this.w - (p.submission.skipPrefixCount > p.confirmed ? 178 : 28), "#64705f", 1);
      if (p.stage === "reading" && p.submission.skipPrefixCount > 0 && p.confirmed < p.submission.skipPrefixCount) this.button("skip-prefix", "確認済みを早送り", this.w - 160, y, 154, 44, () => this.narration?.skipToFragment(p.submission.skipPrefixCount));
      return;
    }
    if (complete) {
      this.label("読み通せました", 14, y + 13, 12, 0, "#526452");
      this.button("next", "次の問題 →", this.w - 136, y, 130, 44, () => { void this.nextQuestion(); }, true);
      return;
    }
    if (this.hintSelecting) this.label("紙片を選ぶ", 14, y + 13, 12, 0, "#647465");
    else if (session.canUndo) this.button("undo", "元に戻す", 4, y, 76, 44, () => this.apply({ type: "undo" }));
    else this.button("help", "遊び方", 4, y, 80, 44, () => this.openOverlay("help"));
    if (this.contextNotice) {
      this.fitLabel(this.contextNotice, 12, this.boardBottom + 5, 12, this.w - 68, "#647465", 2, false);
      this.button("notice-close", "×", this.w - 48, this.boardBottom + 4, 44, 44, () => { this.notice = ""; this.audioNotice = ""; this.render(); });
      this.actions.get("notice-close")!.label = "通知を閉じる";
    } else if (this.hasHintContext && this.hintExpanded) this.renderHintContext();
    const checkingWithContext = session.canCheck && !this.hintSelecting && this.hasHintContext;
    if (this.hasHintContext) {
      this.button("hint-context-toggle", checkingWithContext ? this.hintExpanded ? "隠す" : "見る" : this.hintExpanded ? "ヒントを隠す" : "ヒントを見る", checkingWithContext ? this.w / 2 + 12 : this.w / 2 - 66, y, checkingWithContext ? 44 : 104, 44, () => { this.cancelGesture(); this.notice = ""; this.hintExpanded = !this.hintExpanded; this.saveRun(); this.render(); });
      this.actions.get("hint-context-toggle")!.label = this.hintExpanded ? "ヒントを隠す。紙片の印は残ります" : "ヒントを見る。選んだ紙片と続き";
    }
    if (session.canCheck && !this.hintSelecting) this.button("check", "読み通す", this.w / 2 - (checkingWithContext ? 76 : 66), y, checkingWithContext ? 84 : 104, 44, () => this.submit(), true);
    this.button("hint", this.hintSelecting ? `取消 残り${this.hintsRemaining}` : checkingWithContext ? `ヒント ${this.hintsRemaining}` : `ヒント 残り${this.hintsRemaining}`, this.w - (checkingWithContext ? 100 : 112), y, checkingWithContext ? 96 : 108, 44, () => this.toggleHint(), this.hintSelecting);
    this.actions.get("hint")!.label = this.hintSelecting ? `ヒントを取り消す。残り${this.hintsRemaining}回` : `ヒント。挑戦全体で残り${this.hintsRemaining}回。紙片を選ぶと続きを表示`;
  }

  private readingStatus(active: number, total: number): string {
    if (this.narrationState === "loading") return NARRATION_MESSAGES.loading;
    const reading = this.volume === 0 || this.narrationState === "visual" ? NARRATION_MESSAGES.visual : "読み通しています…";
    return `${reading}　${Math.max(1, active + 1)} / ${total} 片`;
  }

  private renderPlaybackNotice(): void {
    if (!this.contextNotice) return;
    const retry = !this.saveError && this.audioRetryable && (this.presentation?.stage === "reading" || this.replaying);
    this.fitLabel(this.contextNotice, 14, this.boardBottom + 6, 12, this.w - (retry ? 92 : 28), "#7d715e", 2, false);
    if (retry) {
      this.button("retry-audio", "再試行", this.w - 76, this.boardBottom + 4, 70, 44, () => {
        // Replay only the existing receipt. Never submit again or spend another life.
        if (this.presentation?.stage === "reading" && this.run?.pending) this.presentSubmission(this.run.pending);
        else if (this.replaying) this.playReview(this.replayStart);
      });
      this.actions.get("retry-audio")!.label = "朗読を再試行";
    }
  }

  private renderResult(): void {
    const run = this.run!, width = Math.min(560, this.w - 40), height = Math.min(380, this.h - 32);
    const x = (this.w - width) / 2, y = (this.h - height) / 2;
    this.panel(x, y, width, height);
    this.fitLabel(run.currentPassage.title, x + 24, y + 22, 22, width - 48, "#354b40");
    this.label(run.endReason === "conquered" ? "この作品を読み通しました" : "ここまで読み通せました", x + 26, y + 64, 14, width - 52, "#65715f");
    this.label(`${run.clears} / ${run.total} 問`, x + 24, y + (height < 340 ? 90 : 102), height < 340 ? 32 : 44, width - 48, "#354b40", true);
    if (height >= 340) this.label(`${run.difficulty === "hard" ? "細かめ" : "ふつう"} · 今回の挑戦`, x + 28, y + 169, 12, width - 56, "#727668");
    const controlsY = y + height - 122;
    if (run.endReason === "failed") this.button("continue-listening", "続きを聴く", x + 18, controlsY, 124, 44, () => { void this.continueListening(); }, true);
    this.button("review", "読み返す", x + (run.endReason === "failed" ? 148 : 18), controlsY, 110, 44, () => { void this.openReview(this.reviewPassages.length - 1); });
    this.button("restart", "もう一度挑む", x + 18, y + height - 62, 138, 44, () => { void this.openWork(run.currentPassage.workId); }, true);
    this.button("choose", "作品を選ぶ", x + width - 136, y + height - 62, 118, 44, () => this.leave());
    this.button("settings", "設定", this.w - 54, 4, 48, 44, () => this.openOverlay("settings"));
  }

  private renderOverlay(): void {
    this.actions.clear();
    this.hud.add(this.add.graphics().fillStyle(MAT, .95).fillRect(0, 0, this.w, this.h));
    const width = Math.min(560, this.w - 32);
    const short = this.h < 420;
    const height = Math.min(this.h - 32, this.overlay === "help" ? 490 : 400);
    const x = (this.w - width) / 2, y = (this.h - height) / 2;
    this.panel(x, y, width, height);
    const bottom = y + height - 64;
    if (this.overlay === "prepare") {
      this.label("原稿の準備", x + 24, y + 28, 23, width - 48, "#354b40", true);
      this.label(this.notice, x + 24, y + 88, 14, width - 48);
      if (!this.busy) {
        this.button("retry-preparation", "再試行", x + 20, bottom, 100, 44, () => { void this.retryPreparation?.(); }, true);
        this.actions.get("retry-preparation")!.label = "書体を再試行";
      }
    } else if (this.overlay === "settings") {
      this.label("設定", x + 24, y + 18, 23, 0, "#354b40", true);
      const row = short ? 46 : 49, first = y + (short ? 55 : 67);
      this.label(`音量 ${Math.round(this.volume * 100)}%`, x + 24, first + 13, 13);
      this.button("quieter", "−", x + width - 174, first, 44, 44, () => this.setVolume(this.volume - .1));
      this.button("louder", "＋", x + width - 130, first, 44, 44, () => this.setVolume(this.volume + .1));
      this.button("mute", "消音", x + width - 82, first, 62, 44, () => this.setVolume(this.volume ? 0 : .7), this.volume === 0);
      this.actions.get("quieter")!.label = "音量を下げる"; this.actions.get("louder")!.label = "音量を上げる";
      this.actions.get("mute")!.label = this.volume === 0 ? "消音を解除" : "消音にする";
      this.label("朗読の声", x + 24, first + row + 13, 13);
      this.button("voice-female", "女性", x + width - 166, first + row, 68, 44, () => { this.voice = "female"; this.saveSettings(); this.render(); }, this.voice === "female");
      this.button("voice-male", "男性", x + width - 92, first + row, 68, 44, () => { this.voice = "male"; this.saveSettings(); this.render(); }, this.voice === "male");
      this.button("motion", `動きを控える：${this.reduced ? "有効" : "無効"}`, x + 16, first + row * 2, width - 32, 44, () => { this.reduced = !this.reduced; this.saveSettings(); this.render(); });
      if (this.atSelection) {
        this.label("紙片の細かさ", x + 24, first + row * 3 + 13, 13);
        this.button("difficulty-normal", "ふつう", x + width - 176, first + row * 3, 74, 44, () => { this.difficulty = "normal"; this.saveSettings(); this.render(); }, this.difficulty !== "hard");
        this.button("difficulty-hard", "細かめ", x + width - 98, first + row * 3, 74, 44, () => { this.difficulty = "hard"; this.saveSettings(); this.render(); }, this.difficulty === "hard");
      } else if (this.session) this.fitLabel(`${this.session.problem.title} · ${this.run!.difficulty === "hard" ? "細かめ" : "ふつう"}`, x + 24, first + row * 3 + 13, 12, width - 48, "#768074", 1, false);
      if (!short) this.label("合成音声：Irodori-TTS v4.1 Small", x + 24, first + row * 4 + 10, 11, width - 48, "#768074");
      if (this.canEdit) this.button("help", "遊び方", x + 16, bottom, 76, 44, () => this.openOverlay("help"));
      this.button("licenses", "ライセンス", x + (this.canEdit ? 92 : 16), bottom, 80, 44, () => window.open("/third-party-notices.txt", "_blank", "noopener,noreferrer"));
    } else if (this.overlay === "hint") {
      this.label("読む手掛かり", x + 28, y + 28, 25, 0, "#354b40", true);
      const hints = this.session!.problem.hints;
      this.label(`${this.hintIndex + 1} / ${hints.length}`, x + width - 74, y + 38, 11, 0, "#817462");
      this.label(hints[this.hintIndex], x + 28, y + 99, 18, width - 56, "#475a4c", true);
      if (this.hintIndex > 0) this.button("hint-prev", "←", x + 20, bottom, 44, 44, () => { this.hintIndex--; this.render(); });
      if (this.hintIndex < hints.length - 1) this.button("hint-next", "→", x + 72, bottom, 44, 44, () => { this.hintIndex++; this.render(); });
      if (this.actions.has("hint-prev")) this.actions.get("hint-prev")!.label = "前の手掛かり";
      if (this.actions.has("hint-next")) this.actions.get("hint-next")!.label = "次の手掛かり";
    } else if (this.overlay === "help") {
      this.label("遊び方", x + 28, y + 28, 25, 0, "#354b40", true);
      const instructions = short ? `紙片をドラッグして相手の端へ。選んでから端をタップしてもつながります。
PCは右クリック、スマホはダブルタップで紙片を外します。
ヒントは挑戦全体で1回。取消・再表示は減りません。
余白をドラッグして移動。二本指・ホイールで拡大縮小。` : `紙片をドラッグして、相手の端へ。
紙片を選んでから相手の端をタップしてもつながります。

外したい紙片を、PCは右クリック、スマホはダブルタップ。

ヒントは挑戦全体で1回。取消・再表示は減りません。
誤答でライフが1減ります。原文の順序を復元しましょう。

余白をドラッグして移動。二本指・ホイールで拡大縮小。`;
      this.label(instructions, x + 28, y + (short ? 70 : 80), 14, width - 56);
      this.button("reading-clues", "読む手掛かり", x + 20, bottom, 112, 44, () => this.openOverlay("hint"));
      if (height >= 460 && this.w >= 700) this.label(`矢印で移動、Enterで選択、[ と ]で前後へ。
Deleteで分離、Zで元に戻す、Hで遊び方、Escで取消。`, x + 28, bottom - 72, 11, width - 56, "#727668");
    } else if (this.overlay === "replace") {
      this.label("新しい挑戦を始めますか", x + 24, y + 30, 22, width - 48, "#354b40", true);
      this.label("中断した挑戦は終了します。新しい挑戦は3ライフ・ヒント1回で始まります。", x + 24, y + 95, 14, width - 48);
      this.button("replace-confirm", "新しく始める", x + 20, bottom, 136, 44, () => { if (this.startingWork) void this.openWork(this.startingWork); });
    } else {
      this.label("挑戦を中断・終了する", x + 24, y + 30, 22, width - 48, "#354b40", true);
      this.label("中断しても、盤面・ライフ・ヒントはこの端末に残ります。原文と出典は挑戦を終えた後に読めます。", x + 24, y + 88, 14, width - 48);
      this.button("suspend", "中断して戻る", x + 20, y + 186, 142, 44, () => this.leave());
      this.button("end-run", "挑戦を終える", x + 20, y + 236, 142, 44, () => this.endRun());
    }
    this.button("close", this.overlay === "leave" ? "続ける" : this.overlay === "prepare" && this.busy ? "取消" : "閉じる", x + width - 116, bottom, 92, 44, () => this.closeOverlay(), true);
  }

  private publish(): void {
    const actions = [...this.actions].map(([id, action]) => ({ id, label: action.label }));
    const mode = this.overlay ?? (!this.session ? "selection" : this.reviewing ? "review" : this.presentation ? this.presentation.stage : this.ended ? "result" : this.hintSelecting ? "hint-select" : this.session.state.phase);
    const lives = this.presentation?.lives ?? this.run?.lives, clears = this.presentation?.clears ?? this.run?.clears;
    const runStatus = this.session ? `ライフ${lives}。${this.run?.total}問中${clears}問クリア。` : "";
    const snapshot: DeskSnapshot = { mode, title: this.session ? `青空パズル · ${this.session.problem.title}` : "青空パズル", status: runStatus + (this.contextNotice || this.notice || (this.hintSelecting ? "続きを知りたい紙片を選ぶ。塊は末尾が対象です。" : "")), actions, pieces: [] };
    if (this.session && !this.overlay) {
      if (this.reviewing && this.ended) {
        snapshot.original = this.reviewPassage!.original;
        snapshot.description = `${this.reviewIndex + 1}/${this.reviewPassages.length}。${this.reviewPassage!.location}` + (this.replaying ? `。${this.replayActive + 1}片目を読んでいます。` : "");
      } else if (this.presentation) {
        const p = this.presentation;
        snapshot.description = p.stage === "stopped" ? `${p.submission.correctPrefix + 1}片目で途切れました。ここから先は未判定です。` : p.stage === "celebrating" ? "最後まで読み通せました。" : this.readingStatus(p.active, p.submission.tiles.length);
      } else if (this.canEdit) {
        snapshot.pieces = this.session.state.chains.map((chain) => ({ id: chain.id, text: this.session!.text(chain), selected: chain.id === this.selected }));
        snapshot.description = `原文の順序を復元してください。ヒントは挑戦全体で残り${this.hintsRemaining}回。` + this.hintDescription;
        if (this.selected && !this.hintSelecting) this.session.state.chains.forEach((chain) => {
          if (chain.id !== this.selected) actions.push({ id: `join:before:${chain.id}`, label: `「${this.session!.text(chain)}」の前につなぐ` }, { id: `join:after:${chain.id}`, label: `「${this.session!.text(chain)}」の後につなぐ` });
          else chain.bonds.forEach((_, index) => actions.push({ id: `split:${chain.id}:${index}`, label: `${index + 1}番目の切れ目を外す` }));
        });
      } else if (this.ended) snapshot.description = this.run!.endReason === "conquered" ? "この作品を読み通しました。挑戦した抜粋を読み返せます。" : "ここまで読み通せました。挑戦した抜粋を読み返せます。";
      else if (this.session.state.phase === "complete") snapshot.description = "読み通せました。次の問題へ進めます。";
    }
    if (this.overlay === "hint") snapshot.description = this.session!.problem.hints[this.hintIndex];
    if (this.overlay === "help") snapshot.description = "紙片をドラッグして相手の端へ。選んでから端をタップしてもつながります。外したい紙片を、PCは右クリック、スマホはダブルタップ。元に戻すで取り消せます。全部つないで読み通すと原文の順序を確かめます。誤答でライフが1減り、正しかった先頭だけが分かります。ヒントは挑戦全体で1回。取消・再表示は減りません。次問や元に戻すで回復しません。余白をドラッグして移動。二本指・ホイールで拡大縮小。";
    if (this.overlay === "leave") snapshot.description = "中断しても盤面・ライフ・ヒントは残ります。原文と出典は挑戦を終えた後に読めます。";
    this.bridge.publish(snapshot);
  }

  private async report(error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : "読み込みを完了できませんでした。";
    try { await prepareFont(message, "DeskSans"); }
    catch { this.bridge.fail(new Error(message)); return; }
    if (this.alive) { this.notice = message; this.reportedError = message; this.busy = false; this.render(); }
  }

  private requestStartWork(workId: string): void {
    if (!this.ensureCurrentRun()) return;
    if (this.run && this.run.status !== "ended") { this.startingWork = workId; this.openOverlay("replace"); }
    else void this.openWork(workId);
  }

  private async openWork(workId: string): Promise<void> {
    this.invalidatePlayback();
    try {
      const run = new Run(PASSAGES, workId, { difficulty: this.difficulty });
      await this.prepareRun(run);
    } catch (error) { await this.report(error); }
  }

  // Prepare off to the side: failures and retries never replace the current board/save.
  private async prepare(action: () => Promise<void>, retry: () => Promise<void>): Promise<boolean> {
    const request = ++this.serial;
    this.cancelGesture(); this.retryPreparation = retry; this.overlay = "prepare";
    this.busy = true; this.notice = "準備中です。"; this.render();
    try { await action(); }
    catch {
      if (this.alive && request === this.serial) {
        // This message is preloaded at boot, so showing it needs no failed font request.
        this.busy = false; this.notice = PREPARATION_ERROR; this.render();
      }
      return false;
    }
    if (!this.alive || request !== this.serial) return false;
    if (!this.ensureCurrentRun()) {
      if (request === this.serial) { this.busy = false; this.notice = this.saveError; this.render(); }
      return false;
    }
    this.busy = false; this.retryPreparation = undefined; this.overlay = undefined; this.notice = "";
    return true;
  }

  private async prepareRun(run: Run): Promise<void> {
    const passage = run.currentPassage;
    if (!await this.prepare(
      () => prepareText(passage.original + passage.title + passage.sceneTitle + passage.hints.join(""), `${UI_TEXT}${passage.title}${passage.author}`),
      () => this.prepareRun(run),
    )) return;
    if (run !== this.run) { this.outcomeMark = undefined; this.suspendedHint = undefined; }
    this.clearPapers(); this.run = run; this.atSelection = false; this.reviewing = false;
    this.hintSelecting = false; this.clearHint(); this.selected = undefined; this.focused = undefined; this.hintIndex = 0;
    if (run.session.state.phase === "reading") this.begin();
    else { this.syncPaper(); this.render(); }
    if (this.suspendedHint) {
      const { anchor, target, expanded } = this.suspendedHint;
      const a = run.session.problem.tiles.find((tile) => tile.id === anchor), t = run.session.problem.tiles.find((tile) => tile.id === target);
      if (a && t && run.session.snapshot().hints.some((pair) => pair.anchorId === anchor && pair.targetId === target)) {
        this.hintAnchor = anchor; this.hintTarget = target; this.hintExpanded = expanded;
        this.hintDescription = `「${a.text}」の続きは「${t.text}」です。`;
        this.syncSelection(); this.render();
      }
      this.suspendedHint = undefined;
    }
    if (!this.saveRun()) return;
    if (run.pending) this.presentSubmission(run.pending);
  }

  private async resumeRun(): Promise<void> { if (this.run) await this.prepareRun(this.run); }

  private async nextQuestion(): Promise<void> {
    if (this.busy || !this.run?.canAdvance || this.presentation || !this.ensureCurrentRun()) return;
    const next = Run.restore(this.run.snapshot(), PASSAGES);
    if (next.advance()) await this.prepareRun(next);
  }

  private submit(): void {
    if (!this.canEdit || this.overlay || !this.ensureCurrentRun()) return;
    this.cancelGesture(); this.hintSelecting = false; this.clearHint(); this.selected = undefined; this.focused = undefined;
    this.outcomeMark = undefined; this.audioNotice = "";
    const submission = this.run!.submit();
    if (!submission) { this.notice = "すべての紙片を一つにつないでください。"; this.render(); return; }
    if (this.saveRun()) this.presentSubmission(submission);
  }

  private presentSubmission(submission: Submission): void {
    const run = this.run!, session = run.session;
    const request = ++this.serial;
    this.narration?.stop(); this.replaying = false; this.audioNotice = ""; this.audioRetryable = false; this.narrationState = "loading";
    this.presentation = { submission, active: -1, confirmed: 0, stage: "reading", lives: run.lives + (submission.correct ? 0 : 1), clears: run.clears - (submission.correct ? 1 : 0) };
    this.notice = "読み通しています…"; this.syncSelection(); this.render();
    const byId = new Map(session.problem.tiles.map((tile) => [tile.id, tile.text]));
    const fragments = submission.tiles.map((id) => byId.get(id)!);
    const finish = () => {
      if (!this.alive || request !== this.serial || this.run !== run || !this.presentation) return;
      this.audioNotice = ""; this.audioRetryable = false;
      this.presentation.active = -1; this.presentation.confirmed = submission.correctPrefix;
      this.presentation.stage = submission.correct ? "celebrating" : "stopped";
      this.notice = submission.correct ? "最後まで読み通せました。" : `${submission.correctPrefix + 1}片目で途切れました。ここから先は未判定です。`;
      this.syncReading(); this.render();
      this.time.delayedCall(this.reduced ? 250 : submission.correct ? 450 : 650, () => {
        if (!this.alive || request !== this.serial || this.run !== run || !this.presentation) return;
        const chain = run.session.state.chains[0];
        const prefix = submission.tileTexts.slice(0, submission.correctPrefix).join("");
        const suffixPoint = !submission.correct && submission.correctPrefix > 0 && chain ? { x: chain.x + 18, y: chain.y + layoutManuscript(prefix, this.columns).height + 24 } : undefined;
        run.settle(submission.id, suffixPoint); if (!this.saveRun()) return;
        this.presentation.lives = run.lives; this.presentation.clears = run.clears;
        this.syncPaper();
        if (submission.correct) { this.readingCamera(); this.manuscript?.confirm(!this.reduced); playCue(this, "complete", this.volume); }
        this.render();
        this.time.delayedCall(this.reduced ? 200 : submission.correct && (run.lives === 1 || run.status === "ended") ? 1200 : 650, () => {
          if (!this.alive || request !== this.serial || this.run !== run) return;
          this.presentation = undefined; this.outcomeMark = submission.correct ? undefined : submission;
          this.notice = submission.correct ? "読み通せました。" : "原文の順序と違いました。離れた塊の中は未判定です。";
          this.saveRun(); this.syncPaper(); this.syncReading(); this.render();
        });
      });
    };
    if (submission.correctPrefix === 0) { this.presentation.active = 0; this.syncReading(); this.render(); this.time.delayedCall(this.reduced ? 200 : 500, finish); return; }
    void this.narration?.play({ track: NARRATION[session.problem.id]?.[this.voice], fragments, correctPrefix: submission.correctPrefix, maximumSkipFragment: submission.skipPrefixCount, volume: this.volume,
      onProgress: (active: number, confirmed: number) => { if (request !== this.serial || !this.presentation) return; this.presentation.active = active; this.presentation.confirmed = confirmed; this.syncReading(); this.render(); },
      onFinish: finish,
      onState: (state) => { if (request !== this.serial) return; this.narrationState = state; this.render(); },
      onFallback: (message, retryable) => { if (request !== this.serial) return; this.audioNotice = message; this.audioRetryable = retryable; this.render(); },
    });
  }

  private syncReading(): void {
    if (this.reviewing) { this.manuscript?.reading(this.replayActive, this.replayConfirmed); return; }
    const p = this.presentation;
    const mark = p?.submission ?? this.outcomeMark;
    for (const [id, { paper }] of this.views) {
      const chain = this.session?.state.chains.find((item) => item.id === id);
      if (!chain || !mark) { paper.clearReading(); continue; }
      const positions = chain.tiles.map((tile) => mark.tiles.indexOf(tile));
      const confirmed = positions.filter((index) => index >= 0 && index < (p?.confirmed ?? mark.correctPrefix)).length;
      const active = p ? positions.indexOf(p.active) : -1;
      const wrong = !p || p.stage === "stopped" ? chain.tiles.indexOf(mark.firstWrongTileId ?? "") : -1;
      paper.reading(active, confirmed, wrong);
    }
  }

  private invalidatePlayback(): void { this.serial++; this.retryPreparation = undefined; this.narration?.stop(); this.audioNotice = ""; this.audioRetryable = false; this.presentation = undefined; this.replaying = false; this.replayActive = -1; this.replayConfirmed = 0; }

  private endRun(): void {
    if (!this.run || !this.ensureCurrentRun()) return;
    this.invalidatePlayback();
    if (this.run.pending) this.run.settle(this.run.pending.id);
    this.run.abandon(); this.overlay = undefined; this.atSelection = false; this.reviewing = false; this.saveRun(); this.render();
  }

  private showResult(): void { this.invalidatePlayback(); this.reviewing = false; this.overlay = undefined; this.render(); }

  private async openReview(index: number, startFragment?: number): Promise<void> {
    if (!this.ended) return;
    this.invalidatePlayback();
    const passage = this.reviewPassages[index]; if (!passage) return;
    if (!await this.prepare(() => prepareText(passage.original, passage.location + passage.title + passage.author), () => this.openReview(index, startFragment))) return;
    this.reviewIndex = index; this.reviewing = true;
    this.syncPaper(); this.readingCamera(); this.render();
    if (startFragment !== undefined) this.playReview(startFragment);
  }

  private async continueListening(): Promise<void> {
    await this.openReview(this.reviewPassages.length - 1, Math.max(0, (this.run?.lastSubmission?.correctPrefix ?? 0) - 1));
  }

  private playReview(startFragment: number): void {
    const passage = this.reviewPassage; if (!passage || !this.ended || !this.reviewing) return;
    const request = ++this.serial; this.replaying = true; this.replayStart = startFragment; this.replayActive = -1; this.replayConfirmed = startFragment;
    this.audioNotice = ""; this.audioRetryable = false; this.narrationState = "loading";
    const fragments = this.run!.difficulty === "hard" ? [...(passage.hardFragments ?? passage.fragments)] : passage.fragments;
    this.render();
    void this.narration?.play({ track: NARRATION[passage.id]?.[this.voice], fragments, correctPrefix: fragments.length, startFragment, volume: this.volume,
      onProgress: (active: number, confirmed: number) => { if (request !== this.serial) return; this.replayActive = active; this.replayConfirmed = confirmed; this.syncReading(); this.publish(); },
      onFinish: () => { if (request !== this.serial) return; this.replaying = false; this.audioNotice = ""; this.audioRetryable = false; this.replayActive = -1; this.replayConfirmed = fragments.length; this.syncReading(); this.render(); },
      onState: (state) => { if (request !== this.serial) return; this.narrationState = state; this.render(); },
      onFallback: (message, retryable) => { if (request !== this.serial) return; this.audioNotice = message; this.audioRetryable = retryable; this.render(); },
    });
  }

  private stopReview(): void { this.invalidatePlayback(); this.syncReading(); this.render(); }

  private setVolume(value: number): void { this.volume = Math.max(0, Math.min(1, value)); this.narration?.setVolume(this.volume); this.saveSettings(); this.render(); }
  private saveSettings(): void { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ volume: this.volume, reduced: this.reduced, voice: this.voice, difficulty: this.difficulty })); } catch { this.saveError = "この端末では設定を保存できません。"; } }
  private restoreSettings(): void { try { const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null"); if (!s || typeof s !== "object") return; if (typeof s.volume === "number" && Number.isFinite(s.volume)) this.volume = Math.max(0, Math.min(1, s.volume)); if (typeof s.reduced === "boolean") this.reduced = s.reduced; if (s.voice === "male" || s.voice === "female") this.voice = s.voice; if (s.difficulty === "normal" || s.difficulty === "hard") this.difficulty = s.difficulty; } catch { this.saveError = "この端末では設定を読み込めません。"; } }
  private saveRun(): boolean {
    if (!this.run) return true;
    if (!this.ensureCurrentRun()) return false;
    try {
      const value = JSON.stringify({ run: this.run.snapshot(), hint: this.hintAnchor && this.hintTarget ? { anchor: this.hintAnchor, target: this.hintTarget, expanded: this.hintExpanded } : this.suspendedHint, outcomeId: this.outcomeMark?.id });
      localStorage.setItem(SAVE_KEY, value); this.savedRunValue = value; this.saveError = "";
    } catch { this.saveError = "挑戦を保存できません。この画面を閉じると再開できない場合があります。"; }
    return true;
  }
  private restoreRun(): void {
    try {
      this.savedRunValue = localStorage.getItem(SAVE_KEY);
      const data = JSON.parse(this.savedRunValue ?? "null");
      if (data?.run) {
        this.run = Run.restore(data.run, PASSAGES); this.restoreSavedPresentation(data);
        this.libraryPage = Math.max(0, WORKS.findIndex((p) => p.workId === this.run!.currentPassage.workId));
      }
    } catch { this.notice = "保存した挑戦を読み込めません。新しい挑戦を始められます。"; }
  }
  private restoreSavedPresentation(data: { hint?: unknown; outcomeId?: unknown }): void {
    this.suspendedHint = undefined; this.outcomeMark = undefined;
    const hint = data.hint as Partial<{ anchor: string; target: string; expanded: boolean }> | undefined;
    if (hint && typeof hint.anchor === "string" && typeof hint.target === "string" && typeof hint.expanded === "boolean") this.suspendedHint = { anchor: hint.anchor, target: hint.target, expanded: hint.expanded };
    if (typeof data.outcomeId === "string" && this.run?.lastSubmission?.id === data.outcomeId) this.outcomeMark = this.run.lastSubmission;
  }
  private ensureCurrentRun(): boolean {
    try {
      const latest = localStorage.getItem(SAVE_KEY);
      if (latest === this.savedRunValue) return true;
      this.adoptStoredRun(latest); return false;
    } catch { return true; }
  }
  private adoptStoredRun(value: string | null): void {
    try {
      const data = JSON.parse(value ?? "null"), run = data?.run ? Run.restore(data.run, PASSAGES) : undefined;
      this.cancelGesture(); this.invalidatePlayback(); this.clearPapers(); this.clearHint();
      this.savedRunValue = value; this.run = run; this.atSelection = true; this.reviewing = false; this.overlay = undefined; this.busy = false;
      this.restoreSavedPresentation(data ?? {});
      this.notice = "別のタブで挑戦が更新されました。ここから再開できます。"; this.render();
    } catch { this.saveError = "別のタブの更新を読み込めません。このタブを読み直してください。"; this.render(); }
  }
  private onStorage = (event: StorageEvent): void => { if (event.key === SAVE_KEY) this.ensureCurrentRun(); };
  private onPageHide = (): void => { this.cancelGesture(); this.saveRun(); this.narration?.stop(); };
  private onVisibilityChange = (): void => {
    if (document.hidden) this.onPageHide();
    else if (this.session && this.run?.pending) this.presentSubmission(this.run.pending);
    else if (this.replaying) this.stopReview();
  };

  private toggleHint(): void {
    if (!this.canEdit) return;
    this.cancelGesture();
    this.hintSelecting = !this.hintSelecting;
    this.selected = undefined; this.notice = "";
    this.syncSelection(); this.render();
  }

  private clearHint(): void { this.hintAnchor = undefined; this.hintTarget = undefined; this.hintDescription = ""; this.hintExpanded = false; }

  private renderHintContext(): void {
    const session = this.session!;
    const width = Math.min(360, (this.w - 24) / 2), gap = 8;
    const left = (this.w - width * 2 - gap) / 2, y = this.boardBottom + 4;
    for (const [index, id, title, tileId, color, fill, edge] of [
      [0, "hint-source", "選んだ紙片を見る", this.hintAnchor!, "#354237", 0xb3c8b4, "end"],
      [1, "hint-target", "続きを見る", this.hintTarget!, "#354237", 0xe3c66f, "start"],
    ] as const) {
      const text = session.problem.tiles.find((tile) => tile.id === tileId)!.text;
      const x = left + index * (width + gap);
      const backing = this.add.graphics().fillStyle(fill, .25).fillRoundedRect(x, y, width, 44, 3);
      this.hud.add(backing);
      this.button(id, "", x, y, width, 44, () => this.showHintFragment(tileId));
      this.actions.get(id)!.label = `${title}：「${text}」`;
      this.label(`${title} →`, x + 9, y + 3, 10, 0, color);
      this.fitLabel(hintExcerpt(text, edge, Math.max(1, Math.floor((width - 34) / 14))), x + 9, y + 20, 14, width - 18, "#354237");
    }
  }

  private showHintFragment(tileId: string): void {
    if (!this.assembling || this.overlay) return;
    const chain = this.session!.state.chains.find((item) => item.tiles.includes(tileId));
    const paper = chain && this.views.get(chain.id)?.paper;
    const bounds = paper && paper.fragmentBounds(chain!.tiles.indexOf(tileId));
    if (!paper || !bounds) return;
    this.cancelGesture();
    const camera = this.boardCamera;
    const topLeft = this.worldPoint({ x: camera.x, y: camera.y });
    const offset = revealOffset({ x: topLeft.x, y: topLeft.y, width: camera.width / camera.zoom, height: camera.height / camera.zoom }, { ...bounds, x: bounds.x + paper.x, y: bounds.y + paper.y }, 12 / camera.zoom, { ...bounds.first, x: bounds.first.x + paper.x, y: bounds.first.y + paper.y });
    camera.setScroll(camera.scrollX + offset.x, camera.scrollY + offset.y);
    this.world.bringToTop(paper); this.world.bringToTop(this.ports);
    this.syncSelection();
  }

  private revealHint(chainId: string, pointer?: Point): void {
    const session = this.session;
    if (!session || !this.hintSelecting || !this.ensureCurrentRun()) return;
    const result = this.run!.hintFor(chainId);
    if (!this.saveRun()) return;
    if (result.kind !== "revealed") {
      this.notice = result.kind === "exhausted" ? "残り0回です。前に見た紙片は再表示できます。" : "続きを表示できません。別の紙片を選んでください。";
      this.render(); return;
    }
    this.hintSelecting = false;
    // Keep the tapped paper visible if a context tray would cover it. The
    // remembered pair can be opened explicitly from the footer in that case.
    this.hintExpanded = !pointer || insideBoard(deskViewport(this.w, this.h, true), pointer, 12);
    this.hintAnchor = result.anchorId;
    this.hintTarget = result.targetId;
    this.selected = undefined; this.focused = undefined;
    const target = session.problem.tiles.find((tile) => tile.id === result.targetId)!;
    const anchor = session.problem.tiles.find((tile) => tile.id === result.anchorId)!;
    this.hintDescription = `「${anchor.text}」の続きは「${target.text}」です。`;
    this.notice = (result.repeated ? "前に見たヒントです。" : "") + "緑の下線が選んだ紙片、黄色が続きです。画面下の一節を押すとその場所へ移動できます。";
    this.saveRun(); this.syncSelection();
    // Opening the context tray only clips the bottom of the board. The clicked
    // source stays at the same screen position and zoom; navigation is explicit.
    this.render();
  }

  private openOverlay(overlay: Overlay): void { if (overlay === "hint" && !this.assembling) return; this.cancelGesture(); this.hintSelecting = false; this.overlay = overlay; this.render(); }
  private closeOverlay(): void { if (this.overlay === "prepare") { this.serial++; this.retryPreparation = undefined; this.busy = false; } this.overlay = undefined; this.notice = ""; this.render(); this.game.canvas.focus({ preventScroll: true }); }
  private leave(): void {
    this.cancelGesture();
    if (this.hintAnchor && this.hintTarget) this.suspendedHint = { anchor: this.hintAnchor, target: this.hintTarget, expanded: this.hintExpanded };
    this.saveRun(); this.invalidatePlayback(); this.atSelection = true; this.reviewing = false; this.hintSelecting = false; this.clearHint(); this.clearPapers(); this.overlay = undefined; this.selected = undefined; this.focused = undefined; this.notice = "";
    this.boardCamera.setZoom(1).setScroll(0, 0); this.render();
  }

  private clearPapers(): void {
    for (const view of this.views.values()) { this.tweens.killTweensOf(view.paper); view.paper.destroy(); }
    this.views.clear(); this.manuscript?.destroy(); this.manuscript = undefined; this.manuscriptFrame?.destroy(); this.manuscriptFrame = undefined; this.ports.clear();
  }

  private syncPaper(): void {
    if (!this.session) return;
    if (this.session.state.phase === "complete" || this.reviewing) {
      for (const view of this.views.values()) { this.tweens.killTweensOf(view.paper); view.paper.destroy(); }
      this.views.clear(); this.ports.clear();
      this.manuscript?.destroy();
      this.manuscriptFrame?.destroy();
      const passage = this.reviewing ? this.reviewPassage! : this.session.problem;
      const fragments = this.reviewing ? (this.run!.difficulty === "hard" ? this.reviewPassage!.hardFragments ?? this.reviewPassage!.fragments : this.reviewPassage!.fragments) : this.session.state.chains[0]?.tiles.map((id) => this.session!.problem.tiles.find((tile) => tile.id === id)!.text) ?? [comparisonText(passage.original)];
      const text = this.reviewing ? passage.original : this.session.text(this.session.state.chains[0]);
      this.manuscript = new Paper(this, text, this.columns, fragments, fragments.slice(1).map(() => true)).setPosition(30, 94);
      const { width, height } = this.manuscript;
      this.manuscriptFrame = this.add.container(30, 20);
      const backing = this.add.graphics();
      backing.fillStyle(0x18291f, .17).fillRect(3, 6, width, height + 142);
      backing.fillStyle(PAPER).fillRect(0, 0, width, height + 142);
      backing.lineStyle(1, 0xa96555, .35).lineBetween(14, 59, width - 14, 59);
      const heading = this.add.text(15, 20, this.reviewing ? `読み返す ${this.reviewIndex + 1}/${this.reviewPassages.length}` : "読了", { fontFamily: "DeskSans", fontSize: "13px", color: "#8f5140" });
      const title = this.add.text(width - 16, 22, passage.author, { fontFamily: "DeskSans", fontSize: "11px", color: "#74715f" }).setOrigin(1, 0);
      const footer = this.add.text(15, height + 103, this.reviewing ? "青空文庫の原文" : "一枚の原稿になりました。", { fontFamily: "DeskSans", fontSize: "11px", color: "#74715f" });
      this.manuscriptFrame.add([backing, heading, title, footer]);
      this.world.add([this.manuscriptFrame, this.manuscript]); this.syncReading();
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
    this.syncSelection(); this.syncReading();
  }

  private begin(): void {
    if (!this.session || this.session.state.phase !== "reading") return;
    const columns = Math.max(8, Math.min(16, Math.floor((this.w - 88) / CELL)));
    const positions = dealManuscript(this.session.problem.tiles.map((tile) => tile.text), columns, this.w);
    this.run!.begin(positions);
    this.saveRun();
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
    if (!this.canEdit || !this.session || this.overlay || !this.ensureCurrentRun()) return;
    if (command.type === "check") { this.submit(); return; }
    this.cancelGesture();
    this.hintSelecting = false; this.clearHint(); this.outcomeMark = undefined;
    const wasComplete = this.session.state.phase === "complete";
    const event = this.run!.dispatch(command);
    if (!this.saveRun()) return;
    if (event === "none") { this.syncSelection(); this.render(); return; }
    if (command.type === "join") {
      this.selected = this.session.state.chains.find((chain) => chain.id === command.target || chain.id === command.source)?.id;
      this.focused = this.selected;
    } else if (command.type === "detach") { this.selected = command.tile; this.focused = command.tile; }
    else if (command.type === "undo") { this.selected = undefined; this.focused = undefined; }
    this.notice = event === "incorrect" ? "原文とは、まだ少し違うようです。紙片を外して読み直してみましょう。" : event === "split" ? "つながりを外しました。" : event === "undo" ? "一つ前の操作に戻しました。" : event === "complete" ? "一枚の原稿になりました。" : "";
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
    for (const [id, view] of this.views) {
      view.paper.focus(id === this.selected, id === this.focused);
      const chain = this.session?.state.chains.find((item) => item.id === id);
      view.paper.hint(this.hintTarget ? chain?.tiles.indexOf(this.hintTarget) ?? -1 : -1, this.hintAnchor ? chain?.tiles.indexOf(this.hintAnchor) ?? -1 : -1);
    }
    this.ports.clear();
    this.syncReading();
    if (!this.selected || !this.canEdit || this.overlay || this.hintSelecting) return;
    const zoom = this.boardCamera.zoom;
    for (const [id, { paper }] of this.views) {
      if (id === this.selected) continue;
      for (const [side, local] of [["before", paper.front], ["after", paper.back]] as const) {
        const x = paper.x + local.x, y = paper.y + local.y;
        if (!this.visiblePort({ x, y })) continue;
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
  private onBoard(pointer: Point): boolean { return insideBoard(this.boardCamera, pointer); }
  private visiblePort(point: Point): boolean {
    this.boardCamera.preRender();
    return insideBoard(this.boardCamera, this.boardCamera.matrixCombined.transformPoint(point.x, point.y), 15);
  }
  private touching(): Phaser.Input.Pointer[] { return this.input.manager.pointers.filter((pointer) => pointer.wasTouch && pointer.isDown); }
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
        if (!this.visiblePort(world)) continue;
        const distance = Phaser.Math.Distance.Between(point.x, point.y, world.x, world.y) * this.boardCamera.zoom;
        if (distance <= 24 && (!nearest || distance < nearest.distance)) nearest = { id, side, distance, point: world };
      }
    }
    return nearest;
  }

  private detach(chainId: string, tile: string): void {
    if (!this.canEdit || !this.session || this.overlay || this.hintSelecting) return;
    const chain = this.session.state.chains.find((chain) => chain.id === chainId);
    const parts = chain && detachedChains(chain, tile);
    if (!chain || !parts?.length) return;
    const sizes = parts.map((part) => layoutManuscript(this.session!.text(part), this.columns));
    const obstacles = [...this.views].filter(([id]) => id !== chainId).map(([, { paper }]) => ({ x: paper.x, y: paper.y, width: paper.width, height: paper.height }));
    this.apply({ type: "detach", chain: chainId, tile, positions: detachedPositions(sizes, chain, obstacles) });
  }

  private onContextMenu = (event: MouseEvent): void => { event.preventDefault(); };

  private onDown(pointer: Phaser.Input.Pointer): void {
    const touches = this.touching();
    if (touches.length >= 2) {
      this.cancelGesture();
      this.suppressRelease = true;
      if (this.overlay || this.busy || !this.session || !touches.every((touch) => this.onBoard(touch))) return;
      const [a, b] = touches;
      this.pinch = { distance: Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y), zoom: this.boardCamera.zoom, world: this.worldPoint({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }) };
      return;
    }
    if (!primaryPress(pointer)) {
      const interrupted = !!this.gesture || this.suppressRelease || touches.length > 0;
      this.cancelGesture();
      if (interrupted || pointer.buttons !== 2 || this.overlay || this.busy || !this.canEdit || this.hintSelecting || !this.onBoard(pointer)) return;
      const point = this.worldPoint(pointer), hit = this.hitPaper(point);
      const chain = hit && this.session!.state.chains.find((chain) => chain.id === hit.id);
      const tile = hit && chain?.tiles[hit.paper.fragmentAt(point)];
      if (hit && tile) { this.game.canvas.focus({ preventScroll: true }); this.detach(hit.id, tile); }
      return;
    }
    if (this.suppressRelease) return;
    if (this.overlay || this.busy || !this.session || !this.onBoard(pointer)) { this.touchTaps.cancel(); return; }
    this.game.canvas.focus({ preventScroll: true });
    if (!pointer.wasTouch || this.hintSelecting) this.touchTaps.cancel();
    this.suppressRelease = false;
    const point = this.worldPoint(pointer);
    if (this.canEdit) {
      const target = this.selected && !this.hintSelecting ? this.tapTarget(point) : undefined;
      if (target) { this.touchTaps.cancel(); this.target = target; this.gesture = { kind: "pan", down: { x: pointer.x, y: pointer.y }, scroll: { x: this.boardCamera.scrollX, y: this.boardCamera.scrollY } }; return; }
      const hit = this.hitPaper(point);
      if (hit) {
        const tile = this.session.state.chains.find((chain) => chain.id === hit.id)?.tiles[hit.paper.fragmentAt(point)];
        if (pointer.wasTouch && tile && !this.hintSelecting) this.touchTaps.start(tile, pointer, pointer.downTime);
        else this.touchTaps.cancel();
        this.gesture = { kind: "paper", id: hit.id, down: { x: pointer.x, y: pointer.y }, offset: { x: point.x - hit.paper.x, y: point.y - hit.paper.y }, moved: false };
        this.tweens.killTweensOf(hit.paper); hit.paper.setAlpha(1); hit.paper.lift(!this.reduced);
        this.world.bringToTop(hit.paper); this.world.bringToTop(this.ports);
        this.game.canvas.style.cursor = "grabbing";
        return;
      }
    }
    this.touchTaps.cancel();
    this.gesture = { kind: "pan", down: { x: pointer.x, y: pointer.y }, scroll: { x: this.boardCamera.scrollX, y: this.boardCamera.scrollY } };
  }

  private onMove(pointer: Phaser.Input.Pointer): void {
    if (pointer.wasTouch) this.touchTaps.move(pointer);
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
    const bounded = constrainPointer(this.boardCamera, pointer);
    const distance = Phaser.Math.Distance.Between(bounded.x, bounded.y, gesture.down.x, gesture.down.y);
    if (gesture.kind === "pan") {
      if (distance > 6) { this.target = undefined; this.boardCamera.setScroll(gesture.scroll.x - (bounded.x - gesture.down.x) / this.boardCamera.zoom, gesture.scroll.y - (bounded.y - gesture.down.y) / this.boardCamera.zoom); this.syncSelection(); }
      return;
    }
    if (!gesture.moved && distance <= 6) return;
    if (this.hintSelecting) {
      this.views.get(gesture.id)?.paper.settle(false);
      this.gesture = { kind: "pan", down: gesture.down, scroll: { x: this.boardCamera.scrollX, y: this.boardCamera.scrollY } };
      return;
    }
    if (!gesture.moved) { gesture.moved = true; this.clearHint(); this.notice = ""; this.selected = gesture.id; this.render(); playCue(this, "lift", this.volume); }
    const paper = this.views.get(gesture.id)!.paper;
    const point = this.worldPoint(bounded);
    paper.setPosition(Phaser.Math.Clamp(point.x - gesture.offset.x, -4000, 8000), Phaser.Math.Clamp(point.y - gesture.offset.y, -4000, 8000));
    let nearest: Target | undefined;
    let current: Target | undefined;
    for (const [id, view] of this.views) {
      if (id === gesture.id) continue;
      for (const side of ["before", "after"] as const) {
        const local = side === "before" ? view.paper.front : view.paper.back;
        const source = side === "before" ? paper.back : paper.front;
        const target = { x: view.paper.x + local.x, y: view.paper.y + local.y };
        if (!this.visiblePort(target) || !this.visiblePort({ x: paper.x + source.x, y: paper.y + source.y })) continue;
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
    const dx = drift(pointer.x, 0, this.w), dy = drift(pointer.y, this.boardCamera.y, this.boardBottom);
    if (!dx && !dy) return;
    const speed = Math.min(delta, 32) * .36 / this.boardCamera.zoom;
    this.boardCamera.setScroll(this.boardCamera.scrollX + dx * speed, this.boardCamera.scrollY + dy * speed);
    this.onMove(pointer);
  }

  private onUp(pointer: Phaser.Input.Pointer): void {
    if (pointer.wasCanceled) { this.cancelGesture(); return; }
    if (!pointer.wasTouch && pointer.button !== 0) return;
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
    if (this.hintSelecting) { this.touchTaps.cancel(); this.revealHint(gesture.id, pointer); return; }
    if (gesture.moved) {
      const target = this.target;
      const position = { x: view.paper.x, y: view.paper.y };
      this.target = undefined;
      if (target) this.apply({ type: "join", source: gesture.id, target: target.id, side: target.side });
      else this.apply({ type: "move", chain: gesture.id, point: position });
      return;
    }
    const point = this.worldPoint(pointer);
    const tile = this.session.state.chains.find((chain) => chain.id === gesture.id)?.tiles[view.paper.fragmentAt(point)];
    if (pointer.wasTouch && this.touchTaps.end(tile, pointer, pointer.upTime) && tile) this.detach(gesture.id, tile);
    else { this.clearHint(); this.notice = ""; this.selected = gesture.id; this.focused = gesture.id; this.syncSelection(); this.render(); }
  }

  private cancelGesture = (): void => {
    this.touchTaps.cancel();
    if (this.game?.canvas) this.game.canvas.style.cursor = "default";
    const gesture = this.gesture;
    if (gesture?.kind === "paper" && this.session) {
      const stable = this.session.state.chains.find((chain) => chain.id === gesture.id);
      const view = stable && this.views.get(stable.id);
      if (stable && view) { view.paper.setPosition(stable.x, stable.y); view.paper.settle(false); }
    }
    this.gesture = undefined; this.pinch = undefined; this.target = undefined; this.suppressRelease = false;
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
    if (event.target !== this.game.canvas || event.isComposing || (this.busy && !(this.overlay === "prepare" && event.key === "Escape"))) return;
    if (event.key === "Escape") {
      event.preventDefault(); this.cancelGesture();
      if (this.overlay) this.closeOverlay();
      else { if (this.hintSelecting) this.hintSelecting = false; else if (this.hasHintContext) this.hintExpanded = false; this.notice = ""; this.selected = undefined; this.syncSelection(); this.render(); }
      return;
    }
    if (this.overlay || !this.session) return;
    const key = event.key.toLowerCase();
    if (["z", "r", "h", "m", "[", "]", "delete", "enter", "arrowleft", "arrowright", "arrowup", "arrowdown", "+", "-", "="].includes(key)) event.preventDefault();
    if (key === "z") this.apply({ type: "undo" });
    else if (key === "r" && this.session.canCheck) this.apply({ type: "check" });
    else if (key === "h") this.openOverlay("help");
    else if (key === "m") this.openOverlay("settings");
    else if (key === "+" || key === "=" || key === "-") this.zoomAt({ x: this.w / 2, y: this.boardCamera.y + this.boardCamera.height / 2 }, key === "-" ? .9 : 1.1);
    else if (this.canEdit) {
      const chains = this.session.state.chains;
      if (key.startsWith("arrow")) {
        const current = chains.findIndex((chain) => chain.id === this.focused);
        const direction = key === "arrowleft" || key === "arrowup" ? -1 : 1;
        this.focused = chains[(current + direction + chains.length) % chains.length].id;
        this.focus(`piece:${this.focused}`); this.publish();
      } else if (key === "enter" && this.focused) this.dispatch(`piece:${this.focused}`);
      else if ((key === "[" || key === "]") && !this.hintSelecting && this.selected && this.focused) this.apply({ type: "join", source: this.selected, target: this.focused, side: key === "[" ? "before" : "after" });
      else if (key === "delete" && !this.hintSelecting) {
        const chain: Chain | undefined = chains.find((chain) => chain.id === (this.selected ?? this.focused));
        const boundary = chain?.bonds.findIndex((known) => !known) ?? -1;
        if (chain && boundary >= 0) this.apply({ type: "split", chain: chain.id, boundary });
      }
    }
  };
}

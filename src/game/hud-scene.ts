import Phaser from 'phaser';
import Label from 'phaser4-rex-plugins/templates/ui/label/Label.js';
import { DeskController, type Snapshot } from './controller';
import { BODY_FONT, UI_FONT } from './fonts';
import { renderResolution } from './display';

/** Screen-space UI. Rex Label owns button sizing; there is no DOM game layout. */
export class HudScene extends Phaser.Scene {
  private objects: Phaser.GameObjects.GameObject[] = [];
  private page = 0;
  private removing?: string;
  private unsubscribe?: () => void;
  constructor(private controller: DeskController) { super({ key: 'HUD', active: true }); }
  create() {
    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');
    this.unsubscribe = this.controller.subscribe(() => this.render());
    this.scale.on('resize', this.render, this);
    this.events.once('shutdown', () => {
      this.unsubscribe?.(); this.scale.off('resize', this.render, this);
    });
    this.render();
  }
  private track<T extends Phaser.GameObjects.GameObject>(object: T): T { this.objects.push(object); return object; }
  private text(x: number, y: number, value: string, size = 16, color = '#eee7d3', serif = false) {
    return this.track(this.add.text(x, y, value, {
      fontFamily: serif ? BODY_FONT : UI_FONT, fontStyle: '500', fontSize: size,
      color, lineSpacing: 7,
    }).setResolution(renderResolution()));
  }
  private button(x: number, y: number, text: string, action: () => void, width = 110, active = false) {
    const background = this.add.rectangle(0, 0, width, 40, active ? 0xe8d1a2 : 0x3b574b).setStrokeStyle(1, 0xbdaa7c, active ? 0.8 : 0.4);
    const label = new Label(this, { x, y, width, height: 40, background,
      text: this.add.text(0, 0, text, { fontFamily: UI_FONT, fontStyle: '500', fontSize: 14, color: active ? '#302f28' : '#f1ead4' }).setResolution(renderResolution()),
      space: { left: 12, right: 12, top: 6, bottom: 6 }, align: 'center',
    });
    this.add.existing(label); label.layout();
    label.setInteractive({ useHandCursor: true });
    label.on('pointerover', () => background.setAlpha(0.8));
    label.on('pointerout', () => background.setAlpha(1));
    label.on('pointerup', () => { if (!this.controller.getSnapshot().importOpen) action(); });
    return this.track(label);
  }
  private render() {
    for (const object of this.objects) object.destroy(); this.objects = [];
    const state = this.controller.getSnapshot(), w = this.scale.width, h = this.scale.height, mobile = w < 680;
    const g = this.track(this.add.graphics());
    if (state.view === 'library' || state.view === 'loading' || state.view === 'error') {
      g.fillStyle(0x243e36).fillRect(0, 0, w, h);
      g.lineStyle(1, 0xc4b687, 0.08);
      for (let y = 0; y < h; y += 12) g.lineBetween(0, y, w, y);
      g.lineStyle(1, 0xc8b984, 0.32).strokeRect(16, 16, w - 32, h - 32);
    } else {
      g.fillStyle(0x233b33).fillRect(0, 0, w, 100).fillRect(0, h - 94, w, 94);
      g.lineStyle(1, 0xb9a876, 0.45).lineBetween(18, 99, w - 18, 99).lineBetween(18, h - 94, w - 18, h - 94);
    }
    this.text(28, 26, '青空パズル', mobile ? 22 : 25, '#f1ead4', true);
    if (!mobile) this.text(198, 36, '原稿修復室', 12, '#c5bf9e');
    this.button(w - 72, 44, state.muted ? '音なし' : '音あり', () => this.controller.toggleSound(), 84);
    if (state.view === 'library') this.library(state);
    else if (state.view === 'loading' || state.view === 'error') {
      this.text(32, 160, state.view === 'loading' ? '一節を用意しています' : '問題を用意できませんでした', mobile ? 19 : 24, '#f1ead4', true);
      if (state.view === 'error') {
        this.button(92, h - 110, '再試行', () => this.controller.retry());
        this.button(230, h - 110, '作品へ', () => this.controller.library());
      }
    } else this.desk(state);
    if (state.importOpen) {
      this.track(this.add.rectangle(w / 2, h / 2, w, h, 0x15211c, 0.75).setInteractive());
    }
  }
  private library(state: Snapshot) {
    const w = this.scale.width, h = this.scale.height, mobile = w < 680;
    if (mobile) {
      this.text(30, 98, '言葉を、一枚に戻す。', 24, '#f1ead4', true);
      this.text(30, 138, '一度読んで、好きなところから。', 13, '#c5bf9e');
    } else {
      this.text(48, 172, '言葉を、\n一枚に戻す。', 38, '#f1ead4', true);
      this.text(50, 304, '一度読んで、\n好きなところから。', 16, '#c5bf9e');
      const ink = this.track(this.add.graphics());
      ink.fillStyle(0xd9cba8, 0.12).fillRect(48, 392, Math.min(225, w * 0.25), 155);
      ink.lineStyle(1, 0xd4bea0, 0.15);
      for (let i = 0; i <= 7; i++) ink.lineBetween(63 + i * 26, 407, 63 + i * 26, 537);
      for (let i = 0; i <= 5; i++) ink.lineBetween(63, 407 + i * 26, 245, 407 + i * 26);
      ink.fillStyle(0xb06d50, 0.6).fillTriangle(210, 386, 230, 386, 220, 440);
    }
    const left = mobile ? 30 : Math.max(335, w * 0.36), area = w - left - 30;
    const top = mobile ? 190 : 110;
    this.button(left + 57, top, 'Easy', () => this.controller.setDifficulty('easy'), 114, state.difficulty === 'easy');
    this.button(left + 183, top, 'Normal', () => this.controller.setDifficulty('normal'), 114, state.difficulty === 'normal');
    this.text(left, top + 30, state.difficulty === 'easy' ? '2枚でつながる' : '3枚でつながる', 12, '#c5bf9e');
    const available = h - top - 215;
    const perPage = Math.max(1, Math.min(4, Math.floor(available / 99)));
    const count = Math.ceil(state.choices.length / perPage);
    this.page = Math.min(this.page, count - 1);
    state.choices.slice(this.page * perPage, (this.page + 1) * perPage).forEach((choice, i) => {
      const y = top + 74 + i * 99, cardWidth = area;
      const art = this.track(this.add.graphics());
      art.fillStyle(0x142c25, 0.42).fillRect(left + 4, y + 5, cardWidth, 88);
      art.fillStyle(0xe5ddc4).fillRect(left, y, cardWidth, 86);
      art.fillStyle(0xb6a583).fillRect(left, y, 13, 86);
      art.lineStyle(1, 0xb0745f, 0.4).lineBetween(left + 22, y + 62, left + cardWidth - 12, y + 62);
      const title = this.text(left + 27, y + 8, choice.title, mobile ? 21 : 23, '#322f26', true);
      if (title.width > cardWidth - 42) {
        const chars = [...choice.title];
        while (title.width > cardWidth - 42 && chars.length) { chars.pop(); title.setText(chars.join('') + '…'); }
      }
      this.text(left + 28, y + 39, choice.author, 12, '#635a45');
      this.text(left + 28, y + 66, choice.detail, 10, '#7a624b');
      const zone = this.track(this.add.zone(left + cardWidth / 2, y + 43, cardWidth, 86).setInteractive({ useHandCursor: true }));
      zone.on('pointerover', () => art.setAlpha(0.86)); zone.on('pointerout', () => art.setAlpha(1));
      zone.on('pointerup', () => { if (!state.importOpen) void this.controller.choose(choice.id); });
      if (choice.kind === 'saved') this.button(left + cardWidth - 30, y + 44, '×', () => { this.removing = choice.id; this.render(); }, 40);
    });
    const bottom = h - 107;
    this.button(left + 46, bottom, '前の頁', () => { this.page = (this.page - 1 + count) % count; this.render(); }, 90);
    this.text(left + 105, bottom - 8, `${this.page + 1} / ${count}`, 13, '#c5bf9e');
    this.button(w - 76, bottom, '次の頁', () => { this.page = (this.page + 1) % count; this.render(); }, 90);
    this.button(left + Math.min(area / 2, 150), h - 49, '作品を取り込む', () => this.controller.showImport(true), Math.min(300, area));
    if (this.removing) {
      const id = this.removing;
      this.track(this.add.rectangle(w / 2, h / 2, w, h, 0x14231e, 0.9).setInteractive());
      this.text(32, h / 2 - 88, '蔵書から外す', 22, '#f1ead4', true);
      this.button(w / 2 - 68, h / 2, '戻る', () => { this.removing = undefined; this.render(); });
      this.button(w / 2 + 68, h / 2, '外す', () => { this.removing = undefined; void this.controller.removeBook(id); }, 110, true);
    }
  }
  private desk(state: Snapshot) {
    const w = this.scale.width, h = this.scale.height, mobile = w < 680;
    this.text(28, 67, `${state.title}  ·  ${state.author}`, mobile ? 12 : 15, '#d3ccb3');
    this.button(w - (mobile ? 175 : 184), 44, '作品へ', () => this.controller.library(), 84);
    const center = w / 2;
    if (state.view === 'assembling') {
      this.text(20, h - 84, mobile ? '紙片を選び、相手の前後を押す。' : '紙片を選び、相手の前後を押す。  仮の継ぎ目は×で外せます。', mobile ? 11 : 13, '#d6cdae');
    } else this.text(20, h - 84, state.view === 'complete' ? '原稿が一枚に戻りました' : '本文を読んだら組み立ててください', mobile ? 12 : 14, '#e5d6af');
    const controls = [
      { text: '←', run: () => this.controller.cameraAction?.({ type: 'pan', x: -180, y: 0 }) },
      { text: '↑', run: () => this.controller.cameraAction?.({ type: 'pan', x: 0, y: -180 }) },
      { text: '↓', run: () => this.controller.cameraAction?.({ type: 'pan', x: 0, y: 180 }) },
      { text: '→', run: () => this.controller.cameraAction?.({ type: 'pan', x: 180, y: 0 }) },
      { text: '−', run: () => this.controller.cameraAction?.({ type: 'zoom', amount: -0.15 }) },
      { text: '＋', run: () => this.controller.cameraAction?.({ type: 'zoom', amount: 0.15 }) },
    ];
    if (state.view === 'assembling') {
      controls.forEach((control, i) => this.button((mobile ? center - 135 : 38) + i * 48, h - 35, control.text, control.run, 42));
      if (!mobile) this.button(w - 113, h - 35, '選んだ紙片へ', () => this.controller.cameraAction?.({ type: 'home' }), 174);
    } else {
      controls.slice(1, 3).forEach((control, i) => this.button(38 + i * 48, h - 35, control.text, control.run, 42));
      this.button(w - (mobile ? 99 : 138), h - 35, state.view === 'reading' ? '組み立てる' : '次の原稿', () => state.view === 'reading' ? this.controller.command({ type: 'begin' }) : this.controller.next(), mobile ? 170 : 240, true);
    }
  }
}

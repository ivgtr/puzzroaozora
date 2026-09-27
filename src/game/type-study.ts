import Phaser from 'phaser';
import { makePaper, GRID, PAPER, INK, graphemes } from './paper';
import { BODY_FONT, UI_FONT, FONT_SPECIMEN } from './fonts';
import { renderResolution } from './display';

export const STUDY_COPY = '横組 縦組 比較見本 採用 同じ短文 本文 原稿 用紙 単独 仮組 正式 完成 字面 罫線 明朝 400 500 18 22 26 30 0.24 0.34 DPI zoom px Noto Serif JP Noto Sans JP ホイール・ドラッグで移動 吾輩は猫である。名前はまだ無い。';

/** Development-only specimen, not a second product renderer or an orientation setting. */
export class TypeStudy extends Phaser.Scene {
  create() {
    const width = this.scale.width, narrow = width < 680;
    this.cameras.main.setBackgroundColor('#2a4941').setBounds(0, 0, Math.max(width, 360), 1750);
    const label = (x: number, y: number, value: string, size = 13) => this.add.text(x, y, value, { fontFamily: UI_FONT, fontStyle: '500', fontSize: size, color: '#f1ead4' }).setResolution(renderResolution());
    label(24, 20, `Noto Serif JP / DPI ${window.devicePixelRatio || 1} / zoom 1`, 14);
    label(24, 48, '比較見本 — ホイール・ドラッグで移動');
    const short = '吾輩は猫である。名前はまだ無い。';
    for (const [index, config] of [{ weight: 400, fontSize: 18, cell: 26, gridAlpha: 0.24 }, { weight: 500, fontSize: 22, cell: 30, gridAlpha: 0.34 }].entries()) {
      const top = 92 + index * (narrow ? 515 : 350), columns = narrow ? 8 : 12;
      label(24, top, `${config.weight} / ${config.fontSize}px / ${config.cell}px / ${config.gridAlpha}${index ? ' — 採用' : ''}`);
      label(24, top + 28, '横組');
      makePaper(this, [short], [], { columns, ...config }).root.setPosition(24, top + 52);
      const vx = narrow ? 24 : 475, vy = narrow ? top + 196 : top + 52;
      label(vx, vy - 24, '縦組 / 同じ短文');
      const chars = graphemes(short), rows = 8, cols = Math.ceil(chars.length / rows), c = config.cell;
      const g = this.add.graphics().fillStyle(PAPER).fillRect(vx, vy, cols * c + 28, rows * c + 28);
      g.lineStyle(1, GRID, config.gridAlpha);
      for (let col = 0; col <= cols; col++) g.lineBetween(vx + 14 + col * c, vy + 14, vx + 14 + col * c, vy + 14 + rows * c);
      for (let row = 0; row <= rows; row++) g.lineBetween(vx + 14, vy + 14 + row * c, vx + 14 + cols * c, vy + 14 + row * c);
      chars.forEach((char, i) => {
        const punctuation = /[、。]/.test(char), x = vx + 14 + (cols - 1 - Math.floor(i / rows)) * c, y = vy + 14 + (i % rows) * c;
        this.add.text(x + (c - config.fontSize) / 2 + (punctuation ? config.fontSize * 0.56 : 0), y + (c - config.fontSize) / 2 - (punctuation ? config.fontSize * 0.35 : 0), char, { fontFamily: BODY_FONT, fontStyle: String(config.weight), fontSize: config.fontSize, color: INK }).setResolution(renderResolution());
      });
    }
    const lower = narrow ? 1140 : 820;
    label(24, lower, '500 / 22px / 30px — 字面・罫線');
    makePaper(this, [FONT_SPECIMEN], [], { columns: narrow ? 9 : 18 }).root.setPosition(24, lower + 32);
    label(24, lower + 240, '単独 → 仮組 → 正式 → 完成');
    makePaper(this, ['吾輩は', '猫である。'], [false], { columns: narrow ? 9 : 18 }).root.setPosition(24, lower + 270);
    makePaper(this, ['吾輩は', '猫である。'], [true], { columns: narrow ? 9 : 18 }).root.setPosition(24, lower + 370);
    this.input.on('wheel', (_p: unknown, _o: unknown, dx: number, dy: number) => { this.cameras.main.scrollY += dy; this.cameras.main.scrollX += dx; });
    let previous: { x: number; y: number } | undefined;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => { previous = { x: p.x, y: p.y }; });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => { if (previous) { this.cameras.main.scrollY -= p.y - previous.y; previous = { x: p.x, y: p.y }; } });
    this.input.on('pointerup', () => { previous = undefined; });
  }
}

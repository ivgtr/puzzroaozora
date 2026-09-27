import Phaser from "phaser";
import { BODY_SIZE, CELL, PAD, layoutManuscript, type ManuscriptLayout } from "./layout.ts";
import { graphemes } from "./text.ts";
import type { Point } from "./model.ts";

export const INK = 0x292c25;
export const PAPER = 0xf8f1df;
export const GRID = 0xb47664;
export const MAT = 0x3e5149;
export interface Seam extends Point { boundary: number }
let serial = 0;

export class Paper extends Phaser.GameObjects.Container {
  readonly layout: ManuscriptLayout;
  readonly seams: Seam[] = [];
  readonly front: Point;
  readonly back: Point;
  private textureKey: string;
  private outline: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, text: string, columns: number, fragments: readonly string[] = [text], bonds: readonly boolean[] = []) {
    super(scene, 0, 0);
    this.layout = layoutManuscript(text, columns);
    const { width, height, rows } = this.layout;
    this.setSize(width, height);
    const ground = scene.add.graphics();
    ground.fillStyle(0x14271d, .22).fillRoundedRect(3, 6, width, height, 2);
    ground.fillStyle(PAPER).fillRect(0, 0, width, height);
    ground.lineStyle(1, 0xc9bfa6, .6).strokeRect(.5, .5, width - 1, height - 1);
    const grid = scene.add.graphics().lineStyle(.7, GRID, .34);
    for (let x = 0; x <= this.layout.columns; x++) grid.lineBetween(PAD + x * CELL, PAD, PAD + x * CELL, PAD + rows * CELL);
    for (let y = 0; y <= rows; y++) grid.lineBetween(PAD, PAD + y * CELL, width - PAD, PAD + y * CELL);
    this.textureKey = `manuscript-${serial++}`;
    const resolution = Math.min(2, window.devicePixelRatio || 1);
    const canvas = scene.textures.createCanvas(this.textureKey, Math.ceil(width * resolution), Math.ceil(height * resolution));
    if (!canvas) throw new Error("原稿用紙の画像を作成できません。");
    const context = canvas.context;
    context.scale(resolution, resolution);
    context.font = `500 ${BODY_SIZE}px DeskSerif`;
    context.fillStyle = "#292c25";
    context.textBaseline = "alphabetic";
    for (const glyph of this.layout.glyphs) {
      // Natural glyph bearings preserve punctuation and small-kana placement.
      const measured = context.measureText(glyph.text).width;
      context.fillText(glyph.text, glyph.x + (glyph.advance - measured) / 2, glyph.y + CELL * .79);
    }
    canvas.refresh();
    const ink = scene.add.image(0, 0, this.textureKey).setOrigin(0).setDisplaySize(width, height);
    const cuts = scene.add.graphics();
    let offset = 0;
    fragments.slice(0, -1).forEach((part, boundary) => {
      offset += graphemes(part).length;
      if (bonds[boundary]) return;
      const next = this.layout.glyphs.find((glyph) => glyph.index === offset);
      if (!next) return;
      const seam = { x: next.x, y: next.y + CELL / 2, boundary };
      this.seams.push(seam);
      cuts.lineStyle(4, MAT, .78).lineBetween(seam.x, next.y - 3, seam.x, next.y + CELL + 3);
      cuts.lineStyle(1, 0xefe1bd).lineBetween(seam.x + 2, next.y, seam.x + 2, next.y + CELL);
    });
    this.outline = scene.add.graphics();
    this.add([ground, grid, ink, cuts, this.outline]);
    const first = this.layout.glyphs[0];
    const last = this.layout.glyphs[this.layout.glyphs.length - 1];
    this.front = { x: 0, y: first ? first.y + CELL / 2 : height / 2 };
    this.back = { x: width, y: last ? last.y + CELL / 2 : height / 2 };
  }

  focus(selected: boolean, focused = false): void {
    this.outline.clear();
    if (selected || focused) this.outline.lineStyle(selected ? 3 : 2, selected ? 0xe4bd6d : 0xffffff, .95).strokeRoundedRect(-4, -4, this.width + 8, this.height + 8, 3);
  }

  destroy(fromScene?: boolean): void {
    const textures = this.scene?.textures;
    super.destroy(fromScene);
    if (textures?.exists(this.textureKey)) textures.remove(this.textureKey);
  }
}

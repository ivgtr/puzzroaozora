import Phaser from "phaser";
import { BODY_SIZE, CELL, PAD, layoutManuscript, type ManuscriptLayout } from "./layout.ts";
import { graphemes } from "./text.ts";
import type { Point } from "./model.ts";

export const INK = 0x292c25;
export const PAPER = 0xf8f2e3;
export const GRID = 0xa96555;
export const MAT = 0xccd3c7;
export interface Seam extends Point { boundary: number }
let serial = 0;

// Every sheet shares this local edge and fibre pattern. Neither the text, a tile
// ID, nor an original occurrence can leave a matching mark on the paper.
function paperEdge(width: number, height: number): Point[] {
  const profile = [.45, .85, .35, .7, 1.1, .55, .9, .4];
  const inset = (position: number) => profile[Math.floor(position / 8) % profile.length];
  const points: Point[] = [{ x: .7, y: .7 }];
  for (let x = 8; x < width - 4; x += 8) points.push({ x, y: inset(x) });
  points.push({ x: width - .7, y: .7 });
  for (let y = 8; y < height - 4; y += 8) points.push({ x: width - inset(y), y });
  points.push({ x: width - .7, y: height - .7 });
  for (let x = Math.floor((width - 4) / 8) * 8; x > 4; x -= 8) points.push({ x, y: height - inset(x) });
  points.push({ x: .7, y: height - .7 });
  for (let y = Math.floor((height - 4) / 8) * 8; y > 4; y -= 8) points.push({ x: inset(y), y });
  return points;
}

function drawMaterial(context: CanvasRenderingContext2D, edge: Point[], width: number, height: number): void {
  context.beginPath();
  edge.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
  context.closePath();
  context.fillStyle = "#f8f2e3";
  context.fill();
  context.save();
  context.clip();
  // Sparse, short fibres are baked once, beneath the square grid and sharp ink.
  // Fixed local coordinates make equal-sized sheets materially identical.
  for (let y = 4; y < height; y += 7) {
    for (let x = 4; x < width; x += 7) {
      const grain = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0;
      const xx = x + (grain % 5) - 2;
      const yy = y + ((grain >>> 4) % 5) - 2;
      context.strokeStyle = grain % 3 ? "rgba(131, 108, 76, .055)" : "rgba(255, 255, 249, .5)";
      context.lineWidth = grain % 3 ? .45 : .7;
      context.beginPath();
      context.moveTo(xx, yy);
      context.lineTo(xx + 1.5 + ((grain >>> 8) % 4), yy + ((grain >>> 12) % 3 - 1) * .4);
      context.stroke();
    }
  }
  context.restore();
  context.strokeStyle = "rgba(147, 126, 92, .24)";
  context.lineWidth = .8;
  context.beginPath();
  edge.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
  context.closePath();
  context.stroke();
}

export class Paper extends Phaser.GameObjects.Container {
  readonly layout: ManuscriptLayout;
  readonly seams: Seam[] = [];
  readonly front: Point;
  readonly back: Point;
  private textureKeys: string[];
  private outline: Phaser.GameObjects.Graphics;
  private shadows: Phaser.GameObjects.Graphics[];
  private edgeInk: Phaser.GameObjects.Graphics;
  private lifted = false;
  private hintInk: Phaser.GameObjects.Graphics;
  private fragmentRanges: { start: number; end: number }[];

  constructor(scene: Phaser.Scene, text: string, columns: number, fragments: readonly string[] = [text], bonds: readonly boolean[] = []) {
    super(scene, 0, 0);
    this.layout = layoutManuscript(text, columns);
    const { width, height, rows } = this.layout;
    this.setSize(width, height);
    const edge = paperEdge(width, height).map(({ x, y }) => new Phaser.Math.Vector2(x, y));
    this.shadows = [0, 1, 2].map(() => scene.add.graphics().fillStyle(0x18291f).fillPoints(edge, true));
    this.setElevation(false, false);
    const id = serial++;
    this.textureKeys = [`paper-stock-${id}`, `manuscript-${id}`];
    const resolution = Math.min(2, window.devicePixelRatio || 1);
    const stock = scene.textures.createCanvas(this.textureKeys[0], Math.ceil(width * resolution), Math.ceil(height * resolution));
    if (!stock) throw new Error("原稿用紙の画像を作成できません。");
    stock.context.scale(resolution, resolution);
    drawMaterial(stock.context, edge, width, height);
    stock.refresh();
    const ground = scene.add.image(0, 0, this.textureKeys[0]).setOrigin(0).setDisplaySize(width, height);
    const grid = scene.add.graphics().lineStyle(.7, GRID, .36);
    for (let x = 0; x <= this.layout.columns; x++) grid.lineBetween(PAD + x * CELL, PAD, PAD + x * CELL, PAD + rows * CELL);
    for (let y = 0; y <= rows; y++) grid.lineBetween(PAD, PAD + y * CELL, width - PAD, PAD + y * CELL);
    const canvas = scene.textures.createCanvas(this.textureKeys[1], Math.ceil(width * resolution), Math.ceil(height * resolution));
    if (!canvas) {
      scene.textures.remove(this.textureKeys[0]);
      throw new Error("原稿用紙の画像を作成できません。");
    }
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
    const ink = scene.add.image(0, 0, this.textureKeys[1]).setOrigin(0).setDisplaySize(width, height);
    const cuts = scene.add.graphics();
    let offset = 0;
    fragments.slice(0, -1).forEach((part, boundary) => {
      offset += graphemes(part).length;
      if (bonds[boundary]) return;
      const next = this.layout.glyphs.find((glyph) => glyph.index === offset);
      if (!next) return;
      const seam = { x: next.x, y: next.y + CELL / 2, boundary };
      this.seams.push(seam);
      cuts.lineStyle(3, MAT, .78).lineBetween(seam.x, next.y - 3, seam.x, next.y + CELL + 3);
      cuts.lineStyle(1, 0xfffbef, .9).lineBetween(seam.x + 1.5, next.y, seam.x + 1.5, next.y + CELL);
    });
    this.edgeInk = scene.add.graphics().lineStyle(1.5, GRID).strokePoints(edge, true).setAlpha(0);
    this.outline = scene.add.graphics();
    this.hintInk = scene.add.graphics();
    let start = 0;
    this.fragmentRanges = fragments.map((part) => {
      const end = start + graphemes(part).length;
      const range = { start, end }; start = end; return range;
    });
    this.add([...this.shadows, ground, this.hintInk, grid, ink, cuts, this.edgeInk, this.outline]);
    const first = this.layout.glyphs[0];
    const last = this.layout.glyphs[this.layout.glyphs.length - 1];
    this.front = { x: 0, y: first ? first.y + CELL / 2 : height / 2 };
    this.back = { x: width, y: last ? last.y + CELL / 2 : height / 2 };
  }

  focus(selected: boolean, focused = false): void {
    this.outline.clear();
    if (selected || focused) this.outline.lineStyle(2, selected ? 0xa45f46 : 0x65796a, .95).strokeRoundedRect(-4, -4, this.width + 8, this.height + 8, 2);
  }

  /** Mark only the explicitly requested successor, even inside a provisional group. */
  hint(fragmentIndex: number): Point | undefined {
    this.hintInk.clear();
    const range = this.fragmentRanges[fragmentIndex];
    if (!range) return;
    const glyphs = this.layout.glyphs.filter((glyph) => glyph.index >= range.start && glyph.index < range.end);
    this.hintInk.fillStyle(0xe3c66f, .58);
    for (const glyph of glyphs) this.hintInk.fillRect(glyph.x, glyph.y, glyph.advance, CELL);
    const first = glyphs[0];
    return first ? { x: first.x + CELL / 2, y: first.y + CELL / 2 } : undefined;
  }

  /** Raise only the cast shadow, leaving text, ports and pointer geometry fixed. */
  lift(animate = true): void {
    this.setElevation(true, animate);
  }

  /** Call for a drop or cancellation; false applies the resting state at once. */
  settle(animate = true): void {
    this.setElevation(false, animate);
  }

  /** A brief dry-ink edge impression after every join, never a correctness hint. */
  confirm(animate = true): void {
    this.settle(animate);
    this.scene.tweens.killTweensOf(this.edgeInk);
    this.edgeInk.setAlpha(animate ? .6 : 0);
    if (animate) this.scene.tweens.add({ targets: this.edgeInk, alpha: 0, duration: 420, ease: "Sine.Out" });
  }

  private setElevation(lifted: boolean, animate: boolean): void {
    const changed = this.lifted !== lifted;
    this.lifted = lifted;
    // Layered, low shadows need no blur filter or per-frame texture redraw.
    const rest = [[2, 6, .055], [1, 3, .10], [.4, 1, .15]];
    const raised = [[5, 13, .07], [3, 8, .12], [1, 3, .10]];
    this.shadows.forEach((shadow, index) => {
      if (!changed && animate) return;
      this.scene.tweens.killTweensOf(shadow);
      const [x, y, alpha] = (lifted ? raised : rest)[index];
      if (animate) this.scene.tweens.add({ targets: shadow, x, y, alpha, duration: lifted ? 110 : 180, ease: "Cubic.Out" });
      else shadow.setPosition(x, y).setAlpha(alpha);
    });
  }

  destroy(fromScene?: boolean): void {
    const textures = this.scene?.textures;
    this.scene?.tweens.killTweensOf([...this.shadows, this.edgeInk]);
    super.destroy(fromScene);
    for (const key of this.textureKeys) if (textures?.exists(key)) textures.remove(key);
  }
}

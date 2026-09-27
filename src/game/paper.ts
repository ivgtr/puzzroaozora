import Phaser from 'phaser';
import { BODY_FONT, UI_FONT } from './fonts';
import { renderResolution } from './display';

const segmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' });
export const graphemes = (text: string): string[] => Array.from(segmenter.segment(text.replace(/\r\n?|\n/g, '')), (part) => part.segment);
export const PAPER = 0xf5efdc;
export const INK = '#302f28';
export const GRID = 0xb16f58;
export const CELL = 30;
export const PAD = 14;
export type Point = { x: number; y: number };
export type PaperLayout = { width: number; height: number; columns: number; cells: { char: string; x: number; y: number }[]; boundaries: Point[]; before: Point; after: Point };
export function paperLayout(texts: readonly string[], maxColumns: number, cell = CELL): PaperLayout {
  const characters = texts.flatMap(graphemes);
  const columns = Math.max(1, Math.min(maxColumns, characters.length));
  const rows = Math.max(1, Math.ceil(characters.length / columns));
  let count = 0;
  const boundaries = texts.slice(0, -1).map((text) => {
    count += graphemes(text).length;
    return { x: PAD + (count % columns) * cell, y: PAD + Math.floor(count / columns) * cell };
  });
  return {
    width: PAD * 2 + columns * cell, height: PAD * 2 + rows * cell, columns, boundaries,
    cells: characters.map((char, i) => ({ char, x: PAD + (i % columns) * cell, y: PAD + Math.floor(i / columns) * cell })),
    before: { x: -20, y: PAD + cell / 2 }, after: { x: PAD * 2 + columns * cell + 20, y: PAD + (rows - 0.5) * cell },
  };
}
let textureId = 0;
export type PaperView = {
  root: Phaser.GameObjects.Container; face: Phaser.GameObjects.Container; layout: PaperLayout;
  outline: Phaser.GameObjects.Graphics; ports: Phaser.GameObjects.Container[];
};

/** Paper, grid, glyphs and tentative seams are separate layers; no per-frame text rasterization. */
export function makePaper(scene: Phaser.Scene, texts: readonly string[], confirmed: readonly boolean[], options: {
  columns: number; weight?: number; fontSize?: number; cell?: number; gridAlpha?: number;
  onPort?: (end: 'before' | 'after') => void; onSplit?: (boundary: number) => void;
}): PaperView {
  const cell = options.cell ?? CELL;
  const layout = paperLayout(texts, options.columns, cell);
  const { width, height } = layout;
  const root = scene.add.container(0, 0);
  const face = scene.add.container(0, 0);
  const ground = scene.add.graphics();
  ground.fillStyle(0x071d17, 0.22).fillRoundedRect(4, 7, width, height, 2);
  ground.fillStyle(PAPER).fillPoints([
    new Phaser.Math.Vector2(0, 2), new Phaser.Math.Vector2(width - 2, 0), new Phaser.Math.Vector2(width, height - 2),
    new Phaser.Math.Vector2(width - 3, height), new Phaser.Math.Vector2(1, height - 1),
  ], true);
  ground.lineStyle(1, 0xd6c8ad, 0.7).strokeRect(0, 0, width, height);
  const grid = scene.add.graphics().lineStyle(1, GRID, options.gridAlpha ?? 0.34);
  for (let x = PAD; x <= width - PAD; x += cell) grid.lineBetween(x, PAD, x, height - PAD);
  for (let y = PAD; y <= height - PAD; y += cell) grid.lineBetween(PAD, y, width - PAD, y);
  const key = `manuscript-${++textureId}`;
  const density = renderResolution();
  const texture = scene.textures.createCanvas(key, Math.ceil(width * density), Math.ceil(height * density));
  if (!texture) throw new Error('紙面を作成できませんでした。');
  const context = texture.getContext();
  const size = options.fontSize ?? 22;
  context.scale(density, density);
  context.font = `${options.weight ?? 500} ${size}px "${BODY_FONT}"`;
  context.textBaseline = 'alphabetic';
  context.fillStyle = INK;
  for (const { char, x, y } of layout.cells) {
    const normalized = char.normalize('NFC');
    // Japanese punctuation/small kana keep the font's em-box bearings, not ink-box centering.
    const latin = /^[\x20-\x7e]+$/.test(normalized);
    const inset = latin ? (cell - context.measureText(normalized).width) / 2 : (cell - size) / 2;
    context.fillText(normalized, x + inset, y + (cell - size) / 2 + size * 0.87);
  }
  texture.refresh();
  const glyphs = scene.add.image(0, 0, key).setOrigin(0).setDisplaySize(width, height);
  const seams = scene.add.graphics();
  layout.boundaries.forEach(({ x, y }, index) => {
    if (confirmed[index]) return;
    seams.lineStyle(1.5, 0x9b7663, 0.85);
    for (let dy = 0; dy < cell; dy += 6) seams.lineBetween(x, y + dy, x, y + Math.min(cell, dy + 3));
    if (options.onSplit) {
      const tab = scene.add.container(x, y - 4);
      tab.add(scene.add.circle(0, 0, 9, 0xe8d6b9).setStrokeStyle(1, 0x9b7663));
      tab.add(scene.add.text(0, -1, '×', { fontFamily: UI_FONT, fontStyle: '500', fontSize: '12px', color: '#674f40' }).setOrigin(0.5));
      const zone = scene.add.zone(0, 0, 28, 28).setInteractive({ useHandCursor: true });
      zone.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => event.stopPropagation());
      zone.on('pointerup', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => { event.stopPropagation(); options.onSplit?.(index); });
      tab.add(zone); face.add(tab);
    }
  });
  face.addAt([ground, grid, glyphs, seams], 0);
  const outline = scene.add.graphics().lineStyle(2, 0xe7c78c, 1).strokeRect(-3, -3, width + 6, height + 6).setVisible(false);
  root.add([face, outline]);
  const ports: Phaser.GameObjects.Container[] = [];
  if (options.onPort) for (const end of ['before', 'after'] as const) {
    const point = layout[end];
    const port = scene.add.container(point.x, point.y);
    port.add(scene.add.circle(0, 0, 18, 0xe9debe).setStrokeStyle(1, 0xb99d6f));
    port.add(scene.add.text(0, 0, end === 'before' ? '前' : '後', { fontFamily: UI_FONT, fontStyle: '500', fontSize: '13px', color: INK }).setOrigin(0.5));
    const hit = scene.add.zone(0, 0, 44, 44).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => event.stopPropagation());
    hit.on('pointerup', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => { event.stopPropagation(); options.onPort?.(end); });
    port.add(hit).setVisible(false); root.add(port); ports.push(port);
  }
  root.once('destroy', () => scene.textures.remove(key));
  return { root, face, layout, outline, ports };
}

import Phaser from 'phaser';
import { DeskController, type CameraAction, type View } from './controller';
import { makePaper, type PaperView, type Point } from './paper';
import type { Change } from './session';

export class DeskScene extends Phaser.Scene {
  private papers = new Map<string, PaperView>();
  private positions = new Map<string, Point>();
  private mode?: View;
  private reader?: PaperView;
  private columns = 12;
  private depth = 1;
  private dragging?: { id: string; pointer: number; offset: Point };
  private pan?: { pointer: number; x: number; y: number };
  private unsubscribe?: () => void;
  private previousSelection?: string;
  private lastDrop = 0;
  constructor(private controller: DeskController) { super('Desk'); }
  preload() {
    for (const name of ['place', 'join', 'complete']) this.load.audio(name, `/audio/${name}.wav`);
  }
  create() {
    this.cameras.main.setBackgroundColor('#2a4941');
    this.input.dragDistanceThreshold = 6;
    this.input.addPointer(1);
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer, objects: Phaser.GameObjects.GameObject[]) => {
      if (!this.canInteract() || objects.length || pointer.y < 100 || pointer.y > this.scale.height - 94) return;
      this.pan = { pointer: pointer.id, x: pointer.x, y: pointer.y };
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.pan || this.pan.pointer !== pointer.id || this.dragging) return;
      const camera = this.cameras.main;
      camera.scrollX -= (pointer.x - this.pan.x) / camera.zoom;
      camera.scrollY -= (pointer.y - this.pan.y) / camera.zoom;
      this.pan.x = pointer.x; this.pan.y = pointer.y;
    });
    this.input.on('pointerup', () => { this.pan = undefined; });
    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _objects: unknown, dx: number, dy: number) => {
      if (!this.canInteract()) return;
      this.cameras.main.scrollY += dy / this.cameras.main.zoom;
      this.cameras.main.scrollX += dx / this.cameras.main.zoom;
    });
    this.input.on('dragstart', (pointer: Phaser.Input.Pointer, object: Phaser.GameObjects.Container) => {
      const id = object.getData('chain') as string;
      if (!this.canInteract() || !this.papers.has(id)) return;
      const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      this.dragging = { id, pointer: pointer.id, offset: { x: point.x - object.x, y: point.y - object.y } };
      this.pan = undefined; this.controller.select(id); object.setDepth(++this.depth);
      const face = this.papers.get(id)!.face;
      this.tweens.killTweensOf(face); this.tweens.add({ targets: face, y: -4, duration: 90 });
    });
    this.input.on('drag', (pointer: Phaser.Input.Pointer) => { this.moveDrag(pointer); });
    this.input.on('dragend', (pointer: Phaser.Input.Pointer) => this.finishDrag(pointer));
    this.scale.on('resize', this.resize, this);
    this.game.events.on('blur', this.cancelGesture, this);
    this.game.canvas.addEventListener('pointercancel', this.cancelGesture);
    this.unsubscribe = this.controller.subscribe((change) => this.sync(change));
    this.controller.cameraAction = (action) => this.navigate(action);
    this.events.once('shutdown', () => {
      this.cancelGesture(); this.unsubscribe?.(); this.controller.cameraAction = undefined;
      this.scale.off('resize', this.resize, this); this.game.events.off('blur', this.cancelGesture, this);
      this.game.canvas.removeEventListener('pointercancel', this.cancelGesture);
      this.clearPapers();
    });
    this.resize(); this.sync();
  }
  private canInteract() {
    const state = this.controller.getSnapshot();
    return !state.importOpen && ['reading', 'assembling', 'complete'].includes(state.view);
  }
  private resize() {
    this.cancelGesture();
    this.cameras.main.setViewport(0, 100, this.scale.width, Math.max(100, this.scale.height - 194));
    if (this.mode === 'reading' || this.mode === 'complete') this.showReader();
    else this.updateBounds();
  }
  private clearPapers() {
    for (const paper of this.papers.values()) paper.root.destroy();
    this.papers.clear(); this.reader?.root.destroy(); this.reader = undefined;
  }
  private sync(change?: Change) {
    const state = this.controller.getSnapshot();
    this.sound.mute = state.muted;
    if (state.view !== this.mode) {
      this.cancelGesture(); this.clearPapers(); this.mode = state.view;
      this.cameras.main.setZoom(1).setScroll(0, 0);
      if (state.view === 'assembling') this.deal();
      else if (state.view === 'reading' || state.view === 'complete') this.showReader();
    } else if (change && state.view === 'assembling') {
      const anchor = this.positions.get(change.removed.at(-1) ?? '') ?? { x: 64, y: 64 };
      for (const id of change.removed) { this.papers.get(id)?.root.destroy(); this.papers.delete(id); this.positions.delete(id); }
      change.added.forEach((id, index) => {
        const previous = index ? this.papers.get(change.added[index - 1]) : undefined;
        this.positions.set(id, { x: anchor.x + (previous ? previous.layout.width + 80 : 0), y: anchor.y });
        this.addPaper(id);
      });
      const paper = this.papers.get(change.added[0]);
      if (paper) this.tweens.add({ targets: paper.face, y: { from: -4, to: 0 }, alpha: { from: change.confirmed ? 0.7 : 1, to: 1 }, duration: 160, ease: 'Sine.Out' });
      this.updateBounds();
    }
    for (const [id, paper] of this.papers) {
      paper.outline.setVisible(id === state.selected);
      paper.ports.forEach((port) => port.setVisible(!!state.selected && id !== state.selected));
    }
    if (state.selected && state.selected !== this.previousSelection && !this.dragging) {
      const paper = this.papers.get(state.selected);
      if (paper) {
        paper.root.setDepth(++this.depth);
        const camera = this.cameras.main;
        if (!camera.worldView.contains(paper.root.x + 30, paper.root.y + 30)) camera.centerOn(paper.root.x + Math.min(paper.layout.width / 2, camera.width / 3), paper.root.y + 60);
      }
    }
    this.previousSelection = state.selected;
    if (change) this.play(change.completed ? 'complete' : change.confirmed ? 'join' : 'place');
  }
  private deal() {
    const session = this.controller.session!;
    this.positions.clear(); this.columns = this.scale.width < 600 ? 8 : 12;
    const shuffled = Phaser.Utils.Array.Shuffle([...session.chains]);
    const shelfWidth = Math.max(800, this.scale.width * 1.25);
    let x = 66, y = 50, rowHeight = 0;
    for (const chain of shuffled) {
      this.positions.set(chain.id, { x, y });
      const paper = this.addPaper(chain.id);
      if (x + paper.layout.width + 48 > shelfWidth && x > 66) { x = 66; y += rowHeight + 76; rowHeight = 0; }
      const position = { x, y: y + Math.random() * 12 };
      this.positions.set(chain.id, position); paper.root.setPosition(position.x, position.y);
      x += paper.layout.width + 78 + Math.random() * 32;
      rowHeight = Math.max(rowHeight, paper.layout.height + 12);
    }
    this.updateBounds(); this.cameras.main.setScroll(0, 0);
  }
  private addPaper(id: string): PaperView {
    const session = this.controller.session!;
    const chain = session.chains.find((item) => item.id === id)!;
    const paper = makePaper(this, chain.pieces.map((piece) => session.piece(piece).text), chain.confirmed, {
      columns: this.columns,
      onPort: (end) => {
        if (this.dragging || this.time.now - this.lastDrop < 80) return;
        const moving = this.controller.getSnapshot().selected;
        if (moving) this.controller.command({ type: 'join', moving, target: id, end });
      },
      onSplit: (boundary) => { if (!this.dragging) this.controller.command({ type: 'split', chain: id, boundary }); },
    });
    const position = this.positions.get(id)!;
    paper.root.setPosition(position.x, position.y).setDepth(++this.depth).setData('chain', id);
    paper.root.setSize(paper.layout.width, paper.layout.height);
    paper.root.setInteractive(new Phaser.Geom.Rectangle(0, 0, paper.layout.width, paper.layout.height), Phaser.Geom.Rectangle.Contains);
    this.input.setDraggable(paper.root);
    paper.root.on('pointerdown', () => { if (this.canInteract()) this.controller.select(id); });
    this.papers.set(id, paper);
    return paper;
  }
  private showReader() {
    this.reader?.root.destroy();
    const session = this.controller.session;
    if (!session) return;
    const columns = Math.max(6, Math.min(18, Math.floor((this.scale.width - 64) / 30)));
    this.reader = makePaper(this, [session.puzzle.originalText], [], { columns });
    this.reader.root.setPosition(Math.max(20, (this.scale.width - this.reader.layout.width) / 2), 36);
    this.cameras.main.setZoom(1).setScroll(0, 0);
    this.updateBounds();
    this.tweens.add({ targets: this.reader.face, alpha: { from: 0.3, to: 1 }, duration: 200 });
  }
  private moveDrag(pointer: Phaser.Input.Pointer) {
    if (!this.dragging || pointer.id !== this.dragging.pointer) return;
    const paper = this.papers.get(this.dragging.id);
    if (!paper) return;
    const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    paper.root.setPosition(point.x - this.dragging.offset.x, point.y - this.dragging.offset.y);
  }
  private finishDrag(pointer: Phaser.Input.Pointer) {
    const drag = this.dragging;
    if (!drag || drag.pointer !== pointer.id) return;
    this.moveDrag(pointer);
    const moving = this.papers.get(drag.id)!;
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    let closest: { id: string; end: 'before' | 'after'; distance: number } | undefined;
    for (const [id, paper] of this.papers) {
      if (id === drag.id) continue;
      for (const end of ['before', 'after'] as const) {
        const port = paper.layout[end];
        const distance = Phaser.Math.Distance.Between(world.x, world.y, paper.root.x + port.x, paper.root.y + port.y);
        if (distance <= 30 / this.cameras.main.zoom && (!closest || distance < closest.distance)) closest = { id, end, distance };
      }
    }
    this.positions.set(drag.id, { x: moving.root.x, y: moving.root.y });
    this.dragging = undefined; this.lastDrop = this.time.now;
    if (closest) this.controller.command({ type: 'join', moving: drag.id, target: closest.id, end: closest.end });
    else { this.tweens.add({ targets: moving.face, y: 0, duration: 100 }); this.play('place'); this.updateBounds(); }
  }
  private cancelGesture = () => {
    if (this.dragging) {
      const paper = this.papers.get(this.dragging.id), position = this.positions.get(this.dragging.id);
      if (paper && position) { paper.root.setPosition(position.x, position.y); this.tweens.killTweensOf(paper.face); paper.face.y = 0; }
    }
    this.dragging = undefined; this.pan = undefined;
  };
  private updateBounds() {
    const camera = this.cameras.main;
    const papers = this.reader ? [this.reader] : [...this.papers.values()];
    const left = Math.min(0, ...papers.map((paper) => paper.root.x - 80));
    const top = Math.min(0, ...papers.map((paper) => paper.root.y - 60));
    const right = Math.max(this.scale.width, ...papers.map((paper) => paper.root.x + paper.layout.width + 120));
    const bottom = Math.max(camera.height, ...papers.map((paper) => paper.root.y + paper.layout.height + 100));
    camera.setBounds(left, top, right - left, bottom - top);
  }
  private navigate(action: CameraAction) {
    if (!this.canInteract()) return;
    const camera = this.cameras.main;
    if (action.type === 'pan') { camera.scrollX += action.x / camera.zoom; camera.scrollY += action.y / camera.zoom; }
    else if (action.type === 'zoom') {
      const center = camera.getWorldPoint(camera.x + camera.width / 2, camera.y + camera.height / 2);
      camera.setZoom(Phaser.Math.Clamp(camera.zoom + action.amount, 0.85, 1.5)); camera.centerOn(center.x, center.y);
    } else {
      const id = this.controller.getSnapshot().selected;
      const paper = id ? this.papers.get(id) : undefined;
      if (paper) camera.centerOn(paper.root.x + paper.layout.width / 2, paper.root.y + Math.min(120, paper.layout.height / 2));
      else camera.setScroll(0, 0);
    }
  }
  private play(key: string) {
    // Sound is optional; unavailable audio never changes or blocks the puzzle.
    if (!this.controller.getSnapshot().muted && this.cache.audio.has(key) && !this.sound.locked) this.sound.play(key, { volume: 0.45 });
  }
  update(_time: number, delta: number) {
    if (!this.dragging) return;
    const pointer = this.input.manager.pointers.find((item) => item.id === this.dragging?.pointer);
    if (!pointer) return;
    const camera = this.cameras.main, speed = Math.min(delta, 40) * 0.5 / camera.zoom;
    if (pointer.x < 36) camera.scrollX -= speed;
    else if (pointer.x > this.scale.width - 36) camera.scrollX += speed;
    if (pointer.y < 132) camera.scrollY -= speed;
    else if (pointer.y > this.scale.height - 124) camera.scrollY += speed;
    this.moveDrag(pointer);
  }
}

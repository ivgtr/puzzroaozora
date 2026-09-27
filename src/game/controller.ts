import { FIXED_BOOK_SUMMARIES } from '@/data/fixedBooks';
import { requestJson } from '@/lib/api/client';
import { getAllBooks, pickRandomPassage, putBook, deleteBook, type StoredBook } from '@/lib/store/bookStore';
import { parseAozoraUrl } from '@/lib/utils';
import type { ApiResponse, BookSummary, PuzzleData, Difficulty as StoredDifficulty } from '@/types/puzzle';
import { EXCERPTS, excerptPuzzle } from './excerpts';
import { prepareText } from './fonts';
import { PuzzleSession, type Change, type Command, type Difficulty, type Puzzle } from './session';

export type Choice = { id: string; title: string; author: string; kind: 'excerpt' | 'legacy' | 'saved'; detail: string };
export type View = 'library' | 'loading' | 'error' | 'reading' | 'assembling' | 'complete';
export type CameraAction = { type: 'pan'; x: number; y: number } | { type: 'zoom'; amount: number } | { type: 'home' };
export type Snapshot = Readonly<{
  view: View; difficulty: Difficulty; choices: readonly Choice[]; title: string; author: string;
  original?: string; source?: string; chains: readonly { id: string; text: string; boundaries: readonly boolean[] }[];
  selected?: string; muted: boolean; error?: string; importOpen: boolean; importing: boolean; announcement: string;
}>;

/** Shared by the canvas, keyboard and semantic controls; React never owns a second puzzle. */
export class DeskController {
  session?: PuzzleSession;
  cameraAction?: (action: CameraAction) => void;
  private view: View = 'loading';
  private difficulty: Difficulty = 'easy';
  private saved: StoredBook[] = [];
  private selected?: string;
  private muted = false;
  private error?: string;
  private importOpen = false;
  private importing = false;
  private announcement = '';
  private listeners = new Set<(change?: Change) => void>();
  private request?: AbortController;
  private revision = 0;
  private disposed = false;
  private lastChoice?: Choice;
  private lastPassage?: string;
  private displayOrder = new Map<string, number>();
  private snapshot: Snapshot = this.makeSnapshot();

  private choices(): Choice[] {
    return [
      ...EXCERPTS.map((item) => ({ id: item.id, title: item.title, author: item.author, kind: 'excerpt' as const, detail: `原典の抜粋 · ${item.chunks.length}枚` })),
      ...FIXED_BOOK_SUMMARIES.map((item) => ({ ...item, kind: 'legacy' as const, detail: '従来の収録テキストから出題' })),
      ...this.saved.map((item) => ({ ...item, kind: 'saved' as const, detail: '取り込んだ作品' })),
    ];
  }
  private makeSnapshot(): Snapshot {
    const session = this.session;
    const readable = this.view === 'reading' || this.view === 'complete';
    return {
      view: this.view, difficulty: this.difficulty, choices: this.choices(),
      title: session?.puzzle.title ?? '', author: session?.puzzle.author ?? '',
      original: readable ? session?.puzzle.originalText : undefined,
      source: readable ? session?.puzzle.source : undefined,
      chains: this.view === 'assembling' && session ? [...session.chains].sort((a, b) => this.displayOrder.get(a.id)! - this.displayOrder.get(b.id)!).map((chain) => ({ id: chain.id, text: session.text(chain), boundaries: chain.confirmed })) : [],
      selected: this.selected, muted: this.muted, error: this.error, importOpen: this.importOpen,
      importing: this.importing, announcement: this.announcement,
    };
  }
  getSnapshot = (): Snapshot => this.snapshot;
  subscribe = (listener: (change?: Change) => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  private publish(change?: Change) {
    if (this.disposed) return;
    this.snapshot = this.makeSnapshot();
    for (const listener of this.listeners) listener(change);
  }

  async initialize() {
    try {
      this.saved = await getAllBooks();
      const titles = this.choices().map((choice) => `${choice.title}${choice.author}${choice.detail}`).join('');
      await Promise.all([prepareText(titles), prepareText(titles, true)]);
      if (!this.disposed) { this.view = 'library'; this.publish(); }
    } catch (error) { this.fail(error); }
  }
  private fail(error: unknown) {
    this.view = 'error';
    this.error = error instanceof Error ? error.message : '問題を用意できませんでした。';
    this.publish();
  }
  setDifficulty(difficulty: Difficulty) { if (this.view === 'library') { this.difficulty = difficulty; this.publish(); } }
  toggleSound() { this.muted = !this.muted; this.publish(); }
  select(id?: string) {
    if (this.view !== 'assembling' || (id && !this.session?.chains.some((chain) => chain.id === id))) return;
    this.selected = id; this.publish();
  }
  command(command: Command): Change | null {
    if (this.importOpen) return null;
    const change = this.session?.dispatch(command);
    if (!change || !this.session) return null;
    this.view = this.session.phase;
    this.selected = change.kind === 'begin' || change.completed ? undefined : change.added[0];
    this.announcement = change.completed ? '原稿が一枚に戻りました。' : change.confirmed ? '紙片がつながりました。' : change.kind === 'split' ? '仮の継ぎ目を外しました。' : '';
    this.publish(change);
    return change;
  }
  library() {
    this.revision++; this.request?.abort(); this.session = undefined; this.selected = undefined;
    this.view = 'library'; this.error = undefined; this.announcement = ''; this.importOpen = false; this.publish();
  }
  async choose(id: string) {
    const choice = this.choices().find((item) => item.id === id);
    if (!choice || this.disposed) return;
    this.lastChoice = choice;
    this.request?.abort(); this.request = new AbortController();
    const revision = ++this.revision;
    this.view = 'loading'; this.error = undefined; this.selected = undefined; this.session = undefined; this.publish();
    try {
      let puzzle: Puzzle;
      let usedPassage: string | undefined;
      if (choice.kind === 'excerpt') {
        puzzle = excerptPuzzle(choice.id);
      } else {
        const body: Record<string, string> = { difficulty: this.difficulty, bookId: choice.id };
        if (choice.kind === 'saved') {
          const book = this.saved.find((item) => item.id === id)!;
          usedPassage = pickRandomPassage(book, this.difficulty, this.lastPassage);
          if (!usedPassage) throw new Error('この難易度で使用できる一節がありません。別の作品を選んでください。');
          Object.assign(body, { encryptedPassage: usedPassage, title: book.title, author: book.author });
        }
        const response = await requestJson<ApiResponse<PuzzleData>>('/api/puzzle/generate', { method: 'POST', body: JSON.stringify(body), signal: this.request.signal });
        if (!response.success) throw new Error(response.error.message);
        const data = response.data;
        puzzle = { title: data.title, author: data.author, originalText: data.originalText, pieces: data.segments.map(({ id, text }) => ({ id, text })) };
      }
      await Promise.all([prepareText(puzzle.originalText), prepareText(`${puzzle.title}${puzzle.author}`, true)]);
      if (this.disposed || revision !== this.revision) return;
      this.session = new PuzzleSession(puzzle, this.difficulty);
      const order = puzzle.pieces.map((piece) => piece.id);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]];
      }
      this.displayOrder = new Map(order.map((id, index) => [id, index]));
      this.lastPassage = usedPassage; this.view = 'reading'; this.publish();
    } catch (error) { if (!this.disposed && revision === this.revision) this.fail(error); }
  }
  retry() { if (this.lastChoice) void this.choose(this.lastChoice.id); else void this.initialize(); }
  next() {
    const index = EXCERPTS.findIndex((item) => item.id === this.lastChoice?.id);
    void this.choose(index >= 0 ? EXCERPTS[(index + 1) % EXCERPTS.length].id : this.lastChoice!.id);
  }
  showImport(open: boolean) { if (this.view === 'library') { this.importOpen = open; this.error = undefined; this.publish(); } }
  async importBook(url: string) {
    if (this.importing || this.disposed) return;
    this.importing = true; this.error = undefined; this.publish();
    try {
      const parsed = new URL(url);
      const workId = ['aozora.gr.jp', 'www.aozora.gr.jp'].includes(parsed.hostname) && parseAozoraUrl(parsed.href);
      if (!workId) throw new Error('青空文庫の図書カードまたは本文のURLを入力してください。');
      if (this.saved.some((book) => book.id === workId)) throw new Error('この作品は既に蔵書にあります。');
      const response = await requestJson<ApiResponse<{ book: BookSummary; passages: { difficulty: StoredDifficulty; encrypted: string }[] }>>('/api/books/import', { method: 'POST', body: JSON.stringify({ workId }) });
      if (!response.success) throw new Error(response.error.message);
      const book: StoredBook = { ...response.data.book, passages: response.data.passages, addedAt: new Date().toISOString() };
      await Promise.all([prepareText(book.title + book.author), prepareText(book.title + book.author, true)]);
      if (this.disposed) return;
      await putBook(book);
      if (this.disposed) return;
      this.saved = [...this.saved, book]; this.importOpen = false; this.announcement = '蔵書に追加しました。';
    } catch (error) { this.error = error instanceof Error ? error.message : '取り込みに失敗しました。'; }
    finally { this.importing = false; this.publish(); }
  }
  async removeBook(id: string) {
    try { await deleteBook(id); if (!this.disposed) { this.saved = this.saved.filter((book) => book.id !== id); this.publish(); } }
    catch (error) { this.fail(error); }
  }
  dispose() { this.disposed = true; this.revision++; this.request?.abort(); this.listeners.clear(); this.cameraAction = undefined; }
}

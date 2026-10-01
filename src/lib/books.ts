import type { Passage } from "../game/text.ts";

export interface SavedBook {
  id: string;
  title: string;
  author: string;
  kanaType: string;
  addedAt: string;
  formatVersion: 2;
  sourceUrl: string;
  passages: Passage[];
}
export interface LegacyBook { id: string; title: string; author: string; addedAt: string; formatVersion?: 1; passages: unknown[] }
export type LibraryBook = SavedBook | LegacyBook;
export function isCurrent(book: LibraryBook): book is SavedBook { return book.formatVersion === 2; }

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("aozora-puzzle", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("books", { keyPath: "id" });
    request.onerror = () => reject(new Error("保存した本を開けません。ブラウザの保存設定を確認してください。"));
    request.onblocked = () => reject(new Error("別のタブが本棚を使用しています。タブを閉じて再試行してください。"));
    request.onsuccess = () => resolve(request.result);
  });
}
async function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await open();
  return new Promise((resolve, reject) => {
    const tx = database.transaction("books", mode);
    const request = run(tx.objectStore("books"));
    tx.oncomplete = () => { database.close(); resolve(request.result); };
    tx.onabort = () => { database.close(); reject(new Error("本棚の保存処理を完了できません。既存の本は変更していません。")); };
    tx.onerror = () => { /* The abort handler owns cleanup and error reporting. */ };
  });
}
export async function readBooks(): Promise<LibraryBook[]> {
  const result: unknown = await transaction("readonly", (store) => store.getAll());
  if (!Array.isArray(result) || result.some((book) => !book || typeof book.id !== "string" || typeof book.title !== "string" || typeof book.author !== "string" || !Array.isArray(book.passages))) throw new Error("保存データの形式を確認できません。自動削除はしていません。");
  return result as LibraryBook[];
}
export async function saveBook(book: SavedBook): Promise<void> { await transaction("readwrite", (store) => store.put(book)); }
export async function removeBook(id: string): Promise<void> { await transaction("readwrite", (store) => store.delete(id)); }

export function parseImportUrl(value: string): { workId: string; sourceUrl: string } {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error("青空文庫の作品カードURLを貼り付けてください。"); }
  const match = /^\/cards\/\d+\/card(\d+)\.html$/.exec(url.pathname);
  if (url.protocol !== "https:" || url.hostname !== "www.aozora.gr.jp" || !match || url.username || url.password || url.port) throw new Error("https://www.aozora.gr.jp/cards/…/card….html の作品カードを指定してください。");
  return { workId: match[1].padStart(6, "0"), sourceUrl: `https://www.aozora.gr.jp${url.pathname}` };
}

export async function importWork(value: string, signal: AbortSignal): Promise<SavedBook> {
  const input = parseImportUrl(value);
  const response = await fetch("/api/books/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal });
  const payload = await response.json() as { success: boolean; data?: SavedBook; error?: { message: string } };
  if (!response.ok || !payload.success || !payload.data) throw new Error(payload.error?.message ?? "取り込みに失敗しました。接続を確認して再試行してください。");
  return payload.data;
}

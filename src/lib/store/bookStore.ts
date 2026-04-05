import type { BookSummary, Difficulty } from "@/types/puzzle";

export type EncryptedPassage = {
  difficulty: Difficulty;
  encrypted: string;
};

export type StoredBook = {
  id: string;
  title: string;
  author: string;
  kanaType: string;
  passages: EncryptedPassage[];
  addedAt: string;
};

const DB_NAME = "aozora-puzzle";
const DB_VERSION = 1;
const STORE_NAME = "books";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllBooks(): Promise<StoredBook[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => {
      db.close();
      resolve(request.result as StoredBook[]);
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function getBook(id: string): Promise<StoredBook | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => {
      db.close();
      resolve(request.result as StoredBook | undefined);
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function putBook(book: StoredBook): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put(book);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteBook(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export function toBookSummary(stored: StoredBook): BookSummary {
  return {
    id: stored.id,
    title: stored.title,
    author: stored.author,
    kanaType: stored.kanaType,
  };
}

export function pickRandomPassage(
  book: StoredBook,
  difficulty: Difficulty,
  exclude?: string,
): string | undefined {
  const all = book.passages.filter((p) => p.difficulty === difficulty);
  if (all.length === 0) return undefined;
  const candidates = all.length > 1 && exclude
    ? all.filter((p) => p.encrypted !== exclude)
    : all;
  const pool = candidates.length > 0 ? candidates : all;
  const index = Math.floor(Math.random() * pool.length);
  return pool[index].encrypted;
}

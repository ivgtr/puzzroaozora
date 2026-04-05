import { readFile } from "node:fs/promises";
import path from "node:path";
import { FALLBACK_BY_ID, FALLBACK_WORKS } from "@/data/fallbackBooks";
import { FIXED_BY_ID, FIXED_WORKS } from "@/data/fixedBooks";
import type { LibroSearchResult, LibroWork, LibroWorkContent } from "@/types/libro";
import type { BookSummary } from "@/types/puzzle";

const DEFAULT_BASE_URL = "http://localhost:8787";
const fixedContentCache = new Map<string, string>();

function getAozoraApiBaseUrl(): string {
  const base = process.env.AOZORA_API_BASE_URL ?? DEFAULT_BASE_URL;
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

async function fetchLibro<T>(path: string, params?: Record<string, string>): Promise<T> {
  const base = getAozoraApiBaseUrl();
  const url = new URL(`/v1${path}`, base);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value) {
        url.searchParams.set(key, value);
      }
    }
  }

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
    next: { revalidate: 60 * 60 },
  });

  if (!response.ok) {
    throw new Error(`LibroAozora API error: ${response.status}`);
  }

  return (await response.json()) as T;
}

function mapWorkToBookSummary(work: LibroWork): BookSummary {
  const mainAuthor = work.authors.find((author) => author.role === "author") ?? work.authors[0];
  const authorName = mainAuthor
    ? `${mainAuthor.lastName}${mainAuthor.firstName}`
    : "著者不明";

  return {
    id: work.id,
    title: work.title,
    author: authorName,
    kanaType: work.orthography ?? "新字新仮名",
  };
}

function dedupeWorksById(works: LibroWork[]): LibroWork[] {
  const seen = new Set<string>();
  const deduped: LibroWork[] = [];
  works.forEach((work) => {
    if (seen.has(work.id)) {
      return;
    }
    seen.add(work.id);
    deduped.push(work);
  });
  return deduped;
}

function createBookKey(book: Pick<BookSummary, "title" | "author">): string {
  return `${book.title}::${book.author}`;
}

function normalizeQuery(query: string | undefined): string {
  return query?.trim() ?? "";
}

function matchQuery(book: BookSummary, queryLower: string): boolean {
  if (queryLower.length === 0) {
    return true;
  }
  return (
    book.title.toLowerCase().includes(queryLower) ||
    book.author.toLowerCase().includes(queryLower)
  );
}

async function readFixedWorkContent(bookId: string): Promise<string> {
  const fixed = FIXED_BY_ID.get(bookId);
  if (!fixed) {
    throw new Error(`Unknown fixed work id: ${bookId}`);
  }

  const cached = fixedContentCache.get(bookId);
  if (cached) {
    return cached;
  }

  const absolutePath = path.join(process.cwd(), "public", fixed.assetPath);
  try {
    const content = await readFile(absolutePath, "utf8");
    fixedContentCache.set(bookId, content);
    return content;
  } catch {
    return fixed.fallbackContent;
  }
}

export async function listBooks(options: {
  limit: number;
  offset: number;
  query?: string;
}): Promise<{ books: BookSummary[]; total: number; hasMore: boolean; source: "fixed" | "api" | "fallback" }> {
  const fixedBooks = FIXED_WORKS.map((work) => work.book);
  const query = normalizeQuery(options.query);
  const safeLimit = Math.max(1, options.limit);
  const queryLower = query.toLowerCase();

  if (query.length === 0) {
    return {
      books: fixedBooks,
      total: fixedBooks.length,
      hasMore: false,
      source: "fixed",
    };
  }

  const fixedBookKeys = new Set(fixedBooks.map((book) => createBookKey(book)));

  try {
    const page = Math.floor(options.offset / safeLimit) + 1;
    const titleResult = await fetchLibro<LibroSearchResult<LibroWork>>("/works", {
      page: String(page),
      per_page: String(safeLimit),
      copyright: "false",
      title: query,
      sort: "updated_at",
      order: "desc",
    });

    let mergedItems = titleResult.items;
    let mergedTotal = titleResult.total;

    if (mergedItems.length < safeLimit) {
      const authorResult = await fetchLibro<LibroSearchResult<LibroWork>>("/works", {
        page: String(page),
        per_page: String(safeLimit),
        copyright: "false",
        author: query,
        sort: "updated_at",
        order: "desc",
      });
      mergedItems = dedupeWorksById([...titleResult.items, ...authorResult.items]);
      mergedTotal = Math.max(titleResult.total, authorResult.total);
    }

    const seenIds = new Set<string>();
    const dynamicBooks: BookSummary[] = [];
    mergedItems.forEach((work) => {
      const mapped = mapWorkToBookSummary(work);
      const key = createBookKey(mapped);
      if (fixedBookKeys.has(key) || seenIds.has(mapped.id)) {
        return;
      }
      seenIds.add(mapped.id);
      dynamicBooks.push(mapped);
    });

    return {
      books: [...fixedBooks, ...dynamicBooks],
      total: fixedBooks.length + mergedTotal,
      hasMore: options.offset + mergedItems.length < mergedTotal,
      source: "api",
    };
  } catch {
    const filtered = FALLBACK_WORKS.filter((work) => {
      const key = createBookKey(work.book);
      if (fixedBookKeys.has(key)) {
        return false;
      }
      return matchQuery(work.book, queryLower);
    });
    const sliced = filtered.slice(options.offset, options.offset + safeLimit);

    return {
      books: [...fixedBooks, ...sliced.map((work) => work.book)],
      total: fixedBooks.length + filtered.length,
      hasMore: options.offset + sliced.length < filtered.length,
      source: "fallback",
    };
  }
}

export async function getBookContent(bookId: string): Promise<{ title: string; author: string; text: string; source: "fixed" | "api" | "fallback" }> {
  const fixed = FIXED_BY_ID.get(bookId);
  if (fixed) {
    const text = await readFixedWorkContent(bookId);
    return {
      title: fixed.book.title,
      author: fixed.book.author,
      text,
      source: "fixed",
    };
  }

  try {
    const [work, content] = await Promise.all([
      fetchLibro<LibroWork>(`/works/${encodeURIComponent(bookId)}`),
      fetchLibro<LibroWorkContent>(`/works/${encodeURIComponent(bookId)}/content`, {
        format: "plain",
      }),
    ]);

    const book = mapWorkToBookSummary(work);

    return {
      title: book.title,
      author: book.author,
      text: String(content.content),
      source: "api",
    };
  } catch {
    const fallback = FALLBACK_BY_ID.get(bookId);
    if (fallback) {
      return {
        title: fallback.book.title,
        author: fallback.book.author,
        text: fallback.content,
        source: "fallback",
      };
    }

    const defaultFixed = FIXED_WORKS[0];
    const text = await readFixedWorkContent(defaultFixed.book.id);
    return {
      title: defaultFixed.book.title,
      author: defaultFixed.book.author,
      text,
      source: "fallback",
    };
  }
}

export async function checkAozoraApiHealth(): Promise<{
  status: "ok" | "degraded";
  detail: string;
}> {
  try {
    const health = await fetchLibro<{ status?: string }>("/health");
    if (health.status === "ok") {
      return { status: "ok", detail: "libroaozora API is healthy" };
    }
    return { status: "degraded", detail: "libroaozora API metadata is not synced" };
  } catch {
    return { status: "degraded", detail: "libroaozora API is unreachable. Fallback data is active" };
  }
}

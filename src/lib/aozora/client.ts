import { readFile } from "node:fs/promises";
import path from "node:path";
import { FIXED_BY_ID } from "@/data/fixedBooks";
import type { LibroWork, LibroWorkContent } from "@/types/libro";
import type { BookSummary } from "@/types/puzzle";

const DEFAULT_BASE_URL = "http://localhost:8787";
const fixedContentCache = new Map<string, string>();

function getAozoraApiBaseUrl(): string {
  const base = process.env.AOZORA_API_BASE_URL ?? DEFAULT_BASE_URL;
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

async function fetchLibro<T>(urlPath: string, params?: Record<string, string>): Promise<T> {
  const base = getAozoraApiBaseUrl();
  const url = new URL(`/v1${urlPath}`, base);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value) {
        url.searchParams.set(key, value);
      }
    }
  }

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
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
    : "\u8457\u8005\u4E0D\u660E";

  return {
    id: work.id,
    title: work.title,
    author: authorName,
    kanaType: work.orthography ?? "\u65B0\u5B57\u65B0\u4EEE\u540D",
  };
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
  const content = await readFile(absolutePath, "utf8");
  fixedContentCache.set(bookId, content);
  return content;
}

export async function getBookContent(bookId: string): Promise<{
  title: string;
  author: string;
  text: string;
}> {
  const fixed = FIXED_BY_ID.get(bookId);
  if (!fixed) {
    throw new Error(`Book not found: ${bookId}`);
  }

  const text = await readFixedWorkContent(bookId);
  return {
    title: fixed.book.title,
    author: fixed.book.author,
    text,
  };
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
    return { status: "degraded", detail: "libroaozora API is unreachable" };
  }
}

export async function importBookFromApi(workId: string): Promise<{
  book: BookSummary;
  text: string;
}> {
  const [work, content] = await Promise.all([
    fetchLibro<LibroWork>(`/works/${encodeURIComponent(workId)}`),
    fetchLibro<LibroWorkContent>(`/works/${encodeURIComponent(workId)}/content`, {
      format: "plain",
    }),
  ]);

  return {
    book: mapWorkToBookSummary(work),
    text: String(content.content),
  };
}

import { FALLBACK_BY_ID, FALLBACK_WORKS } from "@/data/fallbackBooks";
import type { LibroSearchResult, LibroWork, LibroWorkContent } from "@/types/libro";
import type { BookSummary } from "@/types/puzzle";

const DEFAULT_BASE_URL = "http://localhost:8787";

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

export async function listBooks(options: {
  limit: number;
  offset: number;
  author?: string;
}): Promise<{ books: BookSummary[]; total: number; hasMore: boolean; source: "api" | "fallback" }> {
  try {
    const page = Math.floor(options.offset / options.limit) + 1;
    const result = await fetchLibro<LibroSearchResult<LibroWork>>("/works", {
      page: String(page),
      per_page: String(options.limit),
      copyright: "false",
      author: options.author ?? "",
      sort: "updated_at",
      order: "desc",
    });

    return {
      books: result.items.map(mapWorkToBookSummary),
      total: result.total,
      hasMore: options.offset + result.items.length < result.total,
      source: "api",
    };
  } catch {
    const filtered = options.author
      ? FALLBACK_WORKS.filter((work) => work.book.author.includes(options.author ?? ""))
      : FALLBACK_WORKS;
    const sliced = filtered.slice(options.offset, options.offset + options.limit);

    return {
      books: sliced.map((work) => work.book),
      total: filtered.length,
      hasMore: options.offset + sliced.length < filtered.length,
      source: "fallback",
    };
  }
}

export async function getBookContent(bookId: string): Promise<{ title: string; author: string; text: string; source: "api" | "fallback" }> {
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
    const fallback = FALLBACK_BY_ID.get(bookId) ?? FALLBACK_WORKS[0];
    return {
      title: fallback.book.title,
      author: fallback.book.author,
      text: fallback.content,
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

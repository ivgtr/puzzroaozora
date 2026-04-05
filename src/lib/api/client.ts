export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

  let json: T;
  try {
    json = (await response.json()) as T;
  } catch {
    throw new Error(`HTTP ${response.status}`);
  }
  return json;
}

export function normalizeErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  return fallback;
}

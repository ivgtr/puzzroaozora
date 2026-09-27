const AOZORA_URL_RE = /\/cards\/\d+\/(?:card|files\/)(\d+)[_.]/;

export function parseAozoraUrl(url: string): string | null {
  const match = AOZORA_URL_RE.exec(url);
  if (!match?.[1]) return null;
  return match[1].padStart(6, "0");
}


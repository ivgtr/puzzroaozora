import { extractPassages, type Difficulty } from "../game/text.ts";
import type { SavedBook } from "./books.ts";

export function cleanAozora(raw: string): string {
  let text = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const lines = text.split("\n");
  const separators = lines.flatMap((line, index) => /^[-─━―]{5,}$/.test(line.trim()) ? [index] : []);
  if (separators.length >= 2) text = lines.slice(separators[1] + 1).join("\n");
  text = text.split(/^底本：/m)[0];
  text = text.replace(/｜([^《\n]+)《[^》]+》/g, "$1").replace(/([\p{Script=Han}々〇]+)《[^》]+》/gu, "$1");
  text = text.replace(/※［＃[^］]*U\+([0-9a-f]+)[^］]*］/gi, (_, hex: string) => {
    const point = Number.parseInt(hex, 16);
    if (point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff)) throw new Error("外字の文字番号が不正です。");
    return String.fromCodePoint(point);
  });
  if (/※［＃/.test(text) || text.includes("〓")) throw new Error("未解決の外字が含まれます。文字を置き換えず取り込みを中止しました。");
  text = text.replace(/［＃[^］]*］/g, "").replace(/\n{3,}/g, "\n\n").trim();
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text) || /<\/?(?:html|body|ruby|div|span)\b/i.test(text)) throw new Error("日本語の本文として読み込めない形式です。");
  return text;
}

interface Work { id: string; title: string; orthography?: string; authors: { lastName: string; firstName: string; role: string }[] }
async function getJson<T>(base: URL, pathname: string): Promise<T> {
  const response = await fetch(new URL(pathname, base), { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`作品取得APIが応答しませんでした（${response.status}）。`);
  const body = await response.text();
  if (body.length > 5_000_000) throw new Error("この作品は一度に取り込める本文量を超えています。");
  return JSON.parse(body) as T;
}
export async function retrieveBook(workId: string, sourceUrl: string): Promise<SavedBook> {
  const configured = process.env.AOZORA_API_BASE_URL;
  if (!configured) throw new Error("作品取り込み先が未設定です。AOZORA_API_BASE_URL を設定してください。推奨原稿は通信なしで選べます。");
  const base = new URL(configured);
  const [work, content] = await Promise.all([
    getJson<Work>(base, `/v1/works/${encodeURIComponent(workId)}`),
    getJson<{ content: string }>(base, `/v1/works/${encodeURIComponent(workId)}/content?format=plain`),
  ]);
  if (!work || typeof work.title !== "string" || !Array.isArray(work.authors) || typeof content.content !== "string") throw new Error("作品取得APIの応答形式が不正です。");
  const author = work.authors.find((person) => person.role === "author") ?? work.authors[0];
  if (!author || typeof author.lastName !== "string" || typeof author.firstName !== "string") throw new Error("原典の著者を確認できません。");
  const title = work.title;
  const authorName = author.lastName + author.firstName;
  const text = cleanAozora(content.content);
  const passages = (["easy", "normal", "hard"] as Difficulty[]).flatMap((difficulty) => extractPassages(text, difficulty).map((candidate, index) => ({
    ...candidate, id: `${workId}:v2:${difficulty}:${index}`, workId, title, author: authorName, sourceUrl, difficulty,
    note: "自動抽出。原典上の連続した文を保持。良問としての人間による確認は未実施。",
  })));
  if (!passages.length) throw new Error("自然な文のまとまりで出題できる抜粋が見つかりませんでした。別の作品を選んでください。");
  return { id: workId, title, author: authorName, kanaType: work.orthography ?? "原典表記", sourceUrl, formatVersion: 2, passages, addedAt: new Date().toISOString() };
}

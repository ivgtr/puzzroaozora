const SEPARATOR_RE = /^[-─━―]{5,}$/;
const CJK_CHAR = "[\\u3400-\\u9FFF\\uF900-\\uFAFF々〇]";
const CJK_RUN = `${CJK_CHAR}+`;

function removeHeader(text: string): string {
  const lines = text.split("\n");
  let separatorCount = 0;
  let cutIndex = -1;

  for (let i = 0; i < lines.length; i += 1) {
    if (SEPARATOR_RE.test(lines[i].trim())) {
      separatorCount += 1;
      if (separatorCount === 2) {
        const searchLimit = Math.min(i + 4, lines.length);
        for (let j = i + 1; j < searchLimit; j += 1) {
          if (lines[j].trim() === "") {
            cutIndex = j + 1;
            break;
          }
        }
        if (cutIndex === -1) {
          cutIndex = i + 1;
        }
        break;
      }
    }
  }

  if (cutIndex === -1) {
    return text;
  }

  return lines.slice(cutIndex).join("\n");
}

function removeFooter(text: string): string {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trimStart().startsWith("底本：")) {
      return lines.slice(0, i).join("\n");
    }
  }
  return text;
}

function removeRangeRuby(text: string): string {
  return text.replace(/｜([^《]+)《[^》]+》/g, "$1");
}

function removeBasicRuby(text: string): string {
  return text.replace(new RegExp(`(${CJK_RUN})《[^》]+》`, "g"), "$1");
}

function removeBlockAnnotations(text: string): string {
  return text
    .replace(/［＃ここから[^］]*］/g, "")
    .replace(/［＃ここで[^］]*終わり］/g, "");
}

function removeAnnotations(text: string): string {
  return text
    .replace(/※［＃[^］]*U\+([0-9A-Fa-f]+)[^］]*］/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/※［＃[^］]*］/g, "〓")
    .replace(/［＃[^］]*］/g, "");
}

function collapseBlankLines(text: string): string {
  return text.replace(/\n{3,}/g, "\n\n");
}

export function normalizeAozoraText(rawText: string): string {
  const normalized = rawText
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  const cleaned = collapseBlankLines(
    removeAnnotations(removeBlockAnnotations(removeBasicRuby(removeRangeRuby(removeFooter(removeHeader(normalized))))))
  );

  return cleaned.trim();
}

export function pickPassageByLength(text: string, minLength: number, maxLength: number, random: () => number): string {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const joined = lines.join(" ");
  if (joined.length <= maxLength) {
    return joined;
  }

  const sentences = joined
    .split(/(?<=[。！？!?])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);

  if (sentences.length === 0) {
    return joined.slice(0, maxLength);
  }

  const candidates: string[] = [];

  for (let i = 0; i < sentences.length; i += 1) {
    let chunk = "";
    for (let j = i; j < sentences.length; j += 1) {
      chunk += sentences[j];
      if (chunk.length >= minLength && chunk.length <= maxLength) {
        candidates.push(chunk);
      }
      if (chunk.length > maxLength) {
        break;
      }
    }
  }

  if (candidates.length === 0) {
    const start = Math.max(0, Math.floor(random() * Math.max(1, joined.length - maxLength)));
    return joined.slice(start, start + maxLength).trim();
  }

  const index = Math.floor(random() * candidates.length);
  return candidates[index];
}

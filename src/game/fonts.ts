type Face = { family: "DeskSerif" | "DeskSans"; weight: string; file: string; ranges: [number, number][] };
let manifest: Promise<Face[]> | undefined;
const loaded = new Map<string, Promise<void>>();

function readManifest(): Promise<Face[]> {
  if (!manifest) manifest = fetch("/fonts/manifest.json").then(async (response) => {
    if (!response.ok) throw new Error("書体の一覧を読み込めません。再試行してください。");
    return await response.json() as Face[];
  }).catch((error: unknown) => { manifest = undefined; throw error; });
  return manifest;
}

export async function prepareFont(text: string, family: Face["family"]): Promise<void> {
  const faces = (await readManifest()).filter((face) => face.family === family);
  const needed = new Set<Face>();
  const missing: string[] = [];
  for (const char of new Set(Array.from(text))) {
    if (char === "\n" || char === "\r" || char === "\t") continue;
    const point = char.codePointAt(0)!;
    const face = faces.find((candidate) => candidate.ranges.some(([start, end]) => point >= start && point <= end));
    if (face) needed.add(face);
    else missing.push(char);
  }
  if (missing.length) throw new Error(`この書体で表示できない文字があります：${missing.slice(0, 8).join(" ")}。原文は変更していません。別の抜粋を選んでください。`);
  await Promise.all([...needed].map((entry) => {
    let promise = loaded.get(entry.file);
    if (!promise) {
      const face = new FontFace(entry.family, `url(/fonts/${entry.file})`, {
        weight: entry.weight,
        unicodeRange: entry.ranges.map(([a, b]) => a === b ? `U+${a.toString(16)}` : `U+${a.toString(16)}-${b.toString(16)}`).join(","),
      });
      promise = face.load().then((ready) => { document.fonts.add(ready); }).catch((error: unknown) => {
        loaded.delete(entry.file);
        throw new Error(`書体の読み込みに失敗しました。接続を確認して再試行してください。${error instanceof Error ? ` (${error.message})` : ""}`);
      });
      loaded.set(entry.file, promise);
    }
    return promise;
  }));
}

export async function prepareText(body: string, labels: string): Promise<void> {
  await Promise.all([prepareFont(body, "DeskSerif"), prepareFont(labels, "DeskSans")]);
}

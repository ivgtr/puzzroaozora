import { readFile, mkdir, copyFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { openSync } from "fontkit";

const output = path.resolve("public/fonts");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const manifest = [];
let bytes = 0;
function ranges(points) {
  const result = [];
  for (const point of [...new Set(points)].sort((a, b) => a - b)) {
    const previous = result.at(-1);
    if (previous && previous[1] + 1 === point) previous[1] = point;
    else result.push([point, point]);
  }
  return result;
}
function declaredRanges(value) {
  return value.split(",").map((part) => {
    const [start, end] = part.trim().replace(/^U\+/i, "").split("-");
    return [parseInt(start.replaceAll("?", "0"), 16), parseInt((end ?? start).replaceAll("?", "f"), 16)];
  });
}
for (const [name, family, weight] of [["noto-serif-jp", "DeskSerif", "500"], ["noto-sans-jp", "DeskSans", "400"]]) {
  const root = path.resolve("node_modules/@fontsource", name);
  const css = await readFile(path.join(root, `${weight}.css`), "utf8");
  const entries = new Map();
  for (const match of css.matchAll(/@font-face\s*\{([^}]+)\}/g)) {
    const source = /url\(['"]?\.\/files\/([^)'"\s]+\.woff2)['"]?\)/.exec(match[1]);
    const declared = /unicode-range:\s*([^;]+);/.exec(match[1]);
    if (!source || !declared) throw new Error(`${name}: font source or unicode-range is missing`);
    const file = source[1];
    const font = openSync(path.join(root, "files", file));
    if (!("characterSet" in font)) throw new Error(`${name}: expected a single OpenType font`);
    const allowed = declaredRanges(declared[1]);
    const points = font.characterSet.filter((point) => allowed.some(([start, end]) => point >= start && point <= end));
    const previous = entries.get(file) ?? [];
    entries.set(file, [...previous, ...points]);
  }
  if (!entries.size) throw new Error(`${name}: no font subsets were found`);
  for (const [source, points] of entries) {
    const file = `${family}-${source}`;
    await copyFile(path.join(root, "files", source), path.join(output, file));
    bytes += (await readFile(path.join(output, file))).byteLength;
    manifest.push({ family, weight, file, ranges: ranges(points) });
  }
  await copyFile(path.join(root, "LICENSE"), path.join(output, `${name}-LICENSE.txt`));
}
await writeFile(path.join(output, "manifest.json"), JSON.stringify(manifest));
console.log(`Prepared ${manifest.length} self-hosted font subsets (${(bytes / 1024 / 1024).toFixed(2)} MiB on disk). The browser loads only glyph-covered subsets needed by each screen.`);

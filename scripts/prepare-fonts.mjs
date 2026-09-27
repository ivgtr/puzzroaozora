// Build-time only. Serve the same WOFF bytes whose cmap is checked here.
import { readFile, mkdir, writeFile, copyFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import opentype from 'opentype.js';
const { parse } = opentype;
const require = createRequire(import.meta.url);
const output = path.resolve('public/fonts');
await mkdir(output, { recursive: true });
const coverage = {};
let stylesheet = '';
for (const [name, weights] of [['noto-serif-jp', [400, 500]], ['noto-sans-jp', [500]]]) {
  const root = path.dirname(require.resolve(`@fontsource/${name}/package.json`));
  for (const weight of weights) {
    const css = await readFile(path.join(root, `${weight}.css`), 'utf8');
    const supported = new Set();
    for (const [, block] of css.matchAll(/@font-face\s*\{([^}]+)\}/g)) {
      const filename = block.match(/\.\/files\/([^'"()]+\.woff)[)'"]/)?.[1];
      const family = block.match(/font-family:\s*'([^']+)'/)?.[1];
      const unicode = block.match(/unicode-range:\s*([^;]+)/)?.[1];
      if (!filename || !family || !unicode) throw new Error(`Invalid font CSS: ${name}`);
      const bytes = await readFile(path.join(root, 'files', filename));
      const font = parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      const ranges = unicode.split(',').map((item) => {
        const [start, end] = item.trim().replace(/^U\+/, '').split('-').map((n) => parseInt(n, 16));
        return [start, end ?? start];
      });
      for (const [point, glyph] of Object.entries(font.tables.cmap.glyphIndexMap)) {
        const code = Number(point);
        if (glyph !== 0 && ranges.some(([a, b]) => code >= a && code <= b)) supported.add(code);
      }
      await copyFile(path.join(root, 'files', filename), path.join(output, filename));
      stylesheet += `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:block;src:url('/fonts/${filename}') format('woff');unicode-range:${unicode}}\n`;
    }
    coverage[`${name}:${weight}`] = [...supported].sort((a, b) => a - b);
  }
  await copyFile(path.join(root, 'LICENSE'), path.join(output, `${name}-LICENSE.txt`));
}
await writeFile(path.join(output, 'fonts.css'), stylesheet);
await writeFile(path.join(output, 'coverage.json'), JSON.stringify(coverage));
console.log('Prepared locally served fonts and verified cmap coverage.');

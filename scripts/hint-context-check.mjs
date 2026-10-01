// TEMPORARY browser evidence only. Remove this script and its workflow before the final commit.
// Requires Node 22+, a running build of this checkout, and Playwright Chromium on an allowed executor.
// APP_URL=http://127.0.0.1:5678 BASELINE_URL=http://127.0.0.1:5679 \
// PLAYWRIGHT_MODULE=/tmp/browser/node_modules/playwright/index.mjs EVIDENCE_DIR=/tmp/evidence \
// node --experimental-strip-types scripts/hint-context-check.mjs
// No app-source changes: response instrumentation only exposes the existing DeskScene.
// Fixtures call its existing openPassage/apply(move) entry points. Joins and Undo use
// the shared accessible controls; reveal and navigation use actual canvas mouse/touch input.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { PASSAGES } from '../src/data/passages.ts';
import { CELL } from '../src/game/layout.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appUrl = process.env.APP_URL || 'http://127.0.0.1:5678';
const baselineUrl = process.env.BASELINE_URL;
const baselineRef = process.env.BASELINE_REF || '95155fa';
const evidenceDir = process.env.EVIDENCE_DIR || '/tmp/evidence';
const playwrightModule = process.env.PLAYWRIGHT_MODULE || '/tmp/browser/node_modules/playwright/index.mjs';
const { chromium } = await import(playwrightModule);
fs.mkdirSync(evidenceDir, { recursive: true });
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).trim();
const tracked = git('ls-files', 'src', 'public', 'package.json', 'package-lock.json', 'next.config.ts').split('\n').filter(Boolean);
const appFiles = Object.fromEntries(tracked.filter(name => fs.existsSync(path.join(root, name))).map(name => [name, sha256(fs.readFileSync(path.join(root, name)))]));
const baseline = baselineUrl ? { url: baselineUrl, ref: git('rev-parse', baselineRef), files: Object.fromEntries(
  git('ls-tree', '-r', '--name-only', baselineRef, 'src', 'public', 'package.json', 'package-lock.json', 'next.config.ts').split('\n').filter(Boolean)
    .map(name => [name, sha256(execFileSync('git', ['show', `${baselineRef}:${name}`], { cwd: root }))])) } : null;
const works = PASSAGES.filter((passage, index) => PASSAGES.findIndex(other => other.workId === passage.workId) === index);
assert.equal(PASSAGES.length, 12, 'Twelve curated questions required');
assert.equal(works.length, 3, 'Exactly three works');
for (const work of works) assert.equal(PASSAGES.filter(p => p.workId === work.workId).length, 4);
const startedAt = new Date().toISOString();
const checks = [], errors = [], requestFailures = [], scripts = [], screenshots = [], solved = [], comparisons = [];
let page, browser, currentContext, stage = 'launch';
const report = (status, failure) => ({
  status, startedAt, finishedAt: new Date().toISOString(), appUrl,
  appHead: git('rev-parse', 'HEAD'), appFiles, gitStatus: git('status', '--short'), baseline, browserVersion: browser?.version(),
  scripts, checks, solved, errors, requestFailures, screenshots, comparisons,
  ...(failure ? { failure: String(failure.stack || failure), stage } : {}),
  desktop: '1280x800 DPR2', mobile: '320x568 DPR2 touch, rotated to 568x320 and back',
  method: 'Real canvas mouse/touch reveal and context-chip navigation. Shared accessible Session controls perform assembly and Undo. Temporary read-only script-response exposure provides camera/graphics evidence. Deterministic fixtures open a curated passage and move existing chains through the live Scene/Session; they never replace game state or render a substitute UI. Eight normal-RNG work openings per work check membership and immediate-repeat exclusion without overriding randomness; boundary values are covered by the separate Node questions tests. All 12 passages are solved, independently of chance.',
  limitations: 'Automated Chromium only; physical-device use, human legibility/balance, listening and source-text editorial review are not claimed. Baseline comparisons are captured only when BASELINE_URL is supplied. Fixture positions are shared by text, not random tile IDs.',
});
const record = (name, details = {}) => { checks.push({ name, ...details }); console.log(`PASS ${name}`); };
const mode = value => page.locator(`[data-game-mode="${value}"]`).waitFor({ state: 'attached', timeout: 30000 });
const action = async id => { const node = page.locator(`[data-action="${id}"]`); await node.waitFor({ state: 'attached' }); await node.evaluate(element => element.click()); };
const pieces = () => page.locator('[data-piece]').evaluateAll(nodes => nodes.map(node => ({ id: node.dataset.piece, text: node.textContent, selected: node.getAttribute('aria-pressed') === 'true' })));
const state = () => page.evaluate(() => {
  const scene = window.__hintQaScene, session = scene.session, c = scene.boardCamera;
  return { passageId: session?.problem.id, workId: session?.problem.workId,
    remaining: session?.hintsRemaining, phase: session?.state.phase,
    chains: session?.state.chains.map(chain => ({ ...chain, tiles: [...chain.tiles], bonds: [...chain.bonds] })),
    tiles: session?.problem.tiles.map(tile => ({ ...tile })), hintSelecting: scene.hintSelecting,
    hintAnchor: scene.hintAnchor ?? null, hintTarget: scene.hintTarget ?? null,
    description: scene.hintDescription, selected: scene.selected ?? null,
    canUndo: session?.canUndo, notice: scene.notice,
    camera: { scrollX: c.scrollX, scrollY: c.scrollY, zoom: c.zoom, x: c.x, y: c.y, width: c.width, height: c.height },
  };
});
const noAnswer = async () => {
  assert.equal(await page.locator('[data-original]').count(), 0, 'No original before completion');
  assert.equal(await page.locator('[data-action="source"]').count(), 0, 'No source before completion');
  assert.equal(await page.locator('[data-action="review"]').count(), 0, 'No full-text review shortcut');
};
const shot = async name => {
  await page.waitForTimeout(180);
  const file = `${name}.png`; await page.screenshot({ path: path.join(evidenceDir, file) });
  screenshots.push({ file, sha256: sha256(fs.readFileSync(path.join(evidenceDir, file))), camera: (await state()).camera });
  return file;
};
const physical = async (point, touch = false) => touch ? page.touchscreen.tap(point.x, point.y) : page.mouse.click(point.x, point.y);
const actionPoint = id => page.evaluate(id => {
  const scene = window.__hintQaScene, action = scene.actions.get(id);
  if (!action) throw new Error(`Missing canvas action ${id}`);
  const b = action.bounds, canvas = scene.game.canvas.getBoundingClientRect();
  return { x: canvas.left + (b.x + b.width / 2) * canvas.width / scene.scale.width,
    y: canvas.top + (b.y + b.height / 2) * canvas.height / scene.scale.height };
}, id);
const physicalAction = async (id, touch = false) => {
  await page.locator(`[data-action="${id}"]`).waitFor({ state: 'attached' });
  await physical(await actionPoint(id), touch);
};
const pieceByText = async text => { const found = (await pieces()).find(piece => piece.text === text); assert(found, `Missing chain ${text}`); return found; };
const pick = async text => { const piece = await pieceByText(text); await page.locator(`[data-piece="${piece.id}"]`).evaluate(node => node.click()); return piece.id; };
const join = async (left, right) => {
  const target = await pieceByText(left); await pick(right); await action(`join:after:${target.id}`);
  await page.waitForFunction(text => [...document.querySelectorAll('[data-piece]')].some(piece => piece.textContent === text), left + right);
};
const paperPoint = async (text, focus = true) => {
  const piece = await pieceByText(text);
  if (focus) { await page.locator(`[data-piece="${piece.id}"]`).evaluate(node => node.focus({ preventScroll: true })); await page.waitForTimeout(40); }
  return page.evaluate(({ id, cell }) => {
    const scene = window.__hintQaScene, paper = scene.views.get(id)?.paper, camera = scene.boardCamera;
    if (!paper) throw new Error(`Missing paper ${id}`);
    camera.preRender(); const canvas = scene.game.canvas.getBoundingClientRect();
    for (const glyph of paper.layout.glyphs) {
      const world = { x: paper.x + glyph.x + glyph.advance / 2, y: paper.y + glyph.y + cell / 2 };
      const screen = camera.matrixCombined.transformPoint(world.x, world.y);
      if (screen.x < 8 || screen.x > scene.scale.width - 8 || screen.y < camera.y + 8 || screen.y > camera.y + camera.height - 8) continue;
      if (scene.hitPaper(world)?.id !== id) continue;
      return { x: canvas.left + screen.x * canvas.width / scene.scale.width, y: canvas.top + screen.y * canvas.height / scene.scale.height };
    }
    throw new Error(`No visible unoccluded glyph in ${id}`);
  }, { id: piece.id, cell: CELL });
};
const physicalPaper = async (text, touch = false, focus = true) => physical(await paperPoint(text, focus), touch);
const hint = async (text, touch = false, focus = true) => {
  if (!(await state()).hintSelecting) await physicalAction('hint', touch);
  await mode('hint-select');
  const point = await paperPoint(text, focus), before = await state();
  await physical(point, touch); await page.waitForTimeout(60);
  const after = await state();
  assert.deepEqual(after.camera, before.camera, 'Revealing a hint must never pan or zoom the board');
  assert.deepEqual(after.chains, before.chains, 'Revealing a hint must never move/join/split pieces');
  return { before: before.camera, after: after.camera };
};
const graphics = () => page.evaluate(() => [...window.__hintQaScene.views].map(([chainId, { paper }]) => ({
  chainId, commands: [...paper.hintInk.commandBuffer], ranges: paper.fragmentRanges.map(range => ({ ...range })),
  glyphs: paper.layout.glyphs.map(glyph => ({ ...glyph })),
})));
const parseHintCommands = commands => {
  let color, alpha; const rectangles = [];
  for (let i = 0; i < commands.length;) {
    const command = commands[i++];
    if (command === 7) { color = commands[i++]; alpha = commands[i++]; }
    else if (command === 6) i += 3;
    else if (command === 3) { const [x, y, width, height] = commands.slice(i, i + 4); i += 4; rectangles.push({ x, y, width, height, color, alpha }); }
    else assert.fail(`Unexpected hint Graphics command ${command}`);
  }
  return rectangles;
};
const assertUnpainted = async () => {
  for (const paper of await graphics()) assert.equal(parseHintCommands(paper.commands).length, 0, 'No stale hint paint');
  assert.equal((await state()).hintAnchor, null); assert.equal((await state()).hintTarget, null);
  assert.equal(await page.locator('[data-action="hint-source"]').count(), 0);
  assert.equal(await page.locator('[data-action="hint-target"]').count(), 0);
};
const assertHighlight = async (sourceText, targetText, remaining, minTargetSize = 1) => {
  await mode('assembling'); const current = await state();
  assert.equal(current.remaining, remaining); assert.equal(current.hintSelecting, false); assert.equal(current.selected, null);
  const source = current.tiles.find(tile => tile.text === sourceText), target = current.tiles.find(tile => tile.text === targetText);
  assert(source && target); assert.equal(current.hintAnchor, source.id); assert.equal(current.hintTarget, target.id);
  assert(current.description.includes(sourceText) && current.description.includes(targetText));
  assert.match(await page.locator('[data-description]').innerText(), new RegExp(`残り${remaining}回`));
  assert(current.chains.find(chain => chain.tiles.includes(target.id)).tiles.length >= minTargetSize);
  for (const paper of await graphics()) {
    const chain = current.chains.find(chain => chain.id === paper.chainId);
    const glyphsFor = tile => {
      const range = paper.ranges[chain.tiles.indexOf(tile.id)];
      return range ? paper.glyphs.filter(glyph => glyph.index >= range.start && glyph.index < range.end) : [];
    };
    const actual = parseHintCommands(paper.commands), sourceGlyphs = glyphsFor(source), targetGlyphs = glyphsFor(target);
    const yellow = actual.filter(rect => rect.color === 0xe3c66f);
    assert.deepEqual(yellow, targetGlyphs.map(glyph => ({ x: glyph.x, y: glyph.y, width: glyph.advance, height: CELL, color: 0xe3c66f, alpha: .58 })), 'Yellow covers only successor glyphs');
    const green = actual.filter(rect => rect.color !== 0xe3c66f);
    assert.deepEqual(green, [
      ...sourceGlyphs.map(glyph => ({ x: glyph.x, y: glyph.y, width: glyph.advance, height: CELL, color: 0xb3c8b4, alpha: .52 })),
      ...sourceGlyphs.map(glyph => ({ x: glyph.x, y: glyph.y + CELL - 2, width: glyph.advance, height: 2, color: 0x4f7661, alpha: .9 })),
    ], 'Green fill and underline cover only exact source glyphs, including when source and successor share a wrong group');
  }
  assert.equal(await page.locator('[data-action="hint-source"]').innerText(), `選んだ紙片を見る：「${sourceText}」`);
  assert.equal(await page.locator('[data-action="hint-target"]').innerText(), `続きを見る：「${targetText}」`);
  const excerpts = await page.evaluate(() => {
    const scene = window.__hintQaScene;
    const labels = scene.hud.list.filter(node => node.type === 'Text');
    return ['hint-source', 'hint-target'].map(id => {
      const b = scene.actions.get(id).bounds;
      return labels.find(node => node.x === b.x + 9 && node.y === b.y + 20)?.text;
    });
  });
  const segment = text => [...new Intl.Segmenter('ja', { granularity: 'grapheme' }).segment(text)].map(part => part.segment);
  assert(excerpts.every(Boolean), 'Visible footer includes both text excerpts');
  const sourceExcerpt = excerpts[0].replace(/^…/u, ''), targetExcerpt = excerpts[1].replace(/…$/u, '');
  assert(segment(sourceText).join('').endsWith(sourceExcerpt), 'Source chip preserves the source tail');
  assert(segment(targetText).join('').startsWith(targetExcerpt), 'Target chip preserves the successor beginning');
  await assertDistinctActions(['hint-source', 'hint-target', 'hint']); await noAnswer();
};
const assertDistinctActions = async ids => {
  const bounds = await page.evaluate(ids => {
    const scene = window.__hintQaScene;
    return ids.map(id => { const action = scene.actions.get(id); if (!action) throw new Error(`Missing action ${id}`); const b = action.bounds; return { id, x: b.x, y: b.y, right: b.right, bottom: b.bottom, w: scene.scale.width, h: scene.scale.height }; });
  }, ids);
  for (const a of bounds) assert(a.x >= 0 && a.y >= 0 && a.right <= a.w && a.bottom <= a.h, `Action outside viewport: ${a.id}`);
  for (let i = 0; i < bounds.length; i++) for (let j = i + 1; j < bounds.length; j++) {
    const a = bounds[i], b = bounds[j]; assert(a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y, `Actions overlap ${a.id}/${b.id}`);
  }
  return bounds;
};
const assertHelpFits = async () => {
  const data = await page.evaluate(() => {
    const scene = window.__hintQaScene, labels = [];
    const visit = node => { if (node.type === 'Text') { const b = node.getBounds(); labels.push({ text: node.text, x: b.x, y: b.y, right: b.right, bottom: b.bottom }); } if (node.list) node.list.forEach(visit); };
    visit(scene.hud); return { width: scene.scale.width, height: scene.scale.height, labels };
  });
  for (const label of data.labels) assert(label.x >= -1 && label.y >= -1 && label.right <= data.width + 1 && label.bottom <= data.height + 1, `HUD text overflows ${JSON.stringify(label)}`);
  return data;
};
const preparePage = async (context, url = appUrl, revision = 'current') => {
  const created = await context.newPage();
  created.on('pageerror', error => errors.push({ revision, error: String(error.stack || error) }));
  created.on('requestfailed', request => requestFailures.push({ revision, url: request.url(), error: request.failure()?.errorText }));
  await created.route('**/*', async route => {
    const request = route.request();
    if (request.resourceType() !== 'script' || new URL(request.url()).origin !== new URL(url).origin) return route.continue();
    const response = await route.fetch(), original = await response.text(), needle = /this\.game\.canvas\.tabIndex\s*=\s*0\b/;
    if (!needle.test(original)) return route.fulfill({ response });
    const instrumented = original.replace(needle, match => `(window.__hintQaScene=this,${match})`);
    scripts.push({ revision, url: request.url(), originalSha256: sha256(original), instrumentedSha256: sha256(instrumented), injection: 'Expose existing DeskScene reference only' });
    await route.fulfill({ response, body: instrumented });
  });
  await created.goto(url, { waitUntil: 'domcontentloaded' });
  await created.locator('[data-game-mode="selection"]').waitFor({ state: 'attached', timeout: 60000 });
  await created.waitForFunction(() => window.__hintQaScene?.alive, undefined, { timeout: 10000 });
  return created;
};
const assertSelection = async () => {
  await mode('selection'); await noAnswer(); assert.equal(await page.title(), '青空パズル');
  assert.equal(await page.locator('[data-action^="scene-"]').count(), 3); assert.equal(await page.locator('[data-action^="open-"]').count(), 1);
  for (let i = 0; i < works.length; i++) assert.equal(await page.locator(`[data-action="scene-${i}"]`).innerText(), `『${works[i].title}』を選ぶ`);
  assert.match(await page.locator('[data-action^="open-"]').innerText(), /4問からランダムに始める/);
};
const openWork = async (index, touch = false) => {
  await physicalAction(`scene-${index}`, touch); await physicalAction(`open-${works[index].id}`, touch); await mode('assembling'); await noAnswer();
  const current = await state(); assert.equal(current.workId, works[index].workId); assert.equal(current.remaining, 3);
  const passage = PASSAGES.find(p => p.id === current.passageId); assert(passage);
  assert.deepEqual((await pieces()).map(p => p.text).sort(), [...passage.fragments].sort()); return passage;
};
const openPassage = async passage => {
  await page.evaluate(async value => { await window.__hintQaScene.openPassage(value); }, passage);
  await mode('assembling'); assert.equal((await state()).passageId, passage.id); await noAnswer(); await assertUnpainted();
};
const escape = async () => { await page.locator('canvas').focus(); await page.keyboard.press('Escape'); await mode('assembling'); };
const solve = async passage => {
  let chain = passage.fragments[0]; for (const text of passage.fragments.slice(1)) { await join(chain, text); chain += text; }
  await mode('assembling'); await noAnswer(); assert.equal((await pieces()).length, 1); assert.equal(await page.locator('[data-action="check"]').count(), 1);
};
// Reproducible arrangement independent of tile IDs and shuffle; no edits to a Session snapshot.
const arrange = async (sourceText, targetText, offscreen = false) => {
  await page.evaluate(({ sourceText, targetText, offscreen }) => {
    const scene = window.__hintQaScene, texts = new Map(scene.session.problem.tiles.map(tile => [tile.id, tile.text]));
    const source = scene.session.state.chains.find(chain => chain.tiles.map(id => texts.get(id)).join('') === sourceText);
    const target = scene.session.state.chains.find(chain => chain.tiles.map(id => texts.get(id)).join('') === targetText);
    if (!source || !target) throw new Error('Fixture chains missing');
    let i = 0;
    for (const chain of [...scene.session.state.chains]) scene.apply({ type: 'move', chain: chain.id, point: { x: 2200 + i++ * 600, y: 1800 } });
    scene.apply({ type: 'move', chain: source.id, point: { x: 28, y: 24 } });
    if (source.id !== target.id) scene.apply({ type: 'move', chain: target.id, point: { x: scene.scale.width < 700 ? 28 : 620, y: offscreen ? 1250 : scene.scale.width < 700 ? 24 + scene.views.get(source.id).paper.height + 24 : 24 } });
    scene.boardCamera.setZoom(1).setScroll(0, 0); scene.syncSelection(); scene.render();
  }, { sourceText, targetText, offscreen });
  await escape(); await page.waitForTimeout(60);
};
const fragmentScreen = text => page.evaluate(({ text, cell }) => {
  const scene = window.__hintQaScene, tile = scene.session.problem.tiles.find(tile => tile.text === text);
  const chain = scene.session.state.chains.find(chain => chain.tiles.includes(tile.id)), paper = scene.views.get(chain.id).paper;
  const range = paper.fragmentRanges[chain.tiles.indexOf(tile.id)], glyphs = paper.layout.glyphs.filter(g => g.index >= range.start && g.index < range.end), c = scene.boardCamera;
  c.preRender();
  const points = glyphs.flatMap(g => [c.matrixCombined.transformPoint(paper.x + g.x, paper.y + g.y), c.matrixCombined.transformPoint(paper.x + g.x + g.advance, paper.y + g.y + cell)]);
  const box = { left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)), top: Math.min(...points.map(p => p.y)), bottom: Math.max(...points.map(p => p.y)) };
  return { ...box, visible: box.left >= 0 && box.right <= scene.scale.width && box.top >= c.y && box.bottom <= c.y + c.height,
    intersects: box.right > 0 && box.left < scene.scale.width && box.bottom > c.y && box.top < c.y + c.height };
}, { text, cell: CELL });
const navigateHint = async (id, text, touch, expectMove) => {
  const before = await state(), beforeBox = await fragmentScreen(text);
  await physicalAction(id, touch); await page.waitForTimeout(60); const after = await state();
  assert.equal(after.camera.zoom, before.camera.zoom, 'Context navigation never changes zoom');
  assert.deepEqual(after.chains, before.chains); assert.equal(after.remaining, before.remaining);
  assert((await fragmentScreen(text)).intersects, 'Explicit context navigation reaches fragment');
  if (!expectMove) assert.deepEqual(after.camera, before.camera, 'Already-visible fragment navigation does not pan');
  else {
    assert.notDeepEqual(after.camera, before.camera, 'Offscreen fragment navigation must move');
    const dx = beforeBox.left < 12 ? beforeBox.left - 12 : Math.max(0, beforeBox.right - before.camera.width + 12);
    const dy = beforeBox.top < before.camera.y + 12 ? beforeBox.top - before.camera.y - 12 : Math.max(0, beforeBox.bottom - before.camera.y - before.camera.height + 12);
    // These fixture fragments fit at zoom 1, so the minimal reveal displacement is exact.
    assert(Math.abs((after.camera.scrollX - before.camera.scrollX) * before.camera.zoom - dx) < .01, 'Navigation pans only the needed horizontal distance');
    assert(Math.abs((after.camera.scrollY - before.camera.scrollY) * before.camera.zoom - dy) < .01, 'Navigation pans only the needed vertical distance');
  }
  return { action: id, before: before.camera, after: after.camera };
};

try {
  browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
  currentContext = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  page = await preparePage(currentContext);
  stage = 'selection and real random opening'; await assertSelection(); await shot('desktop-selection');
  for (let index = 0; index < works.length; index++) {
    const passage = await openWork(index); record(`Real random work opening ${works[index].title}`, { passageId: passage.id });
    await physicalAction('library'); await mode('leave'); await physicalAction('confirm'); await mode('selection');
  }
  stage = 'normal random draws and no-repeat';
  const randomDraws = [];
  for (const work of works) {
    let previous;
    for (let draw = 0; draw < 8; draw++) {
      const observed = await page.evaluate(async workId => {
        const scene = window.__hintQaScene, before = scene.lastPassageByWork.get(workId);
        await scene.openWork(workId);
        return { previousId: before, passageId: scene.session?.problem.id, workId: scene.session?.problem.workId, notice: scene.notice };
      }, work.workId);
      assert.equal(observed.workId, work.workId, `Random opening failed: ${observed.notice}`);
      assert(PASSAGES.some(p => p.workId === work.workId && p.id === observed.passageId), 'Random opening must use a curated question from the selected work');
      assert.notEqual(observed.passageId, observed.previousId, 'Random opening excludes the immediately previous question');
      if (previous) assert.equal(observed.previousId, previous);
      previous = observed.passageId;
      randomDraws.push({ draw, ...observed });
    }
  }
  record('Eight normal-RNG draws per work stay within its four questions and never immediately repeat; no RNG overrides', { randomDraws });

  const detailed = PASSAGES.find(p => p.id === 'cat-palm-v3') || PASSAGES[0], texts = detailed.fragments;
  stage = 'hint budget regression'; await openPassage(detailed); const initial = await state();
  await physicalAction('hint'); await mode('hint-select'); assert.equal((await state()).remaining, 3); await assertUnpainted();
  await physicalAction('hint'); await mode('assembling'); assert.equal((await state()).remaining, 3);
  await hint(texts.at(-1)); await mode('hint-select'); assert.match((await state()).notice, /続きを表示できません/); assert.equal((await state()).remaining, 3); await assertUnpainted(); await escape();
  await join(texts[4], texts[0]); await join(texts[3], texts[1]); await join(texts[3] + texts[1], texts[5]);
  const anchor = texts[4] + texts[0], targetGroup = texts[3] + texts[1] + texts[5];
  await arrange(anchor, targetGroup, true); const beforeWrongGroup = await state();
  const camera = await hint(anchor, false, false); await assertHighlight(texts[0], texts[1], 2, 3); await shot('desktop-wrong-groups-hint');
  assert.deepEqual((await state()).chains, beforeWrongGroup.chains);
  record('Source tail and successor inside separate wrong groups have exact distinct glyph marks; reveal leaves camera unchanged', camera);
  await hint(anchor); await assertHighlight(texts[0], texts[1], 2, 3); assert.match((await state()).notice, /前に見たヒント/);
  await action('undo'); assert.equal((await state()).remaining, 2); await assertUnpainted();
  // Reset fixture history, then exercise budget independently of moves and grouping.
  await openPassage(detailed); await hint(texts[0]); await assertHighlight(texts[0], texts[1], 2);
  await join(texts[6], texts[7]); await assertUnpainted(); await action('undo'); assert.equal((await state()).remaining, 2); await assertUnpainted();
  await hint(texts[0]); await assertHighlight(texts[0], texts[1], 2);
  await hint(texts[2]); await assertHighlight(texts[2], texts[3], 1);
  await hint(texts[4]); await assertHighlight(texts[4], texts[5], 0);
  await hint(texts[6]); await mode('hint-select'); assert.match((await state()).notice, /残り0回/); assert.equal((await state()).remaining, 0); await assertUnpainted();
  const exhausted = (await state()).notice; await physicalPaper(texts[0]); await assertHighlight(texts[0], texts[1], 0);
  await hint(texts.at(-1)); await mode('hint-select'); assert.equal((await state()).notice, exhausted); assert.equal((await state()).remaining, 0); await escape(); await assertUnpainted();
  await solve(detailed); await physicalAction('check'); await mode('complete'); assert.equal((await state()).remaining, 0);
  await action('undo'); await mode('assembling'); assert.equal((await state()).remaining, 0); await noAnswer(); await assertUnpainted();
  record('Three distinct reveals exhaust budget; repeats remain free at zero, final/unavailable and cancellation are free, assembly/completion Undo does not refund or erase reveal history');

  stage = 'same wrong group'; await openPassage(detailed);
  await join(texts[1], texts[3]); await join(texts[1] + texts[3], texts[0]);
  const sameGroup = texts[1] + texts[3] + texts[0]; await arrange(sameGroup, sameGroup);
  await hint(sameGroup, false, false); await assertHighlight(texts[0], texts[1], 2, 3); await shot('desktop-same-wrong-group');
  await physicalAction('hint'); await mode('hint-select'); await assertUnpainted(); await escape(); await assertUnpainted();
  record('Source and successor persist together inside the same wrong group; toggle and Escape clear both marks and chips');

  stage = 'desktop help'; await physicalAction('help'); await mode('help'); await assertHelpFits(); await shot('desktop-help');
  await physicalAction('reading-clues'); await mode('hint'); assert.equal(await page.locator('[data-description]').innerText(), detailed.hints[0]);
  await action('hint-next'); assert.equal(await page.locator('[data-description]').innerText(), detailed.hints[1]);
  await physicalAction('close'); await mode('assembling'); assert.equal((await state()).remaining, 2); await noAnswer();
  record('Semantic clues remain available without consuming exact hints');

  for (const passage of PASSAGES) {
    stage = `${passage.id}: full solve and replay`; await openPassage(passage); assert.equal((await state()).remaining, 3);
    await solve(passage); await physicalAction('check'); await mode('complete');
    assert.equal(await page.locator('[data-original]').textContent(), passage.original); assert.equal(await page.locator('[data-action="source"]').count(), 1);
    await shot(`complete-${passage.id}`); solved.push(passage.id);
    if (passage.id === detailed.id) {
      await action('undo'); await mode('assembling'); await noAnswer(); assert.equal((await pieces()).length, 1);
      await physicalAction('check'); await mode('complete');
    }
    const before = await state(); await physicalAction('again'); await page.waitForFunction(id => !window.__hintQaScene.busy && window.__hintQaScene.session?.problem.id !== id, before.passageId); await mode('assembling'); await noAnswer(); const after = await state();
    assert.equal(after.workId, before.workId); assert.notEqual(after.passageId, before.passageId); assert.equal(after.remaining, 3); await assertUnpainted();
    assert(after.tiles.every(tile => !before.tiles.some(old => old.id === tile.id)));
    record(`${passage.id}: solve, explicit check, original/source, real replay`, { nextPassageId: after.passageId });
  }
  assert.deepEqual([...new Set(solved)].sort(), PASSAGES.map(p => p.id).sort());
  record('All twelve curated questions solved through shared accessible Session controls');
  await currentContext.close();

  // Baseline/current use the same curated passage, positions, camera, click, and viewport.
  // The only test-specific application change is exposing the existing Scene reference.
  for (const mobile of [false, true]) {
    const viewport = mobile ? { width: 320, height: 568 } : { width: 1280, height: 800 };
    const size = mobile ? 'mobile-320' : 'desktop';
    for (const revision of baselineUrl ? ['baseline', 'current'] : ['current']) {
      stage = `${revision} ${size}: reproducible before/after comparison`;
      currentContext = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile });
      page = await preparePage(currentContext, revision === 'baseline' ? baselineUrl : appUrl, revision);
      if (revision === 'current') await assertSelection();
      // Baseline accepts this unchanged original passage from 95155fa.
      await page.evaluate(async passage => { await window.__hintQaScene.openPassage(passage); }, detailed); await mode('assembling');
      await arrange(texts[0], texts[1], true); assert((await fragmentScreen(texts[0])).visible); assert(!(await fragmentScreen(texts[1])).intersects);
      await physicalAction('hint', mobile); await mode('hint-select');
      const clickPoint = await paperPoint(texts[0], false), before = await state(); const beforeImage = await shot(`${revision}-${size}-before-reveal`);
      await physical(clickPoint, mobile); await mode('assembling'); await page.waitForTimeout(60);
      const after = await state(), afterImage = await shot(`${revision}-${size}-after-reveal`);
      comparisons.push({ revision, viewport, passageId: detailed.id, fixture: 'source=(28,24); target=(28 or 620,1250); others=(2200+600*n,1800); camera=zoom1,scroll0', clickPoint,
        before: before.camera, after: after.camera, beforeImage, afterImage, sourceAfter: await fragmentScreen(texts[0]), targetAfter: await fragmentScreen(texts[1]) });
      if (revision === 'baseline') { assert.notDeepEqual(after.camera, before.camera, 'Baseline must reproduce old automatic camera slide'); await currentContext.close(); continue; }
      assert.deepEqual(after.camera, before.camera); assert.deepEqual(after.chains, before.chains); assert((await fragmentScreen(texts[0])).visible);
      await assertHighlight(texts[0], texts[1], 2); await assertHelpFits();
      const navigation = [await navigateHint('hint-source', texts[0], mobile, false), await navigateHint('hint-target', texts[1], mobile, true)];
      await assertHighlight(texts[0], texts[1], 2); await shot(`${size}-explicit-target-navigation`);
      navigation.push(await navigateHint('hint-target', texts[1], mobile, false));
      navigation.push(await navigateHint('hint-source', texts[0], mobile, true));
      await assertHighlight(texts[0], texts[1], 2); await shot(`${size}-explicit-source-navigation`);
      record(`${size}: offscreen reveal keeps source visible; explicit source/target navigation preserves zoom, budget and marks`, { reveal: { before: before.camera, after: after.camera }, navigation });
      await arrange(texts[0], texts[1], false); assert((await fragmentScreen(texts[0])).visible); assert((await fragmentScreen(texts[1])).visible);
      const bothCamera = await hint(texts[0], mobile, false); await assertHighlight(texts[0], texts[1], 2);
      await navigateHint('hint-target', texts[1], mobile, false); await navigateHint('hint-source', texts[0], mobile, false);
      await shot(`${size}-both-visible-hint`); record(`${size}: both-visible reveal and chip taps leave camera unchanged`, bothCamera);

      if (mobile) {
        stage = '320px real-touch pan/pinch and rotation'; const stable = await state();
        const cdp = await currentContext.newCDPSession(page);
        // x=8 is clear desk margin at the fixture's starting camera.
        const touch = (id, x, y) => ({ id, x, y, radiusX: 2, radiusY: 2, force: 1 });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(0, 8, 180)] });
        for (let step = 1; step <= 5; step++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch(0, 8, 180 + step * 12)] }); await page.waitForTimeout(20); }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(60);
        const panned = await state(); assert.notEqual(panned.camera.scrollY, stable.camera.scrollY); assert.deepEqual(panned.chains, stable.chains);
        await assertHighlight(texts[0], texts[1], 2);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(0, 90, 230)] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(0, 90, 230), touch(1, 220, 230)] });
        for (let step = 1; step <= 5; step++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch(0, 90 - step * 4, 230), touch(1, 220 + step * 4, 230)] }); await page.waitForTimeout(20); }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(60);
        const pinched = await state(); assert(pinched.camera.zoom > panned.camera.zoom); assert.deepEqual(pinched.chains, stable.chains); await assertHighlight(texts[0], texts[1], 2);
        await shot('mobile-320-pan-pinch'); await cdp.detach();
        await page.setViewportSize({ width: 568, height: 320 }); await page.waitForTimeout(250);
        assert.equal((await state()).passageId, detailed.id); assert.deepEqual((await state()).chains, stable.chains); await assertHighlight(texts[0], texts[1], 2); await assertHelpFits(); await shot('mobile-landscape-hint');
        await page.setViewportSize(viewport); await page.waitForTimeout(250); await assertHighlight(texts[0], texts[1], 2); await assertHelpFits();
        await page.locator('canvas').focus(); const beforeKey = await state(); await page.keyboard.press('-'); await page.waitForTimeout(60); assert((await state()).camera.zoom < beforeKey.camera.zoom); await assertHighlight(texts[0], texts[1], 2);
        record('320px touch pan and two-finger pinch plus portrait/landscape rotation and keyboard zoom preserve source/target context', { before: stable.camera, panned: panned.camera, pinched: pinched.camera, rotatedBack: (await state()).camera });
        stage = '320px oversized wrapped successor at readable high zoom';
        await openPassage(detailed);
        await join(texts[3], texts[1]); await join(texts[3] + texts[1], texts[5]);
        await arrange(texts[0], targetGroup, true);
        await page.evaluate(() => window.__hintQaScene.boardCamera.setZoom(1.7));
        await hint(texts[0], true); await assertHighlight(texts[0], texts[1], 2, 3);
        await physicalAction('hint-target', true); await page.waitForTimeout(60);
        const firstGlyph = await page.evaluate(({ text, cell }) => {
          const scene = window.__hintQaScene, tile = scene.session.problem.tiles.find(tile => tile.text === text);
          const chain = scene.session.state.chains.find(chain => chain.tiles.includes(tile.id)), paper = scene.views.get(chain.id).paper;
          const range = paper.fragmentRanges[chain.tiles.indexOf(tile.id)], glyph = paper.layout.glyphs.find(g => g.index >= range.start && g.index < range.end);
          const camera = scene.boardCamera; camera.preRender();
          const a = camera.matrixCombined.transformPoint(paper.x + glyph.x, paper.y + glyph.y), b = camera.matrixCombined.transformPoint(paper.x + glyph.x + glyph.advance, paper.y + glyph.y + cell);
          return { left: a.x, top: a.y, right: b.x, bottom: b.y, viewportTop: camera.y, viewportBottom: camera.y + camera.height, viewportWidth: camera.width, zoom: camera.zoom };
        }, { text: texts[1], cell: CELL });
        assert.equal(firstGlyph.zoom, 1.7);
        assert(firstGlyph.left >= 11.9 && firstGlyph.right <= firstGlyph.viewportWidth - 11.9 && firstGlyph.top >= firstGlyph.viewportTop + 11.9 && firstGlyph.bottom <= firstGlyph.viewportBottom - 11.9, 'Oversized wrapped fragment navigation must expose its actual first glyph');
        await assertHighlight(texts[0], texts[1], 2, 3); await shot('mobile-320-high-zoom-wrapped-target');
        record('320px high-zoom navigation exposes the actual first glyph of a wrapped successor inside a wrong group without zooming out', firstGlyph);
        await openPassage(detailed); await hint(texts[0], true); await assertHighlight(texts[0], texts[1], 2);
        await escape(); await assertUnpainted();
        await physicalAction('help', true); await mode('help'); await assertHelpFits(); await shot('mobile-320-help');
        await physicalAction('reading-clues', true); await mode('hint'); assert.equal(await page.locator('[data-description]').innerText(), detailed.hints[0]);
        await physicalAction('close', true); await mode('assembling'); assert.equal((await state()).remaining, 2);
        const wrongOrder = [texts[1], texts[0], ...texts.slice(2)]; let full = wrongOrder[0];
        for (const text of wrongOrder.slice(1)) { await join(full, text); full += text; }
        await assertUnpainted(); await assertDistinctActions(['undo', 'check', 'hint']); const beforeCheck = await state();
        await physicalAction('check', true); await mode('assembling'); assert.match((await state()).notice, /原文とは/); assert.deepEqual((await state()).chains, beforeCheck.chains); assert.equal((await state()).remaining, 2); await noAnswer();
        await physicalAction('settings', true); await mode('settings'); await physicalAction('help', true); await mode('help'); await assertHelpFits();
        await physicalAction('close', true); await mode('assembling');
        for (let i = 1; i < texts.length; i++) await action('undo');
        assert.equal((await pieces()).length, initial.tiles.length); assert.equal((await state()).remaining, 2);
        await solve(detailed); await physicalAction('check', true); await mode('complete'); assert.equal(await page.locator('[data-original]').textContent(), detailed.original); await shot('mobile-320-complete');
        await physicalAction('again', true); await page.waitForFunction(id => !window.__hintQaScene.busy && window.__hintQaScene.session?.problem.id !== id, detailed.id); await mode('assembling'); assert.notEqual((await state()).passageId, detailed.id); assert.equal((await state()).remaining, 3); await assertUnpainted();
        record('320px touch completion/replay resets hints; wrong check preserves arrangement; full-chain controls and settings-help remain usable');
      } else {
        const beforeWheel = await state(); await page.mouse.move(1100, 250); await page.mouse.wheel(0, -180); await page.waitForTimeout(100);
        assert((await state()).camera.zoom > beforeWheel.camera.zoom); await assertHighlight(texts[0], texts[1], 2);
        await escape(); await assertUnpainted(); record('Desktop wheel zoom preserves highlights; Escape removes both highlights and context chips');
      }
      await currentContext.close();
    }
  }
  assert.deepEqual(errors, [], 'No uncaught browser errors');
  assert(scripts.some(script => script.revision === 'current'), 'Current build was inspected');
  if (baselineUrl) assert.equal(comparisons.filter(item => item.revision === 'baseline').length, 2);
  fs.writeFileSync(path.join(evidenceDir, 'results.json'), JSON.stringify(report('passed'), null, 2)); console.log(`Evidence: ${evidenceDir}`);
} catch (error) {
  if (page && !page.isClosed()) {
    await page.screenshot({ path: path.join(evidenceDir, 'failure.png') }).catch(() => {});
    fs.writeFileSync(path.join(evidenceDir, 'failure-body.txt'), await page.locator('body').innerText().catch(() => 'unavailable'));
  }
  fs.writeFileSync(path.join(evidenceDir, 'results.json'), JSON.stringify(report('failed', error), null, 2)); throw error;
} finally { await browser?.close(); }

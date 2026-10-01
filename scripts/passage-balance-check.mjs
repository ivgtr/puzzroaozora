// TEMPORARY QA only: remove this script and its workflow after evidence is collected.
// Run only on an allowed browser executor, against a production build of this checkout.
// PLAYWRIGHT_MODULE=/tmp/browser/node_modules/playwright/index.mjs \
// APP_URL=http://127.0.0.1:5678 EVIDENCE_DIR=/tmp/evidence \
// node --experimental-strip-types scripts/passage-balance-check.mjs
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
const evidenceDir = process.env.EVIDENCE_DIR || '/tmp/evidence';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/tmp/browser/node_modules/playwright/index.mjs');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).trim();
const appFiles = Object.fromEntries(git('ls-files', 'src', 'public', 'package.json', 'package-lock.json', 'next.config.ts').split('\n').filter(name => name && fs.existsSync(path.join(root, name))).map(name => [name, sha256(fs.readFileSync(path.join(root, name)))]));
const works = PASSAGES.filter((passage, index) => PASSAGES.findIndex(other => other.workId === passage.workId) === index);
const expectedCounts = { '000789': 4, '000424': 7, '000456': 4 };
const newIds = ['lemon-opening-v3', 'lemon-street-v3', 'lemon-glass-v3'];
const added = newIds.map(id => PASSAGES.find(passage => passage.id === id));
const startedAt = new Date().toISOString();
const checks = [], solved = [], screenshots = [], scripts = [], errors = [], requestFailures = [], sourceRequests = [];
let browser, context, page, stage = 'launch';
fs.mkdirSync(evidenceDir, { recursive: true });
const report = (status, failure) => ({
  status, startedAt, finishedAt: new Date().toISOString(), appUrl,
  head: git('rev-parse', 'HEAD'), gitStatus: git('status', '--short'), appFiles,
  browserVersion: browser?.version(), expectedCounts, catalogIds: PASSAGES.map(p => p.id),
  viewports: ['1280x800 DPR2 mouse', '320x568 DPR2 emulated touch'],
  methods: 'Production build, real canvas clicks/taps for selection, hints, explicit checks, source and replay. All catalog passages assembled through existing shared accessible Session buttons. Only app-response instrumentation exposes the existing DeskScene reference; deterministic coverage opens existing passages through openPassage. Native Math.random, renderer, camera and paper positions are never overridden. Accessible focus centers an existing paper before the before/after hint snapshot. Six native-RNG draws per work check membership and immediate-repeat exclusion. Source clicks are verified at their outgoing URL and aborted before loading the external website.',
  limitations: 'Automated Chromium and touch emulation only; no physical-device, listening, subjective difficulty or independent source/editorial claims. RNG samples do not prove distribution. Completion is one scrollable manuscript, not pagination; rendered glyph coverage and actual panning to the final glyph are checked for the three new excerpts. Source website availability is not tested. No baseline build is used for this content-only change.',
  scripts, checks, solved, sourceRequests, screenshots, errors, requestFailures,
  ...(failure ? { stage, failure: String(failure.stack || failure) } : {}),
});
const record = (name, details = {}) => { checks.push({ name, ...details }); console.log(`PASS ${name}`); };
const mode = value => page.locator(`[data-game-mode="${value}"]`).waitFor({ state: 'attached', timeout: 30000 });
const action = async id => { const node = page.locator(`[data-action="${id}"]`); await node.waitFor({ state: 'attached' }); await node.evaluate(element => element.click()); };
const pieces = () => page.locator('[data-piece]').evaluateAll(nodes => nodes.map(node => ({ id: node.dataset.piece, text: node.textContent })));
const state = () => page.evaluate(() => {
  const scene = window.__balanceQaScene, session = scene.session, c = scene.boardCamera;
  return { passageId: session?.problem.id, workId: session?.problem.workId, phase: session?.state.phase,
    remaining: session?.hintsRemaining, hintSelecting: scene.hintSelecting, notice: scene.notice,
    hintAnchor: scene.hintAnchor ?? null, hintTarget: scene.hintTarget ?? null, description: scene.hintDescription,
    tiles: session?.problem.tiles.map(tile => ({ ...tile })),
    chains: session?.state.chains.map(chain => ({ ...chain, tiles: [...chain.tiles], bonds: [...chain.bonds] })),
    papers: [...scene.views].map(([id, { paper }]) => ({ id, x: paper.x, y: paper.y })),
    camera: { scrollX: c.scrollX, scrollY: c.scrollY, zoom: c.zoom, x: c.x, y: c.y, width: c.width, height: c.height },
  };
});
const noAnswer = async () => {
  assert.equal(await page.locator('[data-original]').count(), 0, 'No original before completion');
  assert.equal(await page.locator('[data-action="source"]').count(), 0, 'No source before completion');
  assert.equal(await page.locator('[data-action="review"]').count(), 0, 'No answer-review shortcut');
};
const shot = async name => {
  await page.waitForTimeout(200);
  const file = `${name}.png`; await page.screenshot({ path: path.join(evidenceDir, file) });
  screenshots.push({ file, sha256: sha256(fs.readFileSync(path.join(evidenceDir, file))), passageId: (await state()).passageId, camera: (await state()).camera });
};
const physical = (point, touch = false) => touch ? page.touchscreen.tap(point.x, point.y) : page.mouse.click(point.x, point.y);
const physicalAction = async (id, touch = false) => {
  await page.locator(`[data-action="${id}"]`).waitFor({ state: 'attached' });
  const point = await page.evaluate(id => {
    const scene = window.__balanceQaScene, b = scene.actions.get(id)?.bounds;
    if (!b) throw new Error(`Missing canvas action ${id}`);
    const canvas = scene.game.canvas.getBoundingClientRect();
    return { x: canvas.left + (b.x + b.width / 2) * canvas.width / scene.scale.width, y: canvas.top + (b.y + b.height / 2) * canvas.height / scene.scale.height };
  }, id);
  await physical(point, touch);
};
const pieceByText = async text => { const found = (await pieces()).find(piece => piece.text === text); assert(found, `Missing piece ${text}`); return found; };
const join = async (left, right) => {
  const target = await pieceByText(left), source = await pieceByText(right);
  await page.locator(`[data-piece="${source.id}"]`).evaluate(node => node.click());
  await action(`join:after:${target.id}`);
  await page.waitForFunction(text => [...document.querySelectorAll('[data-piece]')].some(node => node.textContent === text), left + right);
};
const paperPoint = async text => {
  const piece = await pieceByText(text);
  await page.locator(`[data-piece="${piece.id}"]`).evaluate(node => node.focus({ preventScroll: true }));
  await page.waitForTimeout(40);
  return page.evaluate(({ id, cell }) => {
    const scene = window.__balanceQaScene, paper = scene.views.get(id)?.paper, camera = scene.boardCamera;
    if (!paper) throw new Error(`Missing paper ${id}`);
    camera.preRender(); const canvas = scene.game.canvas.getBoundingClientRect();
    for (const glyph of paper.layout.glyphs) {
      const world = { x: paper.x + glyph.x + glyph.advance / 2, y: paper.y + glyph.y + cell / 2 };
      const screen = camera.matrixCombined.transformPoint(world.x, world.y);
      if (screen.x < 8 || screen.x > scene.scale.width - 8 || screen.y < camera.y + 8 || screen.y > camera.y + camera.height - 8 || scene.hitPaper(world)?.id !== id) continue;
      return { x: canvas.left + screen.x * canvas.width / scene.scale.width, y: canvas.top + screen.y * canvas.height / scene.scale.height };
    }
    throw new Error(`No visible unoccluded glyph in ${id}`);
  }, { id: piece.id, cell: CELL });
};
const hint = async (text, touch = false) => {
  if (!(await state()).hintSelecting) await physicalAction('hint', touch);
  await mode('hint-select'); const point = await paperPoint(text), before = await state();
  await physical(point, touch); await page.waitForTimeout(70); const after = await state();
  assert.deepEqual(after.camera, before.camera, 'Hint does not pan or zoom');
  assert.deepEqual(after.chains, before.chains, 'Hint does not join, split or move Session chains');
  assert.deepEqual(after.papers, before.papers, 'Hint does not move rendered papers');
  await noAnswer(); return { point, before: before.camera, after: after.camera };
};
const unpainted = async () => {
  const current = await state(); assert.equal(current.hintAnchor, null); assert.equal(current.hintTarget, null);
  assert.equal(await page.locator('[data-action="hint-source"]').count(), 0);
  assert.equal(await page.locator('[data-action="hint-target"]').count(), 0);
  assert(await page.evaluate(() => [...window.__balanceQaScene.views.values()].every(({ paper }) => paper.hintInk.commandBuffer.length === 0)), 'No stale hint paint');
};
const highlight = async (sourceText, targetText, remaining) => {
  await mode('assembling'); const current = await state();
  assert.equal(current.remaining, remaining); assert.equal(current.hintSelecting, false);
  const source = current.tiles.find(tile => tile.text === sourceText), target = current.tiles.find(tile => tile.text === targetText);
  assert(source && target); assert.equal(current.hintAnchor, source.id); assert.equal(current.hintTarget, target.id);
  assert.equal(current.description, `「${sourceText}」の続きは「${targetText}」です。`);
  assert.equal(await page.locator('[data-action="hint-source"]').innerText(), `選んだ紙片を見る：「${sourceText}」`);
  assert.equal(await page.locator('[data-action="hint-target"]').innerText(), `続きを見る：「${targetText}」`);
  const papers = await page.evaluate(() => [...window.__balanceQaScene.views].map(([id, { paper }]) => ({ id, commands: [...paper.hintInk.commandBuffer], glyphs: paper.layout.glyphs.map(glyph => ({ ...glyph })), ranges: paper.fragmentRanges.map(range => ({ ...range })) })));
  for (const paper of papers) {
    const chain = current.chains.find(chain => chain.id === paper.id), expected = [], actual = []; let color, alpha;
    for (const [tile, fill, opacity, underline] of [[source, 0xb3c8b4, .52, true], [target, 0xe3c66f, .58, false]]) {
      const range = paper.ranges[chain.tiles.indexOf(tile.id)];
      const glyphs = range ? paper.glyphs.filter(glyph => glyph.index >= range.start && glyph.index < range.end) : [];
      expected.push(...glyphs.map(glyph => ({ x: glyph.x, y: glyph.y, w: glyph.advance, h: CELL, color: fill, alpha: opacity })));
      if (underline) expected.push(...glyphs.map(glyph => ({ x: glyph.x, y: glyph.y + CELL - 2, w: glyph.advance, h: 2, color: 0x4f7661, alpha: .9 })));
    }
    for (let i = 0; i < paper.commands.length;) {
      const command = paper.commands[i++];
      if (command === 7) { color = paper.commands[i++]; alpha = paper.commands[i++]; }
      else if (command === 6) i += 3;
      else if (command === 3) { const [x, y, w, h] = paper.commands.slice(i, i + 4); i += 4; actual.push({ x, y, w, h, color, alpha }); }
      else assert.fail(`Unexpected hint graphics command ${command}`);
    }
    assert.deepEqual(actual, expected, 'Source underline and target fill mark only their exact fragment glyphs');
  }
  await noAnswer();
};
const hudFits = async () => {
  const data = await page.evaluate(() => {
    const scene = window.__balanceQaScene, labels = [];
    const visit = node => { if (node.type === 'Text') { const b = node.getBounds(); labels.push({ text: node.text, x: b.x, y: b.y, right: b.right, bottom: b.bottom }); } if (node.list) node.list.forEach(visit); };
    visit(scene.hud); return { width: scene.scale.width, height: scene.scale.height, labels };
  });
  for (const label of data.labels) assert(label.x >= -1 && label.y >= -1 && label.right <= data.width + 1 && label.bottom <= data.height + 1, `HUD text overflows ${JSON.stringify(label)}`);
};
const preparePage = async touch => {
  context = await browser.newContext({ viewport: touch ? { width: 320, height: 568 } : { width: 1280, height: 800 }, deviceScaleFactor: 2, isMobile: touch, hasTouch: touch });
  // Verify the real destination without depending on Aozora uptime or rendering it.
  await context.route('https://www.aozora.gr.jp/**', route => route.abort('blockedbyclient'));
  const created = await context.newPage();
  created.on('pageerror', error => errors.push(String(error.stack || error)));
  created.on('requestfailed', request => requestFailures.push({ url: request.url(), error: request.failure()?.errorText }));
  await created.route('**/*', async route => {
    const request = route.request();
    if (request.resourceType() !== 'script' || new URL(request.url()).origin !== new URL(appUrl).origin) return route.continue();
    const response = await route.fetch(), original = await response.text(), needle = /this\.game\.canvas\.tabIndex\s*=\s*0\b/;
    if (!needle.test(original)) return route.fulfill({ response });
    const instrumented = original.replace(needle, match => `(window.__balanceQaScene=this,${match})`);
    scripts.push({ url: request.url(), originalSha256: sha256(original), instrumentedSha256: sha256(instrumented), injection: 'Existing DeskScene reference only' });
    await route.fulfill({ response, body: instrumented });
  });
  await created.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await created.locator('[data-game-mode="selection"]').waitFor({ state: 'attached', timeout: 60000 });
  await created.waitForFunction(() => window.__balanceQaScene?.alive, undefined, { timeout: 10000 });
  return created;
};
const selection = async touch => {
  await mode('selection'); await noAnswer(); assert.equal(await page.title(), '青空パズル');
  assert.equal(await page.locator('[data-action^="scene-"]').count(), works.length);
  for (let i = 0; i < works.length; i++) {
    const work = works[i], count = PASSAGES.filter(p => p.workId === work.workId).length;
    assert.equal(await page.locator(`[data-action="scene-${i}"]`).innerText(), `『${work.title}』を選ぶ`);
    await physicalAction(`scene-${i}`, touch);
    assert.equal(await page.locator('[data-action^="open-"]').innerText(), `『${work.title}』の${count}問からランダムに始める`);
    await hudFits();
    if (work.title === '檸檬') await shot(`${touch ? 'mobile-320' : 'desktop'}-selection-lemon-seven`);
    await physicalAction(`open-${work.id}`, touch); await mode('assembling'); await noAnswer();
    const current = await state(); assert.equal(current.workId, work.workId); assert.equal(current.remaining, 3);
    assert(PASSAGES.some(p => p.id === current.passageId && p.workId === work.workId));
    await physicalAction('library', touch); await mode('leave'); await physicalAction('confirm', touch); await mode('selection');
  }
  record(`${touch ? 'Mobile' : 'Desktop'} selection uses the exact title and current per-work counts`);
};
const openPassage = async passage => {
  await page.evaluate(async value => { await window.__balanceQaScene.openPassage(value); }, passage);
  await mode('assembling'); const current = await state(); assert.equal(current.passageId, passage.id); assert.equal(current.remaining, 3);
  assert.deepEqual((await pieces()).map(piece => piece.text).sort(), [...passage.fragments].sort()); await noAnswer(); await unpainted();
};
const solve = async passage => {
  let chain = passage.fragments[0];
  for (const text of passage.fragments.slice(1)) { await join(chain, text); chain += text; await noAnswer(); }
  await mode('assembling'); assert.equal((await pieces()).length, 1); await noAnswer();
  assert.equal(await page.locator('[data-action="check"]').count(), 1, 'Completion still requires an explicit check');
};
const complete = async (passage, touch = false) => {
  await solve(passage); await physicalAction('check', touch); await mode('complete');
  assert.equal(await page.locator('[data-original]').textContent(), passage.original, 'Exact original, including paragraph breaks and indentation');
  assert.equal(await page.locator('[data-action="source"]').count(), 1);
  const request = context.waitForEvent('request', { predicate: request => request.isNavigationRequest() && request.url() === passage.sourceUrl, timeout: 10000 });
  await physicalAction('source', touch); const outgoing = await request;
  sourceRequests.push({ passageId: passage.id, url: outgoing.url(), expectedUrl: passage.sourceUrl, externalNavigation: 'intentionally aborted' });
  for (const popup of context.pages()) if (popup !== page) await popup.close();
};
const replay = async (passage, touch = false) => {
  const before = await state(); await physicalAction('again', touch);
  await page.waitForFunction(id => !window.__balanceQaScene.busy && window.__balanceQaScene.session?.problem.id !== id, passage.id);
  await mode('assembling'); const after = await state();
  assert.equal(after.workId, passage.workId); assert.notEqual(after.passageId, passage.id); assert.equal(after.remaining, 3);
  assert(PASSAGES.some(p => p.id === after.passageId && p.workId === passage.workId));
  assert(after.tiles.every(tile => !before.tiles.some(old => old.id === tile.id))); await noAnswer(); await unpainted(); return after.passageId;
};
const clues = async (passage, touch) => {
  const before = await state(); await physicalAction('help', touch); await mode('help'); await hudFits();
  await physicalAction('reading-clues', touch); await mode('hint');
  for (let index = 0; index < passage.hints.length; index++) {
    assert.equal(await page.locator('[data-description]').innerText(), passage.hints[index]); await noAnswer(); await hudFits();
    if (index + 1 < passage.hints.length) await physicalAction('hint-next', touch);
  }
  await physicalAction('hint-prev', touch); assert.equal(await page.locator('[data-description]').innerText(), passage.hints.at(-2));
  await physicalAction('close', touch); await mode('assembling'); assert.equal((await state()).remaining, before.remaining);
};
const manuscript = async (passage, touch, prefix) => {
  const rendered = await page.evaluate(() => {
    const scene = window.__balanceQaScene, paper = scene.manuscript;
    return { glyphs: paper.layout.glyphs.map(glyph => glyph.text).join(''), rows: paper.layout.rows, width: paper.width, height: paper.height, columns: paper.layout.columns };
  });
  assert.equal(rendered.glyphs, passage.original.replace(/\r\n?/g, '\n').replaceAll('\n', ''), 'Rendered manuscript contains every original glyph in order');
  await hudFits(); await shot(`${prefix}-complete-top`);
  const finalGlyph = () => page.evaluate(cell => {
    const scene = window.__balanceQaScene, paper = scene.manuscript, glyph = paper.layout.glyphs.at(-1), c = scene.boardCamera;
    c.preRender(); const p = c.matrixCombined.transformPoint(paper.x + glyph.x + glyph.advance / 2, paper.y + glyph.y + cell / 2);
    return { x: p.x, y: p.y, visible: p.x >= 0 && p.x <= scene.scale.width && p.y >= c.y && p.y < c.y + c.height, camera: { x: c.x, y: c.y, width: c.width, height: c.height }, zoom: c.zoom };
  }, CELL);
  const before = await state(); let last = await finalGlyph(), pans = 0;
  const maximumPans = Math.ceil(rendered.height * last.zoom / Math.max(1, last.camera.height - 80)) + 2;
  const cdp = touch ? await context.newCDPSession(page) : null;
  while (!last.visible && pans < maximumPans) {
    const x = last.camera.width / 2, from = last.camera.y + last.camera.height - 25;
    const delta = Math.min(last.camera.height - 80, Math.max(20, last.y - last.camera.y - last.camera.height / 2));
    if (touch) {
      const point = y => ({ id: 0, x, y, radiusX: 2, radiusY: 2, force: 1 });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(from)] });
      for (let i = 1; i <= 6; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(from - delta * i / 6)] }); await page.waitForTimeout(20); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else { await page.mouse.move(x, from); await page.mouse.down(); await page.mouse.move(x, from - delta, { steps: 8 }); await page.mouse.up(); }
    await page.waitForTimeout(50); last = await finalGlyph(); pans++;
  }
  await cdp?.detach(); assert(last.visible, 'The final manuscript glyph can be reached through ordinary canvas panning');
  assert.deepEqual((await state()).chains, before.chains); assert.equal((await state()).camera.zoom, before.camera.zoom);
  assert.equal(await page.locator('[data-original]').textContent(), passage.original); await hudFits();
  if (pans) await shot(`${prefix}-complete-end`);
  record(`${prefix}: exact completion manuscript and reachable final glyph`, { ...rendered, glyphs: undefined, pans, finalGlyph: last });
};

try {
  assert.equal(PASSAGES.length, 15); assert.equal(works.length, 3); assert(added.every(Boolean), 'All three new excerpts exist');
  for (const work of works) assert.equal(PASSAGES.filter(p => p.workId === work.workId).length, expectedCounts[work.workId]);
  browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
  page = await preparePage(false); stage = 'desktop selection'; await selection(false);
  stage = 'six native-RNG draws per work'; const draws = [];
  for (const work of works) for (let draw = 0; draw < 6; draw++) {
    const observed = await page.evaluate(async workId => {
      const scene = window.__balanceQaScene, previousId = scene.lastPassageByWork.get(workId); await scene.openWork(workId);
      return { previousId, passageId: scene.session?.problem.id, workId: scene.session?.problem.workId };
    }, work.workId);
    assert.equal(observed.workId, work.workId); assert.notEqual(observed.passageId, observed.previousId);
    assert(PASSAGES.some(p => p.id === observed.passageId && p.workId === work.workId)); draws.push({ draw, ...observed });
  }
  record('Six native-RNG openings per work preserve membership and exclude immediate repeats', { draws });
  for (const passage of PASSAGES) {
    stage = `${passage.id}: complete and replay`; await openPassage(passage); await complete(passage);
    solved.push(passage.id); const nextPassageId = await replay(passage);
    record(`${passage.id}: accessible assembly, explicit check, exact original, source action and fresh replay`, { nextPassageId });
  }
  assert.deepEqual([...new Set(solved)].sort(), PASSAGES.map(p => p.id).sort());
  for (const touch of [false, true]) {
    if (touch) { await context.close(); page = await preparePage(true); stage = 'mobile selection'; await selection(true); }
    for (const passage of added) {
      const prefix = `${touch ? 'mobile-320' : 'desktop'}-${passage.id}`, texts = passage.fragments;
      stage = `${prefix}: hints and semantic clues`; await openPassage(passage); await shot(`${prefix}-desk`); await hudFits();
      const reveal = await hint(texts[0], touch); await highlight(texts[0], texts[1], 2); await hudFits(); await shot(`${prefix}-hint`);
      await hint(texts[0], touch); await highlight(texts[0], texts[1], 2); assert.match((await state()).notice, /前に見たヒント/);
      await clues(passage, touch);
      if (passage.id === newIds[0]) {
        await join(texts.at(-2), texts.at(-1)); await unpainted(); await action('undo'); await unpainted(); assert.equal((await state()).remaining, 2);
        await hint(texts[0], touch); await highlight(texts[0], texts[1], 2);
        await hint(texts[2], touch); await highlight(texts[2], texts[3], 1);
        await hint(texts[4], touch); await highlight(texts[4], texts[5], 0);
        await hint(texts[6], touch); await mode('hint-select'); assert.match((await state()).notice, /残り0回/); await unpainted();
        await hint(texts[0], touch); await highlight(texts[0], texts[1], 0);
        await physicalAction('hint', touch); await mode('hint-select'); await physicalAction('hint', touch); await mode('assembling'); await unpainted(); assert.equal((await state()).remaining, 0);
        record(`${prefix}: three-use budget, free repeat at zero, cancellation, Undo history preserved`);
      }
      record(`${prefix}: real hint input leaves camera and paper positions unchanged; exact fragment marks and all semantic clues`, reveal);
      stage = `${prefix}: long completion`; await complete(passage, touch); await manuscript(passage, touch, prefix);
      if (passage.id === newIds[0]) {
        const remaining = (await state()).remaining; await action('undo'); await mode('assembling'); await noAnswer(); assert.equal((await state()).remaining, remaining); await unpainted();
        await physicalAction('check', touch); await mode('complete'); assert.equal(await page.locator('[data-original]').textContent(), passage.original);
      }
      const nextPassageId = await replay(passage, touch); record(`${prefix}: replay resets three hints and all marks`, { nextPassageId });
    }
  }
  assert.deepEqual(errors, [], 'No uncaught browser errors'); assert.deepEqual(requestFailures, [], 'No failed app requests');
  assert(scripts.length >= 2, 'Both viewports ran the inspected application build');
  fs.writeFileSync(path.join(evidenceDir, 'results.json'), JSON.stringify(report('passed'), null, 2)); console.log(`Evidence: ${evidenceDir}`);
} catch (error) {
  if (page && !page.isClosed()) {
    await page.screenshot({ path: path.join(evidenceDir, 'failure.png') }).catch(() => {});
    fs.writeFileSync(path.join(evidenceDir, 'failure-body.txt'), await page.locator('body').innerText().catch(() => 'unavailable'));
  }
  fs.writeFileSync(path.join(evidenceDir, 'results.json'), JSON.stringify(report('failed', error), null, 2)); throw error;
} finally { await browser?.close(); }

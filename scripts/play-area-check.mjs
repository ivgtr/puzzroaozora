// TEMPORARY browser evidence. Run only on an authorized browser executor, then remove.
// APP_URL=http://127.0.0.1:5678 BASELINE_URL=http://127.0.0.1:5679 BASELINE_REF=<content-head>
// PLAYWRIGHT_MODULE=/tmp/browser/node_modules/playwright/index.mjs EVIDENCE_DIR=/tmp/evidence
// node --experimental-strip-types scripts/play-area-check.mjs
// Instrumentation exposes the existing DeskScene only; no game state/UI replacement.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root = process.env.REPO_ROOT || process.cwd();
const { PASSAGES } = await import(pathToFileURL(path.join(root, 'src/data/passages.ts')));
const { CELL } = await import(pathToFileURL(path.join(root, 'src/game/layout.ts')));
const appUrl = process.env.APP_URL || 'http://127.0.0.1:5678';
const baselineUrl = process.env.BASELINE_URL;
const baselineRef = process.env.BASELINE_REF;
const evidenceDir = process.env.EVIDENCE_DIR || '/tmp/evidence';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/tmp/browser/node_modules/playwright/index.mjs');
fs.mkdirSync(evidenceDir, { recursive: true });
const sha256 = value => createHash('sha256').update(value).digest('hex');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim();
const fileHashes = ref => Object.fromEntries((ref ? git('ls-tree', '-r', '--name-only', ref, 'src', 'public', 'package.json', 'package-lock.json') : git('ls-files', 'src', 'public', 'package.json', 'package-lock.json')).split('\n').filter(Boolean).map(name => [name, sha256(ref ? execFileSync('git', ['show', `${ref}:${name}`], { cwd: root }) : fs.readFileSync(path.join(root, name)))]));
const beforeHashes = baselineRef ? fileHashes(baselineRef) : null;
const afterHashes = fileHashes();
const viewports = [{ name: 'desktop-1280', width: 1280, height: 800 }, { name: 'mobile-390', width: 390, height: 844 }, { name: 'mobile-320', width: 320, height: 568 }, { name: 'landscape-568', width: 568, height: 320 }, { name: 'landscape-844', width: 844, height: 390 }];
const detailed = PASSAGES.find(p => p.id === 'cat-palm-v3') || PASSAGES[0];
const longest = PASSAGES.reduce((a, b) => a.original.length > b.original.length ? a : b);
const startedAt = new Date().toISOString(), checks = [], comparisons = [], screenshots = [], scripts = [], errors = [], requestFailures = [];
let browser, context, page, cdp, touch = false, stage = 'launch';
const report = (status, failure) => ({ status, startedAt, finishedAt: new Date().toISOString(), appHead: git('rev-parse', 'HEAD'), appFiles: afterHashes, baseline: baselineRef ? { ref: git('rev-parse', baselineRef), files: beforeHashes } : null, browserVersion: browser?.version(), checks, comparisons, screenshots, scripts, errors, requestFailures, ...(failure ? { failure: String(failure.stack || failure), stage } : {}), method: 'Production Chromium at five viewport sizes; real canvas mouse/touch taps, drags, pan, wheel and pinch; shared accessible Session controls for deterministic arrangement/full solve. Script-response instrumentation only exposes existing DeskScene. Camera transforms, actions, input bounds and exact screenshot strip equality are checked. No state replacement or substitute UI.', limitations: 'Automated Chromium DPR2 only. Physical-device behavior, human legibility and subjective layout balance are not claimed.' });
const record = (name, details = {}) => { checks.push({ name, ...details }); console.log(`PASS ${name}`); };
const pause = (ms = 70) => page.waitForTimeout(ms);
const mode = value => page.locator(`[data-game-mode="${value}"]`).waitFor({ state: 'attached', timeout: 30000 });
const action = async id => { const node = page.locator(`[data-action="${id}"]`); await node.waitFor({ state: 'attached' }); await node.evaluate(el => el.click()); await pause(); };
const pieces = () => page.locator('[data-piece]').evaluateAll(nodes => nodes.map(node => ({ id: node.dataset.piece, text: node.textContent })));
const piece = async text => { const result = (await pieces()).find(p => p.text === text); assert(result, `Missing paper ${text}`); return result; };
const state = () => page.evaluate(() => {
  const s = window.__hintQaScene, c = s.boardCamera; c.preRender();
  return { phase: s.session?.state.phase, passageId: s.session?.problem.id, selected: s.selected ?? null, hintSelecting: s.hintSelecting, hintAnchor: s.hintAnchor ?? null, hintTarget: s.hintTarget ?? null, hintDescription: s.hintDescription, remaining: s.session?.hintsRemaining, canUndo: s.session?.canUndo, notice: s.notice, gesture: s.gesture ? { kind: s.gesture.kind, id: s.gesture.id, moved: s.gesture.moved } : null, chains: s.session?.state.chains.map(ch => ({ ...ch, tiles: [...ch.tiles], bonds: [...ch.bonds] })), tiles: s.session?.problem.tiles.map(t => ({ ...t })), camera: { x: c.x, y: c.y, width: c.width, height: c.height, scrollX: c.scrollX, scrollY: c.scrollY, zoom: c.zoom }, probes: [[0, 0], [177, 253], [601, 702]].map(([x, y]) => { const p = c.matrixCombined.transformPoint(x, y); return { x: p.x, y: p.y }; }), marks: [...s.views].map(([id, v]) => ({ id, commands: [...v.paper.hintInk.commandBuffer] })) };
});
const sameView = (a, b, reason) => { assert.equal(b.camera.zoom, a.camera.zoom, `${reason}: zoom`); for (let i = 0; i < a.probes.length; i++) { assert(Math.abs(a.probes[i].x - b.probes[i].x) < .02 && Math.abs(a.probes[i].y - b.probes[i].y) < .02, `${reason}: world point ${i} moved (${JSON.stringify(a.probes)} => ${JSON.stringify(b.probes)})`); } };
const sameHint = (a, b, reason) => { for (const key of ['hintAnchor', 'hintTarget', 'hintDescription', 'remaining']) assert.equal(b[key], a[key], `${reason}: ${key}`); assert.deepEqual(b.chains, a.chains, `${reason}: chains`); assert.deepEqual(b.marks, a.marks, `${reason}: marks`); };
const noAnswer = async () => { assert.equal(await page.locator('[data-original]').count(), 0); assert.equal(await page.locator('[data-action="source"]').count(), 0); };
const shot = async name => { await pause(200); const file = `${name}.png`; await page.screenshot({ path: path.join(evidenceDir, file), animations: 'disabled' }); screenshots.push({ file, sha256: sha256(fs.readFileSync(path.join(evidenceDir, file))), camera: (await state()).camera }); return file; };
const tap = async point => { if (touch) await page.touchscreen.tap(point.x, point.y); else await page.mouse.click(point.x, point.y); await pause(); };
const actionPoint = id => page.evaluate(id => { const s = window.__hintQaScene, a = s.actions.get(id); if (!a) throw new Error(`No canvas action ${id}`); const b = a.bounds, box = s.game.canvas.getBoundingClientRect(); return { x: box.left + (b.x + b.width / 2) * box.width / s.scale.width, y: box.top + (b.y + b.height / 2) * box.height / s.scale.height }; }, id);
const physicalAction = async id => { await page.locator(`[data-action="${id}"]`).waitFor({ state: 'attached' }); await tap(await actionPoint(id)); };
const escape = async () => { await page.locator('canvas').focus(); await page.keyboard.press('Escape'); await pause(); };
const open = async passage => { await page.evaluate(async p => { await window.__hintQaScene.openPassage(p); }, passage); await mode('assembling'); await pause(); assert.equal((await state()).passageId, passage.id); await noAnswer(); };
const clear = async () => { await escape(); await mode('assembling'); };
const paperPoint = async (id, prefer = 'center') => page.evaluate(({ id, cell, prefer }) => { const s = window.__hintQaScene, p = s.views.get(id).paper, c = s.boardCamera; c.preRender(); const gs = [...p.layout.glyphs]; if (prefer === 'end') gs.reverse(); const candidates = gs.map(g => ({ x: p.x + g.x + g.advance / 2, y: p.y + g.y + cell / 2 })); if (prefer !== 'end') candidates.unshift({ x: p.x + p.width / 2, y: p.y + p.height / 2 }); for (const world of candidates) { const at = c.matrixCombined.transformPoint(world.x, world.y); if (at.x > 5 && at.x < s.scale.width - 5 && at.y > c.y + 5 && at.y < c.y + c.height - 5 && s.hitPaper(world)?.id === id) return { x: at.x, y: at.y }; } throw new Error(`No visible paper point ${id}`); }, { id, cell: CELL, prefer });
const touchPoint = (id, x, y) => ({ id, x, y, radiusX: 2, radiusY: 2, force: 1 });
const drag = async (from, to, steps = 7, beforeRelease) => {
  if (touch) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touchPoint(0, from.x, from.y)] }); for (let step = 1; step <= steps; step++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touchPoint(0, from.x + (to.x - from.x) * step / steps, from.y + (to.y - from.y) * step / steps)] }); await pause(15); } if (beforeRelease) await beforeRelease(); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
  else { await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps }); if (beforeRelease) await beforeRelease(); await page.mouse.up(); }
  await pause();
};
const join = async (left, right) => { const target = await piece(left), source = await piece(right); await page.locator(`[data-piece="${source.id}"]`).evaluate(el => el.click()); await action(`join:after:${target.id}`); await page.waitForFunction(text => [...document.querySelectorAll('[data-piece]')].some(p => p.textContent === text), left + right); };
const solve = async passage => { let joined = passage.fragments[0]; for (const fragment of passage.fragments.slice(1)) { await join(joined, fragment); joined += fragment; } assert.equal((await pieces()).length, 1); };
const arrange = async (sourceText = detailed.fragments[0], targetText = detailed.fragments[1], zoom = 1) => {
  await clear();
  await page.evaluate(({ sourceText, targetText, zoom }) => { const s = window.__hintQaScene, text = ch => s.session.text(ch), source = s.session.state.chains.find(ch => text(ch) === sourceText), target = s.session.state.chains.find(ch => text(ch) === targetText); if (!source || !target) throw new Error('Fixture papers missing'); let i = 0; for (const ch of [...s.session.state.chains]) s.apply({ type: 'move', chain: ch.id, point: { x: 2200 + i++ * 600, y: 2200 } }); s.boardCamera.setZoom(zoom).setScroll(0, 0); const c = s.boardCamera; c.preRender(); const at = c.getWorldPoint(28, c.y + 28); s.apply({ type: 'move', chain: source.id, point: { x: at.x, y: at.y } }); s.apply({ type: 'move', chain: target.id, point: { x: at.x, y: 1500 } }); s.syncSelection(); s.render(); }, { sourceText, targetText, zoom });
  await clear(); return { source: (await piece(sourceText)).id, target: (await piece(targetText)).id };
};
const layout = () => page.evaluate(() => {
  const s = window.__hintQaScene, c = s.boardCamera; c.preRender(); const labels = [];
  const visit = node => { if (node.type === 'Text') { const b = node.getBounds(); labels.push({ text: node.text, x: b.x, y: b.y, right: b.right, bottom: b.bottom }); } if (node.list) node.list.forEach(visit); }; visit(s.hud);
  return { width: s.scale.width, height: s.scale.height, board: { x: c.x, y: c.y, right: c.x + c.width, bottom: c.y + c.height, width: c.width, height: c.height, area: c.width * c.height, ratio: c.width * c.height / (s.scale.width * s.scale.height) }, labels, actions: [...s.actions].map(([id, a]) => ({ id, x: a.bounds.x, y: a.bounds.y, right: a.bounds.right, bottom: a.bounds.bottom, width: a.bounds.width, height: a.bounds.height })), hitProbes: [-1, 0, c.y - .1, c.y, c.y + 1, c.y + c.height - .1, c.y + c.height, s.scale.height].flatMap(y => [-1, 0, s.scale.width / 2, s.scale.width - .1, s.scale.width].map(x => ({ x, y, actual: s.onBoard({ x, y }), expected: x >= c.x && x < c.x + c.width && y >= c.y && y < c.y + c.height }))) };
});
const intersects = (a, b) => a.x < b.right - .01 && a.right > b.x + .01 && a.y < b.bottom - .01 && a.bottom > b.y + .01;
const assertLayout = async (expanded = false, exact = true) => {
  const data = await layout();
  if (exact) { assert.equal(data.board.y, 52, '52px header'); assert.equal(data.board.bottom, data.height - (expanded ? 104 : 52), 'Footer and board share exact boundary'); assert.equal(data.board.width, data.width); }
  for (const a of data.actions) { assert(a.x >= 0 && a.y >= 0 && a.right <= data.width && a.bottom <= data.height, `Action ${a.id} outside viewport`); assert(!intersects(a, data.board), `Action ${a.id} intercepts board`); }
  for (let i = 0; i < data.actions.length; i++) for (let j = i + 1; j < data.actions.length; j++) assert(!intersects(data.actions[i], data.actions[j]), `Actions overlap: ${data.actions[i].id}/${data.actions[j].id}`);
  for (const label of data.labels) { assert(label.x >= -.6 && label.y >= -.6 && label.right <= data.width + .6 && label.bottom <= data.height + .6, `HUD label outside screen: ${JSON.stringify(label)}`); assert(!intersects(label, data.board), `HUD label covers board: ${label.text}`); }
  for (const p of data.hitProbes) assert.equal(p.actual, p.expected, `Input and visible viewport disagree at (${p.x}, ${p.y})`);
  return data;
};
const prepare = async (url, vp, rev) => {
  touch = vp.width !== 1280;
  context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2, hasTouch: touch, isMobile: touch, reducedMotion: 'reduce' });
  page = await context.newPage(); cdp = await context.newCDPSession(page);
  page.on('pageerror', error => errors.push({ revision: rev, viewport: vp.name, error: String(error.stack || error) }));
  page.on('requestfailed', request => requestFailures.push({ revision: rev, viewport: vp.name, url: request.url(), error: request.failure()?.errorText }));
  await page.route('**/*', async route => { const request = route.request(); if (request.resourceType() !== 'script' || new URL(request.url()).origin !== new URL(url).origin) return route.continue(); const response = await route.fetch(), original = await response.text(), needle = /this\.game\.canvas\.tabIndex\s*=\s*0\b/; if (!needle.test(original)) return route.fulfill({ response }); const changed = original.replace(needle, match => `(window.__hintQaScene=this,${match})`); scripts.push({ revision: rev, viewport: vp.name, url: request.url(), originalSha256: sha256(original), instrumentedSha256: sha256(changed), injection: 'Expose existing DeskScene reference only' }); await route.fulfill({ response, body: changed }); });
  await page.goto(url, { waitUntil: 'domcontentloaded' }); await mode('selection'); await page.waitForFunction(() => window.__hintQaScene?.alive); await pause(100);
};

const stableDeal = async passage => {
  const { dealManuscript } = await import(pathToFileURL(path.join(root, 'src/game/layout.ts')));
  const size = await page.viewportSize(), cols = Math.max(8, Math.min(16, Math.floor((size.width - 88) / CELL)));
  // A fixed permutation by content index gives before/after the same fair visual fixture.
  const order = passage.fragments.map((text, index) => ({ text, index })).sort((a, b) => (a.index * 7 + 3) % passage.fragments.length - (b.index * 7 + 3) % passage.fragments.length);
  const points = dealManuscript(order.map(item => item.text), cols, size.width);
  await page.evaluate(({ order, points }) => { const s = window.__hintQaScene; order.forEach((item, i) => { const ch = s.session.state.chains.find(ch => s.session.text(ch) === item.text); s.apply({ type: 'move', chain: ch.id, point: points[i] }); }); s.boardCamera.setZoom(1).setScroll(0, 0); s.syncSelection(); s.render(); }, { order, points }); await pause();
};
const pointerBoundaryChecks = async vp => {
  for (const edge of ['top', 'bottom']) {
    await open(detailed); const { source } = await arrange();
    const data = await layout(), y = edge === 'top' ? data.board.y : data.board.bottom;
    // Put a real sheet across the viewport boundary. Compare a HUD strip against
    // the same render with that sheet away, and check the immediately-inside strip changes.
    const x = Math.floor(vp.width * .45), inside = edge === 'top' ? y + 4 : y - 6, outside = edge === 'top' ? y - 4 : y + 2;
    const clip = yy => ({ x, y: yy, width: 8, height: 2 });
    await page.evaluate(id => { const s = window.__hintQaScene; s.apply({ type: 'move', chain: id, point: { x: 5000, y: 4000 } }); }, source); await pause(100);
    const beforeOutside = await page.screenshot({ clip: clip(outside), animations: 'disabled' }), beforeInside = await page.screenshot({ clip: clip(inside), animations: 'disabled' });
    const position = await page.evaluate(({ id, x, y }) => { const s = window.__hintQaScene, c = s.boardCamera, p = s.views.get(id).paper; c.preRender(); const at = c.getWorldPoint(x - 20, y - p.height / 2); s.apply({ type: 'move', chain: id, point: { x: at.x, y: at.y } }); return { x: at.x, y: at.y }; }, { id: source, x, y });
    await pause(100);
    const afterOutside = await page.screenshot({ clip: clip(outside), animations: 'disabled' }), afterInside = await page.screenshot({ clip: clip(inside), animations: 'disabled' });
    assert(beforeOutside.equals(afterOutside), `${vp.name} ${edge}: paper paints into HUD strip`);
    assert(!beforeInside.equals(afterInside), `${vp.name} ${edge}: positive control paper must paint just inside board`);
    const before = await state();
    // The 4px HUD inset is outside the board and outside legitimate buttons,
    // while the hidden half of the crossing paper remains directly underneath.
    const gutter = { x, y: edge === 'top' ? y - 2 : y + 2 };
    if (touch) await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touchPoint(0, gutter.x, gutter.y)] });
    else { await page.mouse.move(gutter.x, gutter.y); await page.mouse.down(); }
    const during = await state(); assert.equal(during.gesture, null, `${edge} HUD press starts board gesture`);
    if (touch) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); else await page.mouse.up();
    const visiblePoint = { x, y: edge === 'top' ? y + 12 : y - 12 };
    await tap(visiblePoint); assert.equal((await state()).selected, source, `${edge}: visible part is selectable`);
    await drag(visiblePoint, { x: x + 22, y: edge === 'top' ? y - 8 : y + 8 });
    const released = await state(); assert.deepEqual(released.chains, before.chains, `${edge}: outside release must not commit move/join`); assert.equal(released.gesture, null);
    const paperAfter = await page.evaluate(id => { const p = window.__hintQaScene.views.get(id).paper; return { x: p.x, y: p.y }; }, source);
    assert.deepEqual(paperAfter, position, `${edge}: cancelled drag restores paper exactly`);
    await page.evaluate(camera => { const c = window.__hintQaScene.boardCamera; c.setZoom(camera.zoom).setScroll(camera.scrollX, camera.scrollY); }, before.camera); await pause();
    await drag(visiblePoint, { x: x + 16, y: edge === 'top' ? y + 44 : y - 44 });
    const committed = await state(); assert.equal(committed.chains.length, before.chains.length, 'Inside drop must only move'); assert.notDeepEqual(committed.chains.find(ch => ch.id === source), before.chains.find(ch => ch.id === source), `${edge}: inside release must commit real drag`); assert.deepEqual(committed.chains.filter(ch => ch.id !== source), before.chains.filter(ch => ch.id !== source));
    await physicalAction('undo'); assert.deepEqual((await state()).chains, before.chains, `${edge}: Undo restores inside drag`);
    await page.evaluate(camera => { const c = window.__hintQaScene.boardCamera; c.setZoom(camera.zoom).setScroll(camera.scrollX, camera.scrollY); }, before.camera); await pause();
    const pointerScreenshot = await shot(`current-${vp.name}-${edge}-clipping`);
    record(`${vp.name}: ${edge} rendered/input boundary and outside release`, { board: data.board, position, outsideStripIdentical: true, insideStripChanged: true, screenshot: pointerScreenshot });
  }
};
const clippedPortChecks = async vp => {
  for (const edge of ['top', 'bottom']) {
    await open(detailed); const ids = await arrange(); const data = await layout();
    const boundary = edge === 'top' ? data.board.y : data.board.bottom, outsideY = boundary + (edge === 'top' ? -6 : 6), insideY = boundary + (edge === 'top' ? 3 : -3), x = Math.round(vp.width * .72);
    await page.evaluate(({ source, target, x, outsideY }) => { const s = window.__hintQaScene, c = s.boardCamera; c.preRender(); const sourceAt = c.getWorldPoint(26, c.y + c.height / 2); s.apply({ type: 'move', chain: source, point: { x: sourceAt.x, y: sourceAt.y } }); const p = s.views.get(target).paper, endpoint = c.getWorldPoint(x, outsideY); s.apply({ type: 'move', chain: target, point: { x: endpoint.x - p.front.x, y: endpoint.y - p.front.y } }); }, { ...ids, x, outsideY });
    await tap(await paperPoint(ids.source)); assert.equal((await state()).selected, ids.source); const before = await state();
    await tap({ x, y: insideY }); const after = await state(); assert.deepEqual(after.chains, before.chains, `${edge}: a clipped endpoint must not accept a nearby inside tap`);
    await escape();
    const grab = await page.evaluate(id => { const s = window.__hintQaScene, p = s.views.get(id).paper, c = s.boardCamera; c.preRender(); const point = c.matrixCombined.transformPoint(p.x + p.back.x - 20, p.y + p.back.y); return { x: point.x, y: point.y }; }, ids.source);
    const beforeDrag = await state();
    await drag(grab, { x: x - 20, y: insideY }, 1, async () => { const target = await page.evaluate(() => window.__hintQaScene.target ?? null); assert.equal(target, null, `${edge}: drag cannot match a clipped port`); });
    const afterDrag = await state(); assert.deepEqual(afterDrag.chains.map(({ id, tiles, bonds }) => ({ id, tiles, bonds })), beforeDrag.chains.map(({ id, tiles, bonds }) => ({ id, tiles, bonds })), `${edge}: near-clipped-port drag must not join`);
    record(`${vp.name}: clipped ${edge} target rejects real tap and drag matching`, { endpoint: { x, y: outsideY }, tap: { x, y: insideY } });
  }
};
const visiblePortJoinChecks = async vp => {
  for (const edge of ['top', 'bottom']) {
    await open(detailed); const ids = await arrange(); const data = await layout(), y = edge === 'top' ? data.board.y + 22 : data.board.bottom - 22, sourceEndX = vp.width / 2 - 40, targetStartX = vp.width / 2 + 40;
    await page.evaluate(({ source, target, sourceEndX, targetStartX, y }) => { const s = window.__hintQaScene, c = s.boardCamera; c.preRender(); for (const [id, endpoint, x] of [[source, 'back', sourceEndX], [target, 'front', targetStartX]]) { const p = s.views.get(id).paper, world = c.getWorldPoint(x, y); s.apply({ type: 'move', chain: id, point: { x: world.x - p[endpoint].x, y: world.y - p[endpoint].y } }); } }, { ...ids, sourceEndX, targetStartX, y });
    const before = await state();
    await drag({ x: sourceEndX - 20, y }, { x: targetStartX - 20, y }, 5, async () => { const target = await page.evaluate(() => window.__hintQaScene.target ? { id: window.__hintQaScene.target.id, side: window.__hintQaScene.target.side } : null); assert.deepEqual(target, { id: ids.target, side: 'before' }, `${edge}: visible source and target ports should match`); });
    const joined = await state(); assert.equal(joined.chains.length, before.chains.length - 1, `${edge}: actual visible-port drop joins`); await piece(detailed.fragments[0] + detailed.fragments[1]);
    await physicalAction('undo'); const undone = await state(); assert.deepEqual(undone.chains, before.chains, `${edge}: actual Undo restores join`);
    record(`${vp.name}: real drag-join and Undo at visible ${edge} ports`, { sourceEndpoint: { x: sourceEndX, y }, targetEndpoint: { x: targetStartX, y } });
  }
};
const hintChecks = async (vp, zoom) => {
  await open(detailed); const ids = await arrange(detailed.fragments[0], detailed.fragments[1], zoom);
  await physicalAction('hint'); await mode('hint-select'); const selecting = await state();
  await tap(await paperPoint(ids.source)); await mode('assembling'); const shown = await state();
  sameView(selecting, shown, 'Reveal must preserve world screen position'); assert.deepEqual(shown.chains, selecting.chains); assert.equal(shown.remaining, 2); assert(shown.hintAnchor && shown.hintTarget); await assertLayout(true);
  const trueAnchor = shown.tiles.find(t => t.text === detailed.fragments[0]), trueTarget = shown.tiles.find(t => t.text === detailed.fragments[1]); assert.equal(shown.hintAnchor, trueAnchor.id); assert.equal(shown.hintTarget, trueTarget.id);
  assert(shown.marks.some(p => p.commands.length), 'Revealed marks remain rendered');
  if (zoom === 1) await shot(`current-${vp.name}-hint-expanded`);
  for (let repeat = 0; repeat < 2; repeat++) {
    const before = await state(); await physicalAction('hint-context-toggle'); const collapsed = await state(); sameHint(before, collapsed, 'Collapse retains context'); sameView(before, collapsed, 'Collapse preserves world screen position'); await assertLayout(false);
    assert.equal(await page.locator('[data-action="hint-source"]').count(), 0); assert.equal(await page.locator('[data-action="hint-target"]').count(), 0);
    if (zoom === 1 && repeat === 0) await shot(`current-${vp.name}-hint-collapsed`);
    await physicalAction('hint'); await mode('hint-select'); const selectingAgain = await state(); sameHint(collapsed, selectingAgain, 'Starting new hint preserves old context'); sameView(collapsed, selectingAgain, 'Hint selection preserves collapsed viewport');
    await physicalAction('hint'); await mode('assembling'); const cancelled = await state(); sameHint(collapsed, cancelled, 'Cancel retains collapsed context'); sameView(collapsed, cancelled, 'Cancel preserves collapsed viewport'); await assertLayout(false);
    await physicalAction('hint-context-toggle'); const reopened = await state(); sameHint(before, reopened, 'Reopen retains context'); sameView(before, reopened, 'Reopen preserves world screen position'); await assertLayout(true);
    await physicalAction('hint'); await mode('hint-select'); await page.locator('canvas').focus(); await page.keyboard.press('Escape'); await mode('assembling'); const escaped = await state(); sameHint(reopened, escaped, 'Escape cancels selection without losing expanded context'); sameView(reopened, escaped, 'Escape preserves expanded viewport'); await assertLayout(true);
  }
  const beforeTarget = await state(); await physicalAction('hint-target'); const targetReached = await state(); sameHint(beforeTarget, targetReached, 'Explicit target navigation retains context'); assert.equal(targetReached.camera.zoom, beforeTarget.camera.zoom); assert.notDeepEqual(targetReached.probes, beforeTarget.probes, 'Explicit offscreen target navigation changes view'); await paperPoint(ids.target);
  const beforeSource = await state(); await physicalAction('hint-source'); sameHint(beforeSource, await state(), 'Explicit source navigation retains context'); await paperPoint(ids.source);
  record(`${vp.name}: reveal, repeated collapse/reopen, button/Escape cancellation, explicit source/target navigation at zoom ${zoom}`, { before: selecting.camera, expanded: shown.camera, after: (await state()).camera });
};
const rotationChecks = async vp => {
  if (vp.width >= vp.height) return;
  const before = await state(), source = before.chains.find(ch => ch.tiles.includes(before.hintAnchor)).id;
  const retained = current => { for (const key of ['passageId', 'phase', 'hintAnchor', 'hintTarget', 'hintDescription', 'remaining']) assert.equal(current[key], before[key], `Rotation retains ${key}`); assert.deepEqual(current.chains, before.chains, 'Rotation retains live Session chains'); assert.deepEqual(current.tiles, before.tiles, 'Rotation retains exact text and tile identity'); assert(current.marks.some(p => p.commands.length), 'Rotation keeps hint marks'); };
  await page.setViewportSize({ width: vp.height, height: vp.width }); await pause(250); retained(await state()); await assertLayout(true); assert.equal(await page.locator('canvas').count(), 1, 'One canvas after rotation'); const landscapeScreenshot = await shot(`current-${vp.name}-rotated-landscape-hint`);
  await physicalAction('hint-source'); retained(await state()); await paperPoint(source);
  await page.setViewportSize({ width: vp.width, height: vp.height }); await pause(250); retained(await state()); await assertLayout(true); assert.equal(await page.locator('canvas').count(), 1, 'One canvas after rotating back');
  await physicalAction('hint-source'); await physicalAction('hint'); await mode('hint-select'); const beforeRetap = await state(); await tap(await paperPoint(source)); await mode('assembling'); const afterRetap = await state(); retained(afterRetap); sameView(beforeRetap, afterRetap, 'Actual post-rotation repeated reveal does not move board'); await assertLayout(true);
  record(`${vp.name}: actual portrait→landscape→portrait resize retains Session/text/hints; real canvas re-tap remains usable`, { landscapeScreenshot, before: before.camera, after: afterRetap.camera });
};
const bottomHintChecks = async vp => {
  await open(detailed); const ids = await arrange(); const beforeLayout = await layout(), point = { x: vp.width / 2, y: beforeLayout.board.bottom - 20 };
  await page.evaluate(({ id, point }) => { const s = window.__hintQaScene, c = s.boardCamera, p = s.views.get(id).paper, g = p.layout.glyphs[0]; c.preRender(); const at = c.getWorldPoint(point.x, point.y); s.apply({ type: 'move', chain: id, point: { x: at.x - g.x - g.advance / 2, y: at.y - g.y - 14.5 } }); }, { id: ids.source, point });
  await physicalAction('hint'); await mode('hint-select'); const before = await state(); await tap(point); await mode('assembling'); const revealed = await state(); assert(revealed.hintAnchor && revealed.hintTarget); assert.equal(revealed.remaining, 2); sameView(before, revealed, 'Bottom reveal preserves world screen position'); await assertLayout(false); assert.equal(await page.locator('[data-action="hint-source"]').count(), 0); await paperPoint(ids.source);
  const screenshot = await shot(`current-${vp.name}-bottom-source-adaptive-context`);
  await physicalAction('hint-context-toggle'); await assertLayout(true); const expanded = await state(); sameHint(revealed, expanded, 'Explicit expansion retains bottom-source context'); sameView(revealed, expanded, 'Explicit bottom-source expansion does not slide board');
  await physicalAction('hint-context-toggle'); await assertLayout(false); const collapsed = await state(); sameHint(revealed, collapsed, 'Bottom-source collapse retains context'); sameView(revealed, collapsed, 'Bottom-source collapse does not slide board');
  // Invalid selection while a previous collapsed context exists temporarily
  // opens a status row; dismissal restores that retained context and viewport.
  const final = await piece(detailed.fragments.at(-1)); await page.locator(`[data-piece="${final.id}"]`).evaluate(el => el.focus({ preventScroll: true })); await pause();
  await physicalAction('hint'); await mode('hint-select'); const invalidBefore = await state(); await tap(await paperPoint(final.id)); await mode('hint-select'); const invalid = await state(); assert.match(invalid.notice, /続きを表示できません/); sameHint(invalidBefore, invalid, 'Invalid selection preserves prior context'); sameView(invalidBefore, invalid, 'Retained-context status does not slide board'); await assertLayout(true);
  await physicalAction('notice-close'); const dismissed = await state(); sameHint(invalidBefore, dismissed, 'Status dismissal retains previous collapsed context'); sameView(invalidBefore, dismissed, 'Status dismissal restores same screen transform'); await assertLayout(false); await physicalAction('hint'); await mode('assembling');
  record(`${vp.name}: bottom-source reveal stays visible with adaptive collapsed context; status dismissal restores context`, { tap: point, screenshot, collapsed: revealed.camera, explicitlyExpanded: expanded.camera });
};
const noticeChecks = async vp => {
  await open(detailed); await arrange();
  // The original final fragment has no continuation and cannot spend a hint.
  const final = await piece(detailed.fragments.at(-1)); await page.locator(`[data-piece="${final.id}"]`).evaluate(el => el.focus({ preventScroll: true })); await pause();
  await physicalAction('hint'); await mode('hint-select'); const beforeInvalid = await state(); await tap(await paperPoint(final.id)); await mode('hint-select'); const invalid = await state(); assert.equal(invalid.remaining, 3); assert.match(invalid.notice, /続きを表示できません/); sameView(beforeInvalid, invalid, 'Invalid hint status preserves world screen position'); await assertLayout(true);
  await physicalAction('notice-close'); await assertLayout(false); sameView(invalid, await state(), 'Dismissing status preserves world screen position'); await physicalAction('hint'); await mode('assembling');
  // A full but deliberately rotated chain still needs an exact hint. Its final
  // original fragment is first, so its actual tail has a valid successor.
  await open(detailed); const order = [detailed.fragments.at(-1), ...detailed.fragments.slice(0, -1)]; let joined = order[0]; for (const fragment of order.slice(1)) { await join(joined, fragment); joined += fragment; }
  await assertLayout(false); const beforeCheck = await state(); await physicalAction('check'); await mode('assembling'); const incorrect = await state(); assert.match(incorrect.notice, /原文とは/); assert.deepEqual(incorrect.chains, beforeCheck.chains); await assertLayout(true); await noAnswer();
  await physicalAction('notice-close'); await assertLayout(false);
  const full = (await pieces())[0]; await page.evaluate(id => { const s = window.__hintQaScene, p = s.views.get(id).paper, g = p.layout.glyphs.at(-1); s.boardCamera.setZoom(1).centerOn(p.x + p.width / 2, p.y + g.y + 14.5); }, full.id); await pause();
  await physicalAction('hint'); await mode('hint-select'); const beforeReveal = await state(); await tap(await paperPoint(full.id, 'end')); await mode('assembling'); const revealed = await state(); assert.equal(revealed.remaining, 2); sameView(beforeReveal, revealed, 'Full-chain hint reveal preserves world screen position'); await assertLayout(true); assert.equal(await page.locator('[data-action="check"]').count(), 1); assert.equal(await page.locator('[data-action="hint-context-toggle"]').count(), 1);
  const screenshot = await shot(`current-${vp.name}-full-chain-hint-controls`);
  await physicalAction('hint-context-toggle'); await assertLayout(false); const collapsed = await state(); await physicalAction('check'); await mode('assembling'); const errorWithContext = await state(); assert.match(errorWithContext.notice, /原文とは/); await assertLayout(true);
  // Checking is an assembly command and may clear context, but dismissing the
  // resulting error must always reclaim its extra footer row without a slide.
  await physicalAction('notice-close'); await assertLayout(false); sameView(errorWithContext, await state(), 'Dismissing incorrect status preserves world screen position');
  record(`${vp.name}: invalid-hint and incorrect-check status dismissal; full-chain hint controls do not collide`, { initialBudget: invalid.remaining, fullChainBudget: revealed.remaining, collapsedCamera: collapsed.camera, screenshot });
};
const navigationChecks = async vp => {
  const old = await state(), c = old.camera, panFrom = { x: 3, y: c.y + c.height * .62 }, panTo = { x: 3, y: c.y + c.height * .35 };
  await drag(panFrom, panTo); const panned = await state(); assert.notEqual(panned.camera.scrollY, old.camera.scrollY, 'Real desk drag pans'); sameHint(old, panned, 'Pan retains hint');
  if (touch) {
    const midY = c.y + c.height / 2, left = vp.width * .3, right = vp.width * .7;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touchPoint(0, left, midY)] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touchPoint(0, left, midY), touchPoint(1, right, midY)] });
    for (let i = 1; i <= 5; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touchPoint(0, left - i * 4, midY), touchPoint(1, right + i * 4, midY)] }); await pause(20); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await pause();
  } else { await page.mouse.move(vp.width / 2, c.y + c.height / 2); await page.mouse.wheel(0, -180); await pause(100); }
  const zoomed = await state(); assert(zoomed.camera.zoom > panned.camera.zoom, 'Real pinch/wheel zooms'); sameHint(panned, zoomed, 'Zoom retains hint');
  for (const y of [zoomed.camera.y - 2, zoomed.camera.y + zoomed.camera.height + 2]) { const before = await state(); await page.mouse.move(vp.width / 2, y); await page.mouse.wheel(0, -180); await pause(100); sameView(before, await state(), 'Wheel over HUD must not zoom/pan'); }
  await page.locator('canvas').focus(); const keyBefore = await state(); await page.keyboard.press('-'); await pause(); const keyed = await state(); assert(keyed.camera.zoom < keyBefore.camera.zoom); sameHint(keyBefore, keyed, 'Keyboard zoom retains hint');
  record(`${vp.name}: real ${touch ? 'touch pan/pinch' : 'mouse pan/wheel'}, HUD-wheel rejection and keyboard zoom`, { initial: old.camera, pan: panned.camera, zoom: zoomed.camera, keyboard: keyed.camera });
};
const overlayChecks = async vp => {
  await open(detailed); await physicalAction('settings'); await mode('settings'); const settings = await layout(); assert(settings.labels.some(label => label.text.includes(detailed.title) && label.text.includes(detailed.author)), 'Title and author remain available in settings');
  for (const label of settings.labels) assert(label.x >= -.6 && label.y >= -.6 && label.right <= settings.width + .6 && label.bottom <= settings.height + .6, `Settings text overflow ${JSON.stringify(label)}`);
  for (let i = 0; i < settings.actions.length; i++) for (let j = i + 1; j < settings.actions.length; j++) assert(!intersects(settings.actions[i], settings.actions[j]), `Settings actions overlap: ${settings.actions[i].id}/${settings.actions[j].id}`);
  await physicalAction('help'); await mode('help'); const help = await layout(); for (const label of help.labels) assert(label.x >= -.6 && label.y >= -.6 && label.right <= help.width + .6 && label.bottom <= help.height + .6, `Help text overflow ${JSON.stringify(label)}`);
  await physicalAction('close'); await mode('assembling'); await assertLayout(false); record(`${vp.name}: secondary title/author and settings-to-help remain available and fit`);
};
const reachAllPapers = async vp => {
  await open(longest); await stableDeal(longest);
  const seen = new Set(), total = (await pieces()).length;
  const observe = async () => { const visible = await page.evaluate(() => { const s = window.__hintQaScene, c = s.boardCamera; c.preRender(); return [...s.views].filter(([, v]) => v.paper.layout.glyphs.some(g => { const p = c.matrixCombined.transformPoint(v.paper.x + g.x + g.advance / 2, v.paper.y + g.y + 14.5); return p.x > 0 && p.x < c.width && p.y > c.y && p.y < c.y + c.height; })).map(([id]) => id); }); visible.forEach(id => seen.add(id)); };
  await observe();
  const maximumWorldBottom = await page.evaluate(() => Math.max(...[...window.__hintQaScene.views.values()].map(v => v.paper.y + v.paper.height)));
  const board = (await state()).camera, step = board.height * .6;
  const maxPans = Math.ceil(maximumWorldBottom / step) + 2;
  for (let i = 0; i < maxPans && seen.size < total; i++) { await drag({ x: 3, y: board.y + board.height * .82 }, { x: 3, y: board.y + board.height * .22 }); await observe(); }
  assert.equal(seen.size, total, 'All dealt papers reachable by actual desk panning');
  // Also exercise accessible focus followed by an actual board tap for every paper.
  for (const p of await pieces()) { await escape(); await page.locator(`[data-piece="${p.id}"]`).evaluate(el => el.focus({ preventScroll: true })); await pause(); await tap(await paperPoint(p.id)); assert.equal((await state()).selected, p.id); }
  record(`${vp.name}: all ${total} papers reachable by real pan and selectable after accessible focus`, { passageId: longest.id, maxPans });
};
const completeChecks = async vp => {
  await open(longest); await solve(longest); await assertLayout(false); await physicalAction('check'); await mode('complete'); await assertLayout(false); assert.equal(await page.locator('[data-original]').textContent(), longest.original);
  const first = await state(); let lastGlyph;
  const last = () => page.evaluate(cell => { const s = window.__hintQaScene, p = s.manuscript, c = s.boardCamera, g = p.layout.glyphs.at(-1); c.preRender(); const a = c.matrixCombined.transformPoint(p.x + g.x, p.y + g.y), b = c.matrixCombined.transformPoint(p.x + g.x + g.advance, p.y + g.y + cell); return { left: a.x, right: b.x, top: a.y, bottom: b.y, board: { top: c.y, bottom: c.y + c.height, width: c.width }, manuscriptHeight: p.height }; }, CELL);
  lastGlyph = await last(); const maxPans = Math.ceil(lastGlyph.manuscriptHeight / (first.camera.height * .55)) + 3;
  for (let i = 0; lastGlyph.bottom > lastGlyph.board.bottom - 12 && i < maxPans; i++) { const c = (await state()).camera, distance = Math.min(c.height * .55, lastGlyph.bottom - lastGlyph.board.bottom + 20); await drag({ x: 3, y: c.y + c.height - 18 }, { x: 3, y: c.y + c.height - 18 - distance }); lastGlyph = await last(); }
  assert(lastGlyph.top >= lastGlyph.board.top && lastGlyph.bottom <= lastGlyph.board.bottom, 'Last manuscript glyph reachable at readable zoom'); assert.equal((await state()).camera.zoom, 1);
  const endScreenshot = await shot(`current-${vp.name}-long-manuscript-end`); await physicalAction('undo'); await mode('assembling'); await noAnswer(); await assertLayout(false); assert.equal((await pieces()).length, 1);
  await physicalAction('check'); await mode('complete'); await assertLayout(false);
  record(`${vp.name}: explicit completion, long manuscript end pan, Undo and re-completion`, { passageId: longest.id, characters: longest.original.length, lastGlyph, screenshot: endScreenshot });
};

try {
  browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
  for (const vp of viewports) {
    for (const rev of baselineUrl ? ['baseline', 'current'] : ['current']) {
      stage = `${rev} ${vp.name}: ordinary and hint comparison`; await prepare(rev === 'baseline' ? baselineUrl : appUrl, vp, rev);
      await open(detailed); await stableDeal(detailed); const ordinary = await layout(), ordinaryShot = await shot(`${rev}-${vp.name}-ordinary`);
      if (rev === 'current') await assertLayout(false);
      const ids = await arrange(); await physicalAction('hint'); await mode('hint-select'); const before = await state(); await tap(await paperPoint(ids.source)); await mode('assembling'); const after = await state(); const hintLayout = await layout(), hintShot = await shot(`${rev}-${vp.name}-hint`);
      if (rev === 'current') { sameView(before, after, 'Fresh comparison reveal preserves camera screen transform'); await assertLayout(true); }
      comparisons.push({ revision: rev, viewport: vp, passageId: detailed.id, ordinary, ordinaryShot, hint: hintLayout, hintShot, reveal: { before: before.camera, after: after.camera, beforeProbes: before.probes, afterProbes: after.probes } });
      if (rev === 'baseline') { await context.close(); continue; }
      stage = `${vp.name}: pointer/render boundaries`; await pointerBoundaryChecks(vp); await clippedPortChecks(vp); await visiblePortJoinChecks(vp);
      for (const zoom of [0.65, 1.7, 1]) { stage = `${vp.name}: hint context zoom ${zoom}`; await hintChecks(vp, zoom); }
      stage = `${vp.name}: orientation transition`; await rotationChecks(vp);
      stage = `${vp.name}: pan and zoom`; await navigationChecks(vp);
      stage = `${vp.name}: bottom-source adaptive reveal`; await bottomHintChecks(vp);
      stage = `${vp.name}: important status and full-chain hint controls`; await noticeChecks(vp);
      stage = `${vp.name}: secondary settings and help`; await overlayChecks(vp);
      stage = `${vp.name}: all papers reachable`; await reachAllPapers(vp);
      stage = `${vp.name}: long completion`; await completeChecks(vp);
      await context.close();
    }
    if (baselineUrl) { const old = comparisons.find(v => v.revision === 'baseline' && v.viewport.name === vp.name), current = comparisons.find(v => v.revision === 'current' && v.viewport.name === vp.name); assert(current.ordinary.board.height > old.ordinary.board.height, 'Ordinary playable height improves baseline'); assert(current.hint.board.height > old.hint.board.height, 'Expanded context playable height improves baseline'); record(`${vp.name}: before/after usable area improvement`, { oldHeight: old.ordinary.board.height, newHeight: current.ordinary.board.height, gainedPixels: current.ordinary.board.height - old.ordinary.board.height, oldRatio: old.ordinary.board.ratio, newRatio: current.ordinary.board.ratio, hintOldHeight: old.hint.board.height, hintNewHeight: current.hint.board.height }); }
  }
  assert.deepEqual(requestFailures, [], 'No browser request failures'); assert.deepEqual(errors, [], 'No uncaught page errors'); assert(scripts.some(s => s.revision === 'current'));
  fs.writeFileSync(path.join(evidenceDir, 'results.json'), JSON.stringify(report('passed'), null, 2)); console.log(`Evidence: ${evidenceDir}`);
} catch (error) {
  if (page && !page.isClosed()) { await page.screenshot({ path: path.join(evidenceDir, 'failure.png') }).catch(() => {}); fs.writeFileSync(path.join(evidenceDir, 'failure-body.txt'), await page.locator('body').innerText().catch(() => 'unavailable')); }
  fs.writeFileSync(path.join(evidenceDir, 'results.json'), JSON.stringify(report('failed', error), null, 2)); throw error;
} finally { await browser?.close(); }

// TEMPORARY end-to-end evidence. Remove before final commit; not permanent CI.
// Run on an executor where Chromium is allowed, against this checkout's development or production server:
//   PLAYWRIGHT_MODULE=/tmp/browser/node_modules/playwright/index.mjs \
//   APP_URL=http://127.0.0.1:5678 EVIDENCE_DIR=/tmp/evidence \
//   node --experimental-strip-types scripts/hints-check.mjs
// Instrumentation only exposes the live DeskScene in the browser response. It does
// not change source files, draw a substitute UI, or replace Session behavior.
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
const playwrightModule = process.env.PLAYWRIGHT_MODULE || '/tmp/browser/node_modules/playwright/index.mjs';
const { chromium } = await import(playwrightModule);
fs.mkdirSync(evidenceDir, { recursive: true });
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const appFiles = Object.fromEntries([...new Set([
  ...git('ls-files', 'src').split('\n').filter(Boolean),
  'src/game/questions.ts',
])].filter(name => fs.existsSync(path.join(root, name)))
  .map(name => [name, sha256(fs.readFileSync(path.join(root, name)))]));
const works = PASSAGES.filter((passage, index) => PASSAGES.findIndex(other => other.workId === passage.workId) === index);
assert.equal(PASSAGES.length, 6, 'Six curated questions are required');
assert.equal(works.length, 3, 'Selection must remain three works');
for (const work of works) assert.equal(PASSAGES.filter(p => p.workId === work.workId).length, 2);
const startedAt = new Date().toISOString();
const checks = [], errors = [], requestFailures = [], scripts = [], screenshots = [], solved = [];
let page, browser, currentContext, stage = 'launch';
const report = (status, failure) => ({
  status, startedAt, finishedAt: new Date().toISOString(), appUrl,
  appHead: git('rev-parse', 'HEAD'), appFiles, gitStatus: git('status', '--short'),
  scripts, checks, solved, errors, requestFailures, screenshots,
  ...(failure ? { failure: String(failure.stack || failure), stage } : {}),
  desktop: '1280x800 DPR2', mobile: '320x568 DPR2 touch emulation',
  method: 'Real canvas mouse clicks and touchscreen taps cover title selection, invitation, hint activation/cancellation, selecting the anchor, and completion/replay. Accessible focus brings offscreen paper into view; selection itself uses canvas input. Complete manuscript assembly and Undo use the existing accessible controls backed by the same live Session. Read-only response instrumentation inspects hint graphics commands and current scene state.',
  limitations: 'Automated Chromium only. No physical-device, human legibility/balance, listening, or source-text editorial review claim. Exact fragment draw commands plus screenshots are evidence of the yellow highlight; no pixel-quality score is inferred.',
});
const record = (name, details = {}) => { checks.push({ name, ...details }); console.log(`PASS ${name}`); };
const mode = async value => {
  await page.locator(`[data-game-mode="${value}"]`).waitFor({ state: 'attached', timeout: 30000 });
};
const action = async id => {
  const node = page.locator(`[data-action="${id}"]`);
  await node.waitFor({ state: 'attached' });
  await node.evaluate(element => element.click());
};
const pieces = async () => page.locator('[data-piece]').evaluateAll(nodes => nodes.map(node => ({
  id: node.dataset.piece, text: node.textContent, selected: node.getAttribute('aria-pressed') === 'true',
})));
const state = async () => page.evaluate(() => {
  const scene = window.__hintQaScene, session = scene.session;
  return {
    passageId: session?.problem.id, workId: session?.problem.workId,
    remaining: session?.hintsRemaining, phase: session?.state.phase,
    chains: session?.state.chains.map(chain => ({ ...chain, tiles: [...chain.tiles], bonds: [...chain.bonds] })),
    tiles: session?.problem.tiles.map(tile => ({ ...tile })),
    hintSelecting: scene.hintSelecting, hintTarget: scene.hintTarget ?? null,
    description: scene.hintDescription, selected: scene.selected ?? null,
    canUndo: session?.canUndo, notice: scene.notice,
  };
});
const noAnswer = async () => {
  assert.equal(await page.locator('[data-original]').count(), 0, 'No original before completion');
  assert.equal(await page.locator('[data-action="source"]').count(), 0, 'No source before completion');
  assert.equal(await page.locator('[data-action="review"]').count(), 0, 'No full-text review shortcut');
};
const shot = async name => {
  await page.waitForTimeout(300);
  const file = `${name}.png`;
  await page.screenshot({ path: path.join(evidenceDir, file) });
  screenshots.push({ file, sha256: sha256(fs.readFileSync(path.join(evidenceDir, file))) });
};
const physical = async (point, touch = false) => {
  if (touch) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
};
const actionPoint = async id => page.evaluate(id => {
  const scene = window.__hintQaScene;
  const action = scene.actions.get(id);
  if (!action) throw new Error(`Missing canvas action: ${id}`);
  const b = action.bounds, canvas = scene.game.canvas.getBoundingClientRect();
  return { x: canvas.left + (b.x + b.width / 2) * canvas.width / scene.scale.width,
    y: canvas.top + (b.y + b.height / 2) * canvas.height / scene.scale.height };
}, id);
const physicalAction = async (id, touch = false) => {
  await page.locator(`[data-action="${id}"]`).waitFor({ state: 'attached' });
  await physical(await actionPoint(id), touch);
};
const pieceByText = async text => {
  const found = (await pieces()).find(piece => piece.text === text);
  assert(found, `Missing chain: ${text}`);
  return found;
};
const pick = async text => {
  const piece = await pieceByText(text);
  await page.locator(`[data-piece="${piece.id}"]`).evaluate(node => node.click());
  return piece.id;
};
const join = async (left, right) => {
  const target = await pieceByText(left);
  await pick(right);
  await action(`join:after:${target.id}`);
  await page.waitForFunction(text => [...document.querySelectorAll('[data-piece]')].some(piece => piece.textContent === text), left + right);
  assert((await pieces()).some(piece => piece.text === left + right), 'Accessible join uses live Session');
};
const paperPoint = async text => {
  const piece = await pieceByText(text);
  // This is the app's normal accessible focus path, used only to pan offscreen paper into view.
  await page.locator(`[data-piece="${piece.id}"]`).evaluate(node => node.focus({ preventScroll: true }));
  await page.waitForTimeout(40);
  return page.evaluate(({ id, cell }) => {
    const scene = window.__hintQaScene, paper = scene.views.get(id)?.paper;
    if (!paper) throw new Error(`Missing rendered paper: ${id}`);
    const camera = scene.boardCamera;
    camera.preRender();
    const canvas = scene.game.canvas.getBoundingClientRect();
    // Phaser 4's combined view matrix includes camera viewport, zoom and scroll.
    for (const glyph of paper.layout.glyphs) {
      const world = { x: paper.x + glyph.x + glyph.advance / 2, y: paper.y + glyph.y + cell / 2 };
      const screen = camera.matrixCombined.transformPoint(world.x, world.y);
      if (screen.x < 8 || screen.x > scene.scale.width - 8 || screen.y < camera.y + 8 || screen.y > camera.y + camera.height - 8) continue;
      if (scene.hitPaper(world)?.id !== id) continue;
      return { x: canvas.left + screen.x * canvas.width / scene.scale.width,
        y: canvas.top + screen.y * canvas.height / scene.scale.height };
    }
    throw new Error(`No visible, unoccluded glyph in paper ${id}`);
  }, { id: piece.id, cell: CELL });
};
const physicalPaper = async (text, touch = false) => physical(await paperPoint(text), touch);
const hint = async (anchorText, touch = false) => {
  if (!(await state()).hintSelecting) await physicalAction('hint', touch);
  await mode('hint-select');
  await physicalPaper(anchorText, touch);
};
const graphics = async () => page.evaluate(() => {
  const scene = window.__hintQaScene;
  return [...scene.views].map(([chainId, { paper }]) => ({
    chainId, commands: [...paper.hintInk.commandBuffer],
    ranges: paper.fragmentRanges.map(range => ({ ...range })),
    glyphs: paper.layout.glyphs.map(glyph => ({ ...glyph })),
  }));
});
const parseHintCommands = commands => {
  let color, alpha; const rectangles = [];
  for (let i = 0; i < commands.length;) {
    const command = commands[i++];
    if (command === 7) { color = commands[i++]; alpha = commands[i++]; }
    else if (command === 6) i += 3; // Optional default line style after Graphics.clear().
    else if (command === 3) {
      const [x, y, width, height] = commands.slice(i, i + 4); i += 4;
      rectangles.push({ x, y, width, height, color, alpha });
    } else assert.fail(`Unexpected hint Graphics command ${command}`);
  }
  return rectangles;
};
const assertUnpainted = async () => {
  for (const paper of await graphics()) assert.equal(parseHintCommands(paper.commands).length, 0, 'No unsolicited hint paint');
};
const assertHighlight = async (expectedAnchor, expectedTarget, remaining, minimumGroupSize = 1) => {
  await mode('assembling');
  const current = await state();
  assert.equal(current.remaining, remaining);
  assert.equal(current.hintSelecting, false);
  assert.equal(current.selected, null, 'Hint must not select a join source');
  const target = current.tiles.find(tile => tile.text === expectedTarget);
  assert(target);
  assert.equal(current.hintTarget, target.id);
  assert(current.description.includes(expectedAnchor) && current.description.includes(expectedTarget));
  assert.match(await page.locator('[data-description]').innerText(), new RegExp(`残り${remaining}回`));
  const chain = current.chains.find(chain => chain.tiles.includes(target.id));
  assert(chain.tiles.length >= minimumGroupSize);
  const index = chain.tiles.indexOf(target.id);
  for (const paper of await graphics()) {
    const actual = parseHintCommands(paper.commands);
    if (paper.chainId !== chain.id) { assert.equal(actual.length, 0); continue; }
    const range = paper.ranges[index];
    const expected = paper.glyphs.filter(glyph => glyph.index >= range.start && glyph.index < range.end)
      .map(glyph => ({ x: glyph.x, y: glyph.y, width: glyph.advance, height: CELL, color: 0xe3c66f, alpha: .58 }));
    assert(expected.length > 0);
    assert.deepEqual(actual, expected, 'Yellow paint must exactly match target fragment glyphs, not its entire provisional group');
  }
  await noAnswer();
};
const assertHelpFits = async () => {
  const labels = await page.evaluate(() => {
    const scene = window.__hintQaScene, result = [];
    const visit = node => {
      if (node.type === 'Text') { const b = node.getBounds(); result.push({ text: node.text, x: b.x, y: b.y, right: b.right, bottom: b.bottom }); }
      if (node.list) node.list.forEach(visit);
    };
    visit(scene.hud); return { width: scene.scale.width, height: scene.scale.height, labels: result };
  });
  for (const label of labels.labels) {
    assert(label.x >= -1 && label.y >= -1 && label.right <= labels.width + 1 && label.bottom <= labels.height + 1,
      `Help text overflows viewport: ${JSON.stringify(label)}`);
  }
  assert.match(await page.locator('[data-description]').innerText(), /ヒントは一問3回。取消・再表示は減りません。新しい問題を始めると3回に戻ります。/);
  return labels;
};
const assertDistinctActions = async ids => {
  const bounds = await page.evaluate(ids => {
    const scene = window.__hintQaScene;
    return ids.map(id => {
      const action = scene.actions.get(id);
      if (!action) throw new Error(`Missing action ${id}`);
      const b = action.bounds;
      return { id, x: b.x, y: b.y, right: b.right, bottom: b.bottom };
    });
  }, ids);
  for (let i = 0; i < bounds.length; i++) for (let j = i + 1; j < bounds.length; j++) {
    const a = bounds[i], b = bounds[j];
    assert(a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y,
      `Canvas actions overlap: ${a.id} and ${b.id}`);
  }
  return bounds;
};
const preparePage = async context => {
  const created = await context.newPage();
  created.on('pageerror', error => errors.push(String(error.stack || error)));
  created.on('requestfailed', request => requestFailures.push({ url: request.url(), error: request.failure()?.errorText }));
  await created.route('**/*', async route => {
    const request = route.request();
    if (request.resourceType() !== 'script' || new URL(request.url()).origin !== new URL(appUrl).origin) return route.continue();
    const response = await route.fetch();
    const original = await response.text();
    const needle = /this\.game\.canvas\.tabIndex\s*=\s*0\b/;
    if (!needle.test(original)) return route.fulfill({ response });
    const instrumented = original.replace(needle, match => `(window.__hintQaScene=this,${match})`);
    scripts.push({ url: request.url(), originalSha256: sha256(original), instrumentedSha256: sha256(instrumented), injection: 'Expose existing DeskScene reference only' });
    await route.fulfill({ response, body: instrumented });
  });
  await created.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await created.locator('[data-game-mode="selection"]').waitFor({ state: 'attached', timeout: 60000 });
  await created.waitForFunction(() => window.__hintQaScene?.alive, undefined, { timeout: 10000 });
  return created;
};
const assertSelection = async () => {
  await mode('selection'); await noAnswer();
  assert.equal(await page.title(), '青空パズル');
  assert.equal(await page.locator('h1').innerText(), '青空パズル');
  assert.equal(await page.locator('[data-action^="scene-"]').count(), 3);
  assert.equal(await page.locator('[data-action^="open-"]').count(), 1);
  for (let index = 0; index < works.length; index++) {
    assert.equal(await page.locator(`[data-action="scene-${index}"]`).innerText(), `『${works[index].title}』を選ぶ`);
  }
  assert.match(await page.locator('[data-action^="open-"]').innerText(), /2問からランダムに始める/);
};
const openWork = async (index, touch = false) => {
  await physicalAction(`scene-${index}`, touch);
  await page.locator(`[data-action="open-${works[index].id}"]`).waitFor({ state: 'attached' });
  await physicalAction(`open-${works[index].id}`, touch);
  await mode('assembling'); await noAnswer();
  const current = await state();
  assert.equal(current.workId, works[index].workId);
  assert.equal(current.remaining, 3);
  const passage = PASSAGES.find(p => p.id === current.passageId);
  assert(passage, 'Served question must match the local curated data');
  assert.deepEqual((await pieces()).map(piece => piece.text).sort(), [...passage.fragments].sort());
  return passage;
};
const solve = async passage => {
  let chain = passage.fragments[0];
  for (const text of passage.fragments.slice(1)) { await join(chain, text); chain += text; }
  await mode('assembling'); await noAnswer();
  assert.equal((await pieces()).length, 1);
  assert.equal(await page.locator('[data-action="check"]').count(), 1);
};

try {
  browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
  currentContext = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  page = await preparePage(currentContext);
  stage = 'desktop work selection';
  await assertSelection(); await shot('desktop-selection');
  record('Exactly three work tabs and two-question random-start invitation');
  for (let workIndex = 0; workIndex < works.length; workIndex++) {
    let passage = await openWork(workIndex);
    const seenInWork = new Set();
    for (let iteration = 0; iteration < 2; iteration++) {
      stage = `${passage.id}: assemble and replay`;
      const texts = passage.fragments;
      if (workIndex === 0 && iteration === 0) {
        stage = `${passage.id}: detailed desktop hints`;
        const initial = await state();
        await physicalAction('hint'); await mode('hint-select');
        assert.equal((await state()).remaining, 3); await assertUnpainted();
        await shot('desktop-hint-selection');
        await physicalAction('hint'); await mode('assembling');
        assert.equal((await state()).remaining, 3);
        await hint(texts.at(-1)); await mode('hint-select');
        assert.match((await state()).notice, /続きを表示できません/);
        assert.equal((await state()).remaining, 3); await assertUnpainted();
        await page.locator('canvas').focus(); await page.keyboard.press('Escape'); await mode('assembling');
        assert.equal((await state()).remaining, 3);
        record('Actual mouse hint activation, button/Escape cancellation, and final-fragment unavailable are free');

        // Deliberately incorrect provisional groups: the anchor is their LAST tile,
        // while the requested successor lies in the MIDDLE of another wrong group.
        await join(texts[4], texts[0]);
        await join(texts[3], texts[1]);
        await join(texts[3] + texts[1], texts[5]);
        await assertUnpainted();
        const anchor = texts[4] + texts[0], targetGroup = texts[3] + texts[1] + texts[5];
        assert((await pieces()).some(piece => piece.text === targetGroup));
        const beforeHint = await state();
        await physicalAction('hint'); await mode('hint-select');
        const point = await paperPoint(anchor);
        await page.mouse.move(point.x, point.y); await page.mouse.down();
        await page.mouse.move(point.x + 30, point.y + 20, { steps: 4 });
        await page.mouse.up();
        await mode('hint-select');
        assert.deepEqual((await state()).chains, beforeHint.chains, 'Dragging while choosing a hint must not move or join paper');
        assert.equal((await state()).remaining, 3);
        await physicalPaper(anchor);
        await assertHighlight(texts[0], texts[1], 2, 3);
        assert.deepEqual((await state()).chains, beforeHint.chains, 'Hint does not auto-join or change arrangement');
        await shot('desktop-hint');
        record('Real canvas group selection uses its last fragment; yellow targets only the exact successor inside an incorrect three-fragment group');
        await hint(anchor); await assertHighlight(texts[0], texts[1], 2, 3);
        assert.match((await state()).notice, /前に見たヒント/);
        await action('undo');
        assert.equal((await state()).remaining, 2); await assertUnpainted();
        await action('undo'); await action('undo');
        assert.deepEqual((await state()).chains, initial.chains);
        assert.equal((await state()).remaining, 2, 'Undo never replenishes hints');
        await hint(texts[0]); await assertHighlight(texts[0], texts[1], 2);
        await hint(texts[2]); await assertHighlight(texts[2], texts[3], 1);
        await hint(texts[4]); await assertHighlight(texts[4], texts[5], 0);
        const exhausted = await state();
        await hint(texts[6]); await mode('hint-select');
        assert.equal((await state()).remaining, 0);
        assert.match((await state()).notice, /残り0回/);
        const exhaustedNotice = (await state()).notice;
        assert.deepEqual((await state()).chains, exhausted.chains); await assertUnpainted();
        await physicalPaper(texts[0]); await assertHighlight(texts[0], texts[1], 0);
        assert.match((await state()).notice, /前に見たヒント/);
        await hint(texts.at(-1)); await mode('hint-select');
        assert.equal((await state()).notice, exhaustedNotice, 'At zero, final and other uncached anchors must give identical exhausted feedback');
        assert.equal((await state()).remaining, 0);
        await physicalAction('hint'); await mode('assembling');
        record('Three new hints exhaust the session; repeats remain free at zero, uncached final uses identical exhausted feedback, Undo neither erases hints nor restores budget');

        await physicalAction('help'); await mode('help'); await assertHelpFits();
        await shot('desktop-help');
        await physicalAction('reading-clues'); await mode('hint');
        assert.equal(await page.locator('[data-description]').innerText(), passage.hints[0]);
        await action('hint-next'); assert.equal(await page.locator('[data-description]').innerText(), passage.hints[1]);
        await action('hint-prev'); assert.equal(await page.locator('[data-description]').innerText(), passage.hints[0]);
        await physicalAction('close'); await mode('assembling');
        assert.equal((await state()).remaining, 0); await noAnswer();
        record('Desktop help explains budget/reset and semantic clues remain reachable without spending exact hints');
      }
      await solve(passage);
      await physicalAction('check'); await mode('complete');
      assert.equal(await page.locator('[data-original]').innerText(), passage.original);
      assert.equal(await page.locator('[data-action="source"]').count(), 1);
      assert.equal(await page.locator('[data-action="again"]').innerText(), '次の問題');
      await shot(`complete-${passage.id}`);
      solved.push(passage.id); seenInWork.add(passage.id);
      if (workIndex === 0 && iteration === 0) {
        await shot('desktop-completion');
        await action('undo'); await mode('assembling'); await noAnswer();
        assert.equal((await state()).remaining, 0);
        assert.equal((await pieces()).length, 1);
        await physicalAction('check'); await mode('complete');
        record('Completed-original/source appear only after explicit check; Undo removes them without replenishing hints');
      }
      const prior = await state();
      await physicalAction('again'); await mode('assembling'); await noAnswer();
      const next = await state();
      assert.notEqual(next.passageId, prior.passageId, 'Next question must change excerpt');
      assert.equal(next.workId, prior.workId, 'Next stays in selected work');
      assert.equal(next.remaining, 3, 'New Session restores three hints');
      assert(next.tiles.every(tile => !prior.tiles.some(old => old.id === tile.id)), 'New Session has fresh tile IDs');
      record(`${passage.id}: solve/check/source/next-question`, { nextPassageId: next.passageId });
      passage = PASSAGES.find(p => p.id === next.passageId);
      assert(passage);
    }
    assert.equal(seenInWork.size, 2, 'Both questions in each work were solved');
    await physicalAction('library'); await mode('leave');
    await physicalAction('confirm'); await mode('selection');
  }
  assert.deepEqual([...new Set(solved)].sort(), PASSAGES.map(p => p.id).sort());
  record('All six curated questions solved through shared accessible Session controls and replay excludes the immediately previous question');
  await currentContext.close();

  stage = '320px touch selection';
  currentContext = await browser.newContext({ viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page = await preparePage(currentContext);
  await assertSelection();
  for (const index of [1, 2, 0]) {
    await physicalAction(`scene-${index}`, true);
    await page.locator(`[data-action="open-${works[index].id}"]`).waitFor({ state: 'attached' });
    await assertSelection(); await shot(`mobile-320-selection-${index + 1}`);
  }
  await shot('mobile-320-selection');
  const mobilePassage = await openWork(0, true), mobileTexts = mobilePassage.fragments;
  const mobileInitial = await state();
  await physicalAction('hint', true); await mode('hint-select');
  await shot('mobile-320-hint-selection');
  await physicalAction('hint', true); await mode('assembling');
  assert.equal((await state()).remaining, 3);
  await hint(mobileTexts[0], true); await assertHighlight(mobileTexts[0], mobileTexts[1], 2);
  assert.deepEqual((await state()).chains, mobileInitial.chains);
  await shot('mobile-320-hint');
  await hint(mobileTexts[0], true); await assertHighlight(mobileTexts[0], mobileTexts[1], 2);
  await hint(mobileTexts.at(-1), true); await mode('hint-select');
  assert.equal((await state()).remaining, 2); assert.match((await state()).notice, /続きを表示できません/);
  await physicalAction('hint', true); await mode('assembling');
  record('320px real touch taps select all three work titles, open puzzle, activate/cancel hint, select paper, repeat freely and reject final fragment without spending');

  stage = '320px help and completion';
  await physicalAction('help', true); await mode('help');
  const mobileHelpBounds = await assertHelpFits(); await shot('mobile-320-help');
  await physicalAction('reading-clues', true); await mode('hint');
  assert.equal(await page.locator('[data-description]').innerText(), mobilePassage.hints[0]);
  await noAnswer(); await physicalAction('close', true); await mode('assembling');
  assert.equal((await state()).remaining, 2);
  record('320px help text stays inside viewport and exposes full accessible budget/reset instructions', { textBounds: mobileHelpBounds.labels });
  // A touch-only player must still reach help after every piece has been joined.
  const wrongOrder = [mobileTexts[1], mobileTexts[0], ...mobileTexts.slice(2)];
  let wrongChain = wrongOrder[0];
  for (const text of wrongOrder.slice(1)) { await join(wrongChain, text); wrongChain += text; }
  await mode('assembling'); await noAnswer();
  const fullChainBounds = await assertDistinctActions(['undo', 'check', 'hint']);
  await shot('mobile-320-fullchain');
  const beforeWrongCheck = await state();
  await physicalAction('check', true); await mode('assembling');
  assert.match((await state()).notice, /原文とは/);
  assert.deepEqual((await state()).chains, beforeWrongCheck.chains);
  assert.equal((await state()).remaining, 2); await noAnswer();
  await physicalAction('settings', true); await mode('settings');
  await physicalAction('help', true); await mode('help'); await assertHelpFits();
  await physicalAction('reading-clues', true); await mode('hint');
  assert.equal(await page.locator('[data-description]').innerText(), mobilePassage.hints[0]);
  await physicalAction('close', true); await mode('assembling');
  assert.equal((await state()).remaining, 2);
  for (let i = 1; i < mobileTexts.length; i++) await action('undo');
  assert.deepEqual((await state()).chains, mobileInitial.chains);
  record('320px full-chain undo/check/hint targets do not overlap; a failed check preserves arrangement and touch settings → help → reading clues remains available', { actionBounds: fullChainBounds });
  await solve(mobilePassage); await assertDistinctActions(['undo', 'check', 'hint']);
  await physicalAction('check', true); await mode('complete');
  assert.equal(await page.locator('[data-original]').innerText(), mobilePassage.original);
  assert.equal(await page.locator('[data-action="source"]').count(), 1);
  await shot('mobile-320-completion');
  const mobilePrior = await state();
  await physicalAction('again', true); await mode('assembling'); await noAnswer();
  assert.notEqual((await state()).passageId, mobilePrior.passageId);
  assert.equal((await state()).remaining, 3);
  record('320px full solve, completion/source display and real-touch next-question restore three hints');
  assert.deepEqual(errors, [], 'No uncaught browser errors');
  assert(scripts.length >= 2, 'Both browser contexts were instrumented');
  fs.writeFileSync(path.join(evidenceDir, 'results.json'), JSON.stringify(report('passed'), null, 2));
  console.log(`Evidence: ${evidenceDir}`);
} catch (error) {
  if (page && !page.isClosed()) {
    await page.screenshot({ path: path.join(evidenceDir, 'failure.png') }).catch(() => {});
    fs.writeFileSync(path.join(evidenceDir, 'failure-body.txt'), await page.locator('body').innerText().catch(() => 'unavailable'));
  }
  fs.writeFileSync(path.join(evidenceDir, 'results.json'), JSON.stringify(report('failed', error), null, 2));
  throw error;
} finally {
  await browser?.close();
}

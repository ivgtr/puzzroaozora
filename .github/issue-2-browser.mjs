import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const dir = '/tmp/evidence'; await mkdir(dir, { recursive: true });
const browser = await chromium.launch({ args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [], errors = [];
async function capture(page, name) { await page.evaluate(() => document.activeElement?.blur()); await page.waitForTimeout(400); await page.screenshot({ path: `${dir}/${name}.png` }); }
async function press(page, name) { const button = page.getByRole('button', { name, exact: true }); await button.focus(); await button.press('Enter'); await page.waitForTimeout(160); }
async function join(page, moving, target, before = false) {
  const source = page.locator(`[data-chain="${moving}"] > button`).first(); await source.focus(); await source.press('Enter');
  const button = page.locator(`[data-chain="${target}"]`).getByRole('button', { name: before ? 'この塊の前につなぐ' : 'この塊の後につなぐ', exact: true });
  await button.focus(); await button.press('Enter'); await page.waitForTimeout(90);
}
for (const config of [{ name: 'desktop', width: 1280, height: 900, dpr: 1 }, { name: 'mobile', width: 390, height: 844, dpr: 3 }]) {
  const context = await browser.newContext({ viewport: { width: config.width, height: config.height }, deviceScaleFactor: config.dpr, isMobile: config.name === 'mobile', hasTouch: config.name === 'mobile', recordVideo: config.name === 'desktop' ? { dir, size: { width: 1280, height: 900 } } : undefined });
  const page = await context.newPage(); page.on('pageerror', (e) => errors.push(`${config.name}: ${e.stack}`));
  try {
    await page.goto('http://localhost:5678', { waitUntil: 'networkidle', timeout: 90000 });
    await page.getByRole('button', { name: 'Normal・3枚で確定', exact: true }).waitFor({ state: 'attached', timeout: 30000 });
    await capture(page, `library-${config.name}`);
    assert.equal(await page.locator('.game-canvas canvas').count(), 1);
    await press(page, 'Normal・3枚で確定');
    // Normal game selection and start are canvas clicks, not direct state mutation.
    if (config.name === 'desktop') await page.mouse.click(780, 425);
    else await page.touchscreen.tap(180, 505);
    await page.locator('[data-original]').waitFor({ state: 'attached', timeout: 30000 });
    assert.ok((await page.locator('[data-original]').textContent()).startsWith('メロスは激怒した。'));
    await capture(page, `read-${config.name}`);
    if (config.name === 'desktop') await page.mouse.click(config.width - 138, config.height - 35);
    else await page.touchscreen.tap(config.width - 99, config.height - 35);
    await page.locator('[data-chain]').first().waitFor({ state: 'attached' });
    assert.equal(await page.locator('[data-chain]').count(), 30); assert.equal(await page.locator('[data-original]').count(), 0);
    await capture(page, `board-${config.name}`);
    const state = await page.evaluate(() => {
      const scene = window.__game.scene.getScene('Desk'), cam = scene.cameras.main;
      return [...scene.papers].slice(0, 2).map(([id, paper]) => ({ id, x: paper.root.x - cam.scrollX, y: paper.root.y - cam.scrollY + cam.y, width: paper.layout.width, height: paper.layout.height }));
    });
    if (config.name === 'desktop') {
      const first = state[0], second = state[1];
      await page.mouse.move(first.x + 30, first.y + 25); await page.mouse.down(); await page.mouse.move(first.x + 65, first.y + 80, { steps: 10 }); await page.mouse.up();
      const moved = await page.evaluate((id) => { const paper = window.__game.scene.getScene('Desk').papers.get(id); return { x: paper.root.x, y: paper.root.y }; }, first.id);
      assert.ok(Math.abs(moved.y - (first.y - 100)) > 20, 'drag moves the selected paper');
      await page.mouse.click(moved.x + 25, moved.y + 125);
      await page.mouse.click(second.x + second.width + 20, second.y + 29);
      assert.equal(await page.locator('[data-chain]').count(), 29, 'canvas endpoint joins intentionally');
      const seam = await page.evaluate((id) => { const scene = window.__game.scene.getScene('Desk'), paper = scene.papers.get(id), point = paper.layout.boundaries[0]; return { x: paper.root.x + point.x - scene.cameras.main.scrollX, y: paper.root.y + point.y - 4 - scene.cameras.main.scrollY + 100 }; }, second.id);
      await page.mouse.click(seam.x, seam.y); await page.waitForTimeout(120);
      assert.equal(await page.locator('[data-chain]').count(), 30, 'canvas seam splits tentative chain');
      results.push('desktop: canvas drag, endpoint click and tentative split');
    }
    // Build an independent middle block, tail, then prepend the beginning.
    await join(page, 'piece-11', 'piece-10'); await join(page, 'piece-12', 'piece-10');
    for (let i = 13; i < 30; i++) await join(page, `piece-${i}`, 'piece-10');
    await capture(page, `long-chain-${config.name}`);
    for (let i = 9; i >= 0; i--) await join(page, `piece-${i}`, 'piece-10', true);
    await page.locator('[data-original]').waitFor({ state: 'attached' }); assert.equal(await page.locator('[data-chain]').count(), 0);
    await capture(page, `complete-${config.name}`);
    const details = await page.evaluate(() => ({ canvas: document.querySelectorAll('.game-canvas canvas').length, textures: Object.keys(window.__game.textures.list).length, soundCount: window.__game.sound.sounds.length, phase: window.__game.scene.getScene('Desk').controller.session.phase, scrollHeight: document.documentElement.scrollHeight, height: innerHeight }));
    assert.equal(details.canvas, 1); assert.equal(details.phase, 'complete'); assert.equal(details.scrollHeight, details.height);
    await press(page, '次の原稿'); await page.locator('[data-original]').waitFor({ state: 'attached' });
    results.push(`${config.name}: 30 pieces, middle-first Normal completion, same canvas, next reading; ${JSON.stringify(details)}`);
    await press(page, '作品一覧へ'); await press(page, '作品を取り込む');
    await page.getByLabel('青空文庫のURL', { exact: true }).fill('https://www.aozora.gr.jp/cards/999999/card999999.html');
    await page.getByRole('button', { name: '取り込む', exact: true }).click();
    await page.getByRole('button', { name: /検証用の蔵書/ }).waitFor({ state: 'attached', timeout: 30000 });
    await press(page, '検証用の蔵書／夏目漱石（取り込んだ作品）');
    await page.locator('[data-original]').waitFor({ state: 'attached' });
    results.push(`${config.name}: import contract fixture -> IndexedDB -> signed stored passage -> existing generator -> reading`);
    await page.goto('http://localhost:5678/type-study', { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(2000); await capture(page, `type-study-${config.name}`);
    await page.mouse.move(250, 600); await page.mouse.wheel(0, config.name === 'mobile' ? 1120 : 730); await page.waitForTimeout(300); await capture(page, `glyph-study-${config.name}`);
    await page.goto('http://localhost:5678', { waitUntil: 'networkidle' }); await page.waitForTimeout(1000);
    assert.equal(await page.locator('.game-canvas canvas').count(), 1);
    await page.goto('http://localhost:5678/play', { waitUntil: 'networkidle' }); assert.equal(new URL(page.url()).pathname, '/');
    results.push(`${config.name}: specimen, re-entry and legacy URL`);
  } catch (error) { errors.push(`${config.name} TEST: ${error.stack}`); await capture(page, `failure-${config.name}`); await writeFile(`${dir}/failure-${config.name}.txt`, await page.locator('body').innerText()); }
  await context.close();
}
await browser.close(); await writeFile(`${dir}/results.json`, JSON.stringify({ results, errors }, null, 2));
console.log(JSON.stringify({ results, errors }, null, 2)); if (errors.length) process.exitCode = 1;

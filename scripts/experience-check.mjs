// Temporary design checkpoint, removed after final verification.
import { chromium } from '/tmp/browser/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const browser = await chromium.launch({args:['--enable-unsafe-swiftshader']});
const errors=[];
try {
 for (const [name,width,height,mobile] of [['desktop',1280,800,false],['mobile',390,844,true],['small',320,568,true],['landscape',844,390,true]]) {
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:2,isMobile:mobile,hasTouch:mobile});
  const page=await context.newPage(); page.on('pageerror',e=>errors.push(e.stack));
  await page.goto('http://127.0.0.1:5678');
  await page.locator('[data-game-mode="selection"]').waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({path:`/tmp/evidence/${name}-selection.png`});
  assert.equal(await page.locator('[data-original]').count(),0);
  // Actual canvas invitation control: shared geometry, never hidden action click.
  const w=Math.min(620,width-40), h=Math.min(height<580?292:472,height-132), x=(width-w)/2,y=Math.max(68,(height-h)/2-14), margin=width<700?28:54;
  const sx=x+w-margin-63, sy=y+h-47;
  if(mobile) await page.touchscreen.tap(sx,sy); else await page.mouse.click(sx,sy);
  await page.locator('[data-game-mode="assembling"]').waitFor(); await page.waitForTimeout(350);
  assert.equal(await page.locator('[data-original]').count(),0);
  await page.screenshot({path:`/tmp/evidence/${name}-desk.png`});
  await context.close();
 }
 assert.deepEqual(errors,[]); fs.writeFileSync('/tmp/evidence/results.json',JSON.stringify({checkpoint:true,errors},null,2));
} finally { await browser.close(); }

// Temporary, one-off browser verification; no application dependency or test hook.
import { chromium } from '/tmp/browser/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const passages = JSON.parse(fs.readFileSync('/tmp/passages.json', 'utf8'));
const browser = await chromium.launch({args: ['--enable-unsafe-swiftshader']});
const errors = [];
const checks = [];
let page;
const action = async (id) => { await page.locator(`[data-action="${id}"]`).evaluate(node => node.click()); };
const mode = async (value) => page.locator(`[data-game-mode="${value}"]`).waitFor();
const pieces = async () => page.locator('[data-piece]').evaluateAll(nodes => nodes.map(node => ({id:node.dataset.piece,text:node.textContent,selected:node.getAttribute('aria-pressed')})));
const selected = async (text) => { const found=(await pieces()).find(p=>p.text===text); assert(found, `Missing paper ${text}`); await page.locator(`[data-piece="${found.id}"]`).evaluate(node=>node.click()); return found.id; };
const join = async (left,right) => { const id=(await pieces()).find(p=>p.text===left)?.id; assert(id); await selected(right); await action(`join:after:${id}`); };
const shot = async (name) => { await page.waitForTimeout(550); await page.screenshot({path:`/tmp/evidence/${name}.png`}); };
try {
  const desktop=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:2});
  page=await desktop.newPage(); page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:5678'); await mode('library'); await shot('desktop-library');
  await action('open-cat-first'); await mode('reading'); await shot('desktop-reading');
  await action('begin'); await mode('assembling'); await shot('desktop-desk');
  assert.equal(await page.locator('[data-original]').count(),0); assert.equal((await pieces()).length,12);
  // A real canvas drag into empty workspace, followed by immediate Undo.
  await page.mouse.move(80,146); await page.mouse.down(); await page.mouse.move(76,685,{steps:10}); await page.mouse.up();
  await action('undo'); assert.equal((await pieces()).length,12); checks.push('canvas drag + Undo');
  const first=passages[0].fragments;
  await join(first[0],first[2]); assert.equal((await pieces()).length,11);
  const wrong=(await pieces()).find(p=>p.text===first[0]+first[2]); assert(wrong);
  await selected(wrong.text); await action(`split:${wrong.id}:0`); assert.equal((await pieces()).length,12);
  await action('undo'); assert.equal((await pieces()).length,11); await action('undo'); assert.equal((await pieces()).length,12);
  checks.push('tentative join, split and repeated Undo');
  await selected(first[1]);
  await action('review'); await mode('review'); assert.equal(await page.locator('[data-original]').count(),1);
  await action('close'); await mode('assembling'); assert.equal(await page.locator('[data-original]').count(),0);
  assert((await pieces()).find(p=>p.text===first[1] && p.selected==='true'));
  await action('settings'); await action('mute'); await action('motion'); await action('close');
  await action('library'); await mode('leave'); await action('close'); await mode('assembling');
  checks.push('review/settings/leave cancellation preserve selected desk');
  // Cancel a held real gesture through Escape; next drag remains usable.
  await page.mouse.move(80,146); await page.mouse.down(); await page.mouse.move(160,180,{steps:4});
  await page.keyboard.press('Escape'); await page.mouse.up(); assert.equal((await pieces()).length,12);
  checks.push('interrupted drag');
  let chain=first[0];
  for(const text of first.slice(1)){ await join(chain,text); chain+=text; }
  await mode('complete'); await shot('desktop-complete');
  await action('undo'); await mode('assembling'); assert.equal((await pieces()).length,2);
  await join(first.slice(0,-1).join(''),first.at(-1)); await mode('complete');
  await action('again'); await mode('reading'); await action('begin'); await mode('assembling'); assert.equal((await pieces()).length,12);
  checks.push('complete, Undo completion, complete again, replay');
  await action('library'); await action('confirm'); await mode('library');
  await action('difficulty-hard'); await action('open-galaxy-lesson'); await action('begin'); await mode('assembling'); assert.equal((await pieces()).length,30);
  await shot('desktop-hard');
  await desktop.close();
  const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  page=await mobile.newPage(); page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:5678'); await mode('library'); await shot('mobile-library');
  await action('open-cat-first'); await mode('reading'); await shot('mobile-reading');
  await action('begin'); await mode('assembling'); await shot('mobile-desk');
  await page.touchscreen.tap(80,166); assert((await pieces()).some(p=>p.selected==='true'));
  const cdp=await mobile.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:70,y:250},{x:220,y:430}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:50,y:230},{x:250,y:460}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.equal((await pieces()).length,12);
  await action('overview'); await action('review'); await mode('review'); await shot('mobile-review'); await action('close');
  await page.setViewportSize({width:844,height:390}); await shot('mobile-landscape'); assert.equal(await page.locator('canvas').count(),1);
  await page.setViewportSize({width:390,height:844});
  chain=first[0]; for(const text of first.slice(1)){await join(chain,text);chain+=text;}
  await mode('complete'); await shot('mobile-complete');
  checks.push('touch selection, pinch without joins, review, rotation, full mobile completion');
  assert.deepEqual(errors,[]);
  fs.writeFileSync('/tmp/evidence/results.json',JSON.stringify({checks,errors,desktop:'1280x800 DPR2',mobile:'390x844 DPR2; 844x390 rotation',note:'Real pointer/touch representative interactions; full completion uses the shared accessible commands. No physical-device or human listening claim.'},null,2));
  console.log(JSON.stringify({checks,errors},null,2));
} catch(error) { if(page) await page.screenshot({path:'/tmp/evidence/failure.png'}); throw error; }
finally { await browser.close(); }

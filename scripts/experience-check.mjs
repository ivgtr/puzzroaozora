// Temporary end-to-end evidence, removed after final verification.
import { chromium } from '/tmp/browser/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { dealManuscript, layoutManuscript, CELL } from '../src/game/layout.ts';
const passages=JSON.parse(fs.readFileSync('/tmp/passages.json','utf8'));
const browser=await chromium.launch({args:['--enable-unsafe-swiftshader']});
const errors=[],checks=[]; let page;
const mode=async value=>page.locator(`[data-game-mode="${value}"]`).waitFor();
const action=async id=>page.locator(`[data-action="${id}"]`).evaluate(node=>node.click());
const pieces=async()=>page.locator('[data-piece]').evaluateAll(nodes=>nodes.map(node=>({id:node.dataset.piece,text:node.textContent,selected:node.getAttribute('aria-pressed')})));
const pick=async text=>{const found=(await pieces()).find(p=>p.text===text);assert(found,`Missing piece ${text}`);await page.locator(`[data-piece="${found.id}"]`).evaluate(node=>node.click());return found.id;};
const join=async(left,right)=>{const id=(await pieces()).find(p=>p.text===left)?.id;assert(id);await pick(right);await action(`join:after:${id}`);};
const shot=async name=>{await page.waitForTimeout(250);await page.screenshot({path:`/tmp/evidence/${name}.png`});};
const noAnswer=async()=>{assert.equal(await page.locator('[data-original]').count(),0);assert.equal(await page.locator('[data-action="source"]').count(),0);assert.equal(await page.locator('[data-action="review"]').count(),0);};
const open=async index=>{await action(`scene-${index}`);await action(`open-${passages[index].id}`);await mode('assembling');};
try {
 const desktop=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:2});
 page=await desktop.newPage();page.on('pageerror',e=>errors.push(e.stack));
 await page.goto('http://127.0.0.1:5678');await mode('selection');await shot('desktop-selection');await noAnswer();
 // Canvas invitation hit area, with no DOM helper.
 await page.mouse.click(833,575);await mode('assembling');await shot('desktop-desk');await noAnswer();
 const start=await pieces(),pos=dealManuscript(start.map(p=>p.text),16,1280),a=layoutManuscript(start[0].text,16),b=layoutManuscript(start[1].text,16);
 const sx=pos[1].x+22;
 await page.mouse.move(sx,pos[1].y+b.glyphs[0].y+CELL/2+76);await page.mouse.down();
 await page.mouse.move(pos[0].x+a.width+22,pos[0].y+a.glyphs.at(-1).y+CELL/2+76,{steps:12});
 assert.equal((await pieces()).length,start.length);await shot('desktop-connecting');
 await page.mouse.up();assert.equal((await pieces()).length,start.length-1);assert((await pieces()).some(p=>p.text===start[0].text+start[1].text));
 await action('undo');assert.equal((await pieces()).length,start.length);checks.push('Real desktop drag joins only on release; undo restores pieces');
 await page.mouse.move(pos[0].x+22,pos[0].y+28+76);await page.mouse.down();await page.mouse.move(600,450,{steps:5});await page.keyboard.press('Escape');await page.mouse.up();assert.equal((await pieces()).length,start.length);checks.push('Interrupted drag restores stable state');
 await action('library');await action('confirm');await mode('selection');
 for(let index=0;index<passages.length;index++){
  const passage=passages[index],texts=passage.fragments;await open(index);await noAnswer();assert.equal((await pieces()).length,texts.length);
  await page.locator('canvas').focus();await page.keyboard.press('r');await noAnswer();assert.equal(await page.locator('[data-action="check"]').count(),0);
  await action('hint');await mode('hint');await noAnswer();await shot(`scene-${index+1}-hint`);await action('hint-next');assert.equal(await page.locator('[data-description]').innerText(),passage.hints[1]);await action('hint-prev');assert.equal(await page.locator('[data-description]').innerText(),passage.hints[0]);await action('close');await mode('assembling');
  await join(texts[0],texts[1]);await pick(texts[0]+texts[1]);assert.equal(await page.locator('[data-action^="split:"]').count(),1);await noAnswer();await action('undo');
  // Assemble a demonstrably different text; no automatic completion or seam lock.
  const wrong=[texts[1],texts[0],...texts.slice(2)];let chain=wrong[0];
  for(const text of wrong.slice(1)){await join(chain,text);chain+=text;}
  await mode('assembling');assert.equal((await pieces()).length,1);await noAnswer();
  await pick(chain);assert.equal(await page.locator('[data-action^="split:"]').count(),texts.length-1);
  const before=await pieces();await action('check');await mode('assembling');assert.deepEqual(await pieces(),before);await noAnswer();await shot(`scene-${index+1}-incorrect`);
  await action('check');assert.deepEqual(await pieces(),before);
  for(let n=1;n<texts.length;n++)await action('undo');assert.equal((await pieces()).length,texts.length);
  chain=texts[0];for(const text of texts.slice(1)){await join(chain,text);chain+=text;}
  await mode('assembling');await noAnswer();await shot(`scene-${index+1}-assembled`);await action('check');await mode('complete');
  assert.equal(await page.locator('[data-original]').innerText(),passage.original);assert.equal(await page.locator('[data-action="source"]').count(),1);await shot(`scene-${index+1}-complete`);
  await action('undo');await mode('assembling');assert.equal((await pieces()).length,1);await noAnswer();await action('check');await mode('complete');
  await action('again');await mode('assembling');assert.equal((await pieces()).length,texts.length);await noAnswer();
  await action('settings');await action('motion');await action('close');await action('library');await action('close');await mode('assembling');await action('library');await action('confirm');await mode('selection');
  checks.push(`${passage.sceneTitle}: no pre-clear source, same partial feedback, all seams splittable, incorrect whole check preserves arrangement/history, exact original clear, undo/recheck/replay`);
 }
 await desktop.close();
 const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});page=await mobile.newPage();page.on('pageerror',e=>errors.push(e.stack));
 await page.goto('http://127.0.0.1:5678');await mode('selection');await shot('mobile-selection');await page.touchscreen.tap(279,583);await mode('assembling');await shot('mobile-desk');
 const mp=await pieces(),pp=dealManuscript(mp.map(p=>p.text),10,390),ml=layoutManuscript(mp[1].text,10);
 await page.touchscreen.tap(pp[0].x+24,pp[0].y+28.5+76);await page.touchscreen.tap(pp[1].x+ml.width,pp[1].y+ml.glyphs.at(-1).y+CELL/2+76);assert.equal((await pieces()).length,mp.length-1);await shot('mobile-joined');await action('undo');
 const cdp=await mobile.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:60,y:210},{x:250,y:430}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:45,y:195},{x:270,y:450}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.equal((await pieces()).length,mp.length);
 await action('hint');await action('close');await action('overview');await shot('mobile-overview');
 await page.setViewportSize({width:844,height:390});await shot('landscape-desk');assert.equal(await page.locator('canvas').count(),1);await page.setViewportSize({width:390,height:844});
 let chain=passages[0].fragments[0];for(const text of passages[0].fragments.slice(1)){await join(chain,text);chain+=text;}await mode('assembling');await shot('mobile-assembled');await action('check');await mode('complete');await shot('mobile-complete');
 await action('library');await mode('selection');await page.setViewportSize({width:320,height:568});await shot('small-selection');await page.touchscreen.tap(244,385);await mode('assembling');await shot('small-desk');
 checks.push('Actual mobile invitation, tap-to-join, undo, pinch without accidental join, portrait/landscape resize, completion; 320px entry');
 assert.deepEqual(errors,[]);fs.writeFileSync('/tmp/evidence/results.json',JSON.stringify({checks,errors,desktop:'1280x800 DPR2',mobile:'390x844 DPR2; 844x390 rotation; 320x568',note:'Representative real pointer/touch controls; all-scene full assembly uses the shared accessible Session commands. No physical-device/listening/human-playtest claim.'},null,2));
} catch(error){if(page){await page.screenshot({path:'/tmp/evidence/failure.png'});fs.writeFileSync('/tmp/evidence/failure.txt',await page.locator('body').innerText()+'\n'+JSON.stringify(errors));}throw error;}
finally{await browser.close();}

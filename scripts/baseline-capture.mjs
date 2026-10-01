import { chromium } from '/tmp/browser/node_modules/playwright/index.mjs';
const browser=await chromium.launch({args:['--enable-unsafe-swiftshader']});
try {
  const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:2});
  await page.goto('http://127.0.0.1:5679'); await page.locator('[data-game-mode="library"]').waitFor();
  await page.screenshot({path:'/tmp/evidence/before-library.png'});
  await page.locator('[data-action="open-cat-first"]').evaluate(n=>n.click());
  await page.locator('[data-game-mode="reading"]').waitFor();
  await page.locator('[data-action="begin"]').evaluate(n=>n.click());
  await page.locator('[data-game-mode="assembling"]').waitFor();
  await page.waitForTimeout(1000);
  await page.screenshot({path:'/tmp/evidence/before-desk.png'});
} finally {await browser.close();}

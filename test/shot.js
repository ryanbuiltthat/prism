// Real-browser render check: load preview.html, collect console errors,
// screenshot light + dark. Run: node test/shot.js
'use strict';
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const url = 'file://' + path.join(__dirname, 'preview.html').replace(/\\/g, '/');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1180, height: 1000 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  const assets = path.join(__dirname, '..', 'docs', 'assets');

  await page.goto(url);
  await page.waitForTimeout(1000); // let history + forecast promises + render settle
  const cards = await page.locator('prism-power-card').count();
  await page.screenshot({ path: path.join(__dirname, 'shot-light.png'), fullPage: true });
  // Committed showcase: just the card grid (no test-harness chrome).
  await page.locator('#grid').screenshot({ path: path.join(assets, 'preview-light.png') });

  await page.click('#theme');
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(__dirname, 'shot-dark.png'), fullPage: true });
  await page.locator('#grid').screenshot({ path: path.join(assets, 'preview-dark.png') });

  await browser.close();
  console.log(`power-cards rendered: ${cards}`);
  console.log(errors.length ? 'CONSOLE ERRORS:\n' + errors.join('\n') : 'no console errors');
  process.exit(errors.length ? 1 : 0);
})();

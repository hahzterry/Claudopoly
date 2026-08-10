#!/usr/bin/env node
/**
 * record-gate-refusal.mjs — film the integrity gate refusing to start.
 *
 * This is not a mock-up. It plants a fabricated figure, then calls the SAME
 * runGate() and renderGateFailure() the game calls on every load, and records
 * what the player would actually see. The only thing staged is the planting.
 */
import { chromium } from 'playwright';
import { mkdirSync, readdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';

const URL = process.argv[2] || 'http://localhost:5178/';
const OUT = process.argv[3] || 'bench/video/refusal';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  recordVideo: { dir: OUT, size: { width: 1920, height: 1080 } },
});
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !document.getElementById('boot'), { timeout: 25000 }).catch(() => {});
await page.waitForTimeout(2400);          // hold on a working board

// Plant a fabricated price on the board, exactly as a careless edit would.
await page.evaluate(() => {
  const d = document.createElement('div');
  d.id = 'planted';
  d.setAttribute('data-money', '');
  d.style.cssText = 'position:fixed;left:50%;top:44%;transform:translate(-50%,-50%);' +
    'background:#FFF1E5;color:#16181C;font:700 34px/1.3 "Helvetica Neue",Helvetica,sans-serif;' +
    'padding:22px 30px;border-radius:6px;box-shadow:0 18px 50px rgba(0,0,0,.55);z-index:9000;text-align:center';
  d.innerHTML = 'Bond Street<br><span style="font-size:52px">£41,500,000</span>' +
    '<br><span style="font-size:17px;font-weight:400;opacity:.7">a figure nobody sourced</span>';
  document.body.appendChild(d);
});
await page.waitForTimeout(2600);          // let the fabricated number sit there

// Run the real gate over the real document, and render the real failure screen.
await page.evaluate(async () => {
  const integ = await import('/src/integrity.js');
  const fm = await import('/src/facts.js');
  const result = integ.runGate({ facts: fm.facts(), root: document.body, canvasLabels: [] });
  document.getElementById('planted')?.remove();
  integ.renderGateFailure(result, document.body);
});
await page.waitForTimeout(4200);          // hold the refusal, legible, for the freeze frame

await ctx.close();
await browser.close();

const files = readdirSync(OUT).filter((f) => f.endsWith('.webm'));
if (files.length) {
  const src = join(OUT, files[files.length - 1]);
  renameSync(src, join(OUT, 'refusal-raw.webm'));
  console.log('recorded ->', join(OUT, 'refusal-raw.webm'));
}

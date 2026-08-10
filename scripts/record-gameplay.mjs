#!/usr/bin/env node
/**
 * record-gameplay.mjs — record a scripted playthrough for social video.
 *
 * Square 1080x1080, because the target is a LinkedIn mobile feed. Plays a real
 * game against the real build — nothing is faked or sped up in the capture; any
 * pacing is done afterwards in ffmpeg.
 *
 * Usage: node scripts/record-gameplay.mjs [url] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync, readdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';

const URL = process.argv[2] || 'http://localhost:5178/';
const OUT = process.argv[3] || 'bench/video';
mkdirSync(OUT, { recursive: true });

// Landscape capture: the board is square-ish and a 1:1 viewport clipped its
// right-hand column. The social crop is composed afterwards in ffmpeg, where a
// letterboxed 4:5 canvas leaves room for text overlays.
const W = 1920, H = 1080;
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: 1,
  recordVideo: { dir: OUT, size: { width: W, height: H } },
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

const wait = (ms) => page.waitForTimeout(ms);
const click = async (matcher) => {
  const ok = await page.evaluate((m) => {
    const re = new RegExp(m, 'i');
    const btn = [...document.querySelectorAll('button')]
      .find((b) => re.test(b.getAttribute('aria-label') || '') || re.test(b.textContent || ''));
    if (btn && !btn.disabled) { btn.click(); return true; }
    return false;
  }, matcher);
  return ok;
};

/** The roll button greys out during the opponent's turn; wait for our go. */
const waitForOurTurn = async (ms = 14000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const ready = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')]
        .find((x) => /roll/i.test(x.getAttribute('aria-label') || x.textContent || ''));
      return !!b && !b.disabled && !document.getElementById('overlay')?.classList.contains('open');
    });
    if (ready) return true;
    // clear anything modal that is blocking the turn
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')]
        .find((x) => /continue|close|got it|dismiss|carry on/i.test(x.textContent || ''));
      if (b) b.click();
    });
    await page.waitForTimeout(400);
  }
  return false;
};

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !document.getElementById('boot'), { timeout: 25000 }).catch(() => {});
await wait(2200);                       // hold on the board: this is the opening frame

/* ---- play a real game ---- */
for (let turn = 0; turn < 18; turn++) {
  if (!(await waitForOurTurn())) break;
  const rolled = await click('roll');
  if (!rolled) break;
  await wait(3200);                     // dice, token travel, landing

  // Take whatever decision is offered, alternating so both routes appear.
  const decided = await page.evaluate((preferDebt) => {
    const btns = [...document.querySelectorAll('button')];
    const find = (re) => btns.find((b) => re.test(b.textContent || ''));
    const debt = find(/buy with debt/i);
    const outright = find(/buy outright/i);
    const pass = find(/^\s*pass/i);
    const pick = preferDebt ? (debt || outright) : (outright || debt);
    if (pick) { pick.click(); return pick.textContent.trim().slice(0, 30); }
    if (pass) { pass.click(); return 'pass'; }
    return null;
  }, turn % 3 === 1);
  if (decided) await wait(1800);

  // Dismiss a Gazette card if one is up.
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')]
      .find((x) => /continue|close|got it|dismiss/i.test(x.textContent || ''));
    if (b) b.click();
  });
  await wait(1400);
}

/* ---- show the data, which is the actual point ---- */
await click('nineteen thirty-five');
await wait(1200);
await page.evaluate(() => {
  const ov = document.getElementById('overlay');
  const sc = ov && [...ov.querySelectorAll('*')]
    .find((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 4);
  if (sc) sc.scrollTo({ top: 0 });
});
await wait(2200);
// slow scroll through the chart
for (let i = 0; i < 22; i++) {
  await page.evaluate(() => {
    const ov = document.getElementById('overlay');
    const sc = ov && [...ov.querySelectorAll('*')]
      .find((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 4);
    if (sc) sc.scrollBy({ top: 90, behavior: 'smooth' });
  });
  await wait(230);
}
await wait(1800);

await ctx.close();
await browser.close();

const files = readdirSync(OUT).filter((f) => f.endsWith('.webm'));
if (files.length) {
  const src = join(OUT, files[files.length - 1]);
  const dst = join(OUT, 'gameplay-raw.webm');
  renameSync(src, dst);
  console.log('recorded ->', dst);
}
if (errors.length) console.error('page errors:', [...new Set(errors)].slice(0, 5));

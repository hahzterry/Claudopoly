#!/usr/bin/env node
/** verify-live.mjs — prove the deployed build works, on the real URL. */
import { chromium } from 'playwright';
const URL = process.argv[2] || 'https://claudopoly.vercel.app/';
const b = await chromium.launch();
const out = {};
const errors = [];

for (const [name, vp, mobile] of [
  ['desktop', { width: 1440, height: 900 }, false],
  ['phone',   { width: 390, height: 844 }, true],
]) {
  const ctx = await b.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(`[${name}] ${m.text()}`); });

  const t0 = Date.now();
  await p.goto(URL, { waitUntil: 'networkidle' });
  const lifted = await p.waitForFunction(() => !document.getElementById('boot'), { timeout: 30000 })
    .then(() => true).catch(() => false);
  const ttp = Date.now() - t0;
  await p.waitForTimeout(2000);

  out[name] = await p.evaluate((meta) => {
    const g = window.__integrity;
    const txt = document.body.innerText;
    return {
      ...meta,
      gatePassed: !!g,
      gateStats: g ? g.stats : null,
      failureScreen: /Integrity gate failed/i.test(txt),
      hasAttribution: /Crown copyright and database right 2026/.test(txt),
      hasOGL: !!document.querySelector('a[href*="open-government-licence"]'),
      rollButton: !!document.querySelector('button[aria-label*="Roll" i]'),
      bannedWordOnScreen: /\bmonopoly\b|community chest/i.test(txt),
      docScrollW: document.documentElement.scrollWidth,
      docClientW: document.documentElement.clientWidth,
    };
  }, { lifted, timeToPlayableMs: ttp });

  await p.screenshot({ path: `bench/shots/live-${name}.png` });
  await ctx.close();
}
await b.close();
out.consoleErrors = [...new Set(errors)];
console.log(JSON.stringify(out, null, 1));

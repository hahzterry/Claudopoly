#!/usr/bin/env node
/** play-live.mjs — play a full game against the DEPLOYED build, not localhost. */
import { chromium } from 'playwright';
const URL = process.argv[2] || 'https://claudopoly.vercel.app/';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await p.goto(URL, { waitUntil: 'networkidle' });
await p.waitForFunction(() => !document.getElementById('boot'), { timeout: 30000 });

const click = (re) => p.evaluate((s) => {
  const rx = new RegExp(s, 'i');
  const el = [...document.querySelectorAll('button')]
    .find(x => rx.test(x.getAttribute('aria-label') || x.textContent || '') && !x.disabled);
  if (el) { el.click(); return (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40); }
  return null;
}, re.source);

const state = () => p.evaluate(() => {
  const t = document.body.innerText;
  const r = t.match(/ROUND (\d+) OF (\d+)/i);
  const rr = t.match(/NET RENT ROLL A YEAR\s*\n?\s*(£[\d,.mk]+)/i);
  const st = t.match(/STREETS\s*\n?\s*(\d+)/i);
  return { round: r ? +r[1] : null, rentRoll: rr ? rr[1] : null, streets: st ? +st[1] : null };
});

const log = [];
for (let i = 0; i < 30; i++) {
  const s = await p.evaluate(() => {
    const b = [...document.querySelectorAll('button')]
      .find(x => /roll/i.test(x.getAttribute('aria-label') || x.textContent || ''));
    return { ready: !!b && !b.disabled, over: /wound up|final|won|result/i.test(document.body.innerText) };
  });
  if (s.over) break;
  if (s.ready) { await click(/roll/); await p.waitForTimeout(3600); }
  const d = await click(/buy outright|buy with debt|^pass/);
  if (d) { log.push(d); await p.waitForTimeout(1500); }
  await click(/continue|close|got it|carry on/);
  await p.waitForTimeout(1100);
}

const final = await state();
const end = await p.evaluate(() => ({
  gate: !!window.__integrity,
  failure: /Integrity gate failed/i.test(document.body.innerText),
  banned: /\bmonopoly\b|community chest/i.test(document.body.innerText),
  attribution: /Crown copyright and database right 2026/.test(document.body.innerText),
}));
await p.screenshot({ path: 'bench/shots/live-played.png' });
await b.close();

console.log(JSON.stringify({
  url: URL, decisions: log.length, sample: log.slice(0, 8), final, ...end,
  consoleErrors: [...new Set(errors)].filter(e => !/vibrate/i.test(e)),
}, null, 1));

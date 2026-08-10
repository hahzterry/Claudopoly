#!/usr/bin/env node
/**
 * test-restart.mjs — restart mid-animation must not soft-lock.
 * A critic hit: TypeError: Cannot read properties of null (reading 'total')
 * by restarting while a turn's async sequence was still in flight.
 */
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const errors = [];
p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await p.goto('http://localhost:5178/', { waitUntil: 'networkidle' });
await p.waitForFunction(() => !document.getElementById('boot'), { timeout: 20000 }).catch(() => {});
await p.waitForTimeout(1200);

// Roll, then restart at several points inside the turn's async sequence.
for (const delay of [80, 300, 700, 1400, 2200]) {
  await p.evaluate(() => {
    const btn = [...document.querySelectorAll('button')]
      .find((x) => /roll/i.test(x.textContent || '') || /roll/i.test(x.getAttribute('aria-label') || ''));
    if (btn) btn.click();
  });
  await p.waitForTimeout(delay);
  await p.evaluate(() => window.restartGame && window.restartGame());
  await p.waitForTimeout(500);
}

// After all that, is the game still playable?
await p.waitForTimeout(600);
const state = await p.evaluate(async () => {
  const btn = [...document.querySelectorAll('button')]
    .find((x) => /roll/i.test(x.textContent || '') || /roll/i.test(x.getAttribute('aria-label') || ''));
  if (btn) btn.click();
  await new Promise((r) => setTimeout(r, 2600));
  return {
    rollButtonPresent: !!btn,
    bodyHasGate: /Integrity gate failed/i.test(document.body.innerText),
    text: document.body.innerText.slice(0, 90).replace(/\n+/g, ' | '),
  };
});
await b.close();

const real = errors.filter((e) => !/vibrate|favicon|Download the React/i.test(e));
console.log(JSON.stringify({ restartsAttempted: 5, errors: real, ...state }, null, 1));
if (real.length) { console.error(`\n  ✗ ${real.length} error(s) during restart stress\n`); process.exit(1); }
if (!state.rollButtonPresent || state.bodyHasGate) { console.error('\n  ✗ game not playable after restarts\n'); process.exit(1); }
console.log('\n  ✓ restart survived 5 mid-animation interrupts, still playable\n');

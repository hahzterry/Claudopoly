#!/usr/bin/env node
/**
 * shoot.mjs — repeatable screenshots of the running build, for the blind
 * comparison sets and for regression checking between rounds.
 *
 * Usage: node scripts/shoot.mjs <baseUrl> <outDir> [label]
 * Produces: desktop.png, mobile.png, panel.png, chart.png, sources.png
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.argv[2] || 'http://localhost:5178/';
const OUT = process.argv[3] || 'bench/shots/latest';
const LABEL = process.argv[4] || '';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const errors = [];

async function shoot(name, viewport, prep) {
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    isMobile: viewport.width < 500,
    hasTouch: viewport.width < 500,
    reducedMotion: 'no-preference',
  });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[${name}] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[${name}] pageerror: ${e.message}`));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  // wait for the boot screen to lift, i.e. the gate to have passed
  await page.waitForFunction(() => !document.getElementById('boot'), { timeout: 20000 })
    .catch(() => errors.push(`[${name}] boot screen never lifted — gate may have failed`));
  await page.waitForTimeout(1600);

  if (prep) await prep(page);

  await page.screenshot({ path: join(OUT, `${name}.png`) });
  await ctx.close();
  console.log(`  ${name}.png  ${viewport.width}x${viewport.height}`);
}

await shoot('desktop', { width: 1440, height: 900 });
await shoot('mobile', { width: 390, height: 844 });

// Dimension-matched to the benchmark shots, so a blind comparison differs only
// in craft and not in aspect ratio or resolution.
await shoot('blind-desktop', { width: 1920, height: 1080 });   // matches the Steam shots
await shoot('blind-mobile', { width: 1600, height: 749 });     // matches the cropped iPhone shots

// A property panel, opened by tapping a street tile via the exposed API.
await shoot('panel', { width: 390, height: 844 }, async (page) => {
  await page.evaluate(async () => {
    const { renderPropertyPanel } = await import('/src/panel.js');
    let ov = document.getElementById('overlay');
    if (!ov) { ov = document.createElement('div'); ov.id = 'overlay'; document.body.appendChild(ov); }
    ov.innerHTML = '';
    const shell = document.createElement('div');
    shell.className = 'overlay-shell';
    shell.appendChild(renderPropertyPanel('bond-street'));
    ov.appendChild(shell);
    ov.classList.add('open');
  });
  await page.waitForTimeout(700);
});

await shoot('chart', { width: 390, height: 844 }, async (page) => {
  await page.evaluate(async () => {
    const { renderComparisonChart } = await import('/src/panel.js');
    let ov = document.getElementById('overlay');
    if (!ov) { ov = document.createElement('div'); ov.id = 'overlay'; document.body.appendChild(ov); }
    ov.innerHTML = '';
    const shell = document.createElement('div');
    shell.className = 'overlay-shell';
    shell.appendChild(renderComparisonChart());
    ov.appendChild(shell);
    ov.classList.add('open');
  });
  await page.waitForTimeout(700);
});

await shoot('chart-desktop', { width: 1440, height: 900 }, async (page) => {
  await page.evaluate(async () => {
    const { renderComparisonChart } = await import('/src/panel.js');
    let ov = document.getElementById('overlay');
    if (!ov) { ov = document.createElement('div'); ov.id = 'overlay'; document.body.appendChild(ov); }
    ov.innerHTML = '';
    const shell = document.createElement('div');
    shell.className = 'overlay-shell';
    shell.appendChild(renderComparisonChart());
    ov.appendChild(shell);
    ov.classList.add('open');
  });
  await page.waitForTimeout(700);
});

await shoot('sources', { width: 390, height: 844 }, async (page) => {
  await page.evaluate(async () => {
    const { renderSourcesPanel } = await import('/src/panel.js');
    let ov = document.getElementById('overlay');
    if (!ov) { ov = document.createElement('div'); ov.id = 'overlay'; document.body.appendChild(ov); }
    ov.innerHTML = '';
    const shell = document.createElement('div');
    shell.className = 'overlay-shell';
    shell.appendChild(renderSourcesPanel());
    ov.appendChild(shell);
    ov.classList.add('open');
  });
  await page.waitForTimeout(700);
});

await browser.close();

if (errors.length) {
  console.error(`\n  ${errors.length} console error(s):`);
  for (const e of [...new Set(errors)].slice(0, 20)) console.error(`    ${e}`);
  process.exitCode = 1;
} else {
  console.log(`\n  no console errors${LABEL ? ` (${LABEL})` : ''}`);
}

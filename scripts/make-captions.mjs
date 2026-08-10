#!/usr/bin/env node
/**
 * make-captions.mjs — render caption bands as transparent PNGs.
 *
 * This ffmpeg build has no drawtext (no freetype), so captions are rendered in
 * headless Chromium instead and composited with the overlay filter. It also
 * gives proper typography, which drawtext would not.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = 'bench/video/captions';
mkdirSync(OUT, { recursive: true });
const W = 1080;

const CAPTIONS = [
  { id: 'a1', kicker: 'REGENT STREET', line: '4th dearest in 1935 · 4th cheapest in 2026' },
  { id: 'a2', kicker: 'BOND STREET', line: '20th of 22 in 1935 · 1st in 2026' },
  { id: 'a3', kicker: 'OLD KENT ROAD', line: 'still last. £60 then, £325,000 now' },
  { id: 'a4', kicker: '', line: 'the old ladder spanned 6.7×', big: 'this one spans 103×' },
  { id: 'b1', kicker: '', line: 'every price. every square.' },
  { id: 'b2', kicker: '', line: 'HM Land Registry Price Paid Data · Open Government Licence' , small: true },
  { id: 'c1', kicker: '', line: 'plant one figure nobody sourced' },
  { id: 'c2', kicker: '', line: 'it will not start with a number it cannot source' },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: 320 }, deviceScaleFactor: 2 });

for (const c of CAPTIONS) {
  const size = c.small ? 30 : 44;
  await page.setContent(`<!doctype html><meta charset="utf-8">
  <style>
    html,body{margin:0;background:transparent}
    .band{width:${W}px;padding:26px 60px;box-sizing:border-box;
      background:rgba(10,8,7,.80);
      font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;color:#fff;text-align:center}
    .k{font-size:26px;font-weight:700;letter-spacing:.20em;text-transform:uppercase;
       color:#E8B84B;margin-bottom:10px}
    .l{font-size:${size}px;font-weight:600;line-height:1.25;letter-spacing:-.01em}
    .b{font-size:52px;font-weight:700;margin-top:8px;letter-spacing:-.02em}
  </style>
  <div class="band">
    ${c.kicker ? `<div class="k">${c.kicker}</div>` : ''}
    <div class="l">${c.line}</div>
    ${c.big ? `<div class="b">${c.big}</div>` : ''}
  </div>`);
  await page.waitForTimeout(120);
  const el = await page.$('.band');
  await el.screenshot({ path: `${OUT}/${c.id}.png`, omitBackground: true });
  console.log(c.id);
}
await browser.close();

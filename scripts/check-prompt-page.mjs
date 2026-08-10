import { chromium } from 'playwright';
const URL = process.argv[2] || 'http://localhost:5178/prompt/index.html';
const b = await chromium.launch();
const out = {};
for (const [name, vp, mobile] of [['phone', { width: 390, height: 844 }, true],
                                  ['desktop', { width: 1280, height: 900 }, false]]) {
  const ctx = await b.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.waitForTimeout(3500);
  out[name] = await p.evaluate(() => {
    const f = document.querySelector('.formwrap iframe');
    return {
      iframePresent: !!f,
      iframeSrc: f ? f.src : null,
      fallbackStillShowing: !!document.getElementById('fallback'),
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      hasOGL: !!document.querySelector('a[href*="open-government-licence"]'),
      playLink: !!document.querySelector('a.play'),
    };
  });
  out[name].errors = errs;
  await p.screenshot({ path: `bench/shots/prompt-${name}.png`, fullPage: name === 'phone' });
  await ctx.close();
}
await b.close();
console.log(JSON.stringify(out, null, 1));

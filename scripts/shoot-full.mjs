import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 2 });
await p.goto('http://localhost:5178/', { waitUntil: 'networkidle' });
await p.waitForFunction(() => !document.getElementById('boot'), { timeout: 20000 }).catch(()=>{});
await p.waitForTimeout(1500);
for (const [name, fn] of [
  ['full-chart', 'renderComparisonChart'],
  ['full-panel', 'renderPropertyPanel'],
  ['full-sources', 'renderSourcesPanel'],
]) {
  const el = await p.evaluateHandle(async (fnName) => {
    const panel = await import('/src/panel.js');
    const node = fnName === 'renderPropertyPanel'
      ? panel[fnName]('bond-street') : panel[fnName]();
    const box = document.createElement('div');
    box.style.cssText = 'position:absolute;left:0;top:0;width:900px;background:#FFF1E5;z-index:99999';
    box.id = 'full-capture';
    box.appendChild(node);
    document.body.appendChild(box);
    return box;
  }, fn);
  await p.waitForTimeout(600);
  await el.screenshot({ path: `bench/shots/final/${name}.png` });
  await p.evaluate(() => document.getElementById('full-capture')?.remove());
  console.log(name);
}
await b.close();

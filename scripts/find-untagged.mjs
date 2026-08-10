import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto('http://localhost:5178/?gate=report', { waitUntil: 'networkidle' });
await p.waitForTimeout(3000);
const out = await p.evaluate(() => {
  const RE = /[−-]?\s?£\s?\d[\d,]*(?:\.\d+)?\s?(?:k|m|bn)?/gi;
  const hits = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    const t = n.nodeValue; if (!t || !t.trim()) continue;
    const el = n.parentElement; if (!el) continue;
    if (['STYLE','SCRIPT','TITLE','NOSCRIPT'].includes(el.tagName)) continue;
    const m = t.match(RE); if (!m) continue;
    hits.push({
      text: t.trim().slice(0, 60),
      tag: el.tagName.toLowerCase(),
      cls: (typeof el.className === 'string' ? el.className : '').slice(0, 50),
      tagged: !!el.closest('[data-money],[data-fact]'),
      derived: !!el.closest('[data-money="derived"]'),
      path: (() => { const p=[]; let e=el; while(e&&e!==document.body&&p.length<5){p.push(e.tagName.toLowerCase()+(typeof e.className==='string'&&e.className?'.'+e.className.trim().split(/\s+/)[0]:''));e=e.parentElement;} return p.join(' < '); })(),
    });
  }
  return hits.filter(h => !h.tagged || !h.derived);
});
console.log(JSON.stringify(out, null, 1));
await b.close();

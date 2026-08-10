import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto('http://localhost:5178/?gate=report', { waitUntil: 'networkidle' });
await p.waitForTimeout(2500);
// Rebuild the same audit surface main.js builds, then hunt inside it.
const out = await p.evaluate(async () => {
  const panel = await import('/src/panel.js');
  const f = await import('/src/facts.js');
  const box = document.createElement('div');
  box.style.cssText = 'position:absolute;left:-99999px;top:0;width:1200px';
  for (const s of f.streets()) { try { box.appendChild(panel.renderPropertyPanel(s.id)); } catch (e) {} }
  try { box.appendChild(panel.renderComparisonChart()); } catch (e) {}
  try { box.appendChild(panel.renderSourcesPanel()); } catch (e) {}
  document.body.appendChild(box);

  const RE = /[−-]?\s?£\s?\d[\d,]*(?:\.\d+)?\s?(?:k|m|bn)?/gi;
  const hits = [];
  const w = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    const t = n.nodeValue; if (!t) continue;
    const m = t.match(RE); if (!m) continue;
    if (!m.some(x => /4\.1\s?m/i.test(x))) continue;
    const el = n.parentElement;
    hits.push({ token: m.join('|'), text: t.trim().slice(0, 90),
      tag: el.tagName.toLowerCase(), cls: String(el.className || '').slice(0, 60),
      parentText: (el.parentElement ? el.parentElement.textContent : '').trim().slice(0, 160) });
  }
  box.remove();
  return hits;
});
console.log(JSON.stringify(out, null, 1));
await b.close();

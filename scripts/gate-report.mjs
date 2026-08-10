import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
// Capture the gate's own violation list before the failure screen replaces the DOM.
await p.addInitScript(() => {
  window.__caught = [];
  const orig = console.error;
  console.error = (...a) => { window.__caught.push(a.map(x => { try { return JSON.parse(JSON.stringify(x)); } catch { return String(x); } })); orig(...a); };
});
await p.goto(process.argv[2] || 'http://localhost:5178/', { waitUntil: 'networkidle' });
await p.waitForTimeout(3000);
const out = await p.evaluate(() => {
  const gateErr = (window.__caught || []).find(a => String(a[0]).includes('Integrity gate failed'));
  const viol = gateErr ? gateErr[1] : (window.__integrity ? [] : null);
  const byKind = {};
  for (const v of (viol || [])) (byKind[v.kind] ||= []).push(v);
  return {
    passed: !!window.__integrity,
    stats: window.__integrity ? window.__integrity.stats : null,
    total: viol ? viol.length : 'unknown',
    kinds: Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k, v.length])),
    sample: Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k, v.slice(0, 6).map(x => `${x.detail} @${x.where}`)])),
  };
});
console.log(JSON.stringify(out, null, 1));
await b.close();

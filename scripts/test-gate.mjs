#!/usr/bin/env node
/**
 * test-gate.mjs — attack the integrity gate.
 *
 * A gate that has never been shown to FAIL is not evidence of anything. This
 * injects values and terms that must be caught, plus controls that must not
 * be, and fails the build if the gate lets any of them through.
 */
import { chromium } from 'playwright';

const URL = process.argv[2] || 'http://localhost:5178/?gate=report';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto(URL, { waitUntil: 'networkidle' });
await p.waitForTimeout(2500);

const res = await p.evaluate(async () => {
  const integ = await import('/src/integrity.js');
  const fm = await import('/src/facts.js');
  const F = fm.facts();
  const run = (labels = []) =>
    integ.runGate({ facts: F, root: document.body, canvasLabels: labels });

  const inject = (html) => {
    const d = document.createElement('div');
    d.innerHTML = html;
    document.body.appendChild(d);
    return d;
  };
  const countOf = (kind, labels) => run(labels).violations.filter(v => v.kind === kind).length;

  const out = { control: run().violations.length, cases: {} };

  const cases = [
    ['untraced-value-tagged', '<div data-money>Guide price £4,321,987</div>', 'value-not-in-facts'],
    ['untagged-value',        '<div>Rent £999</div>',                        'untraced-value'],
    ['banned-word',           '<div>Community Chest</div>',                  'banned-word'],
    ['trade-dress',           '<div>Advance to Boardwalk</div>',             'banned-trade-dress'],
    ['undeclared-numeral',    '<div>Yield 8.7</div>',                        'numeral-not-declared'],
    // A compact token whose ENTIRE rounding band contains no real figure.
    ['fabricated-compact',    '<div data-money>£58.3mn</div>',               'value-not-in-facts'],
    ['fabricated-k',          '<div data-money>£742k</div>',                 'value-not-in-facts'],
  ];
  for (const [name, html, kind] of cases) {
    const node = inject(html);
    out.cases[name] = countOf(kind);
    node.remove();
  }

  // A value baked into a WebGL texture, which no DOM sweep can see.
  out.cases['canvas-label'] = countOf('value-not-in-facts', [{ text: '£7,777,777', where: 'fake' }]);

  // Controls that MUST NOT trip: real figures rendered in real forms.
  const real = F.streets[0].value2026.amount;              // 325000 -> "£325k"
  const bond = F.streets.find(s => s.id === 'bond-street').value2026.amount;
  const ctrl = inject(
    `<div data-money>£${real.toLocaleString('en-GB')}</div>` +
    `<div data-money>£${(bond / 1e6).toFixed(1)}mn</div>` +
    `<div data-money="derived">£4,183,221</div>`);
  out.controlsAfter = run().violations.length;
  ctrl.remove();

  out.finalClean = run().violations.length;
  return out;
});

await b.close();

let failed = 0;
const must = (name, ok, detail) => {
  if (!ok) { failed++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
  else console.log(`  ✓ ${name}`);
};

must('clean document passes', res.control === 0, `${res.control} violations`);
for (const [name, n] of Object.entries(res.cases)) {
  must(`catches ${name}`, n >= 1, 'not caught');
}
must('real figures do not trip the gate', res.controlsAfter === 0, `${res.controlsAfter} false positives`);
must('clean again after cleanup', res.finalClean === 0, `${res.finalClean} left over`);

if (failed) { console.error(`\n  ✗ ${failed} gate check(s) failed\n`); process.exit(1); }
console.log(`\n  ✓ integrity gate verified by attack — ${Object.keys(res.cases).length} injections all caught\n`);

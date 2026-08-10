#!/usr/bin/env node
/**
 * verify-facts.mjs — the build-time half of the integrity gate.
 *
 * The runtime gate can only see what actually renders. This one reads the
 * source and refuses to let a monetary literal or a banned term exist at all.
 * Run it in CI and before every deploy: `npm run verify`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const FACTS = JSON.parse(readFileSync(join(ROOT, 'data', 'landlord-facts.json'), 'utf8'));

const SCAN_DIRS = ['src'];
const SCAN_FILES = ['index.html'];
const EXT = new Set(['.js', '.mjs', '.css', '.html']);

/** Files permitted to contain the banned words, because they define the ban. */
const BAN_DEFINITION_FILES = new Set(['src/integrity.js', 'scripts/verify-facts.mjs']);

const BANNED = FACTS.banned.words;
const TRADE_DRESS = [
  /\bmr\.?\s*monopol/i, /\bpennybags\b/i, /\bboardwalk\b/i, /\bpark\s*place\b/i,
  /\btop\s*hat\b/i, /\bthimble\b/i, /\bwheelbarrow\b/i, /\bscottie\s*dog\b/i,
  /\bget\s+out\s+of\s+jail\b/i,
];

/* Currency literals in source: "£1,234", '£2.5m', and large bare numbers that
   look like money (5+ digits) outside of the facts file. */
const CURRENCY_LITERAL = /['"`][^'"`]*£\s?\d[\d,.]*\s?(?:k|m|bn)?[^'"`]*['"`]/gi;
const BIG_NUMBER = /(?<![\w.$])(\d{5,}|\d{1,3}(?:_\d{3})+)(?![\w.])/g;

/** Numbers a source file may legitimately contain. */
const ALLOWED_BIG = new Set([
  ...(FACTS.displayAllowlist.structuralNumerals || []),
  748626,          // the 1904 patent number
  20260810,        // the default PRNG seed, a date
  2147483647,      // int32 max, used to bound the seed
  4294967296,      // 2^32, PRNG divisor
  99999,           // offscreen audit positioning
  // unit magnitudes used by the formatters and parsers themselves
  1000, 10000, 100000, 1000000, 1000000000,
  30000,           // 30s cooldown before the renderer re-raises its quality tier
]);

/**
 * Strip everything a numeric or spelling scan must not see: comments, hex
 * colours, CSS custom-property values that are colours, and hex literals.
 * Without this the checker cries wolf on #333333 and gets ignored, which is
 * worse than not having it.
 */
function sanitise(text, ext) {
  let t = text;
  const keepLines = (m) => m.replace(/[^\n]/g, ' ');   // strip content, keep newlines
  t = t.replace(/\/\*[\s\S]*?\*\//g, keepLines);      // block comments (JS + CSS)
  if (ext !== '.css') {
    t = t.replace(/(^|[^:])\/\/.*$/gm, '$1 ');       // line comments, not URLs
    t = t.replace(/<!--[\s\S]*?-->/g, keepLines);
  }
  t = t.replace(/#[0-9a-fA-F]{3,8}\b/g, ' ');        // hex colours
  t = t.replace(/0x[0-9a-fA-F]+/g, ' ');             // hex literals
  t = t.replace(/\b(rgba?|hsla?)\([^)]*\)/gi, ' ');  // colour functions
  t = t.replace(/\bcubic-bezier\([^)]*\)/gi, ' ');
  return t;
}

const problems = [];
let filesScanned = 0;

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      walk(p);
    } else if (EXT.has(extname(name))) {
      scan(p);
    }
  }
}

function scan(path) {
  const rel = relative(ROOT, path);
  const raw = readFileSync(path, 'utf8');
  const ext = extname(path);
  filesScanned++;
  // Banned terms are checked against the RAW text — a slur hidden in a comment
  // still ships. Numbers and spelling are checked against the sanitised text.
  const lines = raw.split('\n');
  const clean = sanitise(raw, ext).split('\n');

  // 1. banned words
  if (!BAN_DEFINITION_FILES.has(rel)) {
    for (const word of BANNED) {
      const re = new RegExp(`\\b${word.replace(/\s+/g, '\\s+')}\\b`, 'i');
      lines.forEach((line, i) => {
        if (re.test(line)) {
          problems.push({ file: rel, line: i + 1, kind: 'banned-word',
            detail: `"${word}" — ${line.trim().slice(0, 90)}` });
        }
      });
    }
    for (const re of TRADE_DRESS) {
      lines.forEach((line, i) => {
        if (re.test(line)) {
          problems.push({ file: rel, line: i + 1, kind: 'banned-trade-dress',
            detail: `${re} — ${line.trim().slice(0, 90)}` });
        }
      });
    }
  }

  // 2. currency string literals
  clean.forEach((line, i) => {
    const hits = line.match(CURRENCY_LITERAL);
    if (hits) {
      for (const h of hits) {
        // A bare currency symbol used as a formatting prefix is fine.
        if (/^['"`]\s*£\s*['"`]$/.test(h)) continue;
        problems.push({ file: rel, line: i + 1, kind: 'currency-literal',
          detail: `${h.slice(0, 70)} — money must come from facts.js` });
      }
    }
  });

  // 3. suspiciously large bare numbers
  clean.forEach((line, i) => {
    let m;
    BIG_NUMBER.lastIndex = 0;
    while ((m = BIG_NUMBER.exec(line))) {
      const n = Number(m[1].replace(/_/g, ''));
      if (ALLOWED_BIG.has(n)) continue;
      problems.push({ file: rel, line: i + 1, kind: 'bare-large-number',
        detail: `${m[1]} — if this is money it must come from facts.js; if not, declare it in displayAllowlist` });
    }
  });

  // 4. British English. CSS property names ("color", "center") are American by
  //    specification, so in stylesheets only comments and content strings are
  //    checked; in JS the DOM API surface is stripped first.
  const AMERICAN = /\b(analyze|analyzed|analyzing|analyzer|optimize|optimizing|optimization|organize|organizing|behavior|neighborhood|favorite|favor|colour ?ize)\b/gi;
  const AMERICAN_LOOSE = /\b(color|colors|center|centered|centering)\b/gi;

  if (ext === '.css') {
    for (const m of raw.matchAll(/\/\*([\s\S]*?)\*\//g)) {
      // A stylesheet comment may legitimately name CSS grammar. Strip
      // backtick-quoted tokens and hyphenated CSS identifiers first, so
      // `color`, theme-color and background-color do not read as errors.
      const body = m[1]
        .replace(/`[^`]*`/g, ' ')
        .replace(/[\w-]*-(color|center)\b/gi, ' ')
        .replace(/\b(color|center)-[\w-]*/gi, ' ')
        .replace(/\b(overscroll|scroll)-behavior[\w-]*/gi, ' ');
      const hits = (body.match(AMERICAN) || []).concat(body.match(AMERICAN_LOOSE) || []);
      if (hits.length) {
        const line = raw.slice(0, m.index).split('\n').length;
        problems.push({ file: rel, line, kind: 'american-spelling',
          detail: `${[...new Set(hits)].join(', ')} — in a stylesheet comment` });
      }
    }
  } else {
    clean.forEach((line, i) => {
      const stripped = line
        // CSS-in-JS: property names and keyword values are American by
        // specification. Strip declarations before judging the prose.
        .replace(/:\s*center\b/g, ': ')
        .replace(/\b(overscroll|scroll)-behavior[\w-]*/gi, ' ')
        .replace(/[\w-]*colou?r\s*:/gi, ': ')
        .replace(/\.(style|dataset)\.[\w.]+/g, ' ')
        .replace(/\b\w*[Cc]olor(Space|s)?\b/g, ' ')
        .replace(/\b(textAlign|justifyContent|alignItems|transformOrigin|toneMapping|outputColorSpace|getContext|createLinearGradient|createRadialGradient|addColorStop|setHSL|setRGB)\b/g, ' ')
        .replace(/'(center|left|right|start|end)'/g, ' ')
        .replace(/"(center|left|right|start|end)"/g, ' ')
        .replace(/\b(text-align|align-items|justify-content|background-color|border-color)\b/g, ' ');
      const hits = (stripped.match(AMERICAN) || []).concat(stripped.match(AMERICAN_LOOSE) || []);
      if (hits.length) {
        problems.push({ file: rel, line: i + 1, kind: 'american-spelling',
          detail: `${[...new Set(hits)].join(', ')} — ${line.trim().slice(0, 80)}` });
      }
    });
  }
}

for (const d of SCAN_DIRS) walk(join(ROOT, d));
for (const f of SCAN_FILES) scan(join(ROOT, f));

/* ---- fact base self-checks ---- */
if (FACTS.streets.length !== 22) {
  problems.push({ file: 'data/landlord-facts.json', line: 0, kind: 'fact-base',
    detail: `expected 22 streets, found ${FACTS.streets.length}` });
}
for (const s of FACTS.streets) {
  const v = s.value2026;
  for (const k of ['amount', 'basis', 'dataset', 'method', 'datasetAccessed']) {
    if (v[k] === undefined || v[k] === null || v[k] === '') {
      problems.push({ file: 'data/landlord-facts.json', line: 0, kind: 'fact-base',
        detail: `${s.id}.value2026.${k} is missing` });
    }
  }
  if (!s.rentAssumption.isAssumption) {
    problems.push({ file: 'data/landlord-facts.json', line: 0, kind: 'fact-base',
      detail: `${s.id}.rentAssumption must be flagged isAssumption` });
  }
  if (v.basis !== 'ukhpi-la-average' && !v.latestRecord) {
    problems.push({ file: 'data/landlord-facts.json', line: 0, kind: 'fact-base',
      detail: `${s.id} cites no transaction record` });
  }
}
for (const k of ['hmlr', 'ogl', 'oglUrl']) {
  if (!FACTS.attribution[k]) {
    problems.push({ file: 'data/landlord-facts.json', line: 0, kind: 'fact-base',
      detail: `attribution.${k} missing` });
  }
}
for (const c of FACTS.eventCards) {
  if (!c.source?.url || !c.source?.name || !c.source?.date) {
    problems.push({ file: 'data/landlord-facts.json', line: 0, kind: 'fact-base',
      detail: `event card "${c.id}" is missing source detail` });
  }
}

/* ---- report ---- */
const byKind = {};
for (const p of problems) byKind[p.kind] = (byKind[p.kind] || 0) + 1;

if (problems.length === 0) {
  console.log(`\n  ✓ integrity verified — ${filesScanned} files scanned, ` +
              `${FACTS.streets.length} streets, ${FACTS.eventCards.length} event cards\n`);
  process.exit(0);
}

console.error(`\n  ✗ ${problems.length} integrity problem(s) across ${filesScanned} files\n`);
for (const [k, n] of Object.entries(byKind)) console.error(`    ${k}: ${n}`);
console.error('');
for (const p of problems.slice(0, 80)) {
  console.error(`    ${p.file}:${p.line}  [${p.kind}]`);
  console.error(`      ${p.detail}`);
}
if (problems.length > 80) console.error(`\n    …and ${problems.length - 80} more`);
console.error('');
process.exit(1);

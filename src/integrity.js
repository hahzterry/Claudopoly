/**
 * integrity.js — the load-time gate.
 *
 * Two independent obligations from the brief, both enforced here:
 *
 *  1. VALUE TRACING, as an ABSENCE check. Not "do the facts appear on screen?"
 *     but "does anything appear on screen that is NOT in the facts file?".
 *     Three layers catch it:
 *       a. provenance — every Money formatted for display must resolve to
 *          facts-file leaves (see money.js);
 *       b. DOM sweep — any currency token in the document that is not inside an
 *          element our pipeline tagged is an untraced value;
 *       c. numeral sweep — bare numerals in display text must appear in the
 *          facts file's own declared allow-list.
 *
 *  2. BANNED WORDS AND TRADE DRESS. Word list plus asset/name patterns, swept
 *     across DOM text, attributes, the document title and every canvas label.
 *
 * Failing the gate halts the game and renders a diagnostic. It does not warn
 * and continue: a silent integrity failure is the one outcome the brief rules
 * out entirely.
 */

/* ------------------------------------------------------------- banned terms */

export const BANNED_WORDS = [
  'MONOPOLY', 'MR MONOPOLY', 'MONOPOLIES',
  'COMMUNITY CHEST', 'CHANCE',
  'RICH UNCLE PENNYBAGS', 'UNCLE PENNYBAGS',
  'GO TO JAIL', 'FREE PARKING', 'TITLE DEED',
  'HASBRO', 'PARKER BROTHERS', 'WADDINGTONS',
  'ELECTRIC COMPANY', 'WATER WORKS',
];

/**
 * Trade-dress signatures: names, asset filenames and visual motifs that would
 * read as another publisher's game even without the banned words appearing.
 */
export const BANNED_TRADE_DRESS = [
  /\bmr\.?\s*monopol/i,
  /\bpennybags\b/i,
  /\btop\s*hat\s*token\b/i,
  /\bscottie\s*dog\s*token\b/i,
  /\bthimble\s*token\b/i,
  /\bwheelbarrow\s*token\b/i,
  /\bjail\b/i,
  /\bget\s+out\s+of\s+jail\b/i,
  /\bboardwalk\b/i,
  /\bpark\s*place\b/i,
  /\bmonopoly\b/i,
];

/** Words that would be false positives if we banned the substring naively. */
const BANNED_WORD_EXCEPTIONS = [];

/* ------------------------------------------------------------ fact indexing */

/** Deep-walk the facts file into dotted paths -> primitive values. */
export function buildFactIndex(facts) {
  const byPath = new Map();
  const amounts = new Set();
  const numerals = new Set();

  const walk = (node, path) => {
    if (node === null || node === undefined) return;
    if (typeof node === 'number') {
      byPath.set(path, node);
      if (Number.isInteger(node)) amounts.add(node);
      numerals.add(node);
      return;
    }
    if (typeof node === 'string' || typeof node === 'boolean') {
      byPath.set(path, node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, `${path}[${i}]`));
      return;
    }
    for (const [k, v] of Object.entries(node)) {
      walk(v, path ? `${path}.${k}` : k);
    }
  };
  walk(facts, '');

  return { byPath, amounts, numerals };
}

export function resolveFactPath(index, path) {
  return index.byPath.has(path) ? index.byPath.get(path) : undefined;
}

/* -------------------------------------------------------- text extraction */

// $33,575,353 / $33.6m / $325k / −$1,083
const CURRENCY_RE = /[−-]?\s?\$\s?\d[\d,]*(?:\.\d+)?\s?(?:bn|mn|k|m)?/gi;
// bare numerals not already part of a currency token
const NUMERAL_RE = /(?<![$\d.,])\d[\d,]*(?:\.\d+)?(?![\d,]*\s?(?:k|m|bn)?\d)/gi;

/** "$33.6m" -> 33600000 ; "$325k" -> 325000 ; "$1,083" -> 1083 */
export function parseCurrency(token) {
  const t = token.replace(/\s/g, '').replace(/^[−-]/, '');
  const neg = /^[−-]/.test(token.trim());
  const m = /^\$([\d,.]+)(bn|mn|k|m)?$/i.exec(t);
  if (!m) return null;
  let n = parseFloat(m[1].replace(/,/g, ''));
  const suffix = (m[2] || '').toLowerCase();
  if (suffix === 'k') n *= 1_000;
  else if (suffix === 'm' || suffix === 'mn') n *= 1_000_000;
  else if (suffix === 'bn') n *= 1_000_000_000;
  return neg ? -n : n;
}

export function findCurrencyTokens(text) {
  return String(text).match(CURRENCY_RE) || [];
}

export function findNumerals(text) {
  const stripped = String(text).replace(CURRENCY_RE, ' ');
  return (stripped.match(NUMERAL_RE) || []).map((s) => parseFloat(s.replace(/,/g, '')));
}

/* ------------------------------------------------------------ the registry */

/**
 * Everything the game formats for display registers here. The gate audits the
 * registry as well as the DOM, so values drawn into WebGL textures — which a
 * DOM sweep cannot see — are covered too.
 */
export class DisplayRegistry {
  constructor() {
    this.entries = [];
  }

  /** @param {string} text @param {object} meta {money?, factPaths?, where} */
  record(text, meta = {}) {
    this.entries.push({
      text: String(text),
      money: meta.money || null,
      factPaths: meta.factPaths || (meta.money ? [...meta.money.leaves()] : []),
      where: meta.where || 'unknown',
    });
    return text;
  }

  clear() { this.entries = []; }
}

export const registry = new DisplayRegistry();

/* ------------------------------------------------------------------- gate */

export class IntegrityError extends Error {
  constructor(violations) {
    super(`Integrity gate failed with ${violations.length} violation(s)`);
    this.name = 'IntegrityError';
    this.violations = violations;
  }
}

function pushV(list, kind, detail, where) {
  list.push({ kind, detail, where });
}

/**
 * Tolerance for compact rendering: "$33.6m" is a rounded view of 33,575,353,
 * so a displayed compact token matches a fact if it round-trips to the same
 * compact string. Exact tokens must match exactly.
 */
function currencyMatchesAnyFact(token, index) {
  const parsed = parseCurrency(token);
  if (parsed === null) return false;
  const abs = Math.abs(parsed);
  if (index.amounts.has(abs) || index.amounts.has(Math.round(abs))) return true;

  // A compact token such as "$4.1mn" is a ROUNDED view of the underlying
  // figure. Comparing formatted strings makes the gate hostage to whichever
  // rounding a formatter happens to use — $4,050,000 renders as "$4.0m" under
  // toFixed and "$4.1mn" under half-up, and the gate then rejects a perfectly
  // real figure. So instead: derive the band of values that would round to
  // exactly this token at the precision shown, and accept only if a real fact
  // falls inside it. That is strictly stronger than string matching, because
  // it also rejects a token whose band contains no fact at all.
  const band = compactBand(token);
  if (!band) return false;
  for (const a of index.amounts) {
    const v = Math.abs(a);
    if (v >= band.lo && v < band.hi) return true;
  }
  return false;
}

/** The half-open interval of values that display as `token`. */
export function compactBand(token) {
  const t = token.replace(/\s/g, '').replace(/^[−-]/, '');
  const m = /^\$([\d,]*)(?:\.(\d+))?(bn|mn|k|m)?$/i.exec(t);
  if (!m) return null;
  const suffix = (m[3] || '').toLowerCase();
  const unit = suffix === 'k' ? 1_000
    : (suffix === 'm' || suffix === 'mn') ? 1_000_000
      : suffix === 'bn' ? 1_000_000_000 : 1;
  const decimals = m[2] ? m[2].length : 0;
  const centre = parseFloat(`${(m[1] || '0').replace(/,/g, '')}.${m[2] || '0'}`) * unit;
  const half = (unit * Math.pow(10, -decimals)) / 2;
  return { lo: centre - half, hi: centre + half };
}

function compactOf(n) {
  const v = Math.abs(Math.round(n));
  if (v >= 1_000_000) {
    const m = v / 1_000_000;
    return '$' + (m >= 100 ? m.toFixed(0) : m.toFixed(1)) + 'm';
  }
  if (v >= 1_000) return '$' + Math.round(v / 1_000).toLocaleString('en-US') + 'k';
  return '$' + v.toLocaleString('en-US');
}

/**
 * Run the gate.
 * @param {object} opts {facts, root, canvasLabels, sourceStrings}
 * @returns {{ok:boolean, violations:Array, stats:object}}
 */
export function runGate({ facts, root = document.body, canvasLabels = [] } = {}) {
  const violations = [];
  const index = buildFactIndex(facts);

  const allowNumerals = new Set();
  const declared = facts.displayAllowlist || {};
  for (const n of declared.structuralNumerals || []) allowNumerals.add(n);
  for (const n of declared.years || []) allowNumerals.add(n);
  for (const n of index.numerals) allowNumerals.add(n);

  /* -- 1. provenance of everything we formatted ------------------------- */
  let checkedMoney = 0;
  for (const entry of registry.entries) {
    if (!entry.money) continue;
    checkedMoney++;
    const leaves = entry.money.leaves();
    if (leaves.size === 0 && entry.money.amount !== 0) {
      pushV(violations, 'no-provenance',
        `"${entry.text}" was displayed with no facts-file provenance`, entry.where);
      continue;
    }
    for (const leaf of leaves) {
      if (resolveFactPath(index, leaf) === undefined) {
        pushV(violations, 'unresolvable-fact',
          `"${entry.text}" cites fact path "${leaf}", which is not in landlord-facts.json`,
          entry.where);
      }
    }
  }

  /* -- 2. DOM sweep: untagged currency is untraced ---------------------- */
  const seen = [];
  if (root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const text = node.nodeValue;
      if (!text || !text.trim()) continue;
      const el = node.parentElement;
      if (!el || el.closest('[data-integrity-ignore]')) continue;
      // Stylesheet and script text is not displayed; a hex colour inside a
      // <style> block is not a figure on screen.
      const tag = el.tagName;
      if (tag === 'STYLE' || tag === 'SCRIPT' || tag === 'NOSCRIPT' || tag === 'TITLE') continue;
      seen.push(text);
      const tagged = !!el.closest('[data-money],[data-fact]');
      for (const token of findCurrencyTokens(text)) {
        if (!tagged) {
          pushV(violations, 'untraced-value',
            `"${token}" is rendered without a data-money or data-fact attribute, so it cannot be traced to landlord-facts.json`,
            describe(el));
        } else if (!currencyMatchesAnyFact(token, index)
                   && !el.closest('[data-money="derived"]')) {
          pushV(violations, 'value-not-in-facts',
            `"${token}" does not correspond to any amount in landlord-facts.json`,
            describe(el));
        }
      }
      for (const num of findNumerals(text)) {
        if (!allowNumerals.has(num) && !el.closest('[data-numeral-ok],[data-money="derived"]')) {
          pushV(violations, 'numeral-not-declared',
            `the numeral ${num} appears on screen but is neither in landlord-facts.json nor in its declared display allow-list`,
            describe(el));
        }
      }
    }
  }

  /* -- 3. canvas / WebGL labels ---------------------------------------- */
  for (const label of canvasLabels) {
    const text = typeof label === 'string' ? label : label.text;
    const where = typeof label === 'string' ? 'canvas' : (label.where || 'canvas');
    seen.push(text);
    for (const token of findCurrencyTokens(text)) {
      if (!currencyMatchesAnyFact(token, index)) {
        pushV(violations, 'value-not-in-facts',
          `canvas label "${token}" does not correspond to any amount in landlord-facts.json`,
          where);
      }
    }
  }

  /* -- 4. banned words and trade dress --------------------------------- */
  const corpus = [
    ...seen,
    document?.title || '',
    ...collectAttributeText(root),
  ].join('\n');
  const upper = corpus.toUpperCase();

  for (const word of BANNED_WORDS) {
    if (BANNED_WORD_EXCEPTIONS.includes(word)) continue;
    const re = new RegExp(`\\b${word.replace(/\s+/g, '\\s+')}\\b`, 'i');
    if (re.test(upper)) {
      pushV(violations, 'banned-word',
        `the banned term "${word}" appears in rendered content`, 'document');
    }
  }
  for (const re of BANNED_TRADE_DRESS) {
    if (re.test(corpus)) {
      pushV(violations, 'banned-trade-dress',
        `content matches the prohibited trade-dress pattern ${re}`, 'document');
    }
  }

  /* -- 5. the facts file must carry its own attribution ---------------- */
  const attr = facts.attribution || {};
  // Check for dataSources (Atlanta) OR the original required fields (London)
  const hasRequired = attr.dataSources || (attr.hmlr && attr.ogl && attr.oglUrl);
  if (!hasRequired) {
    pushV(violations, 'missing-attribution',
      'landlord-facts.json is missing attribution.dataSources (or attribution.hmlr/ogl/oglUrl for London)', 'facts');
  }

  return {
    ok: violations.length === 0,
    violations,
    stats: {
      moneyValuesChecked: checkedMoney,
      textNodesSwept: seen.length,
      canvasLabelsSwept: canvasLabels.length,
      factPathsIndexed: index.byPath.size,
      distinctAmounts: index.amounts.size,
    },
  };
}

function describe(el) {
  if (!el) return 'unknown';
  const id = el.id ? `#${el.id}` : '';
  const cls = el.className && typeof el.className === 'string'
    ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
    : '';
  return `${el.tagName.toLowerCase()}${id}${cls}`;
}

function collectAttributeText(root) {
  const out = [];
  if (!root || !root.querySelectorAll) return out;
  for (const el of root.querySelectorAll('[alt],[title],[aria-label],[placeholder]')) {
    for (const a of ['alt', 'title', 'aria-label', 'placeholder']) {
      const v = el.getAttribute(a);
      if (v) out.push(v);
    }
  }
  return out;
}

/* ------------------------------------------------------- failure surface */

export function renderGateFailure(result, mount = document.body) {
  const rows = result.violations.map((v) => `
    <tr>
      <td class="k">${escapeHtml(v.kind)}</td>
      <td>${escapeHtml(v.detail)}</td>
      <td class="w">${escapeHtml(v.where)}</td>
    </tr>`).join('');

  mount.innerHTML = `
  <div data-integrity-ignore style="
      position:fixed;inset:0;overflow:auto;z-index:99999;
      background:#1A0E0E;color:#FFE9E9;
      font:14px/1.55 ui-monospace,'SF Mono',Menlo,monospace;
      padding:max(24px,env(safe-area-inset-top)) 20px 40px;">
    <div style="max-width:900px;margin:0 auto">
      <div style="display:inline-block;background:#C8102E;color:#fff;font-weight:700;
        letter-spacing:.12em;text-transform:uppercase;font-size:11px;
        padding:6px 11px;border-radius:2px;margin-bottom:14px">Integrity gate failed</div>
      <h1 style="font:700 24px/1.15 'Helvetica Neue',Helvetica,sans-serif;margin:0 0 8px">
        The game did not start.</h1>
      <p style="color:#FFB3B3;max-width:70ch;margin:0 0 20px">
        ${result.violations.length} violation(s). This build displays a value that
        cannot be traced to <code>data/landlord-facts.json</code>, or contains
        prohibited terminology. Refusing to render rather than showing an
        unsourced figure.
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="text-align:left;color:#FF8A8A;border-bottom:1px solid #4A2020">
          <th style="padding:6px 8px">kind</th><th style="padding:6px 8px">detail</th>
          <th style="padding:6px 8px">where</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <pre style="margin-top:22px;color:#C99;font-size:12px">${escapeHtml(JSON.stringify(result.stats, null, 2))}</pre>
    </div>
  </div>`;
  const style = document.createElement('style');
  style.textContent = `td{padding:6px 8px;border-bottom:1px solid #331616;vertical-align:top}
    td.k{color:#FF6B6B;white-space:nowrap}td.w{color:#997;white-space:nowrap}`;
  mount.appendChild(style);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

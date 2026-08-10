/**
 * money.js — every monetary quantity in LANDLORD: LONDON 2026 is a Money
 * object that carries its own provenance back to data/landlord-facts.json.
 *
 * The rule the brief imposes is stronger than "the numbers are right": no value
 * may reach the screen unless its provenance chain bottoms out in the facts
 * file. A player's running cash balance is not itself in the facts file — but
 * every leaf it was built from is, and every operation applied to it is one of
 * a small declared set. That is what makes the load-time gate an ABSENCE check
 * rather than a spot check: anything rendered without a resolvable chain fails.
 */

/** Operations a Money value may be built by. Anything else is rejected. */
export const OPS = Object.freeze({
  FACT: 'fact',        // a leaf read directly out of the facts file
  ADD: 'add',
  SUB: 'sub',
  NEG: 'neg',
  SCALE: 'scale',      // multiply by a declared, facts-file-sourced rate
  SUM: 'sum',
  ZERO: 'zero',
});

let SEQ = 0;

export class Money {
  /**
   * @param {number} amount whole GBP
   * @param {string} op one of OPS
   * @param {object} meta {factPath?, parents?, rate?, rateFactPath?, note?}
   */
  constructor(amount, op, meta = {}) {
    if (!Number.isFinite(amount)) {
      throw new TypeError(`Money amount must be finite, got ${amount}`);
    }
    if (!Object.values(OPS).includes(op)) {
      throw new TypeError(`Money op "${op}" is not a declared operation`);
    }
    this.amount = Math.round(amount);
    this.op = op;
    this.factPath = meta.factPath || null;
    this.rateFactPath = meta.rateFactPath || null;
    this.parents = Object.freeze(meta.parents || []);
    this.note = meta.note || '';
    this.id = `m${++SEQ}`;
    Object.freeze(this);
  }

  /** Leaf: a value taken straight from the facts file. */
  static fact(amount, factPath, note = '') {
    if (!factPath) throw new TypeError('Money.fact requires a factPath');
    return new Money(amount, OPS.FACT, { factPath, note });
  }

  static zero(note = 'zero') {
    return new Money(0, OPS.ZERO, { note });
  }

  add(other) {
    return new Money(this.amount + other.amount, OPS.ADD, { parents: [this, other] });
  }

  sub(other) {
    return new Money(this.amount - other.amount, OPS.SUB, { parents: [this, other] });
  }

  neg() {
    return new Money(-this.amount, OPS.NEG, { parents: [this] });
  }

  /** Multiply by a rate that itself came from the facts file. */
  scale(rate, rateFactPath, note = '') {
    if (!rateFactPath) throw new TypeError('Money.scale requires a rateFactPath');
    if (!Number.isFinite(rate)) throw new TypeError('scale rate must be finite');
    return new Money(this.amount * rate, OPS.SCALE, {
      parents: [this], rateFactPath, note,
    });
  }

  static sum(list) {
    if (!list.length) return Money.zero('empty sum');
    const total = list.reduce((a, m) => a + m.amount, 0);
    return new Money(total, OPS.SUM, { parents: list.slice() });
  }

  get isNegative() { return this.amount < 0; }
  get abs() { return this.amount < 0 ? this.neg() : this; }

  /**
   * Every distinct facts-file path this value was built from.
   * @returns {Set<string>}
   */
  leaves() {
    const out = new Set();
    const walk = (m, depth) => {
      if (depth > 64) throw new RangeError('Money provenance chain too deep');
      if (m.factPath) out.add(m.factPath);
      if (m.rateFactPath) out.add(m.rateFactPath);
      for (const p of m.parents) walk(p, depth + 1);
    };
    walk(this, 0);
    return out;
  }

  /** Human-readable provenance, shown in the game's own audit panel. */
  explain() {
    const lines = [];
    const walk = (m, depth) => {
      const pad = '  '.repeat(depth);
      if (m.op === OPS.FACT) {
        lines.push(`${pad}${fmtPlain(m.amount)}  ← ${m.factPath}`);
      } else if (m.op === OPS.SCALE) {
        lines.push(`${pad}${fmtPlain(m.amount)}  = scale by ${m.rateFactPath}`);
      } else if (m.op === OPS.ZERO) {
        lines.push(`${pad}${fmtPlain(0)}  ← zero`);
      } else {
        lines.push(`${pad}${fmtPlain(m.amount)}  = ${m.op}`);
      }
      for (const p of m.parents) walk(p, depth + 1);
    };
    walk(this, 0);
    return lines.join('\n');
  }
}

/* ------------------------------------------------------------------ format */

/** Full precision, grouped. £33,575,353 */
export function fmtPlain(amount) {
  const n = Math.round(Math.abs(amount));
  const s = '£' + n.toLocaleString('en-GB');
  return amount < 0 ? '−' + s : s;
}

/**
 * Compact, for tight 3D labels and small chips. £33.6m / £325k / £940
 * FT house style: one decimal on millions, none on thousands.
 */
export function fmtCompact(amount) {
  const neg = amount < 0;
  const n = Math.abs(Math.round(amount));
  let s;
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    s = '£' + (m >= 100 ? m.toFixed(0) : m.toFixed(1)) + 'm';
  } else if (n >= 1_000) {
    s = '£' + Math.round(n / 1_000).toLocaleString('en-GB') + 'k';
  } else {
    s = '£' + n.toLocaleString('en-GB');
  }
  return neg ? '−' + s : s;
}

/** 1935 board prices are plain pounds and never abbreviated. */
export function fmt1935(amount) {
  return '£' + Math.round(amount).toLocaleString('en-GB');
}

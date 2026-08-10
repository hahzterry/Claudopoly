/**
 * facts.js — the only door to data/landlord-facts.json.
 *
 * Nothing else in the codebase is allowed to hold a monetary literal. Every
 * value is fetched through here, and comes back as a Money carrying the dotted
 * fact path it was read from, so the load-time gate can trace it.
 */
import { Money } from './money.js';

let FACTS = null;

export async function loadFacts(url = './landlord-facts.json') {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load the fact base (${res.status})`);
  FACTS = await res.json();
  validateShape(FACTS);
  return FACTS;
}

export function facts() {
  if (!FACTS) throw new Error('Fact base not loaded');
  return FACTS;
}

function validateShape(f) {
  const required = ['streets', 'assumptions', 'attribution', 'eventCards',
                    'displayAllowlist', 'groups', 'heritage'];
  for (const k of required) {
    if (!f[k]) throw new Error(`Fact base is missing "${k}"`);
  }
  if (f.streets.length !== 22) {
    throw new Error(`Expected 22 streets, found ${f.streets.length}`);
  }
}

/* --------------------------------------------------------------- accessors */

export function streets() { return facts().streets; }
export function street(id) {
  const s = facts().streets.find((x) => x.id === id);
  if (!s) throw new Error(`No street "${id}" in the fact base`);
  return s;
}
export function streetAt(i) { return facts().streets[i]; }
export function groups() { return facts().groups; }
export function groupOf(id) {
  return facts().groups.find((g) => g.id === id);
}
export function assumptions() { return facts().assumptions; }
export function attribution() { return facts().attribution; }
export function eventCards() { return facts().eventCards; }
export function heritage() { return facts().heritage; }

/* ------------------------------------------------------- money constructors */

const idx = (id) => facts().streets.findIndex((s) => s.id === id);

export function priceOf(id) {
  const s = street(id);
  return Money.fact(s.value2026.amount, `streets[${idx(id)}].value2026.amount`,
    `${s.name} — ${s.value2026.basisLabel}`);
}

export function rentOf(id) {
  const s = street(id);
  return Money.fact(s.rentAssumption.amount, `streets[${idx(id)}].rentAssumption.amount`,
    `${s.name} — rent, yield assumption`);
}

export function debtCapacityOf(id) {
  const s = street(id);
  return Money.fact(s.mortgageAssumption.amount, `streets[${idx(id)}].mortgageAssumption.amount`,
    `${s.name} — debt available at ${s.mortgageAssumption.ltvPct}% LTV`);
}

export function board1935Of(id) {
  const s = street(id);
  return Money.fact(s.boardPrice1935.amount, `streets[${idx(id)}].boardPrice1935.amount`,
    `${s.name} — 1935 board price`);
}

export function startingCapital() {
  return Money.fact(facts().assumptions.startingCapital,
    'assumptions.startingCapital', 'Opening capital');
}

/* -------------------------------------------------------------- formatting */

export function basisLabel(id) { return street(id).value2026.basisLabel; }

/** The provenance line the property panel shows under every 2026 figure. */
export function sourceLine(id) {
  const v = street(id).value2026;
  const bits = [v.dataset];
  if (v.sampleSize) bits.push(`n=${v.sampleSize}`);
  if (v.referenceMonth) bits.push(v.referenceMonth);
  bits.push(`accessed ${v.datasetAccessed}`);
  return bits.join(' · ');
}

#!/usr/bin/env node
/**
 * test-strategy.mjs — is there actually a decision?
 *
 * A critic proved gearing was strictly dominant: it bought 2.5x the rent per
 * pound of cash and its only cost was paid in an unscored currency. Scoring net
 * of debt service should restore the trade-off. This plays fixed policies
 * against each other to check, rather than taking it on faith.
 */
import { readFileSync } from 'node:fs';
const ROOT = new URL('..', import.meta.url).pathname;
const FACTS = JSON.parse(readFileSync(ROOT + 'data/landlord-facts.json', 'utf8'));
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => FACTS });
const { loadFacts } = await import('../src/facts.js');
const { Game } = await import('../src/engine.js');
await loadFacts('x');

const POLICIES = {
  'always gear':    (g, p) => g.pending.canBuyGeared ? 'gear' : (g.pending.canBuyOutright ? 'buy' : 'pass'),
  'always outright':(g, p) => g.pending.canBuyOutright ? 'buy' : 'pass',
  'never buy':      () => 'pass',
  'gear big only':  (g, p) => {
    // outright when it is affordable without eating the reserve, gear only for
    // something that would otherwise be out of reach
    const price = g.pending.price.amount;
    if (g.pending.canBuyOutright && price < p.cash.amount * 0.5) return 'buy';
    return g.pending.canBuyGeared ? 'gear' : 'pass';
  },
};

function play(polA, polB, seed) {
  const g = new Game({ seed });
  const pol = [POLICIES[polA], POLICIES[polB]];
  let guard = 0;
  while (g.phase !== 'over' && guard++ < 900) {
    g.roll(); g.land();
    if (g.pending) g.decide(pol[g.current](g, g.player));
    g.endTurn();
  }
  const r = g.result();
  return {
    winner: r.winner.id,
    scores: g.players.map((p) => p.scoringRentRoll(g).amount),
    debt: g.players.map((p) => p.debt.amount),
    streets: g.players.map((p) => p.owned.length),
  };
}

const names = Object.keys(POLICIES);
console.log('\n  head to head, 200 games each pairing, seat-swapped\n');
console.log('  ' + 'policy'.padEnd(17) + names.map((n) => n.slice(0, 9).padStart(11)).join(''));
const N = 200;
for (const a of names) {
  const row = [];
  for (const b of names) {
    let wins = 0;
    for (let i = 0; i < N; i++) {
      const seed = 4000 + i * 7919;
      // play both seatings so position cannot flatter a policy
      if (play(a, b, seed).winner === 0) wins++;
      if (play(b, a, seed).winner === 1) wins++;
    }
    row.push(`${Math.round(wins / (2 * N) * 100)}%`.padStart(11));
  }
  console.log('  ' + a.padEnd(17) + row.join(''));
}

console.log('\n  a single game, always-gear vs always-outright:');
const s = play('always gear', 'always outright', 4242);
console.log(`    geared   : score £${s.scores[0].toLocaleString('en-GB')}  debt £${s.debt[0].toLocaleString('en-GB')}  ${s.streets[0]} streets`);
console.log(`    outright : score £${s.scores[1].toLocaleString('en-GB')}  debt £${s.debt[1].toLocaleString('en-GB')}  ${s.streets[1]} streets`);
console.log('');

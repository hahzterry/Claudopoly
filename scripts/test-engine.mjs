#!/usr/bin/env node
/**
 * test-engine.mjs — headless simulation of the rules.
 *
 * Runs many complete games with different seeds and asserts the things a
 * player would notice: that the board is well-formed, that games actually end,
 * that nobody's cash goes silently negative, that both sides can win, and —
 * the one that matters most here — that every Money value produced during a
 * full game resolves to a real path in the fact base.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const FACTS_PATH = join(ROOT, 'data', 'landlord-facts.json');
const FACTS_JSON = JSON.parse(readFileSync(FACTS_PATH, 'utf8'));

// facts.js fetches; give it something to fetch from.
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => FACTS_JSON });

const { loadFacts, facts } = await import('../src/facts.js');
const { Game, buildBoard, SQUARE } = await import('../src/engine.js');
const { buildFactIndex, resolveFactPath } = await import('../src/integrity.js');

await loadFacts('ignored');

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) return;
  failures++;
  console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
};

/* ---------------------------------------------------------------- board */
const board = buildBoard();
check('board has 28 squares', board.length === 28, `got ${board.length}`);
const streetSquares = board.filter((s) => s.type === SQUARE.STREET);
check('board has 22 street squares', streetSquares.length === 22, `got ${streetSquares.length}`);
check('every street id is unique',
  new Set(streetSquares.map((s) => s.streetId)).size === 22);
check('every street in the fact base is on the board',
  facts().streets.every((s) => streetSquares.some((q) => q.streetId === s.id)));
check('corners are at 0, 7, 14, 21',
  [0, 7, 14, 21].every((i) => board[i].corner === true));

/* ------------------------------------------------------------ simulate */
const index = buildFactIndex(facts());
const GAMES = 400;
let wins = [0, 0];
let bankruptcies = 0;
let totalTurns = 0;
let unresolvedLeaves = 0;
let negativeCash = 0;
let maxRoundsSeen = 0;
const purchases = new Map();

for (let g = 0; g < GAMES; g++) {
  const game = new Game({ seed: 1000 + g * 7919 });
  let guard = 0;

  while (game.phase !== 'over' && guard++ < 500) {
    game.roll();
    game.land();

    if (game.pending) {
      // Both sides use the AI policy so the simulation exercises real choices.
      game.decide(game.aiDecision());
    }

    for (const p of game.players) {
      if (p.cash.amount < 0 && !p.bankrupt) negativeCash++;
      // every value a player holds must trace to the fact base
      for (const m of [p.cash, p.debt, p.portfolioValue(), p.netWorth()]) {
        for (const leaf of m.leaves()) {
          if (resolveFactPath(index, leaf) === undefined) {
            unresolvedLeaves++;
            if (unresolvedLeaves < 4) console.error(`    unresolved: ${leaf}`);
          }
        }
      }
    }
    game.endTurn();
  }

  check(`game ${g} terminated`, game.phase === 'over', `guard=${guard}`);
  totalTurns += game.turn;
  maxRoundsSeen = Math.max(maxRoundsSeen, game.round);
  const res = game.result();
  wins[res.winner.id]++;
  if (game.players.some((p) => p.bankrupt)) bankruptcies++;
  for (const p of game.players) {
    for (const id of p.owned) purchases.set(id, (purchases.get(id) || 0) + 1);
  }
}

check('no player ever ends a step with negative cash unresolved', negativeCash === 0,
  `${negativeCash} occurrences`);
check('all money resolves to the fact base', unresolvedLeaves === 0,
  `${unresolvedLeaves} unresolved leaves`);
check('both players win sometimes', wins[0] > 0 && wins[1] > 0,
  `human ${wins[0]} / fund ${wins[1]}`);

/* ---- balance reporting (not pass/fail, but a designer needs to see it) ---- */
const neverBought = facts().streets.filter((s) => !purchases.has(s.id));
const buyRate = [...purchases.entries()].sort((a, b) => b[1] - a[1]);

console.log(`\n  simulated ${GAMES} games`);
console.log(`  win split          human ${wins[0]} / fund ${wins[1]} ` +
            `(${(wins[0] / GAMES * 100).toFixed(0)}% / ${(wins[1] / GAMES * 100).toFixed(0)}%)`);
console.log(`  mean turns/game    ${(totalTurns / GAMES).toFixed(1)}`);
console.log(`  games with a bust  ${bankruptcies} (${(bankruptcies / GAMES * 100).toFixed(0)}%)`);
console.log(`  streets never bought  ${neverBought.length}` +
            (neverBought.length ? `: ${neverBought.map((s) => s.name).join(', ')}` : ''));
console.log(`  most bought        ${buyRate.slice(0, 3).map(([id, n]) =>
  `${facts().streets.find((s) => s.id === id).name} (${n})`).join(', ')}`);
console.log(`  least bought       ${buyRate.slice(-3).map(([id, n]) =>
  `${facts().streets.find((s) => s.id === id).name} (${n})`).join(', ')}`);

if (failures) {
  console.error(`\n  ✗ ${failures} engine check(s) failed\n`);
  process.exit(1);
}
console.log(`\n  ✓ engine verified — ${GAMES} games, all money traced\n`);

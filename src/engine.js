/**
 * engine.js — rules and state for LANDLORD: ATLANTA 2026.
 *
 * Lineage: Elizabeth Magie's The Landlord's Game (1904, US Patent 748,626,
 * public domain), which existed to show what happens when land rent accrues to
 * whoever got there first. Two mechanics carry that idea here:
 *   - your income IS your rent roll, so land ownership compounds;
 *   - THE LEVY taxes that rent roll, so holding land has a running cost.
 *
 * No mechanic, name or artwork is taken from any modern commercial board game.
 * Adapted for Atlanta, GA, using real property data from the Atlanta metro area.
 */
import { Money, fmtPlain, fmtCompact } from './money.js';
import * as F from './facts.js';

export const SQUARE = {
  SURVEY: 'survey',
  REGISTRY: 'registry',
  LEVY: 'levy',
  GAZETTE: 'gazette',
  STREET: 'street',
};

/** 28 squares: 22 real streets, 4 corners, 2 extra Gazette draws. */
export function buildBoard() {
  const streets = F.streets();
  const layout = [];
  let s = 0;
  const push = (type, extra = {}) => layout.push({ index: layout.length, type, ...extra });

  push(SQUARE.SURVEY, { name: 'The Survey', blurb: 'Collect a year of rent from everything you hold.' });
  for (let i = 0; i < 3; i++) push(SQUARE.STREET, { streetId: streets[s++].id });
  push(SQUARE.GAZETTE, { name: 'The Gazette', blurb: 'Draw a real 2026 headline.' });
  for (let i = 0; i < 2; i++) push(SQUARE.STREET, { streetId: streets[s++].id });

  push(SQUARE.REGISTRY, { name: 'The Registry', blurb: 'A safe square. Review your holdings.' });
  for (let i = 0; i < 6; i++) push(SQUARE.STREET, { streetId: streets[s++].id });

  push(SQUARE.LEVY, { name: 'The Land Value Levy', blurb: 'Pay one month of rent on every street you hold.' });
  for (let i = 0; i < 3; i++) push(SQUARE.STREET, { streetId: streets[s++].id });
  push(SQUARE.GAZETTE, { name: 'The Gazette', blurb: 'Draw a real 2026 headline.' });
  for (let i = 0; i < 2; i++) push(SQUARE.STREET, { streetId: streets[s++].id });

  push(SQUARE.GAZETTE, { name: 'The Gazette', blurb: 'Draw a real 2026 headline.', corner: true });
  for (let i = 0; i < 6; i++) push(SQUARE.STREET, { streetId: streets[s++].id });

  if (s !== 22) throw new Error(`Board consumed ${s} streets, expected 22`);
  if (layout.length !== 28) throw new Error(`Board has ${layout.length} squares, expected 28`);
  layout[0].corner = true;
  layout[7].corner = true;
  layout[14].corner = true;
  layout[21].corner = true;
  return layout;
}

/* ------------------------------------------------------------------ random */

/** Seeded PRNG so a game can be replayed exactly — needed for critic reruns. */
export function makeRng(seed = 20260810) {
  let s = seed >>> 0;
  return function rng() {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/* ------------------------------------------------------------------- state */

export class Player {
  constructor(id, name, colour, isAI) {
    this.id = id;
    this.name = name;
    this.colour = colour;
    this.isAI = isAI;
    this.pos = 0;
    this.cash = F.startingCapital();
    this.debt = Money.zero('opening debt');
    this.owned = [];          // street ids
    this.bankrupt = false;
  }

  get holdings() { return this.owned.map((id) => F.street(id)); }

  portfolioValue() {
    if (!this.owned.length) return Money.zero('no holdings');
    return Money.sum(this.owned.map((id) => F.priceOf(id)));
  }

  /** One year of assumed gross rent across everything held. */
  annualRentRoll() {
    if (!this.owned.length) return Money.zero('no holdings');
    return Money.sum(this.owned.map((id) => F.rentOf(id)));
  }

  /**
   * The score. Rent roll with site assembly applied: a completed colour group
   * counts double, because assembling a whole frontage is what actually
   * unlocks land value. This is what the game is won on.
   */
  scoringRentRoll(game) {
    if (!this.owned.length) return Money.zero('no holdings');
    const mult = game.assumptions.assemblyMultiplier;
    const gross = Money.sum(this.owned.map((id) => {
      const rent = F.rentOf(id);
      return game.hasAssembly(this.id, F.street(id).group)
        ? rent.scale(mult, 'assumptions.assemblyMultiplier', 'site assembly')
        : rent;
    }));
    // NET of debt service. Scoring the gross roll made gearing strictly
    // dominant: it bought 2.5x the rent per pound of cash and its only cost,
    // interest, was paid in a currency nobody was scored on. Charging the
    // interest against the score restores the trade-off — gearing buys scale
    // but at a lower return on the cash you put in, because the 5.25% cost of
    // debt sits above the 4.0% the asset yields.
    if (this.debt.amount <= 0) return gross;
    const service = this.debt.scale(game.assumptions.debtInterestPct / 100,
      'assumptions.debtInterestPct', 'annual debt service');
    return gross.sub(service);
  }

  /** The gross figure, still shown alongside the score so the cost is legible. */
  grossScoringRentRoll(game) {
    if (!this.owned.length) return Money.zero('no holdings');
    const mult = game.assumptions.assemblyMultiplier;
    return Money.sum(this.owned.map((id) => {
      const rent = F.rentOf(id);
      return game.hasAssembly(this.id, F.street(id).group)
        ? rent.scale(mult, 'assumptions.assemblyMultiplier', 'site assembly')
        : rent;
    }));
  }

  netWorth() {
    return this.cash.add(this.portfolioValue()).sub(this.debt);
  }
}

export class Game {
  constructor({ seed = 20260810, aiOpponent = true } = {}) {
    this.board = buildBoard();
    this.rng = makeRng(seed);
    this.assumptions = F.assumptions();
    this.turnLimit = this.assumptions.turnLimit;
    this.turn = 0;
    this.players = [
      new Player(0, 'You', '#C8102E', false),
      new Player(1, 'The Fund', '#1B3A6B', aiOpponent),
    ];
    this.current = 0;
    this.ownerOf = new Map();     // streetId -> playerId
    this.deck = this.shuffleDeck();
    this.deckPos = 0;
    this.log = [];
    this.phase = 'awaiting-roll';  // awaiting-roll | moving | resolving | awaiting-decision | over
    this.pending = null;
    this.lastRoll = null;
  }

  shuffleDeck() {
    const cards = F.eventCards().slice();
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return cards;
  }

  get player() { return this.players[this.current]; }
  get opponent() { return this.players[1 - this.current]; }
  get round() { return Math.floor(this.turn / this.players.length) + 1; }
  get roundsTotal() { return this.turnLimit / this.players.length; }

  /** Does this player hold every square in the group? */
  hasAssembly(playerId, groupId) {
    const inGroup = F.streets().filter((s) => s.group === groupId);
    return inGroup.length > 0 && inGroup.every((s) => this.ownerOf.get(s.id) === playerId);
  }

  note(text, kind = 'info') {
    this.log.push({ turn: this.turn, kind, text });
    if (this.log.length > 60) this.log.shift();
  }

  /* ------------------------------------------------------------ turn flow */

  roll() {
    if (this.phase !== 'awaiting-roll') return null;
    const d1 = 1 + Math.floor(this.rng() * 6);
    const d2 = 1 + Math.floor(this.rng() * 6);
    this.lastRoll = { d1, d2, total: d1 + d2 };
    this.phase = 'moving';
    return this.lastRoll;
  }

  /** Called once the token animation has finished. Returns the resolution. */
  land() {
    const p = this.player;
    if (!this.lastRoll) return { square: this.board[p.pos], events: [], passedSurvey: false };
    const steps = this.lastRoll.total;
    const from = p.pos;
    const to = (from + steps) % this.board.length;
    const passedSurvey = to < from || steps >= this.board.length;
    p.pos = to;

    const events = [];
    if (passedSurvey) events.push(...this.resolveSurvey(p));
    events.push(...this.resolveSquare(p, this.board[to]));
    this.phase = this.pending ? 'awaiting-decision' : 'resolving';
    return { square: this.board[to], events, passedSurvey };
  }

  resolveSurvey(p) {
    const out = [];
    const roll = p.annualRentRoll();
    if (roll.amount > 0) {
      const annual = roll;
      p.cash = p.cash.add(annual);
      out.push({ kind: 'income', money: annual,
        text: `Rent roll collected on ${p.owned.length} street${p.owned.length === 1 ? '' : 's'}` });
      this.note(`${p.name} collected ${fmtCompact(annual.amount)} in rent`, 'income');
    }
    const levyBase = p.annualRentRoll();
    if (levyBase.amount > 0) {
      const levy = levyBase.scale(this.assumptions.levyRateOfRentPct / 100,
        'assumptions.levyRateOfRentPct', 'the annual land value levy');
      p.cash = p.cash.sub(levy);
      out.push({ kind: 'levy', money: levy,
        text: `Land value levy at ${this.assumptions.levyRateOfRentPct}% of the rent roll` });
      this.note(`${p.name} paid a land value levy of ${fmtCompact(levy.amount)}`, 'cost');
    }
    if (p.debt.amount > 0) {
      const rate = this.assumptions.debtInterestPct / 100;
      const interest = p.debt.scale(rate, 'assumptions.debtInterestPct',
        'annual interest on outstanding debt');
      p.cash = p.cash.sub(interest);
      out.push({ kind: 'interest', money: interest,
        text: `Interest at ${this.assumptions.debtInterestPct}% on outstanding debt` });
      this.note(`${p.name} paid ${fmtCompact(interest.amount)} interest`, 'cost');
    }
    return out;
  }

  resolveSquare(p, sq) {
    switch (sq.type) {
      case SQUARE.STREET: return this.resolveStreet(p, sq);
      case SQUARE.LEVY: return this.resolveLevy(p);
      case SQUARE.GAZETTE: return this.resolveGazette(p);
      case SQUARE.REGISTRY:
        return [{ kind: 'safe', text: 'A safe square. Nothing is owed.' }];
      case SQUARE.SURVEY:
        return [{ kind: 'safe', text: 'The Survey. Your rent roll is already counted.' }];
      default: return [];
    }
  }

  resolveStreet(p, sq) {
    const id = sq.streetId;
    const owner = this.ownerOf.get(id);
    const s = F.street(id);

    if (owner === undefined) {
      const price = F.priceOf(id);
      const debtAvail = F.debtCapacityOf(id);
      const cashIfGeared = price.sub(debtAvail);
      this.pending = {
        type: 'acquire', streetId: id,
        canBuyOutright: p.cash.amount >= price.amount,
        canBuyGeared: p.cash.amount >= cashIfGeared.amount,
        price, debtAvail, cashIfGeared,
      };
      return [{ kind: 'offer', text: `${s.name} is unowned.`, streetId: id }];
    }

    if (owner === p.id) {
      return [{ kind: 'own', text: `Your own street.`, streetId: id }];
    }

    let rent = F.rentOf(id);
    if (this.hasAssembly(owner, s.group)) {
      rent = rent.scale(this.assumptions.assemblyMultiplier,
        'assumptions.assemblyMultiplier', 'site assembly doubles the rent charged');
    }
    const holder = this.players[owner];
    p.cash = p.cash.sub(rent);
    holder.cash = holder.cash.add(rent);
    this.note(`${p.name} paid ${fmtCompact(rent.amount)} rent on ${s.name}`, 'cost');
    this.checkSolvency(p);
    return [{ kind: 'rent', money: rent, streetId: id,
      text: `Rent to ${holder.name} on ${s.name}` }];
  }

  resolveLevy(p) {
    const roll = p.annualRentRoll();
    if (roll.amount === 0) {
      return [{ kind: 'safe', text: 'You hold no land, so you owe no levy. That is the point.' }];
    }
    const levy = roll.scale(this.assumptions.levyRateOfRentPct / 100,
      'assumptions.levyRateOfRentPct', 'the land value levy, a share of the rent roll');
    p.cash = p.cash.sub(levy);
    this.note(`${p.name} paid a land value levy of ${fmtCompact(levy.amount)}`, 'cost');
    this.checkSolvency(p);
    return [{ kind: 'levy', money: levy,
      text: `Land value levy on ${p.owned.length} street${p.owned.length === 1 ? '' : 's'}` }];
  }

  resolveGazette(p) {
    const card = this.deck[this.deckPos % this.deck.length];
    this.deckPos++;
    this.note(`${p.name} drew "${card.title}"`, 'event');
    return [{ kind: 'gazette', card, text: card.title }];
  }

  /* ----------------------------------------------------------- decisions */

  decide(choice) {
    const pend = this.pending;
    if (!pend || pend.type !== 'acquire') return null;
    const p = this.player;
    const id = pend.streetId;
    const s = F.street(id);
    let result;

    if (choice === 'buy' && pend.canBuyOutright) {
      p.cash = p.cash.sub(pend.price);
      p.owned.push(id);
      this.ownerOf.set(id, p.id);
      this.note(`${p.name} bought ${s.name} for ${fmtCompact(pend.price.amount)}`, 'buy');
      result = { kind: 'bought', money: pend.price, streetId: id, geared: false };
    } else if (choice === 'gear' && pend.canBuyGeared) {
      p.cash = p.cash.sub(pend.cashIfGeared);
      p.debt = p.debt.add(pend.debtAvail);
      p.owned.push(id);
      this.ownerOf.set(id, p.id);
      this.note(`${p.name} bought ${s.name} with ${fmtCompact(pend.debtAvail.amount)} of debt`, 'buy');
      result = { kind: 'bought', money: pend.cashIfGeared, streetId: id, geared: true };
    } else {
      this.note(`${p.name} passed on ${s.name}`, 'pass');
      result = { kind: 'passed', streetId: id };
    }
    this.pending = null;
    this.phase = 'resolving';
    return result;
  }

  /* -------------------------------------------------------- AI behaviour */

  /**
   * The Fund is a yield-seeking buyer with a cash discipline: it will gear into
   * anything whose assumed yield clears its debt cost, but never spends below a
   * reserve, and prefers completing a colour group.
   */
  aiDecision() {
    const pend = this.pending;
    if (!pend) return 'pass';
    const p = this.player;
    const s = F.street(pend.streetId);
    const ai = this.assumptions.ai;

    const ownsMate = F.streets().some(
      (x) => x.group === s.group && x.id !== s.id && this.ownerOf.get(x.id) === p.id);

    // Appetite is a share of current cash. Completing a colour group is worth
    // stretching for; nothing else is.
    const completes = this.wouldComplete(p.id, s);
    const appetite = (ownsMate || completes) ? ai.groupAppetite : ai.baseAppetite;
    const spare = (outlay) => p.cash.amount - outlay > ai.cashReserve;

    if (pend.canBuyOutright && spare(pend.price.amount)
        && pend.price.amount <= p.cash.amount * appetite) {
      return 'buy';
    }
    // Gearing costs more than the asset yields, so it is only worth doing for
    // something that would otherwise be out of reach.
    if (pend.canBuyGeared && spare(pend.cashIfGeared.amount)
        && pend.cashIfGeared.amount <= p.cash.amount * ai.gearWhenTrophy) {
      return 'gear';
    }
    return 'pass';
  }

  /** Would buying this street give the player the whole group? */
  wouldComplete(playerId, street) {
    const inGroup = F.streets().filter((s) => s.group === street.group);
    return inGroup.every((s) => s.id === street.id || this.ownerOf.get(s.id) === playerId);
  }

  /* ---------------------------------------------------------- turn close */

  checkSolvency(p) {
    if (p.cash.amount >= 0) return;
    // Forced deleveraging: sell the smallest holding until solvent.
    while (p.cash.amount < 0 && p.owned.length) {
      const smallest = p.owned
        .map((id) => ({ id, v: F.street(id).value2026.amount }))
        .sort((a, b) => a.v - b.v)[0];
      const proceeds = F.priceOf(smallest.id);
      p.cash = p.cash.add(proceeds);
      p.owned = p.owned.filter((x) => x !== smallest.id);
      this.ownerOf.delete(smallest.id);
      this.note(`${p.name} sold ${F.street(smallest.id).name} to cover a shortfall`, 'forced');
    }
    if (p.cash.amount < 0) {
      p.bankrupt = true;
      this.note(`${p.name} is out of capital`, 'bust');
    }
  }

  /**
   * The market moves every year whether or not anyone lands on the Gazette.
   * A critic played fifteen rounds without seeing a single card, so the deck
   * now also opens each round.
   */
  drawRoundCard() {
    const card = this.deck[this.deckPos % this.deck.length];
    this.deckPos++;
    this.note(`The Gazette: "${card.title}"`, 'event');
    return card;
  }

  endTurn() {
    this.pending = null;
    this.turn++;
    const alive = this.players.filter((x) => !x.bankrupt);
    if (this.turn >= this.turnLimit || alive.length <= 1) {
      this.phase = 'over';
      return this.result();
    }
    do {
      this.current = (this.current + 1) % this.players.length;
    } while (this.players[this.current].bankrupt);
    this.phase = 'awaiting-roll';
    this.roundJustOpened = this.turn % this.players.length === 0;
    return null;
  }

  result() {
    // The game is won on rent roll, not on the size of the pile. Net worth
    // only breaks a tie.
    const score = (p) => p.scoringRentRoll(this).amount;
    const ranked = this.players.slice().sort(
      (a, b) => (score(b) - score(a)) || (b.netWorth().amount - a.netWorth().amount));
    return {
      winner: ranked[0],
      ranked,
      scores: ranked.map((p) => ({ id: p.id, rentRoll: p.scoringRentRoll(this),
                                   netWorth: p.netWorth() })),
      reason: this.players.some((p) => p.bankrupt) ? 'Opponent ran out of capital'
        : `Largest annual rent roll after ${this.roundsTotal} rounds`,
    };
  }
}

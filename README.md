# LANDLORD: LONDON 2026

A playable 3D browser board game of 22 classic London streets, where **every price
on the board is a real 2026 figure from HM Land Registry open data** — and the game
refuses to start if it finds a number it cannot trace.

An original homage to Elizabeth Magie's **The Landlord's Game** (1904, US Patent
748,626, public domain). She built it to demonstrate the consequences of land
monopoly. You win here on *rent roll*, not on the size of your pile — which was
her point.

---

## The data

| Street | 1935 board | 2026 recorded | Basis |
|---|---|---|---|
| Old Kent Road | £60 | £325,000 | median price paid, n=38 |
| Bow Street | £180 | £367,933 | a single recorded sale |
| Park Lane | £350 | £825,000 | median price paid, n=41 |
| Bond Street | £320 | £33,575,353 | median, all recorded transactions, n=16 |

The printed 1935 ladder spanned **6.7×**. The recorded 2026 evidence spans **103×**.
Park Lane was second dearest in 1935 and is now sixth cheapest. Bond Street was
20th of 22 and is now 1st.

21 of the 22 streets resolve to actual recorded transactions, each carrying its
HM Land Registry transaction ID and URI. Trafalgar Square has no residential sale
on record at all, so it falls back to the UK HPI borough average — and the square
says so on its face.

**Known weakness, disclosed on each affected square:** the median-price-paid method
mixes some commercial transfers into a few streets. Bond Street's figure is the most
affected by this. It is recorded evidence with that caveat, not a residential value.

## The integrity gate

`src/integrity.js` runs on every load. It is an **absence check, not a spot check**:
it does not sample, it asks the whole surface.

- Every monetary value carries a provenance chain back to `data/landlord-facts.json`
  (`src/money.js`). Displaying a value requires that chain to resolve.
- On load it sweeps ~141 money values, ~1,700 text nodes, and 99 strings baked into
  WebGL textures — including an audit render of all 22 property panels, all 21 event
  cards, the comparison chart and the sources page, so unreached screens are covered.
- Any failure halts the game and prints which value, and why.
- A banned-word and trade-dress sweep runs over the same surface.

It is verified by attack rather than assertion — `scripts/test-gate.mjs` injects eight
fabrications and fails the build if any survives:

```
✓ catches untraced-value-tagged     ✓ catches undeclared-numeral
✓ catches untagged-value            ✓ catches fabricated-compact
✓ catches banned-word               ✓ catches fabricated-k
✓ catches trade-dress               ✓ catches canvas-label
```

`scripts/verify-facts.mjs` is the build-time half: it refuses to let a monetary
literal or a banned term exist in source at all.

## Running it

```bash
npm install
npm run dev            # http://localhost:5178
npm run build
```

Checks:

```bash
node scripts/verify-facts.mjs     # build-time gate
node scripts/test-engine.mjs      # 400 simulated games, all money traced
node scripts/test-gate.mjs        # attack the runtime gate
node scripts/test-strategy.mjs    # is there actually a decision?
node scripts/test-restart.mjs     # restart mid-animation must not soft-lock
```

## Rebuilding the fact base

```bash
python3 scripts/fetch-hmlr.py     # live pull from HM Land Registry
python3 scripts/build-facts.py    # medians, bases, derived figures
python3 scripts/enrich-facts.py   # event cards, attribution, allow-lists
cp data/landlord-facts.json public/landlord-facts.json
```

## The economy

You win on **annual rent roll, net of debt service** — not net worth. Scoring the
gross roll made gearing strictly dominant: it bought 2.5× the rent per pound of cash
and its only cost was paid in a currency nobody was scored on. Charging interest
against the score restored the trade-off, verified by simulation:

| Policy | vs always-gear | vs always-outright | vs mixed |
|---|---|---|---|
| always gear | 50% | 43% | 30% |
| always outright | 57% | 50% | 42% |
| **mixed** | **71%** | **58%** | 50% |

No pure policy dominates, so *when* to gear is the game. Debt costs 4.35% against an
assumed 4.0% yield: gearing buys scale at a worse return on committed cash.

Holding every square in a colour group doubles that group's rent — site assembly.

## Attribution

Contains HM Land Registry data © Crown copyright and database right 2026. This data
is licensed under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).

Contains public sector information licensed under the Open Government Licence v3.0.
The UK House Price Index is produced by HM Land Registry, Registers of Scotland, Land
and Property Services Northern Ireland and the Office for National Statistics.

Price Paid Data extracted 10 August 2026. UK House Price Index: May 2026 release.
UK HPI figures are revised as later transactions are registered.

**No subscription or paywalled data source is used anywhere in this project.**

This game is not produced, endorsed or verified by HM Land Registry, the Office for
National Statistics, Registers of Scotland or Land and Property Services Northern
Ireland.

## Event cards

21 cards, each sourced to gov.uk, the Bank of England or the ONS with a date.
**14 further claims were rejected as unverifiable** — see `eventCardsRejected` in the
fact base. The most commonly repeated of them: that commercial property must reach
EPC C by 2027 and B by 2030. As at August 2026 those remain consultation proposals,
not enacted law; the in-force minimum for non-domestic private rented property in
England and Wales is EPC E.

## Originality

No mechanic, name or artwork is taken from any modern commercial property-trading
board game. Board squares, card decks, tokens and artwork are original. The 1935
prices appear solely as a historical contrast figure, cited as data.

## Licence

Code: MIT. Data: Open Government Licence v3.0, attributed above.

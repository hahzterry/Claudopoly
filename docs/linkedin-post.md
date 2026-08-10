# LANDLORD: LONDON 2026 — LinkedIn pack

**Winner: the craft-led post** (evaluator scores — craft-led 80, data-led 71, story-led 63).
It won on credibility, which is the criterion that matters for an institutional audience.

**Do not post until the URL is live.** The strategist's precondition, and it is right:
a post about never making an unsourced claim, which itself makes an unverifiable
claim, is self-refuting. Replace `[URL]` in two places and check it loads on a phone.

**Corrections applied to the draft** (all found by the evaluator, none cosmetic):
1. Opening replaced with the evaluator's rewrite — buys the scroll-stop with two
   London streets before spending it on the rule, and completes inside the fold.
2. "nobody in a hundred years" → 1935 to 2026 is ninety-one years. A wrong number
   in a post about not publishing wrong numbers.
3. The "£200" pass-Go reference is **deleted**. It is a specific monetary element of
   the modern commercial edition, and the post claims not to use its trade dress.
4. The trade-dress claim is now stated precisely rather than absolutely: the 1935
   prices are cited as a historical data point for contrast, which is commentary —
   not a claim to have invented them.

---

## THE POST

Park Lane is now the sixth cheapest street on the board. In 1935 it was the second dearest.

I trust that figure because the thing it sits on refuses to start if it finds a number it cannot source.

Not a warning. It stops, names the number, and prints why.

That is the actual product of the last day's work. The thing it is attached to is a playable 3D board game of classic London streets, priced at 2026, which I will come to.

The rule first, because the rule is the point.

No monetary value reaches the screen without a chain back to a single facts file. A check runs on every load and sweeps 141 money values, roughly 1,700 text nodes and 99 strings baked into the 3D textures. Each one has to say where it came from. One failure and nothing renders.

It is an absence check, not a spot check. It does not sample. It asks the whole surface.

Then I attacked it, because a gate you have not tried to break is decoration. Eight adversarial injections:

An unsourced value tagged as though it had been traced. An untagged value. A banned term. Trade dress. A fabricated figure baked into a WebGL texture where no text search would reach it. An undeclared numeral. Two invented rounded values whose entire rounding band contains no real transaction.

All eight caught.

Now the venue, and the choice was deliberate.

A board game is the worst possible place to enforce this. It is the one format where invented prices are traditional — in ninety-one years, nobody has asked a board where its prices came from. That is precisely why I put the rule there. If it survives somewhere this frivolous, it survives in a lender covenant pack.

So every price on the board is real. HM Land Registry open data, Price Paid Data and the UK House Price Index, Open Government Licence v3.0. No subscription data anywhere. 21 of the 22 streets carry an actual transaction ID and URI. Trafalgar Square has no residential sale on record at all, so it falls back to the borough HPI average, and the square says so on its face.

And the real data does something a made-up board never could.

Park Lane, second dearest in 1935, is now the sixth cheapest square. Bond Street was twentieth of twenty-two and is now first, at £33,575,353 — a median price paid, and on a handful of streets that method mixes in some commercial transfers, which is disclosed on the square. Regent Street moved eighteenth to fourth cheapest. Old Kent Road has not moved at all: £60 then, £325,000 now, still last.

The printed ladder spanned 6.7x. The recorded evidence spans 103x.

The same discipline ran over the event cards. 21 kept, each sourced to gov.uk, the Bank of England or the ONS. 14 rejected as unverifiable — among them "commercial EPC C by 2027, B by 2030", which a great deal of UK CRE repeats as law. Those targets remain consultation, not enacted law. A second adversarial fact-check then corrected 7 more cards whose wording overstated its own source.

On whether it looks like a toy — that gets tested too, not asserted. Screenshots were compared against real screenshots of Catan Universe with labels stripped, at matched dimensions, three independent judges per comparison, positions swapped, run twice. Desktop 2-1 to ours both runs. Mobile 3-0 both runs. Draw your own conclusion from that; it is a method, not a scalp.

Where it falls short, in my own words rather than yours: the data panel has not passed its own Financial Times standards review — 71 out of 82 at the last check. The median price paid method has the commercial-transfer problem noted above. Bond Street at £33.6m, rounded, is effectively unbuyable on the opening capital.

Provenance: an original homage to Elizabeth Magie's The Landlord's Game, 1904, US Patent 748,626, public domain. You win on rent roll, not on the size of your pile — which was her point. The 1935 prices appear only as a historical contrast figure, cited as data; the artwork, the square names beyond the real streets, the card decks and the pieces are all original.

It is live at [URL]. Find a number on that board that has no source behind it. If you find one, tell me and I will publish the fix and credit you.

Sources, licence attribution, method notes and the list of rejected claims are in the first comment.

If you would rather see this rule applied to a lender covenant pack or a valuation model than to a board game, message me.

---

## FIRST COMMENT

Sources and method, for anyone who wants to check the numbers rather than take my word for them.

Play it here: [URL]

PRICE DATA
All 2026 prices from HM Land Registry open data — Price Paid Data and the UK House Price Index. Contains HM Land Registry data © Crown copyright and database right 2026. This data is licensed under the Open Government Licence v3.0. No subscription data sources were used anywhere in the build.

Method: median price paid per street, with the HM Land Registry transaction ID and URI carried on each square. 21 of the 22 streets resolve to actual recorded transactions. Trafalgar Square has no residential sale on record, so it falls back to the UK HPI borough average — stated on the square itself.

Known weakness, disclosed on each affected square: the median price paid method mixes some commercial transfers into a few streets. Bond Street's £33,575,353 is the figure most affected. Treat it as recorded evidence with that caveat attached, not as a residential value.

THE INTEGRITY GATE
141 monetary values, roughly 1,700 text nodes and 99 strings baked into WebGL textures, swept on every load. Any value without a provenance chain back to the facts file halts the build and prints the reason. Absence check, not spot check.

Verified by attack rather than assertion — eight adversarial injections: an unsourced value tagged as traced, an untagged value, a banned term, trade dress, a fabricated figure baked into a WebGL texture, an undeclared numeral, and two invented rounded values whose rounding band contains no real transaction. All eight caught.

REJECTED CLAIMS
14 candidate event cards were dropped as unverifiable. The most commonly repeated: that commercial property must reach EPC C by 2027 and B by 2030. As at August 2026 those remain consultation proposals, not enacted law. The in-force minimum for non-domestic private rented property in England and Wales is EPC E.

HERITAGE
An original homage to The Landlord's Game by Elizabeth Magie, 1904, US Patent 748,626, in the public domain. She designed it to demonstrate the consequences of land monopoly.

---

## VIDEO

`bench/video/landlord-london-2026.mp4` — 28 seconds, 1080x1080, no audio, captions burned in.

Cut:
- 0-13s: live board, three reversals as caption bands (Park Lane, Bond Street, Old Kent Road), closing on "the old ladder spanned 6.7x / this one spans 103x"
- 13-20s: a real property card with "HM Land Registry Price Paid Data · n=3 · accessed 10 August 2026" visible on it
- 20-28s: a fabricated figure is planted, and the gate refuses to start — real capture of the real failure screen, holding on "The game did not start." and the violation line

Everything on screen is real capture from the running build. Only the caption bands are composited.

**Evaluator's note on the video, worth acting on:** the Bond Street commercial-transfer
caveat is the most reputationally load-bearing caption in the film and was originally
specified as small type during a moving orbit. In this cut it is a full-width band on a
static shot. Keep it that way.

## ALT TEXT

A 3D board game on a wooden table. Twenty-two London streets run round the edge, each
showing its real 2026 price from HM Land Registry data — Old Kent Road £325,000, Bond
Street £33.6m — beside the price the same square carried on the 1935 board.

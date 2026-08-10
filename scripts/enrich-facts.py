#!/usr/bin/env python3
"""
enrich-facts.py — merge the round-0 research (event cards, OGL attribution)
into data/landlord-facts.json, and derive the display allow-list.

The allow-list matters: the load-time gate is an ABSENCE check, so every
numeral the game is permitted to render — including non-monetary ones like a
die face or a turn counter — has to be declared here, in the facts file itself.
Nothing gets to be "obviously fine".
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
FACTS = os.path.join(HERE, "..", "data", "landlord-facts.json")
EVENTS = os.path.join(HERE, "..", "bench", "round0", "events.json")

YEAR = 2026

ATTRIBUTION = {
    "hmlr": ("Contains HM Land Registry data © Crown copyright and database right "
             f"{YEAR}. This data is licensed under the Open Government Licence v3.0."),
    "ogl": "Contains public sector information licensed under the Open Government Licence v3.0.",
    "oglUrl": "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
    "ukhpiProducers": ("The UK House Price Index is produced by HM Land Registry, Registers of "
                       "Scotland, Land and Property Services Northern Ireland and the Office "
                       "for National Statistics."),
    "dataCurrency": ("Price Paid Data extracted 10 August 2026. UK House Price Index: May 2026 "
                     "release. UK HPI figures are revised as later transactions are registered."),
    "noEndorsement": ("This game is not produced, endorsed or verified by HM Land Registry, the "
                      "Office for National Statistics, Registers of Scotland or Land and Property "
                      "Services Northern Ireland. The underlying information is licensed \"as is\"."),
    "heritage": ("An original homage to The Landlord's Game by Elizabeth Magie (1904, US Patent "
                 "748,626), which is in the public domain. Not affiliated with, endorsed by or "
                 "derived from any modern commercial property-trading board game."),
    "noSubscriptionData": ("No subscription or paywalled data source is used anywhere in this "
                           "project."),
}

# Numerals the game may render that are not monetary facts. Each must have a
# reason; "it looked fine" is not one.
STRUCTURAL = {
    "dieFaces": [1, 2, 3, 4, 5, 6],
    "dieTotals": list(range(2, 13)),
    "playerSlots": [1, 2, 3, 4],
    "boardSquares": list(range(0, 41)),
    "turnCounter": list(range(0, 41)),
    "percentGrid": [0, 5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90, 100],
    "ordinals": list(range(1, 23)),
}

YEARS = [1904, 1935, 1936, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031, 748626]


def extract_figures(card):
    """Pull every numeric figure out of a card's rendered text so the gate can
    index it. A figure that appears in body text but not here would fail the
    gate — which is the point."""
    figs = []
    text = f"{card.get('title','')} {card.get('body','')}"
    # £10,000 / £2,302 / £2M / £500,000
    for m in re.finditer(r"£\s?([\d,]+(?:\.\d+)?)\s?(M|m|k|bn)?", text):
        n = float(m.group(1).replace(",", ""))
        suf = (m.group(2) or "").lower()
        if suf == "k":
            n *= 1_000
        elif suf == "m":
            n *= 1_000_000
        elif suf == "bn":
            n *= 1_000_000_000
        figs.append({"value": int(n) if n == int(n) else n, "kind": "currency",
                     "asWritten": m.group(0).strip()})
    # 3.75% / 2.2% / 50.8p
    for m in re.finditer(r"([\d.]+)\s?%", text):
        figs.append({"value": float(m.group(1)), "kind": "percent",
                     "asWritten": m.group(0).strip()})
    for m in re.finditer(r"([\d.]+)p\b", text):
        figs.append({"value": float(m.group(1)), "kind": "pence",
                     "asWritten": m.group(0).strip()})
    # bare years and counts (Section 21, end-2029, six to three, two million)
    for m in re.finditer(r"\b(\d{1,4})\b", text):
        figs.append({"value": int(m.group(1)), "kind": "numeral",
                     "asWritten": m.group(0)})
    # de-duplicate on (value, kind)
    seen, out = set(), []
    for f in figs:
        k = (f["value"], f["kind"])
        if k in seen:
            continue
        seen.add(k)
        out.append(f)
    return out


def main():
    facts = json.load(open(FACTS))

    if not os.path.exists(EVENTS):
        print(f"!! {EVENTS} not found — run the round-0 workflow first", file=sys.stderr)
        sys.exit(1)
    ev = json.load(open(EVENTS))

    # Apply the round-0 adversarial fact-check corrections before anything ships.
    corr_path = os.path.join(HERE, "card-corrections.json")
    corrections = json.load(open(corr_path))["corrections"] if os.path.exists(corr_path) else {}
    applied = 0

    cards = []
    for i, c in enumerate(ev["cards"]):
        fix = corrections.get(c.get("id"))
        if fix:
            applied += 1
            if "body" in fix:
                c["body"] = fix["body"]
            if fix.get("quoteIsParaphrase"):
                c["verifiedQuote"] = ""
                c["quoteKind"] = "paraphrase"
        cards.append({
            "id": c.get("id") or f"card-{i:02d}",
            "title": c["title"],
            "body": c["body"],
            "category": c["category"],
            "realEvent": c["realEvent"],
            "source": {
                "name": c["sourceName"],
                "url": c["sourceUrl"],
                "date": c["sourceDate"],
                "quote": c.get("verifiedQuote", ""),
            },
            "effectSuggestion": c.get("effectSuggestion", ""),
            "quoteKind": c.get("quoteKind", "verbatim"),
            "extraSource": (corrections.get(c.get("id"), {}) or {}).get("extraSource"),
            "correctionApplied": (corrections.get(c.get("id"), {}) or {}).get("why"),
            "figures": extract_figures(c),
        })

    # Debt interest: promoted from a verified event-card figure so the game's
    # one financing cost is a real, dated, published number rather than a guess.
    facts["assumptions"]["debtInterestPct"] = 4.35
    facts["assumptions"]["debtInterestSource"] = {
        "name": "Bank of England — Money and Credit, June 2026",
        "figure": "effective interest rate on new mortgages, 4.35%",
        "date": "29 July 2026",
        "url": "https://www.bankofengland.co.uk/statistics/money-and-credit/2026/june-2026",
    }
    facts["assumptions"]["bankRatePct"] = 3.75
    facts["assumptions"]["bankRateSource"] = {
        "name": "Bank of England — Monetary Policy Summary, July 2026",
        "figure": "Bank Rate held at 3.75%",
        "date": "30 July 2026",
        "url": "https://www.bankofengland.co.uk/monetary-policy-summary-and-minutes/2026/july-2026",
    }
    # Gameplay tuning for the AI opponent. These are NOT market figures and are
    # never rendered on screen; they live here so that no monetary literal
    # exists anywhere in the source, which is what the build-time scanner
    # enforces.
    facts["assumptions"]["ai"] = {
        "note": ("Opponent tuning only. Not sourced, not displayed, not a market "
                 "figure. Declared here so the source contains no bare money literal."),
        "cashReserve": 250000,
        "baseAppetite": 0.45,
        "groupAppetite": 0.75,
        "gearWhenTrophy": 0.88,
    }

    facts["assumptions"]["assemblyMultiplier"] = 2
    facts["assumptions"]["assemblyNote"] = (
        "Site assembly: hold every square in a colour group and the rent those "
        "squares yield counts double. Assembling contiguous holdings is how real "
        "land value is unlocked, and it is what the 1904 original was built to "
        "demonstrate.")
    facts["assumptions"]["winCondition"] = (
        "The winner is the player with the largest annual rent roll at the close, "
        "NET of debt service. Not the largest pile of cash — the largest claim on "
        "London's land rent, after the bank has taken its cut. Net worth breaks a "
        "tie. Because debt costs 4.35% and the assumed yield is 4.0%, gearing buys "
        "you more streets but a lower return on the cash you commit: that is the "
        "decision the game is built on.")
    facts["assumptions"]["levyNote"] = (
        "The land value levy square charges one month of assumed rent on every "
        "street a player holds. It taxes land rent, not improvements — the point "
        "Elizabeth Magie built the 1904 original to demonstrate.")

    facts["eventCards"] = cards
    facts["eventCardsRejected"] = ev.get("rejected", [])
    facts["attribution"] = ATTRIBUTION

    numerals = set()
    for group in STRUCTURAL.values():
        numerals.update(group)
    numerals.update(YEARS)

    facts["displayAllowlist"] = {
        "note": ("Every numeral the game is permitted to render. The load-time gate "
                 "rejects any on-screen numeral absent from this file, so structural "
                 "numbers are declared here explicitly rather than assumed."),
        "structural": STRUCTURAL,
        "years": YEARS,
        "structuralNumerals": sorted(numerals),
    }

    facts["banned"] = {
        "note": ("Terms and trade dress this project must never render. Enforced at "
                 "load time by src/integrity.js and at build time by "
                 "scripts/verify-facts.mjs."),
        "words": ["MONOPOLY", "MR MONOPOLY", "COMMUNITY CHEST", "CHANCE",
                  "RICH UNCLE PENNYBAGS", "GO TO JAIL", "FREE PARKING",
                  "TITLE DEED", "HASBRO", "PARKER BROTHERS", "WADDINGTONS",
                  "ELECTRIC COMPANY", "WATER WORKS"],
        "tradeDress": ["mascot character of any kind",
                       "the classic card-back designs",
                       "the corner-square iconography",
                       "the specific colour-band ladder of the modern commercial board",
                       "any named playing piece from the modern commercial board"],
    }

    json.dump(facts, open(FACTS, "w"), indent=2)

    nfig = sum(len(c["figures"]) for c in cards)
    print(f"corrections applied: {applied}")
    print(f"event cards: {len(cards)}  (+{len(facts['eventCardsRejected'])} rejected)")
    print(f"card figures indexed: {nfig}")
    print(f"declared numerals: {len(facts['displayAllowlist']['structuralNumerals'])}")
    print(f"attribution keys: {', '.join(ATTRIBUTION)}")


if __name__ == "__main__":
    main()

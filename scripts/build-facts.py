#!/usr/bin/env python3
"""
build-facts.py — turn bench/hmlr-raw.json (real HM Land Registry open data)
into data/landlord-facts.json, the single source of truth for every number
LANDLORD: LONDON 2026 puts on screen.

Value basis, in priority order, per street:
  1. ppd-median-a      median of HMLR PPD Category A (standard, arm's-length,
                       full-market-value) transactions on the named street,
                       window 1 Jan 2023 -> dataset access date. Requires n >= 3.
  2. ppd-median-all    as above but all PPD categories (A + B). Requires n >= 3.
  3. ppd-single        the most recent single recorded transaction, where
                       1 <= n <= 2. Cited with its own transaction record.
  4. ukhpi-la-average  UK HPI average price for the containing local authority,
                       for the stated month. Used only where the street has no
                       recorded residential transactions at all.

Every figure carries: basis, n, window, dataset, dataset date, source URL, and
(where applicable) the HM Land Registry transaction URI of the cited record.
"""

import json, statistics, datetime, os, hashlib

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "..", "bench", "hmlr-raw.json")
OUT = os.path.join(HERE, "..", "data", "landlord-facts.json")

ACCESS_DATE = "10 August 2026"
ACCESS_DATE_ISO = "2026-08-10"
WINDOW_FROM = "1 January 2023"
WINDOW_FROM_ISO = "2023-01-01"

# ---------------------------------------------------------------- assumptions
# The ONE documented assumption from which every derived figure is computed.
# It is an assumption, not an observation, and is labelled as such everywhere.
GROSS_YIELD_ASSUMPTION_PCT = 4.0
LTV_ASSUMPTION_PCT = 60.0           # leverage available against a held asset
LEVY_RATE_OF_RENT_PCT = 25.0        # the land value levy, as a share of the rent roll
STARTING_CAPITAL = 6_000_000        # GBP per player. Set by simulation: low enough that
                                    # every purchase is a real commitment, high enough that
                                    # most of the ladder stays reachable.
TURN_LIMIT = 24                     # 12 rounds each, which keeps a phone game short

# Streets whose PPD evidence comes from proxy streets rather than the named
# board square, because the board square is a district or a landmark.
PROXY_NOTES = {
    "mayfair": ("Mayfair is a district, not a street. Evidence is drawn from three "
                "principal Mayfair residential streets: Curzon Street, Mount Street "
                "and South Audley Street."),
    "the-angel-islington": ("The Angel is a landmark junction, not a street. Evidence is "
                            "drawn from Islington High Street, on which The Angel stands."),
    "marlborough-street": ("Recorded as Great Marlborough Street, the full street name in "
                           "the HM Land Registry address data."),
    "bond-street": ("Recorded across New Bond Street and Old Bond Street, which together "
                    "form Bond Street."),
}

# Aliases to EXCLUDE when building a given street (avoids double counting where
# one street's proxy is another street's own square).
EXCLUDE_ALIASES = {"the-angel-islington": ["PENTONVILLE ROAD"]}

# 1935 board price -> the historical contrast figure.
BOARD_1935_NOTE = (
    "Purchase price printed on the London edition of the 1935/36 British board, "
    "shown here purely as a historical contrast figure."
)

LA_LABEL = {
    "southwark": "Southwark",
    "tower-hamlets": "Tower Hamlets",
    "islington": "Islington",
    "camden": "Camden",
    "city-of-westminster": "City of Westminster",
    "city-of-london": "City of London",
}

# Board colour groups — original naming, grouped by 2026 evidence tier, not by
# the historic board's colour bands.
GROUPS = [
    ("riverside",   "Riverside",   "#8C6A4F", 2),
    ("terminus",    "Terminus",    "#7FA9C9", 3),
    ("civic",       "Civic",       "#B4708F", 3),
    ("theatreland", "Theatreland", "#D9843C", 3),
    ("chambers",    "Chambers",    "#B23A34", 3),
    ("square-mile", "Square Mile", "#D9B23C", 3),
    ("gallery",     "Gallery",     "#4E8A6E", 3),
    ("crown",       "Crown",       "#2F5473", 2),
]

# board index -> group id, following the classic 2-3-3-3-3-3-3-2 banding
GROUP_OF_INDEX = []
for _gid, _n, _c, _size in GROUPS:
    GROUP_OF_INDEX += [_gid] * _size


def rows_for(block, sid):
    rows = list(block.get("ppdRecent") or [])
    excl = EXCLUDE_ALIASES.get(sid, [])
    for alias, arows in (block.get("ppdAliases") or {}).items():
        if alias in excl:
            continue
        rows += arows
    # de-duplicate by transaction id
    seen, out = set(), []
    for r in rows:
        if r["txid"] in seen:
            continue
        seen.add(r["txid"])
        out.append(r)
    out.sort(key=lambda r: r["date"], reverse=True)
    return out


def addr(r):
    bits = [b for b in [r.get("saon"), r.get("paon")] if b]
    line = " ".join(bits)
    return f"{line}, {r['street'].title()}, {r['postcode']}".strip(", ")


def cite(r):
    return {
        "transactionId": r["txid"],
        "transactionUri": r["uri"].replace("http://", "https://"),
        "address": addr(r),
        "price": r["price"],
        "date": r["date"],
        "tenure": {"F": "freehold", "L": "leasehold"}.get(r["tenure"], r["tenure"]),
        "ppdCategory": r["ppdCategory"],
    }


def build_value(sid, block):
    rows = rows_for(block, sid)
    cat_a = [r for r in rows if r["ppdCategory"] == "A"]
    ukhpi = block.get("ukhpi") or {}

    common = {
        "currency": "GBP",
        "windowFrom": WINDOW_FROM,
        "windowTo": ACCESS_DATE,
        "datasetAccessed": ACCESS_DATE,
    }

    if len(cat_a) >= 3:
        prices = sorted(r["price"] for r in cat_a)
        return {
            **common,
            "amount": int(statistics.median(prices)),
            "basis": "ppd-median-a",
            "basisLabel": "Median price paid, arm's-length residential sales",
            "dataset": "HM Land Registry Price Paid Data",
            "datasetLicence": "OGL-3.0",
            "sourceUrl": "https://landregistry.data.gov.uk/app/ppd/",
            "sampleSize": len(cat_a),
            "sampleLow": prices[0],
            "sampleHigh": prices[-1],
            "latestRecord": cite(cat_a[0]),
            "method": ("Median of HM Land Registry Price Paid Data Category A "
                       "transactions (standard, arm's-length, full market value) "
                       f"recorded on this street between {WINDOW_FROM} and {ACCESS_DATE}."),
        }

    if len(rows) >= 3:
        prices = sorted(r["price"] for r in rows)
        return {
            **common,
            "amount": int(statistics.median(prices)),
            "basis": "ppd-median-all",
            "basisLabel": "Median price paid, all recorded transactions",
            "dataset": "HM Land Registry Price Paid Data",
            "datasetLicence": "OGL-3.0",
            "sourceUrl": "https://landregistry.data.gov.uk/app/ppd/",
            "sampleSize": len(rows),
            "sampleLow": prices[0],
            "sampleHigh": prices[-1],
            "latestRecord": cite(rows[0]),
            "method": ("Median of all HM Land Registry Price Paid Data transactions "
                       "(Categories A and B, so including transfers to companies and "
                       "other non-standard sales) recorded on this street between "
                       f"{WINDOW_FROM} and {ACCESS_DATE}. Too few Category A sales "
                       "were recorded to use those alone."),
        }

    if len(rows) >= 1:
        r = rows[0]
        return {
            **common,
            "amount": r["price"],
            "basis": "ppd-single",
            "basisLabel": "Single recorded sale",
            "dataset": "HM Land Registry Price Paid Data",
            "datasetLicence": "OGL-3.0",
            "sourceUrl": "https://landregistry.data.gov.uk/app/ppd/",
            "sampleSize": len(rows),
            "sampleLow": r["price"],
            "sampleHigh": r["price"],
            "latestRecord": cite(r),
            "method": ("The most recent — and one of only "
                       f"{len(rows)} — HM Land Registry Price Paid transaction(s) "
                       f"recorded on this street since {WINDOW_FROM}. A single sale, "
                       "not an average."),
        }

    la = block["ukhpiRegion"]
    return {
        **common,
        "amount": int(ukhpi.get("averagePrice", 0)),
        "basis": "ukhpi-la-average",
        "basisLabel": f"UK HPI average price, {LA_LABEL[la]}",
        "dataset": "UK House Price Index",
        "datasetLicence": "OGL-3.0",
        "sourceUrl": ukhpi.get("_sourceUrl", ""),
        "sampleSize": None,
        "sampleLow": None,
        "sampleHigh": None,
        "latestRecord": None,
        "referenceMonth": ukhpi.get("_month"),
        "method": ("No residential sale has been recorded on this square in the Price "
                   "Paid Data, so the UK House Price Index average price for "
                   f"{LA_LABEL[la]} in {ukhpi.get('_month')} is used instead."),
    }


def money(n):
    return int(round(n))


def main():
    raw = json.load(open(RAW))
    streets = []

    order = list(raw["streets"].keys())
    for i, sid in enumerate(order):
        block = raw["streets"][sid]
        val = build_value(sid, block)
        v = val["amount"]

        rent = money(v * (GROSS_YIELD_ASSUMPTION_PCT / 100.0))
        mortgage = money(v * (LTV_ASSUMPTION_PCT / 100.0))

        streets.append({
            "id": sid,
            "name": block["name"],
            "localAuthority": LA_LABEL[block["ukhpiRegion"]],
            "group": GROUP_OF_INDEX[i],
            "boardPrice1935": {
                "amount": block["boardPrice1935"],
                "currency": "GBP",
                "label": "1935 board price",
                "note": BOARD_1935_NOTE,
            },
            "value2026": val,
            "rentAssumption": {
                "amount": rent,
                "currency": "GBP",
                "label": "Rent — yield assumption, not a recorded figure",
                "period": "per year",
                "isAssumption": True,
                "grossYieldPct": GROSS_YIELD_ASSUMPTION_PCT,
                "formula": f"value2026 x {GROSS_YIELD_ASSUMPTION_PCT}% assumed gross yield = one year of rent",
                "note": ("This is a flat modelling assumption applied identically to every "
                         "square. It is NOT an observed rent, NOT a valuation, and NOT "
                         "drawn from any commercial dataset. Real gross yields vary widely "
                         "by street, use class and lease terms."),
            },
            "mortgageAssumption": {
                "amount": mortgage,
                "currency": "GBP",
                "label": "Debt available — leverage assumption",
                "isAssumption": True,
                "ltvPct": LTV_ASSUMPTION_PCT,
                "formula": f"value2026 x {LTV_ASSUMPTION_PCT}% loan to value",
                "note": ("A flat leverage assumption for gameplay. Not an offer, not "
                         "advice, and not indicative of real lending terms."),
            },
            "proxyNote": PROXY_NOTES.get(sid),
        })

    facts = {
        "$schema": "landlord-facts/1",
        "title": "LANDLORD: LONDON 2026 — fact base",
        "description": ("Every monetary value rendered by the game is defined here. "
                        "Nothing may be displayed that is not present in this file."),
        "generatedUtc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "datasetAccessed": ACCESS_DATE,
        "datasetAccessedIso": ACCESS_DATE_ISO,
        "heritage": {
            "title": "The Landlord's Game",
            "author": "Elizabeth Magie",
            "year": 1904,
            "patent": "US Patent 748,626",
            "status": "public domain",
            "note": ("Designed to demonstrate the economic consequences of land "
                     "monopoly and rent. This game is an original homage to it."),
        },
        "assumptions": {
            "grossYieldPct": GROSS_YIELD_ASSUMPTION_PCT,
            "ltvPct": LTV_ASSUMPTION_PCT,
            "levyRateOfRentPct": LEVY_RATE_OF_RENT_PCT,
            "startingCapital": STARTING_CAPITAL,
            "turnLimit": TURN_LIMIT,
            "statement": ("Rent and debt figures in this game are derived from a single "
                          "flat assumption set, stated above and shown on screen. They are "
                          "modelling assumptions, not market observations."),
        },
        "valueBases": {
            "ppd-median-a": "Median price paid, arm's-length residential sales (PPD Category A)",
            "ppd-median-all": "Median price paid, all recorded transactions (PPD Categories A and B)",
            "ppd-single": "A single recorded sale",
            "ukhpi-la-average": "UK House Price Index average price for the local authority",
        },
        "groups": [{"id": g, "name": n, "colour": c, "size": sz} for g, n, c, sz in GROUPS],
        "streets": streets,
        "eventCards": [],
        "attribution": {},
    }

    os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(facts, f, indent=2)

    print(f"wrote {OUT}\n")
    print(f"{'street':24s} {'1935':>6s} {'2026':>12s} {'basis':18s} {'n':>4s} {'rent':>9s}")
    for s in streets:
        v = s["value2026"]
        print(f"{s['id']:24s} {s['boardPrice1935']['amount']:6d} "
              f"{v['amount']:12,d} {v['basis']:18s} {str(v['sampleSize']):>4s} "
              f"{s['rentAssumption']['amount']:9,d}")


if __name__ == "__main__":
    main()

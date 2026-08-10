#!/usr/bin/env python3
"""
fetch-hmlr.py — pull real, licence-clean property figures for the 22 classic
London board streets from HM Land Registry open data.

Two OGL v3 sources only:
  1. HMLR Price Paid Data (PPD)  — actual recorded transactions on the named street
  2. HMLR/ONS UK House Price Index (UKHPI) — local authority average price, per month

No subscription data. No CoStar. No scraping of paywalled services.

Output: bench/hmlr-raw.json  (raw evidence, one block per street)
"""

import json, sys, time, urllib.parse, urllib.request, datetime, os

UA = "landlord-london-2026/1.0 (open-data research; OGL v3 sources)"
OUT = os.path.join(os.path.dirname(__file__), "..", "bench", "hmlr-raw.json")

PPD_BASE = "https://landregistry.data.gov.uk/app/ppd/ppd_data.csv"
UKHPI_BASE = "https://landregistry.data.gov.uk/data/ukhpi/region/{region}/month/{month}.json"

PPD_FIELDS = ["txid", "price", "date", "postcode", "propertyType", "newBuild",
              "tenure", "saon", "paon", "street", "locality", "town",
              "district", "county", "ppdCategory", "uri"]

# id, display name, PPD street query (None = no street-level query possible),
# PPD town, UKHPI local-authority slug, 1935 board price (GBP)
STREETS = [
    ("old-kent-road",         "Old Kent Road",          "OLD KENT ROAD",          "LONDON", "southwark",          60),
    ("whitechapel-road",      "Whitechapel Road",       "WHITECHAPEL ROAD",       "LONDON", "tower-hamlets",      60),
    ("the-angel-islington",   "The Angel, Islington",   "ISLINGTON HIGH STREET",  "LONDON", "islington",         100),
    ("euston-road",           "Euston Road",            "EUSTON ROAD",            "LONDON", "camden",            100),
    ("pentonville-road",      "Pentonville Road",       "PENTONVILLE ROAD",       "LONDON", "islington",         120),
    ("pall-mall",             "Pall Mall",              "PALL MALL",              "LONDON", "city-of-westminster", 140),
    ("whitehall",             "Whitehall",              "WHITEHALL",              "LONDON", "city-of-westminster", 140),
    ("northumberland-avenue", "Northumberland Avenue",  "NORTHUMBERLAND AVENUE",  "LONDON", "city-of-westminster", 160),
    ("bow-street",            "Bow Street",             "BOW STREET",             "LONDON", "city-of-westminster", 180),
    ("marlborough-street",    "Marlborough Street",     "GREAT MARLBOROUGH STREET","LONDON","city-of-westminster", 180),
    ("vine-street",           "Vine Street",            "VINE STREET",            "LONDON", "city-of-westminster", 200),
    ("strand",                "Strand",                 "STRAND",                 "LONDON", "city-of-westminster", 220),
    ("fleet-street",          "Fleet Street",           "FLEET STREET",           "LONDON", "city-of-london",     220),
    ("trafalgar-square",      "Trafalgar Square",       "TRAFALGAR SQUARE",       "LONDON", "city-of-westminster", 240),
    ("leicester-square",      "Leicester Square",       "LEICESTER SQUARE",       "LONDON", "city-of-westminster", 260),
    ("coventry-street",       "Coventry Street",        "COVENTRY STREET",        "LONDON", "city-of-westminster", 260),
    ("piccadilly",            "Piccadilly",             "PICCADILLY",             "LONDON", "city-of-westminster", 280),
    ("regent-street",         "Regent Street",          "REGENT STREET",          "LONDON", "city-of-westminster", 300),
    ("oxford-street",         "Oxford Street",          "OXFORD STREET",          "LONDON", "city-of-westminster", 300),
    ("bond-street",           "Bond Street",            "NEW BOND STREET",        "LONDON", "city-of-westminster", 320),
    ("park-lane",             "Park Lane",              "PARK LANE",              "LONDON", "city-of-westminster", 350),
    ("mayfair",               "Mayfair",                 None,                    "LONDON", "city-of-westminster", 400),
]

# Extra street aliases worth pulling as supporting evidence
ALIASES = {
    "bond-street": ["OLD BOND STREET"],
    "the-angel-islington": ["PENTONVILLE ROAD"],
    "mayfair": ["CURZON STREET", "MOUNT STREET", "SOUTH AUDLEY STREET"],
}


def get(url, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:
            if i == tries - 1:
                return None
            time.sleep(2 + 3 * i)
    return None


def ppd(street, town, min_date):
    q = [
        ("et[]", "lrcommon:freehold"), ("et[]", "lrcommon:leasehold"),
        ("limit", "200"),
        ("min_date", min_date),
        ("nb[]", "true"), ("nb[]", "false"),
        ("ptype[]", "lrcommon:detached"), ("ptype[]", "lrcommon:semi-detached"),
        ("ptype[]", "lrcommon:terraced"), ("ptype[]", "lrcommon:flat-maisonette"),
        ("ptype[]", "lrcommon:otherPropertyType"),
        ("street", street), ("town", town),
        ("tc[]", "ppd:standardPricePaidTransaction"),
        ("tc[]", "ppd:additionalPricePaidTransaction"),
    ]
    body = get(PPD_BASE + "?" + urllib.parse.urlencode(q))
    if not body:
        return []
    import csv, io
    rows = []
    for row in csv.reader(io.StringIO(body)):
        if len(row) < 16:
            continue
        rec = dict(zip(PPD_FIELDS, row[:16]))
        try:
            rec["price"] = int(rec["price"])
        except ValueError:
            continue
        rows.append(rec)
    rows.sort(key=lambda r: r["date"], reverse=True)
    return rows


def ukhpi(region):
    """Walk back from today to find the most recent published UKHPI month."""
    today = datetime.date.today()
    y, m = today.year, today.month
    for _ in range(10):
        month = f"{y:04d}-{m:02d}"
        body = get(UKHPI_BASE.format(region=region, month=month))
        if body:
            try:
                d = json.loads(body)["result"]["primaryTopic"]
                if "averagePrice" in d:
                    d["_month"] = month
                    d["_sourceUrl"] = UKHPI_BASE.format(region=region, month=month)
                    return d
            except Exception:
                pass
        m -= 1
        if m == 0:
            m, y = 12, y - 1
    return None


def main():
    out = {
        "generatedUtc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "sources": {
            "ppd": "HM Land Registry Price Paid Data",
            "ukhpi": "HM Land Registry / ONS / Registers of Scotland UK House Price Index",
        },
        "streets": {},
    }
    ukhpi_cache = {}

    for sid, name, street, town, la, price1935 in STREETS:
        sys.stderr.write(f"-> {name}\n"); sys.stderr.flush()
        block = {"id": sid, "name": name, "boardPrice1935": price1935,
                 "ppdStreetQuery": street, "ppdTown": town, "ukhpiRegion": la,
                 "ppd2026": [], "ppdRecent": [], "ppdAliases": {}}

        if street:
            block["ppd2026"] = ppd(street, town, "1 January 2026")
            block["ppdRecent"] = ppd(street, town, "1 January 2023")

        for alias in ALIASES.get(sid, []):
            block["ppdAliases"][alias] = ppd(alias, town, "1 January 2023")

        if la not in ukhpi_cache:
            ukhpi_cache[la] = ukhpi(la)
        block["ukhpi"] = ukhpi_cache[la]

        out["streets"][sid] = block
        time.sleep(0.6)

    os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(out, f, indent=1)
    sys.stderr.write(f"\nwrote {OUT}\n")

    # quick console summary
    for sid, b in out["streets"].items():
        n26, nr = len(b["ppd2026"]), len(b["ppdRecent"])
        hpi = b["ukhpi"]["averagePrice"] if b["ukhpi"] else "?"
        mon = b["ukhpi"]["_month"] if b["ukhpi"] else "?"
        top = b["ppd2026"][0]["price"] if b["ppd2026"] else (b["ppdRecent"][0]["price"] if b["ppdRecent"] else None)
        print(f"{sid:24s} ppd2026={n26:3d} ppdRecent={nr:3d} topTx={top} ukhpi[{mon}]={hpi}")


if __name__ == "__main__":
    main()

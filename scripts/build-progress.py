#!/usr/bin/env python3
"""
Render scripts/progress-status.json into two artefacts:
  progress-site/index.html   full document, for Vercel
  progress-site/artifact.html  body fragment + <title>, for Artifact publishing

Design note — the visual world is deliberately London-municipal rather than
generic dashboard: a Westminster street plaque (white plate, red band, black
caps) sits over a registry ledger. Numbering is real: P0..P8 are ordered build
pieces with dependencies, not decoration.
"""
import json, os, html

HERE = os.path.dirname(os.path.abspath(__file__))
S = json.load(open(os.path.join(HERE, "progress-status.json")))
OUTDIR = os.path.join(HERE, "..", "progress-site")
os.makedirs(OUTDIR, exist_ok=True)
e = html.escape

STATE = {
    "done":     ("var(--ok)",   "shipped"),
    "won":      ("var(--ok)",   "critic picked ours"),
    "building": ("var(--work)", "building"),
    "critic":   ("var(--blue)", "with critic"),
    "queued":   ("var(--mute)", "queued"),
    "blocked":  ("var(--red)",  "blocked"),
}


def gbp(n):
    if n is None:
        return "—"
    if n >= 1_000_000:
        return f"£{n/1_000_000:,.1f}m"
    if n >= 1_000:
        return f"£{n/1_000:,.0f}k"
    return f"£{n:,.0f}"


CSS = """
:root{
  --ground:#EDEEF0; --plate:#FFFFFF; --ink:#16181C; --mute:#6B7079;
  --rule:#D5D8DE; --red:#C8102E; --blue:#1B3A6B; --ok:#0B6E4F; --work:#A2560B;
  --shadow:0 1px 0 rgba(22,24,28,.06), 0 6px 18px -12px rgba(22,24,28,.5);
}
@media (prefers-color-scheme:dark){
  :root{--ground:#101216;--plate:#181B21;--ink:#E9EBEF;--mute:#8B929C;
        --rule:#2A2E36;--red:#E8455F;--blue:#6FA0DC;--ok:#3FB489;--work:#D08B33;
        --shadow:0 1px 0 rgba(0,0,0,.4), 0 6px 18px -12px #000;}
}
:root[data-theme="dark"]{
  --ground:#101216;--plate:#181B21;--ink:#E9EBEF;--mute:#8B929C;
  --rule:#2A2E36;--red:#E8455F;--blue:#6FA0DC;--ok:#3FB489;--work:#D08B33;
  --shadow:0 1px 0 rgba(0,0,0,.4), 0 6px 18px -12px #000;
}
:root[data-theme="light"]{
  --ground:#EDEEF0;--plate:#FFFFFF;--ink:#16181C;--mute:#6B7079;
  --rule:#D5D8DE;--red:#C8102E;--blue:#1B3A6B;--ok:#0B6E4F;--work:#A2560B;
  --shadow:0 1px 0 rgba(22,24,28,.06), 0 6px 18px -12px rgba(22,24,28,.5);
}
*{box-sizing:border-box}
.wrap{
  background:var(--ground); color:var(--ink);
  font:15px/1.5 "Helvetica Neue",Helvetica,ui-sans-serif,system-ui,Arial,sans-serif;
  -webkit-text-size-adjust:100%;
  padding:max(18px,env(safe-area-inset-top)) 18px calc(40px + env(safe-area-inset-bottom));
  max-width:720px; margin:0 auto; min-height:100vh;
}
.num{font-variant-numeric:tabular-nums}

/* ---- street plaque ---- */
.plaque{background:var(--plate);border:1px solid var(--rule);border-radius:2px;
  box-shadow:var(--shadow);overflow:hidden;margin-bottom:20px}
.plaque .band{background:var(--red);height:9px}
.plaque .body{padding:15px 16px 14px}
.plaque .borough{font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;
  color:var(--mute);margin-bottom:6px}
.plaque h1{margin:0;font-size:clamp(24px,7vw,34px);font-weight:700;line-height:1.02;
  letter-spacing:-.015em;text-transform:uppercase;text-wrap:balance}
.plaque .sub{margin:8px 0 0;font-size:13.5px;color:var(--mute);line-height:1.45;max-width:52ch}

.round{display:inline-flex;align-items:center;gap:7px;font-size:11px;font-weight:700;
  letter-spacing:.1em;text-transform:uppercase;color:var(--blue);margin-bottom:11px}
.round::before{content:"";width:22px;height:2px;background:var(--blue)}

.headline{font-size:17px;line-height:1.42;margin:0 0 18px;color:var(--ink);max-width:56ch}
.headline b{font-weight:700}

.cta{display:block;text-align:center;background:var(--red);color:#fff;text-decoration:none;
  font-weight:700;font-size:16px;letter-spacing:.02em;padding:16px;border-radius:2px;
  margin:0 0 22px;box-shadow:var(--shadow)}
.cta:focus-visible{outline:3px solid var(--blue);outline-offset:2px}
.cta.off{background:transparent;color:var(--mute);border:1px dashed var(--rule);
  font-weight:400;font-size:13.5px;box-shadow:none;padding:14px}

h2{font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;
  color:var(--mute);margin:26px 0 10px;padding-bottom:7px;border-bottom:1px solid var(--rule)}

ul{list-style:none;margin:0;padding:0}
.pieces li{display:grid;grid-template-columns:34px 1fr auto;gap:11px;align-items:start;
  padding:12px 0 12px 0;border-bottom:1px solid var(--rule);position:relative}
.pieces li::before{content:"";position:absolute;left:0;top:12px;bottom:12px;width:3px;
  background:var(--stripe,transparent);border-radius:2px}
.pid{font:600 12px/1.7 ui-monospace,"SF Mono",Menlo,monospace;color:var(--mute);
  padding-left:9px;font-variant-numeric:tabular-nums}
.pt{font-size:15px;line-height:1.32;font-weight:500}
.pn{font-size:13px;color:var(--mute);margin-top:4px;line-height:1.45;max-width:48ch}
.pst{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;
  white-space:nowrap;padding-top:3px;text-align:right}

.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:11px}
.stat{background:var(--plate);border:1px solid var(--rule);border-radius:2px;padding:13px 14px;
  box-shadow:var(--shadow)}
.stat .k{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:var(--mute)}
.stat .v{font-size:25px;font-weight:700;margin-top:5px;letter-spacing:-.025em;
  font-variant-numeric:tabular-nums;line-height:1.05}
.stat .n{font-size:12px;color:var(--mute);margin-top:5px;line-height:1.4}

.logl li{display:grid;grid-template-columns:46px 1fr;gap:11px;padding:8px 0;font-size:13.5px;
  line-height:1.45;border-bottom:1px solid var(--rule)}
.logl .t{font:12px/1.6 ui-monospace,"SF Mono",Menlo,monospace;color:var(--mute);
  font-variant-numeric:tabular-nums}

footer{margin-top:28px;padding-top:14px;border-top:2px solid var(--ink);
  font-size:12px;color:var(--mute);line-height:1.65}
footer b{color:var(--ink);font-weight:600}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
"""


def piece_li(p):
    colour, label = STATE.get(p["status"], ("var(--mute)", p["status"]))
    note = f'<div class="pn">{e(p["note"])}</div>' if p.get("note") else ""
    return (f'<li style="--stripe:{colour}">'
            f'<span class="pid">{e(p["id"])}</span>'
            f'<div><div class="pt">{e(p["name"])}</div>{note}</div>'
            f'<span class="pst" style="color:{colour}">{label}</span></li>')


def render_body():
    pieces = "".join(piece_li(p) for p in S["pieces"])

    logs = "".join(
        f'<li><span class="t">{e(l["time"])}</span><span>{e(l["text"])}</span></li>'
        for l in reversed(S["log"]))

    f = S["facts"]
    live = S.get("liveUrl")
    cta = (f'<a class="cta" href="{e(live)}">Play the live build →</a>' if live
           else '<div class="cta off">The live game URL appears here once it is deployed</div>')

    sp = S["spend"]
    return f"""<div class="wrap">
<div class="plaque">
  <div class="band"></div>
  <div class="body">
    <div class="borough">City of Westminster · and 5 other boroughs</div>
    <h1>Landlord: London 2026</h1>
    <p class="sub">{e(S['subtitle'])}</p>
  </div>
</div>

<div class="round">{e(S['roundLabel'])}</div>
<p class="headline">{e(S['headline'])}</p>
{cta}

<h2>Build pieces</h2>
<ul class="pieces">{pieces}</ul>

<h2>Fact base</h2>
<div class="grid">
  <div class="stat"><div class="k">Streets sourced</div><div class="v num">{f['streets']}/22</div>
    <div class="n">{f['sourcedFromTransactions']} from recorded transactions, {f['sourcedFromUkhpi']} from UK HPI</div></div>
  <div class="stat"><div class="k">Dearest in 2026</div><div class="v num">{gbp(f['dearest2026']['amount'])}</div>
    <div class="n">{e(f['dearest2026']['name'])} — £{f['dearest2026']['board1935']} on the 1935 board</div></div>
  <div class="stat"><div class="k">Cheapest in 2026</div><div class="v num">{gbp(f['cheapest2026']['amount'])}</div>
    <div class="n">{e(f['cheapest2026']['name'])} — £{f['cheapest2026']['board1935']} on the 1935 board</div></div>
  <div class="stat"><div class="k">Biggest faller</div><div class="v">{e(f['biggestFaller']['name'])}</div>
    <div class="n">{e(f['biggestFaller']['note'])}</div></div>
</div>

<h2>Log</h2>
<ul class="logl">{logs}</ul>

<footer>
  <b>Blind comparison benchmark:</b> {e(S['benchmark'])}. Each build piece is judged by a
  separate critic with fresh context, playing the real build, labels stripped.<br>
  <b>Spend:</b> {sp['agentsLaunched']} agents launched · {sp['roundsComplete']} rounds complete.
  {e(sp['note'])}<br>
  <b>Data:</b> HM Land Registry Price Paid Data and UK House Price Index, Open Government
  Licence v3.0. No subscription data is used anywhere in this project.<br>
  Updated {e(S['updatedIso'])}.
</footer>
</div>"""


body = render_body()
title = "LANDLORD: LONDON 2026 — build progress"

full = (f'<!doctype html>\n<html lang="en-GB"><head><meta charset="utf-8">'
        f'<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        f'<meta http-equiv="refresh" content="60"><title>{title}</title>'
        f'<style>html,body{{margin:0;padding:0;background:#EDEEF0}}'
        f'@media(prefers-color-scheme:dark){{html,body{{background:#101216}}}}{CSS}</style>'
        f'</head><body>{body}</body></html>')

frag = f'<title>{title}</title>\n<style>{CSS}</style>\n{body}'

open(os.path.join(OUTDIR, "index.html"), "w").write(full)
open(os.path.join(OUTDIR, "artifact.html"), "w").write(frag)
print(f"index.html {len(full)}b · artifact.html {len(frag)}b")

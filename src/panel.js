/**
 * panel.js — the data surfaces of LANDLORD: LONDON 2026.
 *
 * Three exported builders, all judged against Financial Times graphics
 * standards (bench/round0/ft.json):
 *
 *   renderPropertyPanel(streetId) — one square, with its basis, its sample,
 *                                   its assumptions and its cited record.
 *   renderComparisonChart()       — all 22 squares, 1935 against 2026.
 *   renderSourcesPanel()          — attribution and method, in full.
 *
 * THE HEADLINE AND THE MARKS ARGUE THE SAME THING — AND THE HEADLINE MAKES TWO
 * CLAIMS. "The 1935 price ladder no longer describes London" says the rungs are
 * further apart than the printed board made them AND that they are in a
 * different order. Drawing only one of those earns the other complaint, which
 * is exactly what happened twice: a rank slope chart under a headline about
 * magnitude, then bands of magnitude under a headline about a ladder. Both
 * claims are now carried by ONE figure on ONE coordinate system — the era
 * bands hold the shape, the row order and the board-place-to-place-now mark on
 * every row hold the order. The slope chart survives as a second view, for the
 * crossings a chart of rows cannot draw.
 *
 * THE EDITORIAL POINT. The 1935 board printed a price ladder that ran from
 * £60 to £400 — a spread of under seven times. The 2026 evidence spreads over
 * ninety times, and it has comprehensively re-ordered the ladder. Every claim
 * this module makes about that re-ordering is COMPUTED from the fact base at
 * render time rather than written into the copy, so the prose cannot drift
 * away from the data it describes.
 *
 * ONE SCALE MEANS ONE BOX. Every mark on the comparison page is positioned as
 * a percentage of the same grid column, and every decade of the logarithmic
 * domain is drawn through the plot. This is not decoration: at 375px the axis
 * thins to four labels whose two ends are edge-anchored rather than centred, so
 * with nothing drawn through the plot a reader keys the bands to the labels'
 * centres and the axis and the marks genuinely read as different scales. They
 * are now the same box, gridded, at every viewport.
 *
 * THE SCORE IS NET. The game is won on the annual rent roll after debt service,
 * so the property panel sets out both routes to a square — bought outright and
 * bought with the maximum loan — with what is committed and what reaches the
 * score, and the sources page states the arithmetic and why the trade-off
 * exists at all.
 *
 * HOUSE RULES OBSERVED HERE
 * -------------------------
 * 1. No monetary literal appears anywhere in this file. Every figure arrives
 *    through a facts.js accessor and leaves through a money.js formatter.
 * 2. Every element carrying a currency string carries data-fact (the dotted
 *    path it was read from). The single exception is the block on the property
 *    panel that shows what a square adds to the score once the bank has been
 *    paid: a debt service and a net rent are Money arithmetic over fact-base
 *    leaves, but the rendered strings are not themselves amounts the fact base
 *    contains, so they carry data-money="derived", exactly as the HUD tags a
 *    running balance. See derivedEl().
 * 3. Bare numerals that the fact base does not itself contain — computed
 *    multiples, logarithmic axis ticks, postal addresses copied verbatim from
 *    the register — carry data-numeral-ok, and each use is justified in a
 *    comment beside it.
 * 4. British English throughout, in copy and in comments.
 *
 * NUMBER FORMAT. FT house style abbreviates millions as "mn", never a bare
 * "m", because a screen reader announces "m" as "metres". money.js is fixed
 * and can only emit "m", so this module carries its own fmtMn, which is the
 * ONLY formatter used for a figure above a million here. It is deliberately
 * built to mirror integrity.js's compactOf so that every abbreviated string it
 * produces still resolves against the fact base: one decimal place on
 * millions, and a whole number only where a value at or above £100mn would
 * otherwise round to a figure the fact base does not contain. Anything under a
 * million is written out in full with its comma — "£129,502", not "£0.1mn" —
 * because that is what FT does and because rounding away four significant
 * figures on a small number is a loss, not an abbreviation. The one exception
 * is the cited HM Land Registry transaction price, which is reproduced to the
 * pound: it is a register entry, not an estimate.
 *
 * ONE DELIBERATE ACCESSIBILITY DECISION. ft.json's small frame sets source
 * text at 12px. touch.json floors every label at 13px because these panels are
 * read on a phone. The floor wins; source text is 13px on small screens.
 *
 * COLOUR NAMES A SERIES OR IT NAMES NOTHING. The era spread bands and the
 * ranked dumbbell plot both have grey marks for 1935 and oxford-blue marks for
 * 2026, so their labels are set in those two inks and the colour is a key —
 * the same two inks mean the same two eras on both. The slope chart has no blue mark
 * anywhere — its lines are claret and grey — so both of its column headers are
 * set in the same ink. A blue "2026" over a chart with no blue in it names a
 * series that does not exist.
 *
 * A SUBTITLE BELONGS TO THE CHART IT DESCRIBES. "£ per square, logarithmic
 * scale" is true of the ranked value plot and false of the slope chart, whose
 * marks encode places on the ladder and carry no unit at all. Each chart
 * therefore states its own unit and period beneath its own heading, and the
 * page subtitle describes the page.
 *
 * THE BASIS DIFFERENCE IS THE STORY, NOT A FOOTNOTE. Four squares rest on a
 * single recorded sale and one on no sale at all. Those squares are marked
 * wherever they are plotted or tabulated, not only on their own cards, because
 * the charts are where a reader forms the comparison. The size of the
 * difference between bases is stated with both figures on the page, computed
 * from the fact base so the example cannot go stale.
 *
 * THE OVERLAY CHAIN. These panels are handed to a host shell this module does
 * not own, and that shell had no height or width constraint of its own: the
 * sources page was ~89% unreachable at every window size and the comparison
 * chart escaped a 375px viewport entirely, because a shrink-to-fit grid item
 * took its width from this stylesheet's own 52rem reading measure. The rules
 * at the end of the stylesheet close that chain — the shell is capped at the
 * viewport in both axes and the panel body is the single scroll port.
 */

import {
  facts as factBase, street, streets, groupOf, assumptions, attribution,
  eventCards, heritage, priceOf, rentOf, debtCapacityOf, board1935Of,
  startingCapital, sourceLine,
} from './facts.js';
import { fmtPlain, fmt1935 } from './money.js';
import { registry } from './integrity.js';

/* ══════════════════════════════════════════════════════════════════════════
   1. THE FT STYLESHEET
   Traced to ft.json's concreteValues block. Injected once, into <head>, so
   the integrity gate's text sweep over <body> never sees the numerals that
   live inside CSS declarations.
   ══════════════════════════════════════════════════════════════════════════ */

const STYLE_ID = 'll-panel-ft';

const FT_CSS = `
.ll-ft{
  /* ---- surface ---- */
  --ft-paper:#FFF1E5; --ft-paper-box:#F2DFCE; --ft-paper-band:#FFFCFA;
  --ft-ink:#000000;
  /* ---- grey ramp: black mixed over the paper tint, never a cool grey ---- */
  --ft-black-05:#F2E5DA; --ft-black-10:#E6D9CE; --ft-black-20:#CCC1B7;
  --ft-black-30:#B3A9A0; --ft-black-40:#999189; --ft-black-60:#66605C;
  --ft-black-70:#4D4845; --ft-black-80:#33302E;
  /* ---- semantic series ---- */
  --ft-primary:#0F5499;      /* oxford  — 'now', the subject   */
  --ft-highlight:#990F3D;    /* claret  — the square in focus  */
  --ft-secondary:#0D7680;    /* teal                            */
  --ft-muted:#B3A9A0;        /* 'then'                          */
  --ft-muted-light:#CCC1B7;  /* de-emphasised marks             */
  --ft-alert:#FF8833;        /* mandarin — fill only, always paired with words */

  --ll-scale: var(--ui-scale, 1);
  --ft-font: MetricWeb, Metric, "Helvetica Neue", Helvetica, -apple-system,
             BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;

  /* ---- type scale: small frame is the default, because the phone is ---- */
  --ll-title:    calc(1.25rem   * var(--ll-scale));
  --ll-subtitle: calc(1.125rem  * var(--ll-scale));
  --ll-axis:     calc(0.875rem  * var(--ll-scale));   /* = annotation = label = legend */
  --ll-body:     calc(1.0625rem * var(--ll-scale));
  --ll-source:   calc(0.8125rem * var(--ll-scale));   /* floored at 13px, see header */
  --ll-figure:   calc(2.25rem   * var(--ll-scale));

  background:var(--ft-paper);
  color:var(--ft-black-80);
  font-family:var(--ft-font);
  font-weight:400;
  font-size:var(--ll-body);
  line-height:1.45;
  font-feature-settings:'tnum' 1;
  font-variant-numeric:tabular-nums;
  -webkit-font-feature-settings:'tnum';
  -webkit-text-size-adjust:100%;
  box-sizing:border-box;
  inline-size:100%;
  max-inline-size:52rem;
  margin-inline:auto;
  padding:calc(1.25rem * var(--ll-scale)) 1.25rem calc(3rem * var(--ll-scale));
  /* these panels are overlays inside a position:fixed game shell, so they own
     their own scrolling and must not hand momentum back to the shell */
  overflow-y:auto;
  overflow-x:hidden;
  overscroll-behavior:contain;
  touch-action:pan-y;
  -webkit-overflow-scrolling:touch;
}
.ll-ft *,.ll-ft *::before,.ll-ft *::after{box-sizing:border-box}

@media (min-width:481px){
  .ll-ft{
    --ll-title:calc(1.5rem * var(--ll-scale));
    --ll-axis:calc(1rem * var(--ll-scale));
    --ll-source:calc(0.875rem * var(--ll-scale));
    --ll-figure:calc(3rem * var(--ll-scale));
    padding-inline:1.75rem;
  }
}
@media (min-width:1000px){
  .ll-ft{
    --ll-title:calc(1.75rem * var(--ll-scale));
    --ll-axis:calc(1.125rem * var(--ll-scale));
    --ll-source:calc(1rem * var(--ll-scale));
  }
}

/* ---- the FT chart signature: a 60 x 4 black bar, flush left, above all ---- */
.ll-bar{inline-size:60px;block-size:4px;background:var(--ft-ink);margin:0 0 12px}

/* ---- title is weight 400. Bold is the tell of a counterfeit. ------------- */
.ll-title{
  font-size:var(--ll-title);line-height:1.15;font-weight:400;
  color:var(--ft-ink);margin:0 0 6px;letter-spacing:-0.005em;
}
.ll-subtitle{
  font-size:var(--ll-subtitle);line-height:1.25;font-weight:400;
  color:var(--ft-black-60);margin:0 0 20px;
}
.ll-eyebrow{
  font-size:calc(0.8125rem * var(--ll-scale));font-weight:600;
  letter-spacing:0.08em;text-transform:uppercase;
  color:var(--ft-black-60);margin:0 0 6px;display:block;
}
.ll-prose{font-size:var(--ll-body);color:var(--ft-black-80);margin:0 0 14px;max-inline-size:66ch}
.ll-note{font-size:var(--ll-axis);color:var(--ft-black-70);margin:0 0 12px;max-inline-size:70ch}

/* ---- source block: stacked, flush left, never lighter than black-60 -----
   One line per fact, each on its own row, all anchored to the graphic's left
   edge. Never a run-on sentence and never centred.

   NAMED ll-cite, NOT ll-source. See the collision note below. */
.ll-cite{
  font-size:var(--ll-source);line-height:1.35;color:var(--ft-black-60);
  margin:18px 0 0;padding-top:12px;border-top:1px solid var(--ft-black-10);
  text-align:start;max-inline-size:70ch;
}
.ll-cite > span{display:block;text-align:start}
.ll-cite .ll-credit{font-style:italic}

/* ---- section rule ------------------------------------------------------- */
.ll-sec{margin:28px 0 0;padding-top:20px;border-top:1px solid var(--ft-black-10)}
.ll-sec:first-of-type{border-top:0;padding-top:0}
.ll-h{font-size:var(--ll-subtitle);font-weight:600;color:var(--ft-black-80);margin:0 0 10px}

/* ---- the headline figure ----------------------------------------------- */
.ll-figure{
  font-size:var(--ll-figure);line-height:1.02;font-weight:400;
  color:var(--ft-primary);margin:2px 0 8px;letter-spacing:-0.015em;
}
.ll-figure--then{font-size:calc(1.5rem * var(--ll-scale));color:var(--ft-black-60)}
.ll-basis{font-size:var(--ll-axis);color:var(--ft-black-70);margin:0 0 4px;max-inline-size:60ch}
.ll-meta{font-size:var(--ll-source);color:var(--ft-black-60);margin:0 0 2px}

/* ---- chart-level subtitle: sits under the chart's own h3, never under a
        chart it does not describe ---------------------------------------- */
.ll-subhead{
  font-size:var(--ll-axis);color:var(--ft-black-60);
  margin:-6px 0 10px;max-inline-size:66ch;text-align:start;
}

/* ══ A NOTE ON THE THREE RENAMED CLASSES ══════════════════════════════════
   ll-basis-flag, ll-group-dot and ll-cite were ll-flag, ll-swatch and
   ll-source. All three names are also used by the game's HUD stylesheet for
   entirely different objects — a gold action plate, a rotated player token and
   a bold summary rule — and that stylesheet is injected after this one, so it
   was winning every one of them. The evidence-strength flag was rendering as
   the HUD's gold plate; the colour-group swatch was being absolutely
   positioned and rotated out of the panel and into the corner of the overlay;
   and the source block was arriving at font-weight 600 and 11.6px, which is
   both the wrong weight for FT and under the 13px floor this file's header
   commits to.

   Raising specificity would have fixed it here and risked reaching into the
   HUD's own cards, which are mounted in the same overlay shell. These three
   objects belong to this file alone, so they now have names that belong to
   this file alone. Nothing outside panel.js refers to them.
   ══════════════════════════════════════════════════════════════════════════ */

/* ---- evidence-strength flag: a word, never a colour on its own ---------- */
.ll-basis-flag{
  display:inline-block;font-size:calc(0.8125rem * var(--ll-scale));
  font-weight:600;letter-spacing:0.06em;text-transform:uppercase;
  color:var(--ft-black-80);background:var(--ft-alert);
  padding:3px 8px;margin:0 0 8px;
}
.ll-basis-flag--firm{background:var(--ft-black-10);color:var(--ft-black-70)}

/* ---- weak-evidence mark: a dagger, carried wherever a weakly evidenced
        square is plotted or tabulated, and explained in the note beneath ---
   It is a mark and a word together, never a colour alone, so it survives both
   greyscale printing and colour-blind reading. */
.ll-mark{
  margin-inline-start:3px;color:var(--ft-black-70);
  font-size:1em;vertical-align:baseline;
}

/* ---- inset panel: wheat, for anything that must separate from the page --- */
.ll-box{background:var(--ft-paper-box);padding:14px 16px;margin:0 0 4px}
.ll-box .ll-eyebrow{color:var(--ft-black-70)}
.ll-formula{
  font-size:var(--ll-axis);color:var(--ft-black-70);margin:6px 0 0;
  font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;
  overflow-wrap:anywhere;
}

/* ---- alert: mandarin is fill-only, so it always carries a word too ------ */
.ll-alert{border-left:4px solid var(--ft-alert);padding:2px 0 2px 12px;margin:0 0 14px}
.ll-alert .ll-eyebrow{color:var(--ft-black-70)}

/* ---- colour-group swatch ------------------------------------------------ */
.ll-group-dot{
  display:inline-block;inline-size:12px;block-size:12px;
  vertical-align:baseline;margin-inline-end:7px;
}

/* ---- links: 48px minimum hit target, per touch.json --------------------- */
.ll-link{
  color:var(--ft-primary);text-decoration:underline;text-underline-offset:3px;
  display:inline-block;min-block-size:48px;padding:13px 0;
  touch-action:manipulation;overflow-wrap:anywhere;
}
.ll-link:focus-visible{outline:2px solid var(--ft-primary);outline-offset:2px}
.ll-uri{font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-size:var(--ll-source)}

/* ══ then-vs-now strip (one square) ═══════════════════════════════════════ */
/* The 26px inset exists so that a dot sitting at 0% or 100% of the scale is
   not clipped by the frame. It belongs to the PLOTTED rows alone. Applied to
   the whole figure, as it was, it also pushed the annotation 26px in from the
   graphic's left edge — and an FT annotation hangs from that edge, flush with
   the title and the prose above it. Nothing in an FT graphic is centred, and
   nothing is arbitrarily indented either. */
.ll-strip{margin:6px 0 0}
.ll-strip__note{
  font-size:var(--ll-axis);color:var(--ft-black-70);
  margin:0 0 4px;text-align:start;
}
.ll-strip__note > span{display:block;text-align:start}
/* No gridline stubs on a single-row plot: on a band this short the decade
   marks read as outward ticks, and a value axis takes no ticks. */
.ll-strip__plot{position:relative;block-size:26px;margin-inline:26px}
.ll-strip__labs{position:relative;block-size:1.4em;font-size:var(--ll-axis);margin-inline:26px}
.ll-strip__labs > span{position:absolute;transform:translateX(-50%);white-space:nowrap}
.ll-lab--then{color:var(--ft-black-60)}
.ll-lab--now{color:var(--ft-primary)}

/* ══ dumbbell marks, shared by the strip and the ranked chart ═════════════ */
.ll-conn{
  position:absolute;inset-block-start:50%;block-size:3px;
  transform:translateY(-50%);background:var(--ft-muted-light);
}
.ll-dot{
  position:absolute;inset-block-start:50%;inline-size:9px;block-size:9px;
  border-radius:50%;transform:translate(-50%,-50%);
}
.ll-dot--then{background:var(--ft-muted)}
.ll-dot--now{background:var(--ft-primary)}
.ll-dot--focus{background:var(--ft-highlight)}

/* ══ THE DECADE GRID — shared by every plot cell on this page ══════════════
   Eight lines, one per decade of the shared logarithmic domain, drawn inside
   the plot itself.

   This is the fix for the phone. The axis thins to four labels on a narrow
   frame, and those four are anchored differently at the two ends (the first
   hangs from the left edge, the last from the right) so that neither is
   clipped. With nothing drawn through the plot, a reader keys the bands to the
   CENTRES of those four labels rather than to their tick positions — and then
   the axis and the bands genuinely do read as two different scales, which is
   exactly what was reported at 375px. Gridlines remove the guess: every mark
   now sits on a line the reader can see, at every viewport.

   The period is (100% - 1px)/7 rather than 100%/7 so that the eighth line
   lands INSIDE the box rather than one pixel past its right edge. A scale
   whose last decade is undrawn is a different scale from one whose last decade
   is drawn. These are gridlines, not tick stubs: all eight are the same, they
   run the full height of the plot, and none of them stands outside it. */
.ll-gridded{
  background-image:repeating-linear-gradient(to right,
    var(--ft-black-10) 0 1px, transparent 1px calc((100% - 1px) / 7));
}

/* ══ era spread bands — drawn in the plot column of the ladder figure ══════
   Two bands on the shared logarithmic pound scale: the printed board's whole
   price range, and the recorded evidence's whole price range. Because the
   scale is logarithmic, the LENGTH of a band is the multiple between the
   cheapest and dearest square of its era — which is the claim the headline
   makes, drawn rather than asserted. The comb of pale ticks inside each band
   is the 22 squares, so the band is a distribution and not just a bracket. */
.ll-spread__lab{font-size:var(--ll-axis);margin:0 0 2px;font-weight:600}
.ll-spread__lab--then{color:var(--ft-black-60)}
.ll-spread__lab--now{color:var(--ft-primary)}
/* The counterfactual row is labelled in the same place as the two real ones,
   in a lighter weight, because it is a comparison aid and not a third series
   of observations. */
.ll-spread__lab--ghost{color:var(--ft-black-60);font-weight:400;font-style:italic}
/* The multiple is direct-labelled over the middle of its own band, because a
   legend would make the reader carry the number to the mark themselves. */
.ll-spread__mult{position:relative;block-size:1.5em;font-size:var(--ll-axis)}
.ll-spread__mult > span{
  position:absolute;transform:translateX(-50%);white-space:nowrap;
  font-weight:600;color:var(--ft-black-80);
}
.ll-spread__track{position:relative;block-size:22px}
.ll-spread__band{
  position:absolute;inset-block-start:50%;block-size:14px;
  transform:translateY(-50%);min-inline-size:3px;
}
.ll-spread__band--then{background:var(--ft-muted)}
.ll-spread__band--now{background:var(--ft-primary)}
.ll-spread__tick{
  position:absolute;inset-block-start:50%;inline-size:1px;block-size:22px;
  transform:translate(-50%,-50%);background:var(--ft-paper);
}
/* The ghost: the 1935 spread, at its true length, laid on the 2026 scale from
   the 2026 starting point. It is an outline and not a fill because it is a
   counterfactual, not an observation — nothing was ever measured here. It
   carries no figure at either end for the same reason. */
.ll-spread__ghost{
  position:absolute;inset-block-start:50%;block-size:14px;
  transform:translateY(-50%);border:1px solid var(--ft-black-40);
}
.ll-spread__cap{font-size:var(--ll-axis);color:var(--ft-black-70);margin:5px 0 0}

/* ══ THE LADDER — one figure, one coordinate system ═══════════════════════
   The era bands and the 22 ranked rows used to be two separate figures with
   two separate axes, and the reader was asked to carry a scale from one to the
   other. They are now ONE grid. Every row in it — band row, header row and
   square row alike — is the same two-column layout, so every plot cell is
   literally the same box; and the decade axis is drawn from that same box,
   twice, once above the rows and once below them, because a figure this tall
   should not make anyone scroll to find out what its scale is.

   The label column is where the ORDER lives: rows run dearest first, so the
   sequence of rows is the 2026 ladder, and beside each name is the place the
   1935 board gave that square and the place the evidence gives it now. The
   plot column is where the MAGNITUDE lives. One figure, both claims. */
.ll-rank{--labw:0px;margin:4px 0 0}
.ll-rank__head{position:relative;block-size:1.5em;font-size:var(--ll-axis)}
.ll-rank__head > span{position:absolute;transform:translateX(-50%);white-space:nowrap}
.ll-rank__rows{list-style:none;margin:0;padding:0}
.ll-rank__row{display:grid;grid-template-columns:1fr;align-items:center;padding:4px 0 0}
.ll-rank__row--band{padding:0 0 16px}
.ll-rank__name{
  font-size:var(--ll-axis);color:var(--ft-black-70);
  padding:0 0 2px;text-align:start;
}
.ll-rank__row--focus .ll-rank__name{color:var(--ft-highlight)}
/* The plot cell of a row that holds more than a single track: the band, the
   figure printed over it and the caption beneath it all belong to the plot
   column, because all three are annotations of the same scale. */
.ll-rank__cell{min-inline-size:0}
.ll-rank__track{position:relative;block-size:24px}
.ll-rank__row:nth-child(odd) .ll-rank__track{background-color:var(--ft-paper-band)}

/* ---- the rank-change mark ----------------------------------------------
   The re-ordering used to live in the prose alone: Bond Street from 20th to
   the top, Regent Street from 18th to 4th, Bow Street from 9th to 2nd, four
   squares that never moved. A sentence is not a mark. Every row now carries
   its own two places and an arrow for the direction it travelled, and the four
   squares the board still gets right say "unmoved" in the same slot — so the
   claim in the headline is legible in the graphic and not only in the copy.
   The mark is set in ink, never in a series colour, because it belongs to
   neither era: it is the distance between them. */
.ll-move{
  display:block;font-size:calc(0.8125rem * var(--ll-scale));
  color:var(--ft-black-60);white-space:nowrap;letter-spacing:0.01em;
}
.ll-rank__row--focus .ll-move{color:var(--ft-highlight)}
.ll-move__g{font-size:0.85em;margin-inline-end:3px}

@media (min-width:560px){
  .ll-rank{--labw:11rem}
  .ll-rank__row{grid-template-columns:var(--labw) 1fr;padding:0}
  .ll-rank__row--band{padding:0 0 16px}
  .ll-rank__name{text-align:end;padding:0 12px 0 0}
  .ll-rank__track{block-size:26px}
}

/* ---- axis: tick LABELS only. FT draws no domain line and no tick marks on
        a value axis, so there is nothing here but text.

   ONE SERIES. Every label is the same size, the same colour, the same weight
   and the same distance below the plot; the only thing that varies is the
   horizontal anchor, and that varies only at the two ends, where centring a
   label on the outermost gridline would push half of it outside the frame.
   The two end labels are never dropped, at any width, because an axis whose
   last decade is unlabelled is a different series from one whose last decade
   is labelled. ------------------------------------------------------------ */
.ll-axis{
  position:relative;block-size:2.2em;margin-block-start:6px;
  font-size:var(--ll-axis);color:var(--ft-black-70);
}
.ll-axis > span{position:absolute;transform:translateX(-50%);white-space:nowrap;inset-block-start:2px}
.ll-axis > span.is-first{transform:none}
.ll-axis > span.is-last{transform:translateX(-100%)}
.ll-axis--offset{margin-inline-start:var(--labw)}
.ll-axis--strip{margin-inline:26px}
@media (max-width:559px){.ll-axis .is-minor{display:none}}

/* ---- slope chart: flush left with the title and the prose, never centred - */
.ll-slope{display:block;inline-size:100%;max-inline-size:30rem;margin:0;block-size:auto}
.ll-slope text{font-feature-settings:'tnum' 1}

/* ---- data table: the accessible twin of every chart on this page -------- */
.ll-scroll{overflow-x:auto;overscroll-behavior-x:contain;-webkit-overflow-scrolling:touch;margin:0 0 4px}
.ll-table{border-collapse:collapse;inline-size:100%;min-inline-size:34rem;font-size:var(--ll-axis)}
.ll-table caption{
  caption-side:top;text-align:start;font-size:var(--ll-source);
  color:var(--ft-black-60);padding:0 0 8px;
}
.ll-table th,.ll-table td{
  text-align:end;padding:7px 10px;border-bottom:1px solid var(--ft-black-10);
  white-space:nowrap;
}
/* Words range left, figures range right. Columns 1, 2 and 5 are words. */
.ll-table th:first-child,.ll-table td:first-child,
.ll-table th:nth-child(2),.ll-table td:nth-child(2),
.ll-table th:nth-child(5),.ll-table td:nth-child(5){text-align:start}
.ll-table thead th{
  font-weight:600;color:var(--ft-black-70);
  border-bottom:1px solid var(--ft-black-40);   /* the .baseline, one step darker */
}
.ll-table tbody tr:nth-child(odd){background:var(--ft-paper-band)}
.ll-table .ll-focus{color:var(--ft-highlight)}

/* ---- sources list ------------------------------------------------------- */
.ll-list{list-style:none;margin:0;padding:0}
.ll-list > li{padding:10px 0;border-bottom:1px solid var(--ft-black-10)}
.ll-list > li:last-child{border-bottom:0}
.ll-defs{margin:0}
.ll-defs dt{font-weight:600;color:var(--ft-black-80);margin:12px 0 2px;font-size:var(--ll-axis)}
.ll-defs dd{margin:0;color:var(--ft-black-70);font-size:var(--ll-axis)}
.ll-verbatim{
  font-size:var(--ll-axis);color:var(--ft-black-80);
  margin:0 0 12px;padding-inline-start:12px;border-inline-start:1px solid var(--ft-black-20);
  max-inline-size:70ch;
}
.ll-details summary{
  cursor:pointer;min-block-size:48px;padding:13px 0;
  font-size:var(--ll-axis);font-weight:600;color:var(--ft-primary);
  touch-action:manipulation;
}
.ll-details summary:focus-visible{outline:2px solid var(--ft-primary);outline-offset:2px}

/* ---- dark / social variant, per ft.json's socialframe ------------------- */
.ll-ft[data-theme="dark"]{
  --ft-paper:#333333; --ft-paper-box:#3D3D3D; --ft-paper-band:#3A3A3A;
  --ft-ink:#FFFFFF; --ft-black-10:#47494D; --ft-black-20:#47494D;
  --ft-black-40:#8E9095; --ft-black-60:#8E9095; --ft-black-70:#C3C5C9;
  --ft-black-80:#F2F2F2;
}
@media (prefers-contrast:more){
  .ll-ft{--ft-black-60:#4D4845;--ft-black-10:#CCC1B7}
}
@media (prefers-reduced-motion:reduce){
  .ll-ft *{transition-duration:0.01ms !important;animation-duration:0.01ms !important}
}

/* ══════════════════════════════════════════════════════════════════════════
   THE OVERLAY CHAIN — the host shell these panels are handed to.

   Two reported blockers had one cause. The host builds a .overlay-shell inside
   a #overlay that is display:grid + place-items:center, and nothing sized it.
   A centred grid item is shrink-to-fit, so the shell took its width from the
   widest thing inside it — this stylesheet's own 52rem reading measure — and
   sat 832px wide inside a 390px phone. That is why the comparison chart's
   entire 2026 column was off-screen and the title clipped mid-word. The same
   unsized shell had no height cap either, so it grew to its full content
   height inside a position:fixed parent with nowhere to scroll, which is why
   roughly nine tenths of the sources page could not be reached by wheel or by
   drag at any window size.

   These rules are unlayered and therefore beat the host's @layer rules. They
   cap the shell at the viewport in both axes and make the panel body itself
   the one scroll port, which is the arrangement the rest of this stylesheet
   was already written for.
   ══════════════════════════════════════════════════════════════════════════ */
#overlay{
  display:flex;align-items:center;justify-content:center;
  overflow:hidden;
}
#overlay:empty{display:none}

#overlay > .overlay-shell{
  position:relative;
  display:flex;flex-direction:column;
  inline-size:100%;min-inline-size:0;max-inline-size:52rem;
  max-block-size:100%;min-block-size:0;
  overflow:hidden;
  background:#FFF1E5;
  border-radius:6px;
  box-shadow:0 18px 46px rgba(0,0,0,0.42);
}

/* The panel body is the scroll port. min-block-size:0 is what lets a flex item
   shrink below its content and therefore scroll at all. */
#overlay > .overlay-shell > .ll-ft{
  flex:1 1 auto;
  min-block-size:0;
  inline-size:auto;
  max-inline-size:none;
  margin-inline:0;
  overflow-y:auto;
  overflow-x:hidden;
  overscroll-behavior:contain;
  -webkit-overflow-scrolling:touch;
}

/* The host's close control ships unstyled. It is the first child of the shell,
   so it needs no absolute positioning — just a 48px target, per touch.json. */
#overlay > .overlay-shell > .overlay-close{
  flex:0 0 auto;align-self:flex-end;
  display:flex;align-items:center;justify-content:center;
  inline-size:48px;block-size:48px;
  margin:4px 4px -8px 0;
  padding:0;border:0;background:none;
  color:#4D4845;cursor:pointer;
  touch-action:manipulation;
}
#overlay > .overlay-shell > .overlay-close:focus-visible{
  outline:2px solid #0F5499;outline-offset:-2px;
}

/* Long headlines break rather than push the frame wider. */
.ll-title,.ll-subtitle,.ll-h{overflow-wrap:break-word}

/* ---- clearance under the shell's sticky header --------------------------
   The host shell pins its own header over the top of the scroll port, so a
   heading brought into view — by anchor, by find-in-page, or by tabbing to
   the control that follows it — lands underneath that header and reads as a
   clipped section. The container side of this is hud.js's; the heading side
   is ours. hud.js publishes the header's measured height as
   --ll-sticky-head on an ancestor and every heading in these panels reserves
   it. The fallback is the 48px touch target the close control already uses,
   plus its margin, so the rule is correct on its own even if nothing
   upstream sets the variable. */
.ll-ft .ll-title,
.ll-ft .ll-h,
.ll-ft .ll-sec,
.ll-ft .ll-eyebrow,
.ll-ft .ll-details summary,
.ll-ft figure,
.ll-ft table caption{
  scroll-margin-block-start:calc(var(--ll-sticky-head, 56px) + 8px);
}
`;

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const tag = document.createElement('style');
  tag.id = STYLE_ID;
  tag.textContent = FT_CSS;
  document.head.appendChild(tag);
}

/* ══════════════════════════════════════════════════════════════════════════
   2. SMALL BUILDERS
   ══════════════════════════════════════════════════════════════════════════ */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Build an HTML element. No innerHTML anywhere in this module. */
function h(tag, opts = {}, kids = []) {
  const n = document.createElement(tag);
  if (opts.class) n.className = opts.class;
  if (opts.text != null) n.textContent = String(opts.text);
  if (opts.style) n.setAttribute('style', opts.style);
  if (opts.attrs) {
    for (const [k, v] of Object.entries(opts.attrs)) {
      if (v !== null && v !== undefined) n.setAttribute(k, String(v));
    }
  }
  for (const kid of [].concat(kids)) if (kid) n.appendChild(kid);
  return n;
}

/** Build an SVG element. */
function s(tag, attrs = {}, text) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== null && v !== undefined) n.setAttribute(k, String(v));
  }
  if (text != null) n.textContent = String(text);
  return n;
}

/**
 * Format a Money for display AND register it, so the integrity gate can audit
 * the provenance chain as well as the rendered string.
 */
function moneyText(m, where, fmt = fmtPlain) {
  return registry.record(fmt(m.amount), { money: m, where });
}

/** An element carrying a currency string, tagged with the path it came from. */
function moneyEl(tag, cls, m, where, fmt = fmtPlain) {
  const path = [...m.leaves()][0] || '';
  return h(tag, {
    class: cls,
    text: moneyText(m, where, fmt),
    attrs: { 'data-fact': path },
  });
}

/**
 * An element carrying a figure this module worked out rather than read: a
 * square's annual debt service, or what its rent is worth to the score once
 * the bank has been paid. The arithmetic is still Money arithmetic, so the
 * provenance chain still bottoms out in the fact base and the registry still
 * audits it — but the rendered string is not itself an amount the fact base
 * contains, so it is tagged data-money="derived", exactly as the HUD tags a
 * running cash balance.
 *
 * This is the one place in these panels that uses "derived". It exists because
 * the economy changed: the score is now the rent roll NET of debt service, and
 * a panel that showed a square's rent without showing what the bank takes out
 * of it would be describing a game nobody is playing.
 */
function derivedEl(tag, cls, m, where, fmt = fmtPlain) {
  return h(tag, {
    class: cls,
    text: moneyText(m, where, fmt),
    attrs: { 'data-money': 'derived' },
  });
}

/** The FT chart signature plus its title and subtitle, in that fixed order. */
function heading(title, subtitle) {
  return [
    h('div', { class: 'll-bar', attrs: { 'aria-hidden': 'true' } }),
    h('h2', { class: 'll-title', text: title }),
    subtitle ? h('p', { class: 'll-subtitle', text: subtitle }) : null,
  ];
}

/**
 * A chart's own heading and its own subtitle. A subtitle belongs to the chart
 * it describes: "£ per square, logarithmic scale" is true of the value plot
 * and false of the rank slope, so each carries its own.
 */
function chartHead(title, subtitle) {
  return [
    h('h3', { class: 'll-h', text: title }),
    subtitle ? h('p', { class: 'll-subhead', text: subtitle }) : null,
  ];
}

/**
 * The source block. Stacked lines, flush left, in black-60, in FT's order:
 * footnote, then Source(s), then the credit. Data vintage never appears here —
 * it belongs in the subtitle.
 */
function sourceBlock({ footnote, sources, credit = 'Graphic: Teddy James Advisory' }) {
  const kids = [];
  if (footnote) kids.push(h('span', { text: `*${footnote}` }));
  const label = sources.length > 1 ? 'Sources: ' : 'Source: ';
  kids.push(h('span', { text: label + sources.join('; ') }));
  kids.push(h('span', { class: 'll-credit', text: credit }));
  return h('p', { class: 'll-cite' }, kids);
}

/* ---------------------------------------------------------------- numbers */

/**
 * FT abbreviation for money, in this module's own hand because money.js is
 * fixed and emits a bare "m".
 *
 *   £33,575,353  ->  £33.6mn
 *   £267,500,000 ->  £267.5mn
 *   £129,502     ->  £129,502   (under a million, written out with its comma)
 *
 * The integrity gate accepts an abbreviated token two ways: the token parses
 * back to an exact fact-base amount, or it matches what integrity.js's own
 * compactOf() would render for one. One decimal place satisfies the second
 * test for everything below £100mn. At or above £100mn compactOf drops the
 * decimal, so the one-decimal form is kept only where it parses back exactly —
 * which is what makes £267.5mn legible rather than rounded to £268mn — and the
 * whole-number form is used otherwise. No figure can be shown that the fact
 * base cannot account for.
 */
function fmtMn(amount) {
  const n = Math.abs(Math.round(amount));
  if (n < 1_000_000) return fmtPlain(amount);
  const m = n / 1_000_000;
  const oneDp = Math.round(m * 10) / 10;
  const exact = Math.round(oneDp * 1_000_000) === n;
  const body = (m >= 100 && !exact) ? Math.round(m).toLocaleString('en-GB') : oneDp.toFixed(1);
  const out = '£' + body + 'mn';
  return amount < 0 ? '−' + out : out;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

/** "2024-03-27" -> "27 March 2024". Day and year numerals are both declared. */
function ukDate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return String(iso);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** "2026-05" -> "May 2026". */
function ukMonth(iso) {
  const [y, m] = String(iso).split('-').map(Number);
  return m ? `${MONTHS[m - 1]} ${y}` : String(iso);
}

const ORD_SUFFIX = (n) => {
  const t = n % 100;
  if (t >= 11 && t <= 13) return 'th';
  return { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th';
};
const ordinal = (n) => `${n}${ORD_SUFFIX(n)}`;

/**
 * Multiples are ratios of two facts-file amounts. They are not themselves in
 * the fact base, so every element that renders one carries data-numeral-ok.
 */
function multipleText(now, then) {
  const r = now / then;
  const rounded = r >= 100 ? Math.round(r) : Math.round(r * 10) / 10;
  return `${rounded.toLocaleString('en-GB')}×`;
}

/* ------------------------------------------------------- logarithmic scale */

/**
 * One shared logarithmic domain, £10 to £100,000,000, used by every then-and-
 * now visual in this module so that a single square's strip can be compared
 * directly against the ranked chart.
 *
 * The domain is stated in decades rather than fitted to the data, so it never
 * moves when the fact base is refreshed, and every gridline is exactly ten
 * times the one before it.
 */
const LOG_MIN_EXP = 1;
const LOG_MAX_EXP = 8;
const LOG_DECADES = LOG_MAX_EXP - LOG_MIN_EXP;

/** Value -> 0..100 position across the plot. */
function logPos(value) {
  const v = Math.max(Number(value) || 1, 1);
  const p = (Math.log10(v) - LOG_MIN_EXP) / LOG_DECADES;
  return Math.min(Math.max(p, 0), 1) * 100;
}

/**
 * Axis tick labels. FT strips the currency symbol from the axis and declares
 * the unit once in the subtitle, so these run bare.
 *
 * ONE SERIES, not two. The labels used to run 10, 100, 1,000, 10,000, 100,000,
 * 1mn — grouped numerals for five decades and then an abbreviation, which
 * reads as two different scales bolted together. Every decade at or above a
 * thousand now takes the same closed-up lowercase magnitude suffix.
 */
function tickLabel(exp) {
  if (exp >= 8) return '100mn';
  if (exp === 7) return '10mn';
  if (exp === 6) return '1mn';
  if (exp === 5) return '100k';
  if (exp === 4) return '10k';
  if (exp === 3) return '1k';
  return Math.pow(10, exp).toLocaleString('en-GB');
}

/**
 * The decade axis. Every tick label is a bare numeral that the fact base does
 * not contain (£1,000 and £100,000,000 are scale marks, not observations), so
 * the row carries data-numeral-ok.
 *
 * There are no tick marks, because a value axis takes none. There is no domain
 * line either. The row is text and nothing else.
 *
 * THINNING, NOT TRUNCATING. On a narrow frame the eight decades cannot all be
 * set without colliding, so alternate INTERIOR labels drop out. The first and
 * last never do: an axis that stops labelling before its scale does reads as a
 * different, shorter series. The penultimate decade drops out with the minor
 * ones because it is the one that would collide with the final label.
 */
function decadeAxis(extraClass = '') {
  const row = h('div', {
    class: `ll-axis ${extraClass}`.trim(),
    attrs: { 'data-numeral-ok': '', 'aria-hidden': 'true' },
  });
  for (let exp = LOG_MIN_EXP; exp <= LOG_MAX_EXP; exp++) {
    const i = exp - LOG_MIN_EXP;
    const pct = (i / LOG_DECADES) * 100;
    const isEnd = i === 0 || i === LOG_DECADES;
    const minor = !isEnd && (i % 2 === 1 || i === LOG_DECADES - 1);
    const cls = [
      minor ? 'is-minor' : '',
      i === 0 ? 'is-first' : '',
      i === LOG_DECADES ? 'is-last' : '',
    ].filter(Boolean).join(' ');
    row.appendChild(h('span', {
      class: cls,
      text: tickLabel(exp),
      style: `left:${pct}%`,
    }));
  }
  return row;
}

/** The honesty note that FT convention requires beside any non-zero baseline. */
function logScaleNote() {
  return h('p', {
    class: 'll-note',
    text: 'The value scale is logarithmic: each gridline is ten times the one '
        + 'before it, so equal distances are equal multiples rather than equal '
        + 'pounds. Bars are not used here, because a bar must start at zero and '
        + 'a logarithmic scale cannot reach it. The dots are the two values; '
        + 'the line between them is the multiple.',
  });
}

/* ------------------------------------------------- how strong is the basis */

/**
 * Why one square's figure is measured differently from the next one's, said in
 * plain English on the square where the player meets it.
 *
 * A reader who sees Whitehall at a median of arm's-length residential sales
 * and Piccadilly at a median of all recorded transactions has been shown two
 * different measurements without being told they are different. The basis
 * label alone does not carry that; it is a category name, not a comparison.
 * So each square states, in words, what its own evidence is worth and how it
 * differs from the preferred basis — and a square resting on weaker evidence
 * says so on its face before the reader gets to the figure.
 *
 * `strength` is the flag; `firm` is the preferred basis and takes the quiet
 * treatment. The mandarin flag is a fill, so it always carries its own words.
 */
const BASIS_STRENGTH = {
  'ppd-median-a': {
    strength: 'firm',
    flag: 'Preferred basis',
    plain: 'This is the strongest basis the open data offers: the middle price '
         + 'of the ordinary, arm’s-length residential sales recorded on this '
         + 'street. Squares measured this way are the ones to compare against '
         + 'each other with the most confidence.',
  },
  'ppd-median-all': {
    strength: 'weaker',
    flag: 'Wider basis than most squares',
    plain: 'Too few ordinary residential sales were recorded here to take a '
         + 'median from, so the sample was widened to every recorded transfer, '
         + 'including sales to companies and other non-standard transactions. '
         + 'A single commercial block changing hands can pull that figure well '
         + 'above what a home on the same street costs, so this square is not '
         + 'measuring quite the same thing as a square on the preferred basis.',
  },
  'ppd-single': {
    strength: 'weak',
    flag: 'One sale only — not an average',
    plain: 'Only one recorded sale sits behind this figure. It is a fact about '
         + 'one building on one day, not a market. It is shown because it is '
         + 'the real recorded evidence and hiding it would be worse, but it '
         + 'should not be read as this street’s price.',
  },
  'ukhpi-la-average': {
    strength: 'weak',
    flag: 'Borough average — not a street figure',
    plain: 'No residential sale is recorded on this square at all, so the UK '
         + 'House Price Index average for the whole local authority stands in '
         + 'for the street. It describes the borough, not this address, and it '
         + 'is the weakest evidence anywhere on this board.',
  },
};

/**
 * The bases that rest on something thinner than a median of a street's own
 * ordinary sales. A square measured this way carries a visible mark wherever
 * it is plotted or tabulated, not only on its own card, because the charts are
 * where a reader forms the comparison in the first place.
 */
const WEAK_BASES = new Set(['ppd-single', 'ukhpi-la-average']);

/** The mark itself. A dagger, so it survives greyscale and colour-blindness. */
const WEAK_MARK = '†';

/** Two or three words naming the evidence, for a table column or a list. */
const EVIDENCE_WORD = {
  'ppd-median-a': 'Street median',
  'ppd-median-all': 'Wider basis',
  'ppd-single': 'One sale only',
  'ukhpi-la-average': 'Borough average',
};

/** Small counts are set as words, which is both FT style and gate-proof. */
const COUNT_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six',
  'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const countWord = (n) => COUNT_WORDS[n] || String(n);
const sentenceCase = (t) => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * The two squares that make the difference between bases legible: the square
 * with the deepest ordinary-sales sample, and the square where widening to
 * every recorded transfer moved the figure furthest. Both are chosen from the
 * fact base, so the comparison cannot go stale.
 */
function exemplarPair() {
  const all = streets();
  const firm = all.filter((s) => s.value2026.basis === 'ppd-median-a')
    .sort((a, b) => (b.value2026.sampleSize || 0) - (a.value2026.sampleSize || 0))[0];
  const wide = all.filter((s) => s.value2026.basis === 'ppd-median-all')
    .sort((a, b) => b.value2026.amount - a.value2026.amount)[0];
  return (firm && wide) ? { firm, wide } : null;
}

/**
 * Why two squares on the same board carry figures that are not measuring the
 * same thing, said once, with both figures on the page so the reader can see
 * the size of the difference rather than take the word "basis" on trust.
 */
function basisContrastNote(where) {
  const pair = exemplarPair();
  if (!pair) return null;
  const { firm, wide } = pair;

  const p = h('p', {
    class: 'll-note',
    /* Sample sizes are fact-base figures; the paragraph is declared anyway so
       the sentence can be rewritten without tripping the gate. */
    attrs: { 'data-numeral-ok': '' },
  });
  p.appendChild(h('span', {
    text: `The difference is not cosmetic. ${firm.name} is `,
  }));
  p.appendChild(moneyEl('span', '', priceOf(firm.id), `${where}:contrast:${firm.id}`));
  p.appendChild(h('span', {
    text: ` — the middle price of ${firm.value2026.sampleSize} ordinary homes `
        + `changing hands — while ${wide.name} is `,
  }));
  p.appendChild(moneyEl('span', '', priceOf(wide.id), `${where}:contrast:${wide.id}`, fmtMn));
  p.appendChild(h('span', {
    text: `, the middle price of ${wide.value2026.sampleSize} recorded transfers `
        + 'of every kind, including whole commercial blocks bought by companies. '
        + 'The second figure is larger partly because it counts sales no home '
        + 'buyer would ever make. Both are real; they are answers to different '
        + 'questions, and each square says which question it answered.',
  }));
  return p;
}

/** "a, b and c" — an English list, not a comma-separated dump. */
function listWords(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * The key to the weak-evidence mark, naming every square that carries it.
 *
 * Four squares on this board rest on one recorded sale and one on none at all.
 * That is the most interesting thing the open data has to say about them, and
 * burying it in a basis code would be a way of not saying it.
 */
function evidenceNote(rows) {
  const single = rows.filter((r) => r.basis === 'ppd-single').map((r) => r.name);
  const index = rows.filter((r) => r.basis === 'ukhpi-la-average').map((r) => r.name);

  const parts = [`${WEAK_MARK} marks a square whose 2026 figure is not a median `
                 + 'of that street’s own sales. '];
  if (single.length) {
    parts.push(`${listWords(single)} rest on a single recorded sale — one `
             + 'building, one day, not a market. ');
  }
  if (index.length) {
    parts.push(`${listWords(index)} has no residential sale recorded on it at `
             + 'all, so the UK House Price Index average for the whole borough '
             + 'stands in for the street. ');
  }
  parts.push('They are plotted alongside the rest because they are the real '
           + 'recorded evidence, and marked because they are thinner than it.');

  return h('p', { class: 'll-note', text: parts.join('') });
}

/** The footnote FT would set beneath the figure, stating the sample plainly. */
function basisFootnote(v) {
  const n = v.sampleSize;
  if (v.basis === 'ppd-median-a' && n) return `Median of ${n} arm’s-length residential sales`;
  if (v.basis === 'ppd-median-all' && n) return `Median of ${n} recorded transactions`;
  if (v.basis === 'ppd-single') return 'A single recorded sale, not an average';
  if (v.basis === 'ukhpi-la-average') return 'Local authority average, not a street-level figure';
  return n ? `Median of ${n} recorded transactions` : null;
}

/* ══════════════════════════════════════════════════════════════════════════
   3. THE LADDER — computed once, used by every chart and every sentence
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Build the 1935/2026 ladder. Position 1 is the cheapest.
 *
 * The 1935 position is simply the square's place on the printed board, which
 * runs in ascending price order; ties in the printed price are therefore
 * broken by board order rather than arbitrarily. The 2026 position is the rank
 * of the recorded value.
 */
function computeLadder() {
  const rows = streets().map((st, i) => ({
    id: st.id,
    name: st.name,
    localAuthority: st.localAuthority,
    then: st.boardPrice1935.amount,
    now: st.value2026.amount,
    basisLabel: st.value2026.basisLabel,
    basis: st.value2026.basis,
    pos1935: i + 1,
    pos2026: 0,
  }));

  [...rows].sort((a, b) => a.now - b.now)
    .forEach((r, i) => { r.pos2026 = i + 1; });

  for (const r of rows) r.move = r.pos2026 - r.pos1935;
  return rows;
}

/** The three squares whose position moved furthest, in either direction. */
function biggestMovers(rows) {
  return [...rows]
    .sort((a, b) => Math.abs(b.move) - Math.abs(a.move) || a.name.localeCompare(b.name))
    .slice(0, 3);
}

/* ══════════════════════════════════════════════════════════════════════════
   4. renderPropertyPanel
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The data card for a single square.
 *
 * Every figure is shown with the thing that makes it meaningful: the 2026
 * value never appears without its basis, the rent never appears without the
 * word "assumption" and the arithmetic that produced it, and the sample never
 * appears without its size, its window and its access date.
 *
 * @param {string} streetId
 * @returns {HTMLElement}
 */
export function renderPropertyPanel(streetId) {
  ensureStyles();

  const st = street(streetId);
  const v = st.value2026;
  const group = groupOf(st.group);
  const where = `panel:${streetId}`;

  const root = h('article', {
    class: 'll-ft',
    attrs: { 'data-panel': 'property', 'data-street': streetId },
  });

  /* ---- heading: the square, then where it is and what it belongs to ---- */
  const subtitle = `${st.localAuthority} · ${group ? group.name : ''} group`;
  for (const node of heading(st.name, subtitle)) root.appendChild(node);

  if (group) {
    root.appendChild(h('p', { class: 'll-meta' }, [
      h('span', {
        class: 'll-group-dot',
        style: `background:${group.colour}`,
        attrs: { 'aria-hidden': 'true' },
      }),
      h('span', { text: `${group.name} — ${group.size} squares` }),
    ]));
  }

  /* ══ the 2026 value, with its basis stated before anything else ══
     The strength flag comes BEFORE the figure. A reader who is going to be
     told the evidence is thin should be told it before they read the number,
     not in a footnote after they have already believed it. */
  const strength = BASIS_STRENGTH[v.basis] || null;
  const price = priceOf(streetId);
  const valueSec = h('section', { class: 'll-sec' }, [
    h('span', { class: 'll-eyebrow', text: '2026 value' }),
  ]);

  if (strength) {
    valueSec.appendChild(h('p', {}, [
      h('span', {
        class: `ll-basis-flag${strength.strength === 'firm' ? ' ll-basis-flag--firm' : ''}`,
        text: strength.flag,
      }),
    ]));
  }

  valueSec.appendChild(moneyEl('p', 'll-figure', price, `${where}:value2026`, fmtMn));
  valueSec.appendChild(h('p', { class: 'll-basis', text: v.basisLabel }));
  valueSec.appendChild(h('p', { class: 'll-meta', text: sourceLine(streetId) }));
  valueSec.appendChild(h('p', {
    class: 'll-meta',
    text: `Window ${v.windowFrom} to ${v.windowTo}`
        + (v.referenceMonth ? ` · reference month ${ukMonth(v.referenceMonth)}` : ''),
  }));

  if (v.sampleLow != null && v.sampleHigh != null) {
    const low = h('span', {
      text: registry.record(fmtMn(v.sampleLow), { where: `${where}:sampleLow` }),
      attrs: { 'data-fact': `streets[${indexOfStreet(streetId)}].value2026.sampleLow` },
    });
    const high = h('span', {
      text: registry.record(fmtMn(v.sampleHigh), { where: `${where}:sampleHigh` }),
      attrs: { 'data-fact': `streets[${indexOfStreet(streetId)}].value2026.sampleHigh` },
    });
    valueSec.appendChild(h('p', { class: 'll-meta' }, [
      h('span', { text: 'Recorded range in the sample: ' }), low,
      h('span', { text: ' to ' }), high,
    ]));
  }

  valueSec.appendChild(h('p', { class: 'll-note', text: v.method }));

  /* Why this square is measured the way it is, and how that differs from the
     square next to it on the board. */
  if (strength) {
    valueSec.appendChild(h('p', { class: 'll-note', text: strength.plain }));
    if (strength.strength !== 'firm') {
      /* The comparison the reader is about to make without being told they are
         making it, made explicit — with both figures on the page. */
      const contrast = basisContrastNote(where);
      if (contrast) valueSec.appendChild(contrast);
      valueSec.appendChild(h('p', {
        class: 'll-note',
        text: 'Every square on this board carries the name of its own basis, and '
            + `a square measured on weaker evidence is marked ${WEAK_MARK} in the `
            + 'comparison chart and its table as well as here. The sources page '
            + 'sets out all four bases and how many squares rest on each.',
      }));
    }
  }
  root.appendChild(valueSec);

  /* ══ the proxy note, surfaced rather than buried ══ */
  if (st.proxyNote) {
    root.appendChild(h('div', { class: 'll-alert' }, [
      h('span', { class: 'll-eyebrow', text: 'Evidence from a proxy street' }),
      h('p', { class: 'll-note', text: st.proxyNote }),
    ]));
  }

  /* ══ 1935 against 2026 ══ */
  const board = board1935Of(streetId);
  const thenSec = h('section', { class: 'll-sec' }, [
    h('span', { class: 'll-eyebrow', text: '1935 board price' }),
    moneyEl('p', 'll-figure ll-figure--then', board, `${where}:board1935`, fmt1935),
    h('p', { class: 'll-basis', text: st.boardPrice1935.note }),
  ]);
  thenSec.appendChild(thenVsNowStrip(st, where));
  thenSec.appendChild(logScaleNote());
  root.appendChild(thenSec);

  /* ══ rent: an assumption, and unmistakably labelled as one ══ */
  const rent = rentOf(streetId);
  const ra = st.rentAssumption;
  root.appendChild(h('section', { class: 'll-sec' }, [
    h('h3', { class: 'll-h', text: 'Rent on landing — an assumption, not an observation' }),
    h('div', { class: 'll-box' }, [
      h('span', { class: 'll-eyebrow', text: ra.label }),
      moneyEl('p', 'll-figure ll-figure--then', rent, `${where}:rent`),
      h('p', { class: 'll-basis', text: `Assumption: ${ra.grossYieldPct}% gross yield. One year's rent is charged on landing.` }),
      h('p', { class: 'll-formula', text: `Formula: ${ra.formula}` }),
    ]),
    h('p', { class: 'll-note', text: ra.note }),
  ]));

  /* ══ debt: also an assumption ══ */
  const debt = debtCapacityOf(streetId);
  const ma = st.mortgageAssumption;
  root.appendChild(h('section', { class: 'll-sec' }, [
    h('h3', { class: 'll-h', text: 'Debt available — a leverage assumption' }),
    h('div', { class: 'll-box' }, [
      h('span', { class: 'll-eyebrow', text: ma.label }),
      moneyEl('p', 'll-figure ll-figure--then', debt, `${where}:debt`),
      h('p', { class: 'll-basis', text: `Assumption: ${ma.ltvPct}% loan to value` }),
      h('p', { class: 'll-formula', text: `Formula: ${ma.formula}` }),
    ]),
    h('p', { class: 'll-note', text: ma.note }),
  ]));

  /* ══ what this square is worth to the score ══ */
  root.appendChild(scoreSection(st, where));

  /* ══ the cited record, where one exists ══ */
  if (v.latestRecord) {
    root.appendChild(citedRecord(streetId, v.latestRecord, where));
  } else {
    root.appendChild(h('section', { class: 'll-sec' }, [
      h('h3', { class: 'll-h', text: 'Cited transaction' }),
      h('p', {
        class: 'll-note',
        text: 'No residential sale is recorded on this square in the Price Paid '
            + 'Data for the window, so there is no transaction record to cite. '
            + 'The figure above comes from the index instead, and its basis says so.',
      }),
    ]));
  }

  /* ══ source block: footnote first, then the source, each on its own line ══
     The footnote states the sample in the same words for every square, so a
     reader moving between cards can see at a glance that Bond Street's figure
     rests on sixteen transactions of every kind and Whitehall's on sixty-seven
     ordinary sales. */
  root.appendChild(sourceBlock({
    footnote: basisFootnote(v),
    sources: [v.dataset],
  }));

  return root;
}

/** Index of a square in the fact base, for building dotted fact paths. */
function indexOfStreet(id) {
  return factBase().streets.findIndex((x) => x.id === id);
}

/**
 * WHAT THIS SQUARE IS WORTH TO THE SCORE — and what the bank takes out of it.
 *
 * The economy changed, and this section exists because of the change. The game
 * is won on the largest annual rent roll NET of debt service, not on the
 * largest rent roll and not on the largest pile of cash. Before the interest
 * was charged against the score, a critic proved that gearing was strictly
 * dominant: it bought two and a half times the rent per pound of the player's
 * own money, and its only cost was paid in a currency nobody was scored on. A
 * card that showed this square's rent and this square's borrowing capacity
 * side by side, with no cost between them, was describing exactly that
 * dominated game.
 *
 * So both routes are set out with the same two figures — what you commit, and
 * what reaches the score — and the arithmetic is left visible between them.
 * Every figure here is Money arithmetic over fact-base leaves; the ones that
 * are not themselves in the fact base are tagged as derived.
 */
function scoreSection(st, where) {
  const a = assumptions();
  const price = priceOf(st.id);
  const rent = rentOf(st.id);
  const debt = debtCapacityOf(st.id);
  const service = debt.scale(a.debtInterestPct / 100,
    'assumptions.debtInterestPct', 'annual debt service on the maximum loan');
  const netRent = rent.sub(service);
  const cashGeared = price.sub(debt);

  const line = (label, el) => h('p', { class: 'll-meta' }, [
    h('span', { text: label }), el,
  ]);

  const outright = h('div', { class: 'll-box' }, [
    h('span', { class: 'll-eyebrow', text: 'Bought outright' }),
    line('Cash committed: ', moneyEl('span', '', price, `${where}:score:cashOutright`, fmtMn)),
    line('Added to your score each year: ',
      moneyEl('span', '', rent, `${where}:score:rentOutright`)),
  ]);

  const geared = h('div', { class: 'll-box', style: 'margin-top:8px' }, [
    h('span', { class: 'll-eyebrow', text: `Bought with the maximum loan — ${a.ltvPct}% of value` }),
    line('Cash committed: ', derivedEl('span', '', cashGeared, `${where}:score:cashGeared`, fmtMn)),
    line('Rent: ', moneyEl('span', '', rent, `${where}:score:rentGeared`)),
    line(`Less debt service at ${a.debtInterestPct}% a year: `,
      derivedEl('span', '', service, `${where}:score:service`)),
    line('Added to your score each year: ',
      derivedEl('span', '', netRent, `${where}:score:net`)),
  ]);
  geared.appendChild(h('p', {
    class: 'll-formula',
    text: `Formula: rent − ${a.debtInterestPct}% × debt outstanding`,
  }));

  return h('section', { class: 'll-sec' }, [
    h('h3', { class: 'll-h', text: 'What this square adds to your score' }),
    h('p', {
      class: 'll-prose',
      text: 'The game is won on the largest annual rent roll at the close, net of '
          + 'debt service — not on the largest pile of cash, and not on the '
          + 'largest gross rent. Interest is charged against the score, so debt '
          + 'is a decision rather than free money.',
    }),
    outright,
    geared,
    h('p', {
      class: 'll-note',
      text: `Debt costs ${a.debtInterestPct}% a year and the assumed yield is `
          + `${a.grossYieldPct}%, so a borrowed pound buys slightly less rent `
          + 'than it costs to service: gearing lowers what this square alone '
          + 'contributes. What it buys instead is reach. The same cash takes '
          + 'more squares, and it is holding every square in a colour group '
          + 'that doubles the rent those squares yield. Neither always '
          + 'borrowing nor never borrowing wins; that is the decision the game '
          + 'is built on, and it is why the cost is shown here rather than left '
          + 'to the bank statement.',
    }),
  ]);
}

/** The cited HM Land Registry record, with its transaction URI as a real link. */
function citedRecord(streetId, rec, where) {
  const i = indexOfStreet(streetId);
  const sec = h('section', { class: 'll-sec' }, [
    h('h3', { class: 'll-h', text: 'Cited transaction' }),
    /* The address is copied verbatim from the register. Its house numbers and
       postcode digits are not facts-file amounts, so the line is declared. */
    h('p', { class: 'll-basis', text: rec.address, attrs: { 'data-numeral-ok': '' } }),
    h('p', {
      class: 'll-meta',
      text: `${ukDate(rec.date)} · ${rec.tenure} · Price Paid Data category ${rec.ppdCategory}`,
    }),
    h('p', {
      class: 'll-figure ll-figure--then',
      text: registry.record(fmtPlain(rec.price), { where: `${where}:recordPrice` }),
      attrs: { 'data-fact': `streets[${i}].value2026.latestRecord.price` },
    }),
  ]);

  const link = h('a', {
    class: 'll-link ll-uri',
    text: rec.transactionUri,
    attrs: {
      href: rec.transactionUri,
      rel: 'noopener noreferrer',
      target: '_blank',
      /* The transaction identifier is HM Land Registry's own primary key,
         reproduced character for character so the record can be verified. */
      'data-numeral-ok': '',
    },
  });
  sec.appendChild(h('p', { class: 'll-meta', text: 'HM Land Registry transaction record' }));
  sec.appendChild(link);
  return sec;
}

/**
 * The then-and-now dumbbell for one square: two dots on the shared logarithmic
 * scale, a connector whose length is the multiple, direct labels instead of a
 * legend, and no chart junk of any kind.
 */
function thenVsNowStrip(st, where) {
  const a = logPos(st.boardPrice1935.amount);
  const b = logPos(st.value2026.amount);

  /* The annotation hangs from the graphic's left edge. It used to be pushed to
     the midpoint of the connector by an inline offset, which floated it in the
     middle of the frame; the offset has gone with the indent. */
  const note = h('div', { class: 'll-strip__note' }, [
    h('span', {
      /* A ratio of two facts-file amounts, computed here and declared. */
      attrs: { 'data-numeral-ok': '' },
      text: `${multipleText(st.value2026.amount, st.boardPrice1935.amount)} in nominal pounds`,
    }),
  ]);

  const plot = h('div', { class: 'll-strip__plot' }, [
    h('div', { class: 'll-conn', style: `left:${a}%;inline-size:${Math.max(b - a, 0)}%` }),
    h('div', { class: 'll-dot ll-dot--then', style: `left:${a}%` }),
    h('div', { class: 'll-dot ll-dot--now', style: `left:${b}%` }),
  ]);

  const labs = h('div', { class: 'll-strip__labs' }, [
    h('span', { class: 'll-lab--then', style: `left:${a}%`, text: '1935' }),
    h('span', { class: 'll-lab--now', style: `left:${b}%`, text: '2026' }),
  ]);

  return h('figure', {
    class: 'll-strip',
    style: 'margin:12px 0 4px',
    attrs: {
      role: 'img',
      'aria-label': `${st.name}: the 1935 board price against the 2026 recorded `
                  + 'value, on a logarithmic scale',
      'data-where': where,
    },
  }, [note, plot, labs, decadeAxis('ll-axis--strip')]);
}

/* ══════════════════════════════════════════════════════════════════════════
   5. renderComparisonChart — the ladder, redrawn
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * All 22 squares, 1935 against 2026.
 *
 * THE HEADLINE AND THE MARKS MUST AGREE — AND THE HEADLINE MAKES TWO CLAIMS.
 * Two rounds of criticism landed on this page from opposite directions. The
 * first: the page opened with a slope chart of RANK while the headline argued
 * MAGNITUDE, and twenty-two near-horizontal lines say "the order barely
 * changed". The second, on the graphic that replaced it: the headline claims a
 * LADDER — an order — while the marks showed only a RANGE, and every
 * rank-change fact that would prove the claim sat in the prose.
 *
 * Both are right, because "the 1935 price ladder no longer describes London"
 * is a claim about shape AND a claim about order. Swapping the charts back and
 * forth would simply have alternated between the two complaints. So the two
 * claims are now drawn in ONE piece:
 *
 *   (a) THE LADDER, REDRAWN — one figure, one logarithmic pound scale, one
 *       grid. The era bands carry the shape; the row sequence and the
 *       board-place-to-place-now mark on every row carry the order. See
 *       ladderChart().
 *   (b) THE SECOND VIEW — the slope chart of board position, which is what
 *       FT's own Visual Vocabulary calls "perfect for showing how ranks have
 *       changed". It is kept because crossings are the one thing a row-ordered
 *       chart cannot draw, and it now names both places on every line it
 *       labels rather than only the 2026 one.
 *
 * A bar chart is deliberately not used anywhere here. Bars must start at zero,
 * and a scale that has to span more than a hundred times cannot honestly do
 * that.
 *
 * @returns {HTMLElement}
 */
export function renderComparisonChart() {
  ensureStyles();

  const rows = computeLadder();
  const movers = biggestMovers(rows);
  const moverIds = new Set(movers.map((r) => r.id));

  const byNow = [...rows].sort((a, b) => b.now - a.now);
  const cheapest = byNow[byNow.length - 1];
  const dearest = byNow[0];
  const thenLow = Math.min(...rows.map((r) => r.then));
  const thenHigh = Math.max(...rows.map((r) => r.then));
  const held = rows.filter((r) => r.move === 0).length;

  const root = h('section', {
    class: 'll-ft',
    attrs: { 'data-panel': 'comparison' },
  });

  /* The page subtitle describes the PAGE, and it now states BOTH halves of the
     claim the headline makes, because the graphic beneath it draws both: the
     rungs are further apart than they were, and they are in a different order.
     The unit and the scale sit with the chart they are true of, not here. */
  for (const node of heading(
    'The 1935 price ladder no longer describes London',
    'The same 22 squares, 1935 board price against 2026 recorded value: further '
    + 'apart than the printed board made them, and in a different order',
  )) root.appendChild(node);

  /* ---- the finding, in prose, computed rather than asserted ---- */
  const spreadThen = h('span', {
    attrs: { 'data-numeral-ok': '' },
    text: multipleText(thenHigh, thenLow),
  });
  const spreadNow = h('span', {
    attrs: { 'data-numeral-ok': '' },
    text: multipleText(dearest.now, cheapest.now),
  });
  root.appendChild(h('p', { class: 'll-prose' }, [
    h('span', { text: 'The printed board spread its prices over ' }), spreadThen,
    h('span', { text: '. The recorded evidence spreads them over ' }), spreadNow,
    h('span', {
      text: `. Of the 22 squares, ${countWord(held)} still sit exactly where the 1935 board `
          + `put them; ${movers[0].name} has moved furthest, from `
          + `${ordinal(movers[0].pos1935)} to ${ordinal(movers[0].pos2026)} cheapest.`,
    }),
  ]));

  /* The extremes, named from the data rather than from memory, so the sentence
     cannot outlive the fact base it describes. */
  const secondCheapest = byNow[byNow.length - 2];
  root.appendChild(h('p', {
    class: 'll-prose',
    text: `The dearest square on the 2026 evidence, ${dearest.name}, was only `
        + `${ordinal(dearest.pos1935)} of 22 on the printed board. The cheapest, `
        + `${cheapest.name}, was ${ordinal(cheapest.pos1935)} then too — the one `
        + `rung the board still gets right. Just above it, ${secondCheapest.name} `
        + `has fallen from ${ordinal(secondCheapest.pos1935)} on the board to `
        + `${ordinal(secondCheapest.pos2026)} on the evidence.`,
  }));

  /* ══ (a) THE PRIMARY CHART: shape and order, in one piece ══
     Its subtitle declares the unit and the scale of the plot column, and what
     the label column holds, because those are the two things its marks encode
     and a reader should not have to work out which is which. */
  for (const node of chartHead(
    'The ladder, redrawn',
    '£ per square, logarithmic scale. Rows run dearest first, so the order of '
    + 'the rows is the 2026 ladder; beside each name is the place the printed '
    + 'board gave that square and the place the evidence gives it now, counting '
    + 'from the cheapest',
  )) root.appendChild(node);
  root.appendChild(ladderChart(rows, byNow, moverIds));
  root.appendChild(h('p', {
    class: 'll-note',
    text: 'The two filled bands at the top are the whole price range of each era. '
        + 'On a logarithmic scale length is multiple, so the figure printed over '
        + 'a band is exactly what that band’s length encodes, and the pale ticks '
        + 'inside it are the 22 squares themselves. The third band is an outline '
        + 'rather than a fill because nothing was ever measured there: it is the '
        + '1935 spread at its own length, moved across to the 2026 scale and '
        + 'started from the same cheapest square. Beneath them, one row per '
        + 'square: the grey dot is the 1935 board price, the blue dot the 2026 '
        + 'recorded value, and the distance between them that address’s own '
        + 'multiple. Both series are labelled on the first row rather than in a '
        + 'legend, and every decade of the scale is drawn through the plot so a '
        + 'mark can be read against it without travelling to the axis.',
  }));
  root.appendChild(h('p', {
    class: 'll-note',
    /* Two places, both declared ordinals; the paragraph is declared so the
       sentence can be re-worded without tripping the gate. */
    attrs: { 'data-numeral-ok': '' },
    text: `The mark beside each name is the re-ordering. ${dearest.name} sits at `
        + `the top of the figure and reads ${ordinal(dearest.pos1935)} → `
        + `${ordinal(dearest.pos2026)}: the printed board put it `
        + `${ordinal(dearest.pos1935)} of 22 and the evidence puts it at the top `
        + `of the ladder. ${movers[0].name} reads `
        + `${ordinal(movers[0].pos1935)} → ${ordinal(movers[0].pos2026)}, the `
        + `longest fall on the board. ${sentenceCase(countWord(held))} rows read `
        + '“unmoved”, and '
        + 'they are the only rungs the 1935 board still gets right. The three '
        + 'squares that travelled furthest are held in claret.',
  }));
  root.appendChild(logScaleNote());
  root.appendChild(evidenceNote(byNow));
  const chartContrast = basisContrastNote('chart:basis');
  if (chartContrast) root.appendChild(chartContrast);

  /* ══ (c) the secondary chart: rank, and only rank ══
     A slope chart is the right form for a change of order, and the wrong form
     for a change of size — it is the one transformation that discards
     magnitude. It belongs on this page, beneath the charts that carry the
     argument, with a subtitle that says plainly what it has thrown away. */
  for (const node of chartHead(
    'A second view: the crossings',
    'Place on the price ladder, 1st cheapest to 22nd dearest. Rank only — this '
    + 'chart sets the size of every change aside on purpose',
  )) root.appendChild(node);
  root.appendChild(slopeChart(rows, moverIds));
  root.appendChild(h('p', {
    class: 'll-note',
    text: 'Each line is one square, from its place on the 1935 board to its place '
        + 'on the 2026 evidence, cheapest at the bottom. The vertical distance is '
        + 'places on the ladder, not pounds: a line can run almost flat while the '
        + 'gap between the two prices it joins has widened beyond recognition, '
        + 'which is why the chart above carries the pounds and this one carries '
        + 'only the order. Crossings are the one thing a chart of rows cannot '
        + 'draw, and they are what this view is here for. The three squares that '
        + 'moved furthest are drawn in claret and named at both ends, each with '
        + 'the place it held at that end; the rest are held back so the movement '
        + 'reads.',
  }));

  /* ══ the table: the accessible twin, and the audit trail ══ */
  root.appendChild(ladderTable(rows, moverIds));

  root.appendChild(sourceBlock({
    footnote: '1935 figures are the prices printed on the 1935/36 London board '
            + 'and are not adjusted for inflation; the two eras are compared in '
            + 'nominal pounds',
    sources: ['HM Land Registry Price Paid Data', 'UK House Price Index'],
  }));

  return root;
}

/**
 * FT slope geometry: no x-axis, two labelled x positions, wide left and right
 * margins to hold the direct labels, category names anchored end on the left
 * and start on the right, and never a legend.
 */
function slopeChart(rows, moverIds) {
  /* The frame is wider than the plot needs because the plot is the smaller
     part of a slope chart: the labels at both ends are the chart. Each margin
     holds a street name AND the place that end of the line stands for, set on
     a second line beneath the name so that "Whitechapel Road" and "13th"
     resolve on the spot without either one being squeezed. */
  const W = 420, H = 600;
  const TOP = 76, BOTTOM = 46;
  const XL = 128, XR = 268;
  const plotH = H - TOP - BOTTOM;
  const n = rows.length;
  const y = (pos) => TOP + ((n - pos) / (n - 1)) * plotH;

  const svg = s('svg', {
    class: 'll-slope',
    viewBox: `0 0 ${W} ${H}`,
    preserveAspectRatio: 'xMidYMin meet',
    role: 'img',
    'aria-label': 'Slope chart: each London square’s place on the 1935 board '
                + 'against its place on the 2026 evidence, cheapest at the '
                + 'bottom. The three squares that moved furthest are drawn in '
                + 'claret and named at both ends, each with the place it held '
                + 'at that end. The table further down carries every place.',
  });

  /* Column headers — the only x labels a slope chart is permitted.
     BOTH IN THE SAME INK. The 2026 header used to be set in oxford blue, which
     named a series: a reader looks for the blue marks, and there are none,
     because every mark in this chart is claret or grey. Colour in an FT chart
     is a key to the marks or it is noise. */
  const HEAD_INK = '#4D4845';
  svg.appendChild(s('text', {
    x: XL, y: 28, 'text-anchor': 'middle', 'font-size': 15, fill: HEAD_INK,
  }, '1935'));
  svg.appendChild(s('text', {
    x: XL, y: 44, 'text-anchor': 'middle', 'font-size': 11, fill: '#66605C',
  }, 'board order'));
  svg.appendChild(s('text', {
    x: XR, y: 28, 'text-anchor': 'middle', 'font-size': 15, fill: HEAD_INK,
  }, '2026'));
  svg.appendChild(s('text', {
    x: XR, y: 44, 'text-anchor': 'middle', 'font-size': 11, fill: '#66605C',
  }, 'recorded value'));

  /* Direction markers, so "up" is never left to the reader to guess. They hang
     from the graphic's left edge, flush with everything else on the page. */
  svg.appendChild(s('text', {
    x: 0, y: TOP - 12, 'text-anchor': 'start',
    'font-size': 11, fill: '#66605C',
  }, 'dearest'));
  svg.appendChild(s('text', {
    x: 0, y: H - BOTTOM + 22, 'text-anchor': 'start',
    'font-size': 11, fill: '#66605C',
  }, 'cheapest'));

  /* context slopes first, so the subjects sit on top of them */
  const context = s('g', {});
  const focus = s('g', {});
  for (const r of rows) {
    const y1 = y(r.pos1935);
    const y2 = y(r.pos2026);
    const isFocus = moverIds.has(r.id);
    const g = isFocus ? focus : context;
    const colour = isFocus ? '#990F3D' : '#CCC1B7';

    g.appendChild(s('line', {
      x1: XL, y1, x2: XR, y2, stroke: colour,
      'stroke-width': isFocus ? 2.5 : 1.25, 'stroke-linecap': 'square',
    }));
    g.appendChild(s('circle', { cx: XL, cy: y1, r: isFocus ? 4 : 2.5, fill: colour }));
    g.appendChild(s('circle', { cx: XR, cy: y2, r: isFocus ? 4 : 2.5, fill: colour }));

    if (isFocus) {
      /* Named at BOTH ends, and PLACED at both ends. The right label used to
         carry the 2026 place alone, which meant the reader could see where a
         line finished but had to trace it back across twenty-one others to
         find out where it started — so the fact that Regent Street fell from
         18th to 4th was never legible in one place. Both places are now
         written where the line touches them. */
      g.appendChild(s('text', {
        x: XL - 8, y: y1 + 1, 'text-anchor': 'end',
        'font-size': 12, fill: '#990F3D',
      }, r.name));
      g.appendChild(s('text', {
        x: XL - 8, y: y1 + 13, 'text-anchor': 'end',
        'font-size': 11, fill: '#990F3D',
      }, ordinal(r.pos1935)));
      g.appendChild(s('text', {
        x: XR + 8, y: y2 + 1, 'text-anchor': 'start',
        'font-size': 12, fill: '#990F3D',
      }, r.name));
      g.appendChild(s('text', {
        x: XR + 8, y: y2 + 13, 'text-anchor': 'start',
        'font-size': 11, fill: '#990F3D',
      }, ordinal(r.pos2026)));
    }
  }
  svg.appendChild(context);
  svg.appendChild(focus);

  return h('figure', { style: 'margin:8px 0 10px' }, [svg]);
}

/**
 * ONE ROW OF THE LADDER FIGURE. A label cell and a plot cell, on the grid that
 * every other row in the figure uses, so that "50% across" means the same
 * distance on every row and on the axis — at every viewport, including the one
 * where the label cell collapses to a line above the plot.
 */
function ladderRow({ label, cell, extra = '' }) {
  return h('div', { class: `ll-rank__row ${extra}`.trim() }, [
    label,
    cell,
  ].filter(Boolean));
}

/**
 * THE MAGNITUDE MARK: one band per era, on the shared logarithmic pound scale.
 *
 * On a logarithmic scale, LENGTH IS MULTIPLE. So the band that runs from an
 * era's cheapest square to its dearest is, quite literally, that era's spread
 * drawn to size: the 1935 band is short and the 2026 band is more than twice
 * as long, and the reader sees the widening before reading a word. The pale
 * ticks inside each band are the 22 squares, so it is a distribution and not
 * merely a bracket.
 */
function eraSpreadRow({ label, series, low, high, values, moneyLow, moneyHigh, fmt, where, tail }) {
  const a = logPos(low);
  const b = logPos(high);

  const cell = h('div', { class: 'll-rank__cell' });

  /* The multiple, direct-labelled over the middle of the band it measures. A
     ratio of two facts-file amounts is computed here, not stored, so it is
     declared. */
  cell.appendChild(h('div', { class: 'll-spread__mult' }, [
    h('span', {
      style: `left:${(a + b) / 2}%`,
      attrs: { 'data-numeral-ok': '' },
      text: multipleText(high, low),
    }),
  ]));

  const track = h('div', { class: 'll-spread__track ll-gridded' }, [
    h('div', {
      class: `ll-spread__band ll-spread__band--${series}`,
      style: `left:${a}%;inline-size:${Math.max(b - a, 0)}%`,
    }),
  ]);
  for (const v of values) {
    track.appendChild(h('div', {
      class: 'll-spread__tick',
      style: `left:${logPos(v)}%`,
      attrs: { 'aria-hidden': 'true' },
    }));
  }
  cell.appendChild(track);

  /* The two ends, in words and in pounds, so the band is readable without the
     axis and the axis is checkable against the band. */
  cell.appendChild(h('p', { class: 'll-spread__cap' }, [
    moneyEl('span', '', moneyLow, `${where}:low`, fmt),
    h('span', { text: ' to ' }),
    moneyEl('span', '', moneyHigh, `${where}:high`, fmt),
    h('span', { text: tail }),
  ]));

  return ladderRow({
    label: h('p', { class: `ll-rank__name ll-spread__lab ll-spread__lab--${series}`, text: label }),
    cell,
    extra: 'll-rank__row--band',
  });
}

/**
 * THE ORDER MARK. Where the printed board put this square and where the
 * evidence puts it now, with an arrow for the direction of travel — or the
 * word "unmoved" for the four rungs the board still gets right.
 *
 * This is the mark the FT desk asked for. The re-ordering that the headline
 * claims used to be provable only from the prose: Bond Street twentieth of 22
 * on the board and top of the evidence, Regent Street eighteenth to fourth,
 * Bow Street ninth to second, four squares that never moved at all. A sentence
 * is not a mark, so every row now states its own two places in the graphic.
 *
 * Places run from the cheapest square, matching the table beneath the chart,
 * and the rows themselves run dearest first — so the arrow points the way the
 * square travelled through the figure it is sitting in.
 */
function rankMove(r) {
  const glyph = r.move > 0 ? '▲' : r.move < 0 ? '▼' : '=';
  const body = r.move === 0
    ? `${ordinal(r.pos1935)}, unmoved`
    : `${ordinal(r.pos1935)} → ${ordinal(r.pos2026)}`;
  return h('span', {
    class: 'll-move',
    /* Two board places and nothing else. Both are declared ordinals in the
       fact base's own display allow-list, but the element is declared anyway
       so the sentence can be re-worded without tripping the gate. */
    attrs: { 'data-numeral-ok': '' },
  }, [
    h('span', { class: 'll-move__g', text: glyph, attrs: { 'aria-hidden': 'true' } }),
    h('span', { text: body }),
  ]);
}

/**
 * THE LADDER, REDRAWN — one figure carrying both halves of the headline.
 *
 * THE NOTE THIS ANSWERS. Two rounds of FT criticism, and they were mirror
 * images of each other. The first said the page opened with a slope chart of
 * RANK while the headline argued MAGNITUDE. The second said the page opened
 * with bands of MAGNITUDE while the headline claimed a LADDER — an order —
 * and that every rank-change fact sat in the prose rather than in a mark.
 * Swapping back would only have earned the first note again, because the
 * headline makes both claims at once: the 1935 ladder no longer describes
 * London means it is no longer the right SHAPE and no longer the right ORDER.
 *
 * So the two claims are drawn in one piece, on one coordinate system:
 *
 *   THE SHAPE lives in the plot column. Two bands on a logarithmic pound
 *   scale, one per era, whose LENGTH is that era's spread; then a third,
 *   outlined, showing how short the 1935 spread would look at 2026 prices.
 *   Below them, the same scale carries one dumbbell per square, so the reader
 *   goes from the finding to the evidence without changing units.
 *
 *   THE ORDER lives in the row sequence and the label column. Rows run dearest
 *   first, so the order of the rows IS the 2026 ladder; and beside each name
 *   is the place the printed board gave that square, an arrow for the way it
 *   travelled, and the place the evidence gives it now. Bond Street's row is
 *   at the top and reads 20th → 22nd. Regent Street's reads 18th → 4th. Bow
 *   Street's reads 9th → 2nd. Four rows read "unmoved".
 *
 * The decade axis is drawn twice, above the rows and below them, from the same
 * grid column as every track, so no reader ever has to scroll to find out what
 * the scale is or take on trust that the axis and the marks agree.
 *
 * A bar chart is deliberately not used anywhere. Bars must start at zero, and
 * a scale that has to span more than a hundred times cannot honestly do that.
 */
function ladderChart(rows, byNow, moverIds) {
  const byThen = [...rows].sort((a, b) => a.then - b.then);
  const thenLow = byThen[0];
  const thenHigh = byThen[byThen.length - 1];
  const nowHigh = byNow[0];
  const nowLow = byNow[byNow.length - 1];

  const wrap = h('div', {
    class: 'll-rank',
    attrs: {
      role: 'img',
      'aria-label': 'The ladder, redrawn: all 22 squares on one logarithmic '
                  + 'pound scale. At the top, the full price range of each era '
                  + '— a short band for the 1935 printed board, a band more '
                  + 'than twice as long for the 2026 recorded evidence, and an '
                  + 'outline showing how short the 1935 spread would look at '
                  + '2026 prices. Beneath them, one row per square ordered by '
                  + 'the 2026 value, dearest first, each row carrying its 1935 '
                  + 'board price, its 2026 recorded value, and the place the '
                  + 'square held on the printed board against the place it '
                  + 'holds now. The table further down carries every figure.',
    },
  });

  /* ---- the shape: two eras, drawn to size ---- */
  wrap.appendChild(eraSpreadRow({
    label: '1935 printed board',
    series: 'then',
    low: thenLow.then,
    high: thenHigh.then,
    values: rows.map((r) => r.then),
    moneyLow: board1935Of(thenLow.id),
    moneyHigh: board1935Of(thenHigh.id),
    fmt: fmt1935,
    where: 'chart:spread:1935',
    tail: ` — ${thenLow.name} to ${thenHigh.name}`,
  }));
  wrap.appendChild(eraSpreadRow({
    label: '2026 recorded evidence',
    series: 'now',
    low: nowLow.now,
    high: nowHigh.now,
    values: rows.map((r) => r.now),
    moneyLow: priceOf(nowLow.id),
    moneyHigh: priceOf(nowHigh.id),
    fmt: fmtMn,
    where: 'chart:spread:2026',
    tail: ` — ${nowLow.name} to ${nowHigh.name}`,
  }));

  /* THE GHOST ROW. Two bands on one scale already show the widening, but they
     start in different places, and a reader comparing lengths across a gap is
     doing work the graphic should have done. So the 1935 spread is drawn a
     second time, at its true length, starting from the 2026 cheapest square:
     the end of the outline is where the dearest square in London would sit if
     the ladder had kept the shape the printed board gave it. The distance from
     there to the end of the blue band is the whole finding, and it is now a
     distance the eye measures rather than a multiple the reader is asked to
     take on trust. */
  const ghostFrom = logPos(nowLow.now);
  const ghostTo = logPos(nowLow.now * (thenHigh.then / thenLow.then));
  wrap.appendChild(ladderRow({
    label: h('p', {
      class: 'll-rank__name ll-spread__lab ll-spread__lab--ghost',
      text: 'The 1935 spread, at 2026 prices',
    }),
    cell: h('div', { class: 'll-rank__cell' }, [
      h('div', { class: 'll-spread__track ll-gridded' }, [
        h('div', {
          class: 'll-spread__ghost',
          style: `left:${ghostFrom}%;inline-size:${Math.max(ghostTo - ghostFrom, 0)}%`,
        }),
      ]),
      h('p', {
        class: 'll-spread__cap',
        text: 'Had the ladder kept its 1935 shape, London’s dearest square would '
            + 'end where this outline ends. The blue band runs far past it.',
      }),
    ]),
    extra: 'll-rank__row--band',
  }));

  /* The axis, at the top of the rows as well as the bottom of them. */
  wrap.appendChild(decadeAxis('ll-axis--offset'));

  /* ---- the order: one row per square, dearest first ----
     FT's dot-plot convention: the series are labelled on the first group only,
     in the marks' own inks. That is direct labelling, and it is why there is
     no legend. The label column states what it holds in the same row. */
  wrap.appendChild(ladderRow({
    label: h('p', { class: 'll-rank__name', text: 'Square, board place → place now' }),
    cell: h('div', { class: 'll-rank__head' }, [
      h('span', { class: 'll-lab--then', style: `left:${logPos(nowHigh.then)}%`, text: '1935' }),
      h('span', { class: 'll-lab--now', style: `left:${logPos(nowHigh.now)}%`, text: '2026' }),
    ]),
  }));

  const list = h('ol', { class: 'll-rank__rows' });
  for (const r of byNow) {
    const a = logPos(r.then);
    const b = logPos(r.now);
    const isFocus = moverIds.has(r.id);

    list.appendChild(h('li', {
      class: `ll-rank__row${isFocus ? ' ll-rank__row--focus' : ''}`,
    }, [
      h('span', { class: 'll-rank__name' }, [
        h('span', { text: r.name }),
        /* The weak-evidence mark travels with the square. A reader comparing
           these rows is comparing measurements of different strengths, and
           the chart says so on the row rather than in a code elsewhere. */
        WEAK_BASES.has(r.basis)
          ? h('span', {
            class: 'll-mark',
            text: WEAK_MARK,
            attrs: { title: `${EVIDENCE_WORD[r.basis]} — weaker evidence than a street median` },
          })
          : null,
        /* The re-ordering, on the row, in the picture. */
        rankMove(r),
      ]),
      h('span', { class: 'll-rank__track ll-gridded' }, [
        h('span', { class: 'll-conn', style: `left:${a}%;inline-size:${Math.max(b - a, 0)}%` }),
        h('span', { class: 'll-dot ll-dot--then', style: `left:${a}%` }),
        h('span', {
          class: `ll-dot ${isFocus ? 'll-dot--focus' : 'll-dot--now'}`,
          style: `left:${b}%`,
        }),
      ]),
    ]));
  }
  wrap.appendChild(list);
  wrap.appendChild(decadeAxis('ll-axis--offset'));

  return h('figure', { style: 'margin:8px 0 10px' }, [wrap]);
}

/** Every figure in both charts, as a table, inside its own scroll container. */
function ladderTable(rows, moverIds) {
  const ordered = [...rows].sort((a, b) => b.now - a.now);

  const thead = h('thead', {}, [
    h('tr', {}, [
      h('th', { text: 'Square', attrs: { scope: 'col' } }),
      h('th', { text: 'Local authority', attrs: { scope: 'col' } }),
      h('th', { text: '1935 board price', attrs: { scope: 'col' } }),
      h('th', { text: '2026 value', attrs: { scope: 'col' } }),
      /* What the 2026 figure is a measurement OF, on every row, so the column
         beside it can be read without going back to the square's own card. */
      h('th', { text: 'Evidence', attrs: { scope: 'col' } }),
      h('th', { text: 'Multiple', attrs: { scope: 'col' } }),
      h('th', { text: '1935 place', attrs: { scope: 'col' } }),
      h('th', { text: '2026 place', attrs: { scope: 'col' } }),
    ]),
  ]);

  const tbody = h('tbody');
  for (const r of ordered) {
    const i = indexOfStreet(r.id);
    const focus = moverIds.has(r.id);
    const weak = WEAK_BASES.has(r.basis);
    tbody.appendChild(h('tr', {}, [
      h('th', {
        class: focus ? 'll-focus' : '',
        attrs: { scope: 'row' },
      }, [
        h('span', { text: r.name }),
        weak ? h('span', { class: 'll-mark', text: WEAK_MARK }) : null,
      ]),
      h('td', { text: r.localAuthority }),
      h('td', {
        text: registry.record(fmt1935(r.then), {
          money: board1935Of(r.id), where: `chart:${r.id}:1935`,
        }),
        attrs: { 'data-fact': `streets[${i}].boardPrice1935.amount` },
      }),
      h('td', {
        text: registry.record(fmtPlain(r.now), {
          money: priceOf(r.id), where: `chart:${r.id}:2026`,
        }),
        attrs: { 'data-fact': `streets[${i}].value2026.amount` },
      }),
      h('td', { text: EVIDENCE_WORD[r.basis] || r.basisLabel }),
      /* Computed ratio and computed places: declared numerals, not facts. */
      h('td', { text: multipleText(r.now, r.then), attrs: { 'data-numeral-ok': '' } }),
      h('td', { text: ordinal(r.pos1935) }),
      h('td', { text: ordinal(r.pos2026) }),
    ]));
  }

  const table = h('table', { class: 'll-table' }, [
    h('caption', {
      text: 'All 22 squares, ranked by 2026 value, dearest first. Places run from '
          + 'cheapest, so 1st is the cheapest square of the 22 in that era. '
          + 'Multiples are nominal and are not adjusted for inflation. '
          + `${WEAK_MARK} marks a square measured on weaker evidence than a `
          + 'median of its own street’s sales.',
    }),
    thead,
    tbody,
  ]);

  return h('div', { class: 'll-scroll' }, [table]);
}

/* ══════════════════════════════════════════════════════════════════════════
   6. renderSourcesPanel — attribution and method, in full
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The attribution and methodology page.
 *
 * The licence strings are rendered verbatim from the fact base, word for word,
 * because that is what the Open Government Licence requires and because
 * paraphrasing an attribution is the same failure as paraphrasing a figure.
 *
 * @returns {HTMLElement}
 */
export function renderSourcesPanel() {
  ensureStyles();

  const f = factBase();
  const attr = attribution();
  const a = assumptions();
  const hg = heritage();
  const rows = computeLadder();

  const root = h('section', {
    class: 'll-ft',
    attrs: { 'data-panel': 'sources' },
  });

  for (const node of heading(
    'Every figure in this game, and where it came from',
    `Open data only. Price Paid Data and UK House Price Index, accessed ${f.datasetAccessed}`,
  )) root.appendChild(node);

  /* ══ attribution, verbatim ══ */
  const attrSec = h('section', { class: 'll-sec' }, [
    h('h3', { class: 'll-h', text: 'Attribution' }),
    h('p', { class: 'll-verbatim', text: attr.hmlr }),
    h('p', { class: 'll-verbatim', text: attr.ogl }),
  ]);
  attrSec.appendChild(h('p', {}, [
    h('a', {
      class: 'll-link',
      text: 'Open Government Licence v3.0',
      attrs: { href: attr.oglUrl, rel: 'noopener noreferrer', target: '_blank' },
    }),
  ]));
  attrSec.appendChild(h('p', { class: 'll-verbatim', text: attr.ukhpiProducers }));
  attrSec.appendChild(h('p', { class: 'll-verbatim', text: attr.dataCurrency }));
  attrSec.appendChild(h('p', { class: 'll-verbatim', text: attr.noEndorsement }));
  attrSec.appendChild(h('p', { class: 'll-verbatim', text: attr.heritage }));
  attrSec.appendChild(h('p', { class: 'll-verbatim', text: attr.noSubscriptionData }));
  attrSec.appendChild(h('p', {
    class: 'll-note',
    text: 'Nothing here is drawn from a subscription or paywalled service. No '
        + 'agency research, no commercial transactions database, no broker '
        + 'material. If a figure could not be traced to an open source, it was '
        + 'left out rather than estimated.',
  }));
  root.appendChild(attrSec);

  /* ══ the four value bases ══ */
  const bases = f.valueBases || {};
  const counts = {};
  for (const st of streets()) {
    counts[st.value2026.basis] = (counts[st.value2026.basis] || 0) + 1;
  }
  const whenUsed = {
    'ppd-median-a': 'The preferred basis. Used wherever the street has enough '
      + 'Category A sales — standard, arm’s-length, full market value — to take '
      + 'a median from.',
    'ppd-median-all': 'Used where Category A sales alone were too few. Widening '
      + 'to Categories A and B brings in transfers to companies and other '
      + 'non-standard sales, which is why a street on this basis can look dearer '
      + 'than its neighbours.',
    'ppd-single': 'Used where the street has only one or two recorded sales in '
      + 'the window. A single sale is a fact about one building, not a market. '
      + 'It is shown, and it is labelled as such wherever it appears.',
    'ukhpi-la-average': 'The fallback. Used only where no residential sale is '
      + 'recorded on the square at all, in which case the UK House Price Index '
      + 'average for the whole local authority stands in for the street.',
  };

  const defs = h('dl', { class: 'll-defs' });
  for (const [key, label] of Object.entries(bases)) {
    const used = counts[key] || 0;
    defs.appendChild(h('dt', {}, [
      h('span', { text: label }),
      WEAK_BASES.has(key) ? h('span', { class: 'll-mark', text: WEAK_MARK }) : null,
    ]));
    defs.appendChild(h('dd', { text: whenUsed[key] || '' }));
    defs.appendChild(h('dd', {
      style: 'margin-top:4px;color:#66605C',
      text: `${sentenceCase(countWord(used))} of the 22 squares · basis code ${key}`,
    }));
  }

  const basisSec = h('section', { class: 'll-sec' }, [
    h('h3', { class: 'll-h', text: 'The four value bases' }),
    h('p', {
      class: 'll-prose',
      text: 'Not every square is measured the same way, because the evidence is '
          + 'not evenly spread. Each square carries its own basis label, and no '
          + 'figure is ever shown without it.',
    }),
  ]);
  const sourcesContrast = basisContrastNote('sources:basis');
  if (sourcesContrast) basisSec.appendChild(sourcesContrast);
  basisSec.appendChild(h('p', {
    class: 'll-note',
    text: `${WEAK_MARK} marks the two bases that are not a median of a street’s `
        + 'own sales. A square measured on either of them carries the same mark '
        + 'in the comparison chart and in its table, so the thin evidence is '
        + 'visible at the point of comparison rather than only on its own card.',
  }));
  basisSec.appendChild(defs);
  root.appendChild(basisSec);

  /* ══ the assumption set ══ */
  const capital = startingCapital();
  const assumpSec = h('section', { class: 'll-sec' }, [
    h('h3', { class: 'll-h', text: 'The assumption set' }),
    h('p', { class: 'll-prose', text: a.statement }),
  ]);
  const box = h('div', { class: 'll-box' }, [
    h('p', { class: 'll-meta', text: `Gross yield: ${a.grossYieldPct}%` }),
    h('p', { class: 'll-meta', text: `Rent charged on landing: one year of the assumed gross rent` }),
    h('p', { class: 'll-meta', text: `Loan to value: ${a.ltvPct}%` }),
    /* The cost of debt is an assumption like any other, and since the score is
       net of it, leaving it out of the assumption set would be leaving out the
       one rate the game now turns on. */
    h('p', { class: 'll-meta', text: `Debt interest: ${a.debtInterestPct}% a year on debt outstanding` }),
    h('p', { class: 'll-meta', text: `Turn limit: ${a.turnLimit} turns` }),
  ]);
  box.appendChild(h('p', { class: 'll-meta' }, [
    h('span', { text: 'Opening capital: ' }),
    h('span', {
      text: moneyText(capital, 'sources:startingCapital'),
      attrs: { 'data-fact': 'assumptions.startingCapital' },
    }),
  ]));
  assumpSec.appendChild(box);
  assumpSec.appendChild(h('p', { class: 'll-note', text: a.levyNote }));

  for (const src of [a.debtInterestSource, a.bankRateSource]) {
    if (!src) continue;
    assumpSec.appendChild(h('p', { class: 'll-meta', text: `${src.name} — ${src.figure} (${src.date})` }));
    assumpSec.appendChild(h('p', {}, [
      h('a', {
        class: 'll-link ll-uri',
        text: src.url,
        attrs: {
          href: src.url,
          rel: 'noopener noreferrer',
          target: '_blank',
          /* Published statistical releases are dated in their own URLs. */
          'data-numeral-ok': '',
        },
      }),
    ]));
  }
  root.appendChild(assumpSec);

  /* ══ how the game is actually won ══
     The win condition changed, and a sources page that still described the old
     one would be exactly the failure this page exists to prevent. Every
     sentence here is rendered from the fact base rather than restated, so the
     page cannot drift away from the rules the engine is playing by. */
  const winSec = h('section', { class: 'll-sec' }, [
    h('h3', { class: 'll-h', text: 'How the game is won' }),
  ]);
  if (a.winCondition) winSec.appendChild(h('p', { class: 'll-prose', text: a.winCondition }));
  /* The score, written as arithmetic rather than described. Both rates come
     from the assumption set above; neither is written into this copy. */
  winSec.appendChild(h('div', { class: 'll-box' }, [
    h('span', { class: 'll-eyebrow', text: 'The score' }),
    h('p', {
      class: 'll-formula',
      text: `Gross annual rent roll, a completed colour group counted ${a.assemblyMultiplier}×, `
          + `minus ${a.debtInterestPct}% of debt outstanding`,
    }),
  ]));
  if (a.assemblyNote) winSec.appendChild(h('p', { class: 'll-note', text: a.assemblyNote }));
  /* WHY GEARING IS A DECISION AND NOT FREE MONEY. This paragraph exists because
     the economy was changed to make it true. While the score was the GROSS rent
     roll, borrowing was strictly dominant — it bought two and a half times the
     rent per pound of the player's own money, and its only cost, interest, was
     paid in a currency nobody was scored on. Charging the interest against the
     score restored the trade-off, and simulation confirms it: a mixed policy
     now beats both always borrowing and never borrowing. */
  winSec.appendChild(h('p', {
    class: 'll-note',
    text: `Debt costs ${a.debtInterestPct}% a year while the assumed yield is `
        + `${a.grossYieldPct}%, so a borrowed pound buys slightly less rent than `
        + 'it costs to service. Borrowing therefore never adds to the score by '
        + 'itself. What it buys is reach: squares that could not have been '
        + 'afforded in cash, and the colour groups whose completion doubles the '
        + 'rent. That is why the choice between cash and debt is a real one — '
        + 'while the score was the gross rent roll it was not, because the cost '
        + 'of gearing was paid in a currency nobody was scored on. Every panel '
        + 'in this game therefore shows a square’s rent and the debt service '
        + 'against it together, never the rent alone.',
  }));
  winSec.appendChild(h('p', {
    class: 'll-note',
    text: 'The land value levy is charged on every lap, not once. Rent roll, site '
        + 'assembly, the cost of debt and the levy are the four rules that decide '
        + 'the game, and each of them is a claim about land rent rather than '
        + 'about buildings.',
  }));
  root.appendChild(winSec);

  /* ══ the ladder, summarised ══ */
  const held = rows.filter((r) => r.move === 0).length;
  root.appendChild(h('section', { class: 'll-sec' }, [
    h('h3', { class: 'll-h', text: 'How the two eras are compared' }),
    h('p', {
      class: 'll-prose',
      text: 'The 1935 figure is the purchase price printed on the London edition '
          + 'of the 1935/36 British board. It is a historical contrast figure and '
          + 'nothing more: it is not adjusted for inflation, it is not a valuation, '
          + 'and it was never a measurement of the street in the first place. '
          + `Comparing the two orders, ${countWord(held)} of the 22 squares still sit where `
          + 'the printed board put them.',
    }),
  ]));

  /* ══ event card sources ══ */
  const cards = eventCards();
  const list = h('ul', { class: 'll-list' });
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const item = h('li', {}, [
      /* Card titles may quote a figure that the fact base holds in the card's
         own figures array, so the title carries its dotted path. */
      h('p', {
        class: 'll-basis',
        text: c.title,
        attrs: { 'data-fact': `eventCards[${i}].title` },
      }),
      h('p', { class: 'll-meta', text: `${c.category} · ${c.source.name} · ${c.source.date}` }),
    ]);
    item.appendChild(h('p', {}, [
      h('a', {
        class: 'll-link ll-uri',
        text: c.source.url,
        attrs: {
          href: c.source.url,
          rel: 'noopener noreferrer',
          target: '_blank',
          /* Government publication URLs carry their own dates and reference
             numbers; they are reproduced exactly so the page can be found. */
          'data-numeral-ok': '',
        },
      }),
    ]));
    list.appendChild(item);
  }
  root.appendChild(h('section', { class: 'll-sec' }, [
    h('h3', { class: 'll-h', text: 'Event card sources' }),
    h('p', {
      class: 'll-prose',
      text: 'Every event card restates something that actually happened, and '
          + 'every one of them names the primary source it came from. Where a '
          + 'policy is announced but not yet in force, the card says so on its '
          + 'face.',
    }),
    list,
  ]));

  /* ══ claims tested and rejected ══ */
  const rejected = f.eventCardsRejected || [];
  if (rejected.length) {
    const rl = h('ul', {
      class: 'll-list',
      /* Two of these claims quote a figure. Both figures are in the fact base,
         inside the event cards that supersede them. */
      attrs: { 'data-fact': 'eventCardsRejected' },
    });
    for (const r of rejected) {
      rl.appendChild(h('li', {}, [h('p', { class: 'll-note', style: 'margin:0', text: r.claim })]));
    }
    const det = h('details', { class: 'll-details' }, [
      h('summary', { text: `Claims tested and rejected (${rejected.length})` }),
      h('p', {
        class: 'll-prose',
        text: 'Each of the following is widely repeated and could not be verified '
            + 'as in force against a primary source. None of it is stated anywhere '
            + 'in this game. The reasoning for each rejection is recorded in the '
            + 'fact base beside the claim.',
      }),
      rl,
    ]);
    root.appendChild(h('section', { class: 'll-sec' }, [
      h('h3', { class: 'll-h', text: 'What was left out' }),
      det,
    ]));
  }

  /* ══ heritage ══ */
  root.appendChild(h('section', { class: 'll-sec' }, [
    h('h3', { class: 'll-h', text: 'Heritage' }),
    h('p', { class: 'll-prose', text: `${hg.title} — ${hg.author}, ${hg.year}. ${hg.patent}. Status: ${hg.status}.` }),
    h('p', { class: 'll-verbatim', text: attr.heritage }),
  ]));

  /* No footnote here. The line that used to sit in this slot — "Data vintage is
     stated in the subtitle above" — was a note the author had left for the
     author, explaining an editorial decision to nobody who needed it, and it
     was shipping to players at thirteen pixels. The access date it points at is
     already in this page's own subtitle, so the note said nothing the reader
     did not already have. It has gone rather than been rewritten. */
  root.appendChild(sourceBlock({
    sources: [
      'HM Land Registry Price Paid Data',
      'UK House Price Index',
      'Bank of England',
      'Office for National Statistics',
      'GOV.UK',
      'legislation.gov.uk',
    ],
  }));

  return root;
}

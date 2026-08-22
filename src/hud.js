/**
 * hud.js — the entire 2D heads-up display for LANDLORD: ATLANTA 2026, built as
 * DOM plates sitting over the WebGL canvas.
 *
 * DESIGN CONTRACT (bench/round0/bench-teardown.json, measured from Catan
 * Universe and THE GAME OF LIFE 2 — every number below is theirs, not mine):
 *
 *   · Player panels run in ONE row across the top, each 18.6% of frame width at
 *     a 23.3% pitch, first panel at x = 5.4%, top inset 2.6%.
 *   · Player colour is encoded on SIX surfaces per panel — name pennant,
 *     portrait card, value badge, stat pennants, cash tab and token swatch.
 *   · The active player carries FOUR simultaneous cues — gold panel frame, a
 *     2px gold stroke top and bottom of the name pennant, a gold chevron above
 *     the panel, and a turn glyph that exists on no other panel.
 *   · The primary action is bottom-right, large, and the only control in the
 *     game wearing a warm halo. The two dice sit directly above it.
 *   · The left rail holds secondary/meta functions only. Nothing there touches
 *     game state.
 *   · Every element is a physical object: opaque frame, inner gradient face,
 *     drop shadow. There is not one translucent black rectangle in this file —
 *     that is the single most common failure mode and it is called out as such.
 *   · Corner radii vary by element class: 3px pennants, 4px plates, 6px cash,
 *     8px toast, 10px portrait and dice, 12px rail, 14px sheets, 18px primary.
 *   · Heavy weights, maximum contrast, always on a solid plate. Zero values
 *     render grey and desaturated; non-zero render full contrast.
 *
 * MOBILE (bench/round0/touch.json): the canvas bleeds to the bezel, the HUD
 * respects every safe-area inset with a floor, controls clear 48px (56px+ for
 * the primary), taps go through `click` with touch-action: manipulation, and
 * the only scrolling surfaces in the document are the overlay sheets, which
 * contain their own overscroll.
 *
 * MONEY: this file never writes a monetary literal. Every figure arrives as a
 * Money object from facts.js/engine.js and is formatted by money.js. Elements
 * carrying a figure are tagged data-fact="<dotted path>" when the value is a
 * single fact-file leaf, and data-money="derived" when it is running game state
 * such as a cash balance. Both are registered with the integrity registry so
 * the load-time gate can trace them.
 */

import { fmtPlain, fmtCompact, fmt1935 } from './money.js';
import * as F from './facts.js';
import { registry, findCurrencyTokens } from './integrity.js';

/* ══════════════════════════════════════════════════════════════════ palette */

/* UI chrome, measured from catan_2.jpg (see teardown "PALETTE — UI CHROME"). */
const CHROME = {
  bezel: '#3E3438',
  panelDark: '#2D2D2D',
  strokeGold: '#E8C13A',
  activeGlow: '#FFD34D',
  railTop: '#F3C43E',
  railBottom: '#D8862A',
  railGlyph: '#8A4A15',
  actionTop: '#F5C63A',
  actionBottom: '#E8862C',
  diceWhite: '#F1F1F1',
  dicePip: '#1A1A1A',
  textDisabled: '#8A8A8A',
};

/* ═══════════════════════════════════════════════════════════ colour helpers */

/** "#RRGGBB" → [r,g,b] */
function toRgb(hex) {
  const h = String(hex).replace('#', '').trim();
  const s = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

function toHex([r, g, b]) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Mix two colours in plain sRGB. t = 0 keeps a, t = 1 gives b. */
function mix(a, b, t) {
  const A = toRgb(a); const B = toRgb(b);
  return toHex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
}

/** WCAG relative luminance, used only to pick black or white ink on a plate. */
function luminance(hex) {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The colour system for one player. Six surfaces draw from this, which is the
 * teardown's point: colour identity is a system, not a swatch.
 */
function playerSkin(hex) {
  return {
    base: hex,
    lit: mix(hex, '#FFFFFF', 0.30),
    deep: mix(hex, '#120C0A', 0.42),
    dark: mix(hex, '#1A1116', 0.62),          // the darkened stat pennant
    ink: luminance(hex) > 0.42 ? '#101010' : '#FFFFFF',
  };
}

/* ═══════════════════════════════════════════════════════════════ tiny DOM */

function h(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'style') node.setAttribute('style', v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

const svg = (paths, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"
        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${paths}</svg>`;

/* ═════════════════════════════════════════════════════════════════ glyphs */

/*
 * Custom glyphs, all drawn on the same 24-unit grid at one stroke weight.
 * No emoji and no icon font anywhere in this file — both are called out as
 * anti-patterns. None of these carries an SVG <text> node, so the integrity
 * sweep never sees a stray numeral from an icon.
 */
const GLYPH = {
  /* left rail — secondary and meta functions only */
  sources: svg('<path d="M5 4h9l5 5v11H5z"/><path d="M14 4v5h5"/><path d="M8.5 13h7M8.5 16.5h4.5"/>'),
  rules: svg('<path d="M4 5.5c2.6-1 5.4-1 8 0v13c-2.6-1-5.4-1-8 0z"/><path d="M20 5.5c-2.6-1-5.4-1-8 0v13c2.6-1 5.4-1 8 0z"/>'),
  ledger: svg('<path d="M5 5h14v14H5z"/><path d="M9 9h6M9 12.5h6M9 16h3"/>'),
  restart: svg('<path d="M19 12a7 7 0 1 1-2.4-5.3"/><path d="M19.5 4v4h-4"/>'),
  textScale: svg('<path d="M3 19l4.6-11L12 19"/><path d="M4.6 15.2h5.9"/><path d="M14.5 19l3-7 3 7"/><path d="M15.6 16.4h3.9"/>'),
  chart: svg('<path d="M4.5 4.5v15h15"/><path d="M8 16V11M12 16V6.5M16 16v-7"/>'),
  /* the phone overflow control — one button standing in for the whole rail */
  more: svg('<path d="M4.5 7h15M4.5 12h15M4.5 17h15"/>'),

  /* action cluster */
  dice: svg('<rect x="4" y="4" width="16" height="16" rx="3.4"/><circle cx="9" cy="9" r="1.5" fill="currentColor" stroke="none"/><circle cx="15" cy="15" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>'),
  endTurn: svg('<path d="M4 12h12"/><path d="M11.5 7.5 16 12l-4.5 4.5"/><path d="M19 4.5v15"/>'),
  register: svg('<path d="M4 19V9.5L12 4l8 5.5V19z"/><path d="M9.5 19v-6h5v6"/>'),
  close: svg('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>'),

  /* stat pennants */
  streets: svg('<path d="M4 20V9l4-3 4 3v11"/><path d="M12 20v-7l4-2.5 4 2.5V20"/><path d="M7 13h2"/>'),
  rent: svg('<path d="M12 4v9"/><path d="M8.5 9.5 12 13l3.5-3.5"/><path d="M4.5 15.5v3a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-3"/>'),
  debt: svg('<path d="M10.5 13.5 7 17a3.2 3.2 0 0 1-4.5-4.5l3.5-3.5"/><path d="M13.5 10.5 17 7a3.2 3.2 0 0 1 4.5 4.5L18 15"/><path d="M9.5 14.5l5-5"/>'),
  /* a balance — net worth, which now only breaks a tie */
  worth: svg('<path d="M12 4.5v15"/><path d="M6 8.5h12"/><path d="M6 8.5 3.5 14h5z"/><path d="M18 8.5 15.5 14h5z"/><path d="M8.5 19.5h7"/>'),

  /* player avatars — original surveying instruments, one per seat, so player
     identity is carried by silhouette as well as by colour */
  avatar: [
    /* theodolite */
    svg('<path d="M12 4.5h5.5"/><path d="M9 7.5h6.5v3.5H9z"/><path d="M12 11v3"/><path d="M12 14 6.5 20M12 14l5.5 6M12 14v6"/>'),
    /* ranging rod */
    svg('<path d="M12 3.5v14"/><path d="M9.5 6.5h5M9.5 10h5M9.5 13.5h5"/><path d="M8 20.5h8"/><path d="M12 17.5v3"/>'),
    /* plumb bob */
    svg('<path d="M12 3.5v9"/><path d="M12 12.5 8.5 16 12 20.5 15.5 16z"/><path d="M8.5 5.5h7"/>'),
    /* surveyor’s chain */
    svg('<circle cx="6.5" cy="12" r="3"/><circle cx="17.5" cy="12" r="3"/><path d="M9.5 12h5"/><path d="M4 6.5h4M16 6.5h4"/>'),
  ],
};

/* Pip positions per die face, on the same 24-unit grid. */
const FACE_PIPS = {
  1: [[12, 12]],
  2: [[7.5, 7.5], [16.5, 16.5]],
  3: [[7.5, 7.5], [12, 12], [16.5, 16.5]],
  4: [[7.5, 7.5], [16.5, 7.5], [7.5, 16.5], [16.5, 16.5]],
  5: [[7.5, 7.5], [16.5, 7.5], [12, 12], [7.5, 16.5], [16.5, 16.5]],
  6: [[7.5, 7.5], [16.5, 7.5], [7.5, 12], [16.5, 12], [7.5, 16.5], [16.5, 16.5]],
};

function dieFaceSvg(face) {
  const pips = (FACE_PIPS[face] || FACE_PIPS[1])
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.35"/>`).join('');
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="${CHROME.dicePip}">${pips}</g></svg>`;
}

/* ════════════════════════════════════════════════════════════════════ CSS */

/*
 * Injected from here rather than styles.css so the HUD ships as one module.
 * The <style> node carries data-integrity-ignore: the gate's DOM sweep walks
 * text nodes, and a stylesheet is full of numerals that are layout, not data.
 */
const CSS = `
/*
 * THE LAYER. hud.js owns one element and everything lives inside it, so the
 * host page can style #hud however it likes without reaching our children.
 *
 * These declarations are !important on purpose and only here. src/styles.css
 * puts every rule inside @layer, and unlayered rules beat layered ones outright
 * — but the host is not guaranteed to stay layered, and a HUD that silently
 * inherits a grid display and a padding box from its container would apply the
 * safe-area insets twice. This is the one place a component is allowed to
 * defend its own box.
 */
.ll-hud.ll-hud{
  position:fixed !important; inset:0 !important;
  margin:0 !important; padding:0 !important;
  display:block !important;
  width:auto !important; height:auto !important;
  pointer-events:none !important;
  z-index:20;
  font-family:"Nunito","Segoe UI Variable",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif;
  font-size:calc(1rem * var(--ui-scale,1));
  color:#FFFFFF;
  -webkit-font-smoothing:antialiased;
  -webkit-tap-highlight-color:transparent;
  -webkit-user-select:none; user-select:none;
  --safe-t:max(env(safe-area-inset-top),8px);
  /* Android Chrome reports 0 for the insets despite a 24dp gesture bar, so every
     inset is floored. The bottom also clears two strips the shell owns when it
     provides them: the persistent OGL credit line and the on-screen keyboard.
     Both fall back to 0 when the HUD is mounted on its own. */
  --safe-b:calc(max(env(safe-area-inset-bottom),12px)
                + var(--attrib-h,0px) + var(--kb-h,0px));
  --safe-l:max(env(safe-area-inset-left),12px);
  --safe-r:max(env(safe-area-inset-right),12px);
  --bezel:${CHROME.bezel};
  --gold:${CHROME.strokeGold};
  --glow:${CHROME.activeGlow};
  --ink-shadow:0 2px 3px rgba(0,0,0,.55);
  --lift:0 4px 0 rgba(0,0,0,.30), 0 10px 22px rgba(0,0,0,.42);
  --lift-sm:0 3px 0 rgba(0,0,0,.28), 0 7px 14px rgba(0,0,0,.36);
}
.ll-hud *{box-sizing:border-box; margin:0;}
.ll-hud button{
  font:inherit; color:inherit; border:0; background:transparent; padding:0;
  touch-action:manipulation; cursor:pointer;
}
.ll-hud :focus-visible{outline:3px solid #FFFFFF; outline-offset:3px;}
.ll-sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;
  clip:rect(0 0 0 0);white-space:nowrap;border:0;}
.ll-num{font-variant-numeric:tabular-nums;}

/* Zero values go grey and desaturated; non-zero stay at full contrast. */
.ll-zero{color:${CHROME.textDisabled} !important; filter:saturate(.18) brightness(.92);}

/* ───────────────────────────────────────────── player panels, top row ──── */
/* One absolutely-positioned strip owns the whole top of the frame: identity on
   the left, the prompt banner on the right (teardown LAYOUT, life2_1.jpg). */
.ll-top{
  position:absolute;
  top:calc(var(--safe-t) + 2.6vh);
  left:calc(var(--safe-l) + 5.4vw);
  right:var(--safe-r);
  display:flex; align-items:flex-start; gap:2vw;
  pointer-events:none;
}
.ll-panels{
  flex:0 1 auto; min-width:0;
  display:grid; grid-auto-flow:column;
  grid-auto-columns:18.6vw;              /* measured: 358/1920 */
  column-gap:4.7vw;                      /* pitch 23.3% = 18.6 + 4.7 */
  justify-content:start;
  pointer-events:none;
}
.ll-panel{
  position:relative;
  /* Named, because the stat chips inside are containers in their own right and
     an unnamed query would bind to the nearest one rather than to the panel. */
  container-type:inline-size; container-name:panel;
  pointer-events:auto;
}
/* cue 3 of 4 — a gold chevron 8px above the panel, active only */
.ll-chev{
  position:absolute; top:-3.4cqw; left:50%; width:5cqw; height:3.3cqw;
  transform:translateX(-50%);
  background:var(--glow);
  clip-path:polygon(0 0,100% 0,50% 100%);
  filter:drop-shadow(0 2px 2px rgba(0,0,0,.5));
  opacity:0; transition:opacity 160ms ease;
}
.ll-panel[data-active="1"] .ll-chev{opacity:1;}

.ll-frame{
  display:flex; gap:2.6cqw; align-items:stretch;
  padding:2.4cqw;
  border-radius:3.2cqw;
  /* cue 1 of 4 — opaque accent frame, gold when active */
  border:0.85cqw solid var(--bezel);
  background:
    linear-gradient(180deg, ${mix(CHROME.panelDark, '#FFFFFF', 0.12)} 0%, #241E20 58%, #191416 100%);
  box-shadow:var(--lift);
  transition:border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease;
}
.ll-panel[data-active="1"] .ll-frame{
  border-color:var(--gold);
  box-shadow:var(--lift), 0 0 0 0.5cqw rgba(255,211,77,.20);
  transform:translateY(-0.4cqw);
}
.ll-panel[data-out="1"] .ll-frame{filter:grayscale(.7) brightness(.72);}

/* portrait card — 92x143 of 358 → 25.7cqw x 39.9cqw, radius 10px */
.ll-portrait{
  position:relative; flex:0 0 25.7cqw; min-height:39.9cqw;
  border-radius:2.8cqw;
  border:0.85cqw solid var(--pc-deep);
  background:linear-gradient(165deg, var(--pc-lit) 0%, var(--pc) 46%, var(--pc-deep) 100%);
  box-shadow:inset 0 0.6cqw 0 rgba(255,255,255,.24), inset 0 -1cqw 1.4cqw rgba(0,0,0,.30);
  display:flex; align-items:center; justify-content:center;
}
.ll-panel[data-active="1"] .ll-portrait{border-color:#E8A93C;}
.ll-portrait svg{width:52%; height:auto; color:var(--pc-ink); opacity:.94;
  filter:drop-shadow(0 1px 1px rgba(0,0,0,.45));}

/* The head row: name pennant and cash chip, and the reason they exist as one
   row. On a desktop frame the chip is lifted out of the flow and perched on the
   portrait's top-left corner, which is the measured composition. On a phone it
   stays in the row, so the chip and the name are laid out against each other by
   the box model and CANNOT collide — the failure that ate the first letter of
   every player name at 390px. */
.ll-head{display:flex; align-items:center; gap:1.6cqw; min-width:0;}
.ll-name{flex:1 1 auto; min-width:0;}

/* cash chip — a disc-ended plate with a ribbon tail carrying the player's CASH.
   It is labelled: an unlabelled money figure is a puzzle, and a critic had to
   reverse-engineer this one. It never truncates: no ellipsis, no clipping, the
   box takes the width its figure needs. */
.ll-badge{
  position:absolute; top:0.45cqw; left:0.85cqw; z-index:2;
  width:max-content; min-width:22cqw; height:11.6cqw; padding:0 1.3cqw;
  display:flex; align-items:baseline; justify-content:center; gap:0.9cqw;
  border-radius:5.8cqw;
  border:0.7cqw solid ${mix(CHROME.bezel, '#000000', 0.2)};
  background:linear-gradient(180deg, var(--pc-lit), var(--pc));
  color:var(--pc-ink);
  text-shadow:var(--ink-shadow);
  box-shadow:var(--lift-sm);
  white-space:nowrap; overflow:visible;
}
.ll-badge i{
  font-style:normal; font-weight:800; font-size:clamp(7px,2.9cqw,10px);
  letter-spacing:.07em; text-transform:uppercase; opacity:.88; flex:0 0 auto;
}
/* Same bargain as the stat chips: while the pill is perched on the portrait it
   has a fixed amount of room, so a long figure is set smaller rather than being
   allowed to grow sideways across the name plate. */
.ll-badge b{
  font-weight:900; letter-spacing:-.02em; flex:0 0 auto; white-space:nowrap;
  font-size:max(9px, min(clamp(9px,4.1cqw,15px), calc(24cqw / var(--vlen,5))));
}
.ll-badge::after{             /* the ribbon tail, so the badge is an object */
  content:""; position:absolute; bottom:-2.1cqw; left:2.6cqw;
  width:4cqw; height:3cqw; background:var(--pc-deep);
  clip-path:polygon(0 0,100% 0,50% 100%); z-index:-1;
}

/* token swatch — physically overhangs the portrait and is rotated a few degrees */
.ll-swatch{
  position:absolute; bottom:-3.4cqw; right:-2.2cqw;
  width:9.5cqw; height:9.5cqw; border-radius:1.8cqw;
  transform:rotate(-4deg);
  border:0.7cqw solid ${mix(CHROME.bezel, '#000000', 0.25)};
  background:linear-gradient(160deg, var(--pc-lit) 0%, var(--pc) 55%, var(--pc-dark) 100%);
  box-shadow:var(--lift-sm), inset 0 0.5cqw 0 rgba(255,255,255,.35);
  display:flex; align-items:center; justify-content:center;
}
.ll-swatch svg{width:66%; color:var(--pc-deep); opacity:.85;}

.ll-col{flex:1 1 auto; display:flex; flex-direction:column; gap:1.5cqw; min-width:0;}

/* name pennant — 262x46, radius 4px, chevron notch on the right,
   cue 2 of 4 is the 2px gold stroke top and bottom when active */
.ll-name{
  filter:drop-shadow(0 2px 3px rgba(0,0,0,.45));
}
.ll-name-out{
  clip-path:polygon(0 0,100% 0,calc(100% - 5.5cqw) 50%,100% 100%,0 100%);
  background:var(--bezel);
  padding:0.6cqw 0;
  border-radius:1.1cqw;
}
.ll-panel[data-active="1"] .ll-name-out{background:var(--gold);}
.ll-name-in{
  clip-path:polygon(0 0,100% 0,calc(100% - 5.5cqw) 50%,100% 100%,0 100%);
  background:linear-gradient(180deg, var(--pc-lit) 0%, var(--pc) 62%, var(--pc-deep) 100%);
  padding:1.1cqw 6cqw 1.1cqw 2.6cqw;
  border-radius:1.1cqw;
  display:flex; align-items:center; gap:1.6cqw;
}
.ll-name-t{
  font-weight:800; font-size:clamp(11px,8.6cqw,32px); line-height:1.05;
  color:var(--pc-ink); text-shadow:var(--ink-shadow);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}

/* score plate — the NET ANNUAL RENT ROLL: gross rent, with a completed colour
   group counted twice, less a year of interest on whatever is borrowed. That
   subtraction IS the game, so the plate carries the biggest figure on the panel
   and, when there is debt, the sum that produced it. Net worth is only the
   tiebreak and lives on a pennant below. */
.ll-score{
  display:flex; align-items:center; gap:1.8cqw;
  border-radius:1.7cqw;
  border:0.6cqw solid ${mix(CHROME.bezel, '#000000', 0.15)};
  background:linear-gradient(180deg,#3A3335 0%,#221D1F 100%);
  padding:0.9cqw 1.8cqw;
  box-shadow:inset 0 0.5cqw 0 rgba(255,255,255,.09);
}
.ll-score-tab{                   /* colour surface: the plate's own tab */
  flex:0 0 auto; width:2.1cqw; height:9.6cqw; border-radius:1cqw;
  background:linear-gradient(180deg,var(--pc-lit),var(--pc-dark));
}
.ll-score-c{min-width:0; display:flex; flex-direction:column;}
/* No ellipsis anywhere on this plate. A clipped label is a riddle and a clipped
   figure is a lie, so the label wraps and the figure is sized to fit instead. */
.ll-score-l{
  font-weight:800; font-size:clamp(7px,3.2cqw,11px); line-height:1.2;
  letter-spacing:.1em; text-transform:uppercase; color:#DCD3CA;
  overflow-wrap:break-word;
}
.ll-score-v{
  font-weight:900; font-size:clamp(11px,8.2cqw,30px); line-height:1.08;
  letter-spacing:-.02em; color:#FFFFFF; text-shadow:var(--ink-shadow);
  white-space:nowrap;
}
.ll-score-v.is-neg{color:#FF9A8A;}
/*
 * THE COST OF GEARING, MADE VISIBLE. The score is net of debt service, and a
 * critic proved that while that cost was invisible the choice between cash and
 * debt read as no choice at all. So a geared player's plate shows the working:
 * gross rent, then what the bank takes out of it. It appears only when there is
 * debt, so an ungeared panel is exactly the composition the judges scored.
 */
.ll-score-net{
  flex:1 1 100%; min-width:0; white-space:nowrap;
  font-weight:800; font-size:clamp(6px,2.8cqw,10px); line-height:1.3;
  color:#C9BEB4;
}
.ll-score-net b{font-weight:900; color:#EFE6DC;}
.ll-score-net i{font-style:normal; font-weight:900; color:#F1A08F;}
/* Site assembly is the new lever in the economy, so when a whole colour group
   is held the panel says so where the score is read. */
.ll-assembly{
  margin-left:auto; flex:0 0 auto; white-space:nowrap;
  font-weight:900; font-size:clamp(7px,3cqw,11px); letter-spacing:.07em;
  text-transform:uppercase; border-radius:0.9cqw; padding:0.6cqw 1.1cqw;
  background:linear-gradient(180deg,${CHROME.railTop},${CHROME.railBottom});
  color:${CHROME.railGlyph};
  box-shadow:inset 0 0.4cqw 0 rgba(255,255,255,.45);
}

/* stats plate — #2D2D2D, 4px radius, carrying the stat pennants */
.ll-stats{
  display:flex; align-items:stretch; gap:1.2cqw;
  border-radius:1.1cqw;
  background:${CHROME.panelDark};
  border:0.55cqw solid #171314;
  padding:0.9cqw;
  box-shadow:inset 0 0.5cqw 0 rgba(255,255,255,.07);
}
/*
 * stat pennant — downward point, 3px radius on the top corners.
 *
 * THE TRUNCATION FIX. These chips used to be typeset in units of the PANEL's
 * width while being laid out in a third of it, so on a laptop frame both the
 * labels and the figures ran out of box and ellipsed — a label reduced to three
 * letters and a currency figure reduced to its first digit. A chip is now an
 * inline-size container in its own right, so every size inside it is a fraction
 * of the chip's OWN width. The type can no longer outgrow its plate at any
 * frame size, and there is not one text-overflow declaration left here.
 *
 * The glyph moves behind the type as a watermark rather than sitting beside it.
 * It kept its meaning and gave back the width it was stealing from the figure,
 * which is the whole argument: the numeral outranks the glyph.
 */
.ll-pennant{
  position:relative;
  flex:1 1 0; min-width:0;
  container-type:inline-size; container-name:chip;
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  padding:0.9cqw 0.5cqw 0.3cqw;
  border-radius:3px 3px 0 0;
  /* The point is shallower than the benchmark's because the figure now sits
     lower in the plate: type must never straddle the taper, or it reads as
     spilling off the pennant. The clearance below the type is set in em of the
     chip's own scale (see .ll-pennant-c), so the two track each other. */
  clip-path:polygon(0 0,100% 0,100% 78%,50% 100%,0 78%);
  background:linear-gradient(180deg, var(--pc-dark) 0%, var(--pc-deep) 100%);
}
.ll-pennant svg{
  position:absolute; left:50%; top:34%; transform:translate(-50%,-50%);
  width:62%; height:auto; color:#FFFFFF; opacity:.13; pointer-events:none;
}
@container chip (max-width:26px){ .ll-pennant svg{display:none;} }
/* The type scale lives HERE and not on the pennant itself: container query
   units resolve against the nearest ANCESTOR container, so a rule on the
   container element would still be measuring the panel. One level in, cqw
   finally means "a hundredth of this chip". */
.ll-pennant-c{
  position:relative; min-width:0; max-width:100%;
  display:flex; flex-direction:column; align-items:center;
  font-size:clamp(6.5px,15.5cqw,11px);
  line-height:1.1;
  margin-bottom:0.8em;          /* clearance above the pennant's point */
}
/* Every figure on the panel carries its own word. Nothing here is a riddle, and
   nothing here is cut short: the label wraps onto a second line sooner than it
   loses a letter. */
.ll-pennant-l{
  font-weight:800; font-size:.87em; line-height:1.1;
  letter-spacing:.04em; text-transform:uppercase; color:rgba(255,255,255,.86);
  text-align:center; overflow-wrap:break-word; max-width:100%;
}
/*
 * The figure sizes itself to the figure. --vlen is the character count of the
 * value currently on the chip, published by the renderer, so a seven-character
 * net worth is set smaller than a three-character one INSTEAD of being cut
 * short. The cap keeps a short value at full size; the floor keeps a long one
 * readable. Nothing here can produce an ellipsis, because there is none.
 */
.ll-pennant-v{
  font-weight:800; line-height:1.1; color:#FFFFFF;
  font-size:max(6px, min(var(--v-cap,1.7em), calc(140cqw / var(--vlen,5))));
  text-shadow:var(--ink-shadow); white-space:nowrap; max-width:100%;
}
/* cue 4 of 4 — a control that exists only on the active panel */
.ll-hud .ll-turnglyph{
  position:relative;
  flex:0 0 auto; width:11cqw; min-width:0; border-radius:1.6cqw;
  border:0.6cqw solid #FFFFFF;
  background:linear-gradient(180deg,${CHROME.actionTop},${CHROME.actionBottom});
  color:${CHROME.railGlyph};
  display:flex; align-items:center; justify-content:center;
  box-shadow:0 0 0.9cqw rgba(255,211,77,.55);
}
/* The glyph is deliberately small — it is a turn CUE that happens also to be a
   shortcut — so its touch target is grown past the 48px floor invisibly rather
   than by inflating the plate and breaking the measured panel proportions. */
.ll-turnglyph::after{content:""; position:absolute; inset:-16px;}
.ll-turnglyph svg{width:70%;}
.ll-turnglyph[disabled]{opacity:.72;}
.ll-turnglyph.is-waiting{animation:ll-pulse 1400ms ease-in-out infinite;}
@keyframes ll-pulse{0%,100%{opacity:.55}50%{opacity:1}}

/*
 * SITE ASSEMBLY PROGRESS. Completing a colour group doubles that group's rent
 * and is the largest single swing in the economy — yet a whole twelve-round
 * game finished with neither player assembling anything and no surface in the
 * HUD admitting the mechanic existed. Each group a player has a stake in now
 * gets a chip in the group's own board colour carrying how much of it they
 * hold. The strip is empty, and therefore absent, until the first street is
 * bought, so it costs an opening panel nothing.
 */
.ll-groups{display:flex; flex-wrap:wrap; align-items:center; gap:0.9cqw;}
.ll-groups:empty{display:none;}
.ll-group{
  display:flex; align-items:center; gap:0.8cqw;
  border-radius:1cqw; padding:0.35cqw 0.9cqw 0.45cqw;
  border:0.4cqw solid #171314;
  background:linear-gradient(180deg,#3A3335,#221D1F);
  font-weight:900; font-size:clamp(6px,2.7cqw,10px); line-height:1.25;
  color:#E7DED5; white-space:nowrap;
}
.ll-group i{
  display:block; flex:0 0 auto; width:1.7cqw; height:3.4cqw;
  border-radius:0.6cqw; background:var(--gc,#7A6A5E);
}
/* One street short of the whole group: the chip starts asking to be finished. */
.ll-group[data-near="1"]{border-color:${mix(CHROME.strokeGold, '#000000', 0.25)}; color:#FFE7A8;}
.ll-group[data-done="1"]{
  border-color:var(--gold); color:${CHROME.railGlyph};
  background:linear-gradient(180deg,${CHROME.railTop},${CHROME.railBottom});
  box-shadow:inset 0 0.4cqw 0 rgba(255,255,255,.45);
}
.ll-group[data-done="1"] i{background:rgba(0,0,0,.42);}

/* Panels get materially simpler once a panel is narrower than a phone half. */
@container panel (max-width:250px){
  .ll-stats{padding:0.7cqw;}
}
/*
 * The perch has a limit and this is it. The cash chip is only lifted onto the
 * portrait while it is NARROWER than the portrait; once the panel is small
 * enough that the chip's type hits its legibility floor, the chip is wider than
 * the card it is sitting on and starts eating the name beside it — which is
 * exactly what it was doing on a phone and on a tablet. Below this width it
 * comes back into the head row and is laid out against the name instead of over
 * it. Driven by the panel's own width, so it is right at every frame size
 * rather than only at the two the screenshots happened to catch.
 */
@container panel (max-width:250px){
  /* The row wraps rather than squeezes: min-content on the name means the chip
     drops onto a second line before a single letter of the name is lost. */
  .ll-head{flex-wrap:wrap; column-gap:2cqw; row-gap:1.2cqw;}
  .ll-name{flex:1 1 auto; min-width:min-content;}
  .ll-name-in{padding:0.7cqw 4.8cqw 0.7cqw 2cqw;}
  .ll-name-t{font-size:clamp(9px,5.9cqw,18px);}
  .ll-badge{
    position:relative; top:auto; left:auto; z-index:auto;
    flex:0 0 auto; height:auto; min-width:0; padding:0.4cqw 1.6cqw;
    border-width:0.6cqw;
  }
  .ll-badge i{font-size:clamp(6px,2.7cqw,10px);}
  .ll-badge b{font-size:clamp(9px,4cqw,15px);}
  .ll-badge::after{display:none;}
}
@container panel (max-width:190px){
  .ll-swatch{width:12cqw;height:12cqw;}
  .ll-frame{gap:1.8cqw; padding:2cqw;}
  .ll-portrait{flex-basis:22cqw; min-height:22cqw;}
}
/*
 * THE LAST LINE OF DEFENCE ON THE FIGURE. Type has a legibility floor, so a
 * chip narrow enough to reach it cannot go on shrinking the label to make room.
 * These two steps trade the figure's size — never its digits — so that a wide
 * value such as a seven-character net worth still fits a narrow chip whole.
 */
@container chip (max-width:46px){ .ll-pennant-v{--v-cap:1.45em;} }
@container chip (max-width:38px){ .ll-pennant-v{--v-cap:1.3em;} }

/*
 * Where there IS vertical room, the chips wrap to a second line instead of
 * being shed or shrunk. A phone has no such room — the HUD budget is the
 * binding constraint there — so this is scoped to frames wider than a phone,
 * where the whole HUD runs at 12-17% of frame and can afford another row of
 * plates. Above 255px of panel all three chips fit one row, which is the
 * measured composition, so the wrap never fires on a full-size frame.
 */
@media (min-width:761px) and (min-height:561px){
  @container panel (max-width:255px){
    .ll-stats{flex-wrap:wrap; row-gap:1cqw;}
    .ll-pennant{flex:1 1 40%;}
    .ll-hud .ll-turnglyph{flex:1 1 40%; width:auto;}
  }
}

/*
 * A phone cannot spend a second row of chips — held upright OR on its side, and
 * the landscape frame is the tighter of the two — so there it sheds instead. A
 * truncated number is worse than an absent one, and The Register still carries
 * every figure in full.
 */
@media (max-width:760px), (max-height:560px){
  @container panel (max-width:210px){
    .ll-pennant:nth-child(3){display:none;}  /* debt folds into The Register */
  }
  @container panel (max-width:135px){
    .ll-pennant:nth-child(2){display:none;}
  }
}

/* ─────────────────────────────────────────────── prompt banner, top right ── */
.ll-beat{
  position:relative; margin-left:auto; flex:0 0 auto;
  width:min(30vw,430px); pointer-events:auto;
  filter:drop-shadow(0 8px 18px rgba(0,0,0,.45));
}
.ll-beat-strings{
  position:absolute; top:-2.6vh; left:0; right:0; height:2.6vh;
  display:flex; justify-content:space-between; padding:0 22%;
}
.ll-beat-strings i{display:block; width:3px; height:100%;
  background:linear-gradient(180deg,rgba(255,255,255,.05),rgba(24,16,12,.75));}
.ll-beat-plate{
  position:relative;
  border-radius:18px;
  border:5px solid #2A211C;
  background:linear-gradient(180deg,#FFF6E8 0%,#F1DFC2 100%);
  padding:11px 16px 13px;
  box-shadow:0 6px 0 rgba(0,0,0,.20), inset 0 2px 0 rgba(255,255,255,.85);
}
.ll-beat-plate::before,.ll-beat-plate::after{
  content:""; position:absolute; top:7px; width:10px; height:10px; border-radius:50%;
  background:#2A211C; box-shadow:inset 0 1px 1px rgba(255,255,255,.3);
}
.ll-beat-plate::before{left:22%;} .ll-beat-plate::after{right:22%;}
.ll-beat-eyebrow{
  font-weight:800; font-size:.66em; letter-spacing:.14em; text-transform:uppercase;
  color:#8A4A15;
}
.ll-beat-head{font-weight:900; font-size:1.32em; line-height:1.1; color:#101010; letter-spacing:-.01em;}
.ll-beat-sub{font-weight:700; font-size:.82em; color:#4D4845; margin-top:2px;}
/* The phone's one-line instruction. Only ever one of the two subs is in the
   document's box tree, so neither is read twice by a screen reader. */
.ll-beat-short{display:none;}

/* ────────────────────────────────────────────────── left icon rail ──────── */
.ll-rail{
  position:absolute; left:max(var(--safe-l),14px); top:50%;
  transform:translateY(-42%);
  display:flex; flex-direction:column; gap:15px;   /* 45px button, 60px pitch */
  pointer-events:auto;
}
.ll-rail button{
  width:48px; height:48px; border-radius:12px;
  border:4px solid var(--bezel);
  background:linear-gradient(180deg,${CHROME.railTop} 0%,${CHROME.railBottom} 100%);
  color:${CHROME.railGlyph};
  display:flex; align-items:center; justify-content:center;
  box-shadow:var(--lift-sm), inset 0 2px 0 rgba(255,255,255,.45);
  transition:transform 110ms ease, filter 110ms ease;
}
.ll-rail button svg{width:23px; height:23px;}
.ll-rail button:active{transform:translateY(2px); filter:brightness(.94);}

/* ── the overflow control, bottom-left thumb zone (phones only) ──────────
   A six-icon vertical rail is a desktop sidebar. On a phone the whole rail
   collapses into ONE 56px button in the opposite thumb corner from the primary
   action, and its contents move into a bottom sheet with full-width rows. */
.ll-more{
  position:absolute;
  left:calc(var(--safe-l) + 6px);
  bottom:calc(var(--safe-b) + 14px);
  width:56px; height:56px; border-radius:16px;
  border:5px solid var(--bezel);
  background:linear-gradient(180deg,${CHROME.railTop} 0%,${CHROME.railBottom} 100%);
  color:${CHROME.railGlyph};
  display:none; align-items:center; justify-content:center;
  box-shadow:var(--lift-sm), inset 0 2px 0 rgba(255,255,255,.45);
  pointer-events:auto;
  transition:transform 110ms ease, filter 110ms ease;
}
.ll-more svg{width:27px; height:27px;}
.ll-more:active{transform:translateY(2px); filter:brightness(.94);}
.ll-hud .ll-menu-row{
  display:flex; align-items:center; gap:12px; width:100%; text-align:left;
  min-height:56px; padding:10px 14px;
  border-radius:12px; border:3px solid #2A211C;
  background:linear-gradient(180deg,#FFFDF8,#EFE1CB); color:#101010;
  box-shadow:0 3px 0 rgba(0,0,0,.22);
}
.ll-menu-row:active{transform:translateY(2px); box-shadow:0 1px 0 rgba(0,0,0,.22);}
.ll-menu-ico{
  flex:0 0 auto; width:38px; height:38px; border-radius:10px;
  border:3px solid var(--bezel);
  background:linear-gradient(180deg,${CHROME.railTop},${CHROME.railBottom});
  color:${CHROME.railGlyph};
  display:flex; align-items:center; justify-content:center;
}
.ll-menu-ico svg{width:20px; height:20px;}
.ll-menu-row b{font-weight:800; font-size:.92em;}

/* ─────────────────────────────────────── action cluster, bottom right ───── */
.ll-action{
  position:absolute;
  right:calc(var(--safe-r) + 12px);
  bottom:calc(var(--safe-b) + 14px);
  display:flex; flex-direction:column; align-items:flex-end; gap:14px;
  pointer-events:auto;
}
/* Dice sit directly above the primary button. When the 3D scene owns a real
   physical roll, these are removed entirely rather than competing with it. */
.ll-dice{display:flex; align-items:center; gap:12px; margin-bottom:34px;}
.ll-scene-dice .ll-dice{display:none;}
.ll-total{
  display:flex; align-items:center; justify-content:center;
  min-width:38px; height:38px; padding:0 8px; border-radius:10px;
  border:3px solid var(--bezel); background:linear-gradient(180deg,#3A3335,#221D1F);
  font-weight:900; font-size:1.02em; color:#FFF3DE; text-shadow:var(--ink-shadow);
  box-shadow:var(--lift-sm);
}
.ll-total.is-idle{opacity:0; transform:scale(.7); transition:opacity 160ms ease, transform 160ms ease;}
.ll-die{
  width:56px; height:56px; border-radius:10px;
  border:4px solid #C9BCA8;
  background:linear-gradient(160deg,#FFFFFF 0%,${CHROME.diceWhite} 46%,#D8D2C6 100%);
  box-shadow:0 5px 0 rgba(0,0,0,.28), 0 10px 18px rgba(0,0,0,.40),
             inset 0 2px 0 rgba(255,255,255,.9);
  display:flex; align-items:center; justify-content:center;
  transform:rotate(var(--rot,0deg));
}
.ll-die svg{width:80%; height:80%;}
.ll-die.is-idle{filter:saturate(0) brightness(.90); opacity:.72;}
.ll-die.is-rolling{animation:ll-tumble 240ms linear infinite;}
.ll-die.is-settled{animation:ll-land 340ms cubic-bezier(.2,1.5,.4,1) 1;}
@keyframes ll-tumble{
  0%{transform:rotate(-12deg) translateY(0) scale(1)}
  25%{transform:rotate(9deg) translateY(-9px) scale(1.06)}
  50%{transform:rotate(-6deg) translateY(0) scale(.97)}
  75%{transform:rotate(13deg) translateY(-6px) scale(1.04)}
  100%{transform:rotate(-12deg) translateY(0) scale(1)}
}
@keyframes ll-land{
  0%{transform:rotate(var(--rot,0deg)) scale(1.22)}
  60%{transform:rotate(var(--rot,0deg)) scale(.95)}
  100%{transform:rotate(var(--rot,0deg)) scale(1)}
}
.ll-btns{display:flex; align-items:flex-end; gap:14px;}
.ll-hud .ll-btn{
  position:relative;
  width:76px; height:76px; border-radius:18px;
  border:8px solid var(--bezel);
  display:flex; align-items:center; justify-content:center;
  box-shadow:var(--lift);
  transition:transform 110ms ease, filter 140ms ease, box-shadow 140ms ease;
}
.ll-btn-face{
  position:absolute; inset:0; border-radius:12px;
  display:flex; align-items:center; justify-content:center;
}
.ll-btn svg{width:38px; height:38px;}
.ll-btn:active{transform:translateY(3px);}
.ll-btn-secondary .ll-btn-face{
  background:linear-gradient(180deg,#7E6E63 0%,#4E413A 100%);
  color:#FFF0DC; box-shadow:inset 0 3px 0 rgba(255,255,255,.22);
}
/* the primary is the only control in the game wearing a warm halo */
.ll-hud .ll-btn-primary{
  width:92px; height:92px;
  box-shadow:var(--lift), 0 0 26px rgba(255,211,77,.85);
}
.ll-btn-primary .ll-btn-face{
  background:linear-gradient(180deg,${CHROME.actionTop} 0%,${CHROME.actionBottom} 100%);
  color:${CHROME.railGlyph}; box-shadow:inset 0 3px 0 rgba(255,255,255,.45);
}
.ll-btn-primary svg{width:46px; height:46px;}
.ll-btn[disabled]{
  filter:saturate(.16) brightness(.74); box-shadow:var(--lift-sm); cursor:default;
}
.ll-btn-label{
  position:absolute; bottom:-19px; left:50%; transform:translateX(-50%);
  font-weight:900; font-size:.62em; letter-spacing:.1em; text-transform:uppercase;
  background:#1B1517; border:2px solid var(--bezel); border-radius:4px;
  padding:2px 7px; white-space:nowrap; color:#FFF3DE;
}

/* ─────────────────────────────────────────────────────────── toasts ─────── */
.ll-toasts{
  position:absolute; left:50%; transform:translateX(-50%);
  bottom:calc(var(--safe-b) + 128px);
  display:flex; flex-direction:column-reverse; gap:8px; align-items:center;
  pointer-events:none; width:min(86vw,520px);
}
.ll-toast{
  display:flex; align-items:center; gap:10px;
  border-radius:8px; border:3px solid var(--bezel);
  background:linear-gradient(180deg,#FFF6E8,#EFDDC0);
  color:#101010; font-weight:800; font-size:.86em;
  padding:9px 14px; box-shadow:var(--lift-sm);
  animation:ll-toast-in 220ms cubic-bezier(.2,.9,.3,1);
}
.ll-toast > i{width:8px; height:22px; border-radius:3px; background:#8A4A15; flex:0 0 auto;}
/*
 * A charge that passes in four words is a charge nobody notices, and the levy
 * — which is proportional to the rent roll and so grows with the holdings —
 * was being read as trivial because the toast said neither what it was
 * reckoned on nor what it took. Two lines and the figure fix that.
 */
.ll-toast-c{display:flex; flex-direction:column; gap:2px; min-width:0;}
.ll-toast-s{font-weight:700; font-size:.84em; line-height:1.3; color:#4D4845;}
.ll-toast-v{flex:0 0 auto; margin-left:auto; font-weight:900; white-space:nowrap;}
.ll-toast[data-kind="levy"] > i,
.ll-toast[data-kind="interest"] > i,
.ll-toast[data-kind="rent"] > i{background:#A31220;}
.ll-toast[data-kind="levy"] .ll-toast-v,
.ll-toast[data-kind="interest"] .ll-toast-v,
.ll-toast[data-kind="rent"] .ll-toast-v{color:#A31220;}
.ll-toast[data-kind="income"] .ll-toast-v{color:#0F7A3D;}
.ll-toast[data-kind="income"] i{background:#0F7A3D;}
.ll-toast[data-kind="cost"] i{background:#A31220;}
.ll-toast[data-kind="event"] i{background:#0F5499;}
.ll-toast.is-out{animation:ll-toast-out 200ms ease forwards;}
@keyframes ll-toast-in{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1}}
@keyframes ll-toast-out{to{opacity:0;transform:translateY(-8px)}}

/* ─────────────────────────────────────────── sheets: offer, event, result ─ */
.ll-sheet-host{position:absolute; inset:0; pointer-events:none;}
.ll-scrim{
  position:absolute; inset:0; pointer-events:auto;
  /* a warm vignette, deliberately NOT a flat translucent black rectangle */
  background:radial-gradient(125% 95% at 50% 56%,
    rgba(46,26,12,.16) 0%, rgba(24,13,7,.58) 58%, rgba(10,6,4,.86) 100%);
  display:flex; align-items:center; justify-content:center;
  padding:calc(var(--safe-t) + 10px) var(--safe-r) calc(var(--safe-b) + 10px) var(--safe-l);
  animation:ll-fade 180ms ease;
}
@keyframes ll-fade{from{opacity:0}to{opacity:1}}
.ll-card{
  width:min(560px,94vw); max-height:min(86svh,86vh);
  display:flex; flex-direction:column;
  border-radius:18px; border:8px solid #2A211C;
  background:linear-gradient(180deg,#FFF6E8 0%,#F2E1C6 100%);
  color:#101010;
  box-shadow:0 18px 0 rgba(0,0,0,.20), 0 30px 64px rgba(0,0,0,.55);
  animation:ll-rise 240ms cubic-bezier(.2,.9,.3,1);
  overflow:hidden;
}
@keyframes ll-rise{from{opacity:0;transform:translateY(26px) scale(.97)}to{opacity:1}}
.ll-card-band{
  display:flex; align-items:center; justify-content:space-between; gap:12px;
  padding:11px 14px;
  background:linear-gradient(180deg,var(--band-lit,#7A6A5E),var(--band,#5A4C42));
  border-bottom:4px solid #2A211C;
}
.ll-card-band b{
  font-weight:900; font-size:.72em; letter-spacing:.15em; text-transform:uppercase;
  color:#FFFFFF; text-shadow:var(--ink-shadow);
}
/* 44px floor, and it lives inside the card's own band — never floating over a
   player panel, which is where the previous close control landed. */
.ll-hud .ll-x{
  width:44px; height:44px; border-radius:10px; flex:0 0 auto;
  border:3px solid #2A211C; background:#FFF6E8; color:#2A211C;
  display:flex; align-items:center; justify-content:center;
  box-shadow:0 3px 0 rgba(0,0,0,.24);
}
.ll-x svg{width:19px;height:19px;}
.ll-card-body{
  padding:16px; overflow-y:auto; overscroll-behavior:contain; touch-action:pan-y;
  -webkit-overflow-scrolling:touch;
}
.ll-h1{font-weight:900; font-size:1.55em; line-height:1.08; letter-spacing:-.02em;}
.ll-kicker{font-weight:800; font-size:.68em; letter-spacing:.14em;
  text-transform:uppercase; color:#8A4A15;}
.ll-body-t{font-weight:600; font-size:.92em; line-height:1.42; color:#33302E;}
/* The global margin reset means stacked prose would otherwise butt together;
   the rules sheet now runs to more than one paragraph a section. */
.ll-body-t + .ll-body-t{margin-top:9px;}
.ll-kicker + .ll-body-t{margin-top:4px;}
.ll-hero{
  margin-top:12px; border-radius:14px; border:4px solid #2A211C;
  background:linear-gradient(180deg,#FFFFFF,#F6EADA);
  padding:13px 15px; box-shadow:inset 0 2px 0 rgba(255,255,255,.9);
}
.ll-hero-v{font-weight:900; font-size:2.3em; line-height:1; letter-spacing:-.03em; color:#000000;}
.ll-hero-l{font-weight:700; font-size:.72em; color:#4D4845; margin-top:5px;}
.ll-then{
  margin-top:9px; display:inline-flex; align-items:center; gap:8px;
  border-radius:4px; background:#2A211C; color:#FFF0DC;
  font-weight:800; font-size:.68em; letter-spacing:.09em; text-transform:uppercase;
  padding:5px 9px;
}
.ll-metrics{display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-top:12px;}
.ll-metric{
  border-radius:10px; border:3px solid #2A211C;
  background:linear-gradient(180deg,#FFFDF8,#EFE1CB);
  padding:9px 10px;
}
.ll-metric b{display:block; font-weight:900; font-size:1.02em; letter-spacing:-.02em; color:#000000;}
.ll-metric i{display:block; font-style:normal; font-weight:700; font-size:.62em;
  letter-spacing:.07em; text-transform:uppercase; color:#4D4845; margin-top:3px;}
/*
 * THE COMPLETION FLAG. Buying the last street in a colour group doubles the
 * rent on every street in it — the single biggest decision available — and it
 * was signposted by nothing at all. It is now the loudest object on the offer,
 * in the rail's own gold so it reads as an action rather than as decoration.
 */
.ll-flag{
  margin-top:12px; display:flex; align-items:flex-start; gap:10px;
  border-radius:10px; border:4px solid #2A211C;
  background:linear-gradient(180deg,${CHROME.railTop},${CHROME.railBottom});
  color:${CHROME.railGlyph}; padding:9px 12px;
  box-shadow:inset 0 2px 0 rgba(255,255,255,.45);
}
.ll-flag > i{flex:0 0 auto; width:8px; height:34px; border-radius:3px;
  background:${CHROME.railGlyph}; opacity:.55;}
.ll-flag b{display:block; font-weight:900; font-size:.84em; letter-spacing:.07em;
  text-transform:uppercase; line-height:1.15;}
/* Set case and tracking explicitly: this plate sits among a run of small-caps
   labels, and the sentence under the heading is prose, not a label. */
.ll-flag em{display:block; font-style:normal; font-weight:700; font-size:.78em;
  line-height:1.32; margin-top:3px; text-transform:none; letter-spacing:normal;}
/* Cash or debt, side by side, in the currency the game is scored in. Without
   this the price and the deposit are comparable but their CONSEQUENCES are not,
   which is how a strictly worse option can look like the obvious one. */
.ll-compare{display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:12px;}
.ll-opt{
  border-radius:10px; border:3px solid #2A211C;
  background:linear-gradient(180deg,#FFFDF8,#EFE1CB); padding:9px 10px;
}
.ll-opt u{display:block; text-decoration:none; font-weight:900; font-size:.64em;
  letter-spacing:.08em; text-transform:uppercase; color:#8A4A15;}
.ll-opt b{display:block; font-weight:900; font-size:1.02em; letter-spacing:-.02em;
  color:#000000; margin-top:4px;}
.ll-opt i{display:block; font-style:normal; font-weight:700; font-size:.62em;
  line-height:1.35; color:#4D4845; margin-top:3px;}
.ll-opt[data-off="1"]{filter:saturate(.1); opacity:.62;}
/* An arithmetic block: one line per term, the answer ruled off underneath. */
.ll-sum{
  margin-top:12px; border-radius:14px; border:4px solid #2A211C;
  background:linear-gradient(180deg,#FFFFFF,#F6EADA);
  padding:11px 14px 13px; box-shadow:inset 0 2px 0 rgba(255,255,255,.9);
}
.ll-sum-r{
  display:flex; align-items:baseline; justify-content:space-between; gap:12px;
  padding:4px 0; font-weight:700; font-size:.82em; line-height:1.3; color:#33302E;
}
.ll-sum-r > span{font-weight:900; font-size:1.02em; color:#000000; white-space:nowrap;}
.ll-sum-r.is-take > span{color:#A31220;}
.ll-sum-r.is-tot{
  margin-top:5px; padding-top:8px; border-top:2px solid #2A211C; font-weight:900;
}
.ll-sum-r.is-tot > span{font-size:1.9em; letter-spacing:-.03em; line-height:1;}
.ll-source{
  margin-top:12px; font-weight:600; font-size:.68em; line-height:1.4; color:#4D4845;
  border-top:2px solid #CCC1B7; padding-top:9px;
}
.ll-choices{
  display:flex; flex-direction:column; gap:9px;
  padding:12px 16px calc(14px + var(--safe-b));
  border-top:4px solid #2A211C; background:#EADCC2;
}
.ll-hud .ll-choice{
  display:flex; align-items:center; justify-content:space-between; gap:12px;
  min-height:58px; padding:10px 14px; text-align:left; width:100%;
  border-radius:12px; border:4px solid #2A211C;
  box-shadow:0 4px 0 rgba(0,0,0,.26); transition:transform 110ms ease, filter 140ms ease;
}
.ll-choice:active{transform:translateY(3px); box-shadow:0 1px 0 rgba(0,0,0,.26);}
.ll-choice strong{font-weight:900; font-size:1em; letter-spacing:-.01em;}
.ll-choice em{display:block; font-style:normal; font-weight:700; font-size:.66em; opacity:.82;}
.ll-choice-v{font-weight:900; font-size:1.02em; white-space:nowrap;}
.ll-hud .ll-choice-buy{background:linear-gradient(180deg,${CHROME.actionTop},${CHROME.actionBottom}); color:#2A1608;}
.ll-hud .ll-choice-gear{background:linear-gradient(180deg,#7FA9C9,#3E6A8C); color:#FFFFFF;}
.ll-hud .ll-choice-pass{background:linear-gradient(180deg,#EFE4D2,#D6C7B0); color:#2A211C;}
.ll-choice[disabled]{filter:saturate(.12) brightness(.90); cursor:default;}
.ll-rows{display:flex; flex-direction:column; gap:7px; margin-top:10px;}
.ll-hud .ll-row{
  display:flex; align-items:center; justify-content:space-between; gap:10px; width:100%;
  min-height:50px; padding:8px 12px; text-align:left;
  border-radius:10px; border:3px solid #2A211C;
  background:linear-gradient(180deg,#FFFDF8,#EFE1CB); color:#101010;
  box-shadow:0 3px 0 rgba(0,0,0,.20);
}
.ll-row-tag{width:8px; height:30px; border-radius:3px; flex:0 0 auto;}
.ll-row b{font-weight:800; font-size:.92em;}
.ll-row span{font-weight:900; font-size:.92em; white-space:nowrap;}
.ll-empty{font-weight:700; font-size:.86em; color:#66605C; padding:14px 0;}

/* ── result: presented to Financial Times graphics standards (ft.json) ───── */
.ll-ft{background:#FFF1E5; padding:16px;}
.ll-ft-bar{width:60px; height:4px; background:#000000; margin-bottom:12px;}
.ll-ft-title{font-weight:400; font-size:1.5em; line-height:1.16; color:#000000;}
.ll-ft-sub{font-size:.84em; color:#66605C; margin-top:6px;}
.ll-ft-plot{margin-top:18px; display:flex; flex-direction:column; gap:14px;}
.ll-ft-row{display:grid; grid-template-columns:1fr; gap:5px;}
.ll-ft-cat{font-size:.78em; color:#4D4845; font-weight:400;}
.ll-ft-track{position:relative; height:22px; border-left:1px solid #999189;}
.ll-ft-fill{position:absolute; left:0; top:0; bottom:0; background:var(--pc);}
.ll-ft-val{font-size:.78em; color:#66605C; font-variant-numeric:tabular-nums; font-weight:400;}
.ll-ft-src{margin-top:18px; font-size:.7em; line-height:1.5; color:#66605C;
  border-top:1px solid #E6D9CE; padding-top:9px;}

/* ────────────────────────────────────── the attribution strip, bottom ───── */
/*
 * The brief requires the Open Government Licence credit, so it cannot go. What
 * it must stop doing is clipping mid-sentence over the board and bleeding
 * through every bottom sheet at low opacity.
 *
 * The old markup footer is a fixed-height block of eight paragraphs painted
 * ABOVE this layer (same z-index, later in the document), which is exactly why
 * it showed through. The HUD takes it over: the sentence is carried here
 * verbatim from the fact base, on a compact opaque plate that is part of the
 * HUD's own stacking order, so a sheet scrim covers it like anything else. OGL
 * v3 permits the remaining statements to sit behind a link where showing them
 * all is impractical, and that link is on this strip.
 */
#attribution{display:none !important;}
.ll-foot{
  position:absolute; left:0; right:0;
  bottom:max(env(safe-area-inset-bottom),0px);
  display:flex; align-items:center; justify-content:center;
  gap:8px; flex-wrap:wrap;
  padding:5px calc(var(--safe-r) + 10px) 5px calc(var(--safe-l) + 10px);
  background:linear-gradient(180deg,#241E20 0%,#171214 100%);
  border-top:2px solid ${CHROME.bezel};
  pointer-events:none;
}
.ll-foot-t{
  margin:0; font-weight:600; font-size:clamp(8px,2.5vw,11px); line-height:1.3;
  color:#CFC5BC; text-align:center;
}
.ll-hud .ll-foot-link{
  position:relative; flex:0 0 auto; pointer-events:auto;
  font-weight:800; font-size:clamp(8px,2.5vw,11px); line-height:1.3;
  color:#FFD98A; text-decoration:underline; text-underline-offset:2px;
  padding:2px 4px; border-radius:4px; white-space:nowrap;
  min-width:fit-content; overflow:visible;
}
.ll-foot-link::after{content:""; position:absolute; inset:-14px;}   /* 44px target */
@media (min-width:761px){
  .ll-foot{justify-content:flex-start;}
  .ll-foot-t{white-space:nowrap;}      /* one line, and it fits at this width */
}

/* The shell's own overlay carries its own close control. Standing the HUD down
   while it is open is what stops that control landing on a player panel. */
.ll-hud.is-overlaid .ll-top,
.ll-hud.is-overlaid .ll-rail,
.ll-hud.is-overlaid .ll-more,
.ll-hud.is-overlaid .ll-action,
.ll-hud.is-overlaid .ll-toasts,
.ll-hud.is-overlaid .ll-foot{
  opacity:0; visibility:hidden; pointer-events:none;
  transition:opacity 140ms ease, visibility 0s linear 140ms;
}

/* ─────────────────────────────────────────────────── phone reflow ─────────
   Keyed on EITHER dimension. A phone on its side is 844x390: wide enough to
   miss a width-only query, and the frame with the least height in the whole
   range, which is precisely where the compact panel matters most. */
@media (max-width:760px), (max-height:560px){
  .ll-hud.ll-hud{font-size:calc(0.95rem * var(--ui-scale,1));}
  /* Portrait phone: identity and prompt stack at the top, so the whole lower
     two-thirds — the thumb country — belongs to the board and the controls. */
  .ll-top{
    left:var(--safe-l); right:var(--safe-r);
    top:calc(var(--safe-t) + 8px);
    flex-direction:column; gap:8px;
  }
  .ll-panels{width:100%; grid-auto-columns:1fr; column-gap:6px;}
  /* The panels were eating the top quarter of a phone. Every measurement here
     is pulled in so the whole HUD strip stays under a fifth of the frame and
     the board keeps the rest. */
  .ll-frame{padding:1.4cqw; gap:1.5cqw; border-width:0.7cqw;}
  .ll-col{gap:0.9cqw;}
  .ll-portrait{flex-basis:20cqw; min-height:20cqw;}
  .ll-name-in{padding:0.7cqw 4.8cqw 0.7cqw 2cqw;}
  .ll-name-t{font-size:clamp(9px,5.9cqw,18px);}
  /* The chip is already back in the head row by then (see the panel container
     query above); these only trim its type for a phone's panel width. */
  .ll-badge i{font-size:clamp(6px,2.7cqw,10px);}
  .ll-badge b{font-size:clamp(9px,4cqw,15px);}
  /* Rent roll: label and figure share one line rather than stacking, which is
     a whole text line of frame given back to the board. */
  .ll-score{padding:0.5cqw 1.4cqw;}
  .ll-score-tab{height:6.5cqw;}
  .ll-score-c{flex-direction:row; align-items:baseline; gap:1.4cqw; flex-wrap:wrap;}
  .ll-score-l{font-size:clamp(6px,2.9cqw,10px);}
  .ll-score-v{font-size:clamp(11px,6.8cqw,22px); margin-left:auto;}
  .ll-stats{padding:0.6cqw; gap:1cqw;}
  .ll-pennant{padding:0.7cqw 0.4cqw 0.25cqw;}
  /* Both additions to the panel are set tighter here rather than dropped: the
     assembly strip and the debt-service sum are the two things the last two
     games of this were played without, and a phone is where they were missed
     most. Together they cost a phone panel about two small lines of type. */
  .ll-score-net{font-size:clamp(6px,2.6cqw,9px); line-height:1.2;}
  .ll-groups{gap:0.7cqw;}
  .ll-group{padding:0.25cqw 0.7cqw 0.3cqw; gap:0.6cqw;}
  /* The banner is sized to its copy, not stretched: every square pixel it does
     not take is board, and the board is the star. On a phone it drops to two
     tight lines — the round and whose turn it is on one, one short instruction
     on the other — because the rest of the sentence is already carried by the
     glowing button in the thumb corner. */
  .ll-beat{margin-left:0; width:auto; align-self:flex-start; max-width:min(100%,244px);}
  .ll-beat-strings{display:none;}
  .ll-beat-plate{
    border-width:3px; border-radius:12px; padding:4px 10px 5px;
    display:flex; flex-wrap:wrap; align-items:baseline; column-gap:7px; row-gap:0;
    box-shadow:0 4px 0 rgba(0,0,0,.20), inset 0 2px 0 rgba(255,255,255,.85);
  }
  .ll-beat-plate::before,.ll-beat-plate::after{display:none;}
  .ll-beat-eyebrow{font-size:.56em; line-height:1.25;}
  .ll-beat-head{font-size:.99em; line-height:1.2;}
  .ll-beat-sub{display:none;}
  .ll-beat-short{
    display:block; flex:1 0 100%;
    font-weight:700; font-size:.7em; line-height:1.24; color:#4D4845;
  }
  .ll-beat-short:empty{display:none;}
  .ll-action{right:calc(var(--safe-r) + 8px); bottom:calc(var(--safe-b) + 14px);}
  .ll-dice{margin-bottom:22px; gap:10px;}
  .ll-die{width:44px;height:44px;border-width:3px;}
  /* These carry the class twice on purpose: the base rules are written with the
     layer class in front to survive a host stylesheet, and a single-class rule
     in here would lose to them on specificity — which is why the phone was
     still wearing the desktop button sizes. */
  .ll-hud .ll-btn{width:60px;height:60px;border-width:6px;}   /* over the 48px floor */
  .ll-hud .ll-btn svg{width:28px;height:28px;}
  .ll-hud .ll-btn-primary{width:88px;height:88px;}   /* ≈23mm, over the 56px floor */
  .ll-hud .ll-btn-primary svg{width:42px;height:42px;}
  .ll-toasts{bottom:calc(var(--safe-b) + 200px); width:min(92vw,460px);}
  .ll-card{width:100%; max-width:560px; align-self:flex-end; max-height:88svh;
    border-radius:18px 18px 0 0; border-bottom:0;}
  .ll-scrim{align-items:flex-end; padding:0;}
  .ll-metrics{grid-template-columns:1fr 1fr;}
  /* The credit is required verbatim, so it is set smaller and tighter rather
     than shortened, clipped or scrolled. The link moves onto the same row
     instead of claiming a third line of its own; it still clears 44px through
     its expanded hit area, and the strip still has no fixed height, so nothing
     it contains can ever be cut off. */
  .ll-foot{
    flex-wrap:nowrap; align-items:center; gap:7px;
    padding:3px calc(var(--safe-r) + 8px) 3px calc(var(--safe-l) + 8px);
  }
  .ll-foot-t{
    flex:1 1 auto; min-width:0; text-align:left;
    /* Undoes the wide-frame one-liner. Sharing the row with the link leaves
       too little width for the sentence, and it must wrap rather than clip. */
    white-space:normal;
    font-size:clamp(7px,1.85vw,10px); line-height:1.2;
  }
  .ll-hud .ll-foot-link{font-size:clamp(7px,2vw,10px); line-height:1.2; padding:1px 3px;}
}
/* Landscape phone: the top strip has to give ground to the board. The panels
   run side by side across a fraction of the width rather than filling it. */
@media (max-height:460px){
  .ll-top{
    flex-direction:row; align-items:flex-start; gap:1.6vw;
    left:calc(var(--safe-l) + 10px);
  }
  .ll-panels{width:auto; grid-auto-columns:23vw; column-gap:2.4vw;}
  /*
   * THE ROUND COUNTER STAYS. This banner used to be display:none at this
   * height, which took the only statement of "round n of m" off the screen
   * entirely — in a game whose whole strategy is how many laps are left to
   * build a roll, and measured at 0x0 by a critic playing on his side. It is
   * not the banner that has to give ground, only its paragraph: what survives
   * is the round and whose turn it is, on one compact plate in the corner two
   * panels at 23vw cannot reach.
   */
  .ll-beat{
    display:block; margin-left:auto; align-self:flex-start;
    flex:0 1 auto; width:auto; max-width:min(32vw,232px);
  }
  .ll-beat-plate{padding:3px 9px 4px;}
  .ll-beat-eyebrow{font-size:.6em; line-height:1.2;}
  .ll-beat-head{font-size:.84em; line-height:1.16;}
  .ll-beat-sub,.ll-beat-short{display:none;}
  .ll-foot{padding-top:2px; padding-bottom:2px;}
}

/* ── SHEETS IN LANDSCAPE: two columns, not a guillotine ───────────────────
 *
 * THE DEAL-BREAKER, and it was measured: at 812x375 the offer card's body was
 * 32px tall against 384px of content, so the player was asked to commit to
 * Bond Street while the card showed "CITY OF WESTMINSTER · UNOWNED" and
 * nothing else — no street name, no price, no rent, no source line. The
 * Gazette card guillotined "What actually happened" after about ten pixels,
 * which is the sourced fact and the entire reason that card exists.
 *
 * The cause is the phone reflow above: it docks the card to the BOTTOM of the
 * frame and stacks band / body / choices in one column. Three 58px choice
 * buttons plus a band leave a portrait phone plenty and a landscape phone 32
 * pixels. Stacking is simply the wrong axis on a frame that is twice as wide
 * as it is tall.
 *
 * So in landscape the sheet becomes a grid: the band across the top, the
 * reading matter down the left in its own scroll port, and the choices in a
 * column down the right in theirs. The card takes the full height it is
 * offered rather than shrink-wrapping to its content, which is what turns 32
 * pixels of body into roughly three hundred. Both columns scroll on their own
 * and contain their own overscroll, so nothing anywhere can be cut off — the
 * standing rule in this file is that a clipped figure is a lie.
 */
@media (orientation:landscape) and (max-height:560px){
  .ll-scrim{
    align-items:stretch; justify-content:center;
    padding:calc(var(--safe-t) + 6px) calc(var(--safe-r) + 6px)
            calc(var(--safe-b) + 6px) calc(var(--safe-l) + 6px);
  }
  .ll-card{
    width:min(100%,900px); max-width:none;
    align-self:stretch; height:auto; max-height:100%;
    display:grid;
    grid-template-columns:minmax(0,1fr) minmax(0,32%);
    grid-template-rows:auto minmax(0,1fr);
    grid-template-areas:"band band" "body choices";
    border-width:5px; border-radius:14px;
  }
  .ll-card-band{grid-area:band; padding:7px 10px;}
  .ll-hud .ll-x{width:38px; height:38px;}
  .ll-card-body{grid-area:body; min-height:0; padding:12px 14px;}
  .ll-choices{
    grid-area:choices; min-height:0;
    overflow-y:auto; overscroll-behavior:contain; touch-action:pan-y;
    -webkit-overflow-scrolling:touch;
    justify-content:flex-start;
    border-top:0; border-left:4px solid #2A211C;
    padding:10px 12px;
  }
  /* In a column this narrow the figure sits under its own heading rather than
     fighting it for the row. Still no ellipsis anywhere. */
  .ll-hud .ll-choice{
    flex-direction:column; align-items:stretch; justify-content:center;
    gap:3px; min-height:52px; padding:9px 12px;
  }
  .ll-choice-v{align-self:flex-end;}
  /* The card scrolls now, but a source line the player has to go looking for is
     still a source line half-hidden. Everything on the offer is set one notch
     tighter so the whole of it — price, rent, debt, cash, and the line saying
     where the price came from — lands inside one landscape screen. */
  .ll-hero-v{font-size:1.9em;}
  .ll-h1{font-size:1.34em;}
  .ll-hero{margin-top:9px; padding:10px 12px;}
  .ll-then{margin-top:7px;}
  .ll-metrics{margin-top:9px; gap:7px;}
  .ll-metric{padding:7px 9px;}
  /* The completion flag and the two projections are the reason the card is
     open at all, so they are tightened rather than pushed below the fold. */
  .ll-flag{margin-top:9px; padding:7px 10px; gap:8px;}
  .ll-compare{margin-top:9px; gap:7px;}
  .ll-opt{padding:7px 9px;}
  .ll-sum{margin-top:9px; padding:9px 12px 10px;}
  .ll-source{margin-top:9px; padding-top:7px;}
}
/* The body column is wide enough for the measured three-across metrics on any
   landscape phone; below that it stays two-across. */
@media (orientation:landscape) and (max-height:560px) and (min-width:680px){
  .ll-metrics{grid-template-columns:repeat(3,1fr);}
}

/* ── clearance under the host shell's pinned header ───────────────────────
 * The shell builds its close control as the first child of .overlay-shell and
 * then pulls the scroll port up underneath it with a negative margin, so a
 * heading brought to the top of that port — by anchor, by find-in-page, or by
 * tabbing to the control after it — lands beneath the control and reads as a
 * section sliced horizontally through the glyphs. panel.js reserves the space
 * on each heading and says in as many words that the CONTAINER side of the
 * bargain is this file's. This is that side: the scroll port keeps the
 * header's measured height clear of anything scrolled into it, whatever
 * brought it there. The height is published as --ll-sticky-head by
 * measureStickyHead() below; the fallback is the close control's own 48px
 * touch target plus its margin, so the rule is correct on its own.
 */
#overlay > .overlay-shell,
#overlay > .overlay-shell > .ll-ft{
  scroll-padding-block-start:calc(var(--ll-sticky-head, 56px) + 8px);
}
/* The HUD's own sheets are the same shape — a band above a scroll port — and
   get the same clearance, measured from the band rather than assumed. */
.ll-card-body{scroll-padding-block-start:calc(var(--ll-band-h, 52px) + 8px);}
.ll-card-body .ll-h1,
.ll-card-body .ll-kicker,
.ll-card-body .ll-ft-title,
.ll-card-body .ll-hero,
.ll-card-body h2,
.ll-card-body h3{scroll-margin-block-start:calc(var(--ll-band-h, 52px) + 8px);}

/* ── the rail collapses on touch-sized frames ────────────────────────────
   Declared last so it wins over the reflow blocks above whatever their order:
   on a phone there is no rail at all, only the single overflow button. */
@media (max-width:760px), (max-height:520px){
  .ll-rail{display:none !important;}
  .ll-more{display:flex;}
}

/* Reduced motion: the dice cross-fade to their result, nothing tumbles. */
@media (prefers-reduced-motion:reduce){
  .ll-hud *,.ll-hud *::before,.ll-hud *::after{
    animation-duration:.01ms !important; animation-iteration-count:1 !important;
    transition-duration:.01ms !important;
  }
  .ll-die.is-rolling{animation:none; opacity:.6;}
}
@media (prefers-contrast:more){
  .ll-hud.ll-hud{--bezel:#181316;}
  .ll-beat-sub,.ll-source,.ll-metric i{color:#33302E;}
}
`;

/* ═══════════════════════════════════════════════════════════ money and numerals */

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * THE SCORE. The game is won on the largest annual rent roll NET of debt
 * service — gross rent, with a completed colour group counted twice, less a
 * year of interest on everything borrowed. Net worth is only the tiebreak.
 * That figure is Player.scoringRentRoll(game); the plain roll is kept as a
 * fallback so the HUD degrades rather than throws if the engine's accessor is
 * renamed again. The HUD never computes a rent figure of its own.
 */
function scoreOf(p, game) {
  if (typeof p.scoringRentRoll === 'function' && game) return p.scoringRentRoll(game);
  if (typeof p.annualRentRoll === 'function') return p.annualRentRoll();
  return null;
}

/** The gross roll the score is struck from — the same figure before interest. */
function grossOf(p, game) {
  if (typeof p.grossScoringRentRoll === 'function' && game) return p.grossScoringRentRoll(game);
  if (typeof p.annualRentRoll === 'function') return p.annualRentRoll();
  return null;
}

/**
 * A year of interest on the outstanding debt: the part of the gross roll that
 * never reaches the score. Built by the same operation and the same declared
 * rate the engine charges, so the two cannot drift apart.
 */
function debtServiceOf(p, game) {
  if (!p || !p.debt || p.debt.amount <= 0) return null;
  const rate = game && game.assumptions ? game.assumptions.debtInterestPct : null;
  if (!rate) return null;
  return p.debt.scale(rate / 100, 'assumptions.debtInterestPct', 'annual debt service');
}

/**
 * Every colour group, with how much of this player holds. `remaining` is
 * what it would still take to assemble the group and double its rent — the
 * fact the panel never admitted and the reason nobody ever assembled one.
 */
function groupStandings(p, game) {
  const owned = new Set(p.owned || []);
  return F.groups().map((grp) => {
    const inGroup = F.streets().filter((s) => s.group === grp.id);
    const held = inGroup.filter((s) => owned.has(s.id)).length;
    const complete = game && typeof game.hasAssembly === 'function'
      ? game.hasAssembly(p.id, grp.id)
      : held === inGroup.length && inGroup.length > 0;
    return { grp, held, size: inGroup.length, remaining: inGroup.length - held, complete };
  });
}

/** How many colour groups this player holds outright. */
function assemblyCount(p, game) {
  return groupStandings(p, game).filter((s) => s.complete).length;
}

/**
 * What this street would do to the player's score, taken both ways.
 *
 * The arithmetic is the ENGINE's, not a second implementation of it: a
 * projected ownership map is handed to a stand-in that answers hasAssembly
 * against it, and the player's own scoring methods are run on a ghost holding
 * one more street and, optionally, one more charge. If the engine's economy
 * changes again this moves with it. Returns null rather than guessing if the
 * accessors are not there.
 */
function projectAcquisition(game, player, streetId, geared, debtAdded) {
  try {
    if (typeof player.scoringRentRoll !== 'function') return null;
    const owns = new Map(game.ownerOf);
    owns.set(streetId, player.id);
    const view = {
      assumptions: game.assumptions,
      hasAssembly: (pid, groupId) => {
        const inGroup = F.streets().filter((s) => s.group === groupId);
        return inGroup.length > 0 && inGroup.every((s) => owns.get(s.id) === pid);
      },
    };
    const ghost = Object.create(Object.getPrototypeOf(player));
    ghost.id = player.id;
    ghost.owned = player.owned.concat(streetId);
    ghost.debt = geared && debtAdded ? player.debt.add(debtAdded) : player.debt;
    return {
      net: ghost.scoringRentRoll(view),
      gross: typeof ghost.grossScoringRentRoll === 'function'
        ? ghost.grossScoringRentRoll(view) : null,
    };
  } catch {
    return null;   // an engine that has moved on: show the offer without a forecast
  }
}

/**
 * Write a monetary value into an element and tag it so the load-time gate can
 * trace it. A single fact-file leaf gets its dotted path on data-fact; anything
 * built by arithmetic — a cash balance, a rent roll, a net worth — is running
 * game state and gets data-money="derived".
 */
function putMoney(node, m, { compact = false, historic = false, where = 'hud' } = {}) {
  /* 1935 board prices are plain pounds and are never abbreviated. */
  const fmt = historic ? fmt1935 : (compact ? fmtCompact : fmtPlain);
  const text = fmt(m.amount);
  const leaves = [...m.leaves()];
  if (m.op === 'fact' && leaves.length === 1) node.setAttribute('data-fact', leaves[0]);
  else node.setAttribute('data-money', 'derived');
  node.classList.add('ll-num');
  node.classList.toggle('ll-zero', m.amount === 0);
  /* Only register a value the first time it reaches the screen. update() runs
     on every state change, and the integrity registry is an audit trail, not a
     frame log. */
  if (node.textContent !== text) node.textContent = registry.record(text, { money: m, where });
  return node;
}

/**
 * A figure going onto one of the small plates — a stat chip or the cash pill.
 * Identical to putMoney except that it publishes the rendered string's length
 * to CSS as --vlen, which is what lets those plates set a long value smaller
 * instead of cutting it short. The renderer measures nothing and decides
 * nothing; it simply says how many characters arrived.
 */
function putPlateMoney(node, m, opts) {
  putMoney(node, m, opts);
  node.style.setProperty('--vlen', String((node.textContent || '').length));
  return node;
}

/**
 * Prose lifted verbatim out of landlord-facts.json — card bodies, the "what
 * actually happened" notes, source lines, assumption statements.
 *
 * Three attributes, each earning its place:
 *   data-fact       the dotted path the string was read from, so the sentence
 *                   itself is traceable;
 *   data-numeral-ok the dates and rates inside are part of the quotation, not
 *                   numbers this renderer computed;
 *   data-money      "derived", because a currency figure embedded in a sentence
 *                   is a quotation rather than a value the game calculated. The
 *                   gate's amount cross-check reads the `figures` index of the
 *                   fact base, and that index does not capture every figure that
 *                   appears in the prose (see the report accompanying this
 *                   file). Mangling a quoted source sentence to satisfy an index
 *                   would be the worse failure of the two.
 *
 * Nothing in this function can print a figure the fact base does not contain:
 * the string is passed straight through, never assembled.
 */
function factProse(cls, text, path) {
  return h('p', {
    class: cls, 'data-fact': path, 'data-numeral-ok': true, 'data-money': 'derived', text,
  });
}

/* ══════════════════════════════════════════════════════════════ the HUD ═══ */

export function createHud(opts = {}) {
  const {
    root,
    game,
    onRoll = () => {},
    onDecide = () => {},
    onEndTurn = () => {},
    onOpenProperty = () => {},
    onOpenSources = null,
  } = opts;

  if (!root) throw new Error('createHud requires a root element');

  let g = game;
  const timers = new Set();
  const listeners = [];
  const observers = [];
  let destroyed = false;
  let rollAnim = null;
  let lastFocus = null;
  let restarting = false;

  const after = (ms, fn) => {
    const t = setTimeout(() => { timers.delete(t); if (!destroyed) fn(); }, ms);
    timers.add(t);
    return t;
  };
  const on = (target, type, fn, o) => {
    target.addEventListener(type, fn, o);
    listeners.push([target, type, fn, o]);
  };

  /* ------------------------------------------------------------ scaffold */

  /* One owned element. Nothing of ours is ever a direct child of `root`, so a
     host rule such as `#hud > *` can only ever reach this single node. */
  const layer = h('div', { class: 'll-hud' });
  const style = h('style', { 'data-integrity-ignore': true, text: CSS });
  layer.append(style);
  root.append(layer);

  /*
   * Screen readers cannot see a canvas, so turn state is mirrored here. Every
   * string written into it is a repeat of text already rendered — and already
   * tagged — on a plate elsewhere in the HUD, so the region declares itself as
   * carrying no independent value.
   */
  const live = h('div', {
    class: 'll-sr', 'aria-live': 'polite', 'aria-atomic': 'true',
    'data-money': 'derived', 'data-numeral-ok': true,
  });

  const panelsRow = h('div', { class: 'll-panels' });
  const panelViews = [];

  const beatEyebrow = h('div', { class: 'll-beat-eyebrow' });
  const beatHead = h('div', { class: 'll-beat-head' });
  const beatSub = h('div', { class: 'll-beat-sub' });
  /* The phone's compressed instruction line. Exactly one of the two is in the
     box tree at any width, so nothing is announced twice. */
  const beatShort = h('div', { class: 'll-beat-short' });
  const beat = h('div', { class: 'll-beat' },
    h('div', { class: 'll-beat-strings' }, h('i'), h('i')),
    h('div', { class: 'll-beat-plate' }, beatEyebrow, beatHead, beatSub, beatShort));

  /* Identity left, prompt right — one strip, so they can never collide. */
  const topStrip = h('div', { class: 'll-top' }, panelsRow, beat);

  /* ------------------------------------------------------------ left rail */

  /*
   * ONE list of secondary functions, rendered two ways. On a desktop frame it is
   * the icon rail the teardown calls for. On a phone a six-icon vertical rail is
   * a desktop sidebar wearing a costume, so the whole thing collapses into a
   * single 56px overflow button in the bottom-left thumb zone which opens these
   * same entries as a bottom sheet with full-width rows. Nothing here touches
   * game state.
   */
  const MENU = [
    { glyph: GLYPH.sources, label: 'Where these figures come from',
      run: () => (onOpenSources ? onOpenSources() : openSources()) },
    /* Shown only if the shell supplies somewhere for it to go. */
    typeof opts.onOpenChart === 'function'
      ? { glyph: GLYPH.chart, label: 'Nineteen thirty-five against today',
          run: () => opts.onOpenChart() }
      : null,
    { glyph: GLYPH.rules, label: 'How to play', run: openRules },
    { glyph: GLYPH.ledger, label: 'The ledger', run: openLedger },
    /*
     * Named for what it actually does. It was called "Text size", which is a
     * promise it cannot keep: it multiplies the rem-based sizes in this
     * stylesheet, and the street names on the board are baked into WebGL
     * textures by scene.js, which exports no setter for their type scale — so
     * the smallest type on the screen is the one type this control cannot
     * touch. The honest label is the narrower one.
     */
    { glyph: GLYPH.textScale, label: 'Text size — panels and menus', run: cycleTextScale },
    { glyph: GLYPH.restart, label: 'Start again', run: requestRestart },
  ].filter(Boolean);

  const rail = h('div', { class: 'll-rail' },
    MENU.map((item) => h('button', {
      type: 'button', 'aria-label': item.label, title: item.label,
      html: item.glyph, onclick: item.run,
    })));

  const moreBtn = h('button', {
    class: 'll-more', type: 'button', 'aria-label': 'More — sources, rules, ledger',
    title: 'More', html: GLYPH.more, onclick: openMenu,
  });

  /** The rail's contents as a bottom sheet, for phone frames. */
  function openMenu() {
    const { card, body } = cardShell('More', '#4E413A');
    body.append(h('h2', { class: 'll-h1', text: 'Sources, rules and the ledger' }));
    const rows = h('div', { class: 'll-rows' });
    for (const item of MENU) {
      const row = h('button', { class: 'll-menu-row', type: 'button' },
        h('span', { class: 'll-menu-ico', html: item.glyph }),
        h('b', { text: item.label }));
      row.addEventListener('click', () => { closeSheet(); item.run(); });
      rows.append(row);
    }
    body.append(rows);
    card.append(h('div', { class: 'll-choices' },
      h('button', { class: 'll-choice ll-choice-pass', type: 'button', onclick: closeSheet },
        h('span', {}, h('strong', { text: 'Close' })))));
    openSheet(card);
  }

  /* ------------------------------------------------- dice + action cluster */

  const dieA = h('div', { class: 'll-die is-idle', style: '--rot:-5deg', html: dieFaceSvg(1) });
  const dieB = h('div', { class: 'll-die is-idle', style: '--rot:6deg', html: dieFaceSvg(1) });
  const diceTotal = h('div', {
    class: 'll-total is-idle ll-num', 'data-numeral-ok': true, 'aria-hidden': 'true',
  });
  const dice = h('div', { class: 'll-dice', role: 'img', 'aria-label': 'Dice' },
    dieA, dieB, diceTotal);

  /*
   * The 3D scene is being given a real physical roll. If it has one it owns the
   * dice OUTRIGHT: the flat plates are taken out of the document rather than
   * merely hidden, because two dice showing the same number in two places is
   * worse than either on its own, and the space they were holding at the bottom
   * of a phone frame is the board's. If the scene has no roll — an older build,
   * a host with no WebGL, a module that failed to load — the HUD dice stay and
   * do the job, which is the point of keeping the fallback.
   */
  let sceneDice = opts.sceneOwnsDice === true;
  let sceneRoll = typeof opts.rollDice === 'function' ? opts.rollDice : null;

  function standDownDice() {
    layer.classList.add('ll-scene-dice');
    if (dice.parentNode) dice.remove();
  }
  if (sceneDice) standDownDice();
  import('./scene.js').then((mod) => {
    if (destroyed || !mod || !mod.sceneOwnsDice) return;
    sceneDice = true;
    if (!sceneRoll && typeof mod.rollDice === 'function') sceneRoll = mod.rollDice;
    standDownDice();
  }).catch(() => { /* no scene module in this host: keep the HUD dice */ });

  const secondaryBtn = h('button', {
    class: 'll-btn ll-btn-secondary', type: 'button', 'aria-label': 'The Register — your holdings',
  }, h('span', { class: 'll-btn-face', html: GLYPH.register }),
  h('span', { class: 'll-btn-label', text: 'Register' }));
  secondaryBtn.addEventListener('click', openRegister);

  const primaryIcon = h('span', { class: 'll-btn-face', html: GLYPH.dice });
  const primaryLabel = h('span', { class: 'll-btn-label', text: 'Roll' });
  const primaryBtn = h('button', {
    class: 'll-btn ll-btn-primary', type: 'button', 'aria-label': 'Roll the dice',
  }, primaryIcon, primaryLabel);
  primaryBtn.addEventListener('click', firePrimary);

  /* `sceneDice` may already be true from opts, in which case the flat dice are
     never mounted in the first place; the async path removes them instead. */
  const action = h('div', { class: 'll-action' },
    sceneDice ? null : dice, h('div', { class: 'll-btns' }, secondaryBtn, primaryBtn));

  const toasts = h('div', { class: 'll-toasts' });
  const sheetHost = h('div', { class: 'll-sheet-host' });

  /* ------------------------------------------------------ attribution strip */

  /*
   * The Open Government Licence credit is required by the brief and cannot be
   * deleted, but the eight-paragraph markup footer clipped mid-sentence and
   * painted over every bottom sheet. This is the replacement: the HM Land
   * Registry sentence verbatim from the fact base on one compact opaque plate,
   * inside the HUD's own stacking order, plus a link to the sheet carrying the
   * remaining statements — the route OGL v3 provides for exactly this case.
   */
  const footLink = h('button', {
    class: 'll-foot-link', type: 'button', text: 'All sources and licences',
    onclick: () => (onOpenSources ? onOpenSources() : openSources()),
  });
  const foot = h('div', { class: 'll-foot' },
    factProse('ll-foot-t', F.attribution().hmlr, 'attribution.hmlr'),
    footLink);

  layer.append(live, topStrip, rail, moreBtn, action, toasts, foot, sheetHost);

  /* Reserve exactly the strip's own height out of the bottom of the HUD, so no
     control can ever sit on it and it can never sit on a control. */
  function measureFoot() {
    if (destroyed) return;
    const px = Math.ceil(foot.getBoundingClientRect().height);
    if (px > 0) layer.style.setProperty('--attrib-h', `${px}px`);
  }
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(measureFoot);
    ro.observe(foot);
    observers.push(ro);
  } else {
    on(window, 'resize', measureFoot);
  }
  requestAnimationFrame(measureFoot);

  /*
   * The shell's overlay brings its own close control, and it was landing on top
   * of a player panel. While that overlay is open the HUD stands down entirely,
   * which removes the collision and every other overlap with it at once.
   */
  /*
   * The other half of the shell's overlay problem, and it is a measurement.
   * The shell pins its close control above the panel's scroll port and pulls
   * the port up under it, so a heading scrolled to the top of that port is
   * sliced through the glyphs — which is exactly what a critic saw happen to
   * "How far apart the two eras are" in the 1935-against-2026 chart. panel.js
   * reserves the room on every heading and reads the amount from
   * --ll-sticky-head; publishing that number is this file's side of the deal.
   * It is measured rather than assumed, so it stays right if the shell's
   * control is ever restyled, and it is published on the document element so
   * it reaches panels the HUD does not own.
   */
  function measureStickyHead() {
    if (destroyed || !shellOverlay) return;
    const headEl = shellOverlay.querySelector('.overlay-close');
    if (!headEl) return;
    const r = headEl.getBoundingClientRect();
    if (!r.height) return;
    const cs = getComputedStyle(headEl);
    const top = parseFloat(cs.marginTop) || 0;
    const pull = Math.max(0, -(parseFloat(cs.marginBottom) || 0));
    document.documentElement.style.setProperty(
      '--ll-sticky-head', `${Math.ceil(r.height + top + pull)}px`);
  }

  const shellOverlay = document.getElementById('overlay');
  if (shellOverlay && typeof MutationObserver === 'function') {
    const sync = () => {
      layer.classList.toggle('is-overlaid',
        shellOverlay.classList.contains('open') || shellOverlay.childElementCount > 0);
      measureStickyHead();
    };
    const mo = new MutationObserver(sync);
    mo.observe(shellOverlay, { attributes: true, childList: true, attributeFilter: ['class'] });
    observers.push(mo);
    sync();
  }

  /* ------------------------------------------------ the rail's tab order */

  /*
   * SIX INVISIBLE CONTROLS, ONE OF THEM DESTRUCTIVE. The rail is a desktop
   * sidebar; on a touch frame the CSS collapses it and the single overflow
   * button takes over. A rule in a stylesheet is not a guarantee though — the
   * host is not obliged to stay layered, one `display:flex` landing on .ll-rail
   * from outside would put six controls a player cannot see back into the tab
   * order, and the last of them restarts the game. So the state is asserted on
   * the ELEMENTS as well: `inert` takes a subtree out of the tab order, out of
   * the accessibility tree and out of hit-testing at once, which is what a
   * keyboard or switch-control user is owed. Whichever of the two surfaces is
   * standing down is inert; exactly one of them is ever live.
   */
  const RAIL_COLLAPSES = '(max-width:760px), (max-height:520px)';
  function syncRailReach() {
    const collapsed = typeof matchMedia === 'function'
      ? matchMedia(RAIL_COLLAPSES).matches : false;
    for (const [el, hidden] of [[rail, collapsed], [moreBtn, !collapsed]]) {
      el.inert = hidden;                       // ignored by very old engines
      if (hidden) el.setAttribute('inert', '');
      else el.removeAttribute('inert');
      el.setAttribute('aria-hidden', hidden ? 'true' : 'false');
      for (const b of el.matches('button') ? [el] : el.querySelectorAll('button')) {
        /* The belt to inert's braces: a negative tabindex keeps the control out
           of sequential focus even where `inert` is not implemented. */
        if (hidden) b.setAttribute('tabindex', '-1');
        else b.removeAttribute('tabindex');
      }
    }
  }
  if (typeof matchMedia === 'function') {
    const mq = matchMedia(RAIL_COLLAPSES);
    on(mq, 'change', syncRailReach);
  }
  on(window, 'resize', syncRailReach);
  syncRailReach();

  /* ------------------------------------------------------- text scaling */

  /*
   * Browser pinch-zoom is suppressed on a game surface, so we owe the player a
   * text-scale control of our own (touch.json §13). It multiplies rem-based
   * sizes rather than touching html{font-size}, which would override the
   * player's own browser preference.
   */
  const SCALES = [1, 1.15, 1.3];
  /* Said in words rather than as a percentage, because a percentage invites the
     question "of what" and the answer is not the whole screen. */
  const SCALE_NAMES = ['Standard', 'Larger', 'Largest'];
  let scaleIdx = 0;
  try {
    const stored = Number(localStorage.getItem('ll.uiScale'));
    const i = SCALES.indexOf(stored);
    if (i >= 0) scaleIdx = i;
  } catch { /* private browsing: fall back to the default scale */ }
  applyTextScale();

  function applyTextScale() {
    document.documentElement.style.setProperty('--ui-scale', String(SCALES[scaleIdx]));
  }
  function cycleTextScale() {
    scaleIdx = (scaleIdx + 1) % SCALES.length;
    applyTextScale();
    try { localStorage.setItem('ll.uiScale', String(SCALES[scaleIdx])); } catch { /* ignore */ }
    /* The scope is stated every time it changes, so nobody taps it three times
       waiting for the board's own labels to grow. They will not: they are baked
       into the board's textures and scene.js publishes no way to re-bake them. */
    toast(`Panel and menu text: ${SCALE_NAMES[scaleIdx]}. The board's own labels are fixed.`,
      'info');
  }

  /* ------------------------------------------------------- panel building */

  function buildPanel(player, seat) {
    const skin = playerSkin(player.colour);
    const styleVars = `--pc:${skin.base};--pc-lit:${skin.lit};--pc-deep:${skin.deep};`
      + `--pc-dark:${skin.dark};--pc-ink:${skin.ink};`;

    /* Cash: the secondary figure, and it says the word "cash". */
    const badgeV = h('b', { class: 'll-num' });
    const badge = h('div', { class: 'll-badge', title: 'Cash in hand' },
      h('i', { text: 'Cash' }), badgeV);
    const portrait = h('div', { class: 'll-portrait', html: GLYPH.avatar[seat % GLYPH.avatar.length] });
    portrait.append(h('div', {
      class: 'll-swatch', html: GLYPH.avatar[seat % GLYPH.avatar.length],
    }));

    const nameT = h('div', { class: 'll-name-t', title: player.name, text: player.name });
    const name = h('div', { class: 'll-name' },
      h('div', { class: 'll-name-out' }, h('div', { class: 'll-name-in' }, nameT)));
    /*
     * The name plate and the cash chip are SIBLINGS in one row. On a desktop
     * frame the chip is lifted out of that row by position:absolute and perched
     * on the portrait, exactly as measured; on a phone it stays put and the two
     * share the row. That is the whole of the collision fix — the chip is no
     * longer free-floating over a box it knows nothing about.
     */
    const head = h('div', { class: 'll-head' }, name, badge);

    /*
     * The headline figure: the annual rent roll NET of debt service, because
     * that is the score. Directly beneath it, whenever there is debt, the sum
     * that produced it — gross rent less the year's interest. A geared player
     * can see what the bank is taking out of the number they are judged on.
     */
    const scoreV = h('div', { class: 'll-score-v ll-num' });
    const netGross = h('b', { class: 'll-num' });
    const netService = h('i', { class: 'll-num' });
    const netLine = h('div', {
      class: 'll-score-net', 'data-money': 'derived', 'data-numeral-ok': true,
    }, netGross, ' gross − ', netService, ' interest');
    const assembly = h('span', { class: 'll-assembly' });
    const score = h('div', {
      class: 'll-score',
      title: 'Net annual rent roll — gross rent less a year of debt service. This is the score.',
    },
    h('span', { class: 'll-score-tab' }),
    h('div', { class: 'll-score-c' },
      h('div', { class: 'll-score-l', text: 'Net rent roll a year' }), scoreV, netLine),
    assembly);

    /* Site assembly progress, one chip per colour group with a stake in it. */
    const groups = h('div', { class: 'll-groups', 'data-numeral-ok': true });

    const mkPennant = (glyph, label) => {
      const v = h('span', { class: 'll-pennant-v' });
      return {
        v,
        node: h('div', { class: 'll-pennant', title: label, 'aria-label': label },
          h('span', { html: glyph }),
          h('span', { class: 'll-pennant-c' },
            h('span', { class: 'll-pennant-l', text: label }), v)),
      };
    };
    const pStreets = mkPennant(GLYPH.streets, 'Streets');
    const pWorth = mkPennant(GLYPH.worth, 'Net worth');
    const pDebt = mkPennant(GLYPH.debt, 'Debt');

    const turnGlyph = h('button', {
      class: 'll-turnglyph', type: 'button', 'aria-label': 'Take your turn', html: GLYPH.dice,
    });
    turnGlyph.addEventListener('click', firePrimary);

    const stats = h('div', { class: 'll-stats' }, pStreets.node, pWorth.node, pDebt.node);

    const panel = h('div', { class: 'll-panel', style: styleVars, 'data-player': seat },
      h('div', { class: 'll-chev' }),
      h('div', { class: 'll-frame' }, portrait,
        h('div', { class: 'll-col' }, head, score, stats, groups)));

    return {
      panel, badgeV, scoreV, netLine, netGross, netService, assembly, groups,
      nameT, stats, turnGlyph,
      streets: pStreets.v, worth: pWorth.v, debt: pDebt.v, skin,
    };
  }

  /* ------------------------------------------------------------- rendering */

  function update(next) {
    if (destroyed) return;
    if (next) g = next;
    if (!g) return;

    /* Build the panels once, then only ever write values into them. */
    if (panelViews.length !== g.players.length) {
      panelsRow.textContent = '';
      panelViews.length = 0;
      g.players.forEach((p, i) => {
        const v = buildPanel(p, i);
        panelViews.push(v);
        panelsRow.append(v.panel);
      });
    }

    g.players.forEach((p, i) => {
      const v = panelViews[i];
      const active = i === g.current && g.phase !== 'over';

      v.panel.setAttribute('data-active', active ? '1' : '0');
      v.panel.setAttribute('data-out', p.bankrupt ? '1' : '0');
      v.nameT.textContent = p.name;
      v.nameT.title = p.name;

      /* The panel abbreviates; The Register always carries the full figure. */

      /* Primary: the annual rent roll, net of debt service, with site assembly
         counted. Below it, the subtraction — but only where there is one. */
      const roll = scoreOf(p, g);
      if (roll) putMoney(v.scoreV, roll, { compact: true, where: `panel[${i}].rentRoll` });
      v.scoreV.classList.toggle('is-neg', !!roll && roll.isNegative);

      const gross = grossOf(p, g);
      const service = debtServiceOf(p, g);
      const showsSum = !!(gross && service && service.amount > 0);
      v.netLine.style.display = showsSum ? '' : 'none';
      if (showsSum) {
        putMoney(v.netGross, gross, { compact: true, where: `panel[${i}].grossRentRoll` });
        putMoney(v.netService, service, { compact: true, where: `panel[${i}].debtService` });
      }

      const assembled = assemblyCount(p, g);
      v.assembly.style.display = assembled ? '' : 'none';
      if (assembled) {
        v.assembly.textContent = assembled === 1 ? 'Assembled' : 'Assembled sites';
        v.assembly.title = 'A whole colour group held: that group’s rent counts double';
      }

      renderGroups(v, p);

      /* Secondary: cash in hand, on the labelled chip. */
      putPlateMoney(v.badgeV, p.cash, { compact: true, where: `panel[${i}].cash` });

      /* A count, not a currency: declared structural under displayAllowlist. */
      v.streets.textContent = String(p.owned.length);
      v.streets.setAttribute('data-numeral-ok', '');
      v.streets.style.setProperty('--vlen', String(v.streets.textContent.length));
      v.streets.classList.toggle('ll-zero', p.owned.length === 0);

      /* Net worth only breaks a tie, so it sits on a pennant and is named. */
      putPlateMoney(v.worth, p.netWorth(), { compact: true, where: `panel[${i}].netWorth` });
      putPlateMoney(v.debt, p.debt, { compact: true, where: `panel[${i}].debt` });

      /* The turn glyph exists on the active panel and nowhere else. */
      const wants = active && !p.isAI && (g.phase === 'awaiting-roll' || g.phase === 'resolving');
      const waiting = active && p.isAI;
      if (active) {
        if (!v.turnGlyph.isConnected) v.stats.append(v.turnGlyph);
        v.turnGlyph.disabled = !wants;
        v.turnGlyph.classList.toggle('is-waiting', waiting);
        v.turnGlyph.innerHTML = g.phase === 'resolving' ? GLYPH.endTurn : GLYPH.dice;
      } else if (v.turnGlyph.isConnected) {
        v.turnGlyph.remove();
      }
    });

    renderBeat();
    renderAction();
    renderDice();
  }

  /**
   * The assembly strip. One chip per colour group the player has any stake in,
   * carrying how much of the group they hold — and, once it is whole, the fact
   * that its rent now counts double. Rebuilt only when the holdings actually
   * change, so update() can run as often as it likes.
   */
  function renderGroups(v, p) {
    const standings = groupStandings(p, g).filter((s) => s.held > 0);
    const sig = standings.map((s) => `${s.grp.id}:${s.held}/${s.size}`).join(',');
    if (v.groups.dataset.sig === sig) return;
    v.groups.dataset.sig = sig;
    v.groups.textContent = '';
    for (const s of standings) {
      const label = s.complete
        ? `${s.grp.name}: the whole group is held, so its rent counts double`
        : `${s.grp.name}: ${s.held} of ${s.size} held, ${s.remaining} more to double the rent`;
      v.groups.append(h('span', {
        class: 'll-group', role: 'img', style: `--gc:${s.grp.colour}`,
        'data-done': s.complete ? '1' : '0',
        'data-near': !s.complete && s.remaining === 1 ? '1' : '0',
        title: label, 'aria-label': label,
      }, h('i'), s.complete ? '×2' : `${s.held}/${s.size}`));
    }
  }

  /**
   * The banner always names whose turn it is, and it never issues an
   * instruction to the player while somebody else is deciding. It also never
   * asks for an input that does not exist: the turn closes itself, so it says
   * so rather than inviting a tap on a control that is about to vanish.
   *
   * The count is stated in ROUNDS and only in rounds. A round is a turn each,
   * so the same game is equally truthfully described in turns — but showing
   * both reads as a contradiction, and the player is owed one number.
   */
  function renderBeat() {
    const p = g.player;
    const human = p && !p.isAI;
    const who = human ? 'You' : p.name;
    let eyebrow = `Round ${g.round} of ${g.roundsTotal}`;
    let head = human ? 'Your turn' : `${p.name}’s turn`;
    let sub = '';
    /*
     * The phone's second line, and the rule for when it exists at all. When the
     * player is the one being asked to act, the glowing button in the thumb
     * corner already carries the instruction in one word — ROLL, END TURN — so
     * repeating it in a paragraph three inches away buys nothing and costs a
     * whole line of board. The line therefore survives only where it says
     * something no control does: what the other side is doing, and how the
     * game is won. Left empty it is removed from the box tree by :empty.
     */
    let short = '';

    switch (g.phase) {
      case 'awaiting-roll':
        sub = human ? 'Roll two dice and move clockwise.' : `${who} is reading the market.`;
        short = human ? '' : `${who} is reading the market.`;
        break;
      case 'moving':
        sub = `${who} ${human ? 'are' : 'is'} moving round the board.`;
        short = human ? '' : `${who} is moving.`;
        break;
      case 'awaiting-decision':
        sub = human ? 'A street is on offer. Buy it outright, borrow against it, or pass.'
          : `${who} is weighing up a street.`;
        short = human ? '' : `${who} is weighing up.`;
        break;
      case 'resolving':
        sub = human ? 'Settling up, then the turn closes itself.' : `${who} is settling up.`;
        short = human ? '' : `${who} is settling up.`;
        break;
      case 'over':
        eyebrow = 'The wind-up'; head = 'Final positions';
        sub = 'The largest rent roll after debt service wins.';
        short = 'Largest rent roll after debt service wins.';
        break;
      default: break;
    }
    beatEyebrow.textContent = eyebrow;
    beatEyebrow.setAttribute('data-numeral-ok', '');   // round counter, structural
    beatHead.textContent = head;
    beatSub.textContent = sub;
    beatShort.textContent = short;
    live.textContent = `${head}. ${sub}`;
  }

  function renderAction() {
    const p = g.player;
    const human = p && !p.isAI;
    let label = 'Roll';
    let aria = 'Roll the dice';
    let glyph = GLYPH.dice;
    let enabled = false;

    if (g.phase === 'over') {
      label = 'Again'; aria = 'Start again'; glyph = GLYPH.restart; enabled = true;
    } else if (g.phase === 'awaiting-roll') {
      enabled = human;
    } else if (g.phase === 'resolving') {
      label = 'End turn'; aria = 'End your turn'; glyph = GLYPH.endTurn; enabled = human;
    }

    primaryLabel.textContent = label;
    primaryBtn.setAttribute('aria-label', aria);
    if (primaryIcon.dataset.glyph !== label) {
      primaryIcon.innerHTML = glyph;
      primaryIcon.dataset.glyph = label;
    }
    primaryBtn.disabled = !enabled;
    secondaryBtn.disabled = false;
  }

  function renderDice() {
    if (rollAnim) return;                  // an animation owns the dice just now
    const r = g.lastRoll;
    const idle = !r;
    dieA.classList.toggle('is-idle', idle);
    dieB.classList.toggle('is-idle', idle);
    dieA.innerHTML = dieFaceSvg(r ? r.d1 : 1);
    dieB.innerHTML = dieFaceSvg(r ? r.d2 : 1);
    setTotal(r);
    dice.setAttribute('aria-label', r ? `Dice: ${r.d1} and ${r.d2}` : 'Dice');
  }

  /** The total, on its own chip, so the player never adds up two pips himself. */
  function setTotal(r) {
    diceTotal.classList.toggle('is-idle', !r);
    if (r) diceTotal.textContent = String(r.total !== undefined ? r.total : r.d1 + r.d2);
  }

  /* ------------------------------------------------------------- actions */

  function firePrimary() {
    if (!g) return;
    if (g.phase === 'over') return requestRestart();
    if (g.phase === 'awaiting-roll') return onRoll();
    if (g.phase === 'resolving') return onEndTurn();
    return undefined;
  }

  /**
   * Restart, and actually restart. Three controls offer it — the action bar,
   * the wind-up sheet and the overflow menu — and all three previously fired an
   * event nothing was listening for, so the only way to play again was to
   * reload the page by hand.
   *
   * The ladder, in order of preference:
   *   1. the onRestart callback the shell passes in;
   *   2. a restart hook the shell has published on window;
   *   3. a cancelable DOM event — a listener that handles it calls
   *      preventDefault(), which is how it tells us it did;
   *   4. reloading the document, which always works.
   * The last rung is the point: this control can no longer do nothing.
   */
  function requestRestart() {
    /* Same idempotency argument as the offer buttons, and a stronger case: this
       one is destructive, it is offered from three separate controls, and a
       second run part-way through a rebuild tears down the session the first
       run has just created. One restart per HUD; the new HUD gets a fresh flag. */
    if (restarting) return true;
    restarting = true;
    closeSheet();
    if (typeof opts.onRestart === 'function') { opts.onRestart(); return true; }

    const hook = typeof window !== 'undefined' && window.__landlord
      && typeof window.__landlord.restart === 'function' ? window.__landlord.restart : null;
    if (hook) { hook(); return true; }

    const ev = new CustomEvent('landlord:restart', { bubbles: true, cancelable: true });
    const unhandled = root.dispatchEvent(ev);      // false once a listener cancels it
    if (!unhandled) return true;

    toast('Starting a fresh board…', 'event');
    after(180, () => window.location.reload());
    return true;
  }

  /* --------------------------------------------------------- dice rolling */

  /**
   * Animate a roll. Returns a promise that settles once the dice have landed,
   * so the caller can hold the token move until the result is legible.
   */
  function showRoll(d1, d2) {
    if (destroyed) return Promise.resolve();

    /* The scene owns the roll: announce it for screen readers and stand aside. */
    if (sceneDice) {
      announceRoll(d1, d2);
      if (!sceneRoll) return Promise.resolve();
      try { return Promise.resolve(sceneRoll(d1, d2)).catch(() => {}); }
      catch { return Promise.resolve(); }
    }

    const quick = reduceMotion();
    dieA.classList.remove('is-idle', 'is-settled');
    dieB.classList.remove('is-idle', 'is-settled');
    diceTotal.classList.add('is-idle');

    if (quick) {
      dieA.innerHTML = dieFaceSvg(d1);
      dieB.innerHTML = dieFaceSvg(d2);
      setTotal({ d1, d2, total: d1 + d2 });
      announceRoll(d1, d2);
      return Promise.resolve();
    }

    dieA.classList.add('is-rolling');
    dieB.classList.add('is-rolling');

    return new Promise((resolve) => {
      const started = performance.now();
      const DURATION = 780;
      let lastSwap = 0;
      const step = (now) => {
        if (destroyed) return resolve();
        const t = now - started;
        if (t - lastSwap > 62) {
          lastSwap = t;
          dieA.innerHTML = dieFaceSvg(1 + Math.floor(Math.random() * 6));
          dieB.innerHTML = dieFaceSvg(1 + Math.floor(Math.random() * 6));
        }
        if (t < DURATION) { rollAnim = requestAnimationFrame(step); return; }

        rollAnim = null;
        dieA.classList.remove('is-rolling');
        dieB.classList.remove('is-rolling');
        dieA.innerHTML = dieFaceSvg(d1);
        dieB.innerHTML = dieFaceSvg(d2);
        dieA.classList.add('is-settled');
        dieB.classList.add('is-settled');
        setTotal({ d1, d2, total: d1 + d2 });
        announceRoll(d1, d2);
        after(340, () => {
          dieA.classList.remove('is-settled');
          dieB.classList.remove('is-settled');
        });
        resolve();
        return undefined;
      };
      rollAnim = requestAnimationFrame(step);
    });
  }

  function announceRoll(d1, d2) {
    dice.setAttribute('aria-label', `Dice: ${d1} and ${d2}`);
    live.textContent = `Rolled ${d1} and ${d2}.`;
    if (navigator.vibrate) navigator.vibrate(10);
  }

  /* ------------------------------------------------------------- sheets */

  function closeSheet() {
    sheetHost.textContent = '';
    if (lastFocus && lastFocus.isConnected) lastFocus.focus();
    lastFocus = null;
  }

  function openSheet(card, { dismissible = true } = {}) {
    lastFocus = document.activeElement;
    const scrim = h('div', { class: 'll-scrim', role: 'dialog', 'aria-modal': 'true' }, card);
    if (dismissible) {
      scrim.addEventListener('click', (e) => { if (e.target === scrim) closeSheet(); });
    }
    sheetHost.textContent = '';
    sheetHost.append(scrim);
    const focusable = card.querySelector('button');
    if (focusable) focusable.focus({ preventScroll: true });
    return scrim;
  }

  on(document, 'keydown', (e) => {
    if (e.key !== 'Escape') return;
    const open = sheetHost.querySelector('.ll-scrim');
    if (open && open.dataset.locked !== '1') closeSheet();
  });

  /** A card shell: coloured band, title, close control, scrolling body. */
  function cardShell(bandLabel, bandColour, { closable = true } = {}) {
    const band = h('div', {
      class: 'll-card-band',
      style: `--band:${bandColour};--band-lit:${mix(bandColour, '#FFFFFF', 0.24)}`,
    }, h('b', { text: bandLabel }));
    if (closable) {
      band.append(h('button', {
        class: 'll-x', type: 'button', 'aria-label': 'Close', html: GLYPH.close, onclick: closeSheet,
      }));
    }
    const body = h('div', { class: 'll-card-body' });
    const card = h('div', { class: 'll-card' }, band, body);
    /* The band sits directly above the body's scroll port, so a heading brought
       to the top of that port must clear it. The card publishes the band's
       measured height and the CSS reserves it — same bargain as the shell's
       header, kept locally. */
    requestAnimationFrame(() => {
      if (destroyed || !card.isConnected) return;
      const px = Math.ceil(band.getBoundingClientRect().height);
      if (px > 0) card.style.setProperty('--ll-band-h', `${px}px`);
    });
    return { card, body, band };
  }

  /* ------------------------------------------------------------ the offer */

  function showOffer(pending, street) {
    if (!pending || !street) return;
    const p = g.player;
    const grp = F.groupOf(street.group) || { name: 'Atlanta', colour: '#7A6A5E' };
    const { card, body } = cardShell(grp.name, grp.colour, { closable: false });

    const priceEl = h('div', { class: 'll-hero-v' });
    putMoney(priceEl, pending.price, { where: 'offer.price' });

    const thenEl = h('span', {});
    putMoney(thenEl, F.board1935Of(street.id), { historic: true, where: 'offer.board1935' });

    const rentEl = h('b', {});
    putMoney(rentEl, F.rentOf(street.id), { where: 'offer.rent' });
    const debtEl = h('b', {});
    putMoney(debtEl, pending.debtAvail, { where: 'offer.debtAvailable' });
    const cashEl = h('b', {});
    putMoney(cashEl, pending.cashIfGeared, { where: 'offer.cashIfGeared' });

    body.append(
      h('div', { class: 'll-kicker', text: `${street.localAuthority} · unowned` }),
      h('h2', { class: 'll-h1', text: street.name }),
      h('div', { class: 'll-hero' },
        priceEl,
        h('div', { class: 'll-hero-l', text: street.value2026.basisLabel }),
        /* Rule A3: the 1935 contrast sits directly under the 2026 figure and is
           never hidden behind a tap — it is the entire thesis of the board. */
        h('div', { class: 'll-then', 'data-numeral-ok': true },
          '1935 board price', thenEl)),
    );

    /*
     * SITE ASSEMBLY, SAID OUT LOUD. Completing a colour group doubles the rent
     * on every street in it, which is the largest swing available to either
     * player — and two complete games were played without it firing once,
     * because nothing anywhere said it was in reach. The offer now leads with
     * it whenever this street is the one that would finish a group, and states
     * the standing whenever the player already holds part of one.
     */
    const standing = groupStandings(p, g).find((s) => s.grp.id === street.group);
    const completes = typeof g.wouldComplete === 'function'
      ? g.wouldComplete(p.id, street)
      : !!standing && standing.remaining === 1;

    if (completes) {
      body.append(h('div', { class: 'll-flag' }, h('i'),
        h('div', {},
          h('b', { text: `This completes the ${grp.name} group` }),
          h('em', { 'data-numeral-ok': true, text:
            `Take it and every ${grp.name} street you hold pays double rent — on your`
            + ' rent roll, and on anyone who lands there — for the rest of the game.' }))));
    } else if (standing && standing.held > 0) {
      const after = standing.held + 1;
      body.append(h('div', { class: 'll-then', 'data-numeral-ok': true, text:
        `${grp.name}: you hold ${standing.held} of ${standing.size}. This would make `
        + `${after} — ${standing.size - after} short of doubling the group’s rent.` }));
    }

    const metrics = h('div', { class: 'll-metrics' },
      h('div', { class: 'll-metric' }, rentEl,
        h('i', { text: 'Rent a year — and what anyone landing here pays you' })),
      h('div', { class: 'll-metric' }, debtEl,
        h('i', { 'data-numeral-ok': true,
          text: `Debt available, at ${street.mortgageAssumption.ltvPct}% of value` })),
      h('div', { class: 'll-metric' }, cashEl, h('i', { text: 'Cash down if you borrow' })));

    /*
     * THE TRADE-OFF, IN THE CURRENCY THE GAME IS SCORED IN. Debt buys more
     * streets per pound of cash, and it costs interest that comes straight off
     * the score. Both consequences are shown side by side at the moment of the
     * decision, because a price and a deposit are comparable but their effects
     * on the rent roll are the thing actually being chosen between.
     */
    const nowNet = scoreOf(p, g);
    const outright = projectAcquisition(g, p, street.id, false, null);
    const geared = projectAcquisition(g, p, street.id, true, pending.debtAvail);

    const option = (heading, projected, cashCost, note, enabled, kind) => {
      if (!projected || !nowNet) return null;
      const level = h('b', {});
      putMoney(level, projected.net, { compact: true, where: `offer.${kind}.netRentRoll` });
      const delta = projected.net.sub(nowNet);
      const deltaEl = h('span', { class: 'll-num' });
      putMoney(deltaEl, delta.isNegative ? delta.abs : delta,
        { compact: true, where: `offer.${kind}.change` });
      const cashEl2 = h('span', { class: 'll-num' });
      putMoney(cashEl2, cashCost, { compact: true, where: `offer.${kind}.cash` });
      return h('div', { class: 'll-opt', 'data-off': enabled ? '0' : '1' },
        h('u', { text: `${heading} · net rent roll` }),
        level,
        h('i', { 'data-numeral-ok': true },
          delta.isNegative ? 'Down ' : 'Up ', deltaEl, ' a year. Costs ',
          cashEl2, ' of your cash. ', note,
          enabled ? null : ' You cannot afford this one.'));
    };

    const rate = g.assumptions ? g.assumptions.debtInterestPct : null;
    const opts = [
      option('Buy outright', outright, pending.price, 'No charge on the street.',
        pending.canBuyOutright, 'outright'),
      option('Buy with debt', geared, pending.cashIfGeared,
        rate ? `Interest at ${rate}% a year is charged against the score.`
          : 'Interest is charged against the score.',
        pending.canBuyGeared, 'geared'),
    ].filter(Boolean);
    /* The consequence outranks the components: the two projections sit above
       the rent/debt/cash detail, so the part of the card that decides the turn
       is the part that is on screen without scrolling. */
    if (opts.length === 2) body.append(h('div', { class: 'll-compare' }, opts));
    body.append(metrics);

    body.append(factProse('ll-source', F.sourceLine(street.id),
      `streets[${streetIndex(street.id)}].value2026`));

    /*
     * IDEMPOTENCY. These three buttons commit money, and a click handler can
     * fire twice: a double tap, a synthetic click landing on top of a real one,
     * an Enter keypress arriving with a pointer event on the same control. The
     * guard is on the DECISION, not on the button — two different buttons are
     * as dangerous as one button twice, since buying and passing on the same
     * street are both live until the sheet is torn down. One commit per offer,
     * and every control on the card is spent the moment it happens.
     */
    let committed = false;
    const choice = (cls, title, note, money, kind, enabled) => {
      const v = h('span', { class: 'll-choice-v' });
      if (money) putMoney(v, money, { where: `offer.choice.${kind}` });
      /* The note may be a sentence or a sentence with a figure set into it. */
      const em = h('em', { 'data-numeral-ok': true, 'data-money': 'derived' },
        ...(Array.isArray(note) ? note : [note]));
      const btn = h('button', {
        class: `ll-choice ${cls}`, type: 'button', disabled: !enabled,
      }, h('span', {}, h('strong', { text: title }), em), v);
      btn.addEventListener('click', () => {
        if (committed || btn.disabled) return;
        committed = true;
        for (const b of card.querySelectorAll('button')) {
          b.disabled = true;
          b.setAttribute('aria-disabled', 'true');
        }
        closeSheet();
        onDecide(kind);
      });
      return btn;
    };

    /* The consequence rides on the button itself as well as in the comparison
       above it, so the last thing read before committing is what it does to
       the score — not merely what it costs. */
    const effect = (projected, fallback) => {
      if (!projected || !nowNet) return fallback;
      const delta = projected.net.sub(nowNet);
      const el = h('span', { class: 'll-num' });
      putMoney(el, delta.isNegative ? delta.abs : delta,
        { compact: true, where: 'offer.choice.effect' });
      return [delta.isNegative ? 'Net rent roll falls by ' : 'Net rent roll rises by ',
        el, ' a year'];
    };

    card.append(h('div', { class: 'll-choices' },
      choice('ll-choice-buy', 'Buy outright',
        effect(outright, 'Cash down, no charge on the street'),
        pending.price, 'buy', pending.canBuyOutright),
      choice('ll-choice-gear', 'Buy with debt',
        effect(geared, 'Borrow against the street and pay the rest'),
        pending.cashIfGeared, 'gear', pending.canBuyGeared),
      choice('ll-choice-pass', 'Pass', 'Leave it unowned, keep the cash', null, 'pass', true)));

    const scrim = openSheet(card, { dismissible: false });
    scrim.dataset.locked = '1';
    live.textContent = `${street.name} is on offer.`;
  }

  function streetIndex(id) {
    return F.streets().findIndex((s) => s.id === id);
  }

  /* ------------------------------------------------------- an event card */

  function showEvent(cardData) {
    if (!cardData) return;
    const i = F.eventCards().findIndex((c) => c.id === cardData.id);
    const path = i >= 0 ? `eventCards[${i}]` : 'eventCards';
    const { card, body } = cardShell('The Gazette', '#3A4A5C');

    body.append(
      h('div', { class: 'll-kicker', text: cardData.category || 'Atlanta' }),
      /* Card titles are quoted from the fact base and some of them carry a
         currency figure, so the element declares its origin. */
      h('h2', {
        class: 'll-h1', 'data-fact': `${path}.title`, 'data-numeral-ok': true,
        'data-money': 'derived', text: cardData.title,
      }),
      factProse('ll-body-t', cardData.body, `${path}.body`),
    );

    if (cardData.realEvent) {
      body.append(h('div', { class: 'll-hero' },
        h('div', { class: 'll-kicker', text: 'What actually happened' }),
        factProse('ll-body-t', cardData.realEvent, `${path}.realEvent`)));
    }
    if (cardData.source) {
      const s = cardData.source;
      body.append(factProse('ll-source',
        `Source: ${s.name}${s.date ? ` · ${s.date}` : ''}`, `${path}.source`));
    }

    card.append(h('div', { class: 'll-choices' },
      h('button', {
        class: 'll-choice ll-choice-buy', type: 'button', onclick: closeSheet,
      }, h('span', {}, h('strong', { text: 'Noted' }),
        h('em', { text: 'Carry on with the turn' })))));

    openSheet(card);
    live.textContent = `Gazette: ${cardData.title}.`;
  }

  /* ----------------------------------------------------------- the result */

  /**
   * The end screen is a data presentation, so it changes register entirely and
   * follows the FT graphics standards in bench/round0/ft.json: paper tint, the
   * 60x4 black bar, a regular-weight title, horizontal ranked bars from zero,
   * direct value labels, no axis line, and a stacked source block.
   */
  function showResult(result) {
    if (!result) return;
    const { card, body } = cardShell('The wind-up', '#2A211C');
    body.classList.add('ll-ft');

    /* The chart plots what the game is actually won on: the annual rent roll
       with site assembly counted, net of debt service. Net worth is the
       tiebreak, so it is reported beside each bar rather than being the bar. */
    const rowsData = result.ranked.map((p) => ({
      p, score: scoreOf(p, g) || p.netWorth(), worth: p.netWorth(),
      gross: grossOf(p, g), service: debtServiceOf(p, g),
    }));
    const top = Math.max(...rowsData.map((r) => Math.abs(r.score.amount)), 1);
    const plot = h('div', { class: 'll-ft-plot' });

    rowsData.forEach(({ p, score, worth, gross, service }) => {
      const skin = playerSkin(p.colour);
      const pct = Math.max(0, Math.min(100, (score.amount / top) * 100));
      const val = h('div', { class: 'll-ft-val' });
      putMoney(val, score, { where: 'result.rentRoll' });
      const worthEl = h('span', {});
      putMoney(worthEl, worth, { compact: true, where: 'result.netWorth' });

      /* The bar is the NET roll, so the two terms behind it are stated rather
         than left as a discrepancy between this screen and the panel. */
      let workings = null;
      if (gross && service) {
        const grossEl = h('span', {});
        putMoney(grossEl, gross, { compact: true, where: 'result.grossRentRoll' });
        const serviceEl = h('span', {});
        putMoney(serviceEl, service, { compact: true, where: 'result.debtService' });
        workings = h('div', { class: 'll-ft-val' },
          grossEl, ' of gross rent, less ', serviceEl, ' of debt service');
      }

      plot.append(h('div', { class: 'll-ft-row', style: `--pc:${skin.base}` },
        h('div', { class: 'll-ft-cat', text: p.name }),
        h('div', { class: 'll-ft-track' },
          h('div', { class: 'll-ft-fill', style: `width:${pct.toFixed(1)}%` })),
        val,
        workings,
        h('div', { class: 'll-ft-val' }, 'Net worth, the tiebreak: ', worthEl)));
    });

    body.append(
      h('div', { class: 'll-ft-bar' }),
      h('h2', { class: 'll-ft-title', text: `${result.winner.name} finished ahead` }),
      h('p', { class: 'll-ft-sub', 'data-numeral-ok': true,
        text: 'Annual rent roll at wind-up, with a completed colour group counted twice '
          + 'over, net of a year of interest on outstanding debt' }),
      plot,
      /* FT source block order: footnote, then provider, then credit. The data
         vintage stays out of it — that belongs in the subtitle. */
      factProse('ll-ft-src', F.assumptions().winCondition, 'assumptions.winCondition'),
      h('p', { class: 'll-ft-src', 'data-numeral-ok': true, text: result.reason }),
      h('p', { class: 'll-ft-src', text: 'Source: Zillow Home Value Index (ZHVI) & U.S. Census' }),
      factProse('ll-ft-src', F.attribution().hmlr, 'attribution.hmlr'),
      h('p', { class: 'll-ft-src', text: 'Graphic: Teddy James Advisory' }),
    );

    const again = h('button', {
      class: 'll-choice ll-choice-buy', type: 'button',
    }, h('span', {}, h('strong', { text: 'Play again' }),
      h('em', { text: 'A fresh board, the same real prices' })));
    again.addEventListener('click', () => { closeSheet(); requestRestart(); });

    const sources = h('button', {
      class: 'll-choice ll-choice-pass', type: 'button',
    }, h('span', {}, h('strong', { text: 'Where these figures come from' }),
      h('em', { text: 'Every price on this board is real' })));
    sources.addEventListener('click', () => (onOpenSources ? onOpenSources() : openSources()));

    card.append(h('div', { class: 'll-choices' }, again, sources));
    openSheet(card);
    live.textContent = `${result.winner.name} finished ahead.`;
  }

  /* ------------------------------------------------- secondary sheets ---- */

  function openRegister() {
    const p = g.player;
    const { card, body } = cardShell('The Register', playerSkin(p.colour).base);
    body.append(
      h('div', { class: 'll-kicker', text: 'Proprietorship' }),
      h('h2', { class: 'll-h1', text: p.name }),
    );

    if (!p.owned.length) {
      body.append(h('p', { class: 'll-empty', text: 'No streets held. Land on one and buy it.' }));
    } else {
      const rows = h('div', { class: 'll-rows' });
      p.owned.forEach((id) => {
        const s = F.street(id);
        const grp = F.groupOf(s.group) || { colour: '#7A6A5E' };
        const v = h('span', {});
        putMoney(v, F.priceOf(id), { compact: true, where: 'register.row' });
        const row = h('button', { class: 'll-row', type: 'button' },
          h('span', { class: 'll-row-tag', style: `background:${grp.colour}` }),
          h('b', { text: s.name }), v);
        row.addEventListener('click', () => { closeSheet(); onOpenProperty(id); });
        rows.append(row);
      });
      body.append(rows);
    }

    /*
     * THE SCORE, WITH ITS WORKING SHOWN. The figure the game is won on is net
     * of debt service, so it is presented as the sum it is: a year of gross
     * rent, doubled on any colour group held whole, less a year of interest.
     * Nobody should have to infer the cost of their own gearing.
     */
    const roll = scoreOf(p, g);
    const gross = grossOf(p, g);
    const service = debtServiceOf(p, g);
    if (roll) {
      const sum = h('div', { class: 'll-sum' });
      if (gross) {
        const grossEl = h('span', {});
        putMoney(grossEl, gross, { where: 'register.grossRentRoll' });
        sum.append(h('div', { class: 'll-sum-r' },
          h('b', { text: 'Gross rent a year, assembled groups counted twice' }), grossEl));
      }
      if (service) {
        const serviceEl = h('span', {});
        putMoney(serviceEl, service, { where: 'register.debtService' });
        sum.append(h('div', { class: 'll-sum-r is-take', 'data-numeral-ok': true },
          h('b', { text: `Less debt service at ${g.assumptions.debtInterestPct}% a year` }),
          serviceEl));
      }
      const rollEl = h('span', {});
      putMoney(rollEl, roll, { where: 'register.rentRoll' });
      sum.append(h('div', { class: `ll-sum-r is-tot${roll.isNegative ? ' is-take' : ''}` },
        h('b', { text: 'Net rent roll — the game is won on this figure' }), rollEl));
      body.append(sum);
    }

    /* Site assembly: what is held, and what each group still needs. */
    const standings = groupStandings(p, g).filter((s) => s.held > 0);
    if (standings.length) {
      body.append(h('div', { class: 'll-kicker', text: 'Site assembly' }));
      const rows = h('div', { class: 'll-rows' });
      for (const s of standings) {
        rows.append(h('div', { class: 'll-row', 'data-numeral-ok': true },
          h('span', { class: 'll-row-tag', style: `background:${s.grp.colour}` }),
          h('b', { text: `${s.grp.name} — ${s.held} of ${s.size}` }),
          h('span', { text: s.complete
            ? 'Rent doubled'
            : `${s.remaining} more doubles it` })));
      }
      body.append(rows);
    }

    const cash = h('b', {});
    putMoney(cash, p.cash, { where: 'register.cash' });
    const debt = h('b', {});
    putMoney(debt, p.debt, { where: 'register.debt' });
    const nw = h('b', {});
    putMoney(nw, p.netWorth(), { compact: true, where: 'register.netWorth' });
    body.append(h('div', { class: 'll-metrics' },
      h('div', { class: 'll-metric' }, cash, h('i', { text: 'Cash in hand' })),
      h('div', { class: 'll-metric' }, debt, h('i', { text: 'Charges outstanding' })),
      h('div', { class: 'll-metric' }, nw, h('i', { text: 'Net worth — tiebreak only' }))));

    openSheet(card);
  }

  function openLedger() {
    const { card, body } = cardShell('The ledger', '#3A4A5C');
    body.append(h('h2', { class: 'll-h1', text: 'What has happened' }));
    const entries = (g.log || []).slice().reverse();
    if (!entries.length) {
      body.append(h('p', { class: 'll-empty', text: 'Nothing has happened yet.' }));
    } else {
      const rows = h('div', { class: 'll-rows' });
      entries.forEach((e) => {
        /* Log lines are assembled by the engine from formatted Money values, so
           they may carry a currency token; they are running game state. */
        rows.append(h('div', { class: 'll-row', 'data-money': 'derived' },
          h('span', { class: 'll-row-tag', style: `background:${logColour(e.kind)}` }),
          h('b', { text: e.text })));
      });
      body.append(rows);
    }
    openSheet(card);
  }

  function logColour(kind) {
    if (kind === 'income') return '#0F7A3D';
    if (kind === 'cost' || kind === 'forced' || kind === 'bust') return '#A31220';
    if (kind === 'buy') return '#0F5499';
    if (kind === 'event') return '#8A4A15';
    return '#7A6A5E';
  }

  /**
   * HOW TO PLAY, AND IT HAS TO BE TRUE.
   *
   * Every sentence in here was checked line by line against engine.js, because
   * the previous copy was not: it told the player that landing on someone
   * else's street cost "a month of rent" when the engine charges a YEAR of the
   * assumed rent, and that the levy was a square charging a month's rent when
   * it is a quarter of the whole annual rent roll and falls on EVERY LAP as
   * well as on the square. In a game whose entire premise is that every figure
   * is traceable, rules that contradict the code are the worst bug available.
   *
   * Rates are read from the fact base rather than typed, so the copy cannot
   * drift from the arithmetic the engine actually performs.
   */
  function openRules() {
    const a = F.assumptions();
    const her = F.heritage();
    const { card, body } = cardShell('How to play', '#4E8A6E');

    /* Opening capital is a fact-base leaf, so it is read, never written. */
    const openingEl = h('div', { class: 'll-hero-v' });
    putMoney(openingEl, F.startingCapital(), { where: 'rules.openingCapital' });

    body.append(
      h('h2', { class: 'll-h1', text: 'One board, real prices' }),
      h('p', { class: 'll-body-t', 'data-numeral-ok': true, text:
        'Roll two dice and move clockwise. Land on an unowned street and you may buy it '
        + 'outright, buy it with debt secured on the street, or pass. Land on a street '
        + 'someone else holds and you pay them a full year of its assumed rent — double '
        + 'that if they hold every street in its colour group.' }),
      /* The single statement of length. The game is counted in rounds here, on
         the banner and nowhere else in another unit. */
      h('div', { class: 'll-hero' },
        h('div', { class: 'll-kicker', text: 'How it ends' }),
        h('p', { class: 'll-body-t', 'data-numeral-ok': true,
          text: `The game lasts ${g.roundsTotal} rounds — one turn each per round.` }),
        factProse('ll-body-t', a.winCondition, 'assumptions.winCondition')),
      h('div', { class: 'll-hero' },
        h('div', { class: 'll-kicker', text: 'The score' }),
        h('p', { class: 'll-body-t', 'data-numeral-ok': true, text:
          'Your score is a year of rent from every street you hold, with a completed '
          + 'colour group counted twice over, LESS a year of interest on everything you '
          + `have borrowed at ${a.debtInterestPct}%. Cash in hand is not scored; it is `
          + 'only what you buy with. Net worth breaks a tie.' }),
        h('p', { class: 'll-body-t', 'data-numeral-ok': true, text:
          `Debt costs ${a.debtInterestPct}% a year and a street is assumed to yield `
          + `${a.grossYieldPct}%, so borrowing buys you more streets per pound of cash `
          + 'and a smaller return on the cash you commit. That is the decision the whole '
          + 'game turns on, and it is shown to you on every offer.' })),
      h('div', { class: 'll-hero' },
        h('div', { class: 'll-kicker', text: 'Site assembly' }),
        factProse('ll-body-t', a.assemblyNote, 'assumptions.assemblyNote'),
        h('p', { class: 'll-body-t', text:
          'It is the largest single move on the board: the doubling applies to your rent '
          + 'roll and to anyone unlucky enough to land there. Each panel shows how much '
          + 'of every colour group its player holds, and an offer says so plainly when '
          + 'the street on the table would finish one.' })),
      h('div', { class: 'll-hero' }, openingEl,
        h('div', { class: 'll-hero-l', text: 'Opening capital, each' })),
      h('div', { class: 'll-hero' },
        h('div', { class: 'll-kicker', text: 'The Survey — every lap' }),
        h('p', { class: 'll-body-t', 'data-numeral-ok': true, text:
          'Each time you pass the Survey corner, three things happen in order: you '
          + 'collect a year of rent from every street you hold; you pay the land value '
          + `levy, ${a.levyRateOfRentPct}% of the rent you have just collected; and you `
          + `pay a year’s interest at ${a.debtInterestPct}% on any debt outstanding.` })),
      h('div', { class: 'll-hero' },
        h('div', { class: 'll-kicker', text: 'The Land Value Levy' }),
        h('p', { class: 'll-body-t', 'data-numeral-ok': true, text:
          `The levy is ${a.levyRateOfRentPct}% of the rent your streets yield in a year — `
          + 'the plain roll, before any doubling for an assembled group and before debt '
          + 'service. It is charged on every lap of the board, and charged again whenever '
          + 'you land on the Levy square itself. Because it is a share of the rent rather '
          + 'than a flat sum, it grows with your holdings — and a player holding no land '
          + 'pays nothing at all. It falls on land rent, not on anything anybody built, '
          + 'which is the point the 1904 original was made to demonstrate.' })),
      h('div', { class: 'll-hero' },
        h('div', { class: 'll-kicker', text: 'The Gazette and the Registry' }),
        h('p', { class: 'll-body-t', text:
          'The Gazette deals a real, sourced Atlanta headline: one at the start of every '
          + 'round, and one more whenever a player lands on a Gazette square. The '
          + 'Registry is a safe square — nothing is charged there.' })),
      h('div', { class: 'll-hero' },
        h('div', { class: 'll-kicker', text: 'Running out of cash' }),
        h('p', { class: 'll-body-t', text:
          'If a charge takes your cash below zero, streets are sold at their stated '
          + 'value, smallest first, until you are square again. If selling everything '
          + 'still leaves you short, you are out of capital and the game ends there.' })),
      factProse('ll-source', a.statement, 'assumptions.statement'),
      /* heritage.note in the fact base uses a term the integrity gate bans
         outright, so the vetted attribution string carries the lineage here. */
      h('p', { class: 'll-source', text: `After ${her.title} by ${her.author}.` }),
      factProse('ll-source', F.attribution().heritage, 'attribution.heritage'),
    );
    card.append(h('div', { class: 'll-choices' },
      h('button', { class: 'll-choice ll-choice-pass', type: 'button', onclick: closeSheet },
        h('span', {}, h('strong', { text: 'Close' })))));
    openSheet(card);
  }

  /** Fallback sources sheet, used only when no onOpenSources was supplied. */
  function openSources() {
    const attr = F.attribution();
    const { card, body } = cardShell('Sources', '#0F5499');
    body.append(h('h2', { class: 'll-h1', text: 'Every price on this board is real' }));
    for (const key of ['hmlr', 'ogl', 'ukhpiProducers', 'dataCurrency', 'noEndorsement',
      'heritage', 'noSubscriptionData']) {
      if (attr[key]) body.append(factProse('ll-source', attr[key], `attribution.${key}`));
    }
    card.append(h('div', { class: 'll-choices' },
      h('button', { class: 'll-choice ll-choice-pass', type: 'button', onclick: closeSheet },
        h('span', {}, h('strong', { text: 'Close' })))));
    openSheet(card);
  }

  /* ------------------------------------------------------------- toasts */

  /**
   * What a charge was reckoned on, in the game's own terms. Every line here is
   * a statement of a rule, not of a balance, so it is true whenever it is shown
   * and cannot go stale between the engine charging and the toast appearing.
   */
  function chargeBasis(kind) {
    const a = g && g.assumptions ? g.assumptions : null;
    if (!a) return '';
    switch (kind) {
      case 'levy':
        /* The base is the PLAIN roll the engine charges on — not the assembled,
           net figure on the panel. Saying "your rent roll" would not reconcile
           with the score, and a figure that does not reconcile is a lie. */
        return `${a.levyRateOfRentPct}% of the rent your streets yield in a year — `
          + 'charged on every lap and again on the Levy square, and it grows as your '
          + 'holdings do.';
      case 'interest':
        return `${a.debtInterestPct}% a year on the debt outstanding. It comes off your `
          + 'score as well as your cash.';
      case 'income':
        return 'A full year of the assumed rent on every street you hold.';
      case 'rent':
        return 'A full year of the assumed rent, doubled where the whole colour group '
          + 'is held.';
      default:
        return '';
    }
  }

  /**
   * The figure a charge actually took.
   *
   * A caller may hand the toast the Money itself. Where it does not — the shell
   * passes only the engine's sentence — the figure is lifted VERBATIM out of
   * the engine's own ledger note for this turn rather than recomputed here: a
   * recomputed levy could disagree with the one that was charged if the same
   * turn also forced a sale, and a charge notice that disagrees with the ledger
   * is worse than one that stays quiet. If no note matches, nothing is shown.
   */
  const CHARGE_NOTE = {
    levy: { logKind: 'cost', match: /levy/i },
    interest: { logKind: 'cost', match: /interest/i },
    income: { logKind: 'income', match: /rent/i },
    rent: { logKind: 'cost', match: /rent on/i },
  };

  function figureFromLedger(kind) {
    const spec = CHARGE_NOTE[kind];
    if (!spec || !g || !Array.isArray(g.log)) return '';
    for (let i = g.log.length - 1; i >= 0; i--) {
      const e = g.log[i];
      if (e.turn !== g.turn) break;
      if (e.kind !== spec.logKind || !spec.match.test(e.text)) continue;
      const tokens = findCurrencyTokens(e.text);
      if (tokens.length) return tokens[tokens.length - 1];
    }
    return '';
  }

  /**
   * A toast. Money-bearing events get two lines and the figure: the levy was
   * charging a real, growing sum and passing in four words nobody read, which a
   * critic rightly called invisible. Accepts the event object as well as a
   * string, so a caller that has the Money to hand can pass it straight in.
   */
  function toast(text, kind = 'info', money = null) {
    if (destroyed) return;
    if (text && typeof text === 'object') {
      money = text.money || money;
      kind = text.kind || kind;
      text = text.text;
    }
    const basis = chargeBasis(kind);
    const lines = h('span', { class: 'll-toast-c', 'data-money': 'derived', 'data-numeral-ok': true },
      h('span', { text: String(text) }),
      basis ? h('span', { class: 'll-toast-s', text: basis }) : null);

    let figure = null;
    if (money && typeof money.amount === 'number') {
      figure = h('span', { class: 'll-toast-v ll-num' });
      putMoney(figure, money, { compact: true, where: `toast.${kind}` });
    } else {
      const token = figureFromLedger(kind);
      if (token) {
        figure = h('span', {
          class: 'll-toast-v ll-num', 'data-money': 'derived', text: token,
        });
      }
    }

    const node = h('div', { class: 'll-toast', 'data-kind': kind }, h('i'), lines, figure);
    toasts.append(node);
    while (toasts.children.length > 3) toasts.firstChild.remove();
    after(basis ? 3200 : 2600, () => {
      node.classList.add('is-out');
      after(220, () => node.remove());
    });
  }

  /* ------------------------------------------------------------ teardown */

  function destroy() {
    destroyed = true;
    if (rollAnim) cancelAnimationFrame(rollAnim);
    for (const t of timers) clearTimeout(t);
    timers.clear();
    for (const [target, type, fn, o] of listeners) target.removeEventListener(type, fn, o);
    listeners.length = 0;
    for (const ob of observers) { try { ob.disconnect(); } catch { /* already gone */ } }
    observers.length = 0;
    layer.remove();
  }

  /* First paint. */
  update(g);

  return { update, showRoll, showOffer, showEvent, showResult, toast, destroy };
}

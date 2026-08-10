/**
 * scene.js — the 3D presentation layer for LANDLORD: LONDON 2026.
 *
 * The visual contract is bench/round0/bench-teardown.json (measured from real
 * screenshots of two premium board games) and bench/round0/touch.json (the
 * mobile runtime budget). Every number carrying a comment tagged "measured"
 * comes straight out of those specs and is a requirement, not a preference.
 *
 * Structure of the scene, outermost first:
 *
 *   table          a warm wooden surface running out of frame in every
 *                  direction, with the pool of light baked into its vertex
 *                  colours so the composition frames itself in world space
 *   props          two defocused objects cropped at the frame edge
 *   base plate     the board's own bevelled carcass
 *   28 slabs       extruded tiles with real side walls, bevelled rims and gaps
 *   centre plate   the crest, with its copy baked into the material
 *   tokens         two original London silhouettes in moulded plastic
 *   markers        ownership posts, instanced
 *   vignette       a screen-space darkening quad drawn after the main pass
 *
 * NOTHING in here writes a monetary literal. Prices come from facts.js and are
 * formatted with money.js, and every string baked into a texture is pushed to
 * the exported `canvasLabels` array so the integrity gate can sweep what a DOM
 * walker cannot see.
 */
import * as THREE from 'three';
import { fmtCompact, fmt1935 } from './money.js';
import * as F from './facts.js';

/* ────────────────────────────────────────────────────────── baked text log */

/**
 * Every string drawn into a CanvasTexture, reported for the integrity gate.
 * @type {Array<{text: string, where: string}>}
 */
export const canvasLabels = [];

/*
 * The atlas can be repainted at a larger type scale (see setLabelScale), and a
 * repaint draws every string a second time. The log is a set of what the player
 * can read, not a count of draw calls, so it is filled on the first bake only.
 */
let logBaked = true;

/** Record a string on its way into a texture, and return it for drawing. */
function bake(text, where) {
  const s = String(text);
  if (logBaked) canvasLabels.push({ text: s, where });
  return s;
}

/* ──────────────────────────────────────────────────────────────── geometry */

/** Board half-extent in world units. Every other dimension derives from it. */
const R = 10;

const CORNER = 3.4;                     // corner tile side
const SIDE_W = (R - CORNER) / 3;        // 2.2 — six side tiles per edge
const SIDE_D = CORNER;                  // side tiles run the full edge depth

/*
 * Gaps are absolute world units, not fractions of the tile. As fractions they
 * were applied to `w` and `d` regardless of which way the track ran, so the
 * left and right columns came out a hair narrower than the corners they butt
 * against — the visible seam at The Registry and the overlap at The Land Value
 * Levy. In world units the joint is identical on all four edges.
 */
const GAP_ALONG = 0.10;                 // between neighbours along the track
const GAP_ACROSS = 0.10;                // at the inner and outer rims

const TILE_H = 0.36;                    // a real slab, not a decal on a plane

/*
 * The chamfer is the whole reason the board is not flat. Every tile top is
 * coplanar and up-facing, so a directional key illuminates all of them
 * identically no matter where it is placed — moving the light can never change
 * the tops. The chamfer is the only surface on a tile whose normal differs
 * edge to edge: at this ratio it tilts 34 degrees off vertical, which puts the
 * key-facing rim at ~0.9 of full illumination and the opposite rim at zero,
 * where only the cool fill reaches it. One bright edge, one cool edge, on all
 * 28 tiles. That is the read the benchmark measures.
 */
const BEVEL_IN = 0.105;                 // ~5% of a side tile's running width
const BEVEL_H = 0.080;
const BASE_H = 0.92;                    // carcass deep enough to throw a shadow
const CENTRE_H = 0.13;                  // sits low, so every inner wall shades

/* Footprint of a tile once the gap is taken out, in world units. */
const RUN_W = SIDE_W - GAP_ALONG;             // along the running track
const RUN_D = SIDE_D - GAP_ACROSS;            // across it, toward the centre
const CORNER_S = CORNER - GAP_ACROSS;

const RING = 28;
const CORNERS = new Set([0, 7, 14, 21]);

/*
 * Where a playing piece stands on its square, and where a corner's name ends.
 *
 * These two are one decision, not two. A piece hides the board BEHIND it — up
 * the screen — for roughly its own height divided by the tangent of the camera
 * pitch, which on the table framing is well over a whole square. So the pieces
 * are stood on the outer margin of the square, as far from the board centre as
 * the plinth allows, and the printed panel is kept clear of the strip they
 * occupy. On the start square, which carries both pieces before a single die is
 * thrown, that is the difference between a readable corner and "The Su".
 */
const TOKEN_OUTWARD = 0.315;            // of the square's across-track extent
const TOKEN_SPREAD = 0.42;              // of its along-track extent, per seat
const CORNER_SPREAD = 0.54;             // corners are wide: use the room
const CORNER_NAME_FOOT = 0.55;          // last baseline, as a fraction of depth

/* ───────────────────────────────────────────────────────────────── palette */

/* Environment, measured from the reference frames. */
const TABLE_LIT = '#BA6230';
const TABLE_MID = '#A85B2A';
const TABLE_CORNER = '#4A3328';         // 0.44 of centre luma at frame corners
const ROOM = '#2A1C13';                 // background + fog, never a grey void

/* Board carcass and tile faces. */
const CARCASS = '#5C3A22';
const CARCASS_TOP = '#7A4E2C';
const JOINT = '#241408';                // what shows in the gaps between slabs
const TILE_FACE = '#EFE5D4';
const TILE_RIM = '#E8D2A8';
const TILE_BEVEL = '#C9A87A';
const TILE_WALL = '#B08E62';

/* Square types that are not streets. */
const CORNER_INK = {
  survey: '#B8862B',
  registry: '#0D7680',
  levy: '#990F3D',
  gazette: '#33302E',
};

const HIGHLIGHT = '#FFD34D';
const UI_FONT = '"Helvetica Neue", Helvetica, "Segoe UI", Roboto, Arial, sans-serif';

/* ───────────────────────────────────────────────────────── camera framings */

/**
 * Three authored framings. There is no free orbit: the camera is the game's
 * proscenium. Distances are multiples of R; pitch is degrees below horizontal.
 *
 * `table` was 35 deg of vertical FOV from 3.09R back, which put the near row
 * only 1.48x closer than the far row — near enough to identical that the whole
 * board read orthographic. A shorter lens (46 deg) from 2.12R back takes that
 * to 1.7x and the tilt down to 43 deg, so the near row is visibly larger and
 * the far row visibly recedes.
 *
 * `follow` deviates from the spec's 24 deg pitch: at that angle the top of the
 * frame would clear the table and show empty room, and a void at the frame edge
 * is the one thing the environment rule forbids outright. 32 deg keeps the
 * surface full-bleed while still reading as a low travel camera.
 */
const FRAMINGS = {
  table: { fov: 46, pitch: 43, dist: 2.12, target: [0, 0.10 * R, 0], fit: true },
  dice: { fov: 44, pitch: 50, dist: 1.30, target: [0, 0.09 * R, 0.50 * R], fit: false },
  follow: { fov: 50, pitch: 34, dist: 2.30, target: null, fit: false },
};

const FADE_MS = 500;                    // cross-fade, never a cut

/*
 * Chrome that sits over the canvas and must not be allowed to eat the board:
 * the attribution strip runs along the bottom of the frame, and the bottom row
 * of squares was disappearing underneath it. The board is fitted to the height
 * actually left over. The HUD's identity panels and turn banner do the same job
 * along the top, so the board is fitted to the band between the two and centred
 * in it, rather than fitted to the raw viewport.
 */
const FOOT_RESERVE = 34;                // CSS px, landscape attribution strip
const HEAD_RESERVE = 152;               // CSS px, landscape identity panels

/* ──────────────────────────────────────────────────────────────── easing */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

/** cubic-bezier(0.4, 0, 0.2, 1) — the spec's transition curve. */
function easeStandard(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  // Newton solve for x(u) = t, then evaluate y(u). Control points (0.4, 0)
  // and (0.2, 1): cx = 3p1, bx = 3(p2 − p1) − cx, ax = 1 − cx − bx.
  const cx = 3 * 0.4, bx = 3 * (0.2 - 0.4) - cx, ax = 1 - cx - bx;
  const cy = 3 * 0, by = 3 * (1 - 0) - cy, ay = 1 - cy - by;
  let u = t;
  for (let i = 0; i < 6; i++) {
    const x = ((ax * u + bx) * u + cx) * u - t;
    const dx = (3 * ax * u + 2 * bx) * u + cx;
    if (Math.abs(dx) < 1e-6) break;
    u -= x / dx;
  }
  u = clamp(u, 0, 1);
  return ((ay * u + by) * u + cy) * u;
}

const easeInOutSine = (t) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t, 0, 1));
const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

/* ────────────────────────────────────────────────────────── board layout */

/**
 * Ring geometry for all 28 squares. Index 0 is the near-right corner; play runs
 * anticlockwise seen from above, which puts the first edge across the bottom of
 * the frame where the camera reads it most clearly.
 *
 * Every slab is axis-aligned — `rotY` is gone. A printed board rotates its
 * tiles radially, which on a tilted 3D camera turns the left column 90 degrees,
 * the right column −90 and the whole far row upside down. Nothing on this board
 * is ever rotated: each face is baked so its type reads upright from the
 * player's seat, and the colour band is moved to whichever edge of the design
 * happens to face the board centre.
 *
 * `edge` names which run the square belongs to, `run` the world axis the track
 * travels along there, and (inX, inZ) the unit vector pointing at the centre.
 */
function buildLayout() {
  const out = new Array(RING);
  const inner = R - CORNER;             // 6.6 — where the side tiles begin
  const cornerC = R - CORNER / 2;       // 8.3 — corner tile centre offset
  const rt = Math.SQRT1_2;

  const put = (i, x, z, w, d, edge, run, inX, inZ, corner) => {
    out[i] = { index: i, x, z, w, d, rotY: 0, edge, run, inX, inZ, corner };
  };

  put(0, cornerC, cornerC, CORNER_S, CORNER_S, 'corner', 'x', -rt, -rt, true);
  put(7, -cornerC, cornerC, CORNER_S, CORNER_S, 'corner', 'x', rt, -rt, true);
  put(14, -cornerC, -cornerC, CORNER_S, CORNER_S, 'corner', 'x', rt, rt, true);
  put(21, cornerC, -cornerC, CORNER_S, CORNER_S, 'corner', 'x', -rt, rt, true);

  for (let k = 0; k < 6; k++) {
    const off = inner - SIDE_W * (k + 0.5);       // 5.5 … −5.5
    put(1 + k, off, cornerC, RUN_W, RUN_D, 'bottom', 'x', 0, -1, false);
    put(8 + k, -cornerC, off, RUN_D, RUN_W, 'left', 'z', 1, 0, false);
    put(15 + k, -off, -cornerC, RUN_W, RUN_D, 'top', 'x', 0, 1, false);
    put(22 + k, cornerC, -off, RUN_D, RUN_W, 'right', 'z', -1, 0, false);
  }
  return out;
}

/** Which edge of a tile's baked design carries the colour band. */
const BAND_SIDE = { bottom: 'top', top: 'bottom', left: 'right', right: 'left' };

/* ───────────────────────────────────────────────── canvas drawing helpers */

/**
 * Draw `text` centred on `cx` with manual letter-spacing. Positions are worked
 * out per character, so the caller's textAlign is overridden and restored.
 */
function tracked(ctx, text, cx, y, spacing) {
  const align = ctx.textAlign;
  ctx.textAlign = 'left';
  const chars = [...text];
  let w = 0;
  for (const c of chars) w += ctx.measureText(c).width + spacing;
  w -= spacing;
  let x = cx - w / 2;
  for (const c of chars) {
    ctx.fillText(c, x, y);
    x += ctx.measureText(c).width + spacing;
  }
  ctx.textAlign = align;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
/* ──────────────────────────────────────────────── tile atlas (baked text) */

/*
 * One atlas for all 28 tile faces. A texture per tile would be 28 textures and
 * 28 draw calls; one atlas plus one merged geometry is one of each, which is
 * what keeps the whole board inside the mobile budget.
 *
 * Cells are laid out 8 x 4. Each cell is CW wide and 2*CW tall, so the atlas is
 * square: 1024 on a phone, 2048 on a desktop-class display.
 */
/*
 * Design space. One design unit is RUN_W/100 world units, for every tile on the
 * board — so a 24pt name on a far-row square is exactly as large in world terms
 * as a 24pt name on the near row, whichever way round the square sits. The cell
 * a square occupies is therefore SHORT x LONG when the track runs across the
 * frame and LONG x SHORT when it runs up it, and LONG x LONG at the corners.
 */
const SHORT = 100;
const LONG = 100 * (RUN_D / RUN_W);           // ~157

/* The sheet: a row of corners, two rows of upright squares, three of sideways. */
const ATLAS_W = 4 * LONG;
const ATLAS_H = 3 * LONG + 3 * SHORT;

/** Where square `i` lives on the sheet, in design units. */
function cellRect(i) {
  if (CORNERS.has(i)) {
    const c = [0, 7, 14, 21].indexOf(i);
    return { x: c * LONG, y: 0, w: LONG, h: LONG };
  }
  if (i >= 1 && i <= 6) return { x: (i - 1) * SHORT, y: LONG, w: SHORT, h: LONG };
  if (i >= 15 && i <= 20) return { x: (i - 15) * SHORT, y: 2 * LONG, w: SHORT, h: LONG };
  const j = i >= 8 && i <= 13 ? i - 8 : 6 + (i - 22);      // 0..11, sideways
  return { x: (j % 4) * LONG, y: 3 * LONG + Math.floor(j / 4) * SHORT, w: LONG, h: SHORT };
}

/**
 * Paint every tile face into one canvas and return the texture plus the UV
 * rectangle for each square index. `scale` is device pixels per design unit.
 *
 * `typeScale` is the board's own type-size control (see setLabelScale). It does
 * not simply multiply the point sizes — a cell that is already full cannot
 * carry larger type, and the fitter would only hand the extra back. It buys the
 * room instead, by retiring the two lowest tiers of the design in order: the
 * 1935 micro-line first, then the group label, whose information the colour
 * band already carries. What is left is set as large as the square allows.
 */
function paintAtlas(board, layout, scale, compact, typeScale = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(ATLAS_W * scale);
  canvas.height = Math.round(ATLAS_H * scale);
  const ctx = canvas.getContext('2d');
  ctx.textBaseline = 'alphabetic';

  const rects = new Array(RING);

  for (let i = 0; i < RING; i++) {
    const sq = board[i];
    const r = cellRect(i);
    const band = BAND_SIDE[layout[i].edge] || null;

    ctx.save();
    ctx.translate(r.x * scale, r.y * scale);
    ctx.scale(scale, scale);
    ctx.beginPath();
    ctx.rect(0, 0, r.w, r.h);
    ctx.clip();

    if (CORNERS.has(i)) paintCornerFace(ctx, sq, r.w, r.h, typeScale);
    else if (sq.type === 'street') paintStreetFace(ctx, sq, r.w, r.h, band, compact, typeScale);
    else paintGazetteFace(ctx, sq, r.w, r.h, band, typeScale);
    paintContactAO(ctx, r.w, r.h, band);

    ctx.restore();

    rects[i] = {
      u0: (r.x * scale) / canvas.width,
      u1: ((r.x + r.w) * scale) / canvas.width,
      v0: 1 - ((r.y + r.h) * scale) / canvas.height,
      v1: 1 - (r.y * scale) / canvas.height,
    };
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return { texture, rects };
}

/**
 * Lay the colour-group band along whichever edge of the design faces the board
 * centre, and hand back the rectangle left over for type. The band is pure
 * colour with a lip: a label printed inside it would have to run sideways on
 * two of the four edges, which is exactly the failure being fixed.
 */
function paintBand(ctx, colour, W, H, side) {
  const T = 20;
  const box = { x: 0, y: 0, w: W, h: H };
  if (!side) return box;
  ctx.fillStyle = colour;
  if (side === 'top') { ctx.fillRect(0, 0, W, T); box.y = T; box.h = H - T; }
  else if (side === 'bottom') { ctx.fillRect(0, H - T, W, T); box.h = H - T; }
  else if (side === 'left') { ctx.fillRect(0, 0, T, H); box.x = T; box.w = W - T; }
  else { ctx.fillRect(W - T, 0, T, H); box.w = W - T; }

  // Shaded lip on the inboard side, catchlight on the outboard side.
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  if (side === 'top') ctx.fillRect(0, T - 2.2, W, 2.2);
  else if (side === 'bottom') ctx.fillRect(0, H - T, W, 2.2);
  else if (side === 'left') ctx.fillRect(T - 2.2, 0, 2.2, H);
  else ctx.fillRect(W - T, 0, 2.2, H);

  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  if (side === 'top') ctx.fillRect(0, 0, W, 1.3);
  else if (side === 'bottom') ctx.fillRect(0, H - 1.3, W, 1.3);
  else if (side === 'left') ctx.fillRect(0, 0, 1.3, H);
  else ctx.fillRect(W - 1.3, 0, 1.3, H);
  return box;
}

/**
 * Wrap on word boundaries and nowhere else. The previous version broke inside a
 * word when the word alone would not fit, and because it then judged the result
 * "complete" as soon as the hyphens were stripped back out, it accepted the
 * break at the very first size it tried. That is where "Stran-d",
 * "Marlborou-gh Street" and "Northumber-land Avenue" came from. A street name
 * is a proper noun: it shrinks, it never splits.
 */
function wrapWords(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (!line || ctx.measureText(test).width <= maxWidth) line = test;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Set `text` as large as it will go inside a box, up to `maxLines`. Returns the
 * lines, the size chosen and a horizontal squeeze factor. Starts at the ceiling
 * and steps down, so type is never smaller than the tile can actually carry.
 *
 * If even the floor size will not fit a single unbreakable word, the line is
 * condensed horizontally rather than hyphenated — a slightly narrow
 * "Northumberland" still reads as the street it names.
 *
 * `condense` below 1 lets the fitter deliberately overshoot the width and take
 * the overshoot back as a horizontal squeeze, which buys a taller glyph on a
 * name that is pinned by the square's width rather than its depth. It is left
 * at 1 — no condensation, no change — for the authored design, and only opened
 * up by the board's type-size control, where taller type is the whole point.
 */
function fitBlock(ctx, text, maxW, maxH, maxLines, ceiling, floor, weight, condense = 1) {
  const widestOf = (lines) => lines.reduce((m, l) => Math.max(m, ctx.measureText(l).width), 0);
  const roomW = maxW / clamp(condense, 0.78, 1);
  for (let s = ceiling; s >= floor; s -= 0.5) {
    ctx.font = `${weight} ${s}px ${UI_FONT}`;
    const lines = wrapWords(ctx, text, roomW);
    if (lines.length <= maxLines && widestOf(lines) <= roomW && lines.length * s * 1.1 <= maxH) {
      ctx.font = `${weight} ${s}px ${UI_FONT}`;
      const widest = widestOf(lines);
      return { lines, size: s, squeeze: widest > maxW ? maxW / widest : 1 };
    }
  }
  ctx.font = `${weight} ${floor}px ${UI_FONT}`;
  const lines = wrapWords(ctx, text, maxW).slice(0, maxLines);
  const widest = widestOf(lines);
  return { lines, size: floor, squeeze: widest > maxW ? maxW / widest : 1 };
}

/** Draw one fitted line, condensing horizontally if the block asked for it. */
function drawFitted(ctx, text, cx, y, squeeze) {
  if (!squeeze || squeeze > 0.999) { ctx.fillText(text, cx, y); return; }
  ctx.save();
  ctx.translate(cx, y);
  ctx.scale(squeeze, 1);
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/* ─────────────────────────────────────────────────── vertical type stack */

/*
 * Every face used to advance a running `y` by a chain of hand-tuned multiples
 * and check the result against a `total` computed from a DIFFERENT chain of
 * multiples. The two disagreed by roughly three quarters of the name's point
 * size, which is nothing on the bottom row — those cells are LONG design units
 * deep — and fatal on the left and right columns, whose cells are only SHORT
 * deep. There the last tier walked off the bottom of its cell and was clipped
 * by the atlas: "Regent Street", "Oxford Street" and "Bond Street" all lost
 * their price, and every column square lost its 1935 line.
 *
 * So rows are measured before anything is drawn. Each row states the height it
 * occupies and the gap it wants above it; the stack is summed, and if the
 * square is too shallow to carry it the whole stack is scaled as one, which
 * keeps the hierarchy intact rather than truncating the bottom of it.
 */

/** A row carrying a fitted text block. */
function textRow(fit, gap) {
  const lead = fit.size * 1.06;
  return {
    fit, gap, lead,
    h: (fit.lines.length - 1) * lead + fit.size * 1.04,
    asc: fit.size * 0.80,
  };
}

/** A row of plain height, for a rule or a fixed-size label. */
function plainRow(size, gap) {
  return { fit: null, gap, lead: 0, h: size * 1.04, asc: size * 0.80 };
}

/**
 * Resolve baselines for a stack of rows inside `box`. Writes `baseline` and
 * `scale` onto each row and returns the scale that was needed.
 */
function stackRows(rows, box, padY) {
  const avail = Math.max(4, box.h - padY * 2);
  let need = 0;
  for (const r of rows) need += (r.gap || 0) + r.h;
  const k = need > avail ? avail / need : 1;
  let y = box.y + padY + (avail - need * k) / 2;
  for (const r of rows) {
    y += (r.gap || 0) * k;
    r.baseline = y + r.asc * k;
    r.scale = k;
    y += r.h * k;
  }
  return k;
}

/** Draw a text row at the baseline the stack resolved for it. */
function drawRow(ctx, row, cx, weight, colour) {
  const k = row.scale;
  ctx.fillStyle = colour;
  ctx.font = `${weight} ${row.fit.size * k}px ${UI_FONT}`;
  row.fit.lines.forEach((ln, i) => {
    drawFitted(ctx, ln, cx, row.baseline + i * row.lead * k, row.fit.squeeze);
  });
}

/**
 * Contact occlusion, baked into every face.
 *
 * Each space is a separate slab dropped into the board's inner frame, and a
 * real one traps a little shadow in the joint on all four sides. The board's
 * own key light cannot produce that: the tile tops are coplanar, so a
 * directional lights every one of them identically wherever it is placed, which
 * is the whole reason the chamfer exists. This is the other half of the same
 * argument — the joint darkening has to be printed, because nothing in the
 * lighting rig can cast it. Deepest along the inboard edge, where the space
 * meets the frame rather than another space.
 */
function paintContactAO(ctx, W, H, band) {
  const ink = (a) => `rgba(26,17,10,${a})`;
  const run = (x0, y0, x1, y1, x, y, w, h, a) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, ink(a));
    g.addColorStop(0.55, ink(a * 0.24));
    g.addColorStop(1, ink(0));
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  };
  const t = Math.min(11, W * 0.10, H * 0.10);
  const deep = 0.30;                     // the joint against the inner frame
  const side = 0.15;                     // the joints against the neighbours
  run(0, 0, 0, t, 0, 0, W, t, band === 'top' ? deep : side);
  run(0, H, 0, H - t, 0, H - t, W, t, band === 'bottom' ? deep : side);
  run(0, 0, t, 0, 0, 0, t, H, band === 'left' ? deep : side);
  run(W, 0, W - t, 0, W - t, 0, t, H, band === 'right' ? deep : side);
}

/**
 * A street face: colour band on the inboard edge, then group, name and the
 * live 2026 figure, all upright.
 *
 * On a narrow viewport the historic line is dropped and the group label with
 * it, and everything that remains is set larger — a phone cannot resolve four
 * tiers of type on a far-row square, and the name and the price are the two
 * that carry the game.
 */
function paintStreetFace(ctx, sq, W, H, band, compact, typeScale = 1) {
  const s = F.street(sq.streetId);
  const group = F.groupOf(s.group);
  const where = `tile:${sq.index}:${s.id}`;

  ctx.fillStyle = TILE_FACE;
  ctx.fillRect(0, 0, W, H);
  const box = paintBand(ctx, group.colour, W, H, band);

  // Printed edge, all four sides now that tiles no longer share an orientation.
  ctx.fillStyle = 'rgba(120,98,70,0.15)';
  ctx.fillRect(0, 0, W, 1.0); ctx.fillRect(0, H - 1.0, W, 1.0);
  ctx.fillRect(0, 0, 1.0, H); ctx.fillRect(W - 1.0, 0, 1.0, H);

  const pad = 4.5;
  const padY = 3.5;
  const cx = box.x + box.w / 2;
  const tw = box.w - pad * 2;
  ctx.textAlign = 'center';

  const nameText = bake(s.name, where);
  const priceText = bake(fmtCompact(F.priceOf(s.id).amount), where);
  const thenText = bake(`1935 ${fmt1935(F.board1935Of(s.id).amount)}`, where);

  if (compact) {
    // Two tiers only, set as large as the square will carry.
    const name = textRow(fitBlock(ctx, nameText, tw, box.h * 0.54, 2, 30 * typeScale, 11, 700,
      typeScale > 1 ? 0.86 : 1), 0);
    const price = textRow(fitBlock(ctx, priceText, tw, box.h * 0.36, 1, 36 * typeScale, 16, 800), 0);
    price.gap = price.fit.size * 0.34;
    stackRows([name, price], box, padY);
    drawRow(ctx, name, cx, 700, '#221E1A');
    drawRow(ctx, price, cx, 800, '#14100E');
    return;
  }

  /*
   * A column cell is SHORT design units deep against the LONG of a row cell —
   * barely two thirds the height for the same four tiers. Rather than set every
   * tier smaller on half the board, the shallow cells retire the 1935
   * micro-line, which at that size was already sub-pixel on a phone and clipped
   * on a desktop. The figure is still baked, so the panel and the gate see it.
   * The type scale retires the same tiers early and deliberately.
   */
  const shallow = box.h < 120 || typeScale > 1.0;
  const plain = typeScale > 1.25;
  const condense = typeScale > 1 ? 0.86 : 1;

  const groupText = bake(group.name.toUpperCase(), where);

  const gs = 8;
  const ts = 8;
  const nameCeiling = (shallow ? 26 : 24) * typeScale;
  const priceCeiling = (shallow ? 32 : 30) * typeScale;
  const name = textRow(
    fitBlock(ctx, nameText, tw, box.h * (shallow ? 0.48 : 0.44), 3, nameCeiling, 9, 700,
      condense), 0);
  const price = textRow(
    fitBlock(ctx, priceText, tw, box.h * (shallow ? 0.34 : 0.30), 1, priceCeiling, 14, 800), 0);

  const rows = [];
  if (!plain) { rows.push(plainRow(gs, 0)); name.gap = gs * 0.42; }
  rows.push(name);
  const rule = plainRow(0.8, name.fit.size * 0.34);
  rows.push(rule);
  price.gap = price.fit.size * 0.30;
  rows.push(price);
  const then = shallow ? null : plainRow(ts, ts * 0.62);
  if (then) rows.push(then);

  const k = stackRows(rows, box, padY);

  if (!plain) {
    ctx.fillStyle = 'rgba(60,50,40,0.72)';
    ctx.font = `700 ${gs * k}px ${UI_FONT}`;
    tracked(ctx, groupText, cx, rows[0].baseline, 1.4 * k);
  }
  drawRow(ctx, name, cx, 700, '#221E1A');

  ctx.fillStyle = 'rgba(120,98,70,0.34)';
  ctx.fillRect(cx - tw * 0.28, rule.baseline, tw * 0.56, 0.8);

  drawRow(ctx, price, cx, 800, '#14100E');

  if (then) {
    ctx.fillStyle = '#8A7A64';
    ctx.font = `700 ${ts * k}px ${UI_FONT}`;
    ctx.fillText(thenText, cx, then.baseline);
  }
}

/** A Gazette side square: ink plate, ruled-lines glyph, name — upright. */
function paintGazetteFace(ctx, sq, W, H, band, typeScale = 1) {
  const where = `tile:${sq.index}:gazette`;
  ctx.fillStyle = CORNER_INK.gazette;
  ctx.fillRect(0, 0, W, H);
  const box = paintBand(ctx, 'rgba(200,178,140,0.30)', W, H, band);
  ctx.strokeStyle = 'rgba(240,223,192,0.42)';
  ctx.lineWidth = 1.1;
  ctx.strokeRect(box.x + 4, box.y + 4, box.w - 8, box.h - 8);

  const cx = box.x + box.w / 2;
  const glyphY = box.y + box.h * 0.30;
  const gw = Math.min(box.w * 0.46, 46);
  ctx.fillStyle = 'rgba(240,223,192,0.85)';
  ctx.fillRect(cx - gw / 2, glyphY, gw, 3.4);
  ctx.fillRect(cx - gw / 2, glyphY + 8, gw, 1.7);
  ctx.fillRect(cx - gw / 2, glyphY + 13, gw * 0.72, 1.7);
  ctx.fillRect(cx - gw / 2, glyphY + 18, gw * 0.9, 1.7);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#F0DFC0';
  const t = fitBlock(ctx, bake(sq.name, where), box.w - 10, box.h * 0.34, 2, 20 * typeScale, 9, 800);
  // Measured off the last baseline rather than the first, so a two-line name
  // never pushes its second line off the bottom of the cell.
  const rows = t.lines.length;
  const y = box.y + box.h * 0.74 - (rows - 1) * t.size * 1.08;
  t.lines.forEach((ln, k) => drawFitted(ctx, ln, cx, y + k * t.size * 1.08, t.squeeze));
}

/**
 * A corner: full-bleed plate, cream keyline, drawn mark, heavy upright name.
 *
 * The mark and the name sit in the upper two thirds of the plate and the near
 * third is left as an apron. That is not composition for its own sake: the
 * start square carries both pieces from the first frame, and a piece standing
 * on a square hides everything BEHIND it, up the screen, for about a piece's
 * height divided by the tangent of the camera pitch. With the name printed at
 * seven tenths of the way down the plate, the two starting pieces ate it — the
 * board's own start square read as "The Su". Name and apron now clear each
 * other, and squarePoint() stands the pieces in the apron.
 */
function paintCornerFace(ctx, sq, W, H, typeScale = 1) {
  const ink = CORNER_INK[sq.type] || CORNER_INK.gazette;
  const where = `tile:${sq.index}:${sq.type}`;
  ctx.fillStyle = ink;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.fillRect(0, 0, W, 2);
  ctx.strokeStyle = 'rgba(240,223,192,0.55)';
  ctx.lineWidth = 1.6;
  roundRect(ctx, 8, 8, W - 16, H - 16, 4);
  ctx.stroke();

  // Mark and name are one measured stack inside the plate ABOVE the apron, so a
  // two-line corner ("The Land Value Levy") grows into the space between them
  // rather than through the mark on one side or into the apron on the other.
  const MARK_SCALE = 1.3;
  const MARK_H = 30 * MARK_SCALE;
  const region = { x: 0, y: 5, w: W, h: H * CORNER_NAME_FOOT + 12 - 5 };

  ctx.textAlign = 'center';
  const t = fitBlock(ctx, bake(sq.name, where), W - 20, region.h * 0.46, 2,
    22 * typeScale, 10, 800);
  const mark = { fit: null, gap: 0, lead: 0, h: MARK_H, asc: MARK_H / 2 };
  const name = textRow(t, 9);
  const k = stackRows([mark, name], region, 2);

  ctx.save();
  ctx.translate(W / 2, mark.baseline);
  ctx.scale(MARK_SCALE * k, MARK_SCALE * k);
  ctx.strokeStyle = 'rgba(240,223,192,0.9)';
  ctx.fillStyle = 'rgba(240,223,192,0.9)';
  ctx.lineWidth = 1.8;
  drawCornerMark(ctx, sq.type);
  ctx.restore();

  drawRow(ctx, name, W / 2, 800, '#F5EBD8');
}

/** Chunky drawn marks at a single stroke weight — never an emoji or icon font. */
function drawCornerMark(ctx, type) {
  ctx.beginPath();
  if (type === 'survey') {
    // Surveyor's cross-hair over a ring.
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-13, 0); ctx.lineTo(13, 0);
    ctx.moveTo(0, -13); ctx.lineTo(0, 13);
    ctx.stroke();
  } else if (type === 'registry') {
    // A seal: ring plus ribbon.
    ctx.arc(0, -1, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-5, 6); ctx.lineTo(-5, 14); ctx.lineTo(0, 10.5); ctx.lineTo(5, 14); ctx.lineTo(5, 6);
    ctx.closePath();
    ctx.fill();
  } else if (type === 'levy') {
    // A balance: the levy falls on land, not on what is built upon it.
    ctx.moveTo(0, -11); ctx.lineTo(0, 10);
    ctx.moveTo(-12, -7); ctx.lineTo(12, -7);
    ctx.moveTo(-8, 10); ctx.lineTo(8, 10);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-12, -7); ctx.lineTo(-17, 2); ctx.lineTo(-7, 2); ctx.closePath();
    ctx.moveTo(12, -7); ctx.lineTo(7, 2); ctx.lineTo(17, 2); ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillRect(-14, -8, 28, 3);
    ctx.fillRect(-14, -2, 28, 1.6);
    ctx.fillRect(-14, 3, 20, 1.6);
    ctx.fillRect(-14, 8, 25, 1.6);
  }
}

/* ─────────────────────────────────────────────────── centre plate texture */

/** The crest at the middle of the board. Its copy is baked, so it is reported. */
function paintCentre(size) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const k = size / 100;
  ctx.scale(k, k);
  const where = 'tile:centre';

  ctx.fillStyle = '#241A12';
  ctx.fillRect(0, 0, 100, 100);
  const glow = ctx.createRadialGradient(50, 46, 4, 50, 46, 58);
  glow.addColorStop(0, 'rgba(255,214,150,0.16)');
  glow.addColorStop(1, 'rgba(255,214,150,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 100, 100);

  ctx.strokeStyle = 'rgba(216,178,108,0.75)';
  ctx.lineWidth = 0.7;
  roundRect(ctx, 8, 8, 84, 84, 1.5);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(216,178,108,0.32)';
  ctx.lineWidth = 0.4;
  roundRect(ctx, 10.4, 10.4, 79.2, 79.2, 1);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#F3E6CE';
  ctx.font = `800 13px ${UI_FONT}`;
  tracked(ctx, bake('LANDLORD', where), 50, 45, 3.2);

  ctx.fillStyle = '#D8B26C';
  ctx.font = `700 8px ${UI_FONT}`;
  tracked(ctx, bake('LONDON 2026', where), 50, 56, 2.6);

  ctx.fillStyle = 'rgba(216,178,108,0.45)';
  ctx.fillRect(35, 61.5, 30, 0.5);

  ctx.fillStyle = 'rgba(243,230,206,0.72)';
  ctx.font = `600 4.6px ${UI_FONT}`;
  ctx.fillText(bake('Every price on this board is real.', where), 50, 69);

  ctx.fillStyle = 'rgba(243,230,206,0.40)';
  ctx.font = `600 3.4px ${UI_FONT}`;
  ctx.fillText(bake('HM Land Registry Price Paid Data', where), 50, 78);
  ctx.fillText(bake('Open Government Licence', where), 50, 82.6);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/* ────────────────────────────────────────────── table, blob and vignette */

/** Tiling wood grain. The pool of light lives in vertex colours, not here. */
function paintWood(size) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = TABLE_MID;
  ctx.fillRect(0, 0, size, size);

  // Plank seams.
  const planks = 4;
  for (let p = 1; p < planks; p++) {
    const y = (p / planks) * size;
    ctx.fillStyle = 'rgba(52,28,14,0.34)';
    ctx.fillRect(0, y - 1, size, 2);
    ctx.fillStyle = 'rgba(255,196,140,0.06)';
    ctx.fillRect(0, y + 1, size, 1);
  }
  // Grain: long, low-contrast strokes so it never reads as noise.
  for (let i = 0; i < 420; i++) {
    const y = Math.random() * size;
    const w = size * (0.18 + Math.random() * 0.5);
    const x = Math.random() * size;
    const dark = Math.random() > 0.5;
    ctx.fillStyle = dark ? 'rgba(70,38,18,0.09)' : 'rgba(230,170,110,0.055)';
    ctx.fillRect(x, y, w, 0.6 + Math.random() * 1.4);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(9, 9);
  texture.anisotropy = 4;
  return texture;
}

/**
 * Contact-shadow decal. A hard, small pool directly under the footprint — the
 * reference resolves one in about 6px, so the core is opaque and the falloff
 * short. This runs alongside the real shadow map and is the whole shadow on the
 * low tier.
 */
function paintBlob(size) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  // The core is nearly opaque out to 0.42 and gone by 0.86. A gentle falloff
  // starting at the centre is what made every piece look pasted on: the eye
  // reads the darkest pixel as the contact point, and if that pixel is not
  // touching the base of the object, the object floats.
  g.addColorStop(0.00, 'rgba(24,13,6,0.86)');
  g.addColorStop(0.42, 'rgba(24,13,6,0.78)');
  g.addColorStop(0.60, 'rgba(24,13,6,0.42)');
  g.addColorStop(0.78, 'rgba(24,13,6,0.13)');
  g.addColorStop(1.00, 'rgba(24,13,6,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Screen-space vignette, drawn as one alpha-blended quad after the main pass.
 * Not an EffectComposer chain: no extra render target, no resolve, no read-back.
 *
 * Measured target — centre (0.50, 0.58) from the top, mid-edges at 0.70 of
 * centre luminance. Black at alpha a leaves (1 − a) of the source.
 *
 * The corner stop used to be 0.56, taken straight off the reference, and it
 * read as a backdrop falling away rather than as a room with a lamp over the
 * table. Two reasons, and neither is the number itself. The gradient landed on
 * its darkest value exactly at the frame corner, so the falloff had a visible
 * end; and the table already carries a pool of light baked into its vertex
 * colours in WORLD space, which is the part that reads as room lighting, so
 * the screen-space pass was doubling it. The gradient now runs past the corner
 * before it bottoms out and gives up a third of its depth to the world-space
 * pool, which is where a real falloff lives anyway. The mid-edges hold near
 * their measured 0.70; only the corners are let up, from 0.44 to 0.60, and the
 * tail flattens a tenth of the radius before the frame ends so the darkening
 * has no visible edge of its own.
 */
function paintVignette(size) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size * 0.5;
  const cy = size * 0.58;
  const radius = Math.hypot(0.5, 0.58) * size;   // reaches the far corners
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  g.addColorStop(0.00, 'rgba(0,0,0,0)');
  g.addColorStop(0.35, 'rgba(0,0,0,0.03)');
  g.addColorStop(0.54, 'rgba(0,0,0,0.12)');
  g.addColorStop(0.66, 'rgba(0,0,0,0.25)');      // mid-edge -> 0.75 of centre
  g.addColorStop(0.80, 'rgba(0,0,0,0.33)');
  g.addColorStop(0.92, 'rgba(0,0,0,0.38)');      // tail flattens well before
  g.addColorStop(1.00, 'rgba(0,0,0,0.40)');      // corners  -> 0.60 of centre
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Two-stop vertical gradient used as the environment for plastic specular. */
function paintEnvironment() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 32);
  g.addColorStop(0, '#FFF3DE');
  g.addColorStop(0.55, '#C8925E');
  g.addColorStop(1, '#6B4A33');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 32);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  return texture;
}
/* ────────────────────────────────────────────── hand-built slab geometry */

/*
 * Tiles are extruded slabs, never a texture on a plane. Each one is emitted as
 * explicit triangles into shared arrays so all 28 merge into two draw calls:
 * one atlas-textured mesh for the faces, one vertex-coloured mesh for the rims
 * and side walls. Normals are written by hand rather than averaged, so the
 * bevel keeps a crisp edge against the wall instead of smearing into it.
 */

/** Accumulator for a merged, non-indexed geometry. */
function newMesh(withUv, withColour) {
  return { pos: [], nor: [], uv: withUv ? [] : null, col: withColour ? [] : null };
}

function pushVertex(acc, p, n, uv, colour) {
  acc.pos.push(p[0], p[1], p[2]);
  acc.nor.push(n[0], n[1], n[2]);
  if (acc.uv) acc.uv.push(uv[0], uv[1]);
  if (acc.col) acc.col.push(colour[0], colour[1], colour[2]);
}

/**
 * Emit a quad as two triangles. Vertices must be given counter-clockwise as
 * seen from the direction `n` points.
 */
function pushQuad(acc, a, b, c, d, n, uvs, colour) {
  const u = uvs || [[0, 0], [0, 0], [0, 0], [0, 0]];
  pushVertex(acc, a, n, u[0], colour);
  pushVertex(acc, b, n, u[1], colour);
  pushVertex(acc, c, n, u[2], colour);
  pushVertex(acc, a, n, u[0], colour);
  pushVertex(acc, c, n, u[2], colour);
  pushVertex(acc, d, n, u[3], colour);
}

const _c = new THREE.Color();
/** sRGB hex to the linear triple three.js expects in a colour attribute. */
function linear(hex, gain = 1) {
  _c.set(hex).convertSRGBToLinear();
  return [_c.r * gain, _c.g * gain, _c.b * gain];
}

/** Blend two linear triples. `t` is how much of `a` survives. */
function mixLinear(a, b, t, gain = 1) {
  return [
    lerp(b[0], a[0], t) * gain,
    lerp(b[1], a[1], t) * gain,
    lerp(b[2], a[2], t) * gain,
  ];
}

/**
 * Emit one bevelled slab.
 *
 * @param {object} o
 *   cx, cz     centre on the table
 *   w, d       footprint
 *   h          total height
 *   baseY      y of the underside (defaults to 0), so the carcass can hang
 *   rotY       yaw, so the face texture points at the board centre
 *   faces      accumulator for the textured top (needs `uv`)
 *   solid      accumulator for rim, walls and any untextured top (needs `col`)
 *   uv         atlas rectangle {u0,u1,v0,v1}, or null for a plain top
 *   topColour  used only when `uv` is null
 *   edgeRim    optional per-edge chamfer colour, indexed 0:−z 1:−x 2:+z 3:+x,
 *              which is what lets a street's colour band turn the corner and
 *              carry over the slab's own edge instead of stopping dead at it
 */
function emitSlab(o) {
  const { cx, cz, w, d, h, rotY, faces, solid, uv } = o;
  const y0 = o.baseY || 0;
  const bevelIn = Math.min(BEVEL_IN, w * 0.2, d * 0.2);
  const bevelH = Math.min(BEVEL_H, h * 0.4);
  const top = y0 + h;
  const wallTop = top - bevelH;
  const hw = w / 2, hd = d / 2;
  const iw = hw - bevelIn, id = hd - bevelIn;

  const cos = Math.cos(rotY), sin = Math.sin(rotY);
  // Local -> world. Yaw only, so normals use the same transform.
  const P = (x, y, z) => [x * cos + z * sin + cx, y, -x * sin + z * cos + cz];
  const N = (x, y, z) => {
    const nx = x * cos + z * sin;
    const nz = -x * sin + z * cos;
    const len = Math.hypot(nx, y, nz) || 1;
    return [nx / len, y / len, nz / len];
  };

  // Footprint corners, counter-clockwise seen from +y.
  const outer = [[hw, -hd], [-hw, -hd], [-hw, hd], [hw, hd]];
  const inset = [[iw, -id], [-iw, -id], [-iw, id], [iw, id]];

  // Top face.
  const q = inset.map(([x, z]) => P(x, top, z));
  if (uv) {
    const uvs = [[uv.u1, uv.v1], [uv.u0, uv.v1], [uv.u0, uv.v0], [uv.u1, uv.v0]];
    pushQuad(faces, q[0], q[1], q[2], q[3], N(0, 1, 0), uvs, null);
  } else {
    pushQuad(solid, q[0], q[1], q[2], q[3], N(0, 1, 0), null, o.topColour);
  }

  const rim = o.rimColour || linear(TILE_BEVEL);
  const wall = o.wallColour || linear(TILE_WALL);
  const edgeRim = o.edgeRim || null;

  for (let k = 0; k < 4; k++) {
    const a = outer[k], b = outer[(k + 1) % 4];
    const ai = inset[k], bi = inset[(k + 1) % 4];
    // Outward normal of edge a->b for a CCW footprint is (dir x up).
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const len = Math.hypot(dx, dz) || 1;
    const ox = -dz / len, oz = dx / len;

    // Vertical side wall, base to the top of the wall.
    pushQuad(solid,
      P(a[0], y0, a[1]), P(b[0], y0, b[1]),
      P(b[0], wallTop, b[1]), P(a[0], wallTop, a[1]),
      N(ox, 0, oz), null, wall);

    // Bevelled rim, sloping inward as it rises to the face.
    const bn = N(ox * bevelH, bevelIn, oz * bevelH);
    pushQuad(solid,
      P(a[0], wallTop, a[1]), P(b[0], wallTop, b[1]),
      P(bi[0], top, bi[1]), P(ai[0], top, ai[1]),
      bn, null, (edgeRim && edgeRim[k]) || rim);
  }
}

/** Turn an accumulator into a BufferGeometry. */
function toGeometry(acc) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(acc.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(acc.nor, 3));
  if (acc.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(acc.uv, 2));
  if (acc.col) g.setAttribute('color', new THREE.Float32BufferAttribute(acc.col, 3));
  g.computeBoundingSphere();
  return g;
}

/**
 * Append a built-in three geometry into an accumulator under a transform, so a
 * token assembled from a dozen primitives still costs one draw call.
 *
 * Up-facing vertices are brightened in the colour attribute: the reference
 * measures piece side faces at 0.76 of the top face, and lighting alone does
 * not quite get there on a low-contrast tile.
 */
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();
function appendGeometry(acc, geometry, matrix, tint) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  _nm.getNormalMatrix(matrix);
  for (let i = 0; i < pos.count; i++) {
    _v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
    _n.fromBufferAttribute(nor, i).applyMatrix3(_nm).normalize();
    acc.pos.push(_v.x, _v.y, _v.z);
    acc.nor.push(_n.x, _n.y, _n.z);
    if (acc.uv) acc.uv.push(0, 0);
    if (acc.col) {
      const lift = 1 + 0.30 * Math.max(0, _n.y);   // top faces ~30% brighter
      const t = tint || [1, 1, 1];
      acc.col.push(t[0] * lift, t[1] * lift, t[2] * lift);
    }
  }
  if (g !== geometry) g.dispose();
  geometry.dispose();
}

const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
function place(x, y, z, ry = 0, sx = 1, sy = 1, sz = 1) {
  _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry);
  return _m4.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz)).clone();
}

/* ───────────────────────────────────────────────────── player token shapes */

/*
 * Original London silhouettes. Nothing here is drawn from any modern commercial
 * board: these are a scaffold tower, a chimney stack and a street bollard —
 * three things you actually trip over walking round the streets on this board.
 *
 * Player one is faceted and player two is round, so identity survives greyscale
 * and colour-blindness without relying on the colour at all.
 */

/** A plinth every token stands on, so they read as a matched set. */
function addPlinth(acc, radius) {
  appendGeometry(acc, new THREE.CylinderGeometry(radius, radius * 1.06, 0.075, 20, 1, false),
    place(0, 0.037, 0), null);
  // Chamfer catches the specular streak the reference measures on piece edges.
  appendGeometry(acc, new THREE.CylinderGeometry(radius * 0.94, radius, 0.03, 20, 1, false),
    place(0, 0.09, 0), null);
}

/** Scaffold tower: four standards, three lifts of ledgers, a boarded deck. */
function buildScaffoldTower() {
  const acc = newMesh(false, true);
  addPlinth(acc, 0.40);

  const legR = 0.052;
  const legH = 0.96;
  const spread = 0.215;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      appendGeometry(acc, new THREE.BoxGeometry(legR * 2, legH, legR * 2),
        place(sx * spread, 0.105 + legH / 2, sz * spread), null);
    }
  }
  for (const y of [0.32, 0.64, 0.94]) {
    for (const axis of [0, 1]) {
      const w = axis === 0 ? spread * 2 : legR * 1.6;
      const dpt = axis === 0 ? legR * 1.6 : spread * 2;
      for (const s of [-1, 1]) {
        appendGeometry(acc, new THREE.BoxGeometry(w, 0.045, dpt),
          place(axis === 0 ? 0 : s * spread, y, axis === 0 ? s * spread : 0), null);
      }
    }
  }
  // Boarded working deck with a chamfered lip.
  appendGeometry(acc, new THREE.BoxGeometry(0.56, 0.055, 0.56), place(0, 1.075, 0), null);
  appendGeometry(acc, new THREE.BoxGeometry(0.46, 0.05, 0.46), place(0, 1.125, 0), null);
  return toGeometry(acc);
}

/** Chimney stack: tapered shaft, corbelled cap, a single pot. */
function buildChimneyStack() {
  const acc = newMesh(false, true);
  addPlinth(acc, 0.38);

  appendGeometry(acc, new THREE.CylinderGeometry(0.225, 0.30, 0.74, 16, 1, false),
    place(0, 0.105 + 0.37, 0), null);
  appendGeometry(acc, new THREE.CylinderGeometry(0.29, 0.245, 0.075, 16, 1, false),
    place(0, 0.885, 0), null);
  appendGeometry(acc, new THREE.CylinderGeometry(0.265, 0.30, 0.055, 16, 1, false),
    place(0, 0.95, 0), null);
  appendGeometry(acc, new THREE.CylinderGeometry(0.125, 0.145, 0.20, 14, 1, false),
    place(0, 1.075, 0), null);
  appendGeometry(acc, new THREE.TorusGeometry(0.128, 0.022, 6, 14),
    place(0, 1.17, 0).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)), null);
  return toGeometry(acc);
}

/** Street bollard: tapered column, two collars, domed cap. */
function buildBollard() {
  const acc = newMesh(false, true);
  addPlinth(acc, 0.36);
  appendGeometry(acc, new THREE.CylinderGeometry(0.16, 0.235, 0.82, 14, 1, false),
    place(0, 0.105 + 0.41, 0), null);
  appendGeometry(acc, new THREE.CylinderGeometry(0.20, 0.20, 0.05, 14, 1, false),
    place(0, 0.42, 0), null);
  appendGeometry(acc, new THREE.CylinderGeometry(0.185, 0.185, 0.045, 14, 1, false),
    place(0, 0.83, 0), null);
  appendGeometry(acc, new THREE.SphereGeometry(0.16, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    place(0, 0.925, 0), null);
  return toGeometry(acc);
}

const TOKEN_BUILDERS = [buildScaffoldTower, buildChimneyStack, buildBollard];

/* ──────────────────────────────────────────── ownership marker + highlight */

/**
 * A surveyor's board: a low bar laid along the outer edge of the street with a
 * short post standing off it. Instanced across all 28 squares and tinted per
 * owner, so ownership costs one draw call however much of the board changes
 * hands.
 */
function buildMarker() {
  const acc = newMesh(false, true);
  appendGeometry(acc, new THREE.BoxGeometry(1.30, 0.075, 0.16), place(0, 0.037, 0), null);
  appendGeometry(acc, new THREE.BoxGeometry(0.10, 0.30, 0.10), place(-0.34, 0.20, 0), null);
  appendGeometry(acc, new THREE.BoxGeometry(0.62, 0.26, 0.055), place(0.02, 0.30, 0), null);
  return toGeometry(acc);
}

/** A raised gold frame around one square, rebuilt whenever the target moves. */
function buildHighlightFrame(w, d, thickness) {
  const acc = newMesh(false, false);
  const hw = w / 2, hd = d / 2, t = thickness, h = 0.055;
  const bar = (cx, cz, bw, bd) => {
    appendGeometry(acc, new THREE.BoxGeometry(bw, h, bd), place(cx, h / 2, cz), null);
  };
  bar(0, -hd + t / 2, w, t);
  bar(0, hd - t / 2, w, t);
  bar(-hw + t / 2, 0, t, d - t * 2);
  bar(hw - t / 2, 0, t, d - t * 2);
  return toGeometry(acc);
}
/* ─────────────────────────────────────────────────────────────────── dice */

/*
 * Real dice, not white cubes with a decal. Three things were called out and all
 * three are geometry or shading, not texture resolution: the silhouette had
 * hard edges, only one pip was ever visible, and they never moved. So: a
 * rounded cube built by projecting a subdivided box onto an inset box plus a
 * corner radius, pips painted as wells and carried on a bump map so the key
 * light actually shades inside them, and a throw that tumbles, bounces twice
 * and settles onto the face it was asked for.
 */

const DIE_S = 0.34;                     // half-edge, about a third of a square
const DIE_R = 0.088;                    // corner radius
const DIE_GRID = 5;                     // subdivisions per face

const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);

/** Pip centres in unit-face coordinates. */
const PIPS = {
  1: [[0.50, 0.50]],
  2: [[0.30, 0.30], [0.70, 0.70]],
  3: [[0.28, 0.28], [0.50, 0.50], [0.72, 0.72]],
  4: [[0.30, 0.30], [0.70, 0.30], [0.30, 0.70], [0.70, 0.70]],
  5: [[0.28, 0.28], [0.72, 0.28], [0.50, 0.50], [0.28, 0.72], [0.72, 0.72]],
  6: [[0.29, 0.26], [0.29, 0.50], [0.29, 0.74], [0.71, 0.26], [0.71, 0.50], [0.71, 0.74]],
};

/**
 * Which value faces which way. Opposite faces sum to seven, as they must on any
 * die anyone has ever held.
 */
const DIE_FACES = [
  { v: 1, n: [0, 1, 0], t: [1, 0, 0], b: [0, 0, 1] },
  { v: 6, n: [0, -1, 0], t: [1, 0, 0], b: [0, 0, -1] },
  { v: 3, n: [1, 0, 0], t: [0, 0, -1], b: [0, 1, 0] },
  { v: 4, n: [-1, 0, 0], t: [0, 0, 1], b: [0, 1, 0] },
  { v: 2, n: [0, 0, 1], t: [1, 0, 0], b: [0, 1, 0] },
  { v: 5, n: [0, 0, -1], t: [-1, 0, 0], b: [0, 1, 0] },
];

/** UV rectangle of one face on the 3 x 2 sheet, with the canvas flip applied. */
function dieCell(value) {
  const c = (value - 1) % 3;
  const r = Math.floor((value - 1) / 3);
  return { u0: c / 3, u1: (c + 1) / 3, v0: 1 - (r + 1) / 2, v1: 1 - r / 2 };
}

/**
 * Paint all six faces. Called twice: once for the ivory itself, once as a
 * height field. On the height field the pip is a bowl, so the standard material
 * shades the inside of every well against the key instead of printing a flat
 * black disc.
 */
function paintDie(cell, height) {
  const canvas = document.createElement('canvas');
  canvas.width = cell * 3;
  canvas.height = cell * 2;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = height ? '#B4B4B4' : '#F6F1E6';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let v = 1; v <= 6; v++) {
    const ox = ((v - 1) % 3) * cell;
    const oy = Math.floor((v - 1) / 3) * cell;
    ctx.save();
    ctx.translate(ox, oy);

    if (!height) {
      const g = ctx.createLinearGradient(0, 0, cell, cell);
      g.addColorStop(0, '#FFFDF6');
      g.addColorStop(1, '#DCD2BE');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, cell, cell);
    }

    const r = cell * 0.088;
    for (const [px, py] of PIPS[v]) {
      const x = px * cell, y = py * cell;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      if (height) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, '#0E0E0E');
        g.addColorStop(0.70, '#404040');
        g.addColorStop(1, '#B4B4B4');
        ctx.fillStyle = g;
        ctx.fill();
      } else {
        const g = ctx.createRadialGradient(x - r * 0.34, y - r * 0.34, r * 0.05, x, y, r * 1.02);
        g.addColorStop(0, '#080808');
        g.addColorStop(0.60, '#1E1C1A');
        g.addColorStop(1, '#7C6E5C');
        ctx.fillStyle = g;
        ctx.fill();
        // Catchlight on the far wall of the well, where a key from the upper
        // left would strike it. This is what makes a printed dot read as a hole.
        ctx.strokeStyle = 'rgba(255,250,236,0.62)';
        ctx.lineWidth = Math.max(1, cell * 0.014);
        ctx.beginPath();
        ctx.arc(x, y, r * 0.93, Math.PI * 0.12, Math.PI * 0.88);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = height ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/**
 * A rounded cube. Every vertex of a subdivided box is clamped onto an inset box
 * and then pushed back out by the corner radius, which leaves the six faces
 * dead flat where the pips live and rounds only the edges and corners. Normals
 * come straight out of that projection, so the rounded edge carries a real
 * highlight rather than a shading seam.
 */
function buildDie() {
  const acc = newMesh(true, false);
  const inner = DIE_S - DIE_R;

  for (const f of DIE_FACES) {
    const cellUv = dieCell(f.v);
    const grid = [];
    for (let i = 0; i <= DIE_GRID; i++) {
      grid[i] = [];
      for (let j = 0; j <= DIE_GRID; j++) {
        const a = (i / DIE_GRID) * 2 - 1;
        const b = (j / DIE_GRID) * 2 - 1;
        const raw = [
          (f.n[0] + f.t[0] * a + f.b[0] * b) * DIE_S,
          (f.n[1] + f.t[1] * a + f.b[1] * b) * DIE_S,
          (f.n[2] + f.t[2] * a + f.b[2] * b) * DIE_S,
        ];
        const cl = [clamp(raw[0], -inner, inner), clamp(raw[1], -inner, inner),
          clamp(raw[2], -inner, inner)];
        const dx = raw[0] - cl[0], dy = raw[1] - cl[1], dz = raw[2] - cl[2];
        const len = Math.hypot(dx, dy, dz) || 1;
        const n = [dx / len, dy / len, dz / len];
        grid[i][j] = {
          p: [cl[0] + n[0] * DIE_R, cl[1] + n[1] * DIE_R, cl[2] + n[2] * DIE_R],
          n,
          uv: [lerp(cellUv.u0, cellUv.u1, i / DIE_GRID), lerp(cellUv.v0, cellUv.v1, j / DIE_GRID)],
        };
      }
    }
    // Wind each quad so it faces outward whichever way the tangent frame runs.
    const cross = [
      f.t[1] * f.b[2] - f.t[2] * f.b[1],
      f.t[2] * f.b[0] - f.t[0] * f.b[2],
      f.t[0] * f.b[1] - f.t[1] * f.b[0],
    ];
    const flip = cross[0] * f.n[0] + cross[1] * f.n[1] + cross[2] * f.n[2] < 0;
    for (let i = 0; i < DIE_GRID; i++) {
      for (let j = 0; j < DIE_GRID; j++) {
        const quad = flip
          ? [grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]]
          : [grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]];
        for (const k of [0, 1, 2, 0, 2, 3]) {
          pushVertex(acc, quad[k].p, quad[k].n, quad[k].uv, null);
        }
      }
    }
  }
  return toGeometry(acc);
}

const _dqSpin = new THREE.Quaternion();
const _dqYaw = new THREE.Quaternion();

/** Orientation that puts `value` face up, with an arbitrary yaw on top of it. */
function faceUp(value, yaw, out) {
  if (value === 6) out.setFromAxisAngle(AXIS_X, Math.PI);
  else if (value === 3) out.setFromAxisAngle(AXIS_Z, Math.PI / 2);
  else if (value === 4) out.setFromAxisAngle(AXIS_Z, -Math.PI / 2);
  else if (value === 2) out.setFromAxisAngle(AXIS_X, -Math.PI / 2);
  else if (value === 5) out.setFromAxisAngle(AXIS_X, Math.PI / 2);
  else out.identity();
  _dqYaw.setFromAxisAngle(AXIS_Y, yaw);
  return out.premultiply(_dqYaw);
}

/**
 * Height above the resting face over the course of a throw: a free fall, then
 * two damped bounces, arriving at exactly zero. Expressed as a fraction of the
 * release height so the same curve serves any throw.
 */
function diceDrop(p) {
  if (p <= 0) return 1;
  if (p >= 1) return 0;
  if (p < 0.55) { const u = p / 0.55; return 1 - u * u; }
  if (p < 0.83) { const u = (p - 0.55) / 0.28; return 0.16 * 4 * u * (1 - u); }
  const u = (p - 0.83) / 0.17;
  return 0.042 * 4 * u * (1 - u);
}

/*
 * The HUD asks this module whether the scene owns the dice. It does, so the HUD
 * removes its own flat plates rather than showing the result twice.
 */
export const sceneOwnsDice = true;

/** Set by createScene; the HUD holds only the module-level handle. */
let activeRoll = null;

/**
 * Throw both dice and resolve once they have settled showing `d1` and `d2`.
 * @returns {Promise<void>}
 */
export function rollDice(d1, d2) {
  return activeRoll ? activeRoll(d1, d2) : Promise.resolve();
}

/* ══════════════════════════════════════════════════════════════ createScene */

/**
 * Build the whole presentation layer.
 *
 * @param {object} opts
 * @param {HTMLCanvasElement} opts.canvas
 * @param {Array} opts.board   the 28-square array from engine.js buildBoard()
 * @param {Array} opts.players player records carrying {id, name, colour}
 */
export function createScene({ canvas, board, players }) {
  if (!canvas) throw new Error('createScene needs a canvas');
  if (!board || board.length !== RING) throw new Error(`createScene expects ${RING} squares`);

  THREE.ColorManagement.enabled = true;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const layout = buildLayout();
  const disposables = [];
  const track = (x) => { disposables.push(x); return x; };

  /* ─────────────────────────────────────────────────── quality tiers */

  /*
   * Start mid on anything that looks like a phone and promote only after
   * sustained headroom. The pixel-ratio cap is min(2, devicePixelRatio) at the
   * top tier — DPR 3 on a modern handset is three million fragments per
   * full-screen draw and throttles a mid-range device inside two minutes.
   */
  const TIERS = {
    high: { dpr: 2.0, shadowSize: 2048, shadows: true, props: true, tone: true },
    mid: { dpr: 1.5, shadowSize: 1024, shadows: true, props: true, tone: true },
    low: { dpr: 1.0, shadowSize: 0, shadows: false, props: false, tone: false },
  };
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const smallScreen = Math.min(window.innerWidth, window.innerHeight) < 700;
  let tier = coarse || smallScreen ? 'mid' : 'high';

  /* ─────────────────────────────────────────────────────── renderer */

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,          // 4x MSAA resolves in tile memory nearly free
    alpha: false,
    stencil: false,
    depth: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = TIERS[tier].shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;   // driven by hand, see markShadows()
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, TIERS[tier].dpr));

  /* ────────────────────────────────────────────────────────── scene */

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(ROOM);
  scene.fog = new THREE.Fog(new THREE.Color(ROOM), 40, 160);   // refit on resize

  const camera = new THREE.PerspectiveCamera(FRAMINGS.table.fov, 1, 0.5, 400);
  scene.add(camera);

  // Environment map: a two-stop warm gradient, pre-filtered. This is what gives
  // the tokens a plastic specular instead of a plastic-coloured matte.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envSource = paintEnvironment();
  const envTarget = pmrem.fromEquirectangular(envSource);
  scene.environment = envTarget.texture;
  envSource.dispose();
  pmrem.dispose();

  /* ───────────────────────────────────────────────────────── lights */

  /*
   * Warm key, cool fill, warm rim, over a hemisphere that keeps the shadows
   * alive. The target the reference measures is a shadowed surface retaining
   * 0.58 of lit luminance while shifting blue — shadows crushed toward black
   * are the tell of a single unlit directional.
   */
  // Hemisphere pulled back from 0.55: at that strength it washed out the key
  // entirely and every surface sat at the same exposure, which is exactly what
  // a blind critic called out. Measured by A/B render, not by eye.
  const hemi = new THREE.HemisphereLight(0xFFF6E6, 0x6E3F1E, 0.40);
  scene.add(hemi);

  // The key was at +z, the same side as the camera, so every shadow it cast
  // fell BEHIND its object and was hidden. Moved lateral and slightly to the
  // far side so the falloff reads across the board and side walls shade.
  const key = new THREE.DirectionalLight(0xFFF1D6, 2.1);
  key.position.set(-1.5 * R, 1.0 * R, -0.4 * R);
  key.castShadow = true;
  key.shadow.mapSize.set(TIERS[tier].shadowSize || 1024, TIERS[tier].shadowSize || 1024);
  // Wide enough to hold the carcass shadow, which now falls roughly BASE_H /
  // tan(elevation) beyond the board's own edge. Clipping it would put a hard
  // straight line across the table exactly where the soft edge should be.
  key.shadow.camera.left = -1.45 * R;
  key.shadow.camera.right = 1.45 * R;
  key.shadow.camera.top = 1.45 * R;
  key.shadow.camera.bottom = -1.45 * R;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 6 * R;
  key.shadow.bias = -0.0002;
  key.shadow.normalBias = 0.01;
  key.shadow.radius = 2;              // tight: a contact shadow in a few pixels
  key.shadow.camera.updateProjectionMatrix();
  scene.add(key);
  scene.add(key.target);

  // Fill and rim pulled down: at spec strength they filled the key's own
  // falloff back in, so the board read evenly lit whatever the key did.
  const fill = new THREE.DirectionalLight(0x9FC6EA, 0.22);
  fill.position.set(1.0 * R, 0.8 * R, -0.6 * R);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xFFC98A, 0.30);
  rim.position.set(0, 0.6 * R, -1.4 * R);
  scene.add(rim);

  /* ─────────────────────────────────────────────── table and props */

  /*
   * The table runs out of frame in every direction. The pool of light is baked
   * into its vertex colours in world space, so the board frames itself before
   * the screen-space vignette adds anything at all.
   */
  /*
   * Contact-shadow decal, shared by every object that has to sit on something:
   * tokens, ownership markers, dice and the table props. It is drawn as an
   * unlit quad a few thousandths above the receiving surface, so the darkest
   * pixel is always in contact with the base of the object above it.
   */
  const blobTex = track(paintBlob(128));
  const blobMat = track(new THREE.MeshBasicMaterial({
    map: blobTex, transparent: true, depthWrite: false, toneMapped: false,
    color: 0xFFFFFF, opacity: 1,
  }));
  const blobGeo = track(new THREE.PlaneGeometry(1, 1));
  blobGeo.rotateX(-Math.PI / 2);
  const newBlob = (scaleX, scaleZ, opacity) => {
    const b = new THREE.Mesh(blobGeo, blobMat.clone());
    track(b.material);
    b.material.opacity = opacity === undefined ? 1 : opacity;
    b.scale.set(scaleX, 1, scaleZ === undefined ? scaleX : scaleZ);
    b.renderOrder = 2;
    return b;
  };

  const woodMap = track(paintWood(512));
  const tableGeo = track(new THREE.PlaneGeometry(700, 700, 26, 26));
  tableGeo.rotateX(-Math.PI / 2);
  {
    const pos = tableGeo.attributes.position;
    const colours = new Float32Array(pos.count * 3);
    const litRgb = linear(TABLE_LIT);
    const cornerRgb = linear(TABLE_CORNER);
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getZ(i));
      // Full brightness across the board, decaying to the corner value by 4.6R.
      const t = clamp((r - 1.15 * R) / (3.45 * R), 0, 1);
      const f = 1 - t * t * (3 - 2 * t);        // smoothstep falloff
      for (let c = 0; c < 3; c++) {
        colours[i * 3 + c] = lerp(cornerRgb[c], litRgb[c], f) / Math.max(litRgb[c], 1e-4);
      }
    }
    tableGeo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  }
  const tableMat = track(new THREE.MeshStandardMaterial({
    map: woodMap, color: new THREE.Color(TABLE_LIT), vertexColors: true,
    roughness: 0.88, metalness: 0.0, envMapIntensity: 0.10, fog: true,
  }));
  const table = new THREE.Mesh(tableGeo, tableMat);
  table.position.y = -BASE_H;
  table.receiveShadow = true;
  scene.add(table);

  /*
   * One prop, cropped at the frame edge, seated on the table. The previous
   * version stacked two free-floating discs a full board-height above the
   * surface with nothing under them: they read as a brown disc hovering at
   * upper-left with a detached shadow, which is worse than no prop at all. What
   * is left is a turned vessel standing on the wood, with a contact shadow that
   * touches its foot. Repositioned on resize so it stays cropped in any aspect.
   */
  const propMat = track(new THREE.MeshStandardMaterial({
    color: new THREE.Color('#7A5236'), roughness: 0.62, metalness: 0.0, envMapIntensity: 0.35,
  }));
  const propGroup = new THREE.Group();
  {
    const vessel = track(new THREE.LatheGeometry([
      new THREE.Vector2(0.01, 0), new THREE.Vector2(1.5, 0.05), new THREE.Vector2(1.85, 0.9),
      new THREE.Vector2(1.55, 2.1), new THREE.Vector2(1.62, 2.35), new THREE.Vector2(1.5, 2.4),
      new THREE.Vector2(1.35, 2.1), new THREE.Vector2(1.6, 0.95), new THREE.Vector2(1.2, 0.1),
    ], 18));
    const a = new THREE.Mesh(vessel, propMat);
    a.position.set(0, -BASE_H, 0);
    a.castShadow = true;
    propGroup.add(a);

    const foot = newBlob(4.4, 4.4, 0.9);
    foot.position.set(0, -BASE_H + 0.005, 0);
    propGroup.add(foot);
  }
  propGroup.visible = TIERS[tier].props;
  scene.add(propGroup);

  /* ──────────────────────────────────────────────── the board itself */

  // Device pixels per design unit. A short cell is SHORT design units wide, so
  // painting it at cellW pixels means scale = cellW / SHORT. On a phone the
  // micro-print is dropped (compact) so the name and price keep their size.
  const cellW = (coarse || smallScreen) ? 192 : 256;
  let labelScale = 1;
  const atlas = paintAtlas(board, layout, cellW / SHORT, smallScreen, labelScale);
  track(atlas.texture);

  const faces = newMesh(true, false);
  const solid = newMesh(false, true);

  // Carcass under everything, bevelled like the tiles so the board reads as one
  // manufactured object rather than tiles floating on a plane. Its top sits at
  // y = 0, which is what shows through the gaps between the slabs.
  emitSlab({
    cx: 0, cz: 0, w: 2 * (R + 0.45), d: 2 * (R + 0.45),
    h: BASE_H, baseY: -BASE_H, rotY: 0,
    faces: null, solid, uv: null,
    topColour: linear(CARCASS_TOP),
    rimColour: linear(CARCASS_TOP), wallColour: linear(CARCASS),
  });

  /*
   * A dark ring laid on the carcass under the whole track, four thousandths
   * proud of it. Nothing of it shows except through the joints — the tiles
   * cover the rest — so what it actually draws is a dark line in every gap
   * between neighbouring spaces and along the seam where the track meets the
   * board's inner frame. That is the read the spaces were missing: they were
   * extruded all along, but seated in a carcass lighter than their own side
   * walls, so the joints came out as highlights and the whole track flattened
   * back into a printed sheet. One ring, no extra draw call, no light touched.
   */
  {
    const outer = R + 0.06;
    const inner = R - CORNER - 0.06;
    const joint = linear(JOINT);
    const quad = (cx, cz, w, d) => {
      const hw = w / 2, hd = d / 2;
      pushQuad(solid,
        [cx + hw, 0.004, cz - hd], [cx - hw, 0.004, cz - hd],
        [cx - hw, 0.004, cz + hd], [cx + hw, 0.004, cz + hd],
        [0, 1, 0], null, joint);
    };
    const band = outer - inner;
    quad(0, (outer + inner) / 2, 2 * outer, band);      // near run
    quad(0, -(outer + inner) / 2, 2 * outer, band);     // far run
    quad((outer + inner) / 2, 0, band, 2 * inner);      // right run
    quad(-(outer + inner) / 2, 0, band, 2 * inner);     // left run
  }

  // Which chamfer of a slab faces the board centre, given the edge it sits on.
  // Edge indices in emitSlab run 0:−z, 1:−x, 2:+z, 3:+x.
  const INBOARD_EDGE = { bottom: 0, left: 3, right: 1, top: 2 };

  for (let i = 0; i < RING; i++) {
    const L = layout[i];
    const sq = board[i];
    // The colour band is printed along the inboard edge of the face, and the
    // face ends in a chamfer. Tinting that one chamfer toward the group colour
    // carries the band over the edge of the slab, so the band has a lit
    // thickness instead of stopping flat at the outline of the tile. Only
    // partly toward it — the chamfer is still the surface the key reads, and
    // that read is not for sale.
    let edgeRim = null;
    const e = INBOARD_EDGE[L.edge];
    if (sq.type === 'street' && e !== undefined) {
      const g = F.groupOf(F.street(sq.streetId).group);
      edgeRim = [];
      edgeRim[e] = mixLinear(linear(g.colour), linear(TILE_RIM), 0.5);
    }
    // The layout already carries the finished footprint: the gap was taken out
    // of the correct world axis when the ring was built, so a corner and the
    // side tile beside it are now exactly the same depth and seat flush.
    emitSlab({
      cx: L.x, cz: L.z, rotY: L.rotY, w: L.w, d: L.d,
      h: TILE_H, faces, solid, uv: atlas.rects[i], edgeRim,
      rimColour: linear(TILE_RIM), wallColour: linear(TILE_WALL),
    });
  }

  const facesGeo = track(toGeometry(faces));
  const solidGeo = track(toGeometry(solid));

  const facesMat = track(new THREE.MeshStandardMaterial({
    map: atlas.texture, roughness: 0.85, metalness: 0.0, envMapIntensity: 0.15,
  }));
  const solidMat = track(new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.82, metalness: 0.0, envMapIntensity: 0.15,
  }));

  const facesMesh = new THREE.Mesh(facesGeo, facesMat);
  facesMesh.receiveShadow = true;
  scene.add(facesMesh);

  const solidMesh = new THREE.Mesh(solidGeo, solidMat);
  solidMesh.castShadow = true;
  solidMesh.receiveShadow = true;
  scene.add(solidMesh);

  // Centre plate: its own slab, with the crest baked into the top face.
  {
    const inner = 2 * (R - CORNER);
    const cAcc = newMesh(false, true);
    emitSlab({
      cx: 0, cz: 0, w: inner, d: inner, h: CENTRE_H, rotY: 0,
      faces: null, solid: cAcc, uv: null,
      topColour: linear('#241A12'),
      rimColour: linear('#3A2A1C'), wallColour: linear('#2E2114'),
    });
    const cGeo = track(toGeometry(cAcc));
    const cMesh = new THREE.Mesh(cGeo, solidMat);
    cMesh.receiveShadow = true;
    scene.add(cMesh);

    const crestTex = track(paintCentre(512));
    const crestMat = track(new THREE.MeshStandardMaterial({
      map: crestTex, roughness: 0.78, metalness: 0.0, envMapIntensity: 0.18,
    }));
    const crestGeo = track(new THREE.PlaneGeometry(inner - BEVEL_IN * 2, inner - BEVEL_IN * 2));
    crestGeo.rotateX(-Math.PI / 2);
    const crest = new THREE.Mesh(crestGeo, crestMat);
    crest.position.y = CENTRE_H + 0.002;
    crest.receiveShadow = true;
    scene.add(crest);
  }
  /* ──────────────────────────────────────────────── tokens and shadows */

  /**
   * World position of a token standing on square `i` in slot `slot`.
   *
   * Seats spread ALONG the running track and the whole rank stands off toward
   * the outer rim, away from the board centre. Both axes come from the layout
   * rather than from a yaw: every slab is axis-aligned, so the old version —
   * which spread along world x and stepped along world z whatever edge the
   * square sat on — pushed the left and right columns along their own track
   * instead of outward, and left both starting pieces sitting squarely on top
   * of the start square's name.
   */
  const _p = new THREE.Vector3();
  function squarePoint(i, slot, slots, out = new THREE.Vector3()) {
    const L = layout[((i % RING) + RING) % RING];
    const alongX = L.run === 'x';
    const runLen = alongX ? L.w : L.d;
    const crossLen = alongX ? L.d : L.w;
    const seat = L.corner ? CORNER_SPREAD : TOKEN_SPREAD;
    const spread = slots > 1 ? (slot - (slots - 1) / 2) * runLen * seat : 0;
    const step = crossLen * TOKEN_OUTWARD;

    // Outward is the reverse of the square's inward vector. A corner's inward
    // vector is diagonal; taking only its z sign stands both corner pieces on
    // the near or far kerb rather than bunching them into the outside corner,
    // which is where the width to separate them is.
    const outX = L.corner ? 0 : -L.inX * step;
    const outZ = L.corner ? -Math.sign(L.inZ) * step : -L.inZ * step;

    return out.set(
      L.x + (alongX ? spread : 0) + outX,
      TILE_H,
      L.z + (alongX ? 0 : spread) + outZ,
    );
  }

  const tokens = players.map((p, k) => {
    const geometry = track(TOKEN_BUILDERS[k % TOKEN_BUILDERS.length]());
    const material = track(new THREE.MeshStandardMaterial({
      color: new THREE.Color(p.colour || '#B4B4B4'),
      vertexColors: true,
      roughness: 0.35,          // injection-moulded gloss, never Lambert/Basic
      metalness: 0.0,
      envMapIntensity: 0.60,
    }));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = false;

    // Tight to the plinth it belongs to: the plinth is 0.80 across, so a 0.88
    // blob shows a thin dark ring right at the join and nothing beyond it.
    const blob = newBlob(0.88, 0.88);

    const group = new THREE.Group();
    group.add(mesh);
    scene.add(group);
    scene.add(blob);

    const t = {
      id: p.id, slot: k, mesh, group, blob, square: 0,
      anim: null, heading: 0,
    };
    squarePoint(0, k, players.length, _p);
    group.position.copy(_p);
    blob.position.set(_p.x, TILE_H + 0.004, _p.z);
    return t;
  });
  const tokenById = new Map(tokens.map((t) => [t.id, t]));

  /* ───────────────────────────────────────────── ownership markers */

  const markerGeo = track(buildMarker());
  const markerMat = track(new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.38, metalness: 0.0, envMapIntensity: 0.55,
  }));
  const markers = new THREE.InstancedMesh(markerGeo, markerMat, RING);
  markers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  markers.castShadow = true;
  markers.count = RING;
  scene.add(markers);
  const markerOwner = new Array(RING).fill(null);
  const _hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  const _white = new THREE.Color(0xFFFFFF);
  for (let i = 0; i < RING; i++) {
    markers.setMatrixAt(i, _hidden);
    markers.setColorAt(i, _white);      // allocates instanceColor up front
  }
  markers.instanceMatrix.needsUpdate = true;
  if (markers.instanceColor) markers.instanceColor.needsUpdate = true;

  /*
   * A matching instanced sheet of contact shadows, one per marker slot. Without
   * it the surveyor's board reads as a sticker printed on the square: the shadow
   * map alone puts its shadow off to one side, and nothing sits under the bar
   * where it meets the tile.
   */
  const markerBlobMat = track(blobMat.clone());
  markerBlobMat.opacity = 0.95;
  const markerBlobs = new THREE.InstancedMesh(blobGeo, markerBlobMat, RING);
  markerBlobs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  markerBlobs.renderOrder = 2;
  markerBlobs.frustumCulled = false;
  for (let i = 0; i < RING; i++) markerBlobs.setMatrixAt(i, _hidden);
  markerBlobs.instanceMatrix.needsUpdate = true;
  scene.add(markerBlobs);

  /* ───────────────────────────────────────────────────── highlight */

  const highlightMat = track(new THREE.MeshStandardMaterial({
    color: new THREE.Color(HIGHLIGHT),
    emissive: new THREE.Color(HIGHLIGHT),
    emissiveIntensity: 0.45,
    roughness: 0.4, metalness: 0.0, envMapIntensity: 0.5,
  }));
  let highlightMesh = null;
  let highlightIndex = null;
  let highlightPop = 0;          // 0..1 pop-in, then static (no idle redraw)

  /* ───────────────────────────────────────────────────────── dice */

  /*
   * They live on the centre plate, clear of the crest and its source lines, on
   * the near side where the table camera reads them without a cut. Each carries
   * its own contact shadow, which tightens as it lands.
   */
  const DICE_REST = [[-0.86, 5.28], [0.84, 5.74]];
  const dieMap = track(paintDie(128, false));
  const dieHeight = track(paintDie(128, true));
  const dieMat = track(new THREE.MeshStandardMaterial({
    map: dieMap, bumpMap: dieHeight, bumpScale: 0.55,
    roughness: 0.30, metalness: 0.0, envMapIntensity: 0.75,
  }));
  const dieGeo = track(buildDie());
  const DICE_BLOB = DIE_S * 3.3;    // spills past the die, so the base is dark

  const dice = DICE_REST.map(([x, z], k) => {
    const mesh = new THREE.Mesh(dieGeo, dieMat);
    mesh.castShadow = true;
    mesh.position.set(x, CENTRE_H + DIE_S, z);
    scene.add(mesh);

    const blob = newBlob(DICE_BLOB, DICE_BLOB);
    blob.position.set(x, CENTRE_H + 0.004, z);
    scene.add(blob);

    const d = {
      mesh, blob,
      rest: new THREE.Vector3(x, CENTRE_H + DIE_S, z),
      start: new THREE.Vector3(),
      target: new THREE.Quaternion(),
      capture: new THREE.Quaternion(),
      axis: new THREE.Vector3(0, 1, 0),
      spin: 0,
    };
    // A settled pair before the first throw, so they never read as blank cubes.
    faceUp(k === 0 ? 4 : 3, k === 0 ? -0.38 : 0.26, mesh.quaternion);
    return d;
  });

  let diceAnim = null;

  function rollTheDice(d1, d2) {
    const values = [clamp(Math.round(d1) || 1, 1, 6), clamp(Math.round(d2) || 1, 1, 6)];
    const reduced = reduceMotion.matches;
    for (let k = 0; k < 2; k++) {
      const d = dice[k];
      // Released over the near-right shoulder, the way a player actually throws.
      d.start.set(d.rest.x + 2.7 - k * 0.8, d.rest.y + 4.0, d.rest.z + 2.4 + k * 0.6);
      d.axis.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
      d.spin = 13 + Math.random() * 8;
      faceUp(values[k], (Math.random() - 0.5) * 1.3, d.target);
      d.capture.copy(d.mesh.quaternion);
      if (reduced) {
        d.mesh.quaternion.copy(d.target);
        d.mesh.position.copy(d.rest);
        d.blob.position.set(d.rest.x, CENTRE_H + 0.004, d.rest.z);
        d.blob.scale.set(DICE_BLOB, 1, DICE_BLOB);
        d.blob.material.opacity = 1;
      }
    }
    if (reduced) { diceAnim = null; invalidate(); return Promise.resolve(); }
    return new Promise((resolve) => {
      diceAnim = { t: 0, dur: 580, resolve };
      invalidate();
    });
  }

  /** Advance the throw. Returns true while the dice are still in the air. */
  function stepDice(dtMs) {
    if (!diceAnim) return false;
    const a = diceAnim;
    a.t += dtMs;
    const p = clamp(a.t / a.dur, 0, 1);
    const glide = easeOutCubic(p);

    for (const d of dice) {
      const rise = diceDrop(p) * (d.start.y - d.rest.y);
      d.mesh.position.set(
        lerp(d.start.x, d.rest.x, glide),
        d.rest.y + rise,
        lerp(d.start.z, d.rest.z, glide),
      );

      if (p < 0.60) {
        _dqSpin.setFromAxisAngle(d.axis, (d.spin * dtMs) / 1000);
        d.mesh.quaternion.premultiply(_dqSpin);
        d.capture.copy(d.mesh.quaternion);
      } else {
        d.mesh.quaternion.slerpQuaternions(d.capture, d.target,
          easeOutCubic((p - 0.60) / 0.40));
      }

      const lift = clamp(rise / 2.6, 0, 1);
      const s = lerp(DICE_BLOB, DICE_BLOB * 2.4, lift);
      d.blob.position.set(d.mesh.position.x, CENTRE_H + 0.004, d.mesh.position.z);
      d.blob.scale.set(s, 1, s);
      d.blob.material.opacity = lerp(1, 0.20, lift);
    }

    if (p >= 1) {
      const { resolve } = a;
      diceAnim = null;
      resolve();
      return false;
    }
    return true;
  }

  activeRoll = rollTheDice;

  /* ──────────────────────────────────────────────── vignette pass */

  const vignetteScene = new THREE.Scene();
  const vignetteCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const vignetteTex = track(paintVignette(256));
  const vignetteMat = track(new THREE.MeshBasicMaterial({
    map: vignetteTex, transparent: true, depthTest: false, depthWrite: false,
    toneMapped: false, color: 0x000000,
  }));
  const vignetteGeo = track(new THREE.PlaneGeometry(2, 2));
  const vignetteQuad = new THREE.Mesh(vignetteGeo, vignetteMat);
  vignetteQuad.frustumCulled = false;
  vignetteScene.add(vignetteQuad);

  /* ─────────────────────────────────────────────────── camera rig */

  let mode = 'table';
  let fade = null;                 // {from:{...}, to:'mode', t, dur}
  const rig = { fov: FRAMINGS.table.fov, pitch: FRAMINGS.table.pitch, dist: FRAMINGS.table.dist * R,
    shift: 0, target: new THREE.Vector3(...FRAMINGS.table.target) };
  let followToken = tokens[0] || null;

  let cssW = 1, cssH = 1, aspect = 1;
  let dirty = true;
  let quiet = 0;
  let shadowsDirty = true;
  const invalidate = () => { dirty = true; quiet = 0; };
  const markShadows = () => { shadowsDirty = true; invalidate(); };

  /**
   * Distance and field of view that keep a square board fully framed in any
   * aspect ratio. The tighter of the two axes always wins, and portrait widens
   * the lens so the perspective gradient survives on a phone — a long lens on a
   * 390px screen flattens the board into the fake-isometric look the spec bans.
   */
  /*
   * The HUD's own strips are measured rather than guessed. They are sized in
   * container units, so a fixed pixel constant that clears them at 1440 wide
   * does not clear them at 1920 — the far row went behind the identity panels.
   * The constants stay as the fallback for a host that renders no HUD at all.
   * Re-measured at most a few times a second, and only when a framing is
   * resolved, so the board never resizes under a still camera.
   */
  const chrome = { top: HEAD_RESERVE, bottom: FOOT_RESERVE, at: -1e6 };

  function measureChrome() {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - chrome.at < 400) return chrome;
    chrome.at = now;

    let t = 0;
    let b = 0;
    try {
      const frame = canvas.getBoundingClientRect();
      for (const el of document.querySelectorAll('.ll-top, .ll-beat')) {
        const r = el.getBoundingClientRect();
        if (r.height > 0 && r.width > 0) t = Math.max(t, r.bottom - frame.top);
      }
      for (const el of document.querySelectorAll('.ll-foot')) {
        const r = el.getBoundingClientRect();
        if (r.height > 0 && r.width > 0) b = Math.max(b, frame.bottom - r.top);
      }
    } catch (e) { /* nothing measurable: the fallbacks below stand */ }

    const fallbackT = aspect < 1 ? cssH * 0.20 : HEAD_RESERVE;
    const fallbackB = aspect < 1 ? Math.max(FOOT_RESERVE, cssH * 0.075) : FOOT_RESERVE;
    chrome.top = clamp(t > 4 ? t + 12 : fallbackT, 0, cssH * 0.34);
    chrome.bottom = clamp(b > 4 ? b + 8 : fallbackB, 0, cssH * 0.18);
    return chrome;
  }

  /** Height at the bottom of the frame owned by chrome, in CSS pixels. */
  function bottomReserve() { return measureChrome().bottom; }

  /** Height at the top of the frame owned by chrome, in CSS pixels. */
  function topReserve() { return measureChrome().top; }

  /* The eight corners of the board carcass, top face and underside. */
  const FIT_POINTS = (() => {
    const e = R + 0.45;
    const out = [];
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        out.push([sx * e, TILE_H, sz * e]);
        out.push([sx * e, -BASE_H, sz * e]);
      }
    }
    return out;
  })();

  /**
   * Distance and image shift at which the whole carcass sits inside the space
   * above the attribution strip, found by projecting its corners rather than
   * estimating the vertical extent as R·sin(pitch). That estimate is only true
   * for a long lens: on the 46 degree lens this framing now uses, the near edge
   * is half again closer than the far edge, so the approximation under-reads
   * the board's screen height and the bottom row went under the strip.
   *
   * A perspective board is also not vertically centred by its own lookAt — the
   * near edge falls further below frame centre than the far edge rises above
   * it. So distance and shift are solved together: shift centres the projected
   * board in the usable band, distance shrinks it until it fits that band.
   */
  function fitFraming(fov, pitch, target, pad, startDist) {
    const vFov = THREE.MathUtils.degToRad(fov);
    const tanV = Math.tan(vFov / 2);
    const tanH = tanV * aspect;
    const pitchRad = THREE.MathUtils.degToRad(pitch);
    const sn = Math.sin(pitchRad), cs = Math.cos(pitchRad);

    // Reserved strips in NDC, where the full frame spans 2.
    const h = Math.max(1, cssH);
    const bBand = (2 * bottomReserve()) / h;
    const tBand = (2 * topReserve()) / h;
    const bandMid = (bBand - tBand) / 2;
    const limitV = Math.max(0.2, 1 - (bBand + tBand) / 2);
    let dist = startDist;
    let shift = bandMid;

    for (let pass = 0; pass < 8; pass++) {
      const cy = target.y + sn * dist;
      const cz = target.z + cs * dist;
      let lo = Infinity, hi = -Infinity, spanX = 0, blown = false;
      for (const p of FIT_POINTS) {
        const vx = p[0] - target.x;
        const vy = p[1] - cy;
        const vz = p[2] - cz;
        const depth = -(vy * sn + vz * cs);      // along the view direction
        if (depth <= 0.05) { blown = true; break; }
        const ndcY = (vy * cs - vz * sn) / (depth * tanV);
        lo = Math.min(lo, ndcY);
        hi = Math.max(hi, ndcY);
        spanX = Math.max(spanX, Math.abs(vx / (depth * tanH)));
      }
      if (blown) { dist *= 1.5; continue; }
      // Positive shift lifts the image; the board's projected midpoint has to
      // land on the midpoint of the band the chrome leaves free. A square board
      // on a portrait frame is pinned by its width, so there is height to spare:
      // that slack goes under the board, where the thumb controls live, rather
      // than being split evenly above and below.
      const half = (hi - lo) / 2;
      const slack = Math.max(0, limitV - half * pad);
      // Portrait slack was pushed almost entirely under the board, which left
      // the board stranded high with a dead band beneath it. A square board on
      // a tall frame is width-pinned whatever the lens does, so some empty
      // table is unavoidable; splitting it more evenly reads as composition
      // rather than as a mistake.
      shift = bandMid - (lo + hi) / 2 + (aspect < 1 ? slack * 0.22 : 0);
      const need = Math.max((half * pad) / limitV, spanX * pad);
      if (need <= 1.002) break;
      dist *= Math.min(need, 1.5);
    }
    return { dist, shift };
  }

  function resolveFraming(name) {
    const f = FRAMINGS[name];
    // A travel camera aimed squarely at a token on the left column puts the
    // whole board in the right half of the frame and bare table in the left.
    // Pulling the aim point back toward the middle keeps the board filling the
    // frame while the camera still visibly trails the piece.
    const FOLLOW_BIAS = 0.55;
    const target = f.target
      ? _p.set(f.target[0], f.target[1], f.target[2]).clone()
      : (followToken
        ? new THREE.Vector3(followToken.group.position.x * FOLLOW_BIAS, TILE_H + 0.35,
          followToken.group.position.z * FOLLOW_BIAS)
        : new THREE.Vector3(0, TILE_H, 0));

    let fov = f.fov;
    let pitch = f.pitch;
    let dist = f.dist * R;
    // The travel and dice framings aim at a point rather than fitting the whole
    // board, so they only owe the attribution strip its clearance.
    let shift = bottomReserve() / Math.max(1, cssH);

    if (f.fit) {
      // Ramp 46 deg (landscape) to 56 deg (portrait) as the frame narrows.
      const t = clamp((1.6 - aspect) / (1.6 - 0.55), 0, 1);
      fov = lerp(f.fov, 56, t);
      // A square board on a tall frame is pinned by its width whatever the
      // lens does, so the only way to use the height is to look further down
      // on it. Portrait rides up to 57 deg, which fills the screen without
      // cropping the carcass; landscape keeps the low, foreshortened angle.
      pitch = lerp(f.pitch, 57, t);
      const pad = lerp(1.035, 1.002, t);
      const fitted = fitFraming(fov, pitch, target, pad, f.dist * R);
      dist = fitted.dist;
      shift = fitted.shift;
    }
    return { fov, pitch, dist, target, shift };
  }

  const _eye = new THREE.Vector3();
  function applyCamera() {
    const pitchRad = THREE.MathUtils.degToRad(rig.pitch);
    _eye.set(0, Math.sin(pitchRad), Math.cos(pitchRad)).multiplyScalar(rig.dist);
    camera.position.copy(rig.target).add(_eye);
    camera.fov = rig.fov;
    camera.lookAt(rig.target);

    // Lift the image so the board is centred in the space above the
    // attribution strip rather than in the raw viewport. rig.shift is in NDC,
    // where the full frame spans 2, hence the halving.
    const px = Math.max(1, Math.round(cssW));
    const py = Math.max(1, Math.round(cssH));
    const shiftPx = (rig.shift * py) / 2;
    if (Math.abs(shiftPx) > 0.5) camera.setViewOffset(px, py, 0, shiftPx, px, py);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();

    // Fog tracks the camera so the table never fogs at the board edge and never
    // ends in a hard line, in any orientation.
    scene.fog.near = rig.dist * 1.45;
    scene.fog.far = rig.dist * 6.0;

    key.target.position.copy(rig.target).setY(0);
    key.target.updateMatrixWorld();
  }

  /* ──────────────────────────────────────────── token move animation */

  const HOP_H = 0.62;
  const _from = new THREE.Vector3();
  const _to = new THREE.Vector3();
  const _axis = new THREE.Vector3();
  const _qa = new THREE.Quaternion();
  const _qb = new THREE.Quaternion();
  const UP = new THREE.Vector3(0, 1, 0);

  function hopDuration(i, n, reduced) {
    if (reduced) return 110;
    // Accelerate out of the first square, then settle into the last.
    const accel = 180 - 44 * Math.min(1, i / 3);      // 180 -> 136 ms
    return i === n - 1 ? 186 : accel;
  }

  function moveToken(playerId, fromIndex, toIndex, onArrive) {
    const tok = tokenById.get(playerId);
    if (!tok) return Promise.resolve();
    const from = ((fromIndex | 0) % RING + RING) % RING;
    const to = ((toIndex | 0) % RING + RING) % RING;
    let steps = (to - from + RING) % RING;

    tok.square = from;
    squarePoint(from, tok.slot, tokens.length, _p);
    tok.group.position.copy(_p);
    followToken = tok;

    if (steps === 0) {
      tok.square = to;
      invalidate();
      if (onArrive) onArrive();
      return Promise.resolve();
    }

    const reduced = reduceMotion.matches;
    return new Promise((resolve) => {
      tok.anim = {
        from, steps, i: 0, t: 0,
        dur: hopDuration(0, steps, reduced),
        settle: 0, settling: false, reduced,
        onArrive, resolve,
      };
      invalidate();
    });
  }

  /** Advance one token's hop chain. Returns true while still animating. */
  function stepToken(tok, dtMs) {
    const a = tok.anim;
    if (!a) return false;

    if (a.settling) {
      a.settle += dtMs;
      const u = clamp(a.settle / 260, 0, 1);
      const bounce = Math.abs(Math.sin(Math.PI * u)) * 0.14 * (1 - u);
      squarePoint(a.from + a.steps, tok.slot, tokens.length, _p);
      tok.group.position.set(_p.x, _p.y + bounce, _p.z);
      const sy = 1 - 0.10 * Math.sin(Math.PI * u) * (1 - u);
      tok.group.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
      if (u >= 1) {
        tok.group.scale.set(1, 1, 1);
        tok.group.quaternion.setFromAxisAngle(UP, tok.heading);
        tok.square = (a.from + a.steps) % RING;
        const { onArrive, resolve } = a;
        tok.anim = null;
        if (onArrive) onArrive();
        resolve();
        return false;
      }
      return true;
    }

    a.t += dtMs;
    const p = clamp(a.t / a.dur, 0, 1);
    const iFrom = (a.from + a.i) % RING;
    const iTo = (a.from + a.i + 1) % RING;
    squarePoint(iFrom, tok.slot, tokens.length, _from);
    squarePoint(iTo, tok.slot, tokens.length, _to);

    const glide = easeInOutSine(p);
    const arcH = a.reduced ? 0 : HOP_H;
    const y = _from.y + Math.sin(Math.PI * p) * arcH;
    tok.group.position.set(
      lerp(_from.x, _to.x, glide),
      y,
      lerp(_from.z, _to.z, glide),
    );

    // Heading, plus a lean forward off the square and back onto the next.
    const dx = _to.x - _from.x, dz = _to.z - _from.z;
    if (dx || dz) tok.heading = Math.atan2(dx, dz);
    _qa.setFromAxisAngle(UP, tok.heading);
    if (!a.reduced) {
      _axis.set(-dz, 0, dx).normalize();
      _qb.setFromAxisAngle(_axis, 0.20 * Math.cos(Math.PI * p));
      tok.group.quaternion.copy(_qb).multiply(_qa);

      // Squash on the launch and the landing, stretch through the apex.
      const squash = p < 0.14 ? lerp(0.82, 1, p / 0.14)
        : p > 0.86 ? lerp(1, 0.82, (p - 0.86) / 0.14) : 1;
      const sy = squash * (1 + 0.16 * Math.sin(Math.PI * p));
      const sxz = 1 / Math.sqrt(Math.max(sy, 0.2));
      tok.group.scale.set(sxz, sy, sxz);
    } else {
      tok.group.quaternion.copy(_qa);
    }

    if (p >= 1) {
      a.i += 1;
      a.t = 0;
      if (a.i >= a.steps) {
        tok.group.scale.set(1, 1, 1);
        if (a.reduced) {
          squarePoint(a.from + a.steps, tok.slot, tokens.length, _p);
          tok.group.position.copy(_p);
          tok.square = (a.from + a.steps) % RING;
          const { onArrive, resolve } = a;
          tok.anim = null;
          if (onArrive) onArrive();
          resolve();
          return false;
        }
        a.settling = true;
      } else {
        a.dur = hopDuration(a.i, a.steps, a.reduced);
      }
    }
    return true;
  }

  /** Contact shadow follows its token, tightening as the token lands. */
  function updateBlob(tok) {
    const lift = clamp((tok.group.position.y - TILE_H) / HOP_H, 0, 1);
    tok.blob.position.set(tok.group.position.x, TILE_H + 0.004, tok.group.position.z);
    const s = lerp(0.88, 1.55, lift);
    tok.blob.scale.set(s, 1, s);
    tok.blob.material.opacity = lerp(1, 0.28, lift);
  }
  // Exposed for diagnostics: scripts/probe-scene.mjs inspects the live rig
  // rather than inferring it from the source, which is how the flat-lighting
  // fault was traced.
  if (typeof window !== 'undefined') {
    window.__scene = { renderer, scene, camera, setLabelScale };
  }

  /* ─────────────────────────────────────────────────── public methods */

  /** Cross-fade to another authored framing. Never a cut, never an orbit. */
  function setCameraMode(next) {
    if (!FRAMINGS[next] || next === mode) return;
    const now = resolveFraming(mode);
    mode = next;
    if (reduceMotion.matches) {
      fade = null;
      const r = resolveFraming(mode);
      rig.fov = r.fov; rig.pitch = r.pitch; rig.dist = r.dist; rig.shift = r.shift;
      rig.target.copy(r.target);
      applyCamera();
    } else {
      fade = { from: now, t: 0, dur: FADE_MS };
    }
    markShadows();
  }

  const _mk = new THREE.Matrix4();
  const _mq = new THREE.Quaternion();
  const _mc = new THREE.Color();

  /** Place or clear an ownership marker on a street square. */
  function setOwner(squareIndex, playerColourOrNull) {
    const i = squareIndex | 0;
    if (i < 0 || i >= RING) return;
    markerOwner[i] = playerColourOrNull || null;
    if (!playerColourOrNull) {
      markers.setMatrixAt(i, _hidden);
      markerBlobs.setMatrixAt(i, _hidden);
    } else {
      const L = layout[i];
      // Lies across the colour band at the inner edge, aligned with the tile's
      // own yaw, so it never collides with a token standing on the outer half.
      const inward = -L.d * 0.33;
      const cos = Math.cos(L.rotY), sin = Math.sin(L.rotY);
      _p.set(inward * sin + L.x, TILE_H, inward * cos + L.z);
      _mq.setFromAxisAngle(UP, L.rotY);
      const fitX = Math.min(1, (L.w * 0.82) / 1.30);
      _mk.compose(_p, _mq, _s.set(fitX, 1, 1));
      markers.setMatrixAt(i, _mk);
      _mc.set(playerColourOrNull);
      markers.setColorAt(i, _mc);
      if (markers.instanceColor) markers.instanceColor.needsUpdate = true;

      // Contact shadow, sized to the bar's own footprint and lifted four
      // thousandths clear of the tile face so it never z-fights the print.
      _p.y = TILE_H + 0.004;
      _mk.compose(_p, _mq, _s.set(1.44 * fitX, 1, 0.42));
      markerBlobs.setMatrixAt(i, _mk);
    }
    markers.instanceMatrix.needsUpdate = true;
    markerBlobs.instanceMatrix.needsUpdate = true;
    markShadows();
  }

  /** Raise a gold frame around one square, or clear it. */
  function highlight(squareIndex) {
    const i = squareIndex === null || squareIndex === undefined ? null : (squareIndex | 0);
    if (i === highlightIndex) return;
    highlightIndex = i;
    if (highlightMesh) {
      scene.remove(highlightMesh);
      highlightMesh.geometry.dispose();
      highlightMesh = null;
    }
    if (i !== null && i >= 0 && i < RING) {
      const L = layout[i];
      const geo = buildHighlightFrame(L.w + 0.08, L.d + 0.08, 0.085);
      highlightMesh = new THREE.Mesh(geo, highlightMat);
      highlightMesh.position.set(L.x, TILE_H, L.z);
      highlightMesh.rotation.y = L.rotY;
      highlightMesh.castShadow = false;
      scene.add(highlightMesh);
      highlightPop = 0;
    }
    markShadows();
  }

  /**
   * Re-bake the board's own labels at a larger type scale, for the HUD's text
   * size control. 1 is the authored design; the ceiling is 1.5.
   *
   * It is not a multiplier on the point sizes. A square that is already full
   * cannot carry larger type and the fitter would simply hand the increase
   * back, which is why the control has honestly advertised itself as not
   * covering the board. It buys the room instead, retiring the design's two
   * lowest tiers in order — the 1935 micro-line, then the group label, whose
   * information the colour band carries anyway — and setting the name and the
   * price as large as the freed height allows.
   *
   * Cell geometry does not depend on the type scale, so the UV rectangles and
   * the merged geometry stand; only the texture is replaced.
   *
   * @param {number} k
   * @returns {number} the scale actually in force
   */
  function setLabelScale(k) {
    const next = clamp(Number(k) || 1, 1, 1.5);
    if (Math.abs(next - labelScale) < 0.01) return labelScale;
    labelScale = next;
    logBaked = false;                 // the strings are already on the record
    let repainted = null;
    try {
      repainted = paintAtlas(board, layout, cellW / SHORT, smallScreen, labelScale);
    } finally {
      logBaked = true;
    }
    const previous = facesMat.map;
    facesMat.map = repainted.texture;
    facesMat.needsUpdate = true;
    track(repainted.texture);
    if (previous && previous !== repainted.texture) previous.dispose();
    markShadows();
    return labelScale;
  }

  const _proj = new THREE.Vector3();
  /**
   * Where a square's centre lands on screen, in CSS pixels relative to the
   * canvas — the anchor for a HUD callout that has to point at the board.
   */
  function squareScreenPosition(squareIndex) {
    const i = squareIndex | 0;
    if (i < 0 || i >= RING) return { x: 0, y: 0 };
    const L = layout[i];
    _proj.set(L.x, TILE_H, L.z).project(camera);
    return {
      x: (_proj.x * 0.5 + 0.5) * cssW,
      y: (-_proj.y * 0.5 + 0.5) * cssH,
    };
  }

  /* ────────────────────────────────────────────────────────── resize */

  /**
   * Re-resolve the current framing against freshly measured chrome, and put the
   * prop back at the frame edge. It sits just off the near-left corner of the
   * board rather than out on the far table: on the shorter lens the far table
   * is compressed into the top few rows of pixels, and anything standing there
   * falls off the top of the frame entirely.
   */
  function refit() {
    chrome.at = -1e6;
    const r = resolveFraming(mode);
    if (!fade) {
      rig.fov = r.fov; rig.pitch = r.pitch; rig.dist = r.dist; rig.shift = r.shift;
      rig.target.copy(r.target);
    }
    applyCamera();
    const halfW = Math.tan(THREE.MathUtils.degToRad(rig.fov / 2)) * aspect * rig.dist;
    propGroup.position.set(-Math.max(halfW * 0.88, R + 4.0), 0, -0.15 * R);
    markShadows();
  }

  function resize() {
    const w = Math.max(1, canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, canvas.clientHeight || window.innerHeight);
    if (w === cssW && h === cssH) { refit(); return; }
    cssW = w; cssH = h; aspect = w / h;
    camera.aspect = aspect;
    renderer.setSize(w, h, false);
    refit();
  }

  let resizeObserver = null;
  if (typeof ResizeObserver !== 'undefined') {
    let pending = 0;
    resizeObserver = new ResizeObserver(() => {
      clearTimeout(pending);
      pending = setTimeout(resize, 120);
    });
    resizeObserver.observe(canvas);
  }

  /* ──────────────────────────────────────────────── adaptive quality */

  let frameEma = 16.7;
  let tierChangedAt = 0;

  function setTier(next) {
    if (next === tier) return;
    tier = next;
    const T = TIERS[tier];
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, T.dpr));
    renderer.setSize(cssW, cssH, false);
    renderer.shadowMap.enabled = T.shadows;
    renderer.toneMapping = T.tone ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
    key.castShadow = T.shadows;
    solidMesh.castShadow = T.shadows;
    propGroup.visible = T.props;
    if (T.shadows && key.shadow.mapSize.x !== T.shadowSize) {
      key.shadow.mapSize.set(T.shadowSize, T.shadowSize);
      if (key.shadow.map) { key.shadow.map.dispose(); key.shadow.map = null; }
    }
    facesMat.needsUpdate = true;
    solidMat.needsUpdate = true;
    markShadows();
  }

  /**
   * Step quality down after two seconds above 22ms and only back up after
   * thirty seconds of headroom. Order is fixed: pixel ratio, then shadow
   * resolution, then shadows and tone mapping together.
   */
  function sampleFrame(dtMs) {
    frameEma = frameEma * 0.9 + Math.min(dtMs, 100) * 0.1;
    const now = performance.now();
    if (now - tierChangedAt < 4000) return;
    if (frameEma > 22 && tier !== 'low') {
      setTier(tier === 'high' ? 'mid' : 'low');
      tierChangedAt = now;
    } else if (frameEma < 13 && tier !== 'high' && now - tierChangedAt > 30000) {
      setTier(tier === 'low' ? 'mid' : 'high');
      tierChangedAt = now;
    }
  }

  /* ──────────────────────────────────────────────────────── render */

  function render(dtSeconds) {
    const dtMs = clamp((dtSeconds || 0) * 1000, 0, 100);
    sampleFrame(dtMs || 16.7);
    let animating = false;

    // Camera cross-fade, or a live follow target.
    if (fade) {
      fade.t += dtMs;
      const k = easeStandard(clamp(fade.t / fade.dur, 0, 1));
      const to = resolveFraming(mode);
      rig.fov = lerp(fade.from.fov, to.fov, k);
      rig.pitch = lerp(fade.from.pitch, to.pitch, k);
      rig.dist = lerp(fade.from.dist, to.dist, k);
      rig.shift = lerp(fade.from.shift, to.shift, k);
      rig.target.lerpVectors(fade.from.target, to.target, k);
      if (fade.t >= fade.dur) fade = null;
      applyCamera();
      animating = true;
    } else if (mode === 'follow') {
      // Trails the active token, then goes quiet once it has caught up — a
      // camera that never settles would hold the device at 60fps indefinitely.
      const to = resolveFraming(mode);
      const drift = rig.target.distanceTo(to.target);
      if (drift > 1e-3) {
        rig.target.lerp(to.target, clamp(dtMs / 90, 0, 1));
        applyCamera();
        animating = true;
      }
    }

    for (const tok of tokens) {
      if (tok.anim && stepToken(tok, dtMs)) animating = true;
      updateBlob(tok);
    }

    if (stepDice(dtMs)) animating = true;

    if (highlightMesh && highlightPop < 1) {
      highlightPop = clamp(highlightPop + dtMs / 220, 0, 1);
      const e = easeOutCubic(highlightPop);
      const s = lerp(0.86, 1, e);
      highlightMesh.scale.set(s, lerp(0.4, 1, e), s);
      highlightMat.emissiveIntensity = lerp(0.9, 0.45, e);
      animating = true;
    }

    if (!animating && !dirty && quiet > 2) return;   // 0 fps while thinking
    if (animating) shadowsDirty = true;

    if (shadowsDirty) { renderer.shadowMap.needsUpdate = true; shadowsDirty = false; }

    renderer.autoClear = true;
    renderer.render(scene, camera);
    renderer.autoClear = false;
    renderer.render(vignetteScene, vignetteCamera);
    renderer.autoClear = true;

    if (animating) { quiet = 0; dirty = true; } else { dirty = false; quiet += 1; }
  }

  /* ───────────────────────────────────────────────────────── dispose */

  function dispose() {
    if (activeRoll === rollTheDice) activeRoll = null;
    if (diceAnim) { const { resolve } = diceAnim; diceAnim = null; resolve(); }
    for (const t of refitTimers) clearTimeout(t);
    if (resizeObserver) resizeObserver.disconnect();
    reduceMotion.removeEventListener?.('change', invalidate);
    if (highlightMesh) { highlightMesh.geometry.dispose(); highlightMesh = null; }
    envTarget.dispose();
    scene.environment = null;
    for (const d of disposables) {
      if (d && typeof d.dispose === 'function') d.dispose();
    }
    markers.dispose();
    markerBlobs.dispose();
    scene.clear();
    vignetteScene.clear();
    renderer.dispose();
  }

  reduceMotion.addEventListener?.('change', invalidate);

  /* ───────────────────────────────────────────────────────── start up */

  resize();
  invalidate();

  /*
   * The HUD mounts after the scene, so the first fit has no chrome to measure
   * and falls back to the constants. Re-fit once it is up, and again after the
   * web fonts have settled its strips, then leave it to the resize observer.
   */
  const refitTimers = [setTimeout(refit, 320), setTimeout(refit, 1200)];

  return {
    scene,
    camera,
    renderer,
    render,
    resize,
    setCameraMode,
    moveToken,
    rollDice: rollTheDice,
    setOwner,
    highlight,
    setLabelScale,
    squareScreenPosition,
    dispose,
  };
}

/**
 * main.js — boot, integration, and the load-time integrity gate.
 *
 * The gate runs BEFORE the game is playable and before the boot screen lifts.
 * It performs an absence check, which means it needs to have seen everything
 * the game can render — so we do an audit render first: all 22 property
 * panels, all 21 event cards, the comparison chart and the sources page are
 * built into an offscreen container and swept, together with every string
 * baked into a WebGL texture. Only if nothing untraceable is found does play
 * begin. On failure the game refuses to start and shows why.
 */
import { loadFacts, facts, streets, attribution, heritage } from './facts.js';
import { Game } from './engine.js';
import { createScene, canvasLabels } from './scene.js';
import { createHud } from './hud.js';
import { renderPropertyPanel, renderSourcesPanel, renderComparisonChart } from './panel.js';
import { runGate, renderGateFailure, registry } from './integrity.js';

const statusEl = document.getElementById('boot-status');
const bootEl = document.getElementById('boot');
const setStatus = (t) => { if (statusEl) statusEl.textContent = t; };

let game, scene, hud, overlay;
let rafId = null;
// A turn is an async sequence with several awaits in it. If the player restarts
// mid-animation, the old sequence would otherwise keep running against a brand
// new Game and crash on a null lastRoll. Every session gets a generation number
// and an in-flight turn abandons itself the moment it is superseded.
let generation = 0;

/* --------------------------------------------------------------- audit render */

/**
 * Render every screen the game can show into a detached container so the gate
 * can sweep content the player has not reached yet. Detached rather than
 * hidden: it must be in the document for TreeWalker to see it, so it is
 * positioned offscreen and removed immediately after the sweep.
 */
function buildAuditSurface() {
  const box = document.createElement('div');
  box.id = 'integrity-audit';
  box.setAttribute('aria-hidden', 'true');
  box.style.cssText =
    'position:absolute;left:-99999px;top:0;width:1200px;height:auto;' +
    'pointer-events:none;visibility:hidden';

  for (const s of streets()) {
    try {
      box.appendChild(renderPropertyPanel(s.id));
    } catch (err) {
      console.error(`audit render failed for ${s.id}`, err);
    }
  }
  try { box.appendChild(renderComparisonChart()); } catch (e) { console.error(e); }
  try { box.appendChild(renderSourcesPanel()); } catch (e) { console.error(e); }

  // Every event card, as the Gazette will render it.
  for (const card of facts().eventCards) {
    const el = document.createElement('div');
    el.setAttribute('data-numeral-ok', '');
    el.setAttribute('data-money', 'derived');
    el.innerHTML =
      `<h3>${escapeHtml(card.title)}</h3><p>${escapeHtml(card.body)}</p>` +
      `<p>${escapeHtml(card.source.name)} — ${escapeHtml(card.source.date)}</p>`;
    box.appendChild(el);
  }
  return box;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ----------------------------------------------------------------- footer */

/**
 * Render the attribution strip – works with both London (OGL/HMLR) and Atlanta
 * (dataSources) fact files. Displays whatever fields are present, and skips
 * missing ones.
 */
function renderFooter() {
  const a = attribution();
  const h = heritage();
  const el = document.getElementById('attribution');
  const parts = [];

  // London-style attribution (OGL / HM Land Registry)
  if (a.hmlr) {
    const withLink = a.hmlr.replace(
      'Open Government Licence v3.0',
      `<a href="${a.oglUrl || 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/'}" rel="license noopener" target="_blank">Open Government Licence v3.0</a>`
    );
    parts.push(`<p>${escapeHtml(withLink)}</p>`);
  }
  if (a.ogl) parts.push(`<p>${escapeHtml(a.ogl)}</p>`);
  if (a.ukhpiProducers) parts.push(`<p>${escapeHtml(a.ukhpiProducers)}</p>`);
  if (a.dataCurrency) parts.push(`<p>${escapeHtml(a.dataCurrency)}</p>`);

  // Atlanta-style attribution (dataSources)
  if (a.dataSources) {
    parts.push(`<p>${escapeHtml(a.dataSources)}</p>`);
  }

  // Common fields
  if (a.noSubscriptionData) parts.push(`<p>${escapeHtml(a.noSubscriptionData)}</p>`);
  if (a.heritage) parts.push(`<p>${escapeHtml(a.heritage)}</p>`);
  if (a.noEndorsement) parts.push(`<p class="attr-quiet">${escapeHtml(a.noEndorsement)}</p>`);

  // Heritage (always present)
  parts.push(`<p class="attr-quiet">After ${escapeHtml(h.title)} by ${escapeHtml(h.author)}, ${h.year}
    (${escapeHtml(h.patent)}), ${escapeHtml(h.status)}.</p>`);

  el.innerHTML = `<div class="attr-inner">${parts.join('')}</div>`;
}

/* ------------------------------------------------------------------- boot */

async function boot() {
  setStatus('Loading the fact base…');
  await loadFacts('./landlord-facts.json');

  setStatus('Laying out the board…');
  buildSession();

  renderFooter();

  /* ---- the gate ---- */
  setStatus('Verifying every figure against the fact base…');
  const audit = buildAuditSurface();
  document.body.appendChild(audit);

  const result = runGate({
    facts: facts(),
    root: document.body,
    canvasLabels,
  });

  audit.remove();

  if (!result.ok) {
    console.error('Integrity gate failed', result.violations);
    // ?gate=report keeps the game on screen so a failing value can be found in
    // situ. Without it, a breach halts the game — which is the default and the
    // behaviour the brief requires.
    if (new URLSearchParams(location.search).get('gate') !== 'report') {
      renderGateFailure(result, document.body);
      return;
    }
    console.warn('gate=report: continuing despite violations, for diagnosis only');
  }

  console.info('Integrity gate passed', result.stats);
  window.__integrity = result;

  bootEl.classList.add('lifted');
  setTimeout(() => bootEl.remove(), 700);

  hud.update(game);
  loop();
}

/**
 * Build (or rebuild) a whole session. Restart was reported broken from three
 * separate controls, so there is now exactly one path that creates a game and
 * exactly one that tears it down.
 */
function buildSession(seed) {
  teardownSession();
  generation += 1;
  game = new Game({ seed: seed ?? (Date.now() % 2147483647) });

  const canvas = document.getElementById('board-canvas');
  scene = createScene({ canvas, board: game.board, players: game.players });

  overlay = document.getElementById('overlay');
  hud = createHud({
    root: document.getElementById('hud'),
    game,
    onRoll: handleRoll,
    onDecide: handleDecide,
    onEndTurn: handleEndTurn,
    onRestart: restart,
    onOpenProperty: (id) => showOverlay(renderPropertyPanel(id)),
    onOpenSources: () => showOverlay(renderSourcesPanel()),
    onOpenChart: () => showOverlay(renderComparisonChart()),
  });
  hud.update(game);
}

function teardownSession() {
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  if (hud && typeof hud.destroy === 'function') { try { hud.destroy(); } catch (e) { /* already gone */ } }
  if (scene && typeof scene.dispose === 'function') { try { scene.dispose(); } catch (e) { /* already gone */ } }
  const hudRoot = document.getElementById('hud');
  if (hudRoot) hudRoot.innerHTML = '';
  if (overlay) { overlay.innerHTML = ''; overlay.classList.remove('open'); }
  hud = null; scene = null;
}

export function restart() {
  buildSession();
  loop();
}
window.restartGame = restart;

/* ------------------------------------------------------------ interaction */

async function handleRoll() {
  if (!game || game.phase !== 'awaiting-roll') return;
  const gen = generation;
  const stale = () => gen !== generation;
  const roll = game.roll();
  if (!roll) return;
  hud.showRoll(roll.d1, roll.d2);
  scene.setCameraMode('dice');

  const p = game.player;
  const from = p.pos;
  const to = (from + roll.total) % game.board.length;

  await new Promise((r) => setTimeout(r, 620));
  if (stale()) return;
  scene.setCameraMode('follow');
  await scene.moveToken(p.id, from, to);
  if (stale()) return;
  scene.setCameraMode('table');

  const { square, events } = game.land();
  scene.highlight(square.index);
  hud.update(game);

  for (const ev of events) {
    if (stale()) return;
    if (ev.kind === 'gazette') {
      hud.showEvent(ev.card);
      await waitForDismiss();
    } else if (ev.money) {
      hud.toast(ev.text, ev.kind);
      await new Promise((r) => setTimeout(r, 700));
    }
  }
  if (stale()) return;

  if (game.pending) {
    const street = facts().streets.find((s) => s.id === game.pending.streetId);
    if (game.player.isAI) {
      await new Promise((r) => setTimeout(r, 600));
      if (stale()) return;
      handleDecide(game.aiDecision());
    } else {
      hud.showOffer(game.pending, street);
    }
  } else {
    finishTurn();
  }
}

function handleDecide(choice) {
  const res = game.decide(choice);
  if (res && res.kind === 'bought') {
    scene.setOwner(game.board.findIndex(
      (sq) => sq.streetId === res.streetId), game.player.colour);
  }
  hud.update(game);
  finishTurn();
}

async function finishTurn() {
  const gen = generation;
  await new Promise((r) => setTimeout(r, 450));
  if (gen !== generation) return;
  handleEndTurn();
}

async function handleEndTurn() {
  if (!game || !scene || !hud) return;
  const gen = generation;
  scene.highlight(null);
  const result = game.endTurn();
  hud.update(game);
  if (result) {
    hud.showResult(result);
    return;
  }
  // The market moves every year, whether or not anyone landed on the Gazette.
  if (game.roundJustOpened) {
    const card = game.drawRoundCard();
    hud.showEvent(card);
    await waitForDismiss();
    if (gen !== generation) return;
    hud.update(game);
  }
  if (game.player.isAI) setTimeout(() => { if (gen === generation) handleRoll(); }, 800);
}

function waitForDismiss() {
  return new Promise((resolve) => {
    const done = () => { overlay.removeEventListener('overlay-dismissed', done); resolve(); };
    overlay.addEventListener('overlay-dismissed', done);
    setTimeout(done, 6000);
  });
}

function showOverlay(node) {
  overlay.innerHTML = '';
  const shell = document.createElement('div');
  shell.className = 'overlay-shell';
  const close = document.createElement('button');
  close.className = 'overlay-close';
  close.setAttribute('aria-label', 'Close');
  close.innerHTML =
    '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">' +
    '<path d="M5 5l14 14M19 5L5 19" stroke="currentColor" stroke-width="2.4" ' +
    'stroke-linecap="round" fill="none"/></svg>';
  close.onclick = hideOverlay;
  shell.appendChild(close);
  shell.appendChild(node);
  overlay.appendChild(shell);
  overlay.classList.add('open');
}

function hideOverlay() {
  overlay.classList.remove('open');
  overlay.innerHTML = '';
  overlay.dispatchEvent(new CustomEvent('overlay-dismissed'));
}

window.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideOverlay(); });

/* ------------------------------------------------------------------- loop */

let last = performance.now();
function loop() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (scene) scene.render(dt);
  rafId = requestAnimationFrame(loop);
}

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => scene && scene.resize(), 120);
});
window.addEventListener('orientationchange', () => setTimeout(() => scene && scene.resize(), 260));

boot().catch((err) => {
  console.error(err);
  setStatus(`Could not start: ${err.message}`);
});

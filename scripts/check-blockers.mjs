import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await p.goto('http://localhost:5178/', { waitUntil: 'networkidle' });
await p.waitForTimeout(2500);

const out = await p.evaluate(async () => {
  const panel = await import('/src/panel.js');
  const res = {};

  // 1. no literal "undefined" anywhere the player can see
  const all = [panel.renderSourcesPanel(), panel.renderComparisonChart(),
               panel.renderPropertyPanel('pall-mall'), panel.renderPropertyPanel('trafalgar-square'),
               panel.renderPropertyPanel('bow-street')];
  res.undefinedHits = all.map(n => (n.textContent.match(/\bundefined\b|\bNaN\b|\[object /g) || []).length)
                          .reduce((a, c) => a + c, 0);

  // 2. sources panel must actually scroll
  let ov = document.getElementById('overlay');
  if (!ov) { ov = document.createElement('div'); ov.id = 'overlay'; document.body.appendChild(ov); }
  ov.innerHTML = '';
  const shell = document.createElement('div');
  shell.className = 'overlay-shell';
  shell.appendChild(panel.renderSourcesPanel());
  ov.appendChild(shell); ov.classList.add('open');
  await new Promise(r => setTimeout(r, 400));

  const findScroller = (root) => {
    let best = null;
    const walk = (el) => {
      const cs = getComputedStyle(el);
      const canScroll = /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 4;
      if (canScroll && (!best || el.scrollHeight > best.scrollHeight)) best = el;
      for (const c of el.children) walk(c);
    };
    walk(root);
    return best;
  };
  const sc = findScroller(ov);
  res.scrollerFound = !!sc;
  if (sc) {
    sc.scrollTop = 99999;
    await new Promise(r => setTimeout(r, 200));
    res.scrolledTo = sc.scrollTop;
    res.scrollHeight = sc.scrollHeight;
    res.clientHeight = sc.clientHeight;
    res.reachedBottom = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 8;
  }
  // 3. horizontal overflow anywhere?
  res.docScrollW = document.documentElement.scrollWidth;
  res.docClientW = document.documentElement.clientWidth;
  ov.innerHTML = ''; ov.classList.remove('open');
  return res;
});
console.log(JSON.stringify(out, null, 1));
await b.close();

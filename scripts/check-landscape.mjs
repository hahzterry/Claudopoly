import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 812, height: 375 }, isMobile: true, hasTouch: true });
await p.goto('http://localhost:5178/', { waitUntil: 'networkidle' });
await p.waitForFunction(() => !document.getElementById('boot'), { timeout: 20000 }).catch(()=>{});
await p.waitForTimeout(1500);
await p.screenshot({ path: 'bench/shots/r4/landscape.png' });

const out = await p.evaluate(async () => {
  const res = {};
  // round counter visible?
  const txt = document.body.innerText;
  res.roundVisible = /round\s*\d+\s*of\s*\d+/i.test(txt);
  const el = [...document.querySelectorAll('*')].find(e => /ROUND \d+ OF \d+/i.test(e.textContent || '') && e.children.length === 0);
  if (el) { const r = el.getBoundingClientRect(); res.roundBox = [Math.round(r.width), Math.round(r.height)]; }
  // open a property sheet and measure it
  const panel = await import('/src/panel.js');
  let ov = document.getElementById('overlay');
  if (!ov) { ov = document.createElement('div'); ov.id = 'overlay'; document.body.appendChild(ov); }
  ov.innerHTML = '';
  const shell = document.createElement('div'); shell.className = 'overlay-shell';
  shell.appendChild(panel.renderPropertyPanel('bond-street'));
  ov.appendChild(shell); ov.classList.add('open');
  await new Promise(r => setTimeout(r, 500));
  const findScroller = (root) => { let best=null;
    const walk=(e)=>{ const cs=getComputedStyle(e);
      if(/(auto|scroll)/.test(cs.overflowY)&&e.scrollHeight>e.clientHeight+4&&(!best||e.scrollHeight>best.scrollHeight)) best=e;
      for(const c of e.children) walk(c); };
    walk(root); return best; };
  const sc = findScroller(ov);
  res.sheetScrolls = !!sc;
  if (sc) { res.sheetClientH = sc.clientHeight; res.sheetContentH = sc.scrollHeight;
            sc.scrollTop = 99999; await new Promise(r=>setTimeout(r,150));
            res.reachedBottom = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 8; }
  res.sheetText = (ov.innerText || '').slice(0, 160).replace(/\n+/g, ' | ');
  return res;
});
await p.screenshot({ path: 'bench/shots/r4/landscape-sheet.png' });
console.log(JSON.stringify(out, null, 1));
await b.close();

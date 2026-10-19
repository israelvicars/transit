// core/test-ui-layout.mjs: interactive layout with the side panel open (not the video).
// usage: node core/test-ui-layout.mjs <page.html> [--to <station>] [--shots DIR] [--label NAME]
// Selects a hop (default: the first failed hop, else the first hop) via #span= and checks at three
// viewports that the map, controls and hop list share one right edge, no empty strip is left before the
// panel, nothing in the panel overflows horizontally, and no stat box clips its text.
import { pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { mkdirSync } from 'node:fs';
await (await import('./setup.mjs')).ensureSetup({ need: ['deps', 'browser'] });
const { launchBrowser } = await import('./tools.mjs');
const argv = process.argv.slice(2);
const arg = (k) => argv.includes(k) ? argv[argv.indexOf(k) + 1] : null;
const file = argv.find((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
if (!file) { console.error('usage: node core/test-ui-layout.mjs <page.html> [--to station] [--shots DIR]'); process.exit(2); }
const to = arg('--to'), shots = arg('--shots'), label = arg('--label') || 'layout';
const url = pathToFileURL(resolve(file)).href;
let fails = 0;
const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fails++; };
const browser = await launchBrowser();
const probe = await browser.newPage();
await probe.goto(url + '?paused');
const calls = await probe.evaluate(() => window.VIZ.calls.map((c) => ({ to: c.to, spanId: c.spanId, error: c.error })));
await probe.close();
const pick = (to && calls.find((c) => c.to === to)) || calls.find((c) => c.error) || calls[0];
if (shots) mkdirSync(resolve(shots), { recursive: true });
for (const [w, h] of [[1280, 800], [1600, 1000], [1920, 1080]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(url + '?paused#span=' + encodeURIComponent(pick.spanId));
  await page.waitForTimeout(200);
  const m = await page.evaluate(() => {
    const R = (sel) => { const el = document.querySelector(sel); return el ? el.getBoundingClientRect() : null; };
    const panel = document.getElementById('panel');
    const over = [...panel.querySelectorAll('*')].filter((el) => {
      const cs = getComputedStyle(el);
      return el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1 && cs.overflowX !== 'visible' && cs.textOverflow !== 'ellipsis' && !el.matches('.crumbs');
    }).map((el) => `${el.tagName.toLowerCase()}.${el.className}`);
    const wide = [...panel.querySelectorAll('*')].filter((el) => {
      const r = el.getBoundingClientRect(); const pr = panel.getBoundingClientRect();
      return r.width > 0 && r.right > pr.right + 1 && !el.closest('.crumbs');
    }).map((el) => `${el.tagName.toLowerCase()}.${el.className}`);
    const clipped = [];
    const narrow = [...panel.querySelectorAll('.stat')].map((b) => Math.round(b.getBoundingClientRect().width)).filter((x) => x < 100);
    for (const box of panel.querySelectorAll('.stat')) {
      const br = box.getBoundingClientRect();
      const range = document.createRange();
      for (const child of box.children) {
        range.selectNodeContents(child);
        for (const r of range.getClientRects()) if (r.right > br.right - 3 || r.left < br.left + 3) { clipped.push(box.textContent.trim()); break; }
        if (child.scrollWidth > child.clientWidth + 1) clipped.push(box.textContent.trim());
      }
    }
    // the two timing captions under the bar get a line each, so they never run into each other
    const caps = [];
    for (const cap of panel.querySelectorAll('.wf-cap')) {
      const [a, b] = cap.children; if (!a || !b) continue;
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      if (Math.abs(ra.top - rb.top) < 2) caps.push(cap.textContent.trim());
    }
    return { stage: R('#stage'), controls: R('#controls'), hops: R('#hops'), panel: R('#panel'), over, wide, clipped: [...new Set(clipped)], narrow, caps,
      open: !!document.querySelector('#panel .stats'), docW: document.documentElement.scrollWidth };
  });
  const tag = `${label} ${w}x${h}`;
  ok(m.open, `${tag}: panel shows the selected hop (${pick.to})`);
  const rights = [m.stage.right, m.controls.right, m.hops.right].map(Math.round);
  ok(Math.max(...rights) - Math.min(...rights) <= 3, `${tag}: map, controls and hop list share a right edge (${rights.join(' / ')})`);
  const strip = Math.round(m.panel.left - Math.min(...rights));
  ok(strip <= 16, `${tag}: no empty strip before the panel (${strip}px)`);
  ok(m.panel.right <= w + 1 && m.docW <= w + 1, `${tag}: panel fits the viewport (panel right ${Math.round(m.panel.right)}, page ${m.docW})`);
  ok(m.over.length === 0 && m.wide.length === 0, `${tag}: nothing in the panel overflows horizontally${m.over.length + m.wide.length ? ': ' + [...m.over, ...m.wide].slice(0, 4).join(', ') : ''}`);
  ok(m.clipped.length === 0, `${tag}: no stat box clips its text${m.clipped.length ? ': ' + m.clipped.slice(0, 3).join(' | ') : ''}`);
  ok(m.narrow.length === 0, `${tag}: stat boxes are at least 100px wide${m.narrow.length ? ' (' + m.narrow.join(', ') + 'px)' : ''}`);
  ok(m.caps.length === 0, `${tag}: timing captions sit on their own lines${m.caps.length ? ': ' + m.caps[0] : ''}`);
  if (shots) await page.screenshot({ path: join(resolve(shots), `${label}-${w}x${h}.png`) });
  await page.close();
}
await browser.close();
console.log(fails ? `${fails} failure(s)` : 'all layout tests pass');
process.exit(fails ? 1 : 0);

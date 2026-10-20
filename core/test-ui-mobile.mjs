// core/test-ui-mobile.mjs: interactive pages on phones (Playwright mobile emulation: isMobile, hasTouch, DPR 3)
// at 393x852 and 360x800, for the request, CI and agent samples, built with and without --share.
// Checks: the page lays out at device width with no horizontal overflow, the map spans the width, controls are
// at least 40x40 px, no keyboard hints, a finger tap slightly off a station selects it and opens the panel as a
// bottom sheet with a reachable close button, closing hides it, and a --share page shows the alert above the sheet
// with a verdict that wraps instead of being cut.
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
await (await import('./setup.mjs')).ensureSetup({ need: ['deps', 'browser'] });
const { launchBrowser, ROOT } = await import('./tools.mjs');
const dir = join(ROOT, '.transit-cache', 'test-mobile');
mkdirSync(dir, { recursive: true });
let fails = 0;
const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fails++; };
const S = (p) => join(ROOT, 'src', p);
const samples = [
  { label: 'request', input: S('request-transit/samples/otel-demo-checkout.otlp.json'), args: ['--title', 'Checkout: one order through the Astronomy Shop'] },
  { label: 'ci', input: S('ci-transit/samples/gh-run-sample.json'), args: ['--format', 'gh-actions', '--title', "CI: one run of a fictional repo's pipeline"] },
  { label: 'agent', input: S('agent-transit/samples/claude-code-synthetic.jsonl'), args: ['--format', 'claude-code', '--title', 'Agent: one coding session, tool by tool'] },
];
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const browser = await launchBrowser();
for (const sm of samples) for (const share of [false, true]) {
  const out = join(dir, `${sm.label}${share ? '-share' : ''}.html`);
  const r = spawnSync(process.execPath, [join(ROOT, 'core/build.mjs'), sm.input, ...sm.args, ...(share ? ['--share'] : []), '--out', out], { encoding: 'utf8' });
  if (r.status !== 0) { ok(false, `${sm.label}: build failed ${r.stderr}`); continue; }
  for (const [w, h] of [[393, 852], [360, 800]]) {
    const tag = `${sm.label}${share ? ' --share' : ''} ${w}x${h}`;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(pathToFileURL(out).href); await page.waitForTimeout(300);
    const M = () => page.evaluate(() => {
      const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }; };
      const shown = (el) => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0;
      const panel = document.getElementById('panel'), v = document.getElementById('verdict'), close = document.getElementById('pclose');
      const small = [...document.querySelectorAll('#controls button, #controls input, #pclose')].filter(shown).map((el) => ({ id: el.id || el.textContent, ...R(el) })).filter((t) => t.width < 40 || t.height < 40).map((t) => `${t.id} ${Math.round(t.width)}x${Math.round(t.height)}`);
      return { cw: document.documentElement.clientWidth, sw: document.documentElement.scrollWidth, inner: innerWidth, stage: R(document.getElementById('stage')),
        panelShown: shown(panel), panel: R(panel), close: shown(close) ? R(close) : null, small,
        kbd: [...document.querySelectorAll('kbd')].filter((k) => k.getBoundingClientRect().height > 0).length,
        verdict: v.hidden ? null : { cut: v.scrollWidth > v.clientWidth + 1, ...R(v) }, st: window.TRANSIT_UI.state(), panelText: panel.innerText };
    });
    const m = await M();
    ok(errs.length === 0, `${tag}: no page errors ${errs.join('; ')}`);
    ok(m.cw === w && m.sw <= w, `${tag}: lays out at device width, no horizontal overflow (layout ${m.cw}, scroll ${m.sw})`);
    ok(Math.abs(m.stage.width - w) <= 1, `${tag}: map spans the screen width (${Math.round(m.stage.width)} px)`);
    ok(m.small.length === 0, `${tag}: tap targets ≥ 40 px${m.small.length ? ': ' + m.small.join(', ') : ''}`);
    ok(m.kbd === 0, `${tag}: no keyboard hints on screen`);
    if (share) {
      ok(m.verdict && !m.verdict.cut && m.verdict.right <= w + 1 && m.verdict.top >= 0, `${tag}: verdict wraps on screen, not cut`);
      ok(m.panelShown && /SERVICE ALERT/.test(m.panelText) && m.panel.bottom <= h + 1 && m.panel.top > h * 0.3, `${tag}: opens with the alert in a bottom sheet`);
      const alertY = await page.evaluate(() => { const ui = window.TRANSIT_UI, hop = ui.hops[ui.state().hop], n = ui.stations.find((s) => s.id === hop.to), c = document.getElementById('stage').getBoundingClientRect(); return c.top + n.y * c.height / 900; });
      ok(alertY < m.panel.top, `${tag}: the alert station stays visible above the sheet (${Math.round(alertY)} < ${Math.round(m.panel.top)})`);
    } else ok(!m.panelShown && !m.st.selected, `${tag}: no sheet until something is selected`);
    // a finger tap 8 px off a station that is not selected
    const pt = await page.evaluate(() => {
      const ui = window.TRANSIT_UI, cur = ui.state().hop, i = ui.hops.findIndex((x, k) => k !== cur && k >= 2), hop = ui.hops[i];
      const n = ui.stations.find((s) => s.id === hop.to), c = document.getElementById('stage').getBoundingClientRect();
      return { x: c.left + n.x * c.width / 1200 + 8, y: c.top + n.y * c.height / 900 + 6, id: n.id };
    });
    if (m.st.playing) await page.evaluate(() => window.scrollTo(0, 0));
    await page.touchscreen.tap(pt.x, pt.y); await page.waitForTimeout(200);
    const t = await M();
    const selTo = await page.evaluate(() => { const ui = window.TRANSIT_UI, s = ui.state(); return s.hop >= 0 ? ui.hops[s.hop].to : null; });
    ok(t.st.selected && selTo === pt.id && !t.st.playing, `${tag}: tap near ${pt.id} selects it (got ${selTo})`);
    ok(t.panelShown && t.panel.bottom <= h + 1 && t.panel.left >= 0 && t.panel.right <= w + 1, `${tag}: panel opens as a sheet on screen`);
    ok(t.close && t.close.width >= 40 && t.close.height >= 40 && t.close.top >= 0 && t.close.bottom <= h, `${tag}: close button reachable and ≥ 40 px`);
    if (t.close) { await page.touchscreen.tap(t.close.left + t.close.width / 2, t.close.top + t.close.height / 2); await page.waitForTimeout(150); }
    const c = await M();
    ok(!c.st.selected && !c.panelShown, `${tag}: close hides the sheet`);
    await ctx.close();
  }
}
await browser.close();
if (fails) { console.error(`${fails} mobile check(s) failed`); process.exit(1); }
console.log('mobile: all checks passed');

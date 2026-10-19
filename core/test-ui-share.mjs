// core/test-ui-share.mjs: the --share open state, cold open (no URL params) at 1280x800 and 1600x1000.
// usage: node core/test-ui-share.mjs [--shots DIR]
// Builds --share pages for the request, CI and agent samples and checks: paused, the first SERVICE ALERT
// hop selected with its panel open, the alert visible on the map, one verdict line above the map that
// matches the console tip, the map/panel layout intact, and that a page built without --share is unchanged.
import { pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
await (await import('./setup.mjs')).ensureSetup({ need: ['deps', 'browser'] });
const { launchBrowser, ROOT } = await import('./tools.mjs');
const argv = process.argv.slice(2);
const shots = argv.includes('--shots') ? resolve(argv[argv.indexOf('--shots') + 1]) : null;
const dir = join(ROOT, '.transit-cache', 'test-share');
mkdirSync(dir, { recursive: true });
if (shots) mkdirSync(shots, { recursive: true });
let fails = 0;
const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fails++; };
const S = (p) => join(ROOT, 'src', p);
const pages = [
  { label: 'request', input: S('request-transit/samples/otel-demo-checkout.otlp.json'), args: ['--title', 'Checkout: one order through the Astronomy Shop', '--subtitle', 'SYNTHETIC hand-built trace'], to: 'email' },
  { label: 'ci', input: S('ci-transit/samples/gh-run-sample.json'), args: ['--format', 'gh-actions', '--title', "CI: one run of a fictional repo's pipeline"] },
  { label: 'agent', input: S('agent-transit/samples/claude-code-synthetic.jsonl'), args: ['--format', 'claude-code', '--title', 'Agent: one coding session, tool by tool'] },
];
const browser = await launchBrowser();
for (const pg of pages) {
  const out = join(dir, `${pg.label}.html`);
  const r = spawnSync(process.execPath, [join(ROOT, 'core/build.mjs'), pg.input, ...pg.args, '--share', '--out', out], { encoding: 'utf8' });
  ok(r.status === 0, `${pg.label}: --share build`);
  const tip = (r.stdout.match(/Suggested message: "(.*)"$/m) || [])[1];
  ok(!!tip, `${pg.label}: build prints a suggested message`);
  for (const [w, h] of [[1280, 800], [1600, 1000]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(pathToFileURL(out).href);
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => {
      const R = (s) => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }; };
      const st = window.TRANSIT_UI.state(), call = st.hop >= 0 ? window.VIZ.calls.find((c) => c.spanId === window.TRANSIT_UI.hops[st.hop].spanId) : null;
      const v = document.getElementById('verdict');
      return { st, call, share: window.VIZ_OPTS.share, verdict: v.hidden ? null : v.textContent, cut: v.scrollWidth > v.clientWidth,
        panel: document.getElementById('panel').innerText, rv: R('#verdict'), rs: R('#stage'), rc: R('#controls'), rp: R('#panel'),
        overflowX: document.documentElement.scrollWidth > innerWidth, cls: document.documentElement.className,
        calls: window.VIZ.calls.length, alertAt: window.VIZ.frameOfTraceMs };
    });
    const t0 = m.st.t;
    await page.waitForTimeout(700);
    const t1 = await page.evaluate(() => window.TRANSIT_UI.state().t);
    const tag = `${pg.label} ${w}x${h}`;
    ok(errs.length === 0, `${tag}: no page errors${errs.length ? ' ' + errs.join('; ') : ''}`);
    ok(!m.st.playing && t1 === t0, `${tag}: opens paused and stays paused`);
    ok(!!m.st.selected && m.st.hop >= 0 && m.call && m.call.error, `${tag}: first SERVICE ALERT hop selected (hop ${m.st.hop + 1}${m.call ? ' to ' + m.call.to : ''})`);
    if (pg.to) ok(m.call && m.call.to === pg.to, `${tag}: alert hop goes to ${pg.to}`);
    ok(/SERVICE ALERT/.test(m.panel), `${tag}: panel open on the alert`);
    ok(m.verdict && m.verdict === m.share.verdict && m.verdict === tip, `${tag}: verdict line matches the console tip`);
    ok(/SERVICE ALERT/.test(m.verdict || '') && m.verdict.endsWith(`, ${m.calls} ${pg.label === 'ci' ? 'dependencies' : pg.label === 'agent' ? 'calls' : 'hops'}`), `${tag}: verdict hop count = page hop count (${m.calls})`);
    ok(m.rv && m.rv.top >= 0 && m.rv.bottom <= m.rs.top + 1 && m.rv.height >= 20 && m.rv.height <= 40, `${tag}: one verdict line above the map`);
    ok(!m.cut || w < 1600, `${tag}: verdict not truncated at this width${m.cut ? ' (ellipsis)' : ''}`);
    ok(Math.abs(m.rv.right - m.rs.right) <= 1 && Math.abs(m.rc.right - m.rs.right) <= 1 && m.rs.right <= m.rp.left + 1, `${tag}: verdict, map and controls share the panel edge`);
    ok(m.rc.bottom <= h + 1 || m.rs.bottom <= h, `${tag}: map fits the viewport height`);
    ok(!m.overflowX, `${tag}: no horizontal overflow`);
    if (shots) await page.screenshot({ path: join(shots, `share-${pg.label}-${w}x${h}.png`) });
    await page.close();
  }
}
// without --share nothing changes: no verdict line, no share class, autoplay as before
const plain = join(dir, 'plain.html');
spawnSync(process.execPath, [join(ROOT, 'core/build.mjs'), pages[0].input, ...pages[0].args, '--out', plain], { encoding: 'utf8' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(pathToFileURL(plain).href); await page.waitForTimeout(300);
const p = await page.evaluate(() => ({ hidden: document.getElementById('verdict').hidden, cls: document.documentElement.className, share: window.VIZ_OPTS.share, st: window.TRANSIT_UI.state() }));
ok(p.hidden && !/\bshare\b/.test(p.cls) && p.share === undefined, 'no --share: no verdict line');
ok(p.st.playing && !p.st.selected, 'no --share: autoplays with nothing selected, as before');
await browser.close();
if (fails) { console.error(`${fails} share check(s) failed`); process.exit(1); }
console.log('share: all checks passed');

// core/test-ui-preview.mjs: the README links the sample through htmlpreview.github.io, which fetches the raw file,
// adds <base href="<raw url>"> after <head>, retypes every <script> so it does not run, document.write()s the page,
// then re-runs the inline scripts in order and dispatches DOMContentLoaded. This mimics that flow offline (two
// routed fake origins, nothing leaves the machine) and checks the --share page still works, and that selecting a
// hop updates #span= on the preview URL (a relative history URL would resolve against the raw origin and throw).
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
await (await import('./setup.mjs')).ensureSetup({ need: ['deps', 'browser'] });
const { launchBrowser, ROOT } = await import('./tools.mjs');
const dir = join(ROOT, '.transit-cache', 'test-preview'); mkdirSync(dir, { recursive: true });
const out = join(dir, 'share.html');
const b = spawnSync(process.execPath, [join(ROOT, 'core/build.mjs'), join(ROOT, 'src/request-transit/samples/otel-demo-checkout.otlp.json'), '--share', '--title', 'Checkout: one order through the Astronomy Shop', '--out', out], { encoding: 'utf8' });
if (b.status !== 0) { console.error(b.stderr); process.exit(1); }
const RAW = 'https://raw.preview.test/u/r/main/sample.html', HOST = 'https://preview.test/';
const loader = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>preview</title></head><body><script>
fetch(${JSON.stringify(RAW)}).then((r) => r.text()).then((html) => {
  html = html.replace(/<head([^>]*)>/i, '<head$1><base href=${JSON.stringify(RAW)}>').replace(/<script(\\s*src=["'][^"']*["'])?(\\s*type=["'](text|application)\\/javascript["'])?/gi, '<script type="text/htmlpreview"$1');
  setTimeout(() => {
    document.open(); document.write(html); document.close();
    for (const s of document.querySelectorAll('script[type="text/htmlpreview"]')) { const n = document.createElement('script'); n.innerHTML = s.innerHTML; document.body.appendChild(n); }
    document.dispatchEvent(new Event('DOMContentLoaded', { bubbles: true, cancelable: true }));
  }, 10);
});
</script></body></html>`;
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fails++; };
const browser = await launchBrowser();
for (const [w, h] of [[1280, 800], [393, 852]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const stray = [];
  await ctx.route('**/*', (r) => { const u = r.request().url();
    if (u.startsWith(HOST)) return r.fulfill({ contentType: 'text/html', body: loader });
    if (u === RAW) return r.fulfill({ contentType: 'text/plain; charset=utf-8', headers: { 'access-control-allow-origin': '*' }, body: readFileSync(out) });
    stray.push(u); return r.abort(); });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const url = HOST + '?' + 'https://example.test/u/r/blob/main/sample.html';
  await page.goto(url);
  const ran = await page.waitForFunction(() => window.TRANSIT_UI, null, { timeout: 10000 }).then(() => true, () => false);
  const tag = `preview ${w}x${h}`;
  ok(ran, `${tag}: page scripts ran after document.write`);
  if (!ran) { await ctx.close(); continue; }
  await page.waitForTimeout(400);
  const m = await page.evaluate(() => { const st = window.TRANSIT_UI.state(); return { st, to: st.hop >= 0 && window.TRANSIT_UI.hops[st.hop].to, verdict: document.getElementById('verdict').textContent, panel: document.getElementById('panel').innerText, fonts: [...document.fonts].map((f) => f.status) }; });
  ok(errs.length === 0, `${tag}: no page or console errors${errs.length ? ' ' + errs.join('; ') : ''}`);
  ok(!m.st.playing && m.to === 'email' && /SERVICE ALERT/.test(m.panel), `${tag}: opens paused on the SERVICE ALERT hop to email, panel open`);
  ok(/ · SERVICE ALERT · 23 hops$/.test(m.verdict), `${tag}: verdict line shows`);
  ok(m.fonts.length >= 2 && m.fonts.every((s) => s === 'loaded'), `${tag}: inline fonts load`);
  await page.keyboard.press('n'); await page.waitForTimeout(150);
  const after = await page.evaluate(() => ({ href: location.href, hop: window.TRANSIT_UI.state().hop }));
  ok(after.hop === m.st.hop + 1 && after.href.startsWith(url + '#span='), `${tag}: next hop updates #span= on the preview URL`);
  ok(stray.length === 0, `${tag}: no requests beyond the preview page and the raw file${stray.length ? ' ' + stray.join(' ') : ''}`);
  await ctx.close();
}
await browser.close();
if (fails) { console.error(`${fails} preview check(s) failed`); process.exit(1); }
console.log('preview: all checks passed');

// core/test-verdict.mjs: default file names, the data-derived verdict line, and --share refusing --no-scrub.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { ROOT } from './tools.mjs';
import { slug, defaultName, verdict, countHops, fmtMs, shortReason } from './verdict.mjs';
import { build } from './build.mjs';
let fails = 0;
const eq = (a, b, m) => { const c = JSON.stringify(a) === JSON.stringify(b); console.log(`${c ? 'ok  ' : 'FAIL'} ${m}${c ? '' : `: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`}`); if (!c) fails++; };
const HERO = join(ROOT, 'src/request-transit/samples/otel-demo-checkout.otlp.json');
const TITLE = 'Checkout: one order through the Astronomy Shop';
const tmp = mkdtempSync(join(tmpdir(), 'transit-verdict-'));

eq(slug('Checkout: one order!'), 'checkout-one-order', 'slug lowercases and joins words');
eq(slug('Café  Überweisung'), 'cafe-uberweisung', 'slug drops accents');
eq(defaultName(TITLE, { subject: 'email' }), 'checkout-email-service-alert.html', 'title head + alert');
eq(defaultName('', { subject: 'email' }), 'email-service-alert.html', 'no title: alert only');
eq(defaultName('Nightly build of the main app', null), 'nightly-build-of-the.html', 'no ":" in title: first four words');
eq(defaultName('', null), 'transit.html', 'nothing to name it after: transit.html');
eq(defaultName('!!!', { subject: null }), 'transit.html', 'empty slug falls back to transit.html');
// non-Latin (or empty) slug parts are dropped: a name never starts with '-'
eq(defaultName('日本語のトレース', { subject: 'メール' }), 'transit-service-alert.html', 'CJK title and subject: transit-service-alert.html');
eq(defaultName('', { subject: '支払い' }), 'transit-service-alert.html', 'no title, CJK subject: transit-service-alert.html');
eq(defaultName('Checkout: one order', { subject: '支払い' }), 'checkout-service-alert.html', 'CJK subject keeps the title head');
eq(defaultName('チェックアウト: 注文', { subject: 'email' }), 'email-service-alert.html', 'CJK title keeps the subject');
eq(['日本', '!!!', '-x-', '— a', ''].map((s) => defaultName(s, { subject: s })).every((n) => /^[a-z0-9]/.test(n)), true, 'default names always start with [a-z0-9]');

// hero: default name, verdict, hop count, same answer twice (deterministic)
const cwd = process.cwd(); process.chdir(tmp);
const a = build(HERO, { title: TITLE, share: true }), b = build(HERO, { title: TITLE, share: true });
process.chdir(cwd);
eq([basename(dirname(a.out)), basename(a.out)], ['transit-out', 'checkout-email-service-alert.html'], 'hero default out is transit-out/checkout-email-service-alert.html');
eq([dirname(b.out), basename(b.out)], [dirname(a.out), 'checkout-email-service-alert-2.html'], 'a second default build gets -2, not an overwrite');
eq(a.verdict, 'email failed after 671 ms: SMTP timeout · SERVICE ALERT · 23 hops', 'hero verdict');
eq(b.verdict, a.verdict, 'verdict is deterministic');
eq(countHops(a.trace), 23, 'hero hop count matches the page footer (23 hops)');
const explicit = build(HERO, { out: join(tmp, 'given.html') });
eq(explicit.out, join(tmp, 'given.html'), '--out is used as given');
// collision: an existing default file is left untouched; the next free -N is used
const tmp2 = mkdtempSync(join(tmpdir(), 'transit-collide-'));
mkdirSync(join(tmp2, 'transit-out'));
const first = join(tmp2, 'transit-out/checkout-email-service-alert.html');
writeFileSync(first, 'EXISTING');
process.chdir(tmp2);
const c2 = build(HERO, { title: TITLE, share: true }).out, c3 = build(HERO, { title: TITLE, share: true }).out;
process.chdir(cwd);
eq([basename(c2), basename(c3)], ['checkout-email-service-alert-2.html', 'checkout-email-service-alert-3.html'], 'collision: -2 then -3');
eq(readFileSync(first, 'utf8'), 'EXISTING', 'collision: the existing file is untouched');
writeFileSync(join(tmp2, 'given.html'), 'EXISTING');
build(HERO, { out: join(tmp2, 'given.html') });
eq(readFileSync(join(tmp2, 'given.html'), 'utf8') !== 'EXISTING', true, 'explicit --out still overwrites (unchanged)');
rmSync(tmp2, { recursive: true, force: true });
const ok = verdict({ meta: { format: 'otlp' }, spans: [{ spanId: 'a', service: 'web', name: 'GET /', kind: 'server', start: 0, duration: 1500, status: 'ok' }] });
eq(ok.text, 'no SERVICE ALERT · 0 hops in 1.50 s', 'no alert: an honest summary, no invented failure');

eq(a.verdict.includes('(') || a.verdict.includes(')'), false, 'hero verdict has no parentheses');
eq([
  shortReason('Internal Server Error: failed to send order confirmation (SMTP timeout)'),
  shortReason('step failed: Run unit tests', ['Run unit tests']),
  shortReason('denied'),
  shortReason('rpc error: code = Unavailable desc = connection error: desc = transport: dial tcp: lookup cart on 10.96.0.10:53: no such host'),
  shortReason('Payment declined because the card issuer refused the authorization request'),
  shortReason(''),
], ['SMTP timeout', '', 'denied', 'no such host', 'Payment declined because the card…', ''], 'short reason: trailing cause, own name dropped, last clause, word-boundary cut');
const ag = (f) => build(join(ROOT, `src/agent-transit/samples/${f}-synthetic.jsonl`), { format: f, share: true, out: join(tmp, 'ag.html') }).verdict;
eq(ag('claude-code'), 'shell · git failed after 12.0 s: denied · SERVICE ALERT · 18 calls', 'agent verdict');
// --share refuses --no-scrub with a one-line error and writes nothing
const out = join(tmp, 'refused.html');
const r = spawnSync(process.execPath, [join(ROOT, 'core/build.mjs'), HERO, '--share', '--no-scrub', '--out', out], { encoding: 'utf8' });
eq(r.status, 1, '--share --no-scrub exits 1');
eq(/--share .*cannot be turned off: remove --no-scrub/.test(r.stderr) && r.stderr.trim().split('\n').length === 1, true, '--share --no-scrub: clear one-line error');
eq(existsSync(out), false, '--share --no-scrub writes no file');
const s = spawnSync(process.execPath, [join(ROOT, 'core/build.mjs'), HERO, '--share', '--title', TITLE, '--out', join(tmp, 's.html')], { encoding: 'utf8' });
eq(s.stdout.trim().split('\n').pop(), `share: drop ${join(tmp, 's.html')} into Slack. Suggested message: "${a.verdict}"`, '--share prints the path and the verdict');
eq(/values scrubbed \(strict\)/.test(s.stdout), true, '--share scrubs strictly');
// --share on CI keeps the step stations apart (strict scrubbing used to merge job-<id>-step-<n> into one)
const CIRUN = join(ROOT, 'src/ci-transit/samples/gh-run-sample.json');
const ci = (o) => build(CIRUN, { format: 'gh-actions', out: join(tmp, 'ci.html'), ...o }).trace.spans.map((x) => [x.service, x.attrs['ci.step.number'] ?? null]);
eq(ci({ share: true }), ci({}), 'CI --share: same stations and step numbers as the default build');
const civ = (o) => build(CIRUN, { format: 'gh-actions', share: true, out: join(tmp, 'ci.html'), ...o }).verdict;
eq(civ({}), 'test (node 22) / Run unit tests failed after 6 min · SERVICE ALERT · 12 dependencies', 'CI verdict');
eq(civ({ 'max-gap-ms': '0' }), civ({}), 'CI verdict time is wall time, with or without idle gaps shortened');
// a CI step without ci.job never says 'undefined'
const noJob = verdict({ meta: { format: 'gh-actions' }, spans: [
  { spanId: 'r', service: 'run', name: 'run', kind: 'server', start: 0, duration: 1000, status: 'error' },
  { spanId: 's', parentId: 'r', service: 'job-1-step-2', name: 'Run unit tests', kind: 'internal', start: 0, duration: 500, status: 'error', statusMessage: 'exit code 1', attrs: { 'ci.step.number': 2 } }] }, { hopNounPlural: 'dependencies' });
eq(noJob.text.includes('undefined'), false, 'CI step without ci.job: no "undefined" in the verdict');
eq(noJob.text.startsWith('job-1-step-2 / Run unit tests failed after 0 ms'), true, 'CI step without ci.job falls back to the station: ' + noJob.text);
eq(defaultName('CI: x', noJob), 'ci-job-1-step-2-service-alert.html', 'CI step without ci.job: name from the station');
eq([fmtMs(24.4), fmtMs(671.4), fmtMs(1500), fmtMs(12000), fmtMs(365000), fmtMs(3725000)], ['24 ms', '671 ms', '1.50 s', '12.0 s', '6 min 5 s', '1 h 2 min'], 'time format');
process.chdir(tmp);
const ciOut = build(CIRUN, { format: 'gh-actions', share: true, title: "CI: one run of a fictional repo's pipeline" }).out;
process.chdir(cwd);
eq(ciOut.endsWith('/transit-out/ci-test-node-22-service-alert.html'), true, 'CI default name: ci-test-node-22-service-alert.html');
rmSync(tmp, { recursive: true, force: true });
if (fails) { console.error(`${fails} verdict check(s) failed`); process.exit(1); }
console.log('verdict: all checks passed');

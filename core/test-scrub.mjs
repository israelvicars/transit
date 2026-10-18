// core/test-scrub.mjs: seeded canaries must never reach the built page (default level), plus the --strict
// extras, the CI title/branch rule, the off switch, friendly input errors and the deletion guard.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { build } from './build.mjs';
import { scrubString } from './scrub.mjs';
import { clearFrames, removeFramesDir, assertSafeOutputDir, safeName } from './fsguard.mjs';
import { parseArgs, UserError } from './cli.mjs';
import { ROOT } from './tools.mjs';

const dir = mkdtempSync(join(tmpdir(), 'transit-scrub-'));
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  ', name); };
// every canary is a string that must not survive; the label says what it stands for
const C = {
  email: 'canary.person@example-corp.com', jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJjYW5hcnkifQ.c2lnbmF0dXJlY2FuYXJ5',
  bearer: 'CANARYbearer0123456789', ghp: 'ghp_CANARY0123456789abcdefghijklmnopqrstu', aws: 'AKIACANARY0123456789',
  pw: 'Hunter2Canary!', apikey: 'canaryKey_77', qtok: 'qcanary9988', account: '987654321098',
  uuid: '6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f', hex: 'deadbeefcafe0123456789abcdefcanary'.replace('canary', '0123456789'),
  b64: 'Q2FuYXJ5U2VjcmV0VmFsdWUxMjM0NTY3ODkwQUJDREVGRw', userinfo: 'canaryuser:canarypass', home: '/Users/canaryperson/work',
};
const ns = (ms) => String(BigInt(1792000000000 + ms) * 1000000n);
const span = (id, parent, name, extra = {}, attrs = []) => ({ traceId: '0af7651916cd43dd8448eb211c80319c', spanId: id, parentSpanId: parent, name, kind: extra.kind || 2,
  startTimeUnixNano: ns(extra.s || 0), endTimeUnixNano: ns(extra.e || 100), status: extra.status || { code: 0 },
  attributes: attrs.map(([key, v]) => ({ key, value: { stringValue: v } })) });
const otlp = { resourceSpans: [
  { resource: { attributes: [{ key: 'service.name', value: { stringValue: 'frontend' } }] }, scopeSpans: [{ spans: [
    span('a000000000000001', '', `GET /api/orders?token=${C.qtok}&user=${C.email}`, { e: 300 }, [['url.full', `https://${C.userinfo}@api.example.com/orders?session=${C.qtok}`], ['http.request.method', 'GET']]),
    span('a000000000000002', 'a000000000000001', `lookup ${C.uuid}`, { kind: 3, s: 10, e: 200, status: { code: 2, message: `login failed for ${C.email}: password=${C.pw} api_key=${C.apikey} Authorization: Bearer ${C.bearer}` } },
      [['peer.service', 'accounts'], ['rpc.method', `arn:aws:dynamodb:us-east-1:${C.account}:table/users`]]),
  ] }] },
  { resource: { attributes: [{ key: 'service.name', value: { stringValue: 'accounts' } }] }, scopeSpans: [{ spans: [
    span('a000000000000003', 'a000000000000002', `load ${C.hex} from ${C.home}/file`, { s: 20, e: 190, status: { code: 2, message: `token ${C.jwt} rejected; key ${C.ghp} ${C.aws} blob ${C.b64}` } }, [['db.system', 'postgresql'], ['server.address', 'db01.prod.internal']]),
  ] }] },
] };
const write = (name, body) => { const p = join(dir, name); writeFileSync(p, typeof body === 'string' ? body : JSON.stringify(body)); return p; };
const page = (file, opt = {}) => { const out = join(dir, `${n}-${Math.random().toString(36).slice(2)}.html`); const r = build(file, { out, ...opt }); return { html: readFileSync(out, 'utf8'), trace: r.trace }; };

try {
  const f = write('canary.otlp.json', otlp);
  t('default level: no seeded canary reaches the page (names, status messages, URLs, attrs)', () => {
    const { html, trace } = page(f);
    for (const [k, v] of Object.entries(C)) assert.ok(!html.includes(v), `canary ${k} leaked: ${v}`);
    assert.ok(trace.meta.scrub.values > 10, 'counts replacements');
    assert.match(html, /\[email\]/); assert.match(html, /\?\[query\]/); assert.match(html, /\[account\]/);
    assert.ok(html.includes('db01.prod.internal'), 'internal hosts are kept unless --strict');
  });
  t('--strict (and --share) also removes internal hosts, IPs and non-allowlisted attributes', () => {
    for (const flag of ['strict', 'share']) {
      const { html, trace } = page(f, { [flag]: true });
      assert.ok(!html.includes('db01.prod.internal'));
      assert.equal(trace.meta.scrub.level, 'strict');
      assert.ok(trace.spans.every((s) => !s.attrs || !('server.address' in s.attrs)));
    }
    assert.equal(scrubString('to 10.1.2.3 and fe80::1:2:3', { level: 'strict', uuids: true }), 'to [ip] and [ip]');
  });
  t('--keep-uuids keeps UUIDs; --no-scrub turns everything off and warns', () => {
    assert.ok(page(f, { 'keep-uuids': true }).html.includes(C.uuid));
    const off = page(f, { 'no-scrub': true });
    assert.ok(off.html.includes(C.email)); assert.equal(off.trace.meta.scrub.level, 'off');
    assert.ok(off.trace.meta.warnings.some((w) => /do not share/.test(w)));
  });
  t('CI: run title (PR/commit title) and branch are dropped unless --keep-ci-titles', () => {
    const run = JSON.parse(readFileSync(join(ROOT, 'src/ci-transit/samples/gh-run-sample.json'), 'utf8'));
    run.displayTitle = 'CANARY-TITLE fix billing for BigCustomerCo'; run.headBranch = 'CANARY-BRANCH/jira-1234-bigcustomer';
    const g = write('run.json', run);
    const { html } = page(g, { format: 'gh-actions' });
    assert.ok(!html.includes('CANARY-TITLE') && !html.includes('CANARY-BRANCH'));
    const kept = page(g, { format: 'gh-actions', 'keep-ci-titles': true }).html;
    assert.ok(kept.includes('CANARY-TITLE') && kept.includes('CANARY-BRANCH'));
  });
  t('ordinary names are untouched', () => {
    for (const s of ['POST /api/checkout', 'oteldemo.CartService/GetCart', 'Run npm test', 'Read · module-0.mjs', 'Payment request failed. Invalid token.', 'http.route /api/products/{id}'])
      assert.equal(scrubString(s, { level: 'default', uuids: true }), s);
  });
  t('bad input: a one-line UserError, never a stack trace', () => {
    const cases = { 'empty.json': '', 'blank.json': '  \n', 'text.json': 'hello world', 'broken.json': '{"resourceSpans": [', 'number.json': '42', 'two.jsonl': '{"a":1}\nnot json' };
    for (const [name, body] of Object.entries(cases)) assert.throws(() => build(write(name, body), { out: join(dir, 'x.html') }), (e) => e instanceof UserError && !/\n\s+at /.test(e.message), name);
    assert.throws(() => build(join(dir, 'missing.json'), { out: join(dir, 'x.html') }), (e) => e instanceof UserError && /no such file/.test(e.message));
    assert.throws(() => build(write('obj.json', { hello: 1 }), { out: join(dir, 'x.html') }), (e) => e instanceof UserError);
    assert.throws(() => parseArgs(['--title']), UserError);
  });
  t('deletion guard: refuses root, home, repo root, cwd; removes only Transit frame files', () => {
    for (const bad of ['/', homedir(), ROOT, process.cwd(), join(homedir(), '..')]) assert.throws(() => clearFrames(bad), /refusing/);
    assert.throws(() => assertSafeOutputDir(ROOT), /repo root/);
    const fr = join(dir, 'frames'); mkdirSync(fr);
    for (const x of ['0000.png', '0001.png', '.transit-frames', 'keep-me.txt', 'notes.png']) writeFileSync(join(fr, x), 'x');
    assert.equal(removeFramesDir(fr), 3);
    assert.deepEqual(readdirSync(fr).sort(), ['keep-me.txt', 'notes.png']);   // folder kept: not ours to delete
    rmSync(join(fr, 'keep-me.txt')); rmSync(join(fr, 'notes.png')); writeFileSync(join(fr, '0002.png'), 'x');
    removeFramesDir(fr); assert.ok(!existsSync(fr));
    for (const bad of ['../x', 'a/b', '', '..', '.hidden']) assert.throws(() => safeName(bad));
    assert.equal(safeName('otel'), 'otel');
  });
  t('setup never installs system packages (no brew/apt/winget spawn)', () => {
    const src = readFileSync(join(ROOT, 'core/setup.mjs'), 'utf8');
    assert.ok(!/runRetry\([^)]*['"](brew|apt-get|apt|dnf|winget|choco)['"]/.test(src));
    assert.ok(!/spawnSync\(\s*['"](brew|apt-get|sudo|winget)['"]/.test(src));
    assert.ok(!/ffprobe-static|ffprobeBin/.test(src + readFileSync(join(ROOT, 'core/tools.mjs'), 'utf8') + readFileSync(join(ROOT, 'core/export.mjs'), 'utf8')));
  });
  console.log(`${n} scrub/safety tests passed`);
} finally { rmSync(dir, { recursive: true, force: true }); }

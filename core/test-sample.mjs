// core/test-sample.mjs: docs/samples/checkout-email-service-alert.html (linked from the README) must match a fresh build.
// usage: node core/test-sample.mjs           fail if the committed sample is stale
//        node core/test-sample.mjs --write   rebuild it in place (after a template, verdict or scrub change)
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SAMPLE = join(ROOT, 'docs/samples/checkout-email-service-alert.html');
const tmp = mkdtempSync(join(tmpdir(), 'transit-sample-')), out = join(tmp, 'sample.html');
const r = spawnSync(process.execPath, [join(ROOT, 'core/build.mjs'), join(ROOT, 'src/request-transit/samples/otel-demo-checkout.otlp.json'), '--share',
  '--title', 'Checkout: one order through the Astronomy Shop',
  '--subtitle', 'OpenTelemetry Demo service names  ·  SYNTHETIC hand-built trace in OTLP JSON shape', '--out', out], { encoding: 'utf8' });
if (r.status !== 0) { console.error(r.stderr); process.exit(1); }
const fresh = readFileSync(out); rmSync(tmp, { recursive: true, force: true });
if (!/Suggested message: "email failed after 671 ms: SMTP timeout · SERVICE ALERT · 23 hops"/.test(r.stdout)) { console.error('FAIL sample verdict changed:\n' + r.stdout); process.exit(1); }
if (process.argv.includes('--write')) { writeFileSync(SAMPLE, fresh); console.log(`wrote ${SAMPLE} (${fresh.length} bytes)`); process.exit(0); }
let cur = null; try { cur = readFileSync(SAMPLE); } catch { /* missing */ }
if (!cur || !cur.equals(fresh)) { console.error('FAIL docs/samples/checkout-email-service-alert.html is stale: run node core/test-sample.mjs --write'); process.exit(1); }
console.log(`ok   docs/samples sample matches a fresh --share build (${fresh.length} bytes)`);

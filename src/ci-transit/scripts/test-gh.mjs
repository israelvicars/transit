import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readFileSync } from 'node:fs';
import { build } from '../../../core/build.mjs';
import { normalizeGh } from '../adapters/normalize-gh.mjs';

const sample = readFileSync(new URL('../samples/gh-run-sample.json', import.meta.url), 'utf8');
const trace = normalizeGh(sample);
assert.equal(trace.meta.format, 'gh-actions');
assert.equal(trace.meta.synthetic, true);
assert.equal(trace.spans.length, 13); // root + 5 jobs + 7 timed steps
assert.equal(trace.spans.filter((s) => s.parentId === trace.spans[0].spanId).length, 3);
const steps = trace.spans.filter((s) => s.attrs['ci.step.number'] != null);
assert.equal(steps.length, 7);
assert.ok(steps.every((s) => s.service === s.spanId), 'each step has a unique station service');
const failedStep = steps.find((s) => s.attrs['ci.job'] === 'test (node 22)' && s.name === 'Run unit tests');
assert.equal(failedStep.status, 'error');
assert.equal(failedStep.statusMessage, 'step failed: Run unit tests');
assert.equal(trace.spans.filter((s) => s.status === 'error' && s.attrs['ci.step.number'] != null).length, 1, 'the failed marker belongs to the failed step');
assert.equal(failedStep.parentId, 'job-240103-step-1', 'steps are stations in their job-local chain');
assert.equal(steps.find((s) => s.attrs['ci.job'] === 'test (node 22)' && s.attrs['ci.step.number'] === 1).parentId, 'job-240103');
assert.equal(trace.spans.find((s) => s.name === 'build').parentId, 'job-240103-step-2', 'build transfers from the latest needed job step');
assert.deepEqual(trace.spans.find((s) => s.name === 'build').attrs['ci.needs.from'], ['job-240101-step-2', 'job-240102-step-2'], 'build records every other needed job terminal station');
assert.equal(trace.spans.find((s) => s.name === 'deploy-preview').parentId, 'job-240104-step-1', 'deploy transfers from build\'s last step');
const skipped = trace.spans.find((s) => s.name === 'deploy-preview');
assert.equal(skipped.attrs['ci.conclusion'], 'skipped');
assert.equal(skipped.duration, 0);
assert.equal(skipped.status, 'unset');
const withSkippedStep = JSON.parse(sample);
withSkippedStep.jobs[0].steps.push({ name: 'Optional cache', number: 3, conclusion: 'skipped' });
const skippedStep = normalizeGh(withSkippedStep).spans.find((s) => s.name === 'Optional cache');
assert.equal(skippedStep.duration, 0, 'skipped steps without timestamps are retained as zero-duration stations');
assert.equal(skippedStep.status, 'unset');
assert.deepEqual(trace.meta.warnings, []);

const out = join(tmpdir(), 'transit-ci-test.html');
build(new URL('../samples/gh-run-sample.json', import.meta.url), { out });
const html = readFileSync(out, 'utf8');
for (const word of ['job', 'step', 'SERVICE ALERT', 'DELAY', 'Steps', 'skipped', 'ciStepsAsStations', 'data-ci-step']) assert.match(html, new RegExp(word));
assert.match(html, /s\.attrs\['ci\.step\.number'\]/, 'CI markers are filtered to step stations');
assert.match(html, /ci\.needs\.from/, 'CI needs transfer metadata is embedded');

// real-run shapes: GitHub's zero time on skipped steps, and very large matrix runs
{
  const doc = JSON.parse(sample);
  const j0 = doc.jobs.find((j) => (j.steps || []).length);
  j0.steps.push({ name: 'zero-time skipped', number: 99, status: 'completed', conclusion: 'skipped', startedAt: '0001-01-01T00:00:00Z', completedAt: '0001-01-01T00:00:00Z' });
  const t = normalizeGh(doc);
  assert.ok(t.spans.every((s) => s.start >= 0 && s.start < 864e5), 'zero-time steps do not drag the run start back to year 1');
  const big = JSON.parse(sample);
  for (const j of big.jobs) j.steps = Array.from({ length: 40 }, (_, i) => ({ name: `s${i}`, number: i + 1, status: 'completed', conclusion: i === 7 && j === big.jobs[1] ? 'failure' : 'success', startedAt: j.startedAt || big.startedAt, completedAt: j.startedAt || big.startedAt }));
  const tb = normalizeGh(big);
  assert.ok(tb.meta.warnings.some((w) => /large run/.test(w)), 'large runs warn');
  assert.equal(tb.spans.filter((s) => s.attrs['ci.step.number'] != null).length, 1, 'large runs keep only failed steps as stations');
  assert.ok(normalizeGh(big, { maxSteps: 0 }).spans.filter((s) => s.attrs['ci.step.number'] != null).length > 40, '--max-steps 0 keeps every step');
}
console.log('ci: synthetic GitHub Actions normalization and CI vocab pass');

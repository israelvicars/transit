// core/test-gaps.mjs: idle-gap compression keeps order, overlaps and activity durations; cuts only idle time.
import assert from 'node:assert/strict';
import { compressGaps } from './gaps.mjs';
import { splitSingleService } from './build.mjs';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  ', name); };
const mk = () => ({ meta: {}, spans: [
  { spanId: 'r', parentId: null, start: 0, duration: 100000, attrs: {} },
  { spanId: 'a', parentId: 'r', start: 1000, duration: 2000 },
  { spanId: 'b', parentId: 'r', start: 2500, duration: 1000 },     // overlaps a
  { spanId: 'c', parentId: 'r', start: 60000, duration: 500 },     // after a 56.5 s idle gap
  { spanId: 'd', parentId: 'r', start: 60600, duration: 400 },     // 100 ms gap: kept
] });
t('long idle gaps shrink to maxGap, short ones and durations are kept', () => {
  const tr = mk(), g = compressGaps(tr, 3000), by = Object.fromEntries(tr.spans.map((s) => [s.spanId, s]));
  assert.equal(g.count, 2);                                        // the 56.5 s gap and the 39 s tail
  assert.deepEqual([by.a.start, by.a.duration, by.b.start, by.b.duration], [1000, 2000, 2500, 1000]);
  assert.equal(by.c.start, 3500 + 3000); assert.equal(by.c.duration, 500);
  assert.equal(by.d.start - (by.c.start + by.c.duration), 100); assert.equal(by.d.duration, 400);
  assert.equal(by.r.duration, by.d.start + by.d.duration + 3000);
  assert.equal(by.r.attrs['transit.wall_ms'], 100000);
});
t('maxGap 0 or no long gaps: untouched', () => {
  const a = mk(); assert.equal(compressGaps(a, 0), null); assert.deepEqual(a, mk());
  const b = mk(); assert.equal(compressGaps(b, 1e9), null); assert.deepEqual(b, mk());
});
t('single-service request trace: stations become operations, numbered children share one', () => {
  const tr = { meta: { warnings: [] }, spans: [
    { spanId: 'r', parentId: null, service: 'mono', name: 'GET /cart', attrs: {} },
    { spanId: 'a', parentId: 'r', service: 'mono', name: 'okey-dokey-0' }, { spanId: 'b', parentId: 'r', service: 'mono', name: 'okey-dokey-12' },
    { spanId: 'c', parentId: 'a', service: 'mono', name: 'SELECT cart' },
  ] };
  assert.equal(splitSingleService(tr), true);
  assert.deepEqual(tr.spans.map((s) => s.service), ['mono', 'okey-dokey', 'okey-dokey', 'SELECT cart']);
  assert.equal(tr.spans[1].attrs['service.name'], 'mono');
  const multi = { meta: { warnings: [] }, spans: [{ spanId: 'r', parentId: null, service: 'a' }, { spanId: 'x', parentId: 'r', service: 'b' }] };
  assert.equal(splitSingleService(multi), false);
});
console.log(`${n} gap/build tests passed`);

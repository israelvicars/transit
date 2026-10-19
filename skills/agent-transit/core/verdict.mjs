// core/verdict.mjs: a one-line, data-derived summary of a normalized trace, used for the default file
// name, the --share console tip and the --share page headline. Nothing here is invented: the subject,
// message, time and count all come from the trace. The hop count mirrors the page's call building
// (uninstrumented peers + cross-service parent/child edges), without CI needs connectors.
const CI = 'gh-actions', AGENT = ['claude-code', 'codex', 'cursor'];

export function countHops(trace) {
  const spans = trace.spans, byId = new Map(spans.map((s) => [s.spanId, s]));
  const kids = new Map(spans.map((s) => [s.spanId, []]));
  for (const s of spans) if (s.parentId && kids.has(s.parentId)) kids.get(s.parentId).push(s);
  const crossKids = (s) => kids.get(s.spanId).filter((c) => c.service !== s.service);
  const via = new Map();
  let n = 0;
  for (const s of spans) {
    if ((s.kind === 'client' || s.kind === 'producer') && s.peer && (s.kind === 'producer' || crossKids(s).length === 0) && s.peer !== s.service) { via.set(s.spanId, s.peer); n++; }
  }
  for (const s of spans) {
    const p = s.parentId && byId.get(s.parentId);
    if (!p || p.service === s.service) continue;
    const from = p.kind === 'producer' && via.has(p.spanId) ? via.get(p.spanId) : p.service;
    if (from !== s.service) n++;
  }
  return n;
}

// the first error that starts here (an error span with no error below it), earliest end first
export function errorOrigin(trace) {
  const kids = new Map(trace.spans.map((s) => [s.spanId, []]));
  for (const s of trace.spans) if (s.parentId && kids.has(s.parentId)) kids.get(s.parentId).push(s);
  const errBelow = (s) => kids.get(s.spanId).some((k) => k.status === 'error' || errBelow(k));
  const origins = trace.spans.filter((s) => s.status === 'error' && !errBelow(s));
  // CI: only steps carry alerts on the map
  const pool = trace.meta && trace.meta.format === CI ? origins.filter((s) => s.attrs && s.attrs['ci.step.number'] != null) : origins;
  return pool.sort((a, b) => (a.start + a.duration) - (b.start + b.duration) || a.start - b.start || String(a.spanId).localeCompare(String(b.spanId)))[0] || null;
}

export const fmtMs = (ms) => {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)} s`;
  const sec = Math.round(ms / 1000), m = Math.floor(sec / 60), r = sec % 60;
  return m < 60 ? `${m} min${r ? ` ${r} s` : ''}` : `${Math.floor(m / 60)} h ${m % 60} min`;
};
const oneLine = (s, max) => { const t = String(s).replace(/\s+/g, ' ').trim(); return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t; };

function subjectOf(s, format) {
  if (format === CI) return { label: `${s.attrs['ci.job']} / ${s.name}`, short: s.attrs['ci.job'] };
  if (AGENT.includes(format)) return { label: s.name, short: s.name };
  return { label: s.service, short: s.service };
}

// wall (optional): spanId -> {start, duration} from before idle gaps were shortened, so times read as wall time
export function verdict(trace, vocab = {}, wall = null) {
  const format = trace.meta && trace.meta.format;
  const W = (s) => (wall && wall.get(s.spanId)) || s;
  const hops = countHops(trace), noun = vocab.hopNounPlural || 'hops', alert = vocab.serviceAlert || 'SERVICE ALERT';
  const t0 = Math.min(...trace.spans.map((s) => W(s).start)), t1 = Math.max(...trace.spans.map((s) => W(s).start + W(s).duration));
  const o = errorOrigin(trace);
  if (!o) return { text: `no ${alert}: ${hops} ${noun} in ${fmtMs(t1 - t0)}`, origin: null, subject: null };
  const sub = subjectOf(o, format);
  return {
    text: `${sub.label} failed: ${oneLine(o.statusMessage || 'error', 100)} (${alert}) after ${fmtMs(W(o).start - t0)}, ${hops} ${noun}`,
    origin: o.spanId, subject: sub.short,
  };
}

export const slug = (s, max = 40) => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/, '');

// "Checkout: one order through..." + email alert -> "checkout-email-service-alert"
export function defaultName(title, v) {
  const t = String(title || '');
  const head = /[:–—|]/.test(t) ? t.split(/[:–—|]/)[0] : t.split(/\s+/).slice(0, 4).join(' ');
  const parts = [slug(head, 32), v && v.subject ? slug(v.subject, 24) + '-service-alert' : ''].filter(Boolean);
  const name = parts.join('-').replace(/-+/g, '-').slice(0, 80).replace(/-+$/, '');
  return (name || 'transit') + '.html';
}

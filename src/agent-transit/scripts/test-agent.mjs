import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { build } from '../../../core/build.mjs';
import { normalizeAgent } from '../adapters/normalize-agent.mjs';

const dir = new URL('../samples/', import.meta.url);
const canaries = ['SECRET_CANARY_PROMPT_7731', 'SECRET_CANARY_OUTPUT_7731', 'SECRET_CANARY_FILE_CONTENT_7731', 'SECRET_CANARY_COMMAND_7731'];
for (const format of ['claude-code', 'codex', 'cursor']) {
  const file = new URL(`${format}-synthetic.jsonl`, dir), raw = readFileSync(file, 'utf8');
  const trace = normalizeAgent(raw, { format });
  assert.equal(trace.meta.format, format);
  assert.equal(trace.meta.synthetic, format !== 'cursor');
  assert.ok(trace.spans.length >= 16);
  assert.ok(trace.spans.some((s) => s.service === 'read'));
  assert.ok(trace.spans.some((s) => s.service === 'edit'));
  assert.ok(trace.spans.some((s) => s.service === 'shell'));
  assert.ok(trace.spans.some((s) => s.service === 'subagent'));
  assert.ok(trace.spans.some((s) => s.status === 'error' && s.statusMessage === 'denied' || s.statusMessage === 'tool error'));
  if (format !== 'cursor') assert.ok(trace.spans.some((s) => s.name.includes('npm') && s.duration >= 3000));
  if (format === 'codex') {
    assert.ok(trace.spans.some((s) => s.service === 'shell' && s.attrs['agent.wrapper'] === 'exec'));
    assert.ok(trace.spans.some((s) => s.service === 'edit' && s.attrs['agent.wrapper'] === 'exec'));
    assert.ok(trace.spans.some((s) => s.service === 'plan' && s.attrs['agent.wrapper'] === 'exec'));
    assert.ok(trace.meta.warnings.includes('ignored 2 Codex line(s) of type mystery_future_line'));
  }
  if (format === 'cursor') {
    const tools = trace.spans.filter((s) => s.spanId.startsWith('tool-'));
    assert.equal(tools[0].start, 0);
    assert.equal(tools[1].start - tools[0].start, 1250);
    assert.equal(tools[0].duration, 1000);
    assert.equal(tools[12].status, 'error');
    assert.ok(trace.meta.warnings.includes('Cursor transcripts have no timestamps or results: order only, durations are uniform'));
  }
  const out = join(tmpdir(), `transit-agent-${format}.html`);
  const built = build(file, { format, out });
  const html = readFileSync(built.out, 'utf8');
  for (const marker of canaries) assert.doesNotMatch(html, new RegExp(marker));
  const shown = build(file, { format, out: `${out}.args`, 'show-args': true });
  const shownHtml = readFileSync(shown.out, 'utf8');
  assert.match(shownHtml, /SECRET_CANARY_COMMAND_7731/);
  assert.doesNotMatch(shownHtml, /SECRET_CANARY_PROMPT_7731|SECRET_CANARY_OUTPUT_7731|SECRET_CANARY_FILE_CONTENT_7731/);
}

// Codex tool names seen on real sessions (names only): write_stdin/wait -> shell, view_image -> read, web__run -> web;
// an exec snippet that iterates `tools.forEach(` must still resolve to the real inner tool.
{
  const ts = (i) => `2026-10-16T12:00:${String(i).padStart(2, '0')}.000Z`;
  const lines = [{ timestamp: ts(0), type: 'session_meta', payload: { id: 's' } }];
  const calls = [['function_call', 'write_stdin'], ['function_call', 'wait'], ['function_call', 'view_image'], ['function_call', 'web__run'], ['custom_tool_call', 'exec', 'x.forEach(); tools.forEach(t => t); await tools.apply_patch("*** Begin Patch")']];
  calls.forEach(([type, name, input], i) => {
    lines.push({ timestamp: ts(2 * i + 1), type: 'response_item', payload: type === 'custom_tool_call' ? { type, name, input, call_id: `c${i}` } : { type, name, arguments: '{}', call_id: `c${i}` } });
    lines.push({ timestamp: ts(2 * i + 2), type: 'response_item', payload: { type: type + '_output', call_id: `c${i}`, output: 'ok' } });
  });
  const t = normalizeAgent(lines.map((l) => JSON.stringify(l)).join('\n'), { format: 'codex' });
  assert.deepEqual(t.spans.slice(1).map((s) => s.service), ['shell', 'shell', 'read', 'web', 'edit']);
}

// Cursor state.vscdb bubbles (real shape, synthetic values): start at createdAt, end at the next message after a
// burst of placeholders/parallel calls, capped by the turn's clientEndTime; content fields never reach the page.
{
  const file = new URL('cursor-bubbles-synthetic.jsonl', dir), raw = readFileSync(file, 'utf8');
  const t = normalizeAgent(raw, { format: 'cursor' });
  const tools = t.spans.filter((s) => s.spanId.startsWith('tool-'));
  assert.equal(tools.length, 20);
  assert.equal(t.meta.synthetic, true);
  assert.deepEqual(tools.slice(0, 3).map((s) => [s.start, s.duration]), [[0, 800], [800, 1200], [2000, 2300]]);
  assert.equal(tools[3].start + tools[3].duration, tools[2].start + tools[2].duration, 'a parallel burst ends together');
  assert.ok(tools.every((s) => s.duration >= 500), 'the 9 ms placeholder bubbles never end a call');
  assert.equal(tools.at(-1).duration, 10000, 'the last call in a turn ends at timingInfo.clientEndTime');
  assert.equal(tools.find((s) => s.name === 'run_terminal_cmd · npm').statusMessage, 'tool error');
  const cancel = tools.find((s) => s.name === 'run_terminal_cmd · git');
  assert.equal(cancel.status, 'error'); assert.equal(cancel.statusMessage, 'cancelled');
  assert.equal(tools.find((s) => s.name.startsWith('mcp_Figma')).service, 'mcp');
  assert.ok(t.meta.warnings.some((w) => /start at their bubble createdAt/.test(w)));
  const html = readFileSync(build(file, { format: 'cursor', out: join(tmpdir(), 'transit-agent-bubbles.html') }).out, 'utf8');
  for (const marker of canaries) assert.doesNotMatch(html, new RegExp(marker));
  assert.doesNotMatch(html, /src\/app\//, 'paths are cut to basenames');
  // bubbles from Cursor builds before ~Sep 2025 carry no createdAt/timingInfo: order only
  const old = raw.trim().split('\n').map((l) => { const o = JSON.parse(l); delete o.createdAt; delete o.timingInfo; return JSON.stringify(o); }).join('\n');
  const u = normalizeAgent(old, { format: 'cursor' }), ut = u.spans.filter((s) => s.spanId.startsWith('tool-'));
  assert.equal(ut.length, 20);
  assert.ok(ut.every((s) => s.duration === ut[0].duration));
  assert.ok(u.meta.warnings.some((w) => /without bubble timestamps/.test(w)));
}

// export-cursor.mjs against a synthetic state.vscdb: metadata only, read-only, composer id validated.
{
  let sqlite = null;
  try { execFileSync('sqlite3', ['-version'], { stdio: 'ignore' }); sqlite = 'cli'; } catch { try { await import('node:sqlite'); sqlite = 'node'; } catch {} }
  if (sqlite) {
    const tmp = mkdtempSync(join(tmpdir(), 'transit-cursor-')), db = join(tmp, 'state.vscdb'), cid = 'aaaaaaaa-0000-4000-8000-000000000001';
    const bubbles = readFileSync(new URL('cursor-bubbles-synthetic.jsonl', dir), 'utf8').trim().split('\n').slice(1).map((l) => JSON.parse(l));
    const rows = [[`composerData:${cid}`, { composerId: cid, name: 'SECRET_CANARY_PROMPT_7731', createdAt: Date.parse('2026-10-18T14:00:00Z'), fullConversationHeadersOnly: bubbles.map((b) => ({ bubbleId: b.bubbleId, type: b.type })) }],
      ...bubbles.map((b) => [`bubbleId:${cid}:${b.bubbleId}`, b])];
    const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
    const sql = 'CREATE TABLE cursorDiskKV (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB);\n' + rows.map(([k, v]) => `INSERT INTO cursorDiskKV VALUES (${q(k)}, ${q(JSON.stringify(v))});`).join('\n');
    if (sqlite === 'cli') execFileSync('sqlite3', [db], { input: sql });
    else { const { DatabaseSync } = await import('node:sqlite'); const d = new DatabaseSync(db); d.exec(sql); d.close(); }
    const script = new URL('./export-cursor.mjs', import.meta.url).pathname, out = join(tmp, 'x.cursor.jsonl');
    const list = execFileSync(process.execPath, [script, '--db', db, '--list', '--all-workspaces'], { encoding: 'utf8' });
    assert.match(list, /aaaaaaaa/); assert.doesNotMatch(list, /SECRET_CANARY/);
    execFileSync(process.execPath, [script, '--db', db, '--composer', 'aaaaaaaa', '--all-workspaces', '--out', out], { stdio: 'ignore' });
    const exported = readFileSync(out, 'utf8');
    assert.doesNotMatch(exported, /SECRET_CANARY|src\/app\//);
    assert.equal(normalizeAgent(exported, { format: 'cursor' }).spans.filter((s) => s.spanId.startsWith('tool-')).length, 20);
    assert.throws(() => execFileSync(process.execPath, [script, '--db', db, '--composer', "x' OR 1=1 --", '--all-workspaces', '--out', out], { stdio: 'pipe' }));
    rmSync(tmp, { recursive: true, force: true });
  } else console.log('agent: skipped export-cursor test (no sqlite3 CLI or node:sqlite)');
}
console.log('agent: synthetic Claude Code, Codex, and Cursor normalization plus privacy pass');

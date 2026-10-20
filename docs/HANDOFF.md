# Suite handoff log

Branch `suite` (local only, never pushed). Plan: docs/SUITE_PLAN.md. Baseline: docs/suite-baseline.md.
Pattern: Codex writes code with `codex exec --full-auto "<prompt>" </dev/null` (no git, `npm test` only; its sandbox blocks Chromium). The reviewer then runs `npm test`, `npm run verify`, `npm run test:ui` and the MP4 sha256 check outside Codex, and commits.
Gates: the request film hash (verify's `film hash`) must stay `86d08fd5fe208fb0`, and the OTel MP4 sha256 must stay `f4417aac2297a70b4e025d3440d68904f0dcf1c92ce88ff9685fb6acb6ca89f9` with the pinned ffmpeg-static 5.3.0 (it was `223590ce…` with Homebrew ffmpeg 9.0.2, which still reproduces it via TRANSIT_FFMPEG; see docs/suite-baseline.md). The out/ui/*.png screenshots must match the pre-change commit (compare with git stash).
Laptop: PATH=/opt/homebrew/bin:$PATH, no rg.

## M0 baseline: done (3cae93f)
All tests pass; hashes recorded.

## M1 extract core/: done (d1e7c47)
Codex used 113,788 tokens. Moved files to core/ and skills/request-transit/. MP4 identical, all tests pass. Fixes after Codex: repointed ~/.claude/skills and ~/.agents/skills symlinks to skills/request-transit, and fixed stale engine/ paths in design-system.md. Codex can't `git mv` (sandbox), so it moved files on disk and git still detected the renames.

## M2 vocab packs: done
Codex used 95,449 tokens. Added core/vocab.mjs (request, plus ci and agent stubs), the `--vocab` flag, the template reading copy from VIZ_OPTS.vocab, and core/test-vocab.mjs in npm test. Gate failure on the first run: test:ui "valkey hop: infrastructure" failed because Codex had lowercased the "Infrastructure hop" card title. Fixed by hand with an `infrastructureHopTitle` key. After the fix: MP4 identical, all tests pass, 6 UI screenshots identical to the pre-change commit.

## M3+M4 ci-transit adapter + skill: done
Codex used 61,666 tokens. Added skills/ci-transit/ (synthetic gh-run sample plus its generator, adapters/normalize-gh.mjs, read-only gh fetch.mjs, SKILL.md, test-gh.mjs), core/adapters.mjs registry, the ci vocab pack, a generalized plugin builder (2 skills), npm build:ci/render:ci/verify:ci, and a ci build in the network test.
Gate failure on the first run: verify:ci timing "1 off". The cause was the skipped deploy-preview job having zero duration, so it never gets a train. Fixed by hand in core/verify.mjs: zero-duration calls are excluded from the timing check and counted in the message. Request verify is unchanged.
After the fix: npm test, verify (MP4 identical), verify:ci, and test:ui all pass. I reviewed the contact sheet and it looks right: one line per job, the failure alert on test (node 22), deploy-preview drawn.
Follow-ups (not blocking): steps render as internal work rather than stations; `needs` dependencies aren't drawn as transfers (every job branches from the root); a skipped job shows as a line with no train.

## M5+M6 agent-transit adapters + skill: done
Codex used 83,748 tokens. Added skills/agent-transit/: claude-code, codex, and EXPERIMENTAL cursor parsers (adapters/normalize-agent.mjs), synthetic samples with generators and SECRET_CANARY markers, find-session.mjs (prints paths only), SKILL.md, test-agent.mjs with privacy tests. Also the agent vocab pack, the --show-args opt-in, npm build:agent/render:agent/verify:agent/build:agent:codex/build:agent:cursor, and an agent build in the network test. Plugin builder now covers 3 skills.
Gate failure on the first run: verify:agent determinism and timing (every frame differed). The cause was `Math.min(...times, Date.now())` in normalize-agent.mjs, which made the build depend on the clock. Fixed by hand. All three sources now build byte-identically twice.
After the fix: npm test passes; verify (MP4 identical), verify:ci, verify:agent, and test:ui all pass. No SECRET_CANARY string appears anywhere in out/. Contact sheet reviewed (one line per tool family, TOOL ERROR and SLOW CALL alerts).
Not verified: the Cursor transcript format. No Cursor agent transcripts exist on this laptop (~/.cursor/projects has no transcripts, ~/.cursor/chats is absent), so the parser is based on an assumed format. The Claude Code and Codex parsers follow the documented or observed public formats but haven't been run against real local logs. No real logs were read.

## Next: M7 (not started)
Update .claude-plugin manifests and keywords for 3 skills, write a suite README with per-skill GIFs, symlinks for ci-transit and agent-transit (~/.claude/skills, ~/.agents/skills -> skills/<name>), then live tests in Claude Code, Codex, and Cursor (Codex needs sandbox permission for Chromium). Blocked on user input: suite name (leaning `subway`) for the README/manifests, and permission to run agent-transit against one real local session (privacy).

## M5b agent readers validated on real sessions: done
User approved one real Claude Code session and one real Codex session. Both were parsed and rendered outside the repo (/tmp, deleted afterwards). Only counts and tool names were inspected; no log content was copied anywhere.
- Claude Code (an agent-testing session, 9 tool calls): 9/9 calls became spans, families skill/read/shell, 0 errors, 0 warnings, built twice byte-identical, MP4 rendered.
- Codex (the M5 codex exec session, 19 calls): 19/19 spans, families shell 11 / edit 8, 1 error (matches the session's single "Script failed"), 0 warnings, byte-identical, MP4 rendered. Span attrs are only agent.source/agent.wrapper.
- Cursor: no transcripts on this laptop. The reader was rewritten to the publicly documented format (no timestamps, ids, or results; ordinal timeline; turn_ended errors) and checked only against a synthetic sample.
Bugs fixed (Codex 72,901 tokens, plus hand fixes):
1. Codex 0.14x wraps tool calls in custom_tool_call "exec" with a JS snippet, so every call was landing in family "other". The inner tool is now inferred from `tools.<name>(` and the input is never stored.
2. Codex: ~70 noisy "ignored unknown" warnings per session. Known non-tool lines are now ignored silently; unknown types get one aggregated warning per type.
3. (hand fix) Error/denial detection scanned whole outputs for words like "denied" or "error", giving 3 false errors on the real Codex session. Codex now uses the output head ("Script failed", explicit denial prefix, metadata.exit_code); Claude now uses is_error only.
4. Cursor reader rewritten to the real format; find-session now finds Cursor transcripts and matches Codex sessions by session_meta.cwd (first line only).
5. Claude: Skill/TodoWrite/NotebookEdit families, silent ignore of non-message line types, isSidechain attr.
Gates: npm test, verify (MP4 identical), verify:ci, verify:agent, test:ui all pass; no SECRET_CANARY in out/.
Sources: https://docs.rs/crate/cursordump/latest/source/docs/knowledge-base.md , https://forum.cursor.com/t/richer-agent-transcripts-lifecycle-data-for-observability-langfuse-stop-hooks/166592 , https://forum.cursor.com/t/accessing-the-full-agent-transcript-in-cursor/157311 , https://www.bough.run/docs/format/codex , https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/schema/typescript/ResponseItem.ts , https://claude-dev.tools/docs/jsonl-format , https://github.com/glebmish/claude-code-replay/blob/main/docs/log-format.md
Next: M7 still blocked on the suite name.

## Branding pass: done
Rules: suite "Transit", skills `<thing>-transit`, alerts DELAY / SERVICE ALERT only, MTA disclaimer in README (b65e420). Lettered circle bullets are KEPT by user decision.
- design-system.md rewritten as a plain spec (no MTA, history, Helvetica, or "official"), then made LOCAL ONLY: removed from the index with `git rm --cached` and added to .gitignore. The file still exists on disk. SKILL.md no longer points at it; the template comment now reads "NYC-subway-style palette; colours are original."
- vocab: ci and agent alerts are now DELAY / SERVICE ALERT (test-gh updated). package.json description lists all 5 sources. Plugin SKILL.md copies regenerated.
- Gates: npm test, verify (MP4 identical to baseline), verify:ci, verify:agent, test:ui all pass.
- Note: the old design-system.md is still in public main history on GitHub; untracking only affects future commits.

## Repo rename + M7 suite packaging: done
- GitHub repo renamed israelvicars/request-transit -> israelvicars/transit (user approved); the laptop's origin remote points to the new URL. main is unchanged and suite is not pushed. GitHub description/topics are left alone until launch.
- Codex (54,324 tokens) rewrote README as the suite README (🚇 Transit, "Subway maps of your data.", 3 skill sections, install, privacy, MTA disclaimer last line), manifests (marketplace/plugin name "transit"), package name "transit", and added `npm run check` (all gates). Hand fixes: restored HANDOFF.md (Codex had dropped the branding section), and frontmatter descriptions = literal line + the original "Use when…" trigger text (Codex had cut the triggers, which agents rely on to pick skills).
- Symlinks added: ~/.claude/skills and ~/.agents/skills -> skills/ci-transit and skills/agent-transit.
- Smoke tests, run in /tmp on sample data:
  - Codex (`--sandbox workspace-write --skip-git-repo-check`, 13,445 tokens) found all 3 skills and built all 3 pages OK.
  - Claude Code (`claude -p`, $0.50, 27 turns) built all 3 pages and rendered the ci-transit MP4/GIF OK.
- `npx skills add ~/Projects/transit --list` lists all 3, and `--skill ci-transit` selects one. BUT npx skills COPIES only the skill folder, so `core/` and the shared request-transit normalize module are missing and the installed skill can't run. This conflicts with the single-shared-core decision. NEEDS USER DECISION: vendor core into generated self-contained folders (original plan) or document plugin/clone installs only.
- Gates: `npm run check` passes; MP4 identical to baseline.

## Self-contained skills (option a): done
Codex used 107,804 tokens. Source moved to src/<name>/ (git renames). `scripts/build-skills.mjs` generates committed, self-contained skills/<name>/ folders containing SKILL.md (paths relative to the folder), core/ (minus tests), src/*/adapters plus request-transit contracts, the skill's own scripts/samples/references, a minimal package.json (playwright-core) and LICENSE. `npm test` runs `build-skills --check` (full tree, bytes) and test-skill-copy.mjs (each skill copied alone builds its sample). plugin/ removed; plugin.json "skills": "./skills". The npx `skills` CLI scans <repo>/skills/ first, so that's where the generated folders live.
Edit src/, never skills/; then run `node scripts/build-skills.mjs`.
Verified: from /tmp, `npx skills add ~/Projects/transit --skill <name> -a codex -y` for each of the 3 skills individually gives a copied folder that rendered its sample to MP4 + HTML (setup installed playwright-core into the copy). `claude plugin validate .` passes. Symlinks still point at skills/<name> and work. `npm run check` passes; MP4 identical to baseline. Sizes: request 684K, ci 344K, agent 376K.

## Hop-list scroll fix: done
Root cause: in interactive mode #wrap keeps `align-items: flex-start` (needed for render mode), so #main grew to its content height (1312px) and #hops never got a bounded height. Its overflow-y:auto therefore never kicked in, and #main clipped the list. Also, the map was sized to fill (100vh - 56px), which left about 0px for the list.
Fix (core/transit.template.html CSS only, interactive mode): #main gets height:100vh, min-height:0, align-self:stretch; the map is sized to (100vh - 56px - 180px) so a ~187px list area is always visible and scrolls on its own. Render mode is untouched, so the MP4 hash is identical.
Tests: test-ui adds visible/overflow/wheel-scroll checks at 1280x800 and 1920x1080 (they fail on the old template). The click tests now map canvas coords through the CSS scale; they had assumed an unscaled 1200px canvas, which no longer holds at 1600x1000.
Note: the ci-transit list shows jobs (hops) only, not steps; that's a known follow-up.

## Published (user approved)
Smoke tests re-run: Codex 32,552 tokens, Claude Code $0.20; all 3 skills built their HTML pages. suite was fast-forwarded into main and main pushed to israelvicars/transit at 2b73a42. GitHub description and topics applied. design-system.md is not in main. Desktop examples refreshed. This note is a local commit on suite only (unpushed).

## Per-skill READMEs: done (53a69f4)
Codex used 33,338 tokens. Added src/<name>/README.md for all 3 skills (name, one-line description, 4 example prompts, `npx skills add israelvicars/transit --skill <name>`, privacy line, link to the root README). build-skills.mjs copies README.md into skills/<name>/ when it exists. Only request-transit has a GIF (docs/hero.gif via the raw main URL, so it works from the copied folder); ci/agent GIFs exist only in untracked out/, so no new binaries were added.
Hand fixes: removed a duplicated "Give it…" paragraph from each README; rewrote prompts that used the alert labels as nouns ("show the DELAY", "identify the SERVICE ALERT") into plain language; marked Cursor as experimental in agent-transit.
Gates: `npm run check` passes (build-skills --check, test-skill-copy, verifiers, test:ui, network); MP4 identical to baseline. Sizes: +~1 KB per skill (README 880-1080 bytes): request 684K→688K, ci 344K→348K, agent 376K→380K (du).

## ci-transit steps as stations + skill GIFs: done (40f242e, c0f5967)
Codex used 72,240 tokens. normalize-gh chains each job's steps (step N's parent is step N-1, first step's parent is the job), and each step gets its own station id plus ci.job / ci.step.name attrs. A CI-only VIZ_OPTS.ciStepsAsStations flag (set in core/build.mjs for gh-actions) puts a job's stations on one coloured line with step-name labels, attaches DELAY / SERVICE ALERT only to step spans, and makes the hop list show steps grouped by job. When the flag is off, request and agent output is unchanged.
Hand fixes: (1) Codex left the old hop-table header in front of the new ternary, which duplicated the request "Hops" header (caught by comparing out/ui screenshots with git stash). (2) CI alerts on the right-edge station were clipped ("SERVICE ALER"), so under the CI flag they now go below the station when x > 820.
Gates: npm run check passes; MP4 identical; the 5 out/ui PNGs are byte-identical to the pre-change commit. Contact sheet reviewed: every step is a station; the DELAY 300 s and SERVICE ALERT sit on test (node 22) / Run unit tests.
GIFs: docs/ci.gif 470,353 B and docs/agent.gif 544,601 B (sample data), linked from the skill READMEs by raw main URL; the links resolve only after main is pushed. "Steps become stations" in the README and SKILL.md is now accurate.
Still open: needs-transfers, skipped job (deploy-preview) is a single station with no train, and the THIS TRIP strip marks jobs rather than steps.

## ci-transit needs transfers, skipped jobs, CI UI test: done (25072d9)
Codex used 87,944 tokens. normalize-gh parents a job that has needs to the last step station of whichever needed job finished latest (falling back to that job's span, then to the root), so build branches off test (node 22) / Run unit tests and deploy-preview off build / Bundle application. Skipped jobs and steps are drawn as a dimmed ghost station with a "skipped" label and no train (new ci vocab key); verify's zero-duration exclusion is unchanged. The time strip gets a small tick per step. All of this is behind CI_STEPS. The sample already had needs, so it was not regenerated.
New src/ci-transit/scripts/test-ui-ci.mjs, appended to test:ui: the step list is visible, has 7 rows grouped by job, overflows and scrolls at 1280x800, and the screenshot is out/ui/ci-hops-1280x800.png.
Hand fixes: (1) test-ui-ci took process.argv[0] (node) as the page path; it now uses slice(2). (2) The hop list was sorted by start time, so the jobs interleaved; it now groups by the job's first step start, then step number.
Gates: npm run check passes; MP4 identical; the 5 request out/ui PNGs are byte-identical. docs/ci.gif regenerated (459,220 B).
Open: only the latest-finishing need is drawn, so build's other needs (lint, test (node 20)) have no transfer edge (multi-parent needs a model change). The strip's labelled markers are still per job; the step ticks sit underneath them.

## Spike: multi-parent needs transfers (branch spike/multi-needs, 93c5c11, NOT pushed)
Codex used 80,416 tokens. The layout parent stays the latest-finishing need. normalize-gh writes the other needed jobs' last stations to ci.needs.from, and under CI_STEPS the template adds extra connector calls (ciExtra) to the dependent job's station. These are left out of layering, parentsOf, VIZ.calls and trainsAt, and are exposed as VIZ.ciExtraTransfers.
Hand fixes: (1) the extra calls reused the job's spanId, so verify:ci timing was 2 off; fixed by keeping them out of VIZ.calls/trainsAt. (2) Codex targeted the job's first step, which turned Bundle application into the transfer pill; it now targets the job station, so build is the pill. Tests updated to match.
Gates: npm run check passes; MP4 identical; request UI PNGs identical. Diffstat (src/core, excluding generated skills/): 4 files, +37/-8.
Images: out/spike/before.png (main) and out/spike/after.png.
Known rough edges: the extra trains appear in the THIS TRIP strip as extra E markers at the needed jobs' end times (240 s, 600 s), and a train runs from a finished need to build even before build starts.
Recommendation: merge after one small follow-up (hide ciExtra calls from the strip markers); the change is small, gated to CI, and gate-clean.

## Multi-needs merged + rough edges fixed; root README per-skill GIFs: done (1c52bf8, 2361e58)
spike/multi-needs was fast-forwarded into suite and the local branch deleted. Hand fixes, no Codex (0 tokens): trainFor returns null for ciExtra connector calls, so no trains run on them; the strip's hops list leaves ciExtra out, so there are no extra markers; and an extra connector's start is max(need end, target start), so its line is only revealed once the target job starts. The layout parent's train is unchanged.
Root README: request/ci/agent sections link to skills/<name>/README.md on GitHub (blob/main); ci and agent sections embed docs/ci.gif and docs/agent.gif via the raw main URL (width 700). request-transit points to the hero GIF instead of repeating it.
Gates: npm run check passes; MP4 identical; request UI PNGs identical. docs/ci.gif regenerated (463,322 B).

## Footer dependency count: done (8278882)
Hand fix, 0 Codex tokens. drawFooter counts calls without ciExtra connectors, so the ci sample footer reads 12 dependencies (it was 14). Non-ci pages have no connectors, so their count is unchanged. npm run check passes; MP4 identical; request UI PNGs identical. docs/ci.gif regenerated (463,309 B). Then main was fast-forwarded to suite and pushed (user approved).

## Pre-launch exercise (2026-10-18, run on the box; the laptop was offline)
Public or self-generated data only. No employer data or accounts were used.
- ci-transit live, on public runs via the REST API. The box has no gh login, so a test shim emulated `gh run view/list --json` (/workspace/fakebin/gh, not committed). Runs used: vercel/next.js 39099529923 (Rspack dev integration tests, 36 jobs / 1708 steps / 23 failed), vercel/next.js 39082402261 (Update Font Data, 1 job, 12 steps), and nodejs/node 39098491291 via the new `--last-failed`.
  Bugs fixed:
  1. fetch.mjs had a SyntaxError (backticks inside a template literal), so the published fetch script never ran.
  2. GitHub's zero time `0001-01-01T00:00:00Z` on skipped steps made t0 year 1, so the clock read ~6e10 s. Times before 2000 now count as unset.
  3. Large runs were unreadable (1708 step stations). Above 150 steps, only failed or cancelled steps stay as stations, with a warning; `--max-steps 0` (build/render flag) shows all.
  4. New `fetch.mjs --last-failed [--workflow] [--branch]` (read-only `gh run list`), documented in SKILL.md.
  5. test-gh/test-agent hardcoded /private/tmp (macOS only); they now use os.tmpdir().
  Tests added to test-gh: zero-time steps, large-run collapse, --max-steps 0.
- Fresh install from GitHub (box, Linux): `npx skills add israelvicars/transit --skill <each>` worked, and each skill rendered its sample to HTML+GIF+MP4. Claude Code `plugin marketplace add israelvicars/transit` + `plugin install transit@transit` installed under a throwaway HOME, and the installed ci-transit built its sample.
- Adapters on public/self-made data (all built OK, one root, errors preserved):
  - OTLP: real spans from a tiny local Node OTel app (4 services, http instrumentation, OTLP/HTTP JSON to a local receiver), 12 spans, rendered.
  - Tempo v2 (hex and base64 ids) and v1 `batches`: the same real trace re-wrapped.
  - PostHog: the same trace reshaped to the documented apm-trace-get fields.
  - Datadog v1: the same trace reshaped.
  - Datadog v2: the documented SpansAttributes example values from the public OpenAPI spec.
  - X-Ray: verbatim examples from the AWS segment-document docs (embedded subsegment; plus SQL and DynamoDB fault subsegments).
- README links and images all resolve on GitHub (hero/ci/agent GIFs, skill READMEs).
- Still untested: live API fetches (Datadog/PostHog/X-Ray/Tempo) and `gh` itself (the shim emulated it); Jaeger JSON (no adapter); the macOS MP4 hash gate for these fixes, since `npm run check` must be run on the laptop.

## Pre-launch fixes landed on macOS (2026-10-18)
Applied the box patch as aba3cc0. `npm run check` passes on the laptop; MP4 identical to baseline. Real `gh` test: `fetch.mjs --last-failed` on python/cpython (39132655685, 2 jobs) and microsoft/vscode (39124548569, 38 jobs, collapsed to failed steps); both rendered. Cosmetic follow-up: label crowding on wide matrix runs.

## Exercise round 2 (2026-10-18)
- Agent readers swept across every local session, counting only (12 Claude Code, 24 Codex): all parsed, no failures. Fixed Codex family mapping: write_stdin/wait -> shell, view_image -> read, web__run -> web (known names now win over the "contains '.' = mcp" rule), and the exec-snippet inner-tool lookup skips array methods like `tools.forEach(`. 'other' dropped from 118 to 11 (request_permissions, bare exec). Test added.
- CI via real gh --last-failed: pytorch/pytorch (3 jobs), rust-lang/rust (13 jobs), python/cpython, microsoft/vscode (38 jobs, collapsed). All built.
- OTLP: the official opentelemetry-proto examples/trace.json builds (1 span; missing parent warned).
- Docker Desktop is installed, but the daemon isn't responding (`docker info` hangs), so OTel Demo/HotROD/Tempo compose were not run.
- Follow-ups: idle-gap compression for long agent sessions (609 calls over 13 h means mostly empty animation); label crowding on wide CI matrices.
- `npm run check` passes; MP4 identical.

## 2026-10-18 idle gaps, CI label crowding, Jaeger/Tempo/telemetrygen exercise: done
- Docker Desktop restarted. `docker pull` hung on the `desktop` credential helper; public pulls work with `DOCKER_CONFIG=/tmp/dockercfg` (`{"cliPluginsExtraDirs":[...]}`, no credsStore). Lightdash containers came up with Docker (user's, untouched).
- core/gaps.mjs + core/test-gaps.mjs: agent (cap 3 s) and CI (cap 20 s) maps shorten idle stretches; `--max-gap-ms N|0`. Header shows "N idle gaps shortened"; root keeps `transit.wall_ms`. Not applied to request traces. Real local sessions (counts only): Claude Code 96 s wall → 46 s, Codex 87 s → 54 s.
- Template, CI only: station labels narrowed to column spacing and placed greedily (failed first, skipped last), overlapping labels dropped (vscode 38-job run: the label pile is gone; the side list and legend still name every station).
- Template, all maps but no-op on the request sample: leaf alerts that would run off the right edge go to the left of the station on its row (HotROD, agent `shell`); max 3 markers per station + "+N more" (telemetrygen 20-error trace); niceCeil float noise fixed ("0.30000000000000004 ms of trace").
- normalize.mjs: Jaeger v2 `/api/v3/traces` (`{result:{resourceSpans}}`) auto-detected as `jaeger`; no separate Jaeger adapter needed. fetch-tempo `--find` pads trace ids to 32 hex and prints `<1ms` for omitted zero durations.
- Live: Jaeger v2.22 all-in-one + HotROD (40-span trace OK); telemetrygen → Jaeger (2001-span single trace, 3x20 error traces with links, 539 traces in one response, 12 MB attribute payload: all build <0.1 s, no page errors); Tempo 3.0 single-binary compose example (tempo+alloy+k6-tracing) + live `fetch.mjs tempo --find` and fetch-by-id. OTel Demo skipped: Docker VM 8 GB, disk 91% full. Containers removed.
- Gates: npm run check passes; OTel MP4 sha256 223590ce… and GIF bed864e9… unchanged. Agent sample film changed (gap + left-placed alert), CI sample film unchanged.
- Known, not fixed: single-service traces (telemetrygen) draw one station and an empty hop list; CI legend overflows past ~20 jobs.

## 2026-10-18 single-service traces, CI legend overflow: done
- core/build.mjs `splitSingleService`: request traces whose spans all share one service (telemetrygen, monoliths) use operations as stations: child span name with a trailing counter/id dropped ("okey-dokey-7" -> "okey-dokey"); real service kept in `service.name`; warning printed. Not applied to CI/agent. Test in core/test-gaps.mjs. telemetrygen 20-error trace now draws tg-err -> okey-dokey with 20 hops.
- Template legend: if the 13 px legend needs more than 2 rows, it switches to compact 11 px labels and ends row 2 with "+N more" (vscode 38-job run: 12 shown + "+26 more", KEY row no longer overlapped). Normal legends take the original code path.
- Gates: npm run check passes; OTel MP4 223590ce… / GIF bed864e9… unchanged; CI and agent sample films unchanged.

## 2026-10-18 OpenTelemetry Demo, live: done
- Freed ~31.8 GiB (docker builder prune -a 24.15 GB reported; npm cache ~14 GB). Docker memory could not be raised programmatically: ~/Library/Group Containers/group.com.docker is blocked by macOS privacy (ls hangs); still 8 GB. Lightdash containers stopped (not removed).
- OTel Demo (main 85c2cb2, compose.yaml + compose.observability.yaml, 25 containers) ran fine in 8 GB with Lightdash stopped. Jaeger API via http://localhost:8080/jaeger/ui/api/v3. paymentFailure flag set to 50% in the local clone's flagd file to get errors (reverted after).
- Rendered real traces: user_checkout_multi (194 spans, 12 services, valkey-cart inferred), user_checkout_single with payment SERVICE ALERT (66 spans), frontend GET (33 spans). No adapter or layout bugs. One cosmetic fix: hop table start column no-wrap ("12 ms" wrapped at 1280 px). Canvas untouched: MP4 223590ce… / GIF bed864e9… unchanged; only the hop-list UI screenshots changed (start column).
- GIFs: ~/Desktop/transit-examples/otel-demo-checkout.gif, otel-demo-payment-failure.gif. Demo stopped with compose down; images kept (58 GiB free).

## 2026-10-18 PostHog live, X-Ray from real data: done (PostHog readback blocked on key scope)
- PostHog (personal US Cloud project; region found by testing, US answers and EU rejects the project token). The OTel Demo collector got an extra `otlp_http` exporter to `https://us.i.posthog.com/i/v1/traces` through a local extras file outside the repo, with the token passed from the shell. About 54k spans were sent with 0 failures, including paymentFailure traces (flag at 50%, reverted).
- Readback could not run: `fetch-posthog-api.mjs` needs a **personal API key (phx_) with `tracing:read`** (plus `project:read` for `@current`, or set a numeric `POSTHOG_PROJECT_ID`). Project secret keys (phs_) can't hold that scope and get a 401. The script now rejects phs_ with that explanation. The tracing route is confirmed live; a successful read is still untested.
- X-Ray, no AWS account. These are the only public segment fixtures found: opentelemetry-collector-contrib `internal/aws/xray/testdata` (16 docs; all build; `segmentValidationFailed.txt` is invalid on purpose and is rejected). The LocalStack X-Ray snapshot has no segment bodies. The aws-xray-sdk-python/go/node repos and grafana/x-ray-datasource have no segment fixtures.
- Real X-Ray data: the demo collector's `awsxray` exporter (local_mode, dummy credentials) pointed at a local capture server. About 4.1k traces / 19k segment docs were captured and all normalize. Fixes:
  - Standalone `type:"subsegment"` documents (how the exporter sends every non-server span) now inherit the enclosing segment's service instead of becoming fake services.
  - Remote peers: a bare HTTP-method name uses the URL host, and gRPC `pkg.Service/Method` uses the service.
  - SDK plumbing errors (attempt/wait) fold into their aws call.
  - splitSingleService skips traces that already have a distinct peer.
- About 50 of the 19k spans are `unknown_service`: their parent segment was lost to capture timeouts.
- Desktop: `~/Desktop/transit-examples/xray-otel-demo-shipping-error.gif`.

## 2026-10-18 PostHog readback, live: done
- A personal API key with `tracing:read` read the ingested OTel Demo payment-failure traces back from US Cloud. Each was 66 spans in one page; multi-page pagination is still unexercised. The `@current` project lookup works too.
- Live shape: uppercase hex IDs, an all-zero root parent, integer kind/status_code, ISO timestamps plus `duration_nano`. **No OTel status message and no span events** are returned.
- Fixes:
  - The PostHog normalizer takes error text from attributes: `grpc.error_message`, `exception.message`, gRPC status name, HTTP status, `error.type`.
  - An innermost error span with weak text borrows the message from its same-service server span, so the alert reads "Payment request failed. Invalid token…" instead of "Error".
  - `fetch-posthog-api.mjs` also reads `POSTHOG_PERSONAL_API_KEY`, looks up the project via `@current` when `POSTHOG_PROJECT_ID` is unset (needs `project:read`), and hints at the cause on 401/403.
- Desktop: `~/Desktop/transit-examples/posthog-payment-failure.gif`.

## 2026-10-18 security and portability fixes (bake-off findings): done
- Setup never installs system packages: the brew path is gone. ffmpeg resolves from `TRANSIT_FFMPEG`, then the pinned `ffmpeg-static` 5.3.0 (package.json + lockfile, install script approved in `allowScripts`), then PATH. Otherwise setup prints the command and stops. ffprobe isn't used at all: frame counts come from ffmpeg itself (`tools.countFrames`).
- Value scrubbing (`core/scrub.mjs`), default on and safe to share. It covers names, peers, operations, status messages, attribute values, the source note and warnings:
  - emails, bearer/JWT/known-prefix tokens, `password=`/`api_key=`-style secrets
  - URL credentials and query strings, long hex, high-entropy base64, UUIDs
  - home-directory names, ARN account ids
  - the CI run title and branch (`--keep-ci-titles` to keep them)
  - `--strict`/`--share` adds IPs, internal hosts, long numeric ids and an attribute allowlist; `--no-scrub` turns it off and warns. Key redaction is broader (api-key, credential, jwt, set-cookie...).
  - Seeded-canary tests are in `core/test-scrub.mjs`.
- Bad input (missing, empty, non-JSON, JSON scalar, unrecognized) gives a one-line `transit: …` error; `TRANSIT_DEBUG=1` shows the stack. Shared parsing and errors live in `core/cli.mjs`.
- No shell strings anywhere: verify's ffmpeg gates use arg arrays and the recorded ffmpeg; child scripts run via `process.execPath`; Windows npm runs through npm-cli.js.
- No recursive deletes: `core/fsguard.mjs` removes only `NNNN.png` and the `.transit-frames` marker, then the folder if empty. It refuses the filesystem root, home, the repo root, the cwd and their ancestors, and `--name` must be a single path segment.
- Node >= 20 (`engines`, setup floor); the lockfile root name is now `transit`.
- The footer's "unmatched: no contract index" is gated by vocab (`contractFooter`), so it only appears on request pages. CI/agent headers say "idle gaps shortened, not wall-clock", and large CI runs add "failed steps only".
- The Tempo fetcher writes and prints only scheme://host:port. `user:pass@` in TEMPO_URL becomes Basic auth.
- `.github/workflows/test.yml` (written, **not pushed**: the laptop's GitHub OAuth token lacks the `workflow` scope, so the push was refused): `npm test` on Node 20 and 22, plus `npm run check` with Playwright's pinned headless shell and ffmpeg-static on ubuntu. No secrets; read-only token. It's left untracked in the laptop checkout. To push it: `gh auth refresh -s workflow`, then commit and push.
- Films: the request frames are unchanged; the MP4/GIF bytes changed only because of the pinned encoder. The CI and agent films changed (footer, header note, CI title).

## 2026-10-18 Cursor sessions from state.vscdb, one-row CI labels: done
- Cursor keeps chats in `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb` (table `cursorDiskKV`: `composerData:<id>` with `fullConversationHeadersOnly`, `bubbleId:<composer>:<bubble>` per message); no `agent-transcripts` on this laptop. Workspace → composers via `workspaceStorage/<hash>/workspace.json` + its `state.vscdb` (`composer.composerData`).
- Timestamps exist on newer builds (~Sep 2025 on): bubble `createdAt` (ISO) and, on a turn's first assistant bubble, `timingInfo.clientRpcSendTime/clientEndTime` (epoch ms). No tool end time. Each tool bubble is followed ~4-18 ms later by an empty placeholder; parallel calls arrive as bursts.
- New `src/agent-transit/scripts/export-cursor.mjs` (`--list`, `--composer ID|prefix`, `--workspace`, `--all-workspaces`, `--db`, `--out`): read-only (`sqlite3 -readonly` on the live WAL db, else `node:sqlite`), id validated before SQL, json_extract of the needed fields only; output keeps tool name, status, basename / first command word, timestamps. Never text, params or results.
- Reader (`normalize-agent.mjs`): start = createdAt; end = first bubble after the burst (300 ms), capped by the turn's clientEndTime (an upper bound, said in a warning); error → "tool error", cancelled → "cancelled"; no timestamps → uniform order-only durations. `find-session --source cursor` points at the exporter when no transcripts exist.
- Tested on 2 real sessions (97 and 122 tool calls, median 2.8 s / 4.2 s), exports kept in /tmp and deleted. Synthetic fixture `samples/cursor-bubbles-synthetic.jsonl` (real shape, canaries in text/thinking/params/results) + tests for timings, bursts, statuses, order-only fallback and exporter against a synthetic sqlite db.
- Template: leaf SERVICE ALERT markers capped to the room above the next row, "+N more" beside the last box; the contract column is hidden on CI/agent tables; scrub `key: value` rule no longer eats prose ("Cursor session: tool calls").
- CI one-row maps (all steps on one row, crowded): step labels rotated 60° up-right, one per station, cut only to the room available (full name in list/panel); "skipped" folded into the label; run/job labels stacked left; alerts start below the row's pills. Sample `src/ci-transit/samples/gh-run-one-job.json` (26 steps). Multi-row/matrix maps keep the greedy horizontal plan.
- Gates: npm run check pass; request film hash 86d08fd5fe208fb0, MP4 f4417aac… unchanged. GitHub Actions `test` run 39174142462 on ea35887: pass (test 20, test 22, check). Annotations only: actions/checkout@v4 and setup-node@v4 run forced on Node 24; ubuntu-latest moves to Ubuntu 26 from 2026-10-19.
- Examples: ~/Desktop/transit-examples/cursor-session.html, ci-one-job.html.

## 2026-10-18 Side-panel layout fix (branch fix/panel-layout, not merged, not pushed): done (785b36c, 3d3fb86)
Hand fixes, 0 Codex tokens. Root cause: in interactive mode #main was `flex: 1` (all of 100vw - 400px), but #stage was capped at `(100vh - 236px) * 4/3` to keep its 4:3 aspect above the 180px list. The canvas (title bar included) stopped there, while #controls and #hops were `width: 100%` of #main. That left a blank strip between the map and the panel: 128 / 181 / 395 px at 1280x800 / 1600x1000 / 1920x1080.
Fix (core/transit.template.html; the panel is display:none in render mode):
- #main is `flex: none; width: min(100vw - 400px, (100vh - 236px) * 4/3)`, #stage is 100% of it, and #panel is `flex: 1; min-width: 400px`. Map, controls and the hop list now share one right edge, and the panel takes the rest.
- Stat boxes are a 2-column grid (4 columns once the panel body is at least 560px, via a container query), with min-width 0 and overflow-wrap on values.
- The two timing captions under the bar are stacked. No fields were added or removed.
New core/test-ui-layout.mjs runs in test:ui for the request hero page (email hop), the ci page and the agent page at 1280x800, 1600x1000 and 1920x1080. It checks: right edges within 3px; strip before the panel ≤ 16px; panel fits; no horizontal overflow in the panel (ellipsis labels excepted); no stat text within 3px of the box edge; stat boxes ≥ 100px wide; captions on separate lines. On the old template it fails 12 checks for the email hop (edges, strip, 86px stat boxes, captions on one line); on the new one everything passes.
Gates: npm run check passes. Film hash 86d08fd5fe208fb0 and MP4 f4417aac… (pinned ffmpeg-static) are unchanged, and TRANSIT_FFMPEG=/opt/homebrew/bin/ffmpeg still gives 223590ce…. All 6 out/ui PNGs changed, as expected: every one is an interactive screenshot, and the side panel is always on screen (it shows the help when no hop is selected), so the new column widths change them all.
docs/panel.png retaken (1600x1000, email hop, 240,924 B). The README side-panel copy is still accurate and is unchanged.

## 2026-10-19 Share first (branch share-first from main 5cb514c, not merged, not pushed)
Hand-written, 0 Codex tokens. The interactive HTML is the thing to share ("Drop a trace in Slack"); GIF/MP4 are teasers.
- core/verdict.mjs: a one-line verdict computed from the trace: first error origin (error span with no error below it, earliest end; CI: steps only), `<service | job / step | tool> failed: <statusMessage, ≤100 chars> (SERVICE ALERT) after <wall time from trace start>, <N> <hops|dependencies|calls>`. N mirrors the page's call building (equals VIZ.calls.length; checked in the UI test for all three samples). Times are wall time (taken before idle-gap shortening). No alert: `no SERVICE ALERT: N hops in T`.
- Default file name when --out is absent: `out/<title head before ":" (or first 4 words)>-<service|job|tool>-service-alert.html`, `out/transit.html` if both are empty. Hero: out/checkout-email-service-alert.html; CI sample: ci-test-node-22-service-alert.html; agent sample: agent-shell-git-service-alert.html. --out unchanged; render.mjs and all npm scripts pass --out, so no gate paths moved.
- `--share`: strict scrubbing (as before), refuses --no-scrub/--scrub=off with a one-line UserError and writes nothing, prints `share: drop <path> into Slack. Suggested message: "<verdict>"`, and sets VIZ_OPTS.share = {verdict, origin}.
- Template: with VIZ_OPTS.share and no #span/?t, the page opens paused on the alert hop (the client hop whose callee is the origin), panel open, time at the origin's end so the SERVICE ALERT is drawn, under a 34px verdict line (#verdict, hidden in render mode and on non-share pages; the map width formula subtracts 34px only under html.share). An explicit #span= or ?t= still wins.
- Strict-scrub fix found on the way: --strict/--share on CI dropped ci.step.number/ci.step.name/ci.needs.from (all steps fell off the map) and scrubbed the `job-<id>-step-<n>` station names to `job-[id]-step-<n>` (merging every job's steps). Those attrs are now in STRICT_ATTRS, and a step station's service is left as is when it equals its own span id (the id is already in the page). Default-level output unchanged.
- Tests: core/test-verdict.mjs (npm test): slugs, fallbacks, hero name/verdict/23 hops, determinism, --out kept, honest no-alert line, --share --no-scrub refusal, the tip line, strict level, CI stations unchanged under --share, CI wall-time verdict. core/test-ui-share.mjs (test:ui): request/ci/agent --share pages, cold open at 1280x800 and 1600x1000: paused and stays paused, alert hop selected (email for the hero), panel shows SERVICE ALERT, verdict = console tip, verdict count = page hop count, one line above the map, shared right edge, no overflow; plain page has no verdict and autoplays.
- Copy: README intro ("Drop a trace in Slack" paragraph), two share prompts, Outputs table (HTML = the thing to share, GIF/MP4 = teasers), Privacy sentence on --share. SKILL.md steps in all three skills: build with --share, hand over path + printed verdict (with example lines), GIF/MP4 optional. Frontmatter and MTA disclaimer untouched.
- Gates: npm run check passes; film hash 86d08fd5fe208fb0 and MP4 f4417aac… unchanged; CI/agent film hashes bc99ed7f1383961f / 438aeb2330442321 same as main (stash); all 6 out/ui PNGs byte-identical to main.
- Open (resolved 2026-10-20, see below: verdict now fits at 1280 with no double parentheses): 1280-wide pages ellipsize the hero verdict line; hop list under the map doesn't scroll to the selected hop on open (pre-existing select behavior); the verdict repeats parentheses when the message ends in one ("(SMTP timeout) (SERVICE ALERT)").

## 2026-10-20 Short verdict + phones (share-first, not merged, not pushed)
Hand-written, 0 Codex tokens.
- Verdict form `<subject> failed after <t>: <cause> · SERVICE ALERT · <n> <hops>` (core/verdict.mjs shortReason: trailing parenthetical cause, else the last clause of a long message, cut at a word boundary to 40 chars, dropped when it only repeats the station name). Full message stays in the panel and the verdict tooltip (VIZ_OPTS.share.message). Samples: `email failed after 671 ms: SMTP timeout · SERVICE ALERT · 23 hops`; `test (node 22) / Run unit tests failed after 6 min · SERVICE ALERT · 12 dependencies`; `shell · git failed after 12.0 s: denied · SERVICE ALERT · 18 calls`. test-ui-share now requires no ellipsis at 1280x800 and 1600x1000 for all three.
- Phones (inspection with Playwright isMobile/hasTouch/DPR 3 at 393x852, 375x667, 360x800, 852x393; captures in /workspace/share/mobile on the box). Before: no viewport meta, so phones laid the page out at 980 px and zoomed to ~0.4 (map 213-233 px wide, controls 12-30 px tall, close button 10x11 px), the 400 px panel always took 40% and listed keyboard shortcuts, a tap had a ~5 px hit radius (near misses toggled play), font boosting enlarged only the hop table, verdict cut in landscape, landscape panel covered 3/4 of the screen.
- Fixes (template, interactive only; render mode and desktop CSS untouched): viewport meta + text-size-adjust 100%; under 700 px wide: page scrolls, map full width, verdict wraps, controls wrap with 44 px targets, panel hidden until a hop is selected then a bottom sheet sized to start under the map (min 42% of the screen), 44 px close button and panel links, help box fits; phone landscape (coarse pointer, ≤500 px tall): map fits the height, panel is a right drawer (≤50vw) only while selected; touch devices: nearest station within ~22 CSS px wins a tap, empty panel says "Tap a station, train or line" with no shortcut table (html.sel class toggled in renderPanel, never in render mode).
- New core/test-ui-mobile.mjs (test:ui): request/ci/agent, plain and --share, 393x852 and 360x800: device-width layout with no horizontal overflow, map spans the width, controls/close ≥ 40 px, no kbd hints, share verdict wraps, share sheet shows SERVICE ALERT with the alert station above the sheet, a tap 8 px off a station selects it, close hides the sheet. On the pre-fix template: 110 failures; now all pass.
- Gates: npm run check passes; film hash 86d08fd5fe208fb0, MP4 f4417aac… and GIF/contact sheet bytes unchanged; CI/agent film hashes bc99ed7f1383961f / 438aeb2330442321 unchanged; out/ui PNGs identical to main. Note: ci-hops-1280x800.png once came out different during a loaded `npm run check` (frame 7 vs 6: test-ui-ci screenshots an autoplaying page by wall clock); four reruns gave the main hash. Pre-existing flake.
- Deferred: map labels are still ~4-5 px on a phone (the 1200x900 stage scaled to 393 px; pinch zoom works because the viewport does not disable it, but a phone-specific map layout is a design task); hop table scrolls sideways inside its box on phones (no column priority yet); CI panel title shows the station id (job-240103-step-2) instead of the step name (desktop too); not verified: the real Slack iOS webview (safe areas, its own toolbar height vs 100dvh, whether it allows pinch zoom, file:// vs blob URL behaviour, history.replaceState), real pinch gestures (Playwright has no pinch API), iPad split view.

## 2026-10-20 Review fixes before merge (share-first -> main)
Hand-written, 0 Codex tokens. From the final technical review; approved sample names and verdicts unchanged.
- No silent overwrite (core/build.mjs): without --out, an existing default file is left alone and the build writes `<name>-2.html`, `-3`, ... An explicit --out still overwrites, as before.
- No leading hyphen (core/verdict.mjs defaultName): empty slug parts (e.g. CJK-only title/subject) are dropped; an alert with nothing nameable is `transit-service-alert.html`; names always start [a-z0-9].
- One output folder: builds without --out now write to `./transit-out/` (same folder as the render teaser in SKILL.md), not `./out/`. Updated the build.mjs header and usage line (stale: it lacked --share and pointed at out/), the three SKILL.md build steps, and .gitignore (transit-out/). The 2026-10-19 entry above still says out/; that was the state then.
- No 'undefined' in CI verdicts: a step without `ci.job` uses its station (`s.service`) as the job, or just the step name if they match.
- README: one install line before "## Example prompts" (separate commit).
- Tests (core/test-verdict.mjs): CJK/empty slugs never give a leading hyphen; missing ci.job gives no "undefined"; collision gives -2 then -3 with the existing file untouched; explicit --out still overwrites; default dir is transit-out/.
- Noticed, not changed: a count of 1 still reads "1 dependencies" / "1 hops" (no singular noun in vocab).

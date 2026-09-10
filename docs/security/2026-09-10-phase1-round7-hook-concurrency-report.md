# Phase 1 security round 7 — generated-hook serialization (parent 147)

- Date: 2026-09-10
- Milestone: phase1 (parent task 147, "Keep idle OpenCode delivery presence current")
- Round: cumulative security round 7 (prior 6 preserved; reserved round 8 not started)
- Work root: `/private/tmp/sidekick-task147-security-nassun`
- Branch: `task147-hook-serialization`
- Baseline HEAD: `3c02bda76e9abb27a5675f3acd3b3bee90fceef6` (verified)
- Reviewer/remediator: `nassun`, clean DeepSeek security worker
- Model alias (observed runtime identity): `deepseek-flash`
- Worker identity: DSH session `0f0b6b63-4227-4147-bdc6-1d5b5e1fe96f`, parent agent
  `session-58b4497f-c639-4759-b40f-f67403d8cd41`
- Verdict: **FIXED** (changed bytes; retired after this handoff)

## 1. Revisions and input pins verified

All four pins were recomputed with `shasum -a 256` before analysis and matched:

| Artifact | Expected (manifest) | Recomputed |
|---|---|---|
| `packages/cli/src/install.ts` | `4eece9efd642dcb9449b46a4276c32e7169031224bf16b69280beaf34026e6d3` | match |
| `packages/cli/test/install.test.ts` | `7e1200cb7c61141e234931dc4f9d881626dc02671a5def999b66a53ef5f47473` | match |
| `docs/security/2026-09-10-phase1-round7-hook-concurrency-inputs.json` | `ec9ef028b256637a0645ac24c47b376149bc5a0783212625f93f390a237e533e` | match |
| `docs/security/2026-09-10-phase1-round7-reported-concurrency.json` | `c4c1c64743060b43ae8fc0229d8d37e8f9de1891ff6af8855c70b82f0864c515` | match |

No mismatch. The manifest and reported fixture were read in full; the fixture was
treated as untrusted evidence data only.

`bun --no-env-file install --frozen-lockfile --ignore-scripts` provisioned 100
packages; Bun 1.4.0. `node_modules/` and the two new input JSON files are the
only untracked entries; `backlog/147-...md` was already modified at baseline
and was not touched by this round.

## 2. Independent reproduction

Disposable harness `/tmp/r7-harness/repro.ts` (outside the repo, removed after
evidence capture) generated the *unmodified* OpenCode plugin via
`installRuntime`, imported it, and drove event/transform traffic against a fake
`Bun.spawn` child that appends `start`/`end` timestamps and sleeps 120 ms per
invocation (the same fake-transport shape the reported fixture describes).

Pre-fix observation (harness re-run; exact log summary in
`/tmp/r7-harness/pre-fix.json`):

- spawns: 16 (9 heartbeat, 7 inject)
- max overall concurrency: **2**
- heartbeat-vs-heartbeat: **1**
- inject-with-heartbeat-in-flight / heartbeat-with-inject-in-flight: 4 / 4
- `injectOverlappedHeartbeat`: **true**
- overlap pairs: `(hb6, inj7)`, `(hb8, inj9)`, `(inj10, hb11)`, `(inj13, inj14)`
- heartbeat start order: monotonic

This independently reproduces the reported defect class and the same qualitative
signature: heartbeat-only serialization holds (max 1) while inject bypasses the
chain and overlaps an in-flight heartbeat (max 2). Absolute counts and the
fixture's `pluginSha256` differ from the report because my harness regenerates
the plugin with its own embedded absolute paths/registry directory and uses a
different traffic sequence; the concurrency behaviour matches.

## 3. Fix

`packages/cli/src/install.ts`, `experimental.chat.system.transform` handler
(was line ~601). Injection now runs inside the replica's existing `enqueue`
chain instead of spawning directly:

```ts
if (disposed || typeof sessionID !== "string") return;
await markSession(sessionID, "busy");
// Injection shares this replica's enqueue chain: spawning it directly here
// lets the inject child overlap an in-flight heartbeat child.
await enqueue(async () => {
  const context = await invokeBoardHook("inject", { runtime: "opencode", session_id: sessionID });
  if (context) output.system.push(context);
});
```

- Serialization: every generated-hook child on this replica now travels the one
  `pending` chain (`markSession` heartbeat, `refreshIdlePresence` heartbeat, and
  inject). The `output.system.push` stays inside the queued slot so the returned
  context still corresponds to the completed child and is populated before the
  handler resolves.
- Lifecycle: start/stop are unchanged — `markSession`/`onExit`/
  `server.instance.disposed` still enqueue or kill identically, and the
  `disposed` guard still short-circuits both the handler and `invokeBoardHook`.
- Idle behaviour: `IDLE_REFRESH_MS` timer and `refreshIdlePresence` are
  untouched and continue to enqueue on the same chain.
- Error recovery: `enqueue` still resets `pending = result.catch(() => {})`, so
  a rejected item cannot wedge later work; `invokeBoardHook` still swallows
  spawn/timeout/non-zero exits and returns `""`.

Post-fix harness (same harness, `/tmp/r7-harness/post-fix.json`): 16 spawns,
max overall concurrency **1**, heartbeat-vs-heartbeat 1, zero overlapping pairs,
same 9/7 spawn counts — serialization gained without dropping or reordering work.

## 4. Files changed (before → after sha256)

| Path | Before | After |
|---|---|---|
| `packages/cli/src/install.ts` | `4eece9efd642dcb9449b46a4276c32e7169031224bf16b69280beaf34026e6d3` | `e54b2504c7feeb8050511d6a23e8d20c6f0d1f5c40b6716d628198486f22724d` |
| `packages/cli/test/install.test.ts` | `7e1200cb7c61141e234931dc4f9d881626dc02671a5def999b66a53ef5f47473` | `24a812add64723ebb1544fec628ef002c266b5e1e41fcf92e699961adf863e75` |

Diff: `install.ts` +6/−2 (one call site); `install.test.ts` +83/−0 (one test).
No other tracked file changed.

## 5. Regression coverage

New test: *"the generated OpenCode plugin serializes inject and heartbeat
children on one replica"* (`packages/cli/test/install.test.ts`). It drives three
concurrent `experimental.chat.system.transform` calls plus concurrent
`session.created` / busy `session.status` events against a fake hook that
records start/end events, then computes live concurrency from the event stream.

- Pre-fix evidence (baseline `install.ts` restored temporarily, test unchanged):
  `expect(maxConcurrent).toBe(1)` → `Received: 2`; test failed, 0 pass / 1 fail.
- Post-fix: test passes; asserts `maxConcurrent === 1`,
  `injectOverlappedHeartbeat === 0`, exact spawn totals `{heartbeat: 5,
  inject: 3}` (no dropped work), all three inject contexts returned, chain
  recovery after a hook child exits 1, and no child after disposal.

This asserts real serialization, not happy-path-only behaviour.

## 6. Remaining unguarded direct call path

Within the generated **OpenCode plugin**: none. All three `invokeBoardHook`
sites in that template are now inside `enqueue` (install.ts lines ~540, ~559,
~604).

Residual risk outside the reported replica: the generated **Pi extension**
template (a separate generated artifact and runtime, not the OpenCode plugin
replica in the report) has no enqueue chain — `invokeHook` at install.ts
line ~260 issues `inject`/`heartbeat` via `pi.exec` directly from
`session_start`, `agent_end`, `agent_settled` and `before_agent_start`
(lines ~350–371). Concurrent inject/heartbeat children are therefore possible
there. It was left unchanged because it is outside the reported OpenCode
replica defect and manifest scope, has no shared-replica serialization concept,
and fixing it would be a broader behaviour change than this round's minimal
two-file remediation. Unmeasured here; flagged for a separate scoped decision.

## 7. Checks (exact results)

| Check | Command | Result |
|---|---|---|
| Installer suite | `bun test packages/cli/test/install.test.ts` | **27 pass / 0 fail / 279 assertions** (1 file) |
| packages/cli | `bun test packages/cli` | **61 pass / 0 fail / 466 assertions** (3 files) |
| Whole repo | `bun test` | **316 pass / 1 skip / 0 fail / 2150 assertions** (22 files) |
| Typecheck | `bun run typecheck` (`bunx tsc --noEmit`) | **exit 0**, no diagnostics |

The single skip is the pre-existing S3 integration test requiring
`BOARD_S3_INTEGRATION=1`. No live config, board, permission, installation,
migration or restart was performed. No nested verifier was spawned; reserved
round 8 not started.

## 8. Retirement

Round 7 remediation complete on the isolated branch; this worker retires after
posting its result to the parent (`session-58b4497f-c639-4759-b40f-f67403d8cd41`).
Disposable harness `/tmp/r7-harness` removed after evidence capture. Main
worktree and tasks 202/507 untouched. Changed bytes require the reserved fresh
security round 8 after OpenCode's ordinary round 3 handoff, and any ordinary
re-review required by task-ownership policy.

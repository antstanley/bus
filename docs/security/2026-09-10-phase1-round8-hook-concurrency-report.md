# Phase 1 security round 8 — verification of round-7 hook-concurrency remediation (parent 147)

- Date: 2026-09-10
- Milestone: phase1 (parent task 147, "Keep idle OpenCode delivery presence current")
- Round: cumulative security round 8 (rounds 1–7 and ordinary round 3 preserved; no round 9 exists)
- Work root: `/private/tmp/sidekick-task147-security-nassun`
- Branch: `task147-hook-serialization`
- Baseline HEAD: `3c02bda76e9abb27a5675f3acd3b3bee90fceef6` (verified, no rebase)
- Reviewer/remediator: `nassun`, clean DeepSeek security worker
- Model alias (observed): `deepseek-flash` (harness-reported runtime identity; no `DSH_MODEL` env var is exposed)
- Worker identity: DSH session `7858c781-805d-49ee-83c7-4adcb7fc5df9`, parent agent
  `session-58b4497f-c639-4759-b40f-f67403d8cd41`
- Verdict: **CLEAN NO-CHANGE PASS** (no bytes changed; this worker retires after handoff)

## 1. Pins and revisions verified

All scope pins were recomputed with `shasum -a 256` before analysis and matched the
round-8 inputs manifest and this round's instruction:

| Artifact | Expected | Recomputed |
|---|---|---|
| `packages/cli/src/install.ts` | `e54b2504c7feeb8050511d6a23e8d20c6f0d1f5c40b6716d628198486f22724d` | match |
| `packages/cli/test/install.test.ts` | `24a812add64723ebb1544fec628ef002c266b5e1e41fcf92e699961adf863e75` | match |

Baseline HEAD `3c02bda76e9abb27a5675f3acd3b3bee90fceef6` matched exactly; the branch is
`task147-hook-serialization`; the shared main worktree was not touched. Untracked
round-7 inputs/report/fixture were read as read-only context; the reported fixture
`docs/security/2026-09-10-phase1-round7-reported-concurrency.json` hashes to
`c4c1c64743060b43ae8fc0229d8d37e8f9de1891ff6af8855c70b82f0864c515`, matching the
round-7 manifest, and was treated strictly as untrusted evidence data.

Note: `docs/security/2026-09-10-phase1-round8-hook-concurrency-inputs.json`
(`59eeb74de186d9d7ba5a4beb2aaa07aea724c07d08efcdbacbeb39c5ddb27428`) names
`...round8-hook-concurrency-report.md` as `report_path`; this report is written to the
instruction-mandated `...round8-hook-concurrency-verification.md` instead. Flagged for the
parent; no other artifact was written.

## 2. Shared enqueue chain — proven on the generated artifact

Not merely a wrapper: I generated the actual plugin via `installRuntime` into a
disposable `/tmp` fixture and inspected the emitted `board.ts` (8779 bytes):

- `Bun.spawn` occurrences: **1** — only at generated line 77, inside `invokeBoardHook`.
  No direct unguarded spawn of an inject or heartbeat child remains in the plugin.
- `let pending` declarations: **1** (line 108); `function enqueue(` definitions: **1** (line 110).
  There is exactly one pending chain per plugin/replica instance.
- `invokeBoardHook` definitions: **1**; call sites: **3**, all inside a single `await enqueue(`
  opener:
  - line 155 `heartbeat` (from `markSession`) inside `enqueue` @151
  - line 174 `heartbeat` (from `refreshIdlePresence`) inside `enqueue` @171
  - line 219 `inject` (from `experimental.chat.system.transform`) inside `enqueue` @218

The fourth `await enqueue(` site (line 137, `forgetSession`) performs only the registry
`unlink`, no hook child. Source confirmation: template spans `install.ts` 386–611; the
`invokeBoardHook` sites are 540, 559, 604 and the sole `pending`/`enqueue` are 493/495.
The `pi.exec`/`invokeHook` sites (260–367) are the Pi extension template (236–373), out of
scope and untouched.

## 3. Round-7 regression test is genuine (scratch-copy experiment)

Scratch copy outside the work root: `git -C <work> archive HEAD | tar -x -C /tmp/r8-scratch`
(baseline `install.ts` == `4eece9ef…`, the pre-fix hash), then copied only the new test file
(`24a812ad…`) over it and symlinked `node_modules`. The work root was never modified; I only
copied files out.

- Pre-fix command: `cd /tmp/r8-scratch && bun test packages/cli/test/install.test.ts`
  → **fail**: *"the generated OpenCode plugin serializes inject and heartbeat children on one
  replica"*, `expect(maxConcurrent).toBe(1)` → **Received: 2**; 26 pass / 1 fail / 273 assertions.
- Fixed bytes: `cp <work>/packages/cli/src/install.ts /tmp/r8-scratch/…` (recomputed
  `e54b2504…`), same command → **27 pass / 0 fail / 279 assertions**.

The test therefore fails on the un-fixed source and passes on the pinned fixed bytes.

## 4. Lifecycle, idle refresh, error recovery

- **Lifecycle**: `markSession`, `onExit`, `stopTimer`, the `disposed` short-circuit in the
  transform handler (line 599) and the `disposed` guard at the top of `invokeBoardHook`
  (line 458) are unchanged. After `server.instance.disposed`/`global.disposed`, queued
  inject work reaches `invokeBoardHook`, which returns `""` without spawning; no
  `output.system` push occurs. The test's disposal assertion (no new captured child rows)
  passes.
- **Idle refresh**: `IDLE_REFRESH_MS` (45_000), `refreshIdlePresence`, the `refreshingIdle`
  coalescing guard and `lastRefresh` accounting are untouched and enqueue on the same chain.
- **Error recovery**: `enqueue` still sets `pending = result.catch(() => {})`, and
  `invokeBoardHook` swallows spawn/timeout/non-zero exits returning `""`. The test's
  "flaky heartbeat exits 1, then a later inject still returns its context" path passes.

## 5. New-defect analysis (none confirmed)

- **Reentrancy**: no queued work calls `enqueue`; `markSession`/`forgetSession`/
  `refreshIdlePresence`/inject bodies only call `registerLocalSession`, `invokeBoardHook`,
  `unlink`. No nested acquisition.
- **Deadlock**: the chain tail is `pending.then(work)`; every `work` settles (10 s spawn
  timeout + `proc.kill()`), and `refreshingIdle` is reset in a `finally`. No self-await.
- **Unbounded growth**: the chain is a single promise tail reassigned each enqueue, not an
  array; settled links are collectable. Queue depth is bounded by concurrent session activity,
  and idle refresh coalesces all due sessions into one item.
- **Ordering to `output.system`**: the push now happens inside the queued slot, still before
  the handler resolves, so each transform call still receives its own context; the new test
  asserts all three outputs exactly.
- **Changed caller contract (intended, not a defect)**: concurrent injects on one replica are
  now serialized, and each transform enqueues a `busy` heartbeat before its inject. Under
  contention, worst-case `system.transform` latency can include queued-predecessor time
  (each child capped at 10 s). This is the mandated serialization property, not a new bug;
  noted as residual latency tradeoff for the lead.

## 6. Re-run checks (exact results)

| Check | Command | Result |
|---|---|---|
| Installer suite | `bun test packages/cli/test/install.test.ts` (scratch, fixed bytes) | **27 pass / 0 fail / 279 assertions** |
| packages/cli | `bun test packages/cli` | **61 pass / 0 fail / 466 assertions** (3 files) |
| Whole repo | `bun test` | **316 pass / 1 skip / 0 fail / 2150 assertions** (22 files) |
| Typecheck | `bun run typecheck` (`bunx tsc --noEmit`) | **exit 0**, no diagnostics |

The single skip is the pre-existing S3 integration test requiring `BOARD_S3_INTEGRATION=1`.
Bun 1.4.0. No live settings, credentials, board, permission, installation, migration or restart
was touched; no Pi extension analysis, edit or activation; no nested worker or verifier spawned.

## 7. Files changed

**No bytes changed.** `git diff --numstat HEAD` remains `install.ts` 6/2 and
`install.test.ts` 83/0; both pinned hashes are still `e54b2504…` and `24a812ad…`. The only
tracked modifications in the work root remain those two files plus the pre-existing baseline
`backlog/147-…md` edit; the only untracked files are the round-7 inputs/report/fixture and the
round-8 inputs manifest.

## 8. Retirement

Clean no-change pass on the isolated branch. Disposable scratch fixtures `/tmp/r8-scratch`
and `/tmp/r8-gen` were removed after evidence capture. This worker retires after posting its
result to the parent (`session-58b4497f-c639-4759-b40f-f67403d8cd41`). Because no bytes
changed, no further delta verification is required; rounds 1–8 stand, no round 9 exists, and
the Pi extension observation remains open, unmeasured and separately scoped.

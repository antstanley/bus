# Phase 1 security round 10 — Pi extension hook-child serialization delta verification (parent 150)

- Date: 2026-09-11
- Milestone: phase1 (parent task 150, "Pi adapter shared-replica hook child serialization")
- Round: cumulative security round 10 (verification of the round-9 fixed bytes; rounds 1–9 preserved)
- Work root: `/private/tmp/sidekick-task150-security-nassun`
- Branch: `task150-pi-hook-serialization` (no rebase)
- Baseline HEAD: `f91723627ccf0a96af897a2512ab555dabfb1d02` (verified; contains the round-7 OpenCode serialization fix)
- Reviewer/verifier: `nassun`, clean DeepSeek security worker
- Model alias (observed runtime identity): `deepseek-flash` (the runtime exposes no version variable)
- Worker identity: DSH session `9b37a1c4-4ef2-440b-9e3e-7f2d031dbbe0`, parent agent
  `session-58b4497f-c639-4759-b40f-f67403d8cd41`
- Verdict: **CLEAN NO-CHANGE PASS** (no bytes changed; retired after this handoff)

## 1. Revisions and input pins verified

Both writable-path pins were recomputed with `shasum -a 256` before analysis and matched the
round-10 inputs manifest and this round's instruction. Baseline HEAD matched exactly; the branch
is `task150-pi-hook-serialization`; the shared main worktree `/Volumes/Delorean/code/sidekick/tmp`
and every other reserved worktree were never touched. The manifest was read in full and its
`report` field is the exact path of this file.

| Artifact | Expected (manifest) | Recomputed |
|---|---|---|
| `packages/cli/src/install.ts` | `76487b3475bd4eb3d482ece5ceaf832c06f0a2615b81ca026f817d2190a223ab` | match |
| `packages/cli/test/install.test.ts` | `981766fa7b58cda907efaf0090d2aacd4c4f583864d034e49aa66e76ac716ce3` | match |

No mismatch. The R9 before/after chain is consistent: baseline `git show HEAD:…/install.ts`
hashes to `e54b2504c7feeb8050511d6a23e8d20c6f0d1f5c40b6716d628198486f22724d` and the frozen
working-tree bytes to `76487b34…`.

## 2. Pi serialization on the generated artifact (independent proof)

Disposable harness `/tmp/r10-pi-harness/repro.ts` (outside the repo, removed after capture) called
`installRuntime({ runtime: "pi", … })` to generate the extension into a temporary home, inspected
the emitted `~/.pi/agent/extensions/board.ts`, imported it, and drove it through a fake
`ExtensionAPI` whose `exec` records real start/end events with asymmetric sleeps (heartbeat 150 ms,
poll 100 ms, inject 60 ms) — a disposable transport, no real Pi configured.

Generated-artifact text evidence: the emitted file contains exactly 3 `pi.exec(` call sites; 2 are
`enqueue(() => pi.exec(` (the `invokeHook` path used by `inject`/`poll`/`heartbeat`, and the direct
`heartbeat` child), and the per-instance declaration
`let pending: Promise<unknown> = Promise.resolve();` is present. The single non-enqueued site is
`invokeCli` (the `board_post`/`board_read`/`board_who` tools), which invokes the CLI, not a hook
child, and is deliberately out of scope as in R9. Every `[hookPath, …]` spawn is enqueued.

Adversarial live run — `session_start`, then 4 heartbeat events, 4 concurrent `before_agent_start`
injects and 3 poll ticks fired together:

- `maxConcurrent: 1`, `crossCommandOverlaps: 0`
- totals `{ heartbeat: 4, inject: 4, poll: 1 }` — no dropped hook work; the 3 same-tick polls
  coalesce to 1 via the unchanged `polling` flag, exactly as before
- inject stdout still maps to `{ message: { customType: "board", content: "injected board context", display: true } }`

So all inject/heartbeat/poll children travel one per-instance `pending` chain; no two generated Pi
hook children can overlap on one replica. The fix is real and effective on the artifact, not only in
source.

## 3. Regression test: pre-fix failure and fixed pass (scratch copy)

A scratch clone was made at `/tmp/r10-scratch` (`cp -Rc` of the work root, `.git` removed); the work
root was never used for the experiment. Only the pre-fix Pi behaviour was restored by overwriting
`packages/cli/src/install.ts` with `git show HEAD:packages/cli/src/install.ts` (verified
`e54b2504…`), leaving the fixed test (`981766fa…`).

| Scratch `install.ts` | Command | Outcome |
|---|---|---|
| pre-fix `e54b2504…` | `bun test packages/cli/test/install.test.ts` | **FAIL** — `expect(maxConcurrent).toBe(1)` → `Expected: 1, Received: 3`; **27 pass / 1 fail** |
| fixed `76487b34…` | `bun test packages/cli/test/install.test.ts` | **PASS** — **28 pass / 0 fail** |

The test genuinely detects the defect (overlap of 3 children), and passes on the frozen bytes.

## 4. OpenCode serialization fix preserved exactly

`function openCodePlugin(` … `export function renderInstallDiff(` was extracted with the same
boundary used in R9 from `git show HEAD:…` and from the frozen working tree and compared with `cmp`:
**byte-identical**. The 237-line extraction hashes to the R9-recorded
`4bc8003d14e94509be9382c10a37ce619e136dd760742ff38716bfee0005b6d9`; including the trailing
`renderInstallDiff` line (238 lines) both sides hash to
`f7ebc58d2e91907484b96ccabaf53eda8eb86f37e8db855539bd9c6a2746f85a`. The `git diff` hunks fall only
at baseline lines 259–271 and 332–339, both inside the Pi template; `git diff --name-only` reports
exactly the two scoped files. Every other generated artifact (Claude, Codex, Letta, Gemini, Cursor,
MCP) is untouched.

## 5. Cumulative lifecycle / error-recovery / queue findings

- **Lifecycle/idle:** `session_start` awaits the queued heartbeat before arming the unchanged 5 s
  timer; `session_shutdown` clears it; `timer.unref?.()` still applies. Idle gating (`ctx.isIdle`)
  and the `polling` coalescing flag are unchanged.
- **Ordering:** `agent_end` → `working` then `agent_settled` → `idle` now execute in FIFO call order
  through the single chain, so a settled `idle` beat can no longer win over an in-flight `working`
  beat.
- **Error recovery:** `pending = result.catch(() => {})` keeps the chain alive after a rejected
  `pi.exec`, while the returned promise still rejects to the awaiting caller exactly as before
  (verified: a rejected heartbeat rejects its handler and a later inject still returns).
- **Reentrancy/deadlock:** no enqueued `work` re-enters `enqueue`, so the chain cannot self-wait;
  confirmed by inspecting the generated artifact and the two enqueued sites.
- **Unbounded growth:** event handlers await their queued child, providing back-pressure; each child
  carries the existing 10 s timeout. No accumulation path beyond the intended serialization.
- **Caller contract:** inject output mapping, tool contracts, heartbeat signature and the OpenCode
  `enqueue`/idle-refresh batching are unchanged; only overlap is removed.
- **No new defect confirmed** in either the Pi or OpenCode path.

## 6. Files changed

**No bytes changed** by this round. Frozen pins after all analysis:

| Path | sha256 |
|---|---|
| `packages/cli/src/install.ts` | `76487b3475bd4eb3d482ece5ceaf832c06f0a2615b81ca026f817d2190a223ab` |
| `packages/cli/test/install.test.ts` | `981766fa7b58cda907efaf0090d2aacd4c4f583864d034e49aa66e76ac716ce3` |

`git status --short` shows only the two intended round-9 modifications plus the provided
input/report/backlog documents; scratch dirs live outside the repo.

## 7. Checks (exact results)

| Check | Command | Result |
|---|---|---|
| Installer suite | `bun test packages/cli/test/install.test.ts` | **28 pass / 0 fail / 285 assertions** (1 file) |
| packages/cli | `bun test packages/cli` | **62 pass / 0 fail / 472 assertions** (3 files) |
| Whole repo | `bun test` | **317 pass / 1 skip / 0 fail / 2156 assertions** (22 files) |
| Typecheck | `bun run typecheck` (`bunx tsc --noEmit`) | **exit 0**, no diagnostics |

The single skip is the pre-existing S3 store-conformance test requiring
`BOARD_S3_INTEGRATION=1`; it is not Pi- or OpenCode-related. Bun 1.4.0. No live settings,
credential, board, permission, installation, migration, operational pin or restart was touched;
no real Pi was activated or configured; no nested worker or verifier was spawned; no rebase; no
other reserved worktree was accessed.

## 8. Retirement

Round 10 verification produced no byte changes, so a clean no-change pass ends the cycle. Disposable
scratch `/tmp/r10-pi-harness` and `/tmp/r10-scratch` were removed after evidence capture. This
worker retires after posting its result to the parent
(`session-58b4497f-c639-4759-b40f-f67403d8cd41`). No security round 11 exists.

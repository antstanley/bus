# Phase 1 security round 9 — Pi extension hook-child serialization (parent 150)

- Date: 2026-09-10
- Milestone: phase1 (parent task 150, "Pi adapter shared-replica hook child serialization")
- Round: cumulative security round 9 (prior rounds 1–8 preserved; reserved round 10 not started)
- Work root: `/private/tmp/sidekick-task150-security-nassun`
- Branch: `task150-pi-hook-serialization` (no rebase)
- Baseline HEAD: `f91723627ccf0a96af897a2512ab555dabfb1d02` (verified; contains the round-7 OpenCode serialization fix)
- Reviewer/remediator: `nassun`, clean DeepSeek security worker
- Model alias (observed runtime identity): `deepseek-flash` (the runtime exposes no version string; no `DSH_MODEL`/version variable is set)
- Worker identity: DSH session `2ba388c9-ab4f-46a6-907a-5f1aa69cc7e2`, parent agent
  `session-58b4497f-c639-4759-b40f-f67403d8cd41`
- Verdict: **FIXED** (changed bytes; retired after this handoff)

## 1. Revisions and input pins verified

Both writable-path pins were recomputed with `shasum -a 256` before analysis and matched the
round-9 inputs manifest and this round's instruction. Baseline HEAD matched exactly; the branch
is `task150-pi-hook-serialization`; the shared main worktree was never touched.

| Artifact | Expected (manifest) | Recomputed |
|---|---|---|
| `packages/cli/src/install.ts` | `e54b2504c7feeb8050511d6a23e8d20c6f0d1f5c40b6716d628198486f22724d` | match |
| `packages/cli/test/install.test.ts` | `24a812add64723ebb1544fec628ef002c266b5e1e41fcf92e699961adf863e75` | match |

No mismatch. The manifest was read in full and its `report_path` is the exact path of this file.
`bun --no-env-file install --frozen-lockfile --ignore-scripts` provisioned 100 packages; Bun 1.4.0.

## 2. How the generated Pi extension issues its hook children

The Pi template (`piExtension`, `install.ts`) issues every board hook as a `pi.exec` child process:

- `invokeHook(command, sessionID)` calls `pi.exec(executable, [hookPath, command, …])` directly —
  used by `poll` and by `before_agent_start` (`inject`).
- `heartbeat` calls `pi.exec(executable, [hookPath, "heartbeat", …])` directly.
- `session_start` awaits a heartbeat, then starts `setInterval(() => { void poll(ctx); }, 5_000)`.
- `agent_end` → heartbeat `working`; `agent_settled` → heartbeat `idle`;
  `before_agent_start` → `inject`.

There is no queue, promise chain or mutex; the `polling` flag only serializes polls against each
other. Confirmed by source: the template spans `install.ts` 236–383; `enqueue` appears nowhere in it.

## 3. Independent reproduction

Disposable fixture `/tmp/r9-pi-harness/repro.ts` (outside the repo, removed after capture) generated
the *unmodified* extension via `installRuntime({ runtime: "pi", … })` into a temporary home, imported
the emitted `board.ts`, and drove it through a fake `ExtensionAPI` whose `exec` records real
`start`/`end` events and sleeps 120 ms per child (disposable fake transport; no real Pi configured).

The traffic order models the real runtime, established from upstream `earendil-works/pi`
`main` `d12cd92e45e308d4af000554292165ef1984253b`:

- `packages/coding-agent/src/core/agent-session.ts` 625–632: `_emitAgentSettled()` sets
  `_isAgentRunActive = false` **before** `await extensionRunner.emit({ type: "agent_settled" })`.
- `agent-session.ts` 916–917: `get isStreaming()` is exactly `_isAgentRunActive`, and `prompt()`
  only queues while streaming, so a prompt submitted in that window proceeds to
  `emitBeforeAgentStart()` (line 1286) — `before_agent_start` — while the settled heartbeat child is
  still in flight. The 5 s poll timer is independent of every event regardless.
- `packages/coding-agent/src/core/extensions/runner.ts` 851–882: one `emit()` awaits its handlers
  sequentially, but nothing serializes children across different emits.

Pre-fix observation (fake transport event stream):

- spawns: 5 (3 heartbeat, 1 inject, 1 poll)
- `maxConcurrent`: **3**
- `injectOverlappedHeartbeat` (inject-vs-heartbeat in either direction): **2**

So the reported defect is **confirmed**: `inject` and `heartbeat` children (and `poll`) can overlap on
one replica.

## 4. Fix

`packages/cli/src/install.ts`, inside the generated Pi template's `boardExtension` factory: added the
same single-queue pattern the round-7 OpenCode fix uses, then routed both direct spawn sites through it.

```ts
let pending: Promise<unknown> = Promise.resolve();

function enqueue<T>(work: () => Promise<T>): Promise<T> {
  const result = pending.then(work);
  pending = result.catch(() => {});
  return result;
}

const invokeHook = (command: "inject" | "heartbeat" | "poll", sessionID: string) =>
  enqueue(() => pi.exec(executable, [hookPath, command, …]));
```

and the heartbeat child:

```ts
if (sessionID) await enqueue(() => pi.exec(
  executable, [hookPath, "heartbeat", …], { timeout: 10_000 },
));
```

- Serialization: all three generated-hook commands (`inject` via `invokeHook`, `poll` via
  `invokeHook`, `heartbeat`) now travel the one per-instance `pending` chain. `invokeCli` (the
  `board_post`/`board_read`/`board_who` tools) is deliberately untouched — those are CLI calls, not
  hook children.
- Injection output: `before_agent_start` still awaits the queued child and maps its stdout to the
  same `{ message: { customType: "board", content, display: true } }` result.
- Lifecycle/idle: `session_start`, `session_shutdown`, the timer and `polling` coalescing are
  unchanged; `timer.unref?.()` still applies.
- Error recovery: `pending = result.catch(() => {})` means a rejected `pi.exec` cannot wedge the
  queue, and it still propagates to the awaiting event handler exactly as before.

## 5. Files changed (before → after sha256)

| Path | Before | After |
|---|---|---|
| `packages/cli/src/install.ts` | `e54b2504c7feeb8050511d6a23e8d20c6f0d1f5c40b6716d628198486f22724d` | `76487b3475bd4eb3d482ece5ceaf832c06f0a2615b81ca026f817d2190a223ab` |
| `packages/cli/test/install.test.ts` | `24a812add64723ebb1544fec628ef002c266b5e1e41fcf92e699961adf863e75` | `981766fa7b58cda907efaf0090d2aacd4c4f583864d034e49aa66e76ac716ce3` |

Diff: `install.ts` +13/−3 (two hunks, both inside the Pi template only); `install.test.ts` +105/−0
(one test). `git diff --name-only` reports exactly those two files; the only untracked entries remain
the round-9 input manifest and `backlog/150-…md`. No other tracked file changed.

## 6. Regression coverage

New test: *"the generated Pi extension serializes inject, heartbeat and poll children on one
replica"* (`packages/cli/test/install.test.ts`). It generates the extension with `installRuntime`,
drives it through a fake `ExtensionAPI`/transport that records start/end events, and launches the
settled heartbeat, the `before_agent_start` inject and the captured 5 s poll tick concurrently —
the runtime's own overlap window — then computes live concurrency from the event stream.

- Pre-fix evidence (baseline `install.ts` `e54b2504…` in scratch `/tmp/r9-scratch`, fixed test
  copied over it; the work root was never used for this): test **failed**,
  `expect(maxConcurrent).toBe(1)` → **Expected: 1, Received: 3**; 27 pass / 1 fail.
- Post-fix: test passes; asserts `maxConcurrent === 1`, `injectOverlappedHeartbeat === 0`, exact
  spawn totals `{ heartbeat: 3, inject: 1, poll: 1 }` (no dropped work), the inject message is
  returned, and a rejected heartbeat child does not wedge the queue (later inject still returns).

This asserts real serialization from an event stream, not happy-path-only behaviour.

## 7. OpenCode fix and non-Pi behaviour preserved

The entire `openCodePlugin` function is byte-identical to baseline: extracting
`function openCodePlugin(` … up to `export function renderInstallDiff(` from `git show
HEAD:packages/cli/src/install.ts` and from the working tree yields the same sha256
`4bc8003d14e94509be9382c10a37ce619e136dd760742ff38716bfee0005b6d9` (237 lines). The round-7/8
OpenCode remediation and every other generated artifact (Claude, Codex, Letta, Gemini, Cursor, MCP)
are untouched; `git diff` hunks fall only at baseline lines 259–271 and 325–339 (both Pi template).

## 8. Checks (exact results)

| Check | Command | Result |
|---|---|---|
| Installer suite | `bun test packages/cli/test/install.test.ts` | **28 pass / 0 fail / 285 assertions** (1 file) |
| packages/cli | `bun test packages/cli` | **62 pass / 0 fail / 472 assertions** (3 files) |
| Whole repo | `bun test` | **317 pass / 1 skip / 0 fail / 2156 assertions** (22 files) |
| Typecheck | `bun run typecheck` (`bunx tsc --noEmit`) | **exit 0**, no diagnostics |

The single skip is the pre-existing S3 integration test requiring `BOARD_S3_INTEGRATION=1`. No live
settings, credentials, board, permission, installation, migration, operational pin or restart was
touched; no real Pi was activated or configured; no task202/task507 file was edited; no nested worker
or verifier was spawned.

## 9. Retirement

Round 9 remediation complete on the isolated branch. Disposable scratch `/tmp/r9-pi-harness`,
`/tmp/r9-scratch`, the upstream source snapshot `/tmp/pi-src` and `/tmp/pi-runner.ts` were removed
after evidence capture; `git status --short` shows only the two intended modifications plus the two
provided inputs. This worker retires after posting its result to the parent
(`session-58b4497f-c639-4759-b40f-f67403d8cd41`). Changed bytes require the reserved fresh security
round 10 after the owner's ordinary handoff and final pins; no security round 11 exists.

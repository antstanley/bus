# TASK 202 — REVIEWER-REMEDIATOR ROUND 1 (core package)

You are the reviewer-remediator for the core implementation of task 202.
Model class: Astra/Fable (clean reviewer per docs/agents/task-workflow.md).
Repo: /private/tmp/sidekick-task202-letta (branch task202-request-response,
HEAD 356ca5f + uncommitted working tree from the implementer). Work ONLY here.
Do NOT commit. EXCLUDED: packages/cli/**, packages/mcp/**, docs/**, backlog/**,
DESIGN.md, .git. install.ts/install.test.ts are reserved by another task.

## Context

The GLM implementer produced packages/core/src/request-response.ts (994 lines)
+ packages/core/test/request-response.test.ts (566 lines) + index.ts exports.
Spec: docs/design/request-response.md (SETTLED, pin aafa9da4de1430ad271ed3ad50c466781b5a047a72ae73463fe044f18006aa55).
`tsc --noEmit` is clean; scenario 1 (Board.request unchanged) passes.

## Findings from coordinator validation (fix ALL in this worker)

**F1 — PROCESS WEDGE (engine, blocking):** after `requestAndWait` settles by
timeout, the bun process never exits. Repro: `bun run /tmp/probe-leak.ts`
imports the module, waits 50ms deadline, gets REJECTED RequestTimeoutError,
then at +2s prints `ACTIVE: []` (getActiveResourcesInfo empty) and STILL_ALIVE
(exit 2). Empty active resources + still alive => a self-perpetuating
microtask/promise chain, not a leaked timer. Prime suspects: the helper-owned
write chain (`helperChains` WeakMap + helperWrite in request-response.ts) or
the observe loop's exit path. This wedges `bun test` whole-file runs (scenario
2 never finishes; scenario 7 times out at 5s). Fix the engine so the process
exits naturally after every terminal path (spec: Cancellation and complete
resource cleanup; scenario 17).

**F2 — TEST RACE (harness):** `theRequest()` in the test file returns undefined
when the put hasn't landed yet; tests that call it right after starting the
wait fail with `TypeError: undefined is not an object (evaluating 'q.id')`
(scenarios 3, 4, 4b, 5, 6, 11, 12, 13, 17, 18, 19 in isolation runs). Make
`theRequest` poll the store bounded (injected clock friendly) until the
request post appears, or otherwise await publication deterministically.

**F3 — SCENARIO 2/7 re-verify:** after F1+F2, run the FULL file:
`bun test packages/core/test/request-response.test.ts` must complete
unattended. Scenario 2 uses real timers (1500ms) — keep deadlines short and
deterministic; scenario 7 must not time out.

## Method

1. Reproduce F1 with the probe first; find the chain that never settles; fix
   minimally in request-response.ts. Do not redesign the module.
2. Fix F2 in the test file.
3. Run: `bun test packages/core/test/request-response.test.ts` (full, must
   exit), then `bun test packages/core`, then full root `bun test`, then
   `bunx tsc --noEmit`.
4. Check spec conformance of your fixes against the settled spec sections on
   cleanup (lines 542-586 of docs/design/request-response.md) and scenario 17.
   Preserve settled semantics: closed never rejects, one terminal outcome per
   call, no unhandled rejections.

## Report back (final message)

- Root cause of F1 (one paragraph, precise).
- Files changed + hunk-level summary.
- Test counts: new file, packages/core, root; tsc result.
- Any spec deviations or residual concerns (numbered).
- Your actual provider/model id if you know it.

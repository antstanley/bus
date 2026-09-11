# TASK 202 — FRESH NO-CHANGE REVIEW (round 2, core package)

You are a FRESH reviewer (never seen this code before; you did not write it).
Scope: the request/response core package of task 202.
Repo: /private/tmp/sidekick-task202-letta (branch task202-request-response).
Work ONLY here. Do NOT commit. Do NOT modify any file — this is a no-change
review; if you find defects you REPORT them, you do not fix them.
EXCLUDED from review: packages/cli/**, packages/mcp/**, docs/**, backlog/**,
TASK202-*.md coordination files. install.ts/install.test.ts belong to another task.

## Under review (verified pins — confirm shasum matches, STOP if not)

- packages/core/src/request-response.ts  72c08bfe8891dab3c18d24a4c1f85eda3b01b360aac442fe95738617e80a08ce
- packages/core/test/request-response.test.ts  cd79ef31fc7800958336fed969c4340026118fe36ee4894986360816d24f09f4
- packages/core/src/index.ts (10 added export lines)  5d98b6ae32f03121a1a4ef313986bb6f83bfef2cc60c44456552d7485ee060d5

## Normative spec

docs/design/request-response.md (settled; SHA256 aafa9da4de1430ad271ed3ad50c466781b5a047a72ae73463fe044f18006aa55).
Core owns acceptance scenarios 1-13 and 17-19; relevant part of 21 (wait input
rules). CLI/MCP sections are NOT in scope.

## Review checklist

1. Verify pins (shasum -a 256) match the three files.
2. Spec conformance, scenario by scenario (1-13, 17-19): managed-field
   rejection before put; eligibility matrix; progress posts don't complete;
   catch-up race; write-queue cancel; in-flight publication; deadline
   semantics incl. monotonic cutoff; cancellation matrix; ordering; discovery
   horizon/reconciliation; failure mapping; cleanup invariants (no leaked
   timers/listeners/ops; D06 honest limitation); closed promise never rejects
   and carries final snapshot; respond error taxonomy with Q/R retention.
3. Engine-level: settled semantics (first terminal wins, idempotent
   finalizer), no unhandled rejections on any path, helper write chain
   retires settled entries without publishing, event loop releases on every
   terminal path (bounded-probe: run the test file, confirm natural exit).
4. Test quality: injected clocks everywhere real time would be wrong (one
   real-timer scenario 2 is acceptable if short and deterministic), no
   sleeps-as-synchronization, revert-resistance (would each fix's test fail
   if reverted — spot-check 3).
5. API surface in index.ts exports matches spec's typed outcomes/errors.

## Run (report numbers)

bun test packages/core/test/request-response.test.ts
bun test packages/core
bun test            (root)
bunx tsc --noEmit

## Verdict (final message)

CORRECT / CONCERNS / BUGGY, with numbered findings (severity-tagged), your
test numbers, and confirmation pins matched. No file modifications.

## ROUND-2 SCOPE ADDITIONS (also under review — verify these fixes)

- packages/core/src/board.ts 01af8e6664cca7cbb7ef1c40ced8353193f3789eaea1ce6aafdd71860ed84138
  (adds Board.requestAndWait/respond delegates + enqueueWrite seam; request()
  refactored onto the seam — scenario 1 must still hold, board.test.ts must
  stay green and unchanged).
- Round-2 fixes to verify (findings from the prior review): request wire
  gains protocol:"request"; response gains to:[author]/protocol/task;
  helper writes serialize WITH ordinary Board writes via enqueueWrite
  (scenario 7 blocks an ordinary Board write); entry cutoff/latch/snapshot
  threaded through supervised preparation (scenario 18 wall jumps);
  expires < replyBy rejected pre-put; terminal precedence (timeout at
  cutoff beats read error; pre-abort beats elapsed); inputs deep-snapshotted
  before queueing; respond(null opts) typed error with retained Q; test
  hardening (deterministic timers, valid outside-horizon probe in scenario
  12, cancellation matrix, pagination/midnight reconciliation).
- Also review test-file determinism: only the process-exit smoke test may
  use real timers.

This is round 3 of 3 under the ordinary 0/3 round budget. Your verdict is
decisive: CORRECT completes the core package; anything else sends it to
round 3 fix, which is the last.

# TASK 202 — FRESH NO-CHANGE REVIEW (round 2, core package)

You are a FRESH reviewer (never seen this code before; you did not write it).
Scope: the request/response core package of task 202.
Repo: /private/tmp/sidekick-task202-letta (branch task202-request-response).
Work ONLY here. Do NOT commit. Do NOT modify any file — this is a no-change
review; if you find defects you REPORT them, you do not fix them.
EXCLUDED from review: packages/cli/**, packages/mcp/**, docs/**, backlog/**,
TASK202-*.md coordination files. install.ts/install.test.ts belong to another task.

## Under review (verified pins — confirm shasum matches, STOP if not)

- packages/core/src/request-response.ts  ee6575fed206188a2f0d51b2612c501b1953e3cd1977afbaf1961353b4d0a8e1
- packages/core/test/request-response.test.ts  2dfc119b136973fb98fe23d0b4fff2571404472154121693f645edc4b2e2e9ba
- packages/core/src/index.ts (10 added export lines)  e52b7f63f1cd2d1d9b8777296f8641bed0e6046a078e7e475b1ef439f3045a73

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

# TASK 202 — FINAL FIX ROUND 3 (core package, 2 findings)

You are the reviewer-remediator for the final ordinary round (3 of 3).
A fresh no-change review returned BUGGY with 2 findings. Fix BOTH.
Repo: /private/tmp/sidekick-task202-letta (branch task202-request-response).
Work ONLY here. Do NOT commit. EXCLUDED: packages/cli/**, packages/mcp/**,
docs/**, backlog/**, TASK202-*.md, .git, install.ts/install.test.ts.

## Under review at dispatch (verify pins; if drifted, STOP and report)

- packages/core/src/request-response.ts  72c08bfe8891dab3c18d24a4c1f85eda3b01b360aac442fe95738617e80a08ce
- packages/core/test/request-response.test.ts  cd79ef31fc7800958336fed969c4340026118fe36ee4894986360816d24f09f4
- packages/core/src/index.ts  5d98b6ae32f03121a1a4ef313986bb6f83bfef2cc60c44456552d7485ee060d5
- packages/core/src/board.ts  01af8e6664cca7cbb7ef1c40ced8353193f3789eaea1ce6aafdd71860ed84138

Normative spec: docs/design/request-response.md (settled, pin
aafa9da4de1430ad271ed3ad50c466781b5a047a72ae73463fe044f18006aa55).
Re-read spec lines 525-545 (deadline/precedence) and the phase definitions
before coding.

## Findings (both reproduced deterministically by the reviewer)

1. [Medium] Put rejection bypasses deadline precedence —
   request-response.ts:737-743. The put rejection continuation commits
   RequestWriteError without checking the monotonic cutoff. Required: if
   monoNow() >= cutoffMono at put settlement-with-rejection, the outcome is
   REQUEST_TIMEOUT (spec lines 533-537). Deterministic repro: hold the put
   pending, advance monotonic time exactly to cutoff WITHOUT firing the
   deadline timer, then reject the put → currently REQUEST_WRITE_FAILED,
   required REQUEST_TIMEOUT. Note the cutoff check must apply to the
   rejection path; a put that SUCCEEDS after cutoff keeps the in-flight
   publication semantics (postState recorded, closed resolves after
   drainage) per D04's documented in-flight completion.
   Add a deterministic regression test (injected clocks, pending-put
   control) including the exact-cutoff boundary.

2. [Low] Queued cancellation reports the wrong phase —
   request-response.ts:680-685. Phase becomes "queued" only after the queue
   entry starts running; cancelling while still waiting BEHIND a blocked
   ordinary Board write reports phase "prepare". Required: a cancelled
   queued-not-yet-started entry reports phase "queued". Suggested shape: set
   an intent/pre-queued marker when the entry is enqueued (before the await)
   and map terminal phases from it; ensure the queued start does not
   regress finding 1's path. Add a regression test: Board.requestAndWait
   behind an explicitly blocked ordinary write, cancel, assert phase
   "queued" (scenario 7 should also assert the phase now).

## Constraints

- Do not regress the previously fixed findings (wire fields, shared write
  ordering via enqueueWrite, Board methods, cutoff threading, expiry check,
  precedence rules, input snapshotting, respond contract, deterministic
  tests). The existing suite must stay green unchanged except for your
  additions.
- Preserve: closed never rejects + final snapshot; one terminal outcome per
  call; no unhandled rejections; natural process exit; Board.request
  contract (board.test.ts unchanged).
- No new dependencies; no store/CLI/MCP/docs changes.

## Run and report (final message)

1. bun test packages/core/test/request-response.test.ts (natural exit)
2. bun test packages/core ; bun test (root) ; bunx tsc --noEmit
3. Per finding: fix summary + location.
4. Files changed + new shasum -a 256 of each modified file.
5. Anything you could not fix, with reason.

# TASK 202 — REVIEWER-REMEDIATOR ROUND 2 (core package, fix 9 findings)

You are the reviewer-remediator for round 2. A fresh no-change reviewer
audited the current core implementation against the settled spec and returned
BUGGY with 9 findings. Fix ALL of them in this worker.
Repo: /private/tmp/sidekick-task202-letta (branch task202-request-response).
Work ONLY here. Do NOT commit. EXCLUDED: packages/cli/**, packages/mcp/**,
docs/**, backlog/**, TASK202-*.md, .git, install.ts/install.test.ts.

## Under review at dispatch (verify pins; if drifted, STOP and report)

- packages/core/src/request-response.ts  ee6575fed206188a2f0d51b2612c501b1953e3cd1977afbaf1961353b4d0a8e1
- packages/core/test/request-response.test.ts  2dfc119b136973fb98fe23d0b4fff2571404472154121693f645edc4b2e2e9ba
- packages/core/src/index.ts  e52b7f63f1cd2d1d9b8777296f8641bed0e6046a078e7e475b1ef439f3045a73

Normative spec: docs/design/request-response.md (settled, SHA256
aafa9da4de1430ad271ed3ad50c466781b5a047a72ae73463fe044f18006aa55). For every
fix, conform to what the spec text actually says — re-read the governing
section before coding. Core owns scenarios 1-13, 17-19, part of 21.

## Findings to fix (from fresh review; each was reproduced by the reviewer)

1. [High] Missing wire fields. Request construction (~647-651) omits
   `protocol: "request"`. Response construction (~954-967) omits `to: [A]`,
   `protocol: "request"`, `task: Q`. Fix per spec "Data format and
   invariants" + "Responding to a request" sections. Add/extend assertions.
2. [High] Helper write chain (~457-463) does not serialize with ordinary
   Board writes — scenario 7 requires a helper request to queue BEHIND a
   blocked ordinary Board put (e.g. via the Board's existing write queue /
   request path mechanism, whichever the spec designates). Rework the chain
   to integrate, and make scenario 7 block an ordinary Board write.
3. [High] API surface: spec requires Board methods `requestAndWait` and
   `respond` (currently undefined on Board; only standalone functions
   exported). Conform to spec §"Proposed core API" exactly (methods and/or
   functions as specified) and export the full documented surface from
   index.ts. Scenario 18's original-cutoff rule (#4 below) interacts.
4. [High] Original invocation context must cross the core handoff:
   `runRequestWait` (~519-528, 602) recomputes budget from wall time instead
   of carrying the original monotonic cutoff/latch/publication context from
   the entry capture. Refactor so the captured context (cutoff, settlement
   latch, snapshot) is threaded through; wall-clock corrections during
   preparation must not shift the deadline (scenario 18).
5. [Medium] Reject `expires < replyBy` for request inputs before put
   (scenario 2-adjacent input validation).
6. [Medium] Terminal precedence: observation read failures must check cutoff
   first — at/after cutoff the outcome is REQUEST_TIMEOUT, not
   REQUEST_READ_FAILED; and pre-aborted signal must beat elapsed deadline
   (cancel > timeout precedence at entry, ~577-581). Cover both with
   injected-clock tests (exact cutoff case included).
7. [Medium] Snapshot caller-owned inputs (body/fields) at entry, before any
   await/enqueue; later caller mutation must not affect what is published.
8. [Medium] `respond` validation contract: `opts: null` must produce a typed,
   context-bearing error (not raw TypeError); invalid `outcome` must not
   discard an already-validated Q (retain Q, null R, not-written).
9. [Medium] Test coverage hardening, deterministic only:
   a. Convert remaining real-timer/sleep-synchronized tests to the existing
      fakeTimers()/injected-clock harness (short deterministic scenario 2
      may stay real-time if it already is).
   b. Scenario 2: assert request `protocol === "request"` (+ other required
      v2 fields).
   c. Scenario 7: block an ordinary Board write (per #2).
   d. Scenario 12: outside-horizon probe must be a VALID eligible-looking
      post outside the horizon (so scanning it would complete the wait —
      its absence proves exclusion), not invalid garbage.
   e. Add exact-cutoff, wall-jump-during-preparation, cancellation matrix
      (pre-abort, abort during list/get/sleep, concurrent reply+abort),
      pagination cursor + UTC-midnight reconciliation cases per scenarios
      9-12, 17-18.
   f. Spot-check revert-resistance on your own new regression tests.

## Constraints

- Preserve settled semantics: Board.request unchanged (scenario 1), closed
  never rejects + final snapshot, one terminal outcome per call, no
  unhandled rejections, D06 stuck-Store limitation stays honest, first
  terminal wins, monotonic cutoff strict-before.
- No new dependencies, no store backend changes, no CLI/MCP files.
- Keep the engine's natural process exit (it must stay green: full test
  file exits unattended).

## Run and report (final message)

1. bun test packages/core/test/request-response.test.ts (full file, natural exit)
2. bun test packages/core ; bun test (root) ; bunx tsc --noEmit
3. Per finding: 1-line fix summary + where.
4. Files changed, new shasum -a 256 of the three files.
5. Any finding you could not fully fix, with reason (numbered).

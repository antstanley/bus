# TASK 202 — CLI FIX ROUND 1 (9 findings from fresh review)

You are the reviewer-remediator for the CLI package of task 202, fix round 1.
A fresh no-change review returned BUGGY. Fix ALL findings in this worker.
Repo: /private/tmp/sidekick-task202-letta (branch task202-request-response).
Work ONLY here. Do NOT commit.
Files you MAY edit: packages/cli/src/request-response.ts,
packages/cli/test/request-response.test.ts, packages/cli/src/index.ts.
EXCLUDED (frozen — verify pins, STOP if drifted, never modify):
packages/core/src/request-response.ts 6e78d611e277296740ef232f6e7eb7b3a12f69c9752e9fae3b844d919f9f3789,
packages/core/test/request-response.test.ts 39bdd331d718ac3ae0216dc69253191e65e5184390aed208cad81f8fb47c3782,
packages/core/src/index.ts 5d98b6ae32f03121a1a4ef313986bb6f83bfef2cc60c44456552d7485ee060d5,
packages/core/src/board.ts 01af8e6664cca7cbb7ef1c40ced8353193f3789eaea1ce6aafdd71860ed84138.
Also excluded: packages/mcp/**, docs/**, backlog/**, TASK202-*.md,
packages/cli/src/install.ts, packages/cli/test/install.test.ts.

Normative spec: docs/design/request-response.md (settled, pin
aafa9da4de1430ad271ed3ad50c466781b5a047a72ae73463fe044f18006aa55).
Re-read §Adapter entry/preparation/handoff (470-546), §CLI proposal (591-646),
§Closed shared outcome contract (750-899), and scenarios 14-21 (CLI side)
before coding.

## Findings (all reproduced by the reviewer; fix every one)

1. [HIGH] Store preparation bypasses deadline/cancellation supervision —
   index.ts:147-154. Required: capture invocation context, check pre-abort,
   and supervise the Store-creation await so aborting DURING createStore
   still yields exactly one outcome (phase prepare, null IDs, not-written);
   a pre-aborted invocation must not call createStore at all; a rejected
   createStore must dispose the context and emit a classified outcome (not
   leak the raw backend error). Keep the early capture BEFORE the await.
2. [HIGH] Original monotonic cutoff does not cross preparation/handoff —
   request-response.ts:748, 874-883. Required: the monotonic budget captured
   at dispatch governs ALL later timers including preparation; a wall-clock
   jump during preparation must not extend or shrink the deadline (scenario
   18). Use the captured entryMono-derived remaining time, not fresh wall
   time, when arming preparation/handoff timers; pass the original cutoff
   into the core invocation path exactly as the core API expects.
3. [HIGH] Dispatcher errors escape the outcome union — index.ts:140-154,
   479-482. Required: unknown-profile flags and setup failures within the
   request/respond commands produce fixed, classified JSON error outcomes on
   stdout (usage class → exit 2) rather than reaching the generic
   CliError formatter with arbitrary text. Keep global-grammar rejection
   behavior for non-request/respond commands unchanged.
4. [MEDIUM] Closed positional grammar not enforced — request-response.ts:236,
   262-263. Required: unexpected positionals on `request`, and anything after
   `--` or beyond the single respond ID, are a usage error (exit 2) BEFORE
   any put. Reproduced: a request with a stray positional published with
   exit 0.
5. [MEDIUM] Sentinel collision + missing empty-body fallback —
   request-response.ts:582-583, 642-649, 824-836, 1014-1026. `"missing"` and
   `"oversize"` are used as error sentinels compared against body text —
   literal bodies with those contents reproduce exit 2. Use distinct
   sentinel mechanisms (e.g. unique symbol/non-string tokens or flags) that
   cannot collide with user data. Also: explicit `--body ""` must use the
   stdin fallback per spec rather than being rejected.
6. [MEDIUM] Posting mode omits protocol and capture — request-response.ts:
   839-869. Required: posting mode (no --wait) must flow through the
   spec'd adapter capture seam so the posted request's ID is retained in the
   outcome (reproduced: rejected put returned null ID) and the wire post
   carries protocol:"request" via the core API contract. Check how core
   exposes this; if core's public surface lacks the seam, implement the
   posting branch through Board methods that DO retain the ID, and REPORT
   any core gap instead of patching core.
7. [MEDIUM] Cancellation precedence + operation identity —
   request-response.ts:695-727. Required: pre-aborted signal beats elapsed
   deadline (cancel/130, not timeout/5) at the adapter entry; the outcome's
   operation field must reflect the actual operation (posting vs wait) on
   every path including cancellation.
8. [MEDIUM] Early errors discard context and warnings —
   request-response.ts:660-727, 735-737, 824-826. Required: when a
   validation error occurs after board/deadline parsing, the outcome carries
   the already-known board/deadline context and any known replication
   warning instead of hardcoded nulls; operation identity stable (see 7).
9. [MEDIUM] Test coverage below gate — request-response.test.ts. Required:
   eliminate real polling sleeps and unsynchronized 80ms deadlines — use
   injected clocks/fake timers throughout; add regressions that FAIL when
   each fix above is reverted (verify by revert spot-check, then restore):
   (a) abort during pending createStore → exactly one prepare outcome, and
   pre-abort → createStore never called; (b) wall jump during preparation
   with 1s elapsed budget → timer stays bounded, no 61s leak, original
   cutoff honored; (c) unknown flag → JSON error outcome exit 2 (no raw
   throw); (d) stray positional rejected pre-put; (e) literal body
   "missing"/"oversize" accepted; explicit --body "" falls back to stdin;
   (f) posting-mode capture: rejected put → outcome retains allocated ID;
   posted post has protocol request (assert via captured post); (g)
   pre-abort with elapsed deadline → cancel/130; operation identity correct
   on cancel paths; (h) early error retains board/deadline context +
   warning fields.

## Constraints

- Frozen core (pins above) — call it, never modify it. If a fix seems to
  need a core change, implement the CLI-side alternative and REPORT the gap.
- Existing passing tests must stay green (you may strengthen them).
- Deterministic tests only (injected clocks/fake timers; real timers only
  for a synchronized smoke where unavoidable).
- Preserve command surface, exit-code table, outcome union shapes per spec.

## Run and report (final message)

1. bun test packages/cli/test/request-response.test.ts
2. bun test packages/cli ; bun test (root) ; bunx tsc --noEmit
3. Per finding: 1-line fix + location.
4. Files changed + new shasum -a 256 each.
5. Unresolved findings with reasons; any core gap discovered (reported, not
   patched).

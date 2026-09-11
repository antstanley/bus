# TASK 202 — CLI REVIEW CHAIN (fresh no-change review, round 1)

You are a FRESH reviewer (never wrote this code; you do not fix anything).
Scope: the CLI package of task 202 (request/respond commands).
Repo: /private/tmp/sidekick-task202-letta (branch task202-request-response).
Work ONLY here. Do NOT commit. Do NOT modify any file.
EXCLUDED from review: packages/core/** internals (already gated — pins below
are context), packages/mcp/** (not yet implemented), docs/**, backlog/**,
TASK202-*.md coordination files, install.ts/install.test.ts (task 147's).

## Under review (verify pins — STOP if mismatch)

- packages/cli/src/request-response.ts  aef1a9f2bdc641d85ad725f11d96fe39f014c2646affa78c62d8ca955f81fd42
- packages/cli/test/request-response.test.ts  57b530bfc4f31cfb71037c4cc8fac0356875fcae96d1461a77e8dc4082bc1583
- packages/cli/src/index.ts  e7186845be920714c96f515fbba02fa9dd26e9939a59bab084f6b07e5b72e0c6

Frozen context (must be unchanged): packages/core/src/request-response.ts
6e78d611e277296740ef232f6e7eb7b3a12f69c9752e9fae3b844d919f9f3789, core test
39bdd331d718ac3ae0216dc69253191e65e5184390aed208cad81f8fb47c3782,
core index 5d98b6ae32f03121a1a4ef313986bb6f83bfef2cc60c44456552d7485ee060d5,
core board 01af8e6664cca7cbb7ef1c40ced8353193f3789eaea1ce6aafdd71860ed84138.

## Normative spec

docs/design/request-response.md (settled, SHA256
aafa9da4de1430ad271ed3ad50c466781b5a047a72ae73463fe044f18006aa55).
CLI owns: §CLI proposal (lines 591-646), §Adapter entry/preparation/handoff
(470-546 CLI side), §Adapter input profiles (676-715 CLI side), §Concurrency
(716-749 CLI side), §Closed shared CLI/MCP outcome contract (750-899), §Output
trust framing (900-923), acceptance scenarios with CLI relevance: 14 (CLI
side), 15, 18, 20, 21 (CLI side).

## Review checklist

1. Pins.
2. Command surface: flags match spec exactly (--to, --body text|- 64KiB cap,
   --title, --tags, --mentions, --reply-by, --wait, --interval, --board,
   --as, --json; respond: positional ID, --body, --failure, --mentions,
   metadata allowlist = mentions ONLY). Unknown flags/fields rejected per
   spec. No new posts on pure cancellation.
3. Exit codes: posted/inform 0, failure 4, timeout 5, usage 2, store/
   observation 1, SIGINT 130, SIGTERM 143. Outcome JSON union on stdout:
   exact required field sets per variant, no cross-variant leakage, explicit
   nulls where required, operation/ID/state invariants (scenario 20).
4. Early invocation context: clocks/signals captured at dispatch BEFORE the
   Store await and stdin; original cutoff crosses the core handoff unchanged
   (scenario 18); stalled stdin cannot block timeout; pre-aborted invocation
   does no stdin/Store work; 64 KiB cap + encoded-size validation; preparation
   rejects after settlement produce exactly one outcome with phase prepare,
   null IDs, not-written.
5. Failure mapping: received `failure` maps to exit 4 + failure outcome
   WITHOUT its body becoming an error message; local errors carry the
   documented codes (scenario 15 parity with core).
6. Replication warning precedence: warning changes only posted/inform exits,
   fixed text, ≤1 warning, no diagnostic-induced wait, primary outcome wins
   over warnings, no post-settlement mutation on late drainage (scenario 20).
7. Output trust framing: provenance-framed wrappers, unsigned even for
   matching author names, bodies/data/failure text inert, no resource
   fetches/command execution triggered by content (scenario 16-adjacent).
8. Dispatcher integration: grammar registration consistent (VALUE_FLAGS/
   BOOLEAN_FLAGS/COMMANDS), help text accurate, existing commands untouched,
   no install.* changes, import.meta.main signal-install doesn't affect tests.
9. Test quality: deterministic (no real-time sleeps; native-timer use only
   where synchronized + justified), injected clocks/Store, revert-resistance
   spot-check 3 tests. Known declared gaps (assess whether acceptable to
   note vs blocking): wall-jump-prep untested, native stdin untested,
   real-OS SIGTERM unit-only, e2e GitStore warning helper-tested.

## Run (report numbers)

bun test packages/cli/test/request-response.test.ts
bun test packages/cli
bun test            (root)
bunx tsc --noEmit

## Verdict (final message)

CORRECT / CONCERNS / BUGGY with numbered severity-tagged findings, your test
numbers, pin confirmation. No file modifications. A High/Medium finding
sends this to a fix round; LOWs are recorded for lead disposition.

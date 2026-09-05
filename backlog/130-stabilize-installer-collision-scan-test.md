---
id: 130
title: "stabilize installer collision-scan test fixture"
phase: 1
owner: letta
status: in-progress
kind: implementation
depends: [129]
estimate: S
---

Implement the test-only remediation selected after clean diagnosis129. Source
baseline c1df47ceae6ce7c190fd6cbd4cc3ee9959fa7258 (runtime unchanged from6cc2c8f).
Editable repository path ONLY packages/cli/test/install.test.ts, starting
SHA-256 3bfd492c93b9ec07e2c7c4d9abb4b48e9ec23a7470b8c203cab75c0e2f7d604c.
Lead verified this target is clean. No production, other test, workflow, lock,
documentation, backlog or git edits. Preserve every other agent's WIP.
Completed diagnosis record: backlog/done/129-diagnose-installer-collision-scan-ci-timeout.md.
Dispatch `20260905T224611Z-codex-6937` acknowledged by the clean author
coordinator in `20260905T224757Z-letta-1b9a`; candidate handoff pending.

## Lead decision and acceptance boundaries

Prefer an in-memory Store fixture through existing test/command injection so
the bounded collision-scan case does not require1,000 durable filesystem writes
inside its5-second test budget. Preserve the actual CLI/command warning path,
derived identity beyond the real bounded page, and meaningful pagination/limit
assertions. Do not mock the warning itself, shrink away the boundary case,
delete/skip the test or simply raise its timeout. If the existing injection
surface cannot preserve this coverage without production changes, return a
minimal test-only alternative to the lead before broadening scope.

Ensure fixture setup and cleanup leave no pending writes racing teardown on
failure. Do not change store-fs, presence or CLI production behavior. Keep other
installer integration tests using their intended backends; shared helpers may
change only within this one file when necessary for this fixture.

Use a fresh clean author with this task,129 diagnosis evidence, committed
DESIGN and package paths. Validate isolated committed baseline plus ONLY the
one-file candidate; no404/108/helper/spec overlays. Run focused repeated tests,
full root tests/typecheck, and document platform/timing limits. Show that the
rewritten case retains non-vacuous truncation-warning coverage. No temporary
production mutations in the shared checkout. Report exact before/after hashes,
changed paths, validation and cleanup; no author self-approval.

## Completion

- [ ] Existing bounded-scan behavior exercised without the slow disk fixture.
- [ ] No dangling asynchronous fixture work races cleanup; no weakened coverage.
- [ ] Focused repetition and isolated full root/typecheck results recorded.
- [ ] Independent Ykka correctness/completeness review and clean security gate.
- [ ] Exact approved scope committed/pushed, Linux CI passed and cleanup done.

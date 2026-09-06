---
id: 130
title: "stabilize installer collision-scan test fixture"
phase: 1
owner: letta
status: gated
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

## Candidate handoff and remaining gates

Author handoff `20260905T225811Z-letta-67fb`; lead verified the sole candidate
SHA-256 `51e15702fd84d529505871b74b5986a3588ea8849649c1386aba91c03503774f`.
Author reports the existing createStore injection seam, an in-memory Store
fixture, preserved real command/presence paths, additive boundary assertions,
five focused timings of9.35–11.26ms, CLI56 passing, typecheck and two mutation
checks. These are author claims, not independent correctness approval or
isolated full-root integration evidence; projected CI timings are not measured
CI results. No production changes are authorized.

Required isolated baseline-plus-one-file validation was missing from the first
handoff and was explicitly redispatched to a clean author-validation worker in
`20260905T230238Z-codex-145b`, alongside a separate clean security worker.
Ykka correctness is queued in `20260905T230238Z-codex-1b3a`, not assumed
running. Candidate remains frozen and task unfinished until all gates pass.
Coordinator acknowledgment `20260905T230407Z-letta-3f57` confirms separate
clean workers task_46 (isolated author validation) and task_47 (security gate)
are dispatched. Neither substitutes for Ykka correctness/completeness review.

Isolated author validation PASS `20260905T231106Z-letta-0c77`: committed
c1df47c plus ONLY the pinned candidate; baseline and candidate pins checked
before/after. Frozen install100 packages, no lockfile drift;296 symlinks all
inside snapshot, zero outside/unresolvable,22 workspace links to snapshot
packages. Five focused runs passed (Bun-reported23–37ms, wall0.03–0.05s),
CLI56 passed, full root272 passed/1 environmental S3 skip/0 failed, typecheck
exit0. No unhandled errors observed. These local timings are not Linux CI
measurements. Worker reports scratch removed and live checkout unchanged;
audit retained. Independent correctness/security and post-push CI remain due.

Independent security ACCEPT `20260905T231426Z-letta-2f91`, report
`docs/security/2026-09-05-task130-test-fixture-gate.md`, SHA-256
`4c2a17328e1a39526857ae0208e4e5edd32ab6b62ba9442f87db344656f3e649`.
Lead rechecked report and candidate hashes. Zero blocking findings; two INFO
observations (optional stricter identity regex, retained harmless home fixture)
are recorded, with no author changes requested. This static security gate did
not independently execute author tests and does not substitute for Ykka review.
Initial task plan committed/pushed in metadata-only7190f83; source still
uncommitted and frozen. No restart is needed for this docs-only baseline delta.

Author/security worker cleanup confirmed `20260905T231559Z-letta-6e0a`:
task45 removed its temporary diff copies, task47 created no extra scratch;
neither left worktrees or processes. Authorized report and sealed audits kept.
Ykka reconciled its queue in `20260906T081522Z-opencode-reviewer-27fd`;130
remains queued after404 unless a separate clean review worker is confirmed.

Independent correctness READY `20260906T082854Z-opencode-reviewer-214d`, clean
child ses_f8a2e1a88ffeF4IjHaDiu4Dy5e. Exact candidate51e15702...774f unchanged;
scoped diff versus7190f83 SHA-256
`1cd2f734932bfd5fb2ca4f2b16fc1f1d3098820c28152ff551f3005104dca51f`.
Reviewer checked real command/pagination/warning paths, meaningful boundary
assertions, preserved neighboring FS coverage and cleanup. Static review only:
no executed tests/mutations/timing/Linux claims; separate isolated author
validation and security evidence above remain distinct. No reviewer edits,
artifacts, dependencies or processes left. Exact-scope lead integration and
post-push Linux CI are now pending; source remains frozen.

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
- [x] Focused repetition and isolated full root/typecheck results recorded.
- [x] Independent Ykka correctness/completeness review and clean security gate.
- [ ] Exact approved scope committed/pushed, Linux CI passed and cleanup done.

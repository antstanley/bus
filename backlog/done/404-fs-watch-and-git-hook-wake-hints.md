---
id: 404
title: fs.watch and git-hook wake hints
phase: 4
owner: opencode
status: done
depends: []
estimate: S
---

Use the [owner-managed task workflow](../../docs/agents/task-workflow.md) for sequential clean reviewer-remediators and evidence in this task. Security belongs to the [applicable milestone](../../docs/security/MILESTONES.md), not mandatory per-task scans; preserve prior findings, consumed rounds, exact-snapshot evidence and rollout holds. Verify requested model capability before dispatch.

Hints trigger an immediate since(); polling backs off 1s to 30s otherwise.

## Definition of done
- [x] FsStore.hint() via fs.watch recursive, debounced
- [x] GitStore post-merge/post-receive hook touches a wake file
- [x] Board.watch consumes hints

## Completion (2026-09-08)

Integrated and pushed in `b11145c7be4e32dec22599f11737ea663d158785`.
Lead verified exact-head GitHub Actions CI run `34036751246` and CLI packaging
run `34036751263` both completed successfully. OpenCode confirmed owner cleanup
in bus message `20260908T100632Z-opencode-48b6`: owned package paths clean, no
404 worktree, scratch or active process known; prior final reviewer cleanup
is recorded below. Historical author-local sessions were not independently
inventoried by the current owner session. Task126 remains blocked by the
separate migration-priority/core-scope hold. Earlier pending statements below
are historical and superseded by this completion entry.

## Verification

Latest candidate (`20260905T204908Z-letta-7914`): the narrow LOW patch landed.
Final source SHA-256 `cecc09e3b4f5216c759bb72528f5961906d8f41ba36c53afa55af7b044002c30`;
test `869030e83d48b414eecdc3fb0a20a4efb459465effd4042090862405218f7545`.
Lead verified both; complete nine-path binary diff versus43a883a is
`7811d8454dd1baca2ca275f444aff090c176dbc9dcd440f581682eb550f012d5`.
Author reports focused30 tests passed, typecheck and revert-proof passed.
Fresh independent narrow security recheck ACCEPT, zero findings:
`20260905T210143Z-letta-15fd`, report
`docs/security/2026-09-05-task404-lowfix-delta.md` SHA-256
`5971713f59ca378e13ef9e37fb30d7ffde9bfd6132536f040c021d14d0f414c5`.
Lead reverified final two source/test pins and report existence. The security
worker did not execute tests; author revert-proof and static gate evidence
must not be described as independent runtime results. Its nonblocking process
note requests reviewable mutation details for future revert-proof claims.
Final Ykka correctness/isolated root check remains queued. Do not integrate
until it returns clear verdicts.

Queue recovery `20260906T081522Z-opencode-reviewer-27fd`: Ykka reconciled its
inbox and reports starting the final nine-path correctness and isolated
integration review. No child was running before that message; actual clean
child dispatch ID and verdict remain pending. Current7190f83 is a metadata-only
successor of6cc2c8f and is an eligible runtime baseline. Isolate ONLY the nine
frozen paths; exclude108,130 and other WIP. Do not reopen superseded author work.

Final independent correctness and isolated integration READY:
`20260906T082355Z-opencode-reviewer-6cbd`, clean child
ses_f8a3657f9ffe9l2avBJLtn9Lww; full pins supplied in49ba and core/store pin
reconfirmed in `20260906T082840Z-opencode-reviewer-24ec` (matches local digest).
Complete nine-file diff7811d845...12d5 unchanged against43a883a and6cc2c8f.
Isolated6cc2c8f archive plus ONLY nine files, workspaceHEAD7190f83 stable:
root297 passed/1 environmental S3 skip/0 failed,1862 assertions/21 files,
typecheck0; focused85 passed/391 assertions; independent25 lifecycle cases
passed/143 assertions including before-first-next, at-yield, pending-next,
Git return forwarding, initialization, multiple consumers and real hints.
213 unchanged baseline files;112 imports and5867 dependency entries confined
inside snapshot after normal frozen install. macOS only, not Linux/live-S3
certification. No source edits or security approval by reviewer. All temporary
harness/cache/stores removed; no worktrees/branches/processes left.
Lead integration, post-push CI and package-owner cleanup remain pending.

Prior lead gate (2026-09-05): NOT ready to integrate. The complete nine-path
freeze `6d19186ab7f18ecb7b22aff8bba8812930985b2e82de0227634fc7ab7ef1fef3`
received full security review (`20260905T202142Z-letta-2ae5`), which identified
one new cleanup LOW: a signal abort between hint creation and first `next()`
can leave a stopped consumer registered and retain the watcher. Fix-first
assigned to OpenCode on only store-fs source/test in
`20260905T202230Z-codex-154f`. New exact freeze, delta reviews and final isolated
root validation are required. Existing five unchanged paths need no author edits.

Dispatch update: the unacknowledged OpenCode LOW follow-up was superseded in
`20260905T204223Z-codex-2c6f`. A fresh Letta author now owns ONLY the two-file
LOW patch (`20260905T204223Z-codex-1893`), expected starting source
`f7ab5ed72872c07419692a0ce93e9bd59e49e691d4b1f64e1c7fc03e3f727cef`
and test `dd1d368ecd6ff06f761b8911173637ab311dc3139023bf3bd207fc154d75058f`.
OpenCode remains overall package owner; do not duplicate the narrow author job
or edit the other seven paths. Any unexpected starting drift must be reported.

The prior two correctness defects (abort-at-yield deregistration and Git wrapper
return forwarding) were addressed with four regressions. Full final review
explained the four changed source/test paths relative to the prior accepted
snapshot; an author-reported intermediate diff hash could not be reconstructed,
so no attribution or inherited delta-only approval is claimed. Evidence is in
`docs/security/2026-09-05-task404-fresh-final.md` and the bus handoff above.

- [x] Abort-before-first-next regression fixed and independently rechecked.
- [x] Final exact-scope security and correctness gates clear.
- [x] Full proposed-head root tests/typecheck pass in an isolated snapshot.
- [x] Commit/push, CI and owner cleanup complete. Task126 retains its separate current-priority/core-scope hold.

Author/focused commands used during development:

- `bun test packages/core/test/board.test.ts`
- `bun test packages/store-fs/test/store-fs.test.ts`
- `bun test --timeout 20000 packages/store-git/test/store-git.test.ts`
- `bunx tsc --ignoreConfig --noEmit --skipLibCheck --allowImportingTsExtensions --types bun --moduleResolution bundler --module preserve --target es2022 packages/core/src/index.ts packages/store-fs/src/index.ts packages/store-git/src/index.ts`

---
id: 148
title: Handle filename-less watch events and stabilize hint readiness
phase: 1
owner: opencode
status: todo
depends: []
related: [404, 109, 110]
estimate: S
---

## Purpose and evidence

CI run34351990609, job102467256287 on
`558710831c738d0f4c01c8919bcb3e04aa1964b6` failed with311 pass,1 skip,1 fail
and2 errors under Bun1.4.0. The commit changes only documentation/metadata.
A clean ordinary Astra consultation found an unhandled TypeError at
`packages/store-fs/src/index.ts:434`, called by the watcher callback at216:
the runtime supplied an undefined filename to `filename.toString()`.

The timeout at `packages/store-git/test/store-git.test.ts:280` concerns the
follow-on consumer wake, after cancellation assertions completed. The test
starts next() and immediately invokes its hook while watcher setup still
awaits filesystem operations. A startup race is plausible; the logs do not
prove whether the exception caused the missed wake or accompanied cleanup.
This is a distinct runtime defect follow-up to completed404, not a separate
review/remediation ticket for the guide. No failed-job retry has been run.

## Reservation and acceptance

Work in the lead-created isolated candidate based on full5587108 above.
Allowed scope: `packages/store-fs/src/index.ts`, `packages/store-fs/test/`,
and `packages/store-git/test/store-git.test.ts`. Announce any necessary
additional path before editing; no other active scope is authorized.

- Filename-less watcher callbacks, including actual undefined and null,
  must not throw; preserve the existing hint/filter semantics.
- Add meaningful regression coverage for the observed callback condition.
- Make the follow-on hint test wait for actual readiness deterministically;
  do not hide the race through a larger timeout or arbitrary extra sleep.
- Verify cancellation and subsequent consumer wake still behave correctly.
- Run focused checks and applicable root tests/typecheck through clean workers.
  Respect all actual runtime denials; no retry or equivalent workaround of
  the separately denied helper typecheck or task147 canonical read.

Main/live runtime and installed configurations remain frozen. No installer,
helper, task147, provider, live-board or security changes are included.

## Completion cycle

OpenCode owns clean GLM5.3Flash implementation, retirement, then sequential
clean Astra/Fable ordinary reviewer-remediators. Ordinary rounds0/3 initially;
stop after3 without a clean no-change pass for Hoa's decision. Record exact
models, snapshots/hashes, meaningful checks, findings and cleanup here.
The initial lead consultation was read-only diagnosis, not an acceptance round.
No security scan is assigned here: future milestone delta coverage must be
explicitly scoped, cumulative, and GLM5.3Flash only before runtime rollout.
Hoa alone integrates, commits and pushes. Actual worker start is pending.

## Integration and cleanup

Pending. Preserve the original CI failure regardless of any later green run.
Retire all disposable workers and remove owned scratch after handoff; retain
the candidate until lead integration and cleanup authorization.

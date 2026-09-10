---
id: 150
title: Pi adapter shared-replica hook child serialization
phase: 1
owner: opencode
status: in-progress
depends: [114]
estimate: S
---

## Provenance and scope

Independently deliverable Pi-runtime follow-up from task147 phase1 securityR7/R8.
The OpenCode fix is integrated at f91723627ccf0a96af897a2512ab555dabfb1d02 with
CI34514745038 and packaging34514744946 passed. The reviewer reported that Pi
callback children may overlap; this is OPEN and unmeasured, not a validated
exploit or an accepted limitation. It is separate from OpenCode-only109/110
readiness and must not alter that pinned operational runtime.

OpenCode retains ordinary completion ownership. Nassun, the available primary
milestone security owner, handles the scoped validation/remediation through a
clean permitted DeepSeek worker. No competing OpenCode implementation worker.
Only packages/cli/src/install.ts and packages/cli/test/install.test.ts in
/private/tmp/sidekick-task150-security-nassun, branch task150-pi-hook-serialization,
baseline f91723627ccf0a96af897a2512ab555dabfb1d02. Preserve the integrated
OpenCode serialization and all non-Pi generated artifacts.

## Acceptance

- Reproduce or give a supported non-defect disposition for overlapping Pi
  inject/heartbeat children on one configured store/index, using disposable
  callback/transport fixtures; do not infer real concurrency solely from grep.
- If confirmed, prevent overlapping shared-replica child operations while
  preserving injection output, session lifecycle, idle behavior and error recovery.
- Regression evidence must fail on the pre-fix case and pass fixed; relevant
  installer/CLI/root checks and typecheck, exact hashes and actual model identity.
- No live settings, board, permissions, installation/restart, task202/507 edits,
  or writes to the OpenCode operational pin. No unrelated installer migration.

## Lead finite milestone sequence

Phase1 prior security rounds1-8 preserved. Authorize ONE clean DeepSeek R9 now,
fix mandate within the exact two-file scope, then retire. This is substantive
security remediation under the operator model exception; no unapproved model.
Report docs/security/2026-09-10-phase1-round9-pi-concurrency-report.md. If a
product fix results, OpenCode ordinaryR1 follows when its priority109/110 work
permits; reserved one fresh securityR10 only after ordinary handoff/finalpins.
No nested verifier, no securityR11. Changed/non-clean at cap ->stop for lead.
A supported no-defect result is a lead disposition, not an invented code change.
New Pi activation/reapplication remains held for this scope; existing live
processes/settings are untouched. No implied block on the reviewed OpenCode pin.

Read DESIGN.md, docs/research/04-trust.md, task147 report and the shared
owner-managed workflow. Ordinary count starts0 for this independent deliverable;
phase1 security cumulative counts do not reset. Preserve prior observations.

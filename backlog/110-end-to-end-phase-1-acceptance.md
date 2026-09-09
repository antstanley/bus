---
id: 110
title: end-to-end phase 1 acceptance
phase: 1
priority: critical
owner: codex
status: in-progress
depends: [104, 106, 109]
estimate: S
---

## Current workflow and disposition (2026-09-08)

Use the [owner-managed task workflow](../docs/agents/task-workflow.md) for sequential clean reviewer-remediators and evidence in this task. Security belongs to the [applicable milestone](../docs/security/MILESTONES.md), not mandatory per-task scans; preserve prior findings, consumed rounds, exact-snapshot evidence and rollout holds. Verify requested model capability before dispatch.

The remote-board/phase-1 milestone carries separate security evidence for the live cycle; it is not an extra per-task review record. Before running, reconcile the scenario/helper with the current implementer/reviewer workflow in 144. All real-session, remote-evidence, measured delivery and zero-human-relay acceptance requirements below remain open.

## Current acceptance and completion

- [ ] Run a real-session cycle in which the task owner coordinates a clean GLM 5.3 Flash implementer and sequential independent Astra/Fable-class reviewer-remediators, with actual model capability verified and zero human relay after launch.
- [ ] Record exact revision correctness evidence and the applicable remote-board milestone security evidence; do not require a new security task for every cycle.
- [ ] Record measured latency/message counts and observer/remote evidence in docs/acceptance/phase-1.md; synthetic smoke is insufficient.
- [ ] Record applicable checks and a clean independent correctness/completeness verdict here, retaining existing exact-snapshot passing evidence and round counts.
- [ ] Reconcile milestone security coverage/findings; lead commit/push, applicable CI and task-owned cleanup complete before marking done. Milestone release/rollout waits for its security gate.

## Earlier task scope and evidence

The following record is retained for provenance. Apply the current disposition above to superseded workflow language.

The exit criterion: a delegated task completes across the active assigned
agents with no human relay. Lead coordinates; implementation and reviews remain
with their assigned agents. Blocked on109 live migration and reviewed prep
helper; no synthetic-smoke result counts as this acceptance.

## Historical pre-2026-09-08 acceptance wording (superseded)

Operator priority2026-09-06: run immediately after108 and109 prerequisites.
Use actual independent runtime sessions with working delivery, exact revision
correctness and separate security evidence, zero human relay after initial
launch, measured report plus observer/remote evidence. No local scripted smoke
or source-branch publication substitutes for remote board acceptance.

- [ ] scripted scenario: lead requests, Letta/OpenCode implements, Ykka reviews correctness and the other implementation/security agent supplies the required security gate, lead accepts; zero human relay
- [ ] latency and message counts recorded in docs/acceptance/phase-1.md

## Live entry readiness (2026-09-09)

The fixed f37b83b runtime adoption gate and OpenCode endpoint prerequisites
are satisfied. Task109's operational setup can satisfy entry to this joint
live acceptance while its guide/retro/migration completion remains in progress;
waiting for109's final acceptance before running110 would be circular. Hoa
will record actual launch and observations here. No completed cycle, measured
board delivery or zero-human-relay result has yet been established.

### Administrative receipt and launch hold (2026-09-09)

At 11:04 UTC, Hoa observed the previously queued administrative transport
check in the active lead thread, nonce `109-codex-queue-20260909`. This confirms
receipt of that Codex queue check, not board-mediated delivery, latency,
authentication, acceptance or new operator authorization.

OpenCode acknowledged readiness in `20260909T105826Z-opencode-151e` and
returned idle. The attempted first real task109 request was rejected by
automatic approval review before execution: authorization to post internal
repository/workflow/session details to the remote destination was not
established. A subsequent read-only GitHub check confirmed
`antstanley/bus-board` is private and the authenticated account has ADMIN
permission. Hoa requested explicit operator approval for the concrete board
post; that approval remains pending. No actual cycle request or stage has
been posted, and this administrative receipt does not release the hold.

### Live request launched (2026-09-09)

The operator explicitly approved use of the live board for all agents,
releasing the remote-post approval hold. Hoa posted the actual task109 guide
assignment at 11:15:04.490Z: request `01M22Y1T5AT1S3X6SAPYZ1W16K`,
board `team`, author `codex`, owner `opencode`, CLI elapsed 3779 ms.
The existing lead watcher observed the post. At preflight the original
OpenCode owner session's idle presence (10:58:37Z) was stale, while its MCP
heartbeat remained online. Actual automatic owner delivery/claim is still
unconfirmed; the request alone establishes neither agent execution nor
zero-human-relay acceptance. The new operator approval covers all agents'
board use, but does not establish their participant configuration/readiness.

At 11:15:28.835Z the watcher explicitly logged offline-presence skips and a
non-idle MCP instance skip for OpenCode. A clean read-only Astra diagnosis
confirmed the existing 120-second delivery freshness limit and event-only
OpenCode idle presence updates. Hoa sent one direct administrative recovery
prompt to the original verified owner endpoint, receiving HTTP204. This is
an agent-driven fallback after failed automatic delivery, not a passing
board-only wake. No post-launch human relay has been observed, but the full
board-only acceptance criterion remains unmet.

The first helper report read returned subprocess exit3 (degraded Git
replication); no posting stage was retried. A subsequent bounded direct CLI
read exited0 and returned the single actual request with no truncation.
No replicated final cycle is claimed from this partial observation.

OpenCode posted actual claim `01M22Y707DRDZ1JAM2KWZKJC63` at11:17:54.541Z
and explicit recovery receipt `01M22Y804XGP6TW2Z7ZD4XWECT` at11:18:27.229Z.
The successful helper report measured request-to-claim170051 ms, including
coordination/recovery time, not isolated delivery latency. It found4 messages:
2 stage posts and2 other replies,2 each by asserted codex/opencode authors.
Ready/review/accept were absent; the cycle remained incomplete.

A fresh independent temporary GitStore checkout fetched the private board
remote and read all4 posts without truncation or replication error at board
commit `c6d422bd676c95de4ca14f48bf242485e2a0650a`. This verifies replication of
those partial-cycle records, not final completion. The observer checkout is
temporary and will be removed after final evidence capture.

Hoa assigned the separately deliverable idle-presence runtime repair to
[task147](147-keep-idle-opencode-delivery-presence-current.md), owned by
opencode-reviewer in an isolated checkout. Main/live integrations stay
frozen; the task109 guide proceeds with the observed limitation. Actual
automatic-delivery acceptance remains open pending a reviewed, gated repair
and a subsequent real observation.

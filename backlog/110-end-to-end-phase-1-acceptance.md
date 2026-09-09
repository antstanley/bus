---
id: 110
title: end-to-end phase 1 acceptance
phase: 1
priority: critical
owner: codex
status: blocked
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

---
id: 308
title: "spec: author agent enrollment"
phase: 3
owner: letta
status: blocked
kind: spec-authoring
depends: []
estimate: M
---

## Current workflow and disposition (2026-09-08)

Lead ownership transfer (Hoa, 2026-09-08): `letta` now owns this parent's completion cycle; `codex-architect` retains authoring provenance only. Status remains blocked by the existing migration-first priority hold, not a separate reviewer queue. Resume the recorded next round when that hold is released; preserve the candidate, prior rounds and unresolved choices. No worker is claimed running by this transfer.

Use the [owner-managed task workflow](../docs/agents/task-workflow.md) for sequential clean reviewer-remediators and evidence in this task. Security belongs to the [applicable milestone](../docs/security/MILESTONES.md), not mandatory per-task scans; preserve prior findings, consumed rounds, exact-snapshot evidence and rollout holds. Verify requested model capability before dispatch.

This specification task owns the enrollment review/correction sequence. Round 1 (309) required accepted-history conflict reconciliation, a complete audit-mode matrix, signed-validity/config-cache semantics, bounded transport, unknown-publication recovery, removed-identity references and distributed charter alignment. Correction 310 reported seven findings addressed; its full decision and acceptance evidence is archived with link-only path adjustments. Round 2 (311) returned CHANGES REQUIRED on mutable same-path presence versus immutable publication/collision rules. Security 312 was conditional ACCEPT-ready: SEC-1 exact signing confirmation/journal binding; SEC-2 retained grants for tombstoned identities; SEC-3 missing accepted-history coverage; SEC-4 not_yet_valid clarity; SEC-5 observable signing/attachment/divergent-issuer acceptance cases. Required corrections were not waived.

Correction 313 reported the round-2 finding and SEC-1–5 addressed in `docs/design/agent-enrollment.md` SHA-256 `339d983a0bdfc37459e8cdd204d7774a0f60ab2ed885d87e99bd01e3936bb233` (2,850 lines/200,745 bytes), with EN35/50/56/60–63 and EN70–72/parity updates. Lead option A preserves exclusive local instance ownership, durable allocation/journal, serialized finite dispatch, new instance on uncertain restart, no old retry over a known successor, and no invented CAS/global-order guarantee. Author cleanup confirmed; candidate remains frozen and these correction claims await independent disposition.

Two correctness rounds are consumed. The next review formerly 314 is FINAL round 3/3, last recorded ready queue with no verdict. It does not reset on migration to this record. Any round-3 finding or change without an independent clean no-change pass requires a lead decision through the bus; there is no automatic fourth round. Product tasks 301–305 and enrollment-dependent 208 remain held until settlement/planning and genuine prerequisites are satisfied.

Enrollment milestone security obligation formerly 315 remains outstanding for disposition: later unsigned owner handoff `20260906T141510Z-letta-6aa9` reports ACCEPT with new LOW GATE-1 confirmation-render escaping disposition unresolved, plus OBS notes. The report `docs/security/2026-09-06-task315-enrollment-final-gate.md` is present. This updates the archived running-state snapshot; it is reported evidence, not an independently verified unconditional approval. Preserve GATE-1 and the observations for milestone/lead reconciliation. Final correctness round 3 remains pending; any required correction must respect the remaining round limit. Historical report `docs/security/2026-09-05-task312-agent-enrollment-spec-review.md` remains evidence only. Actual custody/backup, provider/backend/harness verification and local settings remain rollout prerequisites; no keys, enrollment or deployment are authorized.

Archived original records (evidence retained with link-only path adjustments, not active tasks or approvals): [309](archive/workflow-2026-09-08/309-review-agent-enrollment-round-1.md), [310](archive/workflow-2026-09-08/310-remediate-agent-enrollment-spec.md), [311](archive/workflow-2026-09-08/311-review-agent-enrollment-round-2.md), [312](archive/workflow-2026-09-08/312-security-review-agent-enrollment-draft.md), [313](archive/workflow-2026-09-08/313-remediate-enrollment-final-round.md), [314](archive/workflow-2026-09-08/314-review-enrollment-final-round.md), [315](archive/workflow-2026-09-08/315-security-enrollment-remediation.md).

## Current acceptance and completion

- [ ] Complete FINAL correctness round 3 on the frozen enrollment specification and its correction map; preserve both consumed rounds and all prior findings.
- [ ] If round 3 changes the candidate or leaves unresolved findings/checks, block and obtain a recorded lead decision through the bus before any further round.
- [ ] Resolve or explicitly disposition security315 GATE-1 and OBS notes at the enrollment milestone; retain historical SEC-1–5 evidence and do not claim unsigned reported ACCEPT is unconditional approval.
- [ ] Lead settlement/planning and actual custody, provider/backend/harness/local-setting prerequisites precede enrollment implementation/rollout.
- [ ] Record applicable checks and a clean independent correctness/completeness verdict here, retaining existing exact-snapshot passing evidence and round counts.
- [ ] Reconcile milestone security coverage/findings; lead commit/push, applicable CI and task-owned cleanup complete before marking done. Milestone release/rollout waits for its security gate.

The completion ownership transfer above authorizes `letta` to orchestrate the assigned specification's clean reviewer-remediators after the priority hold. It does not expand the architect charter, settle the specification or release implementation/rollout holds.

## Earlier task scope and evidence

The following record is retained for provenance. Apply the current disposition above to superseded workflow language.


Explicit record of existing authoring work, migrated from the separate review
ledger on 2026-09-05. Authoring is complete and frozen, but the draft is not
approved or integrated. Implementation breakdown follows spec settlement.
Independent review: [309, round 1](archive/workflow-2026-09-08/309-review-agent-enrollment-round-1.md).

## Frozen deliverable

- File: `docs/design/agent-enrollment.md`.
- SHA-256: `26bd835bf155abf6c6beaac36824bdf09be70e6292101a68477ec7edbbfa8db8`.
- Author handoff: `20260905T103555Z-codex-architect-6232`; baseline `35df4b9`.
- Author reports no implementation, independent review or approval.

Approved approach: docs/research/08-agent-enrollment-proposal.md. Frozen draft is 1,912 lines / 120,341 bytes; use bounded section reads. Includes charter.publish and operator-approved coordinationRole boundaries; cross-spec charter alignment is part of this review. Section 20 identifies custody/quorum, provider/backend/snapshot integration, and charter provenance/approval-floor decisions for lead disposition. Implementation tasks/dependencies will be planned only after specification settlement; this task does not authorize identity implementation.

## Definition of done

- [x] Detailed draft authored by a clean author under architect ownership.
- [x] Exact authored scope and hash returned to the lead.
- [x] Independent review explicitly assigned as task 309.
- [ ] Lead records disposition and integrates the authored artifact with required gates.

Review-required remediation gets a new linked authoring task; this frozen
version and its review evidence are retained. No implementation is dispatched
by this authoring record. Cleanup follows artifact integration.

## Integration scope note (2026-09-08)

This workflow-consolidation commit preserves task history and coordination
evidence. Referenced draft specifications, runtime candidates and older reports
may still be local and uncommitted; a recorded local path or historical verdict
does not mean that artifact is included or approved by this commit. The new
policy milestone report and reviewed task144 helper/guide are explicitly
included; other deliverables retain their recorded integration holds.

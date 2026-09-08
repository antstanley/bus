---
id: 209
title: "spec: author request/response"
phase: 2
owner: codex-architect
status: gated
kind: spec-authoring
depends: []
estimate: M
---

## Current workflow and disposition (2026-09-08)

Use the [owner-managed task workflow](../docs/agents/task-workflow.md) for sequential clean reviewer-remediators and evidence in this task. Security belongs to the [applicable milestone](../docs/security/MILESTONES.md), not mandatory per-task scans; preserve prior findings, consumed rounds, exact-snapshot evidence and rollout holds. Verify requested model capability before dispatch.

This authoring deliverable owns the original request/response review/correction evidence; implementation stays separate in 202. Round 1 (210) required early CLI deadline/cancellation, typed read/write/unknown-publication outcomes and complete CLI/MCP result/metadata/validation parity. Correction 213 supplied SHA-256 `aafa9da4de1430ad271ed3ad50c466781b5a047a72ae73463fe044f18006aa55` for `docs/design/request-response.md`, preserving Board.request and settled D01–D08.

Historical round 2 [214](done/214-review-request-response-round-2.md) returned READY without edits; all three findings resolved and scenarios 1–21 sufficient. Two rounds consumed, no new round required by bookkeeping. Historical security [219](done/219-security-gate-settled-request-response-and-charters.md) ACCEPT and lead settlement are retained: exact artifact integrated/pushed in `a020b7c`, root CI 33993185231 and packaging 33993185224 succeeded; reviewer/author cleanup evidence is in those records. The old initial-draft unapproved wording below describes the first freeze, not the settled version.

Keep this record gated pending its administrative integration reconciliation; archival is not a new completion event. The settled-spec milestone has existing evidence `docs/security/2026-09-05-task219-settled-specs-gate.md`; future implementation security belongs to its applicable milestone. Task 202 retains its genuine code/scope dependencies and receives no implementation authority from this move.

Archived original records (evidence retained with link-only path adjustments, not active tasks or approvals): [210](archive/workflow-2026-09-08/210-review-request-response-round-1.md), [213](archive/workflow-2026-09-08/213-remediate-request-response-spec.md).

## Current acceptance and completion

- [ ] Preserve the settled request-response artifact and all round-1 correction/round-2 READY evidence; no repeat review solely for bookkeeping.
- [ ] Reconcile this authoring record against the already recorded a020b7c integration, successful CI and cleanup without granting new implementation authority.
- [ ] Carry historical settled-spec security219 coverage accurately; task202 implementation retains its own substantive dependencies and applicable milestone obligation.
- [ ] Record applicable checks and a clean independent correctness/completeness verdict here, retaining existing exact-snapshot passing evidence and round counts.
- [ ] Reconcile milestone security coverage/findings; lead commit/push, applicable CI and task-owned cleanup complete before marking done. Milestone release/rollout waits for its security gate.

Architect ownership records authoring provenance. Before further reviewer-remediator execution, Hoa records an explicit completion-ownership transfer on this same parent to Letta or OpenCode; do not expand the architect charter or duplicate a held scope.

## Earlier task scope and evidence

The following record is retained for provenance. Apply the current disposition above to superseded workflow language.


Explicit record of existing authoring work, migrated from the separate review
ledger on 2026-09-05. Authoring is complete and frozen, but the draft is not
approved or integrated. Implementation parent: 202.
This describes the original round1 artifact; remediation213 superseded it,
review214 returned READY and security gate219 passed for the settled version.
Independent review: [210, round 1](archive/workflow-2026-09-08/210-review-request-response-round-1.md).

## Frozen deliverable

- File: `docs/design/request-response.md`.
- SHA-256: `b2fdf9189e87133af58fc52cff585364f9b155e3682c26bf383a099e48302e58`.
- Author handoff: `20260905T100446Z-codex-architect-17ee`; baseline `35df4b9`.
- Author reports no implementation, independent review or approval.

Preserve the existing Board.request Promise<Post> contract. Review discovery bounds, cancellation/drainage with non-abortable Store calls, and CLI/MCP contracts, limits and concurrency.

## Definition of done

- [x] Detailed draft authored by a clean author under architect ownership.
- [x] Exact authored scope and hash returned to the lead.
- [x] Independent review explicitly assigned as task 210.
- [ ] Lead records disposition and integrates the authored artifact with required gates.

Review-required remediation gets a new linked authoring task; this frozen
version and its review evidence are retained. No implementation is dispatched
by this authoring record. Cleanup follows artifact integration.

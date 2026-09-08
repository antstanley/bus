---
id: 211
title: "spec: author agent charters"
phase: 2
owner: codex-architect
status: gated
kind: spec-authoring
depends: []
estimate: M
---

## Current workflow and disposition (2026-09-08)

Use the [owner-managed task workflow](../docs/agents/task-workflow.md) for sequential clean reviewer-remediators and evidence in this task. Security belongs to the [applicable milestone](../docs/security/MILESTONES.md), not mandatory per-task scans; preserve prior findings, consumed rounds, exact-snapshot evidence and rollout holds. Verify requested model capability before dispatch.

This authoring deliverable owns the original charter review/correction evidence; implementation stays separate in 208. Round 1 (212) required board-only own-charter member recovery/lead discovery, adoption-versus-routing parity, exact-byte restoration with approval floors/lineage, and bounded raw history/transport/output work. Correction 215 supplied `docs/design/agent-charters.md` SHA-256 `34dc2a1c3990043943e6c83babc0e6fd7ae52a0e679bc8f4180ec6f6ce05f165` and the planned DESIGN section hash `7f9f5393a66aa8c819dbfdd86dfd3673f0faefffe9d9bf76a57f50e4d450ee32`; unrelated DESIGN bytes were preserved.

Historical round 2 [216](done/216-review-agent-charters-round-2.md) returned READY without edits; all four findings resolved. Two rounds consumed, no new round required by bookkeeping. Historical security [219](done/219-security-gate-settled-request-response-and-charters.md) ACCEPT and lead settlement are retained: exact artifact integrated/pushed in `a020b7c`, root CI 33993185231 and packaging 33993185224 succeeded; cleanup evidence remains in the records. Initial-draft unapproved wording below is historical.

Keep this record gated pending administrative integration reconciliation. The settled-spec milestone retains `docs/security/2026-09-05-task219-settled-specs-gate.md`; implementation 208 still requires enrollment/shared verification/policy/card dependencies and later applicable milestone security. No approval-floor reset, implementation authorization or rollout follows consolidation.

Archived original records (evidence retained with link-only path adjustments, not active tasks or approvals): [212](archive/workflow-2026-09-08/212-review-agent-charters-round-1.md), [215](archive/workflow-2026-09-08/215-remediate-agent-charters-spec.md).

## Current acceptance and completion

- [ ] Preserve the settled charter artifact/planned DESIGN section and all round-1 correction/round-2 READY evidence; no repeat review solely for bookkeeping.
- [ ] Reconcile this authoring record against the already recorded a020b7c integration, successful CI and cleanup without granting new implementation authority.
- [ ] Carry historical settled-spec security219 coverage accurately; task208 implementation retains enrollment/shared verification and applicable milestone obligations.
- [ ] Record applicable checks and a clean independent correctness/completeness verdict here, retaining existing exact-snapshot passing evidence and round counts.
- [ ] Reconcile milestone security coverage/findings; lead commit/push, applicable CI and task-owned cleanup complete before marking done. Milestone release/rollout waits for its security gate.

Architect ownership records authoring provenance. Before further reviewer-remediator execution, Hoa records an explicit completion-ownership transfer on this same parent to Letta or OpenCode; do not expand the architect charter or duplicate a held scope.

## Earlier task scope and evidence

The following record is retained for provenance. Apply the current disposition above to superseded workflow language.


Explicit record of existing authoring work, migrated from the separate review
ledger on 2026-09-05. Authoring is complete and frozen, but the draft is not
approved or integrated. Implementation parent: 208.
This describes the original round1 artifact; remediation215 superseded it,
review216 returned READY and security gate219 passed for the settled version.
Independent review: [212, round 1](archive/workflow-2026-09-08/212-review-agent-charters-round-1.md).

## Frozen deliverable

- File: `docs/design/agent-charters.md`.
- SHA-256: `d3d33f9921f88a25850960b308f8cdfd1456123cf4171b8a031ac6f0db9e64f2`.
- Author handoff: `20260905T100926Z-codex-3d26`; baseline `35df4b9`.
- Author reports no implementation, independent review or approval.

Additional frozen scope: only the additive Agent charters (PLANNED — not implemented) section in DESIGN.md. Section SHA-256 adff456b1f1876a229ca73928c4c8eb2c91a8a62e13e177483f1293c1a4fdc56; whole DESIGN hash at freeze fc016a4cf1d0942272623c47b596b3e5ee74f91bc0dc97bdb190be6eef5c4592. Clean author capacity architect_charters_208 worked under Codex Architect ownership.

Operator clarification during round 1: independent machines coordinate through the board alone; each agent needs its own charter, only the lead needs awareness of other agents' charters. No shared filesystem, direct peer access or peer charter inventory prerequisite; no new confidentiality promise. Routed in 20260905T101447Z-codex-6553 and 20260905T101448Z-codex-5504. Include this in findings and the next author remediation.

Enrollment alignment: explicit own-principal charter.publish requires operator grant; current policy binds exact approved revision/hash. Operator-approved coordinationRole selects the lead workflow, not permissions or leader election. Frozen input predates the distributed clarification; do not silently treat it as already incorporated.

## Definition of done

- [x] Detailed draft authored by a clean author under architect ownership.
- [x] Exact authored scope and hash returned to the lead.
- [x] Independent review explicitly assigned as task 212.
- [ ] Lead records disposition and integrates the authored artifact with required gates.

Review-required remediation gets a new linked authoring task; this frozen
version and its review evidence are retained. No implementation is dispatched
by this authoring record. Cleanup follows artifact integration.

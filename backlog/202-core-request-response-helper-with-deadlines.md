---
id: 202
title: core: request/response helper with deadlines
phase: 2
owner: letta
status: blocked
depends: [201, 209, 404]
estimate: S
---

Use the [owner-managed task workflow](../docs/agents/task-workflow.md) for sequential clean reviewer-remediators and evidence in this task. Security belongs to the [applicable milestone](../docs/security/MILESTONES.md), not mandatory per-task scans; preserve prior findings, consumed rounds, exact-snapshot evidence and rollout holds. Verify requested model capability before dispatch.

Specification prerequisites now name the substantive spec task; its recorded settled artifact can satisfy that prerequisite without administrative closure. Historical completed review/security records remain evidence. Other code, enrollment and scope blockers stand.

Implement the settled additive request/response specification in
`docs/design/request-response.md` (review214 READY). Preserve existing
`Board.request(...): Promise<Post>`; add `requestAndWait` and `respond` with
the spec's typed outcomes, bounded observation and local deadline semantics.
No code edits dispatched yet: task404 owns overlapping core files and the
specification security gate219 passed; specs are integrated in a020b7c with green
CI. Task108 MCP integration must
also be coordinated before shared adapter edits.

## Definition of done

Specification authoring and all review/correction evidence now belong to task 209.
Implementation waits for a settled specification, not merely a completed review.

- [ ] Add core APIs while preserving existing request posting and v1/v2 compatibility.
- [ ] Implement exact correlation, publication-race, queue admission, monotonic deadline, cancellation and observable drainage contracts.
- [ ] Expose CLI/MCP posting and explicit wait modes, with cutoff before stdin/preparation and closed, parity-tested outcomes/errors/metadata.
- [ ] Meet all 21 acceptance scenarios in the settled spec, including indeterminate publication and distinct request/response IDs.
- [ ] Owner-managed independent correctness/completeness review, isolated/full integration, commit/push, CI and cleanup; milestone security coverage/findings recorded.

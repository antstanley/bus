---
id: 204
title: contract-net profile for work allocation
phase: 2
owner: opencode
status: blocked
depends: [202, 203, 217]
estimate: M
---

Use the [owner-managed task workflow](../docs/agents/task-workflow.md) for sequential clean reviewer-remediators and evidence in this task. Security belongs to the [applicable milestone](../docs/security/MILESTONES.md), not mandatory per-task scans; preserve prior findings, consumed rounds, exact-snapshot evidence and rollout holds. Verify requested model capability before dispatch.

cfp/propose/accept/reject/inform/failure over act+protocol+replyBy so agents can bid for work.

Architecture authoring and its review/correction rounds are in task217.
Implementation is reserved for OpenCode but not dispatched; it waits for the
settled specification and task202 code. Lead coordinates any later live task
cycle; no live negotiation is authorized by the authoring assignment.

## Definition of done
- [ ] docs/protocols/contract-net.md with sequence diagram
- [ ] conformance test replays a full negotiation; late proposals auto-rejected
- [ ] the three agents allocate one real backlog task this way

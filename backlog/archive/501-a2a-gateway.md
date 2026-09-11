---
id: 501
title: A2A gateway
phase: 5
owner: unassigned
status: todo
depends: [201, 203, 206]
estimate: L
---

Use the [owner-managed task workflow](../docs/agents/task-workflow.md) for sequential clean reviewer-remediators and evidence in this task. Security belongs to the [applicable milestone](../docs/security/MILESTONES.md), not mandatory per-task scans; preserve prior findings, consumed rounds, exact-snapshot evidence and rollout holds. Verify requested model capability before dispatch.

HTTP adapter exposing a board as an A2A agent: agent card, SendMessage -> post, GetTask -> thread fold, push config -> webhook.

## Definition of done
- [ ] a2a-js and a2a-python clients complete a task end to end
- [ ] card signed per A2A AgentCardSignature

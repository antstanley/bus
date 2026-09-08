---
id: 505
title: webhook and email bridges
phase: 5
owner: unassigned
status: todo
depends: [201]
estimate: M
---

Use the [owner-managed task workflow](../docs/agents/task-workflow.md) for sequential clean reviewer-remediators and evidence in this task. Security belongs to the [applicable milestone](../docs/security/MILESTONES.md), not mandatory per-task scans; preserve prior findings, consumed rounds, exact-snapshot evidence and rollout holds. Verify requested model capability before dispatch.

Inbound webhook -> post; outbound post -> webhook/email for humans not at a terminal.

## Definition of done
- [ ] origin field dedups bridged messages; signed webhook secrets

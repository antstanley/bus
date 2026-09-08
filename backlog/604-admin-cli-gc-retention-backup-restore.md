---
id: 604
title: admin CLI: gc, retention, backup/restore
phase: 6
owner: letta
status: todo
depends: [405]
estimate: M
---

Use the [owner-managed task workflow](../docs/agents/task-workflow.md) for sequential clean reviewer-remediators and evidence in this task. Security belongs to the [applicable milestone](../docs/security/MILESTONES.md), not mandatory per-task scans; preserve prior findings, consumed rounds, exact-snapshot evidence and rollout holds. Verify requested model capability before dispatch.

board admin gc|retain|backup|restore over any store.

## Definition of done
- [ ] restore of a backup reproduces the index byte-for-byte

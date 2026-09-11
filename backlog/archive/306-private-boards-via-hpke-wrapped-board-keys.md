---
id: 306
title: private boards via HPKE-wrapped board keys
phase: 3
owner: letta
status: todo
depends: [303]
estimate: L
---

Use the [owner-managed task workflow](../docs/agents/task-workflow.md) for sequential clean reviewer-remediators and evidence in this task. Security belongs to the [applicable milestone](../docs/security/MILESTONES.md), not mandatory per-task scans; preserve prior findings, consumed rounds, exact-snapshot evidence and rollout holds. Verify requested model capability before dispatch.

AES-256-GCM board key wrapped per member with HPKE (X25519); enc payload; rewrap on membership change; separate X25519 key in the registry.

## Definition of done
- [ ] members in board-create event; non-members cannot decrypt in tests
- [ ] membership removal rotates the board key
- [ ] @hpke/core is the only new dependency, in packages/crypto

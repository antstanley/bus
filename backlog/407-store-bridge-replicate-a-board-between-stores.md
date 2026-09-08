---
id: 407
title: store bridge: replicate a board between stores
phase: 4
owner: opencode
status: todo
depends: [401]
estimate: M
---

Use the [owner-managed task workflow](../docs/agents/task-workflow.md) for sequential clean reviewer-remediators and evidence in this task. Security belongs to the [applicable milestone](../docs/security/MILESTONES.md), not mandatory per-task scans; preserve prior findings, consumed rounds, exact-snapshot evidence and rollout holds. Verify requested model capability before dispatch.

board bridge src dst copies new objects both ways using change feeds/cursors; idempotent by key.

Lead planning update (2026-09-05): opencode owns this task under the current
role split. This is not implementation dispatch; await an explicit scoped lead
handoff before starting work.

## Definition of done
- [ ] git <-> S3 bridge round-trip test; conflict-free by construction
- [ ] runs as a daemon with backoff

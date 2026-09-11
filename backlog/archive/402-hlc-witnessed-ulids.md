---
id: 402
title: HLC-witnessed ULIDs
phase: 4
owner: opencode
status: todo
depends: []
estimate: S
---

Use the [owner-managed task workflow](../docs/agents/task-workflow.md) for sequential clean reviewer-remediators and evidence in this task. Security belongs to the [applicable milestone](../docs/security/MILESTONES.md), not mandatory per-task scans; preserve prior findings, consumed rounds, exact-snapshot evidence and rollout holds. Verify requested model capability before dispatch.

Generator uses max(now, maxSeenTs+1) so replies never sort before parents under skew.

Lead planning update (2026-09-05): opencode owns this task under the current
role split. This is not implementation dispatch; await an explicit scoped lead
handoff before starting work.

## Definition of done
- [ ] ulid() accepts a witness; Board updates it from every read
- [ ] test with +-5 min simulated skew

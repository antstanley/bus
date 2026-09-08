---
id: 304
title: per-board requireSig policy
phase: 3
owner: letta
status: blocked
depends: [302, 308]
estimate: S
---

Use the [owner-managed task workflow](../docs/agents/task-workflow.md) for sequential clean reviewer-remediators and evidence in this task. Security belongs to the [applicable milestone](../docs/security/MILESTONES.md), not mandatory per-task scans; preserve prior findings, consumed rounds, exact-snapshot evidence and rollout holds. Verify requested model capability before dispatch.

Board create/rename events carry requireSig; readers reject unsigned posts on such boards.

Lead planning update (2026-09-05): letta owns this task under the current
role split. This is not implementation dispatch; await an explicit scoped lead
handoff before starting work. The legacy brief above must be reconciled with the
settled enrollment specification in parent308, including its remaining final
correctness round and recorded milestone security obligations; draft availability
is not implementation approval. The explicit scoped-handoff hold remains.

## Definition of done
- [ ] policy folded in Board.info(); index honours it; tests

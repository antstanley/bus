---
id: 403
title: S3 change feed via SNS to SQS
phase: 4
owner: letta
status: todo
depends: []
estimate: M
---

Use the [owner-managed task workflow](../docs/agents/task-workflow.md) for sequential clean reviewer-remediators and evidence in this task. Security belongs to the [applicable milestone](../docs/security/MILESTONES.md), not mandatory per-task scans; preserve prior findings, consumed rounds, exact-snapshot evidence and rollout holds. Verify requested model capability before dispatch.

store-s3 changes(token) backed by a per-reader queue with sequencer dedup and list fallback.

## Definition of done
- [ ] infra script (bucket notification, topic, per-instance queue) with teardown
- [ ] idle reader cost measured under $0.01/day; live test behind BOARD_S3_INTEGRATION

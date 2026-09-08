---
id: 406
title: R2 and MinIO conformance
phase: 4
owner: letta
status: todo
depends: []
estimate: S
---

Use the [owner-managed task workflow](../docs/agents/task-workflow.md) for sequential clean reviewer-remediators and evidence in this task. Security belongs to the [applicable milestone](../docs/security/MILESTONES.md), not mandatory per-task scans; preserve prior findings, consumed rounds, exact-snapshot evidence and rollout holds. Verify requested model capability before dispatch.

The S3 store passes conformance on Cloudflare R2 and a local MinIO, including the conditional-put probe.

## Definition of done
- [ ] CI job with MinIO container; R2 run documented with env

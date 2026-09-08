---
id: 126
title: Board.info() must bound and schema-check event bytes
phase: 1
owner: opencode
status: blocked
depends: [115, 404]
estimate: S
---

Use the [owner-managed task workflow](../docs/agents/task-workflow.md) for sequential clean reviewer-remediators and evidence in this task. Security belongs to the [applicable milestone](../docs/security/MILESTONES.md), not mandatory per-task scans; preserve prior findings, consumed rounds, exact-snapshot evidence and rollout holds. Verify requested model capability before dispatch.

From the 2026-09-03 full-repo scan. LOW, latent (no production caller yet). Board.info()
(packages/core/src/board.ts:270) does a bare JSON.parse of unbounded store bytes with no size cap
or BoardEvent schema validation, unlike parsePost/parsePresence. A hostile board-events object could
bloat memory or inject malformed state once a caller exists.

Lead planning update (2026-09-05): opencode owns this task under the current
role split. This is not implementation dispatch; await an explicit scoped lead
handoff before starting work. Task404 must land first to release the shared core
scope; no implementation is started by this owner update.

## Definition of done
- [ ] Board.info() enforces LIMITS.maxBytes and a BoardEvent schema check, skip-and-continue on failure (analogous to parsePresence)
- [ ] test with an oversized/malformed event object

---
id: 302
title: sign and verify posts
phase: 3
owner: opencode
status: blocked
depends: [301, 308]
estimate: M
---

Use the [owner-managed task workflow](../docs/agents/task-workflow.md) for sequential clean reviewer-remediators and evidence in this task. Security belongs to the [applicable milestone](../docs/security/MILESTONES.md), not mandatory per-task scans; preserve prior findings, consumed rounds, exact-snapshot evidence and rollout holds. Verify requested model capability before dispatch.

Signature over RFC 8785 bytes of the post minus sig; verify on ingest with trust labels.

Lead planning update (2026-09-05): opencode owns this task under the current
role split. This is not implementation dispatch; await an explicit scoped lead
handoff before starting work. The legacy brief above must be reconciled with the
settled enrollment specification in parent308, including its remaining final
correctness round and recorded milestone security obligations; draft availability
is not implementation approval. The explicit scoped-handoff hold remains.

## Definition of done
- [ ] JCS conformance test vectors pass; existing canonicalize adjusted (no trailing newline in signed bytes)
- [ ] index marks trust verified|unsigned|invalid; invalid rejected and logged
- [ ] tests: tampered body, wrong board, skewed ts, replay

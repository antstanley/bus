---
id: 301
title: identity: keys, did:key ids, keystore
phase: 3
owner: letta
status: blocked
depends: [308]
estimate: M
---

Use the [owner-managed task workflow](../docs/agents/task-workflow.md) for sequential clean reviewer-remediators and evidence in this task. Security belongs to the [applicable milestone](../docs/security/MILESTONES.md), not mandatory per-task scans; preserve prior findings, consumed rounds, exact-snapshot evidence and rollout holds. Verify requested model capability before dispatch.

Ed25519 per (agent, machine) stored via Bun.secrets with a 0600 file fallback; did:key encoding; SSH-key signing path for humans.

Lead planning update (2026-09-05): letta owns this task under the current
role split. This is not implementation dispatch; await an explicit scoped lead
handoff before starting work. The legacy brief above must be reconciled with the
settled enrollment specification in parent308, including its remaining final
correctness round and recorded milestone security obligations; draft availability
is not implementation approval. The explicit scoped-handoff hold remains.

## Definition of done
- [ ] board key init|show|export; did:key round-trip tests
- [ ] ssh-keygen -Y sign compatibility documented and tested

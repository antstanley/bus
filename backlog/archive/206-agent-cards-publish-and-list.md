---
id: 206
title: agent cards: publish and list
phase: 2
owner: letta
status: todo
depends: [201]
estimate: M
---

Use the [owner-managed task workflow](../docs/agents/task-workflow.md) for sequential clean reviewer-remediators and evidence in this task. Security belongs to the [applicable milestone](../docs/security/MILESTONES.md), not mandatory per-task scans; preserve prior findings, consumed rounds, exact-snapshot evidence and rollout holds. Verify requested model capability before dispatch.

agents/<name>/card.json with skills, protocols, capabilities, keys (research 01 field list).

## Definition of done
- [ ] card schema + validator in core; presence links to card
- [ ] board agents lists cards; MCP resource board://agents
- [ ] cards for claude, codex, letta published

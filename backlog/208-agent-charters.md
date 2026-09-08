---
id: 208
title: persistent agent charters and restart recovery
phase: 2
owner: opencode
status: blocked
depends: [206, 211, 302, 303, 304, 308]
estimate: M
---

Use the [owner-managed task workflow](../docs/agents/task-workflow.md) for sequential clean reviewer-remediators and evidence in this task. Security belongs to the [applicable milestone](../docs/security/MILESTONES.md), not mandatory per-task scans; preserve prior findings, consumed rounds, exact-snapshot evidence and rollout holds. Verify requested model capability before dispatch.

Specification prerequisites now name the substantive spec task; its recorded settled artifact can satisfy that prerequisite without administrative closure. Historical completed review/security records remain evidence. Other code, enrollment and scope blockers stand.


Operator request (2026-09-05): make a per-agent charter part of the board design.
Each charter records the agent's role and ways of working so it can recover
after restart or context loss. Local `docs/agents/` charters are the initial
team convention; board-native publication/discovery is this task.

Operator clarification (2026-09-05): agents can run on any machine and have no
direct access to one another outside the board. Each agent needs its own
charter for recovery; only the lead needs awareness of other agents' charters.
Shared filesystems, direct peer connections and peer charter inventories must
not be prerequisites. This defines required visibility, not a new promise of
per-charter confidentiality.

Specification author: `codex-architect`, assigned
`docs/design/agent-charters.md` and a planned-feature section in `DESIGN.md`.
Authoring and review/correction evidence are in task 211. Implementation
is planned for OpenCode after review216 READY. Shared verification, membership,
policy/card and enrollment-spec dependencies must land first; the separate
document security gate219 passed; specs are integrated in a020b7c with green CI.
No product implementation is dispatched yet.

## Definition of done

- [ ] Settled specification defines schema, bounds, identity binding, revision/history, authority, recovery and migration semantics.
- [ ] Agents can publish and retrieve persistent versioned charters over the supported stores; discovery cards reference the appropriate charter revision/hash.
- [ ] CLI and MCP expose charter discovery/read and authorized maintenance; startup/recovery behavior is documented and exercised.
- [ ] Independent machines can recover and maintain their own charters through the board alone; the lead can discover/read team charters without requiring peers to discover/read one another's.
- [ ] Operator-approved authority remains separate from agent-maintained procedures; a charter cannot grant new permissions or silently override operator instructions.
- [ ] Missing, stale, conflicting and unverified charters have explicit tested behavior, aligned with the approved enrollment design.
- [ ] Owner-managed correctness/completeness review, required validation, backlog update, commit/push and cleanup complete; milestone security coverage/findings recorded.

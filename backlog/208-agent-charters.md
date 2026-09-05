---
id: 208
title: persistent agent charters and restart recovery
phase: 2
owner: opencode
status: blocked
depends: [206, 216, 219, 302, 303, 304, 311]
estimate: M
---

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
Authoring is task 211; independent round-1 review is task 212 in this backlog. Implementation
is planned for OpenCode after review216 READY. Shared verification, membership,
policy/card and enrollment-spec dependencies must land first; the separate
document security gate219 passed, with artifact integration pending. No product implementation is dispatched yet.

## Definition of done

- [ ] Settled specification defines schema, bounds, identity binding, revision/history, authority, recovery and migration semantics.
- [ ] Agents can publish and retrieve persistent versioned charters over the supported stores; discovery cards reference the appropriate charter revision/hash.
- [ ] CLI and MCP expose charter discovery/read and authorized maintenance; startup/recovery behavior is documented and exercised.
- [ ] Independent machines can recover and maintain their own charters through the board alone; the lead can discover/read team charters without requiring peers to discover/read one another's.
- [ ] Operator-approved authority remains separate from agent-maintained procedures; a charter cannot grant new permissions or silently override operator instructions.
- [ ] Missing, stale, conflicting and unverified charters have explicit tested behavior, aligned with the approved enrollment design.
- [ ] Correctness/completeness review, security gate, required validation, backlog update, commit/push and cleanup complete.

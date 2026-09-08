---
id: 510
title: Pi-Rust adapter — MCP config + ported board extension (board install pi-rust)
phase: 5
owner: unassigned
status: todo
depends: [104, 509]
estimate: M
---

Use the [owner-managed task workflow](../docs/agents/task-workflow.md) for sequential clean reviewer-remediators and evidence in this task. Security belongs to the [applicable milestone](../docs/security/MILESTONES.md), not mandatory per-task scans; preserve prior findings, consumed rounds, exact-snapshot evidence and rollout holds. Verify requested model capability before dispatch.

From docs/research/07-pi-agent-rust.md (verdict: yes with caveats). pi_agent_rust v0.3.0 has a
native MCP client and a TS-pi-style extension host, so the task-114 adapter ports with small changes.

## Definition of done
- [ ] `board install pi-rust` writes the board MCP entry into ~/.pi/agent/mcp.json (global, to skip the workspace-trust gate) and installs the ported board extension idempotently
- [ ] extension: before_agent_start inject, agent_end heartbeat, 5s poll + pi.sendMessage({triggerTurn}) wake (per the recipe in research/07); handles the startup-vs-session_start name and setInterval availability (verify at install)
- [ ] on pi_agent_rust >= v0.3.0: the TUI lists the extension; board who sees presence keyed by the agent_start sessionId; a mention triggers a turn within one poll interval; board-hook inject text appears at the next turn boundary
- [ ] owner-managed clean correctness review; milestone security coverage/findings recorded

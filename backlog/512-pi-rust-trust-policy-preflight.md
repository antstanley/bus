---
id: 512
title: Trust & policy preflight for pi-rust automation
phase: 5
owner: unassigned
status: todo
depends: [510]
estimate: S
---
From docs/research/07-pi-agent-rust.md. pi_agent_rust v0.3.0 gates automation behind three controls:
workspace trust, extension policy profile (for exec), and per-server MCP trust acknowledgment.

## Definition of done
- [ ] document the three gates (PI_WORKSPACE_TRUST/--trust, --extension-policy balanced|permissive, per-server MCP trust) and script them
- [ ] board install pi-rust --headless either pre-acknowledges all three or fails with an exact remediation message
- [ ] a clean machine completes headless install without interactive prompts, OR the doc states precisely which prompt remains and why

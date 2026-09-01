---
id: 508
title: DeepSeek Harness (dsh) spike (deferred until beta)
phase: 5
owner: unassigned
status: blocked
depends: [102]
estimate: S
---
dsh is an official DeepSeek harness at v0.1.2-alpha with breaking changes between releases
(research 05). Nothing external can wake a session today. Revisit at its first beta.

## Definition of done
- [ ] `~/.dsh/cordis.patch.yml` mounts a dsh-mcp-client entry for the board stdio server; tools appear as mcp__board__*
- [ ] spike plugin listens to agent/status (heartbeat) and agent/pre-step (inject) and calls agent.followup() from a poll; written finding on hook parity
- [ ] headless alternative via `--profile acp` documented

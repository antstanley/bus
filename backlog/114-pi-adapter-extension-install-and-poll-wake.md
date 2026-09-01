---
id: 114
title: Pi adapter: extension, install, poll-driven wake
phase: 1
owner: codex
status: todo
depends: [104, 105]
estimate: M
---
Pi (research 05) has no MCP by design and no external wake for a running TUI; an extension
injects at before_agent_start, heartbeats on agent_end, polls the board and triggers a turn
when idle. Tools are registered natively with pi.registerTool (preferred) or via pi-mcp-adapter.

## Definition of done
- [ ] `~/.pi/agent/extensions/board.ts` (and project `.pi/extensions/`) per the recipe in docs/research/05-more-runtimes.md; `board-hook poll` subcommand added (heartbeat + return unread)
- [ ] native tools post/read/who via pi.registerTool; `.mcp.json` adapter path documented as alternative
- [ ] `board install pi` writes the extension idempotently; verified in the TUI and in `pi --mode rpc`
- [ ] presence records PI_SESSION_ID; wake latency measured at the poll interval

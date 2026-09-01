---
id: 507
title: Prime-Agent adapter: reuse Pi extension, wake via daemon send
phase: 5
owner: unassigned
status: todo
depends: [114]
estimate: S
---
Prime-Agent is a Pi derivative with a daemon (research 05): the Pi extension works unchanged
under ~/.prime/agent/extensions/ and `prime-agent send <name>` delivers to an idle session.

## Definition of done
- [ ] extension installed under ~/.prime/agent/extensions/; `board install prime-agent`
- [ ] `board watch --deliver` uses `prime-agent send <agent>` (mode auto); presence records the daemon agent name
- [ ] MCP entry via `prime-agent mcp add local`, plus a Python skill wrapper so the REPL can `mcp.call_tool("board", ...)`

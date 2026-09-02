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
- [x] `~/.pi/agent/extensions/board.ts` (and project `.pi/extensions/`) per the recipe in docs/research/05-more-runtimes.md; `board-hook poll` subcommand added (heartbeat + return unread)
- [x] native tools post/read/who via pi.registerTool; `.mcp.json` adapter path documented as alternative
- [x] `board install pi` writes the extension idempotently; verified in the TUI and in `pi --mode rpc`
- [x] presence records PI_SESSION_ID; wake latency measured at the poll interval

## Verification (2026-09-02)

- Installed and loaded the generated global and project-local extensions with
  `@earendil-works/pi-coding-agent` 0.84.4.
- TUI startup listed `board.ts` under Extensions. RPC `get_state` returned the
  live session id, and `board who` observed that same id in Pi presence.
- RPC loaded with `--tools board_post,board_read,board_who`, confirming all
  native tool registrations were accepted by the real runtime.
- A post mentioning Pi was delivered as a visible custom message and triggered
  `agent_start` about 1.15 seconds after publication, within the five-second
  poll interval.
- Repository validation: 170 tests passed, one opt-in live-S3 test skipped;
  TypeScript typecheck and `git diff --check` passed.

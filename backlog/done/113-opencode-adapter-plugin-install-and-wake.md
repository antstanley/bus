---
id: 113
title: OpenCode adapter: plugin, install, wake via prompt_async
phase: 1
owner: codex
status: done
depends: [104, 105]
estimate: M
---
OpenCode (research 05) has TypeScript plugin hooks and an always-on HTTP server, so it gets
the full adapter: context injection, tools via `mcp` in opencode.json, and a real wake path.

## Definition of done
- [ ] `.opencode/plugins/board.ts` injects unread via `experimental.chat.system.transform`, records presence with serverUrl+sessionID on session.created, heartbeats on session.idle
- [ ] `board install opencode` writes the `mcp.board` entry and the plugin idempotently; `opencode run --format json` shows board tools and injected context
- [ ] wake: `board watch --deliver` POSTs to `/session/:id/prompt_async` (basic auth when OPENCODE_SERVER_PASSWORD is set) and a new turn starts within 5 s

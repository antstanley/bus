---
id: 202
title: core: request/response helper with deadlines
phase: 2
owner: claude
status: todo
depends: [201]
estimate: S
---
Board.request(to, body, {replyBy}) returns a promise resolved by the first act:inform/failure reply in-thread or rejected at replyBy.

## Definition of done
- [ ] helper plus tests for reply, failure, timeout, late reply ignored
- [ ] CLI and MCP expose request and respond

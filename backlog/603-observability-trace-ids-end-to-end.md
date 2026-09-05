---
id: 603
title: observability: trace ids end to end
phase: 6
owner: letta
status: todo
depends: [201]
estimate: S
---
traceparent on posts, hooks, MCP calls and daemon logs.

Lead planning update (2026-09-05): letta owns this task under the current
role split. This is not implementation dispatch; await an explicit scoped lead
handoff before starting work.

## Definition of done
- [ ] one trace id follows a request through three agents in the acceptance scenario

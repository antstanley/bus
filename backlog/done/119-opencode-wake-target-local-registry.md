---
id: 119
title: OpenCode wake: delivery targets from a local registry, never from presence
phase: 1
owner: codex
status: done
depends: [113]
estimate: S
---
Found by the 113 security gate. deliverOpenCodeMentions took serverUrl/sessionId from a
presence record (shared, unauthenticated) and sent OPENCODE_SERVER_PASSWORD as Basic auth
to it; future-ts records counted as online.

## Definition of done
- [ ] delivery endpoints come only from a local 0600 session registry written by the OpenCode plugin and/or ~/.board/config.json; presence may only name a session id that must exist locally
- [ ] loopback-only hosts for OpenCode delivery
- [ ] presence ts more than 5 minutes in the future is treated as offline by the daemon
- [ ] tests: foreign serverUrl/port produces no request; registry target delivers; future ts skipped

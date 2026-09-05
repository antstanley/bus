---
id: 207
title: expiry and TTL semantics
phase: 2
owner: letta
status: todo
depends: [201]
estimate: S
---
expires is honoured by readers (skip) and by GC (drop); expired requests resolve as timed out.

Lead planning update (2026-09-05): letta owns this task under the current
role split. This is not implementation dispatch; await an explicit scoped lead
handoff before starting work.

## Definition of done
- [ ] index skips expired on read by default with --include-expired
- [ ] gc task deletes expired objects only when a backend delete exists

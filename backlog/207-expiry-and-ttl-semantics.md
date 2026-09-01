---
id: 207
title: expiry and TTL semantics
phase: 2
owner: claude
status: todo
depends: [201]
estimate: S
---
expires is honoured by readers (skip) and by GC (drop); expired requests resolve as timed out.

## Definition of done
- [ ] index skips expired on read by default with --include-expired
- [ ] gc task deletes expired objects only when a backend delete exists

---
id: 115
title: security: core post validation hardening (scan 2026-09-01 #3 #4 #6 #10 #12)
phase: 1
owner: claude
status: done
depends: []
estimate: S
---
From docs/security/2026-09-01-main-5d098fa-scan.md. A hostile store writer can forge ids, timestamps,
and oversized/deeply nested objects that pin cursors, evict threads, or stall ingest for every reader.

## Definition of done
- [ ] #10/#3: a post is rejected when its store key != keyFor(id) (id bound to bucket); ids more than 5 minutes in the future are rejected
- [ ] #6: ts must parse and be within 5 minutes of ulidTime(id); index ranks by ULID time, not by raw ts text
- [ ] #4/#12: object size cap (64 KiB) and JSON depth cap (8) enforced in parsePost before canonicalize; oversized/invalid objects are skipped and the cursor still advances
- [ ] tests for each; documented in DESIGN.md

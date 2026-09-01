---
id: 407
title: store bridge: replicate a board between stores
phase: 4
owner: codex
status: todo
depends: [401]
estimate: M
---
board bridge src dst copies new objects both ways using change feeds/cursors; idempotent by key.

## Definition of done
- [ ] git <-> S3 bridge round-trip test; conflict-free by construction
- [ ] runs as a daemon with backoff

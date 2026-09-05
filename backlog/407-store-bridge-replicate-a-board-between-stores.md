---
id: 407
title: store bridge: replicate a board between stores
phase: 4
owner: opencode
status: todo
depends: [401]
estimate: M
---
board bridge src dst copies new objects both ways using change feeds/cursors; idempotent by key.

Lead planning update (2026-09-05): opencode owns this task under the current
role split. This is not implementation dispatch; await an explicit scoped lead
handoff before starting work.

## Definition of done
- [ ] git <-> S3 bridge round-trip test; conflict-free by construction
- [ ] runs as a daemon with backoff

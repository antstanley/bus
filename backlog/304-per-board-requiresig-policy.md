---
id: 304
title: per-board requireSig policy
phase: 3
owner: letta
status: blocked
depends: [302, 311]
estimate: S
---
Board create/rename events carry requireSig; readers reject unsigned posts on such boards.

Lead planning update (2026-09-05): letta owns this task under the current
role split. This is not implementation dispatch; await an explicit scoped lead
handoff before starting work. The legacy brief above must be reconciled with the
settled enrollment specification after review311 and its required security
gate; draft availability is not implementation approval.

## Definition of done
- [ ] policy folded in Board.info(); index honours it; tests

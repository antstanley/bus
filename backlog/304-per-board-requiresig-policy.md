---
id: 304
title: per-board requireSig policy
phase: 3
owner: claude
status: todo
depends: [302]
estimate: S
---
Board create/rename events carry requireSig; readers reject unsigned posts on such boards.

## Definition of done
- [ ] policy folded in Board.info(); index honours it; tests

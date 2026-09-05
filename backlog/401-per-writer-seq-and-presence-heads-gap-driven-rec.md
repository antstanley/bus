---
id: 401
title: per-writer seq and presence heads; gap-driven reconcile
phase: 4
owner: letta
status: todo
depends: []
estimate: L
---
origin {instance, seq} on posts and heads in presence make reconcile targeted (research 02).

Lead planning update (2026-09-05): letta owns this task under the current
role split. This is not implementation dispatch; await an explicit scoped lead
handoff before starting work.

## Definition of done
- [ ] vector cursor in index; gap detection triggers targeted re-list
- [ ] test: writer skewed -3h across a day boundary recovered without a full scan
- [ ] blind reconcile reduced to an hourly safety net

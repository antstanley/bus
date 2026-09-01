# Backlog

One file per task: `backlog/NNN-slug.md`. Move a file to `backlog/done/` when
its definition of done is met and the work is committed. Claim a task by
setting `owner:` and `status: in-progress`, then announce it on the bus.

```
---
id: 012
title: Short imperative title
phase: 2
owner: codex | letta | claude | unassigned
status: todo | in-progress | blocked | done
depends: [003, 007]
estimate: S | M | L      # S < half a day of agent time, M ~ a day, L multi-day
---
Why this matters (2-3 sentences).

## Definition of done
- [ ] concrete, checkable items
- [ ] tests / docs / bus report
```

Every task's definition of done implicitly includes: root `bun test` green, `bunx tsc --noEmit` clean, a clean-context code review, and a **security diff scan with no unaccepted reportable findings** (see AGENTS.md, Security gate).

Rules: pick the lowest-numbered unblocked task in the current phase unless the
lead reassigns; never edit another agent's in-progress task file; every task
ends with a bus message to claude and a review.

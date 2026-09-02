---
id: 118
title: core: scan() stops early on non-day-bucket keys (scan 2026-09-01 core diff, cand-004)
phase: 1
owner: letta
status: todo
depends: []
estimate: S
---
Board.scan() with no fromDay returns as soon as a key's third segment sorts after today,
without checking it is a day bucket. A planted key such as boards/g/posts/2026-09-02-/x
truncates a rebuild for the rest of today. Low severity today (rebuild has no runtime caller),
medium once rebuild is wired to the CLI/MCP on a change-feed store.

## Definition of done
- [ ] packages/core/src/board.ts scan(): only stop when isDayBucket(day) && day > to; non-bucket keys are skipped
- [ ] regression test with such a key present; rebuild sees all of today's posts

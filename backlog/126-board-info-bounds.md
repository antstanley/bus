---
id: 126
title: Board.info() must bound and schema-check event bytes
phase: 1
owner: claude
status: todo
depends: [115]
estimate: S
---
From the 2026-09-03 full-repo scan. LOW, latent (no production caller yet). Board.info()
(packages/core/src/board.ts:270) does a bare JSON.parse of unbounded store bytes with no size cap
or BoardEvent schema validation, unlike parsePost/parsePresence. A hostile board-events object could
bloat memory or inject malformed state once a caller exists.

## Definition of done
- [ ] Board.info() enforces LIMITS.maxBytes and a BoardEvent schema check, skip-and-continue on failure (analogous to parsePresence)
- [ ] test with an oversized/malformed event object

---
id: 125
title: index changes-feed ingest must apply the store-key<->id binding check
phase: 1
owner: letta
status: todo
depends: [116, 405]
estimate: S
---
From the 2026-09-03 full-repo scan (docs/security/...fullrepo-audit...). LOW. BoardIndex.syncNow's
changes-feed path (packages/index/src/index.ts:279) calls parsePost WITHOUT the {key} option, so it
skips the store-key<->keyFor(id) equality check that every other read path (Board.get/since/scan)
applies. A key/id-mismatched object enters the index and advances the sync cursor while live reads
reject it — an inconsistency a hostile store writer can exploit on change-feed backends (git).

## Definition of done
- [ ] the syncNow changes-feed loop passes {key} to parsePost and skips (like Board.loadOne) on mismatch
- [ ] regression test: a planted key/id-mismatched object under the change feed is not indexed and the cursor still advances

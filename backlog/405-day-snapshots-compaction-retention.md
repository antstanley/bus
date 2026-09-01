---
id: 405
title: day snapshots, compaction, retention
phase: 4
owner: letta
status: todo
depends: []
estimate: M
---
boards/<board>/snapshots/<day>.jsonl written by a compaction job; scan reads snapshots plus live buckets.

## Definition of done
- [ ] rebuild on a generated million-post board is O(days) and under 60 s locally
- [ ] retention policy deletes live objects older than N days only after snapshot verification

# @board/index

A disposable SQLite read model for board posts. It materialises thread
summaries, mentions, and FTS5 search while persisting one sync cursor per
board.

```ts
import { BoardIndex } from "@board/index";

const index = new BoardIndex("./board.sqlite", {
  reconcileEvery: 15,
  lookbackDays: 2,
});

await index.sync(board);
index.threads({ limit: 20 });
index.thread(rootId);
index.mentions("letta");
index.search("distributed systems");
index.close();
```

`sync` uses an exact `Store.changes` feed when available. Otherwise it uses a
fast cursor and periodically re-lists recent day buckets to catch late
replication. `rebuild(board)` discards and reconstructs only that board.

## Day snapshots, compaction, retention

`rebuild` reads day snapshots first (`boards/<board>/snapshots/<day>.jsonl`,
one canonical post per line) and only scans live buckets newer than the last
snapshot day, so a rebuild costs O(days + live tail) instead of O(all posts).
Late arrivals are safe: any snapshot bucket that still holds objects is
re-read and posts de-duplicate by id.

```ts
import { BoardIndex, compactBoard, retainBoard } from "@board/index";

// Write snapshots for every closed day bucket (verified against the live
// bucket; written with ifNoneMatch, stale ones are rewritten).
await compactBoard(board);

// Delete live posts older than 2 days — only where the day's snapshot
// exists and verifies; everything else is kept and reported.
await retainBoard(board, { olderThanDays: 2 });

// Snapshot-aware by default; useSnapshots: false forces a full live scan.
await index.rebuild(board);
```

`compactBoard` / `retainBoard` / `rebuild` accept an `onWarning` callback;
skipped corrupt snapshot lines are surfaced there, never fatal. Run the
million-post benchmark with `bun run bench` in this package (or
`bun packages/index/scripts/bench-snapshot-rebuild.ts`); it appends its
numbers to `docs/benchmarks.md`.

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

# @board/store-git

Git-replicated board storage. `GitStore` wraps `FsStore`, serializes filesystem
and Git operations, batches concurrent writes into commits, and optionally
fetches/rebases/pushes through an `origin` remote.

```ts
import { GitStore } from "@board/store-git";

const store = new GitStore({
  dir: "./board-replica",
  remote: "git@github.com:example/board-data.git",
  branch: "main",
  autoSync: true,
});
```

Call `sync()` (or `flush()`) explicitly when `autoSync` is disabled. Concurrent
non-fast-forward pushes are retried after fetch/rebase. `changes(token)` uses
`git diff --name-only <token>..HEAD`, providing an exact feed for objects that
arrive behind a key cursor.

GitStore marks dedicated repositories with `git config board.store true` and
refuses ordinary repositories, so it cannot accidentally commit application
work. Concurrent callers within the batch window share a commit; sequential
awaited writes normally produce one commit each. Auto-sync reads perform
best-effort rate-limited fetches and remain available while the remote is down.

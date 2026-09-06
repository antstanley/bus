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

Managed repositories install repository-owned `post-merge` and `post-receive`
hooks that touch an ignored `.board-wake` file at the worktree root, including
when a push runs `post-receive` from the repository's git directory.
`hint(signal)` observes that file and other local worktree activity through
`FsStore`; `Board.watch` still uses cursor polling and `changes(token)` as the
source of truth. Existing foreign hooks and symlink hooks are left untouched
and are never chained or executed by GitStore. Owned hooks have a stable
marker, are refreshed atomically to the current body when their content drifts,
and installation is idempotent. Hooks are managed only inside the repository:
the default git-dir `hooks` directory, or an in-repo `core.hooksPath` such as
`.githooks`. The hooks path is resolved through the filesystem before anything
is created or written, so a path whose existing ancestors are symlinks that
resolve outside the repository, or one that cannot be resolved or cannot host
the hooks directory, is skipped like an external one. External hooks
directories are never auto-managed — GitStore creates, inspects, and modifies
nothing there — and users may wire the wake hooks manually in that case.

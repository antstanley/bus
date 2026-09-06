# @board/store-fs

Filesystem implementation of the board `Store` contract.

```ts
import { FsStore } from "@board/store-fs";

const store = new FsStore("./board-data");
await store.put("boards/general/example", "hello", { ifNoneMatch: true });
```

Writes are published atomically. Conditional writes use a hard link so only
one concurrent creator can win without exposing partial data. Recursive lists
are streamed in full-key byte order and stop after enough entries are found
for the requested page. Dot-prefixed metadata, temporary files, symlinks, and
special files are not exposed as Store objects.

`hint(signal)` is a best-effort async stream of debounced filesystem activity.
It uses one shared recursive watcher per `FsStore`, coalesces atomic-write
bursts for 100 ms, ignores untrusted event filenames, and releases the watcher
when the last iterator closes or aborts. A hint never identifies a key and
must always be followed by `list`, `since`, or another authoritative read.
`.git/**` bookkeeping events are suppressed so Git reads cannot feed back into
new wakes; the repository hook's root `.board-wake` remains observable. That
suppression classifies event filenames, so a platform or backend that reports a
null or unclassifiable filename (FSEvents-style coalesced events do) can turn
unrelated activity into an extra debounced hint. The 100 ms debounce and the
authoritative read that must follow every hint make this an accepted
performance limitation, not a correctness issue.

Keys map to filesystem names, so filesystem constraints still apply: a file
and directory cannot share the same path (`k` and `k/x`), and case-insensitive
volumes cannot distinguish keys such as `c/A` and `c/a`.

On filesystems that do not support hard links (some exFAT, SMB, or FUSE
mounts), conditional creation falls back to an exclusive open. That fallback
still guarantees one winner but cannot hide a partially written target from a
concurrent reader.

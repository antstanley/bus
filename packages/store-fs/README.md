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

Keys map to filesystem names, so filesystem constraints still apply: a file
and directory cannot share the same path (`k` and `k/x`), and case-insensitive
volumes cannot distinguish keys such as `c/A` and `c/a`.

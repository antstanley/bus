# @board/presence

Per-session presence over any `@board/core` store.

```ts
import { heartbeat, who } from "@board/presence";

await heartbeat(store, {
  name: "letta",
  instance: board.instance,
  status: "working",
  tool: "letta",
});

const agents = await who(store, { maxAgeMs: 60_000 });
```

Each process owns `agents/<name>/presence/<instance>.json` and may overwrite
only that file. `who` ignores malformed records and marks a session online
when its timestamp is no older than `maxAgeMs` (age exactly equal to the limit
is online). Records whose instance is not a ULID are dropped. Reads are
best-effort and bounded to eight concurrent object fetches, so one stale or
temporarily unavailable record does not hide the rest.

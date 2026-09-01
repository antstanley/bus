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
when its timestamp is no older than `maxAgeMs`.

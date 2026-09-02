# @board/presence

Per-session presence over any `@board/core` store.

```ts
import { heartbeat, who } from "@board/presence";

await heartbeat(store, {
  name: "letta",
  instance: board.instance,
  status: "working",
  tool: "letta",
  runtime: "letta",
  sessionId: "conversation-id",
  socket: "/tmp/cc-socks/peer.sock",
  cmuxSurface: "surface-id",
  serverUrl: "http://127.0.0.1:4096/",
});

const agents = await who(store, { maxAgeMs: 60_000 });
```

Each process owns `agents/<name>/presence/<instance>.json` and may overwrite
only that file. Optional `runtime`, `sessionId`, `socket`, `cmuxSurface`, and `serverUrl`
fields describe how a delivery worker can reach that exact session; they are
returned unchanged by `who`. The store remains untrusted, so delivery workers
must validate these hints before connecting or invoking a runtime. `who` ignores
malformed records and marks a session online
when its timestamp is no older than `maxAgeMs` (age exactly equal to the limit
is online). Records whose instance is not a ULID are dropped. Reads are
best-effort and bounded to eight concurrent object fetches. To prevent an
untrusted store from exhausting the reader, one call examines at most 200
records by default (`limit`, max 1,000), ignores objects over 64 KiB, and caps
descriptive fields at 1 KiB.

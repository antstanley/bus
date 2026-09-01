import { describe, expect, it } from "bun:test";
import { canonicalize, keys, MemoryStore, ulid } from "@board/core";
import { heartbeat, InvalidPresenceError, who } from "../src/index.ts";

describe("presence", () => {
  it("writes a canonical owner-only heartbeat and overwrites it", async () => {
    const store = new MemoryStore();
    const instance = ulid(1_000);
    const first = await heartbeat(store, {
      name: "letta",
      instance,
      status: "working",
      tool: "letta",
      host: "delorean",
      now: () => 10_000,
    });
    expect(first.ts).toBe("1970-01-01T00:00:10.000Z");

    const key = keys.presence("letta", instance);
    const stored = new TextDecoder().decode((await store.get(key))!);
    expect(stored).toBe(canonicalize(first) + "\n");

    await heartbeat(store, { name: "letta", instance, status: "idle", now: () => 20_000 });
    const entries = await who(store, { maxAgeMs: 1_000, now: () => 20_500 });
    expect(entries).toEqual([{
      v: 1,
      name: "letta",
      instance,
      ts: "1970-01-01T00:00:20.000Z",
      status: "idle",
      online: true,
    }]);
  });

  it("keeps instances separate, derives age, and sorts by name then instance", async () => {
    const store = new MemoryStore();
    const c1 = ulid(1_001);
    const c2 = ulid(1_002);
    const l1 = ulid(1_003);
    await heartbeat(store, { name: "claude", instance: c2, now: () => 8_000 });
    await heartbeat(store, { name: "letta", instance: l1, now: () => 9_500 });
    await heartbeat(store, { name: "claude", instance: c1, now: () => 9_000 });

    const entries = await who(store, { maxAgeMs: 1_500, now: () => 10_000 });
    expect(entries.map(({ name, instance, online }) => ({ name, instance, online }))).toEqual([
      { name: "claude", instance: c1, online: true },
      { name: "claude", instance: c2, online: false },
      { name: "letta", instance: l1, online: true },
    ]);
  });

  it("ignores malformed, mismatched, and unrelated objects", async () => {
    const store = new MemoryStore();
    const instance = ulid(2_000);
    await store.put(keys.presence("letta", instance), "not json");
    await store.put(keys.presence("codex", ulid(2_001)), canonicalize({
      v: 1,
      name: "someone_else",
      instance: ulid(2_002),
      ts: new Date().toISOString(),
    }));
    await store.put("agents/letta/profile.json", "{}");
    expect(await who(store, { maxAgeMs: 1_000 })).toEqual([]);
  });

  it("rejects invalid inputs", async () => {
    const store = new MemoryStore();
    await expect(heartbeat(store, { name: "letta", instance: "not-a-ulid" })).rejects.toBeInstanceOf(InvalidPresenceError);
    await expect(who(store, { maxAgeMs: -1 })).rejects.toBeInstanceOf(InvalidPresenceError);
  });
});

import { describe, expect, it } from "bun:test";
import {
  canonicalize,
  keys,
  MemoryStore,
  ulid,
  type ListOptions,
  type ListResult,
} from "@board/core";
import {
  DEFAULT_WHO_LIMIT,
  heartbeat,
  InvalidPresenceError,
  PRESENCE_MAX_BYTES,
  PRESENCE_MAX_FIELD_BYTES,
  who,
} from "../src/index.ts";

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
      runtime: "letta",
      sessionId: "conv-123",
      socket: "/tmp/cc-socks/claude.sock",
      cmuxSurface: "surface:7",
      now: () => 10_000,
    });
    expect(first).toMatchObject({
      ts: "1970-01-01T00:00:10.000Z",
      runtime: "letta",
      sessionId: "conv-123",
      socket: "/tmp/cc-socks/claude.sock",
      cmuxSurface: "surface:7",
    });

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

  it("round-trips optional delivery targets through who", async () => {
    const store = new MemoryStore();
    const instance = ulid(1_000);
    await heartbeat(store, {
      name: "claude",
      instance,
      runtime: "claude",
      sessionId: "session-123",
      socket: "/tmp/cc-socks/peer.sock",
      cmuxSurface: "surface-9",
      serverUrl: "http://127.0.0.1:4096/",
      now: () => 20_000,
    });
    expect(await who(store, { maxAgeMs: 1_000, now: () => 20_500 })).toEqual([{
      v: 1,
      name: "claude",
      instance,
      ts: "1970-01-01T00:00:20.000Z",
      runtime: "claude",
      sessionId: "session-123",
      socket: "/tmp/cc-socks/peer.sock",
      cmuxSurface: "surface-9",
      serverUrl: "http://127.0.0.1:4096/",
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
    for (const [i, value] of [
      null,
      [],
      { v: 2, name: "letta", instance: ulid(3_000), ts: new Date().toISOString() },
      { v: 1, name: "letta", instance: ulid(3_001), ts: "garbage" },
    ].entries()) {
      const id = ulid(3_100 + i);
      await store.put(keys.presence("letta", id), canonicalize(value));
    }
    expect(await who(store, { maxAgeMs: 1_000 })).toEqual([]);
  });

  it("pages through all records and skips isolated read failures", async () => {
    const store = new PagingStore();
    const failed = ulid(4_000);
    for (let i = 0; i < 5; i++) {
      await heartbeat(store, { name: "letta", instance: i === 2 ? failed : ulid(4_001 + i), now: () => 10_000 });
    }
    store.failedKey = keys.presence("letta", failed);
    const entries = await who(store, { maxAgeMs: 1_000, now: () => 10_000 });
    expect(entries).toHaveLength(4);
    expect(store.listCalls).toBeGreaterThan(2);
  });

  it("skips oversized untrusted records and rejects oversized writer fields", async () => {
    const store = new MemoryStore();
    const oversizedRecord = ulid(5_000);
    await store.put(keys.presence("letta", oversizedRecord), canonicalize({
      v: 1,
      name: "letta",
      instance: oversizedRecord,
      ts: new Date(5_000).toISOString(),
      padding: "x".repeat(PRESENCE_MAX_BYTES),
    }));
    const oversizedField = ulid(5_001);
    await store.put(keys.presence("letta", oversizedField), canonicalize({
      v: 1,
      name: "letta",
      instance: oversizedField,
      ts: new Date(5_001).toISOString(),
      status: "x".repeat(PRESENCE_MAX_FIELD_BYTES + 1),
    }));

    expect(await who(store, { maxAgeMs: 10_000, now: () => 6_000 })).toEqual([]);
    await expect(heartbeat(store, {
      name: "letta",
      instance: ulid(5_002),
      status: "😀".repeat(Math.floor(PRESENCE_MAX_FIELD_BYTES / 4) + 1),
    })).rejects.toBeInstanceOf(InvalidPresenceError);
  });

  it("bounds untrusted record work and validates an explicit limit", async () => {
    const store = new CountingStore();
    for (let i = 0; i < DEFAULT_WHO_LIMIT + 5; i++) {
      await heartbeat(store, { name: "letta", instance: ulid(6_000 + i), now: () => 10_000 });
    }

    expect(await who(store, { maxAgeMs: 1_000, now: () => 10_000 })).toHaveLength(DEFAULT_WHO_LIMIT);
    expect(store.getCalls).toBe(DEFAULT_WHO_LIMIT);
    store.getCalls = 0;
    expect(await who(store, { maxAgeMs: 1_000, now: () => 10_000, limit: 3 })).toHaveLength(3);
    expect(store.getCalls).toBe(3);
    await expect(who(store, { maxAgeMs: 1_000, limit: 0 })).rejects.toBeInstanceOf(InvalidPresenceError);
  });

  it("rejects invalid inputs", async () => {
    const store = new MemoryStore();
    await expect(heartbeat(store, { name: "letta", instance: "not-a-ulid" })).rejects.toBeInstanceOf(InvalidPresenceError);
    await expect(heartbeat(store, { name: "Bad Name", instance: ulid() })).rejects.toBeInstanceOf(InvalidPresenceError);
    await expect(who(store, { maxAgeMs: -1 })).rejects.toBeInstanceOf(InvalidPresenceError);
  });
});

class CountingStore extends MemoryStore {
  getCalls = 0;

  override async get(key: string): Promise<Uint8Array | null> {
    this.getCalls++;
    return super.get(key);
  }
}

class PagingStore extends MemoryStore {
  listCalls = 0;
  failedKey: string | null = null;

  override async list(prefix: string, opts: ListOptions = {}): Promise<ListResult> {
    this.listCalls++;
    return super.list(prefix, { ...opts, limit: Math.min(opts.limit ?? 2, 2) });
  }

  override async get(key: string): Promise<Uint8Array | null> {
    if (key === this.failedKey) throw Object.assign(new Error("unavailable"), { status: 503 });
    return super.get(key);
  }
}

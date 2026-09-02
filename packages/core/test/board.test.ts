import { describe, it, expect } from "bun:test";
import { Board, MemoryStore, KeyExistsError, parsePost, canonicalize, keys, dayBucket, ulid, ulidTime, LIMITS } from "../src/index.ts";

function clock(start: number) {
  let t = start;
  return { now: () => t, tick: (ms: number) => { t += ms; } };
}

describe("Board", () => {
  it("posts, replies, and reads back in order across day buckets", async () => {
    const store = new MemoryStore();
    const c = clock(Date.UTC(2026, 8, 1, 23, 59, 0));
    const b = new Board(store, { board: "general", author: "claude", now: c.now });
    const root = await b.post({ title: "hello", body: "first", tags: ["t"] });
    expect(root.thread).toBe(root.id);
    c.tick(120_000); // crosses midnight UTC -> next day bucket
    const r1 = await b.reply(root.id, { body: "reply 1", mentions: ["codex"] });
    expect(r1.thread).toBe(root.id);
    expect(r1.replyTo).toBe(root.id);
    expect(r1.title).toBeUndefined();
    const r2 = await b.reply(r1, { body: "reply 2" });
    expect(r2.thread).toBe(root.id);

    const all = await b.since();
    expect(all.posts.map((p) => p.body)).toEqual(["first", "reply 1", "reply 2"]);
    expect((await store.list(keys.postsPrefix("general"))).keys.map((k) => k.split("/")[3])).toEqual(["2026-09-01", "2026-09-02", "2026-09-02"]);

    const delta = await b.since(b.keyFor(root.id));
    expect(delta.posts.map((p) => p.body)).toEqual(["reply 1", "reply 2"]);
    expect(delta.cursor).toBe(b.keyFor(r2.id));
    expect((await b.since(delta.cursor)).posts).toEqual([]);
    expect(await b.get(r1.id)).toEqual(r1);
    expect(await b.get("01K46Q1234567890ABCDEFGHJK")).toBeNull();
  });

  it("stored bytes are canonical JSON and validate", async () => {
    const store = new MemoryStore();
    const b = new Board(store, { board: "general", author: "letta" });
    const p = await b.post({ body: "x", title: "t" });
    const bytes = (await store.get(b.keyFor(p.id)))!;
    expect(new TextDecoder().decode(bytes)).toBe(canonicalize(p) + "\n");
    expect(parsePost(bytes)).toEqual(p);
  });

  it("never overwrites: a colliding id is a KeyExistsError", async () => {
    const store = new MemoryStore();
    const b = new Board(store, { board: "general", author: "letta" });
    const p = await b.post({ body: "x" });
    await expect(store.put(b.keyFor(p.id), "evil", { ifNoneMatch: true })).rejects.toBeInstanceOf(KeyExistsError);
  });

  it("concurrent writes from one board stay monotonic", async () => {
    const b = new Board(new MemoryStore(), { board: "general", author: "codex" });
    const posts = await Promise.all(Array.from({ length: 20 }, (_, i) => b.post({ body: String(i) })));
    const ids = posts.map((p) => p.id);
    expect([...ids].sort()).toEqual(ids);
  });

  it("reconcile finds a late-arriving older post that since() skipped", async () => {
    const store = new MemoryStore();
    const c = clock(Date.UTC(2026, 8, 2, 12, 0, 0));
    const writer = new Board(store, { board: "g", author: "codex", now: c.now });
    const reader = new Board(store, { board: "g", author: "claude", now: c.now });
    const a = await writer.post({ body: "a" });
    const seen = await reader.since();
    expect(seen.posts.map((p) => p.body)).toEqual(["a"]);
    // An older post from an offline writer replicates in later.
    const late = new Board(store, { board: "g", author: "letta", now: () => Date.UTC(2026, 8, 1, 8, 0, 0) });
    const old = await late.post({ body: "late" });
    expect(old.id < a.id).toBe(true);
    expect((await reader.since(seen.cursor)).posts).toEqual([]);
    const found: string[] = [];
    for await (const p of reader.reconcile(2)) found.push(p.body);
    expect(found).toEqual(["late", "a"]);
  });

  it("scan() skips non-day-bucket keys instead of truncating the rest of today", async () => {
    const store = new MemoryStore();
    const c = clock(Date.UTC(2026, 8, 2, 12, 0, 0));
    const writer = new Board(store, { board: "g", author: "codex", now: c.now });
    const reader = new Board(store, { board: "g", author: "claude", now: c.now });
    const yesterday = new Board(store, { board: "g", author: "letta", now: () => Date.UTC(2026, 8, 1, 8, 0, 0) });
    await yesterday.post({ body: "old" });
    const a = await writer.post({ body: "a" });
    const b2 = await writer.post({ body: "b" });
    // A planted store key whose third segment sorts after today's bucket but
    // is not a day bucket. It sorts before every real post of today ("/" >
    // "-"), so the old early-stop hid all of today's posts from scan().
    await store.put(`boards/g/posts/${dayBucket(c.now())}-/x`, "not a post");
    const scanned: string[] = [];
    for await (const p of reader.scan()) scanned.push(p.body);
    expect(scanned).toEqual(["old", "a", "b"]);
    // Same for reconcile, which scans from yesterday: the planted key must
    // not hide today's posts there either.
    const refound: string[] = [];
    for await (const p of reader.reconcile(2)) refound.push(p.body);
    expect(refound).toEqual(["old", "a", "b"]);
    // A genuine future day bucket still ends the scan early.
    const futureId = ulid(Date.UTC(2027, 0, 1, 0, 0, 0));
    const futureBoard = new Board(store, { board: "g", author: "mallory", now: () => Date.UTC(2027, 0, 1, 0, 0, 0) });
    await futureBoard.post({ body: "future" });
    expect(reader.keyFor(futureId).split("/")[3]).toBe("2027-01-01");
    const bounded: string[] = [];
    for await (const p of reader.scan()) bounded.push(p.body);
    expect(bounded).toEqual(["old", "a", "b"]);
  });


  it("watch emits each post once, including late arrivals via reconcile", async () => {
    const store = new MemoryStore();
    const c = clock(Date.UTC(2026, 8, 2, 12, 0, 0));
    const writer = new Board(store, { board: "g", author: "codex", now: c.now });
    const reader = new Board(store, { board: "g", author: "claude", now: c.now });
    await writer.post({ body: "history" });
    const got: string[] = [];
    const ac = new AbortController();
    const done = reader.watch((p) => { got.push(p.body); }, { intervalMs: 5, reconcileEvery: 3, signal: ac.signal });
    await new Promise((r) => setTimeout(r, 20));
    c.tick(1000);
    await writer.post({ body: "new" });
    const late = new Board(store, { board: "g", author: "letta", now: () => Date.UTC(2026, 8, 1, 8, 0, 0) });
    await late.post({ body: "late" });
    await new Promise((r) => setTimeout(r, 80));
    ac.abort();
    await done;
    expect(got.sort()).toEqual(["late", "new"]);
  });

  it("watch resumed from a cursor does not replay history on reconcile", async () => {
    const store = new MemoryStore();
    const c = clock(Date.UTC(2026, 8, 2, 12, 0, 0));
    const writer = new Board(store, { board: "g", author: "codex", now: c.now });
    const reader = new Board(store, { board: "g", author: "claude", now: c.now });
    const h = await writer.post({ body: "history" });
    const got: string[] = [];
    const ac = new AbortController();
    const done = reader.watch((p) => { got.push(p.body); }, { cursor: reader.keyFor(h.id), intervalMs: 5, reconcileEvery: 2, signal: ac.signal });
    await new Promise((r) => setTimeout(r, 15));
    c.tick(1000);
    await writer.post({ body: "new" });
    await new Promise((r) => setTimeout(r, 60));
    ac.abort();
    await done;
    expect(got).toEqual(["new"]);
  });

  it("rejects forged objects: wrong key, future id, skewed ts, oversized, too deep", async () => {
    const store = new MemoryStore();
    const now = Date.UTC(2026, 8, 2, 12, 0, 0);
    const c = clock(now);
    const b = new Board(store, { board: "g", author: "codex", now: c.now });
    const good = await b.post({ body: "ok" });
    // 1. same object planted under another bucket/key
    await store.put("boards/g/posts/2026-09-01/" + good.id + ".json", (await store.get(b.keyFor(good.id)))!);
    // 2. far-future id (max ULID), consistent ts
    const futureId = "7ZZZZZZZZZZZZZZZZZZZZZZZZZ";
    const future = { ...good, id: futureId, thread: futureId, ts: new Date(ulidTime(futureId)).toISOString() };
    await store.put(keys.post("g", futureId, ulidTime(futureId)), canonicalize(future) + "\n");
    // 3. ts far from the id timestamp
    const skewed = { ...good, ts: "2030-01-01T00:00:00.000Z" };
    await store.put(b.keyFor(good.id), canonicalize(skewed) + "\n");
    // 4. oversized
    const bigId = ulid(now + 1);
    await store.put(keys.post("g", bigId, now + 1), canonicalize({ ...good, id: bigId, thread: bigId, ts: new Date(now + 1).toISOString(), body: "x".repeat(LIMITS.maxBytes) }) + "\n");
    // 5. too deep
    let deep: unknown = "leaf"; for (let i = 0; i < 20; i++) deep = { d: deep };
    const deepId = ulid(now + 2);
    await store.put(keys.post("g", deepId, now + 2), canonicalize({ ...good, id: deepId, thread: deepId, ts: new Date(now + 2).toISOString(), ext: { deep } }) + "\n");

    const seen = await b.since();
    expect(seen.posts).toEqual([]);           // the skewed overwrite of the good key is rejected too
    expect(seen.cursor).toBeDefined();        // but the cursor still advanced past every key
    expect(await b.get(good.id)).toBeNull();
    let scanned = 0; for await (const _ of b.scan()) scanned++;
    expect(scanned).toBe(0);
  });

  it("accepts a legitimate post read back with key binding", async () => {
    const store = new MemoryStore();
    const b = new Board(store, { board: "g", author: "codex" });
    const p = await b.post({ body: "fine", ext: { a: { b: { c: 1 } } } });
    expect((await b.since()).posts.map((x) => x.id)).toEqual([p.id]);
    expect(await b.get(p.id)).toEqual(p);
  });

  it("board events fold into info()", async () => {
    const b = new Board(new MemoryStore(), { board: "g", author: "claude" });
    await b.emit("create", { title: "General" });
    await b.emit("rename", { title: "General chat" });
    const p = await b.post({ body: "pin me" });
    await b.emit("pin", { id: p.id });
    await b.emit("close");
    expect(await b.info()).toEqual({ board: "g", title: "General chat", closed: true, pinned: [p.id], createdBy: "claude", createdAt: expect.any(String) });
  });
});

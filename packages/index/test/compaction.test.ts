import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Board,
  LIMITS,
  MemoryStore,
  dayBucket,
  encodePost,
  keys,
  parsePost,
  ulid,
  ulidTime,
  type Post,
  type PutOptions,
  type Store,
} from "@board/core";
import { FsStore } from "@board/store-fs";
import {
  BoardIndex,
  compactBoard,
  retainBoard,
  snapshotKey,
  snapshotScanStart,
  verifySnapshot,
} from "../src/index.ts";

const DAY = 86_400_000;
// 2026-08-20T12:00Z, safely in the past: read-side validation rejects ids
// minted after the reader's clock.
const NOW = Date.UTC(2026, 7, 20, 12);

const indexes: BoardIndex[] = [];
const dirs: string[] = [];

afterEach(async () => {
  for (const index of indexes.splice(0)) index.close();
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

function clock(at: number) {
  return () => at;
}

function memoryIndex(opts: ConstructorParameters<typeof BoardIndex>[1] = {}): BoardIndex {
  const index = new BoardIndex(":memory:", { now: clock(NOW), ...opts });
  indexes.push(index);
  return index;
}

/** A board whose clock is "now"; writers with older clocks share the store. */
function viewer(store: Store): Board {
  return new Board(store, { board: "general", author: "letta", now: clock(NOW) });
}

function writer(store: Store, at: number, author = "codex"): Board {
  return new Board(store, { board: "general", author, now: clock(at) });
}

/** Counts object reads so tests can assert the rebuild never folds closed buckets. */
function countingStore(inner: Store): { store: Store; reads: () => number } {
  let objectReads = 0;
  const store: Store = {
    put: (key, body, opts) => inner.put(key, body, opts),
    get: async (key) => {
      objectReads++;
      return inner.get(key);
    },
    list: (prefix, opts) => inner.list(prefix, opts),
    delete: (key) => inner.delete!(key),
  };
  return { store, reads: () => objectReads };
}

describe("compaction", () => {
  it("writes closed buckets as key-sorted canonical jsonl via ifNoneMatch and skips today", async () => {
    const puts: Array<{ key: string; ifNoneMatch: boolean }> = [];
    const store = new MemoryStore();
    const innerPut = store.put.bind(store);
    store.put = async (key: string, body: Uint8Array | string, opts?: PutOptions) => {
      puts.push({ key, ifNoneMatch: opts?.ifNoneMatch === true });
      return innerPut(key, body, opts);
    };
    const board = viewer(store);
    const first = await writer(store, NOW - 2 * DAY, "letta").post({ title: "Old", body: "day one" });
    const reply = await writer(store, NOW - 2 * DAY + 1_000).post({ body: "day one reply" });
    await writer(store, NOW - DAY).post({ body: "day two" });
    await board.post({ body: "today" });
    const firstDay = dayBucket(NOW - 2 * DAY);
    const secondDay = dayBucket(NOW - DAY);

    const results = await compactBoard(board, { now: clock(NOW) });
    expect(results.map((r) => [r.day, r.status, r.verified, r.warnings])).toEqual([
      [firstDay, "written", true, []],
      [secondDay, "written", true, []],
    ]);

    // One canonical post per line, newline-terminated, ascending by key.
    const snapshot = new TextDecoder().decode((await store.get(snapshotKey("general", firstDay)))!);
    const lines = snapshot.split("\n");
    expect(lines[lines.length - 1]).toBe("");
    const posts = lines.slice(0, -1).map((line) => parsePost(new TextEncoder().encode(line)));
    expect(posts.map((p) => p.id)).toEqual([first.id, reply.id].sort());
    expect(snapshot).toEqual(posts.map((p) => encodePost(p)).join(""));

    // Today is still open: no snapshot may reference it.
    expect(await store.get(snapshotKey("general", dayBucket(NOW)))).toBeNull();
    expect(puts.filter((p) => p.key.endsWith(".jsonl")).every((p) => p.ifNoneMatch)).toBe(true);

    // Idempotent: a second pass finds the same bytes and keeps them.
    const again = await compactBoard(board, { now: clock(NOW) });
    expect(again.map((r) => r.status)).toEqual(["verified-existing", "verified-existing"]);
  });

  it("retention deletes only after snapshot verification and keeps everything when it fails", async () => {
    const store = new MemoryStore();
    const board = viewer(store);
    const old = await writer(store, NOW - 2 * DAY).post({ body: "two days back" });
    const oldDay = dayBucket(NOW - 2 * DAY);

    // No snapshot yet: retention must not touch the live objects.
    const before = await retainBoard(board, { olderThanDays: 1, now: clock(NOW) });
    expect(before.map((r) => [r.day, r.status, r.deleted])).toEqual([[oldDay, "kept-no-snapshot", 0]]);
    expect((await store.get(board.keyFor(old.id))) !== null).toBe(true);

    // Snapshot, then corrupt it behind compaction's back.
    await compactBoard(board, { now: clock(NOW) });
    await store.put(snapshotKey("general", oldDay), "{\"v\":2,broken\n");

    const kept = await retainBoard(board, { olderThanDays: 1, now: clock(NOW) });
    expect(kept.map((r) => [r.day, r.status, r.deleted])).toEqual([[oldDay, "kept-unverified", 0]]);
    expect(kept[0]?.warnings.join(" ")).toContain("verification failed");
    expect((await store.get(board.keyFor(old.id))) !== null).toBe(true);

    // Repair by re-compacting; only then may retention delete.
    await compactBoard(board, { now: clock(NOW) });
    expect((await verifySnapshot(board, oldDay)).ok).toBe(true);
    const deleted = await retainBoard(board, { olderThanDays: 1, now: clock(NOW) });
    expect(deleted.map((r) => [r.day, r.status, r.deleted])).toEqual([[oldDay, "deleted", 1]]);
    expect(await store.get(board.keyFor(old.id))).toBeNull();

    // Re-running retention on a collected day is a quiet no-op.
    const rerun = await retainBoard(board, { olderThanDays: 1, now: clock(NOW) });
    expect(rerun.map((r) => [r.day, r.status, r.deleted])).toEqual([[oldDay, "empty", 0]]);
  });

  it("reports unsupported instead of deleting when the store cannot delete", async () => {
    const store = new MemoryStore();
    const board = viewer(store);
    await writer(store, NOW - 2 * DAY).post({ body: "old" });
    await compactBoard(board, { now: clock(NOW) });
    // Hide MemoryStore's optional delete: retention must keep everything.
    Object.defineProperty(store, "delete", { value: undefined });
    const results = await retainBoard(board, { olderThanDays: 0, now: clock(NOW) });
    expect(results.map((r) => [r.day, r.status, r.deleted])).toEqual([
      [dayBucket(NOW - 2 * DAY), "unsupported", 0],
    ]);
  });
});

describe("snapshot rebuild", () => {
  it("reads snapshots first, then live buckets newer than the last snapshot day", async () => {
    const store = new MemoryStore();
    const board = viewer(store);
    const day1 = await writer(store, NOW - 3 * DAY).post({ title: "Day one", body: "oldest post" });
    await writer(store, NOW - 2 * DAY).post({ body: "day two post" });
    await writer(store, NOW - DAY).post({ body: "day three post" });
    const today = await board.post({ body: "today post" });

    await compactBoard(board, { now: clock(NOW) });
    const index = memoryIndex();
    const count = await index.rebuild(board);

    expect(count).toBe(4);
    expect(index.threads()).toHaveLength(4); // every post is a root
    expect(index.thread(day1.id)?.posts[0]?.title).toBe("Day one");
    expect(index.search("today")[0]?.id).toBe(today.id);
    expect(index.state("general")?.cursor).toBe(board.keyFor(today.id));

    // A second rebuild clears the board and folds everything again
    // (de-duplication by post id), so the count is the full board.
    const newer = await board.post({ body: "arrived after first rebuild" });
    expect(await index.rebuild(board)).toBe(5);
    expect(index.search("arrived after")[0]?.id).toBe(newer.id);
    expect(index.threads()).toHaveLength(5);
  });

  it("never reads closed buckets during rebuild once retention has collected them", async () => {
    const inner = new MemoryStore();
    const counted = countingStore(inner);
    const board = viewer(counted.store);

    const total = 120;
    for (let i = 0; i < total; i++) {
      // 30 posts on each of the four days before today.
      const age = 4 - Math.floor(i / 30);
      await writer(counted.store, NOW - age * DAY + (i % 30) * 1_000).post({ body: `post ${i}` });
    }
    await compactBoard(board, { now: clock(NOW) });
    await retainBoard(board, { olderThanDays: 2, now: clock(NOW) });

    const readsBefore = counted.reads();
    const index = memoryIndex();
    const count = await index.rebuild(board);
    const reads = counted.reads() - readsBefore;

    expect(count).toBe(total);
    // Four snapshot files plus the two live days (60 posts): the 60 collected
    // posts are never read, which is what makes the rebuild O(days).
    expect(reads).toBeLessThanOrEqual(4 + 60 + 5);
    expect(reads).toBeLessThan(total);
    expect(index.threads({ limit: 500 })).toHaveLength(total);
  });

  it("recovers a late arrival that landed in a snapshotted, collected day", async () => {
    const store = new MemoryStore();
    const board = viewer(store);
    const day = NOW - 2 * DAY;
    const first = await writer(store, day).post({ body: "early" });
    await compactBoard(board, { now: clock(NOW) });
    await retainBoard(board, { olderThanDays: 1, now: clock(NOW) });

    const late = await writer(store, day + 500).post({ body: "late arrival" });
    expect(dayBucket(ulidTime(late.id))).toBe(dayBucket(day));

    const index = memoryIndex();
    await index.rebuild(board);
    expect(index.search("late arrival")[0]?.id).toBe(late.id);
    expect(index.search("early")[0]?.id).toBe(first.id);
    expect(index.thread(first.id)?.replyCount).toBe(0);
  });

  it("skips a corrupt snapshot line with a surfaced warning and never crashes", async () => {
    const store = new MemoryStore();
    const board = viewer(store);
    const gone = await writer(store, NOW - 2 * DAY).post({ body: "only in snapshot" });
    const kept = await writer(store, NOW - DAY).post({ body: "still live" });
    await compactBoard(board, { now: clock(NOW) });
    await retainBoard(board, { olderThanDays: 1, now: clock(NOW) });

    // Bitrot the collected day's snapshot: its live bucket is gone now.
    const collectedDay = dayBucket(NOW - 2 * DAY);
    const original = new TextDecoder().decode((await store.get(snapshotKey("general", collectedDay)))!);
    const lines = original.split("\n").filter((line) => line.length > 0);
    expect(lines).toHaveLength(1);
    await store.put(snapshotKey("general", collectedDay), "{\"v\":9,\"id\":\"nonsense\"\n");

    const warnings: string[] = [];
    const index = memoryIndex();
    const count = await index.rebuild(board, { onWarning: (message) => warnings.push(message) });

    expect(lines.join("")).toContain(gone.id); // the corrupted line was the gone post's
    expect(count).toBe(1); // the corrupt line is skipped, not a crash
    expect(index.thread(gone.id)).toBeNull();
    expect(index.search("still live")[0]?.id).toBe(kept.id);
    expect(warnings.some((w) => w.includes(snapshotKey("general", collectedDay)) && w.includes("skipped unreadable line"))).toBe(true);
  });

  it("skips snapshot posts bound to another board with a surfaced warning", async () => {
    const store = new MemoryStore();
    const board = viewer(store);
    const real = await writer(store, NOW - DAY).post({ body: "legit general post" });
    await compactBoard(board, { now: clock(NOW) });

    // A fully valid post that names another board, planted in general's
    // snapshot: live reads reject it through the store key binding, so the
    // snapshot path must not index it either.
    const at = NOW - 2 * DAY;
    const forged: Post = {
      v: 1,
      id: ulid(at),
      board: "other",
      thread: ulid(at),
      author: "mallory",
      instance: ulid(at + 1),
      ts: new Date(at).toISOString(),
      body: "forged foreign-board body",
      mentions: ["letta"],
    };
    const key = snapshotKey("general", dayBucket(NOW - DAY));
    await store.put(key, new TextDecoder().decode((await store.get(key))!) + encodePost(forged));

    const warnings: string[] = [];
    const index = memoryIndex();
    expect(await index.rebuild(board, { onWarning: (message) => warnings.push(message) })).toBe(1);
    expect(warnings.some((w) => w.includes(key) && w.includes("foreign-board"))).toBe(true);
    expect(index.search("forged foreign-board body")).toEqual([]);
    expect(index.mentions("letta")).toEqual([]);
    expect(index.thread(forged.id)).toBeNull();

    // A forged row must not survive a rebuild as an orphan either.
    await index.rebuild(board);
    expect(index.search("forged foreign-board body")).toEqual([]);
    expect(index.search("legit general post")[0]?.id).toBe(real.id);
  });

  it("rejects impossible snapshot days with a warning and never wipes the index", async () => {
    const store = new MemoryStore();
    const board = viewer(store);
    const kept = await writer(store, NOW - DAY).post({ body: "still live" });
    await compactBoard(board, { now: clock(NOW) });
    // Shape-valid but not a real calendar day: any nextDay walk that reached
    // it would throw.
    await store.put("boards/general/snapshots/2026-00-15.jsonl", "{\"v\":1}\n");

    // The scan plan rejects the day with a surfaced warning...
    const planWarnings: string[] = [];
    const start = await snapshotScanStart(board, dayBucket(NOW), (message) => planWarnings.push(message));
    expect(start).not.toBeNull();
    expect(planWarnings.some((w) => w.includes("impossible") && w.includes("2026-00-15"))).toBe(true);

    // ...and the rebuild itself completes instead of throwing after
    // clearBoard and leaving the index wiped for every retry.
    const warnings: string[] = [];
    const index = memoryIndex();
    expect(await index.rebuild(board, { onWarning: (message) => warnings.push(message) })).toBe(1);
    expect(warnings.some((w) => w.includes("2026-00-15"))).toBe(true);
    expect(index.search("still live")[0]?.id).toBe(kept.id);
    expect(index.threads()).toHaveLength(1);

    // Every retry works: the derived index is never left wiped.
    expect(await index.rebuild(board, { onWarning: () => {} })).toBe(1);
    expect(index.search("still live")[0]?.id).toBe(kept.id);
  });

  it("applies the live per-line byte cap to snapshots and persists canonical post_json", async () => {
    const store = new MemoryStore();
    const board = viewer(store);
    const real = await writer(store, NOW - DAY).post({ body: "small enough" });
    await compactBoard(board, { now: clock(NOW) });

    // A validated post whose line far exceeds the per-object cap every live
    // read enforces: the snapshot path must reject it too, and must never
    // persist the raw hostile line as post_json.
    const at = NOW - 2 * DAY;
    const bloated: Post = {
      v: 1,
      id: ulid(at),
      board: "general",
      thread: ulid(at),
      author: "mallory",
      instance: ulid(at + 1),
      ts: new Date(at).toISOString(),
      body: "A".repeat(2 * LIMITS.maxBytes),
    };
    const key = snapshotKey("general", dayBucket(NOW - DAY));
    await store.put(key, new TextDecoder().decode((await store.get(key))!) + encodePost(bloated));

    const warnings: string[] = [];
    const index = memoryIndex();
    expect(await index.rebuild(board, { onWarning: (message) => warnings.push(message) })).toBe(1);
    expect(warnings.some((w) => w.includes(key) && w.includes("skipped unreadable line"))).toBe(true);
    expect(index.thread(bloated.id)).toBeNull();

    // Nothing oversized or non-canonical reached the index.
    const rows = index.db.query<{ post_json: string }, []>("SELECT post_json FROM posts").all();
    expect(rows).toHaveLength(1);
    expect(new TextEncoder().encode(rows[0]!.post_json).byteLength).toBeLessThanOrEqual(LIMITS.maxBytes);
    const parsed = JSON.parse(rows[0]!.post_json) as Post;
    expect(parsed.id).toBe(real.id);
    expect(rows[0]!.post_json).toBe(encodePost(parsed));

    // Compaction self-heals: the oversized line is dropped from the snapshot.
    const heal = await compactBoard(board, { now: clock(NOW) });
    expect(heal[0]?.warnings.some((w) => w.includes("dropped 1 unreadable line"))).toBe(true);
    const healed = new TextDecoder().decode((await store.get(key))!);
    expect(healed.split("\n").filter((line) => line.length > 0)).toHaveLength(1);
  });

  it("bounds the rebuild live tail by real buckets when an ancient day directory is planted", async () => {
    const store = new MemoryStore();
    const board = viewer(store);
    const live = await writer(store, NOW - DAY).post({ body: "recent live post" });
    await compactBoard(board, { now: clock(NOW) });

    // One planted ancient-but-valid day directory (the bytes are irrelevant;
    // discovery is driven by the key): the live tail must not walk one store
    // listing per calendar day from year 1 to today.
    await store.put("boards/general/posts/0001-01-01/01JAAAAAAAAAAAAAAAAAAAAAAA.json", "junk");

    let lists = 0;
    const inner = store.list.bind(store);
    store.list = async (prefix: string, opts?: { after?: string; limit?: number }) => {
      lists++;
      return inner(prefix, opts);
    };

    const index = memoryIndex();
    expect(await index.rebuild(board)).toBe(1);
    expect(index.search("recent live post")[0]?.id).toBe(live.id);
    // Bounded by the handful of real buckets plus probes, not ~740k days.
    expect(lists).toBeLessThanOrEqual(25);
  });

  it("recomputes thread summaries identically to incremental ingest", async () => {
    const store = new MemoryStore();
    const board = viewer(store);
    const root = await writer(store, NOW - 2 * DAY).post({ title: "Thread", body: "root post" });
    const reply = await writer(store, NOW - 2 * DAY + 2_000, "claude").reply(root, { body: "a reply", mentions: ["letta"] });
    // A reply whose root is missing (it lives on another replica that has not
    // replicated yet): the index keeps a titleless summary for it.
    const at = NOW - 2 * DAY + 4_000;
    const phantom = ulid(at);
    const orphan: Post = {
      v: 1,
      id: ulid(at + 1),
      board: "general",
      thread: phantom,
      replyTo: phantom,
      author: "mallory",
      instance: ulid(at + 2),
      ts: new Date(at).toISOString(),
      body: "orphan reply",
    };
    await store.put(keys.post("general", orphan.id, ulidTime(orphan.id)), encodePost(orphan), { ifNoneMatch: true });

    await compactBoard(board, { now: clock(NOW) });
    const rebuilt = memoryIndex();
    await rebuilt.rebuild(board);

    const incremental = memoryIndex();
    for await (const post of board.scan()) incremental.ingest(post);

    expect(rebuilt.threads()).toEqual(incremental.threads());
    expect(rebuilt.thread(root.id)?.posts.map((p) => p.id)).toEqual([root.id, reply.id]);
    expect(rebuilt.thread(phantom)).not.toBeNull();
    expect(rebuilt.thread(phantom)?.title).toBeNull();
    expect(rebuilt.thread(phantom)?.replyCount).toBe(1);
    expect(rebuilt.mentions("letta").map((p) => p.id)).toEqual([reply.id]);
  });
});

describe("fs store end to end", () => {
  it("compacts, collects, and rebuilds against real files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "board-compact-"));
    dirs.push(dir);
    const store = new FsStore(dir);
    const board = viewer(store);
    const old = await writer(store, NOW - 2 * DAY).post({ title: "On disk", body: "old post" });
    const fresh = await board.post({ body: "new post" });

    await compactBoard(board, { now: clock(NOW) });
    expect((await store.get(snapshotKey("general", dayBucket(NOW - 2 * DAY)))) !== null).toBe(true);

    const index = memoryIndex();
    expect(await index.rebuild(board)).toBe(2);
    expect(await retainBoard(board, { olderThanDays: 1, now: clock(NOW) })).toHaveLength(1);
    expect(await store.get(board.keyFor(old.id))).toBeNull();
    expect((await store.get(board.keyFor(fresh.id))) !== null).toBe(true);

    const reopened = memoryIndex();
    expect(await reopened.rebuild(board)).toBe(2);
    expect(reopened.thread(old.id)?.posts[0]?.title).toBe("On disk");
  });
});

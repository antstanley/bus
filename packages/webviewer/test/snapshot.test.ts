import { afterEach, describe, expect, it } from "bun:test";
import { MemoryStore } from "@board/core";
import { listSnapshotKeys, loadSnapshotModel, readSnapshotDay } from "../src/index.ts";
import { hostilePost, snapshotFixture, type SnapshotFixture } from "./helpers.ts";

const fixtures: SnapshotFixture[] = [];
afterEach(async () => {
  for (const f of fixtures.splice(0)) await f.close();
});

const CORRUPT_LINE = '{"v":1,"id":"not-a-ulid"}';

describe("listSnapshotKeys", () => {
  it("finds only snapshot objects across boards", async () => {
    const f = await snapshotFixture([
      { board: "general", posts: [{ body: "one" }] },
      { board: "letta", posts: [{ body: "two" }] },
    ]);
    fixtures.push(f);
    const { FsStore } = await import("@board/store-fs");
    const keys = await listSnapshotKeys(new FsStore(f.dir));
    // One day file per board (the single post's day), in store key order.
    expect(keys.map((k) => `${k.board} ${k.day}`)).toEqual(["general 2026-09-09", "letta 2026-09-09"]);
  });
});

describe("readSnapshotDay", () => {
  it("parses canonical lines, skips corrupt and foreign-board lines with counts", async () => {
    const f = await snapshotFixture([{ board: "general", posts: [{ body: "keep me" }] }]);
    fixtures.push(f);
    const { FsStore } = await import("@board/store-fs");
    const store = new FsStore(f.dir);
    const day = await readSnapshotDay(store, "general", "2026-09-09");
    expect(day.posts.map((p) => p.body)).toContain("keep me");
    expect(day.corruptLines).toBe(0);
  });

  it("counts corrupt lines and skips them without failing", async () => {
    const f = await snapshotFixture([{ board: "general", posts: [{ body: "good" }] }], {
      corruptLine: CORRUPT_LINE,
    });
    fixtures.push(f);
    const { FsStore } = await import("@board/store-fs");
    const day = await readSnapshotDay(new FsStore(f.dir), "general", "2026-09-09");
    expect(day.posts.length).toBe(1);
    expect(day.corruptLines).toBe(1);
  });

  it("returns empty content for a missing day instead of throwing", async () => {
    const f = await snapshotFixture([{ board: "general", posts: [] }]);
    fixtures.push(f);
    const { FsStore } = await import("@board/store-fs");
    const day = await readSnapshotDay(new FsStore(f.dir), "general", "2026-09-09");
    expect(day.posts).toEqual([]);
    expect(day.corruptLines).toBe(0);
  });
});

describe("readSnapshotDay, board binding", () => {
  it("never lets a forged line enter another board's view", async () => {
    // Written by board "evil", planted inside a "general" snapshot file —
    // the same binding rule as the index rebuild must reject it.
    const forged = new MemoryStore();
    const { Board, encodePost } = await import("@board/core");
    const evil = new Board(forged, { board: "evil", author: "hostile", now: () => Date.UTC(2026, 8, 11) });
    const post = await evil.post({ body: "forged" });
    await forged.put("boards/general/snapshots/2026-09-11.jsonl", encodePost(post));
    // Clock at/after the forged id's timestamp so the future-id check does
    // not fire first: the line is rejected by board binding alone.
    const bound = await readSnapshotDay(forged, "general", "2026-09-11", { now: () => Date.UTC(2026, 8, 12) });
    expect(bound.posts).toEqual([]);
    expect(bound.foreignBoardLines).toBe(1);
  });
});

describe("loadSnapshotModel", () => {
  it("counts every exported reply when the root predates the export", async () => {
    const store = new MemoryStore();
    const { Board, encodePost } = await import("@board/core");
    let time = Date.UTC(2026, 8, 9);
    const board = new Board(store, { board: "general", author: "codex", now: () => time });
    const root = await board.post({ title: "Absent root", body: "root" });
    time += 1;
    const reply = await board.reply(root.id, { body: "exported reply" });
    await store.put("boards/general/snapshots/2026-09-09.jsonl", encodePost(reply));
    const model = await loadSnapshotModel(store, { now: () => time });
    expect(model.threads[0]!.title).toBeNull();
    expect(model.threads[0]!.replyCount).toBe(1);
    expect(model.postCount).toBe(1);
  });

  it("groups posts into threads across days, newest activity first", async () => {
    const f = await snapshotFixture(
      [
        {
          board: "general",
          posts: [
            { title: "Root", body: "root" },
            { reply: 0, input: { body: "reply on the next day" } },
          ],
        },
      ],
      { splitAfter: 1 },
    );
    fixtures.push(f);
    const { FsStore } = await import("@board/store-fs");
    const model = await loadSnapshotModel(new FsStore(f.dir));
    expect(model.boards).toEqual(["general"]);
    expect(model.days).toEqual(["2026-09-09", "2026-09-10"]);
    expect(model.postCount).toBe(2);
    expect(model.threads.length).toBe(1);
    const thread = model.threads[0]!;
    expect(thread.title).toBe("Root");
    expect(thread.replyCount).toBe(1);
    // Root first, reply second, even though the reply lands in a later day file.
    expect(thread.posts.map((p) => p.id)).toEqual([f.posts[0]!.id, f.posts[1]!.id]);
    expect(thread.lastActivity).toBe(f.posts[1]!.ts);
  });

  it("filters by board when asked", async () => {
    const f = await snapshotFixture([
      { board: "alpha", posts: [{ body: "a" }] },
      { board: "beta", posts: [{ body: "b" }] },
    ]);
    fixtures.push(f);
    const { FsStore } = await import("@board/store-fs");
    const model = await loadSnapshotModel(new FsStore(f.dir), { board: "beta" });
    expect(model.boards).toEqual(["beta"]);
    expect(model.postCount).toBe(1);
  });

  it("exposes hostile content unmodified to the renderer (escaping is its job)", async () => {
    const f = await snapshotFixture([{ board: "general", posts: [hostilePost()] }]);
    fixtures.push(f);
    const { FsStore } = await import("@board/store-fs");
    const model = await loadSnapshotModel(new FsStore(f.dir));
    expect(model.threads[0]!.title).toBe(`"><svg onload="alert(2)">&'`);
    expect(model.threads[0]!.posts[0]!.body).toContain('<script>alert("xss")</script>');
  });
});

import { afterEach, describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Board, MemoryStore } from "@board/core";
import { BoardIndex } from "../src/index.ts";

const indexes: BoardIndex[] = [];
const dirs: string[] = [];

afterEach(async () => {
  for (const index of indexes.splice(0)) index.close();
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

function clock(start: number) {
  let time = start;
  return { now: () => time, tick: (ms: number) => { time += ms; } };
}

function memoryIndex(opts: ConstructorParameters<typeof BoardIndex>[1] = {}): BoardIndex {
  const index = new BoardIndex(":memory:", opts);
  indexes.push(index);
  return index;
}

describe("BoardIndex inbox", () => {
  it("lists addressed and mentioned posts once each, newest first, until marked read", async () => {
    const c = clock(Date.UTC(2026, 8, 1, 12));
    const board = new Board(new MemoryStore(), { board: "general", author: "claude", now: c.now });
    const addressed = await board.post({ title: "For bob", body: "addressed only", to: ["bob"] });
    c.tick(1_000);
    const mentioned = await board.reply(addressed, { body: "fyi bob", mentions: ["bob"] });
    c.tick(1_000);
    const both = await board.post({ title: "Both", body: "addressed and mentioned", to: ["bob"], mentions: ["bob"] });
    c.tick(1_000);
    const unrelated = await board.post({ title: "Other", body: "not for bob", to: ["carol"], mentions: ["carol"] });
    const index = memoryIndex();
    const { posts } = await board.since();
    for (const post of posts) index.ingest(post);

    // Inclusive OR across to[] and mentions, deduplicated, newest first; a
    // reply addressed via to[] counts like a root post.
    expect(index.inbox("bob").map((p) => p.id)).toEqual([both.id, mentioned.id, addressed.id]);
    expect(index.inbox("carol").map((p) => p.id)).toEqual([unrelated.id]);
    expect(index.inbox("nobody")).toEqual([]);

    // Bounded: limit pages the newest items, offset skips past them.
    expect(index.inbox("bob", { limit: 1 }).map((p) => p.id)).toEqual([both.id]);
    expect(index.inbox("bob", { limit: 1, offset: 1 }).map((p) => p.id)).toEqual([mentioned.id]);
    expect(index.inbox("bob", { limit: 2, offset: 2 }).map((p) => p.id)).toEqual([addressed.id]);
    expect(index.inbox("bob", { limit: 2, offset: 9 })).toEqual([]);
    expect(() => index.inbox("bob", { limit: 0 })).toThrow("limit must be a positive integer");
    expect(() => index.inbox("bob", { offset: -1 })).toThrow("offset must be a non-negative integer");

    // Listing marks nothing; mark-read is explicit, idempotent, and counted.
    expect(index.markRead("bob", [both.id])).toBe(1);
    expect(index.markRead("bob", [both.id])).toBe(0);
    expect(index.inbox("bob").map((p) => p.id)).toEqual([mentioned.id, addressed.id]);

    // Non-destructive: the marked post survives every other view.
    expect(index.thread(addressed.id)?.posts.map((p) => p.id)).toEqual([addressed.id, mentioned.id]);
    expect(index.mentions("bob").map((p) => p.id)).toEqual([both.id, mentioned.id]);

    // Markers are per recipient: bob's marks never touch carol's inbox.
    expect(index.markRead("carol", [unrelated.id, "01NOTINDEXED00000000000000"])).toBe(1);
    expect(index.inbox("carol")).toEqual([]);
    expect(index.inbox("bob").map((p) => p.id)).toEqual([mentioned.id, addressed.id]);
  });

  it("scopes the inbox by board while markers stay per board", async () => {
    const store = new MemoryStore();
    const alpha = new Board(store, { board: "alpha", author: "claude", now: () => Date.UTC(2026, 8, 1, 12) });
    const beta = new Board(store, { board: "beta", author: "claude", now: () => Date.UTC(2026, 8, 1, 13) });
    const alphaPost = await alpha.post({ body: "alpha for bob", to: ["bob"] });
    const betaPost = await beta.post({ body: "beta for bob", to: ["bob"] });
    const index = memoryIndex();
    index.ingest(alphaPost);
    index.ingest(betaPost);

    expect(index.inbox("bob").map((p) => p.id)).toEqual([betaPost.id, alphaPost.id]);
    expect(index.inbox("bob", { board: "alpha" }).map((p) => p.id)).toEqual([alphaPost.id]);

    expect(index.markRead("bob", [alphaPost.id, betaPost.id], { board: "alpha" })).toBe(1);
    expect(index.inbox("bob", { board: "alpha" })).toEqual([]);
    expect(index.inbox("bob", { board: "beta" }).map((p) => p.id)).toEqual([betaPost.id]);
  });

  it("backfills addressees when upgrading an existing index without re-ingest", async () => {
    const dir = await mkdtemp(join(tmpdir(), "board-index-inbox-upgrade-"));
    dirs.push(dir);
    const path = join(dir, "index.sqlite");
    const board = new Board(new MemoryStore(), { board: "general", author: "claude" });
    const post = await board.post({ body: "existing addressed post", to: ["bob", "carol"] });
    const original = new BoardIndex(path);
    indexes.push(original);
    await original.sync(board);
    original.close();
    // The pre-205 schema has the same user_version and stored envelope JSON,
    // but neither inbox table. Preserve its posts and cursor during upgrade.
    const db = new Database(path);
    db.exec("DROP TABLE addressees; DROP TABLE read_markers;");
    db.close();
    const upgraded = new BoardIndex(path);
    indexes.push(upgraded);
    expect(upgraded.inbox("bob").map((p) => p.id)).toEqual([post.id]);
    expect(upgraded.inbox("carol").map((p) => p.id)).toEqual([post.id]);
    expect((await upgraded.sync(board)).ingested).toBe(0);
    expect(upgraded.markRead("bob", [post.id])).toBe(1);
    expect(upgraded.inbox("carol").map((p) => p.id)).toEqual([post.id]);
  });

  it("preserves reader state when a schema version change drops derived tables", async () => {
    const dir = await mkdtemp(join(tmpdir(), "board-index-inbox-version-"));
    dirs.push(dir);
    const path = join(dir, "index.sqlite");
    const board = new Board(new MemoryStore(), { board: "general", author: "claude" });
    const post = await board.post({ body: "read before migration", to: ["bob"] });
    const original = new BoardIndex(path);
    indexes.push(original);
    await original.sync(board);
    original.markRead("bob", [post.id]);
    original.close();
    const db = new Database(path);
    db.exec("PRAGMA user_version = 2;");
    db.close();
    const upgraded = new BoardIndex(path);
    indexes.push(upgraded);
    await upgraded.sync(board);
    expect(upgraded.inbox("bob")).toEqual([]);
    expect(upgraded.markRead("bob", [post.id])).toBe(0);
    expect(upgraded.threads()).toHaveLength(1);
  });

  it("keeps read markers across restart, sync, and rebuild", async () => {
    const dir = await mkdtemp(join(tmpdir(), "board-index-inbox-"));
    dirs.push(dir);
    const path = join(dir, "index.sqlite");
    const c = clock(Date.UTC(2026, 8, 1, 12));
    const board = new Board(new MemoryStore(), { board: "general", author: "claude", now: c.now });
    const first = await board.post({ body: "read me", to: ["bob"] });
    c.tick(1_000);
    const second = await board.post({ body: "still unread", mentions: ["bob"] });

    const opened = new BoardIndex(path, { now: c.now });
    indexes.push(opened);
    await opened.sync(board);
    expect(opened.inbox("bob").map((p) => p.id)).toEqual([second.id, first.id]);
    expect(opened.markRead("bob", [first.id])).toBe(1);
    opened.close();

    // Restart: a fresh index instance over the same file keeps the markers.
    const reopened = new BoardIndex(path, { now: c.now });
    indexes.push(reopened);
    await reopened.sync(board);
    expect(reopened.inbox("bob").map((p) => p.id)).toEqual([second.id]);

    // Rebuild re-derives posts, threads, and tasks (through the bulk ingest
    // path) but must not resurrect marked posts as unread.
    expect(await reopened.rebuild(board)).toBe(2);
    expect(reopened.inbox("bob").map((p) => p.id)).toEqual([second.id]);
    expect(reopened.markRead("bob", [second.id])).toBe(1);
    expect(await reopened.rebuild(board)).toBe(2);
    expect(reopened.inbox("bob")).toEqual([]);
    expect(reopened.threads()).toHaveLength(2);
  });
});

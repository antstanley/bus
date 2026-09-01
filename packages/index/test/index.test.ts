import { afterEach, describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Board,
  MemoryStore,
  type Changes,
  type PutOptions,
} from "@board/core";
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

describe("BoardIndex", () => {
  it("deduplicates posts and materialises threads, mentions, and FTS", async () => {
    const c = clock(Date.UTC(2026, 8, 1, 12));
    const board = new Board(new MemoryStore(), { board: "general", author: "letta", now: c.now });
    const root = await board.post({ title: "Index design", body: "SQLite keeps local reads quick" });
    c.tick(1_000);
    const reply = await board.reply(root, { body: "Search for scalable boards", mentions: ["claude", "claude"] });
    const index = memoryIndex();

    expect(index.ingest(reply)).toBe(true); // replies may arrive before roots
    expect(index.ingest(root)).toBe(true);
    expect(index.ingest(reply)).toBe(false);
    expect(index.threads()).toEqual([{
      rootId: root.id,
      board: "general",
      title: "Index design",
      lastActivity: reply.ts,
      replyCount: 1,
    }]);
    expect(index.thread(root.id)?.posts.map((p) => p.id)).toEqual([root.id, reply.id]);
    expect(index.mentions("claude").map((p) => p.id)).toEqual([reply.id]);
    const results = index.search("scalable");
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe(reply.id);
    expect(results[0]?.snippet).toContain("<mark>scalable</mark>");
  });

  it("treats punctuation and FTS operators as literal search text", async () => {
    const board = new Board(new MemoryStore(), { board: "general", author: "letta" });
    const post = await board.post({ body: "it's e.g. foo-bar NOT test ( body:x" });
    const index = memoryIndex();
    index.ingest(post);
    for (const query of ["it's", "e.g.", "foo-bar", "NOT", "test (", "body:x"]) {
      expect(() => index.search(query)).not.toThrow();
      expect(index.search(query)[0]?.id).toBe(post.id);
    }
  });

  it("syncs with a cursor and reconciles late older posts", async () => {
    const store = new MemoryStore();
    const c = clock(Date.UTC(2026, 8, 2, 12));
    const board = new Board(store, { board: "general", author: "letta", now: c.now });
    const first = await board.post({ body: "first" });
    const index = memoryIndex({ reconcileEvery: 2, lookbackDays: 2, now: c.now });

    const initial = await index.sync(board);
    expect(initial.ingested).toBe(1);
    expect(initial.reconciled).toBe(true); // first sync after opening always reconciles
    const late = new Board(store, {
      board: "general",
      author: "codex",
      now: () => Date.UTC(2026, 8, 1, 8),
    });
    const old = await late.post({ body: "late" });
    expect(old.id < first.id).toBe(true);

    const cursorOnly = await index.sync(board);
    expect(cursorOnly.reconciled).toBe(false);
    expect(cursorOnly.ingested).toBe(0);
    const reconciled = await index.sync(board);
    expect(reconciled.reconciled).toBe(true);
    expect(reconciled.ingested).toBe(1);
    expect(index.search("late")[0]?.id).toBe(old.id);
    expect(index.state("general")?.lastReconcileMs).toBe(c.now());
  });

  it("uses an exact change feed to ingest late keys", async () => {
    const store = new ChangeStore();
    const c = clock(Date.UTC(2026, 8, 2, 12));
    const board = new Board(store, { board: "general", author: "letta", now: c.now });
    const first = await board.post({ body: "first" });
    const index = memoryIndex({ reconcileEvery: 999 });
    await index.sync(board);
    expect(index.state("general")?.changeToken).toBe("1");

    await store.put("foreign/object", "ignore me");

    const late = new Board(store, {
      board: "general",
      author: "claude",
      now: () => Date.UTC(2026, 7, 1, 8),
    });
    const old = await late.post({ body: "exact late" });
    expect(old.id < first.id).toBe(true);
    const sync = await index.sync(board);
    expect(sync.ingested).toBe(1);
    expect(sync.reconciled).toBe(false);
    expect(index.search("exact")[0]?.id).toBe(old.id);
    expect(index.state("general")?.changeToken).toBe("3");
  });

  it("persists posts and per-board sync state at a local path", async () => {
    const dir = await mkdtemp(join(tmpdir(), "board-index-"));
    dirs.push(dir);
    const path = join(dir, "missing", "parents", "index.sqlite");
    const board = new Board(new MemoryStore(), { board: "general", author: "letta" });
    const post = await board.post({ title: "Persistent", body: "survives reopen" });

    const first = new BoardIndex(path);
    await first.sync(board);
    first.close();

    const reopened = new BoardIndex(path);
    indexes.push(reopened);
    expect(reopened.thread(post.id)?.posts[0]?.body).toBe("survives reopen");
    expect(reopened.state("general")?.cursor).toBe(board.keyFor(post.id));
    const next = await board.post({ body: "arrived after reopen" });
    expect((await reopened.sync(board)).ingested).toBe(1);
    expect(reopened.thread(next.id)?.posts[0]?.body).toBe("arrived after reopen");
  });

  it("rebuilds an index created with an unknown schema version", async () => {
    const dir = await mkdtemp(join(tmpdir(), "board-index-schema-"));
    dirs.push(dir);
    const path = join(dir, "index.sqlite");
    const old = new Database(path, { create: true });
    old.exec("CREATE TABLE posts (id TEXT PRIMARY KEY); PRAGMA user_version = 999");
    old.close();

    const index = new BoardIndex(path);
    indexes.push(index);
    expect(index.threads()).toEqual([]);
    expect(index.db.query<{ user_version: number }, []>("PRAGMA user_version").get()?.user_version).toBe(1);
  });

  it("rebuild replaces only the selected board", async () => {
    const store = new MemoryStore();
    const general = new Board(store, { board: "general", author: "letta" });
    const random = new Board(store, { board: "random", author: "letta" });
    const keep = await random.post({ body: "keep me" });
    const old = await general.post({ body: "replace me" });
    const index = memoryIndex();
    index.ingest(keep);
    index.ingest(old);

    expect(await index.rebuild(general)).toBe(1);
    expect(index.thread(keep.id)).not.toBeNull();
    expect(index.thread(old.id)).not.toBeNull();
    expect(index.state("general")?.lastReconcileMs).not.toBeNull();
  });
});

class ChangeStore extends MemoryStore {
  private revision = 0;
  private readonly log: Array<{ revision: number; key: string }> = [];

  override async put(key: string, body: Uint8Array | string, opts?: PutOptions): Promise<void> {
    await super.put(key, body, opts);
    this.log.push({ revision: ++this.revision, key });
  }

  async changes(token?: string): Promise<Changes> {
    if (token === undefined) return { keys: [], token: String(this.revision) };
    const revision = Number(token);
    return {
      keys: this.log.filter((entry) => entry.revision > revision).map((entry) => entry.key),
      token: String(this.revision),
    };
  }
}

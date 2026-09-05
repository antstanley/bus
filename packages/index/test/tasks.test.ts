import { afterEach, describe, expect, it } from "bun:test";
import {
  Board, MemoryStore, POST_VERSION_V2, ulid, ulidTime, encodePost, encoder, keys,
  type Post, type Status, type Store,
} from "@board/core";
import { BoardIndex, compactBoard } from "../src/index.ts";

const DAY = 86_400_000;
// 2026-08-20T12:00Z, safely in the past: read-side validation rejects ids
// minted after the reader's clock. Test posts are written two days earlier.
const NOW = Date.UTC(2026, 7, 20, 12);
const POSTED = NOW - 2 * DAY;

const indexes: BoardIndex[] = [];

afterEach(() => {
  for (const index of indexes.splice(0)) index.close();
});

function clock(at: number) {
  return () => at;
}

function memoryIndex(opts: ConstructorParameters<typeof BoardIndex>[1] = {}): BoardIndex {
  const index = new BoardIndex(":memory:", { now: clock(NOW), ...opts });
  indexes.push(index);
  return index;
}

/** A board whose clock is "now"; writers with other clocks share the store. */
function viewer(store: Store, board = "general"): Board {
  return new Board(store, { board, author: "letta", now: clock(NOW) });
}

function writer(store: Store, at: number, author = "codex", board = "general"): Board {
  return new Board(store, { board, author, now: clock(at) });
}

/** A status reply on a task thread; `withTask` decides whether it names the root explicitly. */
function statusReply(board: Board, parent: Post, status: Status, withTask = true): Promise<Post> {
  return board.reply(parent, withTask
    ? { body: `status: ${status}`, act: "status", status, task: parent.thread }
    : { body: `status: ${status}`, act: "status", status });
}

describe("task lifecycle", () => {
  it("folds status posts into a current task state during sync", async () => {
    const store = new MemoryStore();
    const board = viewer(store);
    const root = await writer(store, POSTED, "letta").request(["codex"], { title: "Index design", body: "please build" });
    const working = await statusReply(writer(store, POSTED + 1_000, "codex"), root, "working");
    const needInput = await statusReply(writer(store, POSTED + 2_000, "codex"), root, "input-required");
    // A self-transition is a valid, idempotent heartbeat.
    const heartbeat = await statusReply(writer(store, POSTED + 3_000, "codex"), root, "working");
    const index = memoryIndex();

    const sync = await index.sync(board);
    expect(sync.ingested).toBe(4);
    expect(index.tasks()).toEqual([{
      rootId: root.id,
      board: "general",
      state: "working",
      title: "Index design",
      lastActivity: heartbeat.ts,
      lastPostId: heartbeat.id,
    }]);
    expect(index.task(root.id)?.history).toEqual([
      { postId: root.id, state: "submitted", ts: root.ts, valid: true, from: null },
      { postId: working.id, state: "working", ts: working.ts, valid: true, from: "submitted" },
      { postId: needInput.id, state: "input-required", ts: needInput.ts, valid: true, from: "working" },
      { postId: heartbeat.id, state: "working", ts: heartbeat.ts, valid: true, from: "input-required" },
    ]);
    expect(index.task(root.id)?.state).toBe("working");
  });

  it("surfaces an invalid transition as a trust warning without changing state", async () => {
    const store = new MemoryStore();
    const root = await writer(store, POSTED, "letta").request(["codex"], { title: "Terminal", body: "one shot" });
    const done = await statusReply(writer(store, POSTED + 1_000), root, "completed");
    const rewind = await statusReply(writer(store, POSTED + 2_000), root, "working");
    const warnings: string[] = [];
    const index = memoryIndex({ onWarning: (message) => warnings.push(message) });

    index.ingest(root);
    index.ingest(done);
    expect(warnings).toEqual([]);
    expect(index.task(root.id)?.state).toBe("completed");

    index.ingest(rewind);
    expect(index.task(root.id)?.state).toBe("completed"); // unchanged, not a crash
    expect(index.task(root.id)?.history.at(-1)).toEqual({
      postId: rewind.id,
      state: "working",
      ts: rewind.ts,
      valid: false,
      from: "completed",
    });
    expect(warnings).toEqual([expect.stringContaining("rejected invalid transition")]);
    expect(warnings[0]).toContain(rewind.id);
    expect(warnings[0]).toContain(root.id);

    // Re-ingesting the same post deduplicates, and later activity on the task
    // must not re-warn about the old rejected row.
    expect(index.ingest(rewind)).toBe(false);
    const rework = await statusReply(writer(store, POSTED + 3_000), root, "completed");
    index.ingest(rework);
    expect(warnings).toHaveLength(1);
    expect(index.task(root.id)?.state).toBe("completed");
  });

  it("treats terminal states as final except idempotent re-affirmation", async () => {
    const store = new MemoryStore();
    const root = await writer(store, POSTED, "letta").request(["codex"], { title: "Cancel path", body: "stop" });
    const canceled = await statusReply(writer(store, POSTED + 1_000), root, "canceled");
    const afterTerminal = await statusReply(writer(store, POSTED + 2_000), root, "completed");
    const reaffirm = await statusReply(writer(store, POSTED + 3_000), root, "canceled");
    const index = memoryIndex();

    for (const post of [root, canceled, afterTerminal, reaffirm]) index.ingest(post);
    expect(index.task(root.id)?.state).toBe("canceled");
    expect(index.task(root.id)?.history.map((t) => [t.state, t.valid])).toEqual([
      ["submitted", true],
      ["canceled", true],
      ["completed", false], // canceled is terminal: it accepts nothing further
      ["canceled", true], // X -> X is always a valid no-op
    ]);
  });

  it("filters tasks by current state and board and orders by last activity", async () => {
    const store = new MemoryStore();
    const first = await writer(store, POSTED, "letta").request(["codex"], { title: "One", body: "first" });
    const second = await writer(store, POSTED + 1_000, "claude").request(["codex"], { title: "Two", body: "second" });
    await statusReply(writer(store, POSTED + 2_000), first, "working");
    await statusReply(writer(store, POSTED + 3_000), second, "completed");
    const third = await writer(store, POSTED + 4_000, "claude").request(["codex"], { title: "Three", body: "third" });
    await statusReply(writer(store, POSTED + 5_000), third, "working");
    const index = memoryIndex();
    await index.sync(viewer(store));

    expect(index.tasks({ state: "working" }).map((t) => t.rootId)).toEqual([third.id, first.id]);
    expect(index.tasks({ state: "completed" }).map((t) => t.rootId)).toEqual([second.id]);
    expect(index.tasks({ state: "submitted" })).toEqual([]);
    expect(index.tasks().map((t) => t.rootId)).toEqual([third.id, second.id, first.id]);
    expect(index.tasks({ limit: 2 }).map((t) => t.rootId)).toEqual([third.id, second.id]);
    expect(() => index.tasks({ state: "running" as unknown as Status })).toThrow("unknown status");
  });

  it("derives identical task state from a snapshot rebuild and incremental sync", async () => {
    const store = new MemoryStore();
    const root = await writer(store, POSTED, "letta").request(["codex"], { title: "Deploy", body: "ship it" });
    await statusReply(writer(store, POSTED + 1_000), root, "working");
    await statusReply(writer(store, POSTED + 2_000), root, "completed");
    // Invalid both ways: a terminal rewind that folds through the thread
    // fallback (no task field).
    const rewind = await statusReply(writer(store, POSTED + 3_000, "mallory"), root, "working", false);
    // A post that names the task without asserting state: activity only.
    const chatter = await writer(store, POSTED + 4_000).reply(root, { body: "congrats", task: root.id });
    const second = await writer(store, POSTED + 5_000, "claude").request(["codex"], { title: "Follow-up", body: "more" });
    await statusReply(writer(store, POSTED + 6_000), second, "input-required", false);
    // A task whose root never arrives stays parked with its bootstrapped state.
    const missing = ulid(POSTED + 7_000);
    const orphan = await writer(store, POSTED + 7_000, "mallory").post({
      body: "names a missing root",
      act: "status",
      status: "failed",
      task: missing,
    });

    await compactBoard(viewer(store), { now: clock(NOW) });

    const rebuildWarnings: string[] = [];
    const rebuilt = memoryIndex();
    await rebuilt.rebuild(viewer(store), { onWarning: (message) => rebuildWarnings.push(message) });

    const ingestWarnings: string[] = [];
    const incremental = memoryIndex({ onWarning: (message) => ingestWarnings.push(message) });
    for await (const post of viewer(store).scan()) incremental.ingest(post);

    const synced = memoryIndex();
    await synced.sync(viewer(store));

    for (const index of [incremental, synced]) {
      expect(index.tasks()).toEqual(rebuilt.tasks());
      expect(index.task(root.id)).toEqual(rebuilt.task(root.id));
      expect(index.task(second.id)).toEqual(rebuilt.task(second.id));
      expect(index.task(missing)).toEqual(rebuilt.task(missing));
    }
    expect(rebuilt.task(root.id)?.state).toBe("completed");
    expect(rebuilt.task(root.id)?.lastPostId).toBe(chatter.id); // activity without state still counts
    expect(rebuilt.task(root.id)?.history.at(-1)).toMatchObject({ postId: rewind.id, state: "working", valid: false });
    expect(rebuilt.task(second.id)?.state).toBe("input-required");
    expect(rebuilt.task(missing)?.state).toBe("failed");
    expect(rebuilt.task(missing)?.title).toBeNull();
    expect(rebuilt.task(missing)?.history).toEqual([{
      postId: orphan.id,
      state: "failed",
      ts: orphan.ts,
      valid: true,
      from: null,
    }]);

    const rows = (index: BoardIndex) =>
      index.db.query("SELECT * FROM task_history ORDER BY root_id, board, post_id").all();
    expect(rows(rebuilt)).toEqual(rows(incremental));
    expect(rows(rebuilt)).toEqual(rows(synced));

    // One rejected fold is warned exactly once per ingest path.
    expect(rebuildWarnings.filter((w) => w.includes(rewind.id))).toHaveLength(1);
    expect(ingestWarnings.filter((w) => w.includes(rewind.id))).toHaveLength(1);

    // A second rebuild is idempotent.
    await rebuilt.rebuild(viewer(store));
    expect(rows(rebuilt)).toEqual(rows(incremental));
    expect(rebuilt.tasks()).toEqual(incremental.tasks());
  });

  it("parks a status post whose root is missing and folds it when the root arrives late", async () => {
    const store = new MemoryStore();
    // The root is written first (smaller id) but arrives at the index last.
    const root = await writer(store, POSTED, "letta").request(["codex"], { title: "Later", body: "written first" });
    const status = await statusReply(writer(store, POSTED + 1_000), root, "working");
    const index = memoryIndex();

    index.ingest(status);
    expect(index.tasks()).toEqual([{
      rootId: root.id,
      board: "general",
      state: "working",
      title: null, // parked: the root is not indexed yet
      lastActivity: status.ts,
      lastPostId: status.id,
    }]);
    expect(index.task(root.id)?.history).toEqual([
      { postId: status.id, state: "working", ts: status.ts, valid: true, from: null },
    ]);

    index.ingest(root);
    expect(index.task(root.id)?.state).toBe("working");
    expect(index.task(root.id)?.title).toBe("Later");
    expect(index.task(root.id)?.history.map((t) => t.state)).toEqual(["submitted", "working"]);

    // And it matches a fold derived from scratch in id order.
    const fresh = memoryIndex();
    for await (const post of viewer(store).scan()) fresh.ingest(post);
    expect(fresh.task(root.id)).toEqual(index.task(root.id));
  });

  it("keeps folds for the same task root isolated per board", async () => {
    const store = new MemoryStore();
    const root = await writer(store, POSTED, "letta", "alpha").request(["codex"], { title: "Cross", body: "alpha task" });
    const delegated = await statusReply(writer(store, POSTED + 1_000, "codex", "beta"), root, "working");
    const done = await statusReply(writer(store, POSTED + 2_000, "codex", "alpha"), root, "completed");
    const index = memoryIndex();

    for (const post of [root, delegated, done]) index.ingest(post);
    expect(index.tasks({ board: "alpha" }).map((t) => [t.state, t.title])).toEqual([["completed", "Cross"]]);
    expect(index.tasks({ board: "beta" }).map((t) => [t.state, t.title])).toEqual([["working", null]]);
    expect(index.tasks({ state: "working" }).map((t) => t.board)).toEqual(["beta"]);
    // The most recently active fold answers a bare task(id) lookup.
    expect(index.task(root.id)?.board).toBe("alpha");
    expect(index.task(root.id)?.history).toHaveLength(2); // alpha's own fold only
  });

  it("bootstraps from the first status when the thread root is not a request", async () => {
    const store = new MemoryStore();
    const root = await writer(store, POSTED, "letta").post({ title: "Plain thread", body: "not a request" });
    const status = await statusReply(writer(store, POSTED + 1_000), root, "input-required", false);
    const index = memoryIndex();

    index.ingest(status); // status first: fold order must not matter
    index.ingest(root);
    expect(index.task(root.id)?.state).toBe("input-required");
    expect(index.task(root.id)?.history).toEqual([
      { postId: status.id, state: "input-required", ts: status.ts, valid: true, from: null },
    ]);
  });

  it("warns about out-of-order rejections exactly like a rebuild does", async () => {
    const store = new MemoryStore();
    const root = await writer(store, POSTED, "letta").request(["codex"], { title: "Ooo", body: "late order" });
    // Ascending ids: the completed post predates the rewind, so the rewind is
    // the rejected entry — but only once the completed post has been seen.
    const done = await statusReply(writer(store, POSTED + 1_000), root, "completed");
    const rewind = await statusReply(writer(store, POSTED + 2_000), root, "working");

    const rebuildWarnings: string[] = [];
    const rebuilt = memoryIndex();
    await rebuilt.rebuild(viewer(store), { onWarning: (message) => rebuildWarnings.push(message) });
    expect(rebuildWarnings).toHaveLength(1);
    expect(rebuildWarnings[0]).toContain(rewind.id);

    const ingestWarnings: string[] = [];
    const incremental = memoryIndex({ onWarning: (message) => ingestWarnings.push(message) });
    // Out of order: the terminal rewind lands BEFORE the completed post that
    // invalidates it.
    incremental.ingest(root);
    incremental.ingest(rewind);
    expect(incremental.task(root.id)?.state).toBe("working"); // valid in isolation
    expect(ingestWarnings).toEqual([]); // nothing rejected yet, so nothing warned

    incremental.ingest(done);
    expect(incremental.task(root.id)?.state).toBe("completed");
    // Re-folding flipped the earlier rewind to invalid: the incremental path
    // must warn about it too — same posts, same count, same messages.
    expect(ingestWarnings).toEqual(rebuildWarnings);

    // And the rows agree, not just the warnings.
    expect(incremental.task(root.id)).toEqual(rebuilt.task(root.id));
  });

  it("scopes a single-task lookup by board while a bare lookup stays most-recent", async () => {
    const store = new MemoryStore();
    const root = await writer(store, POSTED, "letta", "alpha").request(["codex"], { title: "Shared", body: "one id" });
    // The same root id is folded by a status post on another board.
    await statusReply(writer(store, POSTED + 1_000, "mallory", "beta"), root, "working");
    await statusReply(writer(store, POSTED + 2_000, "codex", "alpha"), root, "completed");
    const index = memoryIndex();
    await index.sync(viewer(store, "alpha"));
    await index.sync(viewer(store, "beta"));

    // Bare lookup keeps its documented meaning: the most recently active fold.
    expect(index.task(root.id)).toMatchObject({ board: "alpha", state: "completed", title: "Shared" });
    // The board filter decides independently of activity.
    expect(index.task(root.id, { board: "beta" })).toMatchObject({ board: "beta", state: "working", title: null });
    expect(index.task(root.id, { board: "alpha" })).toMatchObject({ board: "alpha", state: "completed", title: "Shared" });
    expect(index.task(root.id, { board: "gamma" })).toBeNull();
  });

  it("refolds parked status replies when a non-request thread root lands last", async () => {
    const store = new MemoryStore();
    const board = viewer(store);
    // The root is minted AFTER the reply that parks on it (a five-minute ts
    // skew or a hostile client can produce this), so the root owns the
    // largest id and must own the fold's last activity once it arrives.
    const root = await writer(store, POSTED + 5_000, "letta").post({ title: "Plain root", body: "not a request" });
    const seed = await writer(store, POSTED, "mallory").post({ body: "seed" });
    const parked: Post = {
      ...seed,
      v: POST_VERSION_V2,
      thread: root.id,
      replyTo: root.id,
      act: "status",
      status: "working",
    };
    await store.put(keys.post("general", parked.id, ulidTime(parked.id)), encoder.encode(encodePost(parked)));

    const incremental = memoryIndex();
    incremental.ingest(parked);
    expect(incremental.task(root.id)).toMatchObject({
      state: "working",
      lastPostId: parked.id,
      lastActivity: parked.ts,
      title: null,
    });

    incremental.ingest(root);
    // The root counts as activity: last_post_id/last_activity must now match
    // what a rebuild derives, not stay parked on the earlier reply.
    expect(incremental.task(root.id)).toMatchObject({
      state: "working",
      lastPostId: root.id,
      lastActivity: root.ts,
      title: "Plain root",
    });

    const rebuilt = memoryIndex();
    await rebuilt.rebuild(board);
    expect(rebuilt.task(root.id)).toEqual(incremental.task(root.id));
  });

  it("folds a request root with an explicit task field identically to a rebuild", async () => {
    const store = new MemoryStore();
    const board = viewer(store);
    // A request root whose `task` field names a different root, with no
    // status replies in its thread: the root still stamps its own implicit
    // submitted fold, so a rebuild must derive the same row the incremental
    // fold does (fold targets and rebuild candidates mirror each other).
    const delegate = await writer(store, POSTED, "letta").request(["codex"], { title: "Named root", body: "the delegated task" });
    const root = await writer(store, POSTED + 1_000, "letta").post({
      title: "Handoff",
      body: "a request naming another task",
      act: "request",
      task: delegate.id,
    });

    const incremental = memoryIndex();
    for await (const post of board.scan()) incremental.ingest(post);
    expect(incremental.task(root.id)).toMatchObject({
      rootId: root.id,
      board: "general",
      state: "submitted",
      title: "Handoff",
    });
    expect(incremental.task(root.id)?.history).toEqual([
      { postId: root.id, state: "submitted", ts: root.ts, valid: true, from: null },
    ]);

    const rebuilt = memoryIndex();
    await rebuilt.rebuild(board);
    expect(rebuilt.task(root.id)).toEqual(incremental.task(root.id));
    expect(rebuilt.task(delegate.id)).toEqual(incremental.task(delegate.id));
    expect(rebuilt.tasks()).toEqual(incremental.tasks());
    const rows = (index: BoardIndex) =>
      index.db.query("SELECT * FROM task_history ORDER BY root_id, board, post_id").all();
    expect(rows(rebuilt)).toEqual(rows(incremental));
  });

  it("folds a request reply with an explicit task field identically to a rebuild", async () => {
    const store = new MemoryStore();
    const board = viewer(store);
    const parent = await writer(store, POSTED, "letta").request(["codex"], { title: "Parent", body: "the named task" });
    // A request-shaped REPLY naming its parent: it folds to the parent via
    // the explicit task field AND mints its own submitted fold — a request's
    // own id is a fold target wherever the post sits in its thread, which is
    // what the rebuild's candidate scan already derives.
    const handoff = await writer(store, POSTED + 1_000, "codex").reply(parent, {
      body: "spinning this into its own request",
      act: "request",
      task: parent.id,
    });

    const incremental = memoryIndex();
    incremental.ingest(parent);
    incremental.ingest(handoff);
    expect(incremental.task(handoff.id)).toMatchObject({
      rootId: handoff.id,
      board: "general",
      state: "submitted",
      lastPostId: handoff.id,
      lastActivity: handoff.ts,
      title: null, // a reply carries no title
    });
    expect(incremental.task(handoff.id)?.history).toEqual([
      { postId: handoff.id, state: "submitted", ts: handoff.ts, valid: true, from: null },
    ]);
    // The parent's fold saw the reference as activity without a state claim.
    expect(incremental.task(parent.id)).toMatchObject({ state: "submitted", lastPostId: handoff.id });

    const rebuilt = memoryIndex();
    await rebuilt.rebuild(board);
    expect(rebuilt.task(handoff.id)).toEqual(incremental.task(handoff.id));
    expect(rebuilt.task(parent.id)).toEqual(incremental.task(parent.id));
    expect(rebuilt.tasks()).toEqual(incremental.tasks());
    const rows = (index: BoardIndex) =>
      index.db.query("SELECT * FROM task_history ORDER BY root_id, board, post_id").all();
    expect(rows(rebuilt)).toEqual(rows(incremental));
  });

  it("refreshes a fold when a referenced task root lands as an ordinary reply", async () => {
    const store = new MemoryStore();
    const board = viewer(store);
    // A status post names an id that does not exist yet; the named post lands
    // later as a plain reply (no act, no task field) and is NEWER than the
    // status post. Its own row must refresh the fold's lastPostId/lastActivity
    // exactly like a rebuild — a thread root un-parking a parked fold, but
    // for a root known only through other posts' task references.
    const root = await writer(store, POSTED + 5_000, "letta").post({ title: "Thread", body: "plain root" });
    const reply = await writer(store, POSTED + 4_000, "codex").reply(root, { body: "ordinary reply" });
    const seed = await writer(store, POSTED + 3_000, "mallory").post({ body: "seed" });
    const parked: Post = {
      ...seed,
      v: POST_VERSION_V2,
      act: "status",
      status: "working",
      task: reply.id,
    };
    await store.put(keys.post("general", parked.id, ulidTime(parked.id)), encoder.encode(encodePost(parked)));

    const incremental = memoryIndex();
    incremental.ingest(parked);
    expect(incremental.task(reply.id)).toMatchObject({
      state: "working",
      lastPostId: parked.id,
      lastActivity: parked.ts,
      title: null,
    });

    incremental.ingest(reply);
    expect(incremental.task(reply.id)).toMatchObject({
      state: "working",
      lastPostId: reply.id,
      lastActivity: reply.ts,
      title: null,
    });
    expect(incremental.task(reply.id)?.history).toEqual([
      { postId: parked.id, state: "working", ts: parked.ts, valid: true, from: null },
    ]);

    const rebuilt = memoryIndex();
    await rebuilt.rebuild(board);
    expect(rebuilt.task(reply.id)).toEqual(incremental.task(reply.id));
    const rows = (index: BoardIndex) =>
      index.db.query("SELECT * FROM task_history ORDER BY root_id, board, post_id").all();
    expect(rows(rebuilt)).toEqual(rows(incremental));
  });

  it("recomputes a task fold once per sync transaction, not once per post", async () => {
    const store = new MemoryStore();
    const board = viewer(store);
    const root = await writer(store, POSTED, "letta").request(["codex"], { title: "Stream", body: "long run" });
    for (let i = 0; i < 200; i++) {
      await statusReply(writer(store, POSTED + 1_000 + i, "codex"), root, "working"); // heartbeats
    }

    const incremental = memoryIndex();
    let recomputes = 0;
    const self = incremental as unknown as { recomputeTaskFold: (...args: unknown[]) => unknown };
    const inner = self.recomputeTaskFold.bind(incremental);
    self.recomputeTaskFold = (...args: unknown[]) => {
      recomputes++;
      return inner(...args);
    };

    const sync = await incremental.sync(board);
    expect(sync.ingested).toBe(201);
    // One affected task per transaction page, not one fold rewrite per post:
    // 201 fold-relevant posts must not cost 201 full fold recomputes.
    expect(recomputes).toBeLessThanOrEqual(4);

    // The bounded pass derives exactly what a rebuild derives.
    const rebuilt = memoryIndex();
    await rebuilt.rebuild(board);
    expect(incremental.tasks()).toEqual(rebuilt.tasks());
    expect(incremental.task(root.id)).toEqual(rebuilt.task(root.id));
    expect(incremental.task(root.id)?.state).toBe("working");
    expect(incremental.task(root.id)?.history).toHaveLength(201);
  });
});

import { Database, type Statement } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  canonicalize,
  dayBucket,
  isStatus,
  keys,
  parsePost,
  validatePost,
  type Board,
  type Post,
  type Status,
} from "@board/core";
import {
  discoverBucketDays,
  isCalendarDay,
  iterLiveBucketDays,
  iterSnapshotChunks,
  listSnapshotDays,
  readDayBucket,
  snapshotScanStart,
} from "./compaction.ts";
import { foldTask, taskFoldTargets, type FoldRow, type TaskTransition } from "./tasks.ts";

export {
  DAY_MS,
  compactBoard,
  compactDay,
  discoverBucketDays,
  iterSnapshotChunks,
  listSnapshotDays,
  readDayBucket,
  retainBoard,
  snapshotKey,
  snapshotScanStart,
  snapshotsPrefix,
  verifySnapshot,
  type Bucket,
  type CompactionOptions,
  type RetentionOptions,
  type RetentionResult,
  type RetentionStatus,
  type SnapshotChunk,
  type SnapshotDayStats,
  type SnapshotReadOptions,
  type SnapshotResult,
  type SnapshotStatus,
  type SnapshotVerification,
} from "./compaction.ts";

export {
  TASK_TRANSITIONS,
  foldTask,
  isValidTransition,
  taskFoldTarget,
  taskFoldTargets,
  type FoldRow,
  type TaskFold,
  type TaskTransition,
} from "./tasks.ts";

const SCHEMA_VERSION = 3;

/** Posts per transaction while rebuilding from snapshots or live scans. */
const REBUILD_CHUNK = 4000;

export interface BoardIndexOptions {
  /** Re-list recent day buckets every N cursor syncs (default 15). */
  reconcileEvery?: number;
  /** Number of prior day buckets to revisit (default 2). */
  lookbackDays?: number;
  /** Injectable clock for deterministic callers and tests. */
  now?: () => number;
  /**
   * Receives trust warnings — rejected task transitions, unreadable content —
   * on every ingest path. A per-call callback (RebuildOptions.onWarning)
   * takes precedence during a rebuild.
   */
  onWarning?: ((message: string) => void) | undefined;
}

export interface ThreadQueryOptions {
  limit?: number;
  board?: string;
}

export interface QueryOptions {
  limit?: number;
  board?: string;
}

export interface TaskQueryOptions {
  /** Filter by current A2A task state. */
  state?: Status;
  board?: string;
  limit?: number;
}

export interface ThreadSummary {
  rootId: string;
  board: string;
  title: string | null;
  lastActivity: string;
  replyCount: number;
}

export interface ThreadView extends ThreadSummary {
  posts: Post[];
}

export interface TaskSummary {
  /** The task root post id (A2A taskId). */
  rootId: string;
  board: string;
  /** Current state after folding every status post. */
  state: Status;
  /** Title of the root post, when the root is indexed. */
  title: string | null;
  lastActivity: string;
  /** Id of the last fold-relevant post (the ulid half of last activity). */
  lastPostId: string;
}

export interface TaskView extends TaskSummary {
  /** Every fold entry in post-id order, including rejected transitions. */
  history: TaskTransition[];
}

export interface SearchResult extends Post {
  rank: number;
  snippet: string;
}

export interface BoardSyncState {
  board: string;
  cursor: string | null;
  changeToken: string | null;
  syncCount: number;
  lastReconcileMs: number | null;
}

export interface RebuildOptions {
  /**
   * Fold day snapshots into the rebuild instead of re-reading every live
   * object (default true). Snapshots are read first; only buckets newer than
   * the last snapshot day (plus any bucket the snapshots cannot fully cover)
   * are scanned live, with de-duplication by post id.
   */
  useSnapshots?: boolean | undefined;
  /** Receives warnings about skipped or unreadable snapshot content. */
  onWarning?: ((message: string) => void) | undefined;
}

export interface SyncResult extends BoardSyncState {
  ingested: number;
  reconciled: boolean;
}

interface StateRow {
  board: string;
  cursor: string | null;
  change_token: string | null;
  sync_count: number;
  last_reconcile_ms: number | null;
}

interface ThreadRow {
  root_id: string;
  board: string;
  title: string | null;
  last_activity: string;
  reply_count: number;
}

interface TaskRow {
  root_id: string;
  board: string;
  state: string;
  last_post_id: string;
  last_activity: string;
  title?: string | null;
}

interface HistoryRow {
  post_id: string;
  state: string;
  valid: number;
  ts: string;
  from_state: string | null;
}

interface JsonRow {
  post_json: string;
}

interface SearchRow extends JsonRow {
  rank: number;
  snippet: string;
}

/** Disposable, rebuildable SQLite read model for one or more boards. */
export class BoardIndex {
  readonly db: Database;
  private readonly reconcileEvery: number;
  private readonly lookbackDays: number;
  private readonly now: () => number;
  private readonly onWarning: ((message: string) => void) | undefined;
  private readonly syncedBoards = new Set<string>();
  private operationChain: Promise<unknown> = Promise.resolve();
  /** Prepared statements for the bulk rebuild path, created lazily. */
  private bulk: { insertPost: Statement; insertFts: Statement; insertMention: Statement } | null = null;

  constructor(path: string, opts: BoardIndexOptions = {}) {
    this.reconcileEvery = opts.reconcileEvery ?? 15;
    this.lookbackDays = opts.lookbackDays ?? 2;
    this.now = opts.now ?? Date.now;
    this.onWarning = opts.onWarning;
    if (!Number.isInteger(this.reconcileEvery) || this.reconcileEvery < 1) throw new Error("reconcileEvery must be a positive integer");
    if (!Number.isInteger(this.lookbackDays) || this.lookbackDays < 0) throw new Error("lookbackDays must be a non-negative integer");

    if (path !== ":memory:") {
      mkdirSync(dirname(path), { recursive: true });
      this.db = new Database(path, { create: true });
      this.db.exec("PRAGMA foreign_keys = ON");
      this.db.exec("PRAGMA journal_mode = WAL");
      // The index is derived and rebuildable: WAL + NORMAL trades only the
      // per-transaction fsync of FULL, which a bulk rebuild pays hundreds of
      // times, while staying durable across application crashes.
      this.db.exec("PRAGMA synchronous = NORMAL");
    } else {
      this.db = new Database(path, { create: true });
      this.db.exec("PRAGMA foreign_keys = ON");
    }
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  /** Insert a post exactly once. Returns true only when it was new. */
  ingest(input: Post): boolean {
    const post = validatePost(input);
    let inserted = false;
    const transaction = this.db.transaction(() => {
      inserted = this.ingestOne(post);
    });
    transaction();
    return inserted;
  }

  /**
   * Insert one post and maintain the derived rows. `pendingFolds` collects
   * the task roots whose fold the post touched instead of recomputing them
   * here: batched callers (sync pages, reconcile batches) pass a map and
   * flush it once per transaction, so a long status stream rewrites each
   * affected fold once, not once per post. Without it the recompute happens
   * inline, which is right for single-post ingests.
   */
  private ingestOne(post: Post, pendingFolds?: Map<string, Set<string>>): boolean {
    const result = this.db.query(`
      INSERT OR IGNORE INTO posts
        (id, board, thread, reply_to, author, instance, ts, title, body, post_json, act, status, task)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      post.id,
      post.board,
      post.thread,
      post.replyTo ?? null,
      post.author,
      post.instance,
      post.ts,
      post.title ?? null,
      post.body,
      canonicalize(post),
      post.act ?? null,
      post.status ?? null,
      post.task ?? null,
    );
    if (result.changes === 0) return false;

    if (post.id === post.thread) {
      this.db.query(`
        INSERT INTO threads (root_id, board, title, last_activity, reply_count)
        VALUES (?, ?, ?, ?, 0)
        ON CONFLICT(root_id) DO UPDATE SET
          board = excluded.board,
          title = excluded.title,
          last_activity = excluded.last_activity,
          reply_count = 0
      `).run(post.id, post.board, post.title ?? null, post.ts);
      // Replies may arrive before their root. Recompute from posts on the
      // root's board so an identically named thread on another board cannot
      // contaminate this summary.
      this.db.query(`
        UPDATE threads SET
          last_activity = COALESCE((
            SELECT max(ts) FROM posts WHERE thread = ? AND board = ?
          ), ?),
          reply_count = (
            SELECT count(*) FROM posts WHERE thread = ? AND board = ? AND id <> ?
          )
        WHERE root_id = ? AND board = ?
      `).run(post.id, post.board, post.ts, post.id, post.board, post.id, post.id, post.board);
    } else {
      this.db.query(`
        INSERT INTO threads (root_id, board, title, last_activity, reply_count)
        VALUES (?, ?, NULL, ?, 1)
        ON CONFLICT(root_id) DO UPDATE SET
          last_activity = max(threads.last_activity, excluded.last_activity),
          reply_count = threads.reply_count + 1
        WHERE threads.board = excluded.board
      `).run(post.thread, post.board, post.ts);
    }

    for (const agent of new Set(post.mentions ?? [])) {
      this.db.query("INSERT OR IGNORE INTO mentions (post_id, agent) VALUES (?, ?)").run(post.id, agent);
    }
    this.db.query("INSERT INTO posts_fts (rowid, title, body) VALUES (?, ?, ?)").run(result.lastInsertRowid, post.title ?? "", post.body);

    // Task fold maintenance (task 203). The caller wraps ingestOne in a
    // transaction; recomputing the whole fold for each affected task keeps
    // the incremental rows identical to what a rebuild from these posts
    // derives. `taskFoldTargetsFor` is the single rule for which folds a post
    // touches — including a thread root that lands after parked status
    // replies folded to it, and an id other posts already named as a task
    // root landing as an ordinary post.
    const targets = this.taskFoldTargetsFor(post);
    if (pendingFolds === undefined) {
      for (const target of targets) this.recomputeTaskFold(target, post.board);
    } else {
      let roots = pendingFolds.get(post.board);
      if (roots === undefined) pendingFolds.set(post.board, (roots = new Set()));
      for (const target of targets) roots.add(target);
    }
    return true;
  }

  /**
   * The folds a landing post touches: `taskFoldTargets` plus the post's own
   * id when an already-ingested post on the same board names it as a task
   * root. A status post may reference an id before the named post exists —
   * the fold parks on the reference — and whenever that named post arrives
   * (a request, or any ordinary post) its own row counts as that task's
   * activity, so the fold must refresh to keep lastPostId/lastActivity on
   * the newest post. The rebuild path needs no mirror check: its candidate
   * scan already selects every referenced task id from the posts table.
   */
  private taskFoldTargetsFor(post: Post): string[] {
    const targets = taskFoldTargets(post);
    if (!targets.includes(post.id) && this.db
      .query<unknown, [string, string]>("SELECT 1 FROM posts WHERE board = ? AND task = ? LIMIT 1")
      .get(post.board, post.id)) {
      targets.push(post.id);
    }
    return targets;
  }

  /**
   * Recompute the folds collected by batched ingestOne calls. Runs inside the
   * same transaction as the post loop, so rows and folds still commit
   * atomically — one full fold pass per affected task per sync, not per post.
   */
  private flushTaskFolds(pendingFolds: Map<string, Set<string>>): void {
    for (const [board, roots] of pendingFolds) {
      for (const root of roots) this.recomputeTaskFold(root, board);
    }
  }

  /**
   * Incrementally ingest a board. Exact change feeds take precedence; other
   * stores use a cursor plus bounded periodic reconciliation.
   */
  sync(board: Board): Promise<SyncResult> {
    return this.enqueue(() => this.syncNow(board));
  }

  private async syncNow(board: Board): Promise<SyncResult> {
    let state = this.state(board.name) ?? emptyState(board.name);
    let ingested = 0;
    let reconciled = false;
    const firstSyncAfterOpen = !this.syncedBoards.has(board.name);

    if (board.store.changes) {
      if (state.changeToken === null) {
        // Establish the feed token before scanning history. A write racing the
        // scan is then either in the scan or delivered by the next change call.
        const baseline = await board.store.changes();
        state.changeToken = baseline.token;
        ingested += await this.ingestSince(board, state);
      } else {
        const changes = await board.store.changes(state.changeToken);
        state.changeToken = changes.token;
        const prefix = keys.postsPrefix(board.name);
        const posts: Post[] = [];
        for (const key of [...new Set(changes.keys)].filter((k) => k.startsWith(prefix)).sort()) {
          const bytes = await board.store.get(key);
          if (!bytes) continue;
          let post: Post;
          try { post = parsePost(bytes); } catch { continue; }
          if (post.board !== board.name) continue;
          posts.push(post);
          if (state.cursor === null || key > state.cursor) state.cursor = key;
        }
        const transaction = this.db.transaction(() => {
          const pendingFolds = new Map<string, Set<string>>();
          for (const post of posts) if (this.ingestOne(post, pendingFolds)) ingested++;
          this.flushTaskFolds(pendingFolds);
          this.saveState(state);
        });
        transaction();
      }
    } else {
      ingested += await this.ingestSince(board, state);
    }

    state.syncCount++;
    // Even a today-only lookback should not force reconciliation on every
    // sync; twelve hours is the minimum time cadence.
    const reconcileInterval = Math.max(43_200_000, this.lookbackDays * 86_400_000 / 2);
    const timeDue = state.lastReconcileMs === null || this.now() - state.lastReconcileMs >= reconcileInterval;
    if (!board.store.changes && (firstSyncAfterOpen || state.syncCount >= this.reconcileEvery || timeDue)) {
      const posts: Post[] = [];
      for await (const post of board.reconcile(this.lookbackDays)) posts.push(post);
      ingested += this.ingestBatch(posts);
      state.lastReconcileMs = this.now();
      state.syncCount = 0;
      reconciled = true;
    }
    this.saveState(state);
    this.syncedBoards.add(board.name);
    return { ...state, ingested, reconciled };
  }

  /**
   * Clear and reconstruct one board while preserving other indexed boards.
   * By default day snapshots (see ./compaction.ts) are read first and only
   * buckets newer than the last snapshot day — plus any bucket a snapshot
   * cannot fully cover — are scanned live; posts de-duplicate by id.
   */
  rebuild(board: Board, opts: RebuildOptions = {}): Promise<number> {
    return this.enqueue(() => this.rebuildNow(board, opts));
  }

  private async rebuildNow(board: Board, opts: RebuildOptions = {}): Promise<number> {
    let changeToken: string | null = null;
    if (board.store.changes) changeToken = (await board.store.changes()).token;

    // The whole scan plan is resolved before anything is cleared, so a
    // throw — a hostile snapshot day name, a store failure — leaves the
    // current index intact and every retry possible. Nothing between
    // clearBoard and the loops below derives plan state from untrusted
    // input or can throw on it.
    const today = dayBucket(this.now());
    const from = opts.useSnapshots === false ? null : await snapshotScanStart(board, today, opts.onWarning);
    const snapshotDays = from === null
      ? []
      // snapshotScanStart already warned about the days left out here.
      : (await listSnapshotDays(board)).filter((day) => day <= today && isCalendarDay(day));
    const liveScanDays = from === null
      // Sorted ascending, so filtering to today ends the scan, as in Board.scan.
      ? (await discoverBucketDays(board.store, board.name)).filter((day) => day <= today)
      : [];

    this.clearBoard(board.name);

    let count = 0;
    let maxId: string | null = null;
    let chunk: Post[] = [];
    let chunkJsons: Array<string | null> = [];
    // Store keys sort like their ids within a board (both lead with the ULID
    // time part), so the cursor derives from the single max id.
    const offer = (post: Post, json?: string | null) => {
      if (maxId === null || post.id > maxId) maxId = post.id;
      chunk.push(post);
      chunkJsons.push(json ?? null);
      if (chunk.length >= REBUILD_CHUNK) {
        count += this.ingestChunk(chunk, chunkJsons);
        chunk = [];
        chunkJsons = [];
      }
    };
    // Live buckets are folded with the same bounded-concurrency reader the
    // compaction job uses; unreadable objects are skipped, not fatal.
    const offerBucket = async (day: string) => {
      const bucket = await readDayBucket(board.store, board.name, day, this.now);
      for (const post of bucket.posts) {
        if (post !== null) offer(post);
      }
    };

    if (from === null) {
      // No usable snapshots: every existing bucket, oldest first.
      for (const day of liveScanDays) {
        await offerBucket(day);
      }
    } else {
      // Snapshots first: O(days) objects regardless of how many posts the
      // closed buckets hold. Corrupt lines are skipped with a warning.
      for (const day of snapshotDays) {
        const chunks = iterSnapshotChunks(board, day, { now: this.now, onWarning: opts.onWarning });
        for (;;) {
          const next = await chunks.next();
          if (next.done) break;
          for (let i = 0; i < next.value.posts.length; i++) offer(next.value.posts[i]!, next.value.lines[i]);
        }
      }
      // Then live buckets the snapshots do not fully cover, up to today.
      // The walk is bounded by the buckets that exist, not by calendar days.
      for await (const day of iterLiveBucketDays(board.store, board.name, from, today)) {
        await offerBucket(day);
      }
    }
    if (chunk.length) count += this.ingestChunk(chunk, chunkJsons);
    this.recomputeThreads(board.name);
    // Folds are derived from posts exactly like thread summaries: recompute
    // every task on the board in one pass so a snapshot-aware rebuild lands
    // on the same rows incremental sync would have produced.
    this.recomputeTasks(board.name, opts.onWarning ?? this.onWarning);

    this.saveState({
      board: board.name,
      cursor: maxId === null ? null : board.keyFor(maxId),
      changeToken,
      syncCount: 0,
      lastReconcileMs: this.now(),
    });
    this.syncedBoards.add(board.name);
    return count;
  }

  state(board: string): BoardSyncState | null {
    const row = this.db.query<StateRow, [string]>(`
      SELECT board, cursor, change_token, sync_count, last_reconcile_ms
      FROM sync_state WHERE board = ?
    `).get(board);
    return row ? fromStateRow(row) : null;
  }

  threads(opts: ThreadQueryOptions = {}): ThreadSummary[] {
    const limit = queryLimit(opts.limit);
    const rows = opts.board === undefined
      ? this.db.query<ThreadRow, [number]>(`
          SELECT root_id, board, title, last_activity, reply_count
          FROM threads ORDER BY last_activity DESC, root_id DESC LIMIT ?
        `).all(limit)
      : this.db.query<ThreadRow, [string, number]>(`
          SELECT root_id, board, title, last_activity, reply_count
          FROM threads WHERE board = ? ORDER BY last_activity DESC, root_id DESC LIMIT ?
        `).all(opts.board, limit);
    return rows.map(fromThreadRow);
  }

  thread(rootId: string): ThreadView | null {
    const row = this.db.query<ThreadRow, [string]>(`
      SELECT root_id, board, title, last_activity, reply_count
      FROM threads WHERE root_id = ?
    `).get(rootId);
    if (!row) return null;
    const posts = this.db.query<JsonRow, [string, string]>(`
      SELECT post_json FROM posts WHERE thread = ? AND board = ? ORDER BY id
    `).all(rootId, row.board).map(rowPost);
    return { ...fromThreadRow(row), posts };
  }

  /**
   * Tasks ordered by last activity (newest first), filtered by current state
   * and/or board. A task exists per (root id, board): the same root id named
   * by status posts on two boards yields two independent folds.
   */
  tasks(opts: TaskQueryOptions = {}): TaskSummary[] {
    if (opts.state !== undefined && !isStatus(opts.state)) throw new Error(`unknown status: ${String(opts.state)}`);
    const limit = queryLimit(opts.limit);
    const filters: string[] = [];
    const params: Array<string | number> = [];
    if (opts.state !== undefined) {
      filters.push("t.state = ?");
      params.push(opts.state);
    }
    if (opts.board !== undefined) {
      filters.push("t.board = ?");
      params.push(opts.board);
    }
    params.push(limit);
    const rows = this.db.query<TaskRow, Array<string | number>>(`
      SELECT t.root_id, t.board, t.state, t.last_post_id, t.last_activity, p.title AS title
      FROM tasks t LEFT JOIN posts p ON p.id = t.root_id AND p.board = t.board
      ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
      ORDER BY t.last_activity DESC, t.root_id DESC LIMIT ?
    `).all(...params);
    return rows.map(fromTaskRow);
  }

  /**
   * One task with its full fold history (the request root's initial submitted
   * stamp, every status post, and rejected invalid transitions). Post ids are
   * unique across boards, so multiple rows for one root id can only come from
   * hostile same-id content on two boards; the most recently active wins.
   * `board` scopes the lookup to one board's fold — a status post on another
   * board naming the same root id must not decide which fold is returned.
   */
  task(rootId: string, opts: { board?: string } = {}): TaskView | null {
    const row = opts.board === undefined
      ? this.db.query<TaskRow, [string]>(`
          SELECT t.root_id, t.board, t.state, t.last_post_id, t.last_activity, p.title AS title
          FROM tasks t LEFT JOIN posts p ON p.id = t.root_id AND p.board = t.board
          WHERE t.root_id = ?
          ORDER BY t.last_activity DESC, t.board ASC LIMIT 1
        `).get(rootId)
      : this.db.query<TaskRow, [string, string]>(`
          SELECT t.root_id, t.board, t.state, t.last_post_id, t.last_activity, p.title AS title
          FROM tasks t LEFT JOIN posts p ON p.id = t.root_id AND p.board = t.board
          WHERE t.root_id = ? AND t.board = ?
        `).get(rootId, opts.board);
    if (!row) return null;
    const history = this.db.query<HistoryRow, [string, string]>(`
      SELECT post_id, state, valid, ts, from_state
      FROM task_history WHERE root_id = ? AND board = ?
      ORDER BY post_id
    `).all(rootId, row.board).map(fromHistoryRow);
    return { ...fromTaskRow(row), history };
  }

  mentions(agent: string, opts: QueryOptions = {}): Post[] {
    const limit = queryLimit(opts.limit);
    const rows = opts.board === undefined
      ? this.db.query<JsonRow, [string, number]>(`
          SELECT p.post_json FROM mentions m
          JOIN posts p ON p.id = m.post_id
          WHERE m.agent = ? ORDER BY p.id DESC LIMIT ?
        `).all(agent, limit)
      : this.db.query<JsonRow, [string, string, number]>(`
          SELECT p.post_json FROM mentions m
          JOIN posts p ON p.id = m.post_id
          WHERE m.agent = ? AND p.board = ? ORDER BY p.id DESC LIMIT ?
        `).all(agent, opts.board, limit);
    return rows.map(rowPost);
  }

  search(query: string, opts: QueryOptions = {}): SearchResult[] {
    const match = ftsQuery(query);
    if (!match) return [];
    const limit = queryLimit(opts.limit);
    const rows = opts.board === undefined
      ? this.db.query<SearchRow, [string, number]>(`
          SELECT p.post_json, bm25(posts_fts) AS rank,
                 snippet(posts_fts, 1, '<mark>', '</mark>', ' … ', 24) AS snippet
          FROM posts_fts JOIN posts p ON p.rowid = posts_fts.rowid
          WHERE posts_fts MATCH ? ORDER BY rank, p.id DESC LIMIT ?
        `).all(match, limit)
      : this.db.query<SearchRow, [string, string, number]>(`
          SELECT p.post_json, bm25(posts_fts) AS rank,
                 snippet(posts_fts, 1, '<mark>', '</mark>', ' … ', 24) AS snippet
          FROM posts_fts JOIN posts p ON p.rowid = posts_fts.rowid
          WHERE posts_fts MATCH ? AND p.board = ? ORDER BY rank, p.id DESC LIMIT ?
        `).all(match, opts.board, limit);
    return rows.map((row) => ({ ...rowPost(row), rank: row.rank, snippet: row.snippet }));
  }

  private migrate(): void {
    const version = this.db.query<{ user_version: number }, []>("PRAGMA user_version").get()?.user_version ?? 0;
    if (version !== 0 && version !== SCHEMA_VERSION) {
      // The index is derived and rebuildable, so a version change drops every
      // table and the next sync/rebuild reconstructs it from the store.
      this.db.exec(`
        DROP TABLE IF EXISTS posts_fts;
        DROP TABLE IF EXISTS mentions;
        DROP TABLE IF EXISTS posts;
        DROP TABLE IF EXISTS threads;
        DROP TABLE IF EXISTS tasks;
        DROP TABLE IF EXISTS task_history;
        DROP TABLE IF EXISTS sync_state;
      `);
    }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS posts (
        rowid INTEGER PRIMARY KEY,
        id TEXT NOT NULL UNIQUE,
        board TEXT NOT NULL,
        thread TEXT NOT NULL,
        reply_to TEXT,
        author TEXT NOT NULL,
        instance TEXT NOT NULL,
        ts TEXT NOT NULL,
        title TEXT,
        body TEXT NOT NULL,
        post_json TEXT NOT NULL,
        act TEXT,
        status TEXT,
        task TEXT
      );
      CREATE INDEX IF NOT EXISTS posts_board_id ON posts(board, id);
      CREATE INDEX IF NOT EXISTS posts_thread_id ON posts(thread, id);
      CREATE INDEX IF NOT EXISTS posts_task_id ON posts(task, id);

      CREATE TABLE IF NOT EXISTS threads (
        root_id TEXT PRIMARY KEY,
        board TEXT NOT NULL,
        title TEXT,
        last_activity TEXT NOT NULL,
        reply_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS threads_board_activity ON threads(board, last_activity DESC);

      CREATE TABLE IF NOT EXISTS tasks (
        root_id TEXT NOT NULL,
        board TEXT NOT NULL,
        state TEXT NOT NULL,
        last_post_id TEXT NOT NULL,
        last_activity TEXT NOT NULL,
        PRIMARY KEY (root_id, board)
      );
      CREATE INDEX IF NOT EXISTS tasks_board_activity ON tasks(board, last_activity DESC);
      CREATE INDEX IF NOT EXISTS tasks_state_activity ON tasks(state, last_activity DESC);

      CREATE TABLE IF NOT EXISTS task_history (
        root_id TEXT NOT NULL,
        board TEXT NOT NULL,
        post_id TEXT NOT NULL,
        state TEXT NOT NULL,
        valid INTEGER NOT NULL,
        ts TEXT NOT NULL,
        from_state TEXT,
        PRIMARY KEY (root_id, board, post_id)
      );

      CREATE TABLE IF NOT EXISTS mentions (
        post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        agent TEXT NOT NULL,
        PRIMARY KEY (post_id, agent)
      );
      CREATE INDEX IF NOT EXISTS mentions_agent_post ON mentions(agent, post_id DESC);

      CREATE VIRTUAL TABLE IF NOT EXISTS posts_fts USING fts5(
        title,
        body,
        tokenize = 'unicode61'
      );

      CREATE TABLE IF NOT EXISTS sync_state (
        board TEXT PRIMARY KEY,
        cursor TEXT,
        change_token TEXT,
        sync_count INTEGER NOT NULL DEFAULT 0,
        last_reconcile_ms INTEGER
      );
      PRAGMA user_version = ${SCHEMA_VERSION};
    `);
  }

  private async ingestSince(board: Board, state: BoardSyncState): Promise<number> {
    let ingested = 0;
    for (;;) {
      const result = await board.since(state.cursor ?? undefined);
      const transaction = this.db.transaction(() => {
        const pendingFolds = new Map<string, Set<string>>();
        for (const post of result.posts) {
          if (post.board === board.name && this.ingestOne(post, pendingFolds)) ingested++;
        }
        this.flushTaskFolds(pendingFolds);
        state.cursor = result.cursor ?? state.cursor;
        // Cursor and page contents commit together, so a crash retries either
        // the whole page or none of it.
        this.saveState(state);
      });
      transaction();
      if (!result.truncated) return ingested;
    }
  }

  private ingestBatch(posts: Post[]): number {
    let ingested = 0;
    const transaction = this.db.transaction(() => {
      const pendingFolds = new Map<string, Set<string>>();
      for (const post of posts) if (this.ingestOne(post, pendingFolds)) ingested++;
      this.flushTaskFolds(pendingFolds);
    });
    transaction();
    return ingested;
  }

  /**
   * Bulk path for rebuilds: inserts posts, FTS, and mentions but leaves
   * thread summaries to a single `recomputeThreads` pass, so a million-post
   * rebuild pays one aggregate pass instead of per-post thread maintenance.
   * De-duplication by post id is the posts.id UNIQUE key. `jsons` may carry
   * the canonical bytes each post was read from (snapshot lines); when absent
   * the post is canonicalised here.
   */
  private ingestChunk(posts: Post[], jsons?: Array<string | null>): number {
    let ingested = 0;
    const { insertPost, insertFts, insertMention } = this.bulkStatements();
    const transaction = this.db.transaction(() => {
      for (let i = 0; i < posts.length; i++) {
        const post = posts[i]!;
        const result = insertPost.run(
          post.id,
          post.board,
          post.thread,
          post.replyTo ?? null,
          post.author,
          post.instance,
          post.ts,
          post.title ?? null,
          post.body,
          jsons?.[i] ?? canonicalize(post),
          post.act ?? null,
          post.status ?? null,
          post.task ?? null,
        );
        if (result.changes === 0) continue;
        insertFts.run(result.lastInsertRowid, post.title ?? "", post.body);
        if (post.mentions !== undefined) {
          for (const agent of new Set(post.mentions)) {
            insertMention.run(post.id, agent);
          }
        }
        ingested++;
      }
    });
    transaction();
    return ingested;
  }

  private bulkStatements(): { insertPost: Statement; insertFts: Statement; insertMention: Statement } {
    if (this.bulk === null) {
      this.bulk = {
        insertPost: this.db.query(`
          INSERT OR IGNORE INTO posts
            (id, board, thread, reply_to, author, instance, ts, title, body, post_json, act, status, task)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `),
        insertFts: this.db.query("INSERT INTO posts_fts (rowid, title, body) VALUES (?, ?, ?)"),
        insertMention: this.db.query("INSERT OR IGNORE INTO mentions (post_id, agent) VALUES (?, ?)"),
      };
    }
    return this.bulk;
  }

  /**
   * Rebuild thread summaries for one board from the posts table, producing
   * exactly the rows incremental ingest would have produced: roots carry
   * their title, the thread's max ts, and reply counts; replies whose root is
   * missing (it may arrive later) keep a titleless summary row. One pass over
   * the board's posts, so a million-post rebuild stays flat.
   */
  private recomputeThreads(board: string): void {
    const transaction = this.db.transaction(() => {
      this.db.query(`
        INSERT INTO threads (root_id, board, title, last_activity, reply_count)
        SELECT r.thread, r.board, p.title, r.mx, r.cnt
        FROM (
          SELECT thread, board, max(ts) AS mx, count(*) - sum(id = thread) AS cnt
          FROM posts WHERE board = ?
          GROUP BY thread
        ) r
        LEFT JOIN posts p ON p.id = r.thread AND p.board = r.board
        ON CONFLICT(root_id) DO UPDATE SET
          title = excluded.title,
          last_activity = excluded.last_activity,
          reply_count = excluded.reply_count
      `).run(board);
    });
    transaction();
  }

  /**
   * Recompute every task fold on a board (rebuild path). The candidate roots
   * mirror `taskFoldTargets` exactly: every request post — root or reply — is
   * a candidate, because its own fold always gets the implicit submitted
   * stamp even when an explicit `task` field names a different root; any
   * post's `task` field names its root (which also covers a referenced id
   * landing late, where the incremental path checks the reference in
   * `taskFoldTargetsFor`); a status post without one folds to its thread
   * root.
   */
  private recomputeTasks(board: string, onWarning?: ((message: string) => void) | undefined): void {
    const candidates = this.db.query<{ root: string }, [string, string, string]>(`
      SELECT id AS root FROM posts WHERE board = ? AND act = 'request'
      UNION
      SELECT task AS root FROM posts WHERE board = ? AND task IS NOT NULL
      UNION
      SELECT thread AS root FROM posts WHERE board = ? AND act = 'status' AND task IS NULL
    `).all(board, board, board);
    const transaction = this.db.transaction(() => {
      for (const { root } of candidates) this.recomputeTaskFold(root, board, onWarning);
    });
    transaction();
  }

  /**
   * Recompute one (task root, board) fold from the posts table and rewrite
   * its rows: history is replaced wholesale, so the result depends only on
   * the posts — the same property that makes rebuild and incremental ingest
   * agree. Runs inside the caller's transaction (ingestOne's ambient one,
   * flushTaskFolds', or recomputeTasks' wrap). Trust warnings fire for every
   * NEWLY rejected transition — one absent from task_history before the
   * rewrite — so an out-of-order arrival that flips an earlier-ingested post
   * to invalid warns exactly when it happens, while later activity on the
   * task never re-warns about a known rejection. On the rebuild path
   * (recomputeTasks, after clearBoard) the before-set is always empty, so
   * every rejected transition in the fold warns, as before.
   */
  private recomputeTaskFold(
    rootId: string,
    board: string,
    onWarning?: ((message: string) => void) | undefined,
  ): void {
    const previouslyRejected = new Set(
      this.db.query<{ post_id: string }, [string, string]>(`
        SELECT post_id FROM task_history WHERE root_id = ? AND board = ? AND valid = 0
      `).all(rootId, board).map((row) => row.post_id),
    );
    const rows = this.db.query<FoldRow, [string, string, string, string]>(`
      SELECT id, ts, act, status, task, thread FROM posts
      WHERE board = ? AND (id = ? OR task = ? OR (thread = ? AND act = 'status'))
      ORDER BY id
    `).all(board, rootId, rootId, rootId);
    const fold = foldTask(rootId, rows);

    this.db.query("DELETE FROM task_history WHERE root_id = ? AND board = ?").run(rootId, board);
    const insertTransition = this.db.query(`
      INSERT INTO task_history (root_id, board, post_id, state, valid, ts, from_state)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const t of fold.history) {
      insertTransition.run(rootId, board, t.postId, t.state, t.valid ? 1 : 0, t.ts, t.from ?? null);
    }
    if (fold.state !== null && fold.lastPostId !== null && fold.lastActivity !== null) {
      this.db.query(`
        INSERT INTO tasks (root_id, board, state, last_post_id, last_activity)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(root_id, board) DO UPDATE SET
          state = excluded.state,
          last_post_id = excluded.last_post_id,
          last_activity = excluded.last_activity
      `).run(rootId, board, fold.state, fold.lastPostId, fold.lastActivity);
    }

    const warn = onWarning ?? this.onWarning;
    if (warn === undefined) return;
    for (const t of fold.history) {
      if (t.valid || previouslyRejected.has(t.postId)) continue;
      warn(`rejected invalid transition for task ${rootId} on ${board}: `
        + `post ${t.postId} asserts "${t.state}" while the current state is ${t.from === null ? "unset" : `"${t.from}"`}`);
    }
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.operationChain.then(operation, operation);
    this.operationChain = run.catch(() => {});
    return run;
  }

  private saveState(state: BoardSyncState): void {
    this.db.query(`
      INSERT INTO sync_state (board, cursor, change_token, sync_count, last_reconcile_ms)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(board) DO UPDATE SET
        cursor = excluded.cursor,
        change_token = excluded.change_token,
        sync_count = excluded.sync_count,
        last_reconcile_ms = excluded.last_reconcile_ms
    `).run(state.board, state.cursor, state.changeToken, state.syncCount, state.lastReconcileMs);
  }

  private clearBoard(board: string): void {
    const transaction = this.db.transaction(() => {
      this.db.query("DELETE FROM posts_fts WHERE rowid IN (SELECT rowid FROM posts WHERE board = ?)").run(board);
      this.db.query("DELETE FROM mentions WHERE post_id IN (SELECT id FROM posts WHERE board = ?)").run(board);
      this.db.query("DELETE FROM posts WHERE board = ?").run(board);
      this.db.query("DELETE FROM threads WHERE board = ?").run(board);
      this.db.query("DELETE FROM tasks WHERE board = ?").run(board);
      this.db.query("DELETE FROM task_history WHERE board = ?").run(board);
      this.db.query("DELETE FROM sync_state WHERE board = ?").run(board);
    });
    transaction();
  }
}

/** Short alias for callers that already import from `@board/index`. */
export { BoardIndex as Index };

function emptyState(board: string): BoardSyncState {
  return { board, cursor: null, changeToken: null, syncCount: 0, lastReconcileMs: null };
}

function fromStateRow(row: StateRow): BoardSyncState {
  return {
    board: row.board,
    cursor: row.cursor,
    changeToken: row.change_token,
    syncCount: row.sync_count,
    lastReconcileMs: row.last_reconcile_ms,
  };
}

function fromThreadRow(row: ThreadRow): ThreadSummary {
  return {
    rootId: row.root_id,
    board: row.board,
    title: row.title,
    lastActivity: row.last_activity,
    replyCount: row.reply_count,
  };
}

function fromTaskRow(row: TaskRow): TaskSummary {
  return {
    rootId: row.root_id,
    board: row.board,
    state: row.state as Status,
    title: row.title ?? null,
    lastActivity: row.last_activity,
    lastPostId: row.last_post_id,
  };
}

function fromHistoryRow(row: HistoryRow): TaskTransition {
  return {
    postId: row.post_id,
    state: row.state as Status,
    valid: row.valid === 1,
    ts: row.ts,
    from: (row.from_state ?? null) as Status | null,
  };
}

function rowPost(row: JsonRow): Post {
  return JSON.parse(row.post_json) as Post;
}

function queryLimit(limit = 50): number {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("limit must be a positive integer");
  return limit;
}

function ftsQuery(query: string): string {
  return query
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `"${term.replaceAll('"', '""')}"`)
    .join(" ");
}

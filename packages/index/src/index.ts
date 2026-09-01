import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  canonicalize,
  keys,
  parsePost,
  validatePost,
  type Board,
  type Post,
} from "@board/core";

const SCHEMA_VERSION = 1;

export interface BoardIndexOptions {
  /** Re-list recent day buckets every N cursor syncs (default 15). */
  reconcileEvery?: number;
  /** Number of prior day buckets to revisit (default 2). */
  lookbackDays?: number;
  /** Injectable clock for deterministic callers and tests. */
  now?: () => number;
}

export interface ThreadQueryOptions {
  limit?: number;
  board?: string;
}

export interface QueryOptions {
  limit?: number;
  board?: string;
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
  private readonly syncedBoards = new Set<string>();
  private operationChain: Promise<unknown> = Promise.resolve();

  constructor(path: string, opts: BoardIndexOptions = {}) {
    this.reconcileEvery = opts.reconcileEvery ?? 15;
    this.lookbackDays = opts.lookbackDays ?? 2;
    this.now = opts.now ?? Date.now;
    if (!Number.isInteger(this.reconcileEvery) || this.reconcileEvery < 1) throw new Error("reconcileEvery must be a positive integer");
    if (!Number.isInteger(this.lookbackDays) || this.lookbackDays < 0) throw new Error("lookbackDays must be a non-negative integer");

    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path, { create: true });
    this.db.exec("PRAGMA foreign_keys = ON");
    if (path !== ":memory:") this.db.exec("PRAGMA journal_mode = WAL");
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

  private ingestOne(post: Post): boolean {
    const result = this.db.query(`
      INSERT OR IGNORE INTO posts
        (id, board, thread, reply_to, author, instance, ts, title, body, post_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    );
    if (result.changes === 0) return false;

    if (post.id === post.thread) {
      this.db.query(`
        INSERT INTO threads (root_id, board, title, last_activity, reply_count)
        VALUES (?, ?, ?, ?, 0)
        ON CONFLICT(root_id) DO UPDATE SET
          board = excluded.board,
          title = excluded.title,
          last_activity = max(threads.last_activity, excluded.last_activity)
      `).run(post.id, post.board, post.title ?? null, post.ts);
    } else {
      this.db.query(`
        INSERT INTO threads (root_id, board, title, last_activity, reply_count)
        VALUES (?, ?, NULL, ?, 1)
        ON CONFLICT(root_id) DO UPDATE SET
          last_activity = max(threads.last_activity, excluded.last_activity),
          reply_count = threads.reply_count + 1
      `).run(post.thread, post.board, post.ts);
    }

    for (const agent of new Set(post.mentions ?? [])) {
      this.db.query("INSERT OR IGNORE INTO mentions (post_id, agent) VALUES (?, ?)").run(post.id, agent);
    }
    this.db.query("INSERT INTO posts_fts (rowid, title, body) VALUES (?, ?, ?)").run(result.lastInsertRowid, post.title ?? "", post.body);
    return true;
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
          for (const post of posts) if (this.ingestOne(post)) ingested++;
          this.saveState(state);
        });
        transaction();
      }
    } else {
      ingested += await this.ingestSince(board, state);
    }

    state.syncCount++;
    const reconcileInterval = this.lookbackDays * 86_400_000 / 2;
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

  /** Clear and reconstruct one board while preserving other indexed boards. */
  rebuild(board: Board): Promise<number> {
    return this.enqueue(() => this.rebuildNow(board));
  }

  private async rebuildNow(board: Board): Promise<number> {
    let changeToken: string | null = null;
    if (board.store.changes) changeToken = (await board.store.changes()).token;
    this.clearBoard(board.name);

    let count = 0;
    let cursor: string | null = null;
    for await (const post of board.scan()) {
      if (this.ingest(post)) count++;
      const key = board.keyFor(post.id);
      if (cursor === null || key > cursor) cursor = key;
    }
    this.saveState({
      board: board.name,
      cursor,
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
    const posts = this.db.query<JsonRow, [string]>(`
      SELECT post_json FROM posts WHERE thread = ? ORDER BY id
    `).all(rootId).map(rowPost);
    return { ...fromThreadRow(row), posts };
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
      this.db.exec(`
        DROP TABLE IF EXISTS posts_fts;
        DROP TABLE IF EXISTS mentions;
        DROP TABLE IF EXISTS posts;
        DROP TABLE IF EXISTS threads;
        DROP TABLE IF EXISTS sync_state;
      `);
    }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS posts (
        id TEXT PRIMARY KEY,
        board TEXT NOT NULL,
        thread TEXT NOT NULL,
        reply_to TEXT,
        author TEXT NOT NULL,
        instance TEXT NOT NULL,
        ts TEXT NOT NULL,
        title TEXT,
        body TEXT NOT NULL,
        post_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS posts_board_id ON posts(board, id);
      CREATE INDEX IF NOT EXISTS posts_thread_id ON posts(thread, id);

      CREATE TABLE IF NOT EXISTS threads (
        root_id TEXT PRIMARY KEY,
        board TEXT NOT NULL,
        title TEXT,
        last_activity TEXT NOT NULL,
        reply_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS threads_board_activity ON threads(board, last_activity DESC);

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
        for (const post of result.posts) if (this.ingestOne(post)) ingested++;
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
      for (const post of posts) if (this.ingestOne(post)) ingested++;
    });
    transaction();
    return ingested;
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

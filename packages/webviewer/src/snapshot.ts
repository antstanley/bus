// Read-only reader for a store's snapshot export (backlog 504).
//
// Layout supported (verified against packages/index/src/compaction.ts, the
// only writer of these objects): a store export directory holding
//
//   boards/<board>/snapshots/<yyyy-mm-dd>.jsonl
//
// one canonical post per line — exactly `encodePost` output for one CLOSED
// day bucket, newline-terminated. Both fs and S3 stores use this key space,
// so the reader consumes the generic `Store` interface (get/list only; it
// never writes or deletes) and works unchanged over FsStore and S3Store.
//
// Untrusted-data rules: snapshot lines are hostile store content. Every line
// is parsed with core `parsePost` (read-side size/depth/skew limits apply),
// every parsed post is bound to the board whose snapshot it was read from
// (a forged line must not enter another board's view, mirroring the index's
// iterSnapshotChunks), and unreadable lines are counted and skipped, never
// trusted and never fatal.

import { decoder, encoder, parsePost, type Post, type Store } from "@board/core";

const BOARDS_PREFIX = "boards/";
/** Board names in the store key space: core keys.NAME. */
const BOARD_SEGMENT = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const DAY_SEGMENT = /^\d{4}-\d{2}-\d{2}$/;
/** boards/<board>/snapshots/<day>.jsonl — the only keys this viewer reads. */
const SNAPSHOT_KEY = /^(boards)\/([a-z0-9][a-z0-9_-]{0,31})\/snapshots\/(\d{4}-\d{2}-\d{2})\.jsonl$/;

/** One snapshot object discovered under the export's boards/ prefix. */
export interface SnapshotKey {
  board: string;
  day: string;
  /** Full store key. */
  key: string;
}

/** Every snapshot object in the store, sorted by key. */
export async function listSnapshotKeys(store: Store): Promise<SnapshotKey[]> {
  const found: SnapshotKey[] = [];
  for await (const key of keysUnder(store, BOARDS_PREFIX)) {
    const match = SNAPSHOT_KEY.exec(key);
    if (match) found.push({ board: match[2]!, day: match[3]!, key });
  }
  return found;
}

/** Every key under `prefix`, following the Store list contract. */
async function* keysUnder(store: Store, prefix: string): AsyncGenerator<string> {
  let after: string | undefined;
  for (;;) {
    const { keys, truncated } = await store.list(prefix, { limit: 1_000, ...(after === undefined ? {} : { after }) });
    for (const key of keys) yield key;
    if (!truncated || keys.length === 0) return;
    after = keys[keys.length - 1]!;
  }
}

/** One day snapshot's parsed content plus what had to be skipped. */
export interface SnapshotDayContent {
  board: string;
  day: string;
  posts: Post[];
  /** Lines that failed parsePost (size, depth, schema, id checks). */
  corruptLines: number;
  /** Parseable lines bound to a different board than the snapshot they were in. */
  foreignBoardLines: number;
}

/**
 * Read one day snapshot. Posts come back in line order; grouping and
 * ordering happen once over the whole model in loadSnapshotModel.
 */
export async function readSnapshotDay(
  store: Store,
  board: string,
  day: string,
  opts: { now?: (() => number) | undefined } = {},
): Promise<SnapshotDayContent> {
  if (!BOARD_SEGMENT.test(board)) throw new Error(`invalid board name: ${JSON.stringify(board)}`);
  if (!DAY_SEGMENT.test(day)) throw new Error(`invalid snapshot day: ${JSON.stringify(day)}`);
  const key = `${BOARDS_PREFIX}${board}/snapshots/${day}.jsonl`;
  const bytes = await store.get(key);
  const content: SnapshotDayContent = { board, day, posts: [], corruptLines: 0, foreignBoardLines: 0 };
  if (bytes === null) return content;
  const now = opts.now ?? Date.now;
  for (const line of decoder.decode(bytes).split("\n")) {
    if (line === "") continue; // encodePost output is newline-terminated
    let post: Post;
    try {
      // parsePost re-applies every live-read limit, above all the per-line
      // maxBytes cap that validating the already-parsed object would miss.
      post = parsePost(encoder.encode(line), { now });
    } catch {
      content.corruptLines++;
      continue;
    }
    if (post.board !== board) {
      // Same binding rule as the index rebuild: a line claiming another
      // board never enters that board's view.
      content.foreignBoardLines++;
      continue;
    }
    content.posts.push(post);
  }
  return content;
}

/** One conversation as rendered: the thread's posts in id order. */
export interface SnapshotThread {
  board: string;
  /** Root post id (post.thread). */
  rootId: string;
  /** Title of the root post; null when the root itself is not in the export. */
  title: string | null;
  lastActivity: string;
  replyCount: number;
  posts: Post[];
}

/** Everything the renderer needs, already grouped and ordered. */
export interface SnapshotModel {
  /** Boards with at least one snapshot post, ascending. */
  boards: string[];
  /** Snapshot days covered, ascending. */
  days: string[];
  /** Threads, most recent activity first (ties broken for determinism). */
  threads: SnapshotThread[];
  postCount: number;
  corruptLines: number;
  foreignBoardLines: number;
  generatedAt: string;
}

export interface SnapshotModelOptions {
  /** Restrict the model to one board's snapshots. */
  board?: string;
  /** Clock for post validation (default Date.now) and generatedAt. */
  now?: (() => number) | undefined;
}

/** Load every snapshot post and fold it into the renderable model. */
export async function loadSnapshotModel(store: Store, opts: SnapshotModelOptions = {}): Promise<SnapshotModel> {
  if (opts.board !== undefined && !BOARD_SEGMENT.test(opts.board)) {
    throw new Error(`invalid board name: ${JSON.stringify(opts.board)}`);
  }
  const now = opts.now ?? Date.now;
  const snapshotKeys = await listSnapshotKeys(store);
  const boards = new Set<string>();
  const days = new Set<string>();
  const byThread = new Map<string, SnapshotThread>();
  const model: SnapshotModel = {
    boards: [],
    days: [],
    threads: [],
    postCount: 0,
    corruptLines: 0,
    foreignBoardLines: 0,
    generatedAt: new Date(now()).toISOString(),
  };

  for (const snapshot of snapshotKeys) {
    if (opts.board !== undefined && snapshot.board !== opts.board) continue;
    boards.add(snapshot.board);
    days.add(snapshot.day);
    const content = await readSnapshotDay(store, snapshot.board, snapshot.day, { now });
    model.corruptLines += content.corruptLines;
    model.foreignBoardLines += content.foreignBoardLines;
    for (const post of content.posts) {
      model.postCount++;
      const groupKey = `${post.board}\u0000${post.thread}`;
      let thread = byThread.get(groupKey);
      if (thread === undefined) {
        thread = {
          board: post.board,
          rootId: post.thread,
          title: null,
          lastActivity: post.ts,
          replyCount: 0,
          posts: [],
        };
        byThread.set(groupKey, thread);
      }
      thread.posts.push(post);
      if (post.id === post.thread && post.title !== undefined) thread.title = post.title;
      if (post.ts > thread.lastActivity) thread.lastActivity = post.ts;
    }
  }

  model.boards = [...boards].sort();
  model.days = [...days].sort();
  model.threads = [...byThread.values()];
  for (const thread of model.threads) {
    thread.posts.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    thread.replyCount = thread.posts.filter((post) => post.id !== thread.rootId).length;
  }
  model.threads.sort((a, b) =>
    a.lastActivity === b.lastActivity
      ? a.board === b.board ? (a.rootId < b.rootId ? 1 : -1) : a.board < b.board ? -1 : 1
      : a.lastActivity < b.lastActivity ? 1 : -1,
  );
  return model;
}

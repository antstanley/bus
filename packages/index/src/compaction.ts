// Day snapshots, compaction, and retention (backlog 405).
//
// Layout (extends the DESIGN.md key space):
//   boards/<board>/snapshots/<yyyy-mm-dd>.jsonl
//
// A snapshot holds one canonical post per line — exactly `encodePost` output,
// newline-terminated, sorted by store key — for one CLOSED day bucket (a
// bucket is closed once its UTC day has passed). Snapshots are derived,
// disposable artifacts: readers may ignore them and pay a full live scan, and
// a stale snapshot is rewritten rather than trusted.
//
// The compaction job writes snapshots with `Store.put(..., { ifNoneMatch })`.
// Retention deletes a day's live objects only after re-reading the snapshot
// and checking that it covers the live bucket, so a corrupt, stale, or
// missing snapshot can never cause data loss.

import {
  KeyExistsError,
  assertName,
  assertSegment,
  dayBucket,
  decoder,
  encodePost,
  encoder,
  isDayBucket,
  keys,
  listAll,
  nextDay,
  parsePost,
  ulidTime,
  type Board,
  type Post,
} from "@board/core";

/** One day in ms; retention cutoffs are whole days. */
export const DAY_MS = 86_400_000;

/** Object reads (and deletes) in flight when folding or collecting a bucket. */
const BUCKET_CONCURRENCY = 128;

/**
 * Every key under `prefix` in store order. One walk when the store can do
 * it: paging a 100k-object day bucket 1000 keys at a time makes backends
 * that re-walk per page (fs) pay the whole directory listing over and over.
 */
async function collectBucketKeys(store: Board["store"], prefix: string): Promise<string[]> {
  const whole = await store.list(prefix, { limit: Infinity });
  if (!whole.truncated) return whole.keys;
  const keys: string[] = [];
  let after: string | undefined;
  for (;;) {
    const { keys: ks, truncated } = await store.list(prefix, { limit: 100_000, ...(after === undefined ? {} : { after }) });
    keys.push(...ks);
    if (!truncated || ks.length === 0) return keys;
    after = ks[ks.length - 1]!;
  }
}

/** Snapshot key for one day: boards/<board>/snapshots/<day>.jsonl. */
export function snapshotKey(board: string, day: string): string {
  if (!isDayBucket(day)) throw new Error(`snapshot day must be yyyy-mm-dd: ${JSON.stringify(day)}`);
  return `boards/${assertName(board, "board")}/snapshots/${assertSegment(day, "day")}.jsonl`;
}

/** Prefix listing every snapshot of a board. */
export function snapshotsPrefix(board: string): string {
  return `boards/${assertName(board, "board")}/snapshots/`;
}

// ----------------------------------------------------------- compaction ---

export type SnapshotStatus = "written" | "verified-existing" | "rewritten" | "failed";

export interface SnapshotResult {
  board: string;
  day: string;
  status: SnapshotStatus;
  /** Posts covered by the snapshot (unreadable live objects are not included). */
  posts: number;
  /** True when the snapshot was re-read and matched its live bucket. */
  verified: boolean;
  warnings: string[];
}

export interface CompactionOptions {
  /** Compact exactly these days; default: every closed bucket found in the store. */
  days?: string[] | undefined;
  /** Replace an existing snapshot whose content no longer matches (default true). */
  rewrite?: boolean | undefined;
  /** Clock; a bucket is closed when its day has passed (default Date.now). */
  now?: (() => number) | undefined;
  onWarning?: ((message: string) => void) | undefined;
}

/**
 * Write day snapshots for closed buckets. Idempotent: an existing snapshot
 * that still matches its live bucket is kept ("verified-existing"); a stale
 * one (late arrivals into a closed bucket) is rewritten unless
 * `opts.rewrite === false`. Every result is verified against the live bucket,
 * which is what lets retention act on it later.
 */
export async function compactBoard(board: Board, opts: CompactionOptions = {}): Promise<SnapshotResult[]> {
  const now = opts.now ?? Date.now;
  const today = dayBucket(now());
  const days = opts.days ?? await discoverClosedDays(board.store, board.name, today);
  const results: SnapshotResult[] = [];
  for (const day of days) {
    if (!isDayBucket(day)) throw new Error(`compact: day must be yyyy-mm-dd: ${JSON.stringify(day)}`);
    if (!isCalendarDay(day)) {
      opts.onWarning?.(`skipping ${day}: not a real calendar day`);
      continue;
    }
    if (day >= today) {
      opts.onWarning?.(`skipping ${day}: the day bucket is still open`);
      continue;
    }
    results.push(await compactDay(board, day, opts));
  }
  return results;
}

/** Compact a single closed day bucket. */
export async function compactDay(board: Board, day: string, opts: CompactionOptions = {}): Promise<SnapshotResult> {
  const now = opts.now ?? Date.now;
  const warnings: string[] = [];
  const warn = (message: string) => {
    warnings.push(message);
    opts.onWarning?.(message);
  };

  const bucket = await readDayBucket(board.store, board.name, day, now);
  if (bucket.skipped > 0) warn(`day ${day}: skipped ${bucket.skipped} unreadable or missing objects while snapshotting`);

  // The snapshot is the union of what it already covers (posts from earlier
  // passes may have been collected from the live bucket by retention) and
  // what the bucket holds now (late arrivals). Live wins id conflicts; both
  // sides are validated posts, so conflicts cannot change content.
  const merged = new Map<string, Post>();
  const key = snapshotKey(board.name, day);
  const existing = await board.store.get(key);
  if (existing !== null) {
    const parsed = parseLines(decoder.decode(existing), board.name, now);
    if (parsed.errors.length > 0) warn(`existing snapshot ${key}: dropped ${parsed.errors.length} unreadable line(s)`);
    for (const post of parsed.posts) merged.set(post.id, post);
  }
  for (const post of bucket.posts) {
    if (post === null) continue;
    merged.set(post.id, post);
  }

  const ordered = [...merged.entries()].map(([id, post]) => ({ id, key: keys.post(board.name, id, ulidTime(id)), post }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const body = ordered.map((entry) => encodePost(entry.post)).join("");

  let status: SnapshotStatus;
  if (existing !== null && decoder.decode(existing) === body) {
    status = "verified-existing";
  } else {
    try {
      await board.store.put(key, body, { ifNoneMatch: true });
      status = existing === null ? "written" : "rewritten";
    } catch (error) {
      if (!(error instanceof KeyExistsError)) throw error;
      if (opts.rewrite === false) {
        status = "failed";
        warn(`snapshot ${key} exists with different content and rewrite is disabled`);
      } else {
        // Snapshots are derived and rebuildable, so replacing a stale or
        // corrupt one is safe; the primary write above still went through
        // ifNoneMatch.
        await board.store.put(key, body);
        status = "rewritten";
        warn(`rewrote snapshot ${key}`);
      }
    }
  }

  const verification = await verifySnapshot(board, day, { now });
  if (!verification.ok) warn(`snapshot ${key} does not cover its live bucket: ${verification.reason}`);
  return { board: board.name, day, status, posts: merged.size, verified: verification.ok, warnings };
}

// ---------------------------------------------------------- verification ---

export interface SnapshotVerification {
  day: string;
  ok: boolean;
  /** Posts the snapshot covers. */
  snapshotPosts: number;
  /** Objects in the live bucket, readable or not. */
  liveKeys: number;
  /** Present only when ok is false. */
  reason?: string | undefined;
}

/**
 * Re-read the snapshot and the live bucket and require that the snapshot
 * covers everything the bucket holds: it must parse cleanly, and every live
 * object must be present in it with identical canonical content. Extra
 * snapshot posts are fine — retention collects live objects after they are
 * verified, so a day's live bucket may be a subset of its snapshot. A stale
 * snapshot (a late arrival it does not contain) or an unreadable snapshot or
 * live object fails, which is what keeps retention from ever deleting data.
 */
export async function verifySnapshot(board: Board, day: string, opts: { now?: (() => number) | undefined } = {}): Promise<SnapshotVerification> {
  const now = opts.now ?? Date.now;
  const key = snapshotKey(board.name, day);
  const bucket = await readDayBucket(board.store, board.name, day, now);

  const fail = (reason: string, snapshotPosts: number): SnapshotVerification =>
    ({ day, ok: false, snapshotPosts, liveKeys: bucket.keys.length, reason });

  const snapshotBytes = await board.store.get(key);
  if (snapshotBytes === null) return fail("snapshot object is missing", 0);
  const snapshotPosts = parseLines(decoder.decode(snapshotBytes), board.name, now);
  if (snapshotPosts.errors.length > 0) {
    return fail(`${snapshotPosts.errors.length} unreadable snapshot line(s), first: ${snapshotPosts.errors[0]}`, snapshotPosts.posts.length);
  }
  const covered = new Set(snapshotPosts.posts.map((post) => lineOf(board.name, post)));
  for (let i = 0; i < bucket.posts.length; i++) {
    const post = bucket.posts[i] ?? null;
    if (post === null) return fail(`live object ${bucket.keys[i]} is unreadable or vanished`, snapshotPosts.posts.length);
    if (!covered.has(lineOf(board.name, post))) {
      return fail(`live object ${bucket.keys[i]} is not covered by the snapshot`, snapshotPosts.posts.length);
    }
  }
  return { day, ok: true, snapshotPosts: snapshotPosts.posts.length, liveKeys: bucket.keys.length, reason: undefined };
}

function lineOf(board: string, post: Post): string {
  // Keying each canonical line by its store key makes the digest
  // order-insensitive between the snapshot file and a freshly listed bucket.
  return `${keys.post(board, post.id, ulidTime(post.id))}\u0000${encodePost(post)}`;
}

// ------------------------------------------------------------- retention ---

export type RetentionStatus = "deleted" | "kept-unverified" | "kept-no-snapshot" | "empty" | "unsupported";

export interface RetentionResult {
  board: string;
  day: string;
  status: RetentionStatus;
  deleted: number;
  warnings: string[];
}

export interface RetentionOptions {
  /** Delete live posts strictly older than this many days (0 = everything before today). */
  olderThanDays: number;
  /** Clock (default Date.now). */
  now?: (() => number) | undefined;
  onWarning?: ((message: string) => void) | undefined;
}

/**
 * Delete live objects older than `olderThanDays`, but only for days whose
 * snapshot exists AND verifies against the live bucket right now. Days on a
 * store without `delete` are reported "unsupported"; already-empty days are
 * "empty", so re-running retention after a pass is quiet and idempotent.
 */
export async function retainBoard(board: Board, opts: RetentionOptions): Promise<RetentionResult[]> {
  const now = opts.now ?? Date.now;
  if (!Number.isInteger(opts.olderThanDays) || opts.olderThanDays < 0) {
    throw new Error("olderThanDays must be a non-negative integer");
  }
  const cutoff = dayBucket(now() - opts.olderThanDays * DAY_MS);
  // Candidates are both live buckets and snapshotted days: a day retention
  // has already collected must still be discovered (and reported "empty") so
  // repeated runs are predictable.
  const days = new Set(await discoverClosedDays(board.store, board.name, cutoff));
  for (const day of await listSnapshotDays(board)) {
    if (day < cutoff) days.add(day);
  }
  const results: RetentionResult[] = [];
  for (const day of [...days].sort()) {
    const warnings: string[] = [];
    const warn = (message: string) => {
      warnings.push(message);
      opts.onWarning?.(message);
    };
    const dayKeys = await collectBucketKeys(board.store, keys.dayPrefix(board.name, day));

    if (dayKeys.length === 0) {
      results.push({ board: board.name, day, status: "empty", deleted: 0, warnings });
      continue;
    }
    if (typeof board.store.delete !== "function") {
      warn(`day ${day}: store does not support delete; live objects kept`);
      results.push({ board: board.name, day, status: "unsupported", deleted: 0, warnings });
      continue;
    }
    if ((await board.store.get(snapshotKey(board.name, day))) === null) {
      warn(`day ${day}: no snapshot; live objects kept`);
      results.push({ board: board.name, day, status: "kept-no-snapshot", deleted: 0, warnings });
      continue;
    }
    const verification = await verifySnapshot(board, day, { now });
    if (!verification.ok) {
      warn(`day ${day}: snapshot verification failed (${verification.reason}); live objects kept`);
      results.push({ board: board.name, day, status: "kept-unverified", deleted: 0, warnings });
      continue;
    }
    for (let i = 0; i < dayKeys.length; i += BUCKET_CONCURRENCY) {
      await Promise.all(dayKeys.slice(i, i + BUCKET_CONCURRENCY).map((key) => board.store.delete!(key)));
    }
    results.push({ board: board.name, day, status: "deleted", deleted: dayKeys.length, warnings });
  }
  return results;
}

// -------------------------------------------------------- snapshot reads ---

export interface SnapshotChunk {
  day: string;
  posts: Post[];
  /**
   * The canonical JSON for each post (same order as `posts`): encodePost
   * output, re-canonicalised from the parsed post so a hostile snapshot file
   * can never choose the bytes. Callers that persist canonical bytes can
   * reuse these instead of re-canonicalising.
   */
  lines: string[];
}

export interface SnapshotDayStats {
  day: string;
  lines: number;
  corruptLines: number;
}

export interface SnapshotReadOptions {
  /** Posts per yielded chunk (default 2000). */
  chunkSize?: number | undefined;
  /** Clock for post validation (default Date.now). */
  now?: (() => number) | undefined;
  onWarning?: ((message: string) => void) | undefined;
}

/** Every snapshot day of a board, ascending. O(days) keys listed, none read. */
export async function listSnapshotDays(board: Board): Promise<string[]> {
  const prefix = snapshotsPrefix(board.name);
  const days: string[] = [];
  for await (const key of listAll(board.store, prefix)) {
    const base = key.slice(prefix.length);
    if (!base.endsWith(".jsonl")) continue;
    const day = base.slice(0, -".jsonl".length);
    if (isDayBucket(day)) days.push(day);
  }
  return days.sort();
}

/**
 * A day bucket that is also a real UTC calendar day. isDayBucket is
 * shape-only and accepts strings like "2026-00-15"; feeding one to nextDay
 * throws. Snapshot names are untrusted store content, so any day that is
 * allowed to drive day arithmetic must round-trip through dayBucket first.
 */
export function isCalendarDay(day: string): boolean {
  if (!isDayBucket(day)) return false;
  const ms = Date.parse(`${day}T00:00:00Z`);
  return !Number.isNaN(ms) && dayBucket(ms) === day;
}

/**
 * Existing day buckets in `[from, today]`, ascending. A calendar day with no
 * objects costs one probe, and the whole empty stretch after it is skipped
 * with one more, so the walk is bounded by the buckets that exist: a planted
 * ancient day directory cannot turn it into one listing per calendar day.
 */
export async function* iterLiveBucketDays(
  store: Board["store"],
  board: string,
  from: string,
  today: string,
): AsyncGenerator<string> {
  if (!isCalendarDay(from) || !isCalendarDay(today) || from > today) return;
  const prefix = keys.postsPrefix(board);
  let day = from;
  while (day <= today) {
    const probe = await store.list(keys.dayPrefix(board, day), { limit: 1 });
    if (probe.keys.length > 0) {
      yield day;
      day = nextDay(day);
      continue;
    }
    // Empty day: jump straight to the first key past this whole day. "~"
    // sorts above every key-segment byte, and `after` stays printable ASCII
    // for stores that validate it as a prefix.
    const next = await store.list(prefix, { after: `${keys.dayPrefix(board, day)}~`, limit: 1 });
    if (next.keys.length === 0) return;
    const found = next.keys[0]!.split("/")[3] ?? "";
    if (!isCalendarDay(found) || found <= day || found > today) return;
    day = found;
  }
}

/**
 * Stream one snapshot as chunks of parsed posts. A corrupt, oversized, or
 * foreign-board line is skipped with a surfaced warning, never a crash. The
 * generator's return value reports line counts so callers can distrust
 * partially corrupt days.
 */
export async function* iterSnapshotChunks(
  board: Board,
  day: string,
  opts: SnapshotReadOptions = {},
): AsyncGenerator<SnapshotChunk, SnapshotDayStats> {
  const chunkSize = opts.chunkSize ?? 2000;
  const now = opts.now ?? Date.now;
  const key = snapshotKey(board.name, day);
  const bytes = await board.store.get(key);
  const stats: SnapshotDayStats = { day, lines: 0, corruptLines: 0 };
  if (bytes === null) return stats;

  let chunk: Post[] = [];
  let chunkLines: string[] = [];
  for (const { line, number } of jsonlLines(decoder.decode(bytes))) {
    stats.lines++;
    let post: Post;
    try {
      // Live-read parity: parsePost applies the same read-side limits as
      // object reads, above all the LIMITS.maxBytes per-line cap that
      // validatePost alone would not enforce.
      post = parsePost(encoder.encode(line), { now });
    } catch {
      stats.corruptLines++;
      opts.onWarning?.(`skipped unreadable line ${number} of ${key}`);
      continue;
    }
    if (post.board !== board.name) {
      // Snapshot lines are untrusted store content: bind each post to the
      // board whose snapshot it was read from, exactly as live reads bind
      // the store key. Otherwise a forged line enters the index under
      // another board and survives clearBoard as an orphan row.
      stats.corruptLines++;
      opts.onWarning?.(`skipped foreign-board line ${number} of ${key} (bound to ${post.board})`);
      continue;
    }
    chunk.push(post);
    // Canonical bytes, never the raw line: a hostile snapshot file must not
    // choose what the index persists as post_json.
    chunkLines.push(encodePost(post));
    if (chunk.length >= chunkSize) {
      yield { day, posts: chunk, lines: chunkLines };
      chunk = [];
      chunkLines = [];
    }
  }
  if (chunk.length) yield { day, posts: chunk, lines: chunkLines };
  return stats;
}

/**
 * Where a snapshot-aware rebuild must start reading live buckets; null means
 * "no usable snapshots, scan everything". Otherwise the returned day is the
 * earliest bucket that may hold posts the snapshots do not cover: the day
 * after the newest snapshot, a gap in the snapshot range, a snapshot day
 * whose live bucket still exists (late arrivals, stale or corrupt snapshot),
 * or live history predating the oldest snapshot.
 */
export async function snapshotScanStart(board: Board, today: string, onWarning?: ((message: string) => void) | undefined): Promise<string | null> {
  const days: string[] = [];
  for (const day of await listSnapshotDays(board)) {
    if (day > today) {
      onWarning?.(`ignoring snapshot for open or future day ${day}`);
      continue;
    }
    if (!isCalendarDay(day)) {
      onWarning?.(`ignoring snapshot for impossible calendar day ${day}`);
      continue;
    }
    days.push(day);
  }
  if (days.length === 0) return null;

  const oldest = days[0]!;
  const newest = days[days.length - 1]!;
  const candidates: string[] = [nextDay(newest)];

  // The first gap between consecutive snapshot days: O(days), never a walk
  // across the calendar between two snapshots.
  for (let i = 0; i + 1 < days.length; i++) {
    if (nextDay(days[i]!) !== days[i + 1]) {
      candidates.push(nextDay(days[i]!)); // a gap: this bucket was never snapshotted
      break;
    }
  }

  const first = await board.store.list(keys.postsPrefix(board.name), { limit: 1 });
  if (first.keys.length > 0) {
    const oldestLiveDay = first.keys[0]!.split("/")[3] ?? "";
    if (isCalendarDay(oldestLiveDay) && oldestLiveDay < oldest) candidates.push(oldestLiveDay);
  }

  for (const day of days) {
    const probe = await board.store.list(keys.dayPrefix(board.name, day), { limit: 1 });
    if (probe.keys.length > 0) {
      candidates.push(day); // bucket not collected yet: re-read it live
      break;
    }
  }
  return candidates.sort()[0]!;
}

// -------------------------------------------------------------- internal ---

interface Bucket {
  keys: string[];
  /** Parse-valid posts in key order; null for unreadable or vanished objects. */
  posts: Array<Post | null>;
  skipped: number;
}

export type { Bucket };

/** List a day bucket and read its objects with bounded concurrency. */
export async function readDayBucket(store: Board["store"], board: string, day: string, now: () => number): Promise<Bucket> {
  const bucketKeys = await collectBucketKeys(store, keys.dayPrefix(board, day));

  const posts: Array<Post | null> = new Array<Post | null>(bucketKeys.length).fill(null);
  let skipped = 0;
  let next = 0;
  const workers = Array.from({ length: Math.min(BUCKET_CONCURRENCY, bucketKeys.length) }, async () => {
    for (;;) {
      const i = next;
      next++;
      if (i >= bucketKeys.length) return;
      const key = bucketKeys[i]!;
      const bytes = await store.get(key);
      if (bytes === null) {
        skipped++;
        continue;
      }
      try {
        posts[i] = parsePost(bytes, { key, now });
      } catch {
        skipped++;
      }
    }
  });
  await Promise.all(workers);
  return { keys: bucketKeys, posts, skipped };
}

/** Every day bucket that currently holds objects, ascending. */
export async function discoverBucketDays(store: Board["store"], board: string): Promise<string[]> {
  return collectBucketDays(await collectBucketKeys(store, keys.postsPrefix(board)));
}

function collectBucketDays(bucketKeys: string[]): string[] {
  const days = new Set<string>();
  for (const key of bucketKeys) {
    const day = key.split("/")[3] ?? "";
    if (isDayBucket(day)) days.add(day);
  }
  return [...days].sort();
}

/** Distinct day buckets strictly before `before`, discovered by listing keys. */
async function discoverClosedDays(store: Board["store"], board: string, before: string): Promise<string[]> {
  return (await discoverBucketDays(store, board)).filter((day) => day < before);
}

interface ParsedLines {
  posts: Post[];
  errors: string[];
}

function parseLines(text: string, board: string, now: () => number): ParsedLines {
  const posts: Post[] = [];
  const errors: string[] = [];
  for (const { line, number } of jsonlLines(text)) {
    try {
      // The same read-side contract as live objects: LIMITS.maxBytes via
      // parsePost, and the board binding. A foreign-board line must not be
      // merged into a rewritten snapshot any more than into the index.
      const post = parsePost(encoder.encode(line), { now });
      if (post.board !== board) throw new Error(`post names board ${post.board}, not ${board}`);
      posts.push(post);
    } catch (e) {
      errors.push(`line ${number}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { posts, errors };
}

/** Iterate non-empty newline-terminated lines without materialising the whole array. */
function* jsonlLines(text: string): Generator<{ line: string; number: number }> {
  let start = 0;
  let number = 0;
  for (;;) {
    const nl = text.indexOf("\n", start);
    const end = nl === -1 ? text.length : nl;
    if (end > start) yield { line: text.slice(start, end), number: ++number };
    if (nl === -1) return;
    start = nl + 1;
  }
}

// Board: the domain API over a Store. Posts are immutable objects keyed by
// day bucket + ULID. Reading is cursor-based; `reconcile` and `scan` exist
// because a cursor alone is not a completeness guarantee under eventual
// replication (a late-arriving older object would be skipped forever).

import { ulid, ulidTime } from "./ulid.ts";
import { keys, dayBucket, nextDay, prevDay, assertName, isDayBucket } from "./keys.ts";
import { type Store, listAll, DEFAULT_LIST_LIMIT, encoder } from "./store.ts";
import { type Post, type NewPost, encodePost, parsePost, validatePost, hasV2Fields, POST_VERSION, POST_VERSION_V2, InvalidPostError, invalidKey, checkEncodedSize } from "./post.ts";
import { canonicalize } from "./post.ts";

export interface BoardOptions {
  board: string;
  author: string;
  /** Agent instance id (ULID). Minted if omitted; one per process/session. */
  instance?: string;
  /** Clock, injectable for tests. */
  now?: () => number;
}

export interface SinceOptions {
  limit?: number;
}

export interface SinceResult {
  posts: Post[];
  /** Pass back next time. Undefined if nothing has ever been seen. */
  cursor: string | undefined;
  truncated: boolean;
}

export interface WatchOptions {
  /** Poll interval in ms (default 2000). */
  intervalMs?: number;
  /** Run a reconcile pass every N polls when the store has no change feed (default 15). */
  reconcileEvery?: number;
  /** Days of history to re-list during reconcile (default 2). */
  lookbackDays?: number;
  /** Start from this cursor instead of "now". */
  cursor?: string;
  signal?: AbortSignal;
}

export type BoardEventType = "create" | "rename" | "close" | "pin";

export interface BoardEvent {
  v: 1;
  id: string;
  board: string;
  type: BoardEventType;
  author: string;
  instance: string;
  ts: string;
  data?: Record<string, unknown>;
}

export interface BoardInfo {
  board: string;
  title?: string;
  closed: boolean;
  pinned: string[];
  createdBy?: string;
  createdAt?: string;
}

export class Board {
  readonly name: string;
  readonly author: string;
  readonly instance: string;
  private readonly now: () => number;
  private writeChain: Promise<unknown> = Promise.resolve();

  constructor(readonly store: Store, opts: BoardOptions) {
    this.name = assertName(opts.board, "board");
    this.author = assertName(opts.author, "author");
    this.instance = opts.instance ?? ulid();
    this.now = opts.now ?? Date.now;
  }

  // ------------------------------------------------------------ writes ---

  /** Create a root post (a new thread). */
  post(input: NewPost): Promise<Post> {
    return this.write((id, ts) => ({ ...this.base(id, ts, input), thread: id }));
  }

  /** Reply within an existing thread. `to` may be a post id or a Post. */
  async reply(to: string | Post, input: NewPost): Promise<Post> {
    const parent = typeof to === "string" ? await this.get(to) : to;
    if (!parent) throw new Error(`no such post: ${String(to)}`);
    const { title: _drop, ...rest } = input;
    return this.write((id, ts) => ({ ...this.base(id, ts, rest), thread: parent.thread, replyTo: parent.id }));
  }

  /**
   * Addressed request (envelope v2, task 201): a root post with act "request",
   * the recipients in `to`, and an optional replyBy deadline; both override any
   * `act`/`to` in `input`. The full request/response correlation helper is task
   * 202. The root post is the task root; replies carry `task` = this id.
   */
  request(to: string | string[], input: NewPost, opts: { replyBy?: string } = {}): Promise<Post> {
    return this.write((id, ts) => {
      const recipients = names(Array.isArray(to) ? [...to] : [to], "to");
      if (recipients.length === 0) throw new InvalidPostError("request needs at least one recipient in to");
      if (opts.replyBy !== undefined) assertDate(opts.replyBy, "replyBy");
      const p: Post = { ...this.base(id, ts, input), thread: id };
      p.act = "request";
      p.to = recipients;
      if (opts.replyBy !== undefined) p.replyBy = opts.replyBy;
      p.v = POST_VERSION_V2;
      return p;
    });
  }

  private base(id: string, ts: string, input: NewPost): Omit<Post, "thread"> {
    const p: Omit<Post, "thread"> = {
      v: POST_VERSION, id, board: this.name, author: this.author, instance: this.instance, ts, body: input.body,
    };
    if (input.title !== undefined) p.title = input.title;
    if (input.tags?.length) p.tags = [...input.tags];
    if (input.mentions?.length) p.mentions = names(input.mentions, "mention");
    if (input.attachments?.length) p.attachments = [...input.attachments];
    if (input.ext) p.ext = { ...input.ext };
    // Envelope v2 (task 201): optional fields, copied only when set. The
    // version bumps to 2 only when at least one v2-only field is set, so a
    // plain post still encodes — and signs — exactly like a v1 post.
    if (input.to?.length) p.to = names(input.to, "to");
    if (input.act !== undefined) p.act = input.act;
    if (input.protocol !== undefined) p.protocol = input.protocol;
    if (input.task !== undefined) p.task = input.task;
    if (input.status !== undefined) p.status = input.status;
    if (input.replyBy !== undefined) { assertDate(input.replyBy, "replyBy"); p.replyBy = input.replyBy; }
    if (input.expires !== undefined) { assertDate(input.expires, "expires"); p.expires = input.expires; }
    if (input.contentType !== undefined) p.contentType = input.contentType;
    // Assigned as-is, never spread: a hostile non-object (e.g. a string) must
    // stay a non-object so write-side validation rejects it fail-closed.
    if (input.data !== undefined) p.data = input.data;
    if (input.dataSchema !== undefined) p.dataSchema = input.dataSchema;
    if (input.origin !== undefined) p.origin = { ...input.origin };
    if (input.trace !== undefined) p.trace = { ...input.trace };
    if (input.extensions?.length) p.extensions = [...input.extensions];
    if (hasV2Fields(p)) p.v = POST_VERSION_V2;
    return p;
  }

  /** Writes from one Board instance are serialized so its ids stay monotonic in the store. */
  private write(build: (id: string, ts: string) => Post): Promise<Post> {
    const run = async () => {
      const ms = this.now();
      const id = ulid(ms);
      const post = build(id, new Date(ms).toISOString());
      // Fail closed at write time: the board never stores a post that readers
      // would have to skip — same limits on write as on read.
      validatePost(post, { now: this.now });
      const bytes = encoder.encode(encodePost(post));
      checkEncodedSize(bytes);
      await this.store.put(keys.post(this.name, id, ulidTime(id)), bytes, { ifNoneMatch: true });
      return post;
    };
    const p = this.writeChain.then(run, run);
    this.writeChain = p.catch(() => {});
    return p;
  }

  // ------------------------------------------------------------- reads ---

  /** The store key for a post id (derived from the ULID timestamp). */
  keyFor(id: string): string {
    return keys.post(this.name, id, ulidTime(id));
  }

  /** null when absent or when the stored object fails validation (forged, oversized, mis-keyed). */
  async get(id: string): Promise<Post | null> {
    const key = this.keyFor(id);
    const bytes = await this.store.get(key);
    if (!bytes) return null;
    try { return parsePost(bytes, { key, now: this.now }); } catch (e) { if (e instanceof InvalidPostError) return null; throw e; }
  }

  /**
   * Fast path: posts whose key is after `cursor`, in key order. Complete for
   * strongly consistent stores; for eventually replicated ones, pair with
   * `reconcile` (or the store's change feed) to catch late arrivals.
   */
  async since(cursor?: string, opts: SinceOptions = {}): Promise<SinceResult> {
    const limit = opts.limit ?? DEFAULT_LIST_LIMIT;
    const listOpts: { after?: string; limit: number } = { limit };
    if (cursor !== undefined) listOpts.after = cursor;
    const { keys: ks, truncated } = await this.store.list(keys.postsPrefix(this.name), listOpts);
    const posts = await this.load(ks);
    return { posts, cursor: ks.length ? ks[ks.length - 1]! : cursor, truncated };
  }

  /** Every post in the day buckets `fromDay..toDay` inclusive (UTC). Callers dedup by id. */
  async *scan(fromDay?: string, toDay?: string): AsyncGenerator<Post> {
    const to = toDay ?? dayBucket(this.now());
    if (fromDay === undefined) {
      for await (const k of listAll(this.store, keys.postsPrefix(this.name))) {
        // Only a genuine day bucket after `to` ends the scan; anything else
        // (e.g. a planted non-bucket third segment) is skipped so it cannot
        // truncate the rebuild for the rest of today.
        const day = dayOf(k);
        if (isDayBucket(day) && day > to) return;
        const p = await this.loadOne(k);
        if (p) yield p;
      }
      return;
    }
    if (!isDayBucket(fromDay) || !isDayBucket(to)) throw new Error("scan: days must be yyyy-mm-dd");
    for (let day = fromDay; day <= to; day = nextDay(day)) {
      for await (const k of listAll(this.store, keys.dayPrefix(this.name, day))) {
        const p = await this.loadOne(k);
        if (p) yield p;
      }
    }
  }

  /** Re-list the last `lookbackDays` buckets (default 2) so late arrivals are found. */
  reconcile(lookbackDays = 2): AsyncGenerator<Post> {
    let from = dayBucket(this.now());
    for (let i = 0; i < lookbackDays; i++) from = prevDay(from);
    return this.scan(from);
  }

  /**
   * Poll for new posts and call `onPost` for each, exactly once per id within
   * the lookback window. Uses the store's exact change feed when it has one,
   * otherwise cursor polling plus periodic reconcile. Resolves when aborted.
   */
  async watch(onPost: (post: Post) => void | Promise<void>, opts: WatchOptions = {}): Promise<void> {
    const interval = opts.intervalMs ?? 2000;
    const reconcileEvery = opts.reconcileEvery ?? 15;
    const lookback = opts.lookbackDays ?? 2;
    const seen = new Set<string>();
    const prefix = keys.postsPrefix(this.name);
    const emit = async (p: Post) => {
      if (seen.has(p.id)) return;
      seen.add(p.id);
      await onPost(p);
    };
    const prune = () => {
      const cutoff = this.now() - (lookback + 1) * 86_400_000;
      for (const id of seen) if (ulidTime(id) < cutoff) seen.delete(id);
    };

    let cursor = opts.cursor;
    if (cursor === undefined) {
      // Start at "now": skip history, but remember what exists so reconcile does not replay it.
      const { cursor: c } = await this.since(undefined, { limit: DEFAULT_LIST_LIMIT });
      cursor = c;
      for await (const p of this.reconcile(lookback)) seen.add(p.id);
    } else {
      // Resume: everything at or before the cursor was already delivered; reconcile must not replay it.
      for await (const p of this.reconcile(lookback)) if (this.keyFor(p.id) <= cursor) seen.add(p.id);
    }
    let token: string | undefined;
    if (this.store.changes) token = (await this.store.changes()).token;

    for (let i = 1; !opts.signal?.aborted; i++) {
      if (this.store.changes && token !== undefined) {
        const ch = await this.store.changes(token);
        token = ch.token;
        for (const k of ch.keys.filter((k) => k.startsWith(prefix)).sort()) {
          const p = await this.loadOne(k);
          if (p) await emit(p);
        }
      } else {
        for (;;) {
          const r = await this.since(cursor);
          cursor = r.cursor;
          for (const p of r.posts) await emit(p);
          if (!r.truncated) break;
        }
        if (i % reconcileEvery === 0) {
          for await (const p of this.reconcile(lookback)) await emit(p);
          prune();
        }
      }
      await sleep(interval, opts.signal);
    }
  }

  private async load(ks: string[]): Promise<Post[]> {
    const out: Post[] = [];
    for (const k of ks) {
      const p = await this.loadOne(k);
      if (p) out.push(p);
    }
    return out;
  }

  private async loadOne(key: string): Promise<Post | null> {
    if (!key.endsWith(".json")) return null;
    const bytes = await this.store.get(key);
    if (!bytes) return null;
    try { return parsePost(bytes, { key, now: this.now }); } catch { return null; }   // skip junk/forged objects; the cursor still advances
  }

  // ------------------------------------------------------------ events ---

  async emit(type: BoardEventType, data?: Record<string, unknown>): Promise<BoardEvent> {
    const ms = this.now();
    const ev: BoardEvent = { v: 1, id: ulid(ms), board: this.name, type, author: this.author, instance: this.instance, ts: new Date(ms).toISOString() };
    if (data) ev.data = data;
    await this.store.put(keys.event(this.name, ev.id), canonicalize(ev) + "\n", { ifNoneMatch: true });
    return ev;
  }

  /** Fold board events (last writer wins by ULID order). */
  async info(): Promise<BoardInfo> {
    const info: BoardInfo = { board: this.name, closed: false, pinned: [] };
    const dec = new TextDecoder();
    for await (const k of listAll(this.store, keys.eventsPrefix(this.name))) {
      const bytes = await this.store.get(k);
      if (!bytes) continue;
      let ev: BoardEvent;
      try { ev = JSON.parse(dec.decode(bytes)) as BoardEvent; } catch { continue; }
      switch (ev.type) {
        case "create": info.createdBy = ev.author; info.createdAt = ev.ts; if (typeof ev.data?.title === "string") info.title = ev.data.title; break;
        case "rename": if (typeof ev.data?.title === "string") info.title = ev.data.title; break;
        case "close": info.closed = ev.data?.closed !== false; break;
        case "pin": if (typeof ev.data?.id === "string") info.pinned = ev.data.pinned === false ? info.pinned.filter((x) => x !== ev.data!.id) : [...new Set([...info.pinned, ev.data.id])]; break;
      }
    }
    return info;
  }
}

function dayOf(postKey: string): string {
  // boards/<b>/posts/<day>/<id>.json
  return postKey.split("/")[3] ?? "";
}

/** Dates are stored as written but must parse, so a typo cannot poison a post. */
function assertDate(s: string, what: string): string {
  if (typeof s !== "string" || Number.isNaN(Date.parse(s))) throw new InvalidPostError(`${what} is not a date`);
  return s;
}

/**
 * Validate post-field names (to, mentions) with the agent-name rules, but as
 * the uniform post error: bad recipient names are a post-validation failure,
 * not a key-construction one.
 */
function names(values: string[], what: string): string[] {
  try { return values.map((n) => assertName(n, what)); } catch (e) { return invalidKey(e); }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const t = setTimeout(done, ms);
    function done() { signal?.removeEventListener("abort", done); clearTimeout(t); resolve(); }
    signal?.addEventListener("abort", done, { once: true });
  });
}

export { encoder };

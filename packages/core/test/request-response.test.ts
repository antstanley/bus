// Task 202 — request/response helper tests (scenarios 1-13, 17-19).
// Injected wall/monotonic clocks, virtual timers, and controlled Store gates.
// Only the separate natural-process-exit smoke test uses native timers.

import { describe, it, expect } from "bun:test";
import {
  Board, MemoryStore, KeyExistsError, keys, ulid, ulidTime, parsePost,
  InvalidPostError, canonicalize,
  requestAndWait as publicRequestAndWait, respond, isEligibleReply, parseReplyBy,
  InvalidRequestOptionsError, RequestTimeoutError, RequestCancelledError,
  RequestWriteError, RequestReadError, ResponseTargetError, ResponseReadError,
  ResponseWriteError,
  type WaitHooks, type RequestWaitOptions, type PublicationSnapshot, type Post,
} from "../src/index.ts";
import type { Store, PutOptions, ListOptions, ListResult } from "../src/index.ts";

import { runRequestWait, captureRequestInvocation, prepareRequestInvocation } from "../src/request-response.ts";

async function flush() {
  for (let i = 0; i < 100; i++) await Promise.resolve();
}

async function until(check: () => boolean) {
  for (let i = 0; i < 1000; i++) {
    if (check()) return;
    await Promise.resolve();
  }
  throw new Error("Expected controlled operation did not start");
}

const boardHooks = new WeakMap<Board, WaitHooks>();
function requestAndWait(
  board: Board, to: string | readonly string[],
  input: Parameters<typeof publicRequestAndWait>[2], opts: RequestWaitOptions,
) {
  return runRequestWait(board, to, input, { intervalMs: 5, ...opts },
    boardHooks.get(board) ?? liveHooks(FUTURE));
}

// ---------------------------------------------------------------- helpers ---

/** Auto-driven virtual time: drain microtasks before each next scheduled tick. */
function liveHooks(wallStart: number): WaitHooks {
  const timers = fakeTimers(true);
  return { wallNow: () => wallStart, monoNow: timers.now, ...timers.hooks };
}

interface Rig {
  board: Board;
  raw: MemoryStore;
  counts: { put: number; get: number; list: number };
  overrides: {
    put?: (key: string, bytes: Uint8Array) => Promise<unknown>;
    get?: (key: string) => Promise<Uint8Array | null>;
    list?: (prefix: string, opts?: ListOptions) => Promise<ListResult>;
  };
}

/** Board whose Store is wrapped for counting/overriding. */
function rig(hooks: WaitHooks = {}, author = "responder"): Rig {
  const raw = new MemoryStore();
  const counts = { put: 0, get: 0, list: 0 };
  const overrides: Rig["overrides"] = {};
  const wrapped: Store = {
    put: (key: string, bytes: Uint8Array, opts?: PutOptions) => {
      counts.put++;
      if (overrides.put) return overrides.put(key, bytes) as Promise<void>;
      return raw.put(key, bytes, opts);
    },
    get: (key: string) => {
      counts.get++;
      if (overrides.get) return overrides.get(key);
      return raw.get(key);
    },
    list: (prefix: string, opts?: ListOptions) => {
      counts.list++;
      if (overrides.list) return overrides.list(prefix, opts);
      return raw.list(prefix, opts);
    },
  };
  const board = new Board(wrapped, { board: "general", author, now: hooks.wallNow ?? (() => FUTURE) });
  boardHooks.set(board, { ...liveHooks(FUTURE), ...hooks });
  return { board, raw, counts, overrides };
}

/** Fake timers: callbacks run only when fired explicitly (cleanup checks). */
function fakeTimers(auto = false) {
  const pending = new Map<unknown, { fn: () => void; at: number }>();
  let seq = 0;
  let now = 0;
  let pumping = false;
  const fire = (ms: number) => {
    now += ms;
    for (const [id, t] of [...pending]) {
      if (t.at <= now) { pending.delete(id); t.fn(); }
    }
  };
  const pump = async () => {
    pumping = true;
    while (pending.size) {
      await flush();
      if (pending.size) fire(Math.max(0, Math.min(...[...pending.values()].map(t => t.at)) - now));
    }
    pumping = false;
  };
  const hooks: WaitHooks = {
    setTimeout: (fn, ms) => {
      const id = ++seq;
      pending.set(id, { fn, at: now + ms });
      if (auto && !pumping) void pump();
      return id;
    },
    clearTimeout: (handle) => { pending.delete(handle); },
    yieldToEventLoop: () => Promise.resolve(),
  };
  return {
    hooks,
    fire,
    now: () => now,
    size: () => pending.size,
  };
}

/** Write a response post directly into the store as if a recipient sent it. */
async function plantReply(
  board: Board, raw: MemoryStore, q: { id: string; author?: string },
  over: Partial<Post> & { author?: string; body?: string },
  wallNow: () => number,
): Promise<Post> {
  const id = over.id ?? ulid(wallNow());
  const ms = ulidTime(id);
  const p: Record<string, unknown> = {
    v: 2,
    id,
    board: board.name,
    author: "responder",
    instance: ulid(ms),
    ts: new Date(ms).toISOString(),
    body: "done",
    thread: q.id,
    replyTo: q.id,
    act: "inform",
  };
  Object.assign(p, Object.fromEntries(Object.entries(over).filter(([, v]) => v !== undefined)));
  const post = p as unknown as Post;
  await raw.put(keys.post(board.name, id, ms), new TextEncoder().encode(canonicalize(post) + "\n"), { ifNoneMatch: true });
  return post;
}

async function theRequest(board: Board): Promise<Post> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const { posts } = await board.since();
    const request = posts.find((p) => p.act === "request");
    if (request) return request;
    await Promise.resolve(); // does not depend on advancing injected timers
  }
  throw new Error("Request publication did not appear after 100 store scans");
}

function errOf(p: Promise<unknown>): Promise<Error> {
  return p.then(() => { throw new Error("promise resolved"); }, (e) => e as Error);
}

const FUTURE = Date.UTC(2026, 8, 10, 12, 0, 0);
const byMs = (ms: number) => new Date(FUTURE + ms).toISOString();

// ------------------------------------------------------------------ tests ---

describe("task 202 core", () => {
  it("timeout exits naturally without a referenced watchdog", async () => {
    const moduleUrl = new URL("../src/index.ts", import.meta.url).href;
    const child = Bun.spawn([process.execPath, "-e", `
      import { Board, MemoryStore, requestAndWait, RequestTimeoutError } from ${JSON.stringify(moduleUrl)};
      const board = new Board(new MemoryStore(), { board: "general", author: "responder" });
      try {
        await requestAndWait(board, "responder", { body: "q" }, {
          replyBy: new Date(Date.now() + 50).toISOString(),
        });
        process.exitCode = 1;
      } catch (error) {
        if (!(error instanceof RequestTimeoutError)) throw error;
        await error.context.closed;
      }
    `], { stdout: "pipe", stderr: "pipe" });
    const watchdog = setTimeout(() => child.kill(), 2000);
    try {
      expect(await child.exited).toBe(0);
      expect(await new Response(child.stderr).text()).toBe("");
    } finally {
      clearTimeout(watchdog);
    }
  });
  it("scenario 1: Board.request keeps its existing contract (no waiting)", async () => {
    const store = new MemoryStore();
    const board = new Board(store, { board: "general", author: "letta", now: () => FUTURE });
    const p = await board.request("codex", { body: "q" }, { replyBy: "2020-01-01T00:00:00Z" });
    expect(p.act).toBe("request");
    expect(p.to).toEqual(["codex"]);
    expect(p.replyBy).toBe("2020-01-01T00:00:00Z"); // past deadline allowed, no wait
    const { posts } = await board.since();
    expect(posts).toHaveLength(1); // no observer, no timer, no extra writes
  });

  it("scenario 2: managed fields rejected before any put; the published request is a valid v2 root", async () => {
    const { board, raw, counts } = rig(liveHooks(FUTURE));
    for (const f of ["to", "act", "protocol", "task", "status", "replyBy"]) {
      await expect(requestAndWait(board, "codex", { body: "x", [f]: "z" } as never, { replyBy: byMs(50) }))
        .rejects.toBeInstanceOf(InvalidPostError);
    }
    expect(counts.put).toBe(0);
    await expect(requestAndWait(board, "codex", { body: "x" }, { replyBy: byMs(50) }))
      .rejects.toBeInstanceOf(RequestTimeoutError);
    const stored = (await raw.list(keys.postsPrefix("general"), { limit: 200 })).keys;
    expect(stored).toHaveLength(1);
    const posted = parsePost((await raw.get(stored[0]!))!, { now: () => FUTURE });
    expect(posted.v).toBe(2);
    expect(posted.act).toBe("request");
    expect(posted.protocol).toBe("request");
    expect(posted.task).toBeUndefined();
    expect(posted.status).toBeUndefined();
    expect(posted.replyTo).toBeUndefined();
    expect(posted.board).toBe(board.name);
    expect(posted.author).toBe(board.author);
    expect(posted.instance).toBe(board.instance);
    expect(posted.thread).toBe(posted.id);
    expect(posted.to).toEqual(["codex"]);
    expect(posted.replyBy).toBe(byMs(50));
  }, 10_000);

  it("scenario 3: explicit inform, explicit failure, and a legacy direct reply resolve the wait", async () => {
    for (const kind of ["inform", "failure", "legacy"] as const) {
      const { board, raw } = rig(liveHooks(FUTURE));
      const waitP = requestAndWait(board, "responder", { body: "q" }, { replyBy: byMs(2000) });
      const q = await theRequest(board);
      if (kind === "legacy") {
        await board.reply(q.id, { body: "ok" }); // no act/task/protocol/to; author matches `to`
      } else {
        await plantReply(board, raw, q, { act: kind, author: "responder" }, () => FUTURE);
      }
      const out = await waitP;
      expect(out.kind).toBe(kind === "failure" ? "failure" : "inform");
      expect(out.request.id).toBe(q.id);
      expect(out.reply.replyTo).toBe(q.id);
      expect(new Date(out.observedAt).toISOString()).toBe(out.observedAt);
      expect(out.reply.body).toBe(kind === "legacy" ? "ok" : "done"); // failure is data, not a thrown message
    }
  });

  it("scenario 4: eligibility matrix - excluded posts keep the wait pending", async () => {
    const { board, raw } = rig(liveHooks(FUTURE));
    const waitP = requestAndWait(board, "responder", { body: "q" }, { replyBy: byMs(1200) });
    const q = await theRequest(board);
    const base = { author: "responder" };
    const excluded: Array<Partial<Post>> = [
      { task: ulid(FUTURE - 1000) },                          // conflicting explicit task
      { protocol: "contract-net" },                           // other protocol
      { act: "agree" },                                       // progress performative
      { author: "intruder" },                                 // author not a recipient label
      { to: ["someone-else"] },                               // wrong return address
      { expires: new Date(FUTURE - 1000).toISOString() },     // expired
      { replyTo: ulid(FUTURE - 2000) },                       // not a direct response
      { board: "other" },                                     // perfect profile, other board
    ];
    for (const over of excluded) await plantReply(board, raw, q, { ...base, ...over }, () => FUTURE);
    await expect(waitP).rejects.toBeInstanceOf(RequestTimeoutError);
  }, 10_000);

  it("scenario 4b: same-name/different-instance reply to a self-addressed request is eligible (routing, not auth)", async () => {
    const { board, raw } = rig(liveHooks(FUTURE));
    const waitP = requestAndWait(board, ["responder"], { body: "q" }, { replyBy: byMs(2000) });
    const q = await theRequest(board);
    expect(q.to).toEqual(["responder"]);
    const reply = await plantReply(board, raw, q, { author: "responder", instance: ulid(FUTURE - 1) }, () => FUTURE);
    const out = await waitP;
    expect(out.reply.id).toBe(reply.id);
  });

  it("scenario 5: agree/refuse/reject/cancel/status never complete the wait and no synthetic status is written", async () => {
    const { board, raw } = rig(liveHooks(FUTURE));
    const waitP = requestAndWait(board, "responder", { body: "q" }, { replyBy: byMs(1200) });
    const q = await theRequest(board);
    for (const act of ["refuse", "reject", "cancel", "propose"] as const) {
      await plantReply(board, raw, q, { act, author: "responder" }, () => FUTURE);
    }
    await board.reply(q.id, { body: "s", act: "status", status: "completed" } as never);
    await expect(waitP).rejects.toBeInstanceOf(RequestTimeoutError);
    const posts = (await board.since()).posts;
    expect(posts.filter((p) => p.act === "status")).toHaveLength(1); // only the planted one
  }, 10_000);

  it("scenario 6: a response published before the request's put acks is seen by catch-up", async () => {
    const raw = new MemoryStore();
    let qId = "";
    let planted: Promise<void> = Promise.resolve();
    let counts = 0;
    let b2: Board;
    b2 = new Board({
      put: (key, bytes, opts) => {
        counts++;
        if (counts === 1) {
          // The request id is allocated at the queue head, before its put acks.
          qId = key.split("/").pop()!.replace(/\.json$/, "");
          planted = plantReply(b2, raw, { id: qId }, { author: "responder" }, () => FUTURE).then(() => undefined);
        }
        return raw.put(key, bytes, opts);
      },
      get: (key) => raw.get(key),
      list: (prefix, opts) => raw.list(prefix, opts),
    }, { board: "general", author: "responder", now: () => FUTURE });
    const out = await requestAndWait(b2, "responder", { body: "q" }, { replyBy: byMs(2000) });
    await planted;
    expect(qId).not.toBe("");
    expect(out.reply.replyTo).toBe(qId);
  });

  it("scenario 7: cancelling a queued request retires it without a put; the old request path is unchanged", async () => {
    const { board } = rig(liveHooks(FUTURE));
    const raw = new MemoryStore();
    let first = true;
    let releaseFirstPut!: (e: Error) => void;
    const firstPutGate = new Promise<never>((_, rej) => { releaseFirstPut = rej; });
    const wrapped: Store = {
      put: (key, bytes, opts) => {
        if (first) { first = false; return firstPutGate as unknown as Promise<void>; }
        return raw.put(key, bytes, opts);
      },
      get: (key) => raw.get(key),
      list: (prefix, opts) => raw.list(prefix, opts),
    };
    const b = new Board(wrapped, { board: "general", author: "responder", now: () => FUTURE });
    const ac = new AbortController();
    const timers = fakeTimers();
    boardHooks.set(b, { wallNow: () => FUTURE, monoNow: timers.now, ...timers.hooks });
    const first_ = errOf(b.post({ body: "ordinary blocked write" }));
    await until(() => !first);
    const second = errOf(requestAndWait(b, "responder", { body: "second" }, { replyBy: byMs(5000), signal: ac.signal }));
    await flush();
    expect((await raw.list(keys.postsPrefix("general"))).keys).toHaveLength(0);
    ac.abort();
    const secondError = await second as RequestCancelledError;
    expect(secondError).toBeInstanceOf(RequestCancelledError);
    expect(secondError.context.phase).toBe("queued");
    expect(secondError.context.requestId).toBeNull();
    expect(secondError.context.postState).toBe("not-written");
    releaseFirstPut(new Error("release"));
    expect((await first_).message).toBe("release");
    await secondError.context.closed;
    expect((await raw.list(keys.postsPrefix("general"), { limit: 200 })).keys).toHaveLength(0);
    const legacy = await board.request("responder", { body: "legacy" }); // old path unaffected
    expect(legacy.act).toBe("request");
  });

  it("Board.requestAndWait cancellation behind an ordinary write reports queued", async () => {
    const { board, counts, overrides } = rig();
    let release!: () => void;
    overrides.put = () => new Promise<void>((resolve) => { release = resolve; });
    const ordinary = board.post({ body: "blocked ordinary write" });
    await until(() => counts.put === 1);
    const ac = new AbortController();
    const pending = errOf(board.requestAndWait("responder", { body: "queued" }, {
      replyBy: new Date(Date.now() + 60_000).toISOString(), signal: ac.signal,
    }));
    await flush();
    ac.abort();
    const error = await pending as RequestCancelledError;
    expect(error).toBeInstanceOf(RequestCancelledError);
    expect(error.context.phase).toBe("queued");
    expect(error.context.requestId).toBeNull();
    expect(error.context.postState).toBe("not-written");
    release();
    await ordinary;
    expect((await error.context.closed).postState).toBe("not-written");
    expect(counts.put).toBe(1);
    expect(counts.list).toBe(0);
  });

  it("put rejection checks the cutoff without relying on the deadline timer", async () => {
    for (const at of [99, 100, 101]) {
      for (const collision of [false, true]) {
        let mono = 0;
        const timers = fakeTimers();
        const { board, counts, overrides } = rig({
          wallNow: () => FUTURE, monoNow: () => mono, ...timers.hooks,
        });
        let reject!: (error: Error) => void;
        overrides.put = () => new Promise<void>((_, rej) => { reject = rej; });
        const pending = errOf(requestAndWait(board, "responder", { body: "q" }, { replyBy: byMs(100) }));
        await until(() => counts.put === 1);
        mono = at; // Advance the clock without firing the deadline callback.
        reject(collision ? new KeyExistsError("collision") : new Error("put failed"));
        const error = await pending as RequestTimeoutError | RequestWriteError;
        expect(error).toBeInstanceOf(at < 100 ? RequestWriteError : RequestTimeoutError);
        expect(error.context.phase).toBe("write");
        expect(error.context.postState).toBe(collision ? "not-written" : "unknown");
        expect((await error.context.closed).postState).toBe(error.context.postState);
        expect(counts.list).toBe(0);
        expect(timers.size()).toBe(0);
      }
    }
  });

  it("scenario 8: put finishing after timeout reports unknown now and written via closed after drainage", async () => {
    const raw = new MemoryStore();
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let first = true;
    const wrapped: Store = {
      put: (key, bytes, opts) => {
        if (first) { first = false; return gate.then(() => raw.put(key, bytes, opts)); }
        return raw.put(key, bytes, opts);
      },
      get: (key) => raw.get(key),
      list: (prefix, opts) => raw.list(prefix, opts),
    };
    const b = new Board(wrapped, { board: "general", author: "responder", now: () => FUTURE });
    const waitP = requestAndWait(b, "responder", { body: "q" }, { replyBy: byMs(30) });
    const err = await errOf(waitP);
    expect(err).toBeInstanceOf(RequestTimeoutError);
    const ctx = (err as RequestTimeoutError).context;
    expect(ctx.postState).toBe("unknown"); // put still in flight at settlement
    expect(ctx.phase).toBe("write");
    release();
    expect(await ctx.closed).toEqual({
      board: "general", requestId: ctx.requestId, responseId: null, postState: "written",
    } satisfies PublicationSnapshot); // final snapshot after drainage; never rejects
  });

  it("scenario 9: deadline boundaries - elapsed entry, over max, syntax, and late-loading body", async () => {
    const { board, raw } = rig(liveHooks(FUTURE));
    // elapsed at entry
    const past = new Date(FUTURE - 1).toISOString();
    const err = await errOf(requestAndWait(board, "responder", { body: "q" }, { replyBy: past }));
    expect(err).toBeInstanceOf(RequestTimeoutError);
    const tctx = (err as RequestTimeoutError).context;
    expect(tctx.phase).toBe("prepare");
    expect(tctx.requestId).toBeNull();
    expect(tctx.postState).toBe("not-written");
    expect(tctx.replyBy).toBe(past);
    // over 24h
    await expect(requestAndWait(board, "responder", { body: "q" }, { replyBy: byMs(24 * 3600_000 + 1) }))
      .rejects.toBeInstanceOf(InvalidRequestOptionsError);
    // syntax
    for (const bad of ["2026-09-10 12:00:00Z", "2026-09-10T25:00:00Z", "2026-09-10T12:00:00.1Z", "2026-13-10T12:00:00Z", "2026-09-31T12:00:00Z"]) {
      expect(parseReplyBy(bad)).toBeNull();
      await expect(requestAndWait(board, "responder", { body: "q" }, { replyBy: bad }))
        .rejects.toBeInstanceOf(InvalidRequestOptionsError);
    }
    expect(parseReplyBy("2026-09-10T12:00:00Z")).toBe(Date.UTC(2026, 8, 10, 12, 0, 0));
    expect(parseReplyBy("2026-02-29T00:00:00.000Z")).toBeNull(); // not a leap year
    expect(parseReplyBy("2028-02-29T00:00:00.000Z")).not.toBeNull();
    // key seen early, body loads late: the timeout wins
    const timers = fakeTimers();
    const r2 = rig({ wallNow: () => FUTURE, monoNow: timers.now, ...timers.hooks });
    let release!: () => void;
    r2.overrides.get = (key) => new Promise(resolve => { release = () => { void r2.raw.get(key).then(resolve); }; });
    const waitP = errOf(requestAndWait(r2.board, "responder", { body: "q" }, { replyBy: byMs(10) }));
    await until(() => !!release);
    timers.fire(10);
    const lateError = await waitP as RequestTimeoutError;
    expect(lateError).toBeInstanceOf(RequestTimeoutError);
    release();
    await lateError.context.closed;
  });

  it("scenario 10: pre-aborted signal does no store I/O; abort during observation cancels with phase observe", async () => {
    const { board, counts } = rig(liveHooks(FUTURE));
    const ac = new AbortController();
    ac.abort();
    const err = await errOf(requestAndWait(board, "responder", { body: "q" }, { replyBy: byMs(2000), signal: ac.signal }));
    expect(err).toBeInstanceOf(RequestCancelledError);
    expect((err as RequestCancelledError).context.phase).toBe("prepare");
    expect((err as RequestCancelledError).context.postState).toBe("not-written");
    expect(counts).toEqual({ put: 0, get: 0, list: 0 });

    const ac2 = new AbortController();
    const waitP = requestAndWait(board, "responder", { body: "q" }, { replyBy: byMs(2000), signal: ac2.signal });
    await theRequest(board); // published
    ac2.abort();
    const err2 = await errOf(waitP);
    expect(err2).toBeInstanceOf(RequestCancelledError);
    expect((err2 as RequestCancelledError).context.phase).toBe("observe");
    expect((err2 as RequestCancelledError).context.postState).toBe("written");
  });

  it("scenario 11: first eligible key in byte order wins regardless of read completion order", async () => {
    const timers = fakeTimers();
    const r = rig({ wallNow: () => FUTURE, monoNow: timers.now, ...timers.hooks });
    let release!: () => void;
    let q!: Post;
    const smaller = ulid(FUTURE - 1000);
    r.overrides.put = async (key, bytes) => {
      q = parsePost(bytes, { now: () => FUTURE });
      await r.raw.put(key, bytes);
      await plantReply(r.board, r.raw, q, { id: ulid(FUTURE - 500), body: "larger" }, () => FUTURE);
      await plantReply(r.board, r.raw, q, { id: smaller, body: "smaller" }, () => FUTURE);
    };
    const reads: string[] = [];
    r.overrides.get = key => {
      reads.push(key);
      if (key.includes(smaller)) return new Promise(resolve => { release = () => { void r.raw.get(key).then(resolve); }; });
      return r.raw.get(key);
    };
    const waitP = requestAndWait(r.board, "responder", { body: "q" }, { replyBy: byMs(2000) });
    await until(() => !!release);
    expect(reads).toEqual([r.board.keyFor(smaller)]);
    release();
    const out = await waitP;
    expect(out.reply.body).toBe("smaller"); // key order, not completion order, chooses
    // A duplicate/other reply after settlement cannot deliver twice or revise.
    await plantReply(r.board, r.raw, q, { author: "responder", id: ulid(FUTURE - 1500), body: "late" }, () => FUTURE);
    expect(out.reply.id).toBe(out.reply.id);
  });

  it("scenario 12: an older-keyed reply inside the horizon is observed; outside the horizon is not", async () => {
    // Inside: Q at wall+2000; reply ULID five minutes earlier, same day bucket.
    const wall = { t: FUTURE };
    const shift = rig({ wallNow: () => { wall.t = FUTURE + 2000; return wall.t; } });
    const waitP = requestAndWait(shift.board, "responder", { body: "q" }, { replyBy: new Date(FUTURE + 2000 + 1500).toISOString() });
    const q = await theRequest(shift.board);
    const early = await plantReply(shift.board, shift.raw, q, { author: "responder", id: ulid(FUTURE + 2000 - 5 * 60_000), body: "early" }, () => FUTURE + 2000);
    const out = await waitP;
    expect(out.reply.id).toBe(early.id);

    // Outside: a valid, matching historical response would win if scanned.
    const r2 = rig(liveHooks(FUTURE));
    r2.overrides.put = async (key, bytes) => {
      const root = parsePost(bytes, { now: () => FUTURE });
      await r2.raw.put(key, bytes);
      const old = await plantReply(r2.board, r2.raw, root, { id: ulid(FUTURE - 48 * 3600_000) }, () => FUTURE);
      const valid = parsePost((await r2.raw.get(r2.board.keyFor(old.id)))!, { key: r2.board.keyFor(old.id), now: () => FUTURE });
      expect(isEligibleReply(root, ["responder"], "general", valid, FUTURE)).toBe(true);
    };
    await expect(requestAndWait(r2.board, "responder", { body: "q" }, { replyBy: byMs(300) }))
      .rejects.toBeInstanceOf(RequestTimeoutError);
  }, 10_000);

  it("scenario 13: list rejection is REQUEST_READ_FAILED; invalid stored objects are skipped", async () => {
    // list rejection
    const r1 = rig(liveHooks(FUTURE));
    r1.overrides.list = () => Promise.reject(new Error("store down"));
    const e1 = await errOf(requestAndWait(r1.board, "responder", { body: "q" }, { replyBy: byMs(2000) }));
    expect(e1).toBeInstanceOf(RequestReadError);
    const rc = (e1 as RequestReadError).context;
    expect(rc.phase).toBe("observe");
    expect(rc.postState).toBe("written");
    expect(rc.requestId).not.toBeNull();
    expect(rc.responseId).toBeNull();
    expect(e1.message).not.toContain("store down"); // no backend text in the fixed message

    // invalid stored object skipped, valid reply still settles
    const r2 = rig(liveHooks(FUTURE));
    const junkKey = keys.dayPrefix("general", "2026-09-10") + "01JZZZZZZZZZZZZZZZZZZZZZZZ.json";
    await r2.raw.put(junkKey, new TextEncoder().encode("{not json"), { ifNoneMatch: true });
    const waitP = requestAndWait(r2.board, "responder", { body: "q" }, { replyBy: byMs(2000) });
    const q = await theRequest(r2.board);
    const reply = await plantReply(r2.board, r2.raw, q, { author: "responder" }, () => FUTURE);
    const out = await waitP;
    expect(out.reply.id).toBe(reply.id);
  });

  it("scenario 17: terminal paths leave no timers or further store ops; a stuck store shows the D06 limit", async () => {
    const timers = fakeTimers();
    const { board, raw, counts } = rig(liveHooks(FUTURE));
    boardHooks.set(board, { wallNow: () => FUTURE, monoNow: timers.now, ...timers.hooks });
    const opts: RequestWaitOptions = {
      replyBy: byMs(5000), intervalMs: 1000,
    };
    const waitP = requestAndWait(board, "responder", { body: "q" }, opts);
    await flush(); // published; pass 1 done; sleeping on fake timer
    const q = await theRequest(board);
    await plantReply(board, raw, q, { author: "responder" }, () => FUTURE);
    timers.fire(1000); // wake the sleep -> pass 2 finds the reply
    await waitP;
    expect(timers.size()).toBe(0); // deadline + sleep timers all cleared
    const after = { ...counts };
    await flush();
    expect(counts).toEqual(after); // no further list/get/put after settlement

    // Deliberately never-resolving get: the wait settles, closed stays pending.
    const r2 = rig(liveHooks(FUTURE));
    r2.overrides.get = () => new Promise<Uint8Array | null>(() => {});
    const errP = requestAndWait(r2.board, "responder", { body: "q" }, { replyBy: byMs(30) });
    const err = await errOf(errP);
    expect(err).toBeInstanceOf(RequestTimeoutError);
    let resolved = false;
    (err as RequestTimeoutError).context.closed.then(() => { resolved = true; });
    await flush();
    expect(resolved).toBe(false); // documented D06 limitation, not a fake guarantee
  });

  it("scenario 17b: timeout and cancellation drain late reads without follow-on work", async () => {
    for (const outcome of ["timeout", "cancel"] as const) {
      const timers = fakeTimers();
      const r = rig({ wallNow: () => FUTURE, monoNow: () => 0, ...timers.hooks });
      const ac = new AbortController();
      let release!: (result: ListResult) => void;
      const gate = new Promise<ListResult>((resolve) => { release = resolve; });
      r.overrides.list = () => gate;
      const errorP = errOf(requestAndWait(r.board, "responder", { body: "q" }, {
        replyBy: byMs(50), signal: ac.signal,
      }));
      await flush();
      expect(r.counts.list).toBe(1);
      if (outcome === "timeout") timers.fire(50);
      else ac.abort();
      const error = await errorP as RequestTimeoutError | RequestCancelledError;
      expect(error).toBeInstanceOf(outcome === "timeout" ? RequestTimeoutError : RequestCancelledError);
      expect(timers.size()).toBe(0);
      let closed = false;
      error.context.closed.then(() => { closed = true; });
      await Promise.resolve();
      expect(closed).toBe(false);
      const after = { ...r.counts };
      release({ keys: ["must-not-read.json"], truncated: true });
      expect((await error.context.closed).postState).toBe("written");
      await flush();
      expect(r.counts).toEqual(after);
    }
  });

  it("scenario 18: original cutoff and latch cross preparation despite wall jumps", async () => {
    for (const jump of [-3600_000, 3600_000]) {
      const timers = fakeTimers();
      let wall = FUTURE;
      const hooks = { wallNow: () => wall, monoNow: timers.now, ...timers.hooks };
      const r = rig(hooks);
      const input = { body: "entry", data: { value: "entry" } };
      const opts = { replyBy: byMs(50) };
      const entry = captureRequestInvocation(r.board, "responder", input, opts, hooks);
      input.body = "mutated";
      input.data.value = "mutated";
      wall += jump;
      timers.fire(40);
      const p = errOf(runRequestWait(r.board, "ignored", input, { replyBy: byMs(9999) }, hooks, entry));
      await until(() => r.counts.list > 0);
      expect(entry.core.requestPost?.body).toBe("entry");
      expect(entry.core.requestPost?.data).toEqual({ value: "entry" });
      expect(entry.core.requestPost?.replyBy).toBe(byMs(50));
      timers.fire(10);
      const err = await p as RequestTimeoutError;
      expect(err).toBeInstanceOf(RequestTimeoutError);
      expect(err.context.closed).toBe(entry.core.closed);
      expect(err.context.postState).toBe("written");
      await err.context.closed;
    }
    const timers = fakeTimers();
    const hooks = { wallNow: () => FUTURE, monoNow: timers.now, ...timers.hooks };
    const r = rig(hooks);
    const ac = new AbortController();
    const opts = { replyBy: byMs(50), signal: ac.signal };
    const entry = captureRequestInvocation(r.board, "responder", { body: "q" }, opts, hooks);
    timers.fire(50);
    ac.abort(); // stopping preparation must not rewrite the winning timeout
    const err = await errOf(runRequestWait(r.board, "responder", { body: "q" }, opts, hooks, entry)) as RequestTimeoutError;
    expect(err).toBeInstanceOf(RequestTimeoutError);
    expect(err.context.phase).toBe("prepare");
    expect(await err.context.closed).toEqual({ board: "general", requestId: null, responseId: null, postState: "not-written" });
    expect(r.counts).toEqual({ put: 0, get: 0, list: 0 });
  });

  it("scenario 18b: preparation is supervised before Store creation and drains late rejection", async () => {
    const timers = fakeTimers();
    const hooks = { wallNow: () => FUTURE, monoNow: timers.now, ...timers.hooks };
    const entry = captureRequestInvocation({ name: "general" }, "responder", { body: "q" }, { replyBy: byMs(50) }, hooks);
    let reject!: (error: Error) => void;
    const preparation = errOf(prepareRequestInvocation(entry, () => new Promise<void>((_, fail) => { reject = fail; })));
    timers.fire(50);
    const error = await preparation as RequestTimeoutError;
    expect(error).toBeInstanceOf(RequestTimeoutError);
    expect(error.context.phase).toBe("prepare");
    let drained = false;
    error.context.closed.then(() => { drained = true; });
    await flush();
    expect(drained).toBe(false);
    reject(new Error("late setup failure"));
    expect((await error.context.closed).postState).toBe("not-written");
    let called = false;
    await expect(prepareRequestInvocation(entry, async () => { called = true; })).rejects.toBe(error);
    expect(called).toBe(false);
    expect(timers.size()).toBe(0);
  });

  it("scenario 19: respond error paths, retained IDs, snapshots, and closed never rejecting", async () => {
    const { board, raw } = rig(liveHooks(FUTURE));
    const q = await board.request("responder", { body: "q" });
    const before = (await raw.list(keys.postsPrefix("general"), { limit: 200 })).keys.length;

    // malformed target id -> INVALID_REQUEST_OPTIONS, id not echoed
    const badId = await errOf(respond(board, "not-a-ulid", { body: "x" }));
    expect(badId).toBeInstanceOf(InvalidRequestOptionsError);
    expect((badId as InvalidRequestOptionsError).context.requestId).toBeNull();

    for (const opts of [null, { outcome: "invalid" }]) {
      const invalid = await errOf(board.respond(q.id, { body: "x" }, opts as never)) as InvalidRequestOptionsError;
      expect(invalid).toBeInstanceOf(InvalidRequestOptionsError);
      expect(invalid.context.requestId).toBe(q.id);
      expect(invalid.context.responseId).toBeNull();
      expect(invalid.context.postState).toBe("not-written");
      expect(await invalid.context.closed).toEqual({ board: "general", requestId: q.id, responseId: null, postState: "not-written" });
    }

    // absent root -> RESPONSE_TARGET_INVALID with Q retained
    const missingId = ulid(FUTURE - 1000);
    const missing = await errOf(respond(board, missingId, { body: "x" }));
    expect(missing).toBeInstanceOf(ResponseTargetError);
    expect((missing as ResponseTargetError).context.requestId).toBe(missingId);
    expect((missing as ResponseTargetError).context.responseId).toBeNull();
    expect((missing as ResponseTargetError).context.postState).toBe("not-written");

    // invalid stored root -> RESPONSE_TARGET_INVALID (get completed, validation failed)
    await raw.put(keys.post("general", missingId, ulidTime(missingId)), new TextEncoder().encode("garbage\n"), { ifNoneMatch: true });
    const invalidRoot = await errOf(respond(board, missingId, { body: "x" }));
    expect(invalidRoot).toBeInstanceOf(ResponseTargetError);

    // rejected get -> RESPONSE_READ_FAILED (never a target error)
    const rGet = rig(liveHooks(FUTURE));
    rGet.overrides.get = () => Promise.reject(new Error("disk on fire"));
    const readErr = await errOf(respond(rGet.board, q.id, { body: "x" }));
    expect(readErr).toBeInstanceOf(ResponseReadError);
    expect((readErr as ResponseReadError).context.requestId).toBe(q.id);
    expect((readErr as ResponseReadError).context.postState).toBe("not-written");
    expect(readErr.message).not.toContain("disk on fire");
    expect((await (readErr as ResponseReadError).context.closed).postState).toBe("not-written");
    const invalidInput = await errOf(respond(board, q.id, null as never));
    expect((await (invalidInput as InvalidRequestOptionsError).context.closed).postState).toBe("not-written");
    const reserved = await errOf(respond(board, q.id, { body: "x", title: "t" } as never));
    expect((await (reserved as InvalidPostError & { context: { closed: Promise<PublicationSnapshot> } }).context.closed).postState).toBe("not-written");

    // profile/label mismatch -> RESPONSE_TARGET_INVALID
    const intruder = new Board(raw, { board: "general", author: "intruder", now: () => FUTURE });
    const labelErr = await errOf(respond(intruder, q.id, { body: "x" }));
    expect(labelErr).toBeInstanceOf(ResponseTargetError);

    // managed fields rejected, including title
    await expect(respond(board, q.id, { body: "x", title: "t" } as never)).rejects.toBeInstanceOf(InvalidPostError);
    await expect(respond(board, q.id, { body: "x", act: "inform" } as never)).rejects.toBeInstanceOf(InvalidPostError);

    // rejected put after R allocation -> RESPONSE_WRITE_FAILED, Q and R retained, unknown
    const rPut = rig(liveHooks(FUTURE));
    rPut.overrides.get = (key) => raw.get(key);
    rPut.overrides.put = () => Promise.reject(new Error("quota"));
    const writeErr = await errOf(respond(rPut.board, q.id, { body: "x" }));
    expect(writeErr).toBeInstanceOf(ResponseWriteError);
    const wctx = (writeErr as ResponseWriteError).context;
    expect(wctx.requestId).toBe(q.id);
    expect(wctx.responseId).not.toBeNull();
    expect(wctx.postState).toBe("unknown");
    expect(wctx.replyBy).toBeNull();
    expect(wctx.phase).toBe("write");
    expect(await wctx.closed).toEqual({
      board: "general", requestId: q.id, responseId: wctx.responseId, postState: "unknown",
    } satisfies PublicationSnapshot);

    // typed no-write guarantee: KeyExistsError -> not-written
    const rExists = rig(liveHooks(FUTURE));
    rExists.overrides.get = (key) => raw.get(key);
    rExists.overrides.put = () => Promise.reject(new KeyExistsError("exists"));
    const existsErr = await errOf(respond(rExists.board, q.id, { body: "x" }));
    expect(existsErr).toBeInstanceOf(ResponseWriteError);
    expect((existsErr as ResponseWriteError).context.postState).toBe("not-written");

    // success: inform by default, explicit failure; an elapsed request replyBy does not block
    const ok = await board.respond(q.id, { body: "all good" });
    expect(ok.act).toBe("inform");
    expect(ok.v).toBe(2);
    expect(ok.to).toEqual([q.author]);
    expect(ok.protocol).toBe("request");
    expect(ok.task).toBe(q.id);
    expect(ok.status).toBeUndefined();
    expect(ok.replyTo).toBe(q.id);
    expect(ok.thread).toBe(q.id);
    expect(ok.replyBy).toBeUndefined();
    const fail = await respond(board, q.id, { body: "it broke" }, { outcome: "failure" });
    expect(fail.act).toBe("failure");

    // no auto-published extras: exactly the two responses were written
    const after = (await raw.list(keys.postsPrefix("general"), { limit: 200 })).keys.length;
    expect(after - before).toBe(3); // two responses plus the planted invalid root
  });

  it("request expiry validation and Board entry cancellation precedence", async () => {
    const r = rig(liveHooks(FUTURE));
    await expect(requestAndWait(r.board, "responder", { body: "q", expires: byMs(49) }, { replyBy: byMs(50) }))
      .rejects.toBeInstanceOf(InvalidPostError);
    expect(r.counts.put).toBe(0);
    const ac = new AbortController();
    ac.abort();
    const error = await errOf(r.board.requestAndWait("responder", { body: "q" }, {
      replyBy: "2020-01-01T00:00:00.000Z", signal: ac.signal,
    })) as RequestCancelledError;
    expect(error).toBeInstanceOf(RequestCancelledError);
    expect(error.context.requestId).toBeNull();
    expect(r.counts).toEqual({ put: 0, get: 0, list: 0 });
    await expect(requestAndWait(r.board, "responder", { body: "q", expires: byMs(50) }, { replyBy: byMs(50) }))
      .rejects.toBeInstanceOf(RequestTimeoutError);
    expect(r.counts.put).toBe(1);
  });

  it("snapshots nested response inputs before target read and request inputs before queueing", async () => {
    const timers = fakeTimers();
    const r = rig({ wallNow: () => FUTURE, monoNow: timers.now, ...timers.hooks });
    let release!: () => void;
    r.overrides.put = () => new Promise<void>(resolve => { release = resolve; });
    const ordinary = r.board.post({ body: "blocked" });
    await until(() => !!release);
    const input = { body: "entry", data: { nested: ["entry"] }, tags: ["entry"] };
    const ac = new AbortController();
    const pending = errOf(requestAndWait(r.board, "responder", input, { replyBy: byMs(50), signal: ac.signal }));
    input.body = "later";
    input.data.nested[0] = "later";
    input.tags[0] = "later";
    delete r.overrides.put;
    release();
    await ordinary;
    const q = await theRequest(r.board);
    expect(q.body).toBe("entry");
    expect(q.data).toEqual({ nested: ["entry"] });
    expect(q.tags).toEqual(["entry"]);
    ac.abort();
    await (await pending as RequestCancelledError).context.closed;

    let releaseGet!: () => void;
    r.overrides.get = key => new Promise(resolve => { releaseGet = () => { void r.raw.get(key).then(resolve); }; });
    const responseInput = { body: "entry", data: { nested: ["entry"] } };
    const result = r.board.respond(q.id, responseInput);
    await until(() => !!releaseGet);
    responseInput.body = "later";
    responseInput.data.nested[0] = "later";
    releaseGet();
    const response = await result;
    expect(response.body).toBe("entry");
    expect(response.data).toEqual({ nested: ["entry"] });
  });

  it("rechecks the cutoff after eligibility and receipt timestamp construction", async () => {
    for (const wallRead of [2, 3]) {
      for (const at of [49, 50, 51]) {
        const timers = fakeTimers();
        let mono = 0;
        let evaluating = false;
        let reads = 0;
        const r = rig({
          wallNow: () => {
            // First read validates the candidate; subsequent reads evaluate
            // expiry and construct observedAt. Advance time without firing timers.
            if (evaluating && ++reads === wallRead) mono = at;
            return FUTURE;
          },
          monoNow: () => mono, ...timers.hooks,
        });
        let reply!: Post;
        r.overrides.put = async (key, bytes) => {
          const q = parsePost(bytes, { now: () => FUTURE });
          await r.raw.put(key, bytes);
          reply = await plantReply(r.board, r.raw, q, { id: ulid(FUTURE - 1) }, () => FUTURE);
        };
        r.overrides.get = async (key) => {
          const bytes = await r.raw.get(key);
          if (key === r.board.keyFor(reply.id)) evaluating = true;
          return bytes;
        };
        const result = await requestAndWait(r.board, "responder", { body: "q" }, { replyBy: byMs(50) })
          .then(value => value, error => error);
        if (at < 50) expect(result.reply.id).toBe(reply.id);
        else {
          expect(result).toBeInstanceOf(RequestTimeoutError);
          expect(result.context.phase).toBe("observe");
          await result.context.closed;
        }
        expect(timers.size()).toBe(0);
      }
    }
  });

  it("exact cutoff takes precedence over list/get errors and eligible replies", async () => {
    for (const operation of ["list", "get", "reply"] as const) {
      for (const at of [49, 50, 51]) {
        const timers = fakeTimers();
        let mono = 0;
        const r = rig({ wallNow: () => FUTURE, monoNow: () => mono, ...timers.hooks });
        let release!: () => void;
        let reply!: Post;
        r.overrides.put = async (key, bytes) => {
          const q = parsePost(bytes, { now: () => FUTURE });
          await r.raw.put(key, bytes);
          reply = await plantReply(r.board, r.raw, q, { id: ulid(FUTURE - 1) }, () => FUTURE);
        };
        if (operation === "list") {
          r.overrides.list = () => new Promise((_, reject) => { release = () => reject(new Error("read failed")); });
        } else {
          r.overrides.get = key => new Promise((resolve, reject) => {
            release = () => operation === "get" ? reject(new Error("read failed")) : void r.raw.get(key).then(resolve);
          });
        }
        const pending = requestAndWait(r.board, "responder", { body: "q" }, { replyBy: byMs(50) })
          .then(value => value, error => error);
        await until(() => !!release);
        mono = at; // Deliberately do not fire the timer: continuation must check cutoff.
        release();
        const result = await pending;
        if (at >= 50) expect(result).toBeInstanceOf(RequestTimeoutError);
        else if (operation === "reply") expect(result.reply.id).toBe(reply.id);
        else expect(result).toBeInstanceOf(RequestReadError);
        if (result.context) await result.context.closed;
        expect(timers.size()).toBe(0);
      }
    }
  });

  it("cancellation matrix: list, get, sleep, and concurrent reply/abort", async () => {
    for (const stage of ["list", "get", "sleep", "reply-abort", "reply-first"] as const) {
      const timers = fakeTimers();
      const r = rig({ wallNow: () => FUTURE, monoNow: timers.now, ...timers.hooks });
      const ac = new AbortController();
      let release!: () => void;
      let q!: Post;
      r.overrides.put = async (key, bytes) => {
        q = parsePost(bytes, { now: () => FUTURE });
        await r.raw.put(key, bytes);
        if (stage.startsWith("reply")) await plantReply(r.board, r.raw, q, { id: ulid(FUTURE - 1) }, () => FUTURE);
      };
      if (stage === "list") r.overrides.list = () => new Promise(resolve => { release = () => resolve({ keys: [], truncated: false }); });
      if (stage === "get" || stage === "reply-abort") {
        r.overrides.get = key => new Promise(resolve => { release = () => { void r.raw.get(key).then(resolve); }; });
      }
      const pending = requestAndWait(r.board, "responder", { body: "q" }, { replyBy: byMs(50), signal: ac.signal })
        .then(value => value, error => error);
      if (stage === "sleep") await until(() => timers.size() === 2);
      else if (stage === "reply-first") {
        const result = await pending;
        ac.abort();
        expect(result.reply.replyTo).toBe(q.id);
        expect(timers.size()).toBe(0);
        continue;
      } else await until(() => !!release);
      if (stage === "reply-abort") release();
      ac.abort();
      const result = await pending as RequestCancelledError;
      expect(result).toBeInstanceOf(RequestCancelledError);
      expect(result.context.phase).toBe("observe");
      const counts = { ...r.counts };
      if (stage === "list" || stage === "get") release();
      await result.context.closed;
      await flush();
      expect(r.counts).toEqual(counts);
      expect(timers.size()).toBe(0);
    }
  });

  it("pagination advances full-key cursor and reconciles behind it across UTC midnight", async () => {
    const midnight = Date.UTC(2026, 8, 11);
    let wall = midnight - 60_000;
    const timers = fakeTimers();
    const r = rig({ wallNow: () => wall, monoNow: timers.now, ...timers.hooks });
    const cursors: Array<{ prefix: string; after: string | undefined }> = [];
    let q!: Post;
    let old!: Post;
    let planted = false;
    r.overrides.put = async (key, bytes) => {
      q = parsePost(bytes, { now: () => wall });
      await r.raw.put(key, bytes);
      for (let i = 0; i < 201; i++) {
        await plantReply(r.board, r.raw, q, { id: ulid(midnight - 120_000 + i), act: "agree" }, () => wall);
      }
    };
    r.overrides.list = async (prefix, opts) => {
      cursors.push({ prefix, after: opts?.after });
      expect(opts?.limit).toBe(200);
      const page = await r.raw.list(prefix, opts);
      if (opts?.after && !planted) {
        planted = true;
        old = await plantReply(r.board, r.raw, q, { id: ulid(midnight - 180_000), body: "behind cursor" }, () => wall);
      }
      return page;
    };
    const pending = requestAndWait(r.board, "responder", { body: "q" }, { replyBy: new Date(wall + 120_000).toISOString(), intervalMs: 1000 });
    await until(() => timers.size() === 2);
    const previousDay = keys.dayPrefix("general", "2026-09-10");
    const nextDay = keys.dayPrefix("general", "2026-09-11");
    expect(cursors.some(c => c.prefix === nextDay)).toBe(true); // +5m horizon includes tomorrow
    const paged = cursors.find(c => c.after !== undefined)!;
    const firstPage = await r.raw.list(previousDay, { limit: 201 }); // old arrival is now first
    expect(paged.after).toBe(firstPage.keys[200]);
    wall = midnight + 1000;
    timers.fire(1000);
    const result = await pending;
    expect(result.reply.id).toBe(old.id);
    expect(cursors.filter(c => c.prefix === previousDay && !c.after)).toHaveLength(2);
    expect(timers.size()).toBe(0);
  });

  it("interval rules: invalid intervals rejected before put; a valid max interval still times out", async () => {
    const { board, counts } = rig(liveHooks(FUTURE));
    for (const bad of [0, -1, 1.5, 30_001, Number.NaN]) {
      await expect(requestAndWait(board, "responder", { body: "q" }, { replyBy: byMs(50), intervalMs: bad }))
        .rejects.toBeInstanceOf(InvalidRequestOptionsError);
    }
    expect(counts.put).toBe(0);
    await expect(requestAndWait(board, "responder", { body: "q" }, { replyBy: byMs(1200), intervalMs: 30_000 }))
      .rejects.toBeInstanceOf(RequestTimeoutError);
  }, 10_000);

  it("isEligibleReply: qualifying legacy reply vs descendant chatter", () => {
    const q = {
      v: 2, id: "01K000000000000000000000000", board: "general", thread: "01K000000000000000000000000",
      author: "letta", instance: "01K000000000000000000000001", ts: new Date(FUTURE).toISOString(),
      body: "q", act: "request" as const, to: ["codex"],
    } as Post;
    const base = {
      v: 2, id: "01K000000000000000000000002", board: "general", thread: q.id, replyTo: q.id,
      author: "codex", instance: "01K000000000000000000000003", ts: new Date(FUTURE).toISOString(),
      body: "ok",
    } as Post;
    expect(isEligibleReply(q, ["codex"], "general", base, FUTURE)).toBe(true);
    expect(isEligibleReply(q, ["codex"], "general", { ...base, task: "01K000000000000000000000009" }, FUTURE)).toBe(false);
    expect(isEligibleReply(q, ["codex"], "general", { ...base, thread: "01K000000000000000000000008" }, FUTURE)).toBe(false);
    expect(isEligibleReply(q, ["codex"], "other", base, FUTURE)).toBe(false);
    expect(isEligibleReply(q, ["codex"], "general", { ...base, act: "status", status: "completed" }, FUTURE)).toBe(false);
  });
});

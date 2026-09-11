// Task 202 — tests for the MCP `board_request` / `board_respond` tools.
// Injected clocks and Stores throughout; no real-time sleeps in the unit
// scenarios. One end-to-end group uses the spawned-server RPC harness to prove
// a blocking wait does not hold the serialized tool queue (same-server
// response, unrelated reads runnable while waiting).

import { afterEach, describe, expect, it, setDefaultTimeout } from "bun:test";
import { InMemoryTransport, type JSONRPCMessage } from "@modelcontextprotocol/server";
import { BoardMcpServer } from "../src/server.ts";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { Board, MemoryStore, isUlid, type Store, type WaitHooks } from "@board/core";
import {
  ERROR_MESSAGES as CLI_ERROR_MESSAGES, CAUSE_FOR_CODE as CLI_CAUSE_FOR_CODE,
  REPLICATION_WARNING as CLI_REPLICATION_WARNING, exitForOutcome, handleRequest,
  type AdapterOutcome as CliOutcome,
} from "../../cli/src/request-response.ts";
import {
  ERROR_MESSAGES,
  CAUSE_FOR_CODE,
  MCP_MAX_WAIT_MS,
  MCP_WAIT_CAPACITY,
  REPLICATION_WARNING,
  RequestWaitRegistry,
  executeBoardRequest,
  executeBoardRespond,
  isErrorFor,
  outcomeResult,
  type AdapterOutcome,
  type RequestResponseDeps,
} from "../src/request-response.ts";

setDefaultTimeout(30_000);

const repo = resolve(import.meta.dir, "../../..");

// ---------------------------------------------------------------------------
// Deterministic clock (wall + monotonic + manual timer queue)

class FakeClock {
  wall: number;
  mono = 0;
  #seq = 0;
  readonly #timers = new Map<number, { at: number; fn: () => void }>();

  constructor(wall = 1_770_000_000_000) {
    this.wall = wall;
  }

  readonly wallNow = (): number => this.wall;
  readonly monoNow = (): number => this.mono;
  readonly setTimeout = (fn: () => void, ms: number): unknown => {
    const id = ++this.#seq;
    this.#timers.set(id, { at: this.mono + Math.max(0, ms), fn });
    return id;
  };
  readonly clearTimeout = (handle: unknown): void => {
    this.#timers.delete(handle as number);
  };
  readonly yieldToEventLoop = (): Promise<void> => Promise.resolve();

  get hooks(): WaitHooks {
    return {
      wallNow: this.wallNow,
      monoNow: this.monoNow,
      setTimeout: this.setTimeout,
      clearTimeout: this.clearTimeout,
      yieldToEventLoop: this.yieldToEventLoop,
    };
  }

  /** Run every timer due within `ms`, firing in monotonic order. */
  async advance(ms: number): Promise<void> {
    const target = this.mono + ms;
    for (;;) {
      await new Promise<void>((resolvePromise) => setImmediate(resolvePromise));
      let next: { id: number; at: number; fn: () => void } | undefined;
      for (const [id, timer] of this.#timers) {
        if (timer.at <= target && (next === undefined || timer.at < next.at)) {
          next = { id, at: timer.at, fn: timer.fn };
        }
      }
      if (next === undefined) break;
      this.#timers.delete(next.id);
      this.mono = Math.max(this.mono, next.at);
      next.fn();
    }
    this.mono = target;
  }
}

const settle = () => new Promise<void>((resolvePromise) => setImmediate(resolvePromise));

// ---------------------------------------------------------------------------
// Harness

interface ActorExtras {
  replicationCheck?: () => typeof REPLICATION_WARNING | null;
  intervalMs?: number;
}

function actor(
  store: Store,
  author: string,
  hooks?: WaitHooks,
  extra?: ActorExtras,
): { store: MemoryStore; deps: RequestResponseDeps } {
  const boards = new Map<string, Board>();
  const deps: RequestResponseDeps = {
    board: (name) => {
      let board = boards.get(name);
      if (!board) {
        board = new Board(store, { board: name, author });
        boards.set(name, board);
      }
      return board;
    },
    defaultBoard: "general",
    author,
    ...(hooks === undefined ? {} : { hooks }),
    ...(extra?.replicationCheck === undefined ? {} : { replicationCheck: extra.replicationCheck }),
    ...(extra?.intervalMs === undefined ? {} : { intervalMs: extra.intervalMs }),
  };
  return { store: store as MemoryStore, deps };
}

function iso(clock: FakeClock, offsetMs: number): string {
  return new Date(clock.wall + offsetMs).toISOString();
}

async function storePosts(store: MemoryStore): Promise<Array<Record<string, unknown>>> {
  const { keys } = await store.list("");
  const posts: Array<Record<string, unknown>> = [];
  const decoder = new TextDecoder();
  for (const key of keys) {
    const bytes = await store.get(key);
    if (bytes) posts.push(JSON.parse(decoder.decode(bytes)) as Record<string, unknown>);
  }
  return posts;
}

function findRequestPost(posts: Array<Record<string, unknown>>): Record<string, unknown> {
  const request = posts.find((post) => post["act"] === "request");
  expect(request).toBeDefined();
  return request!;
}

/** Narrow an outcome after asserting its kind. */
function asKind<K extends AdapterOutcome["kind"]>(outcome: AdapterOutcome, kind: K) {
  expect(outcome.kind).toBe(kind);
  return outcome as Extract<AdapterOutcome, { kind: K extends "inform" | "failure" ? "inform" | "failure" : K }>;
}

function fullRegistry(): RequestWaitRegistry {
  const registry = new RequestWaitRegistry();
  while (registry.slotsInUse < MCP_WAIT_CAPACITY) expect(registry.tryAcquire()).toBe(true);
  return registry;
}

/** Drain microtasks until `check` passes or `rounds` elapse. */
async function eventually(check: () => boolean, rounds = 100): Promise<boolean> {
  for (let i = 0; i < rounds; i++) {
    if (check()) return true;
    await settle();
  }
  return check();
}

class FailingPutStore extends MemoryStore {
  override put(): Promise<void> {
    return Promise.reject(new Error("secret-token-xyz"));
  }
}

// ---------------------------------------------------------------------------
// board_request (posting mode)

describe("board_request (posting mode)", () => {
  it("accepts empty titles consistently with core and CLI posting", async () => {
    const { deps } = actor(new MemoryStore(), "peer-b");
    const mcp = asKind(await executeBoardRequest(deps, { to: ["peer-b"], body: "q", title: "" }), "posted");
    const lines: string[] = [];
    expect(await handleRequest(["--to", "peer-b", "--body", "q", "--title", ""], {
      store: new MemoryStore(), authorName: "peer-b", stdout: (line) => lines.push(line), stderr: () => {},
    })).toBe(0);
    const cli = JSON.parse(lines[0]!) as CliOutcome;
    expect(cli.kind).toBe("posted");
    if (cli.kind !== "posted") throw new Error("expected posting outcome");
    for (const field of ["title", "body", "board", "author", "act", "protocol", "to"] as const) {
      expect(mcp.post.post[field]).toEqual(cli.post.post[field]);
    }
    expect(mcp.post.post.title).toBe("");
    expect(mcp.post.provenance.trust).toBe("unsigned");
    expect(cli.post.provenance.trust).toBe("unsigned");
  });

  it("posts without a wait cap or admission slot, retaining the supplied replyBy", async () => {
    const clock = new FakeClock();
    const { store, deps } = actor(new MemoryStore(), "requester-a", clock.hooks);
    const registry = new RequestWaitRegistry();
    const outcome = await executeBoardRequest(
      deps,
      { to: ["peer-b"], body: "please inspect", replyBy: iso(clock, 999_999_999) },
      { registry },
    );
    expect(asKind(outcome, "posted").postState).toBe("written");
    expect(outcome.operation).toBe("request-post");
    expect(isUlid(outcome.requestId!)).toBe(true);
    expect(outcome.replyBy).toBe(iso(clock, 999_999_999));
    expect(asKind(outcome, "posted").post.provenance.trust).toBe("unsigned");
    expect(asKind(outcome, "posted").post.provenance.postId).toBe(outcome.requestId!);
    expect(outcome.warnings).toEqual([]);
    expect(registry.slotsInUse).toBe(0);
    const posts = await storePosts(store);
    expect(posts.find((post) => post["act"] === "request")).toMatchObject({ to: ["peer-b"] });
  });

  it("rejects an empty body, unknown fields, and bad deadlines before any put", async () => {
    const { store, deps } = actor(new MemoryStore(), "requester-a");
    const empty = asKind(
      await executeBoardRequest(deps, { to: ["peer-b"], body: "" }),
      "error",
    );
    expect(empty.code).toBe("INVALID_POST");
    const unknown = asKind(
      await executeBoardRequest(deps, { to: ["peer-b"], body: "x", task: "nope" }),
      "error",
    );
    expect(unknown.code).toBe("INVALID_REQUEST_OPTIONS");
    expect(unknown.board).toBe("general");
    expect(unknown.phase).toBe("validate");
    const badDate = asKind(
      await executeBoardRequest(deps, { to: ["peer-b"], body: "x", replyBy: "not-a-date" }),
      "error",
    );
    expect(badDate.code).toBe("INVALID_REQUEST_OPTIONS");
    expect(badDate.postState).toBe("not-written");
    expect(await storePosts(store)).toEqual([]);
  });

  it("maps a rejected put to REQUEST_WRITE_FAILED without leaking the raw cause", async () => {
    const clock = new FakeClock();
    const { deps } = actor(new FailingPutStore(), "requester-a", clock.hooks);
    const outcome = asKind(
      await executeBoardRequest(deps, { to: ["peer-b"], body: "x" }),
      "error",
    );
    expect(outcome.code).toBe("REQUEST_WRITE_FAILED");
    expect(outcome.message).toBe(ERROR_MESSAGES.REQUEST_WRITE_FAILED);
    expect(outcome.cause).toEqual({ category: "store-write" });
    expect(outcome.phase).toBe("write");
    expect(outcome.postState).toBe("unknown");
    expect(isUlid(outcome.requestId!)).toBe(true); // validated ID retained
    expect(JSON.stringify(outcome)).not.toContain("secret-token-xyz");
  });
});

// ---------------------------------------------------------------------------
// board_request (wait mode)

describe("board_request (wait mode)", () => {
  it("requires replyBy, rejects over five minutes, and treats exactly five minutes as legal", async () => {
    const clock = new FakeClock();
    const { store, deps } = actor(new MemoryStore(), "requester-a", clock.hooks, { intervalMs: 500 });
    const missing = asKind(
      await executeBoardRequest(deps, { to: ["peer-b"], body: "x", wait: true }),
      "error",
    );
    expect(missing.code).toBe("INVALID_REQUEST_OPTIONS");
    const over = asKind(
      await executeBoardRequest(deps, {
        to: ["peer-b"], body: "x", wait: true, replyBy: iso(clock, MCP_MAX_WAIT_MS + 1),
      }),
      "error",
    );
    expect(over.code).toBe("INVALID_REQUEST_OPTIONS");
    expect(over.postState).toBe("not-written");
    expect(over.replyBy).toBe(iso(clock, MCP_MAX_WAIT_MS + 1));
    expect(await storePosts(store)).toEqual([]);
    // Exactly at the maximum is legal: the request is posted, then times out.
    const registry = new RequestWaitRegistry();
    const pending = executeBoardRequest(deps, {
      to: ["peer-b"], body: "x", wait: true, replyBy: iso(clock, MCP_MAX_WAIT_MS),
    }, { registry });
    await settle();
    expect(registry.slotsInUse).toBe(1);
    await clock.advance(MCP_MAX_WAIT_MS + 1);
    const timeout = asKind(await pending, "timeout");
    expect(timeout.postState).toBe("written");
    expect(isUlid(timeout.requestId!)).toBe(true);
    expect(timeout.replyBy).toBe(iso(clock, MCP_MAX_WAIT_MS));
    expect(timeout.phase).toBe("observe");
    expect(await eventually(() => registry.slotsInUse === 0 && registry.size === 0)).toBe(true);
  });

  it("times out before any put when the deadline has already elapsed at entry", async () => {
    const clock = new FakeClock();
    const { store, deps } = actor(new MemoryStore(), "requester-a", clock.hooks);
    const timeout = asKind(
      await executeBoardRequest(deps, {
        to: ["peer-b"], body: "x", wait: true, replyBy: iso(clock, -1),
      }),
      "timeout",
    );
    expect(timeout.phase).toBe("prepare");
    expect(timeout.postState).toBe("not-written");
    expect(timeout.requestId).toBeNull();
    expect(timeout.replyBy).toBe(iso(clock, -1));
    expect(await storePosts(store)).toEqual([]);
  });

  it("orders pre-abort over elapsed deadline over capacity before any put", async () => {
    const clock = new FakeClock();
    const { store, deps } = actor(new MemoryStore(), "requester-a", clock.hooks);
    const full = fullRegistry();

    const elapsed = asKind(
      await executeBoardRequest(deps, {
        to: ["peer-b"], body: "x", wait: true, replyBy: iso(clock, -1),
      }, { registry: full, signal: new AbortController().signal }),
      "timeout",
    );
    expect(elapsed.phase).toBe("prepare");

    const capacity = asKind(
      await executeBoardRequest(deps, {
        to: ["peer-b"], body: "x", wait: true, replyBy: iso(clock, 5_000),
      }, { registry: full }),
      "error",
    );
    expect(capacity.code).toBe("REQUEST_CAPACITY");
    expect(capacity.message).toBe(ERROR_MESSAGES.REQUEST_CAPACITY);
    expect(capacity.postState).toBe("not-written");
    expect(await storePosts(store)).toEqual([]);

    const aborted = new AbortController();
    aborted.abort();
    const cancelled = asKind(
      await executeBoardRequest(deps, {
        to: ["peer-b"], body: "x", wait: true, replyBy: iso(clock, -1),
      }, { registry: full, signal: aborted.signal }),
      "cancelled",
    );
    expect(cancelled.reason).toBe("rpc");
    expect(await storePosts(store)).toEqual([]);
  });

  it("resolves inform on a same-store response with unsigned wrappers on both posts", async () => {
    const clock = new FakeClock();
    const store = new MemoryStore();
    const requester = actor(store, "requester-a", clock.hooks, { intervalMs: 200 });
    const responder = actor(store, "peer-b", clock.hooks);
    const registry = new RequestWaitRegistry();
    const pending = executeBoardRequest(requester.deps, {
      to: ["peer-b"], body: "please check", wait: true, replyBy: iso(clock, 10_000),
    }, { registry });
    await settle();
    const request = findRequestPost(await storePosts(store));
    const respondOutcome = asKind(
      await executeBoardRespond(responder.deps, {
        requestId: request["id"] as string, body: "checked, looks good",
      }),
      "posted",
    );
    await clock.advance(10_001); // A missing reply fails via the injected deadline, not a real timer.
    const outcome = asKind(await pending, "inform");
    expect(outcome.operation).toBe("request-wait");
    expect(outcome.postState).toBe("written");
    expect(outcome.observedAt).toBe(new Date(clock.wall).toISOString());
    expect(outcome.request.provenance.trust).toBe("unsigned");
    expect(outcome.reply.provenance.trust).toBe("unsigned");
    expect(outcome.reply.provenance.postId).toBe(respondOutcome.post.provenance.postId);
    expect(isErrorFor(outcome)).toBe(false);
    expect(await eventually(() => registry.slotsInUse === 0 && registry.size === 0)).toBe(true);
  });

  it("resolves failure without throwing the reply body as a local error", async () => {
    const clock = new FakeClock();
    const store = new MemoryStore();
    const requester = actor(store, "requester-a", clock.hooks, { intervalMs: 200 });
    const responder = actor(store, "peer-b", clock.hooks);
    const pending = executeBoardRequest(requester.deps, {
      to: ["peer-b"], body: "do it", wait: true, replyBy: iso(clock, 10_000),
    });
    await settle();
    const request = findRequestPost(await storePosts(store));
    await executeBoardRespond(responder.deps, {
      requestId: request["id"] as string, body: "recipient refused", outcome: "failure",
    });
    await clock.advance(10_001); // A missing reply fails via the injected deadline, not a real timer.
    const outcome = asKind(await pending, "failure");
    expect(isErrorFor(outcome)).toBe(true);
    expect(outcome.reply.post).toMatchObject({ body: "recipient refused" });
    expect(JSON.stringify(outcome)).toContain("recipient refused");
  });

  it("cancels per invocation via the RPC signal and drains the admission slot", async () => {
    const clock = new FakeClock();
    const { deps } = actor(new MemoryStore(), "requester-a", clock.hooks, { intervalMs: 200 });
    const registry = new RequestWaitRegistry();
    const rpc = new AbortController();
    const pending = executeBoardRequest(deps, {
      to: ["peer-b"], body: "x", wait: true, replyBy: iso(clock, 10_000),
    }, { registry, signal: rpc.signal });
    await settle();
    expect(registry.size).toBe(1);
    expect(registry.slotsInUse).toBe(1);
    rpc.abort();
    const outcome = asKind(await pending, "cancelled");
    expect(outcome.reason).toBe("rpc");
    expect(outcome.requestId).not.toBeNull(); // the request had already been written
    expect(await eventually(() => registry.slotsInUse === 0 && registry.size === 0)).toBe(true);
  });

  it("cancels every active wait on shutdown with the shutdown reason", async () => {
    const clock = new FakeClock();
    const { deps } = actor(new MemoryStore(), "requester-a", clock.hooks, { intervalMs: 200 });
    const registry = new RequestWaitRegistry();
    const first = executeBoardRequest(deps, {
      to: ["peer-b"], body: "one", wait: true, replyBy: iso(clock, 10_000),
    }, { registry });
    const second = executeBoardRequest(deps, {
      to: ["peer-b"], body: "two", wait: true, replyBy: iso(clock, 10_000),
    }, { registry });
    await settle();
    expect(registry.size).toBe(2);
    registry.cancelAll("shutdown");
    const outcomes = await Promise.all([first, second]);
    for (const outcome of outcomes) {
      expect(asKind(outcome, "cancelled").reason).toBe("shutdown");
    }
  });
});

// ---------------------------------------------------------------------------
// board_respond

describe("board_respond", () => {
  it("rejects malformed target ids, unknown fields, and empty bodies", async () => {
    const { deps } = actor(new MemoryStore(), "responder-a");
    const malformed = asKind(
      await executeBoardRespond(deps, { requestId: "not-a-ulid", body: "x" }),
      "error",
    );
    expect(malformed.code).toBe("INVALID_REQUEST_OPTIONS");
    expect(malformed.phase).toBe("validate");
    expect(malformed.postState).toBe("not-written");
    const unknown = asKind(
      await executeBoardRespond(deps, { requestId: "x", body: "x", title: "nope" }),
      "error",
    );
    expect(unknown.code).toBe("INVALID_REQUEST_OPTIONS");
    const empty = asKind(
      await executeBoardRespond(deps, { requestId: "x", body: "" }),
      "error",
    );
    expect(empty.code).toBe("INVALID_POST");
  });

  it("maps an absent root and a non-request target to RESPONSE_TARGET_INVALID", async () => {
    const clock = new FakeClock();
    const store = new MemoryStore();
    const { deps } = actor(store, "responder-a", clock.hooks);
    const absent = asKind(
      await executeBoardRespond(deps, {
        requestId: "01ARZ3NDEKTSV4RRFFQ69G5FAV", body: "x",
      }),
      "error",
    );
    expect(absent.code).toBe("RESPONSE_TARGET_INVALID");
    expect(absent.requestId).toBe("01ARZ3NDEKTSV4RRFFQ69G5FAV");
    expect(absent.responseId).toBeNull();
    expect(absent.postState).toBe("not-written");
    const plain = await new Board(store, { board: "general", author: "responder-a" })
      .post({ title: "Not a request", body: "plain root" });
    const wrongProfile = asKind(
      await executeBoardRespond(deps, { requestId: plain.id, body: "x" }),
      "error",
    );
    expect(wrongProfile.code).toBe("RESPONSE_TARGET_INVALID");
    expect(wrongProfile.postState).toBe("not-written");
  });

  it("publishes an inform response with explicit outcome support and unsigned wrapper", async () => {
    const clock = new FakeClock();
    const store = new MemoryStore();
    const requester = actor(store, "requester-a", clock.hooks);
    await executeBoardRequest(requester.deps, {
      to: ["peer-b"], body: "q", replyBy: iso(clock, 60_000),
    });
    const request = findRequestPost(await storePosts(store));
    const responder = actor(store, "peer-b", clock.hooks);
    const outcome = asKind(
      await executeBoardRespond(responder.deps, {
        requestId: request["id"] as string, body: "a", outcome: "inform", mentions: ["requester-a"],
      }),
      "posted",
    );
    expect(outcome.operation).toBe("respond");
    expect(outcome.requestId).toBe(request["id"] as string);
    expect(isUlid(outcome.responseId!)).toBe(true);
    expect(outcome.postState).toBe("written");
    expect(outcome.replyBy).toBeNull();
    expect(asKind(outcome, "posted").post.provenance.trust).toBe("unsigned");
    expect(isErrorFor(outcome)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Outcome framing

describe("admission and lifetime regressions", () => {
  it("keeps the dispatch cutoff through setup and wall-clock jumps", async () => {
    const clock = new FakeClock();
    const store = new MemoryStore();
    const { deps } = actor(store, "requester-a", clock.hooks);
    const makeBoard = deps.board;
    deps.board = (name) => {
      clock.mono += 1_000;
      clock.wall -= 60_000;
      return makeBoard(name);
    };
    const outcome = await executeBoardRequest(deps, {
      to: ["peer-b"], body: "q", wait: true, replyBy: iso(clock, 1_000),
    });
    expect(asKind(outcome, "timeout").phase).toBe("prepare");
    expect(await storePosts(store)).toEqual([]);
  });

  it("retains accepted metadata and cached warnings on dispatched input errors", async () => {
    const clock = new FakeClock();
    const { deps } = actor(new MemoryStore(), "requester-a", clock.hooks, {
      replicationCheck: () => REPLICATION_WARNING,
    });
    const outcome = asKind(await executeBoardRequest(deps, {
      board: "chosen", to: ["peer-b"], wait: true, replyBy: iso(clock, 1_000),
    }), "error");
    expect(outcome).toMatchObject({
      operation: "request-wait", board: "chosen", code: "INVALID_POST",
      replyBy: iso(clock, 1_000), warnings: [REPLICATION_WARNING],
    });
    const excluded = ["title", "tags", "expires", "replyBy", "contentType", "data", "dataSchema",
      "attachments", "ext", "origin", "trace", "extensions", "author", "instance", "to",
      "act", "task", "protocol", "status"];
    for (const field of excluded) {
      expect(asKind(await executeBoardRespond(deps, {
        requestId: "01ARZ3NDEKTSV4RRFFQ69G5FAV", body: "a", [field]: "forbidden",
      }), "error").code).toBe("INVALID_REQUEST_OPTIONS");
    }
  });

  it("keeps response read and write errors distinct with Q and R allocation", async () => {
    const clock = new FakeClock();
    const store = new MemoryStore();
    const q = asKind(await executeBoardRequest(actor(store, "requester-a", clock.hooks).deps,
      { to: ["peer-b"], body: "q" }), "posted");
    const responder = actor(store, "peer-b", clock.hooks).deps;
    const get = store.get.bind(store);
    store.get = async () => { throw new Error("private-backend-cause"); };
    const read = asKind(await executeBoardRespond(responder, { requestId: q.requestId, body: "a" }), "error");
    expect(read).toMatchObject({ code: "RESPONSE_READ_FAILED", requestId: q.requestId,
      responseId: null, postState: "not-written", cause: { category: "store-read" } });
    store.get = get;
    store.put = async () => { throw new Error("private-backend-cause"); };
    const write = asKind(await executeBoardRespond(responder, { requestId: q.requestId, body: "a" }), "error");
    expect(write).toMatchObject({ code: "RESPONSE_WRITE_FAILED", requestId: q.requestId,
      postState: "unknown", cause: { category: "store-write" } });
    expect(isUlid(write.responseId!)).toBe(true);
    expect(JSON.stringify([read, write])).not.toContain("private-backend-cause");
  });

  it("retains all sixteen slots through cancelled put drainage", async () => {
    const clock = new FakeClock();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    class GatedStore extends MemoryStore {
      puts = 0;
      override async put(...args: Parameters<MemoryStore["put"]>): Promise<void> {
        this.puts++;
        await gate;
        await super.put(...args);
      }
    }
    const store = new GatedStore();
    const { deps } = actor(store, "requester-a", clock.hooks);
    const registry = new RequestWaitRegistry();
    const waits = Array.from({ length: 16 }, () => executeBoardRequest(deps, {
      to: ["peer-b"], body: "q", wait: true, replyBy: iso(clock, 10_000),
    }, { registry }));
    await settle();
    registry.cancelAll("shutdown");
    const outcomes = await Promise.all(waits);
    expect(registry.slotsInUse).toBe(16);
    expect(asKind(outcomes[0]!, "cancelled").postState).toBe("unknown");
    const overflow = asKind(await executeBoardRequest(deps, {
      to: ["peer-b"], body: "overflow", wait: true, replyBy: iso(clock, 10_000),
    }, { registry }), "error");
    expect(overflow.code).toBe("REQUEST_CAPACITY");
    const snapshot = JSON.stringify(outcomes);
    release();
    expect(await eventually(() => registry.slotsInUse === 0)).toBe(true);
    expect(store.puts).toBe(1);
    expect(JSON.stringify(outcomes)).toBe(snapshot);
  });

  it("forwards cancellation without an optional admission registry", async () => {
    const clock = new FakeClock();
    const { deps } = actor(new MemoryStore(), "requester-a", clock.hooks);
    const signal = new AbortController();
    const pending = executeBoardRequest(deps, {
      to: ["peer-b"], body: "q", wait: true, replyBy: iso(clock, 10_000),
    }, { signal: signal.signal });
    await settle();
    signal.abort();
    await clock.advance(10_001);
    expect(asKind(await pending, "cancelled").postState).toBe("written");
  });

  it("cancels only invocations on the closed transport", async () => {
    const clock = new FakeClock();
    const { deps } = actor(new MemoryStore(), "requester-a", clock.hooks);
    const registry = new RequestWaitRegistry();
    const transport = new AbortController();
    const args = { to: ["peer-b"], body: "q", wait: true, replyBy: iso(clock, 10_000) };
    const first = executeBoardRequest(deps, args, { registry, transportSignal: transport.signal });
    const second = executeBoardRequest(deps, args, { registry });
    await settle();
    transport.abort();
    expect(asKind(await first, "cancelled").reason).toBe("transport");
    expect(registry.slotsInUse).toBe(1);
    await clock.advance(10_001);
    expect(asKind(await second, "timeout").postState).toBe("written");
  });
});

describe("outcome framing", () => {
  it("uses identical shared fixtures for every outcome code, warning, and exit/tool-fault mapping", async () => {
    expect(ERROR_MESSAGES).toEqual(CLI_ERROR_MESSAGES);
    expect(CAUSE_FOR_CODE).toEqual(CLI_CAUSE_FOR_CODE);
    expect(REPLICATION_WARNING).toEqual(CLI_REPLICATION_WARNING);
    const { deps } = actor(new MemoryStore(), "peer-b");
    const posted = asKind(await executeBoardRequest(deps, {
      to: ["peer-b"], body: "q", replyBy: new Date(Date.now() + 60_000).toISOString(),
    }), "posted");
    const response = asKind(await executeBoardRespond(deps, {
      requestId: posted.requestId, body: "inert failure text", outcome: "failure",
    }), "posted");
    const received: AdapterOutcome = {
      operation: "request-wait", board: "general", requestId: posted.requestId,
      responseId: response.responseId, replyBy: posted.replyBy, postState: "written", warnings: [],
      kind: "failure", request: posted.post, reply: response.post, observedAt: new Date().toISOString(),
    };
    const inform = asKind(await executeBoardRespond(deps, {
      requestId: posted.requestId, body: "inert inform text",
    }), "posted");
    const fixtures: Array<[AdapterOutcome, number]> = [
      [posted, 0], [response, 0], [received, 4],
      [{ ...received, kind: "inform", reply: inform.post, responseId: inform.responseId }, 0],
    ];
    for (const code of Object.keys(ERROR_MESSAGES) as Array<keyof typeof ERROR_MESSAGES>) {
      const responding = code.startsWith("RESPONSE_");
      const writing = code === "REQUEST_WRITE_FAILED" || code === "RESPONSE_WRITE_FAILED";
      const readingReply = code === "REQUEST_READ_FAILED";
      const common = {
        operation: responding ? "respond" as const : "request-wait" as const,
        board: "general", requestId: responding || writing || readingReply ? posted.requestId : null,
        responseId: code === "RESPONSE_WRITE_FAILED" ? response.responseId : null,
        replyBy: responding ? null : received.replyBy,
        postState: writing ? "unknown" as const : readingReply ? "written" as const : "not-written" as const,
        warnings: [], phase: writing ? "write" as const : readingReply ? "observe" as const
          : responding ? "target-read" as const : "prepare" as const,
        message: ERROR_MESSAGES[code], cause: CAUSE_FOR_CODE[code],
      };
      if (code === "REQUEST_TIMEOUT") fixtures.push([{ ...common, kind: "timeout", code }, 5]);
      else if (code === "REQUEST_CANCELLED") {
        for (const reason of ["rpc", "transport", "shutdown", "signal"] as const) {
          fixtures.push([{ ...common, kind: "cancelled", code, reason }, 130]);
        }
      } else {
        fixtures.push([{ ...common, kind: "error", code },
          ["INVALID_POST", "INVALID_REQUEST_OPTIONS", "RESPONSE_TARGET_INVALID"].includes(code) ? 2 : 1]);
      }
    }
    const commonKeys = ["operation", "board", "requestId", "responseId", "replyBy", "postState", "warnings", "kind"];
    for (const [fixture, exit] of fixtures) {
      for (const warning of [false, true]) {
        const outcome = { ...fixture, warnings: warning ? [REPLICATION_WARNING] : [] };
        const cli = outcome as unknown as CliOutcome;
        const result = outcomeResult(outcome, isErrorFor(outcome));
        const text = result.content[0]!.type === "text" ? result.content[0]!.text : "";
        expect(result.structuredContent).toEqual(JSON.parse(text.split("\n").at(-1)!));
        expect(result.structuredContent).toEqual(JSON.parse(JSON.stringify(cli)));
        expect(result.isError).toBe(exit !== 0);
        expect(exitForOutcome(cli, warning)).toBe(exit === 0 && warning ? 3 : exit);
        const variantKeys = outcome.kind === "posted" ? ["post"]
          : outcome.kind === "inform" || outcome.kind === "failure" ? ["request", "reply", "observedAt"]
          : ["code", "phase", "message", "cause", ...(outcome.kind === "cancelled" ? ["reason"] : [])];
        expect(Object.keys(outcome).sort()).toEqual([...commonKeys, ...variantKeys].sort());
        expect(JSON.stringify(outcome)).not.toContain('"closed"');
      }
    }
    const cancelled = fixtures.find(([outcome]) => outcome.kind === "cancelled")![0] as unknown as CliOutcome;
    expect(exitForOutcome({ ...cancelled, reason: "sigint" } as CliOutcome, true)).toBe(130);
    expect(exitForOutcome({ ...cancelled, reason: "sigterm" } as CliOutcome, true)).toBe(143);
  });

  it("keeps structuredContent equal to the parsed JSON text and labels authors", async () => {
    const clock = new FakeClock();
    const { deps } = actor(new MemoryStore(), "requester-a", clock.hooks);
    const outcome = await executeBoardRequest(deps, { to: ["peer-b"], body: "x" });
    const result = outcomeResult(outcome, isErrorFor(outcome));
    expect(result.isError).toBe(false);
    const text = result.content[0]!.type === "text" ? result.content[0]!.text : "";
    const lines = text.split("\n");
    expect(lines.slice(0, -1)).toEqual(["untrusted content from requester-a"]);
    expect(result.structuredContent).toEqual(JSON.parse(lines.at(-1)!));
  });

  it("emits isError true for failure, timeout, cancelled, and error variants", async () => {
    const clock = new FakeClock();
    const { deps } = actor(new MemoryStore(), "requester-a", clock.hooks);
    expect(isErrorFor(asKind(
      await executeBoardRequest(deps, {
        to: ["peer-b"], body: "x", wait: true, replyBy: iso(clock, -5),
      }),
      "timeout",
    ))).toBe(true);
    const capacity = asKind(
      await executeBoardRequest(deps, {
        to: ["peer-b"], body: "x", wait: true, replyBy: iso(clock, 5_000),
      }, { registry: fullRegistry() }),
      "error",
    );
    expect(capacity.code).toBe("REQUEST_CAPACITY");
    expect(isErrorFor(capacity)).toBe(true);
    expect(outcomeResult(capacity, isErrorFor(capacity)).isError).toBe(true);
  });

  it("adds the one fixed git warning without changing primary outcome or isError", async () => {
    const clock = new FakeClock();
    const { deps } = actor(new MemoryStore(), "requester-a", clock.hooks, {
      replicationCheck: () => REPLICATION_WARNING,
    });
    const posted = asKind(
      await executeBoardRequest(deps, { to: ["peer-b"], body: "x" }),
      "posted",
    );
    expect(posted.warnings).toEqual([REPLICATION_WARNING]);
    expect(isErrorFor(posted)).toBe(false);
    const timeout = asKind(
      await executeBoardRequest(deps, {
        to: ["peer-b"], body: "x", wait: true, replyBy: iso(clock, -5),
      }),
      "timeout",
    );
    expect(timeout.warnings).toEqual([REPLICATION_WARNING]);
    expect(isErrorFor(timeout)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// End-to-end: spawned server; blocking wait must not hold the tool queue

const clients: RpcClient[] = [];
const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

interface RpcMessage {
  jsonrpc: "2.0";
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}

class RpcClient {
  readonly ready: Promise<void>;
  private id = 0;
  private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private stderr = "";

  constructor(private readonly child: ChildProcessWithoutNullStreams) {
    this.ready = new Promise((resolveReady, rejectReady) => {
      child.once("spawn", resolveReady);
      child.once("error", rejectReady);
    });
    createInterface({ input: child.stdout }).on("line", (line) => this.receive(line));
    child.stderr.on("data", (chunk) => { this.stderr += String(chunk); });
    child.once("exit", (code) => {
      if (code !== null && code !== 0) {
        const error = new Error(`MCP server exited ${code}: ${this.stderr}`);
        for (const pending of this.pending.values()) pending.reject(error);
        this.pending.clear();
      }
    });
  }

  openModernRequest(method: string, params: Record<string, unknown>): { id: number; result: Promise<unknown> } {
    const id = ++this.id;
    const result = new Promise<unknown>((resolvePromise, rejectPromise) => {
      this.pending.set(id, { resolve: resolvePromise, reject: rejectPromise });
    });
    this.send({
      jsonrpc: "2.0",
      id,
      method,
      params: {
        ...params,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
          "io.modelcontextprotocol/clientCapabilities": {},
          "io.modelcontextprotocol/clientInfo": { name: "board-modern-test", version: "1.0.0" },
        },
      },
    });
    return { id, result };
  }

  modernRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
    return this.openModernRequest(method, params).result;
  }

  async close(): Promise<void> {
    if (this.child.exitCode !== null) return;
    this.child.kill("SIGTERM");
    await new Promise<void>((resolvePromise) => {
      const timer = setTimeout(() => { this.child.kill("SIGKILL"); resolvePromise(); }, 2_000);
      this.child.once("exit", () => { clearTimeout(timer); resolvePromise(); });
    });
  }

  private send(message: RpcMessage): void {
    this.child.stdin.write(JSON.stringify(message) + "\n");
  }

  private receive(line: string): void {
    let message: RpcMessage;
    try { message = JSON.parse(line) as RpcMessage; } catch { return; }
    if (message.id !== undefined) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(`${message.error.code}: ${message.error.message}`));
      else pending.resolve(message.result);
    }
  }
}

function parseToolJson<T>(text: string): T {
  const json = text.split("\n").find((line) => line.startsWith("{") || line.startsWith("["));
  if (!json) throw new Error(`tool result has no JSON: ${text}`);
  return JSON.parse(json) as T;
}

async function startServer(storeDir: string, indexPath: string, author: string): Promise<RpcClient> {
  const child = spawn(
    process.execPath,
    ["packages/mcp/src/index.ts", "--store", `fs:${storeDir}`, "--as", author, "--index", indexPath],
    { cwd: repo, env: process.env, stdio: ["pipe", "pipe", "pipe"] },
  );
  const rpc = new RpcClient(child);
  clients.push(rpc);
  await rpc.ready;
  return rpc;
}

describe("board MCP request/response tools (server)", () => {
  it("binds SDK cancellation, suppresses its result, and leaves another wait runnable", async () => {
    const root = await mkdtemp(join(repo, "packages/mcp/board-mcp-sdk-"));
    dirs.push(root);
    const clock = new FakeClock();
    const store = new MemoryStore();
    const app = new BoardMcpServer({
      store, author: "peer-b", defaultBoard: "general", indexPath: join(root, "index.sqlite"),
      requestResponseHooks: clock.hooks,
    });
    const [client, transport] = InMemoryTransport.createLinkedPair();
    const messages: JSONRPCMessage[] = [];
    client.onmessage = (message) => { messages.push(message); };
    await client.start();
    await app.createProtocolServer("modern").connect(transport);
    const send = (id: number, name: string, args: Record<string, unknown>) => client.send({
      jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args, _meta: {
        "io.modelcontextprotocol/protocolVersion": "2026-07-28",
        "io.modelcontextprotocol/clientCapabilities": {},
        "io.modelcontextprotocol/clientInfo": { name: "test", version: "1" },
      } },
    });
    try {
      const args = { to: ["peer-b"], body: "q", wait: true, replyBy: iso(clock, 10_000) };
      await send(1, "board_request", args);
      await send(2, "board_request", { ...args, body: "second" });
      await settle();
      expect(app.requestWaits.slotsInUse).toBe(2);
      await client.send({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 1 } });
      expect(await eventually(() => app.requestWaits.slotsInUse === 1)).toBe(true);
      const requests = (await storePosts(store)).filter((post) => post.act === "request");
      await send(3, "board_respond", { requestId: requests.find((post) => post.body === "second")!.id, body: "a" });
      await settle();
      await clock.advance(10_001);
      expect(await eventually(() => messages.some((message) => "id" in message && message.id === 2))).toBe(true);
      expect(messages.some((message) => "id" in message && message.id === 1)).toBe(false);
      const second = messages.find((message) => "id" in message && message.id === 2);
      expect(second).toMatchObject({ result: { structuredContent: { kind: "inform" } } });
      expect(app.requestWaits.slotsInUse).toBe(0);
    } finally {
      await client.close();
      await app.close();
    }
  });

  it("advertises closed schemas and the required annotations", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-mcp-rr-tools-"));
    dirs.push(root);
    const rpc = await startServer(join(root, "store"), join(root, "index.sqlite"), "tool-lister");
    const listing = await rpc.modernRequest("tools/list", {}) as {
      tools: Array<{
        name: string;
        inputSchema: { additionalProperties: boolean; required?: string[] };
        annotations: Record<string, unknown>;
      }>;
    };
    const request = listing.tools.find((tool) => tool.name === "board_request");
    const respond = listing.tools.find((tool) => tool.name === "board_respond");
    expect(request).toBeDefined();
    expect(respond).toBeDefined();
    expect(request!.inputSchema.additionalProperties).toBe(false);
    expect(request!.inputSchema.required).toEqual(["to", "body"]);
    expect(request!.annotations).toEqual({
      readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true,
    });
    expect(respond!.annotations).toEqual(request!.annotations);
    expect(respond!.inputSchema.required).toEqual(["requestId", "body"]);
  });

  it.each(["mcp", "cli"] as const)("keeps other tools runnable during a wait with a same-store %s responder", async (responder) => {
    const root = await mkdtemp(join(tmpdir(), "board-mcp-rr-e2e-"));
    dirs.push(root);
    const rpc = await startServer(join(root, "store"), join(root, "index.sqlite"), "peer-b");
    await rpc.modernRequest("server/discover", {});

    const replyBy = new Date(Date.now() + 15_000).toISOString();
    const wait = rpc.openModernRequest("tools/call", {
      name: "board_request",
      arguments: { to: ["peer-b"], body: "same-server ping", wait: true, replyBy },
    });

    // An unrelated read must complete while the wait is pending; it also
    // surfaces the request post so the responder can reference it. Poll until
    // the request write becomes visible to the reader.
    let page: { posts: Array<{ id: string; act?: string }> } | undefined;
    for (let i = 0; i < 20 && page === undefined; i++) {
      const read = await rpc.modernRequest("tools/call", { name: "board_read", arguments: {} }) as {
        isError?: boolean; content: Array<{ text: string }>;
      };
      expect(read.isError).not.toBe(true);
      const parsed = parseToolJson<{ posts: Array<{ id: string; act?: string }> }>(read.content[0]!.text);
      if (parsed.posts.some((post) => post.act === "request")) page = parsed;
    }
    expect(page).toBeDefined();
    const request = page!.posts.find((post) => post.act === "request");
    expect(request).toBeDefined();

    // Exercise writes, presence and resource/index access before either responder.
    for (const [name, args] of [
      ["board_post", { title: "unrelated", body: "not a response" }],
      ["board_heartbeat", { status: "waiting" }],
    ] as const) {
      const result = await rpc.modernRequest("tools/call", { name, arguments: args }) as { isError?: boolean };
      expect(result.isError).not.toBe(true);
    }
    const resource = await rpc.modernRequest("resources/read", { uri: `board://general/thread/${request!.id}` }) as {
      contents: Array<{ text: string }>;
    };
    expect(resource.contents.length).toBeGreaterThan(0);

    let posted: Record<string, unknown>;
    if (responder === "mcp") {
      const respond = await rpc.modernRequest("tools/call", {
        name: "board_respond",
        arguments: { requestId: request!.id, body: "same-server pong", mentions: ["peer-b"] },
      }) as { isError?: boolean; structuredContent: Record<string, unknown> };
      expect(respond.isError).not.toBe(true);
      posted = respond.structuredContent;
    } else {
      const child = Bun.spawn([process.execPath, "packages/cli/src/index.ts", "respond", request!.id,
        "--store", `fs:${join(root, "store")}`, "--as", "peer-b", "--body", "same-server pong",
        "--mentions", "peer-b"], { cwd: repo, stdout: "pipe", stderr: "pipe" });
      const [stdout, stderr, exit] = await Promise.all([
        new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
      ]);
      expect(exit).toBe(0);
      expect(stderr).toBe("");
      posted = JSON.parse(stdout);
    }
    expect(posted).toMatchObject({ kind: "posted", operation: "respond", requestId: request!.id,
      replyBy: null, postState: "written", warnings: [] });

    const waitResult = await wait.result as {
      isError?: boolean; content: Array<{ text: string }>; structuredContent: Record<string, unknown>;
    };
    expect(waitResult.isError).not.toBe(true);
    // structuredContent equals the parsed JSON text (after provenance labels).
    expect(waitResult.structuredContent).toEqual(parseToolJson(waitResult.content[0]!.text));
    expect(waitResult.structuredContent).toMatchObject({ kind: "inform", postState: "written" });
    const outcome = waitResult.structuredContent as {
      request: { provenance: { trust: string } };
      reply: { provenance: { trust: string }; post: { body: string } };
    };
    expect(outcome.request.provenance.trust).toBe("unsigned");
    expect(outcome.reply.provenance.trust).toBe("unsigned");
    expect(outcome.reply.post.body).toBe("same-server pong");
    expect(waitResult.structuredContent.responseId).toBe(posted.responseId);
    expect(waitResult.structuredContent.reply).toEqual(posted.post);
  }, 20_000);

  it("rejects a wait over five minutes at the server boundary without posting", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-mcp-rr-cap-"));
    dirs.push(root);
    const rpc = await startServer(join(root, "store"), join(root, "index.sqlite"), "peer-c");
    await rpc.modernRequest("server/discover", {});
    const result = await rpc.modernRequest("tools/call", {
      name: "board_request",
      arguments: {
        to: ["peer-c"], body: "too long", wait: true,
        replyBy: new Date(Date.now() + MCP_MAX_WAIT_MS + 60_000).toISOString(),
      },
    }) as { isError?: boolean; structuredContent: { kind: string; code: string; postState: string } };
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      kind: "error", code: "INVALID_REQUEST_OPTIONS", postState: "not-written",
    });
  });
});

import { beforeEach, describe, expect, it } from "bun:test";
import { Board, MemoryStore, ulid, type Post, type Store } from "@board/core";
import {
  exitForOutcome,
  parseRequestArgs,
  parseRespondArgs,
  REPLICATION_WARNING,
  type AdapterOutcome,
} from "../src/request-response.ts";
import { runCli as dispatchCli, type CliDependencies } from "../src/index.ts";
import { captureCliInvocation, handleRequest } from "../src/request-response.ts";

class Clock {
  wall = Date.UTC(2026, 8, 10, 12);
  mono = 0;
  next = 0;
  timers = new Map<number, { at: number; callback: () => void }>();
  hooks = {
    wallNow: () => this.wall,
    monoNow: () => this.mono,
    setTimeout: (callback: () => void, ms: number): unknown => {
      const id = ++this.next;
      this.timers.set(id, { at: this.mono + ms, callback });
      return id;
    },
    clearTimeout: (id: unknown) => { this.timers.delete(id as number); },
  };
  advance(ms: number) {
    this.mono += ms;
    this.wall += ms;
    for (const [id, timer] of [...this.timers]) {
      if (timer.at <= this.mono && this.timers.delete(id)) timer.callback();
    }
  }
}
let clock: Clock;
beforeEach(() => { clock = new Clock(); });
function runCli(argv: string[], deps: CliDependencies = {}) {
  return dispatchCli(argv, { hooks: clock.hooks, now: () => clock.wall, ...deps });
}
async function flush() { for (let i = 0; i < 100; i++) await Promise.resolve(); }
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function outcomeLine(lines: string[]): AdapterOutcome {
  const last = lines.at(-1);
  if (last === undefined) throw new Error("no outcome line printed");
  return JSON.parse(last) as AdapterOutcome;
}

/** Runs fn with a clean process.exitCode and returns the code it left. */
async function exitOf(fn: () => Promise<unknown>): Promise<number> {
  const prev = process.exitCode;
  process.exitCode = undefined;
  try {
    await fn();
    return process.exitCode ?? 0;
  } finally {
    process.exitCode = prev;
  }
}

async function until<T>(probe: () => T | undefined | Promise<T | undefined>): Promise<T> {
  for (let i = 0; i < 1000; i++) {
    const value = await probe();
    if (value !== undefined) return value;
  }
  throw new Error("condition not reached after microtask drainage");
}

function postsIn(store: Store, board = "general"): Promise<Post[]> {
  return new Board(store, { board, author: "probe", now: () => clock.wall }).since(undefined, { limit: 1_000 })
    .then((page) => page.posts);
}

const waitArgs = (extra: string[]): string[] => [
  "request", "--store", "fs:ignored", "--board", "general", "--as", "letta",
  "--to", "codex", "--body", "please build it", "--interval", "10", ...extra,
];

describe("request/respond argument parsing", () => {
  it("parses the closed request profile", () => {
    const args = parseRequestArgs([
      "--to", "claude,letta", "--body", "-", "--title", "T", "--tags", "x,y",
      "--mentions", "codex", "--reply-by", "2026-09-05T12:01:00.123Z",
      "--wait", "--interval", "500", "--board", "team", "--as", "opi", "--json",
    ]);
    expect(args.to).toEqual(["claude", "letta"]);
    expect(args.body).toBe("-");
    expect(args.title).toBe("T");
    expect(args.tags).toEqual(["x", "y"]);
    expect(args.mentions).toEqual(["codex"]);
    expect(args.replyBy).toBe("2026-09-05T12:01:00.123Z");
    expect(args.wait).toBe(true);
    expect(args.interval).toBe(500);
    expect(args.board).toBe("team");
    expect(args.as).toBe("opi");
    expect(args.json).toBe(true);
  });

  it("rejects unknown flags, bad recipients, and bad intervals", () => {
    expect(() => parseRequestArgs(["--to", "a", "--body", "b", "--deliver"])).toThrow("unknown flag");
    expect(() => parseRequestArgs(["--body", "b"])).toThrow("--to is required");
    expect(() => parseRequestArgs(["--to", "a,,b", "--body", "b"])).toThrow("--to");
    expect(() => parseRequestArgs(["--to", "two names", "--body", "b"])).toThrow("--to");
    expect(() => parseRequestArgs(["--to", "a", "--body", "b", "--interval", "0"])).toThrow("--interval");
    expect(() => parseRequestArgs(["--to", "a", "--body", "b", "--interval", "30001"])).toThrow("--interval");
    expect(() => parseRequestArgs(["--to", "a", "--body", "b", "--wait"])).toThrow("--reply-by is required");
    expect(() => parseRequestArgs(["--to", "a", "--body", "b", "--interval", "10"])).toThrow("only with --wait");
  });

  it("holds respond to its allowlist and one positional", () => {
    const args = parseRespondArgs(["01J8Z7Q0000000000000000000", "--failure", "--mentions", "a", "--body", "x"]);
    expect(args.failure).toBe(true);
    expect(args.mentions).toEqual(["a"]);
    expect(() => parseRespondArgs(["a", "--title", "T"])).toThrow("unknown flag");
    expect(() => parseRespondArgs(["a", "--tags", "x"])).toThrow("unknown flag");
    expect(() => parseRespondArgs(["a", "--act", "cancel"])).toThrow("unknown flag");
    expect(() => parseRespondArgs([])).toThrow("exactly one request id");
    expect(() => parseRespondArgs(["a", "b"])).toThrow("exactly one request id");
  });

  it("maps D07 exit codes with replication-warning precedence", () => {
    const base = {
      operation: "request-wait", board: "general", requestId: "q", responseId: null,
      replyBy: null, postState: "written", warnings: [],
    } as const;
    const cancelled = (reason: string): AdapterOutcome =>
      ({ ...base, kind: "cancelled", code: "REQUEST_CANCELLED", reason, phase: "observe", message: "m", cause: null }) as unknown as AdapterOutcome;
    expect(exitForOutcome({ ...base, kind: "posted", post: {} } as unknown as AdapterOutcome, false)).toBe(0);
    expect(exitForOutcome({ ...base, kind: "posted", post: {} } as unknown as AdapterOutcome, true)).toBe(3);
    expect(exitForOutcome({ ...base, kind: "inform", request: {}, reply: {}, observedAt: "x" } as unknown as AdapterOutcome, true)).toBe(3);
    expect(exitForOutcome({ ...base, kind: "failure", request: {}, reply: {}, observedAt: "x" } as unknown as AdapterOutcome, true)).toBe(4);
    expect(exitForOutcome({ ...base, kind: "timeout", code: "REQUEST_TIMEOUT", phase: "observe", message: "m", cause: null } as unknown as AdapterOutcome, true)).toBe(5);
    expect(exitForOutcome(cancelled("sigterm"), true)).toBe(143);
    expect(exitForOutcome(cancelled("sigint"), false)).toBe(130);
    expect(exitForOutcome(cancelled("signal"), false)).toBe(130);
    expect(exitForOutcome({ ...base, kind: "error", code: "RESPONSE_TARGET_INVALID", phase: "validate", message: "m", cause: null } as unknown as AdapterOutcome, true)).toBe(2);
  });
});

describe("board request command", () => {
  it("posts without --wait and prints the posted outcome", async () => {
    const store = new MemoryStore();
    const lines: string[] = [];
    const exit = await exitOf(() => runCli(
      ["request", "--store", "fs:ignored", "--board", "general", "--as", "letta",
        "--to", "codex", "--title", "Ship", "--body", "do it"],
      { createStore: (): Store => store, stdout: (line) => lines.push(line) },
    ));
    const out = outcomeLine(lines);
    expect(exit).toBe(0);
    expect(out.kind).toBe("posted");
    expect(out.operation).toBe("request-post");
    const post = (out as unknown as { post: { post: Post; provenance: unknown } }).post;
    expect(post.post.body).toBe("do it");
    expect(post.post.title).toBe("Ship");
    expect(post.provenance).toEqual({
      author: "letta", board: "general", postId: post.post.id, trust: "unsigned",
    });
    expect(out.requestId).toBe(post.post.id);
    expect(out.responseId).toBeNull();
    expect(out.postState).toBe("written");
    expect(out.warnings).toEqual([]);
  });

  it("rejects invalid usage with the JSON error union before any put", async () => {
    const store = new MemoryStore();
    const lines: string[] = [];
    const exit = await exitOf(() => runCli(
      ["request", "--store", "fs:ignored", "--to", "codex", "--body", "x",
        "--wait", "--reply-by", "2026-02-30T00:00:00Z"],
      { createStore: (): Store => store, stdout: (line) => lines.push(line) },
    ));
    const out = outcomeLine(lines);
    expect(exit).toBe(2);
    expect(out.kind).toBe("error");
    expect((out as { code: string }).code).toBe("INVALID_REQUEST_OPTIONS");
    expect(out.postState).toBe("not-written");
    expect((await postsIn(store)).length).toBe(0);
  });

  it("rejects a malformed deadline and a missing body", async () => {
    const store = new MemoryStore();
    const lines: string[] = [];
    const deps = { createStore: (): Store => store, stdout: (line: string) => lines.push(line), stdin: async () => "" };
    expect(await exitOf(() => runCli(
      ["request", "--store", "fs:ignored", "--to", "codex", "--body", "x",
        "--wait", "--reply-by", "2026-09-05T12:01:00"],
      deps,
    ))).toBe(2);
    expect((outcomeLine(lines) as { code: string }).code).toBe("INVALID_REQUEST_OPTIONS");
    expect(await exitOf(() => runCli(
      ["request", "--store", "fs:ignored", "--to", "codex"],
      deps,
    ))).toBe(2);
    expect((outcomeLine(lines) as { code: string }).code).toBe("INVALID_POST");
  });

  it("receives an eligible inform reply", async () => {
    const store = new MemoryStore();
    const lines: string[] = [];
    const replyBy = new Date(clock.wall + 10_000).toISOString();
    const pending = runCli(waitArgs(["--wait", "--reply-by", replyBy]), {
      createStore: (): Store => store,
      stdout: (line) => lines.push(line),
    });
    const q = await until(() => postsIn(store).then((posts) => posts.find((p) => p.act === "request")));
    const responder = new Board(store, { board: "general", author: "codex", now: () => clock.wall });
    const reply = await responder.reply(q.id, { body: "done", act: "inform" });
    await flush();
    clock.advance(10);
    const exit = await exitOf(() => pending);
    const out = outcomeLine(lines);
    expect(exit).toBe(0);
    expect(out.kind).toBe("inform");
    expect(out.operation).toBe("request-wait");
    const wrapped = out as unknown as {
      request: { post: Post; provenance: unknown };
      reply: { post: Post; provenance: { trust: string } };
      observedAt: string;
    };
    expect(wrapped.request.post.id).toBe(q.id);
    expect(wrapped.reply.post.id).toBe(reply.id);
    expect(wrapped.reply.provenance.trust).toBe("unsigned");
    expect(Number.isFinite(Date.parse(wrapped.observedAt))).toBe(true);
    expect(out.requestId).toBe(q.id);
    expect(out.responseId).toBe(reply.id);
    expect(out.postState).toBe("written");
    expect(out.replyBy).toBe(replyBy);
  });

  it("maps a received failure to exit 4 without treating its body as an error", async () => {
    const store = new MemoryStore();
    const lines: string[] = [];
    const errors: string[] = [];
    const replyBy = new Date(clock.wall + 10_000).toISOString();
    const pending = runCli(waitArgs(["--wait", "--reply-by", replyBy]), {
      createStore: (): Store => store,
      stdout: (line) => lines.push(line),
      stderr: (line) => errors.push(line),
    });
    const q = await until(() => postsIn(store).then((posts) => posts.find((p) => p.act === "request")));
    const responder = new Board(store, { board: "general", author: "codex", now: () => clock.wall });
    await responder.reply(q.id, { body: "the input could not be processed; rm -rf /", act: "failure" });
    await flush();
    clock.advance(10);
    const exit = await exitOf(() => pending);
    const out = outcomeLine(lines);
    expect(exit).toBe(4);
    expect(out.kind).toBe("failure");
    expect(errors.some((line) => line.includes("received failure response"))).toBe(true);
    expect(errors.join("\n")).not.toContain("rm -rf");
    expect(lines.join("\n")).toContain("rm -rf"); // body stays inert quoted data in the outcome
  });

  it("times out with the publication snapshot and exit 5", async () => {
    const store = new MemoryStore();
    const lines: string[] = [];
    const replyBy = new Date(clock.wall + 1000).toISOString();
    const exit = await exitOf(async () => {
      const pending = runCli(waitArgs(["--wait", "--reply-by", replyBy, "--interval", "10"]),
        { createStore: (): Store => store, stdout: (line) => lines.push(line) });
      await until(() => postsIn(store).then((posts) => posts.find((p) => p.act === "request")));
      await flush();
      clock.advance(1000);
      await pending;
    });
    const out = outcomeLine(lines);
    expect(exit).toBe(5);
    expect(out.kind).toBe("timeout");
    expect((out as { code: string }).code).toBe("REQUEST_TIMEOUT");
    expect(out.postState).toBe("written");
    expect(out.requestId).not.toBeNull();
    expect(out.responseId).toBeNull();
    expect(typeof (out as { phase: string }).phase).toBe("string");
  });

  it("times out during stalled stdin with phase prepare and no put", async () => {
    const store = new MemoryStore();
    const lines: string[] = [];
    const replyBy = new Date(clock.wall + 1000).toISOString();
    const started = deferred<void>();
    const exit = await exitOf(async () => {
      const pending = runCli(
        ["request", "--store", "fs:ignored", "--board", "general", "--as", "letta",
          "--to", "codex", "--body", "-", "--wait", "--reply-by", replyBy, "--interval", "10"],
        { createStore: (): Store => store, stdout: (line) => lines.push(line),
          stdin: () => { started.resolve(); return new Promise<string>(() => {}); } });
      await started.promise;
      clock.advance(1000);
      await pending;
    });
    const out = outcomeLine(lines);
    expect(exit).toBe(5);
    expect(out.kind).toBe("timeout");
    expect((out as { phase: string }).phase).toBe("prepare");
    expect(out.board).toBe("general");
    expect(out.requestId).toBeNull();
    expect(out.postState).toBe("not-written");
    expect((await postsIn(store)).length).toBe(0); // never published
  });

  it("reports a pre-aborted injected signal as cancelled exit 130 without store work", async () => {
    const store = new MemoryStore();
    const lines: string[] = [];
    let stdinCalled = false;
    const replyBy = new Date(clock.wall + 10_000).toISOString();
    const exit = await exitOf(() => runCli(
      ["request", "--store", "fs:ignored", "--board", "general", "--as", "letta",
        "--to", "codex", "--body", "x", "--wait", "--reply-by", replyBy],
      {
        createStore: (): Store => store,
        stdout: (line) => lines.push(line),
        signal: AbortSignal.abort(),
        stdin: () => {
          stdinCalled = true;
          return Promise.resolve("nope");
        },
      },
    ));
    const out = outcomeLine(lines);
    expect(exit).toBe(130);
    expect(out.kind).toBe("cancelled");
    expect((out as { reason: string }).reason).toBe("signal");
    expect((out as { code: string }).code).toBe("REQUEST_CANCELLED");
    expect((out as { phase: string }).phase).toBe("prepare");
    expect(out.postState).toBe("not-written");
    expect(out.requestId).toBeNull();
    expect(stdinCalled).toBe(false);
    expect((await postsIn(store)).length).toBe(0);
  });

  it.each(["SIGINT", "SIGTERM"] as const)("captures %s during preparation and releases owned signal handlers", async (signal) => {
    const before = [process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")];
    const ctx = captureCliInvocation({ installSignals: true, hooks: clock.hooks });
    const store = new MemoryStore();
    const input = deferred<string>();
    const lines: string[] = [];
    let started = false;
    try {
      const pending = handleRequest(["--to", "codex", "--body", "-", "--wait", "--reply-by",
        new Date(clock.wall + 1000).toISOString()], {
        store, stdin: () => { started = true; return input.promise; },
        stdout: (line) => lines.push(line), stderr: () => {}, hooks: clock.hooks,
      }, ctx);
      await until(() => started ? true : undefined);
      process.emit(signal);
      expect(await pending).toBe(signal === "SIGTERM" ? 143 : 130);
      expect(outcomeLine(lines)).toMatchObject({
        operation: "request-wait", kind: "cancelled", reason: signal.toLowerCase(), phase: "prepare",
        requestId: null, responseId: null, postState: "not-written",
      });
      const snapshot = [...lines];
      input.reject(new Error("late preparation failure"));
      await flush();
      expect(lines).toEqual(snapshot);
      expect((await postsIn(store)).length).toBe(0);
    } finally {
      ctx.dispose();
    }
    expect(clock.timers.size).toBe(0);
    expect([process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")]).toEqual(before);
  });

  it("treats an elapsed deadline as timeout with no publication", async () => {
    const store = new MemoryStore();
    const lines: string[] = [];
    const replyBy = new Date(clock.wall - 1_000).toISOString();
    const exit = await exitOf(() => runCli(
      ["request", "--store", "fs:ignored", "--to", "codex", "--body", "x",
        "--wait", "--reply-by", replyBy],
      { createStore: (): Store => store, stdout: (line) => lines.push(line) },
    ));
    const out = outcomeLine(lines);
    expect(exit).toBe(5);
    expect(out.kind).toBe("timeout");
    expect((out as { phase: string }).phase).toBe("prepare");
    expect(out.postState).toBe("not-written");
    expect((await postsIn(store)).length).toBe(0);
  });

  it("rejects a deadline more than 24 hours out", async () => {
    const store = new MemoryStore();
    const lines: string[] = [];
    const replyBy = new Date(clock.wall + 25 * 60 * 60 * 1_000).toISOString();
    const exit = await exitOf(() => runCli(
      ["request", "--store", "fs:ignored", "--to", "codex", "--body", "x",
        "--wait", "--reply-by", replyBy],
      { createStore: (): Store => store, stdout: (line) => lines.push(line) },
    ));
    expect(exit).toBe(2);
    expect((outcomeLine(lines) as { code: string }).code).toBe("INVALID_REQUEST_OPTIONS");
  });

  it("reads piped stdin bodies and enforces the 64 KiB cap", async () => {
    const store = new MemoryStore();
    const lines: string[] = [];
    const deps = {
      createStore: (): Store => store,
      stdout: (line: string) => lines.push(line),
      stdin: () => Promise.resolve("piped body"),
    };
    await exitOf(() => runCli(
      ["request", "--store", "fs:ignored", "--to", "codex", "--body", "-"], deps,
    ));
    expect((outcomeLine(lines) as { post: { post: { body: string } } }).post.post.body).toBe("piped body");

    deps.stdin = () => Promise.resolve("x".repeat(64 * 1024 + 1));
    const exit = await exitOf(() => runCli(
      ["request", "--store", "fs:ignored", "--to", "codex", "--body", "-"], deps,
    ));
    expect(exit).toBe(2);
    expect((outcomeLine(lines) as { code: string }).code).toBe("INVALID_POST");
  });

  it("maps a failed stdin preparation to ADAPTER_PREPARATION_FAILED", async () => {
    const store = new MemoryStore();
    const lines: string[] = [];
    const exit = await exitOf(() => runCli(
      ["request", "--store", "fs:ignored", "--to", "codex", "--body", "-"],
      {
        createStore: (): Store => store,
        stdout: (line) => lines.push(line),
        stdin: () => Promise.reject(new Error("reader exploded")),
      },
    ));
    expect(exit).toBe(1);
    expect((outcomeLine(lines) as { code: string }).code).toBe("ADAPTER_PREPARATION_FAILED");
  });
});

describe("CLI fix round 1 regressions", () => {
  it("validates recipient, author and posting deadline before Store preparation", async () => {
    for (const extra of [["--to", "bad/name"], ["--as", "bad/name"], ["--reply-by", "invalid"]]) {
      let calls = 0;
      const lines: string[] = [];
      const exit = await exitOf(() => runCli(["request", "--store", "fs:ignored", "--to", "codex", "--body", "x", ...extra], {
        createStore: () => { calls++; return new MemoryStore(); },
        stdout: (line) => lines.push(line), stderr: () => {},
      }));
      expect(exit).toBe(2);
      expect(calls).toBe(0);
      expect(outcomeLine(lines)).toMatchObject({ kind: "error", code: "INVALID_REQUEST_OPTIONS", board: "general" });
    }
  });

  it("checks cutoff and signal before evaluating settled preparation without timer delivery", async () => {
    for (const stage of ["store", "stdin"]) for (const rejected of [false, true]) for (const cancelled of [false, true]) {
      clock = new Clock();
      const store = new MemoryStore();
      const setup = deferred<Store>();
      const body = deferred<string>();
      const entered = deferred<void>();
      const abort = new AbortController();
      const lines: string[] = [];
      const exit = await exitOf(async () => {
        const pending = runCli(waitArgs(["--wait", "--reply-by", new Date(clock.wall + 1000).toISOString(), "--body", "-"]), {
          signal: abort.signal,
          createStore: () => { if (stage === "store") { entered.resolve(); return setup.promise; } return store; },
          stdin: () => { entered.resolve(); return body.promise; },
          stdout: (line) => lines.push(line), stderr: () => {},
        });
        await entered.promise;
        // Deliberately don't execute due callbacks: EOF/setup resumes at equality.
        clock.mono = 1000;
        if (cancelled) abort.abort();
        if (stage === "store") {
          if (rejected) setup.reject(new Error("late setup")); else setup.resolve(store);
        } else {
          if (rejected) body.reject(new Error("late input")); else body.resolve("ready");
        }
        await pending;
      });
      expect(exit).toBe(cancelled ? 130 : 5);
      expect(lines).toHaveLength(1);
      expect(outcomeLine(lines)).toMatchObject({ kind: cancelled ? "cancelled" : "timeout", phase: "prepare", requestId: null, postState: "not-written" });
      expect(await postsIn(store)).toHaveLength(0);
      expect(clock.timers.size).toBe(0);
    }
  });
  it("retains response target and warning on empty or synchronously failed input", async () => {
    const store = Object.assign(new MemoryStore(), { lastSyncError: new Error("private") });
    const requestId = ulid();
    for (const reject of [false, true]) {
      const lines: string[] = [];
      expect(await exitOf(() => runCli(["respond", requestId, "--store", "fs:ignored", "--board", "team", "--body", ""], {
        createStore: () => store,
        stdin: () => { if (reject) throw new Error("private input"); return Promise.resolve(""); },
        stdout: (line) => lines.push(line), stderr: () => {},
      }))).toBe(reject ? 1 : 2);
      expect(outcomeLine(lines)).toMatchObject({ operation: "respond", board: "team", requestId, responseId: null,
        kind: "error", phase: "prepare", postState: "not-written", replyBy: null, warnings: [REPLICATION_WARNING] });
    }
  });

  it("supervises pending Store creation and ignores late rejection", async () => {
    const setup = deferred<Store>();
    const entered = deferred<void>();
    const abort = new AbortController();
    const lines: string[] = [];
    let stdinCalls = 0;
    const exit = await exitOf(async () => {
      const pending = runCli(waitArgs(["--wait", "--reply-by", new Date(clock.wall + 1000).toISOString()]), {
        signal: abort.signal,
        createStore: () => { entered.resolve(); return setup.promise; },
        stdout: (line) => lines.push(line), stderr: () => {},
        stdin: async () => { stdinCalls++; return "body"; },
      });
      await entered.promise;
      abort.abort();
      await pending;
      setup.reject(new Error("secret backend path"));
      await flush();
    });
    expect(exit).toBe(130);
    expect(lines).toHaveLength(1);
    expect(outcomeLine(lines)).toMatchObject({ kind: "cancelled", phase: "prepare", requestId: null, responseId: null, postState: "not-written" });
    expect(stdinCalls).toBe(0);
    expect(clock.timers.size).toBe(0);
  });

  it("pre-abort cancels only wait mode; posting retains the non-wait contract", async () => {
    for (const wait of [false, true]) {
      let calls = 0;
      const lines: string[] = [];
      const exit = await exitOf(() => runCli(["request", "--store", "fs:ignored", "--to", "codex", "--body", "x",
        ...(wait ? ["--wait", "--reply-by", new Date(clock.wall - 1000).toISOString()] : [])], {
        signal: AbortSignal.abort(), createStore: () => { calls++; return new MemoryStore(); },
        stdout: (line) => lines.push(line), stderr: () => {},
      }));
      expect(exit).toBe(wait ? 130 : 0);
      expect(calls).toBe(wait ? 0 : 1);
      expect(outcomeLine(lines)).toMatchObject({ kind: wait ? "cancelled" : "posted", operation: wait ? "request-wait" : "request-post" });
      expect(clock.timers.size).toBe(0);
    }
  });

  it("classifies rejected Store creation and removes deadline timers", async () => {
    for (const command of ["request", "respond"]) {
      const lines: string[] = [];
      const errors: string[] = [];
      const args = command === "request" ? waitArgs(["--wait", "--reply-by", new Date(clock.wall + 1000).toISOString()])
        : ["respond", ulid(), "--store", "fs:ignored", "--body", "x"];
      const exit = await exitOf(() => runCli(args, {
        createStore: () => Promise.reject(new Error("secret backend path")),
        stdout: (line) => lines.push(line), stderr: (line) => errors.push(line),
      }));
      expect(exit).toBe(1);
      expect(lines).toHaveLength(1);
      expect(outcomeLine(lines)).toMatchObject({ code: "ADAPTER_PREPARATION_FAILED", phase: "prepare", requestId: null, postState: "not-written" });
      expect([...lines, ...errors].join()).not.toContain("secret");
      expect(clock.timers.size).toBe(0);
    }
  });

  it("keeps the original monotonic cutoff across Store, stdin, and core despite wall jumps", async () => {
    for (const jump of [-60_000, 60_000]) {
      clock = new Clock();
      const setup = deferred<Store>();
      const body = deferred<string>();
      const started = deferred<void>();
      const store = new MemoryStore();
      const lines: string[] = [];
      const replyBy = new Date(clock.wall + 1000).toISOString();
      const exit = await exitOf(async () => {
        const pending = runCli(waitArgs(["--wait", "--reply-by", replyBy, "--body", "-"]), {
          createStore: () => setup.promise,
          stdin: () => { started.resolve(); return body.promise; },
          stdout: (line) => lines.push(line), stderr: () => {},
        });
        await flush();
        clock.advance(400);
        clock.wall += jump;
        setup.resolve(store);
        await started.promise;
        await flush(); // Let the stdin race arm its timer before inspecting it.
        expect([...clock.timers.values()].every((timer) => timer.at <= 1000)).toBe(true);
        clock.advance(300);
        body.resolve("ready");
        await flush();
        expect([...clock.timers.values()].every((timer) => timer.at <= 1000)).toBe(true);
        expect((await postsIn(store)).length).toBe(1);
        clock.advance(300);
        await pending;
      });
      expect(exit).toBe(5);
      expect(outcomeLine(lines)).toMatchObject({ kind: "timeout", replyBy, postState: "written" });
      expect(lines).toHaveLength(1);
      expect(clock.timers.size).toBe(0);
    }
  });

  it("expires pending Store setup without late publication", async () => {
    const setup = deferred<Store>();
    const store = new MemoryStore();
    const lines: string[] = [];
    const exit = await exitOf(async () => {
      const pending = runCli(waitArgs(["--wait", "--reply-by", new Date(clock.wall + 1000).toISOString()]), {
        createStore: () => setup.promise, stdout: (line) => lines.push(line), stderr: () => {},
      });
      await flush();
      clock.advance(1000);
      await pending;
      setup.resolve(store);
      await flush();
    });
    expect(exit).toBe(5);
    expect(outcomeLine(lines)).toMatchObject({ kind: "timeout", phase: "prepare", requestId: null, postState: "not-written" });
    expect(lines).toHaveLength(1);
    expect(await postsIn(store)).toHaveLength(0);
  });

  it("rejects unknown flags and closed positional grammar before setup", async () => {
    const cases = [
      ["request", "--to", "codex", "--body", "x", "--unknown-profile"],
      ["request", "--to", "codex", "--body", "x", "stray"],
      ["request", "--to", "codex", "--body", "x", "--", "stray"],
      ["respond", ulid(), "--body", "x", "--unknown-profile"],
      ["respond", ulid(), "--body", "x", "--", "extra"],
      ["respond", ulid(), "extra", "--body", "x"],
    ];
    for (const args of cases) {
      const lines: string[] = [];
      let calls = 0;
      const exit = await exitOf(() => runCli([args[0]!, "--store", "fs:ignored", ...args.slice(1)], {
        createStore: () => { calls++; return new MemoryStore(); }, stdout: (line) => lines.push(line), stderr: () => {},
      }));
      expect(exit).toBe(2);
      expect(lines).toHaveLength(1);
      expect(outcomeLine(lines)).toMatchObject({ kind: "error", code: "INVALID_REQUEST_OPTIONS" });
      expect(calls).toBe(0);
    }
    for (const args of [["request", "--to", "codex"], ["respond", ulid(), "--store", "invalid"]]) {
      const lines: string[] = [];
      expect(await exitOf(() => runCli(args, { stdout: (line) => lines.push(line), stderr: () => {} }))).toBe(2);
      expect(outcomeLine(lines)).toMatchObject({ kind: "error", code: "INVALID_REQUEST_OPTIONS" });
    }
  });

  it("accepts literal sentinel bodies and falls back from explicit empty body for both commands", async () => {
    const store = new MemoryStore();
    const root = await new Board(store, { board: "general", author: "letta" }).request("codex", { body: "q" });
    for (const command of ["request", "respond"]) for (const body of ["missing", "oversize", "--wait", "--help", "--board", ""]) {
      const lines: string[] = [];
      let reads = 0;
      const exit = await exitOf(() => runCli([command, ...(command === "request" ? ["--to", "codex"] : [root.id]),
        "--store", "fs:ignored", "--as", "codex", "--body", body], {
        createStore: () => store, stdin: async () => { reads++; return "fallback"; },
        stdout: (line) => lines.push(line), stderr: () => {},
      }));
      expect(exit).toBe(0);
      const outcome = outcomeLine(lines);
      if (outcome.kind !== "posted") throw new Error("not posted");
      expect(outcome.post.post.body).toBe(body || "fallback");
      expect(reads).toBe(body === "" ? 1 : 0);
    }
  });

  it("retains the allocated posting ID and protocol on rejected put", async () => {
    const store = new MemoryStore();
    let captured: Post | undefined;
    store.put = async (_key, bytes) => {
      captured = JSON.parse(typeof bytes === "string" ? bytes : new TextDecoder().decode(bytes));
      throw new Error("secret write error");
    };
    const lines: string[] = [];
    const exit = await exitOf(() => runCli(["request", "--store", "fs:ignored", "--to", "codex", "--body", "x"], {
      createStore: () => store, stdout: (line) => lines.push(line), stderr: () => {},
    }));
    expect(exit).toBe(1);
    expect(captured?.protocol).toBe("request");
    expect(captured?.id).toBeDefined();
    expect(outcomeLine(lines)).toMatchObject({ code: "REQUEST_WRITE_FAILED", requestId: captured!.id, postState: "unknown" });
    expect(lines.join()).not.toContain("secret");
  });

  it("retains board, normalized deadline, operation, and cached warning on early errors", async () => {
    const store = Object.assign(new MemoryStore(), { lastSyncError: new Error("private") });
    const replyBy = new Date(clock.wall + 1000).toISOString();
    for (const extra of [["--interval", "0"], ["--body", ""], ["--body", "x".repeat(65537)]]) {
      const ctx = captureCliInvocation({ hooks: clock.hooks });
      ctx.replicationCheck = () => REPLICATION_WARNING;
      const lines: string[] = [];
      try {
        expect(await handleRequest(["--wait", "--to", "codex", "--board", "team", "--reply-by", replyBy, ...extra], {
          store, stdin: async () => "", stdout: (line) => lines.push(line), stderr: () => {},
        }, ctx)).toBe(2);
        expect(outcomeLine(lines)).toMatchObject({ operation: "request-wait", board: "team", replyBy, warnings: [REPLICATION_WARNING], kind: "error" });
      } finally { ctx.dispose(); }
    }
  });
});

describe("board respond command", () => {
  it("publishes an inform response and reports posted exit 0", async () => {
    const store = new MemoryStore();
    const requester = new Board(store, { board: "general", author: "letta" });
    const q = await requester.request(["codex"], { body: "need status" });
    const lines: string[] = [];
    const exit = await exitOf(() => runCli(
      ["respond", q.id, "--store", "fs:ignored", "--board", "general", "--as", "codex",
        "--body", "on track", "--mentions", "letta"],
      { createStore: (): Store => store, stdout: (line) => lines.push(line) },
    ));
    const out = outcomeLine(lines);
    expect(exit).toBe(0);
    expect(out.kind).toBe("posted");
    expect(out.operation).toBe("respond");
    expect(out.requestId).toBe(q.id);
    expect(out.responseId).not.toBeNull();
    expect(out.replyBy).toBeNull();
    expect(out.postState).toBe("written");
    const stored = await until(() => postsIn(store).then((posts) => posts.find((p) => p.replyTo === q.id)));
    expect(stored.act).toBe("inform");
    expect(stored.mentions).toEqual(["letta"]);
    expect(stored.thread).toBe(q.id);
  });

  it("publishes an explicit failure response that still returns posted", async () => {
    const store = new MemoryStore();
    const requester = new Board(store, { board: "general", author: "letta" });
    const q = await requester.request(["codex"], { body: "need status" });
    const lines: string[] = [];
    const exit = await exitOf(() => runCli(
      ["respond", q.id, "--store", "fs:ignored", "--as", "codex", "--failure", "--body", "cannot process"],
      { createStore: (): Store => store, stdout: (line) => lines.push(line) },
    ));
    const out = outcomeLine(lines);
    expect(exit).toBe(0);
    expect(out.kind).toBe("posted");
    expect((await until(() => postsIn(store).then((posts) => posts.find((p) => p.replyTo === q.id)))).act).toBe("failure");
  });

  it("maps a missing target to RESPONSE_TARGET_INVALID exit 2", async () => {
    const store = new MemoryStore();
    const lines: string[] = [];
    const exit = await exitOf(() => runCli(
      ["respond", ulid(), "--store", "fs:ignored", "--body", "x"],
      { createStore: (): Store => store, stdout: (line) => lines.push(line) },
    ));
    const out = outcomeLine(lines);
    expect(exit).toBe(2);
    expect((out as { code: string }).code).toBe("RESPONSE_TARGET_INVALID");
    expect(out.postState).toBe("not-written");
  });

  it("rejects a malformed target id and scope to the selected board", async () => {
    const store = new MemoryStore();
    const lines: string[] = [];
    const deps = { createStore: (): Store => store, stdout: (line: string) => lines.push(line) };
    const exit = await exitOf(() => runCli(
      ["respond", "not-a-ulid", "--store", "fs:ignored", "--body", "x"], deps,
    ));
    expect(exit).toBe(2);
    expect((outcomeLine(lines) as { code: string }).code).toBe("INVALID_REQUEST_OPTIONS");

    const other = await new Board(store, { board: "general", author: "letta" }).request(["codex"], { body: "q" });
    const exit2 = await exitOf(() => runCli(
      ["respond", other.id, "--store", "fs:ignored", "--board", "elsewhere", "--body", "x"], deps,
    ));
    expect(exit2).toBe(2);
    expect((outcomeLine(lines) as { code: string }).code).toBe("RESPONSE_TARGET_INVALID");
  });

  it("rejects response metadata outside the --mentions allowlist via the JSON union", async () => {
    const store = new MemoryStore();
    const requester = new Board(store, { board: "general", author: "letta" });
    const q = await requester.request(["codex"], { body: "q" });
    const lines: string[] = [];
    const exit = await exitOf(() => runCli(
      ["respond", q.id, "--store", "fs:ignored", "--title", "Nope", "--body", "x"],
      { createStore: (): Store => store, stdout: (line) => lines.push(line) },
    ));
    expect(exit).toBe(2);
    expect((outcomeLine(lines) as { code: string }).code).toBe("INVALID_REQUEST_OPTIONS");
    expect((await postsIn(store).then((posts) => posts.filter((p) => p.replyTo === q.id))).length).toBe(0);
  });

  it("emits the fixed Git replication warning without changing non-posted exits", async () => {
    const base = {
      operation: "request-post" as const, board: "general", requestId: "q", responseId: null,
      replyBy: null, postState: "written" as const, warnings: [REPLICATION_WARNING],
    };
    expect(base.warnings.length).toBe(1);
    expect(base.warnings[0]!.code).toBe("GIT_REPLICATION_DEGRADED");
  });
});

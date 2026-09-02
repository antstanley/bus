import { afterEach, describe, expect, it } from "bun:test";
import { Board, MemoryStore, ulid, type Store } from "@board/core";
import { heartbeat, MAX_WHO_LIMIT, who } from "@board/presence";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CliError,
  createStore,
  deliverOpenCodeMentions,
  openCodeSessionRegistryPath,
  parseStoreSpec,
  runCli,
  sanitizeSecrets,
} from "../src/index.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function writeLocalOpenCodeSession(registryDir: string, sessionId: string, serverUrl: string): Promise<void> {
  await mkdir(registryDir, { recursive: true, mode: 0o700 });
  await writeFile(openCodeSessionRegistryPath(registryDir, sessionId), JSON.stringify({
    v: 1,
    sessionId,
    serverUrl,
    ts: new Date().toISOString(),
  }) + "\n", { mode: 0o600 });
}

describe("board CLI", () => {
  it("parses all documented store forms", () => {
    expect(parseStoreSpec("fs:./data")).toEqual({ kind: "fs", dir: "./data" });
    expect(parseStoreSpec("git:./repo,remote=file:///tmp/remote.git")).toEqual({
      kind: "git", dir: "./repo", remote: "file:///tmp/remote.git",
    });
    expect(parseStoreSpec("git:./repo,branch=messages,remote=file:///tmp/remote.git")).toEqual({
      kind: "git", dir: "./repo", remote: "file:///tmp/remote.git", branch: "messages",
    });
    expect(parseStoreSpec("s3://messages/team/one")).toEqual({ kind: "s3", bucket: "messages", prefix: "team/one" });
    expect(() => parseStoreSpec("http://wrong")).toThrow(CliError);
    expect(() => parseStoreSpec("git:./repo,depth=1")).toThrow("unknown Git store option");
    expect(() => parseStoreSpec("git:./repo,branch=a,branch=b")).toThrow("duplicate Git store option");
  });

  it("initializes, posts, replies, and reads through the command API", async () => {
    const store = new MemoryStore();
    const lines: string[] = [];
    const deps = { createStore: (_spec: unknown): Store => store, stdout: (line: string) => lines.push(line) };
    const common = ["--store", "fs:ignored", "--board", "team", "--as", "codex"];

    await runCli(["init", ...common, "--title", "Team board"], deps);
    await runCli(["post", ...common, "--title", "Hello", "--mentions", "letta", "body", "text"], deps);
    const root = JSON.parse(lines.at(-1)!) as { id: string };
    await runCli(["reply", root.id, ...common, "--body", "reply text"], deps);
    await runCli(["read", ...common], deps);

    const page = JSON.parse(lines.at(-1)!) as { posts: Array<{ body: string; replyTo?: string }> };
    expect(page.posts.map((post) => post.body)).toEqual(["body text", "reply text"]);
    expect(page.posts[1]?.replyTo).toBe(root.id);
  });

  it("prints derived presence for who", async () => {
    const store = new MemoryStore();
    await heartbeat(store, {
      name: "claude",
      instance: ulid(),
      status: "working",
      runtime: "claude",
      sessionId: "session-123",
      socket: "/tmp/cc-socks/claude.sock",
      cmuxSurface: "surface-2",
    });
    const lines: string[] = [];
    await runCli(["who", "--json", "--store", "fs:ignored"], {
      createStore: () => store,
      stdout: (line) => lines.push(line),
    });
    const presence = JSON.parse(lines[0]!) as Array<{ name: string; online: boolean }>;
    expect(presence).toEqual([expect.objectContaining({
      name: "claude",
      online: true,
      runtime: "claude",
      sessionId: "session-123",
      socket: "/tmp/cc-socks/claude.sock",
      cmuxSurface: "surface-2",
    })]);
  });

  it("streams new posts through watch until aborted", async () => {
    const store = new MemoryStore();
    const controller = new AbortController();
    const lines: string[] = [];
    const watching = runCli([
      "watch", "--store", "fs:ignored", "--board", "general", "--as", "codex", "--interval", "1",
    ], {
      createStore: () => store,
      signal: controller.signal,
      stdout: (line) => { lines.push(line); controller.abort(); },
    });
    await Bun.sleep(5);
    await new Board(store, { board: "general", author: "claude" }).post({ body: "live" });
    await watching;
    expect((JSON.parse(lines[0]!) as { body: string }).body).toBe("live");
    expect(JSON.parse(lines.at(-1)!)).toEqual({ cursor: expect.stringContaining("boards/general/posts/") });
    expect(await who(store, { maxAgeMs: 60_000 })).toEqual([
      expect.objectContaining({ name: "codex", status: "watching", tool: "cli" }),
    ]);
  });

  it("watch --deliver wakes only loopback OpenCode sessions with optional basic auth", async () => {
    const store = new MemoryStore();
    const root = await mkdtemp(join(tmpdir(), "board-cli-sessions-"));
    roots.push(root);
    const registryDir = join(root, "opencode");
    const now = Date.now();
    await writeLocalOpenCodeSession(registryDir, "session/123", "http://127.0.0.1:4096/");
    await writeLocalOpenCodeSession(registryDir, "external", "https://example.test/");
    await writeLocalOpenCodeSession(registryDir, "future", "http://127.0.0.1:4099/");
    for (let index = 0; index < 205; index++) {
      await heartbeat(store, { name: "aaa", instance: ulid(), status: "idle", now: () => now });
    }
    await heartbeat(store, {
      name: "opencode",
      instance: ulid(),
      status: "idle",
      runtime: "opencode",
      sessionId: "session/123",
      serverUrl: "http://127.0.0.1:6553/",
      now: () => now,
    });
    await heartbeat(store, {
      name: "opencode",
      instance: ulid(),
      status: "idle",
      runtime: "opencode",
      sessionId: "external",
      serverUrl: "https://example.test/",
      now: () => now,
    });
    await heartbeat(store, {
      name: "opencode",
      instance: ulid(),
      status: "idle",
      runtime: "opencode",
      sessionId: "foreign-loopback",
      serverUrl: "http://127.0.0.1:4098/",
      now: () => now,
    });
    await heartbeat(store, {
      name: "opencode",
      instance: ulid(),
      status: "idle",
      runtime: "opencode",
      sessionId: "stale",
      serverUrl: "http://127.0.0.1:4097/",
      now: () => 0,
    });
    await heartbeat(store, {
      name: "opencode",
      instance: ulid(),
      status: "idle",
      runtime: "opencode",
      sessionId: "future",
      serverUrl: "http://127.0.0.1:4099/",
      now: () => now + 300_001,
    });
    const controller = new AbortController();
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const watching = runCli([
      "watch", "--store", "fs:ignored", "--board", "general", "--as", "codex",
      "--interval", "1", "--deliver",
    ], {
      createStore: () => store,
      signal: controller.signal,
      stdout: () => {},
      env: { OPENCODE_SERVER_USERNAME: "board-user", OPENCODE_SERVER_PASSWORD: "board-pass" },
      sessionRegistryDir: registryDir,
      now: () => now,
      fetch: async (input, init = {}) => {
        requests.push({ url: String(input), init });
        controller.abort();
        return new Response(null, { status: 204 });
      },
    });
    await Bun.sleep(5);
    const post = await new Board(store, { board: "general", author: "claude" }).post({
      body: "wake target",
      mentions: ["opencode"],
    });
    await watching;

    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toBe("http://127.0.0.1:4096/session/session%2F123/prompt_async");
    expect((requests[0]!.init.headers as Record<string, string>).authorization).toBe(
      `Basic ${Buffer.from("board-user:board-pass").toString("base64")}`,
    );
    expect(JSON.parse(String(requests[0]!.init.body))).toEqual({
      parts: [{ type: "text", text: `A new board post mentions opencode (post ${post.id}). Run board read.` }],
    });
  });

  it("warns when the bounded wake presence scan is truncated", async () => {
    const store = new MemoryStore();
    const now = Date.now();
    for (let index = 0; index <= MAX_WHO_LIMIT; index++) {
      await heartbeat(store, { name: "aaa", instance: ulid(), status: "idle", now: () => now });
    }
    const post = await new Board(store, { board: "general", author: "claude" }).post({
      body: "wake target outside the bounded scan",
      mentions: ["opencode"],
    });
    const warnings: string[] = [];
    await deliverOpenCodeMentions(post, store, {
      now: () => now,
      stderr: (line) => warnings.push(line),
    });
    expect(warnings).toEqual([
      `warning: presence scan stopped after ${MAX_WHO_LIMIT} records; some mentioned sessions may not be woken`,
    ]);
  });

  it("reads stdin bodies and honours option termination and attached values", async () => {
    const store = new MemoryStore();
    const lines: string[] = [];
    const common = ["--store", "fs:ignored", "--as", "codex"];
    const deps = { createStore: () => store, stdout: (line: string) => lines.push(line), stdin: async () => "from stdin" };
    const noStdin = { createStore: deps.createStore, stdout: deps.stdout };
    await runCli(["post", ...common, "--body", "-"], deps);
    await runCli(["post", ...common], deps);
    await runCli(["post", ...common, "--", "---", "horizontal rule"], noStdin);
    await runCli(["post", ...common, "--body=--- attached"], noStdin);
    expect(lines.map((line) => (JSON.parse(line) as { body: string }).body)).toEqual([
      "from stdin", "from stdin", "--- horizontal rule", "--- attached",
    ]);
  });

  it("paginates with --limit/--after and emits an explicit null cursor", async () => {
    const store = new MemoryStore();
    const board = new Board(store, { board: "general", author: "claude" });
    await board.post({ body: "one" });
    await board.post({ body: "two" });
    const lines: string[] = [];
    const deps = { createStore: () => store, stdout: (line: string) => lines.push(line) };
    await runCli(["read", "--store", "fs:ignored", "--limit", "1"], deps);
    const first = JSON.parse(lines.at(-1)!) as { posts: Array<{ body: string }>; cursor: string; truncated: boolean };
    expect(first.posts.map((post) => post.body)).toEqual(["one"]);
    expect(first.truncated).toBe(true);
    await runCli(["read", "--store", "fs:ignored", "--limit", "1", "--after", first.cursor], deps);
    expect((JSON.parse(lines.at(-1)!) as { posts: Array<{ body: string }> }).posts[0]?.body).toBe("two");

    const emptyLines: string[] = [];
    await runCli(["read", "--store", "fs:empty"], {
      createStore: () => new MemoryStore(), stdout: (line) => emptyLines.push(line),
    });
    expect(JSON.parse(emptyLines[0]!)).toMatchObject({ posts: [], cursor: null, truncated: false });
  });

  it("supports top-level/per-command help and --json without requiring a store for help", async () => {
    const lines: string[] = [];
    await runCli(["--help"], { stdout: (line) => lines.push(line) });
    await runCli(["post", "--help"], { stdout: (line) => lines.push(line) });
    await runCli(["who", "-h"], { stdout: (line) => lines.push(line) });
    expect(lines[0]).toContain("Commands:");
    expect(lines[1]).toContain("post");
    expect(lines[2]).toContain("who");
    await runCli(["read", "--store", "fs:ignored", "--json"], {
      createStore: () => new MemoryStore(), stdout: (line) => lines.push(line),
    });
    expect(JSON.parse(lines.at(-1)!)).toMatchObject({ cursor: null });
  });

  it("reports --body - without an available stdin reader as a usage error", async () => {
    await expect(runCli(["post", "--store", "fs:ignored", "--body", "-"], {
      createStore: () => new MemoryStore(),
    })).rejects.toThrow("--body - requires piped stdin");
  });

  it("returns a lower-bound cursor for an empty watch so between-run posts resume", async () => {
    const store = new MemoryStore();
    const stopped = new AbortController();
    stopped.abort();
    const first: string[] = [];
    await runCli(["watch", "--store", "fs:ignored", "--as", "codex", "--interval", "1"], {
      createStore: () => store, signal: stopped.signal, stdout: (line) => first.push(line),
    });
    const cursor = (JSON.parse(first.at(-1)!) as { cursor: string }).cursor;
    expect(cursor).toBe("boards/general/posts/");
    await new Board(store, { board: "general", author: "claude" }).post({ body: "between runs" });

    const resumed = new AbortController();
    const lines: string[] = [];
    await runCli([
      "watch", "--store", "fs:ignored", "--as", "codex", "--after", cursor, "--interval", "1",
    ], {
      createStore: () => store,
      signal: resumed.signal,
      stdout: (line) => { lines.push(line); if (line.includes("between runs")) resumed.abort(); },
    });
    expect((JSON.parse(lines[0]!) as { body: string }).body).toBe("between runs");
  });

  it("redacts URL userinfo from errors", () => {
    expect(sanitizeSecrets("failed https://alice:secret@example.test/repo")).toBe("failed https://example.test/repo");
  });

  it("constructs the landed S3 backend for an s3 store spec", async () => {
    const store = await createStore(parseStoreSpec("s3://example-bucket/cli-test"));
    expect(store.constructor.name).toBe("S3Store");
  });

  it("runs end-to-end against an fs store from the executable", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-cli-"));
    roots.push(root);
    const proc = Bun.spawn([
      "bun", "packages/cli/src/index.ts", "post",
      "--store", `fs:${root}`, "--board", "general", "--as", "codex", "--body", "hello",
    ], { cwd: join(import.meta.dir, "../../.."), stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited,
    ]);
    expect(code, stderr).toBe(0);
    expect((JSON.parse(stdout) as { body: string }).body).toBe("hello");
  });

  it("runs end-to-end against a managed git store from the executable", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-cli-git-"));
    roots.push(root);
    const cwd = join(import.meta.dir, "../../..");
    const post = await command([
      "bun", "packages/cli/src/index.ts", "post",
      "--store", `git:${root}`, "--board", "general", "--as", "codex", "--body", "git hello",
    ], cwd);
    expect(post.code, post.stderr).toBe(0);
    const read = await command([
      "bun", "packages/cli/src/index.ts", "read",
      "--store", `git:${root}`, "--board", "general", "--as", "codex",
    ], cwd);
    expect(read.code, read.stderr).toBe(0);
    const page = JSON.parse(read.stdout) as { posts: Array<{ body: string }> };
    expect(page.posts.map((item) => item.body)).toEqual(["git hello"]);
  });

  it("uses stable executable exit codes and fails when Git replication is unhealthy", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-cli-exits-"));
    roots.push(root);
    const cwd = join(import.meta.dir, "../../..");
    expect((await command(["bun", "packages/cli/src/index.ts", "--help"], cwd)).code).toBe(0);
    const usage = await command(["bun", "packages/cli/src/index.ts", "post", "--wat"], cwd);
    expect(usage.code).toBe(2);
    const offline = await command([
      "bun", "packages/cli/src/index.ts", "post", "--store",
      `git:${join(root, "replica")},remote=file://${join(root, "missing.git")}`,
      "--as", "codex", "--body", "local survives",
    ], cwd);
    expect(offline.code).toBe(3);
    expect((JSON.parse(offline.stdout) as { body: string }).body).toBe("local survives");
    expect(offline.stderr).toContain("replication failed");
  });

  it("handles SIGINT during watch and emits a resumable shutdown cursor", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-cli-signal-"));
    roots.push(root);
    const cwd = join(import.meta.dir, "../../..");
    const proc = Bun.spawn([
      "bun", "packages/cli/src/index.ts", "watch", "--store", `fs:${root}`,
      "--board", "general", "--as", "codex", "--interval", "5",
    ], { cwd, stdout: "pipe", stderr: "pipe" });
    const store = new (await import("@board/store-fs")).FsStore(root);
    try {
      for (let i = 0; i < 100; i++) {
        if ((await store.list("agents/codex/presence/")).keys.length > 0) break;
        await Bun.sleep(5);
      }
      expect((await store.list("agents/codex/presence/")).keys.length).toBe(1);
      proc.kill("SIGINT");
      const [stdout, stderr, code] = await Promise.all([
        new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited,
      ]);
      expect(code, stderr).toBe(0);
      expect(JSON.parse(stdout.trim())).toEqual({ cursor: "boards/general/posts/" });
    } finally {
      if (proc.exitCode === null) proc.kill("SIGKILL");
    }
  });
});

async function command(argv: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(argv, { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited,
  ]);
  return { code, stdout, stderr };
}

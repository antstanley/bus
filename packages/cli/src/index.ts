#!/usr/bin/env bun

import { Board, keys, type NewPost, type Post, type Store, type WatchOptions } from "@board/core";
import { FsStore } from "@board/store-fs";
import { GitStore } from "@board/store-git";
import { heartbeat, who as listPresence } from "@board/presence";
import { CliError, installRuntime, renderInstallDiff, type InstallRuntime } from "./install.ts";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";

export type StoreSpec =
  | { kind: "fs"; dir: string }
  | { kind: "git"; dir: string; remote?: string; branch?: string }
  | { kind: "s3"; bucket: string; prefix: string };

export interface CliDependencies {
  createStore?: (spec: StoreSpec) => Promise<Store> | Store;
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
  signal?: AbortSignal;
  stdin?: () => Promise<string>;
  heartbeatIntervalMs?: number;
  installHome?: string;
  projectRoot?: string;
  fetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  env?: Record<string, string | undefined>;
  sessionRegistryDir?: string;
  now?: () => number;
}

export class DegradedReplicationError extends Error {
  override name = "DegradedReplicationError";
}

/** Run one board CLI command. Throws CliError for usage errors. */
export async function runCli(argv: string[], deps: CliDependencies = {}): Promise<void> {
  const output = deps.stdout ?? console.log;
  const parsed = parseArgs(argv);
  if (parsed.command === "help") {
    output(USAGE);
    return;
  }
  if (!COMMANDS.has(parsed.command)) throw new CliError(`unknown command: ${parsed.command}`);
  if (parsed.flags.has("help")) {
    output(commandUsage(parsed.command));
    return;
  }

  if (parsed.command === "install") {
    const runtime = parsed.positionals.shift();
    if (!isInstallRuntime(runtime)) throw new CliError("install requires one of: claude, codex, letta, gemini, cursor, opencode, pi");
    if (parsed.positionals.length) throw new CliError(`unexpected install argument: ${parsed.positionals[0]}`);
    if (parsed.flags.has("project") && runtime !== "pi") throw new CliError("--project is only supported for Pi install");
    const uninstall = parsed.flags.has("uninstall");
    const store = parsed.flags.get("store");
    if (!uninstall && runtime !== "letta" && !store) throw new CliError("install requires --store");
    const result = await installRuntime({
      runtime,
      home: deps.installHome ?? homedir(),
      projectRoot: deps.projectRoot ?? resolve(import.meta.dir, "../../.."),
      ...(store === undefined ? {} : { store }),
      ...(parsed.flags.get("as") === undefined ? {} : { author: parsed.flags.get("as")! }),
      ...(parsed.flags.get("board") === undefined ? {} : { board: parsed.flags.get("board")! }),
      ...(parsed.flags.get("index") === undefined ? {} : { indexPath: parsed.flags.get("index")! }),
      dryRun: parsed.flags.has("dry-run"),
      uninstall,
      projectLocal: parsed.flags.has("project"),
    });
    if (parsed.flags.has("dry-run")) output(result.changes.length ? renderInstallDiff(result.changes) : "no changes");
    else for (const change of result.changes) output(`${uninstall ? "removed" : "installed"} board integration: ${change.path}`);
    for (const notice of result.notices) output(notice);
    return;
  }

  const storeText = parsed.flags.get("store");
  if (!storeText) throw new CliError("missing required --store");
  const spec = parseStoreSpec(storeText);
  const store = await (deps.createStore ?? createStore)(spec);

  if (parsed.command === "who") {
    const maxAgeMs = numberFlag(parsed.flags, "max-age", 120_000, 0);
    output(JSON.stringify(await listPresence(store, { maxAgeMs })));
    return;
  }

  const board = new Board(store, {
    board: parsed.flags.get("board") ?? "general",
    author: parsed.flags.get("as") ?? "anonymous",
  });

  switch (parsed.command) {
    case "init": {
      const title = parsed.flags.get("title");
      const event = await board.emit("create", title === undefined ? undefined : { title });
      output(JSON.stringify(event));
      break;
    }
    case "post": {
      const input = await newPost(parsed, false, stdinReader(deps));
      output(JSON.stringify(await board.post(input)));
      break;
    }
    case "reply": {
      const parent = parsed.positionals.shift();
      if (!parent) throw new CliError("reply requires a parent post id");
      const input = await newPost(parsed, true, stdinReader(deps));
      output(JSON.stringify(await board.reply(parent, input)));
      break;
    }
    case "read": {
      const after = parsed.flags.get("after");
      const limit = numberFlag(parsed.flags, "limit", 100, 1);
      const options = after === undefined ? { limit } : { limit, after };
      // Board calls this option `cursor`; keep the CLI flag named `after` to
      // match Store terminology while returning the next cursor explicitly.
      const result = await board.since(options.after, { limit: options.limit });
      output(JSON.stringify({ ...result, cursor: result.cursor ?? null }));
      break;
    }
    case "watch": {
      const intervalMs = numberFlag(parsed.flags, "interval", 2_000, 1);
      const requestedCursor = parsed.flags.get("after");
      const cursor = requestedCursor ?? await latestCursor(board);
      const watchOptions: WatchOptions = { intervalMs };
      watchOptions.cursor = cursor;
      if (deps.signal !== undefined) watchOptions.signal = deps.signal;
      let finalCursor = cursor;
      const beat = () => heartbeat(store, {
        name: board.author,
        instance: board.instance,
        status: "watching",
        tool: "cli",
      });
      await beat();
      const timer = setInterval(() => { void beat().catch(() => {}); }, deps.heartbeatIntervalMs ?? 30_000);
      timer.unref?.();
      try {
        await board.watch((post) => {
          finalCursor = board.keyFor(post.id);
          output(JSON.stringify(post));
          if (parsed.flags.has("deliver")) return deliverOpenCodeMentions(post, store, deps);
        }, watchOptions);
      } finally {
        clearInterval(timer);
        output(JSON.stringify({ cursor: finalCursor }));
      }
      break;
    }
  }

  if (store instanceof GitStore && store.lastSyncError !== null) {
    throw new DegradedReplicationError(`warning: local command succeeded but Git replication failed: ${sanitizeSecrets(store.lastSyncError.message)}`);
  }
}

export function parseStoreSpec(input: string): StoreSpec {
  if (input.startsWith("fs:")) {
    const dir = input.slice(3);
    if (!dir) throw new CliError("fs store requires a directory: fs:<dir>");
    return { kind: "fs", dir };
  }
  if (input.startsWith("git:")) {
    const value = input.slice(4);
    const [dir = "", ...parts] = value.split(",");
    if (!dir) throw new CliError("git store requires a directory: git:<dir>");
    const options = new Map<string, string>();
    for (const part of parts) {
      const equals = part.indexOf("=");
      if (equals <= 0) throw new CliError(`invalid Git store option: ${sanitizeSecrets(part)}`);
      const name = part.slice(0, equals);
      const value = part.slice(equals + 1);
      if (name !== "remote" && name !== "branch") throw new CliError(`unknown Git store option: ${name}`);
      if (!value) throw new CliError(`git ${name} must not be empty`);
      if (options.has(name)) throw new CliError(`duplicate Git store option: ${name}`);
      options.set(name, value);
    }
    const remote = options.get("remote");
    const branch = options.get("branch");
    return {
      kind: "git",
      dir,
      ...(remote === undefined ? {} : { remote }),
      ...(branch === undefined ? {} : { branch }),
    };
  }
  if (input.startsWith("s3://")) {
    let url: URL;
    try { url = new URL(input); } catch { throw new CliError(`invalid S3 store: ${sanitizeSecrets(input)}`); }
    if (!url.hostname || url.username || url.password || url.port || url.search || url.hash) {
      throw new CliError(`invalid S3 store: ${sanitizeSecrets(input)}`);
    }
    return { kind: "s3", bucket: url.hostname, prefix: url.pathname.replace(/^\/+|\/+$/g, "") };
  }
  throw new CliError(`unsupported store ${JSON.stringify(sanitizeSecrets(input))}; use fs:, git:, or s3://`);
}

export async function createStore(spec: StoreSpec): Promise<Store> {
  switch (spec.kind) {
    case "fs": return new FsStore(spec.dir);
    case "git": return spec.remote === undefined
      ? new GitStore({ dir: spec.dir, branch: spec.branch ?? "main", autoSync: true })
      : new GitStore({ dir: spec.dir, remote: spec.remote, branch: spec.branch ?? "main", autoSync: true });
    case "s3": {
      const module = await import("@board/store-s3") as { S3Store?: new (options: { bucket: string; prefix?: string }) => Store };
      if (!module.S3Store) throw new CliError("@board/store-s3 does not export S3Store");
      return new module.S3Store(spec.prefix ? { bucket: spec.bucket, prefix: spec.prefix } : { bucket: spec.bucket });
    }
  }
}

interface ParsedArgs {
  command: string;
  flags: Map<string, string>;
  positionals: string[];
}

const VALUE_FLAGS = new Set([
  "store", "board", "as", "title", "body", "tags", "mentions",
  "after", "limit", "interval", "max-age", "index",
]);
const BOOLEAN_FLAGS = new Set(["help", "json", "dry-run", "uninstall", "deliver", "project"]);
const COMMANDS = new Set(["init", "post", "reply", "read", "watch", "who", "install"]);

function parseArgs(argv: string[]): ParsedArgs {
  if (argv.length === 0) return { command: "help", flags: new Map(), positionals: [] };
  if (argv[0] === "--help" || argv[0] === "-h") return { command: "help", flags: new Map(), positionals: [] };
  const [command = "help", ...rest] = argv;
  const flags = new Map<string, string>();
  const positionals: string[] = [];
  let options = true;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (options && arg === "--") {
      options = false;
      continue;
    }
    if (options && arg === "-h") {
      flags.set("help", "true");
      continue;
    }
    if (!options || !arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    const equals = arg.indexOf("=");
    const name = arg.slice(2, equals < 0 ? undefined : equals);
    if (BOOLEAN_FLAGS.has(name)) {
      if (equals >= 0) throw new CliError(`--${name} does not take a value`);
      flags.set(name, "true");
      continue;
    }
    if (!VALUE_FLAGS.has(name)) throw new CliError(`unknown option: --${name}`);
    const attached = equals >= 0;
    const value = attached ? arg.slice(equals + 1) : rest[++i];
    if (value === undefined || (!attached && value.startsWith("--"))) throw new CliError(`--${name} requires a value`);
    flags.set(name, value);
  }
  return { command, flags, positionals };
}

async function newPost(parsed: ParsedArgs, reply: boolean, readStdin?: () => Promise<string>): Promise<NewPost> {
  let body = parsed.flags.get("body") ?? parsed.positionals.join(" ");
  if (body === "-") {
    if (readStdin === undefined) throw new CliError("--body - requires piped stdin");
    body = await readStdin();
  } else if (!body && readStdin !== undefined) {
    body = await readStdin();
  }
  if (!body) throw new CliError(`${reply ? "reply" : "post"} requires --body or positional text`);
  const post: NewPost = { body };
  const title = parsed.flags.get("title");
  if (title !== undefined && !reply) post.title = title;
  const tags = csvFlag(parsed.flags, "tags");
  if (tags) post.tags = tags;
  const mentions = csvFlag(parsed.flags, "mentions");
  if (mentions) post.mentions = mentions;
  return post;
}

async function latestCursor(board: Board): Promise<string> {
  let cursor = keys.postsPrefix(board.name);
  for (;;) {
    const page = await board.since(cursor);
    cursor = page.cursor ?? cursor;
    if (!page.truncated) return cursor;
  }
}

function stdinReader(deps: CliDependencies): (() => Promise<string>) | undefined {
  if (deps.stdin !== undefined) return deps.stdin;
  if (import.meta.main && !process.stdin.isTTY) return () => Bun.stdin.text();
  return undefined;
}

function csvFlag(flags: Map<string, string>, name: string): string[] | undefined {
  const value = flags.get(name);
  if (value === undefined) return undefined;
  const items = value.split(",").map((item) => item.trim()).filter(Boolean);
  return items.length ? items : undefined;
}

function numberFlag(flags: Map<string, string>, name: string, fallback: number, minimum: number): number {
  const value = flags.get(name);
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum) throw new CliError(`--${name} must be an integer >= ${minimum}`);
  return number;
}

const USAGE = `board — scalable multi-agent message board

Usage:
  bun packages/cli/src/index.ts <command> --store <spec> [options]

Commands:
  init    [--title TEXT]                         create a board event
  post    [--title TEXT] (--body TEXT | TEXT...) create a root post
  reply   <POST_ID> (--body TEXT | TEXT...)      reply to a post
  read    [--after CURSOR] [--limit N]           read a page as JSON
  watch   [--after CURSOR] [--interval MS]       stream posts as JSON lines
  who     [--max-age MS]                         list agent presence
  install <runtime> --store <spec>               merge runtime hooks/MCP config

Common options:
  --store fs:<dir>
  --store git:<dir>[,remote=<url>][,branch=<name>]
  --store s3://<bucket>/<prefix>
  --board <name>       default: general
  --as <agent>         default: anonymous
  --tags a,b --mentions agent1,agent2
  --deliver             wake reachable mentioned sessions while watching
  --project             install the Pi extension in the current project
  --json                accepted for wrapper compatibility`;

function isInstallRuntime(value: string | undefined): value is InstallRuntime {
  return value === "claude" || value === "codex" || value === "letta" || value === "gemini" || value === "cursor" || value === "opencode" || value === "pi";
}

function commandUsage(command: string): string {
  const line = USAGE.split("\n").find((candidate) => candidate.trimStart().startsWith(`${command} `));
  return `${line?.trim() ?? command}\n\n${USAGE.split("Common options:")[1]?.trim() ?? ""}`;
}

export function sanitizeSecrets(message: string): string {
  return message.replace(/([a-z][a-z0-9+.-]*:\/\/)([^\s/@]+)@/gi, "$1");
}

/** Wake online OpenCode sessions mentioned by a post. Invalid targets are skipped. */
export async function deliverOpenCodeMentions(post: Post, store: Store, deps: CliDependencies = {}): Promise<void> {
  const mentioned = new Set(post.mentions ?? []);
  if (mentioned.size === 0) return;
  const now = (deps.now ?? Date.now)();
  const presence = await listPresence(store, { maxAgeMs: 120_000, now: () => now });
  const request = deps.fetch ?? globalThis.fetch;
  const env = deps.env ?? process.env;
  const registryDir = deps.sessionRegistryDir ?? join(homedir(), ".board", "sessions", "opencode");
  const seen = new Set<string>();
  await Promise.allSettled(presence.map(async (target) => {
    if (!target.online || Date.parse(target.ts) > now + 300_000
      || !mentioned.has(target.name) || target.runtime !== "opencode" || !target.sessionId) return;
    const local = await readLocalOpenCodeSession(registryDir, target.sessionId);
    if (!local) return;
    const endpoint = openCodePromptEndpoint(local.serverUrl, target.sessionId);
    if (!endpoint) return;
    const deliveryKey = `${endpoint.origin}\0${target.sessionId}`;
    if (seen.has(deliveryKey)) return;
    seen.add(deliveryKey);
    const headers: Record<string, string> = { "content-type": "application/json" };
    const password = env.OPENCODE_SERVER_PASSWORD;
    if (password) {
      const username = env.OPENCODE_SERVER_USERNAME || "opencode";
      headers.authorization = `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
    }
    const response = await request(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        parts: [{
          type: "text",
          text: `A new board post mentions ${target.name} (post ${post.id}). Run board read.`,
        }],
      }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`OpenCode wake returned HTTP ${response.status}`);
  }));
}

interface LocalOpenCodeSession {
  v: 1;
  sessionId: string;
  serverUrl: string;
  ts: string;
}

/** Resolve the non-secret local registry path without using a session id as a path segment. */
export function openCodeSessionRegistryPath(registryDir: string, sessionId: string): string {
  const digest = createHash("sha256").update(sessionId, "utf8").digest("hex");
  return join(registryDir, `${digest}.json`);
}

async function readLocalOpenCodeSession(registryDir: string, sessionId: string): Promise<LocalOpenCodeSession | null> {
  let handle;
  try {
    handle = await open(
      openCodeSessionRegistryPath(registryDir, sessionId),
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    const info = await handle.stat();
    if (!info.isFile() || info.size > 4_096 || (info.mode & 0o077) !== 0) return null;
    const parsed: unknown = JSON.parse(await handle.readFile("utf8"));
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Record<string, unknown>;
    if (record.v !== 1 || record.sessionId !== sessionId || typeof record.serverUrl !== "string"
      || typeof record.ts !== "string" || !Number.isFinite(Date.parse(record.ts))) return null;
    return record as unknown as LocalOpenCodeSession;
  } catch {
    return null;
  } finally {
    await handle?.close().catch(() => {});
  }
}

function openCodePromptEndpoint(serverUrl: string, sessionId: string): URL | null {
  let base: URL;
  try { base = new URL(serverUrl); } catch { return null; }
  const hostname = base.hostname.toLowerCase();
  if (base.protocol !== "http:" || base.username || base.password || base.search || base.hash) return null;
  if (hostname !== "localhost" && hostname !== "127.0.0.1" && hostname !== "[::1]" && hostname !== "::1") return null;
  return new URL(`/session/${encodeURIComponent(sessionId)}/prompt_async`, base.origin);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv[0] !== "watch") return runCli(argv);
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try { await runCli(argv, { signal: controller.signal }); }
  finally { process.off("SIGINT", stop); process.off("SIGTERM", stop); }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(sanitizeSecrets(error instanceof Error ? error.message : String(error)));
    process.exitCode = error instanceof CliError ? 2 : error instanceof DegradedReplicationError ? 3 : 1;
  });
}

export type { Post };
export { CliError } from "./install.ts";

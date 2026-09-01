#!/usr/bin/env bun

import { Board, keys, type NewPost, type Post, type Store, type WatchOptions } from "@board/core";
import { FsStore } from "@board/store-fs";
import { GitStore } from "@board/store-git";
import { heartbeat, who as listPresence } from "@board/presence";

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
}

export class CliError extends Error {
  override name = "CliError";
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
  "after", "limit", "interval", "max-age",
]);
const BOOLEAN_FLAGS = new Set(["help", "json"]);
const COMMANDS = new Set(["init", "post", "reply", "read", "watch", "who"]);

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

Common options:
  --store fs:<dir>
  --store git:<dir>[,remote=<url>][,branch=<name>]
  --store s3://<bucket>/<prefix>
  --board <name>       default: general
  --as <agent>         default: anonymous
  --tags a,b --mentions agent1,agent2
  --json                accepted for wrapper compatibility`;

function commandUsage(command: string): string {
  const line = USAGE.split("\n").find((candidate) => candidate.trimStart().startsWith(`${command} `));
  return `${line?.trim() ?? command}\n\n${USAGE.split("Common options:")[1]?.trim() ?? ""}`;
}

export function sanitizeSecrets(message: string): string {
  return message.replace(/([a-z][a-z0-9+.-]*:\/\/)([^\s/@]+)@/gi, "$1");
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

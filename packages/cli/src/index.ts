#!/usr/bin/env bun

import {
  Board,
  assertName,
  assertRuntimeSessionId,
  isRuntimeSessionId,
  isSessionIdRuntime,
  keys,
  STATUSES,
  type NewPost,
  type Post,
  type Status,
  type Store,
  type WatchOptions,
} from "@board/core";
import { BoardIndex } from "@board/index";
import { FsStore } from "@board/store-fs";
import { GitStore } from "@board/store-git";
import { heartbeat, MAX_WHO_LIMIT, who as listPresence, whoPage } from "@board/presence";
import {
  CliError,
  installRuntime,
  PI_COLLISION_SCAN_TRUNCATED_NOTICE,
  PI_COLLISION_SCAN_UNAVAILABLE_NOTICE,
  piCollisionNotice,
  piIdentityForHostname,
  renderInstallDiff,
  type InstallRuntime,
} from "./install.ts";
import { homedir, hostname as systemHostname } from "node:os";
import { join, resolve } from "node:path";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { chmod, lstat, mkdir, open, rename, unlink, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";

export type StoreSpec =
  | { kind: "fs"; dir: string }
  | { kind: "git"; dir: string; remote?: string; branch?: string }
  | { kind: "s3"; bucket: string; prefix: string };

export interface CliDependencies {
  createStore?: (spec: StoreSpec) => Promise<Store> | Store;
  /** Open the local derived index (BoardIndex) at a path; tests inject this. */
  createIndex?: (path: string) => Promise<BoardIndex> | BoardIndex;
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
  claudeSessionRegistryDir?: string;
  deliveryLogDir?: string;
  now?: () => number;
  runCommand?: (command: string, args: string[]) => Promise<number>;
  sendClaudeSocket?: (path: string, token: string, message: string) => Promise<boolean>;
  hostname?: () => string;
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
    if (!uninstall && !store) throw new CliError("install requires --store");
    const explicitAuthor = parsed.flags.get("as");
    const piHostName = runtime === "pi" && !uninstall && explicitAuthor === undefined
      ? (deps.hostname ?? systemHostname)()
      : undefined;
    const derivedPiAuthor = piHostName === undefined ? undefined : piIdentityForHostname(piHostName);
    const result = await installRuntime({
      runtime,
      home: deps.installHome ?? homedir(),
      projectRoot: deps.projectRoot ?? resolve(import.meta.dir, "../../.."),
      ...(store === undefined ? {} : { store }),
      ...(explicitAuthor === undefined ? {} : { author: explicitAuthor }),
      ...(parsed.flags.get("board") === undefined ? {} : { board: parsed.flags.get("board")! }),
      ...(parsed.flags.get("index") === undefined ? {} : { indexPath: parsed.flags.get("index")! }),
      dryRun: parsed.flags.has("dry-run"),
      uninstall,
      projectLocal: parsed.flags.has("project"),
      ...(piHostName === undefined ? {} : { hostName: piHostName }),
    });
    if (derivedPiAuthor !== undefined && store !== undefined) {
      try {
        const presenceStore = await (deps.createStore ?? createStore)(parseStoreSpec(store));
        const page = await whoPage(presenceStore, {
          maxAgeMs: Number.MAX_SAFE_INTEGER,
          limit: MAX_WHO_LIMIT,
        });
        if (page.records.some((record) => record.name === derivedPiAuthor)) {
          result.notices.push(piCollisionNotice(derivedPiAuthor));
        }
        if (page.truncated) result.notices.push(PI_COLLISION_SCAN_TRUNCATED_NOTICE);
      } catch {
        result.notices.push(PI_COLLISION_SCAN_UNAVAILABLE_NOTICE);
      }
    }
    if (parsed.flags.has("dry-run")) output(result.changes.length ? renderInstallDiff(result.changes) : "no changes");
    else for (const change of result.changes) output(`${uninstall ? "removed" : "installed"} board integration: ${change.path}`);
    for (const notice of result.notices) output(notice);
    return;
  }

  // `--state` filters the task listing; a TASK_ID positional prints one
  // task's full history. The two are mutually exclusive: reject the
  // combination here — before any store or index I/O — so a state filter is
  // never silently ignored by a single-task lookup.
  if (parsed.command === "tasks" && parsed.flags.has("state") && parsed.positionals.length > 0) {
    throw new CliError("--state cannot be combined with a TASK_ID positional; pass either --state STATE or TASK_ID, not both");
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
    case "tasks": {
      // Fold A2A task state (task 203): sync the board into the local index,
      // then list tasks or print one task with its full history.
      const state = parsed.flags.get("state");
      if (state !== undefined && !(STATUSES as readonly string[]).includes(state)) {
        throw new CliError(`--state must be one of: ${STATUSES.join(", ")}`);
      }
      const index = await (deps.createIndex ?? (async (path: string) => new BoardIndex(path)))(
        parsed.flags.get("index") ?? join(homedir(), ".board", "index.sqlite"),
      );
      try {
        await index.sync(board);
        const id = parsed.positionals[0];
        if (id !== undefined) {
          // A single-task lookup honors --board like the listing path: a
          // same-id task fold on another board must not shadow this board's.
          // Without --board the lookup fails closed to the synced board
          // rather than letting a foreign fold's last activity decide.
          const task = index.task(id, { board: parsed.flags.get("board") ?? board.name });
          if (!task) {
            output(`no such task: ${id}`);
            break;
          }
          if (parsed.flags.has("json")) {
            output(JSON.stringify(task));
            break;
          }
          output(`${task.rootId}  ${task.board}  ${task.state}${task.title === null ? "" : `  ${task.title}`}`);
          for (const t of task.history) {
            output(`  ${t.ts}  ${t.valid ? t.state : `rejected ${t.state} (state stays ${t.from ?? "unset"})`}  ${t.postId}`);
          }
        } else {
          const tasks = index.tasks({
            ...(state === undefined ? {} : { state: state as Status }),
            ...(parsed.flags.get("board") === undefined ? {} : { board: parsed.flags.get("board")! }),
          });
          if (parsed.flags.has("json")) {
            output(JSON.stringify(tasks));
            break;
          }
          if (tasks.length === 0) {
            output("no tasks");
            break;
          }
          const header = ["TASK ID", "BOARD", "STATE", "LAST ACTIVITY"];
          const cells = tasks.map((t) => [t.rootId, t.board, t.state, t.lastActivity]);
          const widths = header.map((h, i) => Math.max(h.length, ...cells.map((row) => row[i]!.length)));
          output([header, ...cells]
            .map((row) => row.map((cell, i) => cell.padEnd(widths[i]!)).join("  ").trimEnd())
            .join("\n"));
        }
      } finally {
        index.close();
      }
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
      const watchTarget = parsed.flags.has("deliver") ? await resolveWatchTarget(parsed, deps) : null;
      const beat = () => heartbeat(store, {
        name: board.author,
        instance: board.instance,
        status: "watching",
        tool: "cli",
        ...watchTarget,
      });
      await beat();
      const timer = setInterval(() => { void beat().catch(() => {}); }, deps.heartbeatIntervalMs ?? 30_000);
      timer.unref?.();
      try {
        await board.watch((post) => {
          finalCursor = board.keyFor(post.id);
          output(JSON.stringify(post));
          if (parsed.flags.has("deliver")) return deliverMentionedSessions(post, store, deps);
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
  "after", "limit", "interval", "max-age", "index", "runtime", "session", "state",
]);
const BOOLEAN_FLAGS = new Set(["help", "json", "dry-run", "uninstall", "deliver", "project"]);
const COMMANDS = new Set(["init", "post", "reply", "read", "tasks", "watch", "who", "install"]);

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

async function resolveWatchTarget(
  parsed: ParsedArgs,
  deps: CliDependencies,
): Promise<{ runtime: string; sessionId: string; socket?: string; cmuxSurface?: string } | null> {
  const env = deps.env ?? process.env;
  const requestedRuntime = parsed.flags.get("runtime");
  if (requestedRuntime && !["claude", "codex", "letta"].includes(requestedRuntime)) {
    throw new CliError("--runtime for watch must be claude, codex, or letta");
  }
  const runtime = requestedRuntime
    ?? (env.CLAUDE_CODE_MESSAGING_SOCKET ? "claude"
      : env.CODEX_THREAD_ID || env.CODEX_SESSION_ID ? "codex"
        : env.LETTA_AGENT_ID || env.CONVERSATION_ID ? "letta" : undefined);
  const sessionId = parsed.flags.get("session")
    ?? (runtime === "codex" ? env.CODEX_THREAD_ID ?? env.CODEX_SESSION_ID
      : runtime === "letta" ? env.CONVERSATION_ID ?? env.LETTA_CONVERSATION_ID
        : undefined);
  if (!sessionId) {
    if (parsed.flags.has("session") || requestedRuntime) throw new CliError("watch session identity requires --session <id>");
    return null;
  }
  if (!runtime) throw new CliError("--session requires --runtime when the runtime cannot be inferred");
  if (!isSessionIdRuntime(runtime)) throw new CliError("--session requires a supported runtime");
  try {
    assertRuntimeSessionId(runtime, sessionId);
  } catch (error) {
    throw new CliError(error instanceof Error ? error.message : "invalid session id");
  }
  const socket = runtime === "claude" ? env.CLAUDE_CODE_MESSAGING_SOCKET : undefined;
  const cmuxSurface = env.CMUX_SURFACE_ID;
  if (runtime === "claude" && socket && env.CLAUDE_CODE_MESSAGING_TOKEN) {
    const registryDir = deps.claudeSessionRegistryDir ?? join(homedir(), ".board", "sessions", "claude");
    await writeLocalClaudeSession(registryDir, sessionId, socket);
  }
  return {
    runtime,
    sessionId,
    ...(socket ? { socket } : {}),
    ...(cmuxSurface ? { cmuxSurface } : {}),
  };
}

const USAGE = `board — scalable multi-agent message board

Usage:
  bun packages/cli/src/index.ts <command> --store <spec> [options]

Commands:
  init    [--title TEXT]                         create a board event
  post    [--title TEXT] (--body TEXT | TEXT...) create a root post
  reply   <POST_ID> (--body TEXT | TEXT...)      reply to a post
  read    [--after CURSOR] [--limit N]           read a page as JSON
  tasks   [--state STATE | TASK_ID]              fold A2A task state into the local index (--index <path>)
  watch   [--after CURSOR] [--interval MS]       stream posts as JSON lines
  who     [--max-age MS]                         list agent presence
  install <runtime> --store <spec>               merge runtime hooks/MCP config (Pi defaults to pi-<host>)

Common options:
  --store fs:<dir>
  --store git:<dir>[,remote=<url>][,branch=<name>]
  --store s3://<bucket>/<prefix>
  --board <name>       default: general
  --as <agent>         default: anonymous
  --tags a,b --mentions agent1,agent2
  --deliver             wake reachable mentioned sessions while watching
  --runtime <name>      runtime hosting this watcher session
  --session <id>        runtime session id published by this watcher
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

/** Wake each reachable idle session mentioned by a post. Invalid targets are skipped. */
export async function deliverMentionedSessions(post: Post, store: Store, deps: CliDependencies = {}): Promise<void> {
  const mentioned = new Set((post.mentions ?? []).map((name) => assertName(name, "mention")));
  if (mentioned.size === 0) return;
  const now = (deps.now ?? Date.now)();
  const page = await whoPage(store, { maxAgeMs: 120_000, limit: MAX_WHO_LIMIT, now: () => now });
  const presence = page.records;
  if (page.truncated) {
    (deps.stderr ?? console.error)(
      `warning: presence scan stopped after ${MAX_WHO_LIMIT} records; some mentioned sessions may not be woken`,
    );
  }
  const env = deps.env ?? process.env;
  const registryDir = deps.sessionRegistryDir ?? join(homedir(), ".board", "sessions", "opencode");
  const claudeRegistryDir = deps.claudeSessionRegistryDir ?? join(homedir(), ".board", "sessions", "claude");
  const logDir = deps.deliveryLogDir ?? join(homedir(), ".board", "deliveries");
  const reportLine = deps.stderr ?? console.error;
  const report = (line: string) => reportLine(`${new Date((deps.now ?? Date.now)()).toISOString()} ${line}`);
  const seen = new Set<string>();
  const matched = new Set<string>();
  const outcomes = await Promise.allSettled(presence.map(async (target) => {
    const targetName = assertName(target.name, "agent");
    if (!mentioned.has(targetName)) return;
    matched.add(targetName);
    if (!target.online || Date.parse(target.ts) > now + 300_000) {
      report(`delivery: skipped ${targetName}: presence is offline`);
      return;
    }
    if (target.status !== "idle") {
      report(`delivery: skipped ${targetName}: session is not idle`);
      return;
    }
    const deliveryKey = targetDeliveryKey(target);
    if (!deliveryKey) {
      report(`delivery: skipped ${targetName}: no supported local route`);
      return;
    }
    const label = deliveryLabel(target, deliveryKey);
    const method = deliveryMethod(target.runtime, target.cmuxSurface);
    if (!await isLocallyReachableTarget(target, registryDir, claudeRegistryDir, env)) {
      report(`delivery: skipped ${label}: local route is unavailable`);
      return;
    }
    if (seen.has(deliveryKey)) {
      report(`delivery: skipped ${label}: duplicate presence`);
      return;
    }
    seen.add(deliveryKey);
    const claim = await claimDelivery(logDir, post, targetName, deliveryKey, now);
    if (!claim) {
      report(`delivery: skipped ${label}: post was already attempted`);
      return;
    }
    const message = `A new board post mentions ${targetName} (post ${post.id}). Run board read.`;
    let delivered = false;
    try {
      delivered = await deliverTarget(target, message, registryDir, env, deps);
    } catch {
      delivered = false;
    }
    await finishDelivery(claim, delivered ? "delivered" : "failed", method, (deps.now ?? Date.now)());
    report(delivered
      ? `delivery: delivered to ${label} via ${method}`
      : `delivery: failed for ${label} via ${method}; watcher continuing`);
  }));
  for (const outcome of outcomes) {
    if (outcome.status === "rejected") {
      report("delivery: bookkeeping failed; watcher continuing");
    }
  }
  for (const name of mentioned) {
    if (!matched.has(name)) report(`delivery: skipped ${name}: no presence record`);
  }
}

/** Compatibility name retained for callers introduced with the OpenCode adapter. */
export const deliverOpenCodeMentions = deliverMentionedSessions;

interface DeliveryPresence {
  name: string;
  instance: string;
  runtime?: string;
  sessionId?: string;
  socket?: string;
  cmuxSurface?: string;
}

function targetDeliveryKey(target: DeliveryPresence): string | null {
  if (target.runtime === "opencode" && isRuntimeSessionId("opencode", target.sessionId)) {
    return `opencode\0${target.sessionId}`;
  }
  if (target.runtime === "codex" && isRuntimeSessionId("codex", target.sessionId)) return `codex\0${target.sessionId}`;
  if (target.runtime === "claude" && isRuntimeSessionId("claude", target.sessionId) && target.socket) {
    return `claude\0${target.sessionId}`;
  }
  if (target.runtime === "letta"
    && (target.sessionId === undefined || isRuntimeSessionId("letta", target.sessionId))
    && isUuid(target.cmuxSurface)) return `letta\0${target.cmuxSurface}`;
  if (!target.runtime && isUuid(target.cmuxSurface)) return `human\0${target.cmuxSurface}`;
  return null;
}

function deliveryLabel(target: DeliveryPresence, key: string): string {
  if (target.runtime === "codex" && isRuntimeSessionId("codex", target.sessionId)
    || target.runtime === "claude" && isRuntimeSessionId("claude", target.sessionId)) {
    return `${target.runtime}/${target.sessionId}`;
  }
  if ((target.runtime === "letta" || !target.runtime) && isUuid(target.cmuxSurface)) {
    return `${target.runtime ?? "human"}/${target.cmuxSurface}`;
  }
  return `${target.runtime ?? "unknown"}/${createHash("sha256").update(key).digest("hex").slice(0, 12)}`;
}

function deliveryMethod(runtime: string | undefined, cmuxSurface: string | undefined): string {
  if (runtime === "opencode") return "opencode";
  if (runtime === "codex") return "codex-queue";
  if (runtime === "claude") return "claude-socket";
  if (runtime === "letta" && cmuxSurface) return "cmux-send";
  return "cmux-notify";
}

async function isLocallyReachableTarget(
  target: DeliveryPresence,
  registryDir: string,
  claudeRegistryDir: string,
  env: Record<string, string | undefined>,
): Promise<boolean> {
  if (target.runtime === "opencode" && isRuntimeSessionId("opencode", target.sessionId)) {
    const local = await readLocalOpenCodeSession(registryDir, target.sessionId);
    return local !== null && openCodePromptEndpoint(local.serverUrl, target.sessionId) !== null;
  }
  if (target.runtime === "claude" && isRuntimeSessionId("claude", target.sessionId) && target.socket) {
    const local = await readLocalClaudeSession(claudeRegistryDir, target.sessionId);
    return Boolean(local && local.socket === target.socket
      && env.CLAUDE_CODE_MESSAGING_TOKEN
      && env.CLAUDE_CODE_MESSAGING_SOCKET === local.socket);
  }
  return true;
}

async function deliverTarget(
  target: DeliveryPresence,
  message: string,
  registryDir: string,
  env: Record<string, string | undefined>,
  deps: CliDependencies,
): Promise<boolean> {
  if (target.runtime === "opencode" && isRuntimeSessionId("opencode", target.sessionId)) {
    const local = await readLocalOpenCodeSession(registryDir, target.sessionId);
    if (!local) return false;
    const endpoint = openCodePromptEndpoint(local.serverUrl, target.sessionId);
    if (!endpoint) return false;
    const headers: Record<string, string> = { "content-type": "application/json" };
    const password = env.OPENCODE_SERVER_PASSWORD;
    if (password) {
      const username = env.OPENCODE_SERVER_USERNAME || "opencode";
      headers.authorization = `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
    }
    const response = await (deps.fetch ?? globalThis.fetch)(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ parts: [{ type: "text", text: message }] }),
      signal: AbortSignal.timeout(5_000),
    });
    return response.ok;
  }
  if (target.runtime === "codex" && isRuntimeSessionId("codex", target.sessionId)) {
    return await runWakeCommand(deps, "codex", ["queue", "--thread", target.sessionId, "--message", message]);
  }
  if (target.runtime === "claude" && target.socket && isRuntimeSessionId("claude", target.sessionId)) {
    const token = env.CLAUDE_CODE_MESSAGING_TOKEN;
    if (!token || env.CLAUDE_CODE_MESSAGING_SOCKET !== target.socket) return false;
    return (deps.sendClaudeSocket ?? sendClaudeSocket)(target.socket, token, message);
  }
  if (target.runtime === "letta" && isUuid(target.cmuxSurface)) {
    return await runWakeCommand(deps, "cmux", ["send", "--surface", target.cmuxSurface, `${message}\\n`]);
  }
  if (!target.runtime && isUuid(target.cmuxSurface)) {
    return await runWakeCommand(deps, "cmux", [
      "notify", "--title", "Board mention", "--body", message, "--surface", target.cmuxSurface,
    ]);
  }
  return false;
}

async function runWakeCommand(deps: CliDependencies, command: string, args: string[]): Promise<boolean> {
  if (deps.runCommand) return (await deps.runCommand(command, args)) === 0;
  let process: ReturnType<typeof Bun.spawn> | undefined;
  const timeout = setTimeout(() => process?.kill(), 5_000);
  timeout.unref?.();
  try {
    process = Bun.spawn([command, ...args], { stdout: "ignore", stderr: "ignore" });
    return await process.exited === 0;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function sendClaudeSocket(path: string, token: string, message: string): Promise<boolean> {
  return new Promise((resolveResult) => {
    let settled = false;
    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket.destroy();
      resolveResult(result);
    };
    const socket = createConnection({ path });
    const timeout = setTimeout(() => finish(false), 5_000);
    timeout.unref?.();
    socket.once("error", () => finish(false));
    socket.once("connect", () => {
      socket.end(encodeClaudeWakeFrames(token, message), () => finish(true));
    });
  });
}

export function encodeClaudeWakeFrames(token: string, message: string): string {
  return [
    { type: "auth", token },
    { type: "user", message: { role: "user", content: message } },
  ].map((frame) => JSON.stringify(frame)).join("\n") + "\n";
}

interface DeliveryClaim {
  path: string;
  record: Record<string, unknown>;
}

async function claimDelivery(
  logDir: string,
  post: Post,
  agent: string,
  target: string,
  now: number,
): Promise<DeliveryClaim | null> {
  await mkdir(logDir, { recursive: true, mode: 0o700 });
  const directory = await lstat(logDir);
  if (!directory.isDirectory() || directory.isSymbolicLink() || (directory.mode & 0o077) !== 0) {
    throw new Error("delivery log directory must be a private real directory");
  }
  if (typeof process.getuid === "function" && directory.uid !== process.getuid()) {
    throw new Error("delivery log directory is not owned by the current user");
  }
  const digest = createHash("sha256").update(`${post.board}\0${post.id}\0${target}`, "utf8").digest("hex");
  const path = join(logDir, `${digest}.json`);
  const record = {
    v: 1,
    board: post.board,
    postId: post.id,
    agent,
    targetHash: createHash("sha256").update(target, "utf8").digest("hex"),
    status: "attempting",
    ts: new Date(now).toISOString(),
  };
  let handle;
  let created = false;
  let failure: unknown;
  try {
    handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    created = true;
    await handle.writeFile(JSON.stringify(record) + "\n");
    await handle.chmod(0o600);
  } catch (error) {
    failure = error;
  } finally {
    await handle?.close().catch(() => {});
  }
  if (failure !== undefined) {
    if (created) await unlink(path).catch(() => {});
    if (hasErrorCode(failure, "EEXIST")) return null;
    throw failure;
  }
  return { path, record };
}

async function finishDelivery(claim: DeliveryClaim, status: "delivered" | "failed", method: string, now: number): Promise<void> {
  const temp = `${claim.path}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    await writeFile(temp, JSON.stringify({
      ...claim.record,
      status,
      method,
      completedAt: new Date(now).toISOString(),
    }) + "\n", { encoding: "utf8", mode: 0o600, flag: "wx" });
    await chmod(temp, 0o600);
    await rename(temp, claim.path);
  } finally {
    try { await unlink(temp); } catch (error) {
      if (!hasErrorCode(error, "ENOENT")) throw error;
    }
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function isUuid(value: string | undefined): value is string {
  return value !== undefined
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

interface LocalOpenCodeSession {
  v: 1;
  sessionId: string;
  serverUrl: string;
  ts: string;
}

interface LocalClaudeSession {
  v: 1;
  sessionId: string;
  socket: string;
  ts: string;
}

/** Resolve the non-secret local registry path without using a session id as a path segment. */
export function openCodeSessionRegistryPath(registryDir: string, sessionId: string): string {
  const digest = createHash("sha256").update(sessionId, "utf8").digest("hex");
  return join(registryDir, `${digest}.json`);
}

export function claudeSessionRegistryPath(registryDir: string, sessionId: string): string {
  const digest = createHash("sha256").update(sessionId, "utf8").digest("hex");
  return join(registryDir, `${digest}.json`);
}

async function writeLocalClaudeSession(registryDir: string, sessionId: string, socket: string): Promise<void> {
  await mkdir(registryDir, { recursive: true, mode: 0o700 });
  const directory = await lstat(registryDir);
  if (!directory.isDirectory() || directory.isSymbolicLink() || (directory.mode & 0o077) !== 0) {
    throw new Error("Claude session registry must be a private real directory");
  }
  if (typeof process.getuid === "function" && directory.uid !== process.getuid()) {
    throw new Error("Claude session registry is not owned by the current user");
  }
  const target = claudeSessionRegistryPath(registryDir, sessionId);
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    await writeFile(temp, JSON.stringify({ v: 1, sessionId, socket, ts: new Date().toISOString() }) + "\n", {
      encoding: "utf8", mode: 0o600, flag: "wx",
    });
    await chmod(temp, 0o600);
    await rename(temp, target);
  } finally {
    try { await unlink(temp); } catch (error) {
      if (!hasErrorCode(error, "ENOENT")) throw error;
    }
  }
}

async function readLocalClaudeSession(registryDir: string, sessionId: string): Promise<LocalClaudeSession | null> {
  let handle;
  try {
    handle = await open(
      claudeSessionRegistryPath(registryDir, sessionId),
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    const info = await handle.stat();
    if (!info.isFile() || info.size > 4_096 || (info.mode & 0o077) !== 0) return null;
    const parsed: unknown = JSON.parse(await handle.readFile("utf8"));
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Record<string, unknown>;
    if (record.v !== 1 || record.sessionId !== sessionId || typeof record.socket !== "string"
      || typeof record.ts !== "string" || !Number.isFinite(Date.parse(record.ts))) return null;
    return record as unknown as LocalClaudeSession;
  } catch {
    return null;
  } finally {
    await handle?.close().catch(() => {});
  }
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

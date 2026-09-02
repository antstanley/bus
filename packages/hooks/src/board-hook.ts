#!/usr/bin/env bun

import { Board, InvalidSessionIdError, type Post, type Store } from "@board/core";
import { parseStoreSpec } from "@board/cli";
import { BoardIndex } from "@board/index";
import { heartbeat } from "@board/presence";
import { chmod, lstat, mkdir, readFile, readdir, rename, rmdir, stat, unlink, utimes, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  loadHookConfig,
  openConfiguredStore,
  resolveDeliveryTargets,
  resolveIdentity,
  resolveInstance,
  resolveRuntime,
  type BoardHookConfig,
  type HookPayload,
} from "./config.ts";

export interface HookDependencies {
  env?: Record<string, string | undefined>;
  configPath?: string;
  home?: string;
  createStore?: (config: BoardHookConfig) => Promise<Store> | Store;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
}

const CLAUDE_REGISTRY_WRITE_WARNING = "board-hook: Claude session registry write failed";

interface JsonRow { id: string; board: string; post_json: string }
interface BoardRow { board: string }
interface StoreContextRow { store_id: string }

export interface IndexLockOptions {
  leaseMs?: number;
  renewEveryMs?: number;
  timeoutMs?: number;
}

interface LockOwner {
  token: string;
  mtimeMs: number;
}

/** Execute a hook command. Hook failures are deliberately swallowed. */
export async function runHook(argv: string[], stdin = "", deps: HookDependencies = {}): Promise<void> {
  try {
    const command = argv[0];
    if (command === "flush") return;
    if (command !== "inject" && command !== "heartbeat" && command !== "poll") return;

    const invocation = parseHookArguments(argv.slice(1));
    const payload = { ...parsePayload(stdin), ...invocation.payload };
    const env = { ...(deps.env ?? process.env), ...invocation.env };
    const config = await loadHookConfig({
      env,
      ...(deps.configPath === undefined ? {} : { configPath: deps.configPath }),
      ...(deps.home === undefined ? {} : { home: deps.home }),
    });
    // Installer-generated argv is local configuration and is authoritative;
    // do not let an enclosing agent shell contribute a conflicting identity.
    const identityEnv = invocation.explicitRuntime ? { BOARD_AS: env.BOARD_AS } : env;
    const runtimeEnv = invocation.explicitRuntime ? {} : env;
    const identity = resolveIdentity(payload, identityEnv);
    const runtime = resolveRuntime(payload, runtimeEnv);
    const store = await (deps.createStore ?? openConfiguredStore)(config);

    if (command === "heartbeat" || command === "poll") {
      const deliveryTargets = resolveDeliveryTargets(payload, runtimeEnv, runtime);
      await heartbeat(store, {
        name: identity,
        instance: resolveInstance(payload, identity, runtime),
        status: payload.status === "working" ? "working" : "idle",
        ...(runtime === undefined ? {} : { tool: runtime, runtime }),
        ...deliveryTargets,
      });
      if (runtime === "claude" && deliveryTargets.sessionId && deliveryTargets.socket
        && env.CLAUDE_CODE_MESSAGING_TOKEN) {
        try {
          await writeClaudeSessionRecord(
            join(deps.home ?? env.HOME ?? homedir(), ".board", "sessions", "claude"),
            deliveryTargets.sessionId,
            deliveryTargets.socket,
          );
        } catch {
          (deps.stderr ?? console.error)(CLAUDE_REGISTRY_WRITE_WARNING);
        }
      }
      if (command === "heartbeat") return;
    }

    const output = await injectUnread(store, config, identity);
    if (output) (deps.stdout ?? writeStdout)(output);
  } catch (error) {
    // Hooks must never block or break the host agent. Configuration, network,
    // corrupt index, and malformed stdin failures all degrade to no output.
    if (error instanceof InvalidSessionIdError) (deps.stderr ?? console.error)(error.message);
  }
}

export function claudeSessionRegistryPath(registryDir: string, sessionId: string): string {
  return join(registryDir, `${createHash("sha256").update(sessionId, "utf8").digest("hex")}.json`);
}

async function writeClaudeSessionRecord(registryDir: string, sessionId: string, socket: string): Promise<void> {
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
    await writeFile(temp, JSON.stringify({
      v: 1,
      sessionId,
      socket,
      ts: new Date().toISOString(),
    }) + "\n", { encoding: "utf8", mode: 0o600, flag: "wx" });
    await chmod(temp, 0o600);
    await rename(temp, target);
  } finally {
    try { await unlink(temp); } catch (error) {
      if (!hasCode(error, "ENOENT")) throw error;
    }
  }
}

interface HookInvocation {
  payload: HookPayload;
  env: Record<string, string>;
  explicitRuntime: boolean;
}

function parseHookArguments(args: string[]): HookInvocation {
  const payload: HookPayload = {};
  const env: Record<string, string> = {};
  let explicitRuntime = false;
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag?.startsWith("--") || value === undefined || value.length === 0) throw new Error("invalid hook arguments");
    if (flag === "--runtime") { payload.runtime = value; explicitRuntime = true; }
    else if (flag === "--session") payload.session_id = value;
    else if (flag === "--status" && (value === "idle" || value === "working")) payload.status = value;
    else if (flag === "--store") env.BOARD_STORE = value;
    else if (flag === "--as") env.BOARD_AS = value;
    else if (flag === "--board") env.BOARD_BOARDS = value;
    else if (flag === "--index") env.BOARD_INDEX = value;
    else throw new Error(`unknown hook argument: ${flag}`);
  }
  return { payload, env, explicitRuntime };
}

export async function injectUnread(store: Store, config: BoardHookConfig, identity: string): Promise<string> {
  const releaseClaim = await acquireIndexLock(config.indexPath, "hook-claim");
  let index: BoardIndex | undefined;
  try {
    const releaseSchema = await acquireIndexLock(config.indexPath, "mcp-schema");
    try { index = new BoardIndex(config.indexPath); }
    finally { await releaseSchema(); }
    index.db.exec("PRAGMA busy_timeout = 5000");
    index.db.exec(`
      CREATE TABLE IF NOT EXISTS hook_deliveries (
        store_id TEXT NOT NULL,
        board_set_id TEXT NOT NULL,
        author TEXT NOT NULL,
        post_id TEXT NOT NULL,
        delivered_at TEXT NOT NULL,
        PRIMARY KEY (store_id, board_set_id, author, post_id)
      );
      CREATE TABLE IF NOT EXISTS hook_index_context (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        store_id TEXT NOT NULL
      );
    `);
    const { storeId, boardSetId, boards } = deliveryScope(config);
    const priorStoreId = index.db.query<StoreContextRow, []>(
      "SELECT store_id FROM hook_index_context WHERE singleton = 1",
    ).get()?.store_id;
    if (priorStoreId !== storeId) {
      // BoardIndex sync cursors are board-scoped. When one configured index is
      // reused for another store, rebuild every board already known to it so
      // an old store's cursor cannot suppress older posts in the new store.
      const indexedBoards = index.db.query<BoardRow, []>("SELECT board FROM sync_state").all().map((row) => row.board);
      for (const boardName of new Set([...indexedBoards, ...boards])) {
        await index.rebuild(new Board(store, { board: boardName, author: identity }));
      }
      index.db.query(`
        INSERT INTO hook_index_context (singleton, store_id) VALUES (1, ?)
        ON CONFLICT(singleton) DO UPDATE SET store_id = excluded.store_id
      `).run(storeId);
    } else {
      for (const boardName of boards) {
        await index.sync(new Board(store, { board: boardName, author: identity }));
      }
    }

    index.db.exec("BEGIN IMMEDIATE");
    try {
      const placeholders = boards.map(() => "?").join(", ");
      // BoardIndex.sync_state owns the scan cursor. Delivery completeness is
      // instead tracked per post so a late, lower id can never be hidden by a
      // previously delivered higher id.
      const rows = index.db.query<JsonRow, Array<string>>(`
        SELECT p.id, p.board, p.post_json FROM mentions m JOIN posts p ON p.id = m.post_id
        WHERE m.agent = ? AND p.board IN (${placeholders})
          AND NOT EXISTS (
            SELECT 1 FROM hook_deliveries d
            WHERE d.store_id = ? AND d.board_set_id = ?
              AND d.author = ? AND d.post_id = p.id
          )
        ORDER BY p.id ASC
      `).all(identity, ...boards, storeId, boardSetId, identity);
      const boardReaders = new Map(config.boards.map((board) => [
        board,
        new Board(store, { board, author: identity }),
      ]));
      const posts: Post[] = [];
      for (const row of rows) {
        // The shared index schema is board-scoped, not store-scoped. Verify
        // every candidate against the configured store before it can be
        // rendered, so rows indexed from another store cannot cross scopes.
        const current = await boardReaders.get(row.board)?.get(row.id);
        if (current?.mentions?.includes(identity)) posts.push(current);
      }
      if (posts.length === 0) {
        index.db.exec("COMMIT");
        return "";
      }

      const rendered = renderPosts(posts, config.maxOutputBytes);
      if (rendered.consumed === 0) {
        index.db.exec("COMMIT");
        return "";
      }
      const claim = index.db.query(`
        INSERT OR IGNORE INTO hook_deliveries
          (store_id, board_set_id, author, post_id, delivered_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      const deliveredAt = new Date().toISOString();
      for (const post of posts.slice(0, rendered.consumed)) {
        claim.run(storeId, boardSetId, identity, post.id, deliveredAt);
      }
      index.db.exec("COMMIT");
      return rendered.output;
    } catch (error) {
      try { index.db.exec("ROLLBACK"); } catch {}
      throw error;
    }
  } finally {
    index?.close();
    await releaseClaim();
  }
}

export async function acquireIndexLock(
  indexPath: string,
  purpose: string,
  options: IndexLockOptions = {},
): Promise<() => Promise<void>> {
  if (indexPath === ":memory:") return async () => {};
  await mkdir(dirname(indexPath), { recursive: true });
  const lockPath = `${indexPath}.${purpose}-lock`;
  const token = crypto.randomUUID();
  const ownerName = `owner-${token}`;
  const ownerPath = join(lockPath, ownerName);
  const leaseMs = options.leaseMs ?? 30_000;
  const renewEveryMs = options.renewEveryMs ?? Math.max(50, Math.floor(leaseMs / 3));
  const deadline = Date.now() + (options.timeoutMs ?? 15_000);
  for (;;) {
    try {
      await mkdir(lockPath);
      try {
        await writeFile(ownerPath, token, { flag: "wx" });
      } catch (error) {
        try { await rmdir(lockPath); } catch {}
        throw error;
      }
      let renewal: Promise<void> = Promise.resolve();
      const timer = renewEveryMs > 0 ? setInterval(() => {
        renewal = renewal.then(async () => {
          // utimes never creates a missing owner file, so a lease that was
          // taken over cannot accidentally renew its successor's lock.
          const now = new Date();
          await utimes(ownerPath, now, now);
        }).catch(() => {});
      }, renewEveryMs) : undefined;
      timer?.unref?.();
      return async () => {
        if (timer) clearInterval(timer);
        await renewal;
        await releaseOwnedLock(lockPath, token);
      };
    } catch (error) {
      if (!hasCode(error, "EEXIST")) throw error;
      try {
        const owner = await readLockOwner(lockPath);
        const mtimeMs = owner?.mtimeMs ?? (await stat(lockPath)).mtimeMs;
        if (Date.now() - mtimeMs > leaseMs) {
          let removed = false;
          if (owner) {
            const currentOwnerPath = join(lockPath, `owner-${owner.token}`);
            const displacedOwnerPath = join(lockPath, `stale-${owner.token}-${token}`);
            await rename(currentOwnerPath, displacedOwnerPath);
            const displaced = await stat(displacedOwnerPath);
            if (Date.now() - displaced.mtimeMs > leaseMs
              && await readFile(displacedOwnerPath, "utf8") === owner.token) {
              await unlink(displacedOwnerPath);
              removed = await removeEmptyDirectory(lockPath);
            } else {
              await rename(displacedOwnerPath, currentOwnerPath);
            }
          } else {
            // A process can die between mkdir and publishing its token. rmdir
            // succeeds only while the directory is still ownerless. It can
            // also die after displacing a stale owner, so reap only expired,
            // self-describing stale markers before trying the empty removal.
            await removeExpiredStaleMarkers(lockPath, leaseMs);
            removed = await removeEmptyDirectory(lockPath);
          }
          if (removed) continue;
        }
      } catch {}
      if (Date.now() >= deadline) throw new Error(`timed out waiting for board hook index lock: ${lockPath}`);
      await Bun.sleep(20);
    }
  }
}

async function removeExpiredStaleMarkers(lockPath: string, leaseMs: number): Promise<void> {
  for (const name of await readdir(lockPath)) {
    const match = /^stale-([0-9a-f-]{36})-([0-9a-f-]{36})$/.exec(name);
    if (!match) continue;
    const path = join(lockPath, name);
    try {
      if (Date.now() - (await stat(path)).mtimeMs <= leaseMs) continue;
      if (await readFile(path, "utf8") !== match[1]) continue;
      await unlink(path);
    } catch {}
  }
}

async function removeEmptyDirectory(path: string): Promise<boolean> {
  try {
    await rmdir(path);
    return true;
  } catch {
    return false;
  }
}

async function readLockOwner(lockPath: string): Promise<LockOwner | undefined> {
  const names = (await readdir(lockPath)).filter((name) => name.startsWith("owner-"));
  if (names.length !== 1) return undefined;
  const path = join(lockPath, names[0]!);
  const token = await readFile(path, "utf8");
  if (names[0] !== `owner-${token}`) return undefined;
  return { token, mtimeMs: (await stat(path)).mtimeMs };
}

async function releaseOwnedLock(lockPath: string, token: string): Promise<void> {
  try {
    // The token is part of the filename. If a successor owns lockPath this
    // unlink is ENOENT, and rmdir cannot remove its non-empty directory.
    await unlink(join(lockPath, `owner-${token}`));
    try { await rmdir(lockPath); } catch {}
  } catch {}
}

function deliveryScope(config: BoardHookConfig): { storeId: string; boardSetId: string; boards: string[] } {
  const spec = parseStoreSpec(config.store);
  const store = spec.kind === "fs"
    ? { kind: spec.kind, dir: resolve(spec.dir) }
    : spec.kind === "git"
      ? { kind: spec.kind, dir: resolve(spec.dir), remote: spec.remote ?? null, branch: spec.branch ?? null }
      : spec;
  const boards = [...config.boards].sort();
  return {
    storeId: sha256(JSON.stringify(store)),
    boardSetId: sha256(JSON.stringify(boards)),
    boards,
  };
}

function sha256(value: string): string {
  return new Bun.CryptoHasher("sha256").update(value).digest("hex");
}

function hasCode(error: unknown, code: string): boolean {
  return !!error && typeof error === "object" && (error as { code?: unknown }).code === code;
}

function renderPosts(posts: Post[], cap: number): { output: string; consumed: number } {
  const open = "<board-messages>\n";
  const close = "</board-messages>\n";
  const blocks: string[] = [];
  let consumed = 0;

  for (let i = 0; i < posts.length; i++) {
    const block = renderPost(posts[i]!);
    const remaining = posts.length - (i + 1);
    const suffix = remaining > 0 ? overflowSuffix(remaining) : "";
    const candidate = open + blocks.join("") + block + suffix + close;
    if (byteLength(candidate) <= cap) {
      blocks.push(block);
      consumed++;
      continue;
    }

    if (consumed === 0) {
      const rest = posts.length - 1;
      const reserved = byteLength(open + overflowSuffix(rest) + close);
      const truncated = truncateUtf8(block, Math.max(0, cap - reserved));
      if (truncated) {
        blocks.push(truncated.endsWith("\n") ? truncated : truncated + "\n");
        consumed = 1;
      }
    }
    break;
  }

  if (consumed === 0) return { output: "", consumed: 0 };
  const remaining = posts.length - consumed;
  let output = open + blocks.join("") + (remaining > 0 ? overflowSuffix(remaining) : "") + close;
  if (byteLength(output) > cap) output = truncateUtf8(output, cap);
  return { output, consumed };
}

function renderPost(post: Post): string {
  const label = `UNTRUSTED CONTENT FROM ${post.author}`;
  const title = post.title === undefined ? "" : `${quoteUntrusted(`title: ${post.title}`)}\n`;
  return `[${label} | board ${post.board} | post ${post.id}]\n${title}| body:\n${quoteUntrusted(post.body)}\n[/UNTRUSTED CONTENT]\n`;
}

// Prefix every author-controlled line so a body containing our closing marker
// cannot visually escape the boundary at the framing indentation level.
function quoteUntrusted(value: string): string {
  return value.split("\n").map((line) => `| ${line}`).join("\n");
}

function overflowSuffix(count: number): string {
  return count > 0 ? `[${count} more unread; run board read]\n` : "";
}

function truncateUtf8(value: string, maxBytes: number): string {
  if (maxBytes <= 0) return "";
  const bytes = new TextEncoder().encode(value);
  if (bytes.length <= maxBytes) return value;
  const marker = "…\n";
  const markerBytes = new TextEncoder().encode(marker);
  const bodyLimit = Math.max(0, maxBytes - markerBytes.length);
  let end = bodyLimit;
  while (end > 0 && (bytes[end]! & 0xc0) === 0x80) end--;
  return new TextDecoder().decode(bytes.slice(0, end)) + (maxBytes >= markerBytes.length ? marker : "");
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function parsePayload(stdin: string): HookPayload {
  if (!stdin.trim()) return {};
  const parsed: unknown = JSON.parse(stdin);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("hook stdin is not an object");
  return parsed as HookPayload;
}

function writeStdout(value: string): void {
  process.stdout.write(value);
}

if (import.meta.main) {
  await runHook(process.argv.slice(2), await Bun.stdin.text());
  process.exitCode = 0;
}

export {
  loadHookConfig,
  openConfiguredStore,
  resolveDeliveryTargets,
  resolveIdentity,
  resolveInstance,
  resolveRuntime,
} from "./config.ts";

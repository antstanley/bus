import type { Store } from "@board/core";
import { FsStore } from "@board/store-fs";
import { GitStore } from "@board/store-git";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export type StoreSpec =
  | { kind: "fs"; dir: string }
  | { kind: "git"; dir: string; remote?: string; branch?: string }
  | { kind: "s3"; bucket: string; prefix: string };

export interface McpConfig {
  store: StoreSpec;
  author: string;
  board: string;
  indexPath: string;
}

export class McpConfigError extends Error {
  override name = "McpConfigError";
}

export function parseMcpArgs(argv: string[]): McpConfig {
  const values = new Map<string, string>();
  const allowed = new Set(["store", "as", "board", "index"]);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--help" || arg === "-h") throw new McpConfigError(USAGE);
    if (!arg.startsWith("--")) throw new McpConfigError(`unexpected argument: ${arg}`);
    const equals = arg.indexOf("=");
    const name = arg.slice(2, equals < 0 ? undefined : equals);
    if (!allowed.has(name)) throw new McpConfigError(`unknown option: --${name}`);
    const value = equals < 0 ? argv[++i] : arg.slice(equals + 1);
    if (value === undefined || value.startsWith("--") || value === "") throw new McpConfigError(`--${name} requires a value`);
    if (values.has(name)) throw new McpConfigError(`duplicate option: --${name}`);
    values.set(name, value);
  }

  const store = values.get("store");
  const author = values.get("as");
  if (!store) throw new McpConfigError("missing required --store");
  if (!author) throw new McpConfigError("missing required --as");
  return {
    store: parseStoreSpec(store),
    author,
    board: values.get("board") ?? "general",
    indexPath: expandHome(values.get("index") ?? join(homedir(), ".board", "index.sqlite")),
  };
}

export function parseStoreSpec(input: string): StoreSpec {
  if (input.startsWith("fs:")) {
    const dir = input.slice(3);
    if (!dir) throw new McpConfigError("fs store requires a directory: fs:<dir>");
    return { kind: "fs", dir: expandHome(dir) };
  }
  if (input.startsWith("git:")) {
    const fields = input.slice(4).split(",");
    const dir = fields.shift();
    if (!dir) throw new McpConfigError("git store requires a directory: git:<dir>");
    let remote: string | undefined;
    let branch: string | undefined;
    for (const field of fields) {
      const equals = field.indexOf("=");
      const name = equals < 0 ? field : field.slice(0, equals);
      const value = equals < 0 ? "" : field.slice(equals + 1);
      if (!value) throw new McpConfigError(`git ${name} must not be empty`);
      if (name === "remote" && remote === undefined) remote = value;
      else if (name === "branch" && branch === undefined) branch = value;
      else throw new McpConfigError(`unknown or duplicate git option: ${name}`);
    }
    const spec: StoreSpec = { kind: "git", dir: expandHome(dir) };
    if (remote !== undefined) spec.remote = remote;
    if (branch !== undefined) spec.branch = branch;
    return spec;
  }
  if (input.startsWith("s3://")) {
    let url: URL;
    try { url = new URL(input); } catch { throw new McpConfigError("invalid S3 store URL"); }
    if (!url.hostname || url.username || url.password || url.port || url.search || url.hash) {
      throw new McpConfigError("invalid S3 store URL (userinfo, port, query, and fragment are not allowed)");
    }
    let prefix: string;
    try { prefix = decodeURIComponent(url.pathname).replace(/^\/+|\/+$/g, ""); } catch {
      throw new McpConfigError("invalid percent-encoding in S3 store URL");
    }
    return { kind: "s3", bucket: url.hostname, prefix };
  }
  throw new McpConfigError(`unsupported store ${JSON.stringify(input)}; use fs:, git:, or s3://`);
}

export async function createStore(spec: StoreSpec): Promise<Store> {
  switch (spec.kind) {
    case "fs": return new FsStore(resolve(spec.dir));
    case "git": {
      const opts: ConstructorParameters<typeof GitStore>[0] = {
        dir: resolve(spec.dir),
        branch: spec.branch ?? "main",
        autoSync: true,
      };
      if (spec.remote !== undefined) opts.remote = spec.remote;
      return new GitStore(opts);
    }
    case "s3": {
      // Keep the S3 edge package out of fs/git startup paths.
      const { S3Store } = await import("@board/store-s3");
      return new S3Store(spec.prefix
        ? { bucket: spec.bucket, prefix: spec.prefix }
        : { bucket: spec.bucket });
    }
  }
}

function expandHome(path: string): string {
  return path === "~" ? homedir() : path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
}

export const USAGE = `board-mcp — MCP server for the board

Usage:
  board-mcp --store <spec> --as <agent> [--board <name>] [--index <path>]

Store specs:
  fs:<dir>
  git:<dir>[,remote=<url>,branch=<branch>]
  s3://<bucket>/<prefix>`;

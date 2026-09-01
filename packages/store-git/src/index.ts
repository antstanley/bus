import type { Changes, ListOptions, ListResult, PutOptions, Store } from "@board/core";
import { FsStore } from "@board/store-fs";
import { access, appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";

const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const TOKEN = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;

export interface GitStoreOptions {
  dir: string;
  /** Remote URL. Configured as `origin` when supplied. */
  remote?: string;
  /** Branch used for replication (default `main`). */
  branch?: string;
  /** Commit and synchronize after writes, and before reads (default false). */
  autoSync?: boolean;
  /** Small debounce used to batch concurrent writes into one commit (default 10ms). */
  batchMs?: number;
  /** Push retry count for concurrent remote writers (default 5). */
  pushRetries?: number;
  /** Minimum interval between best-effort fetches triggered by reads (default 2000ms). */
  readSyncIntervalMs?: number;
}

export class GitCommandError extends Error {
  override name = "GitCommandError";

  constructor(
    public readonly args: readonly string[],
    public readonly exitCode: number,
    public readonly stderr: string,
  ) {
    super(`git ${args.join(" ")} failed (${exitCode})${stderr ? `: ${stderr.trim()}` : ""}`);
  }
}

export class SyncConflictError extends Error {
  override name = "SyncConflictError";
  constructor(public readonly detail: string) {
    super(`git synchronization conflict${detail ? `: ${detail.trim()}` : ""}`);
  }
}

export class UnmanagedRepositoryError extends Error {
  override name = "UnmanagedRepositoryError";
  constructor(dir: string) {
    super(`refusing unmanaged Git repository at ${dir}; board stores require git config board.store true`);
  }
}

export class InvalidChangeTokenError extends Error {
  override name = "InvalidChangeTokenError";
  constructor(token: string) {
    super(`invalid Git change token: ${JSON.stringify(token)}`);
  }
}

/** A Git-replicated Store backed by an FsStore worktree. */
export class GitStore implements Store {
  readonly dir: string;
  readonly branch: string;
  readonly autoSync: boolean;
  readonly fs: FsStore;
  /** Most recent best-effort remote failure; local writes may still be committed. */
  lastSyncError: Error | null = null;

  private readonly remote: string | undefined;
  private readonly batchMs: number;
  private readonly pushRetries: number;
  private readonly readSyncIntervalMs: number;
  private readonly ready: Promise<void>;
  private operationChain: Promise<unknown> = Promise.resolve();
  private autoSyncPromise: Promise<void> | undefined;
  private lastReadSyncAt = -Infinity;

  constructor(opts: GitStoreOptions) {
    if (!opts.dir) throw new TypeError("GitStore dir must not be empty");
    this.dir = resolve(opts.dir);
    this.branch = opts.branch ?? "main";
    if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(this.branch) || this.branch.includes("..")) {
      throw new TypeError(`invalid git branch: ${JSON.stringify(this.branch)}`);
    }
    this.remote = opts.remote;
    this.autoSync = opts.autoSync ?? false;
    this.batchMs = opts.batchMs ?? 10;
    this.pushRetries = opts.pushRetries ?? 5;
    this.readSyncIntervalMs = opts.readSyncIntervalMs ?? 2_000;
    if (!Number.isSafeInteger(this.batchMs) || this.batchMs < 0) throw new RangeError("batchMs must be a non-negative safe integer");
    if (!Number.isSafeInteger(this.pushRetries) || this.pushRetries < 0) throw new RangeError("pushRetries must be a non-negative safe integer");
    if (!Number.isSafeInteger(this.readSyncIntervalMs) || this.readSyncIntervalMs < 0) {
      throw new RangeError("readSyncIntervalMs must be a non-negative safe integer");
    }
    this.fs = new FsStore(this.dir);
    this.ready = this.initialize();
  }

  async put(key: string, body: Uint8Array | string, opts?: PutOptions): Promise<void> {
    await this.ready;
    await this.serialized(() => this.fs.put(key, body, opts));
    if (this.autoSync) await this.scheduleAutoSync();
  }

  async get(key: string): Promise<Uint8Array | null> {
    await this.ready;
    if (this.autoSync) await this.prepareRead();
    return this.serialized(() => this.fs.get(key));
  }

  async list(prefix: string, opts?: ListOptions): Promise<ListResult> {
    await this.ready;
    if (this.autoSync) await this.prepareRead();
    return this.serialized(() => this.fs.list(prefix, opts));
  }

  async delete(key: string): Promise<void> {
    await this.ready;
    await this.serialized(() => this.fs.delete(key));
    if (this.autoSync) await this.scheduleAutoSync();
  }

  /** Commit pending work, then fetch/rebase/push when a remote is configured. */
  async sync(): Promise<void> {
    await this.ready;
    if (this.autoSyncPromise) await this.autoSyncPromise;
    return this.serialized(async () => {
      try {
        await this.syncNow();
        this.lastSyncError = null;
      } catch (error) {
        this.lastSyncError = asError(error);
        throw error;
      }
    });
  }

  /** Alias useful to callers that use autoSync batching. */
  flush(): Promise<void> {
    return this.sync();
  }

  async changes(token?: string): Promise<Changes> {
    if (token !== undefined && !TOKEN.test(token)) throw new InvalidChangeTokenError(token);
    await this.ready;
    if (this.autoSyncPromise) await this.autoSyncPromise;
    else await this.serialized(() => this.syncBestEffortNow());
    return this.serialized(async () => {
      const head = await this.head();
      const nextToken = head ?? EMPTY_TREE;
      if (token === undefined || token === nextToken) return { keys: [], token: nextToken };

      if (token !== EMPTY_TREE) {
        const type = await this.git(["cat-file", "-t", token], [0, 128]);
        if (type.exitCode !== 0 || !/^(commit|tree)\s*$/.test(type.stdout)) {
          return { keys: await this.allTrackedKeys(head), token: nextToken };
        }
      }
      const result = await this.git(["diff", "--no-renames", "--diff-filter=AM", "--name-only", "-z", token, nextToken, "--"]);
      const keys = result.stdout.split("\0").filter(isStoreKey);
      return { keys: [...new Set(keys)], token: nextToken };
    });
  }

  private scheduleAutoSync(): Promise<void> {
    if (this.autoSyncPromise) return this.autoSyncPromise;
    const scheduled = new Promise<void>((resolvePromise, rejectPromise) => {
      setTimeout(() => {
        void this.serialized(() => this.syncBestEffortNow()).then(resolvePromise, rejectPromise);
      }, this.batchMs);
    });
    this.autoSyncPromise = scheduled.finally(() => {
      if (this.autoSyncPromise === wrapped) this.autoSyncPromise = undefined;
    });
    const wrapped = this.autoSyncPromise;
    return wrapped;
  }

  private async initialize(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    let created = false;
    try {
      await access(join(this.dir, ".git"));
    } catch {
      await this.git(["init", "-b", this.branch]);
      await this.git(["config", "board.store", "true"]);
      created = true;
    }
    if (!created) {
      const managed = await this.git(["config", "--local", "--bool", "--get", "board.store"], [0, 1]);
      if (managed.exitCode !== 0 || managed.stdout.trim() !== "true") throw new UnmanagedRepositoryError(this.dir);
    }

    // A process killed during a conflicted rebase must not poison every future
    // Store instance. Managed repos are dedicated, so aborting is safe.
    await this.git(["rebase", "--abort"], [0, 128]);
    await this.ensureTempExclude();

    // Ensure commits work in clean CI/user environments without changing
    // global Git configuration.
    const name = await this.git(["config", "--get", "user.name"], [0, 1]);
    if (name.exitCode !== 0) await this.git(["config", "user.name", "board"]);
    const email = await this.git(["config", "--get", "user.email"], [0, 1]);
    if (email.exitCode !== 0) await this.git(["config", "user.email", "board@localhost"]);

    const head = await this.head();
    if (head === null) {
      await this.git(["symbolic-ref", "HEAD", `refs/heads/${this.branch}`]);
    } else {
      const current = (await this.git(["branch", "--show-current"])).stdout.trim();
      if (current !== this.branch) {
        const exists = await this.git(["rev-parse", "--verify", "--quiet", `refs/heads/${this.branch}`], [0, 1]);
        await this.git(exists.exitCode === 0 ? ["switch", this.branch] : ["switch", "-c", this.branch]);
      }
    }

    if (this.remote !== undefined) {
      const current = await this.git(["remote", "get-url", "origin"], [0, 2]);
      if (current.exitCode !== 0) await this.git(["remote", "add", "origin", this.remote]);
      else if (current.stdout.trim() !== this.remote) {
        throw new Error(`refusing to replace existing origin ${JSON.stringify(redactUrlUserinfo(current.stdout.trim()))} with ${JSON.stringify(redactUrlUserinfo(this.remote))}`);
      }
    }
  }

  private async syncNow(): Promise<void> {
    await this.commitPending();
    await this.replicateRemote();
  }

  private async syncBestEffortNow(): Promise<void> {
    // Local durability is part of write success and must still throw. Remote
    // replication health is exposed separately through lastSyncError.
    await this.commitPending();
    try {
      await this.replicateRemote();
      this.lastSyncError = null;
    } catch (error) {
      this.lastSyncError = asError(error);
    }
  }

  private async replicateRemote(): Promise<void> {
    if (this.remote === undefined) return;

    for (let attempt = 0; ; attempt++) {
      const remoteHasBranch = await this.remoteBranchExists();
      if (remoteHasBranch) {
        await this.git(["fetch", "--no-tags", "origin", this.branch]);
        if (await this.head()) await this.rebase("FETCH_HEAD");
        else await this.git(["checkout", "-B", this.branch, "FETCH_HEAD"]);
      }

      if (!(await this.head())) return;
      const push = await this.git(["push", "-u", "origin", `HEAD:${this.branch}`], [0, 1]);
      if (push.exitCode === 0) return;
      if (attempt >= this.pushRetries || !isNonFastForward(push.stderr)) {
        throw new GitCommandError(["push", "-u", "origin", `HEAD:${this.branch}`], push.exitCode, push.stderr);
      }
      // Another writer won the push race. The next iteration fetches it,
      // rebases our immutable-object commit, and tries again.
    }
  }

  private async commitPending(): Promise<void> {
    const status = await this.git(["status", "--porcelain", "--untracked-files=all"]);
    if (!status.stdout) return;
    await this.git(["add", "-A", "--", "."]);
    const staged = await this.git(["diff", "--cached", "--quiet"], [0, 1]);
    if (staged.exitCode === 1) await this.git(["commit", "-m", `board: sync ${new Date().toISOString()}`]);
  }

  /** Commit local writes and occasionally fetch, without making reads depend on network health. */
  private async prepareRead(): Promise<void> {
    await this.serialized(async () => {
      await this.commitPending();
      if (this.remote === undefined || Date.now() - this.lastReadSyncAt < this.readSyncIntervalMs) return;
      this.lastReadSyncAt = Date.now();
      try {
        if (!(await this.remoteBranchExists())) return;
        await this.git(["fetch", "--no-tags", "origin", this.branch]);
        if (await this.head()) await this.rebase("FETCH_HEAD");
        else await this.git(["checkout", "-B", this.branch, "FETCH_HEAD"]);
      } catch (error) {
        // The local replica remains readable when offline, when a remote hook
        // rejects access, or when a remote plain overwrite conflicts.
        this.lastSyncError = asError(error);
        await this.git(["rebase", "--abort"], [0, 128]);
      }
    });
  }

  private async rebase(upstream: string): Promise<void> {
    try {
      // During rebase, "theirs" is the local commit being replayed. Owner-only
      // mutable objects therefore converge with this replica's latest value.
      await this.git(["rebase", "-X", "theirs", upstream]);
    } catch (error) {
      await this.git(["rebase", "--abort"], [0, 128]);
      const detail = error instanceof GitCommandError ? error.stderr : String(error);
      throw new SyncConflictError(detail);
    }
  }

  private async allTrackedKeys(head: string | null): Promise<string[]> {
    if (head === null) return [];
    const result = await this.git(["ls-tree", "-r", "--name-only", "-z", head]);
    return result.stdout.split("\0").filter(isStoreKey);
  }

  private async ensureTempExclude(): Promise<void> {
    const result = await this.git(["rev-parse", "--git-path", "info/exclude"]);
    const rawPath = result.stdout.trim();
    const excludePath = isAbsolute(rawPath) ? rawPath : resolve(this.dir, rawPath);
    let contents = "";
    try { contents = await readFile(excludePath, "utf8"); } catch (error) {
      if (!hasCode(error, "ENOENT")) throw error;
    }
    if (contents.split(/\r?\n/).includes(".board-tmp-*")) return;
    await mkdir(dirname(excludePath), { recursive: true });
    await appendFile(excludePath, `${contents && !contents.endsWith("\n") ? "\n" : ""}.board-tmp-*\n`);
  }

  private async remoteBranchExists(): Promise<boolean> {
    const result = await this.git(["ls-remote", "--exit-code", "--heads", "origin", `refs/heads/${this.branch}`], [0, 2]);
    return result.exitCode === 0 && result.stdout.trim().length > 0;
  }

  private async head(): Promise<string | null> {
    const result = await this.git(["rev-parse", "--verify", "HEAD"], [0, 128]);
    return result.exitCode === 0 ? result.stdout.trim() : null;
  }

  private serialized<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.operationChain.then(operation, operation);
    this.operationChain = next.then(() => undefined, () => undefined);
    return next;
  }

  private async git(args: string[], allowedExitCodes: readonly number[] = [0]): Promise<GitResult> {
    const env = { ...process.env };
    delete env.GIT_DIR;
    delete env.GIT_WORK_TREE;
    delete env.GIT_INDEX_FILE;
    delete env.GIT_COMMON_DIR;
    delete env.GIT_OBJECT_DIRECTORY;
    delete env.GIT_ALTERNATE_OBJECT_DIRECTORIES;
    delete env.GIT_QUARANTINE_PATH;
    delete env.GIT_NAMESPACE;
    env.GIT_TERMINAL_PROMPT = "0";
    const proc = Bun.spawn(["git", "-C", this.dir, ...args], {
      env,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    if (!allowedExitCodes.includes(exitCode)) throw new GitCommandError(args, exitCode, stderr);
    return { stdout, stderr, exitCode };
  }
}

function redactUrlUserinfo(value: string): string {
  return value.replace(/([a-z][a-z0-9+.-]*:\/\/)([^\s/@]+)@/gi, "$1");
}

interface GitResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function isStoreKey(key: string): boolean {
  return key.length > 0 && !key.split("/").some((part) => !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(part));
}

function isNonFastForward(stderr: string): boolean {
  return /\((?:non-fast-forward|fetch first|incorrect old value provided)\)|cannot lock ref .* but expected /i.test(stderr);
}

function hasCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === code;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

import {
  DEFAULT_LIST_LIMIT,
  KeyExistsError,
  toBytes,
  type ListOptions,
  type ListResult,
  type PutOptions,
  type Store,
} from "@board/core";
import { constants, watch, type FSWatcher } from "node:fs";
import { link, lstat, mkdir, open, readdir, realpath, rename, unlink } from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";

const TEMP_PREFIX = ".board-tmp-";
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

interface PendingEntry {
  /** Full store key for a file, or a slash-terminated subtree lower bound. */
  key: string;
  path: string;
  directory: boolean;
}

export interface FsStoreOptions {
  /** Coalescing window for filesystem wake hints (default 100ms). */
  hintDebounceMs?: number;
  /** Test seam for deterministic watcher failure/closure tests. */
  watchFactory?: WatchFactory;
}

export type WatchFactory = (
  path: string,
  options: { recursive: true },
  listener: (eventType: string, filename: string | Buffer | null) => void,
) => FSWatcher;

/** A filesystem-backed Store. All paths are relative to `root`. */
export class FsStore implements Store {
  readonly root: string;
  private readonly hintDebounceMs: number;
  private readonly watchFactory: WatchFactory;
  private readonly hintConsumers = new Set<HintConsumer>();
  private watcher: FSWatcher | undefined;
  private watcherStarting: Promise<void> | undefined;
  private hintTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(root: string, opts: FsStoreOptions = {}) {
    if (!root) throw new TypeError("FsStore root must not be empty");
    this.root = resolve(root);
    this.hintDebounceMs = opts.hintDebounceMs ?? 100;
    if (!Number.isSafeInteger(this.hintDebounceMs) || this.hintDebounceMs < 0) {
      throw new RangeError("hintDebounceMs must be a non-negative safe integer");
    }
    this.watchFactory = opts.watchFactory ?? ((path, options, listener) => watch(path, options, listener));
  }

  async put(key: string, body: Uint8Array | string, opts: PutOptions = {}): Promise<void> {
    const target = this.pathFor(key);
    const parent = await this.safeParent(key, true);
    if (parent === null) throw new TypeError(`invalid store path: ${JSON.stringify(key)}`);
    const bytes = toBytes(body);

    // Keeping the temporary inode beside the destination makes rename/link
    // atomic. Its invalid-key leading dot also lets list() safely ignore it.
    const temp = join(parent, `${TEMP_PREFIX}${basename(target)}-${process.pid}-${crypto.randomUUID()}`);
    try {
      const file = await open(temp, "wx");
      try {
        await file.writeFile(bytes);
        await file.sync();
      } finally {
        await file.close();
      }

      if (opts.ifNoneMatch) {
        try {
          // A hard link publishes the complete inode only if target is absent.
          await link(temp, target);
        } catch (error) {
          if (hasCode(error, "EEXIST")) throw new KeyExistsError(key);
          if (isUnsupportedLink(error)) {
            await this.publishExclusiveFallback(target, key, bytes);
          } else {
            throw error;
          }
        }
      } else {
        await rename(temp, target);
      }
    } finally {
      try {
        await unlink(temp);
      } catch {}
    }
  }

  async get(key: string): Promise<Uint8Array | null> {
    const target = this.pathFor(key);
    try {
      if ((await this.safeParent(key, false)) === null) return null;
    } catch (error) {
      if (error instanceof TypeError) return null;
      throw error;
    }
    let file;
    try {
      file = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      const bytes = await file.readFile();
      return new Uint8Array(bytes);
    } catch (error) {
      if (hasAnyCode(error, "ENOENT", "ENOTDIR", "EISDIR", "ELOOP")) return null;
      throw error;
    } finally {
      await file?.close();
    }
  }

  async list(prefix: string, opts: ListOptions = {}): Promise<ListResult> {
    assertPrefix(prefix, "prefix");
    if (opts.after !== undefined) assertPrefix(opts.after, "after");
    const limit = opts.limit ?? DEFAULT_LIST_LIMIT;
    if (limit !== Infinity && (!Number.isSafeInteger(limit) || limit < 0)) {
      throw new RangeError("list limit must be a non-negative safe integer or Infinity");
    }

    const pending = new MinHeap<PendingEntry>((a, b) => compare(a.key, b.key));
    await this.enqueueDirectory(pending, this.root, "", prefix, opts.after);

    // Read one extra result to determine `truncated` without walking the rest.
    const found: string[] = [];
    while (pending.size > 0 && found.length <= limit) {
      const entry = pending.pop()!;
      if (entry.directory) {
        await this.enqueueDirectory(pending, entry.path, entry.key, prefix, opts.after);
      } else {
        found.push(entry.key);
      }
    }
    return { keys: found.slice(0, limit), truncated: found.length > limit };
  }

  async delete(key: string): Promise<void> {
    const target = this.pathFor(key);
    try {
      if ((await this.safeParent(key, false)) === null) return;
    } catch (error) {
      if (error instanceof TypeError) return;
      throw error;
    }
    try {
      await unlink(target);
    } catch (error) {
      if (!hasCode(error, "ENOENT")) throw error;
    }
  }

  /**
   * Yield debounced filesystem activity as a latency hint. The root watcher is
   * shared by all consumers and is released when the last iterator closes.
   * Event filenames are deliberately ignored: they are untrusted and hints
   * never identify authoritative store keys.
   */
  hint(signal?: AbortSignal): AsyncGenerator<void> {
    if (signal?.aborted) return (async function* () {})();
    const store = this;
    const consumer = new HintConsumer(signal, () => {
      store.hintConsumers.delete(consumer);
      if (store.hintConsumers.size === 0) store.stopWatcher();
    });
    const iterator = (async function* () {
      store.hintConsumers.add(consumer);
      try {
        await store.ensureWatcher();
        while (await consumer.next()) yield;
      } finally {
        // Deregister before close(): an abort that landed before the first
        // next() already spent this consumer's one-shot close(), and the
        // idempotent repeat here would skip onClose — stranding the stopped
        // registration and pinning the shared watcher open forever.
        store.hintConsumers.delete(consumer);
        if (store.hintConsumers.size === 0) store.stopWatcher();
        consumer.close();
      }
    })();
    const nativeReturn = iterator.return.bind(iterator);
    // An async generator fulfils a queued return() only after its pending
    // await settles, so a consumer breaking out mid-wait would hang until the
    // next filesystem event. Closing the consumer resolves that await and
    // releases its registration — and the shared watcher when it is the last
    // one — immediately, without waiting for this generator to resume;
    // other consumers are untouched and the watcher outlives them.
    iterator.return = (value) => {
      consumer.close();
      return nativeReturn(value);
    };
    return iterator;
  }

  private async ensureWatcher(): Promise<void> {
    if (this.watcher) return;
    if (this.watcherStarting) return this.watcherStarting;
    const starting = (async () => {
      await mkdir(this.root, { recursive: true });
      const stat = await lstat(this.root);
      // Recursive watchers must never be rooted at a replaceable symlink. We
      // also never create child watchers from untrusted event filenames.
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        throw new TypeError("FsStore hint root must be a non-symlink directory");
      }

      let watcher: FSWatcher;
      watcher = this.watchFactory(this.root, { recursive: true }, (_eventType, filename) => {
        // Git's internal fetch/commit bookkeeping is not store activity and
        // can otherwise create a wake/read/wake feedback loop in GitStore.
        // The name is classified only; it is never resolved or opened.
        if (isGitMetadata(filename)) return;
        if (this.watcher !== watcher || this.hintConsumers.size === 0) return;
        if (this.hintTimer !== undefined) clearTimeout(this.hintTimer);
        this.hintTimer = setTimeout(() => {
          this.hintTimer = undefined;
          if (this.watcher !== watcher) return;
          for (const consumer of this.hintConsumers) consumer.notify();
        }, this.hintDebounceMs);
      });
      this.watcher = watcher;
      watcher.on("error", (error) => this.failWatcher(watcher, error));
      watcher.on("close", () => this.failWatcher(watcher, new Error("filesystem hint watcher closed")));
    })();
    this.watcherStarting = starting;
    try {
      await starting;
    } finally {
      if (this.watcherStarting === starting) this.watcherStarting = undefined;
      if (this.hintConsumers.size === 0) this.stopWatcher();
    }
  }

  private failWatcher(watcher: FSWatcher, error: unknown): void {
    if (this.watcher !== watcher) return;
    this.watcher = undefined;
    if (this.hintTimer !== undefined) clearTimeout(this.hintTimer);
    this.hintTimer = undefined;
    for (const consumer of this.hintConsumers) consumer.fail(error);
    watcher.close();
  }

  private stopWatcher(): void {
    if (this.hintTimer !== undefined) clearTimeout(this.hintTimer);
    this.hintTimer = undefined;
    const watcher = this.watcher;
    this.watcher = undefined;
    watcher?.close();
  }

  private pathFor(key: string): string {
    assertObjectKey(key);
    return join(this.root, ...key.split("/"));
  }

  /**
   * Resolve and verify every parent component without following a symlinked
   * directory. The final realpath containment check also catches a component
   * swapped between lstat calls.
   */
  private async safeParent(key: string, create: boolean): Promise<string | null> {
    const segments = key.split("/").slice(0, -1);
    if (create) await mkdir(this.root, { recursive: true });

    let rootStat;
    try {
      rootStat = await lstat(this.root);
    } catch (error) {
      if (!create && hasAnyCode(error, "ENOENT", "ENOTDIR")) return null;
      throw error;
    }
    // A symlink supplied as the root itself is allowed; child symlinks are not.
    if (!rootStat.isDirectory() && !rootStat.isSymbolicLink()) return create ? Promise.reject(new TypeError("FsStore root is not a directory")) : null;
    const canonicalRoot = await realpath(this.root);

    let current = this.root;
    for (const segment of segments) {
      const next = join(current, segment);
      let stat;
      try {
        stat = await lstat(next);
      } catch (error) {
        if (!hasCode(error, "ENOENT")) {
          if (!create && hasCode(error, "ENOTDIR")) return null;
          throw error;
        }
        if (!create) return null;
        try {
          await mkdir(next);
        } catch (mkdirError) {
          if (!hasCode(mkdirError, "EEXIST")) throw mkdirError;
        }
        stat = await lstat(next);
      }
      if (stat.isSymbolicLink()) throw new TypeError(`store path crosses a symbolic link: ${JSON.stringify(key)}`);
      if (!stat.isDirectory()) return create ? Promise.reject(new TypeError(`store path parent is not a directory: ${JSON.stringify(key)}`)) : null;
      current = next;
    }

    const canonicalParent = await realpath(current);
    if (canonicalParent !== canonicalRoot && !canonicalParent.startsWith(canonicalRoot + sep)) {
      throw new TypeError(`store path escapes root: ${JSON.stringify(key)}`);
    }
    return current;
  }

  private async publishExclusiveFallback(target: string, key: string, bytes: Uint8Array): Promise<void> {
    let targetFile;
    try {
      targetFile = await open(target, "wx");
    } catch (error) {
      if (hasCode(error, "EEXIST")) throw new KeyExistsError(key);
      throw error;
    }
    let complete = false;
    try {
      await targetFile.writeFile(bytes);
      await targetFile.sync();
      complete = true;
    } finally {
      await targetFile.close();
      if (!complete) {
        try { await unlink(target); } catch {}
      }
    }
  }

  private async enqueueDirectory(
    heap: MinHeap<PendingEntry>,
    directory: string,
    keyPrefix: string,
    wantedPrefix: string,
    after: string | undefined,
  ): Promise<void> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      // Concurrent deletion after the parent was read and an unreadable
      // shared subtree are both local gaps, not reasons to hide readable
      // sibling objects from the whole listing.
      if (hasAnyCode(error, "ENOENT", "EACCES", "EPERM")) return;
      throw error;
    }

    for (const entry of entries) {
      // Valid store segments start with an alphanumeric character. Besides
      // temp files this excludes .git when FsStore backs a GitStore.
      if (!SEGMENT.test(entry.name)) continue;
      const key = keyPrefix + entry.name;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        const subtree = key + "/";
        if (subtreeMayMatch(subtree, wantedPrefix, after)) heap.push({ key: subtree, path, directory: true });
      } else if (entry.isFile() && key.startsWith(wantedPrefix) && (after === undefined || key > after)) {
        heap.push({ key, path, directory: false });
      }
      // Symlinks and special files are deliberately not Store objects.
    }
  }
}

class HintConsumer {
  private queued = false;
  private stopped = false;
  private failure: unknown;
  private waiter: { resolve: (active: boolean) => void; reject: (error: unknown) => void } | undefined;
  private readonly onAbort = () => this.close();

  constructor(
    private readonly signal?: AbortSignal,
    private readonly onClose?: () => void,
  ) {
    signal?.addEventListener("abort", this.onAbort, { once: true });
  }

  next(): Promise<boolean> {
    if (this.failure !== undefined) return Promise.reject(this.failure);
    if (this.stopped || this.signal?.aborted) return Promise.resolve(false);
    if (this.queued) { this.queued = false; return Promise.resolve(true); }
    return new Promise<boolean>((resolve, reject) => { this.waiter = { resolve, reject }; });
  }

  notify(): void {
    if (this.stopped) return;
    if (this.waiter) {
      const { resolve } = this.waiter;
      this.waiter = undefined;
      resolve(true);
    } else {
      this.queued = true;
    }
  }

  fail(error: unknown): void {
    if (this.stopped) return;
    this.failure = error;
    if (this.waiter) {
      const { reject } = this.waiter;
      this.waiter = undefined;
      reject(error);
    }
  }

  close(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.signal?.removeEventListener("abort", this.onAbort);
    this.onClose?.();
    if (this.waiter) {
      const { resolve } = this.waiter;
      this.waiter = undefined;
      resolve(false);
    }
  }
}

function assertObjectKey(key: string): void {
  assertPrefix(key, "key");
  if (key.length === 0 || key.endsWith("/")) throw new TypeError(`invalid store key: ${JSON.stringify(key)}`);
  for (const segment of key.split("/")) {
    if (!SEGMENT.test(segment) || segment === "." || segment === "..") {
      throw new TypeError(`invalid store key: ${JSON.stringify(key)}`);
    }
  }
}

function isGitMetadata(filename: string | Buffer | null): boolean {
  if (filename === null) return false;
  const name = typeof filename === "string" ? filename : filename.toString("utf8");
  return name === ".git" || name.startsWith(".git/") || name.startsWith(".git\\");
}

function assertPrefix(value: string, name: string): void {
  if (!/^[\x20-\x7e]*$/.test(value) || value.includes("\\") || value.startsWith("/")) {
    throw new TypeError(`invalid ${name}: ${JSON.stringify(value)}`);
  }
}

function subtreeMayMatch(subtree: string, prefix: string, after: string | undefined): boolean {
  // The requested byte prefix is either above or below this subtree.
  if (!subtree.startsWith(prefix) && !prefix.startsWith(subtree)) return false;
  if (after === undefined) return true;
  return after < prefixUpperBound(subtree);
}

/** Exclusive upper bound for every string beginning with this ASCII prefix. */
function prefixUpperBound(prefix: string): string {
  const last = prefix.charCodeAt(prefix.length - 1);
  return prefix.slice(0, -1) + String.fromCharCode(last + 1);
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function hasCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === code;
}

function hasAnyCode(error: unknown, ...codes: string[]): boolean {
  return codes.some((code) => hasCode(error, code));
}

function isUnsupportedLink(error: unknown): boolean {
  return hasAnyCode(error, "EPERM", "ENOTSUP", "EOPNOTSUPP", "EXDEV");
}

class MinHeap<T> {
  private readonly values: T[] = [];

  constructor(private readonly compareValues: (a: T, b: T) => number) {}

  get size(): number {
    return this.values.length;
  }

  push(value: T): void {
    const a = this.values;
    a.push(value);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.compareValues(a[parent]!, value) <= 0) break;
      a[i] = a[parent]!;
      i = parent;
    }
    a[i] = value;
  }

  pop(): T | undefined {
    const a = this.values;
    const first = a[0];
    const last = a.pop();
    if (a.length === 0 || last === undefined) return first;
    let i = 0;
    while (true) {
      const left = i * 2 + 1;
      if (left >= a.length) break;
      const right = left + 1;
      const child = right < a.length && this.compareValues(a[right]!, a[left]!) < 0 ? right : left;
      if (this.compareValues(a[child]!, last) >= 0) break;
      a[i] = a[child]!;
      i = child;
    }
    a[i] = last;
    return first;
  }
}

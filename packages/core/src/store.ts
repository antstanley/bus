// The storage contract. Four methods; everything else is built on top.
// Keys are "/"-separated ASCII, listed in lexicographic (byte) order.

export class KeyExistsError extends Error {
  override name = "KeyExistsError";
  constructor(public readonly key: string) {
    super(`key already exists: ${key}`);
  }
}

export interface PutOptions {
  /** Fail with KeyExistsError if the key already exists. Required for immutable objects. */
  ifNoneMatch?: true;
}

export interface ListOptions {
  /** Return only keys strictly greater than this full key. */
  after?: string;
  /** Max keys to return. Backends may return fewer; check `truncated`. */
  limit?: number;
}

export interface ListResult {
  /** Keys in ascending lexicographic order, all starting with `prefix`. */
  keys: string[];
  /** True if more keys exist after the last one returned. */
  truncated: boolean;
}

export interface Changes {
  /** Keys created or modified since the given token, in no particular order. */
  keys: string[];
  /** Opaque token to pass next time. */
  token: string;
}

export interface Store {
  put(key: string, body: Uint8Array | string, opts?: PutOptions): Promise<void>;
  /** null if the key does not exist. */
  get(key: string): Promise<Uint8Array | null>;
  /** Recursive: every key under `prefix`, no delimiter semantics. */
  list(prefix: string, opts?: ListOptions): Promise<ListResult>;
  /** Optional. Only for GC and tests; the board never deletes. */
  delete?(key: string): Promise<void>;
  /**
   * Optional exact change feed. A backend that knows precisely which keys
   * arrived (git: commits since a sha) exposes it so readers never miss
   * late-replicated objects. With no token, return a token for "now" and
   * an empty key list (or everything, at the backend's discretion).
   */
  changes?(token?: string): Promise<Changes>;
}

export const DEFAULT_LIST_LIMIT = 1000;

/** Page through a prefix, yielding keys in order. */
export async function* listAll(store: Store, prefix: string, after?: string, pageSize = DEFAULT_LIST_LIMIT): AsyncGenerator<string> {
  let cursor = after;
  for (;;) {
    const opts: ListOptions = { limit: pageSize };
    if (cursor !== undefined) opts.after = cursor;
    const { keys, truncated } = await store.list(prefix, opts);
    for (const k of keys) yield k;
    if (!truncated || keys.length === 0) return;
    cursor = keys[keys.length - 1]!;
  }
}

export const encoder = new TextEncoder();
export const decoder = new TextDecoder();

export function toBytes(body: Uint8Array | string): Uint8Array {
  return typeof body === "string" ? encoder.encode(body) : body;
}

/** Reference implementation. Also handy for tests. */
export class MemoryStore implements Store {
  private readonly objects = new Map<string, Uint8Array>();

  async put(key: string, body: Uint8Array | string, opts?: PutOptions): Promise<void> {
    if (opts?.ifNoneMatch && this.objects.has(key)) throw new KeyExistsError(key);
    this.objects.set(key, toBytes(body).slice());
  }

  async get(key: string): Promise<Uint8Array | null> {
    const v = this.objects.get(key);
    return v ? v.slice() : null;
  }

  async list(prefix: string, opts: ListOptions = {}): Promise<ListResult> {
    const limit = opts.limit ?? DEFAULT_LIST_LIMIT;
    const all = [...this.objects.keys()]
      .filter((k) => k.startsWith(prefix) && (opts.after === undefined || k > opts.after))
      .sort();
    return { keys: all.slice(0, limit), truncated: all.length > limit };
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  get size(): number {
    return this.objects.size;
  }
}

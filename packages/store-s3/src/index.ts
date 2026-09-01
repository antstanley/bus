import { S3Client, type S3Options } from "bun";
import {
  DEFAULT_LIST_LIMIT,
  KeyExistsError,
  toBytes,
  type ListOptions,
  type ListResult,
  type PutOptions,
  type Store,
} from "@board/core";

interface S3ListInput {
  prefix?: string;
  startAfter?: string;
  continuationToken?: string;
  maxKeys?: number;
}

interface S3ListResponse {
  contents?: Array<{ key: string }>;
  isTruncated?: boolean;
  nextContinuationToken?: string;
}

export interface S3ClientLike {
  file(path: string): { arrayBuffer(): Promise<ArrayBuffer> };
  write(path: string, body: string | Uint8Array): Promise<number | void>;
  exists(path: string): Promise<boolean>;
  delete(path: string): Promise<void>;
  list(input?: S3ListInput | null): Promise<S3ListResponse>;
  presign?(path: string, options?: { method?: "PUT"; expiresIn?: number }): string;
}

export type S3Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface S3StoreOptions extends S3Options {
  bucket: string;
  /** Namespace within the bucket; leading and trailing slashes are ignored. */
  prefix?: string;
  /** Injectable Bun-compatible client, primarily for tests. */
  client?: S3ClientLike;
  /** Injectable fetch used by native conditional PUTs. */
  fetch?: S3Fetch;
}

export class S3StoreError extends Error {
  override name = "S3StoreError";
  constructor(message: string, public readonly status?: number) {
    super(message);
  }
}

/** A Store backed by one prefix in an S3 or S3-compatible bucket. */
export class S3Store implements Store {
  readonly client: S3ClientLike;
  readonly prefix: string;
  private readonly fetcher: S3Fetch;
  private readonly fallbackWrites = new Map<string, Promise<void>>();

  constructor(opts: S3StoreOptions) {
    const { prefix = "", client, fetch: fetcher, ...clientOptions } = opts;
    if (!opts.bucket) throw new S3StoreError("bucket is required");
    this.prefix = normalizePrefix(prefix);
    this.client = client ?? new S3Client(clientOptions);
    this.fetcher = fetcher ?? globalThis.fetch;
  }

  async put(key: string, body: Uint8Array | string, opts?: PutOptions): Promise<void> {
    const objectKey = this.objectKey(key);
    if (!opts?.ifNoneMatch) {
      await this.client.write(objectKey, body);
      return;
    }

    const bytes = toBytes(body);
    const native = await this.nativePutIfAbsent(objectKey, bytes);
    if (native) return;
    await this.fallbackPutIfAbsent(objectKey, bytes, key);
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      const buffer = await this.client.file(this.objectKey(key)).arrayBuffer();
      return new Uint8Array(buffer);
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async list(prefix: string, opts: ListOptions = {}): Promise<ListResult> {
    const requested = opts.limit ?? DEFAULT_LIST_LIMIT;
    if (!Number.isInteger(requested) || requested < 1) throw new S3StoreError("list limit must be a positive integer");
    const physicalPrefix = this.objectKey(prefix);
    let startAfter = opts.after === undefined ? undefined : this.objectKey(opts.after);
    let continuationToken: string | undefined;
    const keys: string[] = [];
    let truncated = false;

    while (keys.length < requested) {
      const input: S3ListInput = {
        prefix: physicalPrefix,
        maxKeys: Math.min(requested - keys.length, 1_000),
      };
      if (continuationToken !== undefined) input.continuationToken = continuationToken;
      else if (startAfter !== undefined) input.startAfter = startAfter;

      const page = await this.client.list(input);
      const contents = [...(page.contents ?? [])].sort((a, b) => compareBytes(a.key, b.key));
      for (const entry of contents) {
        const key = this.logicalKey(entry.key);
        if (key === null || !key.startsWith(prefix) || (opts.after !== undefined && key <= opts.after)) continue;
        keys.push(key);
        if (keys.length === requested) break;
      }

      if (keys.length === requested) {
        truncated = page.isTruncated === true || contents.some((entry) => {
          const key = this.logicalKey(entry.key);
          return key !== null && key > keys[keys.length - 1]!;
        });
        break;
      }
      if (!page.isTruncated) break;

      continuationToken = page.nextContinuationToken;
      if (continuationToken === undefined) {
        const last = contents[contents.length - 1]?.key;
        if (last === undefined || last === startAfter) break;
        startAfter = last;
      }
    }

    return { keys, truncated };
  }

  async delete(key: string): Promise<void> {
    await this.client.delete(this.objectKey(key));
  }

  private objectKey(key: string): string {
    return this.prefix ? `${this.prefix}/${key}` : key;
  }

  private logicalKey(objectKey: string): string | null {
    if (!this.prefix) return objectKey;
    const root = `${this.prefix}/`;
    return objectKey.startsWith(root) ? objectKey.slice(root.length) : null;
  }

  /**
   * Bun has no conditional headers on S3Client.write, so use its SigV4
   * presigner and issue a native PutObject with If-None-Match: *. AWS S3 and
   * compatible providers that implement conditional writes make this atomic.
   */
  private async nativePutIfAbsent(objectKey: string, body: Uint8Array): Promise<boolean> {
    if (!this.client.presign) return false;
    let url: string;
    try {
      url = this.client.presign(objectKey, { method: "PUT", expiresIn: 60 });
    } catch {
      return false;
    }

    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await this.fetcher(url, {
        method: "PUT",
        headers: { "If-None-Match": "*" },
        body: new Blob([body]),
      });
      if (response.ok) return true;
      const detail = await response.text().catch(() => "");
      if (response.status === 412) throw new KeyExistsError(this.logicalKey(objectKey) ?? objectKey);
      // AWS may return 409 ConditionalRequestConflict for racing conditional
      // writes. Retry with a fresh signature, as recommended by AWS.
      if (response.status === 409 && attempt === 0) {
        url = this.client.presign(objectKey, { method: "PUT", expiresIn: 60 });
        continue;
      }
      if (conditionalUnsupported(response.status, detail)) return false;
      throw new S3StoreError(`conditional S3 PUT failed (${response.status})${detail ? `: ${detail}` : ""}`, response.status);
    }
    return false;
  }

  /**
   * Compatibility fallback for providers/clients without conditional PUT.
   * Calls are serialized within this S3Store, but another process can still
   * win between exists() and write(); callers needing cross-process immutable
   * safety must use a provider that supports If-None-Match: *.
   */
  private fallbackPutIfAbsent(objectKey: string, body: Uint8Array, logicalKey: string): Promise<void> {
    const previous = this.fallbackWrites.get(objectKey) ?? Promise.resolve();
    const run = previous.catch(() => {}).then(async () => {
      if (await this.client.exists(objectKey)) throw new KeyExistsError(logicalKey);
      await this.client.write(objectKey, body);
    });
    this.fallbackWrites.set(objectKey, run);
    return run.finally(() => {
      if (this.fallbackWrites.get(objectKey) === run) this.fallbackWrites.delete(objectKey);
    });
  }
}

function normalizePrefix(prefix: string): string {
  return prefix.replace(/^\/+|\/+$/g, "");
}

function compareBytes(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function conditionalUnsupported(status: number, detail: string): boolean {
  return status === 405 || status === 501 || (status === 400 && /NotImplemented|InvalidRequest/i.test(detail));
}

function isNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { status?: unknown; statusCode?: unknown; code?: unknown; name?: unknown };
  return e.status === 404 || e.statusCode === 404 || e.code === "NoSuchKey" || e.code === "NotFound" || e.name === "NotFound";
}

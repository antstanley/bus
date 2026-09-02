// Post schema, validation, and the canonical byte form (needed now so that
// signatures can be added later without re-shaping stored posts).

import { isUlid, ulidTime } from "./ulid.ts";
import { assertName, InvalidKeyError, keys } from "./keys.ts";
import { decoder } from "./store.ts";

export const POST_VERSION = 1 as const;

/** Hard limits enforced on read so a hostile store writer cannot stall or bloat readers. */
export const LIMITS = {
  /** Max encoded object size accepted by parsePost. */
  maxBytes: 64 * 1024,
  /** Max JSON nesting depth (objects/arrays) anywhere in a post. */
  maxDepth: 8,
  /** Max drift allowed between ts and the ULID timestamp, and max distance of an id into the future. */
  maxSkewMs: 5 * 60_000,
} as const;

export interface ParseOptions {
  /** The store key the object was read from; when given, it must equal keyFor(id). */
  key?: string;
  /** Clock for future-id checks (default Date.now). */
  now?: () => number;
}

export interface Attachment {
  sha256: string;
  name: string;
  size: number;
  type: string;
}

/** Reserved: filled in when signing lands. */
export interface Signature {
  keyId: string;
  alg: string;
  value: string;
}

export interface Post {
  v: typeof POST_VERSION;
  id: string;
  board: string;
  /** Root post id; equals `id` for a root post. */
  thread: string;
  replyTo?: string;
  author: string;
  /** Agent instance (session) that wrote it. */
  instance: string;
  /** ISO-8601 UTC. */
  ts: string;
  title?: string;
  body: string;
  tags?: string[];
  mentions?: string[];
  attachments?: Attachment[];
  sig?: Signature;
  /** Free-form, forward-compatible extension bag. */
  ext?: Record<string, unknown>;
}

export interface NewPost {
  title?: string;
  body: string;
  tags?: string[];
  mentions?: string[];
  attachments?: Attachment[];
  ext?: Record<string, unknown>;
}

export class InvalidPostError extends Error {
  override name = "InvalidPostError";
}

/**
 * Canonical JSON: keys sorted recursively, no whitespace, UTF-8. Two posts
 * with the same content produce identical bytes on every runtime.
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) {
      const val = (v as Record<string, unknown>)[k];
      if (val !== undefined) out[k] = sortKeys(val);
    }
    return out;
  }
  return v;
}

export function encodePost(post: Post): string {
  return canonicalize(post) + "\n";
}

function depthOf(v: unknown, d = 0): number {
  if (d > LIMITS.maxDepth) return d;
  if (Array.isArray(v)) return v.reduce<number>((m, x) => Math.max(m, depthOf(x, d + 1)), d + 1);
  if (v && typeof v === "object") return Object.values(v as object).reduce<number>((m, x) => Math.max(m, depthOf(x, d + 1)), d + 1);
  return d;
}

export function validatePost(x: unknown, opts: ParseOptions = {}): Post {
  if (!x || typeof x !== "object") throw new InvalidPostError("post is not an object");
  if (depthOf(x) > LIMITS.maxDepth) throw new InvalidPostError(`post nesting deeper than ${LIMITS.maxDepth}`);
  const p = x as Record<string, unknown>;
  if (p.v !== POST_VERSION) throw new InvalidPostError(`unsupported post version: ${String(p.v)}`);
  if (!isUlid(p.id)) throw new InvalidPostError("id is not a ulid");
  if (!isUlid(p.thread)) throw new InvalidPostError("thread is not a ulid");
  if (p.replyTo !== undefined && !isUlid(p.replyTo)) throw new InvalidPostError("replyTo is not a ulid");
  if (typeof p.board !== "string" || typeof p.author !== "string") throw new InvalidPostError("board/author missing");
  try { assertName(p.board, "board"); assertName(p.author, "author"); } catch (e) {
    if (e instanceof InvalidKeyError) throw new InvalidPostError(e.message);
    throw e;
  }
  if (typeof p.instance !== "string" || !isUlid(p.instance)) throw new InvalidPostError("instance is not a ulid");
  if (typeof p.ts !== "string" || Number.isNaN(Date.parse(p.ts))) throw new InvalidPostError("ts is not a date");
  const idMs = ulidTime(p.id);
  if (Math.abs(Date.parse(p.ts) - idMs) > LIMITS.maxSkewMs) throw new InvalidPostError("ts disagrees with the id timestamp");
  const now = (opts.now ?? Date.now)();
  if (idMs > now + LIMITS.maxSkewMs) throw new InvalidPostError("id is in the future");
  if (opts.key !== undefined) {
    const expected = keys.post(p.board, p.id, idMs);
    if (opts.key !== expected) throw new InvalidPostError(`object key does not match its id/board (expected ${expected})`);
  }
  if (typeof p.body !== "string") throw new InvalidPostError("body is not a string");
  if (p.title !== undefined && typeof p.title !== "string") throw new InvalidPostError("title is not a string");
  for (const f of ["tags", "mentions"] as const) {
    const v = p[f];
    if (v !== undefined && (!Array.isArray(v) || !v.every((s) => typeof s === "string"))) throw new InvalidPostError(`${f} is not a string[]`);
  }
  if (Array.isArray(p.mentions)) {
    try {
      for (const mention of p.mentions) assertName(mention, "mention");
    } catch (e) {
      if (e instanceof InvalidKeyError) throw new InvalidPostError(e.message);
      throw e;
    }
  }
  return p as unknown as Post;
}

export function parsePost(bytes: Uint8Array, opts: ParseOptions = {}): Post {
  if (bytes.byteLength > LIMITS.maxBytes) throw new InvalidPostError(`post larger than ${LIMITS.maxBytes} bytes`);
  let parsed: unknown;
  try { parsed = JSON.parse(decoder.decode(bytes)); } catch { throw new InvalidPostError("post is not valid JSON"); }
  return validatePost(parsed, opts);
}

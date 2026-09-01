// Post schema, validation, and the canonical byte form (needed now so that
// signatures can be added later without re-shaping stored posts).

import { isUlid } from "./ulid.ts";
import { assertName, InvalidKeyError } from "./keys.ts";
import { decoder } from "./store.ts";

export const POST_VERSION = 1 as const;

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

export function validatePost(x: unknown): Post {
  if (!x || typeof x !== "object") throw new InvalidPostError("post is not an object");
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
  if (typeof p.body !== "string") throw new InvalidPostError("body is not a string");
  if (p.title !== undefined && typeof p.title !== "string") throw new InvalidPostError("title is not a string");
  for (const f of ["tags", "mentions"] as const) {
    const v = p[f];
    if (v !== undefined && (!Array.isArray(v) || !v.every((s) => typeof s === "string"))) throw new InvalidPostError(`${f} is not a string[]`);
  }
  return p as unknown as Post;
}

export function parsePost(bytes: Uint8Array): Post {
  let parsed: unknown;
  try { parsed = JSON.parse(decoder.decode(bytes)); } catch { throw new InvalidPostError("post is not valid JSON"); }
  return validatePost(parsed);
}

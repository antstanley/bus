// Post schema, validation, and the canonical byte form (needed now so that
// signatures can be added later without re-shaping stored posts).
//
// Envelope v2 (task 201, docs/design/envelope-v2.md): all new fields are
// optional and a v1 post stays a valid post whose `act` defaults to "inform".
// Writers bump `v` to 2 only when a v2-only field is set; readers accept both
// versions and run the same validation over both, so a v1 post's canonical
// bytes and validation behaviour are unchanged. Unknown top-level keys are
// rejected (forward-compatible data goes in `ext`) — that is what keeps the
// canonical byte form stable for signing.

import { isUlid, ulidTime } from "./ulid.ts";
import { assertName, assertSegment, InvalidKeyError, keys } from "./keys.ts";
import { decoder } from "./store.ts";

export const POST_VERSION = 1 as const;
export const POST_VERSION_V2 = 2 as const;

/** Versions a reader accepts; see `hasV2Fields` for when a writer bumps to 2. */
export type PostVersion = typeof POST_VERSION | typeof POST_VERSION_V2;

/** Hard limits enforced on read so a hostile store writer cannot stall or bloat readers. */
export const LIMITS = {
  /** Max encoded post size; enforced by `checkEncodedSize` on every post-producing path. */
  maxBytes: 64 * 1024,
  /** Max JSON nesting depth (objects/arrays) anywhere in a post. */
  maxDepth: 8,
  /** Max drift allowed between ts and the ULID timestamp, and max distance of an id into the future. */
  maxSkewMs: 5 * 60_000,
} as const;

/** FIPA-style performatives. Closed set: an unknown act fails validation, so a typo cannot pass as another performative. */
export const ACTS = [
  "request", "inform", "propose", "accept", "reject", "refuse", "agree", "failure", "cancel", "cfp", "status",
] as const;
export type Act = (typeof ACTS)[number];
/** A post without an explicit `act` reads as `inform`; the stored form stays absent. */
export const DEFAULT_ACT: Act = "inform";

/** A2A task states. Only legal on posts whose `act` is "status". */
export const STATUSES = ["submitted", "working", "input-required", "completed", "failed", "canceled", "rejected"] as const;
export type Status = (typeof STATUSES)[number];

export function isAct(x: unknown): x is Act {
  return typeof x === "string" && (ACTS as readonly string[]).includes(x);
}

export function isStatus(x: unknown): x is Status {
  return typeof x === "string" && (STATUSES as readonly string[]).includes(x);
}

/** Media type of `body` when absent. */
export const DEFAULT_CONTENT_TYPE = "text/markdown";

/** v2-only fields: setting any of them makes a post encode as v: 2. */
export const V2_FIELDS = [
  "to", "act", "protocol", "task", "status", "replyBy", "expires", "contentType", "data", "dataSchema", "origin", "trace", "extensions",
] as const;

/** True when any v2-only field is set, i.e. the post must encode as v: 2. */
export function hasV2Fields(p: object): boolean {
  const r = p as Record<string, unknown>;
  return (V2_FIELDS as readonly string[]).some((f) => r[f] !== undefined);
}

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

/** External identity of a bridged message; readers dedup on source+id. Both parts are opaque data. */
export interface PostOrigin {
  source: string;
  id: string;
}

/** W3C trace context (observability, task 603). */
export interface PostTrace {
  traceparent: string;
  tracestate?: string;
}

export interface Post {
  v: PostVersion;
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
  /** --- envelope v2 (task 201); everything below is optional --- */
  /** Addressed recipients (FIPA receiver), distinct from advisory `mentions`. */
  to?: string[];
  /** Performative; absent reads as DEFAULT_ACT ("inform"). */
  act?: Act;
  /** Interaction protocol id, e.g. "request", "contract-net", "a2a-task". */
  protocol?: string;
  /** The root request post id this message belongs to (A2A taskId). */
  task?: string;
  /** A2A task state; only legal when act === "status". */
  status?: Status;
  /** Deadline (FIPA reply-by), RFC3339-parseable. */
  replyBy?: string;
  /** After this readers may skip and GC may drop; a past value is legal. */
  expires?: string;
  /** Media type of `body`; absent means DEFAULT_CONTENT_TYPE. */
  contentType?: string;
  /** Structured payload (A2A data part); counted toward the depth/size limits. Data is data: never spliced into keys or rendered content. */
  data?: Record<string, unknown>;
  /** Schema for `data` (CloudEvents dataschema), an absolute URI. */
  dataSchema?: string;
  /** External id of a bridged message; dedup on source+id. */
  origin?: PostOrigin;
  /** W3C trace context. */
  trace?: PostTrace;
  /** A2A-style extension URIs this message uses. */
  extensions?: string[];
}

export interface NewPost {
  title?: string;
  body: string;
  tags?: string[];
  mentions?: string[];
  attachments?: Attachment[];
  ext?: Record<string, unknown>;
  /** --- envelope v2 --- */
  to?: string[];
  act?: Act;
  protocol?: string;
  task?: string;
  status?: Status;
  replyBy?: string;
  expires?: string;
  contentType?: string;
  data?: Record<string, unknown>;
  dataSchema?: string;
  origin?: PostOrigin;
  trace?: PostTrace;
  extensions?: string[];
}

export class InvalidPostError extends Error {
  override name = "InvalidPostError";
}

/** Every top-level key a post may carry; anything else is rejected on read so the canonical form stays stable for signing. */
const KNOWN_KEYS: ReadonlySet<string> = new Set([
  // v1
  "v", "id", "board", "thread", "replyTo", "author", "instance", "ts", "title", "body", "tags", "mentions", "attachments", "sig", "ext",
  // v2
  ...V2_FIELDS,
]);

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

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isDateString(v: unknown): v is string {
  // Same bar as `ts`: must parse as a date (RFC3339 in practice).
  return typeof v === "string" && !Number.isNaN(Date.parse(v));
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((s) => typeof s === "string");
}

/** Absolute URI: scheme + ":" + no whitespace. Deliberately light; the value is data. */
const URI = /^[A-Za-z][A-Za-z0-9+.-]*:\S*$/;

/** MIME media type: type "/" subtype with optional ";" parameters (RFC 2045 token characters). */
const MIME = /^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*(;.*)?$/;

/** Traceparent shape sanity (version-traceid-spanid-flags, lowercase hex). Deliberately not full W3C validation. */
const TRACEPARENT = /^[0-9a-f]{2}-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/;

/**
 * Re-throw a key error as the uniform post error (message kept); anything else
 * passes through. Writers over post fields (to, mentions) use this so callers
 * only ever see InvalidPostError from post validation.
 */
export function invalidKey(e: unknown): never {
  if (e instanceof InvalidKeyError) throw new InvalidPostError(e.message);
  throw e;
}

/**
 * The one encoded-size guard, shared by every post-producing path —
 * `parsePost` (read side), `Board.write` (write side), and `fromCloudEvent`
 * (interop) — so the limit has a single source and no path can emit a post
 * readers would have to skip.
 */
export function checkEncodedSize(bytes: Uint8Array): void {
  if (bytes.byteLength > LIMITS.maxBytes) throw new InvalidPostError(`post larger than ${LIMITS.maxBytes} bytes`);
}

export function validatePost(x: unknown, opts: ParseOptions = {}): Post {
  if (!x || typeof x !== "object") throw new InvalidPostError("post is not an object");
  if (depthOf(x) > LIMITS.maxDepth) throw new InvalidPostError(`post nesting deeper than ${LIMITS.maxDepth}`);
  const p = x as Record<string, unknown>;
  if (p.v !== POST_VERSION && p.v !== POST_VERSION_V2) throw new InvalidPostError(`unsupported post version: ${String(p.v)}`);
  for (const k of Object.keys(p)) {
    if (!KNOWN_KEYS.has(k)) throw new InvalidPostError(`unknown post field: ${k}`);
  }
  if (!isUlid(p.id)) throw new InvalidPostError("id is not a ulid");
  if (!isUlid(p.thread)) throw new InvalidPostError("thread is not a ulid");
  if (p.replyTo !== undefined && !isUlid(p.replyTo)) throw new InvalidPostError("replyTo is not a ulid");
  if (typeof p.board !== "string" || typeof p.author !== "string") throw new InvalidPostError("board/author missing");
  try { assertName(p.board, "board"); assertName(p.author, "author"); } catch (e) { invalidKey(e); }
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
    if (v !== undefined && !isStringArray(v)) throw new InvalidPostError(`${f} is not a string[]`);
  }
  if (Array.isArray(p.mentions)) {
    try {
      for (const mention of p.mentions) assertName(mention, "mention");
    } catch (e) { invalidKey(e); }
  }
  // --- envelope v2 (task 201). Every check is guarded by !== undefined, so a
  // v1 post validates exactly as before.
  if (p.to !== undefined) {
    if (!isStringArray(p.to)) throw new InvalidPostError("to is not a string[]");
    try {
      for (const name of p.to) assertName(name, "to");
    } catch (e) { invalidKey(e); }
  }
  if (p.act !== undefined && !isAct(p.act)) throw new InvalidPostError(`unknown act: ${String(p.act)}`);
  if (p.protocol !== undefined) {
    if (typeof p.protocol !== "string") throw new InvalidPostError("protocol is not a string");
    try { assertSegment(p.protocol, "protocol"); } catch (e) { invalidKey(e); }
  }
  if (p.task !== undefined && !isUlid(p.task)) throw new InvalidPostError("task is not a ulid");
  if (p.status !== undefined) {
    if (!isStatus(p.status)) throw new InvalidPostError(`unknown status: ${String(p.status)}`);
    if (p.act !== "status") {
      throw new InvalidPostError(`status is only valid when act is "status" (got ${p.act === undefined ? "no act" : String(p.act)})`);
    }
  }
  if (p.replyBy !== undefined && !isDateString(p.replyBy)) throw new InvalidPostError("replyBy is not a date");
  if (p.expires !== undefined && !isDateString(p.expires)) throw new InvalidPostError("expires is not a date");
  if (p.contentType !== undefined && (typeof p.contentType !== "string" || !MIME.test(p.contentType))) {
    throw new InvalidPostError(`contentType is not a MIME type: ${String(p.contentType)}`);
  }
  if (p.dataSchema !== undefined && (typeof p.dataSchema !== "string" || !URI.test(p.dataSchema))) {
    throw new InvalidPostError(`dataSchema is not a URI: ${String(p.dataSchema)}`);
  }
  if (p.extensions !== undefined) {
    if (!isStringArray(p.extensions)) throw new InvalidPostError("extensions is not a string[]");
    for (const uri of p.extensions) {
      if (!URI.test(uri)) throw new InvalidPostError(`extension is not a URI: ${String(uri)}`);
    }
  }
  if (p.data !== undefined && !isPlainObject(p.data)) throw new InvalidPostError("data is not an object");
  if (p.origin !== undefined) {
    const o = p.origin;
    if (!isPlainObject(o) || typeof o.source !== "string" || o.source === "" || typeof o.id !== "string" || o.id === "") {
      throw new InvalidPostError("origin must be {source, id} with non-empty strings");
    }
  }
  if (p.trace !== undefined) {
    const t = p.trace;
    if (!isPlainObject(t) || typeof t.traceparent !== "string" || !TRACEPARENT.test(t.traceparent)) {
      throw new InvalidPostError("trace.traceparent is not a valid traceparent");
    }
    if (t.tracestate !== undefined && (typeof t.tracestate !== "string" || t.tracestate === "")) {
      throw new InvalidPostError("trace.tracestate is not a non-empty string");
    }
  }
  return p as unknown as Post;
}

export function parsePost(bytes: Uint8Array, opts: ParseOptions = {}): Post {
  checkEncodedSize(bytes);
  let parsed: unknown;
  try { parsed = JSON.parse(decoder.decode(bytes)); } catch { throw new InvalidPostError("post is not valid JSON"); }
  return validatePost(parsed, opts);
}

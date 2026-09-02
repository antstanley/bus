import {
  assertName,
  canonicalize,
  decoder,
  encoder,
  isUlid,
  keys,
  listAll,
  type Store,
} from "@board/core";

export const PRESENCE_VERSION = 1 as const;
export const PRESENCE_MAX_BYTES = 64 * 1024;
export const PRESENCE_MAX_FIELD_BYTES = 1_024;
export const DEFAULT_WHO_LIMIT = 200;
export const MAX_WHO_LIMIT = 1_000;
/**
 * Records whose ts is more than this far in the future are never online: the
 * same 5-minute clock-skew allowance the core post validator applies to
 * ts-vs-id. Guard against an attacker-supplied far-future ts pinning a record
 * online indefinitely.
 */
export const PRESENCE_MAX_FUTURE_SKEW_MS = 300_000;

export class InvalidPresenceError extends Error {
  override name = "InvalidPresenceError";
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

export interface HeartbeatOptions {
  name: string;
  /** ULID minted once for this process or session. */
  instance: string;
  status?: string;
  tool?: string;
  host?: string;
  runtime?: string;
  sessionId?: string;
  socket?: string;
  cmuxSurface?: string;
  serverUrl?: string;
  /** Injectable clock for deterministic callers and tests. */
  now?: () => number;
}

export interface PresenceRecord {
  v: typeof PRESENCE_VERSION;
  name: string;
  instance: string;
  ts: string;
  status?: string;
  tool?: string;
  host?: string;
  runtime?: string;
  sessionId?: string;
  socket?: string;
  cmuxSurface?: string;
  serverUrl?: string;
}

export interface Presence extends PresenceRecord {
  online: boolean;
}

export interface WhoOptions {
  maxAgeMs: number;
  /** Maximum store records examined in one call. Defaults to 200, max 1,000. */
  limit?: number;
  /** Injectable clock for deterministic callers and tests. */
  now?: () => number;
}

export interface PresencePage {
  records: Presence[];
  /** More presence keys exist than this bounded read examined. */
  truncated: boolean;
}

/** Write this session's owner-only heartbeat file. */
export async function heartbeat(store: Store, opts: HeartbeatOptions): Promise<PresenceRecord> {
  try {
    assertName(opts.name, "agent");
    if (!isUlid(opts.instance)) throw new Error("instance is not a ulid");
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "invalid presence identity";
    throw new InvalidPresenceError(message, { cause });
  }
  for (const [field, value] of [
    ["status", opts.status],
    ["tool", opts.tool],
    ["host", opts.host],
    ["runtime", opts.runtime],
    ["sessionId", opts.sessionId],
    ["socket", opts.socket],
    ["cmuxSurface", opts.cmuxSurface],
    ["serverUrl", opts.serverUrl],
  ] as const) {
    if (value !== undefined && typeof value !== "string") throw new InvalidPresenceError(`${field} is not a string`);
    if (value !== undefined && encoder.encode(value).byteLength > PRESENCE_MAX_FIELD_BYTES) {
      throw new InvalidPresenceError(`${field} is larger than ${PRESENCE_MAX_FIELD_BYTES} bytes`);
    }
  }

  const record: PresenceRecord = {
    v: PRESENCE_VERSION,
    name: opts.name,
    instance: opts.instance,
    ts: new Date((opts.now ?? Date.now)()).toISOString(),
  };
  if (opts.status !== undefined) record.status = opts.status;
  if (opts.tool !== undefined) record.tool = opts.tool;
  if (opts.host !== undefined) record.host = opts.host;
  if (opts.runtime !== undefined) record.runtime = opts.runtime;
  if (opts.sessionId !== undefined) record.sessionId = opts.sessionId;
  if (opts.socket !== undefined) record.socket = opts.socket;
  if (opts.cmuxSurface !== undefined) record.cmuxSurface = opts.cmuxSurface;
  if (opts.serverUrl !== undefined) record.serverUrl = opts.serverUrl;

  const encoded = canonicalize(record) + "\n";
  if (encoder.encode(encoded).byteLength > PRESENCE_MAX_BYTES) {
    throw new InvalidPresenceError(`presence record is larger than ${PRESENCE_MAX_BYTES} bytes`);
  }

  // keys.presence validates the agent name and instance path segments. This is
  // intentionally an overwrite: exactly one process owns an instance file.
  await store.put(keys.presence(opts.name, opts.instance), encoded);
  return record;
}

/** List valid heartbeats and derive online state from their age. */
export async function who(store: Store, opts: WhoOptions): Promise<Presence[]> {
  return (await whoPage(store, opts)).records;
}

/** List a bounded page of presence while reporting whether more keys exist. */
export async function whoPage(store: Store, opts: WhoOptions): Promise<PresencePage> {
  if (!Number.isFinite(opts.maxAgeMs) || opts.maxAgeMs < 0) {
    throw new InvalidPresenceError("maxAgeMs must be a non-negative finite number");
  }
  const limit = opts.limit ?? DEFAULT_WHO_LIMIT;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_WHO_LIMIT) {
    throw new InvalidPresenceError(`limit must be an integer between 1 and ${MAX_WHO_LIMIT}`);
  }
  const now = (opts.now ?? Date.now)();
  const result: Presence[] = [];
  let batch: string[] = [];
  let examined = 0;
  let truncated = false;

  for await (const key of listAll(store, keys.presencePrefix(), undefined, Math.min(limit, DEFAULT_WHO_LIMIT))) {
    if (examined >= limit) {
      truncated = true;
      break;
    }
    examined++;
    batch.push(key);
    if (batch.length === 8) {
      result.push(...await readBatch(store, batch, now, opts.maxAgeMs));
      batch = [];
    }
  }
  if (batch.length) result.push(...await readBatch(store, batch, now, opts.maxAgeMs));

  return {
    records: result.sort((a, b) => compare(a.name, b.name) || compare(a.instance, b.instance)),
    truncated,
  };
}

async function readBatch(store: Store, batch: string[], now: number, maxAgeMs: number): Promise<Presence[]> {
  const records = await Promise.all(batch.map(async (key): Promise<Presence | null> => {
    const path = presencePath(key);
    if (!path) return null;
    try {
      const bytes = await store.get(key);
      if (!bytes) return null;
      const record = parsePresence(bytes, path.name, path.instance);
      if (!record) return null;
      const age = now - Date.parse(record.ts);
      // A future ts beyond a small clock-skew allowance must not pin a record
      // online: an attacker-chosen far-future timestamp would otherwise keep
      // it fresh indefinitely (negative age passes the max-age check).
      return { ...record, online: age >= -PRESENCE_MAX_FUTURE_SKEW_MS && age <= maxAgeMs };
    } catch {
      // Presence is advisory and best-effort. A deleted object or one failed
      // remote read must not hide every other agent.
      return null;
    }
  }));
  return records.filter((record): record is Presence => record !== null);
}

function presencePath(key: string): { name: string; instance: string } | null {
  const parts = key.split("/");
  if (parts.length !== 4 || parts[0] !== "agents" || parts[2] !== "presence" || !parts[3]?.endsWith(".json")) return null;
  const name = parts[1]!;
  const instance = parts[3].slice(0, -5);
  try {
    if (keys.presence(name, instance) !== key) return null;
  } catch {
    return null;
  }
  return { name, instance };
}

function parsePresence(bytes: Uint8Array, pathName: string, pathInstance: string): PresenceRecord | null {
  if (bytes.byteLength > PRESENCE_MAX_BYTES) return null;
  let value: unknown;
  try {
    value = JSON.parse(decoder.decode(bytes));
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const p = value as Record<string, unknown>;
  if (p.v !== PRESENCE_VERSION || p.name !== pathName || p.instance !== pathInstance || !isUlid(p.instance)) return null;
  if (typeof p.ts !== "string" || !Number.isFinite(Date.parse(p.ts))) return null;
  for (const field of ["status", "tool", "host", "runtime", "sessionId", "socket", "cmuxSurface", "serverUrl"] as const) {
    if (p[field] !== undefined && typeof p[field] !== "string") return null;
    if (typeof p[field] === "string" && encoder.encode(p[field]).byteLength > PRESENCE_MAX_FIELD_BYTES) return null;
  }

  const record: PresenceRecord = {
    v: PRESENCE_VERSION,
    name: pathName,
    instance: pathInstance,
    ts: p.ts,
  };
  if (typeof p.status === "string") record.status = p.status;
  if (typeof p.tool === "string") record.tool = p.tool;
  if (typeof p.host === "string") record.host = p.host;
  if (typeof p.runtime === "string") record.runtime = p.runtime;
  if (typeof p.sessionId === "string") record.sessionId = p.sessionId;
  if (typeof p.socket === "string") record.socket = p.socket;
  if (typeof p.cmuxSurface === "string") record.cmuxSurface = p.cmuxSurface;
  if (typeof p.serverUrl === "string") record.serverUrl = p.serverUrl;
  return record;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

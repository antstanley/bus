import {
  assertName,
  canonicalize,
  decoder,
  isUlid,
  keys,
  listAll,
  type Store,
} from "@board/core";

export const PRESENCE_VERSION = 1 as const;

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
}

export interface Presence extends PresenceRecord {
  online: boolean;
}

export interface WhoOptions {
  maxAgeMs: number;
  /** Injectable clock for deterministic callers and tests. */
  now?: () => number;
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
  for (const [field, value] of [["status", opts.status], ["tool", opts.tool], ["host", opts.host]] as const) {
    if (value !== undefined && typeof value !== "string") throw new InvalidPresenceError(`${field} is not a string`);
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

  // keys.presence validates the agent name and instance path segments. This is
  // intentionally an overwrite: exactly one process owns an instance file.
  await store.put(keys.presence(opts.name, opts.instance), canonicalize(record) + "\n");
  return record;
}

/** List valid heartbeats and derive online state from their age. */
export async function who(store: Store, opts: WhoOptions): Promise<Presence[]> {
  if (!Number.isFinite(opts.maxAgeMs) || opts.maxAgeMs < 0) {
    throw new InvalidPresenceError("maxAgeMs must be a non-negative finite number");
  }
  const now = (opts.now ?? Date.now)();
  const result: Presence[] = [];
  let batch: string[] = [];

  for await (const key of listAll(store, keys.presencePrefix())) {
    batch.push(key);
    if (batch.length === 8) {
      result.push(...await readBatch(store, batch, now, opts.maxAgeMs));
      batch = [];
    }
  }
  if (batch.length) result.push(...await readBatch(store, batch, now, opts.maxAgeMs));

  return result.sort((a, b) => compare(a.name, b.name) || compare(a.instance, b.instance));
}

async function readBatch(store: Store, batch: string[], now: number, maxAgeMs: number): Promise<Presence[]> {
  const records = await Promise.all(batch.map(async (key): Promise<Presence | null> => {
    const path = presencePath(key);
    if (!path) return null;
    try {
      const bytes = await store.get(key);
      if (!bytes) return null;
      const record = parsePresence(bytes, path.name, path.instance);
      return record ? { ...record, online: now - Date.parse(record.ts) <= maxAgeMs } : null;
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
  for (const field of ["status", "tool", "host"] as const) {
    if (p[field] !== undefined && typeof p[field] !== "string") return null;
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
  return record;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

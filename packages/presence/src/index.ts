import {
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
  if (!isUlid(opts.instance)) throw new InvalidPresenceError("instance is not a ulid");
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

  for await (const key of listAll(store, keys.presencePrefix())) {
    const path = presencePath(key);
    if (!path) continue;
    const bytes = await store.get(key);
    if (!bytes) continue;
    const record = parsePresence(bytes, path.name, path.instance);
    if (!record) continue;
    result.push({ ...record, online: now - Date.parse(record.ts) <= opts.maxAgeMs });
  }

  return result.sort((a, b) => a.name.localeCompare(b.name) || a.instance.localeCompare(b.instance));
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

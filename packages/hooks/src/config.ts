import {
  InvalidSessionIdError,
  assertName,
  assertRuntimeSessionId,
  isSessionIdRuntime,
  type Store,
} from "@board/core";
import { createStore, parseStoreSpec } from "@board/cli";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface HookPayload {
  [key: string]: unknown;
}

export interface BoardHookConfig {
  store: string;
  boards: string[];
  indexPath: string;
  maxOutputBytes: number;
}

export interface PresenceDeliveryTargets {
  sessionId?: string;
  socket?: string;
  cmuxSurface?: string;
}

export interface ConfigOptions {
  env?: Record<string, string | undefined>;
  configPath?: string;
  home?: string;
}

const AGENT_BINARIES = new Set([
  "claude", "codex", "letta", "gemini", "aider", "opencode", "pi", "amp", "cursor-agent", "goose",
]);

/** Load shared board-hook configuration. BOARD_STORE always wins over disk. */
export async function loadHookConfig(options: ConfigOptions = {}): Promise<BoardHookConfig> {
  const env = options.env ?? process.env;
  const home = options.home ?? env.HOME ?? homedir();
  const configPath = options.configPath ?? env.BOARD_CONFIG ?? join(home, ".board", "config.json");
  let disk: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(await readFile(configPath, "utf8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) disk = parsed as Record<string, unknown>;
  } catch (error) {
    if (env.BOARD_STORE === undefined) throw error;
  }

  const store = env.BOARD_STORE ?? stringValue(disk.store);
  if (!store) throw new Error("board store is not configured");

  const configuredBoards = env.BOARD_BOARDS?.split(",") ?? arrayValue(disk.boards)
    ?? (stringValue(disk.board) ? [stringValue(disk.board)!] : ["general"]);
  const boards = [...new Set(configuredBoards.map((board) => assertName(board.trim(), "board")))];
  if (boards.length === 0) throw new Error("at least one board must be configured");

  const indexPath = env.BOARD_INDEX ?? stringValue(disk.indexPath) ?? join(home, ".board", "index.sqlite");
  const rawCap = env.BOARD_MAX_OUTPUT_BYTES ?? numberValue(disk.maxOutputBytes) ?? 4096;
  const maxOutputBytes = typeof rawCap === "string" ? Number(rawCap) : rawCap;
  if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 256) {
    throw new Error("maxOutputBytes must be an integer of at least 256");
  }
  return { store, boards, indexPath, maxOutputBytes };
}

/** Open the Store selected by BOARD_STORE or ~/.board/config.json. */
export async function openConfiguredStore(config: BoardHookConfig): Promise<Store> {
  return createStore(parseStoreSpec(config.store));
}

/** Resolve the receiving author. An explicit BOARD_AS is authoritative. */
export function resolveIdentity(
  payload: HookPayload,
  env: Record<string, string | undefined> = process.env,
): string {
  const explicit = env.BOARD_AS;
  if (explicit) return assertName(explicit, "agent");

  const runtime = resolveRuntime(payload, env);
  if (!runtime) throw new Error("cannot determine hook identity; set BOARD_AS");
  return assertName(runtime, "agent");
}

/** Identify the invoking agent runtime for presence metadata. */
export function resolveRuntime(
  payload: HookPayload,
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const evidence = new Set<string>();
  for (const key of ["runtime", "tool", "agent_type", "agentType"] as const) {
    const candidate = payload[key];
    if (typeof candidate === "string") {
      // The presence of an explicit runtime token is authoritative even when
      // it is empty or invalid. Never let ambient environment turn an
      // ambiguous payload into a different identity.
      const runtime = normalizeRuntime(candidate);
      if (!runtime) return undefined;
      evidence.add(runtime);
    }
  }
  if (typeof payload.event_type === "string"
    && (typeof payload.agent_id === "string" || typeof payload.conversation_id === "string")) evidence.add("letta");
  if (env.LETTA_AGENT_ID || env.AGENT_ID || env.CONVERSATION_ID) evidence.add("letta");
  if (env.CODEX_THREAD_ID || env.CODEX_SESSION_ID) evidence.add("codex");
  if (env.CLAUDE_PROJECT_DIR || env.CLAUDE_CODE_ENTRYPOINT || env.CLAUDE_SESSION_ID) evidence.add("claude");
  if (env.PI_SESSION_ID) evidence.add("pi");
  return evidence.size === 1 ? evidence.values().next().value : undefined;
}

/** Extract non-secret addresses that identify and reach this exact session. */
export function resolveDeliveryTargets(
  payload: HookPayload,
  env: Record<string, string | undefined> = process.env,
  runtime?: string,
): PresenceDeliveryTargets {
  const rawSessionId = firstString(
    payload,
    "session_id",
    "sessionId",
    "thread_id",
    "threadId",
    "conversation_id",
    "conversationId",
  ) ?? runtimeSessionId(runtime, env);
  let sessionId: string | undefined;
  if (rawSessionId !== undefined) {
    if (!isSessionIdRuntime(runtime)) {
      throw new InvalidSessionIdError("session id requires a supported runtime");
    }
    sessionId = assertRuntimeSessionId(runtime, rawSessionId);
  }
  const socket = runtime === "claude"
    ? firstString(payload, "socket", "messaging_socket", "messagingSocket") ?? nonEmpty(env.CLAUDE_CODE_MESSAGING_SOCKET)
    : undefined;
  const cmuxSurface = firstString(payload, "cmux_surface", "cmuxSurface", "surface_id", "surfaceId")
    ?? nonEmpty(env.CMUX_SURFACE_ID);
  return {
    ...(sessionId === undefined ? {} : { sessionId }),
    ...(socket === undefined ? {} : { socket }),
    ...(cmuxSurface === undefined ? {} : { cmuxSurface }),
  };
}

/** Return a stable, valid ULID-shaped instance id for one hook session. */
export function resolveInstance(payload: HookPayload, identity: string, runtime?: string): string {
  const supplied = payload.instance;
  if (typeof supplied === "string" && /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(supplied)) return supplied;
  const session = firstString(payload, "session_id", "sessionId", "thread_id", "threadId", "agent_id", "agentId")
    ?? String(process.ppid);
  const hash = new Bun.CryptoHasher("sha256").update(`${identity}\0${runtime ?? "unknown"}\0${session}`).digest();
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  let out = "0";
  for (let i = 0; out.length < 26; i++) out += alphabet[hash[i % hash.length]! % 32];
  return out;
}

function runtimeSessionId(runtime: string | undefined, env: Record<string, string | undefined>): string | undefined {
  if (runtime === "claude") return nonEmpty(env.CLAUDE_SESSION_ID);
  if (runtime === "codex") return nonEmpty(env.CODEX_THREAD_ID) ?? nonEmpty(env.CODEX_SESSION_ID);
  if (runtime === "letta") return nonEmpty(env.CONVERSATION_ID) ?? nonEmpty(env.LETTA_CONVERSATION_ID);
  if (runtime === "pi") return nonEmpty(env.PI_SESSION_ID);
  return undefined;
}

function nonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value.length === 0 ? undefined : value;
}

function normalizeRuntime(value: string): string | undefined {
  const base = value.trim().toLowerCase().split(/[\\/\s]/).at(-1)?.replace(/\.(?:exe|js|ts)$/, "");
  if (!base) return undefined;
  if (AGENT_BINARIES.has(base)) return base;
  return undefined;
}

function firstString(payload: HookPayload, ...keys: string[]): string | undefined {
  for (const key of keys) if (typeof payload[key] === "string" && payload[key]) return payload[key];
  return undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function arrayValue(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

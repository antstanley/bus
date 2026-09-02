/** Runtimes whose session identifiers are published in presence records. */
export const SESSION_ID_RUNTIMES = ["claude", "codex", "letta", "opencode", "pi"] as const;

export type SessionIdRuntime = typeof SESSION_ID_RUNTIMES[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPAQUE_RUNTIME_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;

export class InvalidSessionIdError extends Error {
  override name = "InvalidSessionIdError";
}

export function isSessionIdRuntime(runtime: string | undefined): runtime is SessionIdRuntime {
  return runtime !== undefined && (SESSION_ID_RUNTIMES as readonly string[]).includes(runtime);
}

/**
 * Claude and Codex expose UUID session/thread ids. Letta, OpenCode, and Pi
 * expose runtime-owned opaque ids; those are bounded ASCII tokens so they can
 * be stored, logged through an encoded label, and passed as one argv element.
 */
export function isRuntimeSessionId(runtime: SessionIdRuntime, value: unknown): value is string {
  if (typeof value !== "string") return false;
  return runtime === "claude" || runtime === "codex" ? UUID.test(value) : OPAQUE_RUNTIME_ID.test(value);
}

export function assertRuntimeSessionId(runtime: SessionIdRuntime, value: unknown): string {
  if (isRuntimeSessionId(runtime, value)) return value;
  if (runtime === "claude" || runtime === "codex") {
    throw new InvalidSessionIdError(`${runtime} session id must be a UUID`);
  }
  throw new InvalidSessionIdError(
    `${runtime} session id must be a 1-256 character ASCII token starting with a letter or digit`,
  );
}

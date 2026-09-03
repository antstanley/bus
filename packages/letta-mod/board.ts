// board mod for Letta Code — tasks 107 + 124
//
// Registers board_post / board_read / board_who tools and injects unread
// board mentions at turn_start. Installed at ~/.letta/mods/board.ts.
// Opt-in (task 124): a timer polls for new mentions while the session is
// idle and, when one arrives, sends a pointer-only wake through a captured
// conversation handle. See the "Timer wake" block below and the README.
//
// The mod is a thin driver over this checkout's board CLI and hook: it never
// links @board/* packages (mods load outside any workspace) and never sees
// store credentials beyond what the shared ~/.board/config.json already
// holds. Because the host interpreter may be Node (Letta Code loads mods
// under Node) while the entrypoints are Bun/TypeScript sources, children are
// always spawned through bun (BOARD_BUN / config "bun" override), with
// argument arrays — no shell interpolation.

import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readdir, readFile, rename, rmdir, stat, unlink, utimes, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const DEFAULT_REPO = "/Volumes/Delorean/code/sidekick/tmp";
const CONFIG_PATH = process.env.BOARD_CONFIG ?? join(homedir(), ".board", "config.json");
const DEFAULT_SPAWN_TIMEOUT_MS = 10_000;

interface BoardConfig {
  repo?: string;
  store?: string;
  boards?: string[] | string;
  board?: string;
  as?: string;
  indexPath?: string;
  maxOutputBytes?: number | string;
  bun?: string;
  spawnTimeoutMs?: number | string;
  // Timer wake (task 124) — all optional, all off/conservative by default.
  timerWake?: boolean | string;
  timerPollMs?: number | string;
  timerBackoffCapMs?: number | string;
  timerLeaseTtlMs?: number | string;
  timerRetryMs?: number | string;
  timerSendTimeoutMs?: number | string;
  timerTrace?: string;
}

// ─── Timer wake state (module level, per Letta session process) ──────────────
// The conversation handle must be captured from an event ctx — activation gets
// none (docs/research/06). It is re-captured on every turn_start /
// conversation_open / turn_end dispatch (fresh handle per event, conservative
// across conversation switches), scoped PER CONVERSATION ID, and dropped on
// conversation_close. Every activate() bumps a generation counter and stamps
// it onto captured sessions; a timer only ever fires at a session captured
// under its own activation's generation, so a /reload re-activation of this
// module never wakes at a handle from an older activation — and never at a
// handle captured for a different conversation id.
// Runs happen while a turn is being submitted; when the host emits turn_end we
// know the run finished, otherwise (bidirectional headless, host 0.31.8/0.31.11
// never emits it) idle-ness is proven only by the server accepting a send — a
// 409 means busy, so back off and retry.
interface TimerWakeSession {
  conversation: any;
  conversationId: string | null;
  runInFlight: boolean;
  sawTurnEnd: boolean;
  generation: number;
}
const wakeSessions = new Map<string, TimerWakeSession>(); // keyed by conversation id
let wakeUnnamedSession: TimerWakeSession | null = null; // host that exposes no conversation.id
let wakeCurrent: TimerWakeSession | null = null; // most recent capture: the tick's target
let wakeGeneration = 0;

/** The session a dispatch belongs to: keyed by the ctx conversation id, with a
 * fallback to the most recent capture when a legacy host sends no handle. */
function timerSessionFromCtx(ctx: any): TimerWakeSession | null {
  const conversation = ctx?.conversation;
  const conversationId = conversation && typeof conversation.id === "string" && conversation.id.length > 0
    ? conversation.id
    : null;
  if (conversationId !== null) return wakeSessions.get(conversationId) ?? null;
  if (conversation) return wakeUnnamedSession;
  return wakeCurrent;
}

/** Record ctx.conversation if it is a usable handle (re-capture per event).
 * Run flags observed for the same conversation id survive the re-capture.
 * The handle is stamped with the generation of the activation whose handler
 * is dispatching, so each activation only ever fires at its own captures. */
function noteConversation(ctx: any, opts: { resetRun?: boolean; generation?: number } = {}): void {
  const conversation = ctx?.conversation;
  if (!conversation || typeof conversation.sendMessageStream !== "function") return;
  const conversationId = typeof conversation.id === "string" && conversation.id.length > 0 ? conversation.id : null;
  const previous = conversationId !== null ? wakeSessions.get(conversationId) : wakeUnnamedSession;
  const session: TimerWakeSession = {
    conversation,
    conversationId,
    runInFlight: previous?.runInFlight ?? false,
    sawTurnEnd: previous?.sawTurnEnd ?? false,
    generation: opts.generation ?? wakeGeneration,
  };
  if (opts.resetRun) session.runInFlight = false; // a freshly opened conversation has no run yet
  if (conversationId !== null) wakeSessions.set(conversationId, session);
  else wakeUnnamedSession = session;
  wakeCurrent = session;
}

/** conversation_close: drop the closed conversation's session so the timer can
 * never send on a stale handle. If the event identifies no conversation, drop
 * everything (conservative — the pre-124 singleton behavior). */
function dropConversation(ctx: any): void {
  const conversation = ctx?.conversation;
  const conversationId = conversation && typeof conversation.id === "string" && conversation.id.length > 0
    ? conversation.id
    : null;
  if (conversationId !== null) {
    wakeSessions.delete(conversationId);
    if (wakeUnnamedSession?.conversationId === conversationId) wakeUnnamedSession = null;
  } else {
    wakeSessions.clear();
    wakeUnnamedSession = null;
  }
  if (wakeCurrent && (conversationId === null || wakeCurrent.conversationId === conversationId)) {
    wakeCurrent = null;
  }
}

// ULIDs encode creation time in their first 10 chars (Crockford base32). The
// timer uses this to ignore posts that predate activation on its baseline poll.
const ULID_TIME_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function ulidTimeMs(id: string): number | null {
  if (id.length < 10) return null;
  let ms = 0;
  for (let index = 0; index < 10; index += 1) {
    const digit = ULID_TIME_ALPHABET.indexOf(id[index]!.toUpperCase());
    if (digit < 0) return null;
    ms = ms * 32 + digit;
  }
  return ms;
}

// Strict CANONICAL ULID: 26 UPPERCASE Crockford-base32 chars (no I, L, O, U).
// Canonical only: the store mints uppercase ids (packages/core/src/ulid.ts),
// and the pointer-only invariant demands the nudge interpolate a strictly
// canonical id — a lowercase look-alike is skipped + warned, never nudged.
const STRICT_ULID_RE = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$/;
// A well-shaped ULID can still encode nonsense time. The timer additionally
// requires the DECODED millisecond timestamp to be plausible: not before the
// format's era and not meaningfully in the future (the 5-minute skew matches
// the trust model's ts-skew allowance in docs/research/04).
const ULID_FLOOR_MS = 1_577_836_800_000; // 2020-01-01T00:00:00Z
const ULID_SKEW_MS = 5 * 60_000;
function isPlausibleUlid(id: string): boolean {
  if (!STRICT_ULID_RE.test(id)) return false;
  const ms = ulidTimeMs(id);
  return ms !== null && ms >= ULID_FLOOR_MS && ms <= Date.now() + ULID_SKEW_MS;
}
// Agent-name shape per DESIGN.md ("names by [a-z0-9_-]{1,32}"): the identity
// is the only non-id value the nudge text interpolates, so it must match the
// DESIGN grammar exactly before any nudge is composed.
const AGENT_NAME_RE = /^[a-z0-9_-]{1,32}$/;

const sleep = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

/** A sleep that wakes early when `signal` aborts — the 409 retry backoff must
 * not keep a disposed timer's tick alive past its teardown. */
function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) { resolve(); return; }
    const finish = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal?.addEventListener("abort", finish);
  });
}

// ─── Timer wake lease file + cross-process lock ──────────────────────────────
// The lease file ("<indexPath>.timerwake.json") is written by the timer AND by
// the turn_start injection marker — and by every Letta session process that
// shares the indexPath — so the atomic rename of the file alone is not
// claim-once: two processes can both read-modify-write and the second rename
// silently drops the first writer's update. Every read-modify-write therefore
// runs under the mutex below and RELOADS the state from the file while holding
// it. Shape: a lock DIRECTORY next to the lease file (mkdir is atomic
// exclusive-create on macOS/Linux) whose single "owner-<token>" file is
// created with O_EXCL semantics; a loser waits, and past a stale-lease TTL
// that the holder keeps renewing while it runs, it displaces the dead owner
// via a verified rename-aside. Same protocol as the hook index lock in
// packages/hooks (sqlite BEGIN IMMEDIATE there covers the same race for the
// claim store), implemented with Node built-ins only because mods may load
// under Node. The lock only guards fast read-modify-write sections — never a
// send.

interface WakeLease {
  expiresAt: number;
  /** Fencing token minted by the reserving wake (one per reserve section).
   * Renew, recheck, commit and release are all conditional on owning this
   * token, so a stalled process's late write can never clobber the state a
   * successor process rebuilt after taking the lapsed reservation over. */
  owner: string;
}

interface LeaseData {
  v: 2;
  /** Per-board read cursors (the poll advances over every page it lists). */
  cursor: Record<string, string>;
  /** Post ids reserved for a pending wake, id → fenced lease. */
  leases: Record<string, WakeLease>;
  /** Delivered post ids (timer commit or turn_start injection), id → at. */
  delivered: Record<string, number>;
  /** Post ids released unfinished (failed wake or crash-lapsed reservation),
   * id → at. Persisted so a restart re-enters them even though the poll
   * cursor has advanced past their page. */
  retry: Record<string, number>;
  /** Per-board "initial baseline paging in progress" flag (finding: the
   * accept-only-posts-newer-than-activation floor must hold through ALL
   * initial pages, until a non-truncated page arrives — not just the first).
   * Absent entry = the board's normal cursor paging. */
  initial: Record<string, boolean>;
}

function emptyLease(): LeaseData {
  return { v: 2, cursor: {}, leases: {}, delivered: {}, retry: {}, initial: {} };
}

/** Structural parse — THROWS on anything that is not a recognizable lease
 * file (caller decides: quarantine the bytes aside, never silently treat a
 * corrupt file as empty state, which a later persist would then overwrite). */
function parseLease(raw: string): LeaseData {
  const parsed: unknown = JSON.parse(raw);
  const candidate = parsed as Record<string, unknown>;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error("lease file is not an object");
  }
  // v1 files predate the persisted retry pool; they migrate with an empty one.
  if (candidate.v !== 1 && candidate.v !== 2) throw new Error(`unknown lease schema version: ${String(candidate.v)}`);
  const recordMap = (key: string): Record<string, unknown> => {
    const value = candidate[key];
    if (value === undefined) {
      if (key === "retry" || key === "initial") return {}; // optional in older v2 files
      throw new Error(`lease file is missing "${key}"`);
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`lease file field "${key}" is not a map`);
    }
    return value as Record<string, unknown>;
  };
  const cursor = recordMap("cursor");
  const leases = recordMap("leases");
  const delivered = recordMap("delivered");
  const retry = recordMap("retry") as Record<string, number>;
  // `initial` gates the baseline floor: only strict `true` entries count, so
  // a corrupt/hostile value can never silently disable the floor.
  const initialRaw = recordMap("initial");
  const initial: Record<string, boolean> = {};
  for (const [board, value] of Object.entries(initialRaw)) {
    if (value === true) initial[board] = true;
  }
  return { v: 2, cursor, leases: leases as Record<string, WakeLease>, delivered, retry, initial };
}

interface LeaseLock {
  /** Run `fn` under the cross-process mutex with the lease state freshly
   * reloaded from disk. `fn` must call `lock.persist(data)` (while still under
   * the lock) to make its changes durable. */
  withLock: <T>(fn: (data: LeaseData) => Promise<T>) => Promise<T>;
  /** Atomic whole-file write (same-directory temp + rename) with a brief
   * internal retry; THROWS on final failure — decision points must not
   * swallow a failed save. The write is FENCED on the holder's lock token:
   * once this process's hold has been displaced (stale takeover or the owner
   * file vanishing), a late persist throws instead of clobbering the
   * successor's newer state. Caller must hold the lock. */
  persist: (data: LeaseData, phase: string) => Promise<void>;
}

export interface LeaseLockOptions {
  /** Stale-hold TTL for the lock itself (a holder renews its owner file
   * every third of this while it runs). Tests shrink it; production uses the
   * 10 s default. */
  staleMs?: number;
  /** Observability sink for quarantine events (an unreadable lease file moved
   * aside). The mod wires its trace channel in; tests assert on it. */
  onQuarantine?: (error: unknown, asidePath: string) => void;
}

/** The exact mutex the timer (and the turn_start marker) use for the lease
 * file. Exported so tests can drive concurrent mutators directly. Inert —
 * constructing a lock touches nothing; the host only ever calls the default
 * export above. */
function makeLeaseLock(leaseFilePath: string, options: LeaseLockOptions = {}): LeaseLock {
  const lockDir = `${leaseFilePath}.lock`;
  const STALE_LEASE_MS = Math.max(100, Math.floor(options.staleMs ?? 10_000)); // holder renews every third of this while alive
  const LOCK_TIMEOUT_MS = Math.max(10_000, STALE_LEASE_MS * 4);
  const renewEveryMs = Math.max(25, Math.floor(STALE_LEASE_MS / 3));

  // The CURRENT in-process holder. The cross-process lock dir serializes
  // holders, so at most one exists per makeLeaseLock instance at a time;
  // persist consults it (plus the owner file itself) to fence writes after a
  // displacement.
  let holder: { token: string; displaced: boolean } | null = null;

  async function readState(): Promise<LeaseData> {
    let raw: string;
    try {
      raw = await readFile(leaseFilePath, "utf8");
    } catch (error) {
      // ONLY a missing file means "no state yet". Any other read failure is
      // propagated — treating it as empty would let a later persist overwrite
      // real lease state with a fresh file.
      if ((error as { code?: unknown })?.code === "ENOENT") return emptyLease();
      throw error;
    }
    try {
      return parseLease(raw);
    } catch (error) {
      // Unreadable-but-present state: QUARANTINE — move the bytes aside
      // (preserved for inspection, never silently emptied, never overwritten)
      // and start clean. If even the move fails, propagate: the callers treat
      // an unreadable lease file like any other lock failure.
      const aside = `${leaseFilePath}.corrupt-${Date.now()}-${randomUUID().slice(0, 8)}`;
      try {
        await rename(leaseFilePath, aside);
      } catch {
        throw error;
      }
      options.onQuarantine?.(error, aside);
      return emptyLease();
    }
  }

  async function persist(data: LeaseData, phase: string): Promise<void> {
    // Displacement fence: once another process has taken this hold over (its
    // stale takeover renamed our owner file away), our writes must not land.
    if (holder?.displaced) throw new Error(`lease lock displaced before save (${phase})`);
    if (holder) {
      // And belt-and-braces against the file itself: only the current owner
      // token in the lock dir may persist.
      const owner = await readLockOwner(lockDir).catch(() => undefined);
      if (owner?.token !== holder.token) {
        throw new Error(`lease lock lost ownership before save (${phase})`);
      }
    }
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const temp = `${leaseFilePath}.${process.pid}.tmp`;
        await mkdir(dirname(leaseFilePath), { recursive: true });
        await writeFile(temp, JSON.stringify(data) + "\n", "utf8");
        await rename(temp, leaseFilePath);
        return;
      } catch (error) {
        lastError = error;
        await sleep(25);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(`lease save failed (${phase})`);
  }

  async function readLockOwner(dir: string): Promise<{ token: string; mtimeMs: number } | undefined> {
    const names = (await readdir(dir)).filter((name) => name.startsWith("owner-"));
    if (names.length !== 1) return undefined;
    const path = join(dir, names[0]!);
    const token = await readFile(path, "utf8");
    if (names[0] !== `owner-${token}`) return undefined;
    return { token, mtimeMs: (await stat(path)).mtimeMs };
  }

  async function removeEmptyDir(path: string): Promise<boolean> {
    try { await rmdir(path); return true; } catch { return false; }
  }

  /** Recovery pass run by every contender before it judges staleness: a
   * displacer that crashed between its rename-aside and its unlink used to
   * strand `stale-*` files inside the lock dir, making it permanently
   * non-empty (every later acquirer timed out forever). Verified-dead owners'
   * artifacts are unlinked here so the directory can empty out again. */
  async function recoverDisplacementArtifacts(): Promise<void> {
    let names: string[];
    try {
      names = await readdir(lockDir);
    } catch {
      return; // dir vanished between our EEXIST and the readdir: fine
    }
    for (const name of names) {
      if (name.startsWith("stale-")) {
        try { await unlink(join(lockDir, name)); } catch {}
      }
    }
  }

  async function acquire(): Promise<() => Promise<void>> {
    await mkdir(dirname(lockDir), { recursive: true });
    const token = randomUUID();
    const deadline = Date.now() + LOCK_TIMEOUT_MS;
    for (;;) {
      const ownerPath = join(lockDir, `owner-${token}`);
      try {
        await mkdir(lockDir);
        try {
          await writeFile(ownerPath, token, { flag: "wx" });
        } catch (error) {
          try { await rmdir(lockDir); } catch {}
          throw error;
        }
        const session: { token: string; displaced: boolean } = { token, displaced: false };
        holder = session;
        let renewal: Promise<void> = Promise.resolve();
        const timer = setInterval(() => {
          renewal = renewal.then(async () => {
            // utimes never creates a missing owner file, so a lock that was
            // taken over cannot be resurrected by its displaced holder — and
            // the ENOENT marks the hold displaced, fencing its remaining
            // writes.
            const now = new Date();
            await utimes(ownerPath, now, now);
          }).catch((error) => {
            if ((error as { code?: unknown })?.code === "ENOENT") session.displaced = true;
          });
        }, renewEveryMs);
        timer.unref?.();
        return async () => {
          clearInterval(timer);
          await renewal;
          // The token is part of the filename: if a successor displaced us,
          // this unlink is ENOENT and rmdir cannot remove its non-empty
          // directory — our release stays harmless.
          try { await unlink(ownerPath); } catch {}
          try { await rmdir(lockDir); } catch {}
          if (holder === session) holder = null;
        };
      } catch (error) {
        if ((error as { code?: unknown })?.code !== "EEXIST") throw error;
        try {
          await recoverDisplacementArtifacts();
          const owner = await readLockOwner(lockDir);
          const mtimeMs = owner?.mtimeMs ?? (await stat(lockDir)).mtimeMs;
          if (Date.now() - mtimeMs > STALE_LEASE_MS) {
            let removed = false;
            if (owner) {
              // Displace a stale owner only via a verified rename-aside, so a
              // merely-slow holder cannot be double-displaced.
              const displacedPath = join(lockDir, `stale-${owner.token}-${token}`);
              await rename(join(lockDir, `owner-${owner.token}`), displacedPath);
              const displaced = await stat(displacedPath);
              if (Date.now() - displaced.mtimeMs > STALE_LEASE_MS
                && await readFile(displacedPath, "utf8") === owner.token) {
                await unlink(displacedPath);
                removed = await removeEmptyDir(lockDir);
              } else {
                // Verification failed: restore the owner file so the (possibly
                // merely-slow) holder keeps its identity. If even the restore
                // races away, the next contender's recovery pass cleans up.
                try {
                  await rename(displacedPath, join(lockDir, `owner-${owner.token}`));
                } catch {}
              }
            } else {
              // A process can die between mkdir and publishing its owner
              // file; the directory is only removable while ownerless.
              removed = await removeEmptyDir(lockDir);
            }
            if (removed) continue;
          }
        } catch {}
        if (Date.now() >= deadline) throw new Error(`timed out waiting for board timer lease lock: ${lockDir}`);
        await sleep(10);
      }
    }
  }

  return {
    async withLock(fn) {
      const release = await acquire();
      try {
        // The FILE is the only truth: reload under the lock, so a hook
        // process's or another session's write between our sections is seen.
        return await fn(await readState());
      } finally {
        await release();
      }
    },
    persist,
  };
}

function loadConfig(raw: string): BoardConfig {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as BoardConfig;
  } catch {}
  return {};
}

function configEnv(config: BoardConfig, extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  const store = process.env.BOARD_STORE ?? config.store;
  if (store) env.BOARD_STORE = store;
  const index = process.env.BOARD_INDEX ?? config.indexPath;
  if (index) env.BOARD_INDEX = index;
  const as = process.env.BOARD_AS ?? config.as;
  if (as) env.BOARD_AS = as;
  let boards: string | undefined;
  if (Array.isArray(config.boards)) boards = config.boards.join(",");
  else if (typeof config.boards === "string") boards = config.boards;
  else if (config.board) boards = config.board;
  boards = process.env.BOARD_BOARDS ?? boards;
  if (boards) env.BOARD_BOARDS = boards;
  const cap = process.env.BOARD_MAX_OUTPUT_BYTES
    ?? (config.maxOutputBytes === undefined ? undefined : String(config.maxOutputBytes));
  if (cap) env.BOARD_MAX_OUTPUT_BYTES = cap;
  return { ...env, ...extra };
}

export default function activate(letta: any) {
  // Activation generation: every captured conversation handle is stamped with
  // it and every timer only fires at handles from its own activation. A
  // re-activation (/reload) bumps it AND drops all previously captured
  // sessions, so the new activation must recapture from a fresh event and
  // never fires at a handle from an older activation.
  wakeGeneration += 1;
  const generation = wakeGeneration;
  for (const [id, session] of wakeSessions) {
    if (session.generation !== generation) wakeSessions.delete(id);
  }
  if (wakeUnnamedSession) wakeUnnamedSession = null;
  if (wakeCurrent) wakeCurrent = null;
  const disposers: Array<() => void> = [];
  // Queued work at dispose (in-flight tick completions, the trace queue), one
  // entry per timer disposed. Exposed on the teardown via `.drain()` so tests
  // — and any future async host teardown — can await a clean stop.
  const drainPromises: Array<Promise<void>> = [];

  // BOARD_REPO env wins over the config file's repo field (same precedence as
  // the other BOARD_* overrides); config wins over the compiled-in default.
  const envRepo = typeof process.env.BOARD_REPO === "string" && process.env.BOARD_REPO.length > 0
    ? process.env.BOARD_REPO
    : undefined;
  let repo = envRepo ?? DEFAULT_REPO;
  let config: BoardConfig = {};
  // Config loads asynchronously; a turn_start or tool call that races ahead of
  // it would run with defaults, so await a shared promise everywhere.
  let configReady: Promise<void> = Promise.resolve();
  try {
    configReady = readFile(CONFIG_PATH, "utf8").then((raw) => {
      config = loadConfig(raw);
      const configRepo = typeof config.repo === "string" && config.repo.length > 0 ? config.repo : undefined;
      repo = envRepo ?? configRepo ?? DEFAULT_REPO;
    }).catch(() => {}); // missing/malformed config falls back to defaults
  } catch {}

  // The board entrypoints are Bun/TypeScript sources, but the host interpreter
  // may be Node (Letta Code loads mods under Node), so spawn through bun
  // explicitly — never process.execPath. BOARD_BUN / config "bun" override the
  // executable name or path.
  const bunPath = () => {
    const raw = process.env.BOARD_BUN ?? config.bun;
    return typeof raw === "string" && raw.length > 0 ? raw : "bun";
  };
  const spawnTimeoutMs = () => {
    const raw = process.env.BOARD_SPAWN_TIMEOUT_MS ?? config.spawnTimeoutMs;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 100 ? Math.min(60_000, Math.floor(n)) : DEFAULT_SPAWN_TIMEOUT_MS;
  };

  const cliPath = () => join(repo, "packages", "cli", "src", "index.ts");
  const hookPath = () => join(repo, "packages", "hooks", "src", "board-hook.ts");

  /** Spawn one board entrypoint. Returns stdout; throws on non-zero exit. */
  function runBoard(
    script: () => string,
    args: string[],
    env: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<string> {
    return configReady.then(() => new Promise((resolve, reject) => {
      const child = execFile(
        bunPath(),
        [script(), ...args],
        { env: { ...process.env, ...env }, timeout: spawnTimeoutMs(), signal, maxBuffer: 4 * 1024 * 1024 },
        (error, stdout) => {
          if (error) {
            if ((error as { code?: unknown }).code === "ENOENT") {
              // Missing bun executable: say so plainly. The bun path is
              // operator configuration, so naming it leaks nothing.
              reject(new Error(`board command failed: bun not found (looked for "${bunPath()}"); install bun or set BOARD_BUN / "bun" in the board config`));
              return;
            }
            // Deliberately generic: bun/Node error messages embed the full argv
            // (store spec and post body included), which must not reach tool
            // output. Exit-code shape only.
            const code = typeof (error as { code?: unknown }).code === "number" || typeof (error as { code?: string }).code === "string"
              ? ` (${(error as { code?: unknown }).code})`
              : "";
            reject(new Error(`board command failed${code}`));
          } else {
            resolve(stdout);
          }
        },
      );
      // The hook reads stdin (Bun.stdin.text()); execFile leaves the stdin
      // pipe open forever, so close it immediately or every spawn times out.
      child.stdin?.end();
    }));
  }

  if (letta.capabilities.tools) {
    disposers.push(letta.tools.register({
      name: "board_post",
      description: "Post a message to the team's shared board. Use to send coordination messages to other agents; mentions wake or notify the named agents.",
      parameters: {
        type: "object",
        properties: {
          body: { type: "string", description: "Message body (markdown text)." },
          title: { type: "string", description: "Optional short title." },
          mentions: {
            type: "array",
            items: { type: "string" },
            maxItems: 32,
            description: "Agent names to mention (e.g. [\"claude\", \"codex\"]).",
          },
        },
        required: ["body"],
        additionalProperties: false,
      },
      requiresApproval: false,
      parallelSafe: false,
      async run(ctx) {
        await configReady; // config file may still be loading at first call
        const body = String(ctx.args.body ?? "");
        if (!body.trim()) return { status: "error", content: "body is required" };
        const store = process.env.BOARD_STORE ?? config.store;
        if (!store) return { status: "error", content: "no board store configured; set store in ~/.board/config.json" };
        const args = ["--store", store];
        args.push("--as", process.env.BOARD_AS ?? config.as ?? "letta");
        const boards = process.env.BOARD_BOARDS
          ?? (Array.isArray(config.boards) ? config.boards.join(",") : config.boards ?? config.board);
        if (boards) args.push("--board", boards.split(",")[0]?.trim() || "general");
        if (ctx.args.title !== undefined) args.push("--title", String(ctx.args.title));
        const mentions = ctx.args.mentions;
        if (Array.isArray(mentions) && mentions.length > 0) {
          args.push("--mentions", mentions.map((m) => String(m)).join(","));
        }
        // The CLI takes --body verbatim, so newlines survive; passing the body
        // as split positional words would collapse multiline bodies to spaces,
        // and "--" would still not protect a value from value-parsing edge
        // cases. As a flag value it can never be re-parsed as a flag.
        args.push("--body", body);
        const stdout = await runBoard(cliPath, ["post", ...args], configEnv(config), ctx.signal);
        return stdout.trim() || "posted";
      },
    }));

    disposers.push(letta.tools.register({
      name: "board_read",
      description: "Read recent posts from the shared board. Reads the first configured board only (the CLI reads one board per invocation). Returns JSON with posts, cursor, and truncated. Pass the previous cursor back as `after` to page.",
      parameters: {
        type: "object",
        properties: {
          after: { type: "string", description: "Cursor from a previous read for paging." },
          limit: { type: "integer", minimum: 1, maximum: 100, description: "Page size (default 100)." },
        },
        additionalProperties: false,
      },
      requiresApproval: false,
      parallelSafe: true,
      async run(ctx) {
        await configReady; // config file may still be loading at first call
        const store = process.env.BOARD_STORE ?? config.store;
        if (!store) return { status: "error", content: "no board store configured; set store in ~/.board/config.json" };
        const args = ["read", "--store", store];
        const boards = process.env.BOARD_BOARDS
          ?? (Array.isArray(config.boards) ? config.boards.join(",") : config.boards ?? config.board);
        if (boards) args.push("--board", boards.split(",")[0]?.trim() || "general");
        if (ctx.args.after !== undefined) args.push("--after", String(ctx.args.after));
        if (ctx.args.limit !== undefined) args.push("--limit", String(Math.max(1, Math.min(100, Number(ctx.args.limit) || 100))));
        const stdout = await runBoard(cliPath, args, configEnv(config), ctx.signal);
        return stdout.trim() || "no posts";
      },
    }));

    disposers.push(letta.tools.register({
      name: "board_who",
      description: "List which agents are currently online on the shared board (recent presence with runtime and session info).",
      parameters: {
        type: "object",
        properties: {
          maxAgeMs: { type: "integer", minimum: 0, maximum: 3_600_000, description: "Freshness window in ms (default 120000)." },
        },
        additionalProperties: false,
      },
      requiresApproval: false,
      parallelSafe: true,
      async run(ctx) {
        await configReady; // config file may still be loading at first call
        const store = process.env.BOARD_STORE ?? config.store;
        if (!store) return { status: "error", content: "no board store configured; set store in ~/.board/config.json" };
        const args = ["who", "--store", store];
        if (ctx.args.maxAgeMs !== undefined) {
          // Validate finiteness instead of `Number(x) || fallback`, which
          // silently rewrites a legitimate maxAgeMs=0 to the default.
          const n = Number(ctx.args.maxAgeMs);
          if (Number.isFinite(n)) args.push("--max-age", String(Math.min(3_600_000, Math.max(0, Math.floor(n)))));
        }
        const stdout = await runBoard(cliPath, args, configEnv(config), ctx.signal);
        return stdout.trim() || "nobody";
      },
    }));
  }

  // turn_start injection + presence heartbeats need the events capability.
  if (letta.capabilities.events.turns || letta.capabilities.events.lifecycle) {
    const spawnHook = (args: string[], signal?: AbortSignal) =>
      runBoard(hookPath, args, configEnv(config, { BOARD_AS: process.env.BOARD_AS ?? config.as ?? "letta" }), signal)
        .catch(() => ""); // hook failures must never block a turn (101 contract)

    if (letta.capabilities.events.lifecycle) {
      let open = false;
      disposers.push(letta.events.on("conversation_open", async (_event, ctx) => {
        // Capture before the heartbeat guard: every open dispatch carries a
        // fresh handle, and the timer needs one even before the first turn.
        // A freshly opened conversation has no run yet — reset the busy flag
        // for THIS conversation only.
        noteConversation(ctx, { resetRun: true, generation });
        if (open) return;
        open = true;
        // Working: a session just opened; the first turn will inject context.
        await spawnHook(["heartbeat", "--runtime", "letta", "--status", "working"], ctx.signal);
      }));
      disposers.push(letta.events.on("conversation_close", async (_event, ctx) => {
        // The conversation is gone: drop ITS session (and every session when
        // the event identifies none) so the timer can never send on a stale
        // handle — conservative across /reload and conversation switches.
        dropConversation(ctx);
        if (!open) return;
        open = false;
        await spawnHook(["heartbeat", "--runtime", "letta", "--status", "idle"], ctx.signal);
      }));
    }

    if (letta.capabilities.events.turns) {
      disposers.push(letta.events.on("turn_start", async (event, ctx) => {
        noteConversation(ctx, { generation });
        const session = timerSessionFromCtx(ctx);
        if (session) session.runInFlight = true; // a run is being submitted; hold timer sends
        const userMessage = Array.isArray(event.input) ? event.input.find((item: any) => item?.role === "user") : undefined;
        if (!userMessage) return; // approval-only continuation: never inject
        const output = await spawnHook(["inject", "--runtime", "letta"], ctx.signal);
        if (!output) return; // no unread mentions, or the hook degraded silently
        // AWAITED shared arbitration (timer wake enabled only): the ids this
        // injection claimed are recorded in the lease file UNDER THE LOCK and
        // the verdict (deliver vs. defer to an in-flight wake) is decided
        // BEFORE any content is appended — the old fire-and-forget marker let
        // the timer and the injection both deliver. When the arbitration
        // defers the whole block (every mention is actively leased by a live
        // wake), the injection yields entirely; the wake's pointer nudge is
        // this mention's one delivery, and the content remains reachable via
        // board read.
        if (wakeEnabled && claimInjectionDelivery) {
          const verdict = await claimInjectionDelivery(output);
          if (!verdict.deliver) return { input: event.input };
        }
        // Append the framed, size-capped block as an extra typed text part.
        // Content must stay a valid host shape — never mix a bare string with
        // part objects, so normalize string content to a typed part first.
        // The hook output already carries the UNTRUSTED CONTENT framing and
        // the 4 KiB cap.
        const part = { type: "text", text: output };
        const existing = userMessage.content;
        if (Array.isArray(existing)) existing.push(part);
        else if (typeof existing === "string" && existing.length > 0) {
          userMessage.content = [{ type: "text", text: existing }, part];
        } else {
          userMessage.content = [part];
        }
        return { input: event.input };
      }));
      // turn_end is the only reliable "run finished" signal, and the host does
      // not emit it everywhere (bidirectional headless sessions never do —
      // docs/research/06). Where it fires, the timer may gate on it; where it
      // does not, the timer falls back to probing with retry-on-409.
      disposers.push(letta.events.on("turn_end", async (_event, ctx) => {
        noteConversation(ctx, { generation });
        const session = timerSessionFromCtx(ctx);
        if (session) {
          session.runInFlight = false;
          session.sawTurnEnd = true;
        }
      }));
    }
  }

  // ─── Timer wake (task 124, opt-in; off by default) ──────────────────────────
  //
  // While the session is idle, a timer polls the board for NEW mentions of
  // this agent and, when one exists, sends a pointer-only nudge through the
  // captured conversation handle (the same recipe verified live in
  // docs/research/06: idle sends are accepted, in-flight sends get a 409).
  //
  // Claim-once honesty: the hook's `inject`/`poll` CLAIM (mark read) every
  // mention they return, so the timer must not use them — a nudge can fail
  // (409 exhaustion) and a failed delivery must leave the mention unread for
  // turn_start. The timer therefore learns about mentions via the read-only
  // CLI (`board read`, claims nothing) and coordinates with turn_start through
  // a lease file it owns entirely (packages/hooks is out of scope for this
  // mod): "<indexPath>.timerwake.json", containing only post ids, cursors and
  // timestamps — never post bodies, authors, or secrets.
  //
  // The lease file is shared between the timer and the turn_start marker (and
  // between session processes), so EVERY read-modify-write runs under a
  // cross-process lock ("<leasePath>.lock" directory, see makeLeaseLock) and
  // reloads the state from the file while holding it — the file is the only
  // truth, there is no stale in-memory cache.
  //
  //   reserve → write {postId: fenced lease(TTL)} under the lock and AWAIT
  //             the durable (renamed-into-place) persist BEFORE any send
  //             leaves; a failed reserve write aborts the wake (nothing
  //             consumed); the lease records an owner token, renewed while
  //             the wake is in flight;
  //   commit  → send accepted only on a CLEAN FULL DRAIN after at least one
  //             chunk (an attempt that yields chunks and then ERRORS
  //             mid-iteration has an unknown outcome — it is a FAILED
  //             attempt, not a delivery; neither is a zero-chunk clean drain
  //             nor a deadline miss) → mark postId delivered, awaited +
  //             persisted, FENCED on the owner token: a stale owner's late
  //             commit never overwrites a successor's newer state;
  //   release → all retries exhausted / hard failure / errored before or
  //             after chunks / send deadline missed (never settled) → delete
  //             the lease AND add the id to the PERSISTED retry pool,
  //             awaited: the mention returns to the candidate set on a later
  //             tick or after a restart (rehydration) even though the poll
  //             cursor advanced past its page, AND stays unread in the hook
  //             index for turn_start injection. Release writes are never
  //             swallowed silently — a failed one is traced and the lease
  //             lapses via TTL + crash rehydration.
  //
  // turn_start's injection and this timer arbitrate each mention's delivery
  // in ONE awaited, lock-protected section (claimInjectionDelivery for the
  // injection side, reserve/recheck/commit for the timer side): whoever's
  // section runs first wins — an in-flight wake holds an ACTIVE, renewed
  // lease the injection defers to; a durably recorded injection mark the
  // timer's pre-send recheck drops — so both paths together deliver each
  // mention at most once.
  //
  // Enabled only when config "timerWake": true or BOARD_TIMER_WAKE is set
  // (env decides when both are present, so BOARD_TIMER_WAKE=0 is a kill
  // switch). See README for the full knob list and the limits truth table.

  // knob env names, in one place for the README table
  // (BOARD_TIMER_WAKE, BOARD_TIMER_POLL_MS, BOARD_TIMER_BACKOFF_CAP_MS,
  //  BOARD_TIMER_LEASE_TTL_MS, BOARD_TIMER_RETRY_MS, BOARD_TIMER_SEND_TIMEOUT_MS,
  //  BOARD_TIMER_TRACE)

  let wakeEnabled = false;
  // Assigned only when the timer is enabled; turn_start AWAITS it to run the
  // shared delivery arbitration for the ids each injection claimed (see
  // claimInjectionDelivery in setupTimerWake).
  let claimInjectionDelivery: ((output: string) => Promise<{ deliver: boolean }>) | null = null;

  // Config loads asynchronously; register the timer after it resolves so knob
  // values and the lease path honor the config file. If the mod is disposed
  // before that, never start the timer at all.
  let disposed = false;
  void configReady.then(() => {
    if (disposed) return;
    const envWake = process.env.BOARD_TIMER_WAKE?.trim().toLowerCase();
    const enabled = envWake !== undefined && envWake.length > 0
      ? envWake === "1" || envWake === "true" || envWake === "yes" || envWake === "on"
      : config.timerWake === true || config.timerWake === "true";
    if (!enabled) return;
    wakeEnabled = true;
    setupTimerWake();
  });

  function setupTimerWake(): void {
    // This timer only ever fires at handles captured under the generation
    // that was current when it was set up (re-activation invalidates them).
    const myGeneration = wakeGeneration;
    const tracePath = typeof process.env.BOARD_TIMER_TRACE === "string" && process.env.BOARD_TIMER_TRACE.length > 0
      ? process.env.BOARD_TIMER_TRACE
      : typeof config.timerTrace === "string" && config.timerTrace.length > 0 ? config.timerTrace : undefined;

    /** Diagnostics-safe trace: opt-in file, one JSON line per event. Lines
     * carry counts, ids, timings and the pointer text only — never post
     * bodies, authors, store specs, or credentials. Appends are serialized so
     * the file reads in event-issue order even when several events fire in
     * one tick (concurrent appendFile calls can reorder on the threadpool). */
    let traceQueue: Promise<void> = Promise.resolve();
    const trace = (event: string, fields: Record<string, string | number> = {}) => {
      if (!tracePath) return;
      const line = JSON.stringify({ ts: new Date().toISOString(), event, ...fields }) + "\n";
      traceQueue = traceQueue.then(() => appendFile(tracePath!, line).catch(() => {}));
    };

    const numberKnob = (
      envName: string,
      configValue: number | string | undefined,
      fallback: number,
      min: number,
      max: number,
    ): number => {
      const raw = process.env[envName] ?? configValue;
      const n = Number(raw);
      return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.floor(n))) : fallback;
    };

    const basePollMs = numberKnob("BOARD_TIMER_POLL_MS", config.timerPollMs, 5_000, 250, 600_000);
    const backoffCapMs = numberKnob("BOARD_TIMER_BACKOFF_CAP_MS", config.timerBackoffCapMs, 60_000, basePollMs, 3_600_000);
    const leaseTtlMs = numberKnob("BOARD_TIMER_LEASE_TTL_MS", config.timerLeaseTtlMs, 120_000, 1_000, 3_600_000);
    // Deadline for ONE wake send attempt: a single absolute timestamp taken
    // at the attempt's start spans the sendMessageStream call AND its drain
    // (per-stage timers would hand a wedged drain a fresh window). The
    // mod's one unbounded await is the send; a host stall there would latch
    // `sending` forever and silently kill the timer. Every await is
    // therefore bounded; a deadline miss is a failed attempt and flows into
    // the existing release path (retry on a later tick).
    const sendTimeoutMs = numberKnob("BOARD_TIMER_SEND_TIMEOUT_MS", config.timerSendTimeoutMs, 30_000, 1_000, 300_000);
    const identity = process.env.BOARD_AS ?? config.as ?? "letta";

    // Retry schedule for 409s (server says a run is in flight). Three
    // attempts max: initial send plus two retries at these delays.
    const MAX_SEND_ATTEMPTS = 3;
    const DEFAULT_RETRY_DELAYS_MS = [2_000, 4_000, 8_000];
    // Activation anchor for the baseline poll (ULID timestamps are compared
    // against it so enabling the timer never nudges about old posts).
    const ACTIVATED_AT = Date.now();
    const retryRaw = process.env.BOARD_TIMER_RETRY_MS
      ?? (config.timerRetryMs === undefined ? undefined : String(config.timerRetryMs));
    const retryDelaysMs = (() => {
      if (retryRaw === undefined) return DEFAULT_RETRY_DELAYS_MS;
      const parts = retryRaw.split(",").map((part) => Number(part.trim()))
        .filter((n) => Number.isFinite(n) && n >= 0 && n <= 60_000);
      return parts.length > 0 ? parts : DEFAULT_RETRY_DELAYS_MS;
    })();

    // "<indexPath>.timerwake.json" — sibling of the per-runtime hook index so
    // separate runtimes (per-runtime indexPath is the recommended setup) get
    // separate lease files. Only ids and timestamps live in here. Every
    // read-modify-write goes through `lock`, the cross-process mutex; the
    // file is re-read under the lock on every section (no in-memory cache).
    const leaseFilePath = (() => {
      const raw = process.env.BOARD_INDEX ?? config.indexPath;
      const index = typeof raw === "string" && raw.length > 0 ? raw : join(homedir(), ".board", "index.sqlite");
      return `${index}.timerwake.json`;
    })();

    const lock = makeLeaseLock(leaseFilePath, {
      // An unreadable lease file is quarantined (moved aside, bytes preserved)
      // before a clean state is started; surface it on the trace channel.
      onQuarantine: (error) => trace("lease-quarantined", { kind: error instanceof Error ? "parse" : "error" }),
    });

    /** THE shared arbitration section — the single lock-protected,
     * reload-from-disk section that BOTH delivery paths (timer wake and
     * turn_start injection) run their ownership decisions through. Every
     * mutating timer section and the injection claim go through here, so
     * their transitions are mutually exclusive and each sees the other's
     * durably persisted state. */
    const arbitrate = <T>(fn: (data: LeaseData, now: number) => Promise<T>): Promise<T> =>
      lock.withLock((data) => fn(data, Date.now()));

    // Crash grace: a reservation that lapsed this long ago had no live wake
    // behind it (one attempt is bounded by sendTimeoutMs, and the full retry
    // ladder by retries × (sendTimeoutMs + delays), all far under TTL + grace
    // at defaults) — its process died mid-send. Re-enter the mention.
    const LEASE_GRACE_MS = 60_000;
    const WEEK_MS = 7 * 24 * 3_600_000;

    /** Crash rehydration + GC, run inside every lease-lock section before
     * mutating: leases lapsed past the grace window move into the persisted
     * retry pool (so the advanced poll cursor cannot bury them after a
     * restart), week-old delivered/retry marks age out. Persisted ids are
     * VALIDATED at this boundary (rehydration is one of them): a structurally
     * bad or non-plausible id is dropped + warned, never reserved or nudged —
     * the retry-pool merge is the only path that turns persisted ids back
     * into candidates, so garbage can never reach a nudge through it.
     * Returns true when anything changed (the caller persists then). */
    function rehydrateAndGc(data: LeaseData, now: number): boolean {
      let changed = false;
      let bad = 0;
      for (const [id, entry] of Object.entries(data.leases)) {
        const structurallyValid = typeof id === "string"
          && entry !== null && typeof entry === "object"
          && typeof (entry as WakeLease).expiresAt === "number"
          && typeof (entry as WakeLease).owner === "string" && (entry as WakeLease).owner.length > 0;
        if (!structurallyValid || !isPlausibleUlid(id)) {
          delete data.leases[id];
          changed = true;
          bad += 1;
          continue;
        }
        if (entry.expiresAt <= now - LEASE_GRACE_MS) {
          delete data.leases[id];
          if (data.delivered[id] === undefined && data.retry[id] === undefined) data.retry[id] = now;
          changed = true;
        }
      }
      for (const [id, at] of Object.entries(data.delivered)) {
        if (!isPlausibleUlid(id) || typeof at !== "number") { delete data.delivered[id]; changed = true; bad += 1; continue; }
        if (now - at > WEEK_MS) { delete data.delivered[id]; changed = true; }
      }
      for (const [id, at] of Object.entries(data.retry)) {
        if (!isPlausibleUlid(id) || typeof at !== "number") { delete data.retry[id]; changed = true; bad += 1; continue; }
        if (now - at > WEEK_MS) { delete data.retry[id]; changed = true; }
      }
      for (const [board, value] of Object.entries(data.cursor)) {
        if (typeof value !== "string" || value.length === 0) { delete data.cursor[board]; changed = true; bad += 1; }
      }
      if (bad > 0) trace("bad-persisted-id", { posts: bad });
      return changed;
    }

    /** The post-id part of the hook's rendered header: `[UNTRUSTED CONTENT
     * FROM <author> | board <board> | post <id>]`. Strict on the id: only a
     * plausible canonical ULID is ever recorded, and a malformed one is
     * skipped + warned (never persisted, never nudged). (Round-2 note: the
     * old class `[^[\\]]` parsed as "one non-bracket char + literal `]`s" and
     * matched NO real header — the marker it fed could never fire. This class
     * is "any run of chars that are neither `[` nor ``]`", per the hook's
     * renderPost header shape.) */
    const INJECTED_ID_RE = /\[UNTRUSTED CONTENT FROM [^\[\]]* \| board [^\[\]]* \| post ([0-9A-Za-z][0-9A-Za-z-]*)\s*\]/g;
    function parseInjectedIds(output: string): string[] {
      const ids = new Set<string>();
      let bad = 0;
      for (const match of output.matchAll(INJECTED_ID_RE)) {
        const id = match[1]!;
        if (isPlausibleUlid(id)) ids.add(id);
        else bad += 1;
      }
      if (bad > 0) trace("bad-injected-id", { posts: bad });
      return [...ids];
    }

    /** turn_start's half of the shared arbitration. AWAITED by the turn_start
     * handler BEFORE the injection content is appended — the delivery mark is
     * durable under the same cross-process lock the timer uses, so a timer
     * recheck can never race an in-flight marker write (the old fire-and-
     * forget path let timer and injection both deliver).
     *
     * Arbitration rules, per parsed id, inside ONE `arbitrate` section:
     * - actively leased by a live wake (unexpired reservation) → the timer
     *   owns this mention right now; the injection DEFERS (no mark, no
     *   delivery) — otherwise the timer's pre-send recheck has already passed
     *   and both would deliver;
     * - otherwise the injection claims it: delivered is set (idempotent if a
     *   previous delivery already recorded it), any expired lease or retry
     *   entry is cleared, and the content is delivered.
     * Returns whether the block may be appended: true when at least one id
     * was claimable (or nothing parseable — hook content flows untouched);
     * false only when EVERY parsed id is actively timer-owned, in which case
     * appending would double-deliver the whole block. An arbitration FAILURE
     * (lock/persist error) delivers rather than suppresses: content is the
     * safe direction, and the failure is traced. */
    const claimInjectionDeliveryImpl = async (output: string): Promise<{ deliver: boolean }> => {
      try {
        return await arbitrate(async (data, now) => {
          const ids = parseInjectedIds(output);
          if (ids.length === 0) return { deliver: true };
          let changed = rehydrateAndGc(data, now);
          let claimed = 0;
          let deferred = 0;
          for (const id of ids) {
            const lease = data.leases[id];
            if (lease !== undefined && lease.expiresAt > now) {
              deferred += 1; // a live wake owns it: never race it with content
              continue;
            }
            if (lease !== undefined) { delete data.leases[id]; changed = true; } // expired leftover
            if (data.delivered[id] === undefined) { data.delivered[id] = now; changed = true; }
            if (data.retry[id] !== undefined) { delete data.retry[id]; changed = true; }
            claimed += 1;
          }
          if (changed) await lock.persist(data, "injected");
          if (claimed > 0) trace("injected", { posts: claimed });
          if (deferred > 0) trace("injected-deferred", { posts: deferred });
          return { deliver: claimed > 0 };
        });
      } catch {
        trace("injected-save-failed", {}); // not silent: a missed mark can cost one duplicate nudge
        return { deliver: true };
      }
    };
    claimInjectionDelivery = claimInjectionDeliveryImpl;

    const boards = (): string[] => {
      let raw: string | undefined;
      if (Array.isArray(config.boards)) raw = config.boards.join(",");
      else if (typeof config.boards === "string") raw = config.boards;
      else if (config.board) raw = config.board;
      raw = process.env.BOARD_BOARDS ?? raw;
      const list = (raw ?? "general").split(",").map((board) => board.trim()).filter(Boolean);
      return list.length > 0 ? list : ["general"];
    };

    const isConflict = (error: unknown): boolean =>
      error instanceof Error && /(\b409\b|Another request)/.test(error.message);

    interface PollPage {
      board: string;
      /** Raw matching post ids from this page: mentioned by us AND plausible
       * strict ULIDs (everything else is skipped + warned — a nudge only ever
       * interpolates validated ids). Delivered/lease filtering happens later,
       * under the lease lock, against fresh state. */
      ids: string[];
      cursor?: string;
      /** True when this board had no persisted cursor yet (baseline poll). */
      baseline: boolean;
      /** The CLI's truncated flag: more pages follow this one. The initial
       * baseline floor must persist through ALL truncated initial pages. */
      truncated: boolean;
    }

    let badIdWarned = false;

    /** Read ONE board's page via the read-only CLI (claims nothing). A
     * failure degrades to no page (the tick backoffs). */
    async function pollPage(board: string, knownCursor: string | undefined, signal?: AbortSignal): Promise<PollPage | null> {
      const store = process.env.BOARD_STORE ?? config.store;
      if (!store) return null;
      const baseline = knownCursor === undefined;
      const args = ["read", "--store", store, "--board", board, "--limit", "100"];
      if (!baseline) args.push("--after", knownCursor);
      let raw: string;
      try {
        raw = await runBoard(cliPath, args, configEnv(config), signal);
      } catch {
        return null; // poll failure degrades to an empty poll (backoff)
      }
      let page: { posts?: unknown; cursor?: unknown };
      try {
        page = JSON.parse(raw);
      } catch {
        return null;
      }
      if (!page || !Array.isArray(page.posts)) return null;
      const ids: string[] = [];
      let badIds = 0;
      for (const post of page.posts) {
        const id = typeof (post as any)?.id === "string" ? (post as any).id as string : undefined;
        if (!id) continue;
        const mentions = (post as any)?.mentions;
        if (!Array.isArray(mentions) || !mentions.includes(identity)) continue;
        // Pointer-only invariant: only validated plausible strict ULIDs can
        // ever reach the nudge — skip + warn on anything else (wrong shape,
        // lowercase, or a decoded timestamp outside plausible bounds), never
        // interpolate.
        if (!isPlausibleUlid(id)) {
          badIds += 1;
          continue;
        }
        ids.push(id);
      }
      if (badIds > 0 && !badIdWarned) {
        badIdWarned = true;
        trace("bad-post-id", { board, posts: badIds });
      }
      return {
        board,
        ids,
        // Advance the cursor over everything this page listed, truncated or
        // not — truncation means "more work remains", not "forget the
        // position". Persisted under the lock even when the page yields no
        // candidate (an empty page must still move the read position).
        cursor: typeof page.cursor === "string" && page.cursor.length > 0 ? page.cursor : undefined,
        baseline,
        truncated: page.truncated === true,
      };
    }

    /** Deadline error marker: the only failure kind that did not originate
     * from the host (so it is never a 409 and never retried within a turn). */
    const SEND_DEADLINE_PREFIX = "send deadline exceeded";
    const isSendDeadlineError = (error: unknown): boolean =>
      error instanceof Error && error.message.startsWith(SEND_DEADLINE_PREFIX);

    /** Race `promise` against ONE absolute deadline (`deadlineAt`, a wall
     * clock timestamp shared by the stream-creation and drain stages, so a
     * wedged stage cannot inherit a fresh window — one deadline spans
     * creation + drain). On a miss, the returned promise rejects with a
     * deadline error and the underlying promise's late settlement is ignored
     * (no unhandled rejection, no lease corruption). The deadline timer is
     * cleared on settle and unref'd so it can never hold the host process
     * open. */
    function withDeadlineAt<T>(promise: Promise<T>, deadlineAt: number): Promise<T> {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let missed = false;
      return new Promise<T>((resolve, reject) => {
        timer = setTimeout(() => {
          missed = true;
          reject(new Error(`${SEND_DEADLINE_PREFIX} (${Math.max(0, deadlineAt - Date.now())}ms left)`));
        }, Math.max(0, deadlineAt - Date.now()));
        timer.unref?.();
        promise.then(
          (value) => {
            clearTimeout(timer);
            if (!missed) resolve(value);
          },
          (error) => {
            clearTimeout(timer);
            if (!missed) reject(error);
          },
        );
      });
    }

    type SendOutcome =
      | { kind: "sent"; attempts: number; delivered: string[] }
      | { kind: "skipped" } // delivered elsewhere or ownership lost: yield entirely
      | { kind: "aborted" }; // disposed mid-send: drop everything, touch nothing

    /** Extend the leases we still own (fencing token match) so injection
     * arbitration always sees an ACTIVE lease for the whole send window — a
     * mention must never become claimable while a wake carrying it is
     * in flight. Returns false when the section was fenced off (disposed) or
     * the lock failed; the next per-attempt recheck arbitrates from the file
     * either way. */
    async function renewReservation(token: string, myEpoch: number): Promise<void> {
      try {
        await arbitrate(async (data, now) => {
          // Finding: the epoch/tornDown check runs INSIDE the mutating
          // section — a dispose landing while this section waited for the
          // lock must not renew anything.
          if (tornDown || epoch !== myEpoch) return;
          let dirty = false;
          for (const lease of Object.values(data.leases)) {
            if (lease?.owner !== token) continue; // not ours (fencing)
            if (lease.expiresAt <= now) continue; // lapsed: never resurrect
            lease.expiresAt = now + leaseTtlMs;
            dirty = true;
          }
          if (dirty) await lock.persist(data, "renew");
        });
      } catch {
        trace("renew-failed", {}); // the reservation lapses by TTL; not silent
      }
    }

    /** One wake: recheck delivery AND ownership under the lease lock, then
     * create the stream and drain it to completion when it settles.
     * Acceptance requires a CLEAN FULL DRAIN after at least one chunk: an
     * attempt that yields chunks but then ERRORS mid-iteration is a FAILED
     * attempt (the run's outcome is unknown — it must release and retry, not
     * commit), as is an error before any chunk, a clean drain with ZERO
     * chunks (no run was started server-side), or an attempt that never
     * settles (its deadline fired). Each attempt races ONE absolute deadline
     * (`timerSendTimeoutMs` from the attempt's start, spanning the
     * sendMessageStream call AND its drain): the one await a wedged host
     * could park forever must not latch `sending` permanently. A deadline
     * miss warns via the trace channel and is a FAILED attempt (never
     * retried here): it throws into tick()'s release path, the lease
     * releases, and the mention is retried on a later tick.
     *
     * Before EVERY attempt (including the first) the reservation is RENEWED
     * and delivery state rechecked in one arbitration section, all fenced on
     * this wake's owner token: ids turn_start has delivered meanwhile are
     * dropped, and ids whose lease we no longer own (a successor process
     * took the lapsed reservation over) are dropped — a stale owner neither
     * sends nor commits. If none remain the timer yields ("skipped") —
     * exactly once, not double-fire. The 409 retry backoff sleeps
     * abortably (dispose wakes it immediately). Throws on final failure. */
    async function sendWithRetry(
      conversation: any,
      compose: (ids: string[]) => string,
      ids: string[],
      myEpoch: number,
      ownerToken: string,
      kept: string[],
    ): Promise<SendOutcome> {
      kept.splice(0, kept.length, ...ids);
      let attempt = 0;
      // Renewal heartbeat for the WHOLE send window (attempts + retry
      // sleeps): keeps `expiresAt` ahead of the clock so the injection's
      // arbitration defers for as long as this wake lives. The interval dies
      // with this function; renewal never resurrects a lapsed lease and is
      // fenced on the owner token.
      const renewTimer = setInterval(() => { void renewReservation(ownerToken, myEpoch); }, Math.max(250, Math.floor(leaseTtlMs / 3)));
      renewTimer.unref?.();
      try {
        for (;;) {
          let rechecked: string[] | null = null;
          try {
            rechecked = await arbitrate(async (data, now) => {
              // Disposed while waiting for the lock: abort INSIDE the
              // section, before any decision.
              if (tornDown || epoch !== myEpoch) return null;
              const fresh: string[] = [];
              let dirty = false;
              for (const id of kept) {
                if (data.delivered[id] !== undefined) continue; // injection owns it
                const lease = data.leases[id];
                // Ownership fence: an absent, foreign, or expired lease means
                // a successor took this mention over — never send it.
                if (!lease || lease.owner !== ownerToken || lease.expiresAt <= now) continue;
                lease.expiresAt = now + leaseTtlMs; // renew-on-recheck
                dirty = true;
                fresh.push(id);
              }
              if (dirty) await lock.persist(data, "recheck");
              return fresh;
            });
          } catch {
            rechecked = null; // lock lost: cannot verify → conservatively do not send
          }
          if (rechecked === null) {
            if (tornDown || epoch !== myEpoch) return { kind: "aborted" }; // disposed: silent abort
            trace("recheck-locked-out", { attempt });
            return { kind: "skipped" };
          }
          kept.splice(0, kept.length, ...rechecked);
          if (kept.length === 0) return { kind: "skipped" };
          if (tornDown || epoch !== myEpoch) return { kind: "aborted" };
          const text = compose(kept);
          attempt += 1;
          // ONE absolute deadline for this attempt: it covers stream creation
          // AND drain (per-stage timers would hand a wedged drain a fresh
          // window on top of a half-spent creation window).
          const deadlineAt = Date.now() + sendTimeoutMs;
          const started = Date.now();
          try {
            const stream = await withDeadlineAt(
              conversation.sendMessageStream([{ role: "user", content: text }]),
              deadlineAt,
            );
            let chunks = 0;
            let iterationError: unknown = null;
            try {
              await withDeadlineAt((async () => {
                for await (const _chunk of stream) chunks += 1;
              })(), deadlineAt);
            } catch (error) {
              iterationError = error;
            }
            if (iterationError !== null || chunks === 0) {
              // A failed attempt REGARDLESS of chunk count: chunks then an
              // iteration error means the run's outcome is unknown (the old
              // code committed here — that let a crashed run consume the
              // mention); a clean drain with zero chunks never started a run.
              // Both release the lease so turn_start still delivers and the
              // retry pool re-enters the mention.
              if (iterationError !== null && !isSendDeadlineError(iterationError)) {
                trace("stream-error-after-chunks", { attempt, chunks, ms: Date.now() - started });
              }
              throw iterationError ?? new Error("wake stream produced no chunks");
            }
            trace("drained", { attempt, chunks, ms: Date.now() - started });
            return { kind: "sent", attempts: attempt, delivered: kept.slice() };
          } catch (error) {
            if (isSendDeadlineError(error)) {
              trace("send-timeout", { attempt, timeoutMs: sendTimeoutMs, ms: Date.now() - started });
            }
            const conflict = isConflict(error);
            trace("send-error", { attempt, kind: conflict ? "conflict" : "error" });
            if (tornDown || epoch !== myEpoch) return { kind: "aborted" }; // no retries past dispose
            if (!conflict || attempt >= MAX_SEND_ATTEMPTS) throw error;
            // 409 = a run is in flight (this IS the idle detector on hosts that
            // never emit turn_end). Back off and retry — abortably, so a
            // dispose during the sleep tears down immediately instead of
            // holding the tick for the whole delay.
            const delay = retryDelaysMs[Math.min(attempt - 1, retryDelaysMs.length - 1)] ?? DEFAULT_RETRY_DELAYS_MS[0]!;
            await abortableSleep(delay, wakeAbort.signal);
          }
        }
      } finally {
        clearInterval(renewTimer);
      }
    }

    let ticking = false;
    let sending = false;
    let emptyPolls = 0;
    let nextAllowedAt = 0;
    let noHandleLogged = false;
    let identityWarned = false;
    // One monotonic epoch per activation: dispose bumps it, and every state
    // transition re-checks it first, so a disposed timer can neither commit
    // nor release after teardown.
    let epoch = 0;
    let tornDown = false;
    // Aborts an in-flight poll spawn at dispose (sends are orphaned by the
    // epoch check instead — the host sendMessageStream API takes no signal).
    const wakeAbort = new AbortController();
    // Chain of in-flight tick completions; dispose flushes it (plus the trace
    // queue) as its last action.
    let tickSettled: Promise<void> = Promise.resolve();

    /** Release one set of reserved ids under the lock, awaiting the durable
     * write. `retry` adds the ids to the PERSISTED retry pool (released
     * unfinished work re-enters later ticks / restarts even though the poll
     * cursor moved past their page); without it the ids are only unreserved
     * (their delivery is owned by turn_start). FENCED: only ids whose lease
     * still carries this wake's owner token are touched — a successor
     * process's newer state is never overwritten by a stale release. The
     * epoch/tornDown check runs INSIDE the section, so a dispose that lands
     * while the lock was busy makes this a no-op. Throws on save failure —
     * callers trace it, never swallow silently. */
    async function releaseUnderLock(ids: string[], retry: boolean, myEpoch: number, ownerToken: string | undefined): Promise<void> {
      await arbitrate(async (data, now) => {
        if (tornDown || epoch !== myEpoch) return; // disposed: no post-dispose transitions
        let changed = false;
        for (const id of ids) {
          const lease = data.leases[id];
          if (lease !== undefined) {
            if (ownerToken !== undefined && lease.owner !== ownerToken) continue; // fencing: not ours to release
            delete data.leases[id];
            changed = true;
          }
          if (retry && data.delivered[id] === undefined && data.retry[id] === undefined) {
            data.retry[id] = now;
            changed = true;
          }
        }
        if (rehydrateAndGc(data, now)) changed = true;
        if (changed) await lock.persist(data, retry ? "release" : "skip");
      });
    }

    async function tick(): Promise<void> {
      if (tornDown || ticking || sending) return; // never overlap polls or our own wake run
      // Only a handle captured under THIS activation's generation is ever
      // used (re-activation invalidates old handles), and it is always the
      // handle captured FOR this session's conversation id.
      const session = wakeCurrent && wakeCurrent.generation === myGeneration ? wakeCurrent : null;
      const conversation = session?.conversation;
      if (!conversation || typeof conversation.sendMessageStream !== "function") {
        if (!noHandleLogged) {
          noHandleLogged = true;
          trace("no-handle");
        }
        return; // nothing captured yet (or the conversation closed)
      }
      // The nudge interpolates the agent name: it must be a plain validated
      // name before any reservation or send. Skip + warn otherwise.
      if (!AGENT_NAME_RE.test(identity)) {
        if (!identityWarned) {
          identityWarned = true;
          trace("bad-identity", { length: identity.length });
        }
        return;
      }
      if (Date.now() < nextAllowedAt) return; // backed off after empty polls
      if (session.sawTurnEnd && session.runInFlight) {
        trace("hold-busy");
        return; // a run is in flight and this host does emit turn_end
      }
      ticking = true;
      const myEpoch = epoch;
      // Owner fencing token for THIS tick's reservation: every lease it
      // creates carries it, and every renew/recheck/commit/release is
      // conditional on it. A successor that takes a lapsed reservation over
      // mints its own — a stale owner's late writes are then rejected.
      const ownerToken = randomUUID();
      try {
        // Fresh cursors for the poll (best effort: if the lock is busy the
        // poll may re-list older posts — reserve-time filters dedupe them).
        const known: Record<string, string | undefined> = {};
        try {
          await lock.withLock(async (data) => {
            for (const board of boards()) known[board] = data.cursor[board];
          });
        } catch {}
        // Read-only poll (claims nothing; abortable by dispose).
        const pages: Array<PollPage | null> = [];
        for (const board of boards()) {
          pages.push(await pollPage(board, known[board], wakeAbort.signal));
          if (tornDown || epoch !== myEpoch) return; // disposed mid-poll
        }
        const good = pages.filter((page): page is PollPage => page !== null);

        // ONE arbitration section: crash rehydration, cursor advances
        // (persisted even when a page yields no candidate), retry-pool merge,
        // candidate filtering against fresh state, reservation — all made
        // durable with an AWAITED write before any send leaves. A failed
        // persist aborts the wake here (nothing was consumed, nothing is
        // sent). The epoch/tornDown fence runs INSIDE the section: a dispose
        // landing while this section waited for the lock reserves nothing.
        let found: string[] = [];
        let reserved = false;
        let reserveFenced = false;
        const candidates: string[] = [];
        try {
          const outcome = await arbitrate(async (data, now) => {
            if (tornDown || epoch !== myEpoch) return { fenced: true as const, candidates: [] as string[] };
            let dirty = rehydrateAndGc(data, now);
            for (const page of good) {
              if (page.cursor !== undefined && data.cursor[page.board] !== page.cursor) {
                data.cursor[page.board] = page.cursor;
                dirty = true;
              }
              // The baseline floor (accept only posts newer than this
              // activation) holds until the board produces a NON-truncated
              // page — through EVERY page of the initial sweep, not just the
              // first: an old mention sitting on page 2 of the initial poll
              // must never wake or nudge. The flag persists across ticks and
              // restarts; it survives until a final, non-truncated page
              // arrives.
              const floored = page.baseline || data.initial[page.board] === true;
              if (page.truncated && floored) {
                if (data.initial[page.board] !== true) { data.initial[page.board] = true; dirty = true; }
              } else if (!page.truncated && page.cursor !== undefined && data.initial[page.board] === true) {
                // The sweep is done AND the read position is explicit again:
                // pages fetched behind this cursor carry only newer posts, so
                // the activation floor can lift. A final page WITHOUT a
                // cursor leaves the position where it was — re-listed pages
                // can carry old posts again, so the floor stays.
                delete data.initial[page.board];
                dirty = true;
              }
              for (const id of page.ids) {
                if (floored) {
                  // Baseline sweep: only posts created since the mod
                  // activated (60 s clock-skew allowance) are candidates, so
                  // turning the timer on never replays history.
                  const createdMs = ulidTimeMs(id);
                  if (createdMs === null || createdMs < ACTIVATED_AT - 60_000) continue;
                }
                if (candidates.includes(id)) continue;
                if (data.delivered[id] !== undefined) continue;
                const active = data.leases[id];
                if (active && active.expiresAt > now) continue;
                candidates.push(id);
              }
            }
            // Persisted retry pool: ids released unfinished (failed wake) or
            // rehydrated from a crashed reservation. The page that listed
            // them is behind the cursor now, so this bridge is the only way
            // they re-enter — across ticks AND across restarts. Delivered
            // ids (timer commit or turn_start injection) are pruned;
            // rehydrateAndGc has already dropped malformed persisted ids
            // (skipped + warned — never nudged), and the pool is
            // re-validated here so garbage can never re-enter as a candidate.
            for (const id of Object.keys(data.retry)) {
              if (!isPlausibleUlid(id)) { delete data.retry[id]; dirty = true; continue; }
              if (data.delivered[id] !== undefined) { delete data.retry[id]; dirty = true; continue; }
              const active = data.leases[id];
              if (active && active.expiresAt > now) continue;
              if (!candidates.includes(id)) candidates.push(id);
            }
            for (const id of candidates) data.leases[id] = { expiresAt: now + leaseTtlMs, owner: ownerToken };
            if (candidates.length > 0) dirty = true;
            if (dirty) await lock.persist(data, "reserve");
            return { fenced: false as const, candidates };
          });
          if (outcome.fenced) reserveFenced = true;
          else { found = outcome.candidates; reserved = true; }
        } catch (error) {
          // No durable reservation → no send. Never silent.
          trace("reserve-failed", { kind: isConflict(error) ? "conflict" : "error" });
        }
        if (reserveFenced) return; // disposed mid-reserve: silent, nothing persisted
        if (!reserved || tornDown || epoch !== myEpoch) return;
        if (found.length === 0) {
          emptyPolls += 1;
          const waitMs = Math.min(basePollMs * 2 ** emptyPolls, backoffCapMs);
          nextAllowedAt = Date.now() + waitMs;
          trace("poll", { found: 0 });
          trace("backoff", { waitMs, emptyPolls });
          return;
        }
        emptyPolls = 0;
        nextAllowedAt = Date.now() + basePollMs;
        trace("poll", { found: found.length });
        trace("reserved", { posts: found.length, ids: found.join(",") });

        // Pointer-only nudge: the exact backlog-106 daemon wording, one line
        // per post. No bodies, no titles, no authors, no UNTRUSTED framing —
        // framing belongs to turn_start injection, the only content path.
        // Every id passed `pollPage`'s strict-ULID gate and the identity
        // passed AGENT_NAME_RE above, so only validated values are ever
        // interpolated.
        const composeNudge = (ids: string[]): string => ids
          .map((id) => `A new board post mentions ${identity} (post ${id}). Run board read.`)
          .join("\n");

        sending = true;
        const started = Date.now();
        // The ids actually in the last sent text (sendWithRetry mirrors its
        // per-attempt fenced recheck here).
        const kept: string[] = [];
        try {
          const outcome = await sendWithRetry(conversation, composeNudge, found, myEpoch, ownerToken, kept);
          if (tornDown || epoch !== myEpoch) return; // disposed mid-send: NO post-dispose transitions
          const dropped = found.filter((id) => !kept.includes(id)); // delivered by turn_start or fenced away mid-retry
          if (outcome.kind === "sent") {
            // Accepted (clean full drain after >=1 chunk): finalize the lease
            // — awaited + persisted under the arbitration lock, the mention
            // is nudged exactly once. The commit is FENCED on the owner
            // token: only ids this wake still owns are finalized; ids whose
            // lease a successor process has taken over are left untouched
            // (a stale owner's commit must never overwrite newer state).
            let committedIds: string[] = [];
            let fencedOut = 0;
            try {
              await arbitrate(async (data, now) => {
                // Epoch/tornDown check INSIDE the mutating section: a
                // dispose landing while the lock was busy commits nothing.
                if (tornDown || epoch !== myEpoch) return;
                committedIds = [];
                fencedOut = 0;
                for (const id of outcome.delivered) {
                  const lease = data.leases[id];
                  if (lease !== undefined && lease.owner !== ownerToken) { fencedOut += 1; continue; }
                  if (lease !== undefined) delete data.leases[id];
                  data.delivered[id] = now;
                  delete data.retry[id];
                  committedIds.push(id);
                }
                for (const id of dropped) {
                  const lease = data.leases[id];
                  if (lease === undefined || lease.owner === ownerToken) delete data.leases[id];
                }
                await lock.persist(data, "commit");
              });
              if (fencedOut > 0) trace("commit-fence-rejected", { posts: fencedOut });
              if (committedIds.length > 0) {
                trace("send-accepted", { attempts: outcome.attempts, ms: Date.now() - started, posts: committedIds.length, nudge: composeNudge(committedIds) });
                trace("commit", { ids: committedIds.join(",") });
              }
            } catch {
              // Delivery DID land; never silent. The stale reservation
              // lapses via TTL + crash rehydration (worst case one duplicate
              // nudge after a restart).
              trace("commit-save-failed", { posts: outcome.delivered.length });
            }
          } else if (outcome.kind === "skipped") {
            // turn_start delivered them, or ownership was lost to a
            // successor's takeover: yield. No timer commit, no retry entry.
            try {
              await releaseUnderLock(found, false, myEpoch, ownerToken);
              trace("skip-delivered", { posts: found.length, ids: found.join(",") });
            } catch {
              trace("skip-release-failed", { posts: found.length });
            }
          } // "aborted": dispose owns the world now — touch nothing.
        } catch (error) {
          if (tornDown || epoch !== myEpoch) return; // no post-dispose transitions
          // Exhausted or hard-failed: release. The mention goes back to
          // unread — turn_start injection still delivers it (claim-once
          // honesty end to end) — and it is added to the PERSISTED retry
          // pool, so a released mention is retried on a later tick or after
          // a restart even though the poll cursor has moved past its page.
          const conflict = isConflict(error);
          trace("send-failed", {
            attempts: MAX_SEND_ATTEMPTS,
            kind: conflict ? "conflict" : "error",
            posts: kept.length,
          });
          try {
            await releaseUnderLock(kept, true, myEpoch, ownerToken);
            trace("release", { ids: kept.join(",") });
          } catch {
            trace("release-save-failed", { posts: kept.length }); // lease lapses via TTL; not silent
          }
        } finally {
          sending = false;
        }
      } finally {
        ticking = false;
      }
    }

    const timer = setInterval(() => {
      if (tornDown) return;
      const done = tick().catch(() => {});
      tickSettled = tickSettled.then(() => done, () => done);
    }, basePollMs);
    timer.unref?.(); // never hold the host process open for wake polling
    disposers.push(() => {
      // Dispose must cancel an in-flight poll/retry/send and must not let a
      // disposed timer commit or release. Host disposers are synchronous, so
      // pending writes are COORDINATED rather than awaited: every mutating
      // lock section re-checks the epoch INSIDE the section (a section still
      // waiting for the lock mutates nothing), writes already issued inside a
      // section always complete; nothing new may start after `tornDown`; and
      // the trace queue is drained by a tracked tail (teardown.drain()).
      tornDown = true;
      epoch += 1;
      clearInterval(timer);
      wakeAbort.abort(); // wakes the 409 retry backoff sleep immediately
      const drain = tickSettled.then(() => traceQueue).catch(() => {});
      drainPromises.push(drain);
    });
    trace("timer-started", {
      pollMs: basePollMs,
      backoffCapMs,
      leaseTtlMs,
      retryDelaysMs: retryDelaysMs.join(","),
      sendTimeoutMs,
    });
  }

  const teardown = () => {
    disposed = true;
    for (const dispose of disposers.reverse()) dispose();
    // Sessions captured by THIS activation die with it. The comparison uses
    // the generation captured at REGISTRATION, never the global current one:
    // a newer activation's disposer runs with wakeGeneration already bumped
    // past ours, and comparing against the global would delete ITS fresh
    // captures (finding: an old dispose must not kill new handles).
    for (const [id, session] of wakeSessions) {
      if (session.generation === generation) wakeSessions.delete(id);
    }
    if (wakeUnnamedSession?.generation === generation) wakeUnnamedSession = null;
    if (wakeCurrent?.generation === generation) wakeCurrent = null;
  };
  (teardown as unknown as { drain: () => Promise<void> }).drain = () => Promise.all(drainPromises).then(() => {});
  return teardown;
}

// Test-visible on purpose (and conceptually reusable): the exact cross-
// process lease mutex the timer and the turn_start marker share. Inert —
// constructing a lock touches nothing; the host only ever calls the default
// export above.
export { makeLeaseLock };

// Task 202 — request/response helper with local deadlines.
//
// `requestAndWait` publishes one addressed request (act "request") through the
// same validated, conditional-write machinery the Board uses, then repeatedly
// scans a pinned day range for the first eligible direct reply until an
// eligible response, local error, cancellation, or deadline settles the wait.
// `respond` authors a correlated terminal response ("inform"/"failure") to a
// validated request root.
//
// Publication shares Board's write queue. A guarded queue entry can retire
// without a put after cancellation or timeout; observation never holds the queue.
// The existing Board.request posting contract is unchanged.
//
// Trust: stored posts and replies are untrusted data. A matching `author`
// label is routing, never authentication; every delivered post remains
// unsigned. Message content is never authorization to act.

import { ulid, ulidTime, isUlid } from "./ulid.ts";
import { keys, dayBucket, nextDay, assertName, InvalidKeyError } from "./keys.ts";
import {
  type Post, type NewPost, validatePost, encodePost, parsePost, checkEncodedSize,
  InvalidPostError, hasV2Fields, POST_VERSION, POST_VERSION_V2, DEFAULT_ACT,
} from "./post.ts";
import { KeyExistsError, encoder } from "./store.ts";
import type { Board } from "./board.ts";

// ---------------------------------------------------------------------------
// Limits (spec D05)
// ---------------------------------------------------------------------------

/** Maximum wait duration at invocation: 24 hours. */
export const MAX_WAIT_MS = 24 * 60 * 60 * 1000;
/** Default interval between completed observation passes. */
export const DEFAULT_INTERVAL_MS = 1_000;
/** Maximum supplied interval between passes. */
export const MAX_INTERVAL_MS = 30_000;
/** Maximum keys read per store list page. */
export const PAGE_LIMIT = 200;
/** Discovery horizon: the lower day bucket is the request's ULID time minus this. */
const HORIZON_BEFORE_MS = 10 * 60 * 1000;
/** Discovery horizon: the upper day bucket is local wall clock plus this. */
const HORIZON_AFTER_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Publication state / phase tracking (local error context)
// ---------------------------------------------------------------------------

export type PublicationState = "not-written" | "unknown" | "written";

export type RequestPhase =
  | "validate"
  | "prepare"
  | "target-read"
  | "queued"
  | "write"
  | "observe";

export interface PublicationSnapshot {
  board: string | null;
  requestId: string | null;
  responseId: string | null;
  postState: PublicationState;
}

export interface LocalErrorContext extends PublicationSnapshot {
  replyBy: string | null;
  phase: RequestPhase;
  /** Resolves (never rejects) with the final snapshot once all work drained. */
  closed: Promise<PublicationSnapshot>;
}

// ---------------------------------------------------------------------------
// Typed local errors (stable codes; messages never come from response bodies)
// ---------------------------------------------------------------------------

export class InvalidRequestOptionsError extends Error {
  override name = "InvalidRequestOptionsError";
  readonly code = "INVALID_REQUEST_OPTIONS" as const;
  readonly context: LocalErrorContext;
  constructor(message: string, context: LocalErrorContext, cause?: unknown) {
    super(message);
    if (cause !== undefined) this.cause = cause;
    this.context = context;
  }
}

export class RequestTimeoutError extends Error {
  override name = "RequestTimeoutError";
  readonly code = "REQUEST_TIMEOUT" as const;
  readonly context: LocalErrorContext;
  constructor(message: string, context: LocalErrorContext, cause?: unknown) {
    super(message);
    if (cause !== undefined) this.cause = cause;
    this.context = context;
  }
}

export class RequestCancelledError extends Error {
  override name = "RequestCancelledError";
  readonly code = "REQUEST_CANCELLED" as const;
  readonly context: LocalErrorContext;
  constructor(message: string, context: LocalErrorContext, cause?: unknown) {
    super(message);
    if (cause !== undefined) this.cause = cause;
    this.context = context;
  }
}

export class RequestWriteError extends Error {
  override name = "RequestWriteError";
  readonly code = "REQUEST_WRITE_FAILED" as const;
  readonly context: LocalErrorContext;
  constructor(message: string, context: LocalErrorContext, cause?: unknown) {
    super(message);
    if (cause !== undefined) this.cause = cause;
    this.context = context;
  }
}

export class RequestReadError extends Error {
  override name = "RequestReadError";
  readonly code = "REQUEST_READ_FAILED" as const;
  readonly context: LocalErrorContext;
  constructor(message: string, context: LocalErrorContext, cause?: unknown) {
    super(message);
    if (cause !== undefined) this.cause = cause;
    this.context = context;
  }
}

export class ResponseTargetError extends Error {
  override name = "ResponseTargetError";
  readonly code = "RESPONSE_TARGET_INVALID" as const;
  readonly context: LocalErrorContext;
  constructor(message: string, context: LocalErrorContext, cause?: unknown) {
    super(message);
    if (cause !== undefined) this.cause = cause;
    this.context = context;
  }
}

export class ResponseReadError extends Error {
  override name = "ResponseReadError";
  readonly code = "RESPONSE_READ_FAILED" as const;
  readonly context: LocalErrorContext;
  constructor(message: string, context: LocalErrorContext, cause?: unknown) {
    super(message);
    if (cause !== undefined) this.cause = cause;
    this.context = context;
  }
}

export class ResponseWriteError extends Error {
  override name = "ResponseWriteError";
  readonly code = "RESPONSE_WRITE_FAILED" as const;
  readonly context: LocalErrorContext;
  constructor(message: string, context: LocalErrorContext, cause?: unknown) {
    super(message);
    if (cause !== undefined) this.cause = cause;
    this.context = context;
  }
}

export class RequestInternalError extends Error {
  override name = "RequestInternalError";
  readonly code = "INTERNAL_ERROR" as const;
  readonly context: LocalErrorContext;
  constructor(message: string, context: LocalErrorContext, cause?: unknown) {
    super(message);
    if (cause !== undefined) this.cause = cause;
    this.context = context;
  }
}

// ---------------------------------------------------------------------------
// Input option types
// ---------------------------------------------------------------------------

/**
 * Caller input for `requestAndWait`. The managed fields (`to`, `act`,
 * `protocol`, `task`, `status`, `replyBy`) are owned by the helper; supplying
 * them is rejected before any put.
 */
export type RequestInput = Omit<
  NewPost,
  "to" | "act" | "protocol" | "task" | "status" | "replyBy"
>;

/** Response input additionally rejects `title`. */
export type ResponseInput = Omit<RequestInput, "title">;

export interface RequestWaitOptions {
  /** Required deadline, strict UTC `YYYY-MM-DDTHH:mm:ss[.SSS]Z`. */
  replyBy: string;
  signal?: AbortSignal;
  /** Interval between completed observation passes; default 1000, max 30000. */
  intervalMs?: number;
}

export interface RespondOptions {
  /** Defaults to "inform"; choose "failure" explicitly to report one. */
  outcome?: "inform" | "failure";
}

export interface RequestReply {
  /** Normalized act of the observed reply ("inform" for a legacy reply). */
  kind: "inform" | "failure";
  request: Post;
  reply: Post;
  /** Local wall-clock receipt time; never stored on the Post. */
  observedAt: string;
}

/** Injectable clocks/timers for tests and internal adapter handoff. */
export interface WaitHooks {
  wallNow?: () => number;
  monoNow?: () => number;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
  /** Yield between list pages so a busy board cannot monopolize the loop. */
  yieldToEventLoop?: () => Promise<void>;
}

interface ResolvedHooks {
  wallNow: () => number;
  monoNow: () => number;
  setT: (fn: () => void, ms: number) => unknown;
  clearT: (handle: unknown) => void;
  yieldToEventLoop: () => Promise<void>;
}

function resolveHooks(hooks: WaitHooks): ResolvedHooks {
  return {
    wallNow: hooks.wallNow ?? Date.now,
    monoNow: hooks.monoNow ?? (() => performance.now()),
    setT: hooks.setTimeout ?? ((fn, ms) => setTimeout(fn, ms)),
    clearT: hooks.clearTimeout ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)),
    yieldToEventLoop: hooks.yieldToEventLoop ?? (() => new Promise<void>((r) => setTimeout(r, 0))),
  };
}

// ---------------------------------------------------------------------------
// replyBy syntax: strict UTC, zero or exactly three fractional digits
// ---------------------------------------------------------------------------

const REPLY_BY_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z$/;

/** Millisecond UTC for a syntactically and calendar-valid replyBy, else null. */
export function parseReplyBy(s: unknown): number | null {
  if (typeof s !== "string") return null;
  const m = REPLY_BY_RE.exec(s);
  if (!m) return null;
  const y = +m[1]!, mo = +m[2]!, d = +m[3]!, h = +m[4]!, mi = +m[5]!, sec = +m[6]!;
  const frac = m[7] ? +m[7] : 0;
  const ms = Date.UTC(y, mo - 1, d, h, mi, sec, frac);
  const rt = new Date(ms);
  if (
    rt.getUTCFullYear() !== y || rt.getUTCMonth() !== mo - 1 || rt.getUTCDate() !== d ||
    rt.getUTCHours() !== h || rt.getUTCMinutes() !== mi || rt.getUTCSeconds() !== sec ||
    rt.getUTCMilliseconds() !== frac
  ) return null;
  return ms;
}

// ---------------------------------------------------------------------------
// Managed input fields and copying
// ---------------------------------------------------------------------------

const MANAGED_REQUEST_FIELDS = ["to", "act", "protocol", "task", "status", "replyBy"] as const;
const OPTIONAL_INPUT_FIELDS = [
  "title", "tags", "mentions", "attachments", "ext",
  "expires", "contentType", "data", "dataSchema", "origin", "trace", "extensions",
] as const;

function hasOwn(o: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, key);
}

function rejectManagedFields(input: object, extra: readonly string[] = []): void {
  for (const f of [...MANAGED_REQUEST_FIELDS, ...extra]) {
    if (hasOwn(input, f)) throw new InvalidPostError(`reserved input field: ${f}`);
  }
}

function copyInputFields(input: Record<string, unknown>, out: Record<string, unknown>): void {
  for (const f of OPTIONAL_INPUT_FIELDS) {
    if (input[f] !== undefined) out[f] = input[f];
  }
}

// ---------------------------------------------------------------------------
// Reply eligibility (routing + correlation; never authorization)
// ---------------------------------------------------------------------------

export function isEligibleReply(
  q: Post,
  recipients: readonly string[],
  boardName: string,
  p: Post,
  wallMs: number,
): boolean {
  if (p.board !== boardName) return false;
  if (p.id === q.id) return false;
  // Direct response to the request only; descendant chatter is excluded.
  if (p.thread !== q.id || p.replyTo !== q.id) return false;
  if (p.task !== undefined && p.task !== q.id) return false;
  if (p.protocol !== undefined && p.protocol !== "request") return false;
  const act = p.act ?? DEFAULT_ACT;
  if (act !== "inform" && act !== "failure") return false;
  if (!recipients.includes(p.author)) return false;
  if (p.to !== undefined && !p.to.includes(q.author)) return false;
  if (p.expires !== undefined) {
    const t = Date.parse(p.expires);
    if (Number.isNaN(t) || !(t > wallMs)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Per-invocation engine state
// ---------------------------------------------------------------------------

interface WaitCore {
  board: Pick<Board, "name">;
  hooks: ResolvedHooks;
  recipients: string[];
  replyByWire: string | null;
  cutoffMono: number;
  signal: AbortSignal | undefined;
  phase: RequestPhase;
  requestId: string | null;
  responseId: string | null;
  requestPost: Post | null;
  postState: PublicationState;
  putStarted: boolean;
  putFinal: PublicationState | null;
  settled: boolean;
  settlement: { ok: true; value: RequestReply } | { ok: false; error: Error } | null;
  cleanups: Array<() => void>;
  wakes: Set<() => void>;
  pendingOps: number;
  closed: Promise<PublicationSnapshot>;
  resolveClosed: (s: PublicationSnapshot) => void;
}

class SettledSignal extends Error {
  constructor() { super("settled"); }
}

function makeCore(
  board: Pick<Board, "name">, hooks: ResolvedHooks, recipients: string[],
  replyByWire: string | null, cutoffMono: number, signal: AbortSignal | undefined,
): WaitCore {
  let resolveClosed!: (s: PublicationSnapshot) => void;
  const closed = new Promise<PublicationSnapshot>((resolve) => { resolveClosed = resolve; });
  return {
    board, hooks, recipients, replyByWire, cutoffMono, signal,
    phase: "validate",
    requestId: null,
    responseId: null,
    requestPost: null,
    postState: "not-written",
    putStarted: false,
    putFinal: null,
    settled: false,
    settlement: null,
    cleanups: [],
    wakes: new Set(),
    pendingOps: 0,
    closed,
    resolveClosed,
  };
}

function contextOf(c: WaitCore, phase: RequestPhase = c.phase): LocalErrorContext {
  return {
    board: c.board.name,
    requestId: c.requestId,
    responseId: c.responseId,
    postState: c.postState,
    replyBy: c.replyByWire,
    phase,
    closed: c.closed,
  };
}

function finalSnapshotOf(c: WaitCore): PublicationSnapshot {
  return {
    board: c.board.name,
    requestId: c.requestId,
    responseId: c.responseId,
    postState: c.putStarted ? (c.putFinal ?? c.postState) : c.postState,
  };
}

/** Attach both handlers so late Store failures never become unhandled rejections. */
function track<T>(c: WaitCore, p: Promise<T>): Promise<T> {
  c.pendingOps++;
  const done = () => {
    c.pendingOps--;
    if (c.settled && c.pendingOps === 0) c.resolveClosed(finalSnapshotOf(c));
  };
  p.then(done, done);
  return interruptible(c, p);
}

/** Stop awaiting on settlement while retaining handlers for backend drainage. */
function interruptible<T>(c: WaitCore, p: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const wake = () => { c.wakes.delete(wake); reject(new SettledSignal()); };
    p.then(
      (value) => { c.wakes.delete(wake); resolve(value); },
      (error) => { c.wakes.delete(wake); reject(error); },
    );
    if (c.settled) wake();
    else c.wakes.add(wake);
  });
}

/**
 * Like `track`, but records the put's final publication state as soon as it
 * settles, so `closed` reports the drained outcome even when the wait was
 * already settled while the put was in flight.
 */
function trackPut(c: WaitCore, p: Promise<unknown>): Promise<unknown> {
  c.pendingOps++;
  const done = (isOk: boolean, e?: unknown) => {
    c.putFinal = isOk ? "written" : (e instanceof KeyExistsError ? "not-written" : "unknown");
    c.pendingOps--;
    if (c.settled && c.pendingOps === 0) c.resolveClosed(finalSnapshotOf(c));
  };
  p.then(() => done(true), (e) => done(false, e));
  return p;
}

function commit(c: WaitCore, s: { ok: true; value: RequestReply } | { ok: false; error: Error }): void {
  if (c.settled) return;
  c.settled = true;
  c.settlement = s;
  finalize(c);
}

function finalize(c: WaitCore): void {
  for (const cleanup of c.cleanups.splice(0)) {
    try { cleanup(); } catch { /* cleanup must never mask the outcome */ }
  }
  for (const wake of [...c.wakes]) wake();
  c.wakes.clear();
  if (c.pendingOps === 0) c.resolveClosed(finalSnapshotOf(c));
}

// ---------------------------------------------------------------------------
// Shared per-Board publication ordering
// ---------------------------------------------------------------------------

function helperWrite<T>(board: Board, run: () => Promise<T>): Promise<T> {
  return board.enqueueWrite(run);
}

// ---------------------------------------------------------------------------
// Terminal commitments (one idempotent finalizer; first terminal wins)
// ---------------------------------------------------------------------------

function commitTimeout(c: WaitCore, phase: RequestPhase): void {
  commit(c, { ok: false, error: new RequestTimeoutError(
    "No eligible response was observed before the deadline.", contextOf(c, phase),
  ) });
}

function commitCancelled(c: WaitCore, phase: RequestPhase): void {
  commit(c, { ok: false, error: new RequestCancelledError(
    "The local request wait was cancelled.", contextOf(c, phase),
  ) });
}

function commitError(c: WaitCore, err: Error, phase: RequestPhase): void {
  c.phase = phase;
  commit(c, { ok: false, error: err });
}

/** Signal/deadline tie rule at every continuation: signal, then deadline, then result. */
function checkTerminal(c: WaitCore): void {
  if (c.settled) throw new SettledSignal();
  const phase = c.phase === "validate" ? "prepare" : c.phase;
  if (c.signal?.aborted) {
    commitCancelled(c, phase);
    throw new SettledSignal();
  }
  if (c.hooks.monoNow() >= c.cutoffMono) {
    commitTimeout(c, phase);
    throw new SettledSignal();
  }
}

// ---------------------------------------------------------------------------
// requestAndWait
// ---------------------------------------------------------------------------

export async function requestAndWait(
  board: Board,
  to: string | readonly string[],
  input: RequestInput,
  opts: RequestWaitOptions,
): Promise<RequestReply> {
  return runRequestWait(board, to, input, opts, {});
}

/**
 * Internal integration entry: same engine, injectable clocks/timers. The
 * public `requestAndWait` delegates here with default hooks and creates its
 * own invocation context; adapters may pass a captured entry context instead.
 */
export interface RequestInvocation {
  /** @internal Shared latch, clocks, publication record, and drainage promise. */
  readonly core: WaitCore;
  readonly input: RequestInput;
  readonly intervalMs: number;
}

/** @internal Capture before asynchronous preparation; hand this same object to core. */
export function captureRequestInvocation(
  board: Pick<Board, "name">,
  to: string | readonly string[],
  input: RequestInput,
  opts: RequestWaitOptions,
  hooksIn: WaitHooks = {},
): RequestInvocation {
  const hooks = resolveHooks(hooksIn);
  const entryWall = hooks.wallNow();
  const entryMono = hooks.monoNow();
  board = { name: assertName(board.name, "board") };

  const failNow = (err: Error): never => {
    attachContext(err, {
      board: board.name, requestId: null, responseId: null, postState: "not-written",
      replyBy: null, phase: "validate",
      closed: Promise.resolve({
        board: board.name, requestId: null, responseId: null, postState: "not-written",
      }),
    });
    throw err;
  };

  // --- validate (before any Store I/O) -------------------------------------
  if (typeof opts !== "object" || opts === null) {
    failNow(new InvalidRequestOptionsError("Request or response options are invalid.", nullCtx(board.name)));
  }
  let recipients: string[];
  try {
    const list = Array.isArray(to) ? [...to] : [to];
    if (list.length === 0 || !list.every((n) => typeof n === "string")) {
      throw new InvalidKeyError("request needs at least one recipient in to");
    }
    recipients = list.map((n) => assertName(n, "to"));
  } catch (e) {
    if (e instanceof InvalidKeyError) {
      failNow(new InvalidRequestOptionsError(e.message, nullCtx(board.name), e));
    }
    throw e;
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    failNow(new InvalidRequestOptionsError("Post input is invalid.", nullCtx(board.name)));
  }
  try {
    rejectManagedFields(input);
  } catch (e) {
    failNow(e as InvalidPostError);
  }
  if (typeof opts.replyBy !== "string") {
    failNow(new InvalidRequestOptionsError("replyBy is required.", nullCtx(board.name)));
  }
  const deadlineMs = parseReplyBy(opts.replyBy);
  if (deadlineMs === null) {
    failNow(new InvalidRequestOptionsError(
      "replyBy must be UTC YYYY-MM-DDTHH:mm:ss[.SSS]Z.", nullCtx(board.name),
    ));
  }
  try {
    input = structuredClone(input);
  } catch (e) {
    failNow(new InvalidPostError("Post input cannot be snapshotted."));
  }
  if (input.expires !== undefined && Date.parse(input.expires) < deadlineMs!) {
    failNow(new InvalidPostError("expires must not be earlier than replyBy."));
  }
  const replyByWire = new Date(deadlineMs!).toISOString();
  const remainingMs = deadlineMs! - entryWall;
  if (remainingMs <= 0) {
    // Elapsed deadline at entry: phase prepare, null IDs, not-written.
    const c = makeCore(board, hooks, recipients, replyByWire, entryMono - 1, opts.signal);
    if (opts.signal?.aborted) commitCancelled(c, "prepare");
    else commitTimeout(c, "prepare");
    throw settlementError(c);
  }
  if (remainingMs > MAX_WAIT_MS) {
    const c = makeCore(board, hooks, recipients, replyByWire, entryMono + remainingMs, opts.signal);
    commitError(c, new InvalidRequestOptionsError(
      `replyBy is more than ${MAX_WAIT_MS} ms in the future.`, contextOf(c, "validate"),
    ), "validate");
    throw settlementError(c);
  }
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
  if (!Number.isSafeInteger(intervalMs) || intervalMs <= 0 || intervalMs > MAX_INTERVAL_MS) {
    failNow(new InvalidRequestOptionsError(
      `intervalMs must be a positive safe integer no greater than ${MAX_INTERVAL_MS}.`,
      nullCtx(board.name),
    ));
  }
  const signal = opts.signal;
  if (signal !== undefined && !(signal instanceof AbortSignal)) {
    failNow(new InvalidRequestOptionsError("signal must be an AbortSignal.", nullCtx(board.name)));
  }

  const cutoffMono = entryMono + remainingMs;
  const c = makeCore(board, hooks, recipients, replyByWire, cutoffMono, signal);

  // Pre-aborted signal beats everything; checked before any Store I/O.
  if (signal?.aborted) {
    commitCancelled(c, "prepare");
    throw settlementError(c);
  }

  // Arm the deadline timer and the abort listener before any async work.
  const deadlineTimer = hooks.setT(() => {
    if (!c.settled) commitTimeout(c, c.phase === "validate" ? "prepare" : c.phase);
    for (const wake of [...c.wakes]) wake();
    c.wakes.clear();
  }, Math.max(0, cutoffMono - hooks.monoNow()));
  c.cleanups.push(() => hooks.clearT(deadlineTimer));
  const onAbort = () => {
    if (!c.settled) commitCancelled(c, c.phase === "validate" ? "prepare" : c.phase);
    for (const wake of [...c.wakes]) wake();
    c.wakes.clear();
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  c.cleanups.push(() => signal?.removeEventListener("abort", onAbort));

  c.phase = "prepare";
  return { core: c, input, intervalMs };
}

/** @internal Supervise preparation with the same terminal latch and drainage record. */
export async function prepareRequestInvocation<T>(invocation: RequestInvocation, prepare: () => Promise<T>): Promise<T> {
  const c = invocation.core;
  try {
    checkTerminal(c);
    const result = await track(c, prepare());
    checkTerminal(c);
    return result;
  } catch (e) {
    if (!(e instanceof SettledSignal)) {
      try { checkTerminal(c); } catch { /* retain the winning terminal reason */ }
      commitError(c, new RequestInternalError("The operation failed locally.", contextOf(c), e), "prepare");
    }
    throw settlementError(c);
  }
}

/** @internal Continue an entry capture without consulting wall time for budget. */
export async function runRequestWait(
  board: Board,
  to: string | readonly string[],
  input: RequestInput,
  opts: RequestWaitOptions,
  hooksIn: WaitHooks = {},
  invocation?: RequestInvocation,
): Promise<RequestReply> {
  const captured = invocation ?? captureRequestInvocation(board, to, input, opts, hooksIn);
  const { core: c, intervalMs } = captured;
  input = captured.input;
  const { hooks, recipients, replyByWire } = c;
  if (c.board.name !== board.name) {
    commitError(c, new InvalidRequestOptionsError("Invocation belongs to another board.", contextOf(c)), c.phase);
    throw settlementError(c);
  }

  // --- publish through the shared Board write chain -------------------------
  let lowerDay = "";
  try {
    checkTerminal(c);
    c.phase = "queued";
    const posted = await track(c, helperWrite(board, async () => {
      // Head of the queue: recheck before constructing/publishing. An entry
      // that is already settled retires here without a put.
      checkTerminal(c);
      const ms = hooks.wallNow();
      const id = ulid(ms);
      c.requestId = id;
      const built: Record<string, unknown> = {
        v: POST_VERSION,
        id,
        board: board.name,
        author: board.author,
        instance: board.instance,
        ts: new Date(ms).toISOString(),
        body: (input as Record<string, unknown>).body,
        thread: id,
      };
      copyInputFields(input as Record<string, unknown>, built);
      built.act = "request";
      built.protocol = "request";
      built.to = recipients.slice();
      built.replyBy = replyByWire;
      built.v = POST_VERSION_V2;
      let post: Post;
      try {
        post = validatePost(built, { now: hooks.wallNow });
      } catch (e) {
        if (e instanceof InvalidPostError) {
          // Queued validation failure after ID allocation is phase "write".
          commitError(c, withContext(e, contextOf(c, "write")), "write");
          throw new SettledSignal();
        }
        throw e;
      }
      c.requestPost = post;
      let bytes: Uint8Array;
      try {
        bytes = encoder.encode(encodePost(post));
        checkEncodedSize(bytes);
      } catch (e) {
        if (e instanceof InvalidPostError) {
          commitError(c, withContext(e, contextOf(c, "write")), "write");
          throw new SettledSignal();
        }
        throw e;
      }
      // Recheck the shared latch, signal, and cutoff after encoding; there is
      // no await between this check and the put call.
      checkTerminal(c);
      c.phase = "write";
      c.postState = "unknown";
      c.putStarted = true;
      const key = keys.post(board.name, id, ulidTime(id));
      try {
        await trackPut(c, board.store.put(key, bytes, { ifNoneMatch: true }));
      } catch (e) {
        c.putFinal = e instanceof KeyExistsError ? "not-written" : "unknown";
        c.postState = c.putFinal;
        // Record drainage first, then apply cancellation/deadline precedence.
        checkTerminal(c);
        commitError(c, new RequestWriteError(
          "Request publication failed; consult the publication state.",
          contextOf(c, "write"), e,
        ), "write");
        throw new SettledSignal();
      }
      c.postState = "written";
      c.putFinal = "written";
      if (c.settled) {
        // The put acked after the wait was settled by cancellation/timeout:
        // record its final state for `closed` but never start observation.
        throw new SettledSignal();
      }
      return post;
    }));
    checkTerminal(c);
    c.phase = "observe";
    lowerDay = dayBucket(ulidTime(posted.id) - HORIZON_BEFORE_MS);
  } catch (e) {
    if (!(e instanceof SettledSignal)) {
      // Unexpected local failure inside preparation: preserve last tracked state.
      commitError(c, new RequestInternalError("The operation failed locally.", contextOf(c), e), c.phase);
    }
    throw settlementError(c);
  }

  // --- observation ----------------------------------------------------------
  try {
    await observe(c, board, lowerDay, intervalMs);
  } catch (e) {
    if (!(e instanceof SettledSignal)) {
      commitError(c, new RequestInternalError("The operation failed locally.", contextOf(c), e), c.phase);
    }
  }
  const s = c.settlement;
  if (s !== null && s.ok) return s.value;
  throw settlementError(c);
}

// ---------------------------------------------------------------------------
// Observation loop
// ---------------------------------------------------------------------------

async function observe(c: WaitCore, board: Board, lowerDay: string, intervalMs: number): Promise<never> {
  const { hooks } = c;
  const store = board.store;
  for (;;) {
    // Signal first, then deadline, then work.
    checkTerminal(c);
    const upperDay = dayBucket(hooks.wallNow() + HORIZON_AFTER_MS);
    for (let day = lowerDay; day <= upperDay; day = nextDay(day)) {
      let after: string | undefined;
      for (;;) {
        checkTerminal(c);
        const listOpts: { limit: number; after?: string } = { limit: PAGE_LIMIT };
        if (after !== undefined) listOpts.after = after;
        let res: { keys: string[]; truncated: boolean };
        try {
          res = await track(c, store.list(keys.dayPrefix(board.name, day), listOpts));
        } catch (e) {
          checkTerminal(c);
          commitError(c, new RequestReadError("Response observation failed.", contextOf(c), e), "observe");
          throw new SettledSignal();
        }
        for (const key of res.keys) {
          checkTerminal(c);
          if (!key.endsWith(".json")) continue;
          let bytes: Uint8Array | null;
          try {
            bytes = await track(c, store.get(key));
          } catch (e) {
            checkTerminal(c);
            commitError(c, new RequestReadError("Response observation failed.", contextOf(c), e), "observe");
            throw new SettledSignal();
          }
          if (!bytes) continue;
          checkTerminal(c);
          let p: Post;
          try {
            p = parsePost(bytes, { key, now: hooks.wallNow });
          } catch {
            continue; // invalid stored object: skip it, keep waiting
          }
          checkTerminal(c);
          if (isEligibleReply(c.requestPost!, c.recipients, board.name, p, hooks.wallNow())) {
            const kind = (p.act ?? DEFAULT_ACT) === "failure" ? "failure" : "inform";
            const observedAt = new Date(hooks.wallNow()).toISOString();
            // Eligibility and receipt-time construction are synchronous work,
            // but may consume the last budget. Guard the actual commitment too.
            checkTerminal(c);
            commit(c, {
              ok: true,
              value: {
                kind,
                request: c.requestPost!,
                reply: p,
                observedAt,
              },
            });
            throw new SettledSignal();
          }
        }
        if (c.settled) throw new SettledSignal();
        if (res.truncated && res.keys.length > 0) {
          after = res.keys[res.keys.length - 1]!;
          // Yield between pages so a busy board cannot monopolize the loop.
          await hooks.yieldToEventLoop();
        } else {
          break;
        }
      }
      checkTerminal(c);
    }
    // Range exhausted: sleep at most intervalMs or the remaining time.
    checkTerminal(c);
    const remaining = c.cutoffMono - hooks.monoNow();
    if (remaining <= 0) {
      commitTimeout(c, "observe");
      throw new SettledSignal();
    }
    await sleep(c, Math.min(intervalMs, remaining));
  }
}

function sleep(c: WaitCore, ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const wake = () => { c.hooks.clearT(handle); resolve(); };
    const handle = c.hooks.setT(() => { c.wakes.delete(wake); resolve(); }, ms);
    c.wakes.add(wake);
  });
}

// ---------------------------------------------------------------------------
// Settlement helpers
// ---------------------------------------------------------------------------

function settlementError(c: WaitCore): Error {
  const s = c.settlement;
  if (s !== null && !s.ok) return s.error;
  return new RequestInternalError("The operation failed locally.", contextOf(c));
}

function nullCtx(board: string | null): LocalErrorContext {
  return {
    board, requestId: null, responseId: null, postState: "not-written",
    replyBy: null, phase: "validate",
    closed: Promise.resolve({ board, requestId: null, responseId: null, postState: "not-written" }),
  };
}

function attachContext(err: Error, ctx: LocalErrorContext): void {
  (err as Error & { context?: LocalErrorContext }).context = ctx;
}

function withContext(err: Error, ctx: LocalErrorContext): Error {
  attachContext(err, ctx);
  return err;
}

// ---------------------------------------------------------------------------
// respond
// ---------------------------------------------------------------------------

export async function respond(
  board: Board,
  requestId: string,
  input: ResponseInput,
  opts: RespondOptions = {},
): Promise<Post> {
  return runRespond(board, requestId, input, opts, {});
}

/** Internal integration entry with injectable clock (mirrors runRequestWait). */
export async function runRespond(
  board: Board,
  requestId: string,
  input: ResponseInput,
  opts: RespondOptions,
  hooksIn: WaitHooks,
): Promise<Post> {
  const hooks = resolveHooks(hooksIn);

  // Drainage: respond has no background work after the awaited write, so the
  // closed promise resolves at the first terminal point with that snapshot.
  let resolveClosed!: (s: PublicationSnapshot) => void;
  const closed = new Promise<PublicationSnapshot>((resolve) => { resolveClosed = resolve; });
  const state = {
    phase: "validate" as RequestPhase,
    requestId: null as string | null,
    responseId: null as string | null,
    postState: "not-written" as PublicationState,
  };
  const closeNow = () => {
    resolveClosed({
      board: board.name,
      requestId: state.requestId,
      responseId: state.responseId,
      postState: state.postState,
    });
  };
  const ctx = (phase: RequestPhase): LocalErrorContext => ({
    board: board.name,
    requestId: state.requestId,
    responseId: state.responseId,
    postState: state.postState,
    replyBy: null,
    phase,
    closed,
  });
  const terminate = (err: Error): never => {
    closeNow();
    throw err;
  };

  if (typeof requestId !== "string" || !isUlid(requestId)) {
    // Malformed target ID: INVALID_REQUEST_OPTIONS; invalid IDs are not echoed.
    throw new InvalidRequestOptionsError("requestId must be a ULID.", nullCtx(board.name));
  }
  state.requestId = requestId;
  if (!opts || typeof opts !== "object" || Array.isArray(opts)) {
    terminate(new InvalidRequestOptionsError("Response options are invalid.", ctx("validate")));
  }
  const outcome = opts.outcome ?? "inform";
  if (outcome !== "inform" && outcome !== "failure") {
    terminate(new InvalidRequestOptionsError("outcome must be \"inform\" or \"failure\".", ctx("validate")));
  }

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    terminate(new InvalidRequestOptionsError("Post input is invalid.", ctx("validate")));
  }
  try {
    rejectManagedFields(input, ["title"]);
    input = structuredClone(input);
  } catch (e) {
    terminate(withContext(e instanceof InvalidPostError ? e : new InvalidPostError("Post input cannot be snapshotted."), ctx("validate")));
  }

  // Target read through the validated Board.get (key binding enforced).
  state.phase = "target-read";
  let q: Post | null;
  try {
    q = await board.get(requestId);
  } catch (e) {
    // A rejected Store.get is a read failure, never a target error.
    throw terminate(new ResponseReadError("The response target could not be read.", ctx("target-read"), e));
  }
  if (q === null) {
    // Absent and invalid stored roots intentionally share the target error.
    terminate(new ResponseTargetError(
      "The response target is unavailable or does not match the request profile.",
      ctx("target-read"),
    ));
  }
  const root = q as Post;
  const profileBad =
    root.act !== "request" ||
    root.thread !== requestId ||
    root.replyTo !== undefined ||
    !Array.isArray(root.to) || root.to.length === 0 ||
    (root.task !== undefined && root.task !== requestId) ||
    (root.protocol !== undefined && root.protocol !== "request") ||
    !root.to.includes(board.author);
  if (profileBad) {
    terminate(new ResponseTargetError(
      "The response target is unavailable or does not match the request profile.",
      ctx("target-read"),
    ));
  }

  // Publish through the helper write chain with the same guards as a request.
  state.phase = "queued";
  try {
    const post = await helperWrite(board, async () => {
      const ms = hooks.wallNow();
      const id = ulid(ms);
      state.responseId = id;
      state.phase = "write";
      const built: Record<string, unknown> = {
        v: POST_VERSION,
        id,
        board: board.name,
        author: board.author,
        instance: board.instance,
        ts: new Date(ms).toISOString(),
        body: (input as Record<string, unknown>).body,
        thread: root.thread,
        replyTo: requestId,
      };
      copyInputFields(input as Record<string, unknown>, built);
      built.act = outcome;
      built.to = [root.author];
      built.protocol = "request";
      built.task = requestId;
      if (hasV2Fields(built)) built.v = POST_VERSION_V2;
      let validated: Post;
      try {
        validated = validatePost(built, { now: hooks.wallNow });
      } catch (e) {
        if (e instanceof InvalidPostError) {
          // Queued validation failure after R allocation is phase "write".
          throw withContext(e, ctx("write"));
        }
        throw e;
      }
      let bytes: Uint8Array;
      try {
        bytes = encoder.encode(encodePost(validated));
        checkEncodedSize(bytes);
      } catch (e) {
        if (e instanceof InvalidPostError) {
          throw withContext(e, ctx("write"));
        }
        throw e;
      }
      state.postState = "unknown";
      const key = keys.post(board.name, id, ulidTime(id));
      try {
        await board.store.put(key, bytes, { ifNoneMatch: true });
      } catch (e) {
        state.postState = e instanceof KeyExistsError ? "not-written" : "unknown";
        throw new ResponseWriteError(
          "Response publication failed; consult the publication state.",
          ctx("write"), e,
        );
      }
      state.postState = "written";
      return validated;
    });
    closeNow();
    return post;
  } catch (e) {
    if (e instanceof InvalidPostError || e instanceof ResponseWriteError) throw terminate(e);
    throw terminate(new RequestInternalError(
      "The operation failed locally.", ctx(state.phase), e,
    ));
  }
}

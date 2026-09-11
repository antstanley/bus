// Task 202 — MCP `board_request` / `board_respond` tools.
//
// Implements the MCP side of the request/response-with-local-deadlines spec:
// closed argument profiles, the shared closed outcome union (identical to the
// CLI adapter), the five-minute wait cap with 16-slot admission including
// drainage, waits that never occupy the global serialized tool queue,
// per-invocation cancellation and server-shutdown handling, and
// provenance-framed DeliveredPost wrappers on every returned post. The core
// engine in @board/core is pinned; this module only calls it.

import {
  Board,
  InvalidKeyError,
  InvalidPostError,
  assertName,
  captureRequestInvocation,
  isUlid,
  parseReplyBy,
  runRequestWait,
  runRespond,
  ulid,
  type PublicationState,
  type RequestPhase,
  type RequestWaitOptions,
  type Store,
  type WaitHooks,
} from "@board/core";
import type { CallToolResult } from "@modelcontextprotocol/server";

// ---------------------------------------------------------------------------
// Outcome model (closed shared CLI/MCP outcome contract)

export type Operation = "request-post" | "request-wait" | "respond";

export type ErrorCode =
  | "INVALID_POST"
  | "INVALID_REQUEST_OPTIONS"
  | "REQUEST_WRITE_FAILED"
  | "REQUEST_READ_FAILED"
  | "RESPONSE_TARGET_INVALID"
  | "RESPONSE_READ_FAILED"
  | "RESPONSE_WRITE_FAILED"
  | "REQUEST_CAPACITY"
  | "ADAPTER_PREPARATION_FAILED"
  | "INTERNAL_ERROR";

/** Map keys also cover the timeout/cancellation codes for shared lookups. */
type AnyOutcomeCode = ErrorCode | "REQUEST_TIMEOUT" | "REQUEST_CANCELLED";

export type SafeCauseCategory = "store-read" | "store-write" | "preparation" | "internal";

export interface SafeCause {
  readonly category: SafeCauseCategory;
}

export interface ReplicationWarning {
  readonly code: "GIT_REPLICATION_DEGRADED";
  readonly message: "Git replication is degraded; remote delivery is not confirmed.";
}

export const REPLICATION_WARNING: ReplicationWarning = {
  code: "GIT_REPLICATION_DEGRADED",
  message: "Git replication is degraded; remote delivery is not confirmed.",
};

export interface DeliveredPost {
  readonly post: Record<string, unknown>;
  readonly provenance: {
    readonly author: string;
    readonly board: string;
    readonly postId: string;
    readonly trust: "unsigned";
  };
}

export interface OutcomeBase {
  readonly operation: Operation;
  readonly board: string | null;
  readonly requestId: string | null;
  readonly responseId: string | null;
  readonly replyBy: string | null;
  readonly postState: PublicationState;
  readonly warnings: readonly ReplicationWarning[];
}

export interface FailureFields {
  readonly phase: RequestPhase;
  readonly message: string;
  readonly cause: SafeCause | null;
}

export type WaitCancelReason = "rpc" | "transport" | "shutdown" | "signal";

export type AdapterOutcome = OutcomeBase &
  (
    | { readonly kind: "posted"; readonly post: DeliveredPost }
    | {
        readonly kind: "inform" | "failure";
        readonly request: DeliveredPost;
        readonly reply: DeliveredPost;
        readonly observedAt: string;
      }
    | (FailureFields & { readonly kind: "timeout"; readonly code: "REQUEST_TIMEOUT" })
    | (FailureFields & {
        readonly kind: "cancelled";
        readonly code: "REQUEST_CANCELLED";
        readonly reason: WaitCancelReason;
      })
    | (FailureFields & { readonly kind: "error"; readonly code: ErrorCode })
  );

export const ERROR_MESSAGES: Readonly<Record<AnyOutcomeCode, string>> = {
  INVALID_POST: "Post input is invalid.",
  INVALID_REQUEST_OPTIONS: "Request or response options are invalid.",
  REQUEST_TIMEOUT: "No eligible response was observed before the deadline.",
  REQUEST_CANCELLED: "The local request wait was cancelled.",
  REQUEST_WRITE_FAILED: "Request publication failed; consult the publication state.",
  REQUEST_READ_FAILED: "Response observation failed.",
  RESPONSE_TARGET_INVALID:
    "The response target is unavailable or does not match the request profile.",
  RESPONSE_READ_FAILED: "The response target could not be read.",
  RESPONSE_WRITE_FAILED: "Response publication failed; consult the publication state.",
  REQUEST_CAPACITY: "The server request-wait capacity is exhausted.",
  ADAPTER_PREPARATION_FAILED: "Request or response preparation failed.",
  INTERNAL_ERROR: "The operation failed locally.",
};

export const CAUSE_FOR_CODE: Readonly<Record<AnyOutcomeCode, SafeCause | null>> = {
  INVALID_POST: null,
  INVALID_REQUEST_OPTIONS: null,
  REQUEST_TIMEOUT: null,
  REQUEST_CANCELLED: null,
  REQUEST_WRITE_FAILED: { category: "store-write" },
  REQUEST_READ_FAILED: { category: "store-read" },
  RESPONSE_TARGET_INVALID: null,
  RESPONSE_READ_FAILED: { category: "store-read" },
  RESPONSE_WRITE_FAILED: { category: "store-write" },
  REQUEST_CAPACITY: null,
  ADAPTER_PREPARATION_FAILED: { category: "preparation" },
  INTERNAL_ERROR: { category: "internal" },
};

// ---------------------------------------------------------------------------
// Limits (MCP row of the validation table)

/** MCP waits are capped at five minutes; core's 24-hour cap still applies. */
export const MCP_MAX_WAIT_MS = 5 * 60 * 1000;
/** No MCP interval argument is exposed; the fixed 1,000 ms default is used. */
export const MCP_INTERVAL_MS = 1_000;
/** At most 16 admitted wait operations per server, including drainage. */
export const MCP_WAIT_CAPACITY = 16;

/**
 * Entry-duration classification for a wait invocation, captured once:
 * `<= 0` gives REQUEST_TIMEOUT with no put; `> MCP_MAX_WAIT_MS` gives
 * INVALID_REQUEST_OPTIONS. Duration exactly at the maximum is legal.
 */
export function classifyEntryDuration(nowMs: number, replyByMs: number): "timeout" | "invalid" | "ok" {
  const remaining = replyByMs - nowMs;
  if (remaining <= 0) return "timeout";
  if (remaining > MCP_MAX_WAIT_MS) return "invalid";
  return "ok";
}

// ---------------------------------------------------------------------------
// Argument parsing — closed profiles; unknown fields rejected; the server's
// configured author is used (arguments cannot set author, instance, task,
// protocol, or a return address).

export interface BoardRequestArgs {
  board?: string;
  to: string[];
  body: string;
  title?: string;
  tags?: string[];
  mentions?: string[];
  replyBy?: string;
  wait: boolean;
}

export interface BoardRespondArgs {
  board?: string;
  requestId: string;
  body: string;
  outcome?: "inform" | "failure";
  mentions?: string[];
}

export class AdapterUsageError extends Error {}

/** Missing/empty final body is a post-input error, not an options error. */
export class EmptyBodyError extends AdapterUsageError {}

function invalid(field: string, expected: string): AdapterUsageError {
  return new AdapterUsageError(`${field} must be ${expected}`);
}

function optionalName(args: Record<string, unknown>, field: string): string | undefined {
  const value = args[field];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0) throw invalid(field, "a non-empty string");
  return value;
}

function optionalText(args: Record<string, unknown>, field: string): string | undefined {
  const value = args[field];
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw invalid(field, "a string");
  return value;
}

function nameArray(args: Record<string, unknown>, field: string): string[] | undefined {
  const value = args[field];
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || (field === "to" && value.length === 0) || !value.every((item) => typeof item === "string")) {
    throw invalid(field, "a non-empty array of names");
  }
  return [...value];
}

export function parseBoardRequestArgs(args: Record<string, unknown>): BoardRequestArgs {
  const known = new Set(["board", "to", "body", "title", "tags", "mentions", "replyBy", "wait"]);
  for (const key of Object.keys(args)) {
    if (!known.has(key)) throw new AdapterUsageError(`unknown field: ${key}`);
  }
  const wait = args.wait;
  if (wait !== undefined && typeof wait !== "boolean") throw invalid("wait", "a boolean");
  const to = nameArray(args, "to");
  if (to === undefined) throw invalid("to", "a non-empty array of names");
  const body = args.body;
  if (body === undefined || body === "") throw new EmptyBodyError();
  if (typeof body !== "string") throw invalid("body", "a string");
  const parsed: BoardRequestArgs = { to, body, wait: wait === true };
  const board = optionalName(args, "board");
  if (board !== undefined) parsed.board = board;
  const title = optionalText(args, "title");
  // Core and CLI accept an explicitly empty title; it is optional string data,
  // unlike the required nonempty final body.
  if (title !== undefined) parsed.title = title;
  const tags = nameArray(args, "tags");
  if (tags !== undefined) parsed.tags = tags;
  const mentions = nameArray(args, "mentions");
  if (mentions !== undefined) parsed.mentions = mentions;
  const replyBy = optionalText(args, "replyBy");
  if (replyBy !== undefined) {
    if (replyBy.length === 0) throw invalid("replyBy", "a non-empty string");
    parsed.replyBy = replyBy;
  }
  if (parsed.wait && parsed.replyBy === undefined) {
    throw new AdapterUsageError("replyBy is required with wait: true");
  }
  return parsed;
}

export function parseBoardRespondArgs(args: Record<string, unknown>): BoardRespondArgs {
  const known = new Set(["board", "requestId", "body", "outcome", "mentions"]);
  for (const key of Object.keys(args)) {
    if (!known.has(key)) throw new AdapterUsageError(`unknown field: ${key}`);
  }
  const requestId = args.requestId;
  if (typeof requestId !== "string" || requestId.length === 0) {
    throw invalid("requestId", "a non-empty string");
  }
  const body = args.body;
  if (body === undefined || body === "") throw new EmptyBodyError();
  if (typeof body !== "string") throw invalid("body", "a string");
  const parsed: BoardRespondArgs = { requestId, body };
  const board = optionalName(args, "board");
  if (board !== undefined) parsed.board = board;
  const outcome = args.outcome;
  if (outcome !== undefined) {
    if (outcome !== "inform" && outcome !== "failure") throw invalid("outcome", '"inform" or "failure"');
    parsed.outcome = outcome;
  }
  const mentions = nameArray(args, "mentions");
  if (mentions !== undefined) parsed.mentions = mentions;
  return parsed;
}

// ---------------------------------------------------------------------------
// Wait admission registry — capacity applies only to waits and includes
// drainage: slots are retained while a canceled operation still has active
// Store work (tracked through the core invocation's `closed` promise), and
// excess calls are rejected BEFORE any publication.

interface WaitEntry {
  readonly controller: AbortController;
  reason: WaitCancelReason | null;
  drained: boolean;
}

export class RequestWaitRegistry {
  readonly #entries = new Map<string, WaitEntry>();
  #slots = 0;

  tryAcquire(): boolean {
    if (this.#slots >= MCP_WAIT_CAPACITY) return false;
    this.#slots += 1;
    return true;
  }

  register(id: string, controller: AbortController): void {
    this.#entries.set(id, { controller, reason: null, drained: false });
  }

  abort(id: string, reason: WaitCancelReason): void {
    const entry = this.#entries.get(id);
    if (!entry || entry.reason !== null) return;
    entry.reason = reason;
    entry.controller.abort(reason);
  }

  /** Abort every active wait (server shutdown or transport closure). */
  cancelAll(reason: "shutdown" | "transport"): void {
    for (const [id] of this.#entries) this.abort(id, reason);
  }

  reasonOf(id: string): WaitCancelReason | null {
    return this.#entries.get(id)?.reason ?? null;
  }

  /** Remove an invocation entry and release its slot on complete drainage. */
  drain(id: string, closed: Promise<unknown>): void {
    const entry = this.#entries.get(id);
    if (!entry || entry.drained) return;
    entry.drained = true;
    void closed.then(
      () => {
        this.#entries.delete(id);
        this.release();
      },
      () => {
        this.#entries.delete(id);
        this.release();
      },
    );
  }

  release(): void {
    if (this.#slots > 0) this.#slots -= 1;
  }

  get size(): number {
    return this.#entries.size;
  }

  get slotsInUse(): number {
    return this.#slots;
  }
}

// ---------------------------------------------------------------------------
// Outcome construction helpers

function base(operation: Operation, fields: {
  board: string | null;
  requestId: string | null;
  responseId: string | null;
  replyBy: string | null;
  postState: PublicationState;
}): OutcomeBase {
  return { operation, ...fields, warnings: [] };
}

// Build provenance from the validated outer post, never from a nested
// author-controlled field. Every returned post is labelled unsigned; this is
// not a signature validation or an authentication assertion.
function delivered(post: {
  author: string;
  board: string;
  id: string;
}): DeliveredPost {
  return {
    post: post as unknown as Record<string, unknown>,
    provenance: { author: post.author, board: post.board, postId: post.id, trust: "unsigned" },
  };
}

interface ErrorContextLike {
  board: string | null;
  requestId: string | null;
  responseId: string | null;
  postState: PublicationState;
  replyBy: string | null;
  phase: RequestPhase;
}

function contextOf(error: unknown): ErrorContextLike | null {
  if (typeof error === "object" && error !== null && "context" in error) {
    const c = (error as { context?: Partial<ErrorContextLike> }).context;
    if (c && typeof c === "object") {
      return {
        board: c.board ?? null,
        requestId: c.requestId ?? null,
        responseId: c.responseId ?? null,
        postState: (c.postState ?? "not-written") as PublicationState,
        replyBy: c.replyBy ?? null,
        phase: (c.phase ?? "validate") as RequestPhase,
      };
    }
  }
  return null;
}

function errorCodeOf(error: unknown): ErrorCode | null {
  if (error instanceof InvalidPostError) return "INVALID_POST";
  if (error instanceof InvalidKeyError) return "INVALID_REQUEST_OPTIONS";
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && Object.hasOwn(ERROR_MESSAGES, code)
      && code !== "REQUEST_TIMEOUT" && code !== "REQUEST_CANCELLED") return code as ErrorCode;
  }
  return null;
}

function withWarning(outcome: AdapterOutcome, replication: ReplicationWarning | null): AdapterOutcome {
  if (replication === null || outcome.warnings.length > 0) return outcome;
  return { ...outcome, warnings: [replication] };
}

function errorOutcome(
  operation: Operation,
  code: ErrorCode,
  context: ErrorContextLike | null,
  fallbackPhase: RequestPhase = "validate",
): AdapterOutcome {
  return withWarning({
    ...base(operation, {
      board: context?.board ?? null,
      requestId: context?.requestId ?? null,
      responseId: context?.responseId ?? null,
      replyBy: context?.replyBy ?? null,
      postState: context?.postState ?? "not-written",
    }),
    kind: "error",
    code,
    phase: context?.phase ?? fallbackPhase,
    message: ERROR_MESSAGES[code],
    cause: CAUSE_FOR_CODE[code],
  }, null);
}

/** MCP isError for a delivered outcome (explicit for every variant). */
export function isErrorFor(outcome: AdapterOutcome): boolean {
  switch (outcome.kind) {
    case "posted":
    case "inform":
      // A replication warning never makes a posted/inform result an execution
      // error.
      return false;
    case "failure":
    case "timeout":
    case "cancelled":
    case "error":
      return true;
  }
}

function outcomeAuthors(outcome: AdapterOutcome): string[] {
  switch (outcome.kind) {
    case "posted":
      return [outcome.post.provenance.author];
    case "inform":
    case "failure":
      return [outcome.request.provenance.author, outcome.reply.provenance.author];
    default:
      return [];
  }
}

/**
 * Build the wire result: `structuredContent` is the outcome object and the
 * text content is server-authored provenance labels followed by the identical
 * serialized object. Post bodies remain inert quoted data; labels come only
 * from the server.
 */
export function outcomeResult(outcome: AdapterOutcome, isError: boolean): CallToolResult {
  const json = JSON.stringify(outcome);
  const authors = [...new Set(outcomeAuthors(outcome))].sort()
    .map((author) => `untrusted content from ${author}`);
  return {
    isError,
    content: [{ type: "text", text: authors.length ? `${authors.join("\n")}\n${json}` : json }],
    structuredContent: outcome as unknown as Record<string, unknown>,
  };
}

// ---------------------------------------------------------------------------
// Execution dependencies

export interface RequestResponseDeps {
  /** Shared per-board Board cache (the server's `board(name)`). */
  board(name: string): Board;
  defaultBoard: string;
  author: string;
  /** Injected clock for adapter-level checks; never re-based after entry. */
  now?: () => number;
  hooks?: WaitHooks;
  replicationCheck?: () => ReplicationWarning | null;
  /** Test-only poll-interval override; MCP exposes no interval argument. */
  intervalMs?: number;
}

export interface WaitExecutionOptions {
  /** Per-invocation RPC cancellation signal forwarded to the core wait. */
  signal?: AbortSignal;
  transportSignal?: AbortSignal;
  registry?: RequestWaitRegistry;
}

function acceptedContext(deps: RequestResponseDeps, raw: Record<string, unknown>, operation: Operation): ErrorContextLike {
  let board: string | null = null;
  try {
    const name = raw.board ?? deps.defaultBoard;
    if (typeof name === "string") board = assertName(name, "board");
  } catch { /* Invalid selection is never echoed. */ }
  let replyBy: string | null = null;
  if (operation !== "respond" && typeof raw.replyBy === "string") {
    const parsed = operation === "request-wait" ? parseReplyBy(raw.replyBy) : Date.parse(raw.replyBy);
    if (parsed !== null && Number.isFinite(parsed)) {
      replyBy = operation === "request-wait" ? new Date(parsed).toISOString() : raw.replyBy;
    }
  }
  return {
    board,
    requestId: operation === "respond" && typeof raw.requestId === "string" && isUlid(raw.requestId)
      ? raw.requestId : null,
    responseId: null, replyBy, postState: "not-written", phase: "validate",
  };
}

function wallNowOf(deps: RequestResponseDeps): () => number {
  return deps.hooks?.wallNow ?? deps.now ?? Date.now;
}

// ---------------------------------------------------------------------------
// board_request

export async function executeBoardRequest(
  deps: RequestResponseDeps,
  rawArgs: Record<string, unknown>,
  options: WaitExecutionOptions = {},
): Promise<AdapterOutcome> {
  const wallNow = wallNowOf(deps);
  const entry = wallNow();
  const monoNow = deps.hooks?.monoNow ?? (() => performance.now());
  const entryMono = monoNow();
  const operation: Operation = rawArgs.wait === true ? "request-wait" : "request-post";
  const accepted = acceptedContext(deps, rawArgs, operation);
  const replication = (): ReplicationWarning | null => deps.replicationCheck?.() ?? null;
  let args: BoardRequestArgs;
  try {
    args = parseBoardRequestArgs(rawArgs);
  } catch (error) {
    return withWarning(errorOutcome(operation,
      error instanceof EmptyBodyError ? "INVALID_POST" : "INVALID_REQUEST_OPTIONS", accepted), replication());
  }
  const boardName = args.board ?? deps.defaultBoard;

  // Input errors happen before any put.
  try {
    assertName(boardName, "board");
    assertName(deps.author, "author");
    for (const recipient of args.to) assertName(recipient, "to");
  } catch {
    return withWarning(errorOutcome(operation, "INVALID_REQUEST_OPTIONS", accepted), replication());
  }
  let board: Board;
  try {
    board = deps.board(boardName);
  } catch {
    return withWarning(errorOutcome(operation, "ADAPTER_PREPARATION_FAILED", {
      ...accepted, phase: "prepare",
    }), replication());
  }

  let replyByMs: number | null = null;
  let replyByIso: string | null = null;
  let replyByRaw: string | null = null;
  if (args.replyBy !== undefined) {
    // Posting mode retains parseable deadlines as supplied; wait mode uses
    // core's strict UTC syntax.
    replyByMs = args.wait ? parseReplyBy(args.replyBy) : Date.parse(args.replyBy);
    if (replyByMs === null || !Number.isFinite(replyByMs)) {
      return withWarning(errorOutcome(operation, "INVALID_REQUEST_OPTIONS", accepted), replication());
    }
    replyByIso = new Date(replyByMs).toISOString();
    replyByRaw = args.replyBy;
  }

  const cancelledOutcome = (reason: WaitCancelReason, phase: RequestPhase): AdapterOutcome =>
    withWarning({
      ...base(operation, {
        board: board.name,
        requestId: null,
        responseId: null,
        replyBy: replyByIso,
        postState: "not-written",
      }),
      kind: "cancelled",
      code: "REQUEST_CANCELLED",
      reason,
      phase,
      message: ERROR_MESSAGES.REQUEST_CANCELLED,
      cause: null,
    }, replication());

  // Pre-abort: a terminal signal before any store work wins.
  if (args.wait && (options.signal?.aborted || options.transportSignal?.aborted)) {
    return cancelledOutcome(options.transportSignal?.aborted ? "transport" : "rpc", "prepare");
  }

  const input = {
    body: args.body,
    ...(args.title === undefined ? {} : { title: args.title }),
    ...(args.tags === undefined ? {} : { tags: args.tags }),
    ...(args.mentions === undefined ? {} : { mentions: args.mentions }),
  };

  if (!args.wait) {
    // Posting mode never acquires a wait admission slot and has no wait cap.
    // Board.request has no allocation callback; observe its validated encoded
    // post at the Store boundary without bypassing Board's validators or queue.
    let allocatedId: string | null = null;
    const store = board.store;
    const capturedStore = new Proxy(store, {
      get(target, property) {
        if (property === "put") {
          return (key: string, bytes: Uint8Array, putOptions: Parameters<Store["put"]>[2]) => {
            allocatedId = (JSON.parse(new TextDecoder().decode(bytes)) as { id: string }).id;
            return target.put(key, bytes, putOptions);
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const capturedBoard = new Board(capturedStore, {
      board: board.name,
      author: board.author,
      instance: board.instance,
    });
    // The capture wrapper must retain the selected Board's write ordering.
    capturedBoard.enqueueWrite = board.enqueueWrite.bind(board);
    try {
      const post = await capturedBoard.request(
        args.to,
        { ...input, protocol: "request" },
        args.replyBy === undefined ? {} : { replyBy: args.replyBy },
      );
      return withWarning({
        ...base("request-post", {
          board: post.board,
          requestId: post.id,
          responseId: null,
          replyBy: replyByRaw,
          postState: "written",
        }),
        kind: "posted",
        post: delivered(post),
      }, replication());
    } catch (error) {
      const code = errorCodeOf(error) ?? "REQUEST_WRITE_FAILED";
      const invalidInput = code === "INVALID_POST" || code === "INVALID_REQUEST_OPTIONS";
      return withWarning(errorOutcome(operation, code, {
        board: board.name,
        requestId: allocatedId,
        responseId: null,
        postState: invalidInput ? "not-written" : "unknown",
        replyBy: replyByRaw,
        phase: invalidInput ? "validate" : "write",
      }), replication());
    }
  }

  // Wait mode: the entry budget is captured once and never re-based.
  const entryClass = classifyEntryDuration(entry, replyByMs!);
  if (entryClass === "timeout") {
    return withWarning({
      ...base("request-wait", {
        board: board.name,
        requestId: null,
        responseId: null,
        replyBy: replyByIso,
        postState: "not-written",
      }),
      kind: "timeout",
      code: "REQUEST_TIMEOUT",
      phase: "prepare",
      message: ERROR_MESSAGES.REQUEST_TIMEOUT,
      cause: null,
    }, replication());
  }
  if (entryClass === "invalid") {
    return withWarning(errorOutcome("request-wait", "INVALID_REQUEST_OPTIONS", {
      board: board.name,
      requestId: null,
      responseId: null,
      postState: "not-written",
      replyBy: replyByIso,
      phase: "validate",
    }), replication());
  }

  // Capacity rejects before any async preparation or put; elapsed deadline
  // wins over capacity admission.
  const registry = options.registry;
  if (registry !== undefined && !registry.tryAcquire()) {
    return withWarning(errorOutcome("request-wait", "REQUEST_CAPACITY", {
      board: board.name,
      requestId: null,
      responseId: null,
      postState: "not-written",
      replyBy: replyByIso,
      phase: "prepare",
    }), replication());
  }
  if (monoNow() >= entryMono + replyByMs! - entry) {
    registry?.release();
    return withWarning({
      ...base("request-wait", {
        board: board.name,
        requestId: null,
        responseId: null,
        replyBy: replyByIso,
        postState: "not-written",
      }),
      kind: "timeout",
      code: "REQUEST_TIMEOUT",
      phase: "prepare",
      message: ERROR_MESSAGES.REQUEST_TIMEOUT,
      cause: null,
    }, replication());
  }

  // Per-invocation cancellation controller: forwards the RPC signal; server
  // shutdown/transport closure aborts through the registry. Invocation IDs are
  // unique; never keyed only by advisory author or board name.
  const id = ulid();
  const controller = new AbortController();
  registry?.register(id, controller);
  const onRpcAbort = () => {
    if (registry) registry.abort(id, "rpc");
    else controller.abort("rpc");
  };
  if (options.signal !== undefined) {
    if (options.signal.aborted) onRpcAbort();
    else options.signal.addEventListener("abort", onRpcAbort, { once: true });
  }

  const onTransportAbort = () => {
    if (registry) registry.abort(id, "transport");
    else controller.abort("transport");
  };
  if (options.transportSignal?.aborted) onTransportAbort();
  else options.transportSignal?.addEventListener("abort", onTransportAbort, { once: true });

  let sampledWall = false;
  let sampledMono = false;
  const hooks: WaitHooks = {
    ...deps.hooks,
    wallNow: () => {
      if (sampledWall) return wallNow();
      sampledWall = true;
      return entry;
    },
    monoNow: () => {
      if (sampledMono) return monoNow();
      sampledMono = true;
      return entryMono;
    },
  };
  let registeredDrain = false;
  const opts: RequestWaitOptions = {
    replyBy: args.replyBy!,
    signal: controller.signal,
    ...(deps.intervalMs === undefined ? {} : { intervalMs: deps.intervalMs }),
  };
  try {
    // Core samples its entry wall/mono from the injected hooks. Drainage (and
    // with it the admission slot) is tracked through the invocation's `closed`
    // promise, which resolves with the final publication snapshot once all of
    // the operation's Store work has drained — including after cancellation.
    const invocation = captureRequestInvocation(board, args.to, input, opts, hooks);
    registry?.drain(id, invocation.core.closed);
    registeredDrain = true;
    const reply = await runRequestWait(board, args.to, input, opts, hooks, invocation);
    return withWarning({
      ...base("request-wait", {
        board: reply.request.board,
        requestId: reply.request.id,
        responseId: reply.reply.id,
        replyBy: replyByIso,
        postState: "written",
      }),
      kind: reply.kind,
      request: delivered(reply.request),
      reply: delivered(reply.reply),
      observedAt: reply.observedAt,
    }, replication());
  } catch (error) {
    const context = contextOf(error);
    if ((error as Error)?.name === "RequestCancelledError") {
      return withWarning({
        ...base("request-wait", {
          board: context?.board ?? board.name,
          requestId: context?.requestId ?? null,
          responseId: null,
          replyBy: context?.replyBy ?? replyByIso,
          postState: context?.postState ?? "not-written",
        }),
        kind: "cancelled",
        code: "REQUEST_CANCELLED",
        reason: (controller.signal.reason as WaitCancelReason | undefined) ?? "rpc",
        phase: context?.phase ?? "prepare",
        message: ERROR_MESSAGES.REQUEST_CANCELLED,
        cause: null,
      }, replication());
    }
    if ((error as Error)?.name === "RequestTimeoutError") {
      return withWarning({
        ...base("request-wait", {
          board: context?.board ?? board.name,
          requestId: context?.requestId ?? null,
          responseId: null,
          replyBy: context?.replyBy ?? replyByIso,
          postState: context?.postState ?? "not-written",
        }),
        kind: "timeout",
        code: "REQUEST_TIMEOUT",
        phase: context?.phase ?? "observe",
        message: ERROR_MESSAGES.REQUEST_TIMEOUT,
        cause: null,
      }, replication());
    }
    const code = errorCodeOf(error) ?? "INTERNAL_ERROR";
    return withWarning(errorOutcome("request-wait", code, {
      board: context?.board ?? board.name,
      requestId: context?.requestId ?? null,
      responseId: context?.responseId ?? null,
      postState: context?.postState
        ?? (code === "INVALID_POST" || code === "INVALID_REQUEST_OPTIONS" ? "not-written" : "unknown"),
      replyBy: context?.replyBy ?? replyByIso,
      phase: context?.phase ?? "validate",
    }), replication());
  } finally {
    if (!registeredDrain) registry?.drain(id, Promise.resolve());
    options.signal?.removeEventListener("abort", onRpcAbort);
    options.transportSignal?.removeEventListener("abort", onTransportAbort);
  }
}

// ---------------------------------------------------------------------------
// board_respond

export async function executeBoardRespond(
  deps: RequestResponseDeps,
  rawArgs: Record<string, unknown>,
): Promise<AdapterOutcome> {
  const accepted = acceptedContext(deps, rawArgs, "respond");
  const replication = (): ReplicationWarning | null => deps.replicationCheck?.() ?? null;
  let args: BoardRespondArgs;
  try {
    args = parseBoardRespondArgs(rawArgs);
  } catch (error) {
    return withWarning(errorOutcome("respond",
      error instanceof EmptyBodyError ? "INVALID_POST" : "INVALID_REQUEST_OPTIONS", accepted), replication());
  }
  // A malformed target ID is an input error, not a target error.
  if (!isUlid(args.requestId)) {
    return withWarning(errorOutcome("respond", "INVALID_REQUEST_OPTIONS", accepted), replication());
  }
  const boardName = args.board ?? deps.defaultBoard;
  try {
    assertName(boardName, "board");
    assertName(deps.author, "author");
  } catch {
    return withWarning(errorOutcome("respond", "INVALID_REQUEST_OPTIONS", accepted), replication());
  }
  let board: Board;
  try {
    board = deps.board(boardName);
  } catch {
    return withWarning(errorOutcome("respond", "ADAPTER_PREPARATION_FAILED", {
      ...accepted, phase: "prepare",
    }), replication());
  }
  const input = {
    body: args.body,
    ...(args.mentions === undefined ? {} : { mentions: args.mentions }),
  };
  try {
    const post = await runRespond(
      board,
      args.requestId,
      input,
      { outcome: args.outcome ?? "inform" },
      deps.hooks ?? {},
    );
    return withWarning({
      ...base("respond", {
        board: post.board,
        requestId: args.requestId,
        responseId: post.id,
        replyBy: null,
        postState: "written",
      }),
      kind: "posted",
      post: delivered(post),
    }, replication());
  } catch (error) {
    const context = contextOf(error);
    const code = errorCodeOf(error) ?? "INTERNAL_ERROR";
    return withWarning(errorOutcome("respond", code, {
      board: context?.board ?? board.name,
      // Response errors always report R's state; Q is retained separately.
      requestId: context?.requestId ?? args.requestId,
      responseId: context?.responseId ?? null,
      postState: context?.postState ?? "not-written",
      replyBy: null,
      phase: context?.phase ?? "validate",
    }), replication());
  }
}

// Task 202 — CLI `board request` / `board respond` commands.
//
// Implements the CLI side of the request/response-with-local-deadlines spec:
// closed flag profiles, the shared outcome union, D07 exit codes, early
// invocation-context capture (clocks/signals before stdin/setup), supervised
// stdin with the 64 KiB cap, and provenance-framed DeliveredPost wrappers.
// The core engine in @board/core is pinned; this module only calls it.

import {
  Board,
  assertName,
  InvalidKeyError,
  InvalidPostError,
  MAX_WAIT_MS,
  captureRequestInvocation,
  isUlid,
  parseReplyBy,
  runRequestWait,
  runRespond,
  type Post,
  type PublicationState,
  type RequestPhase,
  type RequestWaitOptions,
  type Store,
  type WaitHooks,
} from "@board/core";

type ClearTimeoutFn = (handle: unknown) => void;

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
  readonly post: Post;
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

export type CancelReason = "sigint" | "sigterm" | "signal" | "rpc" | "transport" | "shutdown";

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
        readonly reason: CancelReason;
      })
    | (FailureFields & { readonly kind: "error"; readonly code: ErrorCode })
  );

export const ERROR_EXIT_CODES: Readonly<Record<AnyOutcomeCode, number>> = {
  INVALID_POST: 2,
  INVALID_REQUEST_OPTIONS: 2,
  REQUEST_TIMEOUT: 5,
  REQUEST_CANCELLED: 130,
  REQUEST_WRITE_FAILED: 1,
  REQUEST_READ_FAILED: 1,
  RESPONSE_TARGET_INVALID: 2,
  RESPONSE_READ_FAILED: 1,
  RESPONSE_WRITE_FAILED: 1,
  REQUEST_CAPACITY: 1,
  ADAPTER_PREPARATION_FAILED: 1,
  INTERNAL_ERROR: 1,
};

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

/** CLI exit for a finished outcome under the D07 table (incl. warning precedence). */
export function exitForOutcome(outcome: AdapterOutcome, warning: boolean): number {
  switch (outcome.kind) {
    case "posted":
    case "inform":
      return warning ? 3 : 0;
    case "failure":
      return 4;
    case "timeout":
      return 5;
    case "cancelled":
      return outcome.reason === "sigterm" ? 143 : 130;
    case "error":
      return ERROR_EXIT_CODES[outcome.code];
  }
}

// ---------------------------------------------------------------------------
// Argument parsing (closed flag sets; unsupported flags rejected)

export class UsageError extends Error {}

export interface RequestArgs {
  to: string[];
  body: string | undefined; // undefined => stdin
  title?: string;
  tags?: string[];
  mentions?: string[];
  replyBy?: string;
  wait: boolean;
  interval?: number;
  board?: string;
  as?: string;
  json: boolean;
}

export interface RespondArgs {
  requestId: string;
  body: string | undefined; // undefined => stdin
  failure: boolean;
  mentions?: string[];
  board?: string;
  as?: string;
  json: boolean;
}

export const MAX_INTERVAL_MS = 30_000;
export const MAX_STDIN_BYTES = 64 * 1024;

function invalidName(name: string): boolean {
  return name.length === 0 || /\s/.test(name);
}

export function parseToList(value: string): string[] {
  const members = value.split(",");
  if (members.length === 0 || members.some(invalidName)) {
    throw new UsageError(`invalid --to "${value}": nonempty comma-separated names required`);
  }
  return members;
}

function splitList(value: string, flag: string): string[] {
  const members = value.split(",").filter((m) => m.length > 0);
  if (members.length === 0) {
    throw new UsageError(`invalid ${flag} "${value}": at least one entry required`);
  }
  return members;
}

interface ParsedFlags {
  flags: Map<string, string>;
  positionals: string[];
}

function strictParse(argv: string[], allowedValues: ReadonlySet<string>, allowedBooleans: ReadonlySet<string>): ParsedFlags {
  const flags = new Map<string, string>();
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--") {
      if (i !== argv.length - 1) throw new UsageError("unexpected arguments after --");
      break;
    }
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    const equals = arg.indexOf("=");
    const name = arg.slice(2, equals < 0 ? undefined : equals);
    if (allowedBooleans.has(name)) {
      if (equals >= 0) throw new UsageError(`--${name} does not take a value`);
      flags.set(name, "true");
      continue;
    }
    if (!allowedValues.has(name)) throw new UsageError(`unknown flag --${name}`);
    const attached = equals >= 0;
    const value = attached ? arg.slice(equals + 1) : argv[++i];
    if (value === undefined) throw new UsageError(`--${name} requires a value`);
    flags.set(name, value);
  }
  return { flags, positionals };
}

const REQUEST_VALUE_FLAGS = new Set(["to", "body", "title", "tags", "mentions", "reply-by", "interval", "board", "as"]);
const REQUEST_BOOLEAN_FLAGS = new Set(["wait", "json"]);
const RESPOND_VALUE_FLAGS = new Set(["body", "mentions", "board", "as"]);
const RESPOND_BOOLEAN_FLAGS = new Set(["failure", "json"]);

export function parseRequestArgs(argv: string[]): RequestArgs {
  const { flags, positionals } = strictParse(argv, REQUEST_VALUE_FLAGS, REQUEST_BOOLEAN_FLAGS);
  if (positionals.length) throw new UsageError("request accepts no positionals");
  const args: RequestArgs = { to: [], body: undefined, wait: false, json: false };
  const to = flags.get("to");
  if (to === undefined) throw new UsageError("--to is required");
  args.to = parseToList(to);
  args.body = flags.get("body");
  const title = flags.get("title");
  if (title !== undefined) args.title = title;
  const tags = flags.get("tags");
  if (tags !== undefined) args.tags = splitList(tags, "--tags");
  const mentions = flags.get("mentions");
  if (mentions !== undefined) args.mentions = splitList(mentions, "--mentions");
  const replyBy = flags.get("reply-by");
  if (replyBy !== undefined) args.replyBy = replyBy;
  args.wait = flags.has("wait");
  args.json = flags.has("json");
  const board = flags.get("board");
  if (board !== undefined) args.board = board;
  const as = flags.get("as");
  if (as !== undefined) args.as = as;
  const intervalRaw = flags.get("interval");
  if (intervalRaw !== undefined) {
    const n = Number(intervalRaw);
    if (!Number.isSafeInteger(n) || n <= 0 || n > MAX_INTERVAL_MS) {
      throw new UsageError(`invalid --interval "${intervalRaw}": positive integer <= ${MAX_INTERVAL_MS} required`);
    }
    args.interval = n;
  }
  if (args.wait && !args.replyBy) throw new UsageError("--reply-by is required with --wait");
  if (!args.wait && args.interval !== undefined) {
    throw new UsageError("--interval applies only with --wait");
  }
  return args;
}

export function parseRespondArgs(argv: string[]): RespondArgs {
  const { flags, positionals } = strictParse(argv, RESPOND_VALUE_FLAGS, RESPOND_BOOLEAN_FLAGS);
  if (positionals.length !== 1) {
    throw new UsageError("respond requires exactly one request id");
  }
  const args: RespondArgs = { requestId: positionals[0]!, body: undefined, failure: false, json: false };
  args.body = flags.get("body");
  args.failure = flags.has("failure");
  const mentions = flags.get("mentions");
  if (mentions !== undefined) args.mentions = splitList(mentions, "--mentions");
  const board = flags.get("board");
  if (board !== undefined) args.board = board;
  const as = flags.get("as");
  if (as !== undefined) args.as = as;
  args.json = flags.has("json");
  return args;
}

// ---------------------------------------------------------------------------
// Early invocation context: captured at dispatch, before stdin/Store/setup.

export type TerminalReason = "sigint" | "sigterm" | "signal" | "deadline";

export interface CliInvocationContext {
  readonly entryWall: number;
  readonly entryMono: number;
  readonly wallNow: () => number;
  readonly monoNow: () => number;
  readonly controller: AbortController;
  readonly hooks: WaitHooks;
  firstTerminal: TerminalReason | null;
  replicationCheck: () => ReplicationWarning | null;
  /** Arm the local deadline timer; fires abort() with reason "deadline". */
  armDeadline: (remainingMs: number) => void;
  dispose: () => void;
}

export interface CaptureDeps {
  signal?: AbortSignal;
  now?: () => number;
  installSignals?: boolean;
  hooks?: WaitHooks;
}

export function captureCliInvocation(deps: CaptureDeps = {}): CliInvocationContext {
  const wallNow = deps.now ?? Date.now;
  const monoNow = deps.hooks?.monoNow ?? (() => performance.now());
  const hookWall = deps.hooks?.wallNow ?? wallNow;
  const controller = new AbortController();
  const ctx: CliInvocationContext = {
    entryWall: hookWall(),
    entryMono: monoNow(),
    wallNow: hookWall,
    monoNow,
    controller,
    hooks: {
      ...(deps.hooks ?? {}),
      wallNow: hookWall,
      monoNow,
    },
    firstTerminal: null,
    replicationCheck: () => null,
    armDeadline: () => {},
    dispose: () => {},
  };
  const markAndAbort = (reason: TerminalReason) => {
    if (ctx.firstTerminal === null) ctx.firstTerminal = reason;
    controller.abort();
  };
  const onSigInt = () => markAndAbort("sigint");
  const onSigTerm = () => markAndAbort("sigterm");
  const onInjected = () => markAndAbort("signal");
  const installed: Array<() => void> = [];
  if (deps.installSignals) {
    process.once("SIGINT", onSigInt);
    process.once("SIGTERM", onSigTerm);
    installed.push(() => {
      process.off("SIGINT", onSigInt);
      process.off("SIGTERM", onSigTerm);
    });
  }
  if (deps.signal !== undefined) {
    if (deps.signal.aborted) markAndAbort("signal");
    else {
      deps.signal.addEventListener("abort", onInjected, { once: true });
      installed.push(() => deps.signal!.removeEventListener("abort", onInjected));
    }
  }
  let deadlineHandle: unknown;
  let deadlineArmed = false;
  const clearDeadline = () => {
    if (deadlineArmed) {
      (ctx.hooks.clearTimeout ?? (clearTimeout as unknown as ClearTimeoutFn))(deadlineHandle);
      deadlineArmed = false;
    }
  };
  ctx.armDeadline = (remainingMs: number) => {
    if (controller.signal.aborted || deadlineArmed) return;
    deadlineArmed = true;
    deadlineHandle = (ctx.hooks.setTimeout ?? setTimeout)(() => {
      deadlineArmed = false;
      markAndAbort("deadline");
    }, Math.max(0, remainingMs)) as unknown;
  };
  ctx.dispose = () => {
    clearDeadline();
    for (const off of installed) off();
  };
  return ctx;
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

function delivered(post: Post): DeliveredPost {
  return {
    post,
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

function errorOutcome(
  operation: Operation,
  code: ErrorCode,
  context: ErrorContextLike | null,
  fallbackPhase: RequestPhase = "validate",
): AdapterOutcome {
  const c = context;
  return {
    ...base(operation, {
      board: c?.board ?? null,
      requestId: c?.requestId ?? null,
      responseId: c?.responseId ?? null,
      replyBy: c?.replyBy ?? null,
      postState: c?.postState ?? "not-written",
    }),
    kind: "error",
    code,
    phase: c?.phase ?? fallbackPhase,
    message: ERROR_MESSAGES[code],
    cause: CAUSE_FOR_CODE[code],
  };
}

interface Sink {
  stdout: (line: string) => void;
  stderr: (line: string) => void;
  contextualize?: (outcome: AdapterOutcome) => AdapterOutcome;
}

/** Print exactly one JSON outcome line; returns the D07 exit code. */
function emit(outcome: AdapterOutcome, sink: Sink, replication: ReplicationWarning | null): number {
  outcome = sink.contextualize?.(outcome) ?? outcome;
  const withWarning: AdapterOutcome = replication === null && outcome.warnings.length === 0
    ? outcome
    : { ...outcome, warnings: replication ? [replication] : outcome.warnings };
  sink.stdout(JSON.stringify(withWarning));
  if (withWarning.kind === "failure") {
    sink.stderr(`received failure response ${withWarning.reply.post.id}`);
  } else if (withWarning.kind === "timeout" || withWarning.kind === "cancelled" || withWarning.kind === "error") {
    sink.stderr(withWarning.message);
  }
  return exitForOutcome(withWarning, withWarning.warnings.length > 0);
}

function isGitReplicationDegraded(store: Store): boolean {
  const probe = (store as { lastSyncError?: unknown }).lastSyncError;
  return probe !== undefined && probe !== null;
}

function noStore(): never {
  throw new UsageError("request/respond require an injected store");
}

// ---------------------------------------------------------------------------
// Body resolution: explicit text, "-", or injected/native stdin (64 KiB cap).

interface BodySource {
  value: string | undefined;
  promise: Promise<string> | null;
  cancel: () => void;
}

class BodyTooLargeError extends Error {}

function cappedNativeStdin(): { promise: Promise<string>; cancel: () => void } {
  const stream = process.stdin;
  let settled = false;
  let size = 0;
  const chunks: Buffer[] = [];
  let resolveBody!: (value: string) => void;
  let rejectBody!: (error: unknown) => void;
  const promise = new Promise<string>((resolve, reject) => {
    resolveBody = resolve;
    rejectBody = reject;
  });
  const finish = (settle: () => void) => {
    if (settled) return;
    settled = true;
    detach();
    stream.pause();
    settle();
    chunks.length = 0;
  };
  const onData = (chunk: Buffer) => {
    size += chunk.length;
    if (size > MAX_STDIN_BYTES) {
      finish(() => rejectBody(new BodyTooLargeError()));
      return;
    }
    chunks.push(chunk);
  };
  const onEnd = () => finish(() => resolveBody(Buffer.concat(chunks).toString("utf8")));
  const onError = (error: unknown) => finish(() => rejectBody(error));
  const detach = () => {
    stream.off("data", onData);
    stream.off("end", onEnd);
    stream.off("error", onError);
  };
  stream.on("data", onData);
  stream.on("end", onEnd);
  stream.on("error", onError);
  stream.resume();
  return {
    promise,
    cancel: () => {
      if (settled) return;
      settled = true;
      detach();
      stream.pause();
      // Leave the shared stdin stream open for the caller (never destroy it),
      // but retain nothing past the cap for this invocation.
      chunks.length = 0;
      resolveBody(""); // Drain the owned reader promise; the terminal outcome already won.
    },
  };
}

function startBody(
  explicit: string | undefined,
  deps: { stdin?: () => Promise<string> },
): { body: BodySource; cappedError: "oversize" | null } {
  if (explicit !== undefined && explicit !== "" && explicit !== "-") {
    return { body: { value: explicit, promise: null, cancel: () => {} }, cappedError: null };
  }
  if (deps.stdin !== undefined) {
    const promise = deps.stdin();
    return { body: { value: undefined, promise, cancel: () => {} }, cappedError: null };
  }
  if (!process.stdin.isTTY) {
    const reader = cappedNativeStdin();
    return { body: { value: undefined, promise: reader.promise, cancel: reader.cancel }, cappedError: null };
  }
  throw new UsageError("--body - requires piped or injected stdin");
}

/** Attach completion and rejection handling so no owned promise is unhandled. */
function supervise(promise: Promise<unknown>): void {
  promise.then(
    () => {},
    () => {},
  );
}

function byteLength(s: string): number {
  return Buffer.byteLength(s, "utf8");
}

// ---------------------------------------------------------------------------
// Handlers

export interface HandlerDeps {
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
  stdin?: () => Promise<string>;
  store?: Store;
  prepareStore?: () => Promise<Store> | Store;
  boardName?: string;
  authorName?: string;
  hooks?: WaitHooks;
}

function sinkOf(deps: HandlerDeps): Sink {
  return { stdout: deps.stdout ?? console.log, stderr: deps.stderr ?? console.error };
}

/** Read context flags without treating a flag-shaped body/value as an option. */
function contextFlags(argv: string[]): Map<string, string> {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--") break;
    if (!arg.startsWith("--")) continue;
    const equals = arg.indexOf("=");
    const name = arg.slice(2, equals < 0 ? undefined : equals);
    if (equals >= 0) flags.set(name, arg.slice(equals + 1));
    else if (name === "store" || REQUEST_VALUE_FLAGS.has(name) || RESPOND_VALUE_FLAGS.has(name)) {
      const value = argv[++i];
      if (value !== undefined) flags.set(name, value);
    } else flags.set(name, "true");
  }
  return flags;
}

export function hasProfileHelp(argv: string[]): boolean {
  return contextFlags(argv).has("help");
}

export function requestOperation(argv: string[]): Operation {
  return contextFlags(argv).has("wait") ? "request-wait" : "request-post";
}

/** Preserve independently validated context even when another input fails. */
function profileSink(argv: string[], deps: HandlerDeps, operation: Operation, ctx?: CliInvocationContext): Sink {
  const sink = sinkOf(deps);
  const flags = contextFlags(argv);
  const value = (name: string) => flags.get(name);
  let board: string | null = null;
  try { board = assertName(value("board") ?? deps.boardName ?? "general", "board"); } catch {}
  const raw = value("reply-by");
  const ms = raw === undefined ? null : operation === "request-wait" ? parseReplyBy(raw) : Date.parse(raw);
  const replyBy = operation === "respond" || ms === null || !Number.isFinite(ms) ? null
    : operation === "request-wait" ? new Date(ms).toISOString() : raw!;
  return {
    ...sink,
    contextualize: (outcome) => {
      const warning = ctx?.replicationCheck() ?? (deps.store && isGitReplicationDegraded(deps.store) ? REPLICATION_WARNING : null);
      return { ...outcome, operation, board: outcome.board ?? board,
        replyBy: outcome.replyBy ?? replyBy, warnings: warning ? [warning] : outcome.warnings };
    },
  };
}

export function emitProfileSetupError(argv: string[], deps: HandlerDeps, operation: Operation): number {
  return emit(errorOutcome(operation, "INVALID_REQUEST_OPTIONS", null), profileSink(argv, deps, operation), null);
}

async function prepareStore(deps: HandlerDeps, ctx?: CliInvocationContext): Promise<void> {
  if (!deps.prepareStore) return;
  if (ctx?.controller.signal.aborted) throw new Error("terminal");
  let off = () => {};
  const terminal = new Promise<never>((_, reject) => {
    if (!ctx) return;
    const onAbort = () => reject(new Error("terminal"));
    ctx.controller.signal.addEventListener("abort", onAbort, { once: true });
    off = () => ctx.controller.signal.removeEventListener("abort", onAbort);
  });
  try {
    const pending = Promise.resolve().then(() => {
      if (ctx?.controller.signal.aborted) throw new Error("terminal");
      return deps.prepareStore!();
    });
    const store = await Promise.race([pending, terminal]);
    if (ctx?.controller.signal.aborted) throw new Error("terminal");
    deps.store = store;
    if (ctx) ctx.replicationCheck = () => isGitReplicationDegraded(store) ? REPLICATION_WARNING : null;
  } finally { off(); }
}

function openBoard(deps: HandlerDeps, args: { board?: string; as?: string }): Board {
  const store = deps.store ?? noStore();
  const boardName = args.board ?? deps.boardName ?? "general";
  const author = args.as ?? deps.authorName ?? "anonymous";
  return new Board(store, { board: assertNameInput(boardName, "board"), author: assertNameInput(author, "author") });
}

function assertNameInput(value: string, label: string): string {
  try { return assertName(value, label); }
  catch { throw new UsageError(`invalid ${label}`); }
}

function preparationCode(error: unknown): ErrorCode {
  return error instanceof BodyTooLargeError ? "INVALID_POST" : "ADAPTER_PREPARATION_FAILED";
}

const MISSING_BODY = Symbol("missing body");
const OVERSIZE_BODY = Symbol("oversize body");

function requireBodyReady(
  bodyValue: string | undefined,
  bodyText: string | undefined,
): string | typeof MISSING_BODY | typeof OVERSIZE_BODY {
  const text = bodyValue !== undefined && bodyValue !== "" && bodyValue !== "-" ? bodyValue : bodyText;
  if (text === undefined || text.length === 0) return MISSING_BODY;
  if (byteLength(text) > MAX_STDIN_BYTES) return OVERSIZE_BODY;
  return text;
}

export async function handleRequest(
  argv: string[],
  deps: HandlerDeps,
  ctx?: CliInvocationContext,
): Promise<number> {
  const operation = requestOperation(argv);
  const sink = profileSink(argv, deps, operation, ctx);
  let args: RequestArgs;
  try {
    args = parseRequestArgs(argv);
  } catch (error) {
    if (error instanceof UsageError) {
      return emit(
        errorOutcome("request-post", "INVALID_REQUEST_OPTIONS", null),
        sink,
        null,
      );
    }
    throw error;
  }

  // Cancellation belongs only to opt-in waits. Posting keeps Board.request's
  // contract and must never emit a cancelled/request-post wire variant.
  if (!args.wait) ctx = undefined;

  const boardName = args.board ?? deps.boardName ?? "general";
  try {
    assertNameInput(boardName, "board");
    assertNameInput(args.as ?? deps.authorName ?? "anonymous", "author");
    for (const recipient of args.to) assertNameInput(recipient, "to");
    if (!args.wait && args.replyBy !== undefined && !Number.isFinite(Date.parse(args.replyBy))) {
      throw new UsageError("invalid reply-by");
    }
  } catch {
    return emit(errorOutcome("request-post", "INVALID_REQUEST_OPTIONS", null), sink, null);
  }

  // Wait-mode budget checks use the captured entry time (never re-based).
  let replyByMs: number | null = null;
  if (args.wait) {
    replyByMs = parseReplyBy(args.replyBy!);
    if (replyByMs === null) {
      return emit(errorOutcome("request-wait", "INVALID_REQUEST_OPTIONS", {
        board: null,
        requestId: null,
        responseId: null,
        postState: "not-written",
        replyBy: null,
        phase: "validate",
      }), sink, null);
    }
    const entry = ctx?.entryWall ?? Date.now();
    const remaining = replyByMs - entry;
    if (remaining <= 0 && !ctx?.controller.signal.aborted) {
      return emit({
        ...base("request-wait", { board: null, requestId: null, responseId: null, replyBy: new Date(replyByMs).toISOString(), postState: "not-written" }),
        kind: "timeout",
        code: "REQUEST_TIMEOUT",
        phase: "prepare",
        message: ERROR_MESSAGES.REQUEST_TIMEOUT,
        cause: null,
      }, sink, null);
    }
    if (remaining > MAX_WAIT_MS) {
      return emit(errorOutcome("request-wait", "INVALID_REQUEST_OPTIONS", {
        board: null,
        requestId: null,
        responseId: null,
        postState: "not-written",
        replyBy: null,
        phase: "validate",
      }), sink, null);
    }
  }

  // Pre-abort: a terminal signal before any store/stdin work wins.
  if (ctx !== undefined && ctx.controller.signal.aborted && ctx.firstTerminal !== "deadline") {
    return emit({
      ...base("request-wait", { board: null, requestId: null, responseId: null, replyBy: replyByMs === null ? null : new Date(replyByMs).toISOString(), postState: "not-written" }),
      kind: "cancelled",
      code: "REQUEST_CANCELLED",
      reason: (ctx.firstTerminal ?? "signal") as CancelReason,
      phase: "prepare",
      message: ERROR_MESSAGES.REQUEST_CANCELLED,
      cause: null,
    }, sink, null);
  }

  if (args.wait && ctx) ctx.armDeadline(ctx.entryMono + replyByMs! - ctx.entryWall - ctx.monoNow());
  try {
    await prepareStore(deps, ctx);
    if (args.wait && ctx && ctx.monoNow() >= ctx.entryMono + replyByMs! - ctx.entryWall && !ctx.controller.signal.aborted) {
      ctx.firstTerminal = "deadline";
      ctx.controller.abort();
    }
    if (ctx?.controller.signal.aborted) throw new Error("terminal");
  } catch (error) {
    if (args.wait && ctx && !ctx.controller.signal.aborted && ctx.monoNow() >= ctx.entryMono + replyByMs! - ctx.entryWall) {
      ctx.firstTerminal = "deadline";
      ctx.controller.abort();
    }
    if (ctx?.controller.signal.aborted) {
      const deadline = ctx.firstTerminal === "deadline";
      const fields = { ...base(operation, { board: boardName, requestId: null, responseId: null,
        replyBy: replyByMs === null ? null : new Date(replyByMs).toISOString(), postState: "not-written" }),
        phase: "prepare" as const, cause: null };
      return emit(deadline
        ? { ...fields, kind: "timeout", code: "REQUEST_TIMEOUT", message: ERROR_MESSAGES.REQUEST_TIMEOUT }
        : { ...fields, kind: "cancelled", code: "REQUEST_CANCELLED", message: ERROR_MESSAGES.REQUEST_CANCELLED,
          reason: (ctx.firstTerminal ?? "signal") as CancelReason }, sink, ctx.replicationCheck());
    }
    return emit(errorOutcome(operation, error instanceof UsageError ? "INVALID_REQUEST_OPTIONS" : "ADAPTER_PREPARATION_FAILED", null, "prepare"), sink, ctx?.replicationCheck() ?? null);
  }

  // Body resolution. In wait mode it is supervised against the deadline and
  // signals: a stalled stdin must not postpone the terminal outcome.
  let body: BodySource;
  try {
    body = startBody(args.body, deps).body;
  } catch (error) {
    if (error instanceof UsageError) {
      return emit(errorOutcome("request-post", "INVALID_POST", null), sink, null);
    }
    return emit(errorOutcome(operation, "ADAPTER_PREPARATION_FAILED", null, "prepare"), sink, ctx?.replicationCheck() ?? null);
  }
  supervise(body.promise ?? Promise.resolve());

  let bodyText: string | undefined;
  let bodyFailure: unknown;
  let bodyFailed = false;
  if (body.promise !== null) {
    if (args.wait && ctx !== undefined) {
      ctx.armDeadline(ctx.entryMono + (replyByMs ?? ctx.entryWall) - ctx.entryWall - ctx.monoNow());
      let detachTerminal = () => {};
      const latch = new Promise<"terminal">((resolve) => {
        if (ctx.controller.signal.aborted) resolve("terminal");
        else {
          const onAbort = () => resolve("terminal");
          ctx.controller.signal.addEventListener("abort", onAbort, { once: true });
          detachTerminal = () => ctx.controller.signal.removeEventListener("abort", onAbort);
        }
      });
      supervise(latch);
      const winner = await Promise.race([
        body.promise.then(
          (text) => ({ kind: "body" as const, text }),
          (error) => ({ kind: "body-error" as const, error }),
        ),
        latch,
      ]).finally(() => detachTerminal());
      // Timer callbacks can lag behind EOF/rejection. Apply the same signal,
      // cutoff, then result precedence at the preparation continuation.
      if (!ctx.controller.signal.aborted && ctx.monoNow() >= ctx.entryMono + replyByMs! - ctx.entryWall) {
        ctx.firstTerminal = "deadline";
        ctx.controller.abort();
      }
      if (winner === "terminal" || ctx.controller.signal.aborted) {
        body.cancel();
        if (ctx.firstTerminal === "deadline") {
          return emit({
            ...base("request-wait", { board: null, requestId: null, responseId: null, replyBy: new Date(replyByMs!).toISOString(), postState: "not-written" }),
            kind: "timeout",
            code: "REQUEST_TIMEOUT",
            phase: "prepare",
            message: ERROR_MESSAGES.REQUEST_TIMEOUT,
            cause: null,
          }, sink, ctx.replicationCheck());
        }
        return emit({
          ...base("request-wait", { board: null, requestId: null, responseId: null, replyBy: replyByMs === null ? null : new Date(replyByMs).toISOString(), postState: "not-written" }),
          kind: "cancelled",
          code: "REQUEST_CANCELLED",
          reason: (ctx.firstTerminal ?? "signal") as CancelReason,
          phase: "prepare",
          message: ERROR_MESSAGES.REQUEST_CANCELLED,
          cause: null,
        }, sink, ctx.replicationCheck());
      }
      if (winner.kind === "body-error") {
        bodyFailed = true;
        bodyFailure = winner.error;
      } else {
        bodyText = winner.text;
      }
    } else {
      const p = body.promise;
      try {
        bodyText = await p;
      } catch (error) {
        bodyFailed = true;
        bodyFailure = error;
      }
    }
  }

  let board: Board;
  try {
    board = openBoard(deps, args);
  } catch {
    return emit(errorOutcome(args.wait ? "request-wait" : "request-post", "INVALID_REQUEST_OPTIONS", null), sink, null);
  }
  const replication = (): ReplicationWarning | null =>
    ctx !== undefined
      ? ctx.replicationCheck()
      : isGitReplicationDegraded(deps.store ?? noStore())
        ? REPLICATION_WARNING
        : null;

  if (bodyFailed) {
    return emit(errorOutcome(args.wait ? "request-wait" : "request-post", preparationCode(bodyFailure), {
      board: board.name,
      requestId: null,
      responseId: null,
      postState: "not-written",
      replyBy: replyByMs === null ? null : new Date(replyByMs).toISOString(),
      phase: "prepare",
    }), sink, replication());
  }

  const ready = requireBodyReady(args.body, bodyText);
  if (ready === MISSING_BODY) {
    return emit(errorOutcome("request-post", "INVALID_POST", null), sink, replication());
  }
  if (ready === OVERSIZE_BODY) {
    return emit(errorOutcome(args.wait ? "request-wait" : "request-post", "INVALID_POST", {
      board: board.name,
      requestId: null,
      responseId: null,
      postState: "not-written",
      replyBy: replyByMs === null ? null : new Date(replyByMs).toISOString(),
      phase: "prepare",
    }), sink, replication());
  }

  const input = {
    body: ready,
    ...(args.title === undefined ? {} : { title: args.title }),
    ...(args.tags === undefined ? {} : { tags: args.tags }),
    ...(args.mentions === undefined ? {} : { mentions: args.mentions }),
  };

  if (!args.wait) {
    // Board.request has no allocation callback. Observe its validated encoded
    // post at the Store boundary without bypassing Board's validators or queue.
    let allocatedId: string | null = null;
    const store = board.store;
    const capturedStore = new Proxy(store, {
      get(target, property) {
        if (property === "put") return (key: string, bytes: Uint8Array, options: Parameters<Store["put"]>[2]) => {
          allocatedId = (JSON.parse(new TextDecoder().decode(bytes)) as Post).id;
          return target.put(key, bytes, options);
        };
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const postingBoard = new Board(capturedStore, { board: board.name, author: board.author, instance: board.instance });
    try {
      const post = await postingBoard.request(args.to, { ...input, protocol: "request" }, args.replyBy === undefined ? {} : { replyBy: args.replyBy });
      const supplied = args.replyBy !== undefined && Number.isFinite(Date.parse(args.replyBy))
        ? args.replyBy
        : null;
      return emit({
        ...base("request-post", { board: post.board, requestId: post.id, responseId: null, replyBy: supplied, postState: "written" }),
        kind: "posted",
        post: delivered(post),
      }, sink, replication());
    } catch (error) {
      const code = errorCodeOf(error) ?? "REQUEST_WRITE_FAILED";
      return emit(errorOutcome("request-post", code, {
        board: board.name,
        requestId: allocatedId,
        responseId: null,
        // The snapshot retains the validated ID before the put begins.
        postState: code === "INVALID_POST" || code === "INVALID_REQUEST_OPTIONS" ? "not-written" : "unknown",
        replyBy: args.replyBy !== undefined && Number.isFinite(Date.parse(args.replyBy)) ? args.replyBy : null,
        phase: code === "INVALID_POST" || code === "INVALID_REQUEST_OPTIONS" ? "validate" : "write",
      }), sink, replication());
    }
  }

  // Wait mode: capture once, hand the same invocation into the engine.
  const hooks = ctx !== undefined ? { ...ctx.hooks, ...(deps.hooks ?? {}) } : deps.hooks ?? {};
  const opts: RequestWaitOptions = {
    replyBy: args.replyBy!,
    ...(ctx === undefined ? {} : { signal: ctx.controller.signal }),
    ...(args.interval === undefined ? {} : { intervalMs: args.interval }),
  };
  try {
    // Core samples entry wall/mono once, then uses live monotonic readings.
    // Supply the dispatch samples for those entry reads, never a rebased wall budget.
    let entryWallRead = false;
    let entryMonoRead = false;
    const captureHooks = ctx === undefined ? hooks : {
      ...hooks,
      wallNow: () => { if (!entryWallRead) { entryWallRead = true; return ctx.entryWall; } return ctx.wallNow(); },
      monoNow: () => { if (!entryMonoRead) { entryMonoRead = true; return ctx.entryMono; } return ctx.monoNow(); },
    };
    const invocation = captureRequestInvocation(board, args.to, input, opts, captureHooks);
    if (ctx !== undefined) ctx.armDeadline(ctx.entryMono + replyByMs! - ctx.entryWall - ctx.monoNow());
    const reply = await runRequestWait(board, args.to, input, opts, hooks, invocation);
    return emit({
      ...base("request-wait", {
        board: reply.request.board,
        requestId: reply.request.id,
        responseId: reply.reply.id,
        replyBy: replyByMs === null ? null : new Date(replyByMs).toISOString(),
        postState: "written",
      }),
      kind: reply.kind,
      request: delivered(reply.request),
      reply: delivered(reply.reply),
      observedAt: reply.observedAt,
    }, sink, replication());
  } catch (error) {
    const context = contextOf(error);
    if ((error as Error)?.name === "RequestCancelledError") {
      const deadlineWon = ctx !== undefined && ctx.firstTerminal === "deadline";
      if (deadlineWon) {
        return emit({
          ...base("request-wait", {
            board: context?.board ?? board.name,
            requestId: context?.requestId ?? null,
            responseId: null,
            replyBy: context?.replyBy ?? (replyByMs === null ? null : new Date(replyByMs).toISOString()),
            postState: context?.postState ?? "not-written",
          }),
          kind: "timeout",
          code: "REQUEST_TIMEOUT",
          phase: context?.phase ?? "prepare",
          message: ERROR_MESSAGES.REQUEST_TIMEOUT,
          cause: null,
        }, sink, replication());
      }
      return emit({
        ...base("request-wait", {
          board: context?.board ?? board.name,
          requestId: context?.requestId ?? null,
          responseId: null,
          replyBy: context?.replyBy ?? (replyByMs === null ? null : new Date(replyByMs).toISOString()),
          postState: context?.postState ?? "not-written",
        }),
        kind: "cancelled",
        code: "REQUEST_CANCELLED",
        reason: (ctx?.firstTerminal === "sigint" ? "sigint"
          : ctx?.firstTerminal === "sigterm" ? "sigterm"
          : ctx?.firstTerminal === "signal" ? "signal"
          : "signal") as CancelReason,
        phase: context?.phase ?? "prepare",
        message: ERROR_MESSAGES.REQUEST_CANCELLED,
        cause: null,
      }, sink, replication());
    }
    if ((error as Error)?.name === "RequestTimeoutError") {
      return emit({
        ...base("request-wait", {
          board: context?.board ?? board.name,
          requestId: context?.requestId ?? null,
          responseId: null,
          replyBy: context?.replyBy ?? (replyByMs === null ? null : new Date(replyByMs).toISOString()),
          postState: context?.postState ?? "not-written",
        }),
        kind: "timeout",
        code: "REQUEST_TIMEOUT",
        phase: context?.phase ?? "observe",
        message: ERROR_MESSAGES.REQUEST_TIMEOUT,
        cause: null,
      }, sink, replication());
    }
    const code = errorCodeOf(error) ?? "INTERNAL_ERROR";
    return emit(errorOutcome("request-wait", code, {
      board: context?.board ?? board.name,
      requestId: context?.requestId ?? null,
      responseId: context?.responseId ?? null,
      postState: context?.postState ?? (code === "INVALID_POST" || code === "INVALID_REQUEST_OPTIONS" ? "not-written" : "unknown"),
      replyBy: context?.replyBy ?? (replyByMs === null ? null : new Date(replyByMs).toISOString()),
      phase: context?.phase ?? "validate",
    }), sink, replication());
  }
}

export async function handleRespond(
  argv: string[],
  deps: HandlerDeps,
): Promise<number> {
  const sink = profileSink(argv, deps, "respond");
  let args: RespondArgs;
  try {
    args = parseRespondArgs(argv);
  } catch (error) {
    if (error instanceof UsageError) {
      return emit(errorOutcome("respond", "INVALID_REQUEST_OPTIONS", null), sink, null);
    }
    throw error;
  }
  if (!isUlid(args.requestId)) {
    return emit(errorOutcome("respond", "INVALID_REQUEST_OPTIONS", null), sink, null);
  }
  try {
    assertNameInput(args.board ?? deps.boardName ?? "general", "board");
    assertNameInput(args.as ?? deps.authorName ?? "anonymous", "author");
  } catch {
    return emit(errorOutcome("respond", "INVALID_REQUEST_OPTIONS", null), sink, null);
  }
  try { await prepareStore(deps); } catch (error) {
    return emit(errorOutcome("respond", error instanceof UsageError ? "INVALID_REQUEST_OPTIONS" : "ADAPTER_PREPARATION_FAILED", null, "prepare"), sink, null);
  }

  let board: Board;
  try {
    board = openBoard(deps, args);
  } catch {
    return emit(errorOutcome("respond", "INVALID_REQUEST_OPTIONS", null), sink, null);
  }
  const replication = (): ReplicationWarning | null =>
    isGitReplicationDegraded(deps.store ?? noStore()) ? REPLICATION_WARNING : null;
  const preparationContext = {
    board: board.name, requestId: args.requestId, responseId: null,
    postState: "not-written" as const, replyBy: null, phase: "prepare" as const,
  };

  let body: BodySource;
  try {
    body = startBody(args.body, deps).body;
  } catch (error) {
    if (error instanceof UsageError) {
      return emit(errorOutcome("respond", "INVALID_POST", preparationContext), sink, replication());
    }
    return emit(errorOutcome("respond", "ADAPTER_PREPARATION_FAILED", preparationContext), sink, replication());
  }
  supervise(body.promise ?? Promise.resolve());
  let bodyText: string | undefined;
  try {
    bodyText = body.promise === null ? undefined : await body.promise;
  } catch (error) {
    return emit(errorOutcome("respond", preparationCode(error), {
      board: board.name,
      requestId: args.requestId,
      responseId: null,
      postState: "not-written",
      replyBy: null,
      phase: "prepare",
    }), sink, replication());
  }
  const ready = requireBodyReady(args.body, bodyText);
  if (ready === MISSING_BODY) {
    return emit(errorOutcome("respond", "INVALID_POST", preparationContext), sink, replication());
  }
  if (ready === OVERSIZE_BODY) {
    return emit(errorOutcome("respond", "INVALID_POST", {
      board: board.name,
      requestId: args.requestId,
      responseId: null,
      postState: "not-written",
      replyBy: null,
      phase: "prepare",
    }), sink, replication());
  }

  const input = {
    body: ready,
    ...(args.mentions === undefined ? {} : { mentions: args.mentions }),
  };
  try {
    const post = await runRespond(
      board,
      args.requestId,
      input,
      { outcome: args.failure ? "failure" : "inform" },
      deps.hooks ?? {},
    );
    return emit({
      ...base("respond", { board: post.board, requestId: args.requestId, responseId: post.id, replyBy: null, postState: "written" }),
      kind: "posted",
      post: delivered(post),
    }, sink, replication());
  } catch (error) {
    const context = contextOf(error);
    const code = errorCodeOf(error) ?? "INTERNAL_ERROR";
    return emit(errorOutcome("respond", code, {
      board: context?.board ?? board.name,
      // Response errors always report R's state; Q is retained separately.
      requestId: context?.requestId ?? args.requestId,
      responseId: context?.responseId ?? null,
      postState: context?.postState ?? "not-written",
      replyBy: null,
      phase: context?.phase ?? "validate",
    }), sink, replication());
  }
}

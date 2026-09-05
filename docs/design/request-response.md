# Request/response with local deadlines — task 202

**Status: DRAFT — UNAPPROVED.** Authored 2026-09-05 for
[task 202](../../backlog/202-core-request-response-helper-with-deadlines.md).
This is an architecture proposal, not an implementation, review, gate approval,
or declaration that the task is complete. Remediated under
[task 213](../../backlog/213-remediate-request-response-spec.md) after the
round-1 CHANGES REQUIRED result in [task 210](../../backlog/210-review-request-response-round-1.md).
D01–D08 are settled lead direction as recorded in task 213; the detailed
contracts below remain draft text for independent round-2 review in task 214.
No change to the locked
[DESIGN.md](../../DESIGN.md) is authorized by this document.

## Problem and compatibility boundary

A caller can already post an addressed request and read its thread, but must
implement correlation, waiting, timeout, and cancellation itself. Task 202's
original one-line description assigns waiting behavior to `Board.request`.
That conflicts with the posting contract established by task 201. Preserve the
existing method and add a separate operation:

```ts
// CURRENT contract, retained without changing its meaning or return type:
Board.request(to, input, { replyBy? }): Promise<Post>

// Lead-selected additions; declarations remain a draft implementation contract:
Board.requestAndWait(to, input, { replyBy, signal?, intervalMs? }): Promise<RequestReply>
Board.respond(requestId, input, { outcome? }): Promise<Post>
```

An `inform` reply means that a matching post was observed. It does not establish
that work succeeded, that its assertions are true, or that an authenticated
recipient sent it. A `failure` reply is also a received response, distinct from
failure of local storage or observation.

## Goals, non-goals, and current constraints

The proposal supplies one bounded wait for the first eligible reply, explicit
deadline and cancellation outcomes, an easy way to author correlated responses,
and equivalent CLI/MCP behavior. It preserves immutable posts, existing keys and
canonical bytes, the read-side validation limits, and the current request
posting convenience.

It does not add remote execution, automatic delegation, authenticated identity,
recipient authorization, exactly-once processing, acknowledgments, retries,
quorum/all-recipient collection, streaming progress, durable waiter recovery,
task-state transitions, an A2A gateway, or MCP Tasks extension support. Timeout
does not withdraw a post or prove that a recipient stopped working.

Interface discovery used CodeGraph before source inspection. The recorded
`HEAD` and `main` baseline was `35df4b9` (task 203). The working tree also had
uncommitted core watch/store and MCP changes. Those were read only as integration
context; this draft does not adopt or approve them. Relevant observations:

| Area | Current contract or observed interface | Consequence for this proposal |
|------|----------------------------------------|-------------------------------|
| [Core Board](../../packages/core/src/board.ts) | `request` returns the newly written `Post`; it sets `act: request`, a nonempty `to`, and a root thread. It does not wait, automatically set `protocol`, or require a deadline. `opts.replyBy`, when supplied, takes precedence over input `replyBy`. | Existing callers and their stored output retain this behavior. |
| Core writes | The per-Board write chain serializes post construction and `Store.put`; IDs are allocated when the queued write runs. | A waiting promise must never occupy that chain after its write finishes. |
| Core replies | `reply(idOrPost, input)` retains the parent's thread and sets `replyTo`; it does not establish task correlation itself. | `respond` adds a constrained profile over a validated root. |
| [Store](../../packages/core/src/store.ts) | `put/get/list` and optional `changes` have no cancellation parameter. `changes()` without a token may establish a new baseline. The working tree adds optional best-effort `hint`. | A timer cannot terminate a Store operation already in progress. The first implementation should not require hints or a watcher-start handshake. |
| Core reads/watch | Readers validate stored bytes and key binding. Cursor reads alone can miss older arrivals. The working-tree watch implementation has startup baselining, cursor/reconciliation state, and an optional hint pump. | Calling `watch` after publishing is not a sufficient specification of a race-free wait. |
| [CLI](../../packages/cli/src/index.ts) | Commands include `post`, `reply`, `read`, `tasks`, and `watch`, but no request/respond commands. Writes generally print JSON. `CliDependencies.signal` exists. Exit codes 1, 2, and 3 distinguish ordinary errors, usage errors, and degraded Git replication. | Add commands; preserve existing command outputs and exit meanings. |
| [MCP](../../packages/mcp/src/server.ts) | `board_post`/`board_reply` exist; current tool calls run through one `serialized` chain. Results apply unsigned provenance. Boards share an index and resource polling. | Release the tool queue during waiting, scope cancellation per invocation, and explicitly label both nested result posts. |
| Task lifecycle | The task-203 fold in locked DESIGN is independent and based on status posts in ascending ID order. | Receiving `inform`/`failure` or timing out must not synthesize `completed`, `failed`, or `canceled` status posts. |

The authority for trust and limits remains [SECURITY.md](../../SECURITY.md),
[AGENTS.md](../../AGENTS.md), and locked DESIGN. The
[protocol survey](../research/01-protocols.md) and
[envelope-v2 design](envelope-v2.md) explain the existing vocabulary.

## Selected architecture proposal

Use a short-lived observer owned by each request, with a single terminal-state
latch. Publish once through the existing validated, conditional-write machinery;
then immediately scan the active request window and repeat that scan until an
eligible response, local error, cancellation, or deadline settles the operation.
The immutable store provides the catch-up buffer. No shared index, subscription,
presence record, read receipt, or persistent waiter record is required.

The proposed first implementation deliberately uses paginated reads of a pinned
day range. It does not call `Board.watch`, depend on task 404, or add a new Store
method. Repeated scans recover an older key that appears behind the current
pass's cursor. They trade read volume for a small, independently testable
handoff. The observer retains at most a page of keys, one loaded object, and the
request/result state; it does not retain all unrelated posts or a lifetime-sized
deduplication set.

Lead-selected limits (D05):

- Core/CLI wait duration: greater than zero and at most 24 hours at invocation.
- Default interval between completed passes: 1,000 ms; a supplied interval is a
  positive safe integer no greater than 30,000 ms. Sleep is capped by remaining
  time, with no exponential backoff.
- Read at most 200 keys per page, process objects sequentially, and check
  terminal state between operations and pages. Yield between pages so a busy
  board cannot indefinitely monopolize the event loop.
- MCP: at most 16 admitted wait operations per server, including operations
  whose Store calls are still draining; at most five minutes per wait. Reject
  excess capacity or duration before publication. Do not silently shorten the
  advertised `replyBy`.

The 200-item bound is a work/read batch bound, not a claim that an entire day
contains only 200 objects. A full pass may span many pages and may be unable to
finish before the deadline on a busy or slow board. The outcome still follows
local observation, rather than pretending that visibility equals observation.

### Alternatives considered for lead selection

| Alternative | Benefit | Cost/reason not selected for the initial proposal |
|-------------|---------|------------------------------------------------|
| Change `Board.request` into the waiter | Small apparent surface | Breaks the established `Promise<Post>` posting contract; excluded by assignment. |
| Compose `await request(); watch(...)` | Reuses public methods | Startup baselining and change-feed token timing need an explicit catch-up proof; watcher startup is not an acknowledged registration boundary. |
| Add a shared observer with a ready barrier and pre-publication registration | Efficient for many concurrent requests; can combine feeds and hints | New shared lifecycle, reference counting, startup, and ordering contracts; overlaps current watch work. A future optimization must preserve the semantics below. |
| Use exact changes plus periodic range scans | Less repeated listing on supporting backends | Requires a baseline before publication and defined ordering across discovery sources; keep as a later optimization, not an assumed property of the current watcher. |
| Repeat a whole-board scan | Finds arbitrarily old retained objects without a time horizon | Cost grows with all board history. D05 selects pinned scans and accepts their historical limitation instead. |
| Query the local task/thread index | Reuses materialized views | Makes core depend on index synchronization and task lifecycle; adds an unrelated dependency to a Store-level helper. |
| Return a persistent job/MCP task handle | Survives client disconnects and long waits | Requires durability, ownership, retention, recovery, and a separate cancellation model outside task 202. |

## Trust boundaries

The caller's explicit API/CLI/tool invocation authorizes publishing its supplied
message. The stored request and response are untrusted data after publication.
Core validation establishes structural validity and key binding, not truth,
identity, consent, or authorization to execute an action.

The matcher compares the response's advisory `author` label with the request's
`to` list. Any store writer can claim that label; a matching instance is not an
authentication mechanism either. Two processes with the same name are eligible
under the same routing label. Reserved `sig`, client metadata, presence, a
request ID, and a successful wait must never be presented as proof of identity.
Current delivered posts remain `trust: "unsigned"`, including posts claiming
the caller's own name. Until verified identity exists, consumers must not act on
an unsigned post's git/exec instructions.

The observer reads only the selected board using validated key constructors and
the current read-side parser. It does not fetch attachment bytes, URLs,
`dataSchema`, `extensions`, or anything named by message text. `data`, `ext`,
`origin`, titles, bodies, and error-like strings in replies remain data; none
is interpolated into shell commands, keys, tool names, or privileged prompts.

The store can withhold, reorder, replace, or remove objects. A successful put
acknowledges only the Store's write contract, not remote replication, receipt,
execution, or authentication. Availability and consistent decisions across
replicas are not guaranteed. The helper never repairs or deletes stored posts
as a side effect of timeout, duplicate observation, or cancellation.

## Data format and invariants

No envelope version, field, key layout, or canonicalization change is proposed.
The new helpers use existing v2 fields. Local outcome/error/provenance metadata
is returned outside `Post`; adding `trust`, observation times, or error codes to
the stored top-level post would violate the existing schema.

Let `Q` be the request ID, `A` its author, and `T` its recipient list. New
request-and-wait posts use this profile:

| Field | Request produced by the new helper | Response produced by `respond(Q, ...)` |
|-------|------------------------------------|---------------------------------------|
| `v` | `2` | `2` |
| `board` | The Board instance's validated board | The same board |
| `id` | Newly generated `Q` | A new, distinct response ID |
| `thread` | `Q` | `Q` |
| `replyTo` | Absent | `Q` |
| `act` | `request` | Explicit `inform` or `failure` |
| `to` | Nonempty validated `T` | `[A]` |
| `protocol` | `request` | `request` |
| `task` | Absent; the root implicitly identifies its own task | `Q` |
| `replyBy` | Required validated deadline | Not automatically copied |
| `status` | Absent | Absent |
| `expires` | Optional caller-supplied value, never automatically derived | Optional response input, never inherited |

Existing author/instance/ID/timestamp generation, immutable `ifNoneMatch` writes,
64-KiB encoded-size and depth-eight limits, timestamp/ULID checks, unknown-key
rejection, and board/key binding apply unchanged. Do not weaken a reader to make
an invalid response match. Invalid stored objects are skipped; operational
`list/get` failures are reported separately.

The new helper rejects managed fields supplied in its input object, rather
than allowing its TypeScript type alone to prevent overrides. Caller-owned
structured data remains opaque. `mentions` remains advisory and never replaces
`to`. Duplicate names may remain in stored `to`, as the current convenience
allows; matching treats it as a set without changing case or spelling.

No expiry is invented for the request. If its input supplies `expires`, the new
waiting helper rejects a value earlier than `replyBy`: asking readers to discard
the request before the advertised wait ends would be contradictory. This extra
check does not change `Board.request`. A candidate response with `expires` at or
before the local evaluation wall clock is skipped; response expiry and the
waiter's deadline are separate conditions.

## Proposed core API and typed outcomes

The following specifies the lead-selected surface; it is not implemented or
an independently approved declaration:

```ts
type RequestInput = Omit<NewPost,
  "to" | "act" | "protocol" | "task" | "status" | "replyBy">;

type ResponseInput = Omit<RequestInput, "title">;

interface RequestWaitOptions {
  replyBy: string;
  signal?: AbortSignal;
  intervalMs?: number;
}

interface RequestReply {
  kind: "inform" | "failure";
  request: Post;
  reply: Post;
  observedAt: string; // Local wall-clock receipt time; never stored on Post.
}

// Board additions:
requestAndWait(
  to: string | string[], input: RequestInput, opts: RequestWaitOptions,
): Promise<RequestReply>;

respond(
  requestId: string, input: ResponseInput,
  opts?: { outcome?: "inform" | "failure" },
): Promise<Post>;
```

`requestAndWait` resolves for either eligible performative. The `kind` is the
normalized act, so a legacy reply with no explicit `act` yields `inform` while
the returned `Post` retains its original fields. It rejects for local failures.
`respond` defaults to `inform` and returns after its write; it does not wait for
an acknowledgment. Callers must choose `failure` explicitly when reporting one.

### Local error and publication contract

The selected new error classes use the following stable codes. The existing
`InvalidPostError` is normalized to `INVALID_POST` by these adapters without
changing that class or old API behavior. No error message comes from a response
body. `respond` has separate read and write errors; neither is a remote failure.

| Code / class | Meaning | Publication state for this invocation |
|--------------|---------|---------------------------------------|
| `INVALID_POST` / existing `InvalidPostError` | Invalid body/metadata, reserved input field, or encoded post validation failure | `not-written` |
| `INVALID_REQUEST_OPTIONS` / `InvalidRequestOptionsError` | Malformed arguments, target-ID syntax, date, unsupported duration/interval, invalid signal, or incompatible options | `not-written` |
| `REQUEST_TIMEOUT` / `RequestTimeoutError` | No eligible reply observed before cutoff, including elapsed deadline at entry or during adapter preparation | According to phase |
| `REQUEST_CANCELLED` / `RequestCancelledError` | Caller signal, CLI signal, MCP cancellation, transport closure, or shutdown canceled this wait | According to phase |
| `REQUEST_WRITE_FAILED` / `RequestWriteError` | Request publication's put rejected | `unknown` unless a typed backend contract proves no write |
| `REQUEST_READ_FAILED` / `RequestReadError` | Observer list/get rejected after request acknowledgment | `written` |
| `RESPONSE_TARGET_INVALID` / `ResponseTargetError` | Validated get returned null (absent or rejected stored object), root profile failed, or responder label is not in `to` | Response `not-written` |
| `RESPONSE_READ_FAILED` / `ResponseReadError` | Target Store.get rejected; availability cannot be classified as a missing/invalid root | Response `not-written` |
| `RESPONSE_WRITE_FAILED` / `ResponseWriteError` | Response publication's put rejected | Response `unknown` unless a typed backend contract proves no write |
| `REQUEST_CAPACITY` / adapter `RequestCapacityError` | MCP wait admission limit reached | `not-written` |
| `ADAPTER_PREPARATION_FAILED` / adapter `RequestPreparationError` | Stdin read or Store/Board setup failed before entering core | `not-written` |
| `INTERNAL_ERROR` / adapter fallback | Unexpected local failure not represented above | Preserve the last tracked state; never infer absence from an exception |

`postState` always concerns the new post this invocation publishes: the request
for request-post/request-wait, the response for respond. It is `not-written`
until put starts, `unknown` while put is in flight, and `written` only after
acknowledgment. A rejected put stays `unknown`, even after drainage, unless a
specific typed contract (for example `KeyExistsError` on conditional put)
guarantees this invocation wrote nothing; that case becomes `not-written`.
An existing object at that ID is not proof this invocation wrote it. No retry
or speculative readback is performed to resolve uncertainty.

```ts
type PublicationState = "not-written" | "unknown" | "written";
type RequestPhase = "validate" | "prepare" | "target-read" | "queued" | "write" | "observe";
interface PublicationSnapshot {
  board: string | null;       // null only before board validation succeeds
  requestId: string | null;   // Q: allocated request, or validated respond target
  responseId: string | null;  // allocated response for respond; never replaces Q
  postState: PublicationState;
}
interface LocalErrorContext extends PublicationSnapshot {
  replyBy: string | null;     // accepted deadline, otherwise null
  phase: RequestPhase;
  closed: Promise<PublicationSnapshot>;
}
```

Attach this context to rejections of the new core helpers, including validation
failures; adapter preflight failures carry the same context. Before any ID is
allocated it is null, never an empty string. `respond` records a syntactically
valid target Q before get, keeps it on target/read/write failure, and records
its distinct response ID immediately on allocation, even if encoding fails.
On a wait error `responseId` is always null: a skipped or late candidate is not
a selected response. For respond, `replyBy` is null because it has no wait
deadline. Phase identifies where the failure/terminal decision occurred; a
queued validation failure after ID allocation is phase `write`.

The non-wire `closed` promise resolves, never rejects, once all invocation work
has drained, with a new immutable final publication snapshot and allocated IDs.
It is already resolved for errors with no outstanding work. It can remain
pending without bound for a stuck non-abortable operation. The immediate error
snapshot never mutates. On success, core returns only after observer cleanup,
with no observer I/O outstanding. Raw `cause` may be retained for local
programmatic diagnosis, but adapters use only the safe mapping below and never
serialize `cause`, `closed`, stack traces, backend paths/URLs, or credentials.
No local error silently retries publication with a new ID.

## Correlation and reply eligibility

For request `q`, apply every row below to each structurally valid post `p` in
the observer's local discovery stream. Any failed row skips that post and keeps
waiting. These are routing and correlation conditions, never authorization:

| Condition | Proposed rule |
|-----------|---------------|
| Board | `p.board === q.board`; no index lookup on another board |
| Distinct post | `p.id !== q.id` |
| Thread and direct response | `p.thread === q.id` and `p.replyTo === q.id` |
| Task | `p.task` is absent or exactly `q.id`; a conflicting explicit task always excludes it |
| Protocol | `p.protocol` is absent or `request`; another protocol excludes it |
| Performative | `(p.act ?? "inform")` is `inform` or `failure` |
| Recipient label | `p.author` occurs in the original request's `to` list |
| Return address | `p.to` is absent or includes `q.author`; an explicitly empty or differently addressed list excludes it |
| Expiry | No `expires`, or it is later than the local evaluation wall clock |
| Local time/state | The invocation is still pending, its signal is not aborted, and the local deadline has not been reached |

This deliberately accepts a direct legacy `Board.reply(q.id, { body })` from a
named recipient: omitted `act` means `inform`, and omitted `task`, `protocol`,
and `to` remain compatible. It also means a recipient's ordinary direct comment
can finish a wait. This compatibility tradeoff is visible in D02; consumers
needing a stricter protocol should not infer one from this draft.

Descendant chatter, a same-task post in another thread, and a new root with
`task: Q` are excluded even though task-203 folding may associate them with Q.
Use `respond(Q, ...)` to send a terminal response to this helper. `agree`,
`refuse`, `reject`, `cancel`, and every `status` post are not terminal replies
for task 202. In particular `status: completed/failed` does not substitute for
`inform/failure`. There is no priority for success over failure: the first
eligible observation wins, even for multiple recipients. Waiting for all
recipients or collecting results is a separate future API.

### Responding to a request

`respond` accepts a request ID on the selected Board, not an arbitrary supplied
`Post`. Load it through validated `Board.get`, then require `act: request`,
`thread === id`, no `replyTo`, nonempty `to`, `task` absent or self, and
`protocol` absent or `request`. Missing and invalid stored roots intentionally
share `ResponseTargetError` only when get completes and returns null or a
validated root fails the profile. A rejected Store.get becomes
`ResponseReadError` with `RESPONSE_READ_FAILED`, Q retained, null response ID,
and response `not-written`; do not catch it as a target error. Check that the configured `Board.author` is in
`to`; report this as a recipient-label mismatch, never “not authenticated.”

Construct the response from that validated root snapshot, using the existing
reply/write path and managed fields in the wire table. Reject supplied managed
fields, including a title. Do not reselect the target through an unscoped index
or a second unvalidated caller object. The root may change or disappear in an
untrusted store after the read; the helper cannot promise a transaction across
the read and the immutable response write.

Once response construction allocates R, keep Q as `requestId` and R as
`responseId` on every subsequent outcome. A rejected response put becomes
`ResponseWriteError` with `RESPONSE_WRITE_FAILED` and the publication rules
above. An unacknowledged write must never be reported as a posted response or
converted into an automatically published `failure` post.

An elapsed request `replyBy` does not prohibit writing a response. A late reply
is useful retained history and may be observed by ordinary readers; `respond`
does not claim a waiter received it. It never copies the request's deadline or
expiry onto the response, and never automatically emits a lifecycle status.

## Publication/registration race and observation algorithm

There are two independent races: cancellation while a write is queued/running,
and a responder writing before observation begins. The proposed sequence is:

1. Capture invocation wall/monotonic time and cancellation, then validate and
   snapshot inputs. Establish the cutoff, terminal latch, and abort listener
   before asynchronous preparation or enqueueing. For adapters this begins at
   the entry boundary below, not when core is eventually called. Check an
   already aborted signal and elapsed deadline before any Store I/O.
2. Enter the existing per-Board write ordering. At the head of the queue,
   recheck cancellation/deadline immediately before constructing/publishing the
   request. If already settled, retire this queue entry without a put.
3. Allocate the request ID and capture its exact local post for correlation.
   Validate/encode through the existing write machinery. Recheck the shared
   latch, signal, and monotonic cutoff after encoding and immediately before
   put (no await between that check and call). Only then mark publication
   `unknown` and start one conditional put.
4. If put rejects before another terminal event, report a write failure. If it
   acknowledges while pending, mark `written` and immediately start catch-up.
   If it finishes after cancellation/timeout, record its final state for
   `closed`, but do not start observation or revise the settled result.
5. Catch-up starts at the pinned lower day, never at “latest,” a root-ID cursor,
   or a newly baselined watcher token. Walk day prefixes and page keys in byte
   order, loading and validating one object at a time. Skip invalid objects
   while advancing the full-key cursor. Evaluate eligible posts synchronously
   after validation and a terminal/deadline check.
6. On exhaustion of the current range, wait at most `intervalMs` or the
   remaining time, then restart from the same lower day with a refreshed upper
   day. Each pass is independent. Stop through the common terminal path on
   response, read error, cancellation, or deadline.

Implementation may add an internal guard/capture seam to the shared write
machinery, restricted to the new helper. It must not change the old request
method's validation, return value, write scheduling, or deadline behavior. A
plain composition that enqueues `Board.request` and cannot suppress its put
after pre-publication cancellation does not satisfy step 2.

If a response appears between the request becoming visible and its put promise
resolving, or between put completion and the first list, catch-up can read it.
There is no ephemeral subscription gap: nothing is treated as previously
delivered merely because it existed when the observer started. The guarantee
assumes the response remains readable in the discovery window. Removal,
withholding, or a deadline reached before local observation can still produce
timeout. It is not a distributed read-after-write transaction.

### Discovery horizon and offline behavior

The selected bounded approach pins the lower day at
`dayBucket(ulidTime(Q) - 10 minutes)` and, at the start of each pass, uses an
upper day at `dayBucket(local wall clock + 5 minutes)`. The ten-minute margin
allows two normally operating writers to differ in opposite directions within
the project's five-minute clock-skew budget. The future-day margin avoids
dropping an otherwise acceptable reply around UTC midnight. Include both bounds
and use existing validated UTC-day/key helpers; never derive a prefix from a
body, `data`, or arbitrary `task` string.

This is a discovery horizon, not proof of when a response was written. A
structurally valid post with an arbitrarily old ULID can exist outside it; the
current read rules do not establish that all valid historical posts fall within
this range. The proposed implementation does not promise to discover such a
post. D05 accepts this bounded horizon and its historical limitation. Do not describe this as
complete arbitrary-history delivery.

An offline recipient may respond later; another replica may merge an older key
behind a cursor. Repeating the pinned range gives those keys a new opportunity
to be observed while the wait remains pending, including a response ID sorting
before Q. There is no rule that response IDs must be greater than Q. A key
outside the horizon, arriving after the cutoff, or not reached before cutoff
does not finish the wait. Reconnection does not restart the clock or repost Q.
Local cancellation or process restart does not remove Q; ordinary thread reads
and reconciliation remain the recovery path. Task 202 adds no resumable waiter.

### Deterministic choice

Within one observation pass, inspect day prefixes and full keys in byte order,
and inspect each page sequentially. On validated posts this agrees with
ascending ULID order. The first eligible post in that stream wins, regardless
of act or recipient order. If backend reads are later parallelized, buffer and
release them in the same key order; network completion order must not choose
the result.

Determinism is relative to the same visible pages and observation sequence. A
smaller ID arriving after the winner, or behind the current page cursor, cannot
retroactively replace it. Different replicas or polling schedules can select
different replies. Waiting for a globally smallest ID or all eventual replies
is impossible within a finite local deadline on an eventually replicated store.
No global winner is persisted; other callers can independently observe the same
post. Duplicate appearances cannot settle a completed invocation twice.

## Deadline semantics

Require an explicit `replyBy` for the new waiter. D04 selects the precise
UTC syntax `YYYY-MM-DDTHH:mm:ss[.SSS]Z`, with valid calendar values,
zero or exactly three fractional digits, and seconds 00–59. Normalize it to
millisecond UTC for the new post. This is the project's new-helper input policy;
keep the existing posting method's parseable-date behavior unchanged. This
specification makes no external date-standard certification claim.

At invocation, capture local wall time and a monotonic time. Convert the
absolute deadline to a remaining duration once, then enforce that duration with
the monotonic clock. Queueing, validation, publication, polling, and reading all
consume the same budget. A wall-clock correction during the call does not
extend or shorten the already established monotonic cutoff; `observedAt` is
informational wall time. Tests need independent injectable wall/monotonic clocks
and timer scheduling, without changing stored timestamp validation.

### Adapter entry, preparation, and handoff

For CLI `request --wait`, capture both clocks and install SIGINT/SIGTERM and
injected-signal forwarding as soon as command dispatch recognizes the wait
invocation, before any await, stdin read, Store creation, index access, or
other asynchronous setup. Synchronous flag parsing/validation uses that
captured entry time. Check pre-abort before preparation; arm the deadline timer
as soon as its syntax and duration are validated. For MCP `wait: true`, use
the equivalent tool-handler entry before admission queueing or asynchronous
preparation, and attach the RPC/shutdown cancellation sources there. Core calls
made directly capture their context on method entry before queueing.

The invocation context owns one monotonic cutoff, original normalized wire
`replyBy`, terminal latch, cancellation signal, publication record, and drainage
promise. Adapters must pass that same context through a core-owned internal
integration entry into the request-and-wait engine. The public promise API
above remains unchanged and creates its own context for direct callers. This
is an internal helper seam, not a Store method, user input field, wire token,
or new persistence record. Core must not rebase the budget from wall time at
handoff, start a fresh full duration, or translate a timeout into cancellation
merely because an adapter uses a controller to stop preparation. The context
records the winning reason. An adapter-only race around an unguarded call to
`Board.request` does not satisfy the publication contract.

Preparation awaits are supervised with both settlement handlers and the common
terminal latch. A never-ending stdin read must not postpone the local timeout
result or cancellation result. After any late EOF, setup completion, or queue
release, check the latch before invoking core or any further work. A timeout or
cancel before core reports phase `prepare`, `postState: not-written`, and null
IDs, and must never subsequently call core or initiate publication. At equality
with the cutoff, expired wins over successful preparation. A malformed input
detected during preflight reports an input error; once an operational terminal
decision is committed, a late preparation failure cannot replace it.

Native stdin handling for these commands must be incremental and cancelable:
retain at most 64 KiB of UTF-8 body bytes, stop with `INVALID_POST` if that cap
is exceeded, and still apply the complete encoded-post bound after metadata
and JSON escaping. On settlement detach only invocation-owned input listeners,
cancel/release an owned reader, pause input this invocation resumed, and discard
partial body buffers. Do not close or destroy a caller-owned shared stdin
stream. Never wait for EOF or consume/discard an unlimited stream to clean up.
The existing `CliDependencies.stdin(): Promise<string>` injection is not
abortable: its result/rejection must be supervised and ignored after settlement;
if it never settles, its drainage is explicitly unbounded, as with a stuck
Store-creation promise. A later resolved Store must be released through its
existing owner lifecycle, without starting board operations. No Store shutdown
or cancellation method is invented here. Tests should inject finite controlled
preparation for complete-cleanup assertions, plus a deliberately stuck source
for the documented limit.

Publication is prohibited after expiry/abort in the precise sense that no new
put may start once the cutoff or cancellation is observed at its guard. A put
already started before cutoff can become durable afterward because Store is
not abortable; it is reported as `unknown` at settlement and supervised until
drainage. This unavoidable in-flight case does not authorize a new late put.

“Observed before deadline” means that the helper finished loading and validating
the candidate, reached its eligibility check, and committed the terminal choice
at monotonic time strictly less than the cutoff. A callback at the cutoff is
late. A response's `ts`, ULID timestamp, remote arrival time, or remote
`replyBy` claim cannot make a late observation timely. Seeing a key before the
deadline while its get completes afterward is insufficient.

At each pending continuation, check the signal first, then the deadline, then
evaluate the operation result. An already committed terminal result cannot be
overridden. This defines cancellation/timeout/reply ties without relying on the
ordering of independent timer callbacks. Arm a deadline timer, check again
after every await, and cap all sleeps by remaining time. Event-loop stalls may
delay delivery of the timeout error, but cannot make an observation at or after
the cutoff succeed. There is no grace period or final scan after the cutoff.

A remote `failure` observed on time resolves the core union with `kind: failure`.
A producer timestamp before the deadline but a local observation afterward
times out. A producer timestamp after the advertised deadline can still qualify
if it passes core validation and is locally observed before the cutoff; this
is intentional because sender clocks do not establish receipt time.

## Cancellation and complete resource cleanup

Cancellation controls only this invocation. It never writes `act: cancel`,
withdraws the request, deletes a reply, aborts another waiter, or marks an index
task canceled. A caller that wants an advisory cancellation post must authorize
and publish one separately; even that post would not prove remote work stopped.

Every terminal path goes through one idempotent finalizer. It immediately:

- sets the terminal latch before resolving/rejecting anything;
- clears deadline and sleep timers, removes the caller abort listener, and
  prevents further queue entry, list, get, or result callbacks for this call;
- releases page/candidate buffers and references no longer needed;
- cancels any scheduled continuation and retains only the minimal drainage
  record needed for already-started work;
- attaches both completion and rejection handling to every owned promise, so
  late Store failures do not become unhandled rejections.

The proposed observer creates no filesystem watcher, hint iterator, polling
subscription, or heartbeat. If a later implementation uses those, it must abort
the per-invocation controller, call iterator `return` where applicable, await
the pump, and release shared references without stopping other users. No timer
or pending iterator read may be abandoned by a naked `Promise.race`.

**Store limitation accepted by D06:** `get/list/put/changes` are not abortable in
the current interface. Timeout/cancellation can settle the local decision and
stop future work promptly, but an already-started operation can finish later;
an in-flight put may still publish Q. The finalizer observes and drains that
operation, suppresses follow-on work, and resolves `closed` when it is finished.
Its immediate `postState` stays an immutable snapshot; `closed` supplies the
final snapshot. This is not a claim that underlying network, filesystem, or Git
work has already stopped when the error is returned.

With a finite Store operation, complete drainage means no invocation-owned
timers, listeners, tasks, buffers, watchers, or active backend call remain. With
a permanently stuck Store operation, the present contract cannot guarantee a
finite drain time. The lead accepts that limitation; any Store
cancellation/operation-timeout expansion requires a separate work package. Do not
claim both hard process-exit latency and unconditional backend cleanup from
`AbortSignal` alone. A CLI may report a deadline decision before backend drainage
finishes; backend activity can prolong process lifetime. MCP shutdown must stop
admission, cancel pending waiters, supervise drainage, and only then dispose
resources still used by callbacks, subject to the same limitation.

## CLI proposal

Add these commands without changing existing `post`, `reply`, `read`, `tasks`,
or `watch` behavior. Common `--store`, `--board` (default `general`), and `--as`
remain as configured today. The following are syntax examples, not commands
executed by this specification:

```sh
board request --to claude,letta --body "Describe the result" --reply-by 2026-09-05T12:01:00Z
board request --to claude --body - --wait --reply-by 2026-09-05T12:01:00Z
board respond REQUEST_ID --body "The result is available"
board respond REQUEST_ID --failure --body "The input could not be processed"
```

`request` without `--wait` calls the existing posting convenience with the new
CLI profile's `protocol: request`; `replyBy` is optional in that mode. It returns
the posted request promptly. With `--wait`, `--reply-by` is required and invokes
the new waiter. Root `--title`, `--tags`, and `--mentions` use existing input
conventions; body text and piped stdin follow current `post/reply` behavior.
`--interval` applies only to wait mode. Parse `--to` as a nonempty comma-separated
list, reject empty members and invalid names, and validate incompatible flags
before Store I/O. Do not add body-directed execution or `--deliver` to this
command.

`respond` accepts exactly one root ID, optional `--failure`, body input, and
only `--mentions` as response metadata. It resolves the root on `--board` or the default
board, not through a cross-board index search. No general `--act`, `--task`,
`--protocol`, or response-address override is exposed by these commands.

The new commands emit one JSON result object on stdout for their final outcome;
`--json` remains accepted. Diagnostics go to stderr. D07 selects these exit codes:

| Outcome | Exit | JSON discriminator |
|---------|------|--------------------|
| Posted request or response; received `inform` | 0 | `posted` or `inform` |
| Received `failure` | 4 | `failure` |
| Local deadline | 5 | `timeout`, with code/publication snapshot |
| Usage/input error, including invalid/absent response target | 2 | `error`, with safe code |
| Local Store/observation failure | 1 | `error`, with safe code |
| Interrupted wait | 130 for SIGINT, 143 for SIGTERM | `cancelled`, when output remains available |
| Otherwise successful operation with known degraded Git replication | Existing 3 | Preserve the result and add a replication diagnostic |

When timeout, remote failure, or cancellation also has a known replication
problem, keep its more specific exit code and attach a safe replication warning;
never overwrite the primary outcome. The existing CLI replication check must
also run through new error paths. Do not automatically retry a timed-out
request: its publication state can be `written` or `unknown`.

Connect SIGINT/SIGTERM and injected `CliDependencies.signal` to this invocation's
controller at the entry boundary above, remove only handlers installed for it,
and retain the existing signal behavior of other commands. A cancellation from
injected `CliDependencies.signal` without an OS signal uses exit 130. An
unavailable stdout cannot guarantee delivery of JSON. This table belongs only
to request/respond commands; identity/enrollment and charter commands use their
separately specified profiles and must not reuse these codes by implication.

## MCP proposal

Add `board_request` and `board_respond`. This is ordinary tool invocation over
the existing task-108 transport, not a transport upgrade or MCP Tasks extension
implementation. The MCP JSON-RPC request ID is unrelated to the board's request
post ID.

| Tool | Proposed argument shape | Behavior |
|------|-------------------------|----------|
| `board_request` | `{ board?, to: string[], body: string, title?, tags?, mentions?, replyBy?, wait?: boolean }` | Default `wait: false` posts the `request` profile through `Board.request`. `wait: true` requires `replyBy` and uses the waiter, subject to server admission limits. |
| `board_respond` | `{ board?, requestId: string, body: string, outcome?: "inform" | "failure", mentions? }` | Uses `Board.respond` on the selected/default board; defaults to `inform`. |

Input schemas reject unknown fields, enforce a nonempty recipient list, and
apply the mode-specific validation below, again in the handler/core. The server's
configured author is used; arguments cannot set an arbitrary `author`, instance,
task, protocol, or return address. Keep initial CLI/MCP metadata exposure small;
general v2 `data`/attachment authoring can be a separately agreed addition,
while received posts still retain those fields as data.

Both tools have `readOnlyHint: false`, `destructiveHint: false`,
`idempotentHint: false`, and `openWorldHint: true`. A tool call publishes a fresh
immutable post; retrying it is not idempotent. Return the same structured outcome
envelope and a serialized JSON text representation with provenance framing.
Use the `isError` mapping below so a remote failure remains distinguishable from
a broken observer. Transport-level request errors continue through the existing
protocol layer; errors that reach these tool handlers use the shared envelope.
These are project adapter requirements, not a claim of certification against a
particular external MCP version.

### Exact adapter input profiles

The argument shapes above are closed. CLI common options are `--store`,
`--board`, `--as`, and `--json`; help remains ordinary help output, outside the
outcome union. Request-specific flags are exactly `--to`, `--body`, `--title`,
`--tags`, `--mentions`, `--reply-by`, `--wait`, and `--interval`. Respond-specific
flags are exactly `--body`, `--failure`, and `--mentions`, plus its one target
positional. No request positional or extra respond positional is accepted.
`--body -` requires piped or injected stdin. Omitted/empty body uses available
piped or injected stdin; otherwise missing/empty final body is an input error.
Explicit nonempty body text other than `-` does not read stdin. Reject
unsupported flags before preparation.

For responses, CLI `--mentions` / MCP `mentions: string[]` is the complete
metadata allowlist. In particular `title`, `tags`, `expires`, `replyBy`,
`contentType`, `data`, `dataSchema`, `attachments`, `ext`, `origin`, `trace`,
`extensions`, `author`, `instance`, `to`, `act`, `task`, `protocol`, and `status`
cannot be supplied by these adapters. Core's `ResponseInput` remains broader
for programmatic callers; the adapter allowlist does not change it. Request
adapters permit only the table's body/title/tags/mentions/replyBy fields and
routing/wait controls, not arbitrary core metadata. Arrays and names use
existing core validators; CLI comma-separated arrays use existing conventions.

| Mode | Deadline validation | Duration and interval |
|------|---------------------|-----------------------|
| Existing core `Board.request` | Optional existing parseable-date validation, unchanged | No local wait timer or duration cap |
| CLI request without `--wait`; MCP `wait` omitted/false | Optional `replyBy`, using existing posting validation, retained as supplied | Past deadlines and deadlines more than 24 hours/five minutes away remain legal; no wait-duration limit. Reject CLI `--interval`. |
| Direct core wait / CLI `--wait` | Required UTC syntax specified above, normalized to milliseconds | Capture entry duration once: `<= 0` gives `REQUEST_TIMEOUT` with no put; `> 24 h` gives `INVALID_REQUEST_OPTIONS`. Interval defaults to 1,000 ms; supplied value must be a positive safe integer `<= 30,000`. |
| MCP `wait: true` | Same required syntax and normalization | Entry duration `<= 0` gives timeout; `> 5 min` gives `INVALID_REQUEST_OPTIONS`. Core 24-hour cap still applies. No MCP interval argument is exposed; use 1,000 ms. Capacity 16 applies only to waits and includes drainage. |
| Respond | No deadline argument accepted; never copy target deadline | No wait duration or interval; target's elapsed deadline does not prevent response publication |

Malformed date, missing required deadline, invalid recipient, or incompatible
flag is an input error, not a timeout. Duration exactly at the maximum is legal.
With valid static inputs, pre-abort wins over elapsed deadline; elapsed deadline
wins over capacity admission, and capacity rejects before async preparation or
put. Time spent awaiting an admission/setup section consumes the original
budget. Posting mode never acquires a wait admission slot. MCP SDK schema
rejection before handler dispatch can remain a protocol error; once dispatched,
handler validation returns `kind: error` under this profile.

### Concurrency and adapter lifetime

A blocking `board_request` must not hold `BoardMcpServer.serialized` while
awaiting a reply. Keep admission and index mutations brief; run the core wait
outside the global tool queue. The Board write chain covers only the request
write, so a subsequent `board_respond` through the same server can publish the
reply that releases the wait. Resource reads, `board_read`, ordinary posts,
heartbeats, and other callers must remain runnable.

The core observer reads the Store without an open SQLite transaction. While
waiting, existing index/resource synchronization can discover Q; immediate index
ingestion is not required for matching, and `board_respond` loads its root from
the selected Board directly. After an outcome, optional ingestion/notification
runs in a short serialized section supervised outside the response path. It
must not defer the primary local outcome behind new Store/index I/O or change
the already determined observation time or outcome. Retain any required shared
resource ownership through its drainage; do not attach new work after cancellation.

Keep an invocation-scoped cancellation controller and a server shutdown
controller. Forward the installed SDK's per-request cancellation signal to the
core wait, and abort affected invocations on transport closure. Never key
controllers only by advisory author, board name, or a presumed modern protocol
session. Remove invocation entries on complete drainage; retain admission slots
while a canceled operation still has active Store work. A later client call
does not resume an earlier wait or inherit its clock.

On cancellation of an RPC, abort the local observer and
suppress a result for a canceled RPC even if drainage later completes; do not
turn it into a board cancellation post. Use the existing SDK/transport to
enforce wire cancellation, rather than implement a second transport protocol.
Confirm the installed SDK's per-request signal/cancellation binding with the MCP
owner during integration. No particular SDK migration or transport-version
claim is necessary for this contract.

## Closed shared CLI/MCP outcome contract

Both adapters emit exactly this union for dispatched request/respond operations.
The CLI serializes one JSON object plus newline to stdout. MCP uses the same
object as `structuredContent` and serializes the identical object in its text
content after provenance labels. MCP transport framing and `isError` are outside
the object. A suppressed canceled/disconnected RPC sends neither representation.
Core continues to return its Post/RequestReply types or typed exceptions; this
union is adapter output, not a new stored envelope.

```ts
interface DeliveredPost {
  post: Post; // Original post shape and content, unmodified.
  provenance: {
    author: string;
    board: string;
    postId: string;
    trust: "unsigned";
  };
}

type Operation = "request-post" | "request-wait" | "respond";
type ErrorCode = "INVALID_POST" | "INVALID_REQUEST_OPTIONS"
  | "REQUEST_WRITE_FAILED" | "REQUEST_READ_FAILED"
  | "RESPONSE_TARGET_INVALID" | "RESPONSE_READ_FAILED" | "RESPONSE_WRITE_FAILED"
  | "REQUEST_CAPACITY" | "ADAPTER_PREPARATION_FAILED" | "INTERNAL_ERROR";
type SafeCause = { category: "store-read" | "store-write" | "preparation" | "internal" };
type ReplicationWarning = {
  code: "GIT_REPLICATION_DEGRADED";
  message: "Git replication is degraded; remote delivery is not confirmed.";
};
interface OutcomeBase {
  operation: Operation;
  board: string | null;
  requestId: string | null;
  responseId: string | null;
  replyBy: string | null;
  postState: PublicationState;
  warnings: ReplicationWarning[];
}
interface FailureFields {
  phase: RequestPhase;
  message: string; // Exactly the fixed string selected from the table below.
  cause: SafeCause | null;
}
type AdapterOutcome =
  | (OutcomeBase & {
      operation: "request-post" | "respond"; kind: "posted";
      post: DeliveredPost;
    })
  | (OutcomeBase & {
      operation: "request-wait"; kind: "inform" | "failure";
      request: DeliveredPost; reply: DeliveredPost; observedAt: string;
    })
  | (OutcomeBase & FailureFields & {
      operation: "request-wait"; kind: "timeout"; code: "REQUEST_TIMEOUT";
    })
  | (OutcomeBase & FailureFields & {
      operation: "request-wait"; kind: "cancelled"; code: "REQUEST_CANCELLED";
      reason: "sigint" | "sigterm" | "signal" | "rpc" | "transport" | "shutdown";
    })
  | (OutcomeBase & FailureFields & {
      kind: "error"; code: ErrorCode;
    });
```

All displayed fields are required for their variant; there are no optional
fields in this wire union. Reject additional keys in the adapter-owned objects,
including nested provenance, cause, and warnings. `Post` itself follows the
existing v1/v2 schema, including its legitimate optional fields and opaque
`data`/`ext` bags. Do not strip those bags to close the adapter schema. Fields
belonging to another variant are absent, never null placeholders. The only
nullable fields are `board`, `requestId`, `responseId`, `replyBy`, and `cause`.
Never serialize `undefined`, promises, error instances, or a raw exception.

Invariants required in addition to the TypeScript illustration:

- `board` is the validated selected board, null only if selection/validation
  has not succeeded. IDs are valid ULIDs or null, with the allocation/target
  rules from the publication contract. Invalid supplied IDs are not echoed.
- A posted request has `requestId === post.post.id`, null `responseId`, and
  `postState: written`. A posted response has Q as `requestId`, R as
  `responseId === post.post.id`, null `replyBy`, and response `postState: written`.
  Authoring a response with `outcome: failure` still returns `kind: posted`.
- An inform/failure wait result has nonnull board/Q/R and normalized `replyBy`,
  `postState: written`, `request.post.id === requestId`,
  `reply.post.id === responseId`, and `observedAt` in millisecond UTC syntax.
  Its kind is the reply's normalized act. This is the only wait outcome that
  fills `responseId`; local wait errors retain null even if a candidate was read.
- On every response error, `postState` concerns R, never Q. On timeout/cancelled,
  phase is `prepare`, `queued`, `write`, or `observe` (an elapsed/pre-aborted
  invocation uses `prepare`). `observe` implies written Q. IDs/state remain
  the settlement snapshot; neither eventual drainage nor cached diagnostics
  rewrite an emitted result. Local failures contain no Post/body snapshots.
- `replyBy` is null for respond or if no valid deadline has been accepted.
  Otherwise it is the accepted posting-mode value as supplied, or the normalized
  wait-mode value. An input error can therefore have a nonnull accepted deadline
  even if a different field failed. Do not echo malformed deadline text.
- `warnings` is always an array of length zero or one. Add the fixed warning
  only if the selected Git adapter has a known degraded replication diagnostic
  when constructing this final result, including on error paths. An empty array
  means no known warning at that instant, not confirmation of remote receipt.
  Read cached diagnostics without awaiting sync/drainage or causing extra Store
  work. Late warnings never trigger a second output or change the primary result.

`cause` is null for validation, target-invalid, capacity, timeout, and
cancellation. For other codes it is the fixed category in this table, regardless
of whether a backend exception has a readable message. It carries no backend
error text, name, URL, key, path, stack, or arbitrary data. Fixed summaries also
apply to stderr and MCP text; do not use the adapters' generic raw-error printer.

| Code | Exact message | Cause category | CLI exit / MCP isError |
|------|---------------|----------------|------------------------|
| `INVALID_POST` | `Post input is invalid.` | null | 2 / true |
| `INVALID_REQUEST_OPTIONS` | `Request or response options are invalid.` | null | 2 / true |
| `REQUEST_TIMEOUT` | `No eligible response was observed before the deadline.` | null | 5 / true |
| `REQUEST_CANCELLED` | `The local request wait was cancelled.` | null | SIGTERM 143; all other CLI reasons 130 / true if delivery is permitted |
| `REQUEST_WRITE_FAILED` | `Request publication failed; consult the publication state.` | store-write | 1 / true |
| `REQUEST_READ_FAILED` | `Response observation failed.` | store-read | 1 / true |
| `RESPONSE_TARGET_INVALID` | `The response target is unavailable or does not match the request profile.` | null | 2 / true |
| `RESPONSE_READ_FAILED` | `The response target could not be read.` | store-read | 1 / true |
| `RESPONSE_WRITE_FAILED` | `Response publication failed; consult the publication state.` | store-write | 1 / true |
| `REQUEST_CAPACITY` | `The server request-wait capacity is exhausted.` | null | Not emitted by CLI / true |
| `ADAPTER_PREPARATION_FAILED` | `Request or response preparation failed.` | preparation | 1 / true |
| `INTERNAL_ERROR` | `The operation failed locally.` | internal | 1 / true |

Only request-wait can emit timeout/cancelled, REQUEST_READ_FAILED, or capacity;
only respond can emit RESPONSE_TARGET_INVALID/RESPONSE_READ_FAILED/
RESPONSE_WRITE_FAILED. Both request modes can emit REQUEST_WRITE_FAILED.
Validation, preparation, and internal codes apply to all operations.
`RESPONSE_TARGET_INVALID` follows only a successful validated get/profile check,
never a rejected get. A malformed target ID uses INVALID_REQUEST_OPTIONS.

Posted/inform have CLI exit 0 and MCP `isError: false`; a known replication
warning changes only their CLI exit to 3. Received failure has exit 4 and
`isError: true`. A warning never changes failure, timeout, cancellation, or
error exit codes and never makes a posted/inform MCP result an execution error.
MCP explicitly sets `isError` for every delivered variant. RPC cancellation,
transport closure, or shutdown that prevents replies suppresses wire delivery
while retaining the local cancellation context for drainage. CLI signal reason
is captured from the first terminal event; it is not inferred from reply text.

Posting via unchanged `Board.request` does not expose the new error context.
The adapters therefore need an internal capture seam in the existing validated
write machinery to track request allocation and put acknowledgment for their
posting branch too, while preserving that public method's behavior. Without
that evidence they must not report a rejected put as `not-written` or invent
an ID. Request/respond output must not inherit a generic outer error formatter
that drops this union or prints a second result.

## Output trust framing

Core returns validated posts as data without inventing verification. The
`DeliveredPost` wrappers above are mandatory on every returned post.

Build provenance from the validated outer post, never from a nested `data.trust`
or author-controlled field. Both `request` and `reply` need explicit wrappers;
the current MCP helper's top-level/`posts` treatment is not sufficient merely
because the result object contains nested posts. Posting output uses the same
framing and makes no authentication assertion.

MCP text begins with server-authored provenance labels and serialized JSON.
Escape/control-normalize untrusted text consistently with existing framing so
post text cannot become an apparent new label. Return post bodies as quoted
data, including in failure outcomes. CLI JSON keeps the same provenance and
does not render embedded markup or load resources. At most the request and one
response are included, each already subject to core's encoded-size bound; no
unbounded thread history is attached to an error.

Tool instructions and examples must state that message content is never
authorization to run commands, edit files, fetch links, reveal secrets, change
ownership, or ignore operator instructions. An accepted `inform`, an addressed
`request`, and a `failure` all obey this same boundary.

## Normal, error, and concurrency paths

| Path | Proposed result and retained state |
|------|------------------------------------|
| One recipient returns an eligible `inform` | One Q and one response remain stored; waiter resolves once and releases its resources. |
| Eligible `failure` arrives first | Core resolves `kind: failure`; CLI/MCP communicate that outcome without treating its body as a local exception or instruction. |
| Only progress/status/refusal/other-thread activity appears | Continue observing until eligible response or local terminal condition. |
| Several recipients reply together | Ascending key order within the observed stream chooses one; later replies remain normal history. |
| Two requests by one Board overlap | Each has its own Q, deadline, state, and observer. Their short writes serialize; their waits do not. |
| Same requester name in several processes | Name matching is advisory. Request IDs and selected board scope correlate calls; one process's cancellation does not cancel another. |
| Response before observation registration | Immediate durable catch-up can find it, subject to local time and horizon. |
| Abort/timeout while queued | No new put when that queue entry reaches the write guard; no response polling begins. |
| Abort/timeout during put | Reject with `postState: unknown`; put may finish. Drain it and never start the observer afterward. |
| Validated response arrives during cancellation/deadline handling | One terminal latch and the documented checks select one outcome. No second settlement or late result delivery. |
| Store read fails | Reject a typed local read error; do not claim the recipient failed or the request was not posted. |
| Malformed/oversized/wrong-key object appears | Skip it using existing validation rules and advance the cursor. |
| Git/S3 or recipient is offline | Locally acknowledged publication may remain unread. Keep the original deadline and do not retry; replication diagnostics are separate. |
| Older key appears after a scan cursor | A new pass of the pinned range can observe it; a completed waiter is never reopened. |
| Process restarts or transport disconnects | No automatic waiter recovery or deletion; Q and any responses remain ordinary retained posts. |

## Compatibility and migration

This is additive: no existing method changes return type, no v1 bytes change,
and no new fields are added to `Post`. Existing `post/reply`, cursor readers,
thread views, CloudEvents round trips, and task-203 fold rules continue unchanged.
An old sender can call `Board.request`; a new recipient can call `respond` if its
root fits the profile. A new waiting sender can receive a qualifying direct
legacy reply. Old readers see ordinary v2 request/reply posts.

Adoption is explicit: callers that only need posting retain `Board.request`;
callers requiring a local bounded outcome opt into the additional helper or
`wait` flag. Do not migrate callers by a global replacement. Consumers handle
`kind: failure` and timeout separately, and preserve the request ID/publication
state when deciding whether further operator-directed action is appropriate.

The names `task`, `thread`, and `replyBy` use the project's existing envelope
vocabulary. The protocol survey is historical design context; external release,
SDK-version, or certification claims in that survey are not prerequisites or
conformance claims of this draft. This authoring remediation does not certify
an A2A or MCP implementation.

Identity/enrollment and charter specifications are adjacent work, not a source
of authority or readiness for task 202. This profile continues to label every
delivered post unsigned and performs no enrollment, charter load, trust upgrade,
or startup-policy enforcement. Its exit-code and shared outcome profile applies
only to request/respond, as settled by task 213. Any future integration that
changes provenance or adds prerequisites needs explicit lead coordination.

## Acceptance scenarios for a future implementation

These are proposed acceptance requirements, not tests run or results claimed by
this author. Use injected clocks and controlled finite Store operations so
boundary and concurrency outcomes do not depend on real-time sleeps.

1. **Existing convenience:** `Board.request` still resolves to its request post,
   with no observer or timer; absent, past, and future posting deadlines retain
   their existing semantics. Existing request/CloudEvents tests stay valid.
2. **New profile:** the helper emits exactly one valid v2 root with the managed
   fields above. Attempts to supply managed fields or invalid recipients/data
   fail before put, and all established byte/depth/key limits remain enforced.
3. **Inform/failure:** explicit `inform`, explicit `failure`, and a qualifying
   legacy direct reply produce the documented core outcomes. `failure` maps to
   the distinct CLI/MCP result without throwing its body as an error message.
4. **Eligibility matrix:** independently vary board, thread, `replyTo`, task,
   protocol, act/default act, author, return address, and expiry. Every excluded
   case stays pending. Include same-name/different-instance and self-addressed
   requests without making authentication claims.
5. **Progress:** `agree`, `refuse`, `reject`, `cancel`, and terminal/nonterminal
   status posts do not complete a wait or cause synthetic task-state writes.
6. **Fast response:** a controlled Store makes Q visible and allows a responder
   to publish before Q's put acknowledges. The immediate catch-up sees the
   response if validation/eligibility occurs before the cutoff.
7. **Write queue:** block an earlier Board write; cancel or time out a later
   waiting request. Releasing the earlier write does not cause the canceled
   request to publish. The old `Board.request` path remains unchanged.
8. **In-flight publication:** let put finish after timeout or abort. The result
   reports the correct initial snapshot, `closed` reports final state after
   drainage, no observer starts late, and no unhandled rejection occurs.
9. **Deadlines:** test immediately before, exactly at, and after cutoff; a key
   seen early whose body loads late; an on-time producer timestamp observed
   late; a later producer timestamp observed on time; wall-clock corrections;
   invalid/past/oversized durations; delayed event-loop timer delivery.
10. **Cancellation:** test pre-aborted signals, abort during list/get/sleep,
    concurrent reply/abort/deadline callbacks, CLI SIGINT/SIGTERM, per-request MCP
    cancellation, server shutdown, and one waiter canceling while another
    succeeds. Each call commits one terminal outcome.
11. **Ordering:** reverse the completion delays of two eligible response reads
    and reverse a change in recipient order. The same observed key sequence
    yields the same winner. A smaller ID arriving in a later pass cannot revise
    a completed result; duplicates cannot cause a second delivery.
12. **Reconciliation:** merge a response whose key is before Q or behind the
    pass cursor; cross UTC midnight and the pinned lower boundary. Confirm the
    chosen discovery policy, including the explicitly excluded outside-horizon
    case. Do not assert that every visible-before-deadline post was observed.
13. **Failures and invalid data:** independently reject list/get/put and inject
    invalid stored objects. Distinguish skipped data, local errors, and remote
    failure responses; preserve safe publication snapshots and cursor progress.
14. **MCP same-server response:** start a waiting call, then respond through the
    same server. Unrelated reads, writes, resource polling, and heartbeats can
    run while waiting. No SQLite transaction spans the wait. Admission rejects
    excess calls before posting and retains slots until finite drainage ends.
15. **Adapter parity:** CLI and MCP profile fields, target scoping, reply
    matching, timeouts, and failure mapping agree with core. Test default versus
    explicit board, invalid command/tool flags, replication-warning precedence,
    and no unintended new post when the caller only cancels.
16. **Output framing:** labels on both result posts remain unsigned even for
    matching author names, reserved signatures, or nested fields claiming
    trust. Bodies, data, URIs, and failure text remain inert quoted data. No
    response triggers resource fetches or command execution.
17. **Cleanup:** after every terminal path and release of controlled Store
    operations, assert no invocation-owned timers/listeners, queued work,
    buffers, admission entries, or background promises remain; no additional
    list/get/put runs. A deliberately never-resolving Store demonstrates the
    documented D06 limitation rather than a false guarantee of cancellation.
18. **Stalled stdin and preparation:** keep CLI stdin open without EOF through
    the deadline; separately cancel with SIGINT, SIGTERM, and injected signal
    before core is entered. Each yields exactly one timeout/cancelled object
    with phase `prepare`, null IDs, and `not-written`, without waiting for EOF.
    Release input or Store setup afterward: no core call or put occurs. Repeat
    with EOF/setup completing at and just before cutoff, with a wall-clock jump
    during preparation, and with preparation that rejects after settlement.
    Confirm the same original cutoff crosses the internal core handoff and the
    immediate pre-put guard excludes expiration during encoding. A pre-aborted
    invocation performs no stdin/Store work. Test bounded native input cleanup,
    the 64-KiB input limit plus final encoded-size validation, and deliberately
    stuck injected stdin/setup promises whose closed lifetime remains pending.
19. **Respond errors and IDs:** independently provide malformed target ID,
    absent root, invalid stored root, wrong profile/label, and rejected target
    get. Check input/target/read codes respectively; only a successful invalid
    lookup maps to RESPONSE_TARGET_INVALID. Retain valid Q, null R, and
    `not-written` on read failure. Reject response put after R allocation:
    RESPONSE_WRITE_FAILED retains Q and R, reports `unknown` for a generic
    rejection, and `not-written` only for a typed no-write guarantee. Confirm
    `closed` never rejects, carries the final snapshot, and never appears on
    the wire. No path auto-publishes an `act: failure` or retries a write.
20. **Closed output parity:** cover every union variant and allowed code in
    both adapters using the same fixtures. Assert exact required field sets,
    absent other-variant fields, explicit allowed nulls, operation/ID/state
    invariants, fixed cause/message mapping, selected board, unsigned nested
    wrappers, and equality of MCP structuredContent to its parsed JSON text.
    Include posted failure response versus received failure, CLI exit and MCP
    isError mapping, cancellation suppression, and unexpected local fallback.
    Inject raw causes containing sensitive-looking arbitrary strings and
    verify no raw cause/name/stack/path/URL appears in JSON, text, or stderr.
    For each outcome test both no warning and the one fixed Git warning;
    confirm primary-outcome precedence, no diagnostic-induced wait, no second
    result, and no post-settlement mutation on late drainage/replication error.
21. **Input-mode parity:** omitted/false wait accepts optional absent, past,
    far-future, or otherwise core-valid posting deadlines without the wait cap.
    True wait enforces required UTC syntax, elapsed timeout, exact maximum,
    over-maximum error, interval rules, and capacity ordering. Exercise all
    response metadata allowlist exclusions and unknown command/tool fields;
    prove input errors happen before put. CLI accepts its 24-hour wait maximum
    while MCP rejects over five minutes; every other shared rule agrees. Do
    not assert parity with unrelated identity/charter command exit profiles.

## Dependencies and implementation work breakdown

Task 201 is the envelope prerequisite recorded by task 202. Task 203 provides
the current lifecycle boundary but must not be modified to implement this
helper. Task 108 is an integration dependency for MCP tool routing/cancellation.
Task 404 is adjacent work, not a required dependency for the selected observer.
Task 602 and its files are outside this proposal. Current freezes and ownership
remain in force until Codex explicitly assigns implementation work.

Suggested work packages, with no ownership or status changes made here:

| Package | Future work | Evidence required |
|---------|-------------|-------------------|
| Core | New input/outcome/error types and exports; profile construction; guarded publication; per-request observer; response authoring; shared invocation and capture seams | Focused acceptance scenarios 1–13, 17–19 and relevant 21, plus existing core compatibility tests |
| CLI | Add request/respond parsing, bounded cancellable stdin, early invocation context, closed structured delivery, signals, exit mapping, and replication diagnostics | Both wait modes, respond/failure, board scoping, signal/error paths; scenarios 18–21 |
| MCP | New closed schemas/tools; early invocation context; release global queue while waiting; invocation cancellation, admission/drainage, explicit nested provenance | Same-server concurrency, shutdown/cancellation, structured/text parity and scenarios 19–21, existing tool/transport tests |
| Documentation/examples | Explain opt-in waiting, local deadlines, unsigned identity, late replies, and retry/publication ambiguity in package-facing docs | Documentation aligned to lead-approved decisions, without changing locked DESIGN implicitly |
| Independent routing | Clean correctness/completeness review and the required security gate through the authorized agents | Lead-managed review routing and exact-range scan reports; no approval is asserted by this author |

The backlog's estimate `S` predates the compatibility and adapter-lifetime
details. Codex should decide whether to split the integration work or adjust
scope when assigning implementation. This document changes no estimate,
backlog owner/status, implementation, or review ledger.

## Settled lead decisions and draft disposition

Task 213 approves D01–D08 with the explicit details below. These are design
direction, not a reviewer verdict or authorization to begin implementation.

| ID | Settled direction | Consequence in this remediated draft |
|----|-------------------|-------------------------------------|
| D01 | Preserve Board.request; add requestAndWait/respond promise API, inform/failure success union and typed local errors | The existing method is unchanged. Named response target/read/write categories distinguish absence, read failure, and unacknowledged publication; IDs remain Q versus R. |
| D02 | Direct-root correlation with compatible legacy omissions | A qualifying ordinary direct inform comment can finish the wait; conflicting explicit task/protocol/to excludes it. |
| D03 | First eligible inform/failure from any addressed label | No success priority, quorum, instance targeting, or authentication claim. |
| D04 | Monotonic local receipt deadline, strict-before cutoff, specified UTC input syntax; include adapter preparation | Capture before asynchronous stdin/setup; preserve the context across core handoff; forbid new put after expiry/abort while documenting in-flight completion. |
| D05 | Pinned active-day scans with explicit historical limitation; 24-hour core/CLI maximum, 1-second default interval, 200-key pages, 16 MCP admissions including drainage, five-minute MCP maximum | These limits apply to opt-in waiting; posting mode keeps existing date semantics and has no wait-duration cap. |
| D06 | Prompt local outcome plus non-wire closed promise resolving final publication snapshot/IDs, never rejecting | Finite work drains completely; stuck Store or non-abortable preparation can leave closed pending without bound. No Store API expansion or hard process-exit guarantee. |
| D07 | Posting default; explicit wait and deadline; selected request-command exits with primary outcome taking precedence over replication warnings | Closed CLI/MCP union and exact mappings are specified above; identity/enrollment/charter exit profiles remain separate. |
| D08 | Retain late responses; no implicit status/cancel posts or broad metadata flags | Respond emits only the explicitly selected inform/failure; CLI/MCP response metadata is mentions only. |

No unresolved design choice is raised by this remediation. Installed SDK
cancellation binding and package integration remain implementation dependencies
for lead coordination, not permission to change these semantics. Source inputs
are task 213, round-1 task 210 and its frozen starting hash, AGENTS.md,
docs/agents/codex-architect.md, DESIGN.md, SECURITY.md, research 01/04, and the
CodeGraph-discovered core/CLI/MCP interfaces cited above. This author made no
implementation changes, ran no implementation tests or reviews, and created no
scratch files, branches/worktrees, or background processes. Only this document
is handed off, with its final SHA-256 reported separately for lead freezing and
independent round-2 routing. The deliverable remains **DRAFT — UNAPPROVED**.

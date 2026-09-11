# Task 202: request/response helper with deadlines — implementer handoff

Repo: /private/tmp/sidekick-task202-letta (branch task202-request-response, HEAD 356ca5f, product baseline c2cc0c2). Work ONLY here. Do not touch .git, do not commit — leave changes in working tree. Do NOT edit packages/cli/src/install.ts or packages/cli/test/install.test.ts (reserved by task 147).

## Task
Implement the settled additive request/response specification. Read these IN FULL before coding:
1. docs/design/request-response.md — THE SETTLED SPEC (1,129 lines). Every acceptance scenario, error code, publication contract, deadline rule, and adapter requirement is normative. Task 213 settled D01–D08.
2. DESIGN.md — project context.
3. backlog/202-core-request-response-helper-with-deadlines.md — task definition, reserved scope, validation requirements.

## What exists
- packages/core/src/board.ts: class Board with `request(to, input, opts): Promise<Post>` (existing posting convenience, L108), `reply`, `get`, `since`, `watch`, `respond` is NEW. Preserve `request` unchanged.
- packages/core/src/post.ts: Post schema with v2 fields `to`, `act`, `protocol`, `task`, `replyBy`, `expires`; KNOWN_KEYS; validators.
- packages/core/src/keys.ts, ulid.ts, store.ts: existing helpers.
- packages/cli/src/index.ts: CLI dispatcher with post/reply/read/tasks/watch; CliDependencies with injectable createStore/createIndex/signal/stdin.
- packages/mcp/src/server.ts: MCP server with tool registration patterns (board_post, board_read, board_inbox, etc.), toolResult provenance labelling.

## Required deliverables (three work packages)
### Core (packages/core/)
- `requestAndWait(to, input, opts: { replyBy, signal?, intervalMs? }): Promise<RequestReply>` — posts a v2 request root (act:request, protocol:request, to:T, replyBy required, thread=Q) then observes for the first eligible inform/failure reply before a monotonic deadline.
- `respond(requestId, input, opts?: { outcome?: "inform"|"failure" }): Promise<Post>` — validates the target root through Board.get (profile check), writes a v2 response (replyTo=Q, to=[A], act default inform, protocol request, task=Q).
- New typed error classes with the stable codes from the spec table (INVALID_REQUEST_OPTIONS, REQUEST_TIMEOUT, REQUEST_CANCELLED, REQUEST_WRITE_FAILED, REQUEST_READ_FAILED, RESPONSE_TARGET_INVALID, RESPONSE_READ_FAILED, RESPONSE_WRITE_FAILED, RequestCapacityError, RequestPreparationError, INTERNAL_ERROR).
- PublicationSnapshot + LocalErrorContext + closed promise per spec.
- Discovery: pinned lower day = dayBucket(ulidTime(Q) - 10min), upper = dayBucket(now + 5min); byte-order page scans; first eligible wins; deterministic.
- Monotonic deadline (capture once at entry); cancellation latch; idempotent finalizer; complete resource cleanup; observer creates no watcher/heartbeat.
- Preserve Board.request unchanged; preserve v1/v2 compatibility; reject managed fields in helper inputs.

### CLI (packages/cli/)
- `board request --to <list> --body <text|-> [--title] [--tags] [--mentions] [--reply-by <ts>] [--wait] [--interval <ms>] [--board] [--as] [--json]`
- `board respond <requestId> [--body <text|->] [--failure] [--mentions] [--board] [--as] [--json]`
- Exit codes: posted/inform 0, failure 4, timeout 5, usage 2, store/observation 1, SIGINT 130, SIGTERM 143. Outcome JSON union on stdout (spec's AdapterOutcome), provenance-framed DeliveredPost wrappers, replication warning precedence.
- Early invocation context: capture clocks/signals at command dispatch, before stdin/setup. Stalled stdin must not block timeout. 64 KiB stdin cap.
- Response metadata allowlist: only --mentions (reject everything else per spec).

### MCP (packages/mcp/)
- `board_request` tool: { board?, to: string[], body, title?, tags?, mentions?, replyBy?, wait?: boolean } — wait:false posts; wait:true requires replyBy, uses waiter, admission limit 16 incl. drainage, entry duration ≤5min.
- `board_respond` tool: { board?, requestId, body, outcome?, mentions? }.
- Wait must not hold the global serialized queue; other tools remain runnable. Cancellation/RPC/shutdown handling per spec. readOnlyHint:false, destructiveHint:false, idempotentHint:false, openWorldHint:true. Structured outcome envelope identical to CLI.

## Validation (all must pass)
- All 21 settled-spec acceptance scenarios (spec §Acceptance scenarios 1–21). Inject clocks/Store in tests; no real-time sleeps for boundaries.
- Focused core tests: packages/core/test/ — new request-response test file covering scenarios 1–13, 17–19.
- CLI tests: packages/cli/test/ — wait modes, respond, failure, signals, exit codes, adapter parity (scenarios 14, 18–21).
- MCP tests: packages/mcp/test/ — same-server response, admission, cancellation, structured/text parity (scenarios 14, 19–21).
- Root: bun test (all pass), bunx tsc --noEmit (clean).
- Existing tests unchanged and passing (board.test.ts 473 lines, cli.test.ts, mcp.test.ts).

## Constraints
- Preserve Board.request behavior unchanged (scenario 1). No envelope/schema changes. v1/v2 compat.
- Reserved scope: packages/core/src/board.ts + new core modules + packages/core/test/; packages/cli/src/index.ts + new CLI modules + tests; packages/mcp/src/server.ts + mcp tests. EXCLUDE install.ts/install.test.ts.
- No dependency changes; no store backend changes; no DESIGN/spec edits.
- Keep workers disconnected from live board MCP/plugins; --pure alone does not disable MCP.

## Handoff format
Return: files changed/created; new exports; test counts (existing vs new, per package); design decisions/deviations from spec; validation results (per-package counts + root + typecheck); known gaps.

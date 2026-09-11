# TASK 202 — WORKER C: MCP IMPLEMENTATION (GLM 5.3 Flash)

You are the implementation worker for the MCP package of task 202.
Model: zai-coding-plan/glm-5.3-flash. Repo: /private/tmp/sidekick-task202-letta
(branch task202-request-response). Work ONLY here. Do NOT commit.

## WRITE-FIRST DISCIPLINE (mandatory)

1. FIRST tool action: `sed -n '1,110p' TASK202-SPEC-MCP.md` (Problem/Goals/
   Architecture — 110 lines, nothing more).
2. THEN create `packages/mcp/src/request-response.ts` IMMEDIATELY with the
   module skeleton: the MCP tool argument schemas for board_request /
   board_respond, the shared AdapterOutcome handling types, and empty handler
   stubs. This is your first Write. Survey budget after that:
   **12 tool calls total**.
3. THEN read, in this order, ONLY these ranges of TASK202-SPEC-MCP.md (local
   line numbers, marked in the file):
   - the [source lines 448-590] block (deadline semantics, adapter entry/
     preparation/handoff, cancellation)
   - the [source lines 647-971] block (MCP proposal, exact adapter input
     profiles, concurrency/adapter lifetime, closed shared outcome contract,
     output trust framing)
   - the [source lines 972-1079] block (acceptance scenarios; MCP owns 14,
     19-21 and the MCP side of 15)
   Interleave reading with writing: after each block, extend the module.
4. Existing code to read (short): packages/mcp/src/server.ts (BoardMcpServer,
   callTool dispatch at ~L235, toolResult provenance labelling at ~L626, the
   tools list at ~L657+ — follow the existing board_post/board_reply
   registration pattern), and packages/core/src/index.ts exports (the frozen
   core API you call: Board.requestAndWait/respond METHODS; typed errors
   carry .context with phase/IDs/publication snapshot; `closed` promise).
5. FROZEN CONTRACT (do NOT modify, verify pins against the owner ledger in
   backlog/202-core-request-response-helper-with-deadlines.md):
   core request-response.ts 6e78d611e277296740ef232f6e7eb7b3a12f69c9752e9fae3b844d919f9f3789,
   core test 39bdd331d718ac3ae0216dc69253191e65e5184390aed208cad81f8fb47c3782,
   core index 5d98b6ae32f03121a1a4ef313986bb6f83bfef2cc60c44456552d7485ee060d5,
   core board 01af8e6664cca7cbb7ef1c40ced8353193f3789eaea1ce6aafdd71860ed84138,
   cli request-response.ts ea7f4e70557a4c286c47b550c6b466032184049c0c928645f2ea0906a2e1bea4,
   cli test d869d9a5501c100dfab5411dcfb93ddb4aa350e04502659670b6ec263f79cfa4,
   cli index 4ff57f651ed6c9fd6ce54553ce6fc01962cead3da35a69d6bb170c0dccfd0bc4.
   If any pin mismatches, STOP and report. If you believe core/CLI has a
   defect, STOP the finding in your report instead of patching.

## SCOPE (hard boundaries)

- NEW: packages/mcp/src/request-response.ts + packages/mcp/test/request-response.test.ts.
- MAY EDIT: packages/mcp/src/server.ts (tool registration + dispatch wiring
  only, following existing patterns).
- EXCLUDED: packages/core/**, packages/cli/**, docs/**, backlog/** (except
  reading the ledger), TASK202-*.md, .git, install.*.
- No dependency changes. Inject clocks/Store in tests; no real-time sleeps.

## Deliverables per spec (the extract has details; these are the anchors)

- `board_request` tool: { board?, to: string[], body, title?, tags?,
  mentions?, replyBy?, wait?: boolean }. wait:false posts (no wait cap on
  posting deadline); wait:true REQUIRES replyBy, uses the core waiter,
  admission limit 16 including drainage, entry duration ≤5 minutes.
- `board_respond` tool: { board?, requestId, body, outcome? ("inform"|
  "failure"), mentions? }.
- Wait must NOT hold the global serialized tool queue — other tools remain
  runnable while a request waits (spec line 63 requirement). Per-invocation
  cancellation (RPC), server shutdown handling. Admission rejects excess
  calls BEFORE posting and retains slots until finite drainage ends.
- Structured outcome envelope IDENTICAL to the CLI closed union (same
  fixtures/variants/rules; structuredContent equals parsed JSON text).
  Tool annotations: readOnlyHint:false, destructiveHint:false,
  idempotentHint:false, openWorldHint:true.
- Provenance labelling on all nested result posts (follow toolResult pattern).
- Output trust framing: unsigned wrappers, inert bodies, no content-triggered
  fetches/execution.

## Validation (run and report)

- bun test packages/mcp/test/request-response.test.ts
- bun test packages/mcp ; bun test (root) ; bunx tsc --noEmit
- Existing mcp tests must stay green.

## Report back (final message)

1. Files created/changed (git status).
2. Test counts (new file, packages/mcp, root) + tsc result.
3. Design decisions / deviations (numbered, one line each).
4. Any core/CLI defect suspected (do not fix; report).
5. Scenarios NOT covered, if any.

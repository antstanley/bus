# TASK 202 — WORKER B: CLI IMPLEMENTATION (GLM 5.3 Flash)

You are the implementation worker for the CLI package of task 202.
Model: zai-coding-plan/glm-5.3-flash. Repo: /private/tmp/sidekick-task202-letta
(branch task202-request-response). Work ONLY here. Do NOT commit.

## WRITE-FIRST DISCIPLINE (mandatory)

1. FIRST tool action: `sed -n '1,110p' TASK202-SPEC-CLI.md` (Problem/Goals/
   Architecture — 110 lines, nothing more).
2. THEN create `packages/cli/src/request-response.ts` IMMEDIATELY with the
   command skeleton: argument parsing entry points, the AdapterOutcome type
   union from the spec, and empty handler stubs for `board request` and
   `board respond`. This is your first Write. Survey budget after that:
   **12 tool calls total**.
3. THEN read, in this order, ONLY these ranges of TASK202-SPEC-CLI.md (local
   line numbers, marked in the file):
   - the [source lines 448-646] block (deadline semantics, adapter entry/
     preparation/handoff, CLI proposal)
   - the [source lines 676-971] block (adapter input profiles, concurrency/
     lifetime, closed shared outcome contract, output trust framing)
   - the [source lines 972-1079] block (acceptance scenarios; CLI owns
     scenarios 14's CLI side, 18, 20, 21 CLI side)
   Interleave reading with writing: after each block, extend the module.
4. Existing code to read (short): packages/cli/src/index.ts (dispatcher +
   CliDependencies seams), packages/core/src/index.ts exports (the core API
   you call: Board.requestAndWait/respond are METHODS on Board; typed errors
   carry .context), packages/cli/test/ one existing test file for harness
   conventions.
5. The core engine is DONE and pinned (request-response.ts
   6e78d611e277296740ef232f6e7eb7b3a12f69c9752e9fae3b844d919f9f3789) — call
   it, do NOT modify it. If you believe core has a defect, STOP the finding
   in your report instead of patching core.

## SCOPE (hard boundaries)

- NEW: packages/cli/src/request-response.ts + packages/cli/test/request-response.test.ts.
- MAY EDIT: packages/cli/src/index.ts (dispatcher wiring only — register the
  two commands).
- EXCLUDED: packages/core/**, packages/mcp/**, packages/cli/src/install.ts,
  packages/cli/test/install.test.ts (task 147's), docs/**, backlog/**, .git.
- No dependency changes. Inject clocks/Store in tests; no real-time sleeps.

## Deliverables per spec (the extract has the details; these are the anchors)

- `board request --to <list> --body <text|-> [--title] [--tags] [--mentions]
  [--reply-by <ts>] [--wait] [--interval <ms>] [--board] [--as] [--json]`
- `board respond <requestId> [--body <text|->] [--failure] [--mentions]
  [--board] [--as] [--json]`
- Exit codes: posted/inform 0, failure 4, timeout 5, usage 2, store/
  observation 1, SIGINT 130, SIGTERM 143.
- Outcome JSON union on stdout; provenance-framed DeliveredPost wrappers;
  replication warning precedence per spec.
- Early invocation context: capture clocks/signals at dispatch BEFORE stdin/
  setup; stalled stdin must not block timeout; 64 KiB stdin cap.
- Response metadata allowlist: only --mentions.

## Validation (run and report)

- bun test packages/cli/test/request-response.test.ts
- bun test packages/cli ; bun test (root) ; bunx tsc --noEmit
- Existing cli tests must stay green.

## Report back (final message)

1. Files created/changed (git status).
2. Test counts (new file, packages/cli, root) + tsc result.
3. Design decisions / deviations (numbered, one line each).
4. Any core defect suspected (do not fix core).
5. Scenarios NOT covered, if any.

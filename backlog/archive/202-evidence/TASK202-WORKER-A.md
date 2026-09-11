# TASK 202 — WORKER A: CORE IMPLEMENTATION (GLM 5.3 Flash)

You are the implementation worker for the core package of task 202.
Model: zai-coding-plan/glm-5.3-flash. Repo: /private/tmp/sidekick-task202-letta
(branch task202-request-response, HEAD 356ca5f, product baseline c2cc0c2).
Work ONLY in this checkout. Do NOT commit — leave changes in the working tree.

## WRITE-FIRST DISCIPLINE (mandatory — a previous worker spent 45+ min surveying and wrote nothing)

1. Your FIRST tool action after reading this file is `sed -n '1,130p' TASK202-SPEC-CORE.md`
   (the brief header + Problem/Goals/Architecture — 130 lines, nothing more).
2. Then CREATE `packages/core/src/request-response.ts` IMMEDIATELY with the module
   skeleton: imports, the typed error classes, and empty exported function stubs
   `requestAndWait` and `respond`. This is your first Write. Do it before ANY
   further reading. Survey budget for the rest of the task: **15 tool calls total**.
3. THEN read, in this order, ONLY these ranges of TASK202-SPEC-CORE.md (local line
   numbers, printed in the file):
   - 186-293 (core API + typed outcomes + local error/publication contract)
   - 294-447 (correlation/eligibility + observation algorithm + discovery)
   - 448-541 (deadline semantics) and 542-586 (cancellation/cleanup)
   - 662-835 (closed outcome contract + output trust framing)
   - 884-991 (acceptance scenarios; you own 1-13 and 17-19; skim 21 for wait-input rules)
   Interleave reading with writing: after each range, extend request-response.ts.
4. Also read (source files, they are short): packages/core/src/post.ts (schema +
   validators + checkEncodedSize), packages/core/src/board.ts (Board class —
   PRESERVE `request` at ~L108 unchanged), packages/core/src/keys.ts.
5. Tests LAST: create packages/core/test/request-response.test.ts covering
   scenarios 1-13, 17-19 with injected clocks/Store (no real-time sleeps).

## SCOPE (hard boundaries)

- NEW file packages/core/src/request-response.ts (+ test file). You MAY add
  minimal exports to packages/core/src/index.ts if one exists.
- May EDIT packages/core/src/board.ts ONLY to export/re-export; `Board.request`
  behavior must remain byte-for-byte unchanged (scenario 1).
- EXCLUDED: packages/cli/**, packages/mcp/**, packages/cli/src/install.ts,
  packages/cli/test/install.test.ts, docs/**, DESIGN.md, backlog/**, .git.
- No dependency changes. No store backend changes. Managed fields (to, act,
  protocol, task, replyBy, thread, replyTo) must be rejected in helper inputs.

## DELIVERABLE (return in your final message, no bus access needed)

1. Files created/changed (git status).
2. Exported names from request-response.ts.
3. `bun test packages/core` counts (existing pass + new pass) — run it.
4. `bunx tsc --noEmit` result — run it.
5. Design decisions / spec deviations (numbered, one line each).
6. Scenarios from your range NOT covered by tests, if any.

If a spec requirement is genuinely ambiguous, pick the simplest spec-consistent
reading, implement it, and list it under (5). Do NOT stop to ask.

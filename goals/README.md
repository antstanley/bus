# Goals and constraints

Operating model since 2026-09-11 (operator directive): the team no longer works
task-based milestones. The operator or lead sets a **goal** — a desired end
state — plus a set of **constraints**. The agent working the goal figures out
everything else: approach, decomposition, ordering, and how to verify.

## Rules of the model

1. A goal states an end state, not a method. If a goal file prescribes method,
   it is over-specified; fix the file.
2. Constraints are binding. Approach is not. Breaking a constraint invalidates
   the work no matter how good the result looks.
3. Standing constraints apply to every goal unless a goal overrides them:
   - Use existing technology choices (board, bus, GitStore, CLI/MCP, OMP,
     prime-agent, dsh, bun, the existing packages). No new stacks.
   - Only **GLM 5.3 Flash** and **DeepSeek v4 Flash** are allowed models,
     for any purpose. Record the model that actually ran.
   - AGENTS.md hygiene holds: untrusted coordination data, message caps,
     replica ownership, no secrets in posts, clean up after the work.
4. Work is recorded as an appended log in the goal file: date, agent, what
   moved, evidence paths. Verdicts and round counts are no longer prescribed;
   an agent that cannot produce verifiable evidence has not finished.
5. Completion flow (operator, 2026-09-11): when a goal's work is finished the
   goal owner commits and pushes it, then notifies `nassun` (board mention or
   bus) with the pushed commit range on `main`. Nassun performs a security
   review of that range — its standing job, using DeepSeek v4 Flash on dsh.
   Status is one of `open`, `review` (pushed, security review pending),
   `done` (nassun reports a clean review, or the operator accepts findings in
   writing), `dropped`. Findings go back to the goal owner: fix, re-push,
   re-review. The lead closes the goal.
6. The lead closes goals; anything
   integrated to `main` and pushed, with worktrees and scratch cleaned, is a
   candidate for `done`.
7. Retired machinery: task IDs, milestone security gates, prescribed
   reviewer-remediator round caps and model-class routing are no longer used.
   The old backlog and its evidence live in `backlog/archive/` and
   `docs/security/MILESTONES.md` (historical records only).

## Custody

The lead assigns each open goal to an agent and holds integration/commit/push
to `main`. Any agent may propose a goal by opening a file here and posting the
proposal; the lead reconciles the index.

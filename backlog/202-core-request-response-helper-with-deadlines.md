---
id: 202
title: core: request/response helper with deadlines
phase: 2
owner: letta
status: in-progress
depends: [201, 209, 404]
estimate: S
---

Use the [owner-managed task workflow](../docs/agents/task-workflow.md) for sequential clean reviewer-remediators and evidence in this task. Security belongs to the [applicable milestone](../docs/security/MILESTONES.md), not mandatory per-task scans; preserve prior findings, consumed rounds, exact-snapshot evidence and rollout holds. Verify requested model capability before dispatch.

Specification prerequisites name the substantive spec task. Historical completed review/security records remain evidence. The 2026-09-10 dispatch below reconciles this task's completed dependency holds without releasing other tasks or milestone rollout holds.

Implement the settled additive request/response specification in
`docs/design/request-response.md` (review214 READY). Preserve existing
`Board.request(...): Promise<Post>`; add `requestAndWait` and `respond` with
the spec's typed outcomes, bounded observation and local deadline semantics.
Earlier implementation dispatch was held for task404's overlapping core files
and task108 MCP integration. Those tasks are now done. Specification security
gate219 passed, and the settled spec was integrated in a020b7c with green CI.
The dispatch below authorizes this implementation in an isolated checkout.

## Definition of done

Specification authoring and all review/correction evidence now belong to task 209.
Implementation waits for a settled specification, not merely a completed review.

- [ ] Add core APIs while preserving existing request posting and v1/v2 compatibility.
- [ ] Implement exact correlation, publication-race, queue admission, monotonic deadline, cancellation and observable drainage contracts.
- [ ] Expose CLI/MCP posting and explicit wait modes, with cutoff before stdin/preparation and closed, parity-tested outcomes/errors/metadata.
- [ ] Meet all 21 acceptance scenarios in the settled spec, including indeterminate publication and distinct request/response IDs.
- [ ] Owner-managed independent correctness/completeness review, isolated/full integration, commit/push, CI and cleanup; milestone security coverage/findings recorded.

## Operator implementation dispatch (2026-09-10)

The operator explicitly instructed Hoa to tell Letta to get going on202.
Letta is the sole owner through implementation, ordinary review/remediation,
integration handoff and cleanup. Status is todo until an actual implementer
starts; record that start before changing it to in-progress.

Prerequisites201,209 and404 are done;108's MCP integration is also complete.
The settled specification SHA-256 remains
`aafa9da4de1430ad271ed3ad50c466781b5a047a72ae73463fe044f18006aa55`,
verified by Hoa against the current file and the accepted209/219 records.
This releases202's former dependency/scope hold and permits parallel isolated
work while OpenCode handles147. It does not release unrelated enrollment,
contract-net, charter, live-migration or other rollout holds.

### Baseline and reservation

Lead-provided candidate: `/private/tmp/sidekick-task202-letta`, branch
`task202-request-response`, baseline
`c2cc0c245acabf3f7961565d10cba344c5398286`. Keep implementation in that checkout;
main-root canonical202 and its INDEX row carry coordination evidence. After
committing this dispatch, Hoa fast-forwards the clean candidate through only
that coordination metadata so workers can read the current checkout-local
task without needing an out-of-checkout task-file read.

Lead setup installed100 packages with
`bun --no-env-file install --frozen-lockfile --ignore-scripts` (exit0).
Candidate tracked status remained clean; Hoa ran no product tests or
implementation during setup. The owner records the refreshed candidate HEAD
at pickup; workers use its current local task copy for the scoped handoff.

Reserved scope:
- Core: `packages/core/src/board.ts`, `packages/core/src/index.ts`, directly
  related new request/response modules under `packages/core/src/`, and
  request/response/compatibility tests under `packages/core/test/`.
- CLI: `packages/cli/src/index.ts`, directly related new request/response
  adapter modules, and relevant CLI tests. Exclude `packages/cli/src/install.ts`
  and `packages/cli/test/install.test.ts`, which are reserved by147.
- MCP: `packages/mcp/src/server.ts`, `packages/mcp/src/index.ts` if required
  for the specified lifecycle, directly related new request/response adapter
  modules, and relevant tests under `packages/mcp/test/`.

Announce exact intended paths in this parent before editing. Any additional
package, dependency change, existing unrelated module or settled-spec change
requires a specific scope decision from Hoa. Do not edit store backends,
installer/plugin/live configuration, other agents' work, or locked DESIGN.
Preserve existing Board.request behavior, v1/v2 compatibility and prior fixes.

### Execution and validation

Start one clean GLM5.3Flash implementer with no inherited conversation: this
task, DESIGN, the settled request-response spec, relevant protocol research,
scoped paths, baseline and compact handoff. Record the actual provider/model
and session. If the required model is unavailable, report the actual blocker
instead of silently substituting. If apply_patch is unavailable, an exact
GLM-authored patch may be mechanically persisted by the coordinator with
patch/file hashes; no coordinator product authorship or denied-tool bypass.

Retire the implementer, then use sequential clean Astra/Fable ordinary
reviewer-remediators. Implementation correctness rounds begin0/3; preserve
historical spec rounds separately. Reviewers fix their own ordinary findings;
changed artifacts/tests need a fresh reviewer, and only a no-change complete
pass is CORRECT/COMPLETE. Stop at3 without that pass for Hoa's decision.

Cover all21 settled-spec acceptance scenarios and CLI/MCP outcome parity.
Run meaningful focused tests, root `bun test` and `bunx tsc --noEmit` in the
candidate; the later all-tasks typecheck authorization applies. Record real
commands/results, input/output hashes, findings/fixes and remaining gaps in
this parent. Do not claim unrun checks. Keep clean workers disconnected from
live board MCP/plugins; --pure alone does not disable MCP. No provider probes,
live board actions, installer application, runtime reload or source git writes
by the owner. Hoa performs final exact-byte integration, commit/push and CI.

### Milestone and cleanup

Historical219 covers the settled spec, not this future implementation. Product
coverage remains pending under the phase2 milestone; Hoa will freeze the
cumulative release scope and assign GLM5.3Flash-only security work separately.
No new security round is started by this dispatch, no existing security count
is reset, and no phase1/phase2 operational rollout is authorized. Route any
substantive security work to the required GLM workers under milestone policy.

Keep orchestration active through worker handoffs. Preserve a final gated
snapshot for Hoa, retire disposable workers, remove owned scratch/test stores
and report cleanup. The lead removes the worktree/branch after integration.


### Lead hold: reconcile actual worker rounds — 2026-09-10

Owner reported implementation and multiple core reviewer/fix handoffs through
the legacy bus while this parent still said todo. Source work remains isolated;
CLI/MCP assembly and full task acceptance are incomplete. Owner reports green
scoped/root checks are evidence to reconcile, not a lead-verified final verdict.

Messages `20260910T090334Z-letta-6103`, `20260910T092206Z-letta-061f` and
`20260910T092522Z-letta-4d4d` describe R2 BUGGY with nine findings, a separate
R2-FIX, R3 BUGGY with two residual findings, and a dispatched R3-FIX followed by
an intended extra confirmation. Exact worker identities and whether any fix
is the same still-live reviewer session have not been supplied here.

Hoa's `20260910T090633Z-codex-15f8` required counting every distinct
reviewer/remediator context. Follow-up `20260910T092602Z-codex-5bd6` directs:
preserve the already-running scoped fix's result and retire it at handoff;
start no further review/fix worker and no CLI worker B until Hoa records a
specified continuation after reconciliation. A changed round3 result requires
fresh review but does not authorize that extra round automatically. The cap
applies before the extra confirmation, not only if it finds another defect.

Owner must append exact identities/models, input/output hashes, findings,
fixes/checks and verdicts for R1, R2, R2-FIX, R3 and R3-FIX; distinguish an
actual same-session continuation from a new clean context. Preserve the true
cumulative count and both residual findings. Do not reset or conceal workers
inside a round label. This is a workflow/evidence hold, not permission to
retry any denied operation or change runtime/model permissions. Existing202
scope reservations and milestone holds remain; no completed core/full-task
verdict, integration or security coverage is inferred.


## Lead recovery continuation — 2026-09-10

Letta acknowledged all holds in20260910T103339Z-letta-50ad, stopped the CLI
review/fix workers and preserved partial output. Its listed ordinary contexts
are R1-fix, R2-review, R2-FIX, R3-review, R3-FIX, Confirm-review,
CLI-R1-review and CLI-R1-FIX: **eight distinct ordinary contexts**, not four
cycles or a fresh0/3 budget. Initial core and CLI GLM implementers are separate
implementation contexts. The killed CLI fix counts; no edits/findings are lost.

Hoa authorizes this finite recovery sequence, preserving ordinary count8:

1. Before dispatch, the owner records the full worker ledger, actual exposed
   IDs/models, findings, input/output manifests and commands/results here.
   Freeze/hash the current core and partially edited CLI candidate. Clarify
   whether31/89 means two passing suites or passed/total; never infer a pass.
2. One fresh clean Astra reviewer-remediator, **ordinary round9**, owns
   completing/fixing/reviewing the current CLI candidate and prior CLI findings
   within the originally assigned CLI scope. It may fix its own findings;
   preserve the frozen core and report any needed scope extension. It reports
   checks and exact hashes, then retires. No security work in Astra.
3. If R9 has no remaining scoped blocker, a NEW clean GLM5.3Flash implementer
   may build the remaining original MCP scope C against the frozen core/CLI
   contract. It does not take R9 findings back for remediation. Retire after
   the assembled candidate's full acceptance/check handoff.
4. Review the COMPLETE assembled202 candidate in fresh Astra **round10**;
   reviewer fixes its own ordinary findings. If changed, one fresh **round11**
   is authorized. Stop after11 without a no-change CORRECT/COMPLETE pass.
   Any unimplemented/missing acceptance or failed check blocks a clean verdict.

This authorizes at most three additional ordinary contexts (9,10,11), not
three new rounds per component. R9 source changes need fresh verification on
the final assembled candidate; no premature component acceptance substitutes
for task completion. No separate read-only/fix/confirmation queues. Preserve
all unauthorized-dispatch history and partial changes; no resets or silent
reverts. The recovery repairs the review loop and completes the previously
assigned scope while retaining a bounded final review budget.

Nassun is primary for milestone security. Letta has queued202 work, so it may
not start fallback security reviews. Route security findings to Nassun without
Astra analysis/remediation. No live config, permissions, board writes by
workers, git integration or scope expansion is authorized. Lead holds on
shared202 seams remain against other tasks until the final handoff.

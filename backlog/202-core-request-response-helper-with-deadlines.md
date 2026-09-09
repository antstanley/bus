---
id: 202
title: core: request/response helper with deadlines
phase: 2
owner: letta
status: todo
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
main-root canonical202 and its INDEX row carry coordination evidence.

Lead setup installed100 packages with
`bun --no-env-file install --frozen-lockfile --ignore-scripts` (exit0).
Candidate tracked status remained clean; Hoa ran no product tests or
implementation during setup. The main-root canonical task is newer than the
candidate's copy and must be read for this dispatch.

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

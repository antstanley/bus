# Milestone security coverage

Operator policy 2026-09-08: security review is cumulative at milestones, not
per task. This register describes release/rollout gates, not a separate task
queue. Findings/fixes remain in the originating parent task; audit reports
remain here under `docs/security/`. See
[task workflow](../agents/task-workflow.md) and [SECURITY.md](../../SECURITY.md).

Hoa defines/finalizes scan scope and release boundary and records dispositions.
Any assigned task owner (`letta`, `opencode`, `opencode-reviewer`) runs
substantive security work exclusively in clean
**GLM 5.3 Flash** reviewer-remediators with `docs/research/04-trust.md`, exact
baseline/candidate and file hashes, including untracked material. This includes
reviews, analysis, hardening, remediation, security tests and delta verification;
no other model may perform those activities. Block if the required model is
unavailable; only a new operator instruction can permit another security model.

Each reviewer fixes findings itself, validates, reports and retires. Any
artifact/test change requires another clean GLM 5.3 Flash reviewer. A clean
no-change pass ends the cycle; after three security rounds without one, stop
and wait for Hoa's recorded bus decision. Track actual model IDs and cumulative
security rounds separately from correctness rounds; delta work cannot reset
the cap. A lead acceptance is an explicit exception, not a clean verdict. Existing
reports cover their historical bytes only. No scan is claimed by this register.

## Defined boundaries

| Milestone | Parent deliverables / cumulative scope | Scan coordination | Boundary and current state |
|---|---|---|---|
| Remote-board rollout / phase 1 | 108 hygiene, 109 migration, 110 live acceptance, 131 team policy and 144 helper/guide, with their runtime/governance dependencies and all intervening relevant changes | OpenCode + OpenCode Reviewer; split scopes below | **Pending.** Gate the combined candidate before board initialization, installation or live posting. Preserve the existing rollout hold. Include helper changes required by the new owner/reviewer model. Run any relevant delta verification before phase-1 acceptance is signed off. |
| Protocol/specification settlement and phase 2 | 134 message-processing spec, 209 request/response spec → 202, 211 charter spec → 208, 217 contract-net spec → 204, plus remaining phase-2 work selected for release | OpenCode; Hoa freezes the actual batch | **Pending.** Preserve historical accepted spec reports and unresolved findings. A spec-only settlement scan can form part of this milestone; code release requires coverage of the actual implementation. No per-task scan queue. |
| Identity/enrollment and phase 3 | 308 enrollment specification and subsequent identity/signing/registry/policy implementations 301–305, with other phase-3 release contents when selected | OpenCode Reviewer; Hoa freezes the actual batch | **Pending.** Existing enrollment reports are spec evidence only. Resolve/dispose the outstanding confirmation-render finding and observations before spec settlement; scan the actual identity implementation before rollout/release. |
| Later phase or release batches | Phase 4–6 deliverables and any additional release batch | Hoa assigns one of the three task owners when defining the batch | **Not yet scoped.** Define scope, baseline, owner and boundary before release; ordinary task integration does not imply coverage. |

An assigned scan coordinator is not a claim that an agent/worker is running.
The owner can complete ordinary tasks without waiting for that coordinator.
If a release combines milestones, one scan/report may cover them with explicit
coverage; do not duplicate the same scan just to fill separate rows.

## Baseline and coverage discipline

Observed source HEAD at workflow migration:
`b11145c7be4e32dec22599f11737ea663d158785` (2026-09-08). The workspace already
contains uncommitted runtime, helper, governance, specification and audit work.
That HEAD is an inventory anchor, **not a claim that every committed byte was
security reviewed**. Before each scan, identify the last applicable reviewed
baseline and cover the cumulative intervening changes. If prior coverage is
uncertain, include the uncertain scope; do not limit the scan to the last task.
Pin candidate revision or immutable scoped snapshot plus complete path hashes.

For each actual scan append: scope and baseline, candidate/hash manifest,
worker/report, covered parent tasks, findings/dispositions, remaining uncovered
changes, boundary decision and relevant delta verification. Task completion
records must name pending milestone coverage rather than claim security
approval. Hoa records written acceptance and rationale for residual findings.

## Carried evidence and obligations

- Phase 1: preserve task108 final/governance/MCP-delta reports and task109/110
  preparation/fix-delta reports dated 2026-09-05. They do not cover subsequent
  policy or helper changes. Former tasks133/140 obligations now belong to131;
  former146 coverage belongs to144. The 2026-09-06 task133 report remains
  evidence for the old policy candidate, not this workflow migration.
- Message processing: the 2026-09-06 task136 report and unverified final
  remediation coverage formerly143 belong to134. Preserve every undisposed
  finding in that parent.
- Request/response and charter specs: retain the existing task219 audit and
  exact-byte settlement evidence. Do not re-review unchanged accepted bytes
  merely because task records moved; implementation coverage is still needed.
- Enrollment: preserve the 2026-09-05 task312 and 2026-09-06 task315 reports.
  The later report records acceptance with a new low confirmation-render
  issue and observations; the parent308 retains their lead disposition and
  final correctness-round requirements. Consolidation does not resolve them.

Archived standalone review/remediation records are indexed in
[the migration archive](../../backlog/archive/workflow-2026-09-08/README.md).
They are historical evidence, not parallel scheduling instructions. No old
pending security task has been silently marked passed.

## Active security dispatch (2026-09-08)

Operator assigned milestone security to the two OpenCode identities after their
required-model spawn PASS. Only clean `zai-coding-plan/glm-5.3-flash`
reviewer-remediators perform substantive work. This changes assignments, not
the frozen policy's substantive requirements or prior verdicts. Fresh manifest
includes this register's assignment/bookkeeping delta.

- **OpenCode Reviewer — policy scope:** current131 policy/charter deliverables
  and relevant historical findings/coverage, with task/backlog metadata as
  read-only context. Existing131 path reservation applies. Report under
  `docs/security/2026-09-08-remote-board-policy-milestone.md`; no runtime/helper
  edits. Record evidence/rounds in131; do not mark whole milestone passed.
- **OpenCode — runtime scope:** eight108 runtime/fixture paths, relevant
  cumulative dependencies and previous exact-byte reports. Authorized fixes
  only inside those eight paths; out-of-scope fixes need lead scope assignment.
  Report under `docs/security/2026-09-08-remote-board-runtime-milestone.md`;
  record evidence/rounds in108. Letta's implementation continuation stays held
  while this security edit reservation is active, even after model-test PASS.
- **Helper/cross-scope coverage:**144 correction is still active. Its security
  review waits for the corrected frozen snapshot. After policy/runtime/helper
  reports, Hoa assigns GLM-only verification of remaining interactions/deltas
  against one final candidate. No release/rollout before cumulative coverage.

Each owner reconciles prior applicable security rounds before launching; no
reset for reassignment or split scope. If the budget is uncertain/exhausted,
report to Hoa for a recorded decision. Maximum three authorized rounds, then
stop for feedback if not clean. The reviewer fixes within its scope, validates,
reports and retires; changed output needs a fresh GLM reviewer. Parallel
workers require disjoint edit scopes and real capacity. Author/correctness
workers must not edit a security-frozen candidate. No separate review tasks.

### Lead security-round disposition (2026-09-08)

- Policy/131: archived133 consumed round1;140 has no verdict. Today's GLM
  author reconciliation was implementation/remediation, not an independent
  security review. Earlier closed/superseded108 governance cycles are retained
  coverage evidence, not additional rounds of the unresolved131 cycle. The
  next clean policy security reviewer is **round2 of3**, with round3 available
  if round2 changes the deliverable. If round3 is not a clean no-change pass,
  stop for Hoa's recorded decision. This preserves, rather than resets, the
  unresolved review count. Include this assignment/budget metadata in the
  new input manifest; it is not a security verdict.
- Runtime/108: previously accepted, closed exact-byte review cycles remain
  evidence. The newly assigned cumulative milestone runtime assessment starts
  at **round1 of3**; it must identify and carry valid prior coverage and any
  uncovered delta. Do not repeat closed exact-byte assessments without a
  coverage reason. Reassignment alone never resets an unresolved cycle: if
  the GLM worker finds a prior unfinished review for this same scope, report
  that evidence before consuming additional rounds. No model substitution.

### Integration and coordination update (2026-09-08)

The dispatch statements above preserve their original timing. Current status:

- Policy131: owner returned **FINAL POLICY SCOPE PASS**, security round2 of3,
  in bus message `20260908T100221Z-opencode-reviewer-6dd4`. The unchanged
  GLM-authored report is [the policy milestone report](2026-09-08-remote-board-policy-milestone.md),
  SHA-256 `3a616b8c70cbc1d4e657baf613f5fe20433782aa640844ad8f0087238af91d1e`.
  Parent131 records the lead's excluded-model-test-log and evidence-write
  process dispositions. This entry records that handoff; it is not a new scan.
- Policy131 and helper144 ordinary deliverables were committed and pushed in
  `3bc8dadc9a8e11512d3c10cc15af211064ed06a6`. Exact-head CI run `34213926700`
  and CLI packaging run `34213925890` both passed. Helper144 has ordinary
  correctness round1 approval; milestone security approval remains pending.
- Runtime108: OpenCode returned **clean no-change SECURITY PASS**, round1 of3,
  in `20260908T101729Z-opencode-2216`. Worker
  `ses_f7f84c0efffeN3aG8IBN53jvrn` used runtime-verified
  `zai-coding-plan/glm-5.3-flash`. All eight output hashes match the frozen
  manifest; reported isolated `b11145c` plus eight-file root validation was
  305 pass / 1 skip / 0 fail and typecheck passed. The unchanged
  [runtime report](2026-09-08-remote-board-runtime-milestone.md) SHA-256 is
  `897f98810319ce14b06729afa872835c993fb3c4f1e4639c33d342aabcf50fb2`.
  Session/process/log cleanup is confirmed in `20260908T101828Z-opencode-006a`.
  Lead accepted the disclosed report-only native-write process deviation and
  preserved its launch-snapshot wording with an explicit later-HEAD caveat;
  no retroactive tool compliance or policy/helper coverage is claimed.
  OpenCode owns task108 completion. Its unchanged runtime scope was pushed in
  `8e06278e28fa9a0868367d37481a3f66d32cae1c`; exact-head CI `34214935470`
  and CLI packaging `34214935477` both passed.
- Helper144: the unacknowledged OpenCode Reviewer dispatch
  `20260908T100510Z-codex-4220` was withdrawn in
  `20260908T102127Z-codex-03fd`. Coverage transferred to available OpenCode in
  `20260908T102127Z-codex-0cbf`, preserving the same two-file reservation and
  avoiding a separate review queue. Prior146 has no verdict: initial helper
  milestone round1 of3, subject to reconciliation of any unfinished same-scope
  evidence. Use a fresh clean GLM worker with final runtime model evidence;
  stop/reconcile overlap if a previously unreported worker appears. Policy and
  runtime remain read-only. OpenCode reported a fresh background worker launch
  in `20260908T102312Z-opencode-5a8b`, requested
  `zai-coding-plan/glm-5.3-flash`, fixed baseline `8e06278` plus exact helper
  pins. Runtime model verification and verdict remain pending. No live actions
  or duplicate per-task review ticket are authorized.

The full remote-board milestone remains **pending** helper and
combined-candidate coverage. All live rollout holds remain in force. This
append is lead coordination bookkeeping after the policy snapshot; it does
not claim that the appended status text was included in that review.

### Helper round1 blocker and next-round authorization (2026-09-08)

OpenCode handoff `20260908T103922Z-opencode-3966` records helper security
round1 as **BLOCKED**, with runtime GLM5.3Flash confirmed and no helper/guide
changes. The isolated typecheck tool call was rejected; the runtime did not
establish whether the decision was human or automatic. The denied operation
is not to be retried or worked around. No PASS or combined coverage is inferred.

Lead verified existing exact-head CI `34214935470` for `8e06278`: the
“Tests and typecheck” job and “Run typecheck” step both passed. That existing
validation may carry forward for unchanged relevant bytes; it does not
rewrite the blocked GLM verdict or cover future fixes.

Dispatch `20260908T104426Z-codex-1774` authorizes one fresh GLM reviewer after
round1 retirement/evidence preservation: helper round2 of3, with remaining
combined interactions/deltas included in its initial prompt. Policy's completed
round2 and runtime's completed round1 remain separate recorded cycles. Only
helper/guide may be fixed; other scopes are read-only and out-of-scope fixes
require lead assignment. Changed outputs require fresh round3 verification;
stop after3 without a clean pass. Existing passed checks are reused where
applicable, and denied typecheck execution/equivalent workarounds remain
prohibited. Any new validation gap must be reported explicitly. Actual round2
start and round1 cleanup await owner confirmation. Whole rollout remains held.

### Round1 retirement confirmation (2026-09-09)

OpenCode confirmed round1 worker retirement, session deletion and removal of
owned archives, output, runner and export files in
`20260909T083846Z-opencode-28d8`. The original GLM-authored blocked helper
report is [preserved here](2026-09-08-remote-board-helper-milestone.md), SHA-256
`860589307e4e9f7431f01d7d92dd31d771d2d504f7b975dbbef18048585c3ccd`.
No original verdict or report text was changed by coordination bookkeeping.
The optional observation remains for GLM disposition. Round2 authorization is
acknowledged and launch preparation reported; actual worker start remains
pending. The current main successor `6ce18ba` adds coordination bookkeeping
to the previously named baseline, without a product-scope change or round reset.
OpenCode Reviewer separately confirmed no withdrawn helper worker/overlap.

# Task ownership and completion

Operator policy adopted 2026-09-08. This replaces per-task cross-agent review
queues, separate review/remediation tasks, and mandatory per-task security
scans. Operator/session instructions take precedence over repository documents.
Essun joined the task-owner mandate by operator instruction on 2026-09-10.

## One owner through completion

One orchestrator owns each task from claim to integration handoff. **`letta`,
`opencode`, `opencode-reviewer` and `essun` have the same mandate**: own implementation,
correctness/completeness review-remediation and milestone security cycles in
harnesses supporting per-worker model selection. Package lanes and existing
reservations still govern pickup; the `opencode-reviewer` name does not imply
a review-only role. The main session coordinates; substantive work runs in clean
workers. The owner reserves the entire task scope across implementation and
review rounds, so another agent cannot pick up its review or edit those files.
Independent tasks may proceed in parallel; workers on the same scope run
sequentially. Hoa retains lead decisions and exclusive integration/commit/push.

## Worker lifecycle

1. **Build.** Spawn a clean implementer using **GLM 5.3 Flash**. Give it the
   task, acceptance criteria, DESIGN, relevant research, allowed paths and an
   exact instruction. It implements and runs appropriate checks, then leaves
   a compact handoff. Retire it after preserving its result; do not resume it
   to fix review findings.
2. **Review and remediate, round 1.** Spawn a new clean **Astra/Fable-class**
   reviewer. It inspects the actual change and relevant dependencies against
   correctness and completeness criteria, fixes blocking findings itself in
   the same worker, and runs the relevant checks. It can edit within the
   owner's reserved scope; it need not send fixes back to the implementer.
   Preserve its round report, then retire it.
3. **Fresh verification.** If the reviewer changed the deliverable or its
   tests, spawn another clean reviewer on the resulting snapshot. Repeat the
   same review-and-remediate procedure. No-change verification may pass on
   round 1; there is no mandatory second pass when nothing needed fixing.
4. **Stop at three.** At most three reviewer workers run automatically,
   including the first. If round 3 leaves findings, fails checks, or makes
   changes awaiting independent verification, set the task blocked and send
   Hoa the evidence through the bus. Start no further round without a recorded
   lead decision. Waiting for feedback is not permission to continue.

A round returns **CORRECT/COMPLETE** only when it found no unresolved blocking
findings, verified applicable acceptance criteria and checks, and made no
changes to the deliverable or tests. Writing the round report is not a
change to the deliverable. A worker that fixes something returns
**REMEDIATED — FRESH REVIEW REQUIRED**, even if its checks pass. An inability
to complete checks, a scope conflict or a material undecided requirement is
**BLOCKED**, not a clean verdict. Reviewers record optional suggestions
separately; they do not make unrelated improvements that restart the loop.

Reviewer independence is between worker contexts: the same orchestrator may
spawn every worker. A reviewer starts without the implementer's or previous
reviewer's conversation, but receives concise evidence and must inspect the
actual artifact and relevant dependencies. Never run overlapping reviewer-remediators on one scope.

## Model selection and handoff

Record the actual provider/model identifier for each worker, not just its
class label. GLM 5.3 Flash is the requested implementer model; Astra/Fable
names describe the requested capable reviewer class. Use an available matching
model through the owning harness. If the harness cannot select the required
model/class, report the limitation to Hoa before substituting; do not silently
run a cheaper reviewer or claim a model that was not used. These documents
set policy; they do not configure providers or prove model availability.

**Security exception (operator, 2026-09-08): GLM 5.3 Flash is the only
permitted model for any substantive security work.** This includes security
analysis, reviews/scans, threat modelling, hardening, security remediation and
its tests/verification, including security work inside an otherwise ordinary
task. Astra/Fable workers handle ordinary correctness/completeness only; they
must leave security assessment and fixes to clean GLM 5.3 Flash workers. A
suspected security issue is a scoped handoff, not permission for another model
to investigate or fix it. Coordinators may route work, preserve reports and
record lead decisions; that does not authorize substantive security work in
their own model. If GLM 5.3 Flash is unavailable, block security work and report
to Hoa. Hoa may decide scheduling/continuation, but cannot substitute another
security model without a new operator instruction.

A compact handoff contains: task and acceptance criteria; baseline revision;
changed/reserved paths and final file hashes (including untracked files);
checks run with results and unverified criteria; unresolved findings/choices;
and the next required action. Supply relevant source/design references for
navigation, not entire bus transcripts or every file in the repository.
Workers read enough dependencies to assess the actual behavior. Use CodeGraph
first for code discovery when the repository is indexed.

Record each round in the **same task file**: worker/model, input snapshot,
findings and their dispositions, edits, checks, output snapshot, verdict and
cleanup. Do not create review, remediation or re-review task IDs. Separate
new tasks are for distinct deliverables or deliberately deferred scope only.

## Lead decisions and integration

At the cap, Hoa decides whether to authorize a specified number of extra
rounds, resolve a requirement, narrow/defer scope, or explicitly accept a
remaining limitation. Record the decision, rationale, remaining issues and
new round budget in the task. Preserve the cumulative round count. A lead
exception does not fabricate a clean reviewer verdict or erase a finding.

After a clean verdict, the task is `gated` pending integration, not shipped.
Hoa verifies that the exact files/hashes match the reviewed snapshot and that
required validation is recorded before staging only the task's changes.
Meaningful code checks and applicable root tests/typecheck remain required;
document-only changes use document/link/consistency checks. No recursive
review of reports or routine lead bookkeeping. Later changes to a reviewed
artifact require scoped fresh verification, within the recorded round budget.

A task becomes `done` after applicable acceptance, lead commit/push, CI and
cleanup. Task integration may precede the milestone security review: record
its security coverage as pending and do not describe it as security approved.
Milestone release/rollout waits for its gate. Owners retire disposable workers
and remove their own scratch/processes; preserve handoffs and audit evidence.

## Security at milestones

Any task owner orchestrates security work **only through clean GLM 5.3
Flash reviewer-remediators** over the cumulative milestone scope, with
`docs/research/04-trust.md`. The same model restriction covers early focused
checks, security fixes in parent tasks and all delta verification. Codex and
other models do not perform substantive security work. No mandatory per-task
scan is introduced; existing findings still require disposition.

For each security review, use the same clean review/remediate lifecycle:

1. Spawn a clean GLM 5.3 Flash security reviewer-remediator on the recorded
   snapshot. It reviews, fixes findings itself within the reserved scope,
   runs relevant checks and records its actual model, input/output hashes,
   findings, fixes, checks and verdict. Do not send security fixes to an
   Astra/Fable reviewer or back to the retired implementer.
2. Preserve the report and retire that worker. If it changed the artifact or
   tests, spawn another clean GLM 5.3 Flash reviewer-remediator to verify the
   new snapshot. Serialize all workers touching that scope. A clean security
   pass requires no artifact/test changes, completed applicable checks and no
   unresolved findings; self-checked fixes require fresh review.
3. Stop after three security review rounds without a clean pass, including
   the first round. Report to Hoa through the bus and wait for a recorded
   continuation/disposition decision. Third-round fixes still need fresh
   verification; they are not self-approved. Preserve cumulative security
   rounds separately from ordinary correctness rounds in the milestone and
   parent records. A delta or ownership change does not reset the budget.

No additional review/remediation task IDs. Reports remain in `docs/security/`
and fixes/evidence in the relevant parent tasks. Lead acceptance of a residual
finding is an explicit exception, not a clean security verdict. Subsequent
ordinary correctness checks may assess non-security behavior, but assessment
or remediation of security findings remains GLM 5.3 Flash-only.

Hoa defines the milestone boundary, scope/baseline and scan owner in
[the milestone register](../security/MILESTONES.md). Gate before the relevant
release or operational rollout, including the remote-board cutover; absence
of a milestone definition is not permission to release. Reports pin exact
reviewed bytes and live in `docs/security/`. Gate findings and remediation
remain in the originating task(s) and milestone record, not new review tasks.
Changed security-relevant bytes require milestone delta verification before
release. No milestone passes with undisposed findings; Hoa records any
accepted residual issue and rationale. An early focused security checkpoint
can be commissioned within a milestone when needed, without reinstating
per-task scans.

## Specifications and existing work

Substantive specification authoring and implementation can remain separate
parent tasks because they deliver different artifacts. Their review and
remediation rounds live inside the relevant parent. Architect retains its
author-only role; after author handoff, Hoa assigns the same specification
parent's completion cycle to one of these task owners, which can create capable clean
reviewer-remediators. Record an explicit ownership transfer and preserve
provenance. Reviewers can correct the assigned draft; changes to locked design
or unresolved material choices go to Hoa. A clean spec verdict still requires
lead settlement before dependent implementation starts.

Previously completed reviews remain evidence for their exact input snapshots.
Do not redo an unchanged passing review solely to fit this workflow. Pending
review/remediation tasks are folded into parents; archived records retain
findings, hashes and historical verdicts. Existing completed rounds count
toward the cap, including a pending third-round handoff; consolidation does
not reset it. If the count or coverage is uncertain, reconcile with Hoa.
Existing ownership, frozen scopes, explicit holds and unresolved findings
survive migration. A workflow change is not evidence that a gate passed.

## Measure the outcome

For each completed task record available elapsed time, queue/wait time,
worker starts, input/output tokens and actual cost per model, review rounds,
and the extent of reviewer rewriting. Mark unavailable usage as unknown.
Compare cost and time to acceptance, not just initial implementation. Expected
benefits are fewer cross-agent waits and findings handoffs; repeated clean
context loading remains, and savings depend on implementation quality.

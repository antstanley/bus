# Milestone security coverage

Operator policy 2026-09-08: security review is cumulative at milestones, not
per task. This register describes release/rollout gates, not a separate task
queue. Findings/fixes remain in the originating parent task; audit reports
remain here under `docs/security/`. See
[task workflow](../agents/task-workflow.md) and [SECURITY.md](../../SECURITY.md).

Hoa defines/finalizes scan scope and release boundary and records dispositions.
**Operator update, 2026-09-10:** Nassun is the primary owner/reviewer for all
milestone security reviews and may use **DeepSeek v4.1 Flash** for substantive
security work. Other task owners may take security reviews **only when they
have no queued work**, using clean **GLM 5.3 Flash** reviewer-remediators.
Record the fallback owner's empty-queue check and assignment before dispatch.
This covers security analysis, review, hardening, remediation, tests and delta
verification. Other models remain excluded without a new operator instruction.
Use clean review contexts; the coordinating session does not review its own
output. Preserve existing reservations, reports, findings and cumulative rounds.

Use `docs/research/04-trust.md`, an exact baseline/candidate and complete file
hashes including untracked material. Block if the assigned owner's allowed
model is unavailable; do not infer availability from policy permission.

Each reviewer fixes findings itself, validates, reports and retires. Any
artifact/test change requires another clean reviewer with that owner's allowed security model. A clean
no-change pass ends the cycle; after three security rounds without one, stop
and wait for Hoa's recorded bus decision. Track actual model IDs and cumulative
security rounds separately from correctness rounds; delta work cannot reset
the cap. A lead acceptance is an explicit exception, not a clean verdict. Existing
reports cover their historical bytes only. No scan is claimed by this register.

## Defined boundaries

| Milestone | Parent deliverables / cumulative scope | Scan coordination | Boundary and current state |
|---|---|---|---|
| Remote-board rollout / phase 1 | 108 hygiene, 109 migration, 110 live acceptance, 131 team policy and 144 helper/guide, with their runtime/governance dependencies and all intervening relevant changes | Nassun; historical split scopes retained below | **Pinned f37b83b runtime cleared for the live cycle.** The original combined scope and the clean GLM inbox-adoption delta are accepted below. Runtime endpoint readiness is verified; actual board delivery, the setup-guide deliverable and full acceptance110 remain open. Keep runtime bytes fixed and record any later relevant delta before final milestone closure. |
| Protocol/specification settlement and phase 2 | 134 message-processing spec, 209 request/response spec → 202, 211 charter spec → 208, 217 contract-net spec → 204, plus remaining phase-2 work selected for release | Nassun; Hoa freezes the actual batch | **Pending.** Preserve historical accepted spec reports and unresolved findings. A spec-only settlement scan can form part of this milestone; code release requires coverage of the actual implementation. No per-task scan queue. |
| Identity/enrollment and phase 3 | 308 enrollment specification and subsequent identity/signing/registry/policy implementations 301–305, with other phase-3 release contents when selected | Nassun; Hoa freezes the actual batch | **Pending.** Existing enrollment reports are spec evidence only. Resolve/dispose the outstanding confirmation-render finding and observations before spec settlement; scan the actual identity implementation before rollout/release. |
| Later phase or release batches | Phase 4–6 deliverables and any additional release batch | Nassun by default; empty-queue fallback owner only | **Not yet scoped.** Define scope, baseline, owner and boundary before release; ordinary task integration does not imply coverage. |

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

## Historical security dispatch (2026-09-08)

The2026-09-10 Nassun assignment supersedes these owner defaults for new
reviews. Preserve their actual work, reports, findings and cumulative counts;
do not duplicate an active or completed review when transferring ownership.

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

### Combined candidate disposition (2026-09-09)

OpenCode final handoff `20260909T092455Z-opencode-5563` reports fresh worker
`ses_f7aaccbf3ffe5yAP3mRmSVkCRX`, exported runtime
`zai-coding-plan/glm-5.3-flash`, **SECURITY PASS — clean no-change**.
The [unchanged combined report](2026-09-09-remote-board-combined-round2.md)
SHA-256 is `cc99f04fc1a96d0488b6f33ee672815cfc235466bc08536a4abc4d6ca596199f`.
Hoa independently matched all 25 current path hashes to its manifest before
this bookkeeping update. Requested baseline was `ba567d5`; the actual
manifest includes the disclosed later register metadata. The report's broad
claim of identical product bytes back to `b11145c` is not accepted as revision
evidence: earlier reviews used candidate overlays, and integration occurred
later. Exact manifest hashes and scoped prior evidence govern.

Hoa accepts the GLM worker's optional-observation disposition unchanged for
this milestone, relying on its assessment and rationale; the lead performed
no security analysis. No artifact edits or new checks occurred in round2.
Prior exact CI34214935470 carries only on unchanged relevant bytes; the
denied typecheck was neither retried nor worked around. Helper rounds remain
1 BLOCKED + 2 clean, policy2 complete and runtime1 complete, with ordinary
rounds recorded separately. No third helper round is needed. OpenCode
confirmed session deletion, exited processes and owned runner/log cleanup.

Boundary decision: the combined pinned candidate satisfies the security
prerequisite for the scoped private-board rollout. Task109 must still settle
and execute its concrete setup/participant sequence; task110 must prove actual
live acceptance before bus deprecation. No blanket approval of later changes
is given. In particular, task205's isolated candidate is outside this manifest
and does not inherit this gate. Subsequent task/register/report archival edits
are lead bookkeeping, not newly scanned product bytes. Historical report-only
local-file observations are not permission to read or delete credential files;
only the exact selected report and task metadata are staged for this closure.

### Inbox adoption delta dispatch (2026-09-09)

Task205 ordinary implementation is pushed as
`f37b83b7f4b8e3a37dfb18d1979caed4826c892c`, following clean Astra round2.
It adds seven product paths relative to `bcda545f3964f5a523bd2fbc9f43a971b1c7f62b`;
the root-corrected full hashes are in its parent record. These bytes are not
approved by the prior 25-path report. Initial private-board setup preceded
this integration on the accepted candidate; the forthcoming live cycle must
wait for coverage of this adoption delta as well as participant readiness.

Dispatch `20260909T101602Z-codex-1a41` assigns OpenCode Reviewer a fresh
GLM5.3Flash-only worker, fixed f37b83b, security round1 of3 for this previously
uncovered inbox-adoption scope. Prior helper2, policy2 and runtime1 cycles
remain closed evidence, not reset budgets. Only the seven task205 paths may
be fixed in an isolated candidate; shared main and Letta's retained worktree
stay untouched. Installed local opencode.json and plugin configuration are
read-only interaction inputs with their actual observed hashes. Any finding
requiring other edits returns to the lead for scope assignment.

Report target: `2026-09-09-phase1-inbox-adoption-delta.md`. Changed outputs
require retirement and the next fresh GLM round, with a stop after3 if not
clean. No duplicate task ID or routine re-review of unchanged accepted scopes.
Reuse applicable existing validation; do not retry or work around the prior
helper typecheck denial. Actual worker start/runtime evidence and verdict are
pending. This register entry is coordination bookkeeping, not a security scan.

Assignment update: root verified original dispatch101602Z-codex-1a41 remained
in OpenCode Reviewer's new/unread inbox, with no reported worker start. It was
withdrawn in `20260909T102938Z-codex-5e98` and transferred to the reachable
OpenCode owner in `20260909T102938Z-codex-2594`. Fixed f37b83b scope and
initial round1 budget are unchanged. The owner's confirmed local endpoint
accepted a bounded assignment wake-up withHTTP204; actual worker start and
verdict still require its handoff. Any unexpected prior worker must pause for
overlap reconciliation. This supersedes the earlier coordinator assignment,
not the GLM-only restriction or live-cycle hold.

Phase1 live runtime stays fixed at f37b83b through this review and the
109/110 cycle. Metadata and the planned setup guide may proceed; unrelated
completed runtime changes may be committed/pushed in isolation by Hoa, with
main adoption deferred until the cycle closes. Existing holds/reservations
remain. This is an integration boundary, not new authoring authorization or
security approval. OpenCode reported actual fresh adoption worker
`ses_f7a45bc0dffehfR5rUg2rtQLys`, requested GLM5.3Flash, runner99785/worker99793
active with verified input pins. Actual runtime export and verdict remain
pending; scope and initial round1 are unchanged.

### Adoption disposition and live-cycle release (2026-09-09)

OpenCode final handoff `20260909T104934Z-opencode-7ae7` confirms exported
`zai-coding-plan/glm-5.3-flash`, fresh session
`ses_f7a45bc0dffehfR5rUg2rtQLys`, **SECURITY PASS — clean no-change**,
adoption round1 of3. The [verbatim report](2026-09-09-phase1-inbox-adoption-delta.md)
SHA256 is `71a179437ad1ab593c5708194806b87837437f0bd1de620725c1e6d1c4e31541`.
Hoa matched all seven current product hashes and both installed configuration
hashes to their report rows, and matched the report hash itself. No product
or test changes occurred; applicable exact f37b83b CI evidence carried.
Session, runner/log, archive and scratch cleanup are confirmed. OpenCode
Reviewer separately confirmed no withdrawn worker or overlap.

Lead accepts the GLM pass and its report-only dispositions unchanged for the
exact candidate, relying on the GLM assessment rather than performing a new
security analysis. Prior scoped passes remain carried evidence. The pinned
f37b83b runtime is cleared for the actual109/110 live cycle; this does not
claim that the cycle has happened or passed. Keep product bytes fixed.

The planned new setup guide will receive ordinary review within109. Before
final phase1 acceptance/deprecation, one fresh GLM reviewer will assess that
new guide and relevant remaining live-cycle deltas, carrying unchanged runtime
coverage. Count that as the next adoption/final-cycle security round2 of3,
with round3 available for changed outputs; do not reset the open final-cycle
budget. No new review task or repeated unchanged-runtime scan is required.

### Setup-guide disposition (2026-09-09)

OpenCode's final board handoff `01M232H234Q8N0SS7XJMXY7QRF` reports fresh
GLM session `ses_f79e5f099ffeb2xFG2wM77uhzb`, exported
`zai-coding-plan/glm-5.3-flash`, adoption/final-cycle security round2 of3:
**SECURITY PASS, clean no-change** for the setup guide and assigned delta.
Root independently observed that worker's model/completion metadata and
matched the unchanged guide SHA256
`78491cd294661bf6230de0125bd97f60c24cc4b91dcfab3e66b385f3c8a460d5`.
The [verbatim report](2026-09-09-team-board-guide-final-cycle.md) SHA256 is
`e74c94243e69fa6609e3176d507bd9c69da26a4c29f788ea6192bdc097342bfb`, also
matched by root. Owner cleanup confirmation
`20260909T123721Z-opencode-3844` records deleted disposable sessions, removed
owned runner/command logs and exited worker processes. Root retains live
operational replicas/watcher separately; the blocked task147 checkout remains
reserved for that task.

Hoa accepts the GLM assessment for this exact guide, carrying prior unchanged
runtime coverage. No new security analysis or broader approval is implied.
Historical collective wording in the report does not establish identical
ordinary-review inputs: ordinary2 and3 remediated distinct snapshots; only
the explicit lead-authorized ordinary4 returned a clean no-change pass on
the final78491cd guide. Those exact snapshots and checks remain in task109.

This clears guide integration, not full migration, task110 acceptance,
task147, or unreviewed future runtime/helper changes. The real trial required
human/admin recovery and remains failed/incomplete. Task147's canonical-read
rejection awaits fresh operator authorization; the helper's reported internal
30-second subprocess limit also remains an operational blocker. Runtime and
installed configuration bytes stay fixed. The next applicable changed-delta
security review is cumulative round3, subject to explicit scope assignment;
after3 without a clean pass, stop for Hoa. No budget reset or per-task scan
queue is created.

### Task148 source integration; rollout coverage pending (2026-09-09)

The operator requested source integration of task148 after its clean ordinary
round3. Hoa verified the three final hashes in the
[parent task](../../backlog/done/148-handle-filename-less-watch-events.md) and adopted
those exact bytes onto source main based on `cf4a709`. Product/dependency/CI
files had no intervening changes from the owner's5587108 review baseline.

This integration adds an uncovered remote-board milestone delta:
`packages/store-fs/src/index.ts`, `packages/store-fs/test/store-fs.test.ts`,
and `packages/store-git/test/store-git.test.ts`. Previous reports continue to
cover only their pinned bytes. No security review or acceptance is claimed
for this delta, and operational rollout/installation remains held. Source
integration and CI may proceed under the shared workflow.

The next applicable cumulative adoption/final-cycle security round remains3;
it is not started by this bookkeeping entry. Before rollout, Hoa must freeze
the actual cumulative candidate and assign a clean GLM5.3Flash review through
the milestone owner. Preserve prior findings, reports and round counts.


### Codex coordination monitor activation — 2026-09-10

Operator requested periodic new-board and legacy-bus monitoring. Task149,
owned by Essun, delivers a standalone one-shot monitor and launchd guide in
three reserved paths; it does not alter the live board runtime or active
147/202/507 implementation scopes. Baseline source `8ac806b`; candidate file
hashes remain pending. Before activating this monitor, Essun must return a
clean GLM5.3Flash security checkpoint for the complete monitor/tests/launch
plan with `docs/research/04-trust.md`. New scoped cycle: security round1 of3,
no worker/verdict yet; ordinary reviews are recorded separately in149.

Only the three task149 reserved paths and its new audit reports may be fixed.
Changed artifacts/tests require fresh applicable verification; stop after3
without a clean no-change pass for Hoa's recorded decision. Hoa alone stages,
provisions and activates the reviewed monitor, using a separate read-only-fetch
board replica. A queued notification is not evidence of a processed wake;
record real lead-session receipt. Existing remote-board final-cycle counts,
coverage and rollout holds are unchanged. This entry is assignment metadata,
not a security assessment or activation approval.

### Task147 source integration; rollout coverage pending — 2026-09-10

Hoa integrated the exact ordinary-round2 installer/test hashes from task147
in9219b76fae64ed5032f1250be73038dcf0d38f6e. Root validation and independent
no-change correctness evidence are in the parent; CI34462055855 and packaging
34462055898 passed. This adds packages/cli/src/install.ts and its installer
test to the uncovered remote-board operational delta already containing148.
No installed configuration was changed. Applicable cumulative security
round3 still needs an explicit frozen scope and GLM5.3Flash assignment before
operational rollout; previous coverage, findings and holds remain.

### Monitor candidate source integration — 2026-09-10

Task149 ordinary round4 returned CORRECT/COMPLETE with no changes and49
passing standalone tests. Hoa adopted the exact three candidate hashes and
attempt2 report recorded in the parent. Security attempt1 was blocked at
input-hash preflight; attempt2 remediated two findings, and attempt3 is the
required fresh GLM verification on these final bytes plus the unchanged
prepared plist341afce5815d89e75200c8b5763924be2a92ca4d17ae0946879f6f6ab1a6b82c.
All identities and cumulative counts remain in149. Source integration and CI
may proceed; monitor activation remains held until the applicable clean
verification and lead operational checks. No other rollout hold changes.

Lead integration check disposition: git diff --cached --check reports one
trailing space in the guide line298 shell comment. Hoa accepts this cosmetic
formatting finding to retain the exact independently reviewed artifact; the
check is recorded as nonzero, not claimed passing. No source/test failure
or security finding is waived by this disposition.

### Monitor final gate and operational trial — 2026-09-10

Essun returned clean GLM5.3Flash security attempt3 on the exact439bad8
candidate and actual plist341afce5815d89e75200c8b5763924be2a92ca4d17ae0946879f6f6ab1a6b82c.
Report: [attempt3](2026-09-10-codex-monitor-security-attempt3.md), hash
e1d567922b15f7277a59c240ea9923d826a4ac08b7de9c9b7899f2b2e4e9a0a6.
No deliverable changes or remaining scoped findings were reported;49 tests
passed. Ordinary4 and security attempts1/2/3 remain preserved in149. Source
CI34464122300 and packaging34464122292 both passed. The security hold on
this monitor is cleared; unrelated rollout holds remain.

Hoa authorizes installing the exact reviewed runtime copy and120-second job
for an operational trial. Manual initial/quiet/new-item polls and launchd
status will establish scheduler/transport behavior. A queued Codex message
may only be processed after the current turn yields; therefore processed
receipt remains final acceptance evidence, rather than a prerequisite to
starting the trial needed to observe it. Do not mark149 done or claim a
verified automatic wake until that actual thread receipt occurs. This
clarifies the lead-authored activation ordering; no security gate is waived.
The earlier automatic provisioning rejection occurred before this clean
security verdict and caused no runtime file write.

### Monitor trial access failure — 2026-09-10

Manual baseline/quiet/new-message/deduplication polls succeeded, with native
queue transport acknowledgement. The120-second launchd trial then failed
its legacy-inbox access with Operation not permitted (exit11). Hoa stopped
and removed the auto-load job. Task149 is blocked on a supported authorized
runtime-access solution; no background monitoring or processed wake is claimed.
Clean review evidence remains valid for its exact bytes. No permission change
or indirect workaround is authorized by this trial record.

### Nassun phase1 delta dispatch — 2026-09-10

Operator made Nassun the primary milestone security reviewer and explicitly
allowed DeepSeek v4.1 Flash. Hoa assigns the pending remote-board
adoption/final-cycle **cumulative security round3**, retaining prior round2
and all findings/accepted reports. No reset follows model or owner transfer.

Frozen candidate: fe382d3, isolated branch phase1-security-nassun at
/private/tmp/sidekick-phase1-security-nassun. Exact reserved scope/hashes and
read-only context are in [the input manifest](2026-09-10-phase1-nassun-inputs.json).
Package changes since reviewed runtime f37b83b are exactly the task147
installer/test and task148 store-fs source/test plus store-git test; include
the current operator-authorized policy/charter delta listed in the manifest.
Unchanged historical runtime coverage is preserved. Task149 monitor source
has its own clean exact-byte gate and is not duplicated by this scan.

Nassun first verifies actual model and clean-context capability, then starts
one fresh DeepSeek v4.1 Flash reviewer-remediator on this frozen input. Fix
scoped findings, validate, write the designated report and retire. If round3
changes bytes or cannot pass, stop for Hoa's explicit round4 decision. Do not
silently reset counters or run read-only/fix queues. No source git writes or
live board/runtime/permission changes. Task202 and217 scopes are excluded;
installer147 and store148 scope stays reserved until this handoff, including
against507 installer wiring. Model/context confirmation and actual start are
pending; assignment is not a claim that a worker is already running.


Nassun receipt20260910T102752Z-nassun-0cb5 confirms CLI board access and index
initialization (board post01M25DQ624Y0AFTPEKWAYJNCQJ). Scan start is currently
blocked in Nassun's own DSH session: it requests direct operator confirmation
of the new security role/model exception, and observes only model alias
`deepseek-flash`. Record that alias separately from the operator-stated
DeepSeek v4.1 Flash identity; do not manufacture runtime metadata. The frozen
round3 assignment remains ready, with no worker/verdict inferred. Hoa cannot
substitute a bus assertion for Nassun's required recipient-session authority.

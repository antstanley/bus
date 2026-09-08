---
id: 144
title: "align phase1 acceptance helper with live team roles"
phase: 1
priority: critical
owner: opencode
status: gated
kind: implementation
parent: 109
related: [109, 110]
depends: []
estimate: S
---

## Lead dispatch (2026-09-08)

Continue now as `opencode`, after verified clean GLM/Astra model-spawn PASS.
Reserved deliverable edits: `scripts/phase1-acceptance.ts` and
`docs/acceptance/phase-1.md`; maintain this task and its narrow INDEX row.
No governance/charter edits (131 belongs to opencode-reviewer),108 runtime
edits, product-protocol expansion, git writes, live board/init/install/posts.
Begin from the actual current two-file candidate, preserving existing work.

Spawn clean `zai-coding-plan/glm-5.3-flash` implementation, retire it, then
clean `openai/gpt-6-astra` correctness reviewer-remediators. No145 verdict
exists, so this task's first actual correctness round is round1 (old137
review covers a different preparation deliverable). Track up to three rounds;
changed artifact/tests need the next independent no-change pass. All security
analysis/remediation/tests/verification are GLM5.3Flash-only; Astra handles
ordinary correctness only. No per-task security scan; retain milestone coverage.

The helper must permit each of `letta`, `opencode`, `opencode-reviewer` as a
task owner, keep Hoa as accepting lead, represent actual clean worker/model
and round evidence, and replace mandatory separate-reviewer/other-agent
per-task-security assumptions with the current parent-contained cycle and
milestone prerequisites. Preserve bounded validation and honest advisory
identity/synthetic-vs-live evidence; no invented model attestation or humanless
acceptance. Reserve material interface choices for a concrete lead decision.
Use isolated current HEAD plus only this candidate for relevant smoke/negative
checks and applicable root tests/typecheck; report exact hashes, actual models,
rounds, outcomes, limitations and cleanup. Keep the live rollout hold intact.

## Current workflow and disposition (2026-09-08)

Use the [owner-managed task workflow](../docs/agents/task-workflow.md) for sequential clean reviewer-remediators and evidence in this task. Security belongs to the [applicable milestone](../docs/security/MILESTONES.md), not mandatory per-task scans; preserve prior findings, consumed rounds, exact-snapshot evidence and rollout holds. Verify requested model capability before dispatch.

Historical migration disposition (superseded by the gated handoff below): retain this substantive two-file helper bug-fix as its own deliverable, parent 109; the completed original preparation review is historical evidence, not an execution dependency on all of 109. At migration, owner/status were OpenCode/in-progress. Historical author pins: `scripts/phase1-acceptance.ts` SHA-256 `31465612b94ca63b62f647957ed2c658e5dda86735faf38dd0546de91d5de036`; `docs/acceptance/phase-1.md` SHA-256 `cf544141e628c0c492f1d8bb518d6e58247d7b17b46ef8934140c895c3b01513`. Historical author reports root 305 pass/1 skip/0 fail, typecheck 0, smoke and wrong-role/gate rejection cases; these are not independent approval of the current candidate.

Historical migration gap (resolved by the correction and ordinary round 1 below): correctness 145 had no verdict; it was awaiting/receiving the complete author freeze. The historical pins enforced the previous separate-Ykka/other-agent per-task-security contract and did not satisfy the new workflow. The operator's current worker/reviewer and milestone-security policy superseded that old role/gate prescription. Actor validation, bounded parsing/stages, negative cases and synthetic/live distinctions remained acceptance requirements. Any subsequent changed candidate still needs applicable fresh review. Original preparation review 137 under 109 is prior evidence on different bytes, not a clean pass for this fix.

Outstanding remote-board/phase-1 milestone obligation: exact changed-helper security coverage formerly 146, with prior preparation/fix reports and final changed policy as context. No verdict is recorded for 146. Keep live initialization/install/posting held until the preserved rollout prerequisites are satisfied; no completion, integration or cleanup is inferred.

Archived original records (evidence retained with link-only path adjustments, not active tasks or approvals): [145](archive/workflow-2026-09-08/145-review-phase1-live-role-helper.md), [146](archive/workflow-2026-09-08/146-security-phase1-live-role-helper.md).

## Current acceptance and completion

### Active owner cycle (2026-09-08)

OpenCode resumed under direct operator authorization and Hoa dispatch
`20260908T051023Z-codex-7f23`. Reservation remains the two deliverables above;
131 governance stays read-only. INDEX already records opencode/in-progress.
Baseline HEAD: `b11145c7be4e32dec22599f11737ea663d158785`.
Verified input SHA-256: helper
`31465612b94ca63b62f647957ed2c658e5dda86735faf38dd0546de91d5de036`, guide
`cf544141e628c0c492f1d8bb518d6e58247d7b17b46ef8934140c895c3b01513`.
Clean CLI implementation model: `zai-coding-plan/glm-5.3-flash`;
correctness model: `openai/gpt-6-astra`. Both model selections were proven
by disposable smoke sessions and exported assistant runtime metadata.
At initial launch, correctness rounds consumed were 0 of 3; see final round 1 below.
Security milestone coverage remains pending; no live rollout authorized.
Usage/cost and worker evidence will be recorded after handoff.

#### Implementation handoff and settlement block

Worker `ses_f80904871ffe8jNMdh2gCHtfsu`, requested CLI model
`zai-coding-plan/glm-5.3-flash`; exported assistant metadata confirmed that
provider/model for the readable export prefix (full export pipe truncated).
Fresh context, no prior conversation; initial 600-second run timed out and
the same unfinished implementation session continued to its final handoff.
Runtime timestamps give about 18 minutes elapsed, not the worker's estimated
45 minutes. Aggregate usage/cost unavailable; no monetary total inferred.

Output SHA-256: helper
`c64a2d86c07a5e5240492796b5aeffd76c09a26171c42c8aa44e8ce01a362fe7`, guide
`2e6d0ce27d5ea0d7e5ad4a44b9152c10c7818fb44245263de76bb5939f62ad7d`.
Worker reports isolated archive of baseline HEAD plus only candidate files:
`bun test` 297 pass / 1 skip / 0 fail; `bunx tsc --noEmit` exit 0;
helper smoke exit 0 with five rejection guards; 13 manual assertions passed.
Manual harness nevertheless exited 1 because its final expected count was 12;
this is not a fully passing check. Several worker checks piped output and
therefore require direct exit-status verification by the fresh reviewer.
Earlier 305-pass report is not substituted for this isolated baseline.

The candidate changes roles to lead/owner, renames `--worker` to `--owner`,
requires bounded model labels at ready/review and round 1..3 at review, and
has the owner post worker outcomes. Mandatory `--security` now references
milestone evidence or an honest pending state. The unchanged v1 schema rejects
old-shape role records. These interface choices were implemented before the
worker surfaced them for lead settlement; they are not silently approved.
Settlement requested in bus `20260908T053234Z-opencode-4797`; candidate frozen,
correctness rounds still 0 of 3, awaiting Hoa's recorded decision.

Process exceptions: worker used native edit/Python/cat despite apply_patch-only
instructions, and ran `bun install --frozen-lockfile` in its disposable archive
despite the no-install launch restriction. No persistent defaults or lockfile
changes reported. Future worker must use apply_patch and report unavailable
tools/dependencies instead of substituting. Worker removed its archive, manual
store, smoke directories and patch script; handoff retained here. No security
approval, integration, live rollout or completion is claimed.

#### Lead settlement and fresh correction

Hoa decision `20260908T093141Z-codex-0b22` releases the interface block:
use `--owner`, retain `--worker` as a compatibility alias and reject conflicts;
owner-posted claim/ready/review and lead/owner roles are approved. Required
bounded model labels are advisory, not attestation; default rounds are 1..3.
Use a distinct helper-payload version for the new role shape, without changing
the Board envelope or storage protocol. Clearly identify/reject legacy records
for new acceptance. Keep `--security` as an explicit milestone reference with
pending/approved distinction; pending does not authorize rollout or imply a
security pass. Document stop-after-three and separately recorded lead
continuation when the helper cannot represent additional rounds.

Fresh GLM correction worker will implement these within the same two-file
reservation and repeat checks with direct exit statuses, correcting the manual
harness expected count. Prior worker has been deleted and is not resumed.
Correctness remains 0 of 3; milestone security approval remains pending.

#### Fresh correction handoff

Worker `ses_f7fa33c13ffe3yTJSSecgHIle7`, CLI-requested and exported assistant
runtime metadata `zai-coding-plan/glm-5.3-flash`. Fresh context; the 20-minute
foreground limit interrupted validation, then the same unfinished worker
continued to final handoff. Runtime timestamps show about 25 minutes elapsed.
Input hashes are the previous handoff's c64a2d86/2e6d0ce2 pins above.
Output helper SHA-256
`e5cc85ac4ca1f21f60f6988d43ea51873f79080aa28f06fd9166fc7231b33b4e`;
guide SHA-256
`822d84f02fc1731193fbb741ffea9bc53491bccd7e517b6d8f18c95eebf06032`.

Worker reports v2 helper payload, legacy rejection, compatibility alias
(currently rejects both options together), bounded model/round evidence,
explicit milestone-state word validation, and stop-after-three guidance.
All manual edits reported through a bundled apply_patch binary shim; temporary
shim and test trees removed, other agents' scratch preserved. No installs.
Initial isolated dependency-link errors were corrected by copying per-package
node_modules with relative workspace links resolving inside the archive.
Final direct statuses: smoke 0 (8 guards), manual harness 0 (14 assertions
plus count assertion), root bun test 0 (297 pass / 1 skip / 0 fail),
bunx tsc --noEmit 0. Pure HEAD control also 297/1/0, exit 0.
Historical 305 count remains different-snapshot evidence; this owner does not
assert the worker's unverified historical commit explanation as fact.
Aggregate token/cost data unavailable. No independent correctness or milestone
security verdict inferred; fresh ordinary correctness round 1 is next.

#### Correctness round 1: clean no-change pass

Worker `ses_f7f8ae6f5ffeHhnEdLRI72vVPh`, requested and exported assistant
runtime model `openai/gpt-6-astra`, CLI variant low. Fresh independent context;
about 4 minutes elapsed from runtime timestamps. Input, isolated tested copy
and output hashes all match e5cc85ac/822d84f0 full pins above. No deliverable
or test edits. Verdict: **CORRECT/COMPLETE: Ordinary Review**.
No ordinary blocking findings. Verified three owners, codex lead, owner-posted
stages, aliases, v2/legacy behavior, model/round bounds, guide and synthetic/live
honesty. Both alias options together are rejected even if values match; this
stricter documented behavior is explicitly disclosed for integration.
Independent isolated baseline plus candidate: `bun test` exit 0,
297 pass / 1 skip / 0 fail; `bunx tsc --noEmit` exit 0; 95 ordinary command/result
checks exit 0; helper help exit 0. No targeted security checks, helper smoke,
accept-stage invocation, or security assessment by Astra. GLM smoke evidence
above is not an independent milestone security pass.

Correctness rounds consumed: 1 of 3, clean pass; no further correctness round
needed on unchanged bytes. Status gated pending Hoa integration; milestone
security coverage and live rollout hold remain pending. Owner rehashed final
workspace pins successfully. Reviewer removed its isolated archive/dependency
copies and test stores; disposable session retired after evidence capture.
Aggregate tokens/cost unavailable. No git writes or live operations.

- [x] Update the two-file helper/guide to represent one task owner orchestrating the model-selected implementer and sequential clean reviewer-remediators. Replace its mandatory Ykka correctness/other-agent per-task-security contract with recorded same-task round outcomes and applicable milestone security evidence, within the existing reserved scope.
- [x] Preserve bounded CLI/stage/actor validation, canonical keys, negative-error cases, honest synthetic/live evidence and cleanup; verify author-reported current pins and checks.
- [x] Obtain an independent clean correctness verdict in this record; record pending helper security coverage at the remote-board milestone and preserve live-rollout holds.
- [x] Record applicable checks and a clean independent correctness/completeness verdict here, retaining existing exact-snapshot passing evidence and round counts.
- [ ] Reconcile milestone security coverage/findings; lead commit/push, applicable CI and task-owned cleanup complete before marking done. Milestone release/rollout waits for its security gate.

## Earlier task scope and evidence

The following record is retained for provenance. Apply the current disposition above to superseded workflow language.


Operator prioritizes108→109→110 remote-board migration.137 approved synthetic
helper preparation only and explicitly left live role mapping/setup open.
The guide still names codex-worker implementation and Letta correctness,
contradicting current roles. Resolve this minimal critical-path gap before use.

CLEAN author; read109/110,137 evidence, DESIGN and research04. CodeGraph first
for source discovery. Editable ONLY scripts/phase1-acceptance.ts startingSHA256
2d21ce9a868cd339480100e0b2e0f6e38709b36e5f4d4d03e4110e0e6025ed3d
and docs/acceptance/phase-1.md startingSHA256
c936365c0f0f691ed88e7d854113a4b243acd5a39606aa90b739b7abef73336a.
Use committedb11145c runtime; no policy138,108runtime, other source/spec, config,
live board, branch creation, monitor/flags or installation changes here.

Lead choices: implementation by OpenCode or Letta; independent correctness by
Ykka (Hoa may review code only when idle and independent); security by a fresh
independent security worker through the other implementation/security agent;
Hoa accepts only after BOTH exact-revision gates. No Codex product author and
no Letta/OpenCode substitution for correctness review. Prefer keeping the
existing five-stage evidence helper, identifying the correctness reviewer
accurately and referencing separate security evidence before acceptance.
The helper does not authenticate agents or manufacture gate proof. If its
hardcoded/default reviewer contract prevents this mapping, implement the
smallest bounded explicit actor selection/validation change and document it;
do not design a new workflow protocol or silently change publication semantics.
If a larger API/stage change is unavoidable, report the choice before expanding.

Keep all prior validated guards, canonical keys, bounded windows/body limits,
stage/verdict checks, meaningful failure cases and cleanup. Update command
examples, role table and evidence prerequisites; no false no-human-relay claim.
Remote plan is team board on PRIVATE https://github.com/antstanley/bus-board.git,
branch board-data with separate .board-data checkout. Repository created and
verified private/empty per operator2026-09-06; source origin remains unchanged.
No S3 mirror/enrollment prerequisite for this scoped
legacy advisory-identity cycle. Preserve bus fallback until real acceptance.

Validate exact committedb11145c plus ONLY candidate: focused role/actor and
existing negative cases, smoke, full root tests/typecheck, frozen dependencies
and confined imports/links. Prove rejected wrong roles/gates do not become
false acceptance; label synthetic timing as synthetic. Return new full pins,
minimal diff/executed tests/limits/cleanup;145 independent correctness and146
security follow. No live migration is performed by this author assignment.

## Author progress (owner-recorded 2026-09-06)

Pass 1 (role alignment, clean author): bounded actor-contract change as
sanctioned — roles now lead=codex, worker=opencode|letta,
reviewer=opencode-reviewer, security=the non-worker agent (derived,
never the author); accept requires --security reference after the passing
review; read path rejects accepts lacking it; smoke adds wrong-reviewer and
missing-security rejection probes; doc role table/commands updated,
codex-worker retired, no false no-human-relay claim, synthetic timing labelled.
Pass 2 (lead 135617Z private-target correction, clean author): guide now
points board data at the dedicated PRIVATE antstanley/bus-board.git
(board-data branch, separate .board-data checkout); source origin stays PUBLIC
and never carries board data; live init/install/posts held pending 108 +
144/145/146; script byte-identical through both passes.

Pins after both passes: scripts/phase1-acceptance.ts
31465612b94ca63b62f647957ed2c658e5dda86735faf38dd0546de91d5de036;
docs/acceptance/phase-1.md
cf544141e628c0c492f1d8bb518d6e58247d7b17b46ef8934140c895c3b01513.
Validation: tsc 0; root 305 pass/1 skip/0 fail; wrong-role/gate rejection
proven (worker/reviewer/security/accept order all fail-closed); smoke guards
green; footprint exactly the two files. Ready for 145/146 gates; lead
integration pending.

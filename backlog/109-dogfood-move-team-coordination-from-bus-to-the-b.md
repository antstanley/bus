---
id: 109
title: dogfood: move team coordination from ./bus to the board
phase: 1
priority: critical
owner: codex
status: in-progress
depends: [101, 102, 103, 108, 144]
estimate: M
---

## Current workflow and disposition (2026-09-08)

Use the [owner-managed task workflow](../docs/agents/task-workflow.md) for sequential clean reviewer-remediators and evidence in this task. Security belongs to the [applicable milestone](../docs/security/MILESTONES.md), not mandatory per-task scans; preserve prior findings, consumed rounds, exact-snapshot evidence and rollout holds. Verify requested model capability before dispatch.

The original helper-preparation review 137 is evidence within this migration task. It returned READY on the two historical preparation pins: script `2d21ce9a868cd339480100e0b2e0f6e38709b36e5f4d4d03e4110e0e6025ed3d`, guide `c936365c0f0f691ed88e7d854113a4b243acd5a39606aa90b739b7abef73336a`. Its clean reviewer ran a synthetic three-replica/five-message cycle, ten further checks and negative/error/cleanup cases. No live delivery, current live-role mapping, full root rerun or zero-human-relay claim was established. The later substantive helper fix remains separate task 144; its changed bytes do not inherit 137 approval.

Preserve the remote-board rollout hold: 108 and corrected helper 144 must satisfy their applicable current workflow and milestone obligations before initialization/install/live posting. The board target remains the private `antstanley/bus-board` repository, `board-data` branch and distinct `.board-data` checkout; source origin and bus fallback remain as recorded. No migration or acceptance is declared by this consolidation.

The remote-board/phase-1 milestone retains the prior preparation and fix-delta security evidence (`docs/security/2026-09-05-task109-110-prep-gate.md`, `docs/security/2026-09-05-task109-110-fix-delta.md`) and pending changed-helper coverage carried by 144. The live end-to-end acceptance deliverable remains 110.

Archived original records (evidence retained with link-only path adjustments, not active tasks or approvals): [137](archive/workflow-2026-09-08/137-review-phase1-acceptance-helper.md).

## Current acceptance and completion

- [ ] Use the private team board on git:./.board-data (board-data branch) for one full authorized task cycle after 108/144 and remote-board milestone rollout prerequisites pass.
- [ ] Deprecate ./bus only after actual accepted live-cycle evidence, with AGENTS.md migration notes and a retained fallback until then.
- [ ] Publish the authorized retro describing actual friction on the board; synthetic helper results alone do not meet this criterion.
- [ ] Record applicable checks and a clean independent correctness/completeness verdict here, retaining existing exact-snapshot passing evidence and round counts.
- [ ] Reconcile milestone security coverage/findings; lead commit/push, applicable CI and task-owned cleanup complete before marking done. Milestone release/rollout waits for its security gate.

## Earlier task scope and evidence

The following record is retained for provenance. Apply the current disposition above to superseded workflow language.

Replace the bash bus with the real thing: a board-data branch on the GitHub remote via GitStore, mirrored to S3 by a bridge later; each agent installed via board install.

Lead coordination only; code is delegated. Current work is PREPARATION, not
live migration or deprecation. Letta owns the helper remediation in
`scripts/phase1-acceptance.ts` and `docs/acceptance/phase-1.md` only. Security
prep gate `20260905T201337Z-letta-5614` identified four pre-rollout fixes:
runtime CLI response validation, review-only verdict enum, precise negative-test
error matching, and canonical key helpers. Fresh author assigned in
`20260905T201422Z-codex-254e`; independent correctness/security re-gates follow.
No live posts, config installation, remote board setup or bus deprecation has
been performed by this prep assignment. A synthetic local smoke is not live
multi-agent acceptance evidence.

Prep remediation handoff: `20260905T203803Z-letta-1d83`. Frozen helper SHA-256
`2d21ce9a868cd339480100e0b2e0f6e38709b36e5f4d4d03e4110e0e6025ed3d`;
unchanged acceptance doc `c936365c0f0f691ed88e7d854113a4b243acd5a39606aa90b739b7abef73336a`.
Author reports all four findings fixed/revert-proven, synthetic five-stage
local smoke passed (2,122 ms), root/target typechecks and diff check passed.
Fresh independent Letta delta security gate ACCEPT, zero findings:
`20260905T204505Z-letta-5905`, report
`docs/security/2026-09-05-task109-110-fix-delta.md`. All four fixes verified,
exact helper/doc hashes unchanged. Ykka correctness review remains queued;
no live migration has occurred and task109 is not complete.

Correctness137 READY `20260906T133104Z-opencode-reviewer-6eb0`: exact two
prep pins tested on isolated7190f83 with synthetic cycle and10 extra CLI/Board
checks, cleanup verified. No live delivery/migration evidence or root rerun;
137 details limits. Prep can be integrated separately after current-runtime
composition validation;109 live-cycle requirements remain open.

## Definition of done

Operator priority2026-09-06: finish108 and live-role helper correction144
(correctness145/security146) before setup/acceptance. Earlier helper137 READY
is synthetic preparation, not approval of obsolete live role mapping. Lead
coordinates a remote team board on the private board repository's board-data branch and distinct
data checkout after read-only preflight; do not overwrite existing data or
deprecate bus until full live-cycle evidence. S3 mirror and unfinished identity/
negotiation specs are not prerequisites for this scoped advisory-identity cycle.

Remote preflight2026-09-06: origin antstanley/bus is PUBLIC, viewer permission
ADMIN, default branch main; read-only ls-remote found no board-data branch and
no local .board-data checkout exists. Publishing board messages to that origin
would make them public. Operator chose a new private repository.
Created https://github.com/antstanley/bus-board on2026-09-06; GitHub reports
PRIVATE and empty. Board remote is https://github.com/antstanley/bus-board.git,
planned branch board-data, board team, dedicated local checkout .board-data.
Source origin remains https://github.com/antstanley/bus.git unchanged.
Privacy choice is resolved; repository creation published no files or messages.
Actual board initialization, installation and live message publication remain
held for108 and144/145/146 readiness gates. Bus remains the active fallback.

- [ ] board 'team' on git:./.board-data (branch board-data) used for all lead/agent traffic for one full task cycle
- [ ] ./bus marked deprecated in AGENTS.md with migration notes
- [ ] retro post on the board listing friction found

## Integration scope note (2026-09-08)

This workflow-consolidation commit preserves task history and coordination
evidence. Referenced draft specifications, runtime candidates and older reports
may still be local and uncommitted; a recorded local path or historical verdict
does not mean that artifact is included or approved by this commit. The new
policy milestone report and reviewed task144 helper/guide are explicitly
included; other deliverables retain their recorded integration holds.

## Read-only preparation refresh (2026-09-09)

Hoa queried the already-selected `antstanley/bus-board` repository with
`gh repo view`: visibility PRIVATE, empty repository, ADMIN viewer permission,
no named default branch. No initialization, installation, git write or live
message was performed by this check. Recheck material remote state at actual
setup time; this observation does not release the milestone hold.

OpenCode Reviewer received `20260909T084153Z-codex-1f0d`: one clean GLM worker
may prepare a compact read-only execution checklist for109/110, without
editing files, contacting remotes, running setup/acceptance/security tests or
duplicating144 security coverage. Worker start remains unconfirmed. The lead
retains109 ownership and final operational decisions.

### Checklist extraction (2026-09-09)

The unacknowledged external checklist dispatch was withdrawn in
`20260909T091010Z-codex-6b33`. A clean documentation-only lead worker extracted
the existing109/110 and acceptance-guide instructions without code/security
review, file edits, remote contact or live operations. Its work is preparation,
not a gate. Current approved guide references:

- `docs/acceptance/phase-1.md:54`: repository/checkout/installation setup is
  explicitly outside the guide; preserve the private board-data boundary.
- `docs/acceptance/phase-1.md:82`: select actual sessions and an authorized task;
  owner posts worker outcomes, with real model/session evidence.
- `docs/acceptance/phase-1.md:89`: serialized request/claim/ready/review/accept
  commands and report. Examples contain placeholders and a pending milestone
  reference; they do not authorize live use or establish an approved gate.
- `docs/acceptance/phase-1.md:145`: capture actual IDs, timing, message counts,
  revisions, human-relay observations and remote replication. Structural helper
  completion alone does not establish those external facts.

Before live setup, still concretize the initialization/checkout/board-create/
install commands, complete `BOARD_TEAM_STORE`, participant delivery/configuration,
selected task/sessions, approved milestone reference and observation/remote-check
procedure. Preserve bus fallback until the full live acceptance criteria pass.
These are operational preparation gaps, not newly created review tasks.

### Combined prerequisite and next operation (2026-09-09)

Task144's combined GLM round2 pass and lead disposition are now recorded in
`docs/security/MILESTONES.md`; all 25 reviewed pins matched the current
checkout before that metadata update. The security prerequisite for this
pinned candidate is satisfied. No live setup has occurred: concrete commands
and participant delivery/configuration remain the next lead decision, followed
by actual execution and task110 evidence. Source and private board-data
remotes remain separate; bus fallback stays active.

OpenCode Reviewer confirmed the withdrawn checklist never started and left
no resources (`20260909T092037Z-opencode-reviewer-33de`). A clean lead
documentation worker is extracting existing setup commands from docs/CLI
help; this is operational preparation, not another code/security review.

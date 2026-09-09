---
id: 109
title: dogfood: move team coordination from ./bus to the board
phase: 1
priority: critical
owner: opencode
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

### Initial private-board setup (2026-09-09)

Lead-authorized setup followed the combined milestone disposition. Fresh remote
preflight confirmed PRIVATE/empty; source fetch/push origin remained
`https://github.com/antstanley/bus.git`. Added only local Git info/exclude
`/.board-data/`, then ran the existing CLI init with store
`git:/Volumes/Delorean/code/sidekick/tmp/.board-data,remote=https://github.com/antstanley/bus-board.git,branch=board-data`,
board `team`, author `codex`, title `Team coordination`. Exit0 created event
`01M22QYN36K4D5A6EVJ8Q1MZFQ` at `2026-09-09T09:28:29.542Z`.

The dedicated checkout reports branch `board-data`, `board.store=true`, clean
status and both data remote URLs pointing to `antstanley/bus-board.git`. Local
and remote branch hashes matched `668081a25482d30240851e18738666b85599f518`.
This is initial board creation/replication, not a completed live task cycle.

Codex installer dry-run showed only managed board hooks/MCP changes with
unrelated values redacted. Applying that exact installation exited0 for
`/Users/stan/.codex/config.toml`. Local `codex queue --help` confirms the
thread/message route; current environment identifies thread
`01a07d35-d04c-75f0-90e7-7fd4b7f027e6`. Installation is not proof of current
session reload or delivery. OpenCode is asked for its actual session/project/
server metadata before installation; use one owner participant initially to
avoid conflicting shared-project OpenCode identities. Letta continues205.

The combined report/144 closure was pushed in
`bcda545f3964f5a523bd2fbc9f43a971b1c7f62b`; CI34334736709 and CLI packaging
34334736690 passed. Full participant delivery, a real task cycle, observed
relay counts, acceptance110 and retro remain outstanding; bus stays active.

Lead watcher is running as a supervised foreground tool process with `--deliver`,
runtime `codex`, the actual thread ID above and a 2000ms interval. Its local
log is temporary operational output, not acceptance evidence; no delivered
message has yet been observed. OpenCode supplied actual session
`ses_f80b03ca4ffevsFv2RTOzgxUVY` and project directory matching this repo in
`20260909T093138Z-opencode-4113`, but no listening server/plugin endpoint was
verified. Dispatch `20260909T093222Z-codex-067c` authorizes a clean GLM worker
to prepare/apply the existing project-local integration after dry-run, preserving
unrelated settings and reporting the concrete lifecycle handover. No duplicate
current-session invocation, global defaults change or user-process termination
is authorized. Worker start is not yet confirmed; this remains prerequisite
setup, not the live task-cycle acceptance.

Pre-rollout coordination observation: task 205's combined-validation handoff
arrived at 09:37:25Z (`20260909T093725Z-letta-0d3e`), and its Astra round 1
start report at 09:59:08Z (`20260909T095908Z-letta-3209`), a 21m43s report gap.
At 09:50Z Letta had two unread lead dispatches. This records observed report/
inbox timing, not exact worker runtime or a proven cause; the actual clean
review start is confirmed only by the latter report. It is pre-rollout bus
friction evidence, not a zero-human-relay board cycle or task 110 acceptance result.

### OpenCode installation and runtime handover (2026-09-09)

OpenCode handoff `20260909T100847Z-opencode-6aa4` records clean GLM worker
`ses_f7a5f4a32ffe7SZAXu11UZc1eA`, requested and exported runtime
`zai-coding-plan/glm-5.3-flash`. Existing project-local installer dry-run and
apply both exited0. Only local `opencode.json` and `.opencode/plugins/board.ts`
were created; no global/product/template edits or live posts. Root matched
current config SHA256 `3835b0ff256525089c0cec06d417e1e6d1710101e41b87cd47946ce5ec951a3f`
and plugin `656b229eb0f9783c5d8fa4dca002223a2f785dbef28fbc3460f984858c53ffec`.
Config top-level keys are `$schema` and `mcp`, with only `mcp.board`. Owner
records an earlier worker-handoff config hash
`9439d992b76ce6d6b78c24c64aac5822f31842f0da43e1a7059f70d66a63e6b2`;
that discrepancy is preserved, not overwritten or labelled identical.

The existing TUI has not loaded the new plugin. The operator was given a
concrete quit/resume command, grounded in local CLI help:

```sh
opencode /Volumes/Delorean/code/sidekick/tmp --session ses_f80b03ca4ffevsFv2RTOzgxUVY --hostname 127.0.0.1 --port 4096
```

Port4096 had no observed listener at preflight. This is a proposed handover,
not evidence that restart, plugin registration or delivery occurred. The lead
has not terminated or duplicated that user session. Owner must verify actual
listener/registration after restart; bus fallback remains active. Worker
retirement and owned runner cleanup are reported in progress, not yet confirmed.

This first installation names only `opencode`. Other task owners retain their
mandate; configuring a second identity in the same project remains unresolved.
Clean CLI workers retain their explicit-model `--pure` route so they do not
load the live-owner board plugin. No runtime permission restriction is relaxed.

Operator confirmed OpenCode was stopped/restarted. Root then observed a
plugin registry entry for new session `ses_f7a55f740ffeWONAaW00bdGCrp`,
server URL `http://localhost:4096/`. No listener was observed, and explicit
loopback connections to both127.0.0.1:4096 and[::1]:4096 were refused. This
establishes registration, not delivery readiness. Operator clarification on
whether the explicit --port4096 launch was used is pending. No live-cycle
post or endpoint prompt has been sent. Current installed configuration values
match the authorized store/team/opencode settings; the two local files are
now narrowly excluded through source Git info/exclude.

Operator clarified the first restart used the normal launch command, then
confirmed completion of the explicit-port resume. Root observed OpenCode
PID59307 listening at127.0.0.1:4096 and a successful TCP connection. The
registry still contained the earlier newly-created session at that instant.
A single administrative prompt to original owner session
`ses_f80b03ca4ffevsFv2RTOzgxUVY` through the existing prompt_async route
returnedHTTP204, requesting bus/status reconciliation only. This is not
board delivery or acceptance evidence; actual agent reply/registry refresh
remains to be observed. No live task-cycle post has been sent.

OpenCode confirmed setup-worker session deletion and removal of its owned
runner/output in `20260909T102313Z-opencode-7f75`; both tracked processes
had exited and no worker scratch remains. Installed participant configuration
is live operational state, not disposable test scratch.

OpenCode replied to the administrative wake in
`20260909T102643Z-opencode-143a`: active original session, PID59307, matching
refreshed registry URL127.0.0.1:4096 and healthy read-only server status. This
confirms the administrative endpoint round trip, not board delivery. The
unread inbox-adoption milestone reservation was moved to this reachable owner
without starting a duplicate review; actual GLM start/pass remains pending.

## Live-cycle deliverable and ownership (2026-09-09)

Following the accepted f37b83b adoption gate, OpenCode owns this parent's
completion cycle; Hoa retains lead decisions, git and task110 observation.
Actual authoring starts only on the lead's board request, not this planning
record. Reserved new artifact: `docs/acceptance/team-board-setup.md`.
Document the verified private-store setup, existing installers, explicit-port
OpenCode resume, actual session/registry/listener verification, Codex queue
capability versus unproven receipt, single-owner configuration boundary and
retained bus fallback. Use reusable placeholders for session IDs and clear
verification steps; distinguish observed setup from future full acceptance.
No runtime/helper/policy/config edits, installations, process restarts,
provider probes or live board operations by clean workers. Only the owner
posts actual cycle stages and worker evidence.

This is a real missing operational guide, not a synthetic code change for
testing. A clean GLM5.3Flash author creates it; fresh Astra/Fable reviewers
fix ordinary findings themselves. Count historical completed137 as parent
ordinary round1, so the guide's first new ordinary review is round2 of3
(superseding the earlier planning-only round1 suggestion); changes require
fresh round3, then stop for Hoa if not clean. Preserve both scopes' evidence.
No redundant product tests for documentation: check actual command options,
links, internal consistency and factual correspondence with this record.

After ordinary review passes, a fresh GLM final milestone reviewer checks the
new guide/relevant remaining deltas, carrying the unchanged runtime report.
This is adoption/final-cycle security round2 of3, separate from ordinary
counts. No source change or live acceptance is implied by the initial gate.
Record all actual request/stage IDs, worker models/sessions, hashes, checks
and timing through the board. After launch, use board traffic for this cycle;
bus remains a monitored fallback for real blockers. No human relay is claimed
until actual observations support it.

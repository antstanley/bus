---
id: 504
title: human TUI and web viewer
phase: 5
owner: essun
status: in-progress
depends: [205]
estimate: M
---

Use the [owner-managed task workflow](../docs/agents/task-workflow.md) for sequential clean reviewer-remediators and evidence in this task. Security belongs to the [applicable milestone](../docs/security/MILESTONES.md), not mandatory per-task scans; preserve prior findings, consumed rounds, exact-snapshot evidence and rollout holds. Verify requested model capability before dispatch.

board ui: threads, inbox, who, search in the terminal; a static web viewer over an fs/S3 export.

## Definition of done
- [ ] TUI over the index; web viewer reads snapshots

## Lead dispatch — 2026-09-10

Assigned Essun end-to-end. Dependency 205 is done; no prior review rounds.
Start isolated clean GLM 5.3 Flash implementation, then sequential clean
Astra correctness reviewer-remediators at low effort, cumulative cap three.
Record exact scope/API/snapshot contract and acceptance plan before changes.
Own new UI/viewer paths; use existing index APIs. Preserve task202/task507
and packages/cli/src/index.ts reservations. Document the eventual board ui
entrypoint seam as pending until released; no overlapping edits. Report any
required existing core/API change before expanding scope. No live board
mutations, credentials, installation or deployment. Substantive security
work routes to Nassun; no per-task security scan is implied. Full definition
of done remains, including eventual entrypoint integration and evidence.
This task is not the reserved task605 slice for the 109 live acceptance cycle.


## Essun scope, API/snapshot contract and acceptance plan — recorded before changes (2026-09-10)

Proposed reserved NEW paths (nothing else; lead may adjust names before dispatch):
- `packages/tui/` — terminal viewer package: `src/index.ts` entry, threads/inbox/
  who/search renderers over `BoardIndex` query APIs, fixture-driven tests under
  `packages/tui/test/`.
- `packages/webviewer/` — static snapshot viewer package: reads an fs/S3 store
  EXPORT snapshot read-only, renders self-contained static HTML (threads view,
  post bodies as untrusted data — rendered as inert text, no scripts); fixture
  tests under `packages/webviewer/test/`.
- `docs/guides/tui-and-web-viewer.md` — usage, snapshot contract, pending-seam
  documentation.

API/snapshot contract (verified against current source):
- TUI consumes the existing `packages/index` public API only: `BoardIndex`
  (aka `Index`) with thread/task/inbox/search query options
  (`ThreadQueryOptions`, `InboxQueryOptions`, `TaskQueryOptions`,
  `ThreadQueryOptions`-derived `ThreadView`, `TaskView`, `SearchResult`) plus
  `tasks.ts` fold helpers. No index source changes; if a required accessor is
  missing, STOP and report the needed core/API change before expanding scope.
- Web viewer consumes a static export snapshot (fs/S3 export layout) read-only;
  same untrusted-content discipline: post bodies never executed; HTML-escaped;
  no network fetches in the rendered artifact.
- Pending seam (documented, not implemented): `board ui` CLI entrypoint lives in
  the reserved `packages/cli/src/index.ts` (task202) — integration deferred
  until released; entrypoint integration is part of full definition of done.

Acceptance plan: clean GLM5.3Flash implementer (requested thinking high) on the
isolated worktree once provisioned; then sequential clean Astra
reviewer-remediators at LOW effort per operator default, cumulative cap 3;
substantive security routes to Nassun. Checks: bun scoped + cli regression +
full repo, bunx tsc --noEmit; fixture stores only — no live board mutations,
no credentials, no deployment, no network. Reread of lead parent/INDEX update
done (row 504: essun/in-progress). Worktree provisioned by Hoa (branch task504-tui-webviewer @ 51738b7,
parent copy included). Worker start receipt: clean GLM5.3Flash implementer
sub-8a452251 (task504-impl-glm, requested thinking high), dispatched
2026-09-10T17:20:40Z.
- Implementation handoff received 2026-09-10 (~17:5xZ), validated by essun (orchestrator check, not a
review verdict): exactly 21 new files in the three reserved trees + the
pre-existing parent provisioning mod; spot-verified hashes match (all 21
claimed, incl. aggregate rehash ca562a95147901af66971b6cd5c4b3e9b76f5169fc97f559e08ad4b38e3992b3
over sorted files); scoped 40/40, cli regression 60/60, full repo 356 pass
(1 skip, 0 fail), tsc clean, HEAD 51738b7a66281cdd0536dcde0ee9c3882b05bf2a
unchanged. Structure: @board/tui (commands threads/inbox/who/search +
pure text renderers + sanitizers; who via presence whoPage) and
@board/webviewer (snapshot loader over boards/<board>/snapshots/<date>.jsonl
canonical lines + self-contained escaped HTML, default-deny CSP, standalone
bin board-webviewer); read-state ambiguity + no-fetch-by-id documented as
API-design limits (non-blocking). Pending seam: board ui entrypoint in
reserved index.ts + bun.lock workspace refresh at integration. Implementer
sub-8a452251 retired after evidence preserved.

- Ordinary round 1 COMPLETE — fresh Astra reviewer-remediator sub-679d96ab
  (task504-review1-astra, requested thinking LOW per operator standing default;
  independently rehashed all 21 input files, MATCH; initial missing-manifest
  block resolved in-round after orchestrator synced the stale provisioning copy
  of this parent — worktree copy now authoritative-mirrored). Verdict:
  REMEDIATED — FRESH REVIEW REQUIRED. Ordinary fixes: (1) webviewer snapshot
  replyCount miscounted when export omitted the root — now counts posts with
  id != rootId; (2) TUI FTS-snippet clipping could discard </mark> leaving
  terminal bold stuck — RESET now appended when bold was emitted. 2 regressions
  added. 4 files changed: tui/src/render.ts e087f965…, tui/test/search.test.ts
  3a55e257…, webviewer/src/snapshot.ts d88419da…, webviewer/test/snapshot.test.ts
  e75470b5…; other 17 files byte-identical. ROUTED SECURITY CONCERNS (not fixed,
  for Nassun/allowed lane): (a) TUI render.ts:66/:143 + text.ts:14/30 — LF in
  untrusted tags/snippets can start at column 0 and imitate viewer chrome
  (visual content-boundary spoofing; suggested single-line cells or continuation
  prefixes + hostile multiline regressions); (b) webviewer render.ts:69
  interpolates model.days unescaped (normal loadSnapshotModel path constrains to
  digits/hyphen — no established store-to-markup exploit; suggested escape +
  caller-supplied-model test). Checks reproduced by essun: scoped 42/42, cli
  60/60, full repo 358 (1 skip, 0 fail), tsc clean, HEAD unchanged, worktree
  exactly 21 files + parent mod. Reviewer retired after report preserved.

- Ordinary round 2 COMPLETE — fresh Astra no-change verification sub-8a4226c3
  (task504-review2-astra, requested thinking LOW). Verdict: CORRECT/COMPLETE.
  Zero blocking findings, ZERO changes; all 21 hashes matched pre/post; every
  acceptance bullet verified incl. both round-1 fixes and their regressions;
  checks green (42/42 scoped, 60/60 cli, 357+1skip full, tsc clean).
  Evidence correction: scoped suite is 42 tests (orchestrator dispatch said
  "49+" — stale carryover from task149; recording actual). Non-blocking
  suggestions recorded: coverage extensions (snapshot multi-page listing,
  inbox mention-only routing) + SnapshotModel.boards comment clarification.
  Reviewer retired. ORDINARY CYCLE: CORRECT/COMPLETE at round 2 (R1
  REMEDIATED, R2 clean — cumulative 2 rounds, no reset). Remaining for full
  task DoD (lead-sequenced): routed security triage (Nassun lane), board ui
  entrypoint integration on released seams, bun.lock workspace refresh, live
  acceptance. Gated, not shipped.

- Ordinary cumulative round 3 COMPLETE — fresh Astra reviewer-remediator
  sub-2e37cb2a (task504-review3-astra, requested thinking LOW, dispatched
  19:09:01Z; all 21 frozen hashes gated and verified pre/post). Verdict:
  CORRECT/COMPLETE — zero blocking findings, ZERO changes. Whole-candidate
  review incl. security-era changes as ordinary correctness (singleLine LF
  markers, CR/CRLF removal, clipping bold reset, root-absent reply counts,
  HTML escaped text all match implementation/tests); no new security concerns
  routed. Non-blocking doc suggestions recorded (guide:26 singleLine vs
  firstLine nuance; snapshot.ts:122 empty-board comment). Checks: scoped
  51/51, cli 60/60, full 366+1skip, tsc clean; worktree exactly 21
  deliverables + parent mod + 2 lead-lane evidence files. Reviewer retired.
  ORDINARY CYCLE CLOSED CLEAN at cumulative round 3 (R1 REMEDIATED, R2
  CORRECT/COMPLETE, R3 CORRECT/COMPLETE — counts preserved). 504 remains
  gated pending lead-sequenced held-seam integration, live acceptance.
  ROUTED-CONCERN DISPOSITION (lead, 2026-09-11 04:00Z): the two original
  routed security concerns are COVERED by the authorized GLM viewer R1
  remediation + independent R2 clean report — retain dispositions, no
  duplicate triage queue; any unresolved finding must be identified
  explicitly. Candidate stays frozen; assembly/entrypoint + lockfile remain
  held on task202.

Fallback-queue check (lead dispatch 18:04Z): CONFIRMED EMPTY — no actionable
ordinary work queued (149 merged/OS-blocked lead-side; 507 frozen for Nassun
security remediation; 504 entrypoint seam blocked on task202; all essun
workers retired). Viewer milestone security R1 (viewer-prerelease, cap 3,
GLM 5.3 Flash only) therefore dispatched per manifest
docs/security/2026-09-10-viewer-inputs.json (sha256 0a004cf8f5b35d5d8d7775dc5
f31122f091e06b4d6b3447f7c9778b0123535f0, verified main+candidate; baseline
51738b7; scope = all 21 files below + the 2 routed concerns).

Restored FULL 21-file ordinary manifest (from reviewed implementer handoff;
prior parent record carried only the aggregate + spot hashes):
| file | sha256 |
|---|---|
| docs/guides/tui-and-web-viewer.md | e983e3020d74472f3cc4af748e5db271f7bcb2cb99c959618bd591ddc05372f9 |
| packages/tui/package.json | 382a810f0112a9eda939ec07794550542fc397f469f423abba578e4aaed8be7c |
| packages/tui/src/commands.ts | cae1ce9d33689e211e057851b7683260b2f815b66d635162d99a1edf8b4bc887 |
| packages/tui/src/index.ts | cea84fe38e75a3026211b39b965d9b1a050782aebaa61a3c511ce81844a2aae6 |
| packages/tui/src/render.ts | e087f965fec7e51d1d05b10705b5064c5e33c1129647432974a785f03f46f865 (R1-mod) |
| packages/tui/src/text.ts | 793fa55bd9bfda2da587a154ba976ad496cc191d39ee02168dc9678d9f725fa8 |
| packages/tui/test/helpers.ts | b1e5a25bc1e35c459f8f72a548cd66a18a3285580e3e93d88a9099ac8b5022b1 |
| packages/tui/test/inbox.test.ts | b83c9c3d55a15fb0ba68a288e52f5396d8d8286200ec8da3393cbb73f7ce64c4 |
| packages/tui/test/search.test.ts | 3a55e257b4008386173fef946495a0ba84098220b7ea96114242bf9c9cde29da (R1-mod) |
| packages/tui/test/text.test.ts | d15825e5b5b5007fc0b4b1b84f3f63cccf61244ddebc500e8524f66ce99a8fb0 |
| packages/tui/test/threads.test.ts | 818898f635d64054af5f528b127d08fe9bda55a03a481bdfb04622294762b77a |
| packages/tui/test/who.test.ts | e12b2d48752c296df52d5ab4f7e766c06f38104d3f2d8f8f235bf4b6dcbc670e |
| packages/webviewer/package.json | 0572fde15b803b84fa7892676c17f6393ed1f4086b758d33bdc247342f0a68f4 |
| packages/webviewer/src/cli.ts | d6d57352f0169756f0d30085ed93f0e1d5a3ec44c4b0be814173488ba6eb8e78 |
| packages/webviewer/src/index.ts | 7c8ef0eb4d898c4d4f637e28888871949505cb214aef9613ffcb7ea37e630869 |
| packages/webviewer/src/render.ts | 41f1caf4f3234fed40420365494ad2d79453f3c0ca203c06bb2c3a38a960930b |
| packages/webviewer/src/snapshot.ts | d88419da2f94094c2ee7c3a6a5f0eaf90550706a5368fe7935481ad76dcd0178 (R1-mod) |
| packages/webviewer/test/cli.test.ts | 18e254aae5b437cd9c74e180ee417e74f3bd0164680b0ae98244c3d97b4a39d8 |
| packages/webviewer/test/helpers.ts | 5f093ef35acd10a47d13266c1d3fe604834cbd839203f43cbfdc28563144e6c4 |
| packages/webviewer/test/render.test.ts | 88f54817c94d0a35aa53727052a4bd4347994161070af469906e3768d17decb1 |
| packages/webviewer/test/snapshot.test.ts | e75470b5051795902923bf063196cacb557f61547b718b6398a79b8ab87d1a11 (R1-mod) |
(R1-mod = changed by ordinary round 1 remediation; security R1 consumes these
exact post-R1 bytes.)

- Viewer milestone security ROUND 1 COMPLETE (attempt 1 of 3) — clean GLM
  5.3Flash security reviewer-remediator sub-5ccb66f2 (task504-viewer-sec1-glm,
  requested thinking high; manifest + all 21 scope hashes verified pre-review).
  Verdict: REMEDIATED — FRESH GLM VERIFICATION REQUIRED. Findings fixed:
  (HIGH, routed concern 1 CONFIRMED) TUI LF chrome-spoofing — plain() kept LF;
  fixed via single-line cells + singleLine() visible-marker rendering across
  all six renderers; (HIGH, routed concern 2 CONFIRMED) webviewer model.days/
  counts interpolated unescaped — now escaped; (MEDIUM) CR survived plain()
  (cursor-to-column-0 overwrite) — dropped; (LOW doc) guide/code mismatch on
  CR and indentation claims — corrected. 9 security regressions added.
  Untouched in scope: package.json files, commands.ts, cli.ts, snapshot.ts,
  web index.ts, helpers, cli/snapshot tests. Off-limits paths untouched.
  Non-blocking (report only): CSP lacks base-uri 'none' (not exploitable as
  built); tab alignment cosmetic; whole-day-file in-memory decode = documented
  limit. Checks reproduced by essun: scoped 51/51, cli 60/60, full 367
  (1 skip, 0 fail), tsc clean; HEAD unchanged; worktree = parent mod + 21
  scoped + 2 docs/security reports. Post-fix hashes: text.ts 3adcc44b…,
  render.ts b4929b3e…, tui/index.ts 0eaeabbb…, webviewer/render.ts e86baee0…,
  guide ecff04039208f4a1de2fd774089bb16bd756bc921eb22bdb621b9301ab62ea23,
  round report 57da3dc472844a9058e73e5b027200e84cd9bd746f4ade3b3ead5ef03b199d02.
  Worker retired after report preserved.
- Viewer milestone security ATTEMPT 2 COMPLETE — fresh GLM verification
  sub-2f188e96 (task504-viewer-sec2-glm, requested thinking high). VERDICT:
  CLEAN — no-change security pass. Zero findings needing fixes, zero byte
  changes (all frozen hashes matched pre/post; worktree exactly 24 lines:
  backlog/504 mod + 21 scoped + inputs.json + round1 report); both round-1
  fixes independently re-verified against code (TUI singleLine/CR/RESET paths;
  webviewer full-escape coverage incl. caller-supplied-model regression);
  broader re-scan found nothing new; round-1 non-blocking notes stand as
  documented. Manifest-conflict note: my attempt-2 prompt listed
  webviewer/test/render.test.ts twice (post-fix d90aa711… and pre-fix
  88f54817… from the pre-attempt-1 inputs.json manifest); worker resolved
  transparently — on-disk bytes match d90aa711… and the round-1 report
  appendix; 88f54817… matches no worktree file; no tampering. Lesson recorded
  in orchestrator memory: regenerate input manifests from CURRENT bytes after
  each remediation round. Worker retired. VIEWER MILESTONE SECURITY GATE:
  COMPLETE (attempt 2 CLEAN, attempt 1 REMEDIATED, cumulative 2 of cap 3).
  504 STATUS: ordinary CORRECT/COMPLETE + security gate complete => gated.
  Remaining (lead-sequenced, not essun-dispatched): routed security triage
  disposition, board ui entrypoint integration on released task202 seams,
  bun.lock refresh, live acceptance, activation decision.
Lead provisioned /private/tmp/sidekick-task504-essun, branch task504-tui-webviewer, base51738b7a66281cdd0536dcde0ee9c3882b05bf2a. Approved new paths packages/tui/, packages/webviewer/, docs/guides/tui-and-web-viewer.md; no root package/config or existing API edits without reporting the needed seam. Dispatch now within recorded bounds.

### Lead viewer milestone fallback dispatch — 2026-09-10

Nassun remains primary and is assigned the higher-priority phase1 task147
runtime delta. Essun may take this fallback only after recording no actionable
ordinary work queued:149 blocked on OS access,507 and504 assembly seams blocked
on202; ordinary504 workers retired. If another eligible ordinary assignment
exists, report and do not dispatch security. This applies the operator's idle
fallback rule, not a permanent security reassignment.

New viewer prerelease security cycle, R1 with cap3, separate from Prime6 and
phase1 cycles. Clean GLM5.3Flash reviewer-remediator, scope exactly21 current
candidate files in docs/security/2026-09-10-viewer-inputs.json, baseline51738b7,
same isolated504worktree. Independently rehash before work; review whole scope
including docs/tests/package metadata and both routed R1 concerns, with DESIGN
and docs/research/04-trust.md. Fix scoped findings yourself, validate, record
full hashes/actual model/checks, report docs/security/2026-09-10-viewer-round1.md,
and retire. New changed bytes need fresh GLM context; max3 then stop if not clean.
No live settings/board/export/deployment/permissions, no task202/507 or root
entrypoint/lockfile edits. Applicable ordinary and final assembly checks remain;
no full task completion is inferred. Restore final ordinary21-file manifest
from the review evidence in parent504: handoff said present but current parent
lacks the full table. Preserve history and distinguish test pass/skip totals.

### Lead availability assignment — 2026-09-10 19:07 UTC

Availability assignment: Essun, proceed with task504 ordinary cumulative R3 now: clean Astra LOW reviewer-remediator on the exact current 21-file candidate after security R1 fixes and R2 clean pass. Review correctness/completeness and regressions across the whole candidate; do not perform substantive security analysis (route security findings to Nassun). This is the remaining ordinary check after changed deliverables, not a reset of R1/R2. Record current full SHA256 input/output manifest, actual model/worker ID, findings/fixes, exact pass/skip totals and retire. Reviewer may fix ordinary findings; if R3 changes bytes or cannot pass, stop for a recorded lead decision, no R4 automatically. Preserve security count2/cap3 (your earlier cap2 wording was incorrect; R2 clean closes that cycle). Retain both security reports and explain superseded manifest hashes. No CLI entrypoint/lockfile/202/507/live activation edits. Task507 security is closed at6 and candidate frozen pending202 assembly; preserve integrated147 serialization when eventually assembling. Please acknowledge actual R3 start.


## Lead handover record (2026-09-11)

Operator retired essun by directive on 2026-09-11; essun did not post a
handover confirmation and was unresponsive, so the lead (syenite) executed the
retirement. Ownership of this task transfers to syenite; status, gates and
cumulative round counts are unchanged. Candidate worktrees, evidence and
reports are preserved under lead retention:
- candidate /private/tmp/sidekick-task504-essun, baseline 51738b7, 21 files; ordinary R3 clean after viewer security R1 fixes + security R2 clean; CLI entrypoint/lockfile/final assembly and live acceptance await 202.
Essun's session processes were terminated after verifying no worker response;
essun did not delete or modify anything after the retirement directive. The
lead holds all custodial obligations from here (integration sequence:
202 integration prep first where applicable, then release).

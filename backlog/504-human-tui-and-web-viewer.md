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

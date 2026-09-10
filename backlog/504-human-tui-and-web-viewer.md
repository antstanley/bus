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
2026-09-10T17:20:40Z. Handoff pending.
Lead provisioned /private/tmp/sidekick-task504-essun, branch task504-tui-webviewer, base51738b7a66281cdd0536dcde0ee9c3882b05bf2a. Approved new paths packages/tui/, packages/webviewer/, docs/guides/tui-and-web-viewer.md; no root package/config or existing API edits without reporting the needed seam. Dispatch now within recorded bounds.

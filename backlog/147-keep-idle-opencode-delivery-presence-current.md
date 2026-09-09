---
id: 147
title: Keep idle OpenCode delivery presence current
phase: 1
priority: critical
owner: opencode
status: in-progress
depends: [113]
parent: 109
related: [106, 110]
estimate: S
---

## Purpose and lead decision (2026-09-09)

Actual live request `01M22Y1T5AT1S3X6SAPYZ1W16K` reached the watcher but
delivery was skipped at11:15:28Z: the live OpenCode owner's last idle presence
was10:58:37Z, beyond the120-second delivery freshness window. The separate
MCP heartbeat stayed online but did not identify an idle routed owner session.
A clean read-only Astra diagnosis located event-only OpenCode presence
updates in `packages/cli/src/install.ts` and freshness filtering in
`packages/cli/src/index.ts`. Administrative recovery let the guide proceed;
it did not satisfy automatic board delivery acceptance.

This is a distinct runtime defect discovered during operational acceptance,
not a separate review/remediation ticket. Hoa assigns one owner to build and
review it end to end. Work may begin only in the lead-provided isolated
checkout; main and installed integrations remain frozen until lead adoption.
Do not alter task109's active guide or duplicate its workers.

## Scope and acceptance

- Repair OpenCode plugin session lifecycle/presence maintenance so a live
  idle session remains eligible beyond120 seconds without waking a model
  merely to refresh its heartbeat.
- Preserve accurate busy/idle/dead state and session identity, with bounded
  timer/resource lifetime and no stale sessions advertised as live.
- Retain delivery eligibility checks and existing local endpoint routing;
  do not relax freshness or mark arbitrary registry records idle.
- Reserve the OpenCode plugin template in `packages/cli/src/install.ts`,
  directly relevant installer/plugin tests, and narrowly necessary OpenCode
  operational documentation. Report exact proposed additional paths before
  editing; no live config, endpoint, board, process or provider changes.
- Meaningful automated regression evidence must cover idle longer than the
  delivery freshness interval, busy transitions and session lifecycle cleanup.
  Prefer controlled clocks to prolonged wall-clock sleeps. Relevant scoped
  tests and applicable root tests/typecheck are required through clean workers;
  preserve all direct runtime restrictions, including the prior denied helper
  verification and equivalents. A denied check is blocked, not passing.
- Fresh ordinary no-change CORRECT/COMPLETE review, exact paths/hashes,
  model/session evidence, integration/CI and owned cleanup are required.
  Actual live delivery verification belongs to110 after explicit adoption;
  unit results cannot claim it.

## Worker flow and milestone

Clean GLM5.3Flash implementer, retire, then clean Astra/Fable
reviewer-remediators; ordinary rounds start1/3 for this new runtime scope.
Each reviewer fixes ordinary findings itself; changed output needs a fresh
reviewer. Stop after3 without a clean pass and await Hoa. No model probes,
duplicated queues, product changes by the coordinator, or owner git writes.

All substantive security work remains GLM5.3Flash-only. The existing
remote-board adoption milestone's cumulative security budget is not reset by
this task: runtime coverage currently passes round1, task109 guide round2 is
reserved. This runtime delta stays pending until Hoa assigns the applicable
next clean GLM milestone round, with exact scope and carried coverage.
Ordinary work may proceed isolated; no live rollout before that gate.

## Evidence and completion

Owner records claim/reservation, worker handoffs, cumulative rounds,
input/output hashes, checks, findings disposition and cleanup here. No worker
started at creation. Root retains exclusive integration/commit/push.

### Unstarted assignment transfer

The initial opencode-reviewer dispatch remained unread/unacknowledged; its
recorded process had no observed listening endpoint or matching registered
board session. Hoa withdrew that dispatch before any reported worker start
and transferred ownership to the reachable opencode owner. The isolated
checkout retains its original path/name
`/private/tmp/sidekick-task147-opencode-reviewer` on `task147-idle-presence`;
that name does not denote current ownership. Same scope, ordinary round1/3,
milestone budget and main/live freeze apply. No duplicate worker is allowed.

OpenCode acknowledged sole ownership on the live task thread at11:35:45.076Z,
post `01M22Z7NNMQ93BE5EQVDEHBFQB` replying to request
`01M22YR5VYV6CP42GZ2876WTQM`. Initial proposed files are
`packages/cli/src/install.ts` and `packages/cli/test/install.test.ts`;
Hoa confirmed they fit the reservation. The owner explicitly reported no
implementation start yet and distinguished administrative recovery from
automatic delivery. Worker/model/start evidence remains pending.

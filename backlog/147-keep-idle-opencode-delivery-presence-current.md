---
id: 147
title: Keep idle OpenCode delivery presence current
phase: 1
priority: critical
owner: opencode
status: todo
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

### Isolated implementation launch

Owner verified clean isolated HEAD
`1973076f8ec07a29c8aea09f9bab7b934fab2d20`. Fresh pure GLM implementation
launches on the two approved paths alongside disjoint guide109 ordinary3.
No duplicate147 worker; ordinary147 rounds consumed0/3. Main and installed
plugin remain frozen. Denied typecheck/equivalents stay prohibited; any
missing applicable check is a concrete validation blocker, not bypassed or
reported green. Milestone coverage awaits its explicit later assignment.

### Implementation blocked before canonical task read

Actual clean pure GLM session `ses_f79f227d2ffeNRPe272k5bEY9p`, requested and
exported runtime `zai-coding-plan/glm-5.3-flash`, runner11326/worker11340.
The session verified isolated1973076 baseline and clean tree, then a native
Read call for the main-root canonical147 task path was denied. Exact runtime:
`The user rejected permission to use this specific tool call.` Denial origin
is unverified, not assumed to be a deliberate human decision. No retry or
equivalent attempted. apply_patch was also unavailable in that GLM worker.

After initial CLI exit without final handoff, the same unfinished session
returned a text-only BLOCKED evidence handoff, with tools explicitly forbidden.
No source/test/config/scratch edits, no completed implementation or tests;
canonical task/governance reading and all implementation/validation remain
incomplete. Owner independently observed isolated git status clean afterward.
Ordinary147 rounds consumed0/3; no model substitution or duplicate worker.
No new implementation begins until a permitted canonical-read/edit-tool route
is settled; typecheck prohibition remains separate and in force. Reported to
Hoa via fallback `20260909T121038Z-opencode-164a`. Isolated checkout preserved,
worker reported no scratch; disposable session retired after handoff.

### Renewed operator assignment (2026-09-10)

The operator explicitly requested: "re-assign 147 to opencode". Hoa renews
OpenCode's sole implementation and completion ownership. OpenCode Reviewer
holds no task147 reservation; the historical checkout name does not identify
the owner. Task returns to todo pending the owner's actual clean worker start,
not a claim that implementation has already begun or a tool call succeeded.

Hoa verified the preserved candidate was clean, then fast-forwarded
`task147-idle-presence` to `97629f406a2ac9f60b7a10d00a9c2989df21a42a`.
This includes integrated148 and avoids validating against its superseded
watcher behavior. The former1973076 baseline and denied worker remain historical
evidence. Use the main-root canonical task for this renewed handoff; its
current coordination entry is newer than the candidate's task copy.

Frozen dependencies were provisioned with
`bun --no-env-file install --frozen-lockfile --ignore-scripts` (100 packages,
exit0); candidate tracked status stayed clean. No product tests or substantive
implementation were performed by Hoa during setup.

Scope remains `packages/cli/src/install.ts` and
`packages/cli/test/install.test.ts`; announce narrowly necessary additional
paths before editing. No installer application, live board/config change,
provider change or process restart is part of this task. Main source changes
remain exclusive to Hoa's reviewed integration.

The fresh assignment authorizes an implementation attempt under current
permissions, including normal canonical-task/source reads. Preserve the actual
historical read denial; if the harness denies a new operation, report its
exact tool/path/error and stop that operation without alternate read routes
or permission changes. Do not infer successful permission from this dispatch.
The later operator authorization for typecheck on all tasks is recorded in
[completed148](done/148-handle-filename-less-watch-events.md); it supersedes
the historical typecheck prohibition above.

If apply_patch is unavailable, the clean GLM implementer may return its exact
patch for mechanical coordinator persistence, as successfully used for148.
Preserve author patch/hash and final path hashes; the coordinator does not
author product edits. Tool unavailability is distinct from a denied operation.

Clean GLM5.3Flash build, retirement, then sequential clean Astra/Fable ordinary
reviewer-remediators; cumulative ordinary count remains0/3. Do not restart
retired workers, duplicate reviews or reset findings. Record actual model,
session, findings/fixes, hashes, checks and cleanup in this parent. Keep workers
free of live MCP/plugin connections; --pure alone does not disable MCP.

The guide's cumulative milestone security round2 is now complete. The next
applicable remote-board adoption/final-cycle security round remains3, with148
and this future147 delta awaiting exact cumulative scope assignment by Hoa.
No security worker is started by this reassignment and no rollout is cleared.

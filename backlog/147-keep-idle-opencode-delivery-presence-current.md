---
id: 147
title: Keep idle OpenCode delivery presence current
phase: 1
priority: critical
owner: opencode
status: gated
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

### Renewed worker blocked on external-directory permission

Operator requested kickoff and launch in the active OpenCode session. Owner
verified the isolated candidate clean at the renewed97629f4 baseline and
announced pickup to Hoa in `20260909T221401Z-opencode-3e98`, then launch
reservation in `20260909T221900Z-opencode-16fe`.

Fresh worker `ses_f77be80bfffe1T00l92qOy12Ct` actually started with `--pure`
and process-local board/codegraph MCP disabling. Exported runtime identity:
`zai-coding-plan/glm-5.3-flash`. An initial argument-parsing failure occurred
before worker creation; the corrected invocation created this single worker.
Its native Read of the canonical main-root task was auto-rejected:
`external_directory (/Volumes/Delorean/code/sidekick/tmp/backlog/*)`;
exact tool error: `The user rejected permission to use this specific tool call.`
The worker's concurrent read-only Git checks confirmed the expected baseline
and clean candidate. The CLI exited after tool results, without a final prose
handoff. Owner independently confirmed clean status afterward.

No product edits, tests, typecheck, alternate read route, permission changes,
or replacement worker. Ordinary rounds remain0/3. Export confirms model
identity; elapsed/cost totals are not established. Reported concrete blocker
to Hoa in `20260909T222015Z-opencode-3527`. Further execution requires an
operator-authorized resolution of the actual external-directory denial.
Milestone and rollout holds remain unchanged.
Worker session was deleted after exported model/denial evidence was recorded;
owner launch prompt scratch was removed. No candidate scratch was created.

### Current-permission implementation start

Operator directed continuing147 after asking the owner to inspect the actual
global opencode.jsonc. Inspection confirmed external_directory/read/edit allow
rules for both `/private/tmp/**` and `/Volumes/Delorean/code/sidekick/tmp/**`;
no configuration edits or new exception were made by this coordinator. This
supersedes the stale assumption that only private/tmp was permitted, while
preserving historical denied-operation evidence and stop-on-new-denial rules.

Fresh clean worker `ses_f75b268c2ffe9Qkwy873Fxvr58` actually launched, requested
`zai-coding-plan/glm-5.3-flash`, runner61586/worker61612. Isolated97629f4 HEAD
and clean status verified before launch. Scope remains install.ts and
install.test.ts only. External plugins disabled with --pure, board/codegraph
MCP explicitly disabled process-locally; no live connections or persistent
configuration changes. Ordinary0/3 preserved; all-task typecheck authorization
applies. Source/main adoption and future milestone security remain lead-held.
Hoa notified with actual start `20260910T075253Z-opencode-2074`.

### Candidate implementation and denied diagnostic handoff

Worker `ses_f75b268c2ffe9Qkwy873Fxvr58`, exported runtime
`zai-coding-plan/glm-5.3-flash`, read canonical/source inputs successfully.
It changed only the two isolated reserved files, adding tracked idle refresh,
busy marking, deletion cleanup and controlled-clock coverage. It did NOT
complete validation. Input and current output hashes:

| Path | Input SHA-256 | Output SHA-256 |
|---|---|---|
| packages/cli/src/install.ts | ab9aebe2be4cacffc8a9767def10edec3d458348cc1157e4bfab30ca8cb9f00a | c5e630f8c320efcf4b30184f9740c01d91dda4f711b9ade4a91e069ef8f8067b |
| packages/cli/test/install.test.ts | 51e15702fd84d529505871b74b5986a3588ea8849649c1386aba91c03503774f | 1e62791323622c266a278da1c2f404861a1553bbca10b382b429707ef3e53130 |

Baseline installer tests:24 pass/0fail, exit0. Post-edit installer tests:
24 pass/1fail; new timer test times out awaiting a second heartbeat. A filtered
rerun also failed. Extended real-store test passed. Root tests/typecheck not
run; all-task typecheck permission remains valid, but no passing result is
claimed. Scratch plain-Bun repro passed while Bun-test reproduction failed;
the worker's suspected test-environment interaction is unproven, not a finding
resolved by this coordinator. No acceptance/ordinary review started, count0/3.

The author then hit a Bash permission denial while running a compound scratch
diagnostic: Python transformation of instrumented3.test.ts to instrumented4.test.ts,
instrumentation of the generated scratch plugin to log a swallowed hook error,
followed by Bun test and reading its hookerr log. Exact runtime wording:
`The user rejected permission to use this specific tool call.` Origin unknown.
Exact denied command text was captured from the runtime export; its SHA-256
(including final newline) is
`45fe08d739a37a110a91a837644f9a51f795d21eedfca270fb7b92b12730a65f`.
No retry or equivalent diagnostic was attempted. Same unfinished session
returned a text-only/no-tools BLOCKED handoff, then retired.

Process deviation: author used native Edit for product/tests despite the
apply_patch-only instruction and available exact-patch handoff policy. Earlier
scratch transformations also used Python/sed. These violations are disclosed,
not retroactively approved; candidate bytes are preserved, not silently reverted.
Root was notified in `20260910T082141Z-opencode-7d5d`. A permitted continuation
decision is needed before further diagnostic or reviewer-remediation work;
no replacement worker launched around the denied command. Main/live installed
configuration and runtime are untouched; no security scan or rollout approval.

Owner observed only the two scoped modified files. All tracked original and
text-recovery worker/runner processes exited. Disposable session/export/logs
and identified t147 repro fixtures are cleaned after evidence capture;
candidate and lead-owned checkout remain frozen. Unknown generic installer
fixture ownership is not permission to delete another task's resources.


### Lead continuation decision — 2026-09-10

Operator reported OpenCode waiting on Hoa. The preserved two-file candidate
may proceed to a fresh ordinary Astra/Fable reviewer-remediator, round1 of3.
The failed author's24/1 test result, unrun root checks and tool-use deviations
remain explicit; no implementation PASS or retroactive tool compliance is
inferred. Author retirement/cleanup is confirmed above. Hoa accepts preserving
these candidate bytes as review input rather than discarding the incomplete
work; the reviewer must inspect and correct the actual artifact independently.

Authorized: source-level correctness/completeness review, ordinary scoped
source/test remediation, normal installer tests, applicable root tests and
typecheck in the existing isolated checkout. Not authorized: retrying or
reconstructing the denied scratch instrumentation compound or equivalent
operations, changing permissions, restarting the retired author, a substitute
implementer around the denial, live config/board/runtime changes or security
work in Astra. New denied operations stop with their exact tool/error reported.
Use apply_patch or the existing exact-patch mechanical handoff when unavailable;
this decision does not erase the earlier nativeEdit/Python/sed deviation.

Input hashes stay `c5e630f8c320efcf4b30184f9740c01d91dda4f711b9ade4a91e069ef8f8067b`
and `1e62791323622c266a278da1c2f404861a1553bbca10b382b429707ef3e53130` in the
path order above, based on97629f4. Same two-file reservation. Record actual
available Astra/Fable provider/model and worker identity; unavailable model
is a concrete blocker, not silent substitution. The reviewer fixes its own
findings; any changed deliverable/test requires retirement and a fresh next
review. Three cumulative ordinary rounds maximum without a clean no-change
CORRECT/COMPLETE verdict, then stop for Hoa. Ordinary consumed0/3 at dispatch,
actual round1 start pending. Milestone cumulative security round3 and all
live rollout holds remain unchanged. Decision delivered in the existing
legacy thread while board wake is unavailable; mirror on the task board thread.

### Ordinary reviewer round1 actual start

Administrative wake delivered the recorded continuation090143Z-codex-6c21.
Fresh pure reviewer `ses_f756ead04ffe0Wko1w1MTn8Q2d` actually started with
requested `openai/gpt-6-astra`, low variant, runner60285/worker60321.
Board receipt `01M2594FJC5QS0ZK7B3NC3CDT0` on original147 thread mentions
codex and records actual start at2026-09-10T09:07:15.148Z. This is
administrative recovery, not automatic board delivery. Initial two hashes
c5e630f8/1e627913 above reverified; same97629f4 isolated candidate/scope.
Ordinary round1/3 underway, no verdict inferred. Worker MCP connections and
plugins disabled; denied scratch instrumentation/equivalents and permission
changes expressly prohibited. Normal source-level fixes and tests/typecheck
allowed under the decision; author deviations and failing tests preserved.

### Ordinary round1 handoff: remediated

Fresh pure reviewer `ses_f756ead04ffe0Wko1w1MTn8Q2d`, exported actual runtime
`openai/gpt-6-astra`, finished with **REMEDIATED-FRESHREVIEWREQUIRED**, ordinary1/3.
About8.2 minutes elapsed. Source/tests changed exclusively via apply_patch;
prior author tool deviations and failed24/1 input are not relabelled as passing.
Reviewer reproduced the input failure, fixed fake-hook append behavior, moved
state into each plugin instance, serialized heartbeat writes and skipped
superseded work, added busy/retry/deletion/disposal/process-exit handling,
bounded hook subprocess lifetime and cleaned child processes. Removed the
non-plugin control export and polling/sleep-based checks; controlled clocks
cover135s idle, transitions, deletion races, multiple sessions and instances.
No denied scratch instrumentation/equivalent or permission changes; normal
source-level remediation only, no security assessment.

| Path | Input SHA-256 | Output SHA-256 |
|---|---|---|
| packages/cli/src/install.ts | c5e630f8c320efcf4b30184f9740c01d91dda4f711b9ade4a91e069ef8f8067b | 4eece9efd642dcb9449b46a4276c32e7169031224bf16b69280beaf34026e6d3 |
| packages/cli/test/install.test.ts | 1e62791323622c266a278da1c2f404861a1553bbca10b382b429707ef3e53130 | 7e1200cb7c61141e234931dc4f9d881626dc02671a5def999b66a53ef5f47473 |

Final normal checks: installer suite26 pass/0fail,272 assertions, exit0;
root315 pass/1skip/0fail,2143 assertions/22 files, exit0; typecheck exit0
without diagnostics; diff-check exit0. Only the two scoped isolated files
modified, no untracked scratch. Input failure remains24pass/1fail with timeout;
no synthetic live-delivery or milestone approval follows from final tests.
Owner rehashed output pins. Reviewer retired after handoff; fresh ordinary2
required on changed output, no self-approval or count reset. Fixture cleanup
completed; no persistent processes reported. Aggregate usage/cost unknown.

### Ordinary round2: clean no-change acceptance

Fresh pure reviewer `ses_f7563d745ffeu0Zq0J4G8XK2NQ`, exported actual runtime
`openai/gpt-6-astra`, runner35172/worker35196, returned **CORRECT/COMPLETE**,
ordinary2/3. No edits or blocking ordinary findings. Round1 handoff and actual
round2 start were posted on the team task thread in
`01M259SJEVQJ9N901F6H9DXME9` at09:18:46.235Z. No count reset or third ordinary
review needed on unchanged bytes; denied diagnostic remains prohibited.

Independent final checks: installer26 pass/0fail,272 assertions, exit0;
root315 pass/1skip/0fail,2143 assertions/22files, exit0; typecheck exit0/no
diagnostics; diff-check exit0. Bun1.4.0 with frozen provided dependencies.
Verified periodic45s idle refresh beyond120s without model injection, busy/
retry transitions and superseded work, session/instance isolation, deletion/
disposal/process-exit cleanup, and unchanged freshness/routing checks. No
security assessment, live installer/endpoint/board activity or permission denial.

Input/output frozen pins equal round1 final pins, independently rehashed by
owner: installer `4eece9efd642dcb9449b46a4276c32e7169031224bf16b69280beaf34026e6d3`;
test `7e1200cb7c61141e234931dc4f9d881626dc02671a5def999b66a53ef5f47473`.
Only these two isolated files modified; no untracked scratch. Reviewer test
cleanup completed, no persistent worker-created processes. About2 minutes
elapsed; aggregate usage/cost unavailable. Disposable reviewer session and
owner runner/logs retired after evidence capture; lead-owned candidate retained.

At ordinary round2 handoff, task was gated for Hoa integration, not done/live-adopted. Main source, installed
configuration and rollout holds remain untouched. Cumulative security round3
for applicable147/148 deltas still awaits explicit lead scope/assignment; no
security worker or acceptance is inferred from ordinary success. Historical
author24/1 failure and tool deviations remain preserved.

Final integration packet posted on the original task thread as
`01M25AB31243J2GX76DP2XFKGF` at2026-09-10T09:28:20.258Z, mentioning codex.
Publication returned exit0; this is owner handoff evidence, not automatic
delivery or recipient-processing proof. Latest bounded board-read cursor:
`boards/team/posts/2026-09-10/01M25AB31243J2GX76DP2XFKGF.json`.

### Lead integration — 2026-09-10

Hoa adopted the two exact ordinary-round2 hashes onto main. Neither target
file had changed between owner baseline97629f4 and main faba3c3. Owner root
validation remains applicable. Integration was committed and pushed as
`9219b76fae64ed5032f1250be73038dcf0d38f6e`. Owner independently hashed both
files from that exact commit and matched the frozen round2 pins above.
Read-only GitHub checks confirmed both runs completed successfully at that
same head SHA:
- CI: `34462055855`, conclusion success.
- CLI packaging: `34462055898`, conclusion success.

Source integration does not authorize installed configuration changes or
clear the existing milestone rollout hold.

### Post-integration owner cleanup

Owner rechecked the isolated checkout: only the two expected tracked candidate
modifications remain, each byte-identical to the integrated commit; no
untracked scratch. The approved coordinator temp directory is empty. All
eight tracked task author/recovery/reviewer runner and worker PIDs are absent;
their disposable sessions were deleted after recorded handoffs. Identified
author repro fixtures and all owner runner/log/export files were removed;
reviewer test teardown completed. No additional worker or tests were started.

No owner-created branch/worktree needs removal. The lead-created isolated
checkout `task147-idle-presence` remains deliberately retained for Hoa's
removal after this confirmation; the owner did not remove it or touch other
agents' worktrees. Live participant configuration, board replicas and watcher
state remain intact. Historical author deviations and ordinary count2/3 are
preserved. Status stays **gated** pending applicable milestone/live acceptance;
no rollout, installer reapplication or successful automatic-delivery claim.

Lead cleanup complete: after owner confirmation and exact equality checks
against9219b76, Hoa removed the isolated task147 worktree and local branch.
Source integration, CI and cleanup are complete; status remains gated solely
for the recorded operational acceptance/milestone boundary.

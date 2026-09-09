---
id: 148
title: Handle filename-less watch events and stabilize hint readiness
phase: 1
owner: opencode
status: todo
depends: []
related: [404, 109, 110]
estimate: S
---

## Purpose and evidence

CI run34351990609, job102467256287 on
`558710831c738d0f4c01c8919bcb3e04aa1964b6` failed with311 pass,1 skip,1 fail
and2 errors under Bun1.4.0. The commit changes only documentation/metadata.
A clean ordinary Astra consultation found an unhandled TypeError at
`packages/store-fs/src/index.ts:434`, called by the watcher callback at216:
the runtime supplied an undefined filename to `filename.toString()`.

The timeout at `packages/store-git/test/store-git.test.ts:280` concerns the
follow-on consumer wake, after cancellation assertions completed. The test
starts next() and immediately invokes its hook while watcher setup still
awaits filesystem operations. A startup race is plausible; the logs do not
prove whether the exception caused the missed wake or accompanied cleanup.
This is a distinct runtime defect follow-up to completed404, not a separate
review/remediation ticket for the guide. No failed-job retry has been run.

## Reservation and acceptance

Work in the lead-created isolated candidate based on full5587108 above.
Allowed scope: `packages/store-fs/src/index.ts`, `packages/store-fs/test/`,
and `packages/store-git/test/store-git.test.ts`. Announce any necessary
additional path before editing; no other active scope is authorized.

- Filename-less watcher callbacks, including actual undefined and null,
  must not throw; preserve the existing hint/filter semantics.
- Add meaningful regression coverage for the observed callback condition.
- Make the follow-on hint test wait for actual readiness deterministically;
  do not hide the race through a larger timeout or arbitrary extra sleep.
- Verify cancellation and subsequent consumer wake still behave correctly.
- Run focused checks and applicable root tests/typecheck through clean workers.
  Respect all actual runtime denials; no retry or equivalent workaround of
  the separately denied helper typecheck or task147 canonical read.

Main/live runtime and installed configurations remain frozen. No installer,
helper, task147, provider, live-board or security changes are included.

## Completion cycle

OpenCode owns clean GLM5.3Flash implementation, retirement, then sequential
clean Astra/Fable ordinary reviewer-remediators. Ordinary rounds0/3 initially;
stop after3 without a clean no-change pass for Hoa's decision. Record exact
models, snapshots/hashes, meaningful checks, findings and cleanup here.
The initial lead consultation was read-only diagnosis, not an acceptance round.
No security scan is assigned here: future milestone delta coverage must be
explicitly scoped, cumulative, and GLM5.3Flash only before runtime rollout.
Hoa alone integrates, commits and pushes. The actual blocked implementation
handoff is recorded below.

## Integration and cleanup

### Owner launch (2026-09-09)

Administrative recovery wake, not automatic-board delivery evidence. OpenCode
read canonical148 and verified isolated checkout
`/private/tmp/sidekick-task148-opencode` clean at
`558710831c738d0f4c01c8919bcb3e04aa1964b6`. Reservation: store-fs source,
store-fs tests, and store-git/test/store-git.test.ts only as listed above;
ordinary rounds consumed0/3. Fresh pure GLM5.3Flash implementer launches next.
Original failure retained despite later green metadata-only CI. Task147 read
denial and denied helper typecheck/equivalents remain untouched. Manual edits
must use apply_patch per direct session instructions; unavailable tooling is
reported, not silently substituted. Main/live/config/source freezes remain.

Pending. Preserve the original CI failure regardless of any later green run.
Retire all disposable workers and remove owned scratch after handoff; retain
the candidate until lead integration and cleanup authorization.

### Blocked implementation handoff

Actual fresh pure worker `ses_f79c4a4aeffeqh9bLARrsCghqY`, requested and
exported assistant runtime `zai-coding-plan/glm-5.3-flash`; original
runner26688/worker26735 exited without final handoff at a denied tool call.
Same unfinished session returned a text-only/no-tools recovery handoff under
runner42864/worker42872, then retired. No replacement worker or round reset.

Denied operation: native Read of
`/private/tmp/sidekick-task148-opencode/packages/store-fs/src/index.ts`.
Exact runtime wording: `The user rejected permission to use this specific tool call.`
Denial origin is unverified; no retry, equivalent read, copied-content route
or permission workaround occurred. Canonical148/workflow/charter reads had
succeeded; task147 was never opened. Baseline5587108/branch and initial clean
status were verified, but source reading/implementation never began and no
source input/output hashes or patch were produced. No files changed.

Other observed setup limitations: apply_patch unavailable in the GLM worker,
and no node_modules in the isolated candidate. No installs or tests were run;
allowed frozen-dependency provisioning remains to be settled separately from
the actual read denial. Prohibited typecheck/equivalents were not attempted.
Verdict **BLOCKED**, ordinary review rounds consumed0/3; no security work or
new milestone round. Original CI failure remains unresolved, not overwritten
by later green runs. Scope/baseline remain fixed, main/live untouched.

Exact permission/edit/dependency setup decisions reported to Hoa via
`20260909T130010Z-opencode-7c20`. Worker reports no scratch/resources created;
lead-owned checkout remains untouched/preserved. Owner retires the disposable
session and removes its runner/log after evidence capture. Actual total token
usage/cost unavailable; no independent approval inferred from the handoff.

### Exact-read authorization (2026-09-09)

Direct operator instruction in the OpenCode owner session: "I authorize the
task 148 GLM worker to read that exact file and retry the previously denied
Read operation. Other restrictions remain unchanged."
Authorized path: `/private/tmp/sidekick-task148-opencode/packages/store-fs/src/index.ts`.
This releases only that specific read denial, not task147's denial, any denied
typecheck/equivalent, broader permission changes or out-of-scope edits.
Previous worker is retired/deleted; a fresh clean GLM implementation context
starts on the same preserved candidate. Original failure/denial evidence and
ordinary0/3 count remain intact. Edit-tool availability and applicable
validation still require honest verification; no successful retry is claimed
until observed. Hoa notified through `20260909T133643Z-opencode-7945`.

### Authorized retry still denied by the harness

Fresh pure worker `ses_f799ba3d2ffedz0ZMQByzoj6jB`, exported runtime
`zai-coding-plan/glm-5.3-flash`, runner11339/worker11349. Its first and only
tool action was native `read` with exact input filePath
`/private/tmp/sidekick-task148-opencode/packages/store-fs/src/index.ts`.
Despite the direct operator authorization in its launch instruction, that
action again returned `The user rejected permission to use this specific tool call.`
Actual tool/input/error verified in the session export, not inferred from
worker self-report. No source content, edits, tests or patch produced; no
broader permission/config change, equivalent read or model substitution.
The CLI exited without an author handoff after this one failed tool action.

The operator authorization remains valid evidence, but the effective harness
permission gate is still blocking execution. Further retry requires resolving
that exact gate, not another blind worker launch. Task147/typecheck denials
remain unchanged; ordinary148 rounds remain0/3. Failure metadata preserved,
failed session retired/deleted and owned runner/log removed after capture.
No worker scratch or source changes. Hoa notified via
`20260909T134235Z-opencode-2259`.

### Exact-read retry succeeded

After a new direct operator instruction, "try again", one fresh pure GLM
session `ses_f7988300fffeD4e1jA5KdR26cG` retried only the authorized native Read.
It completed successfully and returned `READ_OK` with513 lines. Session export
confirms actual `zai-coding-plan/glm-5.3-flash`, exactly one completed read tool
and final finish=stop. Launch was a bounded foreground `opencode run --pure
--model zai-coding-plan/glm-5.3-flash --format json` in the task148 isolated cwd.
No configuration/permission changes or alternate read routes were used; the
reason the effective permission outcome changed is not inferred.

The exact source-read blocker is now resolved. This read-only attempt made no
edits and ran no tests or analysis. Remaining implementation/edit-tool and
validation limitations are not thereby resolved; task147/typecheck restrictions
remain unchanged, ordinary148 rounds0/3. Read-only session retired after evidence
capture; no scratch created. Hoa notified in `20260909T140102Z-opencode-2da1`.

Cleanup confirmed by owner `20260909T130218Z-opencode-0ec2`: disposable
session deleted, owned runner/author/recovery logs removed, and all initial
and recovery workers exited. Lead-owned unchanged candidate remains retained.

### Lead setup decisions and implementation release

Hoa releases implementation after the successful exact source read. Frozen
dependencies were provisioned in the isolated candidate with
`bun --no-env-file install --frozen-lockfile --ignore-scripts`:100 packages
installed; tracked working tree remained clean. No tests or source edits
were performed by the lead.

If the GLM implementer lacks apply_patch as a tool, it may return an exact
unified patch. The coordinator may persist those bytes mechanically through
its available apply_patch, without authoring product changes; preserve patch
and file hashes before retiring the implementer. This addresses unavailable
tooling only and does not override an actual denied operation. A fresh
Astra/Fable reviewer then reviews the resulting candidate under ordinary0/3.

Task returns to todo, ready for actual implementation pickup; owner records
in-progress only when its worker starts. No additional read-only probe is
needed. Existing task147 and helper-typecheck restrictions remain separate,
and missing validation must be reported before any clean acceptance claim.
Lead dispatch: `20260909T145000Z-codex-0480`; dependency completion:
`20260909T145049Z-codex-5322`.

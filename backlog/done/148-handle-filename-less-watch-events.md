---
id: 148
title: Handle filename-less watch events and stabilize hint readiness
phase: 1
owner: opencode
status: done
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

### Actual implementation after setup

Administrative recovery reconciled setup decisions0480/5322. Fresh pure
`zai-coding-plan/glm-5.3-flash` implementation launched in the existing isolated
candidate, tracked runner65799/worker65812. This is implementation, not a new
read probe; exact GLM-authored patch handoff is expressly available if the
worker lacks apply_patch, with mechanical owner persistence and fresh review.
Candidate tracked status was clean after dependency provisioning. Ordinary
rounds0/3 retained; task147/typecheck denials and main/live freezes unchanged.
Actual session/model/output evidence follows; no successful implementation or
validation inferred from launch alone.

### Actual implementation blocked by source and test Read denials

Fresh session `ses_f7951643bffeaKbmt3C9rr52ll`, requested and exported runtime
`zai-coding-plan/glm-5.3-flash`, runner65799/worker65812, verified clean5587108
baseline and attempted substantive source reading (not another read probe).
Native Read calls for isolated `packages/store-fs/src/index.ts` and
`packages/store-fs/test/store-fs.test.ts` both returned:
`The user rejected permission to use this specific tool call.`
Exact full paths/tool inputs verified from the runtime export. No permission
request IDs or approval-transport details appeared in the returned errors;
denial origin remains unknown. Earlier authorized source Read success is
preserved but does not establish approval of these later calls.

No source/test contents received, patch authored, edits or tests performed.
Dependency provisioning and mechanical GLM-patch handoff are resolved setup
decisions, not the current blocker. No permission changes, equivalent reads,
copied-content workaround, task147 read or denied typecheck occurred.
Ordinary review rounds remain0/3. Same unfinished session returned text-only,
no-tools final BLOCKED evidence under runner85963/worker85977, then retired.
Worker reported no scratch; candidate unchanged and preserved. Owner deletes
the disposable session and its runner/log after capture. No acceptance claim.

Hoa notified via `20260909T150319Z-opencode-7226`. Observed launch difference
(prior successful foreground read vs current detached stdin-ignore execution)
is metadata only, not a proven cause or permission workaround. Effective
per-call approval must be resolved before any further implementation attempt.

### Operator-configured permission resumption

Operator reported the permission configuration updated and explicitly resumed
task148 (correcting an earlier147 mention). Fresh clean pure GLM implementation
launched in the unchanged isolated5587108 candidate, runner17828/worker17839.
Existing dependency provisioning and exact GLM-patch handoff route apply.
Prior failed workers are retired; no duplicate or read-only probe. Task147
and denied helper typecheck/equivalent restrictions remain in force, main/live
runtime frozen, ordinary148 rounds0/3. Actual permission success and output
are not inferred from configuration consent; worker result follows.

### Actual GLM patch handoff and mechanical persistence

Fresh pure author `ses_f78985dccffetolQDx583rU9I4`, exported runtime
`zai-coding-plan/glm-5.3-flash`, successfully read the source and tests after
operator permission configuration. About6.8 minutes elapsed. apply_patch was
unavailable, so it returned an exact patch; no native Edit/Write fallback.
Owner applied the patch mechanically only in the isolated candidate.

Original returned patch SHA-256:
`48072a380baf9563c8ef2d5596f0d784e227d17b1eec00da568aaa26a4b6c359`.
The normalized per-file added/deleted-line sequence from that patch and the
actual isolated git diff both hash to
`64029847afc1c4f91c797a438d3d6ad783b46f9be0867e3dab2b4aadcbf079c6`.
Only path rooting was adapted for coordinator apply_patch; no coordinator
authored product changes. Full before/after pins:

| Path | Input SHA-256 | Output SHA-256 |
|---|---|---|
| packages/store-fs/src/index.ts | cecc09e3b4f5216c759bb72528f5961906d8f41ba36c53afa55af7b044002c30 | 93670165dc93062d1c749a90cefc370e5f94148171ae78cbd8e50aee19ad5439 |
| packages/store-fs/test/store-fs.test.ts | 869030e83d48b414eecdc3fb0a20a4efb459465effd4042090862405218f7545 | a3e384c4a047999ea5ca696530a866b09d9f19109048eae10999037c4fd26fc8 |
| packages/store-git/test/store-git.test.ts | 57dcce53f62cf15727084f9972971172c0c288fc3086b45e59320e2c650e82c8 | db1c0ada3a2bc910cf2cc225cff2755088c0c5cc845557f5011414a3c4ad12c4 |

Authored change handles undefined as null in the filename classification and
adds callback/hint test coverage. Author ran no tests because its patch was
unapplied; its asserted red/green and deterministic-test expectations are NOT
executed validation evidence. The original CI failure remains34351990609,
despite a typo in the author handoff. Fresh review must inspect actual readiness
behavior and all acceptance, not inherit those assertions. Typecheck remains
unrun/prohibited; no clean full acceptance claimed. No source-main/live changes.
Author reported no scratch; retire after preserving this handoff. Ordinary
review1/3 begins on these actual persisted bytes, with missing checks explicit.

### Ordinary round 1: remediated, fresh review required

Fresh pure reviewer `ses_f788d113effe0gyZHt4tux9gb6`, exported actual runtime
`openai/gpt-6-astra`, runner75695/worker75712, about5 minutes. Verdict
**REMEDIATED-FRESH REVIEW REQUIRED**, ordinary1/3. Input pins are the author
output table above. Reviewer fixed the still-racing original follow-on test,
removed the redundant racing added test, and introduced actual watcher-readiness
barriers before cancellation and subsequent wake. Callback regression now
captures the exact callback supplied to real fs.watch, injects undefined/null,
checks string/Buffer metadata filtering, and closes in finally. No runtime API
or timeout increase. Production guard restored unchanged after red regression.

Final output pins, rehashed by owner:
- store-fs source: `93670165dc93062d1c749a90cefc370e5f94148171ae78cbd8e50aee19ad5439`
- store-fs test: `e16ba600f14494fa496b881fcaf8775d82a8cef26d861ef335137553bc9bf3d0`
- store-git test: `cb23cfac4a82d31be325524adbdb9715a11ac0bcba5f959e8bb3d8cf0cf96d49`

Checks by reviewer: focused two-file Bun suite64 pass/0fail; temporarily
restored null-only guard reproduced TypeError at filename.toString, then
candidate restored; both targeted regressions passed in10 separate processes.
Root bun test passed twice on final bytes:313 pass/1skip/0fail,2105 assertions,
exit0. Diff-check exit0. An intermediate real-watcher emit experiment failed
and was replaced by direct callback invocation; only final checks are passing
evidence. Missing typecheck remains explicit, prohibited and unverified, not
a CORRECT/COMPLETE result. No security or live/main operations. Candidate kept
only in three isolated scoped files, no untracked scratch. Reviewer retired
after handoff; fresh ordinary2 verifies these changed tests, counts preserved.

### Ordinary round 2: no changes, blocked only on typecheck

Fresh pure reviewer `ses_f7885d962ffek02PjwTrBwpoqd`, exported runtime
`openai/gpt-6-astra`, runner18651/worker18664, about2 minutes. Verdict
**BLOCKED**, solely because the required typecheck is prohibited/unverified.
No scoped correctness findings and no edits; this is NOT CORRECT/COMPLETE.
Verified undefined/null hint behavior, exact real-watcher callback regression,
metadata filtering and actual readiness barrier for cancellation/follow-on
wake without a startup sleep or timeout increase.

Independent checks on final candidate: `bun test packages/store-fs/test/
packages/store-git/test/` exit0,64 pass/0fail,303 assertions; root `bun test`
exit0,313 pass/1skip/0fail,2105 assertions; diff-check exit0. Bun1.4.0.
No typecheck/equivalent, security work or live operations. Prior mutation/
stress evidence remains round1's, not claimed as independent round2 evidence.

Input/output full pins equal round1 final pins above, rehashed by owner.
Only the three authorized isolated files are modified; no untracked scratch.
Reviewer session retired/deleted after evidence capture; owner runner/logs
removed. Lead-owned candidate and dependencies preserved for integration.
Ordinary rounds consumed2/3; no automatic third round merely to repeat the
same prohibited check. A permitted validation decision is required to clear
the remaining gate; existing CI does not cover these changed bytes. No source
main/live adoption, commit or security milestone approval claimed. Original
failure34351990609 and all prior denied-operation records remain intact.

### Operator typecheck authorization and final review

Direct operator instruction in the OpenCode owner session: "I authorize
running typecheck for all tasks." This supersedes the earlier typecheck
prohibition, for all tasks, without changing task147's separate read denial
or other scope/live/git restrictions. Hoa notified in
`20260909T190214Z-opencode-2193`. Fresh ordinary148 round3/3 now validates
the unchanged round2 candidate and completes the missing typecheck. Historical
round2 BLOCKED verdict remains preserved; no count reset or retroactive pass.
Any round3 artifact edits require STOP for a further lead decision.

### Ordinary round 3: clean final acceptance

Fresh pure reviewer `ses_f7870b652ffeVBSGqABXq7M3A6`, requested and exported
runtime `openai/gpt-6-astra`, runner17335/worker17352 exited0. About2.6 minutes.
Under the new operator typecheck authorization, cumulative ordinary3/3 returned
**CORRECT/COMPLETE**, no changes or blocking ordinary findings. Historical
round1 remediation and round2 validation-only BLOCKED remain recorded, not reset.
All three input/output pins equal the final round1/2 pins above, rehashed by
owner. No new artifact/test changes, so no further ordinary round is needed.

Fresh reviewer commands each passed twice (per-run counts, not aggregated):
- Focused store-fs/store-git tests: exit0,64 pass/0fail,303 assertions.
- Root `bun test`: exit0,313 pass/1skip/0fail,2105 assertions,22 files.
- `bunx tsc --noEmit`: exit0, no diagnostics. The former validation gap is resolved.
- Scoped `git diff --check`: exit0, no output.

Reviewer confirmed actual callback coverage for undefined/null, preserved
metadata filtering, and real watcher-readiness barriers before cancellation
and subsequent wake without arbitrary startup sleeps or increased timeouts.
An initial hash command omitted packages/ and was corrected; no permission
denial occurred. No security review or main/live changes. Only the three
authorized isolated files are modified, no untracked scratch; candidate and
lead-provisioned dependencies retained. Disposable session retired/deleted and
owned runner/log removed after evidence capture. Aggregate usage/cost unknown.

Task gated for Hoa integration from fixed isolated5587108 plus these three
files; not shipped or adopted into main/live runtime by the owner. Applicable
future cumulative milestone security coverage and exact-commit integration/CI
remain lead-controlled. Original CI failure and earlier denials stay preserved.

### Lead integration (2026-09-09)

The operator requested integration after the final owner handoff
`20260909T191057Z-opencode-7cc8`. Hoa verified the three candidate files against
the full final round3 SHA-256 pins, and verified that source main at `cf4a709`
has no intervening product, dependency or CI changes since candidate5587108.
The three source-main input hashes matched the original input table exactly.
Hoa mechanically adopted the reviewed bytes without edits; all output hashes
match the clean round3 candidate. Existing unrelated untracked work is excluded.

The clean review's focused/root tests and typecheck cover these identical
product bytes. Commit/push, exact-commit CI and final candidate cleanup are
pending below; status stays gated until those complete. Integration is
authorized separately from operational rollout. The remote-board milestone
carries task148 as an uncovered delta; no security verdict, installed-config
change or live-process restart is implied. Ordinary rounds remain3/3.

### Integration completion and cleanup (2026-09-09)

Hoa committed and pushed the exact reviewed files and integration records in
`f129d97028a463978aa41ded80bde901f062fc75`. GitHub
[CI34394128190](https://github.com/antstanley/bus/actions/runs/34394128190)
passed tests/typecheck and real MinIO conformance;
[CLI packaging34394128184](https://github.com/antstanley/bus/actions/runs/34394128184)
passed. The live AWS conformance steps were skipped by the existing repository
configuration check; no live AWS execution is claimed. The original failing
CI34351990609 remains historical evidence, not erased by this fix.

Owner round3 handoff confirms disposable sessions retired/deleted, runner/log
removed and no owned scratch. After push and CI, Hoa reverified that the only
three candidate changes equal the committed blobs and that no untracked
scratch existed. Hoa removed the lead-created task148 worktree, its installed
dependency directories and branch `task148-watch-filename`. No task148 worktree
or branch remains. Existing task147 and unrelated shared untracked files are
preserved. All task148 tracked changes are committed; the historical author
patch hash is unchanged.

Task148 is done for ordinary acceptance/integration/CI/cleanup. Remote-board
milestone coverage for this delta is pending as recorded in MILESTONES; no
runtime rollout or task109/110 acceptance is claimed. Ordinary rounds3/3,
final clean no-change verdict preserved; no additional review worker started.

### Original GLM patch (historical audit only, preserved bytes)

This is the exact author patch hashed48072a38 above, not the final candidate.
Ordinary round1 subsequently remediated its tests as recorded above.

```diff
*** Begin Patch
*** Update File: packages/store-fs/src/index.ts
@@
 export type WatchFactory = (
   path: string,
   options: { recursive: true },
-  listener: (eventType: string, filename: string | Buffer | null) => void,
+  listener: (eventType: string, filename: string | Buffer | null | undefined) => void,
 ) => FSWatcher;
@@
-function isGitMetadata(filename: string | Buffer | null): boolean {
-  if (filename === null) return false;
+function isGitMetadata(filename: string | Buffer | null | undefined): boolean {
+  if (filename === null || filename === undefined) return false;
   const name = typeof filename === "string" ? filename : filename.toString("utf8");
*** Update File: packages/store-fs/test/store-fs.test.ts
@@
     bAbort.abort();
     expect(await bDone).toEqual({ done: true, value: undefined });
     expect(fake.closeCount).toBe(1);
   });
 
+  it("delivers hints for watcher callbacks with undefined or null filenames", async () => {
+    const fake = new FakeWatcher();
+    let listener: ((eventType: string, filename: string | Buffer | null | undefined) => void) | undefined;
+    const store = new FsStore(await tempRoot(), {
+      hintDebounceMs: 2,
+      watchFactory: (_path, _options, callback) => {
+        listener = callback;
+        return fake as unknown as FSWatcher;
+      },
+    });
+    const iterator = store.hint()[Symbol.asyncIterator]();
+    const undefinedWake = iterator.next();
+    await until(() => listener !== undefined);
+    listener!("rename", undefined);
+    expect(await Promise.race([
+      undefinedWake,
+      rejectAfter(250, "undefined filename did not wake the consumer"),
+    ])).toEqual({ done: false, value: undefined });
+
+    const nullWake = iterator.next();
+    listener!("change", null);
+    expect(await Promise.race([
+      nullWake,
+      rejectAfter(250, "null filename did not wake the consumer"),
+    ])).toEqual({ done: false, value: undefined });
+
+    let wokeForMetadata = false;
+    const bufferWake = iterator.next();
+    void bufferWake.then(() => { wokeForMetadata = true; });
+    listener!("change", Buffer.from(".git/HEAD"));
+    await new Promise((resolve) => setTimeout(resolve, 10));
+    expect(wokeForMetadata).toBe(false);
+    listener!("rename", "boards/g/object");
+    expect(await bufferWake).toEqual({ done: false, value: undefined });
+
+    await iterator.return(undefined);
+    expect(fake.closeCount).toBe(1);
+  });
+
   it("ends hint iterators on watcher errors or unexpected closure", async () => {
*** Update File: packages/store-git/test/store-git.test.ts
@@
     await follow.return(undefined);
     await git(dir, ["hook", "run", "post-merge"]);
     await new Promise((resolve) => setTimeout(resolve, 250));
     expect(await follow.next()).toEqual({ done: true, value: undefined });
   });
 
+  it("keeps follow-on hint consumers ready after a cancellation for later wakes", async () => {
+    const dir = await tempPath("hint-rearm");
+    const store = new GitStore({ dir, branch: "main" });
+    await store.sync();
+
+    const first = store.hint()[Symbol.asyncIterator]();
+    const firstWake = first.next();
+    await git(dir, ["hook", "run", "post-merge"]);
+    await expect(Promise.race([
+      firstWake,
+      rejectAfter(5000, "first consumer missed its wake"),
+    ])).resolves.toEqual({ done: false, value: undefined });
+
+    const pendingDone = first.next();
+    await first.return(undefined);
+    await expect(Promise.race([
+      pendingDone,
+      rejectAfter(1000, "cancelled consumer never ended its pending next()"),
+    ])).resolves.toEqual({ done: true, value: undefined });
+
+    const follow = store.hint()[Symbol.asyncIterator]();
+    const followWake = follow.next();
+    await git(dir, ["hook", "run", "post-merge"]);
+    await expect(Promise.race([
+      followWake,
+      rejectAfter(5000, "follow-on consumer missed its wake after a cancellation"),
+    ])).resolves.toEqual({ done: false, value: undefined });
+
+    await follow.return(undefined);
+    await git(dir, ["hook", "run", "post-merge"]);
+    await new Promise((resolve) => setTimeout(resolve, 250));
+    expect(await follow.next()).toEqual({ done: true, value: undefined });
+  });
+
   it("skips hook installation when core.hooksPath points outside the repository", async () => {
*** End Patch
```

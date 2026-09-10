---
id: 149
title: Periodically check board and legacy inbox and wake the lead
phase: 1
owner: essun
status: blocked
depends: []
estimate: S
---

## Operator request and scope — 2026-09-10

The operator requested a monitor that intermittently checks the new board and
legacy bus. Hoa chooses a 120-second interval with wake only for new messages,
not a model turn every interval. Existing board delivery watcher is absent;
MCP presence alone does not establish wake readiness. Native `codex queue`
accepted a self-test for the current lead thread, but processed receipt is
not yet verified. This monitor is an independent operational deliverable;
it does not resolve tasks109/110 automatic-delivery acceptance or task147.

Essun owns implementation and sequential clean reviews under
[the shared workflow](../docs/agents/task-workflow.md). Source baseline:
`8ac806b7f3f5d746e99ad9106ec163d7fc92ce93`, plus only this dispatch metadata
before worker start. Hoa provisions isolated branch `task149-codex-monitor`.

Reserved new files only:
- `scripts/codex-coordination-monitor.py`
- `scripts/test-codex-coordination-monitor.py`
- `docs/guides/codex-coordination-monitor.md`

Essun maintains this parent and only INDEX row149 in the shared checkout.
No edits to task507 helpers, active147 installer files, active202
core/CLI/MCP files, runtime configuration or another agent's replica.

## Acceptance and dispatch

Build a Python-stdlib one-shot monitor usable from macOS launchd at
StartInterval120. All live paths/thread/commands are explicit configuration;
no credentials or arbitrary config reads. The monitor uses its own
lead-provisioned private board replica, verifies `board-data`, the exact
private origin and marker before Git use, and fetches only the pinned branch
without checkout switching, merge, commit or push. It checks the legacy
`.bus/inbox/codex/new` directory without marking messages read or modifying it.

- Detect new non-Codex board posts and legacy inbox messages with persisted
  deduplication. Initial baseline avoids replaying board history; pending
  legacy inbox messages remain visible. Document initialization semantics.
- Bound each poll to200 posts, skip bodies over64KiB, and preserve pending
  batches. Exclude own board posts to avoid a notification feedback loop.
- Never execute message content or put it into a prompt as instructions.
  Queue only fixed monitor-authored notification text via subprocess argv:
  `codex queue --thread <explicit-thread> --message <fixed-notification>`.
  The notified agent separately reads labelled untrusted data.
- Quiet polls cause no Codex wake. Persist notified state atomically only
  after successful queue acknowledgement; retain failures for retry.
- Prevent overlapping runs with a local lock. Bound fetch/queue operations;
  report fetch failure while still checking legacy messages. Avoid repeated
  error wake storms; document retry/backoff and explicit status.
- Provide reproducible local fixtures/tests for changes, no change, own
  posts, queue failure/retry, batch caps and overlap. No live board writes,
  live messages, credential files or production configuration in workers.
- Document exact launchd start/status/stop procedure, explicit paths,
  initialization, polling interval and limitations. Transport acceptance is
  not a processed reply; activation needs a receipt in Hoa's actual thread.

Clean native `zai/glm-5.3-flash` implementer, requested high, receives only
this task, DESIGN/relevant trust research, scoped source and exact instruction.
Retire after compact paths/hashes/checks handoff. Clean Astra ordinary
reviewer-remediators fix their findings, retire, and require fresh review
after changes. Stop after three ordinary rounds without a clean no-change
CORRECT/COMPLETE verdict. Preserve evidence and cumulative counts here.

## Operational security checkpoint and activation

This monitor's activation is the boundary defined in the milestone register.
After ordinary review, Essun runs a clean GLM5.3Flash-only security
reviewer-remediator over the exact monitor/tests/launch guide with
`docs/research/04-trust.md`; the parent and active gate are read-only context.
Fix within reserved files, retain reports under
`docs/security/2026-09-10-codex-monitor-*.md`, and retire each worker.
Changed artifacts/tests need fresh applicable verification. Maximum three
security rounds without a clean no-change pass, tracked separately; then
stop for Hoa's recorded decision. No substitute security model.

Hoa alone integrates, provisions the assigned monitor replica/state and
launchd configuration, then checks quiet/new-message behavior, real queue
receipt and process/job status before reporting active. This focused new
operational boundary does not change prior phase1 rollout holds or reset
any existing security cycle. No product release is authorized by it.

## Evidence

- Implementation: clean GLM implementer dispatched — worker sub-59c104a5 (task149-impl-glm, zai/glm-5.3-flash, requested thinking high), started 2026-09-10T08:53:51Z on isolated checkout task149-codex-monitor @ e6341c5 (clean). Scope: strictly the three reserved new paths (scripts/codex-coordination-monitor.py, scripts/test-codex-coordination-monitor.py, docs/guides/codex-coordination-monitor.md); Python stdlib only; offline fixtures with bare-repo + fake-queue; no live fetches/queues, no git mutations, no reads of live .bus content or credentials. Verified format facts handed off: board posts at boards/team/posts/<date>/<ULID>.json (author/id/body/ts keys), legacy inbox files <ts>-<author>-<serial>.md; presence/events ignored.
- Implementation handoff received 2026-09-10 ~09:2xZ, validated by essun (orchestrator check, not a review verdict): worktree shows only the three reserved files; hashes reproduce — monitor 6a9e5e5f8b233a7263b1a70ce3c6c2be02aea51d684e1a001b352bcbf2432c51, tests 164458608767f4bbab551d431e6a9339300457fa8c76fbeb80a7b01e569c4a99, guide 2eb7e3a96464ac494f47e0ffbeba5e5050dd28e39e325c3625ac3986a6c3bffe; /usr/bin/python3 -m py_compile clean (also 3.14), test suite 32 tests OK rc0 (~21s). Key semantics: fail-closed replica verification (marker byte-exact, branch, origin URL, board.store marker); FF-only fetch refspec, no checkout/merge/commit/push; board read via ls-tree/cat-file without working-tree touch; 64KiB stat gate; shared 200-candidate cap (board first, then legacy, pending preserved); queue = fixed-text argv one call max, ack = exit 0 (transport only); state persisted atomically only after ack; flock; baseline init records without waking (exit 2); exit codes 0/1/2/3/4/5/10/11 documented; error wake on first failure then every --error-notify-interval (default 30 ≈ hourly), success resets. 32 fixture tests cover baseline/no-change/own-post/caps/oversize/corrupt/queue-fail-retry/atomicity/lock/verify-fail/fetch-fail/timeout/noop/status. Open lead choices: marker tracked vs untracked in replica; stronger queue ack (parse request id) would be a spec change; no state retention/pruning (documented); --noop skips lock (documented). Implementer sub-59c104a5 retired after evidence preserved.
- Ordinary round 1 COMPLETE — reviewer-remediator sub-491265fb (task149-review-astra, requested thinking high; input hashes matched). Verdict: REMEDIATED — FRESH REVIEW REQUIRED. Seven blocking findings found and fixed in scope: (1) init permanently suppressed pending legacy inbox files — now left pending, counted, notified/retried from next poll; board history still baselines silently; (2) non-FF guard ineffective for refs/remotes — fetch now pinned-branch-only into FETCH_HEAD with --no-tags/--no-recurse-submodules/--refmap=, merge-base --is-ancestor CAS update-ref, rewinds refused; (3) --noop now uses identical read budget/legacy phase/error-wake decision as a real poll without queue/state/lock writes; (4) unacked standalone error wakes now persist error_wake_pending and retry each poll until ack or recovery; successful ack clears stale last_queue_error; (5) config rejects out-of-bounds caps and non-finite timeouts; (6) structurally invalid state fields now produce documented exit11; (7) guide corrections (legacy suppression/retry mismatch, failed-mixed-batch persistence claim, lock-sharing warning, RunAtLoad/log behavior, parseable XML placeholders) plus actual plist/argparse tests. Diffs vs frozen inputs: monitor +73/-34, tests +143/-3, guide +77/-57; 11 fixture regressions added (43 total). No optional suggestions. Checks: reviewer and essun independently — /usr/bin/python3 py_compile clean; 43 tests OK rc0; HEAD e6341c5e59b4126ea19f8e82f906a6587f366aa5 unchanged; status shows exactly the three files. Post-round hashes: monitor cf8a00ee4d868bdc264583b845229aeb7cf73b721355c8c312ed4688514bb786; tests 2d577f42447122896f8cd9b8809a6ca17c8e201fdd107de41831f4be98636546; guide 96e0c089c57e6e79a8c0692c81cd1532eb0fc5aa47a3b9ad8bcad21a26bb49b2. Reviewer retired after report preserved.
- Ordinary round 2 COMPLETE — fresh reviewer sub-4bb30a45 (task149-review2-astra, requested thinking high; snapshot hashes verified pre/post). Verdict: REMEDIATION REQUIRED, zero file changes (correct no-change discipline). One blocking finding (source-traced): batch-progress starvation — each poll restarts the sorted unseen list; a malformed-JSON post consumes budget/read then exits that item without recording progress, so with --cap1 a single malformed first post permanently blocks a later valid post and leaves zero legacy budget (200 malformed posts do the same at default cap). Pending batches retained but never drain, contradicting the acceptance requirement and guide claim. Suggested direction: persist separate deferred/retry progress or bounded pending cursor so malformed candidates retry without monopolizing polls; valid seen-state stays behind queue ack; add multi-poll regression (malformed first post + later valid post + pending legacy, cap1); existing test_corrupt_post_json_skipped_and_pending covers only one corrupt post/one poll. All other acceptance items PASS by source tracing + tests (43 green, py_compile clean, HEAD/status clean). Reviewer retired after report preserved.
- Ordinary round 3 COMPLETE (DEVIATION RECORDED) — sub-7873a67e (task149-review3-astra, requested thinking high). Lead correction arrived mid-round directing the availability remedy to GLM; R3 had already begun editing and was allowed to finish before the correction could take effect — this continued Astra work past the correction and is recorded as the R3 deviation; Hoa's ruling: preserve edits/report, retire, count remains ordinary 3, no reset. Verdict: REMEDIATED — FRESH REVIEW REQUIRED. Starvation remedy: version-1 state adds optional board_after (path|null) + legacy_first (bool), type-validated, backward compatible; board traversal resumes after board_after in sorted order, wraps once; malformed/failed reads advance progress without becoming seen; when board exhausts the shared cap with legacy pending, legacy takes next poll's budget first; progress persists atomically on quiet polls or queue ack; queue failure keeps prior progress + notification seen-state for retry; cap stays <=200 read attempts/poll; guide rewritten for drain order/retries/limitations. 4 new regressions incl. cap1 malformed-first+valid-later+pending-legacy drain over three polls, cap200 all-malformed non-starvation, rewind/tag exclusions retained. Checks reproduced by essun: py_compile clean, 47 tests OK rc0 (~30s), HEAD e6341c5e59b4126ea19f8e82f906a6587f366aa5 unchanged, status exactly the three files. Round-3 candidate hashes (pinned for security R1): monitor b9b81cd14a9246b74a7d041e3609370e9903bdc9cef785e1a375b2fd751157f3, tests c7f0251eec0cfef11a75bd9dd69a4bea995a4c4220fb99b23eb61c47632885ff, guide 81889a2f0aaa145710cda1e9149e752e14d4c7483e91604f551bb1623bc95f20. Reviewer retired after report preserved. ORDINARY CYCLE AT 3-ROUND CAP: rounds 1 REMEDIATED / 2 REMEDIATION REQUIRED / 3 REMEDIATED — no clean pass; stopped. Hoa decision 2026-09-10: ONE additional ordinary round 4 authorized AFTER GLM security R1, bounded non-security correctness scope, reviewer may fix ordinary defects; no clean pass claim after edits without further lead decision.
- Security round 1 — first dispatch sub-2042e4af BLOCKED AT GATE 09:5xZ: orchestrator manifest error gave the stale post-round-1 tests hash 2d577f42... instead of c7f0251e...; worker verified monitor+guide MATCH, test MISMATCH, stopped per gate rule with zero review/fixes/bytes and was retired on its own recommendation. Hoa's corrected manifest arrived minutes later (crossed with the retirement): tests c7f0251eec0cfef11a75bd9dd69a4bea995a4c4220fb99b23eb61c47632885ff; no count reset intended — blocked attempt consumed no review, recorded here as dispatch metadata correction. Worktree re-verified untouched (R3 hashes, 3 files, HEAD unchanged). Security R1 re-dispatched as a fresh clean GLM worker with the corrected manifest and instructions to independently rehash all inputs and record the manifest-mismatch history transparently. LEAD ATTEMPT BOOKKEEPING (09:46Z): blocked dispatch preserved as security ATTEMPT 1 (preflight blocked, no substantive review; identity sub-2042e4af retained); corrected replacement sub-eed97929 (task149-sec1b-glm) = ATTEMPT 2, in flight since 09:45:10Z with the corrected manifest + lead-pinned plist hash 341afce5815d89e75200c8b5763924be2a92ca4d17ae0946879f6f6ab1a6b82c forwarded for independent verification (plist unchanged, not loaded). Attempt 3 reserved for fresh GLM verification if attempt 2 changes artifacts. If no applicable clean pass by attempt 3: ask lead with pinned findings/checks for specified continuation. Ordinary rounds: 3 used, round 4 pending post-GLM candidate; no verdicts yet.
- Integration/CI/activation/receipt/cleanup: pending.

### Lead sequencing decision — 2026-09-10 09:40 UTC

R2 wrongly received a read-only mandate; its report and count remain. R3
had started and edited before correction. Hoa directed stopping/retiring R3
with evidence preserved and routing the reported availability remedy to
clean GLM5.3Flash security round1. Continuing that remedy in Astra was not
authorized. The actual launch plist is read-only input; GLM may fix reserved
monitor/test/guide artifacts and must report config changes needed.

Hoa permits exactly one additional ordinary round4 after GLM remediation,
for nonsecurity correctness of the resulting candidate. This exception
addresses the erroneous R2 prompt and R3 assignment; cumulative rounds and
deviations are not reset. Reviewers fix their own in-scope findings; changes
need fresh applicable verification. Further ordinary rounds require another
recorded decision. Security has its separate three-round cap and final
changed bytes require fresh GLM verification. Activation remains held.

- Security round 1, ATTEMPT 2 COMPLETE — sub-eed97929 (task149-sec1b-glm, requested thinking high; all three input hashes independently rehashed, MATCH; provenance of manifest correction recorded in its report). Verdict: REMEDIATED — FRESH GLM VERIFICATION REQUIRED. Findings fixed: (HIGH, availability) board JSON parse missed RecursionError — a deeply nested untrusted post (~40KB < 64KiB cap) escaped poll_once before state save, wedge exit-1 with no self-heal; RecursionError now classified corrupt (cursor advances, pending, capped); (LOW) load_state same gap — hostile deep state now exit 11 as documented instead of internal exit 1. 2 regressions added (49 total). Accepted INFO items (documented): oversize/corrupt backlog re-enumeration bounded by per-call timeouts+lock; bounded git stderr in state carries no token; seen-value types unused for wake decisions. Starvation remedy VERIFIED end to end (cursor/legacy_first semantics, wrap-once, atomic persistence, retry-on-failure, no unbounded growth). Plist cross-check: observed sha256 341afce5815d89e75200c8b5763924be2a92ca4d17ae0946879f6f6ab1a6b82c matches lead pin; 12 flags argparse-consistent, StartInterval=120, RunAtLoad=false; NO config change required. Lead provisioning note: plist runs a COPY of the monitor at /Users/stan/.board/monitors/codex-01a08790/codex-coordination-monitor.py — must be updated to the final integrated bytes before activation. Checks reproduced by essun: py_compile clean, 49 tests OK rc0, HEAD unchanged, exactly 4 untracked files. Post-fix hashes: monitor 49cc4137312251d4bcf03b12cc910b3688ddd29163e22c43f687f116f345c23d, tests 8f9401cdf58befabfcd6c8f509b094d5adcb9c5b43d7e6c0c6b7c75c2b7f2ad8, guide 81889a2f0aaa145710cda1e9149e752e14d4c7483e91604f551bb1623bc95f20 (unchanged), security report d0b9dd38ddc6a8e607e1b1fe0f4f84c3fab726bfb77fc4afb443a72b46e1d593 (docs/security/2026-09-10-codex-monitor-security-round1.md). Attempt-2 worker retired after report preserved. SECURITY ATTEMPT 3 (fresh GLM verification, final attempt) queued on final bytes after ordinary round 4.
- Ordinary round 4 COMPLETE — sub-18128841 (task149-round4-astra, requested thinking high, actually dispatched 09:59:05Z; hashes/HEAD verified pre-review). Verdict: CORRECT/COMPLETE (non-security ordinary correctness/completeness). Zero blocking findings, ZERO changes; deferred board_after cursor/legacy_first persistence, RecursionError classifications, and 49-test coverage reviewed against every acceptance bullet; checks green (py_compile clean, 49/49 OK rc0); deliverable hashes identical to the post-security-attempt-2 snapshot; worktree exactly the 4 expected untracked files; no security concerns routed. Reviewer retired after report preserved. ORDINARY CYCLE: CORRECT/COMPLETE via lead-authorized round 4 (cumulative rounds preserved: R1 REMEDIATED, R2 REMEDIATION REQUIRED, R3 REMEDIATED, R4 clean — no reset).
- Security ATTEMPT 3 COMPLETE — sub-c14459f9 (task149-sec3-glm, requested thinking high, dispatched 10:02:01Z; corrected fix-mandate relayed in-attempt 10:06Z, scope bound 10:07Z). VERDICT: CLEAN — no-change security pass. Zero deliverable bytes changed (hashes re-verified post-checks by worker and essun): monitor 49cc4137..., tests 8f9401cd..., guide 81889a2f... all match the frozen candidate; plist observed 341afce5815d89e75200c8b5763924be2a92ca4d17ae0946879f6f6ab1a6b82c matches lead pin (read-only, 12 flags argparse-consistent, StartInterval=120, RunAtLoad=false). Full checklist verified: trust boundaries (fixed-text argv, bounded stderr, minimal JSON parse, no env/credential reads/content logging), subprocess safety (argv lists, bounded timeouts, pinned --no-tags/--refmap= fetch, non-FF refused via merge-base CAS), untrusted-input robustness (both RecursionError fixes regression-tested, 64KiB gate, corrupt-pending without starvation), starvation remedy end-to-end, state/lock atomicity (mkstemp 0600+fsync+replace+dir fsync, exit 11 fail-closed, flock). Checks: py_compile clean, 49 tests OK rc0 (35s). Guide line 298 trailing-space lead exception honored. Audit report: docs/security/2026-09-10-codex-monitor-security-attempt3.md e1d567922b15f7277a59c240ea9923d826a4ac08b7de9c9b7899f2b2e4e9a0a6 (new file added by attempt 3; only file it created). Attempt-3 worker retired after report preserved. APPLICABLE REVIEW GATES FOR 149 COMPLETE: ordinary CORRECT/COMPLETE (round 4) + clean no-change security pass (attempt 3). Remaining before activation (lead-only): integrate final hashes into source, refresh the plist's monitor copy to 49cc4137..., provisioning/quiet+wake checks and a real queue receipt in the lead thread; activation held per lead. Integration baseline was 439bad8 with CI passed on the pre-attempt-3 bytes; deliverable bytes are unchanged by attempt 3, so no re-integration triggered.


## Lead integration and operational trial — 2026-09-10

Source439bad875aed2bb5e67f6931330901fbf5aa29bd pushed. CI34464122300 and
packaging34464122292 passed. Exact clean attempt3 report copied into main;
reviewed runtime copy installed only after the clean gate. Earlier automatic
approval review rejected pre-gate provisioning; no write occurred then.

Manual live polls: baseline exit2; quiet exit0 with no queue; new legacy
message batch exit0 with outcome wake/queued=true at10:14:31Z; repeat exit0
quiet with no additional queue. Test message20260910T101325Z-codex-0546 was
consumed afterward through the normal bounded bus reader. The native queue
probe and monitor notification have transport acceptance, not processed
receipt in this still-active Codex turn.

The exact reviewed120-second LaunchAgent was loaded for the explicitly
recorded operational trial. Two launchd runs failed with exit11:
`config-error: legacy inbox not listable: [Errno 1] Operation not permitted`
for `/Volumes/Delorean/code/sidekick/tmp/.bus/inbox/codex/new`. Manual polls
from the authorized session could read it. Hoa stopped the job and removed
its auto-load plist copy; reviewed runtime/config/state remain under the
assigned monitor directory. No scheduled monitoring is currently active.

This is a runtime access block, not a failed code review. Do not bypass it
through another path, launcher identity or indirect read. Resume only after
an authorized supported access solution is concrete and reviewed as needed;
then verify scheduled polls and actual processed wake before acceptance.
No OS permission change has been attempted. Candidate cleanup follows the
final audit integration; historical counts remain ordinary4/security3.

Lead cleanup: after exact equality checks against committed files and Essun
confirmation, Hoa removed the149 candidate worktree and local branch.
Reviewed operational recovery files remain intentionally retained; scheduler
is stopped and auto-load removed. Runtime access and processed wake remain
open, so status stays blocked.

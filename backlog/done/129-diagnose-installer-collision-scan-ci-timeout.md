---
id: 129
title: "diagnose CI installer collision-scan timeout"
phase: 1
owner: letta
status: done
kind: diagnosis
depends: []
estimate: S
---

Clean worker diagnosis ONLY of CI33995381970, Tests and typecheck job
101384909240, committed6cc2c8f34d34ffc9c0bfc02e3ec7301dd7659637. No code edits,
reviews/security scans, git mutations, workflow changes or live credentials.
Task125 remains gated; no conclusion that its index fix caused the failure.

## Observed evidence

- Run tests failed: board install > CLI reports a truncated collision scan when
  the derived identity is beyond the bounded page;5,019.56ms, timeout5,000ms.
- A subsequent unhandled ENOENT rename was reported from store-fs put:64,
  presence heartbeat:128, and cli/test/install.test.ts:447.
- Total271 passed,1 skipped,1 failed,1 error; typecheck step did not run.
- Same-commit packaging and MinIO conformance passed; the optional live-AWS
  conformance test steps were skipped, not evidence of a live-AWS test pass.
- Isolated local bb3ee17+only125 previously passed272/1skip/0fail and typecheck;
  this was Darwin/arm64+Bun1.4.0, whereas the failing CI runner is Linux.

## Scoped diagnosis

Read this task, committed DESIGN and relevant package paths (cli, presence,
store-fs, index/core). Use isolated committed6cc2c8f and prior bb3ee17 snapshots,
never shared-tree404/108/helper/spec overlays. Identify the failing test's
execution/cleanup path and whether125 changes can affect it. Use bounded
reproductions/comparisons and report actual commands, counts/platform, cleanup
and limits. Do not claim a transient flake or unrelated cause without evidence.
No test timeout increase, test deletion, skip, retry-loop code or other fix is
authorized by this diagnosis. Return proposed minimal scope for lead decision.

The lead may run one failed-job-only retry on the exact commit as diagnostic
evidence; a green retry does not erase this failure or automatically close129.
That single retry was requested successfully with gh run rerun --failed on
CI33995381970; no workflow/source/settings changes were made. Diagnosis
dispatch: `20260905T222058Z-codex-24ac`; actual worker state acknowledgment
pending. Original attempt evidence above remains part of this record.
Attempt2 SUCCESS on the unchanged commit: job101385665428, tests272 passed,
1 skipped,0 failed; typecheck passed. The formerly failing test took3,566.86ms
on retry versus5,019.56ms at timeout on attempt1. This proves the second run
passed, not a cause classification. Fresh diagnostic worker dispatch confirmed
in `20260905T222244Z-letta-41c4`; diagnosis remains open.

- [x] Cause classification and relation to125 supported by evidence.
- [x] Reproduction/baseline comparison and minimal proposed action returned.
- [x] Lead records disposition and separately authorizes any remediation.
- [x] Diagnosis cleanup/evidence complete; task closed or linked to follow-up.

## Diagnosis and lead disposition

Clean diagnosis `20260905T223723Z-letta-54d0`: high-confidence test-fixture
timing problem, not a task125 regression. Worker traced the failing execution
path through heartbeat/presence/store-fs/core with no index execution; local
isolated A/B samples were comparable (bb3ee17 about406ms,6cc2c8f about416ms).
Linux CI retry took3,566.86ms of the5,000ms budget and the first attempt timed
out. These observations support environment-sensitive fixture cost; individual
runner contention was not directly measured, and two local timings are not a
statistical proof. Worker reproduced the timeout/cleanup mechanism synthetically:
fixture writes can continue after timeout while teardown removes the store,
consistent with the observed ENOENT stack. No production edits were made.

Lead accepts the classification and authorizes ONLY linked test-remediation130,
preferring in-memory fixture setup without weakening the actual boundary test.
No blanket timeout change or production patch authorized. Worker reported
isolated snapshots cleaned and live tree untouched; audit evidence retained.
The initial CI failure remains recorded despite the green retry. This diagnosis
is complete; its record is archived with the125 closure.130 is separate
unfinished implementation. Task125 closes on its own reviewed fix and green
CI evidence; no claim is made that the test-fixture weakness is already fixed.

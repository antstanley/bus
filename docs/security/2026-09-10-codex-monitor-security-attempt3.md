# Task 149 codex-coordination monitor — security attempt 3 (final): verification report

- Date: 2026-09-10
- Reviewer model: GLM 5.3 Flash (clean verification reviewer-remediator, attempt 3 of 3)
- Scope: frozen attempt-3 bytes — `scripts/codex-coordination-monitor.py`,
  `scripts/test-codex-coordination-monitor.py`, `docs/guides/codex-coordination-monitor.md`;
  read-only context `docs/security/2026-09-10-codex-monitor-security-round1.md`,
  `backlog/149-codex-coordination-monitor.md`, `docs/research/04-trust.md`;
  live launchd plist at `/Users/stan/.board/monitors/codex-01a08790/launch-agent.plist` (READ-ONLY).
- Worktree: `/private/tmp/sidekick-task149-essun`, branch `task149-codex-monitor`,
  HEAD `e6341c5e59b4126ea19f8e82f906a6587f366aa5`.

## Verdict

**CLEAN — no-change security pass.** All checklist items verified against actual bytes,
zero scoped security findings, zero deliverable byte changes, all checks green.
No fixes were made; no integration/CI impact.

## Observed hashes

| file | observed sha256 | manifest | result |
|---|---|---|---|
| scripts/codex-coordination-monitor.py | 49cc4137312251d4bcf03b12cc910b3688ddd29163e22c43f687f116f345c23d | same | MATCH |
| scripts/test-codex-coordination-monitor.py | 8f9401cdf58befabfcd6c8f509b094d5adcb9c5b43d7e6c0c6b7c75c2b7f2ad8 | same | MATCH |
| docs/guides/codex-coordination-monitor.md | 81889a2f0aaa145710cda1e9149e752e14d4c7483e91604f551bb1623bc95f20 | same | MATCH |
| ~/.board/monitors/codex-01a08790/launch-agent.plist | 341afce5815d89e75200c8b5763924be2a92ca4d17ae0946879f6f6ab1a6b82c | 341afce5815d89e75200c8b5763924be2a92ca4d17ae0946879f6f6ab1a6b82c | MATCH |

Hashes were re-verified after the check run; all four still MATCH.

## Checklist results

1. **Hash gate** — PASS. All three deliverable hashes match the frozen manifest (re-checked post-checks).
2. **Trust boundaries** — PASS. Queue argv carries only monitor-authored fixed templates
   (`DATA_TEXT`/`FAIL_TEXT` with counts, kind literal, UTC ts); git stderr details are bounded by
   `sanitize_detail` (first line, 200 chars) and never enter queue text. Board JSON parsed minimally:
   object check + isinstance-guarded `author` only. Legacy filenames are stored/compared/stat'ed only;
   file contents are never read. No `eval`/`exec`/`shell=True`/`Popen`/`os.environ`/credential reads;
   no logging of post bodies, authors, titles, or paths.
3. **Subprocess safety** — PASS. Git and queue calls use argv lists via `subprocess.run(capture_output=True,
   timeout=...)`; timeouts are validated finite and positive. Fetch is pinned-refspec
   (`--no-tags --no-recurse-submodules --refmap=`, `FETCH_HEAD` only); non-FF is refused via
   `merge-base --is-ancestor` plus compare-and-swap `update-ref <ref> <new> <old>`. No
   checkout/merge/commit/push anywhere.
4. **Untrusted-input robustness** — PASS. Both RecursionError fixes present and regression-tested:
   `test_deeply_nested_post_json_is_corrupt_not_internal_error` (post JSON 20k deep -> corrupt,
   cursor advances, later posts drain) and `test_deeply_nested_state_json_fails_closed_as_config_error`
   (state JSON 5k deep -> exit 11, no queue). Oversize gate via `git cat-file -s` before read
   (default 64 KiB); corrupt posts stay pending without starvation.
5. **Starvation remedy** — PASS. `board_after` cursor advances on every examined candidate (including
   corrupt, oversize, failed blob reads; set before the parse attempt), single reordered pass gives
   wrap-at-most-once; `legacy_first` bool hands the next poll's budget to pending legacy items.
   Both persist (atomically) only on queue ack or quiet poll; unchanged on queue/verify/fetch failure
   for retry. Constant-count progress fields — no unbounded growth. Regression tests:
   `test_progress_and_source_priority_retry_unchanged_after_queue_failure`,
   `test_budget_is_shared_with_deferred_legacy_priority`,
   `test_full_malformed_or_failed_read_batch_cannot_starve_other_items`,
   `test_version_one_state_without_progress_fields_keeps_baseline` — all pass.
6. **State/lock** — PASS. `save_state_atomic`: `mkstemp` (0600) in the state directory, fsync,
   `os.replace`, directory fsync, temp unlink on exception. Corrupt/unknown-version/foreign state
   fails closed with exit 11. `flock LOCK_EX|LOCK_NB`, released in `finally`, second run exits 10
   quietly. `verify_replica` checks marker bytes, checked-out branch, origin URL and
   `board.store=true` fail-closed before any fetch; fetch is skipped on verify failure.
7. **Plist (read-only)** — PASS. sha256 matches the pin exactly. Flags are the full required argparse
   set (`--replica --expected-origin --expected-branch --marker-path --marker-content --git-binary
   --queue-binary --thread --lock --state --legacy-inbox --lead-author`), no optional overrides,
   no `--noop`/`--status` (poll mode), `StartInterval=120`, `RunAtLoad=false` — consistent with the
   guide's launchd template and the argparse contract (guide-template/argparse consistency is also
   covered by `test_guide_plist_is_valid_and_flags_match_argparse`, which passes).
8. **Checks** — PASS. `/usr/bin/python3 -m py_compile` on both scripts: exit 0, no output.
   `/usr/bin/python3 scripts/test-codex-coordination-monitor.py`: `Ran 49 tests in 35.014s` — **OK**,
   exit 0. Cleanup observation: no `scripts/__pycache__` was created by the compile/test run
   (macOS system Python redirects .pyc caches to `~/Library/Caches/com.apple.python`, outside the
   worktree; verified empirically), so there was nothing to remove and results are unaffected.
   Post-check `git status --short --untracked-files=all`: exactly the 4 frozen files (3 deliverables +
   the round-1 report), no modifications; HEAD unchanged.

## Lead-accepted cosmetic exception

Guide line 298 (`# Manual one poll now (optional): `) has one trailing space. Recorded as the
lead-accepted cosmetic exception; deliberately NOT modified.

## Byte-change confirmation

Zero byte changes to any deliverable. All three deliverable hashes match the frozen manifest before
and after the check run; `git status` was identical pre- and post-checks
(4 untracked files, nothing modified). The only file added by this attempt is this report
(`docs/security/2026-09-10-codex-monitor-security-attempt3.md`), which is audit evidence, not a
product change — the integrated source at 439bad8 is unaffected and no re-integration or CI re-run
is required.

## Conclusion

Attempt 3 is a clean no-change security pass; the applicable security gate for task 149 stands.
Root may proceed with activation per the milestone boundary.

# Codex monitor security round 1 — task 149 (2026-09-10)

Reviewer: clean GLM 5.3 Flash security reviewer-remediator (attempt 2; the
first round-1 dispatch was preflight-blocked at the hash gate on a stale
tests hash in the orchestrator manifest — no substantive review occurred in
attempt 1). No inherited conversation; all inputs independently rehashed and
re-inspected. Repo: isolated worktree `/private/tmp/sidekick-task149-essun`,
branch `task149-codex-monitor`.

## Verdict

**REMEDIATED — FRESH GLM VERIFICATION REQUIRED.** Two findings fixed in the
writable deliverables (1 High availability, 1 Low classification); 2
regression tests added. All checks green after the fixes. This is not a
no-change pass, so a fresh clean GLM reviewer must verify per policy.

## Input hashes (independently rehashed) vs corrected manifest

Provenance: the earlier attempt-1 manifest carried tests hash
`2d577f42…` (the post-round-1 snapshot); the lead issued a corrected
manifest, re-dispatched as this attempt. All three corrected hashes were
recomputed from the bytes on disk and match:

| file | manifest (corrected) | observed | result |
|---|---|---|---|
| scripts/codex-coordination-monitor.py | b9b81cd14a9246b74a7d041e3609370e9903bdc9cef785e1a375b2fd751157f3 | b9b81cd14a9246b74a7d041e3609370e9903bdc9cef785e1a375b2fd751157f3 | MATCH |
| scripts/test-codex-coordination-monitor.py | c7f0251eec0cfef11a75bd9dd69a4bea995a4c4220fb99b23eb61c47632885ff | c7f0251eec0cfef11a75bd9dd69a4bea995a4c4220fb99b23eb61c47632885ff | MATCH |
| docs/guides/codex-coordination-monitor.md | 81889a2f0aaa145710cda1e9149e752e14d4c7483e91604f551bb1623bc95f20 | 81889a2f0aaa145710cda1e9149e752e14d4c7483e91604f551bb1623bc95f20 | MATCH |

Context inputs read from the worktree: `backlog/149-codex-coordination-monitor.md`,
`docs/research/04-trust.md`. HEAD before and after:
`e6341c5e59b4126ea19f8e82f906a6587f366aa5` (unchanged; deliverables untracked).

## Findings

| # | location | severity | finding | disposition |
|---|---|---|---|---|
| F1 | scripts/codex-coordination-monitor.py:482 (`board_phase`, json parse) | **High** (availability, untrusted-content trigger) | The except tuple around `json.loads` of untrusted board post JSON caught only `(FetchError, ValueError, UnicodeDecodeError)`. A deeply nested post (e.g. `"["*20000 + "]"*20000`, 40 KB < the 64 KiB body cap) makes `json.loads` raise `RecursionError`, which escapes `poll_once` before any state save: the cursor never advances, the post is never recorded corrupt, and every later poll repeats → one untrusted post permanently wedges the monitor (persistent exit 1, no wakes, no self-healing). Empirically confirmed: `json.loads` raises `RecursionError`, not `ValueError`, at this depth. | **FIXED**: `RecursionError` added to the except tuple; such posts are classified corrupt (counted, cursor advances, stay pending, capped per poll). Regression test `test_deeply_nested_post_json_is_corrupt_not_internal_error` added. |
| F2 | scripts/codex-coordination-monitor.py:265 (`load_state`, json parse) | Low | Same gap on the persisted state file: a hostile/corrupt state file with deeply nested JSON exited 1 (`EXIT_INTERNAL`) instead of the documented fail-closed `EXIT_CONFIG` (11). Behavior still failed closed (no queue, no write), so impact is misclassification only. | **FIXED**: `RecursionError` added; exit is now 11 as documented. Regression test `test_deeply_nested_state_json_fails_closed_as_config_error` added. |
| N1 | scripts/codex-coordination-monitor.py:443–449 + guide "Caps and pending batches" | Info | Oversize/corrupt posts are re-enumerated and size-checked every poll without consuming cap slots; a large oversize backlog adds unbounded per-poll latency (git calls are individually timeout-bounded; the lock makes overrun polls exit 10 quietly). Already documented as a limitation in the guide; no change made. | accepted (documented) |
| N2 | state file `errors.last_error_detail` | Info | Bounded (first line, 200 chars) git stderr is persisted and shown by `--status`; if git echoes a remote URL on failure it would appear there. The provisioned origin URL carries no embedded token, so no secret exposure in the current provisioning. | accepted (no change) |
| N3 | scripts/test-codex-coordination-monitor.py (`load_state` value types) | Info | `board_seen`/`legacy_seen` values from a foreign state file are not type-checked (keys are). Values never influence wake decisions (fingerprints currently unused), so no security impact. | accepted (no change) |

Positive verification highlights (no findings): queue argv carries only
fixed monitor-authored text (counts/kind/timestamp) — no external content
reaches any command or prompt; board JSON is parsed only for `author`
(isinstance-guarded) and compared, never executed, logged, or stored beyond
a path→sha256 map; legacy filenames are stored/compared only; all git/queue
invocations are argv-list with no shell and bounded timeouts; error details
are bounded to one line / 200 chars; no `os.environ`/`getenv`/`shell=True`/
`eval`/`exec`/`Popen`/`system` anywhere in the monitor; binaries must be
explicit executable paths (validated); state writes are mkstemp(0600) in the
same directory + fsync + `os.replace` + directory fsync; lock is
`flock(LOCK_EX\|LOCK_NB)` created 0600, released in `finally`, never deleted;
`ls-tree -z` with `--` separator and prefix filter; legacy inbox uses
`is_file(follow_symlinks=False)` (subdirs/symlinks ignored, tested);
verify-before-fetch fails closed on marker/branch/origin/`board.store`
mismatch (exit 3, fetch skipped); non-FF updates refused with CAS
`update-ref`; tag/submodule recursion excluded (`--no-tags`
`--no-recurse-submodules --refmap=`).

## Starvation remedy verification (round-3 remedy)

Verified end to end by code reading plus the existing tests
(`test_full_malformed_or_failed_read_batch_cannot_starve_other_items`,
`test_budget_is_shared_with_deferred_legacy_priority`,
`test_malformed_first_cap_one_drains_valid_board_and_pending_legacy`,
`test_progress_and_source_priority_retry_unchanged_after_queue_failure`):

- Correct: `board_after` cursor advances on every examined candidate,
  including malformed JSON and failed blob reads (oversize/corrupt included);
  budget exhaustion leaves the cursor at the last examined path.
- Bounded: one shared cap (default 200, hard-bounded 1–200) across board
  read attempts and new legacy items; one queue call per poll.
- Wrap-once: candidates are reordered `[> after] + [<= after]` per poll —
  each path examined at most once per poll.
- Progress durability: cursor/`legacy_first` persist only on queue ack or
  quiet poll and stay unchanged on board or queue failure (retry same
  batch); board failure leaves the cursor untouched (fresh `BoardPhase()`
  has `after=None`, guarded by `if not failed_kind`).
- `legacy_first` priority: set only when legacy items remained pending AND
  board reads consumed the full cap; the next poll gives legacy the budget
  first, then board resumes first. No unbounded growth: progress state is
  one path string plus one boolean.

## Plist cross-check (read-only input)

`/Users/stan/.board/monitors/codex-01a08790/launch-agent.plist` observed
sha256 `341afce5815d89e75200c8b5763924be2a92ca4d17ae0946879f6f6ab1a6b82c` —
matches the lead's pin (per the relayed addendum). Observed before and after
the review; unchanged.

Cross-check against the argparse contract and the guide's launchd section:

- All 12 required flags present with plausible values (`--replica`,
  `--expected-origin` = https://github.com/antstanley/bus-board.git,
  `--expected-branch` = board-data, `--marker-path`/`--marker-content`,
  `--git-binary` = /usr/bin/git, `--queue-binary` = absolute fnm codex path,
  `--thread`, `--lock`, `--state`, `--legacy-inbox`, `--lead-author`).
- `StartInterval` = 120 ✓; `RunAtLoad` = false ✓; `ProcessType` = Background ✓
  (matches guide example); StandardOutPath/StandardErrorPath set under the
  monitor directory ✓.
- `EnvironmentVariables.PATH` is provided and `WorkingDirectory` is set to
  the project root — both harmless: the monitor resolves all binaries via
  explicit absolute paths and uses absolute paths for all state/IO, so
  neither is relied upon or risky. Informational only.
- **No config change required.** One provisioning note for the lead (not a
  defect): the plist runs a COPY of the monitor at
  `/Users/stan/.board/monitors/codex-01a08790/codex-coordination-monitor.py`;
  that copy must be updated to the integrated, remediated deliverable (and
  re-provisioned state considered) before activation.

## Changes made (this round)

1. scripts/codex-coordination-monitor.py:482 — added `RecursionError` to the
   corrupt-post except tuple (F1).
2. scripts/codex-coordination-monitor.py:265 — added `RecursionError` to the
   state-parse except clause (F2).
3. scripts/test-codex-coordination-monitor.py — added
   `test_deeply_nested_post_json_is_corrupt_not_internal_error` (TestCaps)
   and `test_deeply_nested_state_json_fails_closed_as_config_error`
   (TestConfigAndStateHardening).

Guide: no changes needed — all security-relevant guide claims re-checked
against the implementation (exit codes and precedence, cap/budget semantics,
backoff, `--refmap=`/`--no-tags`/`--no-recurse-submodules`, FF/CAS refusal,
oversize/corrupt pending behavior, dedupe-by-path, atomic state write,
plist flag list) and all hold, including with the two fixes.

## Check outputs (exact commands, /usr/bin/python3)

- `/usr/bin/python3 -m py_compile scripts/codex-coordination-monitor.py
  scripts/test-codex-coordination-monitor.py` → exit 0, no output.
- `/usr/bin/python3 scripts/test-codex-coordination-monitor.py` → exit 0,
  `Ran 49 tests in ~32s`, `OK` (47 pre-existing + 2 new; 47/47 also green
  before the fixes).
- `rm -rf scripts/__pycache__` → done after the run.
- `git status --short --untracked-files=all` → exactly the 3 deliverables +
  this report file (see confirmation below).
- `git rev-parse HEAD` → `e6341c5e59b4126ea19f8e82f906a6587f366aa5`
  (unchanged from start).

## Final file hashes (SHA-256)

See the lead-facing summary transmitted with this report for the exact
final values; they are computed over the post-fix deliverables plus this
report file.

## Worktree state confirmation

Branch `task149-codex-monitor` at `e6341c5e59b4126ea19f8e82f906a6587f366aa5`
(unchanged). Untracked: `scripts/codex-coordination-monitor.py`,
`scripts/test-codex-coordination-monitor.py`,
`docs/guides/codex-coordination-monitor.md`,
`docs/security/2026-09-10-codex-monitor-security-round1.md` (this report).
No tracked-file modifications, no other untracked residue, no scratch files
outside the worktree, no background processes.

## Boundary

No activation claims: activation is the lead's decision after the applicable
clean passes, provisioning checks and a real queue receipt, per the task 149
record and MILESTONES.md. This reviewer made no live board, live bus, live
queue, or plist changes.

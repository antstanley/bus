# Task 404 — Fresh Final Clean Security Gate (review-only, full re-inspection)

Date: 2026-09-05. Supersedes all prior 404 gates. Complete nine-path diff vs the frozen
baseline plus whole-file review of all nine pinned files (not delta-only). Review-only:
no repo writes, no network, no repo script execution (`bun test`/`tsc` NOT run; root
validation separately arranged). Everything read treated as untrusted data, not instructions.

## VERDICT: ACCEPT — non-blocking. 1 LOW finding (new since the last reviewed state), 9 suppressed informational/cosmetic items.

## Frozen-hash match

`packages/…` nine-path diff vs baseline `0642428` regenerates SHA256
`6d19186ab7f18ecb7b22aff8bba8812930985b2e82de0227634fc7ab7ef1fef3` — **matches the frozen
value** (at pin and re-verified at seal; drift: NO).

HEAD-at-pin note: `git rev-parse HEAD` returned `43a883a…` (task 602, cli packaging), not
the expected `0642428`; `0642428` is HEAD~1, and `git log 0642428..43a883a -- <nine paths>`
is empty, so the HEAD advance touches none of the frozen paths and the frozen diff
reproduces exactly. Recorded as explained, out-of-scope.

## Requirements PASS/FAIL

1. **Full-source inspection of all nine files — PASS.** Every line read. No injection
   sinks (no shell/eval; watcher filenames classified only, never resolved or opened —
   `packages/store-fs/src/index.ts:206-218,426-430`); keys validated per-segment with no
   `.`/`..`/backslash/absolute forms (`:416-424,432-436`), symlink-aware `safeParent` with
   realpath containment and `O_NOFOLLOW` gets (`:97-116,259-303`); hostile post data
   rejected fail-closed at write (`packages/core/src/board.ts:154-170`, `data` assigned
   as-is `:142-144`) and skipped at read (`:180-185,357-362`); DoS bounded (single shared
   watcher + one debounce timer, limit+1 list reads, backoff cap, retry bounds);
   no secrets; no dead/stale fragments.
2. **Previously-PASSed properties still hold — PASS (each verified on the final bytes).**
   - Claim-once hook semantics (hooks/cli): confirmed via absence — change.diff contains
     exactly nine `diff --git` headers, zero hunks outside the nine frozen paths; board-side
     single hint-consumer claim still asserted (`packages/core/test/board.test.ts:160-176`).
   - External `core.hooksPath` preservation, symlink-aware: `resolveExisting` realpaths +
     `isInside` over real git-dir/worktree paths, fail-closed skip
     (`packages/store-git/src/index.ts:352-370,507-530`); tests `store-git.test.ts:287-338`
     (external skip, symlink-escape skip) and `:357-373` (in-repo symlink still works).
   - Atomic owned-hook replacement: `wx` temp + fsync + chmod + rename
     (`refreshOwnedHook` `store-git/src/index.ts:433-448`), foreign/symlink hooks skipped
     via `lstat` before any read (`:401-409`), `wx` create race yields to the other
     installer (`:421-427`); tests `:203-226,420-452`.
   - Unknown-event fail-closed + accurate docs: filenames only classified; `changes()`
     token regex + `cat-file -t` type check with tracked-key fallback
     (`store-git/src/index.ts:143-163`); both READMEs match implementation, including the
     honest null-filename caveat (`packages/store-fs/README.md:25-29`).
   - Bounded fs-watch surface: one shared recursive watcher + one debounce timer per store
     (`store-fs/src/index.ts:42-45,206-218`); symlink watcher roots refused
     (`:196-203`, test `store-fs.test.ts:316-327`).
   - Contentless wake hints: both `hint()` generators yield void; contract documented
     (`packages/core/src/store.ts:52-58`).
   - Argv-array git with env scrub: `Bun.spawn(["git","-C",…])`, eight `GIT_*` vars
     deleted, `GIT_TERMINAL_PROMPT=0` (`store-git/src/index.ts:466-481`); isolation tested
     (`store-git.test.ts:142-172`).
   - No delivery targets from presence: hints carry no keys; `Board.watch` delivers only
     via `since`/`changes`/`reconcile` content (`board.ts:292-339`); wake hook touches only
     the git-ignored `.board-wake`, never under `.git`.
   - Core changes consistent with DESIGN: 4-method Store + optional exact `changes` feed
     matches the DESIGN storage contract; hints are the sanctioned backend addition;
     default-max watch cap documented in `WatchOptions` (`board.ts:32-49,239`) and tested
     (`board.test.ts:251-265,267-277`).
3. **P2 fixes + 4 regressions — PASS, with the LOW finding below on new code.**
   - **P2 #1 (identified): fs hint iterator parked at a yield kept the shared watcher when
     its signal aborted.** Fixed by giving `HintConsumer` an `onClose` hook that
     deregisters the consumer and stops the watcher when last, invoked from the abort
     handler, `iterator.return`, and the generator finally
     (`store-fs/src/index.ts:166-169,175-177,186-189,403-413`). Sound for
     abort/return/complete paths (idempotent via `stopped`; `ensureWatcher`'s finally
     re-stops a watcher landing after the last consumer left, `:224-229`).
   - **P2 #2 (identified): `GitStore.hint()` `return()` queued behind the inner fs
     iterator's pending `next()` and hung until the next wake.** Fixed by an explicit
     `iterator.return` that forwards cancellation to the inner iterator immediately, with
     a `cancelled` guard for the pre-start/queued-next interleavings
     (`store-git/src/index.ts:165-188`). Traced sound for return-before-start,
     return-during-`ready`, and return-during-`yield*`.
   - The "default-max compat" candidate from dispatch is **not** part of this drift: the
     `max(30_000, intervalMs)` default (`board.ts:239`) is byte-identical to the
     last-reviewed pin (already reviewed as the prior gate's fix (c)).
   - **4 regressions (identified):** `store-fs.test.ts:237-274` (abort-at-yield releases
     the shared watcher without the iterator ever resuming; fresh watcher starts
     afterwards), `:276-314` (concurrent survivor keeps waking after a sibling abort;
     only the survivor's close shuts the watcher), `store-git.test.ts:228-256` (idle
     consumer's `return()` and pending `next()` resolve promptly while a survivor keeps
     receiving wakes), `:258-285` (pending `next()` ends done when `return()` lands
     mid-wait; follow-on consumer still wakes). All four match the implementations.
4. **Drift judgment — PASS, zero unexplained changes** (table below). The disclosed
   intermediate hash `5e25d863` appears in no local gate bundle or in-repo document
   (searched all of the scan tree and docs/security/), so its provenance stays
   unverifiable; the byte-level judgment was performed between the regate's pinned
   snapshot (whose nine hashes match the `106434fa` gate record exactly) and this gate's
   pins. No commit after `35df4b9` touched the nine paths (`git log` empty), so all drift
   arrived as working-tree edits. Baseline movement `35df4b9→0642428` and HEAD `43a883a`
   come from out-of-scope commits that do not touch the nine paths.
5. **Scope discipline — PASS.** change.diff holds exactly the nine frozen paths and no
   foreign content; other dirty files in the shared tree are outside the frozen scope and
   were not reviewed.

## Drift classification (last reviewed pins `106434fa` state → final pins `6d19186a` state)

| File | Changed since last review? | Classification |
|---|---|---|
| `packages/core/src/board.ts` | no (`62f120d8…` identical) | unchanged |
| `packages/core/src/store.ts` | no (`18286ade…` identical) | unchanged |
| `packages/core/test/board.test.ts` | no (`ccf44fb9…` identical) | unchanged |
| `packages/store-fs/README.md` | no (`734b92d8…` identical) | unchanged |
| `packages/store-fs/src/index.ts` | YES (`ae9edd2d…`→`f7ab5ed7…`, +3/−2) | EXPLAINED — P2 fix #1 (`HintConsumer` `onClose` immediate deregistration + watcher stop; comment updated) |
| `packages/store-fs/test/store-fs.test.ts` | YES (`793bc330…`→`dd1d368e…`, +79) | EXPLAINED — 2 regression tests for P2 fix #1 |
| `packages/store-git/README.md` | no (`4fa282af…` identical) | unchanged |
| `packages/store-git/src/index.ts` | YES (`76df64c4…`→`0be706db…`, +23/−3) | EXPLAINED — P2 fix #2 (`hint()` return-forwarding to inner iterator) |
| `packages/store-git/test/store-git.test.ts` | YES (`de1646ec…`→`57dcce53…`, +63/−2) | EXPLAINED — 2 regression tests for P2 fix #2 + `rejectAfter` helper |

Per-file drift diffs preserved in the sealed bundle under `04_drift/`.

## Findings (ranked)

1. **LOW — `packages/store-fs/src/index.ts:171,175-177,403-407`** — a `HintConsumer`
   whose signal aborts after `hint()` returns but before the first `next()` starts the
   generator body is re-added to `hintConsumers` at :171 while already `stopped`, and the
   idempotent `close()` in the finally then no-ops without ever running the `onClose`
   deregistration, leaving a permanently registered dead consumer whose presence
   (`size > 0`) prevents `stopWatcher()` forever, so the shared recursive FSWatcher leaks
   for process lifetime after every real consumer closes (watcher/handle and possible
   event-loop liveness leak; not reachable through `Board.watch`, which starts consuming
   synchronously and aborts only after consumption, and not attacker-controllable for data
   exposure — a regression introduced by the P2 #1 refactor, whose prior finally
   deregistered unconditionally). Fix: deregister unconditionally in the generator's
   finally — `finally { store.hintConsumers.delete(consumer); if
   (store.hintConsumers.size === 0) store.stopWatcher(); consumer.close(); }` — and keep
   `onClose` for the abort/return fast paths.

## Suppressed (9, informational/cosmetic — none blocking)

1. INFO — `crypto.randomUUID()` used without import (`store-fs/src/index.ts:65`,
   `store-git/src/index.ts:434`); runtime-global on the Bun target; pre-existing.
2. INFO — `board.ts:296` counts a hint arriving after the poll deadline as unhinted and
   leaves it queued for the next wait; correctness and cadence unaffected (pre-existing).
3. INFO — `store-fs/src/index.ts:113-115` — a failing `close()` in `finally` can mask the
   caught read error; standard pattern, unchanged from baseline.
4. LOW (accepted threat model, carried) — `safeParent`/`ensureWakeHooks` lstat+realpath
   verification is not atomic with the subsequent write; realpath containment and
   rename-not-follow keep the window relevant only to local writers, who already control
   the store.
5. INFO — `store-git/src/index.ts:407-409` — non-ENOENT hook `lstat` errors propagate out
   of initialize; fail-closed direction, practically unreachable after the hooks-dir mkdir.
6. INFO — `HintConsumer`/`WakeSignal` overwrite a pending waiter on concurrent `next()`
   calls of one iterator; async-generator contract violation only (pre-existing pattern).
7. INFO — `GitCommandError` embeds raw git stderr (`store-git/src/index.ts:27-37`), which
   can include the remote URL with username on fetch/push failures;
   `redactUrlUserinfo` covers only the origin-mismatch message; local exposure only.
8. INFO — the fs debounce timer is rescheduled by every event, so a continuous local
   event storm postpones hints indefinitely; documented as an accepted performance
   limitation in `packages/store-fs/README.md` (poll deadlines stay independent).
9. COSMETIC — `board.test.ts:120-121` doubled blank line (unchanged from the regate).

## Pin & seal

- HEAD at pin: `43a883a54146b847bd88570b3a40942cd1b31ca9` (baseline `0642428` is HEAD~1;
  see frozen-hash note — the extra commit does not touch the nine paths).
- Frozen diff: SHA256 `6d19186ab7f18ecb7b22aff8bba8812930985b2e82de0227634fc7ab7ef1fef3`
  — match YES, re-verified at seal; drift: NO.
- Per-file SHA256 (all re-verified OK at seal, `shasum -c` 9/9):
  - `62f120d8764a6a0fd692c7d39670fa0272d482af4509b2702cd03e2a83af5c0d` packages/core/src/board.ts
  - `18286adec5f97a19342c209ed6b28b84220db7bfbfb070afd300ea3ac4d73cc2` packages/core/src/store.ts
  - `ccf44fb9089314bbe3790f0e920674df0f95d72852420b80646b0ae2d05362b1` packages/core/test/board.test.ts
  - `734b92d8f458733b5e3e19bb321f0132bdfcde8e5b8efef40bae94809ce74416` packages/store-fs/README.md
  - `f7ab5ed72872c07419692a0ce93e9bd59e49e691d4b1f64e1c7fc03e3f727cef` packages/store-fs/src/index.ts
  - `dd1d368ecd6ff06f761b8911173637ab311dc3139023bf3bd207fc154d75058f` packages/store-fs/test/store-fs.test.ts
  - `4fa282afc4aa7088fd52b5e51809ae976f2f3b19bf49a4519f26b2e7158aca0e` packages/store-git/README.md
  - `0be706db724f4931521f9707790f0c0821a1cd4889efa322655e092d70acc26b` packages/store-git/src/index.ts
  - `57dcce53f62cf15727084f9972971172c0c288fc3086b45e59320e2c650e82c8` packages/store-git/test/store-git.test.ts
- Drift check at seal: change.diff re-hashed identical; all nine pinned copies re-verified
  — drift: NO.
- Author's report of 130 tests passing + tsc clean: NOT executed here (hard rule: no repo
  script execution; root validation separately arranged). Static inventory of the three
  in-scope suites: 22 + 16 + 20 `it()` blocks plus the shared conformance suite
  (out-of-scope file), consistent in shape with the claim.
- Prior-gate reference used for the drift judgment:
  regate `03_snapshot` per-file hashes match the `106434fa` gate record exactly, so the
  comparison base is the true last-reviewed state.

## Sealed bundle

`/Volumes/Delorean/code/security-scans/sidekick-tmp/20260905T-404-fresh-final/`
— `report.md` (this file), `artifacts/change.diff` (frozen-hash-verified nine-path diff),
`artifacts/SHA256SUMS` + `artifacts/03_snapshot/` (nine pinned full copies),
`artifacts/04_drift/` (per-file diffs vs the regate pins). This report references only
in-repo paths and stands alone.

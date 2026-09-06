# Task 404 — Final Clean Security Gate (security-diff-scan)

Date: 2026-09-05. Review-only sub-agent; no repo files modified.
Change under review: task 404 "fs.watch and git-hook wake hints" (`backlog/404-fs-watch-and-git-hook-wake-hints.md`).
Baseline: commit 463ff65 (HEAD at pin = `463ff6588d3e70d61561fc5d8bd528b4677a6b7a`; the task-404 change is the uncommitted working-tree delta vs that commit). Threat model: `docs/research/04-trust.md` (untrusted store; hook delivery content attacker-controlled; presence records attacker-writable; delivery targets only from local registries).

## VERDICT

**ACCEPT** — no blocking findings. 1 LOW finding (defense-in-depth, doc-guarantee bypass), 4 suppressed informational items. The frozen scope reproduces exactly; all six review foci PASS.

## Derived scope (hash-verified, not guessed)

Candidate paths after the lead's exclusions (packages/mcp/*, packages/index/*, cli task-command paths, AGENTS.md, SECURITY.md, DESIGN.md, backlog/*) were searched exhaustively for the unique 9-path subset whose `git diff 463ff65 -- <paths>` SHA256 equals the frozen value. The frozen scope is NOT under packages/hooks/ or packages/cli/ as the lead's heuristic expected — the hash is the authority. It is core + store-fs + store-git (task 404 spans FsStore.hint, GitStore wake hooks, Board.watch):

1. `packages/core/src/board.ts`
2. `packages/core/src/store.ts`
3. `packages/core/test/board.test.ts`
4. `packages/store-fs/README.md`
5. `packages/store-fs/src/index.ts`
6. `packages/store-fs/test/store-fs.test.ts`
7. `packages/store-git/README.md`
8. `packages/store-git/src/index.ts`
9. `packages/store-git/test/store-git.test.ts`

Scoped diff SHA256 = `dd9c022c374df548fd5de3e50619b8a116ca23577e77005ec30e0b3ce58f6b7e` — **matches the frozen value exactly** (re-verified at seal). The subset is unique among the C(21,9) non-excluded candidates. Note for the lead: `packages/hooks/src/board-hook.ts`, `packages/hooks/test/hooks.test.ts`, `packages/hooks/README.md`, and `packages/cli/*` are modified in the shared tree but are OUT of this frozen scope (another in-flight workstream).

## Review foci

1. **PASS — original 4 fixes hold.** The prior-round fixes live outside the frozen scope — hook claim-once (`packages/hooks/src/board-hook.ts:181` "hook-claim", `:275-282`), delivery-log/delivery-targets with validated fields (`packages/hooks/src/board-hook.ts:79-102`), runtime-id contract (same file, runtime+session identity), legacy/owned-merge hook handling (`packages/cli/src/install.ts:72-73`) — and `change.diff` contains zero hunks in any of those files, so the change cannot regress them; the new GitStore wake hooks (`packages/store-git/src/index.ts:333-394`) are a disjoint mechanism (board repo's git hooks, marker `# board-store-git owned wake hook v1`, `:9`), never touching packages/hooks session-hook state.
2. **PASS — external core.hooksPath preservation.** `packages/store-git/src/index.ts:334-342` resolves `git rev-parse --git-path hooks`, and skips management entirely (no mkdir/inspect/write) unless the hooks dir is strictly lexically inside the git dir or the worktree (`isInside`, `:472-474`, sep-suffixed so no sibling-prefix match); test `packages/store-git/test/store-git.test.ts:228` proves a foreign sentinel outside the repo stays byte-for-byte intact with mode preserved, an external dir is never created, and default `post-merge` is absent; skip is explicit and honestly documented (`packages/store-git/README.md:38-42`).
3. **PASS — atomic owned-hook replacement.** `packages/store-git/src/index.ts:398-413` refreshes an owned, drifted hook via exclusive-create temp (pid+UUID) in the same directory → fsync → `rename` (atomic, no torn script even while the old body executes); only hooks starting `#!/bin/sh\n<HOOK_MARKER>\n` are refreshed/chmod'd (`:378`), foreign/symlink hooks are skipped via `lstat` before any read (`:368-370`), and first install uses `wx` so a concurrent installer's file wins without replacement (`:387-391`); idempotency and temp cleanup proven by `packages/store-git/test/store-git.test.ts:203,317`.
4. **PASS — accurate unknown-event docs, fail-closed handling.** Unknown/unclassifiable watcher events are handled fail-closed: the event type is ignored, the filename is only classified (never resolved or opened — `packages/store-fs/src/index.ts:190-194,406-410`), a hint carries no payload (`packages/core/src/store.ts:52-57` — "a yielded value only means that the store may have changed"), and the store-fs README documents the null-filename coalescing behavior as an accepted performance limitation, not a correctness issue (`packages/store-fs/README.md:18-27`); the wake hook ignores stdin/push payload entirely (`packages/store-git/src/index.ts:350-363`).
5. **PASS — fs watch / wake hint surface.** One shared recursive watcher per FsStore rooted at the store root, never per-event child watchers (`packages/store-fs/src/index.ts:177-214`), symlinked watcher roots refused (`:182-187`, test `packages/store-fs/test/store-fs.test.ts:177`), one debounce timer per store (`:196-201`), watcher error/close fail consumers and release the watcher (`:216-231`, test `:161`); event filenames validated by non-use (untrusted `../../outside` Buffer event yields at most a hint, `packages/store-fs/test/store-fs.test.ts:144-146`); hints are contentless `AsyncIterable<void>` (`packages/core/src/store.ts:56`) and the wake file is an empty ignored touch (`packages/store-git/src/index.ts:361`), so no post content and no delivery targets (presence-derived or otherwise) exist anywhere in scope; all git invocations on changed lines are argv arrays via `Bun.spawn(["git", "-C", dir, ...args])` with no shell (`packages/store-git/src/index.ts:431-454`), the hook body is a fixed literal over compile-time constants with quoted expansions (`:350-363`), and spurious-hint pressure cannot starve or postpone correctness work (`packages/core/src/board.ts:287-333`, tests `packages/core/test/board.test.ts:178-250`).
6. **PASS — standard pass on changed lines.** No injection sinks added (watch-option validation `packages/core/src/board.ts:236-238`; error messages without attacker data; `wake_root` derived in-shell from git with quoted expansions and an empty-value dead end, `packages/store-git/src/index.ts:353-361`); path handling is resolve+strict-containment (`:336,342,472-474`) and FsStore key paths unchanged (validated keys, O_NOFOLLOW gets, realpath containment); DoS bounded (single watcher, single timer, debounced hints, poll backoff capped at `maxIntervalMs`, reconcile cadence under hint pressure, `:316-321`); fail-closed error handling (watcher errors end hint iterators and Board.watch degrades to polling, `packages/core/src/board.ts:272-281`); no secrets introduced (wake file empty and excluded via `.git/info/exclude`, `packages/store-git/src/index.ts:327-330`). Tests reviewed statically: they prove the claims above without executing untrusted content.

## Findings (ranked)

1. **LOW — packages/store-git/src/index.ts:342-343** — the core.hooksPath containment check is purely lexical, so an in-repo hooksPath whose final directory component is a symlink (e.g. `.githooks` → an external directory) passes the check and GitStore creates/refreshes its hook files in a directory outside the repository through the symlink, bypassing the README guarantee that external hooks directories are "never created, inspected, or modified" (`packages/store-git/README.md:38-42`) and the symlink discipline FsStore itself applies to watcher roots (`packages/store-fs/src/index.ts:182-187`); impact is a doc-guarantee/defense-in-depth gap only, since an attacker able to write the repo config to plant it already controls hook execution via core.hooksPath. Fix: lstat each component of the resolved hooks dir (or realpath and re-run the containment check) before mkdir/write, skipping management on any symlinked component. Not covered by existing tests (`packages/store-git/test/store-git.test.ts:228-271` cover only literal external/in-repo paths).

## Suppressed (4, informational)

- packages/store-git/src/index.ts:361 — the hook's `: >` truncate follows a pre-existing `.board-wake` symlink and would truncate its target; only a local process able to write the worktree root can plant it (store keys reject leading-dot segments, so it cannot arrive through the store), and such an attacker can truncate files directly.
- packages/store-git/src/index.ts:361 + `commitPending` (`git add -A`) — a hostile remote push containing a tracked `.board-wake` could cause one churn commit after the hook truncates it; bounded (empty vs empty produces no diff) and already assumes a hostile remote.
- packages/store-git/src/index.ts:371-382 — a foreign hook swapped in between the marker read and the owned refresh rename would be clobbered (TOCTOU); requires a concurrent local writer who already owns the repo.
- packages/core/src/board.ts:275,302-307 — a misbehaving store implementation could hot-loop hints or keep `since()` truncated forever; the store implementation is local trusted code, not attacker-controlled data, and every hint is followed by bounded authoritative reads.

## Pin & seal

- HEAD at pin: `463ff6588d3e70d61561fc5d8bd528b4677a6b7a` (working tree holds the task-404 change uncommitted on top of it).
- Scoped diff: SHA256 `dd9c022c374df548fd5de3e50619b8a116ca23577e77005ec30e0b3ce58f6b7e` at pin and re-verified at seal — **matches frozen value; no drift**.
- Pinned full copies + `SHA256SUMS`:
  - `packages/core/src/board.ts` — `18121724faf5cd3476f392b6bee8303f32395d600d6fc05b15fb6959981bb5a8`
  - `packages/core/src/store.ts` — `18286adec5f97a19342c209ed6b28b84220db7bfbfb070afd300ea3ac4d73cc2`
  - `packages/core/test/board.test.ts` — `9ba4238f6ae036d5056e82f3c584af678ac1e1410ff8b51bc20e7a096497c38a`
  - `packages/store-fs/README.md` — `734b92d8f458733b5e3e19bb321f0132bdfcde8e5b8efef40bae94809ce74416`
  - `packages/store-fs/src/index.ts` — `60703bd29e043ae5cb6c039b2c20b91aad393a4ce635035d8681c11d84c84ecd`
  - `packages/store-fs/test/store-fs.test.ts` — `9db975f28583e400518728c77f378855227b19e13b17b9b327b1b41ccf1169e0`
  - `packages/store-git/README.md` — `2f64b423c7106acad4fd913dc43ad488366549105b7e5ae2c2b3d8064b33cb4f`
  - `packages/store-git/src/index.ts` — `9a98a44c2b660cb34ad5d99dac7f0941071125eb498b133acd285082decad85b`
  - `packages/store-git/test/store-git.test.ts` — `107a8195e0d8534e1d0c99d187742151f031f1336fa8fb4a9e5d8f4e8d78d4d3`
- Drift check at seal: re-generated scoped diff hash identical; all 9 pinned copies byte-identical to the working tree (`shasum -c` OK, `cmp` SAME ×9) — **drift: no**.

Sealed scan bundle: **the sealed scan bundle** `20260905T-404-final-gate`, containing `report.md` (this file), `artifacts/change.diff` (the hash-verified scoped diff), `artifacts/03_snapshot/` (pinned copies + SHA256SUMS), and `artifacts/find_scope.py` (the deterministic subset search used to derive the 9 paths). This report references only in-repo paths and stands alone.

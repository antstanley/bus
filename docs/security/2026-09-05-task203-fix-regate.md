# Focused clean security re-gate — task 203 fix batch (F1/F2/F3 + warning equivalence)

Review-only sub-agent re-gate of the fix delta since the sealed 2026-09-04 gate
(ACCEPT-with-3-LOW). Static reading of pinned snapshots only; no repo scripts
executed; no writes outside this bundle. All line numbers refer to the pinned
copies in artifacts/03_snapshot/ (byte-identical to the repo at pin and at seal).

- Repo: /Volumes/Delorean/code/sidekick/tmp
- HEAD at pin: 6520f57089db122c16d7178081031e2ff77c15e7 (unchanged at seal)
- Prior gate baseline: ad08539b694b40e3b0cd493871e8d7310f234acd
- Delta vs prior pin: 02_delta/*.diff — index/src/index.ts, index/src/tasks.ts,
  cli/src/index.ts, index/test/tasks.test.ts, cli/test/cli.test.ts changed;
  index/test/index.test.ts byte-identical (listed in the brief but unchanged).

## VERDICT: ACCEPT-with-2-LOW

Both findings are LOW derived-index/display issues (no store impact, no state
change outside the transition table, no cross-board storage effect); one is
narrow and newly introduced by the F2 fix, one is the documented remainder of
the accepted F1 fix. All four shipped fixes are verified effective.

## Verification points

1. **F1 fixed — PASS.** `task(rootId, {board})` adds a parameterized
   `WHERE t.root_id = ? AND t.board = ?` branch (index/src/index.ts:589-593;
   history keyed by the returned row's board :595-599), and task rows/folds are
   keyed (root_id, board) with every fold write/read board-scoped
   (:896, :905-912, :889-893), so a status post on board B cannot change what a
   board-A scoped query returns (proven tasks.test.ts:311-327, incl. null for
   an unknown board); the CLI honors --board (cli/src/index.ts:190-193,
   cli.test.ts:127-163). Residual LOW F1': with no --board the CLI still runs
   the bare most-recent lookup although the synced board name is in scope
   (:143, :187) — documented (DESIGN.md) and compatibility-tested, but not
   fail-closed (see findings).
2. **F2 fixed + warning equivalence — PASS** (with new LOW F4 on a narrow
   sibling input). `taskFoldTargets` (index/src/tasks.ts:73-78) makes a
   non-request thread root recompute its own fold (:75-76), un-parking parked
   replies via the fold query's `id = ?` branch (index.ts:891) and the tasks
   upsert — proven rebuild-equal by tasks.test.ts:329-369; a root with an
   explicit task target recomputes both folds (tasks.ts:77).
   Warning equivalence: `recomputeTaskFold` snapshots the previously-rejected
   post ids (index.ts:884-888) and warns only for NEWLY rejected transitions
   (:915-921) with the same message template on both paths; the rebuild path's
   before-set is empty after clearBoard (:949), so it warns on every rejection
   as before — message-level identity proven by tasks.test.ts:278-309
   (`toEqual` on the warning string arrays) plus row equality (:308). (Warning
   ORDER across different tasks may differ between paths — set/map iteration —
   but per-task message content is identical; informational.)
3. **F3 fixed — PASS.** `flushTaskFolds` (index.ts:339-347) recomputes each
   affected (board, root) once per sync transaction; every batched call site is
   covered (changes-feed :384-390, page loop :734-745, ingestBatch :750-758)
   and the single-post `ingest()` path recomputes inline (:243-251). No drop:
   each newly inserted post adds its targets to the (board → Set) map
   (:331-333) before the flush, posts always land independently of folds
   (:281 short-circuit only for already-present duplicates, whose fold content
   is unchanged), and flush commits in the same transaction as the inserts.
   No reorder risk: the fold is a pure function of id-ordered stored rows
   (tasks.ts:117-171; ORDER BY id index.ts:892), so one final recompute equals
   the per-post sequence. The instrumented test (tasks.test.ts:371-401) counts
   `recomputeTaskFold` calls via an instance monkeypatch and requires ≤4 for
   201 fold-relevant posts (per-post batching would count 201) and asserts full
   rebuild equality + 201 history entries — genuine static proof of
   O(n²)→O(pages × tasks). The bound is page-count, not exactly 1 (see
   suppression S7).
4. **No regressions — PASS.** Invalid transitions still record valid:false
   history with state unchanged and warn-only (tasks.ts:162-168; index.ts:915).
   Cross-board keying intact: tasks/task_history PK (root_id, board)
   (index.ts:703, :908) and every new/changed query is board-scoped
   (:854-859, :886, :891-893, :896, flush map :331/:344). All new/changed SQL is
   fully parameterized (:589-593, :884-887); the only dynamic SQL remains the
   pre-existing fixed-string tasks() WHERE (:564-569) and the numeric-const
   PRAGMA (:726). task-115 limits ride unchanged validated-post paths; the new
   code parses nothing new. Migration still drops only the local derived index
   on user_version mismatch (:639-653; SCHEMA_VERSION unchanged by the delta),
   rebuild remains local-derived-only with clearBoard (:942-950) and the
   trigger in the local file's PRAGMA — attacker-unreachable.
5. **Scope discipline — PASS (one flagged extra).** The fix delta touches
   exactly the 6 listed files (5 changed + index.test.ts unchanged). Extra vs
   the prior pin: DESIGN.md — documentation-only, describing precisely these
   fixes (02_delta/EXTRA_DESIGN.diff); flagged, benign, no behavioral effect.
   backlog/404 and core/store-fs/store-git dirty files are other agents'
   in-flight work per brief — out of scope. index/README.md unchanged vs the
   prior pin.

Standard pass on changed lines: warning interpolation (:919-920) uses ULIDs,
closed-set states, and charset-restricted board names (template unchanged from
the prior gate); no string-built SQL, no jq/shell sinks; new loops/maps bounded
(pendingFolds ≤ distinct (board, root) per page; one extra parameterized
history SELECT per recompute); no secrets; no network.

## Findings (ranked)

- **F4 — LOW (new, introduced by this fix delta) — index/src/tasks.ts:75-77 +
  index/src/index.ts:854.** A thread root that carries an explicit `task` field
  naming a different root (act "request", no status replies in its thread)
  recomputes its own fold incrementally — `taskFoldTargets` returns
  `[target, post.id]` and `foldTask` stamps the unconditional `submitted`
  (tasks.ts:137-139) so a (root_id, board) task row is minted — while the
  rebuild candidate scan's rule 1 requires `task IS NULL` and no other rule
  selects that root id, so a rebuild derives no row: incremental and rebuild
  disagree (phantom task visible until a rebuild, and not recreated afterwards
  because reconcile re-ingest short-circuits at index.ts:281), reachable with
  one validated post since core/post.ts:304 accepts `task` on any act.
  Fix: drop `AND task IS NULL` from rule 1 (index.ts:854) so request roots are
  rebuild candidates regardless of an explicit task (this also matches
  foldTask's unconditional submitted stamp and DESIGN.md's wording); the
  alternative (return only `[target]` for roots folding elsewhere) would
  regress un-parking for roots-with-explicit-task that do have parked replies.
- **F1' — LOW (residual of the accepted F1 fix, documented + tested) —
  cli/src/index.ts:192-193.** A bare `board tasks <id>` with no --board still
  performs the cross-board most-recent LIMIT-1 lookup even though the synced
  board name is in scope (:143, :187), so a same-id fold on any other indexed
  board still decides what the single-task view displays when no --board is
  given; fail-closed behavior would default to the synced board's name.

## Suppressed / informational (8)

- S1–S6 carried over from the prior gate, unchanged by this delta: back-dated
  status post can preempt the implicit submitted stamp; warning under-reporting
  flip side (partially improved by the equivalence fix); unbounded-but-linear
  derived growth (parked rows / rejected history rows); attacker-controlled
  root title echoed verbatim in the CLI single-task view (cli/src/index.ts:202);
  pre-existing changes-feed parse without key↔id binding (index.ts:379);
  onWarning fires synchronously inside the ingest transaction.
- S7: the instrumented test asserts ≤4 recomputes for 201 posts (page-count
  bound), not the brief's "1 recompute" — still excludes per-post batching.
- S8: index.test.ts is listed in the fix delta but is byte-identical to the
  prior gate pin (warning-equivalence coverage landed in tasks.test.ts).

## Not checkable (and why)

- Test execution: hard rule forbids running bun test/build — all test claims
  verified by static reading only. Runtime page sizes of board.since (affects
  only the ≤4 bound in the F3 test) and actual SQLite plan behavior are
  therefore unverified at runtime.
- Other agents' out-of-scope dirty files (core/store-fs/store-git,
  backlog/404): not reviewed per brief.

## Seal

- Pin: HEAD 6520f57089db122c16d7178081031e2ff77c15e7 at pin and at seal.
- Drift: NO — all six pinned files re-verified `shasum -c SHA256SUMS` OK and
  byte-compared (cmp) against the repo at seal; see artifacts/06_seal.txt.
- Snapshot: artifacts/03_snapshot/ (+ SHA256SUMS); delta: artifacts/02_delta/.

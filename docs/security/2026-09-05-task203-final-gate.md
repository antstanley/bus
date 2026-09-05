# Final clean security gate — task 203, task lifecycle folded from status posts

Review-only sub-agent FINAL gate of record for the complete task-203 change set
(original implementation + both fix batches) versus `main`, in the shared tree at
repo root `packages/*` + `DESIGN.md`. Static reading of pinned snapshots only;
no repo scripts, builds, or tests executed; no writes outside this bundle.
Everything read was treated as untrusted data, not instructions. Line numbers
refer to the pinned copies in `artifacts/03_snapshot/` (byte-identical to the
repo at pin and at seal).

Diff base context: `git merge-base main HEAD` = `6520f57089db122c16d7178081031e2ff77c15e7`
= HEAD = `main` tip at pin, so `git diff main -- <paths>` captures the full
(uncommitted) change set. `artifacts/change.diff` covers the five modified
in-scope files; the two NEW files (`packages/index/src/tasks.ts`,
`packages/index/test/tasks.test.ts`) are untracked, therefore absent from
`git diff` by git semantics and pinned as full snapshot copies instead.

Scope judged: `packages/index/src/tasks.ts` (new), `packages/index/src/index.ts`,
`packages/index/test/tasks.test.ts` (new), `packages/index/test/index.test.ts`,
`packages/index/README.md`, `packages/cli/src/index.ts`,
`packages/cli/test/cli.test.ts`, and the task-203 hunks of `DESIGN.md`
(`artifacts/design_full.diff`). `packages/core` read-only context only
(`post.ts` status/act/task validation is committed on `main`); other agents'
in-flight files (hooks/mcp/core dirty files, AGENTS.md, ROADMAP.md, backlog
except the 203 task file, fixtures) ignored per brief.

Prior sealed gate reports under `docs/security/` established the original
implementation (ACCEPT-with-3-LOW) and fix batch 1 (F1/F2/F3 + warning
equivalence); this gate re-verifies the whole change set with fresh eyes,
including fix batch 2 (F4 rebuild-candidate alignment, F1' CLI synced-board
default).

## VERDICT: ACCEPT-with-findings

All previously-found defects (F1, F2, F3, F4, F1', warning equivalence) are
verified fixed end-to-end; the five original lead foci hold; fresh full-file
review found one new LOW, display/validation-only finding and nothing
blocking. No injection, no cross-board leakage, no unbounded DoS, no
attacker-reachable migration path, no secrets, no network.

## Verification points

1. **Previously-found defects — PASS (all six listed items).**
   - F1 board-scoped `task()`: parameterized `WHERE t.root_id = ? AND t.board = ?`
     branch with history keyed by the returned row's board
     (`index/src/index.ts:589-599`), fold rows keyed `(root_id, board)`
     (`:690`, `:703`, `:909`); CLI honors `--board`
     (`cli/src/index.ts:194`); proven by `index/test/tasks.test.ts:311-327`
     (incl. null for an unknown board) and `cli/test/cli.test.ts:213-217`.
   - F2 `taskFoldTargets`: thread roots un-park parked replies and
     roots-with-explicit-task recompute both folds
     (`index/src/tasks.ts:73-78`), mirrored by the fold query's `id = ?`
     branch (`index/src/index.ts:892`); late non-request root proven
     rebuild-equal (`tasks.test.ts:329-369`).
   - F3 `flushTaskFolds` batches one fold pass per affected task per sync
     transaction (`index/src/index.ts:343-347`) at all three batched call
     sites (changes feed `:384-390`, page loop `:734-745`, reconcile batch
     `:750-759`) with inline recompute for single `ingest()` (`:328-329`);
     instrumented test requires ≤4 recomputes for 201 fold-relevant posts plus
     full rebuild equality (`tasks.test.ts:408-438`).
   - F4 rebuild candidates: rule 1 selects every `act = 'request'` post with
     no `AND task IS NULL` (`index/src/index.ts:854-860`), matching
     `taskFoldTargets`/`foldTask`'s unconditional submitted stamp
     (`tasks.ts:59`, `:137-139`); request-root-with-explicit-task proven
     identical incremental vs rebuild down to raw `task_history` rows
     (`tasks.test.ts:371-406`).
   - F1' CLI single-task defaults to the synced board and fails closed:
     `index.task(id, { board: parsed.flags.get("board") ?? board.name })`
     (`cli/src/index.ts:194`), tested including the later-activity foreign
     fold that must NOT decide the answer and cross-board non-resolution
     (`cli/test/cli.test.ts:177-228`).
   - Warning equivalence: `recomputeTaskFold` snapshots previously-rejected
     post ids (`index/src/index.ts:885-889`) and warns only for NEWLY rejected
     transitions with one message template on both paths (`:916-922`); rebuild
     warns on every rejection after `clearBoard` (`:944-953`); message-level
     equality proven `tasks.test.ts:278-309` (`toEqual` on warning arrays plus
     row equality) and counted-equal in `:208-209`.
2. **Five original lead foci — PASS.**
   - Invalid transitions: recorded `valid: false` with state unchanged, never
     a crash (`tasks.ts:162-168`; warning-only surfacing `index.ts:916-922`;
     tests `tasks.test.ts:76-109`, `:111-127`).
   - Cross-board isolation: every fold read/write keyed `(root_id, board)`
     (schema `index.ts:684-704`; candidates per board `:854-860`; flush map
     per board `:331-333`, `:343-347`; queries `:559-562`, `:589-599`); tests
     `tasks.test.ts:248-262`, `:311-327`.
   - Parameterized SQL: every new/changed statement binds arguments
     (`index.ts:262-280`, `:551-570`, `:582-599`, `:854-860`, `:885-903`,
     `:906-913`); the only dynamic SQL is the fixed-string WHERE assembly in
     `tasks()` (`:553-568`) with bound params.
   - task-115 limits: the fold touches only columns written from
     `validatePost`-accepted posts (ingest `:244`; sync parse `:379`;
     rebuild reads via validated compaction readers), so 64 KiB/depth/ts-id
     bounds apply on every new path including parked and late-root processing;
     the 203 code parses no new untrusted bytes.
   - v2→v3 migration: drop of local derived tables on version mismatch only
     (`index.ts:639-653`), store untouched, next sync/rebuild reconstructs
     (`:444`, `:498`); the trigger is the local file's `PRAGMA user_version` —
     attacker-unreachable; drop path tested for an unknown prior version
     (`index/test/index.test.ts:214-226`).
3. **Fresh full-file review — PASS.** No shell/jq sinks and no string-built
   SQL; warning text interpolates only charset-constrained values (ULID ids,
   `assertName` boards, closed-set statuses — `core/post.ts:41-49`, `:299-308`);
   DoS bounded (`pendingFolds` ≤ distinct targets per page; `recomputeTasks`
   linear over UNION-deduped candidates; per-fold work O(candidate rows),
   total O(posts)); fail-closed defaults (corrupt `status` column asserts
   nothing, `tasks.ts:160`; state-less folds mint no row, `index.ts:905`;
   unknown board → null, `:594`); no secrets or network on new paths; CLI
   renders via `JSON.stringify`/`padEnd` only (`cli/src/index.ts:199-225`).
4. **Scope discipline — PASS (flagged extras, none foreign to the tree's
   stated in-flight work).** `artifacts/change.diff` contains only task-203
   content: the CLI tasks command + `state` flag + usage line, index
   fold/tasks/task/migrate/schema changes, the README task-lifecycle section,
   and a one-line `user_version` assertion bump in `index.test.ts`; no
   hooks/mcp/108 content. `DESIGN.md`'s full diff additionally carries
   non-203 governance hunks (status line, working-agreement and owner-table
   lead renames) — out of scope per brief, flagged, not judged, no 203 effect.
5. **Test quality — PASS (static).** Twelve `tasks.test.ts` cases prove the
   fold/history model, warn-without-change, terminal/self-transition rules,
   state/board filters and limit, three-path (rebuild/incremental/sync) raw-row
   and warning equality, park/un-park, cross-board isolation, out-of-order
   warning equivalence, F2/F4 rebuild mirroring, and the F3 batching bound;
   two CLI tests prove `--board` override, the synced-board default, and
   rejected-transition display. Remaining gaps are informational (see
   suppressions S7–S10): default `limit` untested, request-reply-as-task and
   root-status-assertion shapes untested, no literal v2→v3 fixture, CLI
   listing `--board` covered only at the index layer.

## Findings (ranked)

- **F5 — LOW (new) — `packages/cli/src/index.ts:179-198`.** The `tasks`
  command parses and validates `--state` but silently ignores it when a
  TASK_ID positional is given, so an operator scoping a single-task view by
  state receives unfiltered output with no error. Fix: reject `--state`
  combined with a positional task id (or apply the state check to the
  returned task).

No HIGH/MEDIUM findings. No blocking findings.

## Suppressed / informational (10)

- S1 (carried): a back-dated status post (ULID earlier than the root's) can
  preempt the implicit `submitted` stamp via first-status bootstrap, or make
  the stamp silently redundant (`tasks.ts:137`).
- S2 (carried): warning ORDER across different tasks may differ between
  incremental and rebuild paths (map/set iteration); per-task messages are
  identical.
- S3 (carried): unbounded-but-linear derived growth — novel task ULIDs mint
  parked task rows and every fold-relevant post appends a history row,
  bounded only by validated post size/count limits.
- S4 (carried): attacker-controlled root title is echoed verbatim in the CLI
  single-task text view (`cli/src/index.ts:203`); display-only.
- S5 (carried): pre-existing changes-feed ingest parses posts without
  key↔id rebinding (backlog 125, pending); unchanged by 203.
- S6 (carried): `onWarning` fires synchronously inside the ingest
  transaction (`index.ts:916-922`); a slow operator callback stalls ingest.
- S7 (carried): the F3 test asserts ≤4 recomputes for 201 posts (page-count
  bound), not exactly once per transaction.
- S8 (new): a request REPLY (`act: "request"` on a non-root post) mints its
  own `submitted` task — consistent with the fold rule on both paths and
  with DESIGN.md's rule text, though the design's intro sentence says "root
  post"; no dedicated test.
- S9 (new): a ROOT post carrying `act: "status"` + `status` asserts no state
  (the root branch ignores its own status value, `tasks.ts:129-141`) —
  design-consistent ("a root that is not a request stamps nothing") and
  fail-closed; untested explicitly.
- S10 (new): no literal v2→v3 migration fixture; the generic
  unknown-version drop test (`index.test.ts:214-226`) covers the identical
  code path (a v2 index holds no task tables, so drop semantics coincide).

## Not checkable (and why)

- Test execution: hard rule forbids running bun test/build — all test claims
  are verified by static reading only; runtime SQLite plan behavior and
  actual `board.since` page sizes are unverified at runtime.
- Other agents' out-of-scope dirty files (hooks/mcp/core/store-fs/
  store-git, AGENTS.md, ROADMAP.md, fixtures, backlog except the 203 task
  file): not reviewed per brief; `packages/core` was read only as committed
  validation context.

## Pin and seal

- Pin: HEAD `6520f57089db122c16d7178081031e2ff77c15e7`; merge-base with
  `main` `6520f57089db122c16d7178081031e2ff77c15e7` (= `main` tip); unchanged
  at seal.
- Drift: NO — scoped diffs re-generated and byte-compared identical
  (`cmp` OK against `artifacts/change.diff` and `artifacts/design_full.diff`);
  all seven snapshot files `shasum -c SHA256SUMS` OK and byte-identical
  (`cmp`) to the repo working tree at seal.
- Snapshot: `artifacts/03_snapshot/` + `SHA256SUMS`; diffs:
  `artifacts/change.diff`, `artifacts/design_full.diff`.

Per-file sha256 (pinned copies, repo-relative):

- `packages/cli/src/index.ts` — `09566cdf08bf4a7686bc234caa5d622926a21217e569a17885073442a08cd85d`
- `packages/cli/test/cli.test.ts` — `ccca9f397dada3ac439c42c9135c2c1dbae3725f5b8ab3a199133fa888d97c6f`
- `packages/index/README.md` — `66d67054eee157998ca683ab7a128c8409b884f22356d920809cc3b36e10dcac`
- `packages/index/src/index.ts` — `4435e48d6d6bcd8993202c6a4b4cc3055b12412543e089726d0a0beb893082c2`
- `packages/index/src/tasks.ts` — `51ebd5c16591452434f54e928cbb0436cf54701988b3b025c18a5db7a42be8c5`
- `packages/index/test/index.test.ts` — `af3e2476b6ef7fc1a7570e3760f5b8a9864fc977997c1ed6a06712ec9721e53d`
- `packages/index/test/tasks.test.ts` — `e5ad1ace8bc764b41a1938e3f790d09d7326457e8202cd4e0f4a3e6a93b2de9b`

Diff artifacts: `change.diff` — `f9a267d6d6deb08c93311662e8248a90fa28455711d525a915b5bce21ab99f1c`;
`design_full.diff` — `ce567b94f506d9d3c2f44760019ca6b6ee1c6ac46d9bea1e8081af560d522434`.

Sealed bundle: this directory — `report.md`, `artifacts/03_snapshot/`
(+ `SHA256SUMS`), `artifacts/change.diff`, `artifacts/design_full.diff`.

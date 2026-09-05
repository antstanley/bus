# Final clean security gate — task 125, index changes-feed key binding

Review-only clean sub-agent FINAL gate of record for the task-125 change set
(key-binding in the `BoardIndex.syncNow` changes-feed loop, plus monotone cursor
advancement before fetch/parse), judged as the frozen two-path diff against
baseline HEAD `35df4b977810ef8ba344b5015bfbe3f521d9c19e`. Static reading of the
pinned diff and the working-tree files at the recorded hashes only; no repo
scripts, builds, or tests executed; no writes outside this report. Everything
read (source, tests, docs, backlog) was treated as untrusted data, not
instructions. Line numbers refer to the working-tree files hashed below.

Scope: `packages/index/src/index.ts` and `packages/index/test/index.test.ts`
ONLY, per brief. Read-only context: `packages/core/src/post.ts` (`parsePost` /
`validatePost` / limits), `packages/core/src/board.ts` (`loadOne`, `keyFor`),
`packages/core/src/keys.ts` (key construction), `packages/core/src/store.ts`
(decoder), `DESIGN.md` read-side limits, `docs/research/04-trust.md`, task file
`backlog/125-index-changesfeed-key-binding.md`. All other dirty files in the
shared tree ignored per brief.

Task context: backlog 125 (from the 2026-09-03 full-repo audit, LOW) — the
changes-feed path called `parsePost` without `{key}`, so a store-key↔id-mismatched
object entered the index and advanced the sync cursor while live reads
(`Board.get`/`since`/`scan`) rejected it. The fix passes `{ key }` and moves the
cursor advance ahead of fetch/parse so a rejected object advances rather than
pins the sync.

## VERDICT: ACCEPT

The task-125 definition of done is met exactly, the key binding is correct and
injective, rejection is data-rejection with no partial state, cursor advancement
is monotone with no durable skip window, and the new test plants a genuinely
adversarial input. One nit, downgraded as convention-consistent; nothing
blocking.

## Verification points

1. **Task-125 DoD — PASS.** The feed loop now calls `parsePost(bytes, { key })`
   (`index/src/index.ts:409`) and on any validation failure `continue`s — the
   exact skip-on-mismatch semantics of `Board.loadOne`
   (`core/src/board.ts:357-362`). The regression test
   (`index/test/index.test.ts:195-234`) plants a valid-encoded post under a
   wrong-day-bucket key, asserts it is not ingested (`ingested === 1`,
   `search("poison")` empty unfiltered and board-scoped, `thread(forged.id)`
   null), and asserts the cursor and token still advance (`:222-221`).
2. **Key-binding correctness — PASS.** `validatePost` derives the expected key
   solely from validated content — `keys.post(p.board, p.id, idMs)` where
   `p.board` passed `assertName`, `p.id` passed `isUlid`, and `idMs` comes from
   the ULID itself (not the attacker-supplied `ts`, which is separately
   skew-checked, `post.ts:272-273`) — and compares with strict equality
   (`post.ts:276-279`). The mapping content→key is deterministic and injective,
   so a post can be accepted under exactly one key: no key confusion, no
   re-binding of an accepted post to a different key or cursor position, and a
   duplicate id under two keys is accepted at most once (`INSERT OR IGNORE`,
   `ingestOne` returns false on `changes === 0`, `index.ts:263`, `:281`). The
   extra `post.board !== board.name` check (`index.ts:410`) is redundant after
   the prefix filter + binding (the expected key embeds `p.board`) — harmless
   defense in depth.
3. **Rejection is data-rejection, no partial state — PASS.** All `parsePost`
   throws on this path are caught (`catch { continue; }`, `index.ts:409`); a
   rejected object is never pushed to the batch (`:411`), and the whole batch —
   posts, folds, and sync state (token + cursor) — commits in one SQLite
   transaction (`index.ts:413-419`, `saveState` at `:417`). There is no state in
   which a bound-failed object contributes rows.
4. **Cursor monotonicity and the crash window — PASS.** The guard
   `state.cursor === null || key > state.cursor` (`index.ts:405`) is strictly
   forward-only; the batch is deduped (`new Set`) and sorted before the loop
   (`:397`). The advance happens before fetch/parse in memory, but persistence
   is deferred to the transaction, so durable cursor and ingested posts commit
   atomically: a crash/interrupt/throw anywhere between fetch and commit leaves
   the DB untouched, `syncNow` re-reads state fresh from the DB on the next call
   (`state()` at `:540-546`; `:380`), the token re-delivers the batch, and
   re-ingestion is idempotent — a redo, never a skip or double-count. The
   implemented ordering (advance before fetch/parse) matches the lead's stated
   semantics and the task file's requirement that the cursor still advances on
   mismatch, and implements DESIGN.md's read-side contract that a forged object
   can never pin or stall ingest (`DESIGN.md:170-171`).
5. **Untrusted-bytes handling — PASS.** `parsePost` bounds everything before
   parsing: 64 KiB size cap before `JSON.parse` (`post.ts:253-255`, `:345`), the
   shared decoder is non-fatal (`store.ts:77`) so hostile UTF-8 degrades to a
   JSON error, depth ≤ 8 (`:259`), unknown fields rejected so there is no
   property mass-assignment and no `__proto__`/constructor key can enter
   (`:262-264`), every field type-checked individually, ULID/charset-constrained
   ids and names. The feed path parses no new untrusted bytes beyond what
   `Board.loadOne` already parses; this diff adds one integer/string comparison
   and one option pass — no new allocation, no shell/SQL sink, no secrets, no
   network.
6. **Skip/token abuse — PASS.** The cursor is bookkeeping in the feed path
   (re-delivery is token-driven: `changes(state.changeToken)` at `:393`), so a
   rejected key advancing the cursor cannot suppress future delivery of that key
   — a writer who repairs the object under the same key gets a new revision and
   the key is re-delivered and re-processed. Advancing past rejects is
   fail-forward by design, so a hostile writer cannot pin the sync, and cannot
   force re-processing of an already-consumed revision (the token advances once
   per sync regardless of batch content).
7. **Test honesty — PASS (static).** The planted object is minted by a real
   `Board` (`hostile.post`) so its bytes pass every other validation — the test
   isolates the key-binding control as the only rejection reason — and is
   stored under a hand-built wrong day bucket with an explicit
   `keyFor(...) !== wrongKey` precondition (`:210`). The genuine post's key
   sorts before the planted key in the same batch, so `sync.cursor === wrongKey`
   (`:222`) proves rejected keys advance the cursor (otherwise the cursor would
   end at the genuine key). Fold ≡ rebuild row equality after a full rebuild
   (`:229-233`) pins that the rebuild path's live reads apply the same binding,
   closing the incremental/rebuild divergence the original audit described.

## Findings

- **N1 — NIT (downgraded; pre-existing convention, not introduced by this diff)
  — `packages/index/src/index.ts:409`.** The bare `catch { continue; }`
  swallows every error type, not only `InvalidPostError`, so a hypothetical
  internal defect in the parse chain would surface as a silently skipped object
  rather than a visible failure. This mirrors the established reader
  convention (`Board.loadOne`, `board.ts:361`) and fails closed (reject), and
  the same blanket catch exists on this line pre-change — only the `{ key }`
  argument was added. Fix if ever touched again: catch `InvalidPostError`
  explicitly and let unexpected error types propagate (or warn) so index bugs
  are observable.

No MAJOR findings. No BLOCKER findings.

## Explicitly clean areas

- No key confusion: acceptance requires byte-exact equality with the
  content-derived key; one valid key per (board, id).
- No durable skip or double-count window: posts + token + cursor commit in one
  transaction; redo-on-crash is idempotent (`INSERT OR IGNORE` primary key).
- No unbounded allocation/parse on the changed path: size cap precedes
  `JSON.parse`; depth cap after; the diff itself allocates nothing.
- No prototype pollution or mass assignment: unknown-field rejection; fields
  read individually; `data`/`origin`/`trace` plain-object-checked.
- No crash path from malformed/hostile bytes: every parse failure on this path
  is caught and treated as skip.
- No new SQL, shell, path, or network surface; statements remain parameterized.
- Cursor cannot rewind: strict `>` guard; per-board prefix filter keeps foreign
  keys from moving this board's cursor.

## Suppressed / informational (2)

- S1 (theoretical, explicitly downgraded): a feed-delivered key may sort
  anywhere in the keyspace (e.g. a far-future day bucket) and ratchets the
  recorded cursor forward to it. Harmless today — the feed path is
  token-driven and the cursor is bookkeeping only for changes-stores
  (`ingestSince` is never re-entered once a change token exists, `index.ts:386`,
  `:391`) — but worth remembering if the cursor ever becomes a read driver for
  changes-stores.
- S2 (informational): the feed path has no dedicated test for duplicate keys in
  one batch or for truncated/malformed JSON delivered under a board key; both
  guards (`new Set` dedupe at `:397`, the pre-existing blanket catch) are
  trivially visible and the parse-rejection path is shared with
  `Board.loadOne`. Coverage gap only, no defect identified.

## Not checkable (and why)

- Test execution: review-only hard rule — no `bun test`/build. The author's
  claim (40 index tests pass, tsc clean) and the independent correctness
  reviewer's verdict (READY; root 29 pass/1 skip) are recorded, not re-run.
- Runtime behaviour of real change-feed backends (store-git `changes(token)`
  re-delivery semantics after an abandoned batch) — store backends are outside
  this gate's two-file scope; the no-skip argument above relies on the token
  contract the feed path already depends on.

## Pin and seal

- Baseline HEAD: `35df4b977810ef8ba344b5015bfbe3f521d9c19e` — verified via
  `git rev-parse HEAD` at review start; unchanged at seal.
- Frozen two-path diff sha256 (tracked diff of the two in-scope files vs
  baseline): `e73f8d28d3e4dbcf80ada208a8b2f4018e4be973d11a88783477abec3822efcb`
  — verified at review start; regenerated and byte-compared identical at seal.
- Shared dirty worktree preserved: no commits, stashes, checkouts, or edits
  outside this report; scratch confined to the session temp directory.

Per-file sha256 (working tree at pin, repo-relative):

- `packages/index/src/index.ts` — `ee5e51d5e15db7b76b89045163215b70a7aedc84ee00217029e37b954e7a8d09`
- `packages/index/test/index.test.ts` — `0bb56db1660555abbcfc2d286c0382d7cf0a1c01ac88677d934357253926728f`

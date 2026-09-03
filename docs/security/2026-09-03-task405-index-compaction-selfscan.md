# Self-Scan Report — task 405 (day snapshots, compaction, retention)

- **Repo**: /Volumes/Delorean/code/sidekick/tmp (read-only for this scan; no repo files created/modified/deleted)
- **Diff target**: uncommitted working-tree changes vs HEAD `6f87d45d911c6cd1e0f2d1d71f64e46331f12923`, restricted to `packages/index/src/compaction.ts` (new), `packages/index/src/index.ts`, `packages/index/test/compaction.test.ts` (new), `packages/index/scripts/bench-snapshot-rebuild.ts` (new), `packages/index/README.md`, `packages/index/package.json`, `docs/benchmarks.md` (new)
- **Excluded entirely (concurrent work by other agents)**: `packages/cli/**`, `packages/hooks/**`, `docs/research/**`, `backlog/**`
- **Threat model**: `artifacts/01_context/threat_model.md` (verbatim copy of `docs/research/04-trust.md`): store fully untrusted — any writer can forge/replace/truncate/withhold/reorder objects, including snapshot files; local index derived/rebuildable
- **Gate discipline**: in-scope files pinned by SHA-256 at scan start in `artifacts/03_snapshot/SHA256SUMS`; re-verified at close (all 7 unchanged — see bottom of this report)
- **Runtime evidence**: package tests 9/9 pass; 4/4 findings reproduced at runtime with PoC scripts preserved under each candidate's `validation_artifacts/`

## Verdict per security focus

### Focus 1 — Snapshot files are store content (untrusted) — **FINDINGS (sub-verdicts below)**

- **1a. Injection of unvalidated content** — **finding cand-01 (low)**: snapshot lines are validated with `validatePost(..., { now })` without the store-key binding, and the rebuild offer loop (`index.ts:368`) omits the `post.board === board.name` check that `syncNow`/`ingestSince` apply and that the live rebuild path inherits from `parsePost(bytes, { key })`. A forged snapshot injects validated posts with an attacker-chosen board label into the derived index (confirmed end-to-end: visible in global search with spoofed board, invisible to board-scoped queries/threads, survives later rebuilds as orphan rows). Same-validation-as-live-reads is otherwise honored: snapshot posts do pass `validatePost` (shape, ULID, ts/id skew ≤ 5 min, future-id rejection, mention names, depth ≤ 8).
- **1b. Unbounded memory** — **finding cand-03 (low)**: `LIMITS.maxBytes` (64 KiB) is enforced only in `parsePost`; both snapshot-line validators bypass it, so a hostile line of any size is ingested (5 MiB body accepted in PoC). Chunking bounds posts-per-transaction, not per-post size. Whole-snapshot `store.get` → `decode` materialization is O(object) — a pre-existing store-contract property shared with live reads, recorded as an open question, not a new defect.
- **1c. Retention must not delete live data** — **PASS**: `retainBoard` deletes only keys enumerated *before* a fresh `verifySnapshot`, which re-lists/re-reads the bucket and fails closed on missing snapshot, any unreadable snapshot line, any unreadable/vanished live object, and any live object not byte-exactly covered (`lineOf` = store key + `encodePost(post)`). An "empty snapshot plus deleted live bucket" ordering cannot pass: coverage is computed against a fresh listing of whatever is live at verify time. Objects added after verification are not in the enumerated delete set and survive. Forged-superset snapshots only authorize deleting content byte-identically present in the snapshot. Corrupt-snapshot → `kept-unverified` is regression-tested. Residual verify→delete TOCTOU reduces to the direct-delete capability the threat model already grants every store writer — no new capability.

### Focus 2 — Path handling — **FINDING cand-02 (low)**

Traversal: **PASS**. `snapshotKey`/`snapshotsPrefix` enforce `assertName(board)` + `assertSegment(day)` + `isDayBucket(day)`; forged listing entries fail `isDayBucket` (day cannot contain `/`); FsStore independently rejects non-conforming segments (`.`, `..`, backslash, leading dot), refuses symlinked components, opens with `O_NOFOLLOW`, and realpath-contains parents. No escape from the snapshots prefix on write or read paths. Day validation, however, is shape-only: `2026-00-15.jsonl` (regex-valid, impossible date, sorts *before* today so it is not filtered as future) reaches `nextDay` in `snapshotScanStart` (`compaction.ts:410/413`) and throws `RangeError`; because `rebuildNow` runs `clearBoard` (`index.ts:324`) before `snapshotScanStart` (`index.ts:352`), one ~20-byte forged file wipes the board's derived index and crash-loops every rebuild attempt (confirmed end-to-end: threads 2→0, sync_state null). `2026-04-31` silently rolls over to `2026-05-02` (wrong gap math, no crash). Fix: accept only days where `day === dayBucket(Date.parse(day + "T00:00:00Z"))`, and validate scan-start inputs before `clearBoard`.

### Focus 3 — Deletion safety — **PASS (with TOCTOU note)**

Every `store.delete` call site in the diff is the single `retainBoard` loop (`compaction.ts:300-302`), gated in order on: day keys enumerated (`:278`), delete support (`:284`), snapshot existence (`:289`), and `verifySnapshot` on a fresh re-read (`:294`). Coverage strength vs a forged snapshot: verification requires every currently-live object's exact canonical `(key, bytes)` to be present in the snapshot; an adversary controlling the store cannot make verification pass while uncovered live data exists at verify time, and deletions never target keys outside the pre-verification enumeration (post-verify additions survive; post-verify deletions are no-ops). In-model residual: a writer swapping content into an enumerated key between verify and delete causes retention to delete that key — but that writer can already delete any object directly; retention grants no new capability. Partial-delete failure leaves verified-covered content in the snapshot; re-runs are idempotent. Snapshots themselves are never deleted.

### Focus 4 — Resource bounds / SQL / pragmas — **FINDINGS cand-03 (low), cand-04 (low)**

Bounded-concurrency bucket reader/deleter (128 workers), chunked snapshot iteration (2000/chunk) and rebuild transactions (4000/chunk), prepared statements reused, and **all SQL parameterized** (`?` placeholders everywhere, including the new bulk statements and `recomputeThreads`; FTS user input quoted/escaped) — no injection vector via the derived SQLite file. `PRAGMA synchronous = NORMAL` (WAL): acceptable durability tradeoff for a derived, rebuildable index, documented in-code. Two bounds defects: **cand-03** (no per-line size cap on the snapshot path; see Focus 1b) and **cand-04**: `snapshotScanStart` admits an ancient-but-valid day segment from one planted key (`boards/<b>/posts/0001-01-01/<ulid>.json`, any bytes) and the live tail then issues one `store.list` per *calendar day* — measured 739,852 lists vs ~6 needed (fs multiplies per-list cost into minutes). Fix: clamp the tail horizon or intersect with existing day directories.

### Focus 5 — Benchmark script hygiene — **PASS**

`bench-snapshot-rebuild.ts` spawns nothing (no child processes, no shell — nothing to inject into); `BENCH_TMPDIR` is used solely as a directory root for `mkdtemp` (weird values fail loudly, no interpolation); generated store keys come from `keys.post` with the validated board name `"bench"`, so `writeFileSync` targets cannot escape the temp root; env knobs (`BENCH_POSTS`, `BENCH_DAYS`, `BENCH_CONTROL`, `BENCH_KEEP`) are parsed as numbers/flags with validation; no secrets read or written; the only repo-adjacent write is the append to `docs/benchmarks.md`, whose content is exactly the script's numeric template (verified line-by-line against the script's `lines` array). Cleanup removes its temp root unless `BENCH_KEEP=1`.

## Overall verdict

**ACCEPT-with-findings** — 4 findings, all LOW severity, high confidence, each reproduced at runtime; none breaks the core deletion-safety invariant, and each has a one-line-scale fix:

| id | severity | file:line | defect (standard phrasing) | one-line fix |
| --- | --- | --- | --- | --- |
| cand-01-board-scope | low | packages/index/src/compaction.ts:371 (+ index.ts:368) | Snapshot lines validated without the store-key/board binding, so forged snapshot posts with an attacker-chosen `board` are ingested during rebuild, breaking board-scoped index invariants | Skip with warning any snapshot post where `post.board !== board.name` |
| cand-02-day-semantics | low | packages/index/src/compaction.ts:410,413 (+ index.ts:324 vs 352) | Shape-only day validation passes impossible calendar days to `nextDay`, throwing `RangeError` after `clearBoard` — a forged snapshot filename wipes the board's derived index and crash-loops rebuild | Reject days where `day !== dayBucket(Date.parse(day + "T00:00:00Z"))`; compute scan plan before `clearBoard` |
| cand-03-line-size-cap | low | packages/index/src/compaction.ts:371,505 (+ index.ts:572) | Snapshot lines bypass `parsePost`'s 64 KiB cap and raw lines are persisted as `post_json`, letting oversized/non-canonical content into the index | Enforce `LIMITS.maxBytes` per snapshot line and persist `encodePost(post)` instead of the raw line |
| cand-04-day-walk-amplification | low | packages/index/src/compaction.ts:420-423 (+ index.ts:372) | An ancient-but-valid planted day segment makes the rebuild live tail walk every calendar day (739,852 store.list calls observed for ~6 needed) | Clamp the live-tail start to a bounded horizon or iterate only existing day directories |

The change's central security claims hold under review: snapshots are treated as untrusted derived artifacts, retention fails closed before any deletion, snapshot reads are chunked and (mostly) capped, SQL is fully parameterized, and the benchmark script is hermetic. The findings are hardening gaps in input validation on the new snapshot path — worth fixing before other consumers adopt `iterSnapshotChunks`/`rebuild` defaults.

## Contract artifacts

Canonical skill artifacts are sealed at the bundle root: `scan-manifest.json`, `findings.json`, `coverage.json`, plus the finalizer-generated `report.md`. Detailed ledgers: `artifacts/02_discovery/` (work ledger, raw candidates, discovery report), `artifacts/04_reconciliation/` (dedupe), `artifacts/05_findings/<candidateId>/candidate_ledger.jsonl` (discovery + validation + attack-path receipts, PoCs under `validation_artifacts/`), `artifacts/03_coverage/reviewed_surfaces.md`. Derived documents: `findings/<candidateId>/<candidateId>.md` (write-ups), `hardening/hardening.md` (portfolio).

## Snapshot re-verification (close of scan)

Performed after finalization (`scan-manifest.json` sealedAt `2026-09-02T22:30:00Z`):

```
$ shasum -a 256 -c SHA256SUMS  (in artifacts/03_snapshot/)
SNAPSHOT-COPY-OK
$ sort(close-hashes of repo files) == sort(artifacts/03_snapshot/SHA256SUMS)
REPO-MATCHES-SNAPSHOT: all 7 in-scope files byte-identical to the scan-start pin
```

Close-of-scan hashes (repo, order-insensitive equal to the pin):

```
6b3b977168fbd570aa0c9d7b23a150fe7f2c4bb89a410ba307a5102682e60fec  packages/index/src/compaction.ts
fbf3fbdf948442765277722e9fbb1f10a34e801beccd14ac5789e27dc9d7df66  packages/index/src/index.ts
2255f1256b5f5faf35e8719268b3164ec8e634439b7fae11ebaa55fe8ac7b96c  packages/index/test/compaction.test.ts
cbb3d763fc4a30f1d2cb14469fe904e04d52fa8552c06cecab4b0475f6ed43b2  packages/index/scripts/bench-snapshot-rebuild.ts
76678bd07c23175ab3fc7135259815c07048eb650b38c8b1f4067682f5bc8836  packages/index/README.md
7612c2de9e11937b2a0353d98f90e1a1bd10350ccfd4d4bcf3509c74573cf8a6  packages/index/package.json
be90c3a23398788d3b396a02e830dd1e937b873f96b9d05e283ebdc2950c2a4a  docs/benchmarks.md
```

No in-scope file changed during the scan; concurrent modifications by other agents were confined to out-of-scope paths (`packages/cli/**`, `packages/hooks/**`) and were never read into scope or snapshotted. The repository under review was not modified, created in, or deleted from by this scan.

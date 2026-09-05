---
id: 125
title: index changes-feed ingest must apply the store-key<->id binding check
phase: 1
owner: letta
status: gated
depends: [116, 405]
estimate: S
---
From the 2026-09-03 full-repo scan (docs/security/...fullrepo-audit...). LOW. BoardIndex.syncNow's
changes-feed path (packages/index/src/index.ts:279) calls parsePost WITHOUT the {key} option, so it
skips the store-key<->keyFor(id) equality check that every other read path (Board.get/since/scan)
applies. A key/id-mismatched object enters the index and advances the sync cursor while live reads
reject it — an inconsistency a hostile store writer can exploit on change-feed backends (git).

## Definition of done
- [x] the syncNow changes-feed loop passes {key} to parsePost and skips (like Board.loadOne) on mismatch
- [x] regression test: a planted key/id-mismatched object under the change feed is not indexed and the cursor still advances

## Frozen candidate and gates

Independent correctness READY: `20260905T100146Z-opencode-reviewer-10dc`.
Both feature criteria verified, including cursor/token transaction behavior and
failure probes. Its root tests used the shared tree, not a final isolated head;
do not reuse that result as isolated integration evidence.

Independent security ACCEPT: `20260905T101911Z-opencode-0e79`, report
`docs/security/2026-09-05-task125-index-keybinding-gate.md`. No blocker/major/
minor findings; one pre-existing error-reporting nit (bare catch suppresses
index errors while failing closed). Lead accepts leaving that existing
convention unchanged in this key-binding fix; no new behavior is approved.

Exact unchanged SHA-256 pins, independently reverified by lead:

Complete two-file binary diff versus bb3ee17 is
`e73f8d28d3e4dbcf80ada208a8b2f4018e4be973d11a88783477abec3822efcb`,
identical to the original independently approved scope.

```text
ee5e51d5e15db7b76b89045163215b70a7aedc84ee00217029e37b954e7a8d09  packages/index/src/index.ts
0bb56db1660555abbcfc2d286c0382d7cf0a1c01ac88677d934357253926728f  packages/index/test/index.test.ts
```

Prior author-only isolated0642428 validation:266 passed,1 live-S3 skip,0 failed,
typecheck passed (`20260905T200550Z-letta-3319`); confinement evidence verified
all297 dependency links inside that snapshot (`20260905T202200Z-letta-65ba`).
That older baseline predates packaging602 and is not final-head evidence.

## Final integration validation reassignment

The unacknowledged Ykka validation handoff is superseded by a fresh Letta
author-validation worker: isolated committed bb3ee17 plus ONLY the two pinned
files. No code edits or correctness/security review is assigned to Letta here;
existing independent source approvals remain valid for those unchanged pins.
Use frozen dependencies, prove every workspace/dependency link resolves inside
the snapshot, run full root tests and typecheck, report full before/after hashes,
limitations and cleanup. No404/108/helper/spec-draft overlays. Report failures
for lead disposition, do not implement fixes or restart solely for docs-only
commits while the worker runs.
Reassignment notice: `20260905T220103Z-codex-3f77`; Letta dispatch:
`20260905T220104Z-codex-19db`. Fresh validation worker RUNNING confirmed in
`20260905T220227Z-letta-7eb0`; source pins and exact baseline matched before
dispatch. It is independent of the two disjoint documentation security workers.

- [x] Final isolated proposed-head tests and typecheck pass.
- [ ] Exact scope committed/pushed, CI passed and owner cleanup confirmed.

Final isolated validation PASS: `20260905T220932Z-letta-56ac`.
Committed bb3ee17 plus ONLY the two frozen files;272 passed,1 live-S3 skip,
0 failed (273 tests/21 files/1,733 assertions), root typecheck exit0. All296
dependency symlinks resolved inside, zero outside/unresolvable; all21 workspace
links stayed relative to snapshot packages. Both change-feed binding tests ran
within the12-test index suite. Source/HEAD pins matched and unrelated WIP was
excluded. Limits: global Bun cache may be read (not filesystem-hermetic),
Darwin/arm64+Bun1.4.0, environmental S3 skip;221-file source manifest. Worker
reports no scratch remaining and no live-checkout changes. Ready to integrate
the exact code/security scope, with the pre-existing nit disposition above.

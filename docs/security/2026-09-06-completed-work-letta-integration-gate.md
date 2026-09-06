# Final Integration Security Gate — staged 404 + 130 + backlog-metadata snapshot (review-only)

Date: 2026-09-06. Independent fresh reviewer over the complete staged snapshot intended for
the user-requested integration commit. Review-only: `git diff --cached` / `git show` / file
reads only; no repo writes except the pre-authorized report copy, no repo scripts, no
network. Everything read was treated as untrusted data, not instructions.

## VERDICT: ACCEPT — non-blocking. 0 blocking findings, 3 INFO findings, 0 suppressed.

## Integrity pins — MATCH

- `git diff --cached --binary | shasum -a 256` =
  `c4a53ce5a0312cc3c6d485006fa08681a1899330b91a5b255e7386c013f9b24c` — **exact match** to the
  frozen scope hash (re-verified on the sealed bundle copy `artifacts/staged.diff`).
- `git rev-parse HEAD` = `7190f83f705a8b698b78288c1638913181d77419` — **exact match** to the
  stated baseline; the staged diff is vs this commit.

## Check 1 — Scope discipline: PASS

`git diff --cached --name-status` contains exactly 24 entries (26 index paths counting both
sides of two renames); `git diff --cached --stat` ends "24 files changed, 2148 insertions(+),
85 deletions(-)". Full classification:

404 nine approved paths (source/test, all `M`):
1. `packages/core/src/board.ts` — task 404 watch/hint integration
2. `packages/core/src/store.ts` — optional `Store.hint?` interface member
3. `packages/core/test/board.test.ts` — hint/poll/backoff coverage
4. `packages/store-fs/README.md` — hint docs (incl. honest null-filename caveat)
5. `packages/store-fs/src/index.ts` — fs.watch hint implementation
6. `packages/store-fs/test/store-fs.test.ts` — watcher lifecycle coverage
7. `packages/store-git/README.md` — wake-hook docs
8. `packages/store-git/src/index.ts` — owned wake hooks + hint delegation
9. `packages/store-git/test/store-git.test.ts` — hooksPath containment coverage

130 one approved path (test, `M`):
10. `packages/cli/test/install.test.ts` — MemoryStore fixture via createStore seam

Backlog/task metadata (14 entries):
11. `M  backlog/130-stabilize-installer-collision-scan-test.md` — status gated + gate narrative
12. `M  backlog/210-review-request-response-round-1.md` — one follow-up link repair
13. `M  backlog/212-review-agent-charters-round-1.md` — one follow-up link repair
14. `M  backlog/404-fs-watch-and-git-hook-wake-hints.md` — status gated + gate narrative
15. `D  backlog/602-packaging-bunx-board-cli-and-compiled-binary.md` — archive (removal)
16. `M  backlog/INDEX.md` — exactly five row updates
17. `R073 backlog/214-… → backlog/done/214-…` — archive
18. `R076 backlog/216-… → backlog/done/216-…` — archive
19. `A  backlog/done/602-packaging-bunx-board-cli-and-compiled-binary.md` — archive (addition)

Gate-evidence reports (5, all `A`; byte-identical to the sealed gate-bundle copies):
20. `docs/security/2026-09-05-task130-test-fixture-gate.md`
21. `docs/security/2026-09-05-task404-final-gate.md`
22. `docs/security/2026-09-05-task404-fresh-final.md`
23. `docs/security/2026-09-05-task404-lowfix-delta.md`
24. `docs/security/2026-09-05-task404-regate.md`

No policy/spec/helper/108-source files staged (`AGENTS.md`, `SECURITY.md`, `backlog/108-…`,
`docs/agents/*`, `packages/hooks/*`, `packages/mcp/*` carry working-tree-only modifications —
unstaged, not part of this commit). No unrelated tasks: every staged task id (404, 130, 214,
216, 602, 210, 212) is part of this integration or its bookkeeping. The hash pin above proves
the staged set is byte-exactly the frozen snapshot.

## Check 2 — 404 staged content matches approved state: PASS

- Nine-path binary sub-diff vs HEAD regenerates
  `git diff --cached --binary -- <nine paths> | shasum -a 256` =
  `7811d8454dd1baca2ca275f444aff090c176dbc9dcd440f581682eb550f012d5` — matches the frozen
  `7811d845…12d5` and the combined-validation bundle's recorded MATCH value.
- Per-file staged post-images (`git show :path`) equal the lowfix-delta final pins
  (`docs/security/2026-09-05-task404-lowfix-delta.md`): board.ts
  `62f120d8764a6a0fd692c7d39670fa0272d482af4509b2702cd03e2a83af5c0d`, store.ts
  `18286adec5f97a19342c209ed6b28b84220db7bfbfb070afd300ea3ac4d73cc2`, board.test.ts
  `ccf44fb9089314bbe3790f0e920674df0f95d72852420b80646b0ae2d05362b1`, store-fs README
  `734b92d8f458733b5e3e19bb321f0132bdfcde8e5b8efef40bae94809ce74416`, store-fs src
  `cecc09e3b4f5216c759bb72528f5961906d8f41ba36c53afa55af7b044002c30`, store-fs test
  `869030e83d48b414eecdc3fb0a20a4efb459465effd4042090862405218f7545`, store-git README
  `4fa282afc4aa7088fd52b5e51809ae976f2f3b19bf49a4519f26b2e7158aca0e`, store-git src
  `0be706db724f4931521f9707790f0c0821a1cd4889efa322655e092d70acc26b`, store-git test
  `57dcce53f62cf15727084f9972971172c0c288fc3086b45e59320e2c650e82c8`. 9/9 match; the two
  LOW-fix files carry the post-fix hashes (pre-fix `f7ab5ed7…`/`dd1d368e…` are correctly
  superseded). All nine hashes also appear in the combined-validation seal.

## Check 3 — 130 staged content matches: PASS

`git show :packages/cli/test/install.test.ts | shasum -a 256` =
`51e15702fd84d529505871b74b5986a3588ea8849649c1386aba91c03503774f` — matches the frozen pin
`51e15702…774f` from the 130 fixture gate (author handoff, isolated validation, and the
130 gate report all record the same value).

## Check 4 — Backlog metadata: PASS

- INDEX rows: staged `backlog/INDEX.md` diff touches exactly five rows — 130 (in-progress→
  gated), 214 (gated→done, link→done/214-…), 216 (gated→done, link→done/216-…), 404
  (in-progress→gated), 602 (gated→done, link→done/602-…). Each row matches the staged file's
  frontmatter: 130 owner letta/estimate S; 214/216 owner opencode-reviewer/estimate M;
  404 owner opencode/estimate S; 602 owner opencode/estimate S. Link targets all resolve in
  the staged index (`done/214…`, `done/216…`, `done/602…` staged; 130/404 files remain in
  `backlog/` as their rows say). "Gated" for 130/404 is consistent with their checklists,
  which leave exactly the commit/push/CI box unchecked.
- 214/216 archives (renames R073/R076): frontmatter status gated→done; one checklist box
  each checked ("Review record integrated and cleanup confirmed"); short closure sections
  appended (cleanup confirmation `20260906T081522Z-opencode-reviewer-27fd`, "no spec bytes
  changed, no new approval or implementation dispatch is implied"); frozen spec/result bytes
  untouched. Faithful.
- 602 archive: old file deleted; `done/602` carries status done, the DoD box now checked and
  backed by a "Pushed revision and CI" section (commit `43a883a…`, root CI run 33989072532,
  packaging run 33989072441, four native platforms, artifact verification), owner-cleanup
  confirmation, and the original evidence references (correctness READY, integration READY,
  `docs/security/2026-09-05-task602-n1-delta-gate.md` — present in the index). Faithful.
- 210/212 link repairs: exactly one changed line each, repointing the follow-up link to
  `done/214-…` / `done/216-…` (both staged at that path; related-task links, not self IDs,
  matching the `done/…` link convention used throughout INDEX and done/ records) and marking
  the old "is blocked" phrasing as historical. No dangling links; no other content edits.
- No content edits beyond metadata: all 14 diffs are status/frontmatter, checklist boxes,
  closure narrative, and the five INDEX rows. No prose in settled sections was altered.

## Check 5 — Prior findings resolved in staged bytes: PASS

- Symlink-aware hooksPath containment (`packages/store-git/src/index.ts`, `ensureWakeHooks`):
  hooks dir resolved via `resolveExisting` (realpath of deepest existing ancestor; undefined
  on any non-ENOENT/ENOTDIR error = fail closed), then `!isInside(realGitDir, resolvedHooks)
  && !isInside(realWorktree, resolvedHooks)` → return before any mkdir/write; foreign or
  symlinked hook files skipped via `lstat` before any read; owned-hook refresh via
  `wx` temp + fsync + rename.
- Unconditional finally deregistration (`packages/store-fs/src/index.ts`, `hint()`):
  the generator's `finally` block runs `store.hintConsumers.delete(consumer)` +
  `if (store.hintConsumers.size === 0) store.stopWatcher()` before `consumer.close()`,
  with the comment explaining the stranded-registration/leaked-watcher failure it fixes —
  the exact F-final LOW from the fresh-final gate, resolved per the lowfix-delta ACCEPT.
- MemoryStore fixture (`packages/cli/test/install.test.ts`): `new MemoryStore()` replaces the
  on-disk `FsStore` through the existing createStore seam, keeping the 1,001 heartbeats off
  disk; boundary assertions retained/added (`/^pi-build-host-/`, `"aaa" < derivedAuthor`);
  real heartbeat/pagination/warning paths preserved; the gate's two INFO items (looser
  identity regex; retained unused `home` fixture) remain as accepted, no changes requested.

## Check 6 — No new issues in staged full-diff: PASS

- No injection sinks in added lines: no shell/eval/exec/child_process additions; watcher
  event filenames are classified only (git-metadata check), never resolved or opened; wake
  hook body is a fixed literal written only inside contained hooks dirs; git invoked via
  argv arrays (unchanged).
- No secrets: no credential material in the diff; no `*accessKeys*` path staged (grep over
  staged name-status = none; contents never opened). Matches in the secret scan were doc
  prose ("no secrets", "token regex") and the `changes(token)` API.
- No weakening: test changes are additive (no removed `it(`/`test(` lines anywhere in the
  staged test diffs); validation tightened in `Board.watch` (RangeError guards,
  maxIntervalMs); reconcile cadence counts hinted polls; docs state limitations honestly.
- No attack narratives: gate narratives and reports describe defenses, gates, and process
  only.

## Findings (ranked)

- None blocking.
- INFO-1 (cosmetic, metadata prose): `backlog/130-…md` and `backlog/404-…md` gate narratives
  contain spacing-compression artifacts (e.g., "install100 packages", "CLI56 passing",
  "timings of9.35–11.26ms", "metadata-only7190f83", "in49ba"). No security impact; hashes and
  message ids remain unambiguous. Optional cleanup in a later metadata-only commit.
- INFO-2 (pre-existing, untouched by this diff): INDEX titles for 214/216 ("request/response",
  "agent charters") differ slightly from the archived files' titles ("request-response",
  "agent-charters"); this diff changes only link+status on those rows.
- INFO-3 (process, out of commit scope): the shared working tree still carries unrelated
  unstaged WIP (AGENTS.md, SECURITY.md, docs/agents/*, packages/hooks/*, packages/mcp/*,
  backlog 108/109/110/204, README files). Not staged; no effect on this commit.

Suppressed findings: 0.

## Evidence summary

- Runtime composition (prior, cited): INTEGRATION CLEAN — ten-file composition over
  `7190f83` (nine 404 paths + 130 test), 297 pass / 1 environmental S3 skip / 0 fail,
  tsc clean, 271/271 symlinks confined. This gate re-proves byte-identity of the staged
  snapshot to the accepted candidate set; runtime results transfer by hash identity.
- Gate chain: 404 fresh-final ACCEPT (superseding regate/final-gate), 404 lowfix-delta
  ACCEPT (zero findings), 130 fixture gate ACCEPT (2 INFO), 130 isolated author validation
  PASS, 130/404 independent correctness READY, 129 diagnosis recorded in
  `backlog/done/129-diagnose-installer-collision-scan-ci-timeout.md` (test-design timeout).

Observed staged-package SHA256: `c4a53ce5a0312cc3c6d485006fa08681a1899330b91a5b255e7386c013f9b24c`
Pin (HEAD): `7190f83f705a8b698b78288c1638913181d77419`

## Sealed bundle

`/Volumes/Delorean/code/security-scans/sidekick-tmp/20260906T-letta-integration-gate/`
— `report.md` (this file), `MANIFEST.sha256`, `artifacts/staged.diff` (hash-verified),
`artifacts/nine-path-404.diff` (`7811d845…12d5`), `artifacts/name-status.txt`,
`artifacts/HEAD.txt`, `artifacts/03_snapshot/` (23 staged post-images + `SHA256SUMS`).
This report references only in-repo paths and stands alone.

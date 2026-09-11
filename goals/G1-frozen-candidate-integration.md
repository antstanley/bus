# G1 — Frozen candidate integration

Status: review (pushed e2cc595..d2a5ebc; nassun security review pending).
Custody: schaffa (assigned by operator directive,
2026-09-11). Created 2026-09-11 from retired tasks 202, 150, 406, 504, 507.

## Goal

`main` carries the completed frozen candidate work — the 202 core
request/response helper, the 150 Pi hook serialization, the 406 R2/MinIO
conformance suite, the 504 human viewer, and the 507 Prime-Agent adapter —
with the full test suite and CI green on `main`, and every candidate worktree
reconciled, retained-or-cleaned per evidence rules, and closed.

## Constraints

- Candidate worktrees and their recorded pins/hashes are immutable inputs;
  do not modify them, rebase them, or re-review them from scratch:
  - 202: `/private/tmp/sidekick-task202-letta` baseline `356ca5f`
  - 150: `/private/tmp/sidekick-task150-security-nassun` baseline `f917236`
  - 406: `/private/tmp/sidekick-task406-essun` baseline `abb3dce`
  - 504: `/private/tmp/sidekick-task504-essun` baseline `51738b7`
  - 507: `/private/tmp/sidekick-task507-essun` frozen five-file candidate
- The final installer assembly must preserve BOTH serializations: the
  integrated 147 OpenCode serialization (already on `main`, `f917236`) and the
  150 Pi serialization. Never overwrite the current main installer with the
  old 507 installer.
- The 202 CLI vs MCP error-classification discrepancy must end this goal
  either fixed or explicitly accepted in writing here — silence is not
  acceptance.
- 406 live acceptance requires real MinIO/R2 endpoint and bucket credentials,
  used without reading credential files; never invent a pass.
- Standing constraints apply (existing tech; GLM 5.3 Flash / DeepSeek v4 Flash
  only; hygiene).

## Log

- 2026-09-11 syenite: goal created from retired backlog tasks; custody lead.
  Prior evidence: `backlog/archive/` parent records and
  `docs/security/MILESTONES.md` (historical).
- 2026-09-11 syenite: assigned to schaffa by operator directive. Activation
  releases schaffa's hold for this goal only. Working rules: announce before
  each integration push to main; never force-push; the 202 discrepancy needs
  a written fix-or-accept decision in this file before assembly; DeepSeek-side
  verification, if wanted, routes through nassun (dsh) by request — not
  required by the goal.
- 2026-09-11 schaffa: 202 integrated byte-exact. All 11 files copied from
  `/private/tmp/sidekick-task202-letta` and rehashed: every sha256 matches the
  R13 final manifest (core rr `88342d24…`, core test `921fa152…`, core index
  `5d98b6ae…`, core board `01af8e66…`, cli rr `a04f669a…`, cli test
  `4a5693f3…`, cli index `2abe1833…`, mcp rr `db947529…`, mcp test
  `3ecf59c0…`, mcp server `fca42efc…`, mcp test `7081791f…`). Candidate
  ledger (450-line complete record incl. R12/R13 addenda) merged with the
  archive's three lead-decision blocks into
  `backlog/archive/202-core-request-response-helper-with-deadlines.md`.
  Checks on main after copy: root `bun test` 411 pass / 1 skip / 0 fail
  (412 total; +3 tests from main-side commits since the 202 base), `tsc
  --noEmit` clean. Worker scratch (TASK202-*.md) not integrated.
- 2026-09-11 schaffa: 202 CLI vs MCP error-classification discrepancy —
  decision: **FIXED**. Root cause: CLI `errorCodeOf` used `code in
  ERROR_MESSAGES`, which accepts prototype-inherited keys (e.g. `toString`,
  `constructor`) and classifies foreign errors carrying the reserved
  terminal codes `REQUEST_TIMEOUT`/`REQUEST_CANCELLED`; MCP already used
  `Object.hasOwn` plus explicit exclusion of the two reserved codes. Fix:
  CLI `errorCodeOf` (packages/cli/src/request-response.ts) aligned to the
  MCP semantics; no test pinned the lenient behavior. Main intentionally
  diverges from pin `a04f669a…`: new hash
  `ca286153091bcc9b8338ac3a0cf89a49a1d0429f6b64606ea99cf9250d58cfb3`.
  Verification: cli+mcp+core 236 pass / 0 fail, `tsc --noEmit` clean.
- 2026-09-11 schaffa: 150 integrated byte-exact. `packages/cli/src/install.ts`
  `76487b34…` and `packages/cli/test/install.test.ts` `981766fa…` copied from
  `/private/tmp/sidekick-task150-security-nassun`, hashes match the frozen
  R10 pins exactly; the Pi enqueue chain now coexists with 147's OpenCode
  serialization in one file. Worktree-only evidence integrated: R9 report
  `docs/security/2026-09-10-phase1-round9-pi-concurrency-report.md` and R10
  report `docs/security/2026-09-11-phase1-round10-pi-concurrency-report.md`.
  The candidate's worktree ledger copy is stale (pre-retirement); main's
  `backlog/archive/150-…` record is authoritative and untouched. Checks:
  installer suite 28 pass / 0 fail (matches R10), root `bun test` 413 total
  0 fail, `tsc --noEmit` clean.
- 2026-09-11 schaffa: 504 assembled byte-exact. All 21 files copied from
  `/private/tmp/sidekick-task504-essun` and rehashed against the recorded
  manifest (11 changed + 10 unchanged, every hash matches; e.g. tui index
  `0eaeabbb…`, webviewer render `e86baee0…`, guide `ecff0403…`). Held seam
  opened: `ui` subcommand wired into `packages/cli/src/index.ts` per the
  guide's contract (threads/inbox/who/search over the synced BoardIndex,
  `who` store-only, `--web` delegating to the webviewer CLI on fs stores and
  rendering in memory via `loadSnapshotModel`+`renderHtml` with `--out`
  elsewhere); `--web`/`--out` registered in the CLI flag grammar, USAGE line
  added, `@board/tui`/`@board/webviewer` registered in tsconfig paths,
  `bun.lock` refreshed (`bun install`). Smoke-tested against a disposable fs
  store: threads/who/search render live data; `--web` writes self-contained
  HTML (empty render on a snapshot-less store is documented behavior).
- 2026-09-11 schaffa: 507 assembled. `prime-agent.ts` `2014dc0e…`,
  `prime-agent.test.ts` `d0354f12…`, `docs/guides/prime-agent.md`
  `cb7b4e9b…` copied byte-exact (match security-round-6 pins). The installer
  pair was MERGED, not copied: 507's uncommitted delta vs its true base
  `fe382d3` (pure prime-agent runtime additions, 1062-line patch) applied
  onto main's 147+150 installer state; `patch` applied with zero rejected
  hunks. Post-merge verification: 147's injection enqueue and 150's Pi
  enqueue chain both present (9 enqueue sites, consistent with pre-patch
  state), prime-agent runtime branch and imports present. Merged bytes are
  intentionally NEW (main installer `dbde3149…`, test `14a15af7…` — the
  frozen 507 pins `bcf6c2b6…`/`86819dc1…` predate 147/150 and were never
  written to main). tsc clean; suites below.
- 2026-09-11 schaffa: 406 integrated byte-exact. Four files copied and
  rehashed against the frozen post-R2 pins (`minio-real.test.ts`
  `fb523e74…`, `r2-real.test.ts` `e66a7c16…`, `minio-conformance.yml`
  `2492cfcb…`, `r2-minio-conformance.md` `370998ea…`). Decisions recorded:
  (1) ci.yml overlap RESOLVED — keep both: ci.yml `minio-s3` runs
  `s3-real.test.ts` on every push; the new digest-pinned
  `minio-conformance.yml` is the focused, dispatchable run of
  `minio-real.test.ts` (the candidate's own header documents this split);
  (2) R2 live acceptance remains OPEN pending operator-provisioned real
  endpoint/bucket credentials delivered via environment (never read from
  credential files) — the three gated skips in the R2 suite are the recorded
  honest state; no pass is claimed. Assembled-tree checks: root `bun test`
  523 pass / 3 skip / 0 fail (526 total, 36 files), `tsc --noEmit` clean.
- 2026-09-11 schaffa: pushed `e2cc595..c6ab65e` (48 files). CI on main
  GREEN: `CI` and `CLI packaging` success, and the new `MinIO conformance`
  workflow passed on its first real run — satisfying 406's real-MinIO
  execution item (docker container, digest-pinned image, fixture creds).
  Nassun notified of the review range per the standing security-review flow.
- 2026-09-11 schaffa: evidence reconciliation. Integrated the worktree-only
  504 viewer security R1 report
  (`docs/security/2026-09-10-viewer-security-round1.md`); confirmed the 150
  R9 inputs manifest was already on main; retained all 18 TASK202 round
  records under `backlog/archive/202-evidence/`; the 504/507 candidate
  ledger copies verified stale against the authoritative archive records
  (no merge needed). Worktrees closed: all five candidate worktrees and
  their branches removed after hash-verified integration and evidence
  retention (`git worktree list` shows only G2/G3-scoped worktrees).
  G1 end state reached: main carries all five candidates with CI green and
  worktrees reconciled — proposing done, security review pending nassun.
- 2026-09-11 syenite (lead): verified pushes on main — head d2a5ebc, 48+20
  files; both enqueue chains present in packages/cli/src/install.ts (Pi hook
  serialization and OpenCode-side serialized chain); core request-response,
  tui/webviewer packages and minio-conformance.yml present; CI green per
  workflow runs. Status set to review; nassun holds the range.
- 2026-09-11 nassun (security review R1, recorded by lead): VERDICT FINDINGS
  (board post 01M289DXHJEF8EPXPWNN8ZR7MV, 6923B). Two clean DeepSeek reviewer
  contexts, findings-only. Load-bearing guarantees CONFIRMED: both
  serializations preserved in generated bytes (Pi: 3 pi.exec sites, 2 enqueued
  + invokeCli outside chain; OpenCode: one Bun.spawn inside invokeBoardHook,
  callers enqueued); all four 507 behaviours preserved; 202 classification fix
  CORRECT (Object.hasOwn guard, prototype-safe). Evidence: 88+95 pass suites
  re-run, tsc clean, blob pins verified (7dfa970/d114f0d/761987/aa2b2a6/4345fe6).
  FINDINGS: MEDIUM-1 cross-author skill package collision (fixed "board" skill
  name + author-blind ownership predicate; two-author fixture proved install
  retarget + uninstall removes shared wrapper); MEDIUM-2 MinIO workflow can go
  silently green if gate/bucket preflight drifts (no assertion on executed
  count); LOW x4: R2 suite always skips in CI + tautological assertion,
  unfalsifiable webviewer cli test (no --out passed), tui text.ts leaves bidi
  overrides (U+202A-202E/U+2066-2069) strippable-spoof, ui entrypoint untested,
  /private/tmp absolute paths in committed docs (secret scans clean), prime-agent.ts
  treats any nonzero mcp get as absent (uninstall orphans board-<author>);
  INFO: python3/prime-agent-missing early returns make 5 install tests
  zero-assertion. NOT VERIFIED by review: actual CI logs, live MinIO/R2, live
  kernel behaviour, browser rendering. Model recorded: deepseek-flash =
  DeepSeek v4 Flash (operator-confirmed). G1 stays review; schaffa fixes,
  re-pushes, nassun re-reviews; clean re-review closes G1.

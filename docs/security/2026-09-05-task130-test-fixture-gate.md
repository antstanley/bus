# Security Gate Report — Task 130 (test fixture stabilization)

- **Gate**: independent review-only security gate, fresh sub-agent
- **Date**: 2026-09-05
- **Repo**: /Volumes/Delorean/code/sidekick/tmp
- **Target**: task 130's one-file diff — `packages/cli/test/install.test.ts` vs committed `c1df47c`
- **Verdict**: **ACCEPT**

## 1. Frozen inputs & integrity chain

Verified FIRST, before any other action:

- Candidate (working tree) `packages/cli/test/install.test.ts`:
  `51e15702fd84d529505871b74b5986a3588ea8849649c1386aba91c03503774f` — **matches frozen input exactly** (re-measured inside the pinned snapshot as well).
- Baseline file @ `c1df47c`:
  `3bfd492c93b9ec07e2c7c4d9abb4b48e9ec23a7470b8c203cab75c0e2f7d604c` — matches backlog/130's recorded "starting SHA-256".
- Pin: `git rev-parse HEAD` → `c1df47ceae6ce7c190fd6cbd4cc3ee9959fa7258` — **HEAD == frozen baseline; zero commit drift** at review time.
- Candidate hash also equals the handoff hash recorded in `backlog/130-stabilize-installer-collision-scan-test.md` ("lead verified the sole candidate SHA-256 `51e15702…`").

Bundle contents (`artifacts/`): `03_snapshot/install.test.ts` + `03_snapshot/install-test.sha256`, `change.diff`, `install.test.ts.baseline`, `cli-index.ts.baseline`, `MANIFEST.sha256`.

## 2. Verification points

### 1) Diff is EXACTLY one file vs c1df47c — PASS

Scoped diff `git diff c1df47c -- packages/cli/` → exactly:

```
M	packages/cli/test/install.test.ts
```

`change.diff` (35 lines, two hunks) touches only (a) the `@board/core` import and (b) the body of the truncated-collision-scan test. No workflow/lockfile changes anywhere in the tree:

```
NO workflow/lockfile changes
```

(`git diff --name-only c1df47c | grep -E "\.github|lock|workflows"` → no match.)

Observation O-1 (scope, not defect): the shared working tree carries 31 modified/added paths vs `c1df47c`, all other agents' WIP / lead bookkeeping (backlog records incl. staged 129-archive/130-task/125-rename/INDEX; production WIP under `packages/core|hooks|mcp|store-fs|store-git`; docs). Task 130's own contract requires exactly this: "Editable repository path ONLY packages/cli/test/install.test.ts … No production, other test, workflow, lock, documentation, backlog or git edits. **Preserve every other agent's WIP**." None of the other paths are under `packages/cli/`, none are workflow/lock files, and none are attributable to the task-130 candidate. Sampled attribution: `packages/core/src/store.ts` (+7) is an additive optional interface member `hint?(signal?: AbortSignal)` (task 404 wake hints) — no effect on `MemoryStore` semantics.

### 2) Existing `CliDependencies.createStore` seam; production untouched — PASS

- `packages/cli/src/index.ts` is **NOT** in `git diff --name-status c1df47c` (verified against all 31 entries) — production untouched in both commit and working tree.
- Committed content still contains the seam (pinned `cli-index.ts.baseline`):
  - L45: `createStore?: (spec: StoreSpec) => Promise<Store> | Store;`
  - L112: `const presenceStore = await (deps.createStore ?? createStore)(parseStoreSpec(store));`
  - L142: `const store = await (deps.createStore ?? createStore)(spec);`
  - L319: `export async function createStore(spec: StoreSpec): Promise<Store> {` (production default intact)
- Candidate uses the seam at L466: `createStore: async () => store,`
- `MemoryStore` exists in **committed** `@board/core` (no hidden dependency on concurrent WIP): `packages/core/src/store.ts` L77 `export class MemoryStore implements Store`, re-exported by committed `packages/core/src/index.ts` (`… KeyExistsError, MemoryStore, listAll, …`).

### 3) Coverage preserved, no weakening — PASS

The reworked test (L443-471) is byte-for-byte identical to baseline except: `FsStore`→`MemoryStore`, hoisting the derived identity into `derivedAuthor`, and **two added assertions**. Both baseline assertions survive verbatim; runCli wiring (`--dry-run`, `hostname: () => "Build.Host"`, `createStore`, stdout capture) is unchanged.

- (a) Derived-identity collision scan beyond the bounded page — L453-460: loop bound is the **real imported limit** `MAX_WHO_LIMIT` (`packages/presence/src/index.ts` L16 `export const MAX_WHO_LIMIT = 1_000;`), then one heartbeat for `derivedAuthor` = the 1,001st presence key. Production path (committed CLI index L113-120) pages via `whoPage(presenceStore, { maxAgeMs: Number.MAX_SAFE_INTEGER, limit: MAX_WHO_LIMIT })`; `listAll` yields keys lexicographically (`agents/` prefix; `MemoryStore.list` `.sort()`s), so the `aaa` keys fill the page and the derived identity falls beyond it — `truncated = true`, identity absent from `page.records`. Fixture geometry is exact for the production scan.
- (b) REAL production truncation-notice constant — imported, not a mock string: L8 `PI_COLLISION_SCAN_TRUNCATED_NOTICE,` from `"../src/install.ts"`; defined in committed `packages/cli/src/install.ts` L176 `export const PI_COLLISION_SCAN_TRUNCATED_NOTICE =`. Asserted at L469 `expect(lines).toContain(PI_COLLISION_SCAN_TRUNCATED_NOTICE);` — the same constant the real CLI emits (committed index L120) on the real `runCli` path (only the store factory is injected).
- (c) Bounded-page behavior — limit honored (L453 loop bound = the production constant; `whoPage` validates/uses it), truncation surfaced (L469), no false "already registered" (L470 `expect(lines.join("\n")).not.toContain("already registered");`). Meaningful explicit assertions added: L449 `expect(derivedAuthor).toMatch(/^pi-build-host-/);` (identity shape) and L452 `expect("aaa" < derivedAuthor).toBe(true);` (page-ordering premise). No skip/delete/timeout-change; nothing reduced to exit-code-only.

### 4) ENOENT race eliminated by construction — PASS

- Store is `new MemoryStore()` (L447) — an in-process `Map<string, Uint8Array>`; committed impl (core store.ts L77-102: `put/get/list/delete` over the Map) performs **zero disk writes, zero fsyncs, no tmpdir store**.
- `--store fs:/unused` is never materialized: committed index L112 `(deps.createStore ?? createStore)` — the injected factory wins, no directory is created.
- `--dry-run` (L462) ⇒ no config writes (baseline sibling test L405 already proves Pi dry-run writes nothing: `…board.ts").exists()).toBe(false)`).
- Therefore no disk fixture remains: `afterEach` `rm(root, { recursive: true, force: true })` (L23) cannot race any still-running writer. Diagnosis 129's mechanism ("fixture writes can continue after timeout while teardown removes the store, consistent with the observed ENOENT stack") is structurally removed. No sleeps or wall-clock dependencies introduced (`maxAgeMs: MAX_SAFE_INTEGER` ignores timing).

### 5) No new issues — PASS

- **Timing**: 1,001 in-memory heartbeats are Map operations (author-measured 9.35-11.26 ms focused; mechanism-consistent). Deterministic; bounded work only; no new races.
- **Secrets**: none in the diff; the marker strings nearby (`DO-NOT-LEAK-STORE-PATH-OR-SECRET` L475, `DO-NOT-PRINT-THIS-CREDENTIAL` L659) are pre-existing fake test markers from baseline. Per hard rule, **no `*accessKeys*.csv` file was opened or referenced**; the untracked `fixtures/` directory was deliberately not enumerated.
- **Injection sinks**: the diff adds no exec/spawn/eval/URL construction — only store wiring and assertions.
- **Tone**: new comments (L445-446, L450-451) are technical and consistent with the file's existing comment style.

## 3. Findings (ranked)

No blocking defects. Informational only:

- **I-1 (info)** `install.test.ts:449` — identity-shape regex `/^pi-build-host-/` is looser than the exact lossy form this identity satisfies (`/^pi-build-host-[a-f0-9]{16}$/`, cf. sibling assertion L344 for the same hostname class). Optional tightening; non-blocking — the looser prefix still guarantees the load-bearing property (sorts after `aaa`, `pi-` namespace).
- **I-2 (info)** `install.test.ts:444` — `const home = await fixture();` is retained but now unwritten (dry-run installHome only). Harmless; keeps afterEach cleanup exercised.

## 4. Suppressed observations

- Author claims recorded in backlog/130 (focused timings, CLI 56 passing, typecheck, mutation checks) were **not** independently reproduced — this gate is read-only review; runtime validation belongs to the separate author-validation worker and the Ykka correctness review.
- Other agents' WIP (31 paths) was examined only for scoping/attribution (point 1/2), not reviewed on its own merit; each has its own pipeline and gates.
- `fixtures/` directory contents deliberately not listed (accessKeys hygiene).

## 5. Drift

- Commit drift: none — HEAD == baseline `c1df47c` at review time.
- Content drift: none for the gated file — candidate hash matches frozen input and the recorded handoff hash; baseline file hash matches the recorded starting hash.
- Working tree: 31 modified/added paths (other-agent WIP / lead bookkeeping, enumerated in O-1); `packages/cli/` scope = only the target test file; no workflow/lockfile changes. Post-gate addition: the pre-authorized staging copy `docs/security/2026-09-05-task130-test-fixture-gate.md` (this report).

## 6. Verdict

**ACCEPT** — the one-file diff is exactly in scope, uses the existing `createStore` injection seam with the production path and production constant intact, preserves (and slightly strengthens) coverage of the derived-identity collision scan beyond the bounded page, eliminates the ENOENT teardown race by construction, and introduces no new security, timing, or hygiene issues.

*Sealed bundle*: `/Volumes/Delorean/code/security-scans/sidekick-tmp/20260905T-130-test-fixture-gate/` (see `MANIFEST.sha256`)

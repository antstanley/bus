# Focused clean security re-gate — task 602 packaging fix batch (F-1/F-2/F-4)

Review-only sub-agent re-gate of the fix delta since the original task 602
packaging review (`docs/security/2026-09-05-task602-packaging-security-review.md`,
ACCEPT-WITH-FIXES, base pin 463ff658…). Static reading of the working-tree
files only; no repo scripts executed; no writes outside this report. The
working tree is shared and dirty with other agents' concurrent work; every
file in the delta is untracked, so the working-tree copy IS the delta. All
line numbers refer to the files as pinned below.

- Date: 2026-09-05
- Reviewer: opencode clean security re-gate sub-agent (no prior context, no conversation inheritance)
- Base HEAD at original pin: `463ff6588d3e70d61561fc5d8bd528b4677a6b7a`; current HEAD `35df4b977810ef8ba344b5015bfbe3f521d9c19e` (shared worktree has moved since the original pin — other agents' commits; none of the four delta files is tracked, so the delta itself is HEAD-independent)
- Threat-model lens: `docs/research/04-trust.md` (untrusted store, dev-machine compromise)

## Delta scope and sha256 verification

| File | Expected sha256 | Actual sha256 | Match |
|---|---|---|---|
| `.github/workflows/packaging.yml` | `a62f98dbdc9d006b5c2f2bf15580b8cb30d7ef2c53b9c00c6fe5dcc330bd4b3c` | `a62f98dbdc9d006b5c2f2bf15580b8cb30d7ef2c53b9c00c6fe5dcc330bd4b3c` | OK |
| `packages/cli/DISTRIBUTION.md` | `ece08d24f6a5433574503abbefab341db5b8582afc46794d4e786d9313b001d4` | `ece08d24f6a5433574503abbefab341db5b8582afc46794d4e786d9313b001d4` | OK |
| `packages/cli/src/distribution.ts` | `c0bd41d4fee1e519cafeca75977e66036346c7ec50824361f6fb879d47bcefbf` | `c0bd41d4fee1e519cafeca75977e66036346c7ec50824361f6fb879d47bcefbf` | OK |
| `packages/cli/test/distribution.test.ts` (new) | `a8cd8d60745cfcda36c2e73ab3cb777c33a58d1fe997e01d6ba6bc5b10e0217a` | `a8cd8d60745cfcda36c2e73ab3cb777c33a58d1fe997e01d6ba6bc5b10e0217a` | OK |
| `packages/cli/scripts/build.ts` (pin, unchanged) | `be148995…` | `be1489956f2d1b580ea4e5c2bee4cdf05eaa0f3d6e7e2a62400e0403e11bdef5` | OK |
| `packages/cli/scripts/smoke.ts` (pin, unchanged) | `e34ff207…` | `e34ff2076cb3da60a3fb0c2c78b773c80da50e77d105f7c4c1ba66d5a2d5ef5f` | OK |

All six hashes match. No mismatched file entered this review.

## VERDICT: ACCEPT-WITH-FIXES

All three original findings are verified closed (F-1 manifest + honest trust
guidance, F-2 credential non-persistence, F-4 fail-closed gate). No new
exploitable defect found. One new minor maintenance-drift finding (N-1): the
gate's `VALUE_FLAGS` copy can silently fail open when the parser's flag set
evolves; single-source it before the next parser change. The channel is safe
as shipped today — the two copies are currently identical (verified flag by
flag) and every classification divergence observed lands on a usage error
before any write.

## Fix-closure verification

1. **F-1 fixed — PASS.** `packaging.yml:52-65` generates `SHASUMS256.txt` in
   `packages/cli/dist` after both smoke steps (hashing the final tested
   artifacts: the binary via a `bin/` subshell, the count-asserted single
   tarball), prints it to the run log, and `packaging.yml:75-81` uploads it as
   a separate `board-<target>-sha256` artifact with `if-no-files-found: error`.
   `DISTRIBUTION.md:35-62` is honest and fail-closed: it states plainly that
   `pull_request`/fork runs produce identically named artifacts from
   fork-supplied code that "must never be run" (:37-42), restricts trust to
   canonical-repo `main` runs at a commit the user intends to trust, requires
   the binary + tarball + manifest from the *same* run, gives exact
   `shasum -a 256 -c` / `sha256sum -c` commands, and only then permits
   `chmod +x` and execution, with an explicit must-not-run for any failed or
   unverifiable check. Doc claims match the build: "rejects runtime `install`
   before writing configuration" matches `distribution.ts:69-71`, and
   "disable automatic dotenv and bunfig loading" matches the pinned build's
   `--no-compile-autoload-dotenv --no-compile-autoload-bunfig`
   (`build.ts:57-58`). The tarball ships this doc as its README
   (`build.ts:45`), so the guidance travels with the npm package too.
2. **F-2 fixed — PASS.** The sole checkout carries
   `persist-credentials: false` (`packaging.yml:30-32`), so the job-scoped
   token is not left in git config for the subsequent repository-supplied
   script steps.
3. **F-4 fixed — PASS (fail-closed, in the safe direction).**
   `isCompiledBinary()` (`distribution.ts:56-62`) reads the `BOARD_COMPILED`
   define inside try/catch and returns `true` (compiled → install rejected) on
   any throw, so an omitted `--define` now *disables* `install` instead of
   silently enabling it. The try block contains only the identifier read, so
   the catch can observe the absent-define `ReferenceError` and nothing else —
   no real error can be misclassified as "compiled", and even a hypothetical
   one resolves to the no-write direction. The define-as-false path opens the
   gate only for the npm/source bundle (`build.ts:19`), which ships the full
   hook/MCP tree. The gate throws before `runCli` is invoked
   (`distribution.ts:69-71`), i.e. before any configuration write, and the
   rejection surfaces through the sanitized error path with exit 2
   (`distribution.ts:90-94`), matching the documented usage-error contract.
4. **Gate bypass hunt — PASS.** `classifyArgs` (`distribution.ts:26-45`)
   mirrors `parseArgs` (`index.ts:346-381`) on every input class that matters:
   a `-h` consumed as an option value (`--index -h`; `parseArgs` accepts it as
   a value because the rejection check only covers `--`-prefixed values,
   `index.ts:377`) is skipped via `VALUE_FLAGS` (`distribution.ts:42`);
   `=`-attached values (`--index=-h`) never read as help; `--` disables option
   position in both parsers; repeated value flags each consume their value; a
   trailing value flag leaves `help: false` (blocked; `parseArgs` then errors
   on the missing value); `--help=x` is not help (and `parseArgs` rejects the
   attached boolean value, exit 2); combined short forms (`-hx`) are positionals
   in both; empty argv classifies as `help` exactly as `parseArgs` does. The
   one true divergence found — `install --store -- -h`, where `classifyArgs`
   treats `--` as the consumed value and later `-h` as help, while `parseArgs`
   rejects a `--`-prefixed value — fails safe: `runCli` parses before the
   install dispatch (`index.ts:73` vs `:84`), so the outcome is a usage error,
   not a write. Test coverage for these classes is genuine
   (`distribution.test.ts:50-68, 118-130`).

## Findings (ranked)

- **N-1 — minor (new, maintenance drift; latent fail-open) —
  `packages/cli/src/distribution.ts:12-15` vs `packages/cli/src/index.ts:339-342`.**
  The gate duplicates the parser's `VALUE_FLAGS` in a second hand-maintained
  set with an in-source "keep in sync" comment. The copies are identical today
  (15 flags, verified one by one), but the failure direction of drift is
  fail-open: a value flag added to the parser only would make `classifyArgs`
  read the flag's consumed token as a flag — so `install … --newflag -h`
  classifies as help, `compiledInstallBlocked` returns false, and the compiled
  binary reaches `installRuntime`, writing runtime configuration that points
  at assets a single-file binary does not have — the exact harm the gate
  exists to prevent (misconfiguration writes, not code execution). Drift in
  the opposite direction (flag removed from the parser first) fails safe:
  `parseArgs` rejects the unknown option before the install dispatch. The
  grammar-mirroring test (`distribution.test.ts:118-130`) is hardcoded cases
  and would not catch a set-level drift. Fix: export `VALUE_FLAGS` from
  `index.ts` and import it in `distribution.ts` (single source of truth;
  `distribution.ts` already imports from that module), and/or add a sync test
  asserting the two sets are equal via imports rather than literals.

## Suppressed / informational (3)

- **Non-string argv elements** would throw a `TypeError` in `classifyArgs`
  (`distribution.ts:32-38`) rather than classify — explicitly downgraded as
  theoretical: `process.argv.slice(2)` is always strings, and a programmatic
  caller hitting it crashes with exit 1 and no write (fail-closed).
- **Doc-precision nit:** the sha256 manifest records the binary by its bare
  name (`board-<target>`, `packaging.yml:63`) while the binary artifact nests
  it under `bin/`; the documented instruction to "place the binary, the
  tarball, and SHASUMS256.txt in one directory" (`DISTRIBUTION.md:51`) is the
  flattening step that makes `shasum -c` pass. Documentation precision only;
  no behavioral defect.
- **Test-robustness nit:** `assertNoConfigWrites`
  (`distribution.test.ts:22-26`) checks a hardcoded set of board-owned
  entries; a future runtime directory added by the installer would not be
  covered and the no-write assertion would pass vacuously. Test-coverage
  observation, not a hazard in the shipped code.

## Explicitly reviewed and clean

- **Manifest step shell safety** (`packaging.yml:52-65`): `shell: bash` with
  `set -euo pipefail`; the only interpolation is the static in-file
  `matrix.target` (same four allowlisted values the compile step validates
  against `build.ts:8,50-52`); all expansions quoted (`"$@"`,
  `"${tarballs[0]}"`, `"board-${{ matrix.target }}"`); no untrusted artifact
  names, event payloads, or PR strings reach `run:`; the tarball glob is
  nullglob + exact-count asserted so an absent or duplicated tarball fails the
  step; `( cd bin && … )` fails the step if `bin/` is missing. The sibling
  smoke step (`:42-47`) repeats the count assertion and runs under the
  implicit `-eo pipefail` of an explicit `shell: bash` step.
- **Action pinning / least privilege retained:** checkout, setup-bun, and both
  upload steps remain pinned to full commit SHAs with version comments;
  workflow-level `permissions: contents: read` retained (`:8-9`);
  `timeout-minutes`, `fail-fast`, `if-no-files-found: error`,
  `retention-days: 14` all present. No new secret surface: no `secrets:`
  context, no credential env, upload-only (the job still never downloads
  artifacts); `workflow_dispatch` is the same trust class as `push`.
  `bun run build:cli` / `smoke:cli` / `compile:cli` still resolve
  (`package.json:11-13`).
- **distribution.ts hygiene:** no filesystem writes, network, or env access
  added — the module only classifies argv, gates, and delegates to `runCli`
  with the same `projectRoot`/stdin wiring as `index.ts`'s own `main`
  (`index.ts:923-932`); signal handlers remain scoped to `watch` and are
  removed in `finally` (`distribution.ts:74-87`).
- **distribution.test.ts hygiene:** spawns only the repo's own entry file via
  `Bun.spawn` with an argv array (no shell), no network, no downloads; every
  child writes at most to the fixture `HOME` created by `mkdtemp` under the
  system temp dir (unpredictable name) and each case asserts no board-owned
  entry appeared; pipes are drained and `proc.exited` awaited, so no process
  or pipe leak; `afterEach` removes every fixture root recursively; the
  gate-open case uses `--dry-run`, which renders a diff without writing.
  Imports are bun:test, node builtins, and the sibling source only — no
  supply-chain surface.
- **Cross-check of the duplicated set itself:** the two `VALUE_FLAGS`
  definitions are byte-for-byte identical in content and order
  (`index.ts:339-342` = `distribution.ts:12-15`); boolean flags need no mirror
  (a new boolean flag mis-classified by the gate still resolves to `parseArgs`
  printing usage, never to a write).

## Not checkable (and why)

- Runtime execution: no `bun test`/build/CI run was performed (review-only,
  no repo scripts executed); parser and gate behavior verified by static
  reading plus the test file's assertions, not by running them. GitHub
  runner shell semantics (`shell: bash` ⇒ `-eo pipefail`) taken from GitHub's
  documented behavior, not observed.
- Other agents' concurrently modified files in the shared worktree (README,
  package.json edits beyond the script-name check, core/store/mcp changes):
  out of delta scope per the brief.

## Seal

- Delta pinned by the sha256 table above, all six verified OK at review time.
- Review performed read-only: the only file created or modified is this
  report; no commits, stashes, or cleanup; the shared dirty worktree was
  preserved as found.

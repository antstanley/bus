# Focused clean security delta re-gate — task 602 N-1 closure (VALUE_FLAGS single-sourcing)

Review-only sub-agent re-gate of the small delta that closed finding N-1 from
the task 602 fix re-gate (`docs/security/2026-09-05-task602-fix-regate.md`,
itself a re-gate of `docs/security/2026-09-05-task602-packaging-security-review.md`).
Static reading of the working-tree files only; no repo scripts executed; no
writes outside this report. The working tree is shared and dirty with other
agents' concurrent work; `packages/cli/src/distribution.ts` and
`packages/cli/test/distribution.test.ts` are untracked (the working-tree copy
IS the delta), and `packages/cli/src/index.ts` is tracked — its full `git diff`
against HEAD was inspected and contains exactly the export/freeze hunk below.
All line numbers refer to the files as pinned here.

- Date: 2026-09-05
- Reviewer: opencode clean security delta re-gate sub-agent (no prior context, no conversation inheritance)
- Baseline: `docs/security/2026-09-05-task602-fix-regate.md` (finding N-1: the gate's duplicated `VALUE_FLAGS` was fail-open in one direction — a parser-side value-flag addition would let `install … --newflag -h` classify as help and open the compiled-install gate)
- Threat-model lens: `docs/research/04-trust.md` (untrusted store, dev-machine compromise)

## Delta scope and sha256 verification

| File | Expected sha256 | Actual sha256 | Match |
|---|---|---|---|
| `packages/cli/src/index.ts` | `656ceb2f013b9be7ad4086ee298db0125a15e65f6f44179786d8bd8a7d7f1613` | `656ceb2f013b9be7ad4086ee298db0125a15e65f6f44179786d8bd8a7d7f1613` | OK |
| `packages/cli/src/distribution.ts` | `9a31426e26420065839806c9e0a3338060f1f6a4117666713779e3b266d56c48` | `9a31426e26420065839806c9e0a3338060f1f6a4117666713779e3b266d56c48` | OK |
| `packages/cli/test/distribution.test.ts` | `a2f8046888afd67c09db569a8df6fc4da8d4a311a07859db2b1bbf832c6acc7e` | `a2f8046888afd67c09db569a8df6fc4da8d4a311a07859db2b1bbf832c6acc7e` | OK |

All three hashes match the fix agent's reported state. No mismatched file
entered this review.

## VERDICT: ACCEPT

N-1 is verified closed: the flag list now has exactly one definition in the
source tree, the gate and the parser both read it, parity is structural rather
than conventional, and the fail-closed gate semantics are untouched. No new
defect found. Zero findings.

## N-1 closure verification

1. **Single source of truth — PASS.** `VALUE_FLAGS` is defined exactly once,
   at `packages/cli/src/index.ts:343-346`, same 15 flags in the same order as
   the previously pinned duplicate. `distribution.ts:3` imports it from
   `./index.ts` and consumes it at `distribution.ts:33` (the old in-module
   literal and its "keep in sync" comment are gone). A repo-wide search finds
   no other copy of the flag list: grep for `VALUE_FLAGS` hits only the
   definition, the parser check (`index.ts:378`), the gate import/use, and the
   test; grep for a distinctive member (`"max-age"`) hits only the definition
   and its lookup (`index.ts:145`); a sweep of every `new Set([...])` literal
   in `packages/cli/src` finds only `BOOLEAN_FLAGS` and `COMMANDS`
   (`index.ts:347-348`, parser-internal, fail-safe per the baseline) and an
   unrelated key-dedupe in `install.ts:522`. No literal Set/array of the value
   flags remains anywhere under `packages/cli`.
2. **Bundling cannot resurrect a second copy — PASS (single module instance at
   runtime).** Both shipped artifact paths bundle `distribution.ts` as the
   entry (`build.ts:19` npm `board.js`, `build.ts:57` `--compile` binaries),
   so `./index.ts` is resolved as a static relative import of the same file
   within the same bundle. ESM/bundler semantics give one module record — one
   instantiation, one `Set` object — per resolved specifier per program;
   tree-shaking can drop unused exports but cannot duplicate an instantiated
   module, and the set is both imported and used, so it survives. The npm
   tarball additionally ships a *separate* standalone bundle of `index.ts`
   (`build.ts:24-26`, for runtime integrations), which does contain its own
   instance — but that artifact is generated from the same source file at the
   same build instant and never executes the gate, and within each artifact
   that does, parser and gate provably share the one instance. Conclusion:
   parity is now enforced by module identity at build time; no build
   configuration examined (`--packages=bundle`, `--compile`, the single
   `--external` on the integration bundles) can produce two live copies of the
   set in the process that runs the gate.
3. **Export surface — PASS, one informational note.** The export is
   `export const VALUE_FLAGS: ReadonlySet<string> = Object.freeze(new Set([…]))`
   (`index.ts:343`): module evaluation adds only a constant binding and one
   `Object.freeze` call — no I/O, no side effects on import. `Object.freeze`
   seals the Set object's properties (its `add`/`delete`/`clear` methods
   cannot be swapped) and `ReadonlySet<string>` removes the mutators at type
   level, but Set *contents* remain runtime-mutable through a type cast.
   Informational only, no defect: in every shipped artifact the set is
   process-internal — binaries and `board.js` have no external importer of the
   module, and the npm integration bundle's importers are locally installed
   code already trusted to call `runCli` directly — so there is no realistic
   mutation vector, and even a mutated set only shifts argv classification,
   not the `BOARD_COMPILED` gate itself. Fail-closed semantics preserved:
   `isCompiledBinary()` (`distribution.ts:47-53`) is byte-for-byte the pinned
   logic (absent define → throw → `true` → blocked), the gate throws before
   `runCli` (`distribution.ts:60-62` vs `:70`), and rejection still surfaces
   as a sanitized message with exit 2 (`distribution.ts:82-85`).
4. **Parity test quality — PASS.** `distribution.test.ts:134-147` imports the
   exported `VALUE_FLAGS` and `classifyArgs` (the same modules production
   executes), asserts `size > 0` (guards a vacuous pass on an emptied set) and
   `Object.isFrozen` (pins the freeze), then iterates **every member of the
   live set** asserting `classifyArgs(["install", `--${flag}`, "-h"])` does
   not classify as help — i.e. it pins the consumption *behavior* for the
   whole set, not a snapshot of its members. Stated explicitly, as the brief
   requires: the test cannot fail when a value flag is added to the shared
   constant, because classifier and test both read that one constant —
   "both sides drift together with the test green" is now reduced to "one
   shared constant was edited", which is the correct-by-construction state N-1
   asked for; there is no second copy left to diverge. Residual hardcoded
   literals in the test are the boolean-flag list (`:144`) — if a boolean flag
   is added to `BOOLEAN_FLAGS` but not to that list, the gate treats
   `--newbool -h` as help and opens, but `parseArgs` then throws
   `unknown option` (exit 2, `index.ts:378`) before the install dispatch, so
   the residual drift direction remains fail-safe exactly as the baseline
   concluded (test-list staleness noted as informational below).
5. **CLI behavior preservation — PASS.** The full `git diff` of
   `packages/cli/src/index.ts` is a single hunk: the const becomes an exported
   frozen `ReadonlySet` plus a four-line comment. `parseArgs`
   (`index.ts:350-385`), `BOOLEAN_FLAGS`, `COMMANDS`, dispatch, error paths,
   and exit codes are untouched; flag handling is identical because the set's
   contents and identity semantics (`.has`) are unchanged. The non-delta
   portions of `distribution.ts` match the baseline's pinned descriptions
   line-for-line modulo the expected shift from deleting the duplicate (the
   gate throw, try/catch classification, sanitized exit-2 path, watch-scoped
   signal handlers all read identically).
6. **No smuggled changes — PASS.** Reviewed in full: `distribution.ts` adds
   no filesystem, network, or env access — it classifies argv, gates, and
   delegates with the same wiring as before. `distribution.test.ts` adds one
   pure in-process `describe` block (no I/O, no spawns); the pre-existing
   spawn cases retain the baseline hygiene (argv-array `Bun.spawn` without a
   shell, fixture `HOME` under `mkdtemp`, drained pipes, awaited exits,
   recursive `afterEach` cleanup, no-config-write assertions). No injection,
   path-handling, or validation change anywhere in the delta.

## Findings (ranked)

None.

## Suppressed / informational (2)

- **Frozen-set semantics:** `Object.freeze` + `ReadonlySet` seal the binding
  and the object, not the Set's *contents*; a cast could still mutate members
  at runtime. Accepted: the set is process-internal in every shipped artifact
  (see closure item 3), so no external mutation surface exists.
- **Test-literal staleness:** the boolean-flag list hardcoded at
  `distribution.test.ts:144` can lag `BOOLEAN_FLAGS` (`index.ts:347`).
  Accepted: that drift direction is fail-safe (unknown boolean flag →
  `parseArgs` usage error, exit 2, before any write), identical to the
  baseline's residual-risk assessment.

## Explicitly reviewed and clean

- The one-hunk `index.ts` diff (export/freeze + comment only).
- `distribution.ts` end-to-end: gate ordering, fail-closed classification,
  sanitized error/exit-code contract, signal-handler scoping.
- `distribution.test.ts` end-to-end including the new parity block: no new
  process, network, filesystem, or supply-chain surface.
- `build.ts` (pinned, unchanged) re-read to answer the bundling question; no
  delta and no configuration that could duplicate the shared module.
- Repo-wide copy hunt: no second literal of the value-flag list anywhere in
  `packages/cli`.

## Not checkable (and why)

- Runtime execution: no `bun test`/build/CI run was performed (review-only,
  no repo scripts executed); the single-module-instance conclusion is derived
  from bundler semantics of the pinned `build.ts` invocations plus static
  reading, not from inspecting a built artifact.
- Other agents' concurrently modified files in the shared worktree: out of
  delta scope per the brief.

## Seal

- Delta pinned by the sha256 table above, all three verified OK at review
  time.
- Review performed read-only: the only file created or modified is this
  report; no commits, stashes, or cleanup; the shared dirty worktree was
  preserved as found.

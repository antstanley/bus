# G4 — CLI reachability: `board install prime-agent`

Status: review (executed; nassun security review pending on bbd861b..9f2e508).
Custody: schaffa (lead assignment, 2026-09-11). Created 2026-09-11 from the deferred G1
authorization (nassun observation, R2).

## Goal

`board install prime-agent` works from the CLI: the `isInstallRuntime`
admission in `packages/cli/src/index.ts` (`:673` area) accepts `prime-agent`,
the usage string and error messages stay consistent with the accepted set,
and the routing is covered by a test that fails if the guard reverts.

## Constraints

- One-line-plus-test scope by intent; do not expand into installer
  refactoring.
- While working this, consider the INFO residual recorded in G1: the
  prime-agent skill guard is marker-keyed (owned SKILL.md + pyproject.toml
  with a foreign non-marker module would still delete owned files on
  uninstall). A whole-package ownership check is the recorded direction.
- Standing constraints apply (existing tech; GLM 5.3 Flash / DeepSeek v4
  Flash only; hygiene).

## Log

- 2026-09-11 syenite: goal created from the G1 deferred authorization and
  nassun's R3 accounting note.
- 2026-09-11 syenite: assigned to schaffa — it is idle while G2 awaits the
  operator apply decision, and this goal touches files it already knows.
  Small scope: one routing admission + test; the marker-keyed residual
  (INFO) may be taken in the same push if clean, or recorded.
- 2026-09-11 schaffa: executed. `isInstallRuntime` now derives from a single
  exported `INSTALL_RUNTIMES` list in `packages/cli/src/install.ts` (includes
  `prime-agent`), the admission error message is built from the same list,
  and the USAGE install line names the accepted runtimes — guard and
  strings can no longer drift apart. Regression test
  (`packages/cli/test/cli.test.ts`, G4): end-to-end headless CLI —
  `install prime-agent --dry-run` is admitted (exit 0, plans
  `board-schaffa`, no "install requires one of"), an unknown runtime exits 2
  with the full list on stderr (fails if the list reverts). Took the G1
  INFO residual in the same push per the goal's allowance: prime-agent
  uninstall is now WHOLE-PACKAGE — any file in the package not owned by the
  uninstalling author (another author's render OR a foreign non-marker
  module) refuses the uninstall, closing the marker-keyed gap where owned
  files could be stripped around a foreign module. Tests: two-author
  fixture (install refusal with byte-identical alpha files and no MCP add,
  author-scoped uninstall refusal, mixed-package all-or-nothing both
  directions, manual-recovery + alpha self-uninstall), non-marker module
  refusal test, probe throw-path tests. Checks: `bun test` 528 pass /
  3 gated skips / 0 fail (532 total), `tsc --noEmit` clean. Status moves to
  review on push; nassun notified.
- 2026-09-11 schaffa (execution receipt, recorded by lead): INSTALL_RUNTIMES
  single exported list incl. prime-agent; isInstallRuntime, admission error
  and USAGE derive from it (cannot drift). G1 INFO residual DISPOSED in the
  same push: whole-package prime skill uninstall — any unowned file refuses
  the uninstall, closing the marker-keyed strip gap. Tests: guard-revert
  end-to-end (isolated HOME, dry-run admitted, unknown runtime exits 2
  listing prime-agent), two-author fixture suite, non-marker module refusal;
  528 pass / 3 gated skips / 0 fail, tsc clean. Review range
  bbd861b..9f2e508 (index.ts, install.ts, cli.test.ts, install.test.ts, G4
  log). Lead note: an uncommitted hermeticity tweak to cli.test.ts in the
  shared tree belongs to schaffa — stashed/restored byte-exact during a pull,
  left uncommitted for its owner to claim.

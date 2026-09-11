# G4 — CLI reachability: `board install prime-agent`

Status: open. Custody: schaffa (lead assignment, 2026-09-11). Created 2026-09-11 from the deferred G1
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

# Reviewed surfaces — cumulative changed delta fe382d3 (round 3)

| Surface | Risk Area | Outcome | Notes |
|---|---|---|---|
| Generated OpenCode plugin (`packages/cli/src/install.ts`) | Local presence/routing integrity; spawned-hook lifetime | Rejected | cand-01 and cand-02 raised and suppressed with source evidence and an existing regression test; the delta adds an unref'd idle refresh, a 10s subprocess timeout with kill, per-instance session tracking and deletion/exit cleanup. |
| `packages/store-fs/src/index.ts` hint filter | Resource exhaustion / crash resistance | Rejected | cand-03 raised and suppressed; the delta only widens the filename type and makes `isGitMetadata` return false for `undefined`, removing a `TypeError` crash path. |
| Changed tests (`install.test.ts`, `store-fs.test.ts`, `store-git.test.ts`) | Test-only code | No issue found | No product sink; the store-fs test invokes the exact callback supplied to real `fs.watch`; the store-git test observes real watcher readiness instead of sleeping. |
| Governance policy delta (`AGENTS.md`, `SECURITY.md`, `docs/agents/*`) | Security-gate integrity, model policy, board-first coordination | No issue found | The gate language, cumulative-round discipline and hygiene caps are preserved; the reviewer/model policy is widened for the primary reviewer under a recorded operator instruction, without granting new scopes to other models. |
| `docs/acceptance/team-board-setup.md` | Operator provisioning guidance | Not applicable | Byte-identical (`78491cd2...`) to the artifact already accepted in adoption/final-cycle security round 2; not re-reviewed. |
| `scripts/codex-coordination-monitor.py` and its test | Monitor runtime | Not applicable | Out of the frozen package's assigned/writable scope; bytes byte-identical to the separately gated task149 candidate `439bad8` (`49cc4137...`, `8f9401cd...`). |
| Backlog records and security reports inside the delta | Coordination/evidence documents | Not applicable | Not product surfaces; no executable behaviour. |

# Coverage ledger — cumulative changed delta f37b83b..fe382d305db19078446750020ede9f6b9a0d5348

Mode `diff`, inventory strategy `diff`, completeness `complete`.

| Surface | Risk area | Outcome | Evidence |
|---|---|---|---|
| `packages/cli/src/install.ts` generated OpenCode plugin lifecycle | local presence/routing integrity, subprocess lifetime | Rejected | cand-01, cand-02 suppressed; wl-001 |
| `packages/store-fs/src/index.ts` watcher hint filter | resource exhaustion / crash resistance | Rejected | cand-03 suppressed; wl-002 |
| Changed regression tests (install/store-fs/store-git) | test-only code, no product sink | No issue found | wl-005..wl-007 |
| Governance policy delta (`AGENTS.md`, `SECURITY.md`, `docs/agents/*`) | security-gate integrity and model policy | No issue found | wl-008..wl-016 |
| `docs/acceptance/team-board-setup.md` | operator provisioning guidance | Not applicable | wl-017; byte-identical to the prior clean round2 pin 78491cd2... |
| `scripts/codex-coordination-monitor.py` + test | monitor runtime | Not applicable | wl-003/wl-004; separate exact-byte clean gate at 439bad8 |
| Backlog task records and prior security reports in the delta | coordination/evidence documents, not product surfaces | Not applicable | excluded, see coverage.json explicitExclusions |

No deferred rows. Every `deep_review_input.jsonl` row has a completion receipt.

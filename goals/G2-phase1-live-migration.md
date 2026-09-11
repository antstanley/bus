# G2 — Phase-1 live migration

Status: open. Custody: schaffa (assigned by lead on operator instruction,
2026-09-11). Created 2026-09-11 from retired tasks 109, 110 (and the runtime
work formerly under 147/149).

## Goal

The team board runs live for every active participant — MCP and hook roles —
from provisioned per-process replicas, migrated with the guarded procedure,
accepted on real stores, with message-to-attention working without a human
relay. The legacy `./bus` remains as fallback only.

## Constraints

- The final selected config artifacts are the retained
  `/private/tmp/sidekick-phase1-runtime-f917236/.task109-final-config` set:
  MCP fragment hash begins `da453089` (opencode's 2026-09-11 correction of the
  handoff record's `a453089`), plugin `73e2756`. Verify the exact current
  values from the artifacts before any apply.
- Before apply: fresh live preimages, per-participant isolated stores, and
  owner-controlled quiescence must be verified. A synthetic full-after run is
  not a live replacement.
- Do not restart or kill runtimes to force migration; quiescence is
  coordinated, not forced. No config may be applied without the lead and
  operator recording it here first.
- Provisioned runtime roles live under
  `/private/tmp/sidekick-109-opencode-runtime-20260910/{mcp,hook}/board` with
  matching index files; preserve them.
- Standing constraints apply.

## Log

- 2026-09-11 syenite: goal created; holds from the retired task records carry
  over unchanged (no config applied, no restart, no live acceptance claimed).
- 2026-09-11 syenite: assigned to schaffa (operator: "give it the next
  goal"). Scope of autonomy: schaffa owns all preparation — preimage
  verification, per-participant isolated-store checks, quiescence plan and
  coordination, dry verification of the retained config artifacts. The apply
  itself remains gated: no config is applied until the lead AND operator
  record the apply decision in this file. Announce preparation milestones on
  the board; standing model constraint applies.
- 2026-09-11 schaffa: preparation milestone 1 — artifacts and preimages.
  Retained final-config hashes VERIFIED on disk: planA MCP fragment
  `da45308996cc0053…` and planB plugin `73e275673b698e30…` match the
  corrected records exactly (outputs/planA-mcp-board-entry.json,
  outputs/planB-board-plugin.ts under
  `/private/tmp/sidekick-phase1-runtime-f917236/.task109-final-config/`).
  The retained planA fragment is opencode-specific (`--as opencode`,
  replica `/private/tmp/sidekick-109-opencode-runtime-20260910/mcp/board`)
  — it is the per-process pattern to adapt per participant, not a literal
  for all. Proposal gates restated: lead root-entry decision recorded first;
  fresh live preimages immediately before apply; quiesced target runtime;
  single-writer guarded apply with post-apply rehash, fail-closed, no
  auto-restore, no installRuntime merge path on live config.
  Fresh live preimages captured to
  `/private/tmp/sidekick-g2-preimages-20260911/` (sha256 manifest inside):
  at capture time ZERO board MCP children were running on the host (the
  retired opencode-bound child is gone, essun-bound child died with the
  removed replica, schaffa binding not yet loaded) — MCP quiescence is
  currently trivially satisfied. Active participants needing board roles:
  syenite (omp PID 98995), schaffa (omp PID 91190), nassun (dsh); replicas
  provisioned for syenite (mcp+cli, `provisioned-not-connected`) and
  schaffa (mcp+cli, same state); leftover empty `essun-33372` replica
  directory observed for lead cleanup. Codex sessions on this host run
  cmux hooks unrelated to the board — preimage-recorded, out of G2 scope.

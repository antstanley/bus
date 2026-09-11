# G2 — Phase-1 live migration

Status: open. Custody: syenite (lead). Created 2026-09-11 from retired tasks
109, 110 (and the runtime work formerly under 147/149).

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

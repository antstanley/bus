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
- 2026-09-11 schaffa: preparation milestone 2 — stores verified, plan and
  root-entry decision drafted. Per-participant isolated stores VERIFIED:
  schaffa mcp+cli (proven in use), syenite mcp (stale head 08:50Z, binding
  dead — refresh at apply) + cli (active, head 13:10Z), nassun cli
  (`replicas/nassun-cli-20260910/board`, active, head 13:13Z — its review
  workers). Root-entry decision DRAFT posted to the board for lead+operator
  record: (1) schaffa MCP via project `.omp/mcp.json` `board-schaffa`
  (already declared; activates at next session start — no restart forced);
  (2) syenite same pattern via `board-syenite` → `team/mcp/syenite-98995`,
  applied by syenite itself in its quiesced window; (3) nassun stays
  CLI-replica (live) unless the operator directs an MCP/hook role for dsh;
  (4) deliverer role owner is a lead decision (candidate: dedicated
  `--deliver` watcher or syenite's runtime); (5) Codex DROPPED from the
  participant list (retired/paused) — this resolves the proposal's
  unverified codex override-schema gap by recorded scope reduction, not
  bypass; opencode stays retired, its fragment remains the pattern source.
  Hook-role mechanics: Pi grouped hooks are per-event processes with
  owned-extension markers (`packages/hooks/src/board-hook.ts`), so hook
  config applies on the next board event without runtime restart; guarded
  apply = owned-extension merge or whole-file plugin replace per the
  proposal, never the installRuntime merge path on live config. Quiescence
  plan: per-participant owner-controlled windows at safe handoffs, fresh
  preimage re-verification immediately before bytes change, post-apply
  rehash of both artifacts, mismatch stops for lead review (no
  auto-restore). Dry verification: planA schema matches the live declared
  binding; installer suite 28/0 on merged f917236-source; fixture
  max1/zero-overlap recorded on reviewed source. Readiness announced on
  the board; apply awaits lead AND operator decision recorded here.
- 2026-09-11 syenite (LEAD DECISION on the root-entry draft): approved with
  two determinations. (3) nassun stays CLI-replica only — its dsh harness has
  no MCP/hook role unless the operator directs one later. (4) deliverer role:
  syenite's runtime acts as deliverer for now (no new background process);
  revisit with a dedicated `--deliver` watcher on its own replica only if
  turn-driven delivery proves insufficient. Points (1), (2) and (5) approved
  as drafted (schaffa binding at next session start; syenite self-applies
  board-syenite in its quiesced window; codex dropped from participants,
  recorded as scope reduction). Quiescence plan and dry verification approved
  as drafted. Apply still requires the OPERATOR's record below this line.
- 2026-09-11 OPERATOR APPLY DECISION (recorded by lead on the operator's
  explicit instruction "record the G2 apply decision", issued through this
  session): the root-entry decision is approved for execution as drafted and
  amended — (1) schaffa MCP via project `.omp/mcp.json` `board-schaffa` ->
  `team/mcp/schaffa-91190`, activating at its next session start, hook role
  per-event on next board event; (2) syenite self-applies `board-syenite` ->
  `team/mcp/syenite-98995` in its own quiesced window (binding already
  declared in shared settings; stale replica head refreshes at apply);
  (3) nassun remains CLI-replica only; (4) deliverer role: syenite's runtime
  for now; (5) codex dropped from participants. Execution is schaffa's, per
  its recorded quiescence plan: fresh preimage re-verification immediately
  before any bytes change, single writer, post-apply rehash of both
  artifacts (da453089 / 73e2756), fail-closed on mismatch with no
  auto-restore, no runtime restarts, no installRuntime merge path on live
  config, no foreign entry deletion. Both gates (lead + operator) are now
  recorded; schaffa is released to execute.
- 2026-09-11 syenite (own quiesced window executed): `board-syenite` binding
  was already declared in shared settings at provisioning; re-load attempt in
  this session still hits the daemon's stale settings snapshot (documented
  limitation — long-lived daemon, settings read at its start). State recorded
  honestly: syenite participates live via the sequential CLI replica
  (fully functional, gated, synced) and the MCP binding connects at next
  session start. No config bytes changed in this window; nothing to rehash on
  the syenite path beyond the declared binding (store untouched — next
  connect performs the sync). Apply execution on the schaffa path is
  schaffa's, released above.

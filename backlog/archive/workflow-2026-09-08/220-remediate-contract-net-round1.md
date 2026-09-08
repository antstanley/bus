---
id: 220
title: "spec remediation: contract-net after round 1"
phase: 2
owner: codex-architect
status: gated
kind: spec-authoring
parent: 218
related: [217, 204]
depends: [218]
estimate: M
---

Explicit CLEAN author assignment following completed218 review verdict, not
waiting for administrative archival. Input docs/protocols/contract-net.md at
75314696c577e6b3b91ade86ce86c98a9d02661ef96465661d8ede993e7ee640,
task217 settled choices,218 findings, committed DESIGN and frozen request-
response/enrollment boundaries. Edit ONLY contract-net draft; no code/reviews,
live negotiation, source or other spec edits. Coordinate disjoint authors.

Fix218 P2-1: for a retained ID, compare canonical digest after core/key
validation BEFORE profile/correlation/invitation/expiry filtering. New IDs
still use normal filters; explicitly handle unreadable/invalid replacements.
ExtendCN08/17 for retained-ID changed correlation/profile-invalid data: conflict,
existing publication ledger preserved, no further publication.

Fix218 P2-2 with lead choice: separate permanent ledger creation-order slot
identity from primary-first publication priority. Do not reorder or renumber
slots already created during collection. Specify deterministic winner/no-winner
handling, cancellation ledger and64-slot bounds; extend tests for pre-freeze
overmax/duplicate rejection followed by winner/no-winner, stable IDs/put order.
No reopening ranking, authority, duration, cardinality or settled profile bounds.

Return new full hash, per-finding correction map, acceptance changes, open
choices and cleanup. Freeze for221 correctness round2/3 and222 separate
security gate. No implementation until settled and added to implementation plan.

Actual clean worker architect_remediation_220 RUNNING confirmed133215Z-4844;
captured enrollment boundary input before disjoint313 author edits. Lead
confirms full freeze-obligation preflight against64 slots: if insufficient,
CN_WORK_LIMIT preserves prior ledger and undecided decision, with no partial
primary/notification batch. Retain append-only slot identity and separate
primary/ranked-loser/pre-freeze-rejection/late-rejection publication scheduling.

Frozen author handoff `20260906T133819Z-codex-architect-4e3c`: sole edited
docs/protocols/contract-net.md SHA256
ce898918ee38c8062ab5e595ec82a040174b17f14665364254ce0ba5ad0bc662,
115,356 bytes/1,621 lines; lead metadata verified. Both218 P2 correction maps
and extended acceptance cases returned, no open author choices. Author cleanup
confirmed.221/222 are ready for routing but queued behind critical108/109/110;
no independent approval or implementation. Architect has paused per operator.

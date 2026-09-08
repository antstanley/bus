---
id: 310
title: "spec remediation: agent-enrollment, after round 1"
phase: 3
owner: codex-architect
status: gated
kind: spec-authoring
depends: [309]
estimate: M
---

Remediate the completed CHANGES REQUIRED review 309 of authoring task
308. This is authoring only, not implementation, review or approval.
Prior review evidence is available even while its integration record is gated.

Capacity resolved: after the lead's spawn hit its retained-thread limit,
Codex Architect successfully started a fresh task310 author in its own runtime
(`20260905T194820Z-codex-architect-2b6d`). Tasks 213 and 215 run as lead-provided
clean capacity under the same architect ownership. Do not duplicate authors.

## Frozen starting scope

- `docs/design/agent-enrollment.md`, SHA-256 `26bd835bf155abf6c6beaac36824bdf09be70e6292101a68477ec7edbbfa8db8`.
- Starting product baseline: `35df4b9`; documentation-only charter commit
  `0642428` is now HEAD and does not alter this draft.
- No other editable paths.

## Required reviewer remediation

- P1, lines 891–913/926–937/1587–1590: separate bounded forward catch-up from accepted-history/root reconciliation so late conflicting already-accepted revisions are detected without a referencing post. Define durable conflict/checkpoint/coverage boundaries.
- P2, lines 406–412/921–924/1063–1066/1457: complete audit-mode permission/read/write/live/task/evidence/event matrix, reason precedence and promotion semantics.
- P2, lines 954–965/1322/1067–1069: define localMaxPolicySeconds semantics and exact decision/cache invalidation boundaries.
- P2, lines 1349–1357/1516–1518/1575–1585/1642–1646: Store.changes keys/token allocation is unbounded; require bounded resumable capability or secure fallback that never invokes that feed, with crash-safe progress/history-rewrite semantics.
- P2, lines 1270–1281/1335–1336/1431–1438: support indeterminate publication after put/lost acknowledgement, retain exact bytes/ID/hash or safe retry handle; same-byte KeyExists recovery and expiry tests, no replacement ID.
- P2, lines 428–438/458–464/499–503: distinguish live foreign-key references from revocation/tombstone identifiers when identities are removed; fresh bootstrap and atRevision constraints need complete removal fixtures.
- P2, lines 486–497/619–625/1431–1438/1875–1878: coordinate distributed charter workflow and shared CLI error mapping with remediation 215; no dangling pending alignment.

## Lead decisions

Accept section-20 recommendations as design direction, not deployment authorization:
- D1 manual operator-controlled issuer initially; actual custody deployment must be named before rollout. No assertion that agents hold issuer authority or same-user custody is isolated.
- D2 bounded quorum schema, devteam default 1-of-1 with explicit backup/renewal responsibility; independent recovery authority deferred.
- D3 stable GrantId for unchanged identity/scope renewal; changed keys/scope require new IDs and visible revalidation.
- D4 fixed complete 64 KiB profile, explicit capacity failures; no silent tombstone pruning/cap increase.
- D5 bounded transport required for secure mode; cap existing snapshot containers, disable unsafe over-limit retention, scope chunked formats separately. Secure fallback must not allocate unbounded changes feeds.
- D6 historical publishing provenance plus current exact approval; D7 durable per-principal approval floors; D8 operator-approved coordinationRole as workflow metadata only.
- D9 requiredAtStartup only on implemented/verified local harness recovery integrations. D10 platform Ed25519 plus profile-conforming bounded JSON/JCS preferred; actual provider chosen by later behavior/packaging validation, not assumed certified here.
- Choose localMaxPolicySeconds as a maximum accepted SIGNED validity duration: reject snapshots whose expiresAt-issuedAt exceeds it. State precise denial/config-change cache invalidation; no separate implicit age limit.
- Audit data is inspection/evidence, never implicitly promoted to current authorization, live execution or task authority. Author must spell out retention/write distinctions and complete the matrix consistently with this boundary.
- Audit-write decision (`20260905T195332Z-codex-3709`): choose explicit
  `purpose:audit-publication` with fresh current policy, posting enabled and
  exact grants/actor checks. Signed retained evidence only; ordinary operational
  writes/current reads/live delivery/current task acceptance reject
  `board_audit_only` and never silently fall back to audit purpose. Bind purpose
  and audit origin immutably. Audit-origin records remain audit-only after a
  policy-mode change; promotion requires full revalidation and never queues old
  delivery. Specify error precedence, event effects, lost acknowledgements and
  cross-path tests. This is design direction, not implementation approval.
- Publication unknown is distinct from authorization state. Preserve original exact bytes/ID for reconciliation; never invent success or an automatic new-ID retry.
- Shared enrollment/charter exits remain 0 completed inspection, 1 local I/O, 2 usage, 3 trust/authorization rejection, 4 incomplete/operator recovery. Coordinate exact readiness mapping with task 215.
- Task215 alignment settled by lead: required recoverable unreadiness is4;
  definitive trust rejection/conflict is3; optional unadopted warning with
  independent routing authorization is0; completed audit inspection is0.
  Explicitly distinguish incomplete/catch-up from definitive invalid data.
- Lead clarification (`20260905T195528Z-codex-6f09`): approved-object startup
  requires current binding/floors, exact approved bytes and needed historical
  provenance, not replay of every predecessor. Missing predecessor lineage
  blocks successor approval. Optional invalid candidate is rejected/unadopted
  with warning while independent routing may proceed; definitive enrollment/
  binding/floor denial remains3; explicit invalid read/adopt/restore remains3.

## Definition of done

- [x] Clean author incorporates every finding and the settled lead decisions.
- [x] Cross-spec assumptions reconciled with other assigned authors through the lead.
- [x] Return exact final paths/hashes, per-finding response, remaining choices,
  and cleanup evidence. Remain DRAFT; no self-approval or implementation.
- [x] Lead freezes the result and activates round-2 review task 311.
- [ ] Artifact integration records required gates and cleanup.

## Frozen handoff

Architect handoff `20260905T201548Z-codex-architect-7dd3`: only
`docs/design/agent-enrollment.md`, SHA-256
`d48c7ecd5fb4a33f057f1d5e3bc7bb8a5ce5ed16014e239bf1f1599a44c36306`.
2,498 lines / 169,945 bytes; lead verified hash. Author reports all seven
findings addressed, EN-47–EN-69 acceptance cases and settled section20.
Charter alignment uses frozen215 hash34dc2a1c3990043943e6c83babc0e6fd7ae52a0e679bc8f4180ec6f6ce05f165.
No new material decision requested; actual custody/backup, provider/adapter
validation, harness integration and local settings remain rollout prerequisites.
Author reports no tests, implementation, review, scratch or background work.
DRAFT remains unapproved pending independent review311.

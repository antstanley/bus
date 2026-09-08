---
id: 313
title: "spec remediation: enrollment before final review"
phase: 3
owner: codex-architect
status: gated
kind: spec-authoring
parent: 311
related: [310, 312]
depends: [311, 312]
estimate: M
---

Explicit clean AUTHOR assignment, existing spec role. Prerequisites are the
completed311 and312 review verdicts, not their later archival. Input ONLY
docs/design/agent-enrollment.md at d48c7ecd5fb4a33f057f1d5e3bc7bb8a5ce5ed16014e239bf1f1599a44c36306,
task310 settled choices,311 findings,312 full report/disposition, committed
DESIGN/research04 and frozen charter/request-response boundary context. Edit
ONLY this enrollment draft. Preserve all settled directions, no implementation,
security/code/spec review, keys, deployment or other source/draft edits.

Remediate311 P2: the universal immutable ifNoneMatch/collision publication
contract conflicts with mutable same-path presence. Explicitly distinguish
immutable records and presence; specify sequence allocation/serialization,
mutable dispatch, unknown reconciliation, legitimate higher-sequence successors,
same-sequence conflicts and Store conditional-update limitations. Never retry
an older heartbeat in a way that overwrites a known successor. Do not claim
cross-process CAS/atomicity the Store does not provide. Make necessary bounded
publication outcome semantics explicit and route any consequential unresolved
choice to Hoa rather than inventing hidden authority. ExtendEN35/60–62 for
two ordinary heartbeats, lost acknowledgment then higher sequence, restart/retry
of superseded heartbeat across adapters, conflict and unsupported capabilities.

Also remediate SEC1–5 from312 under its recorded lead dispositions: exact
operator signing confirmation/journal binding, deterministic retained grants
under tombstoned identities, missing-history coverage observable, no ambiguous
future grant activation, and merged acceptance cases for signing mismatch,
authorized attachment descriptors and divergent issuer machines. Avoid
duplicating SEC1/5 coverage or changing unrelated authorization semantics.

Return complete new path/hash, per-finding correction/evidence map, limits,
unresolved choices and cleanup. Freeze for314 FINAL correctness round3/3 and
315 separate fresh security gate. No fourth correctness round or automatic
implementation authorization; remaining round3 defects return to lead.

Actual clean worker architect_remediation_313 RUNNING confirmed133215Z-4844.
Lead selects author optionA: retain portable Store/separate-instance contract;
exclusive local instance writer, durable allocation/journal and serialized
finite dispatch. Restart uses a new instance unless ownership and prior
operation drainage are established. Unknown handles remain inspectable; known
higher successor permanently bars older retries. No CAS/global-order claims.
Ambiguous same-instance takeover/conditional cross-process replacement returns
unsupported/incomplete before put; no new atomic Store capability in this scope.

Frozen author handoff `20260906T134703Z-codex-architect-47c3`: sole edited
docs/design/agent-enrollment.md SHA256
339d983a0bdfc37459e8cdd204d7774a0f60ab2ed885d87e99bd01e3936bb233,
200,745 bytes/2,850 lines; lead metadata verified.311 P2 and312 SEC1–5
correction map returned, extendedEN35/50/56/60–63 plusEN70–72 and parity.
No open author choice, but implementation-stage guarantees still need testing.
Author cleanup confirmed, no independent review/approval.314 finalround3 and
315 security queued behind critical108/109/110. Architect has paused per its
operator;141 not dispatched. Keep draft frozen until independent review.

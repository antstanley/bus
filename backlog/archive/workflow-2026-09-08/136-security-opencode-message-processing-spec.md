---
id: 136
title: "security review: OpenCode message-processing spec"
phase: 1
owner: letta
status: gated
kind: security-review
parent: 134
related: [135]
depends: [134]
estimate: S
---

Blocked on134's complete frozen draft, not final closure. Fresh independent
security design review of ONLY docs/design/opencode-message-processing.md at
its published hash, task134 and research04 trust context, with prior119 local
delivery-boundary protections as relevant context. May run alongside135 on
the same freeze. No implementation, live monitor/session actions, credential
access or draft remediation. No correctness-round increment.

Check message-data versus operator authority, local delivery target validation,
credentials, restart/registration ownership, bounded resources/retry, safe
failure and honest assumptions. Report ACCEPT or actionable defects for Codex
without exploit narratives, exact scope/base/hash and cleanup; write only
docs/security/2026-09-06-task136-opencode-message-processing-spec.md and own
task/INDEX evidence. Preserve audit. Lead combines findings with135 before
linked author remediation; no approval by task closure alone.

- [ ] Frozen134 scope available; fresh worker claimed.
- [ ] Exact-scope verdict, evidence and limitations recorded.
- [ ] Disposition/follow-up and cleanup recorded.

Unblocked by134 final handoff d23bd16e...fb9b2,85,323 bytes/1,054 lines,
baseline7190f83. Review full exact draft and134 D3 lead disposition; clean
worker acknowledgment/verdict pending. No deployment or live-runtime tests.

Final handoff `20260906T132714Z-letta-15b6`: ACCEPT-ready with1 MEDIUM/3 LOW
findings, not unconditional approval. Draft hash unchanged; report
docs/security/2026-09-06-task136-opencode-message-processing-spec.md SHA256
9d115fa7bda2fe277a4e585aaaf426c246a1a514aedc5f806e0b90c20e0f7510
independently checked by lead. Required corrections in141: F1 observable
untrusted-content authority-boundary acceptance cases; F2 explicit private
registration custody/permissions/owner/symlink checks; F3 explicit same-user
control-channel trust/authentication assumption; F4 untrusted framing and
normalization for new inbox_next/inbox_body tools, not compatibility paths only.
Combine135 correctness findings before142/143. No implementation approval.

---
id: 141
title: "spec remediation OpenCode message processing"
phase: 1
owner: codex-architect
status: blocked
kind: spec-authoring
parent: 135
related: [134, 136]
depends: [135, 136]
estimate: M
---

Explicit clean author follow-up after BOTH135/136 verdicts. Edit ONLY docs/design/opencode-message-processing.md from d23bd16ea9ed5f1af3af5f0295ad442fc9f9e74c50bb538e1f745b37c78fb9b2. Resolve135 threeP2s (history-safe feed bootstrap/recovery; actually bounded feed or bounded fallback/unsupported; new-message episode versus unresolved retry quiet period) with required acceptance cases; combine136 findings. Incorporate lead-settledD3 into labels/default wording. Preserve D1/D2 direction and do not turn proposed numerical targets, experimental flags, service configuration or retention choices into operator approval. No implementation/deployment/live tests/transcript expansion or other draft edits. Give complete new hash, correction map, remaining choices and cleanup;142 round2 and143 security follow.

Dependency on an author task means its complete frozen handoff, not final
commit/closure. Review prerequisites mean completed verdicts, not archival;
never bypass an unfinished same-freeze review or create a cyclic closure gate.

135 and136 verdicts complete; explicit author scope may proceed after current
disjoint author capacity is available. Require all136 F1–F4 corrections:
observable acceptance proving message data cannot change local bindings/config,
delivery targets or cancellation authority; explicit private registration
permissions/custody/owner/symlink checks; explicit same-user control-channel
trust/authentication assumption and its limits; untrusted framing/normalization
also for new inbox_next/inbox_body interfaces. Add meaningful acceptance cases,
no implementation or runtime actions. Lead does not waive these findings.

Capacity/operator hold `20260906T133215Z-codex-architect-4844`: architect's
direct operator instructed it to finish only the two already-running313/220
authors, then pause.141 has NOT been dispatched; await an available/resumed
authorized architect session. Findings/prerequisites ready, no draft edits.

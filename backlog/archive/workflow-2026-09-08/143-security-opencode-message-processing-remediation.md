---
id: 143
title: "security gate OpenCode message-processing remediation"
phase: 1
owner: letta
status: blocked
kind: security-review
parent: 141
related: [136, 142]
depends: [141]
estimate: M
---

After141 complete new freeze, CLEAN independent full-spec security gate with research04, prior136 findings and141 correction map. Verify bounded transport/bootstrap, durable processing/ack semantics, local delivery authority, retry/capacity and failure behavior. No source/spec edits, credentials, flags/monitor/session actions or deployment. Return exact pins, ACCEPT or defects for Codex, audit under docs/security/ and cleanup; no extra correctness-round increment.

Dependency on an author task means its complete frozen handoff, not final
commit/closure. Review prerequisites mean completed verdicts, not archival;
never bypass an unfinished same-freeze review or create a cyclic closure gate.

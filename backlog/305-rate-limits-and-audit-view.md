---
id: 305
title: rate limits and audit view
phase: 3
owner: letta
status: blocked
depends: [302, 311]
estimate: S
---
Per-author ingest budget with drop-and-log; board audit lists rejected, unsigned, revoked, rate-limited activity.

Lead planning update (2026-09-05): letta owns this task under the current
role split. This is not implementation dispatch; await an explicit scoped lead
handoff before starting work. The legacy brief above must be reconciled with the
settled enrollment specification after review311 and its required security
gate; draft availability is not implementation approval.

## Definition of done
- [ ] configurable limits; audit table in index; CLI board audit

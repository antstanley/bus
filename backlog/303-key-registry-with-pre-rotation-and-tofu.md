---
id: 303
title: key registry with pre-rotation and TOFU
phase: 3
owner: letta
status: blocked
depends: [302, 311]
estimate: M
---
agents/<name>/keys/<ulid>.json add/revoke events signed by current or pre-committed next key; first key pinned locally.

Lead planning update (2026-09-05): letta owns this task under the current
role split. This is not implementation dispatch; await an explicit scoped lead
handoff before starting work. The legacy brief above must be reconciled with the
settled enrollment specification after review311 and its required security
gate; draft availability is not implementation approval.

## Definition of done
- [ ] rotation and revocation tests; revoked key's later posts rejected
- [ ] board keys list|rotate|revoke

---
id: 303
title: key registry with pre-rotation and TOFU
phase: 3
owner: letta
status: todo
depends: [302]
estimate: M
---
agents/<name>/keys/<ulid>.json add/revoke events signed by current or pre-committed next key; first key pinned locally.

## Definition of done
- [ ] rotation and revocation tests; revoked key's later posts rejected
- [ ] board keys list|rotate|revoke

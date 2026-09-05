---
id: 301
title: identity: keys, did:key ids, keystore
phase: 3
owner: letta
status: blocked
depends: [311]
estimate: M
---
Ed25519 per (agent, machine) stored via Bun.secrets with a 0600 file fallback; did:key encoding; SSH-key signing path for humans.

Lead planning update (2026-09-05): letta owns this task under the current
role split. This is not implementation dispatch; await an explicit scoped lead
handoff before starting work. The legacy brief above must be reconciled with the
settled enrollment specification after review311 and its required security
gate; draft availability is not implementation approval.

## Definition of done
- [ ] board key init|show|export; did:key round-trip tests
- [ ] ssh-keygen -Y sign compatibility documented and tested

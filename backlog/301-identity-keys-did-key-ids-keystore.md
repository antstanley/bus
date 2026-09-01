---
id: 301
title: identity: keys, did:key ids, keystore
phase: 3
owner: claude
status: todo
depends: []
estimate: M
---
Ed25519 per (agent, machine) stored via Bun.secrets with a 0600 file fallback; did:key encoding; SSH-key signing path for humans.

## Definition of done
- [ ] board key init|show|export; did:key round-trip tests
- [ ] ssh-keygen -Y sign compatibility documented and tested

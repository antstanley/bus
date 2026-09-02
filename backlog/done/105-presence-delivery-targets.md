---
id: 105
title: presence: delivery targets
phase: 1
owner: letta
status: done
depends: [101]
estimate: S
---
So a wake daemon can reach an instance, presence records runtime, session id, Claude messaging socket path, cmux surface id (research 03).

## Definition of done
- [ ] heartbeat accepts {runtime, sessionId, socket, cmuxSurface}; who() returns them
- [ ] hooks populate them from hook payload/env
- [ ] board who --json shows reachability per instance

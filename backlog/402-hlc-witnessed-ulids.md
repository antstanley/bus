---
id: 402
title: HLC-witnessed ULIDs
phase: 4
owner: opencode
status: todo
depends: []
estimate: S
---
Generator uses max(now, maxSeenTs+1) so replies never sort before parents under skew.

Lead planning update (2026-09-05): opencode owns this task under the current
role split. This is not implementation dispatch; await an explicit scoped lead
handoff before starting work.

## Definition of done
- [ ] ulid() accepts a witness; Board updates it from every read
- [ ] test with +-5 min simulated skew

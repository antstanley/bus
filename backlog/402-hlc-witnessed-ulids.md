---
id: 402
title: HLC-witnessed ULIDs
phase: 4
owner: claude
status: todo
depends: []
estimate: S
---
Generator uses max(now, maxSeenTs+1) so replies never sort before parents under skew.

## Definition of done
- [ ] ulid() accepts a witness; Board updates it from every read
- [ ] test with +-5 min simulated skew

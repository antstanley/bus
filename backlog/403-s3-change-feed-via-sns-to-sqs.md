---
id: 403
title: S3 change feed via SNS to SQS
phase: 4
owner: letta
status: todo
depends: []
estimate: M
---
store-s3 changes(token) backed by a per-reader queue with sequencer dedup and list fallback.

## Definition of done
- [ ] infra script (bucket notification, topic, per-instance queue) with teardown
- [ ] idle reader cost measured under $0.01/day; live test behind BOARD_S3_INTEGRATION

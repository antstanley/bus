---
id: 116
title: security: mcp/index/s3 follow-ups (scan 2026-09-01 #1 #2 #5 #11)
phase: 1
owner: letta
status: todo
depends: [112]
estimate: S
---
From docs/security/2026-09-01-main-5d098fa-scan.md.

## Definition of done
- [ ] HIGH #1 mcp server.ts:625: provenance labels are never suppressed for author == self; a store writer spoofing the reader's --as name reaches the model labelled untrusted (label by store-observed provenance, never by claimed author)
- [ ] MEDIUM #2 index.ts:405: cursor-sync ingestOne rejects posts whose board != the synced prefix (the changes path already does)
- [ ] LOW #5 store-s3 index.ts:117: bound list pagination iterations against a hostile endpoint returning perpetual isTruncated
- [ ] LOW #11 mcp server.ts:393: cap/prune the 2s poll set of watched resources
- [ ] tests for each

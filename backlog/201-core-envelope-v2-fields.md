---
id: 201
title: core: envelope v2 fields
phase: 2
owner: claude
status: todo
depends: []
estimate: M
---
Add to, act, protocol, task, status, replyBy, expires, contentType, data, dataSchema, origin, trace, extensions (research 01) with validation and canonical encoding; v1 posts remain valid.

## Definition of done
- [ ] schema, validator, tests for every act/status value
- [ ] CloudEvents round-trip test (post -> CloudEvent -> post)
- [ ] DESIGN.md updated; index stores new fields

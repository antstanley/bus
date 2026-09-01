---
id: 117
title: security: hooks/install/store-fs follow-ups (scan 2026-09-01 #7 #8 #9)
phase: 1
owner: codex
status: todo
depends: [104]
estimate: S
---
From docs/security/2026-09-01-main-5d098fa-scan.md.

## Definition of done
- [ ] LOW #7 hooks config.ts:93: conflicting runtime env signals fail closed (no identity) unless BOARD_AS is set
- [ ] LOW #8 install.ts:398: refuse any ://...@ userinfo (https://TOKEN@host PATs), not only user:pass@; redact in diffs
- [ ] LOW #9 store-fs index.ts:217: readdir EACCES/EPERM on a shared folder is tolerated like ENOENT so one mode-000 entry does not break list for every reader
- [ ] tests for each

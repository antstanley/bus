---
id: 103
title: cli: review fixes
phase: 1
owner: codex
status: done
depends: []
estimate: S
---
Thirteen hardening findings from the CLI review (signals, stdin body, '--', silent git sync failure, secret-bearing URLs in errors, dynamic import, heartbeat in watch, cursor emission, git spec parsing, help/exit codes).

## Definition of done
- [ ] every item in the 2026-09-01 review message resolved or explicitly deferred with a reason
- [ ] tests cover exit codes, --after, --limit, stdin body and SIGINT
- [ ] bun build --compile of the CLI runs post/read against an fs store

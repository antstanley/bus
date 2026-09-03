---
id: 121
title: hooks: strip CR in untrusted quoting; pi default author collision
phase: 1
owner: unassigned
status: todo
depends: [114]
estimate: S
---
From the 2026-09-02 Pi adapter gate (docs/security/2026-09-02-task114-pi-adapter-gate-review.md).
LOW: quoteUntrusted splits on LF only, so a bare CR in a post body can place the closing
marker at column 0 for CR-splitting consumers (content stays quoted; boundary can visually
close early). INFO: default author "pi" can collide with a real agent name.

## Definition of done
- [ ] quoteUntrusted normalises or strips CR (and other line separators U+2028/U+2029) before quoting; test with CR, CRLF, U+2028 bodies
- [ ] the 1-byte truncation edge never clips the closing marker's newline
- [ ] install pi requires an explicit --as or derives a unique default (e.g. pi-<host>) and warns on collision with a registered agent

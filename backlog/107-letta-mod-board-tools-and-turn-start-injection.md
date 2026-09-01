---
id: 107
title: letta mod: board tools and turn_start injection
phase: 1
owner: letta
status: todo
depends: [102]
estimate: M
---
Letta prefers mods over hooks/MCP for Letta Code. A mod registers board tools and injects unread at turn_start; spike whether a mod can start a turn from a timer (closes or confirms the Letta wake gap).

## Definition of done
- [ ] ~/.letta/mods/board.ts registers post/read/who tools and injects unread at turn_start
- [ ] written finding on timer-started turns with evidence
- [ ] README install steps

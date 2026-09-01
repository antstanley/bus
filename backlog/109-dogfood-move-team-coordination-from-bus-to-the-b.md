---
id: 109
title: dogfood: move team coordination from ./bus to the board
phase: 1
owner: claude
status: todo
depends: [101, 102, 103]
estimate: M
---
Replace the bash bus with the real thing: a board-data branch on the GitHub remote via GitStore, mirrored to S3 by a bridge later; each agent installed via board install.

## Definition of done
- [ ] board 'team' on git:./.board-data (branch board-data) used for all lead/agent traffic for one full task cycle
- [ ] ./bus marked deprecated in AGENTS.md with migration notes
- [ ] retro post on the board listing friction found

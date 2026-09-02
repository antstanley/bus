---
id: 122
title: letta-mod: clean review fixes (bun entrypoint, content shape, multiline bodies)
phase: 1
owner: letta
status: todo
depends: [107]
estimate: S
---
From codex's clean correctness review of task 107 (2026-09-02, NOT ACCEPTED). The mod is
committed; these are follow-ups.

## Definition of done
- [ ] P1 board.ts:85 spawn the repo CLI/hook with an explicit or configurable bun path (never process.execPath, which is Node inside Letta Code); fail with a clear message when bun is missing
- [ ] P1 board.ts:236 emit a valid Letta content shape; :145 preserve multiline post bodies
- [ ] P2 align multi-board read behaviour with docs; correct docs/research/06 (turn_end and implicit-timer claims)
- [ ] P3 preserve maxAgeMs=0; align BOARD_REPO docs/config
- [ ] a genuine hanging-hook timeout test; focused tests + root green; re-verified end to end under Letta Code's real Node host

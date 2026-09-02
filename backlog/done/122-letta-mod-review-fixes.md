---
id: 122
title: letta-mod: clean review fixes (bun entrypoint, content shape, multiline bodies)
phase: 1
owner: letta
status: done
depends: [107]
estimate: S
---
From codex's clean correctness review of task 107 (2026-09-02, NOT ACCEPTED). The mod is
committed; these are follow-ups.

## Definition of done
- [x] P1 board.ts:85 spawn the repo CLI/hook with an explicit or configurable bun path (never process.execPath, which is Node inside Letta Code); fail with a clear message when bun is missing — now always spawns `bun` (BOARD_BUN env / config `bun` / PATH); execFile ENOENT returns "board command failed: bun not found (looked for \"…\"); install bun or set BOARD_BUN / \"bun\" in the board config"; hook path still degrades silently
- [x] P1 board.ts:236 emit a valid Letta content shape; :145 preserve multiline post bodies — string content normalizes to typed text parts (never mixed [string, part]); body passes as a single `--body` argv value (CLI takes it verbatim); host-shape assertions in the claim-once test
- [x] P2 align multi-board read behaviour with docs; correct docs/research/06 (turn_end and implicit-timer claims) — board_read tool description now says "first configured board only" (CLI reads one board per invocation; aggregation would be a CLI feature, flagged to codex); README `boards` bullet rewritten; research/06 corrected against harness types: turn_end result is `{ continue?: string }` (ModTurnEndResult) but fires only at end-of-turn, "empirical" point rewritten as static API-surface inspection
- [x] P3 preserve maxAgeMs=0; align BOARD_REPO docs/config — Number.isFinite validation replaces the `|| fallback` that rewrote 0→120000 (argv regression test); BOARD_REPO env override implemented (env > config repo > default) matching the README's BOARD_* wording
- [x] a genuine hanging-hook timeout test; focused tests + root green; re-verified end to end under Letta Code's real Node host — hanging `setInterval` hook fixture killed by BOARD_SPAWN_TIMEOUT_MS=300 (new spawnTimeoutMs/BOARD_SPAWN_TIMEOUT_MS knob, 100ms–60s, default 10s), turn unaffected; packages/letta-mod 8 pass; root 184 pass / 1 skip / 0 fail; typecheck clean; e2e harness run under `node` (real host interpreter): tools register, turn_start injects typed parts through the real hook via bun, claim-once holds, multiline round-trips, who accepts 0

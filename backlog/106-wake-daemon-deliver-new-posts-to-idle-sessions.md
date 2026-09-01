---
id: 106
title: wake daemon: deliver new posts to idle sessions
phase: 1
owner: codex
status: todo
depends: [105]
estimate: M
---
Turn-boundary hooks cannot wake an idle agent. A daemon watches the board and delivers: Claude via messaging socket (crossSessionInbound accept), Codex via `codex queue --thread`, Letta via `cmux send`, humans via `cmux notify`.

## Definition of done
- [ ] board watch --deliver delivers each new addressed/mentioned post once, with a local delivery log and dedup
- [ ] measured message-to-attention latency under 5 s for Claude and Codex on this machine
- [ ] Letta path documented as best-effort with the cmux fallback; failure never crashes the daemon

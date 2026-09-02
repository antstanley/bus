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
- [x] board watch --deliver delivers each new addressed/mentioned post once, with a local delivery log and dedup
- [ ] measured message-to-attention latency under 5 s for Claude and Codex on this machine
- [x] Letta path documented as best-effort with the cmux fallback; failure never crashes the daemon

## Verification (2026-09-02)

- Claude delivery was exercised against a live session after a Stop-hook idle
  heartbeat. The watcher first skipped watcher-only `watching` presence, then
  delivered through the authenticated Claude socket once the hook published
  `idle`; the nudge was visible within five seconds of publication.
- Codex delivery uses the locally verified Codex CLI 0.152.1 command
  `codex queue --thread <thread> --message <pointer>`. Its live latency check
  needs a second Codex pane and is deferred to task 110 acceptance.
- Focused validation: 35 tests passed. Full repository validation: 180 tests
  passed and one opt-in live-S3 test skipped. TypeScript typecheck and
  `git diff --check` passed.

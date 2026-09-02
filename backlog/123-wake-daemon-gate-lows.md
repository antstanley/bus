---
id: 123
title: wake daemon: log-line hygiene, registry-write isolation, one session-id contract
phase: 1
owner: codex
status: todo
depends: [106]
estimate: S
---
Three LOW findings from the 106 gate (docs/security/2026-09-02-task106-wake-daemon-gate.md),
accepted in writing at commit time. Phrased as defects.

## Definition of done
- [ ] L1 cli/index.ts:467-469 and core post.ts:133-136: mention strings are validated with assertName in validatePost and only validated values are echoed into delivery log lines, so a log line is always one event per line (core one-liner permitted)
- [ ] L2 hooks/board-hook.ts:77-84: a Claude registry write failure is isolated in its own try/catch with a stderr diagnostic so poll still injects unread; test: failing registry dir does not block injection
- [ ] L3 cli/index.ts:334-343,484-493 vs hooks/config.ts:148-154: one session-identifier contract at publication and consumption (UUID for claude/codex; documented shape for letta/opencode/pi); non-conforming ids are rejected at publication with a clear message, never silently unwakeable

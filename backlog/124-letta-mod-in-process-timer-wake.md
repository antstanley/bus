---
id: 124
title: letta-mod: in-process timer wake for open Letta sessions
phase: 1
owner: letta
status: todo
depends: [122]
estimate: M
---
Experiment (docs/research/06, 2026-09-02) proved a captured ctx.conversation handle called
from a setInterval while idle starts a full model turn on the main conversation (Letta Code
0.31.8; bidirectional sessions; 409 on run overlap). So open-session Letta wake can live in
the mod; the daemon (106) stays for closed/asleep sessions.

## Definition of done
- [ ] mod timer (knobbed interval, default 5 s, backoff when nothing new) polls unread via board-hook poll and, only when the session is idle, sends a pointer-only nudge through the captured conversation handle; claim-before-send keeps claim-once honest
- [ ] idle detection via turn_end where emitted, with a conservative fallback (no send while a run is in flight; retry on 409 with backoff, max 3)
- [ ] no secrets or post bodies in the nudge; same UNTRUSTED framing at injection
- [ ] tests with a fake conversation handle: sends when idle, holds while busy, 409 retry, claim-once across timer and turn_start
- [ ] verified live: a mention from another agent starts a Letta turn without a human, latency recorded; docs/research/06 and the mod README updated; the 106 anti-pattern note revised

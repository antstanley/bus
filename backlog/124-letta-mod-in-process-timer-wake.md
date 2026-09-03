---
id: 124
title: letta-mod: in-process timer wake for open Letta sessions
phase: 4
owner: letta
status: blocked
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

## Corrections from codex's clean review of research/06 (20260902T212434Z-codex-191a; fold into this task)
1. Claim-before-send must be REVERSIBLE: a failed/rejected send must not permanently consume the mention. Use a durable reservation/lease coordinated with turn_start (turn_start injection keeps working; the timer's claim is a lease that expires back to unread), and finalize (mark read) only after the send is ACCEPTED. Test: exhausted retries leave the mention readable.
2. packages/letta-mod/README no longer may say timer turns are impossible — update to the observed truth (works on 0.31.8, undocumented surface, not enabled by default, open sessions only).
3. Version statements reconciled: quote `letta --version` (0.31.8); research/03's 0.31.9 install note vs research/06's 0.31.8 experiment — timestamp/explain distinct installs rather than contradicting.
4. The recipe and implementation must FULLY drain the async result of sendMessageStream (await the stream to completion) and handle creation + iteration failures; evidence depends on that completion.
5. Daemon wording: the daemon covers CLOSED sessions, not sleeping machines (a sleeping machine is unreachable by both paths).

## Deferred to hardening (2026-09-03)
Codex ran four clean correctness reviews; each surfaced substantive cross-process concurrency
defects (round 4 left 7: claim-before-arbitration duplicate/loss, incomplete lease
fencing/renewal, malformed-state fail-open, unsafe stale-artifact cleanup, post-dispose
injection/renewal mutation, restart baseline floor not persisted, and tests that exercise
manual state instead of the production multiprocess path). Getting an in-process cross-process
timer wake correct is a hardening-grade problem and the committed wake daemon (task 106) already
provides Letta wake for closed sessions, so this is deferred rather than looped again.
- Work preserved on branch **task-124-timer-wake-wip** (pushed): the round-3 implementation +
  the updated docs/research/06.
- The research finding itself (a Letta mod timer CAN start a turn while idle) is committed on
  main in docs/research/06 (2f1a812) and stands.
- Resume bar: the 7 blockers above must be closed with tests that drive real concurrent
  processes and crash/dispose-mid-operation, then a fresh clean review + security gate.

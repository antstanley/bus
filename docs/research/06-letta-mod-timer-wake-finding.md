# Finding: can a Letta Code mod start a turn from a timer? (backlog 107 spike)

Date: 2026-09-02 · Author: letta · Status: answered — no, with one partial exception.

## Question

Backlog 107 asks whether a Letta Code mod can start a turn from a timer. Turn-boundary
injection (the `turn_start` hook/mod point) only helps agents that are already talking; the
wake gap (backlog 106) needs something that starts a turn while the session is idle. If a mod
timer could start turns, the wake daemon would be unnecessary for Letta.

## Answer

**No supported path exists for a mod to start a turn on the main conversation.** Evidence, in
decreasing strength:

1. **The mod API's own contract forbids hidden model runs from tools.** The Letta Code
   creating-mods skill (references/tools.md) is explicit: "Tools should return information for
   the model to use; they should not start hidden model runs." A timer is not a tool, but the
   only mod-side model-entry points are:
   - `ctx.conversation.sendMessageStream()` on the **active** conversation — documented as
     unsafe from busy commands ("direct sends can conflict with the active run") and, per the
     events reference, "Do not send to the active conversation from `turn_start`; that event is
     already in the path of sending a turn." Nothing documents calling it from an idle-session
     timer at all; the only sanctioned background-model pattern is a **fork**.
   - `ctx.conversation.fork()` — "returns a scoped handle" targeting "the forked conversation".
     A fork is a separate conversation: model work it starts happens in the fork, not in the
     user's session. It wakes code, not the session.
2. **`turn_start` is a filter, not a generator.** The events reference defines its contract as
   transform/replace/cancel of an *outbound* turn ("Handlers can mutate `event.input` ... or
   return replacement input"; `{ cancel: { reason } }` tells "the host not to submit this
   turn"). It fires only when a turn is already being submitted. A handler cannot synthesize a
   turn, and `turn_end`/lifecycle events are notification-only.
3. **Timers only run while the session process is alive** (architecture reference: "Timers are
   okay for active-session behavior, but they only run while the mod engine is alive"). So even
   a hypothetical timer→turn bridge would not wake a closed TUI or a machine that is asleep;
   at best it covers "TUI open, conversation idle" — the same coverage the external daemon has,
   with strictly less reach.
4. **Empirical check of the delivered artifact.** The shipped mod
   (`packages/letta-mod/board.ts`, installed at `~/.letta/mods/board.ts`) registers a 5 s
   presence-style timer path only implicitly (we deliberately did **not** add a turn-starting
   timer). The mod API surface exercised — `letta.tools.register`, `letta.events.on`,
   capability guards, disposers — offers no `submitTurn`/`startTurn`-shaped method; the full
   mod API list in the skill (tools, commands, events, permissions, providers, ui) contains no
   turn-submission capability. (Re-verify against the installed mod API after any Letta Code
   upgrade; the API is young.)

## Consequence for the wake gap

Letta wake stays an **external** delivery, which is exactly the design backlog 106 already
chose for every runtime:

```
board watch --deliver (daemon, outside any session)
  └─ letta -p "<wake>" --agent <id> --conversation <id>     # real user turn
```

`letta -p` with `--agent`/`--conversation` submits a genuine user turn to the existing
conversation (Letta Code CLI reference; bidirectional `--input-format stream-json` also
exists). The daemon path reaches closed sessions and sleeping machines about as well as
anything can (not at all while asleep), whereas a mod timer could never do either. One caveat
from the research notes (03-adapters.md): whether a server-side API post reaches a running TUI
conversation is undocumented — assume no; `letta -p` is the tested path.

## What the mod does instead

- `turn_start` injects unread mentions (claimed exactly once via the shared hook index), so
  nothing is lost while the session is open but idle — the next user turn sees them.
- `conversation_open`/`conversation_close` heartbeats make the session visible to
  `board watch --deliver` presence targeting.
- A deliberate **anti-pattern note**: do not call `inject` from a timer. `inject` claims
  (marks read) the posts it returns; a timer that injects with no way to deliver would silently
  consume unread mentions. The claim-on-read behavior is correct for turn_start, where the
  content is actually delivered.

## Verdict

Mod timer-started turns: **not possible** with the current mod API; wake for Letta must come
from the external daemon (backlog 106) via `letta -p --conversation <id>`. Revisit only if a
future mod API adds an explicit, sanctioned turn-submission capability.

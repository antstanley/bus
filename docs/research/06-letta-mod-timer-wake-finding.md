# Finding: can a Letta Code mod start a turn from a timer? (backlog 107 spike)

Date: 2026-09-02 · Author: letta · Status: **answered by experiment — a captured-handle
timer send DOES start a turn on an idle conversation.** Experiment ran to completion
2026-09-02 on Letta Code **0.31.8**: idle-window sends fully logged locally and replicated
across two live sessions (working recipe + limits below). History: the original text
wrongly called `turn_end` notification-only and overstated an "empirical" check; codex's
same-day review corrected that and challenged the categorical "no supported path" claim.
The first experiment run captured the handle and proved server reachability (in-flight
409s) but its one-shot session tore down ~0.7 s after `turn_end`, so its decisive idle
attempt never logged locally; the run was completed later the same day in long-lived
bidirectional sessions (details below) and settled the challenge in the reviewer's favor.
(An earlier draft cited host 0.31.11 in error; at experiment time `letta --version` said
0.31.8 — the mod-visible `appVersion` field is `?`, so quote the CLI version. The machine
has since been upgraded: `letta --version` on 2026-09-03 reports **0.31.11**, which is
the version the task-124 live verification of the shipped mod ran on — the experiment
and the live check therefore cite different versions because the host upgraded in
between, not because either citation is wrong.)

## Question

Backlog 107 asks whether a Letta Code mod can start a turn from a timer. Turn-boundary
injection (the `turn_start` hook/mod point) only helps agents that are already talking; the
wake gap (backlog 106) needs something that starts a turn while the session is idle. If a
mod timer could start turns, the wake daemon would be unnecessary for open sessions.

## Answer

**Yes — with limits.** A mod can capture `ctx.conversation` during an event, keep it in a
module-level variable, and call `sendMessageStream` from a `setInterval`/`setTimeout`
timer. On an idle conversation the send is accepted and the backend runs a new model turn
on the MAIN conversation. Demonstrated 2026-09-02, Letta Code 0.31.8, host default backend
(model `gpt-5.6-sol`). The recipe:

1. **Capture.** There is no activation context (`activate(letta)` receives only the
   registration API; the old `letta.getContext` was removed), so capture from an event ctx:
   ```ts
   let saved: ModConversationHandle | null = null;
   letta.events.on("conversation_open", (_event, ctx) => { saved = ctx.conversation; });
   // turn_start / turn_end ctx also expose a fresh handle per dispatch.
   ```
   The handle is a plain closure over the backend + conversation id (host source,
   `createModConversationHandle`); no lifetime guard revokes it when the dispatch that
   produced it ends. (The host's `stale_handle` diagnostic guards the `letta` registration
   API after `/reload`, not captured conversation handles; behavior across `/reload` is
   untested.) The conversation id is stable across `conversation_open`, `turn_start`, and
   `turn_end`, so whichever event fires first is a fine capture point.
2. **Send.** `sendMessageStream` takes an ARRAY of messages — a bare string is wrong:
   ```ts
   const stream = await saved.sendMessageStream([{ role: "user", content: wakeText }]);
   ```
   Sends default to `background: true`: the run executes server-side, exactly like a user
   turn, and the returned async iterable streams the run's chunks (user_message echo, pings,
   assistant messages — ~4–7 s for a trivial reply).
3. **Timing.** A send landing while another run is in flight is rejected by the server:
   `409 {"error":"Cannot send a new message: Another request (run_id=...) is currently
   being processed for this conversation. Please wait for it to complete."}` — observed
   mid-first-turn in the first run AND when a +7 s timer send overlapped an earlier
   timer-initiated run that was still processing (second bidirectional run): the 409 tracks
   run overlap, not anything specific to idle timers. Every send that landed on an idle
   conversation was accepted: at +17 ms after `turn_end` (first run; accepted server-side,
   verified in the conversation transcript after its process died) and — fully logged
   locally — at +2 s, +7 s, and +20 s after the first run completed (bidirectional runs).
   Retry-on-409 is the robust shape.

## Experiment (2026-09-02, host 0.31.8)

Env-gated test mod (`BOARD_TIMER_EXPERIMENT=1`, fully inert otherwise: without the var it
registers nothing, starts no timers, writes no log — verified by control runs with mods
enabled and no var: no log written, clean exit 0, zero mod diagnostics). Installed briefly
in `~/.letta/mods/`, exercised in disposable sessions, then deleted; the existing board mod
was untouched.

**Run 1 — one-shot** (`letta -p "Reply with the single word: ok" --ephemeral
--output-format stream-json`): proved capture + reachability, and exposed the flaw:

    capture conversation_open: reason=new ... handleKeys=id|fork|getHistory|updateTitle|sendMessageStream|updateLlmConfig captured=true
    attempt 1: sendMessageStream REJECTED Error: 409 ... Another request (run_id=run-79934aa8-...) is currently being processed for this conversation.
    attempt 2: sendMessageStream REJECTED Error: 409 ... (same)
    capture turn_end: stopReason=end_turn
    attempt 3: calling captured.sendMessageStream([{role:"user",content:"[TIMER-EXPERIMENT 3] timer wake test"}]) ...
    experiment finished (why=disposer)          <- 0.7 s after turn_end; attempt 3's promise never settled

The host tears a one-shot session down in under a second after the turn, so attempt 3
(fired +17 ms after `turn_end`) never logged its outcome locally — the original gap.
Server-side transcript (fetched during the completion pass,
`letta messages transcript --conversation <id>`): the timer message landed at
19:30:12.622Z and a full assistant reply followed at 19:30:21.810Z ("Timer wake received —
experiment 3 woke me up successfully…") — accepted, but the local evidence was missing.

**Runs 2–3 — completed re-run, live sessions.** To keep a session alive through the idle
window, the one-shot `-p` form was replaced with bidirectional headless mode (note:
`--ephemeral` cannot be combined with `--input-format stream-json`; the host rejects it,
`headless_ephemeral_transport_unsupported` — so disposability comes from `--new` in a
scratch cwd: a brand-new conversation, thus nothing pre-existing is reachable from the
captured handle):

    scratch=$(mktemp -d); cd "$scratch"
    BOARD_TIMER_EXPERIMENT=1 letta -p --new \
      --input-format stream-json --output-format stream-json
    # one NDJSON line on stdin, stdin NOT closed:
    # {"type":"user","message":{"role":"user","content":"Reply with the single word: ok"}}
    # hold 45 s after the run completes; then close stdin → clean exit 0.

The mod scheduled idle-window attempts at +2/+7/+20 s from run completion (signalled by a
wrapper-written trigger file polled by a mod timer, with a `turn_start`+20 s in-mod
backstop; the bidirectional host never emits `turn_end` — see limits). Run 2 (20:08Z),
every attempt accepted and fully logged:

    attempt 1 (+2002ms after idle anchor, session idle): calling captured.sendMessageStream([{role:"user",content:"[TIMER-EXPERIMENT 1] timer wake test"}]) ...
    attempt 1: SUCCESS send resolved + stream fully consumed after 5350ms, chunks=6 chunk1={"id":"message-d8f89644-…","message_type":"user_message",…,"content":"[TIMER-EXPERIMENT 1] timer wake test","run_id":"run-c9c1abc1-…"} — timer-initiated send ACCEPTED on idle conversation
    attempt 2 (+7002ms …): … SUCCESS … run_id=run-954df875-… — timer-initiated send ACCEPTED on idle conversation
    attempt 3 (+20002ms …): … SUCCESS … run_id=run-1a8bb85f-… — timer-initiated send ACCEPTED on idle conversation
    history scan: getHistory() ok …, marker-bearing messages=3 (TIMER-EXPERIMENT 1, TIMER-EXPERIMENT 2, TIMER-EXPERIMENT 3) — TIMER MESSAGES PRESENT server-side (indirect success)

Server-side transcript: user turn "ok", then three timer turns, each with a real assistant
reply ("awake" ×3) — three model turns started by the mod's timer with zero user input.

Run 3 (21:01Z) replicated it and caught the overlap case: attempt 1 (+2 s) accepted
(`run_id=run-4288a351-…`), attempt 2 (+7 s) **rejected with the in-flight 409** because
attempt 1's timer-run was still processing, attempt 3 (+20 s) accepted
(`run_id=run-225f55b9-…`); `getHistory()` showed exactly the two accepted marker messages;
transcript shows assistant replies to both. This log is retained at
`/tmp/letta-timer-experiment.log`.

## Still-true limits

- **Closed TUI / asleep machine: unreachable** (unchanged). Timers only run while the mod
  engine is alive, so timer wake covers "session process open, conversation idle" only. The
  external daemon stays the only path for closed sessions, and nothing wakes a machine that
  is asleep — vividly re-demonstrated when the first completion attempt was itself lost to
  the Mac suspending mid-experiment (rerun under `caffeinate`).
- **Idle-session turns are not surfaced live by the local session.** In the bidirectional
  runs the timer-initiated turns never appeared on the session's stdout wire (zero
  occurrences), even though the session was fully live; they are visible via
  `ctx.conversation.getHistory()` and the conversation transcript. Whether an interactive
  TUI renders a mod-initiated run live — or only after the next interaction/history
  refresh — is still untested. A timer run overlapping the user's next send 409s one side
  or the other (server-enforced lock, observed from the timer side).
- **Undocumented pattern.** The recipe uses documented pieces (`ctx.conversation`,
  `sendMessageStream`, timers), but no doc sanctions timer-initiated sends on the active
  conversation — the skill warns sends "can conflict with the active run" and forbids them
  from busy commands/`turn_start`. The 409 shows the conflict is real and server-enforced,
  and that it disappears once the conversation is idle. Re-verify on every Letta Code
  upgrade; the API is young.
- **`turn_end` is not a universal trigger.** Headless bidirectional sessions
  (`--input-format stream-json`) never emit `turn_end` to mods (host 0.31.8: verified in
  source — `emitHeadlessTurnEnd` is called only in the one-shot send loop — and
  empirically: `turn_start` fired, the wire `result` arrived, no `turn_end` ever did, while
  the session stayed open for minutes). Mods in bidirectional sessions must trigger idle
  sends from timers or other events. Interactive-TUI emission was not tested.

## Turn-boundary facts retained (codex review, still true)

- `turn_start` is a filter, not a generator: its contract is transform/replace/cancel of an
  outbound turn; it fires only when a turn is already being submitted.
- `turn_end` is NOT notification-only — its result type is `{ continue?: string }`
  (`ModTurnEndResult` in the installed harness's `dist/types/mods/types.d.ts`), so a
  handler can queue a follow-up model run. It only extends a conversation that just
  finished a turn; an idle session never fires it. Where the host fires it at all (one-shot
  `-p` sessions; TUI untested — bidirectional headless never does), it remains the natural
  trigger point for the timer recipe — the moment the conversation goes idle — and an
  unsupervised `turn_end { continue }` chain is a runaway loop, not a wake.
- Tools should not start hidden model runs (tools.md contract). `ctx.conversation.fork()`
  remains the sanctioned background-model pattern, but a fork targets the forked
  conversation: it wakes code in the fork, not the user's session. The timer recipe is the
  only observed way to start a turn on the MAIN conversation without user input.

## Consequence for the wake gap

Split by session state:

- **Session open and idle** (demonstrated: long-lived bidirectional headless session; by
  extension any session whose mod engine stays alive): a mod timer CAN deliver the wake
  in-session — no external daemon needed for this case. Send after run completion and
  retry-on-409; use `turn_end` as the trigger only where the host fires it.
- **Session closed**: unchanged — external daemon
  (`board watch --deliver` → `letta -p "<wake>" --agent <id> --conversation <id>`) is
  still the only delivery path (bidirectional `--input-format stream-json` also exists).

Whether the board mod adopts timer wake for open sessions, keeping the daemon as the
closed-session fallback, is a backlog 106/107 design decision. **Update (2026-09-02,
backlog 124): settled — the mod ships this as an opt-in timer wake (off by default),
with the daemon kept for closed sessions.**

## What the mod does today (updated 2026-09-02, backlog 124; version evidence 2026-09-03)

- Version evidence: the spike/experiment above ran on **0.31.8**; the shipped mod's live
  verification (task 124: idle session, one seeded mention, one wake, one `board_read`
  tool call, pointer-only nudge confirmed server-side) ran on **0.31.11** — the host
  upgraded in between (`letta --version` on 2026-09-03 says 0.31.11). Both versions are
  recorded because re-verification on every upgrade is a standing limit (below).
- `turn_start` injects unread mentions (claimed exactly once via the shared hook index), so
  nothing is lost while the session is open but idle — the next user turn sees them.
- `conversation_open`/`conversation_close` heartbeats make the session visible to
  `board watch --deliver` presence targeting.
- **The mod now ships an opt-in timer wake for open sessions** (config `timerWake` /
  `BOARD_TIMER_WAKE`; off by default), built on the recipe above with reserve-then-commit:
  it reserves a mention in its own lease file, sends a pointer-only nudge (`A new board
  post mentions <agent> (post <id>). Run board read.` — no bodies, no framing), commits
  only on a **clean full drain after at least one chunk** — an attempt that yields chunks
  and then errors mid-iteration is a failed attempt whose outcome is unknown, so the
  reservation is released and the mention is retried rather than committed (a fully
  drained stream is required, not merely sufficient) — and releases the reservation on
  409 exhaustion, hard failure (an error before any chunk), a mid-iteration error, or a
  send that never settled within its `timerSendTimeoutMs` deadline (1000–300000 ms,
  default 30000).
- Anti-pattern note (updated): do not call `inject`/`poll` from a timer —
  they claim (mark read) the posts they return and would silently consume unread
  mentions. The board timer honors that with claim-once honesty: it never injects or
  claims content itself and delivers only a pointer, so a failed wake leaves every
  mention readable — injection stays `turn_start`-only. The note still applies to any
  timer path that claims without delivering.

## Verdict

Mod timer-started turns: **works, with limits** — demonstrated and replicated 2026-09-02 on
Letta Code 0.31.8: a captured `ctx.conversation` handle stays functional from a
`setTimeout`/`setInterval` timer while the session is idle, and
`sendMessageStream([{ role: "user", content: ... }])` starts a real backend run on the MAIN
conversation (assistant replies observed in the transcript; run_ids returned; sends fully
logged locally in live bidirectional sessions). Sends during an active run are rejected
with a server 409 — whether the active run is user-initiated or another timer send — so
retry-on-409 is required. Unchanged: closed TUI and asleep machines remain unreachable;
mod-initiated turns were NOT mirrored to the live session's output stream (TUI rendering
still unverified); the host's bidirectional mode never fires `turn_end`; and the pattern is
undocumented — re-verify on upgrade. Wake for closed sessions still requires the external
daemon (backlog 106) via `letta -p --conversation <id>`.

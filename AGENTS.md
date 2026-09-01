# Agents sharing this folder

Several AI coding agents run concurrently with this directory as their working
directory. As of 2026-09-01 that is:

| name     | tool                     |
|----------|--------------------------|
| `claude` | Claude Code (Anthropic)  |
| `codex`  | Codex CLI (OpenAI)       |
| `letta`  | Letta Code               |

They have no native way to talk to each other, so this folder carries a small
**file-based message bus**: `./bus`. Messages are files under `.bus/`, delivery
is an atomic rename, and no daemon is involved. Anything that can run a shell
command here can use it, including a human in a terminal.

## Quick start (do this once per session)

```sh
./bus register "one line about what you are working on"
./bus who
./bus read
```

Your name is detected from your parent process (`claude`, `codex`, `letta`).
If detection fails, prefix commands with `BUS_ME=<name>`.

## Commands

```sh
./bus send <name> "text"          # direct message
./bus send all "text"             # broadcast to every registered agent
./bus send <name> --re <id> "…"   # reply, threading on a message id
echo "long body" | ./bus send <name>
./bus inbox                       # list unread
./bus read                        # print unread and mark read
./bus peek                        # print unread without marking
./bus wait -t 120                 # block up to 120s for a reply, then read it
./bus log                         # full transcript, every message ever sent
./bus help
```

## Conventions

- **Check your inbox** with `./bus read` at the start of each turn and before
  you finish a piece of work. Nothing pushes messages to you.
- **Reply** with `--re <id>` so threads stay traceable in the log.
- **Keep messages short and actionable.** Say what you did, what you need, or
  what you are about to touch. Announce before editing a file another agent may
  be working on.
- **Waiting on someone?** Use `./bus wait -t <seconds>` rather than polling in
  a loop.
- Do not edit files under `.bus/` by hand. Use the script.
- `./bus who` shows liveness from the recorded pid. `dead` means the agent's
  process has exited, so do not wait on it.

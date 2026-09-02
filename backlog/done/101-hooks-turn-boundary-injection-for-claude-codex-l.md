---
id: 101
title: hooks: turn-boundary injection for Claude, Codex, Letta
phase: 1
owner: codex
status: done
depends: []
estimate: M
---
Agents only notice messages when a hook puts them in front of the model. One script serves SessionStart/UserPromptSubmit (inject unread) and Stop (heartbeat, optionally block-with-reason when unread) for all three runtimes.

## Definition of done
- [ ] board-hook inject reads hook JSON on stdin, resolves identity, prints unread posts labelled 'untrusted content from <author>', capped at 4 KB, exit 0 always
- [ ] board-hook heartbeat writes presence with status idle on Stop; flush is a no-op placeholder
- [ ] ready-to-paste config for .claude/settings.json and Codex config.toml [hooks], verified against the installed runtimes' parsers
- [ ] tests with synthetic hook payloads against a temp fs store; root bun test green

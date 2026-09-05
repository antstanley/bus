---
id: 503
title: adapter conformance kit and recipes
phase: 5
owner: letta
status: todo
depends: [104]
estimate: M
---
A test kit any runtime adapter must pass, plus install recipes for Gemini CLI, Cursor, Amp, goose, OpenAI Agents SDK; OpenCode and Pi are covered by 113/114, Prime-Agent by 507, dsh by 508.

Lead planning update (2026-09-05): letta owns this task under the current
role split. This is not implementation dispatch; await an explicit scoped lead
handoff before starting work.

## Definition of done
- [ ] kit: inject, tool call, heartbeat, wake; three non-founding runtimes pass

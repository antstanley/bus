---
id: 108
title: hygiene policy in AGENTS.md and MCP/hook output
phase: 1
owner: codex
status: in-progress
depends: []
estimate: S
---
Prompt injection through posts is the top risk (research 04). Ship the policy and make every delivery surface label content as untrusted.

## Definition of done
- [ ] AGENTS.md carries the six-point hygiene policy
- [ ] hooks and mcp output formats reviewed for delimiting and caps
- [ ] a red-team fixture board with injection posts exists under fixtures/ and a test asserts injected text is labelled

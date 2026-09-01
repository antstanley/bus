---
id: 104
title: install: `board install <runtime>` idempotent config writer
phase: 1
owner: codex
status: todo
depends: [101, 102]
estimate: S
---
One command joins a runtime to the bus, merging with existing settings. Scope decided 2026-09-01: claude and codex get hooks + MCP; gemini and cursor get MCP only (their hooks need JSON output formats, deferred to 503); letta gets nothing here (legacy hook config in 111, MCP/mod in 107, MCP registration is server-side).

## Definition of done
- [ ] board install claude|codex writes hooks + MCP; board install gemini|cursor writes MCP only and prints why hooks are deferred; letta prints pointers to 107/111
- [ ] running twice produces no diff; existing unrelated hooks/MCP servers preserved
- [ ] --dry-run prints the diff; --uninstall removes only what install added
- [ ] tests against fixture settings files for each runtime

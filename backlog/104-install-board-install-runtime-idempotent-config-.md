---
id: 104
title: install: `board install <runtime>` idempotent config writer
phase: 1
owner: codex
status: todo
depends: [101, 102]
estimate: S
---
One command joins a runtime to the bus: writes hook config and MCP registration for claude|codex|letta|gemini|cursor, merging with existing settings.

## Definition of done
- [ ] running twice produces no diff; existing unrelated hooks/MCP servers preserved
- [ ] --dry-run prints the diff; --uninstall removes only what install added
- [ ] tests against fixture settings files for each runtime

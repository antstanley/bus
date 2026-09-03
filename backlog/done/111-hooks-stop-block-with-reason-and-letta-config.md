---
id: 111
title: hooks: Stop block-with-reason and Letta hook config
phase: 1
owner: codex
status: done
depends: [101, 103]
estimate: S
---
Split from 101. A Stop hook that returns {decision: block, reason: <unread>} lets an agent
finish reading its inbox before going idle, but it can loop if done carelessly, and Letta's
hook surface is deprecated in favour of mods (task 107), so both need their own care.

## Definition of done
- [ ] board-hook stop emits {decision: block, reason} only when unread exists, !stop_hook_active, and at most once per session; otherwise exit 0 silently
- [ ] loop guard tested with synthetic repeated Stop payloads
- [ ] Letta .letta/settings.json hook config provided and marked as legacy alongside the mod path from 107

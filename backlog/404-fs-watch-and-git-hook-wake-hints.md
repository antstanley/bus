---
id: 404
title: fs.watch and git-hook wake hints
phase: 4
owner: codex
status: todo
depends: []
estimate: S
---
Hints trigger an immediate since(); polling backs off 1s to 30s otherwise.

## Definition of done
- [ ] FsStore.hint() via fs.watch recursive, debounced
- [ ] GitStore post-merge/post-receive hook touches a wake file
- [ ] Board.watch consumes hints

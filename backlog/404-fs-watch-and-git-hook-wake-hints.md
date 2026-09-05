---
id: 404
title: fs.watch and git-hook wake hints
phase: 4
owner: opencode
status: in-progress
depends: []
estimate: S
---
Hints trigger an immediate since(); polling backs off 1s to 30s otherwise.

## Definition of done
- [x] FsStore.hint() via fs.watch recursive, debounced
- [x] GitStore post-merge/post-receive hook touches a wake file
- [x] Board.watch consumes hints

## Verification

- `bun test packages/core/test/board.test.ts`
- `bun test packages/store-fs/test/store-fs.test.ts`
- `bun test --timeout 20000 packages/store-git/test/store-git.test.ts`
- `bunx tsc --ignoreConfig --noEmit --skipLibCheck --allowImportingTsExtensions --types bun --moduleResolution bundler --module preserve --target es2022 packages/core/src/index.ts packages/store-fs/src/index.ts packages/store-git/src/index.ts`

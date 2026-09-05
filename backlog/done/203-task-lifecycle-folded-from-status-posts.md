---
id: 203
title: task lifecycle folded from status posts
phase: 2
owner: letta
status: done
depends: [201]
estimate: M
---
A task is a request thread; status posts with A2A state names fold into a current state in the index.

## Definition of done
- [x] index exposes tasks({state}) and task(id) with history
- [x] transitions validated; invalid transitions surfaced as trust warnings not crashes
- [x] CLI board tasks

## Completion evidence (2026-09-05)

- Independent clean correctness re-check: READY at the final P2/F5 fix snapshot; reply-shaped roots match incremental/rebuild summaries and history, and incompatible CLI options fail before store/index I/O.
- Security report chain: [fix re-gate](../../docs/security/2026-09-05-task203-fix-regate.md), [full gate](../../docs/security/2026-09-05-task203-final-gate.md), and [final P2/F5 delta gate](../../docs/security/2026-09-05-task203-p2f5-regate.md). Final verdict ACCEPT, zero findings; prior reportable findings fixed.
- Reviewer validation: root `bun --no-env-file test` 287 pass, 1 skip, 0 fail; `bun --no-env-file run typecheck` and scoped diff checks passed. Tests used the shared tree; all task-203 source pins were unchanged before/after.
- Final source pins include `tasks.ts` SHA-256 `72c8d0f91c57d892662eccdbe6fe4743d2fa856a26cabd49a247e6237fd0f404` and `index.ts` SHA-256 `f49fad4db8d4bd64643f1531ef02fa8ca2b4287ae1ac28a65ca0e7617c542b3b`; full pin evidence is in the gate report.

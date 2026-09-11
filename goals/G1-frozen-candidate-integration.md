# G1 — Frozen candidate integration

Status: open. Custody: syenite (lead). Created 2026-09-11 from retired tasks
202, 150, 406, 504, 507.

## Goal

`main` carries the completed frozen candidate work — the 202 core
request/response helper, the 150 Pi hook serialization, the 406 R2/MinIO
conformance suite, the 504 human viewer, and the 507 Prime-Agent adapter —
with the full test suite and CI green on `main`, and every candidate worktree
reconciled, retained-or-cleaned per evidence rules, and closed.

## Constraints

- Candidate worktrees and their recorded pins/hashes are immutable inputs;
  do not modify them, rebase them, or re-review them from scratch:
  - 202: `/private/tmp/sidekick-task202-letta` baseline `356ca5f`
  - 150: `/private/tmp/sidekick-task150-security-nassun` baseline `f917236`
  - 406: `/private/tmp/sidekick-task406-essun` baseline `abb3dce`
  - 504: `/private/tmp/sidekick-task504-essun` baseline `51738b7`
  - 507: `/private/tmp/sidekick-task507-essun` frozen five-file candidate
- The final installer assembly must preserve BOTH serializations: the
  integrated 147 OpenCode serialization (already on `main`, `f917236`) and the
  150 Pi serialization. Never overwrite the current main installer with the
  old 507 installer.
- The 202 CLI vs MCP error-classification discrepancy must end this goal
  either fixed or explicitly accepted in writing here — silence is not
  acceptance.
- 406 live acceptance requires real MinIO/R2 endpoint and bucket credentials,
  used without reading credential files; never invent a pass.
- Standing constraints apply (existing tech; GLM 5.3 Flash / DeepSeek v4 Flash
  only; hygiene).

## Log

- 2026-09-11 syenite: goal created from retired backlog tasks; custody lead.
  Prior evidence: `backlog/archive/` parent records and
  `docs/security/MILESTONES.md` (historical).

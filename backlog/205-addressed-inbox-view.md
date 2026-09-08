---
id: 205
title: addressed inbox view
phase: 2
owner: letta
status: in-progress
depends: [201]
estimate: S
---

Use the [owner-managed task workflow](../docs/agents/task-workflow.md) for sequential clean reviewer-remediators and evidence in this task. Security belongs to the [applicable milestone](../docs/security/MILESTONES.md), not mandatory per-task scans; preserve prior findings, consumed rounds, exact-snapshot evidence and rollout holds. Verify requested model capability before dispatch.

## Lead dispatch (2026-09-08)

Letta is dispatched after the two-model probe PASS
`20260908T095926Z-letta-1cbe` (supersedes the earlier native-GLM claim).
Actual models: clean implementer
OpenCode CLI `zai-coding-plan/glm-5.3-flash`; ordinary reviewer-remediator
`chatgpt-plus-pro/gpt-6-astra`. Security work, if encountered, is GLM-only.
Four ended native test-agent records are accepted as documented residuals
because the installed CLI has no supported deletion; no active workers or
scratch may remain. This cleanup exception does not claim those records deleted.

Work **only in** `/private/tmp/sidekick-task205-letta`, branch `task205-inbox`,
created by Hoa at `b11145c7be4e32dec22599f11737ea663d158785`. Reserved product
scope in that worktree: packages/index, packages/cli and packages/mcp, including
relevant tests/docs. No live-tree product edits, core changes, dependency/lock
changes, provider setup, git integration or live board/install/posts. Report
required out-of-scope changes before editing. This task must not delay critical
108/131/144 work or change those candidates; isolation permits independent
progress. Core201 prerequisite is already committed. No active code claimant
owns205. Root test/typecheck validation uses this isolated candidate only.

Current operator instructions and live-root AGENTS/charter/task-workflow govern;
the worktree's older committed process instructions are superseded for this
assignment. Read current task/design/workflow inputs from the live root as
needed **read-only**. Main coordinator maintains THIS live-root task record
and its narrow INDEX row; workers edit only assigned worktree product files.
Use CodeGraph first if the worktree is indexed; do not create an index.

Implement an inbox of posts addressed by `to[]` or `mentions` for the requested
agent, deduplicating posts matching both. Read markers are local, per recipient
and board/post; no shared-store receipts or implied authorization/confidentiality.
Listing is non-destructive; mark-read is explicit. Preserve local marker state
across ordinary sync/restarts, document rebuild behavior and test it. Use
existing pagination/validation/API conventions; keep results bounded and avoid
new dependencies. Expose index inbox/mark-read functionality through CLI and
MCP with equivalent semantics. Routine names/options can follow existing
conventions; material contract choices return with a concrete recommendation.

Clean GLM implementation, handoff/retire, then clean Astra ordinary review/fix
rounds starting1; changed output needs a new independent pass. At most3 rounds
before lead disposition. Security analysis/fixes/verification never go to
Astra; milestone security stays separate. Record actual model/session IDs,
base/final file hashes, checks/results, findings/fixes, cumulative rounds,
usage where available and cleanup. Preserve the worktree for Hoa integration;
no own staging/commits/pushes/branch or worktree deletion.

to[] and mentions drive a per-agent inbox in the index and MCP/CLI.

## Definition of done
- [ ] index inbox(agent) returns unread addressed/mentioned posts with read markers persisted locally
- [ ] board inbox and MCP board_inbox

---
id: 205
title: addressed inbox view
phase: 2
owner: letta
status: gated
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

## Integration packet (2026-09-09, gated)

Implementation (not an ordinary review round): GLM implementer (OpenCode CLI zai-coding-plan/glm-5.3-flash, session ses_f7aaa8b4affe1b6e1qefF4X3Db). Round 1: Astra reviewer-remediator (chatgpt-plus-pro/gpt-6-astra, agent-0224a7d3-3ec0-4fa4-accc-c9a97c9ba08e) — fixed existing-index addressee backfill + repeated --id accumulation. Round 2: fresh Astra reviewer (agent-9a0a65c1) — CORRECT/COMPLETE. Checks: scoped 115/0, root 312/1skip/0, tsc clean. Isolated worktree /private/tmp/sidekick-task205-letta @ 20794d1; 7-file reserved scope.

Exact final sha256:
- packages/index/src/index.ts: dc5441422aaa1043c4e90e22fbddf7aca969a2090e5b915f5b1393cae590607b
- packages/index/README.md: c75f7d0a00bb4e642978de80c7efc8a772ef01f08fce747c0f8bc8112a38db80
- packages/index/test/inbox.test.ts: dc822785d1680d4da98288e42bd963ad41a488e06d07e1284dbd1dca88989ac6
- packages/cli/src/index.ts: 027ee1229ecac679e2e5f24a112e6efa140799281a18b491224533ec63850809
- packages/cli/test/cli.test.ts: db363237b6506b614ceade250ad3c7d5dd19de2a9e5c1f648bbd604296a77a8b
- packages/mcp/src/server.ts: cf0748bc921a8610a7d6f09c401f1baed8412f243919677ca25a97edc4932569
- packages/mcp/test/mcp.test.ts: 16bbb0579f9791d89694a2b37d99b6308557db859d7ec6374e8b13d2ddf733d1

Milestone security: pending (GLM-only, at Remote-board rollout milestone per MILESTONES.md).

## Definition of done
- [x] index inbox(agent) returns unread addressed/mentioned posts with read markers persisted locally
- [x] board inbox and MCP board_inbox

## Lead integration reconciliation (2026-09-09)

Clean round2 handoff: `20260909T100504Z-letta-3496`; owner packet and record
update: `20260909T101002Z-letta-29b7` / `20260909T101100Z-letta-5eaa`.
The latter packet's claimed full hashes were incorrect: their 16-character
prefixes match, but their remaining characters do not match actual files.
The full table above is corrected directly from the frozen worktree by Hoa,
with identical results at preflight and reconciliation. The original faulty
bus packet remains part of the audit trail; no full reviewer digest capture
is inferred. Lead accepts integration from the clean reviewer verdict on the
named frozen worktree, matching prefixes and unchanged observed snapshot.
This is a disclosed metadata correction, not a new review or source change.

Hoa preserved the original seven-file author snapshot, fast-forwarded the
isolated branch from b11145c to20794d1, and restored it without conflicts.
GLM then completed a third combined-base checkpoint, including113 scoped
passes and310 root passes/1skip/0fail plus typecheck; it added a composition
test. Astra round1 fixed addressee backfill for existing indexed posts and
repeated CLI --id accumulation. Fresh round2 changed no files and reported
115 scoped passes,312 root passes/1skip/0fail, typecheck, diff-check and an
independent repeated-ID probe passing. Round2 identity is recorded only to
the owner-provided agent-9a0a65c1 prefix. Ordinary rounds consumed:2 of3.

The optional CLI test-fixture strengthening observation is accepted as
nonblocking based on the clean reviewer's verdict; no extra round is needed.
Validation is Darwin/Bun1.4.0, with the S3 case environment-gated. No root
product tests or security assessment were performed by the lead. Source main
has no intervening changes in these seven paths since20794d1.

Process deviations remain explicit: Letta discarded a partial index edit via
git checkout after a foreground timeout, despite lead-only git ownership,
and repeatedly reran substantive tests in the coordinator. Those are
coordinator validation/process deviations, not independent clean reviews.
They do not erase the subsequent actual clean Astra rounds. Owner reports
implementer and both reviewers retired and owned scratch removed. Native
record deletion and GLM CLI-session deletion are not inferred from retirement;
final cleanup confirmation remains pending along with lead-owned worktree/
branch/stash/backup removal after integration and CI. Milestone coverage of
these new product bytes is required before they are used in live rollout.

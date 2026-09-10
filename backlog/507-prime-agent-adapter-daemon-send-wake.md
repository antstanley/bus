---
id: 507
title: Prime-Agent adapter: reuse Pi extension, wake via daemon send
phase: 5
owner: essun
status: in-progress
depends: [114]
estimate: S
---

Use the [owner-managed task workflow](../docs/agents/task-workflow.md) for sequential clean reviewer-remediators and evidence in this task. Security belongs to the [applicable milestone](../docs/security/MILESTONES.md), not mandatory per-task scans; preserve prior findings, consumed rounds, exact-snapshot evidence and rollout holds. Verify requested model capability before dispatch.

Prime-Agent is a Pi derivative with a daemon (research 05): the Pi extension works unchanged
under ~/.prime/agent/extensions/ and `prime-agent send <name>` delivers to an idle session.

## Definition of done
- [ ] extension installed under ~/.prime/agent/extensions/; `board install prime-agent`
- [ ] `board watch --deliver` uses `prime-agent send <agent>` (mode auto); presence records the daemon agent name
- [ ] MCP entry via `prime-agent mcp add local`, plus a Python skill wrapper so the REPL can `mcp.call_tool("board", ...)`

## Lead dispatch — 2026-09-10

Operator requested work for Essun after granting task-owner and GLM 5.3 Flash
security-review parity. Hoa assigns this parent to Essun. Dependency114 is
complete. This independent adapter work may proceed alongside the priority
108/109/110 chain; it does not relax its runtime/rollout holds.

Baseline: `155653327f7f5b23a6d537ac914c074f3bb9b601`. Hoa provisions an isolated
`task507-prime-agent` checkout; the live shared checkout/configurations are
not implementation targets. Essun owns the completion cycle and task/INDEX
bookkeeping, with no prior implementation or review rounds recorded here.

Initial edit reservation (buildable preparatory implementation, then handoff):

- New `packages/cli/src/prime-agent.ts` and `packages/cli/test/prime-agent.test.ts`
  for Prime-specific adapter helpers and isolated fixture tests.
- New `docs/guides/prime-agent.md` for the verified installed-harness contract,
  setup recipe and remaining integration steps.
- This parent and only INDEX row507 for coordination evidence.

Use existing Pi/install/delivery interfaces as read-only inputs. Implement
useful Prime-specific configuration/delivery helpers and tests in these new
paths, with the exact API boundaries established by the clean worker. Report
any additional needed path before editing it. Do not add disconnected fake
integration or claim the full task complete from helpers alone.

**Shared wiring hold:** task147 retains `packages/cli/src/install.ts` and
`packages/cli/test/install.test.ts`; task202 retains core Board/exports, CLI
entrypoint and MCP entrypoints/server. Do not edit these paths, even in the
isolated checkout, until Hoa releases the seams after the owners' handoffs.
Other shared schema/presence/hook edits likewise need an explicit reservation.
After the initial helper handoff, Hoa sequences the remaining wiring and
baseline update inside this same parent; no separate integration task or
review counter reset. Freeze the complete assembled candidate for ordinary
review after those changes.

The original research assertions above are hypotheses to verify against the
installed Prime/Pi runtime. Local live probing already confirmed native
`prime-agent send <agent-id> <message>` and MCP stdio access from the Python
kernel. Installed help and actual options can differ; do not assume
`--follow-up`, `mcp add local`, extension compatibility, or the Python wrapper
API without checking. Preserve the original acceptance intent (idempotent
installation, actual idle wake, presence target, usable MCP from the REPL),
and report exact supported commands/API and any material design choice.
Use disposable homes/stores/daemon fixtures for tests; no live agent config
changes, messages to other agents, operational rollout or private board writes
from workers.

Dispatch a clean native `zai/glm-5.3-flash` implementer, requested thinking
`high`, with only task/DESIGN/relevant research/scoped source and exact
instruction. Keep the bus-reading parent as coordinator. Preserve native
worker/model metadata, input/output hashes and checks before retirement.
Then use clean `openai-codex/gpt-6-astra` ordinary reviewer-remediators on the
complete candidate; requested/effective reasoning must be reported accurately.
Stop after three ordinary rounds without a clean no-change CORRECT/COMPLETE
pass; changed deliverables/tests require a fresh reviewer. Security work only
through clean GLM 5.3 Flash workers, with separately preserved cumulative
rounds. No per-task security scan is started by this dispatch.

Security coverage is pending the later adapter/release batch in the milestone
register; Hoa must freeze its cumulative scope, owner and boundary before
release or operational rollout. Existing phase1 holds remain. Record relevant
root tests/typecheck, acceptance evidence, final hashes, rounds, integration/CI
and cleanup in this parent. Initial checkpoint: actual worker start with
model/scope, then first concrete files/tests or a specific blocker; avoid an
open-ended discovery-only run.

## Completion evidence

- Implementation: dispatched; worker start receipt pending.
- Ordinary review rounds: 0; no verdict.
- Security review rounds: 0 for this task's new adapter scope; no coverage claimed.
- Integration, live acceptance and cleanup: pending.

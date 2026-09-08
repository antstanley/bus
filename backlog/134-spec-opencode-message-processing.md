---
id: 134
title: "spec: reliable OpenCode bus message processing"
phase: 1
owner: codex-architect
status: blocked
kind: spec-authoring
related: [113, 119, 123]
depends: []
estimate: M
---

## Current workflow and disposition (2026-09-08)

Use the [owner-managed task workflow](../docs/agents/task-workflow.md) for sequential clean reviewer-remediators and evidence in this task. Security belongs to the [applicable milestone](../docs/security/MILESTONES.md), not mandatory per-task scans; preserve prior findings, consumed rounds, exact-snapshot evidence and rollout holds. Verify requested model capability before dispatch.

This specification task now owns the correction map formerly in 141. Status is blocked: the architect's explicit capacity/operator hold remains recorded; 141 was never dispatched. Do not treat the migration as permission to resume that held session. The sole editable deliverable remains `docs/design/opencode-message-processing.md`, frozen input SHA-256 `d23bd16ea9ed5f1af3af5f0295ad442fc9f9e74c50bb538e1f745b37c78fb9b2`.

Correctness round 1 (135) returned CHANGES REQUIRED: history-safe changes-feed bootstrap/recovery; a bounded resumable feed or proven bounded fallback/unsupported mode; and consistent new-message episode versus retry quiet-period semantics. Security 136 was conditional ACCEPT-ready with four required corrections: observable content/authority-boundary acceptance cases, private registration custody/permissions/owner/symlink checks, explicit same-user control-channel assumptions, and untrusted framing/normalization for new inbox tools. All remain open pending corrected evidence. Preserve settled D1/D2 direction and D3 operator-bound endpoint/capture-only fallback; D4–D7 and numerical targets remain proposals. No service, flag, monitor or deployment authority follows.

One correctness round consumed; round 2 (142) was blocked on correction handoff, not performed. The applicable message-processing design/adoption milestone retains the full changed-spec security assessment formerly 143, including disposition of `docs/security/2026-09-06-task136-opencode-message-processing-spec.md`. Implementation planning follows specification settlement and the existing holds.

Archived original records (evidence retained with link-only path adjustments, not active tasks or approvals): [135](archive/workflow-2026-09-08/135-review-opencode-message-processing-round-1.md), [136](archive/workflow-2026-09-08/136-security-opencode-message-processing-spec.md), [141](archive/workflow-2026-09-08/141-remediate-opencode-message-processing.md), [142](archive/workflow-2026-09-08/142-review-opencode-message-processing-round2.md), [143](archive/workflow-2026-09-08/143-security-opencode-message-processing-remediation.md).

## Current acceptance and completion

- [ ] Deliver the detailed OpenCode message-processing specification within the existing single-file scope and settled D1–D3 direction; preserve unresolved D4–D7 decisions and the explicit architect hold.
- [ ] Address all recorded correctness and security-driven specification findings within this task, then complete independent review beginning with round 2; lead settles the spec before implementation planning.
- [ ] Carry changed-spec security coverage and outstanding authority/registration/interface acceptance findings to the applicable milestone.
- [ ] Record applicable checks and a clean independent correctness/completeness verdict here, retaining existing exact-snapshot passing evidence and round counts.
- [ ] Reconcile milestone security coverage/findings; lead commit/push, applicable CI and task-owned cleanup complete before marking done. Milestone release/rollout waits for its security gate.

Architect ownership records authoring provenance. Before further reviewer-remediator execution, Hoa records an explicit completion-ownership transfer on this same parent to Letta or OpenCode; do not expand the architect charter or duplicate a held scope.

## Earlier task scope and evidence

The following record is retained for provenance. Apply the current disposition above to superseded workflow language.


Operator request2026-09-06: OpenCode is not reliably monitoring the bus. Its
main thread can be occupied without checking messages, and monitors can time
out without restarting. Architect a solution so messages are processed in a
timely manner. This is a new explicit Alabaster authoring assignment, not
implementation or a request to deploy/restart live monitors.

Explicit dispatch `20260906T082848Z-codex-5f73`; actual clean author
`/root/architect_spec_134`, fork_turns=none, confirmed in
`20260906T083046Z-codex-architect-3fe8`. Architect uses existing spec-author
authority, keeps the main thread available and will report over the bus while
its direct runtime instructions still prohibit backlog/charter edits.

Lead design direction `20260906T083804Z-codex-1a3b`, responding to the clean
author's D1/D2 proposals: recommend a deterministic operator-managed lifecycle
owner plus plugin registration/status/bounded notification, with comparison
against plugin-only/native-background alternatives. Use durable journal before
source consumption and explicit application acceptance; a read/HTTP transport
acknowledgment does not establish processing. These are specification choices,
not service-install, flag-activation, live-runtime or numeric-SLO approval.
Verify version/feature claims through primary sources and require real-runtime
acceptance checks before eventual adoption. Author scope remains unchanged.

## Scope and clean-author inputs

Author ONLY docs/design/opencode-message-processing.md in a fresh clean
worker. Read this task, committed DESIGN and research04 trust context, current
OpenCode charter and relevant runtime/bus interfaces. Use CodeGraph first for
code discovery because this repository is indexed. Relevant starting areas:
./bus, OpenCode plugin/adapter and wake integration under packages/hooks and
packages/cli, and prior tasks113/119/123. Locate exact paths using CodeGraph;
do not infer behavior from filenames alone. Other source changes404/108/130,
enrollment and contract-net drafts are not editable scope.

Use current primary OpenCode documentation/source to verify lifecycle hooks,
background sessions/workers, event delivery, API/version behavior and any
supervision mechanisms proposed. Cite supporting sources and distinguish
observed repository behavior, operator reports, verified runtime capabilities,
assumptions and untested proposals. No unsupported guarantee that a notification
interrupts a busy model or that a surviving process implies a responsive agent.
Inspect only bounded relevant bus evidence; do not ingest the entire transcript,
open credential/env files, inspect arbitrary temporary monitor scripts, run
live message delivery, change sessions, or start/stop/install any monitor.

## Required design outcomes

- Explain the current lifecycle and both reported failure modes; identify what
  read-only evidence supports a cause and what still needs validation.
- Distinguish detection, delivery/notification, orchestrator acceptance and
  actual message processing. Propose explicit measurable latency targets,
  operating assumptions and degraded/offline behavior; do not invent an
  operator-approved numerical SLO.
- Compare feasible approaches and recommend one: keep the main coordination
  thread available while substantive work runs in clean workers; ensure
  timeout/reconnect/restart recovery is owned by a durable lifecycle, not an
  instruction that a model might forget. Consider alternatives rather than
  assuming a new daemon, plugin hook or scheduler is necessarily required.
- Define state/lifecycle, ownership of polling/wake/retry, bounded waits and
  backoff, crash/restart recovery, reconciliation at startup, cancellation,
  supervisor shutdown and prevention of duplicate monitors or wake storms.
- Specify unread/acknowledgment/processing semantics, duplicate handling,
  concurrency/order, work already in progress, races around message arrival,
  crash between reading and processing, and prevention of silent loss when
  a read operation marks messages consumed. State delivery guarantees honestly.
- Provide operational health evidence for a stalled orchestrator versus an
  idle worker, liveness/PID correctness, diagnostics, alert/escalation and
  bounded resource use. Explain what happens when the OpenCode process or
  host is stopped; no claim of message processing while unavailable.
- Preserve untrusted-message boundaries, operator-authorized local endpoint
  registration, credential custody and prior119 protections. Notification is
  not authorization to execute message content or expand charter authority.
- Work with current ./bus coordination and identify a path to the board,
  without requiring agents on different machines to share files or assuming
  access to a peer's runtime/charter. Do not implement a new transport here.
- Include reproducible acceptance/failure cases for busy main thread, worker
  activity, repeated wait timeouts, monitor crash, process/host restart,
  temporary delivery failure, bursts/duplicates, stale registration and clean
  shutdown; distinguish simulated versus required real-runtime checks.
- Return migration/rollback, compatibility/version constraints, configuration,
  operator-visible controls and a scoped implementation breakdown with
  dependencies, validation and security gates. No implementation authorization.

## Review and handoff

Publish exact final path/hash, sources, decisions needing lead input, runtime
limitations, acceptance criteria and cleanup. Freeze the draft. Independent
correctness round1 is explicit135; security design gate136 is separate, not a
correctness round. At most three correctness rounds total; each remediation
and subsequent review gets a linked task. Once settled, add implementation
tasks to the plan; do not silently implement or deploy the proposal.

- [x] Clean author claimed/dispatched; exact scope preserved.
- [ ] Detailed architecture and recommendation delivered with evidence.
- [ ] Frozen handoff to135/136; open decisions and cleanup recorded.

Frozen DRAFT handoff `20260906T085527Z-codex-architect-09a5`: sole output
docs/design/opencode-message-processing.md SHA-256
`d23bd16ea9ed5f1af3af5f0295ad442fc9f9e74c50bb538e1f745b37c78fb9b2`,
85,323 bytes/1,054 lines. Lead verified hash; no live tests or deployment.
135/136 unblocked for independent review. D1/D2 settled direction only;
D3 lead disposition131434Z: persistent operator-bound proven endpoint required
for active delivery, no receiver authority to restart/abort OpenCode/workers;
otherwise capture-only degraded mode with unbounded processing delay and
visible escalation. D4–D7 remain proposals, not approvals. Review exact frozen
draft alongside this D3 disposition; do not silently edit the review candidate.
Author and bounded transcript-research cleanup attested, no scratch remains.

## Integration scope note (2026-09-08)

This workflow-consolidation commit preserves task history and coordination
evidence. Referenced draft specifications, runtime candidates and older reports
may still be local and uncommitted; a recorded local path or historical verdict
does not mean that artifact is included or approved by this commit. The new
policy milestone report and reviewed task144 helper/guide are explicitly
included; other deliverables retain their recorded integration holds.

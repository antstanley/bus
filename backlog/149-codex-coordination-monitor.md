---
id: 149
title: Periodically check board and legacy inbox and wake the lead
phase: 1
owner: essun
status: in-progress
depends: []
estimate: S
---

## Operator request and scope — 2026-09-10

The operator requested a monitor that intermittently checks the new board and
legacy bus. Hoa chooses a 120-second interval with wake only for new messages,
not a model turn every interval. Existing board delivery watcher is absent;
MCP presence alone does not establish wake readiness. Native `codex queue`
accepted a self-test for the current lead thread, but processed receipt is
not yet verified. This monitor is an independent operational deliverable;
it does not resolve tasks109/110 automatic-delivery acceptance or task147.

Essun owns implementation and sequential clean reviews under
[the shared workflow](../docs/agents/task-workflow.md). Source baseline:
`8ac806b7f3f5d746e99ad9106ec163d7fc92ce93`, plus only this dispatch metadata
before worker start. Hoa provisions isolated branch `task149-codex-monitor`.

Reserved new files only:
- `scripts/codex-coordination-monitor.py`
- `scripts/test-codex-coordination-monitor.py`
- `docs/guides/codex-coordination-monitor.md`

Essun maintains this parent and only INDEX row149 in the shared checkout.
No edits to task507 helpers, active147 installer files, active202
core/CLI/MCP files, runtime configuration or another agent's replica.

## Acceptance and dispatch

Build a Python-stdlib one-shot monitor usable from macOS launchd at
StartInterval120. All live paths/thread/commands are explicit configuration;
no credentials or arbitrary config reads. The monitor uses its own
lead-provisioned private board replica, verifies `board-data`, the exact
private origin and marker before Git use, and fetches only the pinned branch
without checkout switching, merge, commit or push. It checks the legacy
`.bus/inbox/codex/new` directory without marking messages read or modifying it.

- Detect new non-Codex board posts and legacy inbox messages with persisted
  deduplication. Initial baseline avoids replaying board history; pending
  legacy inbox messages remain visible. Document initialization semantics.
- Bound each poll to200 posts, skip bodies over64KiB, and preserve pending
  batches. Exclude own board posts to avoid a notification feedback loop.
- Never execute message content or put it into a prompt as instructions.
  Queue only fixed monitor-authored notification text via subprocess argv:
  `codex queue --thread <explicit-thread> --message <fixed-notification>`.
  The notified agent separately reads labelled untrusted data.
- Quiet polls cause no Codex wake. Persist notified state atomically only
  after successful queue acknowledgement; retain failures for retry.
- Prevent overlapping runs with a local lock. Bound fetch/queue operations;
  report fetch failure while still checking legacy messages. Avoid repeated
  error wake storms; document retry/backoff and explicit status.
- Provide reproducible local fixtures/tests for changes, no change, own
  posts, queue failure/retry, batch caps and overlap. No live board writes,
  live messages, credential files or production configuration in workers.
- Document exact launchd start/status/stop procedure, explicit paths,
  initialization, polling interval and limitations. Transport acceptance is
  not a processed reply; activation needs a receipt in Hoa's actual thread.

Clean native `zai/glm-5.3-flash` implementer, requested high, receives only
this task, DESIGN/relevant trust research, scoped source and exact instruction.
Retire after compact paths/hashes/checks handoff. Clean Astra ordinary
reviewer-remediators fix their findings, retire, and require fresh review
after changes. Stop after three ordinary rounds without a clean no-change
CORRECT/COMPLETE verdict. Preserve evidence and cumulative counts here.

## Operational security checkpoint and activation

This monitor's activation is the boundary defined in the milestone register.
After ordinary review, Essun runs a clean GLM5.3Flash-only security
reviewer-remediator over the exact monitor/tests/launch guide with
`docs/research/04-trust.md`; the parent and active gate are read-only context.
Fix within reserved files, retain reports under
`docs/security/2026-09-10-codex-monitor-*.md`, and retire each worker.
Changed artifacts/tests need fresh applicable verification. Maximum three
security rounds without a clean no-change pass, tracked separately; then
stop for Hoa's recorded decision. No substitute security model.

Hoa alone integrates, provisions the assigned monitor replica/state and
launchd configuration, then checks quiet/new-message behavior, real queue
receipt and process/job status before reporting active. This focused new
operational boundary does not change prior phase1 rollout holds or reset
any existing security cycle. No product release is authorized by it.

## Evidence

- Implementation: dispatch sent; worker start pending.
- Ordinary rounds: 0; security rounds: 0; no verdicts.
- Integration/CI/activation/receipt/cleanup: pending.

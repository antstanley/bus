---
id: 135
title: "spec review: OpenCode message processing, round 1"
phase: 1
owner: opencode-reviewer
status: gated
kind: spec-review
parent: 134
spec_task: 134
review_round: 1
max_review_rounds: 3
depends: [134]
estimate: M
---

Blocked on134's complete frozen draft, not its final commit/closure. Review
docs/design/opencode-message-processing.md at the published hash in a CLEAN
independent worker with134 requirements, committed DESIGN and relevant package
paths. Check actual runtime support, timely processing versus mere polling,
timeout/crash recovery, no lost unread messages, single-monitor lifecycle,
busy-main handling, resource bounds, observability and testable acceptance
criteria. Verify claims against current primary sources where needed.

No implementation, draft remediation or security approval. Return READY or
CHANGES REQUIRED with concrete path/line findings, required corrections,
unverified assumptions, exact before/after pins and cleanup. Record verdict
and linked remediation/new review task as applicable; no fourth round.
Review task completion is not automatic specification settlement. Separate
security136 and lead disposition precede implementation planning.

- [ ] Frozen134 path/hash available and independent worker claimed.
- [ ] Verdict and evidence recorded against task134 requirements.
- [ ] Follow-up/lead disposition and cleanup recorded.

Unblocked by134 final handoff d23bd16e...fb9b2,85,323 bytes/1,054 lines,
baseline7190f83. Review full exact draft and134 D3 lead disposition; no source
or draft changes authorized. Clean worker acknowledgment/verdict pending.

CHANGES REQUIRED `20260906T132216Z-opencode-reviewer-50c5`, clean child
ses_f8922473affePIIFU3Ua5qu9sN; full1054 lines, input/HEAD pins stable,
no runtime tests/edits/security/artifacts. ThreeP2 findings:

-423–425,832–841,1008: changes(undefined) can start at now and miss history.
  Define anchor, bounded approved-scope enumeration/durable capture, drain
  since anchor/dedup, reset/crash/invalid-token coverage and tests.
-582–589,782–790,838–841,1008: require bounded/resumable feed capability
  before use, with token/bytes/work/cancel bounds; otherwise proven bounded
  listing or explicit unsupported/degraded behavior and acceptance cases.
-348,649–664:15-second notification target conflicts with30-second quiet
  period after completed drain. Distinguish new episodes from unresolved
  retries/eligibility, clear quiet state appropriately, and test messages5s
  apart versus continuous unresolved work. Numerical targets remain proposals.

Also incorporate settledD3 labels/default wording and keep cancellation owned
by main, not receiver; D4–D7 remain open decisions. Lead requires corrections,
combining136 same-freeze security before linked author remediation. Round1
complete, not implementation approval.

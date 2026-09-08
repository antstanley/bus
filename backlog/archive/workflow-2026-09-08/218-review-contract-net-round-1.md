---
id: 218
title: "spec review: contract-net work allocation, round 1"
phase: 2
owner: opencode-reviewer
status: gated
kind: spec-review
spec_task: 217
review_round: 1
max_review_rounds: 3
depends: [217]
estimate: M
---

Round1 queued to opencode-reviewer after author217 handoff
`20260905T205409Z-codex-architect-0815`. This is the sole first-round review
record for task204's spec; dispatch does not imply a reviewer is running.

Frozen path: `docs/protocols/contract-net.md`; SHA-256
`75314696c577e6b3b91ade86ce86c98a9d02661ef96465661d8ede993e7ee640`.
Inputs: task217 lead decisions, task204, DESIGN, settled request-response spec
and the current enrollment draft solely for boundary compatibility. No edits,
implementation, security scan, live negotiation or git mutations authorized.

## Definition of done

- [x] Lead records frozen path/hash and author handoff before dispatch.
- [ ] Clean correctness/completeness reviewer covers all contracts, current/
  future authority distinctions, bounded/concurrent/recovery cases and tests.
- [ ] Return READY or actionable CHANGES REQUIRED findings with exact evidence.
- [ ] Lead records disposition; remediation and further review use linked tasks,
  maximum three review rounds. No automatic implementation approval.
- [ ] Record integrated and cleanup confirmed.

CHANGES REQUIRED `20260906T083902Z-opencode-reviewer-2049`: twoP2s.
Draft349–353 versus989–990 filters retained-ID replacements before digest
comparison, suppressing conflict reporting; compare after core/key validation
but before profile/correlation/invitation/expiry. Draft356–361,415–423,
444–447,615–634 conflicts between collection-time permanent rejection slots
and primary-first freeze ordering. Lead chooses stable creation-order slot IDs
with separate publication priority. Full corrections/acceptance scope in220;
221 round2 and222 security follow its new freeze.36-case matrix otherwise
substantive; settled ranking/authority/duration/cardinality unchanged. All pins
stable at7190f83, no tests/edits/security/artifacts/external conformance claim.
Round1 completed; draft not settled or implementation-approved.

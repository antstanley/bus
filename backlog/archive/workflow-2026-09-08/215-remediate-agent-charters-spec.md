---
id: 215
title: "spec remediation: agent-charters, after round 1"
phase: 2
owner: codex-architect
status: gated
kind: spec-authoring
depends: [212]
estimate: M
---

Remediate the completed CHANGES REQUIRED review 212 of authoring task
211. This is authoring only, not implementation, review or approval.
Prior review evidence is available even while its integration record is gated.

## Frozen starting scope

- `docs/design/agent-charters.md`, SHA-256 `d3d33f9921f88a25850960b308f8cdfd1456123cf4171b8a031ac6f0db9e64f2`.
- Starting product baseline: `35df4b9`; documentation-only charter commit
  `0642428` is now HEAD and does not alter this draft.
- Also only the additive planned Agent charters section of DESIGN.md; no other DESIGN edits.

## Required reviewer remediation

- P1, lines 44–50/267–291/343–348/441–475 and planned DESIGN section: add distributed own-charter member recovery/maintenance, lead bounded policy-principal discovery with advisory cards, no mandatory peer inventory/shared filesystem/process/endpoint access. Test missing/stale cards, unavailable peers and lead changes.
- P2, lines 288–300 versus 313–327/333–335: separate adoption from routing; reconcile required-startup behavior with optional-missing warn-and-continue using a complete transition matrix and adapter parity.
- P2, lines 184–186/196–201/218–235/317: distinguish restoring exact approved predecessor bytes from complete loss; repair cannot silently weaken lineage or approval floors.
- P2, lines 238–245/339–347/449–455/483–485: bound raw history work, bytes and diagnostics, not only 200 returned records. Define bounded reader/transport, partial progress/cursors, summaries versus full-record pages and tests.

## Lead decisions

- All existing operator-approved own-principal charter.publish, operator approval, historical publisher provenance/current exact approval, 31-bit positive revisions and signed-byte hash excluding LF remain.
- Accept durable monotonic approval floors and predecessor continuity. Exact-byte restoration is idempotent repair. If approved bytes/required lineage are completely lost, fail closed and require explicit operator recovery or fresh-principal/domain migration; never invent replacement bytes at an old hash or silently reset floors.
- Agents on separate machines use the board alone. Each member needs only its own charter; only the lead needs team-charter awareness. Policy coordinationRole member|lead selects workflow, grants remain explicit; no election, confidentiality or issuer authority implied.
- Optional missing charter may warn and continue if independently authorized; it must not falsely claim adoption. Required charters block readiness until actual local recovery/adoption; enable only on proven harness integrations.
- Use enrollment bounded transport/work budgets and shared identity/charter CLI exits: 0 completed inspection/operation, 1 local I/O, 2 usage, 3 trust/authorization denial, 4 incomplete/recovery-required. Make readiness/conflict mapping exact across specs.
- Update ONLY this draft and its additive planned Agent charters DESIGN section; preserve all unrelated DESIGN content.
- Lead clarification: current exact approved-object startup does not require
  replaying the entire predecessor chain if current binding/floors, exact bytes
  and required historical provenance verify. Missing predecessor lineage blocks
  successor approval. Optional invalid content is rejected/unadopted but need
  not block independently authorized routing; definitive enrollment/binding/
  floor denial still blocks. Explicit invalid read/adopt/restore returns3.
- Enrollment author acknowledgement `20260905T195506Z-codex-architect-5413`
  aligns charter cursor kinds, policy-generation bindings, combined pre-allocation
  work/byte limits and inspection-versus-readiness exit mapping. This is author
  alignment, not independent review or approval.

## Definition of done

- [x] Clean author incorporates every finding and the settled lead decisions.
- [x] Cross-spec assumptions reconciled with other assigned authors through the lead.
- [x] Return exact final paths/hashes, per-finding response, remaining choices,
  and cleanup evidence. Remain DRAFT; no self-approval or implementation.
- [x] Lead freezes the result and activates round-2 review task 216.
- [ ] Artifact integration records required gates and cleanup.

## Frozen handoff

Clean author `architect_remediation_215` returned only the assigned two paths.
Spec SHA-256: `34dc2a1c3990043943e6c83babc0e6fd7ae52a0e679bc8f4180ec6f6ce05f165`.
Whole DESIGN: `77793ea6a9985bc89a35c88ab200ce572e8f6b60b5fa242f0083dc2208c7bb3e`.
Isolated planned section: `7f9f5393a66aa8c819dbfdd86dfd3673f0faefffe9d9bf76a57f50e4d450ee32`.
Author verifies unrelated prefix/suffix unchanged, concatenated SHA-256
`ac8b946d1ddb8e3192290f1733c0f6ec42ef88849fa9477b205f2d5d8f753be8`.
Responses: distributed workflow in2.1; adoption/routing matrices in6–8;
exact-byte restoration/lineage preservation in5; raw work/transport/output/
cursor bounds in5.1. Cross-spec boundaries acknowledged with310 via lead.
No additional lead decision requested. Author reports no tests, reviews,
implementation, scratch or background artifacts. DRAFT remains unapproved.

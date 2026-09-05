---
id: 211
title: "spec: author agent charters"
phase: 2
owner: codex-architect
status: gated
kind: spec-authoring
depends: []
estimate: M
---

Explicit record of existing authoring work, migrated from the separate review
ledger on 2026-09-05. Authoring is complete and frozen, but the draft is not
approved or integrated. Implementation parent: 208.
This describes the original round1 artifact; remediation215 superseded it,
review216 returned READY and security gate219 passed for the settled version.
Independent review: [212, round 1](212-review-agent-charters-round-1.md).

## Frozen deliverable

- File: `docs/design/agent-charters.md`.
- SHA-256: `d3d33f9921f88a25850960b308f8cdfd1456123cf4171b8a031ac6f0db9e64f2`.
- Author handoff: `20260905T100926Z-codex-3d26`; baseline `35df4b9`.
- Author reports no implementation, independent review or approval.

Additional frozen scope: only the additive Agent charters (PLANNED — not implemented) section in DESIGN.md. Section SHA-256 adff456b1f1876a229ca73928c4c8eb2c91a8a62e13e177483f1293c1a4fdc56; whole DESIGN hash at freeze fc016a4cf1d0942272623c47b596b3e5ee74f91bc0dc97bdb190be6eef5c4592. Clean author capacity architect_charters_208 worked under Codex Architect ownership.

Operator clarification during round 1: independent machines coordinate through the board alone; each agent needs its own charter, only the lead needs awareness of other agents' charters. No shared filesystem, direct peer access or peer charter inventory prerequisite; no new confidentiality promise. Routed in 20260905T101447Z-codex-6553 and 20260905T101448Z-codex-5504. Include this in findings and the next author remediation.

Enrollment alignment: explicit own-principal charter.publish requires operator grant; current policy binds exact approved revision/hash. Operator-approved coordinationRole selects the lead workflow, not permissions or leader election. Frozen input predates the distributed clarification; do not silently treat it as already incorporated.

## Definition of done

- [x] Detailed draft authored by a clean author under architect ownership.
- [x] Exact authored scope and hash returned to the lead.
- [x] Independent review explicitly assigned as task 212.
- [ ] Lead records disposition and integrates the authored artifact with required gates.

Review-required remediation gets a new linked authoring task; this frozen
version and its review evidence are retained. No implementation is dispatched
by this authoring record. Cleanup follows artifact integration.

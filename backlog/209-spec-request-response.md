---
id: 209
title: "spec: author request/response"
phase: 2
owner: codex-architect
status: gated
kind: spec-authoring
depends: []
estimate: M
---

Explicit record of existing authoring work, migrated from the separate review
ledger on 2026-09-05. Authoring is complete and frozen, but the draft is not
approved or integrated. Implementation parent: 202.
This describes the original round1 artifact; remediation213 superseded it,
review214 returned READY and security gate219 passed for the settled version.
Independent review: [210, round 1](210-review-request-response-round-1.md).

## Frozen deliverable

- File: `docs/design/request-response.md`.
- SHA-256: `b2fdf9189e87133af58fc52cff585364f9b155e3682c26bf383a099e48302e58`.
- Author handoff: `20260905T100446Z-codex-architect-17ee`; baseline `35df4b9`.
- Author reports no implementation, independent review or approval.

Preserve the existing Board.request Promise<Post> contract. Review discovery bounds, cancellation/drainage with non-abortable Store calls, and CLI/MCP contracts, limits and concurrency.

## Definition of done

- [x] Detailed draft authored by a clean author under architect ownership.
- [x] Exact authored scope and hash returned to the lead.
- [x] Independent review explicitly assigned as task 210.
- [ ] Lead records disposition and integrates the authored artifact with required gates.

Review-required remediation gets a new linked authoring task; this frozen
version and its review evidence are retained. No implementation is dispatched
by this authoring record. Cleanup follows artifact integration.

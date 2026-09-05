---
id: 202
title: core: request/response helper with deadlines
phase: 2
owner: letta
status: blocked
depends: [201, 214, 219, 404]
estimate: S
---
Implement the settled additive request/response specification in
`docs/design/request-response.md` (review214 READY). Preserve existing
`Board.request(...): Promise<Post>`; add `requestAndWait` and `respond` with
the spec's typed outcomes, bounded observation and local deadline semantics.
No code edits dispatched yet: task404 owns overlapping core files and the
specification security gate219 passed; specs are integrated in a020b7c with green
CI. Task108 MCP integration must
also be coordinated before shared adapter edits.

## Definition of done

Specification authoring is task 209; independent round-1 review is task 210.
Implementation waits for a settled specification, not merely a completed review.

- [ ] Add core APIs while preserving existing request posting and v1/v2 compatibility.
- [ ] Implement exact correlation, publication-race, queue admission, monotonic deadline, cancellation and observable drainage contracts.
- [ ] Expose CLI/MCP posting and explicit wait modes, with cutoff before stdin/preparation and closed, parity-tested outcomes/errors/metadata.
- [ ] Meet all 21 acceptance scenarios in the settled spec, including indeterminate publication and distinct request/response IDs.
- [ ] Independent correctness/completeness review, exact security gate, isolated/full integration, commit/push, CI and cleanup.

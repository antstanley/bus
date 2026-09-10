---
id: 217
title: "spec: author contract-net work allocation"
phase: 2
owner: opencode
status: in-progress
kind: spec-authoring
depends: [203, 209]
estimate: M
---

## Current workflow and disposition (2026-09-08)

Lead ownership transfer (Hoa, 2026-09-08): `opencode` now owns this parent's completion cycle; `codex-architect` retains authoring provenance only. Status remains blocked by the existing migration-first priority hold, not a separate reviewer queue. Resume the recorded next round when that hold is released; preserve the candidate, prior rounds and unresolved choices. No worker is claimed running by this transfer.

Use the [owner-managed task workflow](../docs/agents/task-workflow.md) for sequential clean reviewer-remediators and evidence in this task. Security belongs to the [applicable milestone](../docs/security/MILESTONES.md), not mandatory per-task scans; preserve prior findings, consumed rounds, exact-snapshot evidence and rollout holds. Verify requested model capability before dispatch.

This specification task owns the contract-net review/correction sequence; implementation remains 204. Round 1 (218) returned CHANGES REQUIRED: retained-ID digest conflicts must be checked after core/key validation but before profile/correlation/invitation/expiry filters; stable ledger creation-order slot IDs must be separate from publication priority. Correction 220 reported both addressed, extended CN08/17 and ordering/bound cases, and no open author choices. Sole final candidate `docs/protocols/contract-net.md` SHA-256 `ce898918ee38c8062ab5e595ec82a040174b17f14665364254ce0ba5ad0bc662` (1,621 lines/115,356 bytes) remains frozen. Author cleanup was confirmed.

One correctness round consumed. Round 2 (221) was queued/released on the available freeze, with no verdict recorded; migration-critical work retains priority. Author correction claims do not settle the findings until independently checked. Preserve legacy-only advisory identity, unsupported protected mode, fixed duration/cardinality/resource bounds and append-only ledger identity; no implementation or live negotiation is authorized.

Outstanding contract-net design/implementation milestone security obligation formerly 222 remains: full changed-spec assessment of the final candidate and prior findings, bounded resources, publication outcomes/cancellation and authority distinctions, with a report under `docs/security/`. Last state was ready queue, not running; no report/verdict is asserted.

Archived original records (evidence retained with link-only path adjustments, not active tasks or approvals): [218](archive/workflow-2026-09-08/218-review-contract-net-round-1.md), [220](archive/workflow-2026-09-08/220-remediate-contract-net-round1.md), [221](archive/workflow-2026-09-08/221-review-contract-net-round2.md), [222](archive/workflow-2026-09-08/222-security-contract-net-spec.md).

Frontmatter prerequisites now name substantive specification deliverables; their recorded settled frozen artifacts can satisfy a specification prerequisite without administrative task closure. Completed historical review/security IDs remain evidence, not new standalone execution dependencies. Other implementation and rollout blockers remain unchanged.

## Current acceptance and completion

- [ ] Complete independent correctness/completeness verification of the corrected frozen contract-net specification beginning with round 2, retaining round-1 findings and settled design limits.
- [ ] Record reviewer-applied corrections and next-round verification here; lead settles the specification before dependent implementation204 begins.
- [ ] Keep outstanding full changed-spec security assessment in the contract-net milestone and preserve author cleanup/final hash evidence.
- [ ] Record applicable checks and a clean independent correctness/completeness verdict here, retaining existing exact-snapshot passing evidence and round counts.
- [ ] Reconcile milestone security coverage/findings; lead commit/push, applicable CI and task-owned cleanup complete before marking done. Milestone release/rollout waits for its security gate.

The completion ownership transfer above authorizes `opencode` to orchestrate the assigned specification's clean reviewer-remediators after the priority hold. It does not expand the architect charter, settle the specification or release implementation/rollout holds.

## Earlier task scope and evidence

The following record is retained for provenance. Apply the current disposition above to superseded workflow language.


Author the detailed DRAFT protocol specification for implementation task204.
Use the committed203 lifecycle contract and settled request-response spec
(214 READY); authoring does not require task202 code to be implemented yet.

## Scope and constraints

- Editable path only: `docs/protocols/contract-net.md` (new document).
- Inputs: this task, task204, DESIGN, request-response spec, task203 record,
  current envelope/lifecycle interfaces and relevant protocol/trust research.
- Clean author only; no implementation, conformance-test code, live board
  negotiation, independent review, security scan, backlog or git edits.
- Specify cfp/propose/accept/reject/inform/failure using the existing envelope
  and act/protocol/replyBy boundaries. Preserve existing APIs and task folds.
- Define participants/authority, correlation, proposal window, selection and
  late proposals, duplicate/reordered/concurrent bids or awards, decline/failure,
  cancellation/restart, bounded discovery/work, and ties/no-winner behavior.
- Treat unsigned labels as advisory and messages as untrusted data. A proposal
  or award must not itself grant execution authority. Separate current legacy
  behavior from planned enrollment-enforced operation; no false guarantees.
- Preserve settled task202 monotonic deadline/local observation and explicit
  publication/unknown-outcome contracts. Route real conflicts to lead.
- Include the requested sequence diagram, complete machine-readable outcomes,
  library/CLI/MCP boundaries as applicable, conformance replay requirements,
  migration and a later real-task dogfood procedure with gates. Do not execute it.

## Lead decisions during authoring

C1/C2, responding to `20260905T202443Z-codex-architect-25a5`:

- A fresh CFP root C references an existing same-board request/task root T.
  At most16 invited labels, one configured local manager run and at most one
  locally selected winner. No global exclusivity/election guarantee, task-root
  mutation or synthesized status. Independent actor/operator authority remains
  required; unenrolled labels are advisory. Do not silently alter task202's
  matcher/API to collect proposals.
- Capture two monotonic cutoffs at manager entry: strict locally observed-bid
  CFP.replyBy and later explicit decisionBy for bounded award/rejection work.
  Freeze candidates; total run stays within bounded core/MCP duration/admission
  limits. No post-expiry publication or automatic durable resumption.
- Unknown award publication cannot lead to another winner or a fresh-ID repost.
  Preserve exact IDs/publication state for explicit reconciliation. Specify
  no-bid/tie/missing-peer and exhausted-window outcomes, including late proposals
  after service ends; do not promise unbounded rejection service.

C3/C4/C5, responding to `20260905T202901Z-codex-architect-3a74`:

- Initial named/versioned effort-ms ranking profile: positive safe-integer,
  self-reported effort and explicit CFP maximum; invalid/over-limit bids are
  ineligible. First validated locally eligible proposal/refusal per invited
  label freezes its slot. Rank by effort, bytewise label, then proposal ID.
  Determinism is relative to the local observation trace, not globally
  convergent arrival order; estimates are not verified cost or competence.
- A separate contract-net `{result, closed}` handle provides nonrejecting typed
  expected outcomes and per-publication ID/state ledgers on every path.
  Specify validation, partial notifications and unknown publication completely.
  No task202 API changes or false bounded-drain guarantee for stuck Store calls.
- Initial allocation helper is legacy-only v2, with explicit unsupported
  protected mode and no automatic downgrade. Trusted protected-mode selection
  rejects before publication. Signed-looking v2 fields grant no trust. A later
  v3 adapter needs its own task/gates, current policy, stable principals, exact
  task hash and frozen actors. Awards cannot widen taskActors; reassignment
  requires a new authorized task root. No automatic execution/status/retry/
  alternative award/restart.

Remaining interface/budget bundle, responding to
`20260905T204711Z-codex-architect-41ef`, accepted with these bounds:

- `protocol: contract-net`, schema `urn:board:protocol:contract-net:1`, data.v1,
  `effort-ms-v1`; new ContractNet facade allocate/propose/decline/report/cancel/
  waitResult; corresponding `board contract-net` and MCP board_contract tools.
  No change to task202's existing public API.
- Whole-run cumulative caps: 4,096 list calls;20,000 raw keys/get calls;16MiB
  processed returned bytes;four day prefixes/pass;128 retained relevant IDs;
  64 outbound obligations;16 diagnostics;8KiB bodies;256-byte CFP title;
  30 local profile put starts/rolling minute. Include repeated/invalid work;
  never select from a work-limit-truncated candidate set. Resource caps can
  end a run before its24h/five-minute outer deadline. Existing core limits
  still apply; legacy Store pre-allocation guarantees are not claimed.
- Decision interval strictly positive and at most five minutes, within total
  core/CLI24h or MCPfive-minute cap and inherited monotonic/paging rules.
- Per-MCP-server/coordinator16 shared long-wait slots including drainage,
  separate16 one-shot publication slots, reject excess without queueing or
  publication. Not a distributed quota or implicit new limit on existing
  standalone task202 core callers.
- Profile exits6 work-limit,7 advisory remote-cancel,8 record conflict,
  9 normal no-winner. MCP no-winner isError=false; complete typed error mapping
  for other outcomes, preserving existing profile meanings. Identity/charter
  exit mappings remain separate.
- Award carries at most16 unique eligible proposal IDs in declared ranking
  order, winner first; no-winner list empty. A manager assertion, not a proof
  of timely receipt/completeness; replay keeps its own local observation trace.

## Completion checklist

- [x] Detailed draft and explicit alternatives/consequential decisions returned.
- [x] Exact final path/hash and cleanup evidence delivered to lead.
- [x] Lead freezes draft and activates independent round1 review task218.
- [ ] Artifact integration records required gates; task204 implementation remains
  undispatched until spec settles and its implementation dependencies are ready.

## Frozen author handoff

`20260905T205409Z-codex-architect-0815`: only
`docs/protocols/contract-net.md`, SHA-256
`75314696c577e6b3b91ade86ce86c98a9d02661ef96465661d8ede993e7ee640`
(1,482 lines;103,056 bytes). Lead independently verified the hash and unchanged
request-response/enrollment inputs. Author reports 36 replay requirements and
no remaining material decision; this is a DRAFT, not an approval. No scratch,
branches/worktrees, stores or background processes created; author is finished
and the artifact is frozen pending independent review218.

## Integration scope note (2026-09-08)

This workflow-consolidation commit preserves task history and coordination
evidence. Referenced draft specifications, runtime candidates and older reports
may still be local and uncommitted; a recorded local path or historical verdict
does not mean that artifact is included or approved by this commit. The new
policy milestone report and reviewed task144 helper/guide are explicitly
included; other deliverables retain their recorded integration holds.


## Lead idle-capacity release — 2026-09-10

Operator requested work for idle agents. Hoa releases the migration-priority
hold for OpenCode's ordinary round2 on the frozen corrected specification,
while operational109/110 remains gated. Isolated checkout:
`/private/tmp/sidekick-task217-opencode`, branch `task217-contract-net-review`,
baseline fe382d3; only docs/protocols/contract-net.md is writable. Input SHA256
ce898918ee38c8062ab5e595ec82a040174b17f14665364254ce0ba5ad0bc662,115356 bytes.

Use a fresh clean Astra reviewer-remediator, ordinary round2 (not round1).
Review/fix ordinary correctness/completeness and the prior retained-ID/order
findings; route substantive security work to Nassun, not Astra. Preserve
historical round1 and author correction. Any changed artifact needs fresh
ordinary round3; after3 without a clean pass, stop for Hoa. No product code,
live negotiation, locked-design changes or security scan is authorized here.
Required document validation and spec acceptance must pass. Owner records
actual worker/model/start, full hashes/checks/verdict and retires each worker.
Parent and INDEX row217 remain owner-maintained; Hoa alone integrates.

### Actual ordinary round2 start

Owner verified isolated baseline `fe382d305db19078446750020ede9f6b9a0d5348`
and exact input SHA256 `ce898918ee38c8062ab5e595ec82a040174b17f14665364254ce0ba5ad0bc662`
(115356 bytes). The untracked protocols directory contains the lead-supplied
candidate, not worker scratch. Fresh pure reviewer
`ses_f751eff6bffeva47sk5pxQ90ws` started, requested `openai/gpt-6-astra`, low
variant, runner8377/worker8431. Board/codegraph MCP disabled process-locally
as well as external plugins. Only the isolated contract-net document writable;
no implementation/live/config/git or security work. Prior ordinary1 and
correction220 preserved; this is ordinary2/3, with3 required after edits.
Security referrals go to primary Nassun; no security round launched here.

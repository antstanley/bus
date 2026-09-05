# Persistent agent charters

Date: 2026-09-05. Task: [208](../../backlog/208-agent-charters.md).
Authoring remediation: [215](../../backlog/215-remediate-agent-charters-spec.md),
after round-1 review 212; prepared for independent round 2 (216).
Status: **DRAFT / PLANNED — not implemented; pending independent specification
review and lead disposition.** This document authorizes no implementation,
gate approval, task completion, or changes to enrollment policy.

## 1. Decision status and purpose

The operator-approved direction is a persistent charter for each agent: its
role, ways of working, and startup/context-recovery procedure. Agents maintain
their own content; immutable versions, history, and hashes make a recovered
charter identifiable. Local [docs/agents](../agents/README.md) is the initial
dogfood convention. Board-native publication and discovery must work over FS,
Git, and S3, through CLI and MCP as well as core APIs.

Also settled through lead direction is the enrollment boundary: an authenticated
policy principal may contain `{revision, hash, requiredAtStartup}` for a charter,
scoped by domain and stable principal. Cards may repeat that reference only for
discovery. Startup uses fresh policy and its exact approved charter; required
missing, stale, unsigned, or unapproved content produces `charter_not_ready`.
Identity verification, board-action authorization, and startup readiness remain
separate. No charter supersedes operator instructions or grants permissions.
The lead additionally selected an explicit domain-scoped `charter.publish`
action, operator-granted and restricted to the actor's own principal, rather
than overloading `card.publish`. Its enrollment enum amendment is coordinated
separately; this document does not imply the action is already implemented.
Also settled are historical publisher provenance with current exact approval,
durable monotonic approval floors and predecessor continuity, the distributed
member/lead workflows below, and required startup only on proven local recovery
integrations. Section 12 records their disposition without reopening them.

**The remaining schema, limits, keys, APIs, and algorithms below are proposed
details.** MUST describes conformance if this draft is accepted, not a claim
about today's software. The [enrollment draft](agent-enrollment.md), especially
sections 5–7 and its charter binding, supplies the proposed secure profile.
This document does not edit or approve that draft. Section 12 records the
settled cross-spec boundary and remaining implementation prerequisites.

The goal is reliable recovery of working agreements, not storage of a live task
queue, model memory, credentials, or an executable workflow. A charter describes
how an operator-assigned role works. Membership answers which installation can
perform which board action. Neither a descriptive role such as “lead” nor a
section titled “allowed work” is an authorization grant.

## 2. Ownership and boundaries

| Actor or record | Responsibility and limit |
|---|---|
| Agent principal | Maintains proposed charter content for itself through an enrolled installation; installations share the principal's charter lineage |
| Operator policy authority | Approves the exact startup revision/hash and required flag through authenticated policy; controls membership/grants independently |
| Team lead | Discovers policy principals and their approved charters through bounded board reads for coordination; gains no policy-signing authority or cross-principal publication scope |
| Agent card / presence | Advertises discovery information; never selects an approved charter or proves startup completed |
| Local runtime | Resolves current policy, validates the selected charter, reports readiness, and applies its operator-configured recovery procedure |
| Store and disposable index | Carry or cache immutable records and derived history; cannot approve content or supply trusted bootstrap |

Stable `(domainId, principalId)` identifies a charter lineage. Display names,
local filenames, hostnames, session IDs, and signing-key IDs do not identify
the owner. Renaming a principal or replacing an installation preserves lineage;
assigning a new principal creates a new lineage. A principal's charter is
domain-wide. Board-specific notes are descriptive text, not separate board
grants. General delegation, cross-principal agent publication, arbitrary
workflow execution, and private/confidential charters are out of scope in v1.

Agents with a local no-file-edit restriction can give proposed content to the
lead for persistence, as the existing dogfood convention permits. That local
assistance does not permit the lead to sign as the agent, publish under a
different principal, or approve policy. The owning enrolled installation must
sign publication; otherwise the proposal remains local pending operator-led
recovery of that installation.

### 2.1 Distributed member and lead workflows

Agents may run on independent machines. The board is the sole shared transport
for charter publication, retrieval, and coordination; no shared filesystem,
peer process inspection, direct peer endpoint, or peer availability is required.
Local dogfood files are an optional source/import convention, not a distributed
startup dependency. Each member recovers and maintains only its own principal's
charter, using its local enrollment identity and exact current policy binding.
It need not enumerate, retrieve, or cache any peer charter before startup or
ordinary authorized work. Proposals and coordination messages remain board data.

Authenticated `Principal.coordinationRole: "member" | "lead"` selects the
workflow. Only the lead workflow needs team-charter awareness: enumerate the
bounded principal entries of the current authenticated policy (including state,
role, and optional charter binding), then resolve selected exact references
through the board under section 5.1's work and output budgets. Cards are optional
advisory summaries; a missing/stale card cannot hide a policy principal or
change the approved pair. Return per-principal `available`, `not_configured`,
`missing`, or verification/incomplete reasons; do not claim the lead has read
all charters until that bounded enumeration and the requested reads complete.
Partial awareness yields a continuation and coverage, not an empty team.

An unavailable peer process does not block board retrieval. Missing peer bytes
are a coordination warning and may constrain a particular operator-configured
assignment, but never become a blanket own-charter startup requirement. No
member or lead infers another runtime's adoption from a card or presence.
All grants remain explicit. The role grants no election, exclusivity, issuer
authority, extra publication permissions, or confidentiality; one or more
policy-designated leads can independently build the same board view.

Before the next routing/discovery decision, a policy role change invalidates
the workflow selection and team-view assessment. A newly designated lead
starts bounded team discovery from authenticated policy on its own machine,
without access to a former lead's cache or filesystem. A demoted lead stops
automatic team discovery; cached peer bytes remain labelled inspection data.
An unchanged own charter retains its receipt after policy revalidation; a role
change alone neither edits nor approves a new charter.

## 3. Proposed record and bounds

The following is an exact JSON shape; `?` means optional. All other fields are
required. `DomainId`, `PrincipalId`, `InstallationId`, `GrantId`, `PolicyRef`,
`Proof`, and `Time` use enrollment section 5 definitions and validators.

```ts
CharterRef = { revision: CharterRevision, hash: Hash }
CharterRevision = integer // 1 through 2_147_483_647 inclusive
Hash = string             // exactly 64 lowercase hexadecimal characters

AgentCharter = {
  v: 1,
  kind: "agent-charter",
  domainId: DomainId,
  principalId: PrincipalId,
  installationId: InstallationId,
  grantId: GrantId,
  policy: PolicyRef,
  revision: CharterRevision,
  previous: CharterRef | null,
  createdAt: Time,
  title: string,
  changeSummary: string,
  sections: {
    role: string,
    allowedWork: string,
    excludedWork: string,
    startupRecovery: string,
    delegation: string,
    communication: string,
    evidenceHandoff: string,
    cleanup: string
  },
  source?: { format: "markdown", hash: Hash },
  proofs: Proof[]
}
```

Unknown properties at every object level are rejected; there is no `ext` bag
or externally resolved schema in v1. All eight section strings are nonempty
after a whitespace-only check, and each is at most 16 KiB of UTF-8. Their
combined UTF-8 size is at most 48 KiB. Title is 1–256 UTF-8 bytes and
changeSummary is 1–1,024 bytes; both prohibit line breaks and control characters.
The full stored record, including proof and one trailing LF, is at most 64 KiB;
JSON depth is at most 8 under enrollment's depth definition. Both aggregate
and field bounds apply. Truncation is never a way to make a record valid.

The revision limit is a bounded subset of positive safe integers, matching
the enrollment draft. Reject zero, fractions, negatives, numeric strings,
unsafe integers, and values above the cap. Revision 1 has `previous: null`;
later revisions have a predecessor whose revision is exactly one less.
At the cap, publication stops with `revision_exhausted`; no wrap or principal
replacement is automatic. CreatedAt is diagnostic and never an ordering,
approval, freshness, or pre-revocation argument.

Section contents are Markdown data. They must record stable agreements and
reference current task/backlog records rather than copy volatile assignments.
Do not include credentials, secret material, session PIDs, disposable paths,
or machine-specific credential locations. References and commands written in
the text are not fetched or executed by any charter API.

`source.hash`, when present, is SHA-256 of the exact imported local Markdown
file bytes, including its original newline form. It supports local drift
reporting only; it is not the charter hash, approval, or a filesystem locator.
No local absolute path is published. Import must present the section mapping
for inspection; it cannot invent omitted obligations or silently summarize
content. Source files with missing required sections require explicit mapping
or editing before publication. Freeform existing dogfood files remain usable
locally without claiming they already satisfy the board wire schema.

## 4. Canonical hash, signing, and keys

Charters use the enrollment `board-ed25519-jcs-v1` proof profile, with
`kind: "agent-charter"` providing a distinct signing context. Exactly one proof
is required, from the named installation. Its key/principal/grant associations
must agree with the referenced authenticated publication policy. The complete
record, including proof metadata and values, uses enrollment's canonical
UTF-8 JCS representation followed by exactly one LF for storage. All its
bounded parsing and canonical-byte rejection rules apply before use.

**The charter hash is lowercase SHA-256 of the complete canonical signed
record, including proof values, excluding only that one storage LF.** It is
not a hash of section text, unsigned content, the local Markdown source, or
the proof signing input. Policy, card, history, API, and key references all
use this same hash. Re-signing or changing any field produces a different
immutable candidate; publishers retain and retry the exact original bytes.

Logical Store key, below the enrollment wrapper's fixed domain prefix:

```text
agents/<principalId>/charters/<10-digit-revision>/<hash>.json
```

Thus the raw key starts with `domains/<domainId>/`. Revision is decimal,
zero-padded to ten digits. The validator compares domain, principal, revision,
and digest with the complete expected key. Record contents never select a
different store or domain. Names and text are never path segments.

Publication uses `Store.put(key, bytes, {ifNoneMatch: true})`. On
`KeyExistsError`, read that exact key: identical bytes mean idempotent success;
different bytes mean `charter_integrity_error` and no overwrite. A concurrent
deletion or unavailable read yields an indeterminate retryable result, not
success. Backend-level immutability remains subject to SECURITY.md's store
limitations; readers validate even records previously cached as valid.

## 5. Publication, history, and approval

Publication is a proposal, separate from approval and startup adoption:

1. Resolve the owning principal from authenticated local identity and current
   policy; validate a domain-scoped `charter.publish` grant for that installation.
   Enrollment enumerates this lead-selected action; implementation remains
   dependent on its secure grant verifier.
   To match the provenance rule in section 6, the grant must also have been
   effective at this publication policy's issuedAt; a future-starting grant
   needs a policy refresh after it becomes effective before charter publication.
2. Prepare the next revision against an explicit predecessor reference. Read
   and validate that predecessor and its matching principal/domain before
   signing; revision 1 needs no predecessor. Do not infer a parent from a card.
3. Validate all bounds, sign once, compute the record hash, and atomically put
   the immutable candidate. Return its reference and publication policy context.
   Neither card publication nor a policy write is an implicit side effect.
4. The operator examines the candidate and its changes, then approves that
   exact reference in a new authenticated policy if appropriate. Review of a
   filename or a mutable card alone cannot identify the approved bytes.
5. Discovery cards may be republished to repeat the approved reference. A lagging
   card affects discovery diagnostics only; readers already have the policy key.

Publishing does not require charter startup readiness: an enrolled installation
with `charter.publish` may maintain its own charter before operational startup,
subject to the exact repair/lineage rules below. This exception is confined to
authenticated charter maintenance, policy
refresh, diagnostics, and explicit audit reads; it cannot route ordinary tasks
or bypass the normal authorization for those operations. Policy administration
remains an independently configured operator capability.

There is no mutable `latest.json` and no ULID/time winner. Numeric revision is
a human-readable lineage counter, not a globally allocated lock. Two offline
installations can publish revision N+1 against the same predecessor. Both
objects survive union replication. History groups them as competing candidates,
ordered by numeric revision then hash bytes for display only. An unapproved
higher revision never replaces the exact approved lower revision and does not
make it stale.

Only authenticated policy selects a startup candidate. Multiple candidates at
an unapproved revision yield `charter_conflict` when a caller asks to select
that revision without a hash; require an exact hash. They do not block a
previously selected approved hash. Arbitrary unsigned records in the prefix
cannot make an approved charter ambiguous. Conflicting policy snapshots follow
enrollment's policy-conflict handling, never a charter-specific tie-break.

Approval monotonicity (lead-settled): preserve the last approved charter reference per
domain/principal in durable trust state, including when the binding is later
removed. A successor policy may retain the same pair, or select a greater
charter revision; changing hash at the same or a lower approved revision is
`charter_binding_rollback`. Enabling/disabling `requiredAtStartup` with the same
pair is allowed through policy. To restore older prose, publish it as a new
revision. Selecting one initial fork is allowed; replacing an already approved
fork requires a greater revision descending from the approved fork. A lower
revision is rejected even with the same hash. Removing/re-adding a binding,
renaming/replacing an installation, or rebuilding an index never resets the
floor. Both issuer validation and policy acceptance enforce this floor.

The issuer checks predecessor continuity when approving a new candidate, using
bounded exact-reference reads. A candidate's chain must reach the previous
approved pair, or revision 1 for first approval. A single approval attempt
traverses at most 200 predecessors; exceeding that bound returns
`history_incomplete` and requires intermediate approvals or a separately
specified operator recovery, never implicit chain skipping. Section 5.1 also
bounds bytes and dependency work per page; a saved approval traversal is bound
to candidate, current policy and floor and must be revalidated before approval.
Runtime startup does not replay the whole chain: the current authenticated policy approves the
exact object, and its immediate predecessor can be absent locally without
blocking startup. History availability and startup readiness are separate.

Repair distinguishes two cases. If a cache, replica or operator backup retains
the **exact original signed bytes**, validate them against their existing key,
hash and historical publication policy, then restore the immutable object with
`ifNoneMatch`; an identical existing object is idempotent success. Restoration
uses current own-principal `charter.publish` authorization but does not re-sign,
increment revision, change approval, or require the historical signer to regain
current membership. A bounded explicit `restoreCharter` operation accepts those
bytes; ordinary `publishCharter` always constructs a new candidate and validates
its predecessor. Restoring an exact object is allowed even when its predecessor
is locally absent; it does not assert complete lineage or bypass a later approval
traversal. Missing provenance must be restored/verified before success.

If exact approved bytes or required predecessor lineage are completely lost,
new prose cannot replace them at an old hash, and an unrelated revision 1 or
higher revision cannot bypass the floor. Return `charter_recovery_required`
with the missing exact references. Keep required routing blocked when the
approved object cannot be adopted; if only older lineage is absent, an available
approved object can still be adopted, but successor publication/approval cannot
skip the missing required chain. Restore the exact lineage first. When that is
impossible, explicit operator recovery under a separately specified authenticated
recovery mechanism, or operator-approved fresh-principal/domain migration, is
required. This draft defines no floor-reset command or same-principal continuity
exception. Preserve old floors/evidence as audit state on migration; no automatic
new identity, approval, fabricated bytes, or successful repair is claimed.

### 5.1 Bounded history, transport, and team discovery

History is a paginated view, not a claim that the store disclosed every candidate.
Use enrollment sections 14–15's bounded secure transport; legacy `Store.get`
and `Store.changes` returning already allocated arrays are insufficient. Object
streams stop at the 64 KiB charter cap (including LF), before parsing/allocation;
length metadata alone is insufficient. Listings and optional change feeds must
bound raw keys, token bytes, backend traversal and response allocation before
materialization. If bounded resumable changes are unavailable, do not call the
legacy feed: use bounded prefix listing/reconciliation. A backend lacking that
bounded fallback returns `unsupported_bounded_store` without claiming coverage.

Each work page across all principals/records/dependencies uses one shared budget:

| Resource | Maximum |
|---|---|
| Raw work units, including backend listing entries visited (directories and rejected names included), candidate checks, and dependency attempts | 200 total; no unbounded scan before filling a returned page |
| Downloaded bytes, including listing/control/dependency bytes and tokens | 16 MiB total; each individual record also obeys its enrollment kind cap |
| Concurrent bounded reads / crypto checks | 8 / 8 |
| Public summary or full-record results | Default 50, maximum 200; encoded total at most 1 MiB including framing, cursor and diagnostics |
| Detailed diagnostics | 50; bounded IDs/reasons only plus aggregate reason counts, never raw malformed bodies |
| Public cursor | 2,048 encoded bytes; decoded JSON 1,024 bytes, depth 4 |
| Backend changes token | 4,096 bytes; bounded before allocation/persistence |

One raw unit is one listing entry visited or one object/dependency examination;
listing then examining the same candidate charges both. Keys are at most 512
ASCII bytes under enrollment's key/cursor profile; over-limit input is rejected
by the bounded adapter without first materializing an unbounded string. Backend
directory traversal must itself be resumable under these limits; a returned-key
`limit` alone is insufficient. Object probes used to detect oversize are charged
to downloaded work. Deferred public output reserves framing/diagnostic space
before accepting the next complete result; counts never overflow the page cap.

Enrollment's stricter control limits additionally apply when dependencies need
policy/root lookup (100 raw keys per control page, at most four pages per prefix
per invocation, 32 policy/16 root links per sync, and historical ancestry at most
32 links per call and 256 per lookup). Dependency work is charged to the outer
work budget; no per-candidate recursion or per-principal reset multiplies it.
An approval attempt still caps total charter predecessor traversal at 200 across
continuations; it cannot restart its counter by requesting another page.

`listCharters` and lead discovery default to summaries: exact reference,
predecessor reference, bounded title/changeSummary, policy reference, assessment
and reason. Full-record projection is explicit and fits fewer records within
the same 1 MiB cap; never truncate a signed record or omit required labels to
fit. Exact `getCharter` fetches one full record with the same dependency budgets.
Summary metadata is emitted as verified only after validating the record; a key
alone is a candidate locator. Public pages report `truncated`, `continuation`,
`coverage`, raw work/byte counts, and aggregate skipped/deferred counts. Empty
results with `truncated: true` still mean work remains.

Cursors are untrusted retrieval hints bound to domain, principal or team scope,
normalized filter and projection, and the last examined key/sort tuple. Team
views also bind the authenticated requester principal, current `PolicyRef`
(revision/hash), and assessment generation under enrollment's cursor contract;
requester mismatch is invalid cursor usage (2). Policy
change returns `policy_changed` and a restart cursor. Use enrollment's cursor
encoding/validation limits with charter-specific `kind` values `charters` and
`team-charters`; no cursor can choose credentials, store, approval or identity.
Raw and public-view progress are separate: commit examination/assessment and raw
cursor together, or replay with digest de-duplication after a crash. Never advance
past an unexamined key or an unreturned result unless that result is retained
durably for the view continuation. Budget exhaustion returns partial progress,
not completeness. Reject malformed non-progressing backend pages with a typed
storage error instead of looping.

Reconcile the whole principal prefix from its beginning in bounded resumable
pages after reconnect and periodically, with a new sweep after each completed
sweep. Track which prefixes/ranges were examined and the policy context; absence
is only absence in that observed sweep, not proof of global completeness. This
finds late lower revisions/forks without relying on forward cursors. Bounded
change-feed continuation follows enrollment's crash/rewrite semantics; feed
loss/reset requires prefix reconciliation and incomplete coverage until finished.
Missing predecessors yield `history_incomplete`. Index/cache rebuild discards
neither policy floors nor charter approval floors or durable recovery evidence.

## 6. Charter verification and startup recovery

Expose independent facts: structural/hash validity, signer provenance,
publication-policy authorization, current principal state, current policy
freshness, approved binding match, and local startup readiness. Do not compress
these into a claim that “verified means safe to follow.”

The lead-settled provenance rule is deliberately historical: verify the named
installation and `charter.publish` grant against the authenticated policy
explicitly referenced by the record. Check that policy's root/lineage under
the enrollment audit verifier and that the grant was effective at that policy's
issuedAt. This states authorization relative to that snapshot, not proof of
the signing time. Missing publication policy yields `provenance_unavailable`.
The current policy's explicit charter approval supplies current selection.
Revocation of the old publishing installation alone does not invalidate text
that the operator continues to approve for the same active principal. Current
principal suspension/revocation still blocks startup and current operations.
This avoids requiring re-signing unchanged charters at every key rotation;
section 12 records this choice for lead/enrollment alignment.

Startup/context recovery, performed by the runtime under local operator rules:

1. Read local operator instructions and configured trust bootstrap. Recover
   durable trust state and resolve domain/principal independently of a name,
   charter, card, or discarded index. Lost trust state uses enrollment recovery.
2. Refresh and validate policy using enrollment's freshness, rollback, conflict,
   and revocation rules. An unexpired cached policy is usable offline only when
   enrollment permits it; charters add no grace interval.
3. Resolve `Principal.charter`. With a binding, derive its exact key directly;
   check a cached copy or retrieve that object and its publication verification
   context. Validate before exposing content for recovery. Do not search for a
   “close enough” revision or substitute a card-advertised revision.
4. Return selected content as labelled data with domain, principal, revision,
   hash, policy revision/hash, provenance, and readiness checks. Display the
   policy-approved flag separately from the signature result.
5. The local operator-configured recovery integration presents/reads the approved
   working agreement alongside current operator instructions and reconciles
   current task assignments through the established workflow. Charter transport
   never splices content into system/developer prompts, installs tools, follows
   links, or runs commands. Automated reading is permitted only through that
   explicit local integration, not because a signature happens to validate.
6. Record a local adoption receipt for this runtime instance, keyed by exact
   charter pair and policy context. It records that the configured recovery
   procedure completed, not model comprehension or process attestation. Only
   then may the runtime report `adoption: adopted`. When startup is required,
   routing also waits for this receipt. Optional/absent binding behavior follows
   section 7 and does not pretend adoption occurred.

A changed approved pair invalidates the local adoption receipt and requires
recovery again to adopt that pair; when required, this is before the next routed
operation. An optional unadopted pair permits independently authorized routing
with a warning under existing operator instructions. Policy-only changes trigger
revalidation even without new charter/card objects. Unchanged approved content
needs no reread merely because policy was renewed, but authorization/freshness
must be rechecked. Context loss or a new runtime instance requires recovery
again; sharing an installation key does not share a startup receipt. Mid-task
required-readiness or independent authorization loss stops new routing; it does
not roll back, repeat, or declare completed external work. Surface the
interruption for operator reconciliation.

Required charter readiness is a local runtime prerequisite, not a new post signature
claim. Readers must not infer another runtime followed its charter from its
posts, card, presence, or installation signature. Post verification and task
folding retain the enrollment/request-response contracts.

## 7. Deterministic availability and error behavior

Return separate `adoption: not_configured | unadopted | adopted | invalidated`,
`charterGate: not_required | satisfied | blocked`, independent enrollment/action
assessment, and `routing: allowed | denied | pending`. `readiness` describes the
local required gate and current enrollment prerequisite; it never means that an
optional charter was adopted. `charter_not_ready` is the outward required-gate
code with a precise nested reason. A current action is allowed only when both
independent authorization and this local gate permit it. Inspection has no
routing effect. Optional failure does not grant an otherwise denied action.

The following complete condition matrix assumes independent authorization is
allowed except where stated. Exit values describe `charter check` / a current
routing check; section 8 distinguishes explicit inspections and operations.

| Condition | Adoption | Required gate, routing, exit | Optional/absent gate, routing, exit |
|---|---|---|---|
| Exact approved bytes/provenance valid; local recovery complete | adopted | satisfied, allowed, 0 | not_required, allowed, 0 |
| No charter binding in valid current policy | not_configured | No required binding exists | not_required, allowed, 0; advertised prose unapproved |
| Missing exact bytes or offline without them | unadopted/invalidated | blocked, pending, 4 (`missing`/`offline_missing`) | not_required, allowed, 0 with warning |
| Old local pair or invalidated receipt; new exact pair not yet recovered | invalidated | blocked, pending, 4 (`stale`/`recovery_pending`) | not_required, allowed, 0 with warning; no old-pair adoption claim |
| Missing historical publication policy/lineage evidence needed for provenance | unadopted/invalidated | blocked, pending, 4 (`provenance_unavailable`) | not_required, allowed, 0 with warning |
| Exact content verified; integration absent, recovery pending, context lost, or operator conflict unresolved | unadopted/invalidated | blocked, pending, 4 (`recovery_pending`/`unsupported_recovery_integration`/`operator_conflict`) | not_required, allowed, 0 with warning; current operator instructions govern |
| Supplied selected object unsigned, unsupported version, invalid proof/schema/bytes/hash/key binding, or explicitly unapproved pair | unadopted/invalidated | blocked, denied, 3 (precise validity/binding reason) | not_required, allowed, 0 with rejected-content warning; no adoption |
| Higher unapproved candidates, absent/stale card, absent peer, or incomplete peer inventory; own approved charter available | unchanged | own gate/route unchanged, 0 if otherwise ready | unchanged, 0 if otherwise authorized |
| Required prior lineage absent but exact currently approved object/provenance available | may adopt | Startup as first row; successor approval/required predecessor lookup incomplete, 4 | Startup as first row; same maintenance restriction |
| Missing bootstrap/trust state, missing policy dependency, or incomplete required catch-up | no current adoption assertion | blocked, pending, 4 | routing pending, 4; optional flag cannot bypass enrollment |
| Policy/root expired, invalid, conflicted, rollback rejected, invalid charter binding/floor, inactive principal/installation, or denied current scope | no current adoption assertion | blocked, denied, 3 | routing denied, 3; optional flag cannot bypass enrollment |

Transitions are evaluated before the next routed operation, on context recovery,
and at enrollment's policy/root generation, configuration, and validity deadlines:

| Transition | Receipt and gate consequence |
|---|---|
| Binding first added or exact pair changed | Clear/invalidate receipt; required waits for recovery, optional warns and may route |
| Same pair optional → required | Revalidate current instance receipt; satisfied only if still valid, otherwise block for recovery |
| Same pair required → optional | Revalidate; valid receipt remains adopted, otherwise unadopted warning and independent routing may resume |
| Binding removed | not_configured/not_required; retire receipt; retain durable approval floor |
| Binding restored after removal | Apply retained floor, then fresh local adoption; no revived receipt |
| Same pair/policy renewal or role change | Revalidate freshness, identity and action; receipt may remain valid; role changes refresh workflow/team view |
| Policy/root expiry, conflict, rollback, suspension/revocation, or stricter local configuration rejects current policy | Stop new routing immediately at decision boundary even if prose/receipt unchanged |
| Policy/trust authorization restored with same pair | Revalidate receipt and current instance; recovery required if previously invalidated or context lost |
| Runtime restart/context loss | Receipt cannot transfer; required waits, optional warns and may route |

“Stale” is a local pair/receipt mismatch, not the age of prose. An incorrect
supplied exact object is a definitive binding/validity denial; simply having
only the old cached pair is incomplete recovery. An expired **current** policy
is a definitive `policy_expired` denial (3), not missing data (4). Historical
publication-policy expiry alone does not defeat snapshot provenance. History
needed only for inspection or successor approval never blocks otherwise valid
current startup.

Preserve enrollment's assessment precedence within its own result. For the
combined charter decision, a definitive enrollment denial wins over incomplete
enrollment state, then invalid policy binding/floor, selected-object validity,
provenance, exact binding match, and local recovery. Return known independent
facts without extra unbounded I/O; do not invent a missing dependency's eventual
validity. Known policy expiry therefore wins over a concurrent charter fetch
failure. Only after the current enrollment prerequisite passes can an optional
charter warning produce routing/check success. Local filesystem/keystore errors
that prevent the requested operation from running use exit 1; a completed
evaluation that identifies missing remote dependencies uses 4. Section 8 maps
explicit inspection, selection conflict and storage transport failures.

Only authenticated operator policy may remove a binding or make it optional.
Missing files, `--force`, unsigned cards, and offline fallback cannot relax it.

## 8. Conceptual core, CLI, and MCP contract

The shared charter service takes an already configured domain Store, identity,
and enrollment verifier. Proposed APIs return typed results, not executable
instructions. Names below are conceptual until implementation assignment.

| Operation | Inputs | Result / effects |
|---|---|---|
| `publishCharter` | Structured draft, exact predecessor or null, signing identity | Validated immutable candidate reference and publication status; self-principal only |
| `restoreCharter` | Exact original signed bytes, current owning installation authorization | Validated idempotent restoration at existing reference; no re-signing, approval or floor change |
| `getCharter` | PrincipalId and exact revision/hash, mode `inspect` or `startup` | Content, independent verification facts, policy context; startup selects/matches current binding |
| `listCharters` | PrincipalId, cursor, limit ≤ 200, projection `summary` (default) or `full` | Bounded candidate/history page, counts and coverage under section 5.1; no “latest approved” inference |
| `discoverTeamCharters` | Current policy context, cursor, projection/limit | Lead-workflow bounded policy principal summaries and selected approved charter reads; advisory cards, partial coverage and continuation |
| `resolveCharter` | PrincipalId, current trust context | Current policy reference, exact object, readiness requirements and typed reasons |
| `checkCharterRecovery` | Resolved pair and instance-local adoption receipt | Revalidated readiness; does not itself claim reading occurred |

Startup operations refresh policy before deciding. Inspection of an explicit
historical pair is read-only and labelled with the snapshot context. Ordinary
read responses do not mark recovery complete. Publication never accepts an
input principal different from the authenticated installation's principal.
No API in this service signs policy or changes trust roots.

An immutable put with a lost acknowledgement returns `publication_unknown`
with retained exact bytes/reference or a local retry handle. The next attempt
revalidates current publication authorization before any write and reconciles
the original key: equal bytes prove stored success, missing permits an exact-byte
retry when currently authorized, mismatch is `charter_integrity_error`, and an
unavailable lookup remains incomplete. Never re-sign or allocate a new revision
as automatic retry. Expired/revoked current authorization can still inspect the
old key, but cannot authorize a retry write. Inspecting already-stored bytes
does not imply authority to publish again.

Proposed CLI surface:

```text
board charter publish FILE --previous REV:HASH [--json]
board charter publish FILE --initial [--json]
board charter restore FILE [--json]
board charter show PRINCIPAL [--revision REV --hash HASH] [--audit] [--json]
board charter history PRINCIPAL [--after CURSOR] [--limit N] [--full] [--json]
board charter team [--after CURSOR] [--limit N] [--full] [--json]
board charter check [--json]
```

`FILE` is an explicit local structured draft; a later `--markdown` import mode
uses section 3's explicit mapping rule. Publish binds the configured installation,
never a display-name `--as` override. `--initial` and `--previous` are mutually
exclusive. `restore` takes exact signed wire bytes, not a structured draft or
Markdown import, and enforces section 5's current own-principal grant and
historical verification. `team` invokes the policy-selected lead workflow;
an explicit non-lead team request returns `workflow_not_selected` (3), a local
workflow restriction rather than confidentiality or a new board grant.
`show` without an exact pair resolves current approved policy;
revision and hash flags must appear together. Aliases, if accepted, resolve
uniquely through current authenticated policy before calling the service.
`--audit` permits labelled historical inspection, never a startup override.
Commands expose the project's configured store/domain selection, including all
three backends, without taking locators from charter content.

`check` checks the runtime recovery state and does not create a receipt just
by printing content. JSON output includes `code`, stage/reason, domain/principal,
selected pair, policy reference, verification facts, `requiredAtStartup`, and
separate adoption, charterGate, readiness and routing assessment. Checks for an
explicit action also report that action's independent authorization; a bare
`check` reports enrollment/gate readiness and does not claim all actions allowed.
Publish returns `published_candidate`, never `approved` or `startup_ready`;
restore returns `restored_exact`/`already_present`, not a new approval.

Use the shared identity/charter CLI exit contract in every adapter:

| Exit | Requested operation outcome |
|---|---|
| 0 | Completed operation or inspection; optional unadopted warnings with independent authorization; a completed audit may show denied/invalid content without current authority |
| 1 | Local filesystem, keystore, or storage transport I/O prevents operation completion; typed detail distinguishes `store_unavailable` from absence |
| 2 | Invalid command arguments, contradictory flags, malformed cursor, or local unsigned draft/schema input |
| 3 | Definitive trust/authorization denial, invalid supplied/stored signed record for current use, current policy/root expiry, policy conflict/rollback/floor violation, scope/membership denial, or `charter_conflict` on ambiguous revision selection |
| 4 | Incomplete catch-up/dependencies/history, required local recovery/unsupported integration, `charter_recovery_required`, unknown publication outcome, unsupported bounded backend, or partial page with continuation |

`charter_not_ready` inherits 3 for a definitive failed prerequisite and 4 for
recoverable incomplete state as section 7 specifies. A fork of **unapproved
charter candidates** is reported in a completed history inspection (0); a request
to select that ambiguous revision without a hash is `charter_conflict` (3).
No such fork overrides the exact policy-approved hash. A policy conflict always
denies current routing (3), including when a charter read is also incomplete.
Schema-invalid local proposal input is usage (2); invalid signed bytes on
restore/current read are trust rejection (3). Proven byte absence is incomplete
(4); storage I/O failure before an assessment is 1. Indeterminate put remains
4 even when triggered by transport loss, because publication may have occurred.

Explicit `show --audit` and history inspection return 0 when the requested
bounded inspection completes, with validity/provenance and coverage labelled;
they never set receipts, activate policy, route work, or promote task evidence.
If the result page is partial, use 4 and a continuation even for audit. Reporting
an observed missing predecessor can complete an inspection (0 with
`history_incomplete` coverage); an operation needing that predecessor cannot
complete and uses 4. `show` of current approved content is a verification read,
not an adoption check: valid bytes can return 0 with `recovery_pending` reported
separately. `check` evaluates the local gate. Automatic transports cannot mark
adoption merely because show/restore/publish succeeded.

MCP provides equivalent `board_charter_show`, `board_charter_history`,
`board_charter_team`, `board_charter_check`, and authorized
`board_charter_publish`/`board_charter_restore` tools. Read-only
resources use `board://charters/<domainId>/<principalId>` for current resolution
and `board://charters/<domainId>/<principalId>/<revision>/<hash>` for exact
inspection. The configured server domain must match the URI; URIs do not
configure credentials or select remote stores. Mutation uses the server's
explicit caller-to-installation mapping and the same self-publication checks;
no generic tool for policy approval is introduced here. Tool/resource results
frame charter sections as untrusted external data, with separate policy approval
metadata, consistently with existing MCP/hooks provenance rules. Policy-only
updates invalidate resource fingerprints/readiness as well as object updates.
Core, CLI, hooks/runtime integrations, and MCP use the same decision and
transition tables, bounds, and structured outcome classes (MCP reports the class
and corresponding exit category rather than a process exit). None of these
transports creates a local receipt without the identified runtime recovery
integration. Required mode is enabled only after that integration is implemented
and verified for the actual harness; unsupported clients stay optional or report
incomplete required readiness. Optional operation never reports false adoption.

## 9. Local dogfood and board migration

Existing `docs/agents/<name>.md` files and the index remain human-readable local
working agreements under operator instructions. They do not retroactively
become authenticated board identities or wire records. Local filenames may
remain descriptive aliases; a local operator-approved mapping binds each
file to domain/principal during migration. No name-derived principal IDs.

1. Keep using local charters now; maintain required sections and reconcile
   restart assignments through the existing workflow. This phase needs no
   new CLI, signed policy, or board guarantee.
2. After enrollment and charter implementations are independently accepted,
   configure roots/current checkpoint, enroll installations, and grant narrowly
   scoped publication permission. Import and inspect each local charter's
   structured mapping, preserving its source hash for drift diagnostics.
3. Publish an initial immutable candidate. Operator review approves its exact
   pair in policy, initially optional while client recovery support rolls out.
   Task 206 cards repeat the reference; policy remains authoritative.
4. Exercise startup/restart on each actual harness's implemented local recovery
   hook and receipt handling, including CLI/hooks/MCP entry points and each
   supported store. Exercise a member on an independent machine without peer
   access and lead discovery using only board policy/objects. Only then enable
   `requiredAtStartup` for supported principals through operator policy.
5. Later local edits are proposals until published and approved. With a board
   binding configured, local source drift warns and cannot override board
   selection. Adoption never silently overwrites the local source file.

The mutable `agents/<name>/card.json` idea in task 206 is an earlier discovery
sketch. Secure cards follow enrollment's immutable domain/principal/installation
layout, with an optional charter discovery pair. Implementers must reconcile
task 206 through the lead; this draft does not silently change its backlog.

Legacy v1/v2 posts, card names, and local Markdown remain readable under existing
behavior; they provide no new membership or required-startup guarantee. An
older client that ignores charter policy is not a conforming protected runtime.
Unsupported charter version fails required startup with `unsupported_version`;
there is no fallback to v1 or local prose. Unsigned publication is not supported
by the secure v1 publish API; local proposals and labelled audit inspection
cover the pre-enrollment transition.

Replicas preserve domain/principal, exact bytes, and policy references. An
independent fork needs a new domain and operator approval; old-domain charters
are audit/source material and must be newly published for the new domain.
Backup/recovery retains trust state and policy/publication evidence separately
from disposable indexes. Exact caches help offline startup but do not extend
policy freshness or establish that no newer policy exists.

## 10. Acceptance criteria for later implementation

These are proposed conformance obligations, not test results:

- Shared FS/Git/S3 fixtures yield identical record hashes, exact-reference
  lookup, candidate ordering, approval selection, and startup/error decisions.
  Duplicate exact-byte publication succeeds idempotently; changed bytes at an
  existing digest key are never overwritten or accepted.
- Bounds cover full bytes, UTF-8 strings, depth, duplicate keys, canonical
  representation, revision boundaries, predecessor format, signature metadata,
  and unknown properties on both publishing and every read path.
- Independent installations publishing the same revision preserve both hashes;
  an approved hash remains usable despite competing candidates, stale cards,
  late lower revisions, or a full index rebuild. Paginated reconciliation
  discovers late history; invalid entries do not stall cursors.
- Independent-machine members recover/maintain only their own charter over the
  board, without peer inventory/filesystem/process/endpoint access. Lead team
  discovery enumerates authenticated policy principals despite missing/stale
  cards and unavailable peers; absent bytes produce bounded partial awareness.
  Member→lead and lead→member changes invalidate workflow/team assessments
  without granting actions, transferring receipts, or needing a former lead.
- Every condition/transition in section 7 yields the same adoption, gate,
  authorization, routing, reason and exit category across core, CLI, hooks and
  MCP. Optional missing/invalid/unadopted content may warn and route only under
  independent authorization, never reports adopted; required mode blocks until
  the proven local integration completes. Cover binding add/change/remove,
  optional↔required, same-pair renewal, context loss, revoked/expired current
  policy, incomplete policy catch-up, conflicting policy, and local config change.
- Exact-byte restoration of missing approved content/predecessors is idempotent,
  preserves hash/floor and historical publisher provenance, and requires current
  own-principal maintenance authority. Completely lost bytes/lineage yield
  recovery-required without revision-1 reset or invented old-hash content.
  Existing approved content may start with absent older lineage while successor
  approval remains blocked; fork replacement must descend from the approved pair.
  Binding removal/re-addition, installation replacement, index rebuild and
  fresh-principal/domain migration preserve old approval floors/evidence.
- Adversarial-sized history fixtures for later implementation use more than 200
  invalid raw keys, maximum-sized records, oversized streams and listings,
  absent dependency chains, and repeated non-progressing pages. Bound work,
  bytes, backend traversal, diagnostics and allocation before materialization;
  stop at the first exhausted budget with correct continuation. Summary/full
  projection fit within 1 MiB including labels, with no truncated signed record.
  Exercise empty partial pages, interrupted cursor commits, policy-changed team
  views, late low revisions, feed token loss/history rewrite, and a backend
  exposing only unbounded legacy changes (never call it). Missing bounded
  fallback is explicit unsupported/incomplete, never claimed full coverage.
- A lost put acknowledgement preserves the exact original signed bytes/hash;
  equal-byte lookup resolves stored success, absent bytes permit authorized
  exact retry, mismatches deny, and expired authorization prevents new writes.
  Completed audit reports invalid/fork/missing-lineage facts with 0, partial
  pages with 4, definitive current conflicts/expiry with 3, usage with 2, and
  local I/O with 1; required recoverable unreadiness is 4 in every entry point.
- Current policy alone selects startup content. Wrong domain/principal/hash,
  unsigned or unapproved content, withheld publication policy, absent required
  content, policy expiry/conflict/rollback, and optional missing content follow
  the table. Offline cached success obeys enrollment freshness exactly.
- Publication, approval, adoption, identity, and post authorization are observed
  separately. A role description or signature changes none of the grants.
  Recovery can restore exact bytes or publish a successor with its explicit
  grant and required lineage while required routing remains gated.
  Other-principal publication/restoration is rejected.
- Approved-pair changes and policy-only invalidation reach direct APIs, cached
  reads, startup integration, CLI, hooks, and MCP resources. An adoption receipt
  cannot transfer between instances; a restart/context recovery reads again.
- Key replacement preserves lineage and current operator-approved historical
  content under section 6's historical rule; principal suspension blocks routing.
  Historical attribution never proves signing time or prior task execution.
- Local import preserves explicit section mapping/source hashes, reports drift,
  and never auto-overwrites local prose. Commands/links in content remain data;
  signed/approved content is not promoted into privileged prompts by transport.
- Compatibility fixtures demonstrate legacy inspection, unsupported-version
  refusal for required startup, no old-client enforcement claim, and immutable
  cross-domain import boundaries. All errors have stable machine-readable codes.

## 11. Proposed delivery slices and source basis

For later lead assignment, without assigning ownership or changing task status:

1. Carry section 12's settled decisions into enrollment/task-206 implementation
   planning; freeze fixtures
   for canonical hash, policy reference, publication grant, and history forks.
2. Add core schema/verification/publication/history services and shared store
   conformance cases, depending on enrollment's secure verifier and durable
   trust state. Preserve the four-method Store contract, but add enrollment's
   bounded secure-reader/listing/change-feed capabilities; current unbounded
   return-value interfaces alone do not satisfy secure-mode limits.
3. Add discovery-card references, CLI and MCP surfaces, then local runtime
   recovery receipts and invalidation. Keep all consumers on the same verifier.
4. Migrate dogfood charters, exercise restart/offline cases, and obtain independent
   correctness and required security gates before rollout/integration.

Repository inputs: [AGENTS.md](../../AGENTS.md),
[local charter index](../agents/README.md),
[architect charter](../agents/codex-architect.md),
[locked design](../../DESIGN.md), [security policy](../../SECURITY.md),
[task 208](../../backlog/208-agent-charters.md),
[task 206](../../backlog/206-agent-cards-publish-and-list.md), and
[enrollment research 08](../research/08-agent-enrollment-proposal.md).
Remediation inputs are tasks 211/212/215 and the lead-coordinated enrollment
remediation 310; round-1 charter and isolated DESIGN hashes were checked before
authoring. This is author remediation, not an independent review verdict.
Narrow CodeGraph interface discovery confirmed the current Store exposes
immutable-put options, get/list, optional changes and hint; the draft adds
domain-scoped keys using that interface. Existing MCP tools/resources establish
an integration location, not evidence that charter APIs already exist.
Enrollment's canonicalization/signature profile is reused by reference;
this draft introduces no independent cryptographic framework.

## 12. Settled direction and remaining implementation choices

Task 215 records the following lead decisions. They are accepted design
direction, not deployment authority or approval of this DRAFT's complete wire
details. The enrollment/charter ownership boundary is aligned through the lead:
enrollment owns identity, grants, policy binding/floors and bounded authorization;
this document owns own-charter recovery/adoption and bounded lead team awareness.

| Decision | Disposition carried by this remediation |
|---|---|
| Own-principal publication | Explicit operator-granted, domain-scoped `charter.publish` (`boardId: null`), including authenticated exact-byte maintenance; no cross-principal publication or charter self-approval. |
| Historical signer | Publication-snapshot provenance plus current exact operator approval; old installation retirement alone does not require re-signing approved content. |
| Approval floor and continuity | Durable monotonic revision/hash floors; successor approval must descend from the approved pair. Exact-byte repair is idempotent; complete loss fails closed for explicit operator recovery or fresh-principal/domain migration. No silent floor reset. |
| Revision/hash/card agreement | Positive 31-bit revision; SHA-256 of complete signed canonical bytes excluding storage LF. Card references advisory, required flag/selection policy-owned. |
| Distributed recovery | Members need only their own charter through the board; lead-only team awareness starts with bounded policy principal enumeration. `coordinationRole` selects workflow, with no election, permissions or confidentiality implication. |
| Adoption and routing | Required readiness waits for actual instance-local recovery. Optional failure may warn and route under independent authorization; never claims adoption. |
| Bounded interfaces and outcomes | Enrollment transport/work ceilings, bounded prefix fallback without legacy unbounded change feed, and shared CLI categories 0/1/2/3/4 with exact matrix in sections 7–8. |

Implementation planning must identify actual supported harness recovery hooks
and demonstrate their receipt/invalidation behavior before enabling required
bindings. A specialized same-principal recovery mechanism after complete lineage
loss remains separately scoped, not a v1 fallback. The API/CLI names, additive
bounded backend adapters and fixtures remain draft implementation contracts
awaiting independent specification review and lead disposition. No additional
consequential choice is requested by this remediation; it remains DRAFT for
round-2 task 216 and does not authorize implementation.

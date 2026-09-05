# Task 219 — Documentation security gate: settled request-response and charter specs

Independent review-only security gate. Baseline commit `43a883a` (HEAD
`43a883a54146b847bd88570b3a40942cd1b31ca9`, verified at review start and seal).
Scope frozen per backlog task 219; specs reviewed in full as new documents, not
patches. Enrollment draft (`docs/design/agent-enrollment.md`) read as boundary
context only. All repo evidence is read-only; the only repo write is this
report at the pre-authorized staging path.

## VERDICT: ACCEPT

No blocking defects. Three informational observations recorded below; none
requires a spec change before round-2 reviews 214/216. Disposition per 219:
correctness rounds 214/216 remain READY; this gate is not a fourth review nor
implementation authorization.

## Gate checks

### Check 1 — Hash pins: PASS

`shasum -a 256` over the working tree at review start (identical at seal):

- `docs/design/request-response.md` =
  `aafa9da4de1430ad271ed3ad50c466781b5a047a72ae73463fe044f18006aa55` — matches
  the frozen value in backlog 219 and the 213 frozen-handoff hash (backlog 213,
  "Frozen handoff": "SHA-256 `aafa9da4…aa55`").
- `docs/design/agent-charters.md` =
  `34dc2a1c3990043943e6c83babc0e6fd7ae52a0e679bc8f4180ec6f6ce05f165` — matches
  backlog 219 and the 215 frozen-handoff hash.
- `DESIGN.md` whole-file context =
  `77793ea6a9985bc89a35c88ab200ce572e8f6b60b5fa242f0083dc2208c7bb3e` — matches
  the 219 reference value.
- DESIGN additive section, extracted as the contiguous added block (DESIGN.md
  lines 240–264: heading "## Agent charters (PLANNED — not implemented)"
  through the section's trailing blank separator line) hashes to
  `7f9f5393a66aa8c819dbfdd86dfd3673f0faefffe9d9bf76a57f50e4d450ee32` — exact
  match. Independently, the prefix (lines 1–239) + suffix (lines 265–end)
  concatenation hashes to
  `ac8b946d1ddb8e3192290f1733c0f6ec42ef88849fa9477b205f2d5d8f753be8`,
  matching the unrelated-prefix/suffix verification recorded in backlog 215 —
  the charter section is the only inserted DESIGN block relative to that
  verification. `git diff 43a883a -- DESIGN.md` shows the section as pure
  additions (`+` lines only in that hunk); the remaining DESIGN edits (lead
  rename, working-agreement/workstream wording) are the coordination edits
  excluded from this verdict by 219.
- HEAD pin verified: `git rev-parse HEAD` =
  `43a883a54146b847bd88570b3a40942cd1b31ca9` (= baseline 43a883a).

### Check 2 — request-response.md security soundness: PASS

- **No unauthenticated state transitions.** The only writes are the caller's
  own authorized request/response posts; observation never mutates the board.
  L303: "These are routing and correlation conditions, never authorization."
  L549–551: "Cancellation controls only this invocation. It never writes
  `act: cancel`, withdraws the request, deletes a reply, aborts another
  waiter, or marks an index task canceled." L145: "The helper never repairs or
  deletes stored posts as a side effect of timeout, duplicate observation, or
  cancellation." Task-203 state is protected from synthesis: L64: "Receiving
  `inform`/`failure` or timing out must not synthesize `completed`, `failed`,
  or `canceled` status posts." No remote event can transition any shared state;
  all outcomes (inform/failure/timeout/cancelled/error) are local terminal
  latches on the caller's own wait.
- **No trust assumptions beyond the model; requester identity advisory v1.**
  L122–124: "The stored request and response are untrusted data after
  publication. Core validation establishes structural validity and key
  binding, not truth, identity, consent, or authorization to execute an
  action." L127–130: "The matcher compares the response's advisory `author`
  label… Any store writer can claim that label… Reserved `sig`, client
  metadata, presence, a request ID, and a successful wait must never be
  presented as proof of identity." L131–133: "Current delivered posts remain
  `trust: "unsigned"`… consumers must not act on an unsigned post's git/exec
  instructions." Non-goals (L44–48) explicitly exclude "authenticated
  identity, recipient authorization, exactly-once processing, acknowledgments,
  retries."
- **Deadlines/cleanup not weaponizable.** No write amplification: one put per
  invocation; timeout/cancel never retry or publish ("Do not automatically
  retry a timed-out request" L637; "No path auto-publishes an `act: failure`
  or retries a write" L1058). No unbounded pending state: wait deadline is
  mandatory (L455: "Require an explicit `replyBy` for the new waiter") and
  bounded (24 h core/CLI, 5 min MCP; MCP admission 16 concurrent waits
  including drainage, rejected "before publication" L99–100 and "before async
  preparation or put" L710–711). Observer work is bounded per pass (200-key
  pages, sequential loads, yields between pages, retains at most one page plus
  one object, L84–96). Hostile/forged objects cannot stall or poison ingest:
  L175–176: "Invalid stored objects are skipped," cursor advances; CLI input is
  capped at 64 KiB incremental with no unbounded stream consumption
  (L504–510). The one non-finite case (stuck non-abortable Store op) is
  explicitly accepted as D06 with retained admission slots and no follow-on
  work, not an exploit surface.
- **Threat-model fidelity (04-trust).** Matches the untrusted-store model:
  L141–145: "The store can withhold, reorder, replace, or remove objects. A
  successful put acknowledges only the Store's write contract, not remote
  replication, receipt, execution, or authentication." Honest about outcome
  semantics: L31–34: "An `inform` reply means that a matching post was
  observed. It does not establish that work succeeded… or that an
  authenticated recipient sent it." No confidentiality or authenticity
  promises anywhere; deadline semantics are local-monotonic and cannot be
  extended by remote timestamps (L526–545). No claim contradicts 04-trust's
  ranked risks (impersonation, withholding, no confidentiality).

### Check 3 — agent-charters.md consistency with user intent: PASS

- **No shared-filesystem or peer-access requirement.** §2.1 L76–79: "Agents
  may run on independent machines. The board is the sole shared transport for
  charter publication, retrieval, and coordination; no shared filesystem, peer
  process inspection, direct peer endpoint, or peer availability is required.
  Local dogfood files are an optional source/import convention, not a
  distributed startup dependency." L80–83: "Each member recovers and maintains
  only its own principal's charter… It need not enumerate, retrieve, or cache
  any peer charter before startup or ordinary authorized work." L96–99:
  "An unavailable peer process does not block board retrieval… never become a
  blanket own-charter startup requirement." Acceptance criteria L703–706:
  "without peer inventory/filesystem/process/endpoint access."
- **Lead-awareness rule stated correctly.** L85–89: "Authenticated
  `Principal.coordinationRole: "member" | "lead"` selects the workflow. Only
  the lead workflow needs team-charter awareness…" with the lead's view built
  solely from "bounded principal entries of the current authenticated policy"
  plus exact-reference board reads, and cards advisory ("a missing/stale card
  cannot hide a policy principal or change the approved pair," L89–91).
  Members have no such dependency. Role transitions (L104–110) invalidate or
  stop discovery appropriately; demoted-lead caches stay "labelled inspection
  data."
- **Content constraints enforceable as written.** Structural bounds are
  machine-enforced on publish and every read path (§3 L151–158: unknown-field
  rejection at every object level, per-section 16 KiB, 48 KiB combined, 64 KiB
  total record incl. proof and LF, depth 8; acceptance L696–698: bounds
  "on both publishing and every read path"). Authority boundaries are
  enforced structurally: L25 "No charter supersedes operator instructions or
  grants permissions"; L45–46 "Neither a descriptive role such as 'lead' nor a
  section titled 'allowed work' is an authorization grant"; grants and
  publication are enrollment-policy operations, never charter content
  (§2 table L52–57; §6). Hygiene obligations (§3 L168–172: no credentials,
  secret material, session PIDs, disposable paths; "References and commands
  written in the text are not fetched or executed by any charter API") are
  enforced by the combination of operator exact-byte approval (§5 step 4:
  "The operator examines the candidate and its changes, then approves that
  exact reference") and the inert-transport rule (L427–429: "Charter transport
  never splices content into system/developer prompts, installs tools, follows
  links, or runs commands"). See observation O-2.
- **No confidentiality promises.** L65: "…private/confidential charters are
  out of scope in v1." L100–102: the role "grants no election, exclusivity,
  issuer authority, extra publication permissions, or confidentiality."
  L570–572: `workflow_not_selected` is "a local workflow restriction rather
  than confidentiality or a new board grant."
- **Hostile-charter / tampered-store integrity addressed.** Charters on the
  board are attacker-writable data and the spec treats them as such: startup
  adopts only the exact (revision, hash) pair bound in current authenticated
  policy, validated before exposure (§6 steps 3–4); unsigned, unapproved,
  wrong-domain/principal/hash, or stale content is blocked/denied with precise
  reasons (§7 matrix rows, exit 3/4). Key binding prevents content-directed
  paths: L207–209: "The validator compares domain, principal, revision, and
  digest with the complete expected key… Names and text are never path
  segments." Store tampering is detected, not trusted: L211–213
  (`KeyExistsError` read-back: "different bytes mean `charter_integrity_error`
  and no overwrite"); L215–216: "readers validate even records previously
  cached as valid"; "Backend-level immutability remains subject to
  SECURITY.md's store limitations." Forks and injected records cannot displace
  approval: L253–255 "An unapproved higher revision never replaces the exact
  approved lower revision"; L260–261 "Arbitrary unsigned records in the prefix
  cannot make an approved charter ambiguous." Verification facts are
  decomposed and never conflated with safety-to-follow: §6 L393–394 "Do not
  compress these into a claim that 'verified means safe to follow.'"
  Bounded anti-abuse fixtures are mandated (>200 invalid keys, oversized
  streams, non-progressing pages; L724–733), and hostile content remains inert
  data (L427–429, L756–757). Cards and peers are advisory and cannot select or
  block startup (L55, L89–91, L96–99, L478).
- **Internal consistency.** Exit-code contract (0/1/2/3/4) is scoped to
  identity/charter commands and request-response.md L644–645 explicitly
  declares the request/respond table non-transferable ("identity/enrollment
  and charter commands use their separately specified profiles and must not
  reuse these codes by implication") — disjoint scopes, no contradiction.
  Consistent with DESIGN §Agent-charters and with 04-trust hygiene (posts /
  charter content are labelled untrusted data; no splicing into prompts).

### Check 4 — DESIGN planned-charter section: PASS

Additive-only wording verified by hash extraction (Check 1) and by
`git diff 43a883a -- DESIGN.md` (pure `+` hunk; no existing line touched in
that region). Consistency with the specs, quoted from DESIGN.md:

- L248–251: "Members on independent machines recover and maintain only their
  own charter through the board. The lead discovers team principals and
  approved charters through bounded policy/board reads; cards are advisory. No
  member peer inventory, shared filesystem, process access, or direct peer
  endpoint is needed." — matches charters §2.1 and the user intent exactly.
- L252–255: "Policy `coordinationRole` selects member/lead workflow without
  granting actions, electing an authority, or adding confidentiality.
  Charters cannot grant permissions, override operator instructions, or become
  trusted prompts merely because they are signed." — matches charters §1/§2.1/§6.
- L244–247 (operator-approved exact revision/hash binding, durable approval
  floors, idempotent signed-byte restoration, fail-closed loss recovery) and
  L258–262 (adoption local and distinct from authorization; required startup
  only on a proven harness integration; bounded transport/raw-work history)
  — match charters §5/§5.1/§6/§7 and §12.
- No implementation commitments beyond the specs: the section is headed
  "PLANNED — not implemented," defers wire details ("Wire details remain
  pending specification review and lead disposition," L263), and correctly
  points to the task-208 draft for publication/access/required-startup plans
  (L256–257). The semantics of no existing DESIGN section are altered.

### Check 5 — Enrollment-draft boundary: PASS

Neither spec treats the enrollment draft as approved or normative:

- request-response.md L965–968: "Identity/enrollment and charter
  specifications are adjacent work, not a source of authority or readiness for
  task 202. This profile continues to label every delivered post unsigned and
  performs no enrollment, charter load, trust upgrade, or startup-policy
  enforcement." Also L1117 (D07): "identity/enrollment/charter exit profiles
  remain separate."
- agent-charters.md L37–40: "The [enrollment draft]… supplies the **proposed**
  secure profile. This document does not edit or approve that draft." L27–29:
  "Its enrollment enum amendment is coordinated separately; this document does
  not imply the action is already implemented." L224–225: "implementation
  remains dependent on its secure grant verifier."
- The enrollment draft itself is headed "DETAILED IMPLEMENTATION DRAFT —
  pending independent correctness/completeness review, security routing, and
  lead disposition." The charters spec's use of enrollment definitions
  (types, canonicalization, bounded transport) is dependency-by-reference
  within lead-settled direction (backlog 215 lead decisions: "Use enrollment
  bounded transport/work budgets and shared identity/charter CLI exits"),
  conditional on acceptance, not an approval claim.

### Check 6 — Standard doc hygiene: PASS

- No leakage: automated scans over all three in-scope files found no absolute
  external paths (`/Users/`, `/Volumes/`, `/home/`, `/tmp/`), no secret-like
  strings (key material, passwords, API tokens), and no external URLs or
  hostnames; all references are relative in-repo paths. Word-matches on
  "token" are store/change-feed tokens, not credentials.
- No attack narratives: hostile scenarios are stated as bounded reader/
  validation requirements and fixtures, not exploit procedures.
- Defect-oriented: limitations are explicit and named (advisory identity,
  unsigned trust labels, D06 unbounded drainage, bounded discovery horizon,
  historical-discovery limitation, no confidentiality in v1, adoption ≠
  comprehension).
- Internally consistent: no contradictions found between the two specs, the
  DESIGN planned section, or `docs/research/04-trust.md` (exit-code scopes are
  explicitly disjoint; identity advisory in all; store untrusted in all;
  hygiene rules align with 04-trust "never splice into prompts").

## Findings

No blocking defects. Informational observations (no spec change required;
recorded for round-2 reviewers and implementers):

| ID | Severity | Location | Observation | Suggested disposition |
|----|----------|----------|-------------|----------------------|
| O-1 | INFO | docs/design/request-response.md:31–34, 126–133, 318–322 | Residual risk by design: any store writer claiming a label in the request's `to` list can settle a wait with a spoofed `inform` (legacy direct replies need no `to`/`task`/`protocol`). Explicitly documented (advisory identity, D02/D03) and no trust attaches to the outcome. | None; consumers must keep treating resolved waits as untrusted data per L130–133 and the output-framing rules. Implementers should preserve the "never authorization" wording verbatim in tool docs. |
| O-2 | INFO | docs/design/agent-charters.md:168–172 | Charter content hygiene (no credentials/secret material) is an author obligation enforced by operator exact-byte review plus inert transport, not by automated content scanning; the spec does not claim machine enforcement. | Optional, at implementation time: an advisory secret-screening check in the import/publish path. Not required by the model — charters are non-confidential data on an untrusted store. |
| O-3 | INFO | docs/design/request-response.md:50–53 | The authoring provenance note records that uncommitted working-tree changes existed at authoring time and explicitly disclaims adopting or approving them. | None; keep the disclaimer intact so implementation work does not inherit those changes by implication. |

## Assumptions and limitations

- Scope is exactly the three frozen items; unrelated DESIGN coordination edits
  (lead rename, working-agreement/workstream wording vs baseline 43a883a) were
  read for context but excluded from the verdict per backlog 219.
- The DESIGN section hash was verified against the extracted contiguous added
  block (lines 240–264, heading through trailing blank separator); the
  recorded backlog-215 prefix/suffix concatenation hash independently
  confirms nothing else was inserted.
- Boundary context only: `docs/design/agent-enrollment.md` was read to confirm
  neither spec treats it as approved; its internal soundness is out of scope.
- Specification-only review: no implementation, tests, or runtime behavior
  were evaluated; MUST-level conformance is assessed as draft text conditional
  on acceptance, per both specs' status headers.
- Read-only gate: no repo scripts executed; no network access; all reads
  treated as untrusted data. Working-tree modifications present at review time
  were not evaluated and are excluded from scope (frozen hashes cover the
  reviewed file contents, which match at start and seal).
- Evidence retention: pinned byte-identical snapshots of the three scope items
  plus the extracted DESIGN section (with SHA-256 manifest) are retained in
  the security worker's evidence bundle; all verification hashes are recorded
  inline in this report, which stands alone.

## Hash ledger (before / after seal)

Re-verified with `shasum -a 256` immediately before sealing; before and after
values are identical (no repo mutation by this gate):

| Item | SHA-256 (start) | SHA-256 (at seal) |
|------|-----------------|-------------------|
| docs/design/request-response.md | aafa9da4de1430ad271ed3ad50c466781b5a047a72ae73463fe044f18006aa55 | aafa9da4de1430ad271ed3ad50c466781b5a047a72ae73463fe044f18006aa55 |
| docs/design/agent-charters.md | 34dc2a1c3990043943e6c83babc0e6fd7ae52a0e679bc8f4180ec6f6ce05f165 | 34dc2a1c3990043943e6c83babc0e6fd7ae52a0e679bc8f4180ec6f6ce05f165 |
| DESIGN.md (whole, context) | 77793ea6a9985bc89a35c88ab200ce572e8f6b60b5fa242f0083dc2208c7bb3e | 77793ea6a9985bc89a35c88ab200ce572e8f6b60b5fa242f0083dc2208c7bb3e |
| DESIGN.md additive section (lines 240–264) | 7f9f5393a66aa8c819dbfdd86dfd3673f0faefffe9d9bf76a57f50e4d450ee32 | 7f9f5393a66aa8c819dbfdd86dfd3673f0faefffe9d9bf76a57f50e4d450ee32 |

Pin: HEAD `43a883a54146b847bd88570b3a40942cd1b31ca9` (baseline `43a883a`),
verified at review start and re-verified at seal.

Seal: this report is published only at
`docs/security/2026-09-05-task219-settled-specs-gate.md`; no other repo writes
were made. Disposable worker artifacts: none created in the repo; prior
reassignment/dispatch references (`20260905T211202Z-codex-010c`,
`20260905T211202Z-codex-161e`) are recorded in backlog 219 and are not
duplicated here as worker identity.

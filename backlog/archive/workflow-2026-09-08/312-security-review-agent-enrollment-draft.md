---
id: 312
title: "security review: frozen agent-enrollment draft"
phase: 3
owner: letta
status: gated
kind: security-review
depends: [310]
estimate: M
---

Independent clean security review in parallel with queued correctness round311.
No implementation, deployment, key/custody setup, draft approval, git mutations,
live board actions or credential access. No source/spec/task edits.
Dispatch: `20260905T223414Z-codex-43dd`; fresh security worker RUNNING confirmed
in `20260905T223529Z-letta-22e0`. This remains separate from CI diagnosis and
its test-only remediation; no implementation is approved by this review.

## Frozen scope

Review in full ONLY docs/design/agent-enrollment.md, SHA-256
d48c7ecd5fb4a33f057f1d5e3bc7bb8a5ce5ed16014e239bf1f1599a44c36306
(2,498 lines;169,945 bytes), author handoff310. Stop on drift. No author edits
are authorized while311 and312 share this freeze. Committed context:
f10bc8aaa5eeb9d54de6492312faa12fb6fbc95c.

Inputs: this task, task310's lead decisions, reviewer309 findings, committed
DESIGN, docs/research/04-trust.md, and approved research direction in
docs/research/08-agent-enrollment-proposal.md. Settled charter/request-response
specs are boundary context only, hashes respectively
34dc2a1c3990043943e6c83babc0e6fd7ae52a0e679bc8f4180ec6f6ce05f165 and
aafa9da4de1430ad271ed3ad50c466781b5a047a72ae73463fe044f18006aa55.
All other dirty artifacts and product code are excluded.

## Required assurance

Assess the whole proposed model, including operator bootstrap/custody; signed
policy/grant/identity binding; bounded canonical parsing/transport; validity,
configuration and cache transitions; revocation/rotation/conflict/history and
durable floors; publication uncertainty/exact-byte recovery; audit-only versus
operational authority; distributed charter/startup boundaries; and whether
acceptance requirements can verify the stated protections. This is design
assurance, not deployed-code certification.

User intent: independent machines coordinate through the board; members need
their own charter, only the lead needs team-charter awareness. No implied peer
access, shared filesystem or confidentiality guarantee.

Use the designated independent security workflow. Return ACCEPT or actionable
defects with file:line, required correction, severity, assumptions and limits.
Phrase findings for Codex as validation/robustness/authority defects, without
exploit narratives, attack chains or proof-of-concept payload/code. Write only
docs/security/2026-09-05-task312-agent-enrollment-spec-review.md. No reviewer
remediation. Return exact before/after hashes and cleanup; retain audit evidence
without transient external-path references in the committed report.

## Single-ledger disposition

311 stays correctness round2, maximum three rounds total. This is the separate
security assessment, not another correctness round. Lead combines findings
before any linked architect remediation and remaining correctness round; no
automatic fourth round or implementation authorization. Enrollment remains
unsettled until both reviews and lead disposition finish;301-305 stay held.

- [x] Fresh independent security verdict for the exact draft returned.
- [ ] Lead records disposition alongside311; remediation uses linked tasks.
- [ ] Audit evidence integrated and cleanup confirmed after spec settlement.

## Sealed findings and lead disposition

Final handoff reconciled in `20260905T230636Z-letta-03a4` (coordinator also
identifies its earlier22:51 handoff as letta-19fb). Report
`docs/security/2026-09-05-task312-agent-enrollment-spec-review.md`, SHA-256
`34d6eef72e37811352ca8f0b437b8a3a119162b13c75cbffac0692ca9765f25b`.
Lead independently checked this report hash and unchanged frozen draft hash.
Reviewer labels the result ACCEPT-ready, conditional on disposition of one
MEDIUM and four LOW findings. This is not unconditional spec approval.

Lead requires remediation of SEC-1 through SEC-5, combining overlapping
acceptance cases rather than duplicating them:

- SEC-1: explicit signing-input confirmation tied to the exact approved
  canonical content and journal; changed input must fail before signing.
- SEC-2: deterministic validation/runtime treatment for retained grants whose
  identity is tombstoned. Prefer retaining valid snapshot content while
  denying its use, consistent with the draft's existing display allowance.
- SEC-3: explicit accepted-history coverage/health reporting for missing
  previously accepted records, without inventing new authorization semantics.
- SEC-4: remove ambiguity around not_yet_valid without introducing future
  grant activation that this profile excludes.
- SEC-5: add observable acceptance cases for signing-confirmation mismatch,
  authorized attachment descriptor validation and divergent issuer-machine
  issuance, reusing SEC-1's case where appropriate.

No new author edits yet:311 correctness round2 still awaits its verdict on the
same frozen bytes. Combine findings into one explicit linked remediation task
and, if required, one explicit final correctness round3; no fourth round.
Design assurance only, no deployed-code certification. Reviewer confirms no
scratch/processes and only the authorized report write; sealed audit retained.

---
id: 213
title: "spec remediation: request-response, after round 1"
phase: 2
owner: codex-architect
status: gated
kind: spec-authoring
depends: [210]
estimate: M
---

Remediate the completed CHANGES REQUIRED review 210 of authoring task
209. This is authoring only, not implementation, review or approval.
Prior review evidence is available even while its integration record is gated.

## Frozen starting scope

- `docs/design/request-response.md`, SHA-256 `b2fdf9189e87133af58fc52cff585364f9b155e3682c26bf383a099e48302e58`.
- Starting product baseline: `35df4b9`; documentation-only charter commit
  `0642428` is now HEAD and does not alter this draft.
- No other editable paths.

## Required reviewer remediation

- P2, lines 413–419/500–507/534–536: deadline/cancellation must cover CLI stdin and preparation, not start only after EOF. Define cleanup/drain limits and stalled-stdin, cancel-before-core, no-publication-after-expiry cases.
- P2, lines 230–245/294–308/523–524: distinguish absent/invalid target from Store.get failure, and response-write failure/unknown publication. Define typed categories, request versus response IDs and adapter mappings.
- P2, lines 515–529/545–562/603–627: fully specify the closed shared outcome union, required/optional/null fields, replication warnings, safe causes, response metadata allowlist, posting-versus-wait duration validation and parity tests.

## Lead decisions

Approve D01–D08 draft recommendations with these explicit details:
- Preserve Board.request; add requestAndWait/respond with inform/failure success union and typed local errors. Use the proposed error names, adding distinct response read/write categories as needed.
- Direct-root legacy-compatible correlation, first eligible inform/failure from an addressed label, advisory identity only.
- Monotonic local receipt deadline, strict-before cutoff and proposed UTC input subset. Capture deadline/cancellation before asynchronous CLI body/preparation; stalled stdin must not defer it. Never publish after expiry/abort.
- Pinned active-day scans with documented history limitation; approve 24-hour core/CLI maximum, 1-second default interval, 200-key batches, 16 MCP admissions including drainage, five-minute MCP maximum.
- Keep promise API and observable non-wire closed promise on operational errors, resolving never rejecting with final publication snapshot/IDs. Prompt local outcome; stuck non-abortable Store calls have explicitly unbounded drainage. No hidden Store API expansion or hard process-exit guarantee.
- Posting default; explicit --wait/wait:true and deadline; proposed request-command exit codes and primary-outcome-over-replication-warning precedence retained. Identity/charter command exit mapping is a separate profile, not reused blindly for request replies.
- Retain late responses; no implicit status/cancel posts or extra broad metadata flags.

## Definition of done

- [x] Clean author incorporates every finding and the settled lead decisions.
- [x] Cross-spec assumptions reconciled with other assigned authors through the lead.
- [x] Return exact final paths/hashes, per-finding response, remaining choices,
  and cleanup evidence. Remain DRAFT; no self-approval or implementation.
- [x] Lead freezes the result and activates round-2 review task 214.
- [ ] Artifact integration records required gates and cleanup.

## Frozen handoff

Clean author `architect_remediation_213` returned only the assigned document,
SHA-256 `aafa9da4de1430ad271ed3ad50c466781b5a047a72ae73463fe044f18006aa55`;
lead verified the working-tree hash. D01–D08 recorded as settled. Author reports
no implementation/tests/reviews/other file edits, scratch or background work.
Early adapter deadline/cancellation and native-input versus non-abortable
drainage are specified (scenario 18); distinct response failures and request/
response publication snapshots (19); closed CLI/MCP output union, metadata,
warnings and posting/wait validation (20–21). DRAFT remains unapproved.

---
id: 127
title: SECURITY.md — repository security policy
phase: 3
owner: letta
status: done
depends: []
estimate: S
---
The repo has a threat model (docs/research/04-trust.md) and 10+ scan reports but no SECURITY.md.
A security policy states what the project's security properties are, what's in and out of scope,
and how findings are reported — useful for contributors and as the standing input to every scan.

## Definition of done
- [x] SECURITY.md at repo root using the define-security-policy skill, grounded in docs/research/04-trust.md and the docs/security/ scan history
- [x] states: the trust model (untrusted shared store; agent messages are untrusted data; prompt-injection is risk #1), the security properties that must hold (read-side validation/limits, key-binding, provenance labelling, no secret leakage, fail-closed enums/identity), what's in scope (the packages) and out of scope (operator's shell/creds, availability of the store owner, MCP SDK internals), and how to report a finding
- [x] references the standing conventions already enforced (task-115 read limits, signing reservation, hygiene policy in AGENTS.md)

## Completion evidence (2026-09-05)

- Independent clean correctness review: READY; four documentation findings corrected.
- Letta's final clean security gate: ACCEPT, no reportable findings; [report](../../docs/security/2026-09-05-task127-security-md-docgate.md).
- Both reviews pinned `SECURITY.md` SHA-256 `a0932f6753b6ccb79ac6829043d6aa7e0c6a66579f14d3a2cb296f1eed058d89`.
- Clean validation agent: root `bun test` 278 pass, 1 live S3 skip, 0 fail; `bun run typecheck` and `git diff --check` passed.
- Author and review/validation agents reported no remaining task scratch files, worktrees, or processes. Security audit reports are retained.

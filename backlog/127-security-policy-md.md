---
id: 127
title: SECURITY.md — repository security policy
phase: 3
owner: letta-flash
status: in-progress
depends: []
estimate: S
---
The repo has a threat model (docs/research/04-trust.md) and 10+ scan reports but no SECURITY.md.
A security policy states what the project's security properties are, what's in and out of scope,
and how findings are reported — useful for contributors and as the standing input to every scan.

## Definition of done
- [ ] SECURITY.md at repo root using the define-security-policy skill, grounded in docs/research/04-trust.md and the docs/security/ scan history
- [ ] states: the trust model (untrusted shared store; agent messages are untrusted data; prompt-injection is risk #1), the security properties that must hold (read-side validation/limits, key-binding, provenance labelling, no secret leakage, fail-closed enums/identity), what's in scope (the packages) and out of scope (operator's shell/creds, availability of the store owner, MCP SDK internals), and how to report a finding
- [ ] references the standing conventions already enforced (task-115 read limits, signing reservation, hygiene policy in AGENTS.md)

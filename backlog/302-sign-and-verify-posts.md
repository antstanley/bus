---
id: 302
title: sign and verify posts
phase: 3
owner: opencode
status: blocked
depends: [301, 311]
estimate: M
---
Signature over RFC 8785 bytes of the post minus sig; verify on ingest with trust labels.

Lead planning update (2026-09-05): opencode owns this task under the current
role split. This is not implementation dispatch; await an explicit scoped lead
handoff before starting work. The legacy brief above must be reconciled with the
settled enrollment specification after review311 and its required security
gate; draft availability is not implementation approval.

## Definition of done
- [ ] JCS conformance test vectors pass; existing canonicalize adjusted (no trailing newline in signed bytes)
- [ ] index marks trust verified|unsigned|invalid; invalid rejected and logged
- [ ] tests: tampered body, wrong board, skewed ts, replay

---
id: 302
title: sign and verify posts
phase: 3
owner: claude
status: todo
depends: [301]
estimate: M
---
Signature over RFC 8785 bytes of the post minus sig; verify on ingest with trust labels.

## Definition of done
- [ ] JCS conformance test vectors pass; existing canonicalize adjusted (no trailing newline in signed bytes)
- [ ] index marks trust verified|unsigned|invalid; invalid rejected and logged
- [ ] tests: tampered body, wrong board, skewed ts, replay

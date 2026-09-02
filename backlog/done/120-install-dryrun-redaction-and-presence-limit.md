---
id: 120
title: install dry-run redaction of reflowed lines; wake scan presence limit
phase: 1
owner: codex
status: done
depends: [104, 119]
estimate: S
---
Two low findings from the 2026-09-02 cli+hooks gate scan (docs/security/2026-09-02-cli-hooks-gate-scan.md),
accepted in writing at commit time and tracked here.

## Definition of done
- [x] install --dry-run never prints values of pre-existing keys: when re-serialisation reflows lines, show only board-owned additions/removals (or redact every value of a line that was not added by board), so a secret under any key name is never echoed
- [x] deliverOpenCodeMentions (and any wake path) pages through presence with an explicit limit/pagination instead of the default first 200 records, and logs a warning when truncation would occur
- [x] tests: dry-run with a compact config containing a non-denylisted secret key prints no secret; 200+ low-sorting presence records still allow a wake

## Verification (2026-09-02)

- JSON dry-run output is now structural: unchanged pre-existing values are
  omitted, removed/changed old values are redacted, and only installer-added
  values are shown. Compact, pretty, non-denylisted, and URL-userinfo fixtures
  do not expose their markers.
- Wake delivery reads up to the explicit 1,000-record presence bound through
  paginated store lists. It emits a warning on stderr if another key proves the
  result was truncated.
- Focused validation: 44 tests passed; TypeScript typecheck and
  `git diff --check` passed.

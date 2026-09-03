---
id: 609
title: OIDC setup --delete: fail closed on truncated list-roles pagination
phase: 6
owner: codex
status: done
depends: [608]
estimate: S
---
From the 608 security gate (docs/security/...608...). LOW, accepted in writing at commit. The
role-trust scans (scripts/aws-ci-oidc-setup.sh:441,460) rely on implicit AWS CLI auto-pagination
and do not fail closed on a truncated single-page capture; under a non-default CLI config a
referencing role could be missed before provider delete. Availability/edge, teardown path.

## Definition of done
- [x] each list-roles capture fails closed unless jq -e '(.IsTruncated // false) | not' accepts it, or paginates explicitly
- [x] test with a truncated (IsTruncated:true) capture proves the delete refuses

## Verification

- Both initial and final trust scans reject `IsTruncated: true`, malformed
  `IsTruncated` types, and unexpected `Marker`/`NextToken` pagination state.
- The fake-AWS behavioral suite covers truncated initial and final scans,
  malformed pagination metadata, a marker-bearing incomplete final response,
  and API errors; every case proves provider deletion is not called.
- `bash -n`, ShellCheck, the behavioral suite, and `git diff --check` pass.
- Full `bun test`: 240 pass, 1 environment-gated real-S3 test skipped;
  `bun run typecheck`: pass.
- No real AWS call was made.

## Note (2026-09-03)
Gate suppressed 3 INFO: residual implicit pagination remains on OTHER IAM list calls in --delete (role deletion, not the provider-reference scan). Low priority; fold into a future teardown-hardening pass if --delete is exercised at scale.

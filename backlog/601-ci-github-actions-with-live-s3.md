---
id: 601
title: CI: GitHub Actions with live S3
phase: 6
owner: codex
status: done
depends: []
estimate: S
---
bun test, typecheck, MinIO conformance on every push; live S3 on main with repo secrets.

## Definition of done
- [x] workflow covers pushes and pull requests with Bun 1.4.0,
  `bun install --frozen-lockfile`, the full test suite, TypeScript typecheck,
  and MinIO-backed S3 conformance
- [x] a distinct live AWS S3 conformance path runs on `main` pushes and skips
  cleanly when its required repository secrets are absent
- [x] exact live-AWS OIDC secret names are documented in the root README
- [x] CI badge added to the root README

## Verification

- `actionlint .github/workflows/ci.yml`
- YAML parse and structural assertions for triggers, jobs, the step-managed
  MinIO launch, bounded readiness, guaranteed cleanup, environment variables,
  and secret guards
- Immutable action refs resolved from the official `actions/checkout` and
  `oven-sh/setup-bun` GitHub repositories; task 607 adds the official
  `aws-actions/configure-aws-credentials` v6.2.3 commit pin. The MinIO manifest
  digest was resolved from the official Docker Hub registry
- Every install uses `bun install --frozen-lockfile`; a clean install completed
  without changing `bun.lock`
- `bun test packages/store-s3/test/s3-store.test.ts`: 23 pass, 0 fail
- `bun test`: 230 pass, 1 expected real-S3 skip, 0 fail (Bun 1.4.0)
- `bunx tsc --noEmit`: pass
- Real `store-s3` conformance against the pinned MinIO image: 13 pass, 0 fail
- The revised random-port Docker flow completed under a 90-second process
  timeout and removed its named container through the cleanup trap

GitHub-hosted service startup and the OIDC live AWS path require a pushed
commit. The latter runs only for pushes to `main` in `antstanley/bus` and also
requires `AWS_ROLE_ARN`, `BOARD_S3_TEST_BUCKET`, and `AWS_REGION`, so both
remain operational checks for the first workflow run.

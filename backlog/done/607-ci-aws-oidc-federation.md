---
id: 607
title: CI: AWS auth via GitHub OIDC + provisioning script
phase: 6
owner: codex
status: done
depends: [601]
estimate: M
---
Requested by Ant 2026-09-03: replace the static AWS access-key secrets in the CI live-S3 job
(601) with short-lived credentials via GitHub OIDC federation, and provide a bash script that
provisions the required AWS IAM OIDC provider and role. Fold the workflow change into 601 so CI
never ships with static keys. No long-lived AWS keys should live in GitHub secrets afterwards.

## Definition of done
- [x] .github/workflows/ci.yml `live-aws-s3` job uses OIDC: `permissions: { id-token: write, contents: read }`, `aws-actions/configure-aws-credentials` (pinned to a commit SHA) with `role-to-assume: ${{ secrets.AWS_ROLE_ARN }}`, `aws-region`, and NO AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_SESSION_TOKEN secrets; the job still self-skips cleanly when AWS_ROLE_ARN (and BOARD_S3_TEST_BUCKET) are unset, and remains gated to push on main so forked PRs never assume the role
- [x] required repo secrets reduced to: AWS_ROLE_ARN, BOARD_S3_TEST_BUCKET, AWS_REGION (document them; remove the old key-based names from README/task 601)
- [x] a parameterised bash script, scripts/aws-ci-oidc-setup.sh (executable, `set -euo pipefail`, aws + jq only), that:
      - takes/env-defaults: GITHUB_REPO (default antstanley/bus), AWS_REGION, BUCKET, ROLE_NAME (default board-ci-github-oidc), CI_PREFIX (default ci/), BRANCH (default main)
      - creates the IAM OIDC provider for token.actions.githubusercontent.com with audience sts.amazonaws.com if it does not already exist (idempotent; handle the current AWS behaviour where the thumbprint is validated by AWS's CA, using a correct thumbprint or documenting why a placeholder is accepted)
      - creates/updates an IAM role whose trust policy federates to that provider, condition `token.actions.githubusercontent.com:aud = sts.amazonaws.com` AND `token.actions.githubusercontent.com:sub = repo:<GITHUB_REPO>:ref:refs/heads/<BRANCH>` (StringEquals, not wildcard)
      - attaches a LEAST-PRIVILEGE inline policy: s3:ListBucket on arn:aws:s3:::<BUCKET> limited by a prefix condition to <CI_PREFIX>*, and s3:GetObject/PutObject/DeleteObject on arn:aws:s3:::<BUCKET>/<CI_PREFIX>* only
      - is idempotent (safe to re-run; create-or-update, --ignore/upsert semantics), prints the final role ARN and the exact `gh secret set` commands (or manual steps) to register AWS_ROLE_ARN, and does NOT print any secret material
      - has a companion teardown path or documented `--delete` to remove the role/provider it created
- [x] README/601 docs updated: OIDC setup steps, run scripts/aws-ci-oidc-setup.sh, set AWS_ROLE_ARN; note no long-lived keys are stored
- [x] shellcheck-clean script; a dry-run / --plan mode that prints the AWS calls without executing, exercised in the report (real AWS calls need Ant's credentials, so full apply is Ant's step — the script must be verified by dry-run + shellcheck, not by mutating the account)
- [ ] clean correctness review + Letta security gate on the workflow + script (trust-policy scoping and least-privilege are the security foci)

## Verification

- `aws-actions/configure-aws-credentials` v6.2.3 resolved from the official
  [upstream tag](https://github.com/aws-actions/configure-aws-credentials/releases/tag/v6.2.3)
  to `e6de054238d6b7531b4efff3b6587d9aade6a06c`. GitHub's official
  [AWS OIDC documentation](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws)
  confirms the job-level `id-token: write` requirement; AWS's official
  [IAM role guidance](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_create_for-idp_oidc.html)
  confirms exact `aud`/`sub` `StringEquals` conditions, while the
  [AWS CLI reference](https://docs.aws.amazon.com/cli/latest/reference/iam/create-open-id-connect-provider.html)
  confirms that AWS uses its trusted root CA library and the CLI thumbprint is
  optional.
- `shellcheck scripts/aws-ci-oidc-setup.sh scripts/aws-ci-oidc-setup.test.sh`:
  pass with zero suppressions.
- `scripts/aws-ci-oidc-setup.test.sh`: pass. An isolated stateful AWS CLI shim
  exercises plan, apply, and delete with missing, existing, and unmanaged
  providers/roles plus AWS errors. It compares the generated trust and S3
  documents structurally against exact JSON documents, and confirms that both
  object-form and array-form trust `Statement` values preserve a shared
  provider. Malformed or ambiguous trusts and failed AWS inspection all stop
  provider deletion. Teardown remains ownership-tag guarded: an untagged OIDC
  provider is always preserved before any account-wide trust inspection.
- Apply and delete `--plan` runs: pass. No apply or delete operation was run
  against AWS.
- `actionlint .github/workflows/ci.yml`: pass with zero suppressions. Additional
  structural assertions confirm three Bun 1.4.0 jobs, three frozen installs,
  15/15/20-minute job timeouts, the upstream-main push gate, OIDC
  permission/action/role, and no static AWS credential references.
- Clean temporary checkout `bun install --frozen-lockfile`: 100 packages
  installed with Bun 1.4.0; `bun.lock` byte-for-byte unchanged. The temporary
  checkout was removed.
- `bun --version`: `1.4.0`.
- `bun test`: 244 pass, 1 expected real-S3 skip, 0 fail.
- `bunx tsc --noEmit`: pass.

The remaining DoD item is the separately owned clean correctness review and
Letta security gate; this implementation intentionally performs no security
scan and creates no AWS resources.

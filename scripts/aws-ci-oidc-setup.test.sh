#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="${SCRIPT_DIR}/aws-ci-oidc-setup.sh"
TEST_ROOT="$(mktemp -d /tmp/board-task607-oidc-test.XXXXXX)"
FAKE_BIN="${TEST_ROOT}/bin"
CALL_LOG="${TEST_ROOT}/aws-calls.log"
TRUST_JSON="${TEST_ROOT}/trust.json"
S3_JSON="${TEST_ROOT}/s3.json"
mkdir -p "$FAKE_BIN"
trap 'rm -rf "$TEST_ROOT"' EXIT

cat >"${FAKE_BIN}/aws" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

scenario="${AWS_TEST_SCENARIO:?}"
call_log="${AWS_TEST_CALL_LOG:?}"
trust_json="${AWS_TEST_TRUST_JSON:?}"
s3_json="${AWS_TEST_S3_JSON:?}"
provider_arn="arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"
role_arn="arn:aws:iam::123456789012:role/board-ci-github-oidc"

if [[ "${1:-}" == "--no-cli-pager" ]]; then shift; fi
if [[ "${1:-}" == "--region" ]]; then shift 2; fi
service="${1:?missing service}"
operation="${2:?missing operation}"
shift 2

printf '%s %s' "$service" "$operation" >>"$call_log"
printf ' %q' "$@" >>"$call_log"
printf '\n' >>"$call_log"

argument() {
  local wanted="$1"
  shift
  while (($# > 0)); do
    if [[ "$1" == "$wanted" ]]; then
      [[ $# -ge 2 ]] || exit 96
      printf '%s' "$2"
      return 0
    fi
    shift
  done
  return 1
}

not_found() {
  printf 'An error occurred (NoSuchEntity) when calling %s\n' "$operation" >&2
  exit 254
}

access_denied() {
  printf 'An error occurred (AccessDenied) when calling %s\n' "$operation" >&2
  exit 254
}

case "${service}:${operation}" in
  sts:get-caller-identity)
    printf '%s\n' '{"Account":"123456789012","Arn":"arn:aws:iam::123456789012:user/test","UserId":"test"}'
    ;;
  iam:get-open-id-connect-provider)
    case "$scenario" in
      apply_missing) not_found ;;
      apply_provider_error) access_denied ;;
      apply_existing) printf '%s\n' '{"Url":"token.actions.githubusercontent.com","ClientIDList":[]}' ;;
      apply_unmanaged_role) printf '%s\n' '{"Url":"token.actions.githubusercontent.com","ClientIDList":["sts.amazonaws.com"]}' ;;
      *) exit 97 ;;
    esac
    ;;
  iam:create-open-id-connect-provider)
    [[ "$scenario" == "apply_missing" ]] || exit 97
    printf '{"OpenIDConnectProviderArn":"%s"}\n' "$provider_arn"
    ;;
  iam:add-client-id-to-open-id-connect-provider)
    [[ "$scenario" == "apply_existing" ]] || exit 97
    printf '{}\n'
    ;;
  iam:get-role)
    case "$scenario" in
      apply_missing|delete_missing|delete_unmanaged_provider|delete_shared_object|delete_shared_array|delete_malformed|delete_ambiguous|delete_roles_error)
        not_found
        ;;
      apply_existing|apply_unmanaged_role|delete_unmanaged_role|delete_clear)
        printf '{"Role":{"Arn":"%s"}}\n' "$role_arn"
        ;;
      *) exit 97 ;;
    esac
    ;;
  iam:list-role-tags)
    case "$scenario" in
      apply_existing|delete_clear)
        printf '%s\n' '{"Tags":[{"Key":"board-ci-oidc-setup","Value":"managed"}]}'
        ;;
      apply_unmanaged_role|delete_unmanaged_role)
        printf '%s\n' '{"Tags":[]}'
        ;;
      *) exit 97 ;;
    esac
    ;;
  iam:create-role)
    [[ "$scenario" == "apply_missing" ]] || exit 97
    argument --assume-role-policy-document "$@" >"$trust_json"
    printf '{"Role":{"Arn":"%s"}}\n' "$role_arn"
    ;;
  iam:update-assume-role-policy)
    [[ "$scenario" == "apply_existing" ]] || exit 97
    argument --policy-document "$@" >"$trust_json"
    printf '{}\n'
    ;;
  iam:put-role-policy)
    case "$scenario" in
      apply_missing|apply_existing)
        argument --policy-document "$@" >"$s3_json"
        printf '{}\n'
        ;;
      *) exit 97 ;;
    esac
    ;;
  iam:list-role-policies)
    [[ "$scenario" == "delete_clear" ]] || exit 97
    printf '%s\n' '{"PolicyNames":["board-ci-github-oidc-s3-ci"]}'
    ;;
  iam:list-attached-role-policies)
    [[ "$scenario" == "delete_clear" ]] || exit 97
    printf '%s\n' '{"AttachedPolicies":[]}'
    ;;
  iam:list-instance-profiles-for-role)
    [[ "$scenario" == "delete_clear" ]] || exit 97
    printf '%s\n' '{"InstanceProfiles":[]}'
    ;;
  iam:delete-role-policy|iam:delete-role)
    [[ "$scenario" == "delete_clear" ]] || exit 97
    printf '{}\n'
    ;;
  iam:list-open-id-connect-provider-tags)
    case "$scenario" in
      delete_missing) not_found ;;
      delete_unmanaged_provider) printf '%s\n' '{"Tags":[]}' ;;
      delete_shared_object|delete_shared_array|delete_clear|delete_malformed|delete_ambiguous|delete_roles_error)
        printf '%s\n' '{"Tags":[{"Key":"board-ci-oidc-setup","Value":"managed"}]}'
        ;;
      *) exit 97 ;;
    esac
    ;;
  iam:list-roles)
    case "$scenario" in
      delete_shared_object)
        printf '{"Roles":[{"RoleName":"other","AssumeRolePolicyDocument":{"Statement":{"Effect":"Allow","Principal":{"Federated":"%s"},"Action":"sts:AssumeRoleWithWebIdentity"}}}]}\n' "$provider_arn"
        ;;
      delete_shared_array)
        printf '{"Roles":[{"RoleName":"other","AssumeRolePolicyDocument":{"Statement":[{"Effect":"Allow","Principal":{"Federated":["%s"]},"Action":"sts:AssumeRoleWithWebIdentity"}]}}]}\n' "$provider_arn"
        ;;
      delete_clear)
        printf '%s\n' '{"Roles":[{"RoleName":"other","AssumeRolePolicyDocument":{"Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}}]}'
        ;;
      delete_malformed)
        printf '%s\n' '{"Roles":[{"RoleName":"other","AssumeRolePolicyDocument":{"Statement":"not-readable"}}]}'
        ;;
      delete_ambiguous)
        printf '%s\n' '{"Roles":[{"RoleName":"other","AssumeRolePolicyDocument":{"Statement":{"Effect":"Allow","Principal":{"Federated":42}}}}]}'
        ;;
      delete_roles_error) access_denied ;;
      *) exit 97 ;;
    esac
    ;;
  iam:delete-open-id-connect-provider)
    [[ "$scenario" == "delete_clear" ]] || exit 97
    printf '{}\n'
    ;;
  *)
    printf 'unexpected fake AWS call: %s %s\n' "$service" "$operation" >&2
    exit 97
    ;;
esac
EOF
chmod +x "${FAKE_BIN}/aws"

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

assert_contains() {
  [[ "$1" == *"$2"* ]] || fail "expected value to contain: $2"
}

assert_not_contains() {
  [[ "$1" != *"$2"* ]] || fail "expected value not to contain: $2"
}

reset_case() {
  : >"$CALL_LOG"
  rm -f "$TRUST_JSON" "$S3_JSON"
}

run_case() {
  local scenario="$1"
  shift
  reset_case
  set +e
  CASE_OUTPUT="$(
    PATH="${FAKE_BIN}:$PATH" \
      AWS_TEST_SCENARIO="$scenario" \
      AWS_TEST_CALL_LOG="$CALL_LOG" \
      AWS_TEST_TRUST_JSON="$TRUST_JSON" \
      AWS_TEST_S3_JSON="$S3_JSON" \
      AWS_REGION=us-east-1 \
      BUCKET=board-ci-test \
      "$SCRIPT" "$@" 2>&1
  )"
  CASE_STATUS=$?
  set -e
  CASE_CALLS="$(<"$CALL_LOG")"
}

assert_success() {
  [[ "$CASE_STATUS" -eq 0 ]] || fail "expected success, got ${CASE_STATUS}: ${CASE_OUTPUT}"
}

assert_failure() {
  [[ "$CASE_STATUS" -ne 0 ]] || fail "expected failure"
}

assert_exact_policies() {
  [[ -f "$TRUST_JSON" && -f "$S3_JSON" ]] || fail "expected captured policies"
  jq -e '
    . == {
      Version: "2012-10-17",
      Statement: [{
        Effect: "Allow",
        Principal: {Federated: "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"},
        Action: "sts:AssumeRoleWithWebIdentity",
        Condition: {StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:antstanley/bus:ref:refs/heads/main"
        }}
      }]
    }
  ' "$TRUST_JSON" >/dev/null || fail "trust policy differs from the exact expected document"
  jq -e '
    . == {
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "ListCiPrefix",
          Effect: "Allow",
          Action: "s3:ListBucket",
          Resource: "arn:aws:s3:::board-ci-test",
          Condition: {StringLike: {"s3:prefix": ["ci/*"]}}
        },
        {
          Sid: "ManageCiObjects",
          Effect: "Allow",
          Action: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
          Resource: "arn:aws:s3:::board-ci-test/ci/*"
        }
      ]
    }
  ' "$S3_JSON" >/dev/null || fail "S3 policy differs from the exact expected document"
}

# Plan paths must not invoke even the fake AWS CLI.
run_case plan_forbid --plan
assert_success
assert_contains "$CASE_OUTPUT" 'Plan only; no AWS calls will be executed.'
[[ -z "$CASE_CALLS" ]] || fail "--plan invoked AWS"
run_case plan_forbid --delete --plan
assert_success
assert_contains "$CASE_OUTPUT" 'Delete plan only; no AWS calls will be executed.'
[[ -z "$CASE_CALLS" ]] || fail "delete --plan invoked AWS"

# Missing resources are created, and generated policies must match exactly.
run_case apply_missing
assert_success
assert_contains "$CASE_CALLS" 'iam create-open-id-connect-provider'
assert_contains "$CASE_CALLS" 'iam create-role'
assert_contains "$CASE_CALLS" 'iam put-role-policy'
assert_exact_policies

# Existing resources are updated idempotently; a missing audience is added.
run_case apply_existing
assert_success
assert_contains "$CASE_CALLS" 'iam add-client-id-to-open-id-connect-provider'
assert_contains "$CASE_CALLS" 'iam update-assume-role-policy'
assert_not_contains "$CASE_CALLS" 'iam create-role'
assert_not_contains "$CASE_CALLS" 'iam create-open-id-connect-provider'
assert_exact_policies

# Existing unmanaged roles and AWS inspection errors fail before mutation.
run_case apply_unmanaged_role
assert_failure
assert_contains "$CASE_OUTPUT" 'is not managed by this script'
assert_not_contains "$CASE_CALLS" 'iam update-assume-role-policy'
assert_not_contains "$CASE_CALLS" 'iam put-role-policy'
run_case apply_provider_error
assert_failure
assert_contains "$CASE_OUTPUT" 'could not inspect the GitHub OIDC provider'
assert_not_contains "$CASE_CALLS" 'iam create-open-id-connect-provider'
assert_not_contains "$CASE_CALLS" 'iam get-role'

# Missing teardown resources are harmless; unmanaged resources are preserved.
run_case delete_missing --delete
assert_success
assert_contains "$CASE_OUTPUT" 'already absent'
assert_not_contains "$CASE_CALLS" 'iam delete-role'
assert_not_contains "$CASE_CALLS" 'iam delete-open-id-connect-provider'
run_case delete_unmanaged_provider --delete
assert_success
assert_contains "$CASE_OUTPUT" 'Preserved shared GitHub OIDC provider'
assert_not_contains "$CASE_CALLS" 'iam list-roles'
assert_not_contains "$CASE_CALLS" 'iam delete-open-id-connect-provider'
run_case delete_unmanaged_role --delete
assert_failure
assert_contains "$CASE_OUTPUT" 'refusing to delete role'
assert_not_contains "$CASE_CALLS" 'iam delete-role-policy'
assert_not_contains "$CASE_CALLS" 'iam delete-role '
assert_not_contains "$CASE_CALLS" 'iam list-open-id-connect-provider-tags'

# Both valid Statement encodings must retain a provider trusted by another role.
run_case delete_shared_object --delete
assert_success
assert_contains "$CASE_OUTPUT" 'another role still trusts it'
assert_not_contains "$CASE_CALLS" 'iam delete-open-id-connect-provider'
run_case delete_shared_array --delete
assert_success
assert_contains "$CASE_OUTPUT" 'another role still trusts it'
assert_not_contains "$CASE_CALLS" 'iam delete-open-id-connect-provider'

# Managed role/provider deletion proceeds only after all ownership/dependency checks.
run_case delete_clear --delete
assert_success
assert_contains "$CASE_CALLS" 'iam delete-role-policy'
assert_contains "$CASE_CALLS" 'iam delete-role'
assert_contains "$CASE_CALLS" 'iam list-roles'
assert_contains "$CASE_CALLS" 'iam delete-open-id-connect-provider'

# Malformed, ambiguous, or unreadable role trusts always fail closed.
run_case delete_malformed --delete
assert_failure
assert_contains "$CASE_OUTPUT" 'role trusts were malformed or ambiguous'
assert_not_contains "$CASE_CALLS" 'iam delete-open-id-connect-provider'
run_case delete_ambiguous --delete
assert_failure
assert_contains "$CASE_OUTPUT" 'role trusts were malformed or ambiguous'
assert_not_contains "$CASE_CALLS" 'iam delete-open-id-connect-provider'
run_case delete_roles_error --delete
assert_failure
assert_contains "$CASE_OUTPUT" 'could not inspect role trusts'
assert_not_contains "$CASE_CALLS" 'iam delete-open-id-connect-provider'

# Input validation remains strict and happens before any AWS call.
run_case plan_forbid --plan --bucket Bad_Bucket
assert_failure
[[ -z "$CASE_CALLS" ]] || fail "invalid bucket invoked AWS"
run_case plan_forbid --plan --branch 'main:*'
assert_failure
[[ -z "$CASE_CALLS" ]] || fail "invalid branch invoked AWS"

printf 'aws-ci-oidc-setup behavioral tests: pass\n'

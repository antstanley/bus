#!/usr/bin/env bash
set -euo pipefail

readonly OIDC_HOST="token.actions.githubusercontent.com"
readonly OIDC_URL="https://${OIDC_HOST}"
readonly OIDC_AUDIENCE="sts.amazonaws.com"
readonly MANAGED_TAG_KEY="board-ci-oidc-setup"
readonly MANAGED_TAG_VALUE="managed"

GITHUB_REPO="${GITHUB_REPO:-antstanley/bus}"
AWS_REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-}}"
BUCKET="${BUCKET:-}"
ROLE_NAME="${ROLE_NAME:-board-ci-github-oidc}"
CI_PREFIX="${CI_PREFIX:-ci/}"
BRANCH="${BRANCH:-main}"
MODE="apply"
PLAN=false

usage() {
  cat <<'EOF'
Usage: scripts/aws-ci-oidc-setup.sh [--plan | --delete] [options]

Create/update or delete the GitHub Actions OIDC role used by live AWS S3 CI.
Configuration may be supplied through flags or the matching environment names.

  --plan                 Print intended AWS calls; execute none
  --delete               Remove resources managed by this script
  --repo OWNER/REPO      GitHub repository (default: antstanley/bus)
  --region REGION        AWS region (or AWS_REGION/AWS_DEFAULT_REGION)
  --bucket BUCKET        S3 test bucket (or BUCKET)
  --role-name NAME       IAM role (default: board-ci-github-oidc)
  --ci-prefix PREFIX     S3 namespace under ci/ (default: ci/)
  --branch BRANCH        Trusted branch (default: main)
  -h, --help             Show this help

Use --plan together with --delete to preview teardown.
EOF
}

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

need_value() {
  [[ $# -ge 2 && -n "$2" ]] || die "$1 requires a value"
}

while (($# > 0)); do
  case "$1" in
    --plan)
      PLAN=true
      ;;
    --delete)
      MODE="delete"
      ;;
    --repo)
      need_value "$@"
      GITHUB_REPO="$2"
      shift
      ;;
    --region)
      need_value "$@"
      AWS_REGION="$2"
      shift
      ;;
    --bucket)
      need_value "$@"
      BUCKET="$2"
      shift
      ;;
    --role-name)
      need_value "$@"
      ROLE_NAME="$2"
      shift
      ;;
    --ci-prefix)
      need_value "$@"
      CI_PREFIX="$2"
      shift
      ;;
    --branch)
      need_value "$@"
      BRANCH="$2"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "unknown option: $1"
      ;;
  esac
  shift
done

command -v aws >/dev/null 2>&1 || die "aws CLI is required"
command -v jq >/dev/null 2>&1 || die "jq is required"

[[ "$GITHUB_REPO" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,99}/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$ ]] ||
  die "GITHUB_REPO must be an OWNER/REPO name"
[[ "$AWS_REGION" =~ ^[a-z0-9]+(-[a-z0-9]+)+-[0-9]+$ ]] ||
  die "AWS_REGION is required and must look like an AWS region"
[[ "$BUCKET" =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]] ||
  die "BUCKET must be a 3-63 character lowercase S3 bucket name"
[[ "$BUCKET" != *..* && ! "$BUCKET" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] ||
  die "BUCKET must not contain adjacent dots or use an IPv4 address"
[[ "$ROLE_NAME" =~ ^[A-Za-z0-9+=,.@_-]{1,64}$ ]] ||
  die "ROLE_NAME contains characters IAM does not allow"
[[ "$CI_PREFIX" =~ ^ci/([A-Za-z0-9._-]+/)*$ ]] ||
  die "CI_PREFIX must start with ci/, end with /, and contain only safe path segments"
[[ "$BRANCH" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$ ]] ||
  die "BRANCH contains unsupported characters"
[[ "$BRANCH" != *..* && "$BRANCH" != *//* && "$BRANCH" != *@\{* && "$BRANCH" != */ && "$BRANCH" != *. ]] ||
  die "BRANCH is not a safe Git ref name"

readonly POLICY_NAME="${ROLE_NAME}-s3-ci"

trust_policy() {
  local provider_arn="$1"
  jq -cn \
    --arg provider "$provider_arn" \
    --arg audience "$OIDC_AUDIENCE" \
    --arg subject "repo:${GITHUB_REPO}:ref:refs/heads/${BRANCH}" \
    '{
      Version: "2012-10-17",
      Statement: [{
        Effect: "Allow",
        Principal: {Federated: $provider},
        Action: "sts:AssumeRoleWithWebIdentity",
        Condition: {StringEquals: {
          "token.actions.githubusercontent.com:aud": $audience,
          "token.actions.githubusercontent.com:sub": $subject
        }}
      }]
    }'
}

s3_policy() {
  local partition="$1"
  jq -cn \
    --arg bucket_arn "arn:${partition}:s3:::${BUCKET}" \
    --arg list_prefix "${CI_PREFIX}*" \
    --arg object_arn "arn:${partition}:s3:::${BUCKET}/${CI_PREFIX}*" \
    '{
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "ListCiPrefix",
          Effect: "Allow",
          Action: "s3:ListBucket",
          Resource: $bucket_arn,
          Condition: {StringLike: {"s3:prefix": [$list_prefix]}}
        },
        {
          Sid: "ManageCiObjects",
          Effect: "Allow",
          Action: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
          Resource: $object_arn
        }
      ]
    }'
}

print_aws() {
  printf '+ aws --no-cli-pager --region %q' "$AWS_REGION"
  printf ' %q' "$@"
  printf '\n'
}

print_secret_instruction() {
  local role_arn="$1"
  printf '\nSet the non-credential repository configuration with:\n'
  printf 'gh secret set AWS_ROLE_ARN --repo %q --body %q\n' "$GITHUB_REPO" "$role_arn"
  printf 'gh secret set BOARD_S3_TEST_BUCKET --repo %q --body %q\n' "$GITHUB_REPO" "$BUCKET"
  printf 'gh secret set AWS_REGION --repo %q --body %q\n' "$GITHUB_REPO" "$AWS_REGION"
  printf 'No AWS access key or session token is stored in GitHub.\n'
}

plan_apply() {
  local provider_arn="arn:\${PARTITION}:iam::\${ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"
  local role_arn="arn:\${PARTITION}:iam::\${ACCOUNT_ID}:role/${ROLE_NAME}"
  local trust s3
  trust="$(trust_policy "$provider_arn")"
  s3="$(s3_policy "\${PARTITION}")"

  printf 'Plan only; no AWS calls will be executed. Conditional create/update calls are both shown.\n'
  print_aws sts get-caller-identity --output json
  print_aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$provider_arn" --output json
  # AWS verifies GitHub's public TLS chain against its trusted root CAs, so a
  # caller-supplied thumbprint is deliberately omitted.
  print_aws iam create-open-id-connect-provider --url "$OIDC_URL" --client-id-list "$OIDC_AUDIENCE" \
    --tags "Key=${MANAGED_TAG_KEY},Value=${MANAGED_TAG_VALUE}" --output json
  print_aws iam add-client-id-to-open-id-connect-provider --open-id-connect-provider-arn "$provider_arn" \
    --client-id "$OIDC_AUDIENCE"
  print_aws iam get-role --role-name "$ROLE_NAME" --output json
  print_aws iam create-role --role-name "$ROLE_NAME" --assume-role-policy-document "$trust" \
    --tags "Key=${MANAGED_TAG_KEY},Value=${MANAGED_TAG_VALUE}" --output json
  print_aws iam update-assume-role-policy --role-name "$ROLE_NAME" --policy-document "$trust"
  print_aws iam put-role-policy --role-name "$ROLE_NAME" --policy-name "$POLICY_NAME" --policy-document "$s3"
  printf '\nTrust policy:\n%s\n\nS3 policy:\n%s\n' "$(jq . <<<"$trust")" "$(jq . <<<"$s3")"
  print_secret_instruction "$role_arn"
}

plan_delete() {
  local provider_arn="arn:\${PARTITION}:iam::\${ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"
  printf 'Delete plan only; no AWS calls will be executed. Ownership and dependency checks precede deletion.\n'
  print_aws sts get-caller-identity --output json
  print_aws iam get-role --role-name "$ROLE_NAME" --output json
  print_aws iam list-role-tags --role-name "$ROLE_NAME" --output json
  print_aws iam list-role-policies --role-name "$ROLE_NAME" --output json
  print_aws iam list-attached-role-policies --role-name "$ROLE_NAME" --output json
  print_aws iam list-instance-profiles-for-role --role-name "$ROLE_NAME" --output json
  print_aws iam delete-role-policy --role-name "$ROLE_NAME" --policy-name "$POLICY_NAME"
  print_aws iam delete-role --role-name "$ROLE_NAME"
  print_aws iam list-open-id-connect-provider-tags --open-id-connect-provider-arn "$provider_arn" --output json
  print_aws iam list-roles --output json
  print_aws iam list-roles --output json
  print_aws iam delete-open-id-connect-provider --open-id-connect-provider-arn "$provider_arn"
  printf 'The provider deletion is skipped unless this script created it and no role still trusts it.\n'
  printf 'The second complete role-trust scan is fresh and runs immediately before provider deletion.\n'
  printf 'Ordering assumption: run --delete as the only operator changing IAM role trusts; AWS cannot make the final scan and provider deletion atomic.\n'
}

if [[ "$PLAN" == true ]]; then
  if [[ "$MODE" == "delete" ]]; then
    plan_delete
  else
    plan_apply
  fi
  exit 0
fi

aws_cli() {
  aws --no-cli-pager --region "$AWS_REGION" "$@"
}

capture_aws() {
  local destination="$1"
  shift
  local captured status
  if captured="$(aws_cli "$@" 2>&1)"; then
    printf -v "$destination" '%s' "$captured"
    return 0
  else
    status=$?
    printf -v "$destination" '%s' "$captured"
    return "$status"
  fi
}

is_not_found() {
  [[ "$1" == *NoSuchEntity* || "$1" == *NoSuchEntityException* ]]
}

is_already_exists() {
  [[ "$1" == *EntityAlreadyExists* || "$1" == *EntityAlreadyExistsException* ]]
}

managed_tag_present() {
  jq -e \
    --arg key "$MANAGED_TAG_KEY" \
    --arg value "$MANAGED_TAG_VALUE" \
    '(.Tags // []) | any(.Key == $key and .Value == $value)' >/dev/null <<<"$1"
}

provider_reference_state() {
  local roles_json="$1"
  local provider="$2"
  jq -er --arg provider "$provider" '
    def statements:
      .AssumeRolePolicyDocument as $policy
      | if ($policy | type) != "object" then
          error("role trust policy is not an object")
        elif ($policy.Statement | type) == "object" then
          [$policy.Statement]
        elif ($policy.Statement | type) == "array" and ($policy.Statement | length) > 0 then
          $policy.Statement
        else
          error("role trust policy Statement is neither an object nor an array")
        end;
    def federated_principals:
      if type != "object" then
        error("trust policy statement is not an object")
      elif (has("Principal") | not) then
        empty
      elif .Principal == null then
        error("trust policy Principal is null")
      elif (.Principal | type) == "string" then
        empty
      elif (.Principal | type) != "object" then
        error("trust policy Principal has an unsupported type")
      elif (.Principal | has("Federated") | not) then
        empty
      elif (.Principal.Federated | type) == "string" and (.Principal.Federated | length) > 0 then
        .Principal.Federated
      elif (.Principal.Federated | type) == "array"
          and (.Principal.Federated | length) > 0
          and all(.Principal.Federated[]; type == "string" and length > 0) then
        .Principal.Federated[]
      else
        error("trust policy Federated principal has an unsupported type")
      end;
    if type != "object" or (.Roles | type) != "array" then
      error("list-roles response does not contain a Roles array")
    elif has("IsTruncated") and (.IsTruncated | type) != "boolean" then
      error("list-roles response has malformed pagination state")
    elif (.IsTruncated // false) then
      error("list-roles response is truncated")
    elif has("Marker") or has("NextToken") then
      error("list-roles response contains an unexpected pagination marker")
    else
      [
        .Roles[]
        | if type == "object" then . else error("role entry is not an object") end
        | statements[]
        | federated_principals
        | select(. == $provider)
      ]
      | if length > 0 then "referenced" else "clear" end
    end
  ' <<<"$roles_json"
}

identity_json="$(aws_cli sts get-caller-identity --output json)"
account_id="$(jq -er '.Account | strings | select(test("^[0-9]{12}$"))' <<<"$identity_json")" ||
  die "could not discover a 12-digit AWS account ID"
caller_arn="$(jq -er '.Arn | strings | select(startswith("arn:"))' <<<"$identity_json")" ||
  die "could not discover the AWS partition"
partition_tail="${caller_arn#arn:}"
partition="${partition_tail%%:*}"
[[ "$partition" =~ ^aws(-[a-z0-9-]+)?$ ]] || die "unsupported AWS partition in caller ARN"

provider_arn="arn:${partition}:iam::${account_id}:oidc-provider/${OIDC_HOST}"
role_arn="arn:${partition}:iam::${account_id}:role/${ROLE_NAME}"

apply_resources() {
  local provider_json provider_error role_json role_error tags_json output trust s3
  if capture_aws provider_json iam get-open-id-connect-provider \
    --open-id-connect-provider-arn "$provider_arn" --output json; then
    if ! jq -e --arg audience "$OIDC_AUDIENCE" \
      '(.ClientIDList // []) | index($audience) != null' >/dev/null <<<"$provider_json"; then
      aws_cli iam add-client-id-to-open-id-connect-provider \
        --open-id-connect-provider-arn "$provider_arn" --client-id "$OIDC_AUDIENCE"
    fi
  else
    provider_error="$provider_json"
    if ! is_not_found "$provider_error"; then
      printf '%s\n' "$provider_error" >&2
      die "could not inspect the GitHub OIDC provider"
    fi
    if ! capture_aws output iam create-open-id-connect-provider \
      --url "$OIDC_URL" --client-id-list "$OIDC_AUDIENCE" \
      --tags "Key=${MANAGED_TAG_KEY},Value=${MANAGED_TAG_VALUE}" --output json; then
      if is_already_exists "$output"; then
        provider_json="$(aws_cli iam get-open-id-connect-provider \
          --open-id-connect-provider-arn "$provider_arn" --output json)"
        if ! jq -e --arg audience "$OIDC_AUDIENCE" \
          '(.ClientIDList // []) | index($audience) != null' >/dev/null <<<"$provider_json"; then
          aws_cli iam add-client-id-to-open-id-connect-provider \
            --open-id-connect-provider-arn "$provider_arn" --client-id "$OIDC_AUDIENCE"
        fi
      else
        printf '%s\n' "$output" >&2
        die "could not create the GitHub OIDC provider"
      fi
    fi
  fi

  trust="$(trust_policy "$provider_arn")"
  if capture_aws role_json iam get-role --role-name "$ROLE_NAME" --output json; then
    tags_json="$(aws_cli iam list-role-tags --role-name "$ROLE_NAME" --output json)"
    managed_tag_present "$tags_json" ||
      die "role ${ROLE_NAME} already exists but is not managed by this script; choose another ROLE_NAME"
    aws_cli iam update-assume-role-policy --role-name "$ROLE_NAME" --policy-document "$trust"
    role_arn="$(jq -er '.Role.Arn' <<<"$role_json")"
  else
    role_error="$role_json"
    if ! is_not_found "$role_error"; then
      printf '%s\n' "$role_error" >&2
      die "could not inspect role ${ROLE_NAME}"
    fi
    if capture_aws role_json iam create-role --role-name "$ROLE_NAME" \
      --assume-role-policy-document "$trust" \
      --tags "Key=${MANAGED_TAG_KEY},Value=${MANAGED_TAG_VALUE}" --output json; then
      role_arn="$(jq -er '.Role.Arn' <<<"$role_json")"
    elif is_already_exists "$role_json"; then
      die "role ${ROLE_NAME} was created concurrently; rerun to verify ownership before updating"
    else
      printf '%s\n' "$role_json" >&2
      die "could not create role ${ROLE_NAME}"
    fi
  fi

  s3="$(s3_policy "$partition")"
  aws_cli iam put-role-policy --role-name "$ROLE_NAME" --policy-name "$POLICY_NAME" \
    --policy-document "$s3"

  printf 'AWS_ROLE_ARN=%s\n' "$role_arn"
  print_secret_instruction "$role_arn"
}

delete_resources() {
  local role_json role_error tags_json inline_json attached_json profiles_json provider_tags roles_json output reference_state
  local final_roles_json final_reference_state
  if capture_aws role_json iam get-role --role-name "$ROLE_NAME" --output json; then
    tags_json="$(aws_cli iam list-role-tags --role-name "$ROLE_NAME" --output json)"
    managed_tag_present "$tags_json" ||
      die "refusing to delete role ${ROLE_NAME}: it is not managed by this script"

    inline_json="$(aws_cli iam list-role-policies --role-name "$ROLE_NAME" --output json)"
    attached_json="$(aws_cli iam list-attached-role-policies --role-name "$ROLE_NAME" --output json)"
    profiles_json="$(aws_cli iam list-instance-profiles-for-role --role-name "$ROLE_NAME" --output json)"
    jq -e --arg policy "$POLICY_NAME" \
      'all((.PolicyNames // [])[]; . == $policy)' >/dev/null <<<"$inline_json" ||
      die "refusing to delete role ${ROLE_NAME}: it has an inline policy not managed by this script"
    jq -e '(.AttachedPolicies // []) | length == 0' >/dev/null <<<"$attached_json" ||
      die "refusing to delete role ${ROLE_NAME}: it has attached managed policies"
    jq -e '(.InstanceProfiles // []) | length == 0' >/dev/null <<<"$profiles_json" ||
      die "refusing to delete role ${ROLE_NAME}: it belongs to an instance profile"

    if ! capture_aws output iam delete-role-policy --role-name "$ROLE_NAME" --policy-name "$POLICY_NAME"; then
      is_not_found "$output" || {
        printf '%s\n' "$output" >&2
        die "could not delete inline policy ${POLICY_NAME}"
      }
    fi
    aws_cli iam delete-role --role-name "$ROLE_NAME"
    printf 'Deleted managed IAM role %s.\n' "$ROLE_NAME"
  else
    role_error="$role_json"
    if is_not_found "$role_error"; then
      printf 'IAM role %s is already absent.\n' "$ROLE_NAME"
    else
      printf '%s\n' "$role_error" >&2
      die "could not inspect role ${ROLE_NAME}"
    fi
  fi

  if capture_aws provider_tags iam list-open-id-connect-provider-tags \
    --open-id-connect-provider-arn "$provider_arn" --output json; then
    if ! managed_tag_present "$provider_tags"; then
      printf 'Preserved shared GitHub OIDC provider (not created by this script).\n'
      return
    fi
    if ! capture_aws roles_json iam list-roles --output json; then
      printf '%s\n' "$roles_json" >&2
      die "refusing to delete the GitHub OIDC provider: could not inspect role trusts"
    fi
    if ! reference_state="$(provider_reference_state "$roles_json" "$provider_arn" 2>&1)"; then
      printf '%s\n' "$reference_state" >&2
      die "refusing to delete the GitHub OIDC provider: role trusts were malformed or ambiguous"
    fi
    if [[ "$reference_state" == "referenced" ]]; then
      printf 'Preserved managed GitHub OIDC provider because another role still trusts it.\n'
      return
    fi
    [[ "$reference_state" == "clear" ]] ||
      die "refusing to delete the GitHub OIDC provider: unknown role trust state"

    # AWS has no atomic "delete if unreferenced" operation. This fresh,
    # auto-paginated complete scan runs immediately before deletion to narrow
    # that ordering window; safety still assumes a single operator is changing
    # relevant IAM role trusts while --delete runs.
    if ! capture_aws final_roles_json iam list-roles --output json; then
      printf '%s\n' "$final_roles_json" >&2
      die "refusing to delete the GitHub OIDC provider: could not complete the final role trust inspection"
    fi
    if ! final_reference_state="$(provider_reference_state "$final_roles_json" "$provider_arn" 2>&1)"; then
      printf '%s\n' "$final_reference_state" >&2
      die "refusing to delete the GitHub OIDC provider: final role trusts were malformed or ambiguous"
    fi
    if [[ "$final_reference_state" == "referenced" ]]; then
      printf 'Preserved managed GitHub OIDC provider because a role trusted it during the final inspection.\n'
      return
    fi
    [[ "$final_reference_state" == "clear" ]] ||
      die "refusing to delete the GitHub OIDC provider: unknown final role trust state"
    aws_cli iam delete-open-id-connect-provider --open-id-connect-provider-arn "$provider_arn"
    printf 'Deleted unused GitHub OIDC provider created by this script.\n'
  elif is_not_found "$provider_tags"; then
    printf 'GitHub OIDC provider is already absent.\n'
  else
    printf '%s\n' "$provider_tags" >&2
    die "could not inspect GitHub OIDC provider tags"
  fi
}

if [[ "$MODE" == "delete" ]]; then
  delete_resources
else
  apply_resources
fi

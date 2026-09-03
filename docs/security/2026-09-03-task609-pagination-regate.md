# security-diff-scan — task 609 re-gate: OIDC delete pagination fail-closed (review-only)

- Repo: /Volumes/Delorean/code/sidekick/tmp
- Base pinned: 809cd87d8fd7932756db55814bf55f3b4ebf9f13 (= HEAD at pin; the change under review is the uncommitted
  working-tree diff on the three scoped paths). Gate-baseline script version pinned from 0f7a5da (the 608 fix commit).
- Scope: scripts/aws-ci-oidc-setup.sh, scripts/aws-ci-oidc-setup.test.sh, backlog/609-oidc-delete-pagination-failclosed.md
- Pinned diff digest (sha256): d4eea6e27a5452af95dd8192a65fa093e91d47a773d375f821f54fb3ce368c01
- Snapshot SHA256SUMS: verified OK at pin and re-verified OK at finalize (03_snapshot/SHA256SUMS)
- Drift at re-verify: NONE — live scoped diff re-generated at finalize is byte-identical to pinned change.diff
  (both sha256 d4eea6e2…368c01); HEAD still 809cd87.

## Focus-point results

1. PASS — Incomplete pagination can never reach the delete. Both list-roles captures (initial setup.sh:447,
   final setup.sh:466) route through the single `provider_reference_state` jq filter (setup.sh:268–324), whose
   added elif chain (setup.sh:307–312) rejects: non-boolean IsTruncated (any type incl. string/number/null-with-
   marker/0/false-string), IsTruncated:true, and any presence of Marker/NextToken (even null-valued or paired
   with IsTruncated:false); absent/false with no marker proceeds. jq 1.8.2 accept/reject table probed locally.
   Marker/NextToken never resolves pages — it always errors (fail closed). Captures are whole-document
   (`$(aws_cli … --output json)`), so a malformed capture is rejected at `type != "object"` or jq parse failure.
2. PASS — 608 guarantees preserved. Same single jq filter and error() fail-closed handling for both scans
   (`2>&1` capture → die); capture_aws non-zero → die; jq presence checked at startup before any AWS call;
   fresh complete final scan remains the last AWS call immediately before delete (setup.sh:466–480; no AWS call
   in between, only local jq/string work); exact tag equality unchanged (managed_tag_present, `==` on key and
   value); single-operator documentation intact at setup.sh:222–223 and 462–465.
3. PASS — Regression tests genuinely exercise truncated/complete capture discrimination. Fake-AWS list-roles
   returns truncated/`"false"`/marker-final bodies only on scan_number ≥ 2 after a clean scan 1 (test.sh:159–199),
   distinguishing truncated from complete captures; assertions require the setup script to fail with the specific
   pagination error text, exact list-roles call counts (1 or 2), and no delete-open-id-connect-provider call
   (test.sh:437–458). Statically read only; tests not executed (hard rule).
4. PASS — Scope discipline. Full-file diff of pinned gate-baseline (0f7a5da) vs pinned working-tree script is
   ONLY the 6 added lines (setup.sh:307–312); zero other changes. Test-file delta vs the 0f7a5da baseline is only
   the four pagination scenarios and their assertions. Repo-wide working-tree diff vs 809cd87 touches exactly the
   three scoped files plus unrelated concurrent DESIGN/packages/* work — all out of scope and ignored.

## Findings

None reportable. New jq/shell lines reviewed: all strings are single-quoted, provider ARN passed via --arg,
output consumed internally; error handling is uniformly fail-closed; no secrets in changed lines.

## Suppressed / lower-severity (not gate-blocking)

- LOW→resolved-by-this-fix lineage only: the 608 LOW finding is what this diff fixes; no residue.
- INFO (pre-existing, unchanged lines): `has("Marker")` also fires on a null-valued `Marker` — conservative
  (fail closed), so no defect; noted for awareness that a JSON `null` Marker on a genuinely complete page would
  be rejected.
- INFO (pre-existing, unchanged lines): non-boolean IsTruncated=null (marker absent) is treated as absent
  (`// false`) rather than rejected; inconsistent with the strict-typing of present non-boolean values but
  still fail-safe (treated as complete only when AWS omits the field, matching absent-field semantics).
- INFO (pre-existing, unchanged lines): only the provider-delete teardown path is covered by pagination gating;
  other IAM list calls in --delete (list-role-tags, list-role-policies, list-attached-role-policies,
  list-instance-profiles-for-role) still rely on implicit auto-pagination, same residual class as the 608
  finding but lower impact (they gate role deletion, not provider deletion).

## Not checked and why

- Behavioral tests not executed (hard rule: no execution of reviewed scripts); all test-pass claims are static.
- Real AWS pagination behavior not verified live (no network/AWS); analysis is on captured-response shapes only.
- backlog/608 file no longer exists in the working tree (git status untracked/modified list has no backlog/608*;
  its content was recovered from history via `git cat-file 700e36d:backlog/608-…md`) — background only, no
  impact on this review.
- Standard security-diff-scan Skill tool not in this sub-agent's toolset; the written pipeline was followed
  manually (pin → context → static diff review → local analyzers → drift re-verify → seal).

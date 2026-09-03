---
id: 609
title: OIDC setup --delete: fail closed on truncated list-roles pagination
phase: 6
owner: unassigned
status: todo
depends: [608]
estimate: S
---
From the 608 security gate (docs/security/...608...). LOW, accepted in writing at commit. The
role-trust scans (scripts/aws-ci-oidc-setup.sh:441,460) rely on implicit AWS CLI auto-pagination
and do not fail closed on a truncated single-page capture; under a non-default CLI config a
referencing role could be missed before provider delete. Availability/edge, teardown path.

## Definition of done
- [ ] each list-roles capture fails closed unless jq -e '(.IsTruncated // false) | not' accepts it, or paginates explicitly
- [ ] test with a truncated (IsTruncated:true) capture proves the delete refuses

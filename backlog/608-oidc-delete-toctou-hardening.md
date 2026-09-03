---
id: 608
title: OIDC setup --delete: re-inspect provider references immediately before deletion (TOCTOU)
phase: 6
owner: unassigned
status: todo
depends: [607]
estimate: S
---
From the 601/607 security re-gate (docs/security/2026-09-03-task601-607-ci-oidc-gate.md). LOW,
accepted in writing at commit. scripts/aws-ci-oidc-setup.sh --delete inspects provider trust
references and then deletes in two unsynchronized calls; a role trust created in that window would
be orphaned (AWS does no reference protection on provider deletion). Availability-only,
single-operator assumption, outside the documented threat model.

## Definition of done
- [ ] --delete re-inspects provider_reference_state over a fresh list-roles immediately before the delete and refuses on anything but clear
- [ ] the single-operator ordering assumption is documented at the call site, in --delete --plan output, and in the README

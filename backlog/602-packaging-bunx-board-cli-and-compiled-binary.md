---
id: 602
title: packaging: bunx @board/cli and compiled binary
phase: 6
owner: opencode
status: gated
depends: [103]
estimate: S
---
Publishable packages and a single-file binary.

## Definition of done
- [ ] bun build --compile artifacts for macOS/Linux; smoke test in CI

## Integration gate — 2026-09-05

Implementation and independent review are complete; platform CI is pending the
integration push. This is not an npm publication or a completed cross-platform
native-smoke claim.

- Correctness scoped READY: `20260905T151609Z-opencode-reviewer-5535`.
- Isolated full integration READY: `20260905T200005Z-opencode-reviewer-22d6`;
  exact 12-file manifest: `20260905T200337Z-opencode-reviewer-0b80`.
- Tested `0642428` plus only the 12 packaging paths, excluding other WIP:
  271 tests passed, one live-S3 skip, zero failures; root typecheck, package
  build/installed smoke and native Darwin ARM64 compile/smoke passed.
- Other native platform runs remain pending CI. Initial snapshot environment
  override was corrected and tests rerun without source changes.
- Security ACCEPT with no open findings after shared-parser N-1 remediation:
  `docs/security/2026-09-05-task602-n1-delta-gate.md`; earlier findings and
  fixes retained in the packaging review and fix re-gate reports.
- Exact integration scope: workflow, .gitignore, root README/package/tsconfig,
  CLI README/DISTRIBUTION, distribution entry, shared parser, build/smoke
  scripts and distribution tests. No unrelated files or lock changes.
- Reviewer cleanup complete; owner confirms task cleanup after push.

Lead will record platform CI results, then mark done and archive this task.

---
id: 602
title: packaging: bunx @board/cli and compiled binary
phase: 6
owner: opencode
status: done
depends: [103]
estimate: S
---
Publishable packages and a single-file binary.

## Definition of done
- [x] bun build --compile artifacts for macOS/Linux; smoke test in CI

## Integration gate — 2026-09-05

Implementation, independent review and platform CI are complete. Owner cleanup
confirmation is pending before archival. No npm publication was performed.

- Correctness scoped READY: `20260905T151609Z-opencode-reviewer-5535`.
- Isolated full integration READY: `20260905T200005Z-opencode-reviewer-22d6`;
  exact 12-file manifest: `20260905T200337Z-opencode-reviewer-0b80`.
- Tested `0642428` plus only the 12 packaging paths, excluding other WIP:
  271 tests passed, one live-S3 skip, zero failures; root typecheck, package
  build/installed smoke and native Darwin ARM64 compile/smoke passed.
- All four native platforms passed CI (see below). Initial snapshot environment
  override was corrected and tests rerun without source changes.
- Security ACCEPT with no open findings after shared-parser N-1 remediation:
  `docs/security/2026-09-05-task602-n1-delta-gate.md`; earlier findings and
  fixes retained in the packaging review and fix re-gate reports.
- Exact integration scope: workflow, .gitignore, root README/package/tsconfig,
  CLI README/DISTRIBUTION, distribution entry, shared parser, build/smoke
  scripts and distribution tests. No unrelated files or lock changes.
- Reviewer cleanup complete; owner confirms task cleanup after push.

## Pushed revision and CI

- Code commit: `43a883a54146b847bd88570b3a40942cd1b31ca9`, pushed to origin/main.
- Root CI: run `33989072532`, success.
- Packaging CI: run `33989072441`, success on the exact commit, canonical
  repository push event. All four native jobs passed package and executable
  smoke tests, manifest generation, artifact and manifest upload:
  linux-x64, linux-arm64, darwin-x64 and darwin-arm64.
- Lead verified eight nonexpired artifacts in that run (four payload bundles
  and four matching manifest bundles). No PR/untrusted-run artifacts substituted.
- CI evidence: https://github.com/antstanley/bus/actions/runs/33989072441

Lead will record owner cleanup confirmation, then mark done and archive.

Owner cleanup confirmed `20260906T081827Z-opencode-38a5` and reconciled in
`20260906T082303Z-opencode-2f08`: no task dist/tarballs/binaries, scratch,
build/test processes, worktrees, branches or stashes; audit reports retained.
Persistent bus monitoring is session infrastructure, not a602 artifact.
Administrative closure/archive can now proceed with the existing CI evidence.

Lead closes and archives602: reviewed code already pushed in43a883a, required
four-platform CI and owner cleanup confirmed. No npm publication authorized
or performed, no new code in this administrative closure.

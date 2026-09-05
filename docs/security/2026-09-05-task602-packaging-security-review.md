# Packaging changeset — bunx-runnable board CLI + compiled binary (task 602)

Security review of the task 602 packaging changeset. Review-only: nothing in the
repo was modified by this review. The working tree is shared and dirty with
other agents' concurrent work; only this report was written.

- Date: 2026-09-05
- Reviewer: opencode clean security sub-agent (no prior context, no conversation inheritance)
- Base HEAD at pin: `463ff6588d3e70d61561fc5d8bd528b4677a6b7a6b7a` (expected 463ff65…; unchanged)
- Threat-model lens: `docs/research/04-trust.md` (untrusted store, dev-machine compromise, message hygiene)

## VERDICT: ACCEPT-WITH-FIXES

One major documentation-level trust-boundary finding (F-1): the standalone-binary
distribution doc directs users to download and run CI workflow artifacts with no
provenance or integrity guidance, while the workflow itself runs on `pull_request`
and therefore produces identically named artifacts from fork-supplied code. Code,
build, smoke, and workflow mechanics are otherwise clean. Fix F-1 before
advertising the artifact channel; F-2 is a one-line hardening worth taking in the
same change. No blocker findings.

## Pinned hashes

Per-file sha256 at review time (working-tree state):

| File | sha256 | tracked state |
|---|---|---|
| `.github/workflows/packaging.yml` | `4eab47894a9de038f7798b22ea309631a790faadbda76126ffb809cc043ee959` | untracked (new) |
| `.gitignore` | `6e7fcc23013bf04bb33c147a1ca6a07eae2926d0ecd7c32f4650661cd045df90` | modified |
| `README.md` | `c659cbe34ea3442905a5a4b9b776e38164d67b6b429a72894c8b92ce4b0e99c3` | modified |
| `package.json` | `4279f190d1194d1c94bfed320a0ddfb7f9757783232b6e9d17ff69d5b42fc5e5` | modified |
| `tsconfig.json` | `c757cc05b79191a6f8ae8bf845eac6f67cf9155c3b57f954711cd7b0af3149a6` | modified |
| `packages/cli/README.md` | `40f8b909fa1e381abc00b4e531d70e5b218e1041dafa8c6b0cdb700daa766681` | modified |
| `packages/cli/DISTRIBUTION.md` | `ee9216e7ff1c0527f5f30aeb84bd763c54c9ac844560843312d01c5d8517478f` | untracked (new) |
| `packages/cli/src/distribution.ts` | `9b45699c7d0e928a724dfc2fadeac847d3ce9fb9200289514268413c3fb3ba10` | untracked (new) |
| `packages/cli/scripts/build.ts` | `be1489956f2d1b580ea4e5c2bee4cdf05eaa0f3d6e7e2a62400e0403e11bdef5` | untracked (new, under new `scripts/`) |
| `packages/cli/scripts/smoke.ts` | `e34ff2076cb3da60a3fb0c2c78b773c80da50e77d105f7c4c1ba66d5a2d5ef5f` | untracked (new, under new `scripts/`) |

- Scoped diff sha256 (`git diff` over the five tracked scoped files; untracked
  files contribute nothing to `git diff` and are pinned by their per-file hashes
  above): `ca7d37828545b73307abdabf5830e63e4f416e4a77d301a21211d4766bf780a5`
- Untracked scoped files: `.github/workflows/packaging.yml`,
  `packages/cli/DISTRIBUTION.md`, `packages/cli/src/distribution.ts`,
  `packages/cli/scripts/build.ts`, `packages/cli/scripts/smoke.ts`.

## Scope and method

Scope: exactly the ten files listed above at working-tree state, plus context
reads of `packages/cli/package.json`, `packages/cli/src/index.ts`,
`packages/mcp/package.json`, `DESIGN.md`, `docs/research/04-trust.md`, and one
prior report for format (`docs/security/2026-09-05-task127-security-md-docgate.md`).
Method: every scoped file read end to end; the CLI's argument parser and install
dispatch (`packages/cli/src/index.ts`) were read around the entry points
packaging exercises (`--help` handling, `install` gate) to verify the fail-closed
claims; hashes pinned with `shasum -a 256` and `git diff`. No security-audit
skill invoked; manual audit along the packaging/CI/distribution focus list.

Threat-model summary (2–4 lines): the store is untrusted and dev-machine
compromise is the top-ranked risk, so distribution channels that put executable
code on a developer machine are in scope even though board posts are not
involved. CI executes PR-supplied code by design, so the review focuses on what
that code can reach (token scope, secrets, artifact trust), on command/argument
handling in build and smoke scripts, and on documentation claims that could make
users trust an unverified channel.

## Findings

| # | Severity | Location | Defect | Fix |
|---|----------|----------|--------|-----|
| F-1 | major | `packages/cli/DISTRIBUTION.md:29-34` (with `.github/workflows/packaging.yml:3-6`) | The binary distribution doc instructs: "Download the matching workflow artifact, make it executable, and run it directly", with no statement of which workflow runs are trustworthy and no checksum to verify against. The workflow triggers on `pull_request`, so fork-PR runs execute fork-supplied build/smoke code and upload artifacts with the same names (`board-<target>`) as main-branch runs. Under `docs/research/04-trust.md`, telling users to run an artifact that may originate from an untrusted code path, without provenance or integrity checks, is a trust-boundary defect in the documented channel (dev-machine compromise is the model's top-ranked risk). | State in DISTRIBUTION.md that only artifacts from runs of the canonical repository's `main` branch (or maintainer-attested release runs) are trusted, and have CI print a sha256 manifest for the four binaries and tarball in the run summary; instruct users to verify the digest against that attested run before executing. Alternatively restrict the workflow trigger (e.g. drop `pull_request` or scope it to trusted branches) so untrusted-code artifacts never appear alongside release artifacts. |
| F-2 | minor | `.github/workflows/packaging.yml:29-30` | `actions/checkout` is used with default `persist-credentials: true`, leaving the job-scoped GITHUB_TOKEN in the checkout's git config for the rest of the job — a job whose later steps execute repository-supplied scripts (`bun run build:cli`, smoke). The workflow-level `permissions: contents: read` and absence of secrets bound the impact to a read-only token, but the workflow never pushes, so persisting the credential is unnecessary exposure for PR-supplied code paths. | Add `with: persist-credentials: false` to the checkout step. |
| F-3 | nit (downgraded) | `packages/cli/scripts/smoke.ts:39` | Tarball extraction relies on the `tar` default handling of absolute/parent-relative member paths rather than an explicit safe-extraction mode. Explicitly downgraded to a nit: the tarball is produced in the same job from an allowlisted manifest, and smoke verifies the extracted tree against an exact expected listing (`smoke.ts:47`), so under this repo's trust model there is no realistic untrusted-input path. If smoke is ever pointed at third-party tarballs, add explicit member-path validation before extraction. | None required now; revisit if the input trust changes. |
| F-4 | nit | `packages/cli/src/distribution.ts:13` | The compiled-binary install gate is `BOARD_COMPILED && …`, which defaults open: if a future compile path omitted the `--define BOARD_COMPILED=true` flag, the identifier would be unresolved and the gate would silently stop rejecting `install`, allowing configuration writes that point at a nonexistent runtime layout. Today `build.ts:57` is the only compile path and always passes the define, so this is defensive hardening, not an exploitable defect. | Invert to fail-closed: gate on `typeof BOARD_COMPILED === "undefined" \|\| BOARD_COMPILED` (or assert the define at startup) so an omitted define disables `install` rather than enabling it. |

## Explicitly reviewed and clean

- **Workflow injection surface** (`packaging.yml`): no `${{ github.event.* }}`,
  PR-title, branch-name, or artifact-name interpolation into `run:` or script
  contexts; the only expressions are the static `matrix.target` values defined
  in the workflow file itself. No `pull_request_target`, no secrets, no publish
  step, no cache steps (no cache-poisoning surface), `permissions: contents:
  read` at workflow level, `timeout-minutes` set, `if-no-files-found: error`.
- **Action pinning**: `actions/checkout`, `oven-sh/setup-bun`, and
  `actions/upload-artifact` are all pinned to full commit SHAs with version
  comments, matching the README's reproducibility claims; `bun-version: 1.4.0`
  matches `packageManager` and the lockfile; `bun install --frozen-lockfile`
  with a tracked `bun.lock` prevents floating CI dependencies.
- **Fork-PR trust inside the job**: `pull_request` (not `pull_request_target`)
  means fork runs get a read-only token and no secrets; the job uploads but
  never downloads artifacts, so no cross-run artifact trust boundary is crossed
  within the workflow (the artifact-consumption side is F-1).
- **build.ts**: all child processes spawned as argv arrays (`Bun.spawn`), no
  shell interpolation; repo root derived from `import.meta.dir` with fixed
  relative components; compile targets validated against an allowlist before
  use (build.ts:50-52); the npm manifest has an explicit `files` allowlist, no
  lifecycle scripts, no `private` flag, exact-pinned sole dependency
  (`@modelcontextprotocol/server` 2.0.0, verified in `packages/mcp/package.json`),
  and no workspace `workspace:*` leakage into the published package; the LICENSE
  copy fails the build if absent (fail-closed); `dist/` is gitignored so
  tarballs/binaries cannot be committed accidentally.
- **smoke.ts**: temp workspace via `mkdtemp` + `realpath` (unpredictable, no
  fixed-name races in shared tmp); the tarball install uses `--ignore-scripts`
  and an explicit TLS registry; the smoke environment isolates `HOME`, `TMPDIR`,
  and git config (`GIT_CONFIG_NOSYSTEM`, `GIT_CONFIG_GLOBAL=/dev/null`); all
  spawns are argv arrays; every child has a hard 15 s SIGKILL timeout; the
  tarball content listing is asserted exactly (supply-chain allowlist check);
  cleanup in `finally`. The `--registry`/network step is the documented
  dependency-install verification, not a data fetch of untrusted content.
- **distribution.ts**: no remote fetch, update, or download path exists — no
  channel for install-location hijacking or downgrade attacks; the compiled
  `install` rejection fires before any configuration write and its `--help`/
  `-h` bypass is safe (verified: `runCli` prints usage for the help flag before
  install dispatch at `packages/cli/src/index.ts:79,351-352,84-97`, and a
  post-`--` `--help` becomes a rejected positional); error output passes through
  `sanitizeSecrets`; exit codes 1/2/3 match the documented contract; signal
  handlers are scoped to `watch` and removed in `finally`.
- **package.json / tsconfig.json**: scripts invoke files directly through `bun`
  with no shell metacharacters; `tsconfig` `include` covers
  `packages/cli/scripts/**/*.ts`, so the new build/smoke scripts are typechecked;
  floating devDependency ranges are pinned by the tracked lockfile under
  `--frozen-lockfile` CI.
- **.gitignore**: adds `packages/cli/dist/` only; existing credential ignores
  (`*.accessKeys*.csv`, `.env`) untouched.
- **README / packages/cli README claims vs behavior**: "CI uploads tested
  macOS/Linux arm64/x64 executables and npm tarballs; publication is manual" —
  accurate (upload-only workflow, no publish, no secrets); "installs the
  produced npm tarball outside the checkout" — accurate (isolated consumer dir
  under the smoke scratch home); "The build and CI never publish or use
  registry credentials" — accurate; action-pin claims match the workflow. The
  gap is the DISTRIBUTION.md artifact-channel provenance guidance (F-1), not a
  false claim in the root README.

## Suppressed count

0 findings suppressed. 4 findings recorded (1 major, 1 minor, 2 nits, one of
them explicitly downgraded from minor with rationale).

## Provenance

- Base HEAD: `463ff6588d3e70d61561fc5d8bd528b4677a6b7a6b7a`
- Scoped diff sha256: `ca7d37828545b73307abdabf5830e63e4f416e4a77d301a21211d4766bf780a5`
- Review performed read-only; no repo files modified other than this report;
  no network access; no scratch artifacts referenced.

# Remote-board adoption/final cycle — cumulative security round 4 (Nassun)

Reviewer: `nassun` (primary milestone security reviewer). Clean-context
reviewer-remediator; no inherited conversation from the coordinating session.

Model identity, recorded verbatim as observed by this runtime: `deepseek-flash`
(read from this session's own DSH session record:
`/Users/stan/.dsh/sessions/--Volumes-Delorean-code-sidekick-tmp--/164c19a3-7514-4982-9ebd-ad17e6be3a4d/session.v3.jsonl.zstd`,
48 occurrences of `"model":"deepseek-flash"`). No "v4.1" or other version string
was observed. This alias is permitted by the 2026-09-10 operator amendment
("`deepseek-flash` or any DeepSeek model"); the alias is recorded as the runtime
identifier only and is not restated as a version claim.

Verdict: **blocked** — the assigned workflow cannot produce security coverage of
this documentation-only delta as written. **No in-scope bytes were changed**, so
no remediation was applied and no fresh changed-byte verification is required.

## Scope reviewed

Cumulative changed-delta between `reviewed_baseline`
`fe382d305db19078446750020ede9f6b9a0d5348` and `candidate_revision`
`27909d65658b63ce0d4eaaf3bfc222e0e74e3cd8` (5 commits), milestone
"remote-board adoption/final cycle", in the assigned isolated worktree
`/private/tmp/sidekick-phase1-security-nassun`.

The range changes **18 paths, all documentation/coordination content**: 17 `.md`
files plus one `.json` under `docs/`. There is **no source-code change** in the
range. Product/package scope is unchanged and was explicitly not assigned; it
was not rescanned.

## Exact workflow limitation (the round's substantive outcome)

`security-diff-scan` scopes diff discovery through
`<discovery_dir>/deep_review_input.jsonl`, which is populated only from
`rank_input.jsonl` rows produced deterministically from changed **source-like**
files:

```text
python3 <plugin_root>/scripts/generate_rank_input.py make-diff-rank-input \
  --repo <repo_root> --base fe382d3 --mode revisions --head 27909d6 \
  --out <discovery_dir>/rank_input.jsonl
→ Wrote 0 rows
```

`copy-deep-review-input` then copied 0 rows. The helper's own filter explains it:

- `.md` is **not** a member of `TEXT_CODE_EXTENSIONS`
  (`<plugin_root>/scripts/rank_preview.py`), so all 17 Markdown files are dropped.
- `docs` **is** a member of `EXCLUDED_DIRS`, and `README.md` / `SECURITY.md` are
  members of `EXCLUDED_FILENAMES` (`<plugin_root>/scripts/generate_rank_input.py`),
  so the single changed JSON file (and the governance Markdown under `docs/`) is
  dropped by directory.

The workflow as written provides no sanctioned mechanism to place
documentation-only changed files into a diff-scoped worklist. Per the assigned
instruction, no substitute workflow was improvised: injecting the 18 paths into
`deep_review_input.jsonl` by hand would replace the workflow's own deterministic
scope decision rather than follow the workflow. Discovery therefore produced
**zero candidates**, and validation and attack-path analysis were not run
(nothing to validate or trace); the write-up and hardening stages produced
nothing.

Coverage is recorded as `partial` with all 18 paths deferred and explicit
exclusions, so "not observed" is not confused with "not scanned". **This is not
a clean no-change security pass and does not clear any rollout or release hold.**

## Findings

**No reportable findings** — because no file entered discovery, not because the
delta was reviewed clean. No finding was fixed, because none exists and no
in-scope remediation was performed. The previously recorded round-3 report-only
observation (board text mounted in the OpenCode system channel) is unchanged
here and remains a future ordinary-task recommendation.

### Unvalidated observation requiring a lead decision (not a finding)

Read while pinning the target, and **not** produced, validated or
severity-calibrated by any workflow phase; no candidate id, no severity, no
validation receipt, no remediation applied:

- Commit `9952798` (in range) adds a normative "Reviewer subagent permissions"
  section to `docs/agents/nassun.md` that directs reviewer subagents to run with
  full access (sandbox `danger-full-access`) so "an in-scope scan is never
  narrowed by file-policy limits", citing an operator instruction of 2026-09-10.
  The same section honestly notes that a parent cannot widen a child's
  permission and that the rule takes effect only under a `danger-full-access`
  session preset. Observed session policy for this review was `workspace-write`
  with approval prompts disabled; the delegation tool exposes no sandbox or
  approval parameter, so the mandate was not in effect here. Because
  `docs/agents/nassun.md` is a pinned governance path and this is a policy
  change, this reviewer did not edit it. Recorded as coverage open question 2 for
  lead disposition: confirm operator provenance, reconcile with the observed
  least-privilege session policy, or accept in writing.

## Input verification (before analysis)

| Input | Result |
|---|---|
| `docs/security/2026-09-10-phase1-nassun-round4-inputs.json` sha256 | `06aee1505806aaf236fe68be4de29264af4a78b1cc6d70f04fdd4c236baf3ab5` — matches the assigned expected value |
| `fe382d3` ancestor of `27909d6` | pass (5 commits in range: `c62992a`, `9952798`, `e1ce2a0`, `ced1e62`, `27909d6`) |
| 11 pinned hashes vs candidate `27909d6` | 11/11 match exactly, in both the working tree and `git show 27909d6:<path>` |
| Pinned paths modified in the working tree | none (`git status --short` shows only untracked `docs/security/` additions from this round) |

Read-only context read in full: `docs/research/04-trust.md`,
`docs/security/MILESTONES.md`, `docs/security/2026-09-10-phase1-nassun-round3.md`.
None was edited.

## Method and checks run

| Step | Result |
|---|---|
| Skill `security-diff-scan` loaded | pass |
| Preflight `security_diff_scan` (delegation true; six phase skills) | first run `blocked` on state dir `/Users/stan/.claude/security` not writable; after the documented `SECURITY_STATE_DIR` remediation pointed at a writable temp dir, second run `ready` |
| Target identity helper (`--kind git_diff`) | pass; `targetId target_sha256_9a4752…`, `snapshotDigest security-snapshot/v1:sha256:d441b31e…` |
| Threat model (Phase 1) | written; authority is the repository's resolved `SECURITY.md` guidance, preserved unchanged with the required footer |
| Deterministic diff worklist (Phase 2) | 0 rows (see limitation) |
| Deep review | not run: no worklist row exists |
| Validation / attack-path (Phases 3–4) | not run: no candidate exists (workflow no-candidate path) |
| Canonical JSON + `finalize_scan_contract.py --scan-dir … --source-root …` | pass; sealed `scan-manifest.json`, `findings.json`, `coverage.json` and projected `report.md` |
| Independent clean-context verification worker | reproduced manifest hash, ancestry, 11/11 pinned hashes, 18 changed paths (17 `.md` + 1 `.json`), 0-row worklist, no pinned path modified |
| Product tests / typecheck / installer / board / runtime | not run by design (no source change; product scope not assigned) |

## Files changed

**No bytes changed in any of the 11 writable/pinned governance paths** (all
verified byte-identical to candidate `27909d6`). No product path touched.

Added (untracked, audit trail under `docs/security`, as the task requires):

- `docs/security/2026-09-10-phase1-nassun-round4.md` — this report
- `docs/security/27909d6_20260910T111514Z/report.md` — sealed scan report,
  sha256 `9955849bbd76a73a32d9aab56fd22a88ffa35426029cf21624a040417345414a`
- `…/scan-manifest.json` — sha256 `5567ac5d888f0494c1ec10504124e80621ef6bdd65a3244294db5988ef771ad1`
- `…/findings.json` — sha256 `fc0ff2e0e4798cbc8e07a6ffda7d1b4e722b35dc739150e85e348b09fce2a665`
- `…/coverage.json` — sha256 `8cca06677be0633ce82a7aa3aaff9855a9155056a44150012c2848d8df196014`
- `…/artifacts/` — phase evidence (`01_context/`, `02_discovery/`,
  `03_coverage/`), including the discovery report and the independent worker's
  verification JSON

Retained bytes were compared against the sealed digests and match.

## Worker identities and retirement

| Worker | Kind | Scope | Status |
|---|---|---|---|
| `3110f1ba-b5f0-48ee-ad22-9ed6e8e066dc` | Clean-context verification subagent (parent `session-58b4497f-c639-4759-b40f-f67403d8cd41`, runtime session `164c19a3-7514-4982-9ebd-ad17e6be3a4d`) | Read-only reproduction of input hashes, ancestry, 11 pinned hashes, changed-path inventory, 0-row worklist, and the exclusion mechanism | Finished and **retired**; 0 nested workers; wrote no target-repo file |

No file-review, validation or attack-path workers were dispatched, because the
workflow's diff-scoped worklist had zero rows; that is the parent-fallback
(degraded, no-coverage) path, not reduced concurrency.

## Round accounting and boundary

Cumulative security rounds are preserved, not reset: this is the
remote-board adoption/final cycle **round 4**, explicitly authorized by the
round-4 input manifest. Round 3 remains a recorded clean no-change pass on its
own frozen bytes. Effort and steps stayed within this single round.

This round clears no hold and is not a live migration, board-delivery or rollout
acceptance. The lead must decide how (or whether) the governance delta
`fe382d3..27909d6` is to receive security coverage, and must dispose of the
unvalidated `docs/agents/nassun.md` observation above. **Stop here: no round 5
without an explicit lead decision.**

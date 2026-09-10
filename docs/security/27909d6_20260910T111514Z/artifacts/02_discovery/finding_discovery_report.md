# Finding discovery report — diff scan `27909d6_20260910T111514Z`

## Scope

- Scan mode: `diff` (Git-backed change set), workflow `security-diff-scan`.
- Target repository: `/private/tmp/sidekick-phase1-security-nassun`
  (branch `phase1-security-nassun`).
- Base revision: `fe382d305db19078446750020ede9f6b9a0d5348`.
- Head revision: `27909d65658b63ce0d4eaaf3bfc222e0e74e3cd8`.
- Reviewed milestone: remote-board adoption/final cycle, cumulative security
  round 4.

## Deterministic diff-scoped worklist

Command (exact):

```text
python3 /Users/stan/.agents/scripts/generate_rank_input.py make-diff-rank-input \
  --repo /private/tmp/sidekick-phase1-security-nassun \
  --base fe382d305db19078446750020ede9f6b9a0d5348 \
  --mode revisions --head 27909d65658b63ce0d4eaaf3bfc222e0e74e3cd8 \
  --out <discovery_dir>/rank_input.jsonl
```

Observed stdout:

```text
Wrote 0 rows to .../artifacts/02_discovery/rank_input.jsonl
```

`copy-deep-review-input` then reported: `Copied 0 rows`.

- `rank_input.jsonl`: 0 rows
- `deep_review_input.jsonl`: 0 rows
- `work_ledger.jsonl`: 0 rows (no worklist row exists to claim or complete)

## Why the worklist is empty (mechanical, from the helper's own source)

The reviewed range changes **18 paths**: 17 `.md` files and 1 `.json` file.
Every changed path is filtered out by the helper's own selection predicate in
`make_diff_rank_input`:

```python
if path_is_excluded(rel) or path.suffix.lower() not in TEXT_CODE_EXTENSIONS:
    continue
```

Two independent exclusion rules both apply to this delta:

1. `.md` is not a member of `TEXT_CODE_EXTENSIONS`
   (`/Users/stan/.agents/scripts/rank_preview.py`), so all 17 Markdown files
   are excluded by extension.
2. `docs` is a member of `EXCLUDED_DIRS` and `README.md` / `SECURITY.md` are
   members of `EXCLUDED_FILENAMES`
   (`/Users/stan/.agents/scripts/generate_rank_input.py`), so the single
   changed JSON file `docs/security/2026-09-10-phase1-nassun-inputs.json` is
   excluded by directory, and the governance Markdown under `docs/agents/`
   would be excluded by directory as well.

Counts: 17 documentation files (`.md`) + 1 file under the excluded `docs/`
directory = 18 filtered, 0 selected, 0 source-code files in the range.

## Discovery outcome

**No candidates.** The canonical diff-scoped deep-review worklist for this
change set is empty, so no file entered discovery and no candidate finding was
emitted. Per the workflow's no-candidate rule, validation and attack-path
analysis are not run, because there is no candidate to validate or trace.

## Exact workflow limitation (reported, not worked around)

`security-diff-scan` covers a change set through
`deep_review_input.jsonl`, which is populated only from the deterministic
`rank_input.jsonl` rows produced from changed **source-like** files. This
change set is governance/policy documentation only. The workflow as written
provides no sanctioned mechanism to place documentation-only changed files
into the diff-scoped worklist, and no substitute mechanism was improvised:
injecting the 18 documentation paths into `deep_review_input.jsonl` by hand
would override the workflow's own deterministic scope decision rather than
follow the workflow.

Consequence: **this scan achieves no security coverage of the governance delta
`fe382d3..27909d6`.** The delta is recorded as deferred coverage with an
explicit exclusion so that "not observed" is not confused with "not scanned"
(`scan-contract.md`, Coverage). The round-4 reviewer report records the same
limitation and a `blocked` verdict for the governance review; the lead must
decide whether a governance-appropriate review mechanism is authorized.

## Inputs verified before discovery

- Input manifest sha256 `06aee1505806aaf236fe68be4de29264af4a78b1cc6d70f04fdd4c236baf3ab5`
  (matches the assigned expected value).
- `fe382d3` is an ancestor of `27909d6` (5 commits in range).
- All 11 pinned governance paths match the pinned hashes at the candidate
  revision (independent clean-context re-verification recorded separately).

## Explicitly not performed

- No hand-authored substitute review of the governance Markdown.
- No validation or attack-path analysis (no candidates).
- No vulnerability write-ups or hardening portfolio (no reportable findings).
- No writes to any of the 11 pinned governance paths.

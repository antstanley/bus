# Remote-board adoption/final cycle — cumulative security round 3 (Nassun)

Reviewer: `nassun` (primary milestone security reviewer). Clean-context
reviewer-remediator; no inherited conversation from the coordinating session.

Model identity: `deepseek-flash`. The frozen input package's `allowed_model`
field says "DeepSeek v4.1 Flash". Recorded verbatim, both strings:
`deepseek-flash` is the only model identifier this DSH runtime exposes, and
equating it with the frozen `allowed_model` is an **operator-directed
reconciliation, not a verified version claim**. No runtime evidence of a "v4.1"
version string was observed by this reviewer.

Verdict: **clean no-change pass** — zero reportable findings in the reviewed
cumulative delta and **no bytes changed**. Round 3 of 3 ends the cycle clean.

## Scope reviewed

Cumulative changed-delta between `reviewed_runtime_baseline` `f37b83b`
(`f37b83b7f4b8e3a37dfb18d1979caed4826c892c`) and `candidate_revision`
`fe382d3` (`fe382d305db19078446750020ede9f6b9a0d5348`), milestone
"remote-board adoption/final cycle".

Product/test delta (the only executable change):

- `packages/cli/src/install.ts` — task147 installer/generated-OpenCode-plugin
  idle-presence and lifecycle handling (diff hunks 385, 438, 449).
- `packages/cli/test/install.test.ts` — task147 regression coverage.
- `packages/store-fs/src/index.ts` — task148 filename-less watch-event fix
  (diff hunks 31, 429: `WatchFactory` type widened; `isGitMetadata` returns
  false for `undefined`).
- `packages/store-fs/test/store-fs.test.ts`,
  `packages/store-git/test/store-git.test.ts` — task148 regression coverage.

Governance/policy delta in the frozen candidate (reviewed as security-gate
context): `AGENTS.md`, `SECURITY.md`, `docs/agents/{README,task-workflow,
nassun,codex,codex-architect,letta,opencode,opencode-reviewer,essun}.md`.

Explicitly not re-reviewed, with reasons:

- `scripts/codex-coordination-monitor.py` and its test — outside the input
  package's assigned/writable scope; bytes byte-identical at `fe382d3`, at the
  separately gated task149 candidate `439bad8` and in the working tree
  (`49cc4137…`, `8f9401cd…`). MILESTONES.md records the clean GLM5.3Flash
  attempt3 gate on exactly those bytes; duplicating it is prohibited.
- `docs/acceptance/team-board-setup.md` — byte-identical (`78491cd2…`) to the
  guide accepted in adoption/final-cycle security round 2.
- Backlog records and prior `docs/security/**` reports — evidence and
  coordination documents, not product surfaces.

Completeness: every changed source-like file in the range was deep-reviewed in
full; work-ledger receipts exist for all four `deep_review_input.jsonl` rows
plus 15 directly supporting files. Coverage is `complete` with no deferred rows.

## Input verification

- `docs/security/2026-09-10-phase1-nassun-inputs.json` sha256 =
  `a007c3932fe699451491276c1f80344d9ec7a59d8887ee1b22f00d8adb09efa8` — matches
  the expected value in the assignment.
- Both revisions exist locally; `f37b83b` is an ancestor of `fe382d3`.
- All 16 listed file hashes match the **candidate revision** exactly (verified
  with `git show fe382d3:<path>`).
- Working-tree deviation: 11 of the 16 files (all governance documents, no
  product/test file) changed **after** verification because the operator
  published a live model-policy amendment during the scan (AGENTS.md, SECURITY.md,
  `docs/agents/*`, `docs/security/MILESTONES.md`), corresponding to the
  policy-only delta `9952798` that MILESTONES.md now records as outside this
  frozen snapshot. The five product/test files still match the manifest
  byte-for-byte. The amended policy text ("`deepseek-flash` or any DeepSeek
  model") is **not covered by this round**; it is recorded here as an observed,
  post-verification working-tree change.

## Method

Skill `security-diff-scan` with its preflight (`security_diff_scan` profile),
phase order threat-model → finding-discovery → validation → attack-path →
canonical report. Preflight initially returned `blocked` on the state directory
(`/Users/stan/.claude/security` not writable); it returned `ready` after the
documented `SECURITY_STATE_DIR` remediation pointed at a writable temporary
directory. No scan bundle or canonical output was written into the repository.

Two independent clean-context file-review workers (authorized by the explicit
diff-scan invocation) reviewed the frozen bytes: one on
`packages/cli/src/install.ts`, one on `packages/store-fs/src/index.ts` and the
four changed test files. The parent reconciled their results against primary
source, ran the deterministic worklist generation, and authored the canonical
JSON. All work was read-only against the repository.

## Findings

**No reportable security findings.** Four plausible candidates were raised and
each was suppressed at validation with primary-source evidence and explicit
counterevidence (per-candidate ledgers under
`artifacts/05_findings/<candidate_id>/`):

1. **cand-01 — presence-registry deletion** (`packages/cli/src/install.ts:507-525,
   580-584`). The generated plugin deletes local session routing records by
   `sha256(sessionID)` digest. Suppressed: the digest is hex-only (no path
   traversal), tracking is per plugin instance, and the existing regression test
   proves a second instance's record survives. CWE-284.
2. **cand-02 — presence staleness** (`packages/cli/src/install.ts:527-566`).
   The 45 s idle refresh can keep refreshing a session whose runtime never emits
   a deletion event. Suppressed: impact is local-only/self-only; delivery still
   requires online, fresh, `idle` presence and a registry record re-validated as
   a non-symlink 0600 file resolving to a loopback `/session/<id>/prompt_async`
   endpoint, and failures are logged. CWE-613.
3. **cand-03 — filename-less hint events** (`packages/store-fs/src/index.ts:212-224,
   432-436`). Suppressed: `.git` bookkeeping still arrives with string filenames
   on Bun 1.4.0 (350/350 observed events on Linux; all named on macOS), the only
   reproducible filename-less event is termination of the watched root and is
   one-shot, and `packages/store-fs/README.md` (unchanged at base) already
   documents this class as an accepted performance limitation bounded by the
   100 ms debounce and the mandatory authoritative read. The pre-delta behaviour
   was an uncaught `TypeError` in the `fs.watch` callback, so the change removes
   a crash. CWE-400.
4. **cand-04 — board content in the OpenCode system prompt**
   (`packages/cli/src/install.ts:595-603`). Raised by the independent installer
   reviewer. The sink line (`output.system.push(context)`) is **byte-identical at
   the reviewed baseline**, the provenance-labelling control on the same path
   (`packages/hooks/src/board-hook.ts:438-475`, `[UNTRUSTED CONTENT FROM … |
   trust unsigned]` inside `<board-messages>`) is unchanged and applied, and the
   delta only restores reliable wakeability of idle sessions, which is the
   designed delivery behaviour. Suppressed as **not delta-introduced**; recorded
   below as a report-only recommendation, not a milestone finding.

### Report-only adjacent observation (no action required for this round)

Defect class: on the OpenCode path the generated plugin mounts labelled board
text in the **system** channel, where the Pi path delivers equivalent content as
a tool result with an explicit "untrusted content from board" prefix. This
predates the delta and the repository's stated provenance-labelling property is
satisfied, so it is not a round-3 finding and no remediation is proposed here.
Concrete future fix if the lead wants stricter channel separation: deliver the
`inject` output through a tool result or user-role message on the OpenCode path
instead of `experimental.chat.system.transform`. CWE-1426.

## Checks run

| Check | Result |
|---|---|
| Input package sha256 | matches `a007c393…` |
| Both revisions exist; baseline is ancestor | pass |
| 16/16 manifest hashes vs candidate `fe382d3` | pass |
| Working-tree hashes at verification vs manifest | 15/16 pass; `docs/agents/nassun.md` carried a pre-existing uncommitted operator clarification |
| Working-tree hashes at close vs candidate | 5/5 product+test match; 11 governance docs drifted by a live operator amendment (reported above) |
| `generate_rank_input.py make-diff-rank-input` + copy to `deep_review_input.jsonl` | 4 rows, no ranking/drop |
| Full-file review receipts for every worklist row + supporting files | 19 ledger rows, no gaps |
| Independent clean-context file reviews (2 workers) | no delta-introduced candidates beyond cand-04; both clean |
| Bounded local `fs.watch` filename observation (read-only, outside the repo) | `.git` writes reported named events; no undefined filename |
| Canonical finalization (`finalize_scan_contract.py`) | pass; sealed manifest, `findings.json`, `coverage.json`, projected `report.md` |
| No tests, typecheck, installer application, board/store, or live-runtime operation | not run by design |

## Changes, round accounting and boundary

Files changed by this round: **none** — no bytes changed, so no fresh
verification of changed bytes is required and no round 4 is needed. The
report-only observation above is a recommendation for a future ordinary task,
not a residual finding requiring lead acceptance, and nothing here clears any
rollout hold.

Cumulative security rounds preserved, not reset: policy 2/3 complete,
runtime 1/3 complete, combined round 2 clean, inbox-adoption 1/3 clean,
setup-guide round 2 clean, and this **adoption/final-cycle round 3 = clean
no-change pass**. Ordinary correctness rounds remain separate and are untouched.

This is a cumulative changed-delta review, not a live migration, board-delivery
or rollout acceptance. Task109/110 acceptance, the task147/149 operational
holds and the real trial outcome remain exactly as recorded in MILESTONES.md.
The policy-only delta `9952798` that post-dates the frozen candidate must be
reconciled after this handoff before final rollout; starting a fourth round
still requires Hoa's recorded decision.

Canonical scan bundle: scan id `fe382d3_20260910T103604Z`.
`report.md` sha256 `57bdad399e49dad21a23007b78a92f84f57a85f5bdad6fd388bcbab3e8cf84e4`;
`findings.json` sha256 `3b0b4948badc30a738c225e96b5e8184dfb8302db5ad6ffb9695cbd82001b4ca`;
`coverage.json` sha256 `19639e229f78e9dca4c929a9f11a23e073162e4d658ff151bc28b9baf664e6f3`;
`scan-manifest.json` sha256 `a4370afbc17e0917997e07145a559f510019223c3c120dcb435eea67d42559a0`.

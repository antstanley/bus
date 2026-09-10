# Security Review: sidekick cumulative remote-board delta f37b83b..fe382d3

## Scope

Cumulative changed-delta security review for the milestone "remote-board adoption/final cycle", security round 3. Diff-scoped review of every changed source-like file in f37b83b..fe382d3 plus the changed tests and governance policy documents listed in the frozen input package. The product-code delta is the task147 OpenCode idle-presence installer/plugin change and the task148 store-fs filename-less watcher-event fix. Prior coverage (policy round 2, runtime round 1, combined round 2, inbox-adoption round 1, setup-guide round 2) is preserved and not repeated for unchanged bytes; the task149 monitor is not duplicated because it has its own clean exact-byte gate.

- Scan mode: diff
- Target kind: git_diff
- Target ID: target_sha256_9a47520948f7f6ed6d4b5144c8d6fdef0e56c0eb63e027f0cb1fa6a7bb92cb5f
- Revision range: f37b83b...fe382d305db19078446750020ede9f6b9a0d5348
- Revision: c62992a6266416af195e9829f47a13cf18608542
- Snapshot digest: security-snapshot/v1:sha256:11d5486f2846713018c52cc45b3465870e10843c236d9714f3b8aff369ac92ec
- Inventory strategy: diff
- Included paths: packages/cli/src/install.ts, packages/store-fs/src/index.ts, packages/cli/test/install.test.ts, packages/store-fs/test/store-fs.test.ts, packages/store-git/test/store-git.test.ts, AGENTS.md, SECURITY.md, docs/agents/README.md, docs/agents/task-workflow.md, docs/agents/nassun.md, docs/agents/codex.md, docs/agents/codex-architect.md, docs/agents/letta.md, docs/agents/opencode.md, docs/agents/opencode-reviewer.md, docs/agents/essun.md
- Excluded paths: scripts/codex-coordination-monitor.py, scripts/test-codex-coordination-monitor.py, docs/acceptance/team-board-setup.md, backlog/\*\*, docs/security/\*\*
- Runtime or test status: No test, typecheck, installer application, board, store or live-runtime operation was executed. Validation used full-file static review of the frozen candidate bytes, existing regression-test evidence from the task147/task148 ordinary rounds, and one bounded read-only fs.watch observation probe run outside the repository.
- Artifacts reviewed: packages/cli/src/install.ts, packages/store-fs/src/index.ts, packages/cli/test/install.test.ts, packages/store-fs/test/store-fs.test.ts, packages/store-git/test/store-git.test.ts, AGENTS.md, SECURITY.md, docs/agents/\*.md, docs/acceptance/team-board-setup.md (carried pin), scripts/codex-coordination-monitor.py (hash identity only), scripts/test-codex-coordination-monitor.py (hash identity only)
- Scan context: Milestone register and prior reports read as context: docs/security/MILESTONES.md, docs/security/2026-09-09-remote-board-combined-round2.md, docs/research/04-trust.md, backlog/147, backlog/done/148, backlog/109, plus SECURITY.md and AGENTS.md. The threat model was generated for this scan from those repository sources (no external threat model was supplied).

Limitations and exclusions:
- Frozen candidate bytes are fe382d3; no live migration, board delivery or rollout acceptance is claimed.
- All 16 manifest hashes matched the candidate revision at verification. During the scan the operator published a live model-policy amendment that changed 11 governance documents in the working tree (AGENTS.md, SECURITY.md, docs/agents/\*.md); those new bytes are NOT covered by this round. All five product/test hashes still match the manifest exactly.
- packages/cli/src/install.ts is a template-generating module; its generated OpenCode plugin was reviewed as generated source, and its behaviour was corroborated by the task147 regression tests rather than executed here.
- The undefined-filename watcher behaviour that motivated the store-fs fix was observed in Bun on Linux CI; the local probe used Bun 1.4.0 on macOS and did not reproduce an undefined filename.
- No secret-shaped or untracked files were opened; the root-level agent-s3_accessKeys.csv was not read and is a pre-existing lead-owned cleanup item.
- Excluded scripts/codex-coordination-monitor.py: Out of the frozen input package's assigned/writable scope; bytes byte-identical to the separately gated task149 candidate 439bad8 (sha256 49cc4137...), so re-review would duplicate an unchanged completed gate.
- Excluded scripts/test-codex-coordination-monitor.py: Same as the monitor: separate clean exact-byte gate at 439bad8 (sha256 8f9401cd...); no duplicate review.
- Excluded docs/acceptance/team-board-setup.md: Carried coverage: byte-identical (78491cd2...) to the artifact accepted in remote-board adoption/final-cycle security round 2.
- Excluded backlog/\*\*: Coordination/task records are untrusted documentation, not product surfaces; no executable behaviour.
- Excluded docs/security/\*\*: Prior security reports and the milestone register are evidence and bookkeeping artifacts, not new product bytes.

### Scan Summary

| Field | Value |
| --- | --- |
| Reportable findings | 0 |
| Severity mix | none |
| Confidence mix | none |
| Coverage | complete |
| Validation mode | static source trace + bounded local observation probe + existing regression-test evidence |

Canonical artifacts: `scan-manifest.json`, `findings.json`, and `coverage.json`. This report is a deterministic projection of those files.

## Threat Model

The store (folder, git remote, S3) is a dumb untrusted blob service: anyone with write access can inject objects under any author, replace/delete/reorder/withhold objects and read everything; v1 posts are unsigned. Agents run on dev machines with the operator's credentials and shell, so steering an agent through board content is the ranked #1 risk (prompt injection / cross-agent infection). The delta reviewed here concerns local runtime integration rather than post parsing: generated OpenCode plugin presence/lifecycle handling and filesystem watch hints.

### Assets

- operator shell and developer credentials on every agent machine
- board authorship, integrity and presence state
- local runtime configuration and session-presence routing records under $HOME/.board
- private team-board data and store credentials

### Trust Boundaries

- untrusted store vs signed/validated post ingestion
- untrusted post text vs agent instructions (provenance labelling)
- operator-supplied installer inputs vs generated runtime integration
- local presence/routing records vs wake delivery
- OS watcher events vs advisory hint consumers

### Attacker Capabilities

- write arbitrary objects under any author in the untrusted store
- withhold, reorder or replay objects
- read every stored object
- author hostile coordination documents that look like workflow authority
- trigger filesystem activity in a watched store root

### Security Objectives

- no code execution or credential exposure from untrusted board content or generated config
- presence/routing records only ever point at owner-only loopback endpoints and are removed when a session dies
- watcher hint streams cannot crash the process or form an unbounded wake/read/wake loop
- the security gate itself keeps clean contexts, an allowed model and preserved cumulative rounds

### Assumptions

- Delivery targets are local loopback endpoints validated by loopbackServerUrl
- The operator's own machine and shell are trusted
- Availability under a hostile store owner and hostile .bus floods are accepted limitations

## Findings

### No findings

No reportable findings survived the canonical discovery, validation, and reportability gates.

## Reviewed Surfaces

| Surface | Risk Area | Outcome | Notes |
| --- | --- | --- | --- |
| packages/cli/src/install.ts — generated OpenCode plugin presence/lifecycle | local presence and routing integrity; spawned-hook lifetime | Rejected | cand-01 and cand-02 raised and suppressed at validation; the delta adds an unref'd idle refresh, a 10s subprocess timeout with kill, per-instance session tracking, and deletion/exit cleanup. Independent clean-context file review added cand-04 (pre-existing system-channel board delivery, suppressed as not delta-introduced; report-only recommendation). Evidence: artifacts/02_discovery/work_ledger.jsonl, artifacts/05_findings/cand-01/candidate_ledger.jsonl, artifacts/05_findings/cand-02/candidate_ledger.jsonl, artifacts/02_discovery/raw_candidates.jsonl, artifacts/05_findings/cand-04/candidate_ledger.jsonl |
| packages/store-fs/src/index.ts — watcher hint filter | resource exhaustion / crash resistance | Rejected | cand-03 raised and suppressed; the change only widens the filename type and makes isGitMetadata return false for undefined, removing a TypeError crash path. Evidence: artifacts/02_discovery/work_ledger.jsonl, artifacts/05_findings/cand-03/candidate_ledger.jsonl, artifacts/02_discovery/raw_candidates.jsonl |
| Changed regression tests (install, store-fs, store-git) | test-only code | No issue found | No product sink; store-fs invokes the exact fs.watch callback and store-git observes real watcher readiness rather than sleeping. Evidence: artifacts/02_discovery/work_ledger.jsonl |
| Governance policy delta (AGENTS.md, SECURITY.md, docs/agents/\*) | security-gate integrity and model policy | No issue found | Gate language, cumulative-round discipline and hygiene caps preserved; the primary reviewer's model allowance is widened under a recorded operator instruction without granting scopes to other models. Evidence: artifacts/02_discovery/work_ledger.jsonl |
| docs/acceptance/team-board-setup.md | operator provisioning guidance | Not applicable | Byte-identical (78491cd2...) to the artifact accepted in adoption/final-cycle security round 2; not re-reviewed. Evidence: artifacts/02_discovery/work_ledger.jsonl |
| scripts/codex-coordination-monitor.py and its test | monitor runtime | Not applicable | Outside the frozen package's assigned scope; bytes byte-identical to the separately gated task149 candidate 439bad8 and covered by its clean attempt3 gate. Evidence: artifacts/02_discovery/work_ledger.jsonl |

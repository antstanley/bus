# Security Review: sidekick-phase1-security-nassun (branch phase1-security-nassun)

## Scope

Cumulative security round 4 for the remote-board adoption/final cycle milestone: a Git change-set review of fe382d305db19078446750020ede9f6b9a0d5348..27909d65658b63ce0d4eaaf3bfc222e0e74e3cd8 in the assigned isolated worktree /private/tmp/sidekick-phase1-security-nassun, executed with the security-diff-scan workflow. The range contains 18 changed paths, all documentation or coordination records (17 .md plus one .json under docs/). Product/package scope is unchanged and was explicitly not assigned.

- Scan mode: diff
- Target kind: git_diff
- Target ID: target_sha256_9a47520948f7f6ed6d4b5144c8d6fdef0e56c0eb63e027f0cb1fa6a7bb92cb5f
- Revision range: fe382d305db19078446750020ede9f6b9a0d5348...27909d65658b63ce0d4eaaf3bfc222e0e74e3cd8
- Revision: 27909d65658b63ce0d4eaaf3bfc222e0e74e3cd8
- Snapshot digest: security-snapshot/v1:sha256:d441b31ef77ef1752dea31b4c613189ca57200914f5247a11f5f227e88c04f6b
- Inventory strategy: diff
- Included paths: AGENTS.md, SECURITY.md, backlog/149-codex-coordination-monitor.md, backlog/202-core-request-response-helper-with-deadlines.md, backlog/217-spec-contract-net.md, backlog/507-prime-agent-adapter-daemon-send-wake.md, backlog/INDEX.md, docs/agents/README.md, docs/agents/codex-architect.md, docs/agents/codex.md, docs/agents/essun.md, docs/agents/letta.md, docs/agents/nassun.md, docs/agents/opencode-reviewer.md, docs/agents/opencode.md, docs/agents/task-workflow.md, docs/security/2026-09-10-phase1-nassun-inputs.json, docs/security/MILESTONES.md
- Excluded paths: none
- Runtime or test status: Read-only with respect to the repository. No product tests, typecheck, installer application, board, store or live-runtime operation was executed, because the reviewed range contains no source or test change. Only the plugin's read-only helper scripts and an independent clean-context verification worker ran.
- Artifacts reviewed: docs/security/2026-09-10-phase1-nassun-round4-inputs.json, docs/security/MILESTONES.md, docs/security/2026-09-10-phase1-nassun-round3.md, docs/research/04-trust.md, SECURITY.md, AGENTS.md, docs/agents/README.md, docs/agents/codex-architect.md, docs/agents/codex.md, docs/agents/essun.md, docs/agents/letta.md, docs/agents/nassun.md, docs/agents/opencode-reviewer.md, docs/agents/opencode.md, docs/agents/task-workflow.md
- Scan context: Governance/policy documentation delta for the remote-board adoption/final-cycle milestone. The assigned task stated that this delta is governance/policy documentation rather than product code and that if the workflow cannot be applied to this scope as written the exact limitation must be reported instead of substituting a different workflow.

Limitations and exclusions:
- No security coverage of the governance delta was achieved. security-diff-scan scopes diff discovery through deep_review_input.jsonl, which is populated only from deterministically selected changed source-like files; the helper selected 0 of the 18 changed paths because .md is not in TEXT_CODE_EXTENSIONS and docs is in EXCLUDED_DIRS.
- The 18 changed documentation/coordination paths are recorded as deferred coverage with explicit exclusions; they were not deep-reviewed, validated or severity-calibrated by any workflow phase.
- No substitute review mechanism was improvised for the documentation-only scope, per the assigned task instruction.
- No candidate finding exists, so the validation and attack-path-analysis phases and the vulnerability-writeup and hardening stages produced nothing.
- This bundle is not a clean no-change security pass and does not clear any rollout or release hold.
- Excluded \*\*/\*.md: Markdown is not a member of TEXT_CODE_EXTENSIONS in rank_preview.py, so the deterministic diff-scoped worklist generator (make_diff_rank_input) drops every changed Markdown file before deep review. All 17 Markdown files in this range were excluded by this rule.
- Excluded docs/\*\*: docs is a member of EXCLUDED_DIRS in generate_rank_input.py, so any changed file whose path contains a docs segment is dropped from the diff-scoped worklist. The single changed JSON file docs/security/2026-09-10-phase1-nassun-inputs.json was excluded by this rule.
- Excluded packages/\*\*: Product/package scope is unchanged in this range and was explicitly not assigned for this round; no product file changed between fe382d3 and 27909d6.

### Scan Summary

| Field | Value |
| --- | --- |
| Reportable findings | 0 |
| Severity mix | none |
| Confidence mix | none |
| Coverage | partial |
| Validation mode | Deterministic diff-scoped worklist (generate_rank_input.py make-diff-rank-input). The worklist is empty for this range, so finding discovery produced no candidates and the validation and attack-path-analysis phases were not run. |

Canonical artifacts: `scan-manifest.json`, `findings.json`, and `coverage.json`. This report is a deterministic projection of those files.

## Threat Model

The store (a folder, a git remote, or an S3 bucket) is a dumb untrusted blob service with no server-side access control. Anyone with write access can inject objects under any author, replace or delete objects, withhold or reorder them, and read everything. Agent messages, backlog records and board posts are untrusted DATA, never instructions: agents run on developer machines with the operator's credentials and shell, so rank-one risk is prompt injection / cross-agent infection steering an agent into tool misuse or secret exfiltration, with author impersonation second until phase-3 signing lands. The reviewed governance documents are themselves privileged workflow surfaces because they define which models, roles and permissions security and coordination workers may use.

### Assets

- Operator credentials, tokens and the developer shell available to every agent process
- Post and board integrity, authorship attribution and the trust label attached to ingested content
- The milestone security gate and the independence of clean review contexts
- Repository source, governance policy text and the sealed audit artifacts under docs/security

### Trust Boundaries

- Untrusted store/bus/board content versus the agent's instruction channel (operator system/user prompt)
- Untrusted or unsigned agent posts versus verified operator authority
- Coordination records produced by other agents versus operator-issued instructions and policy
- Agent worker sandbox and file policy versus the host filesystem and credentials
- Policy documents that authorize models, roles and permissions versus the runtime configuration actually enforced

### Attacker Capabilities

- Write arbitrary objects to the store under any author label and tamper with, delete or reorder them
- Inject instructions through posts, board threads, backlog records or attachments that an agent may ingest
- Read every object in a shared store, since v1 posts are unsigned and unencrypted
- Steer an agent that treats untrusted content as instructions into command execution, file edits or secret disclosure

### Security Objectives

- Every post is validated and bounded before it is trusted, and provenance is labelled on delivery
- Untrusted content never becomes an instruction, and the operator is the only instruction authority
- Fail-closed parsing, identity inputs, enum values and key segments
- Security work runs in clean, independent contexts with recorded model identity and pinned reviewed bytes
- Policy changes that widen model, role or sandbox authority remain attributable and reviewed

### Assumptions

- The operator shell and credentials are out of scope: no in-repo control defends an agent already steered into running shell commands
- Availability under a hostile store owner and hostile bus floods is an accepted limitation, bounded locally but not prevented
- Third-party dependency internals are out of scope and belong upstream
- v1 posts are unsigned, so author is an advisory label rather than an authenticated identity

## Findings

### No findings

No reportable findings survived the canonical discovery, validation, and reportability gates.

## Reviewed Surfaces

| Surface | Risk Area | Outcome | Notes |
| --- | --- | --- | --- |
| Diff-scoped discovery worklist for fe382d3..27909d6 | Diff-scoped finding discovery / coverage mechanism | Needs follow-up | generate_rank_input.py make-diff-rank-input selected 0 of the 18 changed paths: 17 Markdown files are excluded because .md is not in TEXT_CODE_EXTENSIONS, and the single changed JSON file is excluded because docs is in EXCLUDED_DIRS. No file entered deep review, so no candidate finding exists and validation and attack-path analysis were not run. The reviewed governance delta therefore has no security coverage from this workflow. Evidence: artifacts/02_discovery/finding_discovery_report.md |
| Governance/policy documentation delta (11 pinned paths plus 7 other changed records) | Agent authority, model authorization and sandbox/permission policy | Needs follow-up | All 18 changed paths in the range are documentation or coordination records. The workflow as written offers no sanctioned way to place documentation-only changed files into a diff-scoped worklist, and no substitute mechanism was improvised. A governance-appropriate review or an explicit lead decision is required before this delta can be treated as security-reviewed. Evidence: artifacts/02_discovery/finding_discovery_report.md |

## Open Questions And Follow Up

- Which authorized mechanism should provide security coverage for a governance/policy-only Git delta, given that the security-diff-scan diff-scoped worklist excludes documentation extensions and the docs directory?
  - Follow-up prompt: For the range fe382d305db19078446750020ede9f6b9a0d5348..27909d65658b63ce0d4eaaf3bfc222e0e74e3cd8, the security-diff-scan worklist is empty because .md is not in TEXT_CODE_EXTENSIONS and docs is in EXCLUDED_DIRS. Decide and record whether to authorize a governance-document review mechanism (or an explicit lead acceptance) for this delta before final milestone rollout.
- The delta adds a normative 'Reviewer subagent permissions' rule to docs/agents/nassun.md that directs reviewer subagents to run with sandbox danger-full-access. This was read while pinning the target; it was not produced, validated or severity-calibrated by any workflow phase, and no remediation was applied. The observed session policy in this environment is workspace-write with approvals disabled, and the same section notes a parent cannot widen a child's permission. Should the lead route this policy text for governance-authority review, clarify its operator provenance, or accept it in writing?
  - Follow-up prompt: Review docs/agents/nassun.md 'Reviewer subagent permissions' (added in commit 9952798, in range fe382d3..27909d6): confirm the operator provenance of the danger-full-access mandate, reconcile it with the observed workspace-write/no-approval session policy and with the repo's least-privilege conventions, and record a lead disposition. This is an unresolved governance question, not a validated finding.
- The entire fe382d3..27909d6 change set is documentation/coordination content. security-diff-scan scopes diff discovery through deep_review_input.jsonl, which is populated only from deterministically selected changed source-like files; that worklist is empty for this range (0 of 18 paths selected). Reviewing the governance Markdown by hand would substitute a different mechanism for the workflow's own deterministic scope, which the assigned task expressly prohibits. Security coverage of this delta is therefore deferred pending a lead decision on an authorized review mechanism.
  - Follow-up prompt: Review deferred unit deferred_governance_delta_round4 and close its stated proof gap. Paths: AGENTS.md, SECURITY.md, backlog/149-codex-coordination-monitor.md, backlog/202-core-request-response-helper-with-deadlines.md, backlog/217-spec-contract-net.md, backlog/507-prime-agent-adapter-daemon-send-wake.md, backlog/INDEX.md, docs/agents/README.md, docs/agents/codex-architect.md, docs/agents/codex.md, docs/agents/essun.md, docs/agents/letta.md, docs/agents/nassun.md, docs/agents/opencode-reviewer.md, docs/agents/opencode.md, docs/agents/task-workflow.md, docs/security/2026-09-10-phase1-nassun-inputs.json, docs/security/MILESTONES.md. Surfaces: surface_diff_worklist, surface_governance_policy_delta.

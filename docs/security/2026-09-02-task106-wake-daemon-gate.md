# Security Review: sidekick/tmp (board) — task 106 wake-daemon lead gate

## Scope

Lead security gate for task 106 'wake daemon' (deliver new board posts to idle sessions). Diff target: base commit b0d3d41 vs current working tree, restricted to the 7 in-scope files fixed by the lead. Out-of-scope: backlog/122 + backlog/INDEX (coordination bookkeeping) and a concurrent in-flight letta-mod change set (task 122) that began moving mid-scan.

- Scan mode: working_tree
- Target kind: git_diff
- Target ID: target_sha256_9a47520948f7f6ed6d4b5144c8d6fdef0e56c0eb63e027f0cb1fa6a7bb92cb5f
- Revision range: b0d3d41...working tree at scan open (HEAD 2a13bcb7c8a7e95392210709b746e952098a96cf + uncommitted changes to in-scope files)
- Revision: 2a13bcb7c8a7e95392210709b746e952098a96cf
- Snapshot digest: security-snapshot/v1:sha256:66c6509abfbd4fd48840faccbdf8f368712aec674496e2c9afea8f4f5e3f365e
- Inventory strategy: diff
- Included paths: packages/cli/src/index.ts, packages/cli/test/cli.test.ts, packages/cli/README.md, packages/hooks/src/board-hook.ts, packages/hooks/test/hooks.test.ts, packages/hooks/README.md, backlog/106-wake-daemon-deliver-new-posts-to-idle-sessions.md
- Excluded paths: backlog/122-letta-mod-review-fixes.md, backlog/INDEX.md, packages/letta-mod/board.ts, packages/letta-mod/board.test.ts, packages/letta-mod/README.md, docs/research/06-letta-mod-timer-wake-finding.md
- Runtime or test status: bun test packages/cli packages/hooks (disposable pinned copy): 53 pass, 0 fail, 308 expect() calls; bunx tsc --noEmit: clean
- Artifacts reviewed: artifacts/diff_b0d3d41_to_worktree_inscope.patch, artifacts/diff_uncommitted_only.patch, artifacts/03_snapshot/, artifacts/01_context/threat_model.md
- Scan context: Clean lead-gate review of codex's uncommitted task-106 work; findings reported as robustness/validation defects because the author cannot receive exploit-style analysis.

Limitations and exclusions:
- Working tree was live during the scan (concurrent agent); all review evidence is anchored to the pinned snapshot in artifacts/03_snapshot/ with SHA256SUMS, re-verified at gate close.
- The deterministic rank generator structurally excludes 'test'/'docs' directories, README.md filenames, and .md files; the lead-mandated in-scope test files, READMEs, and backlog/106 task doc were added back into deep_review_input.jsonl manually with reasons recorded in the work ledger.
- Two out-of-scope letta-mod rows produced by the raw rank probe were excluded from the review scope per the lead's file list; they belong to a separate concurrent task-122 change set.
- No subagent delegation available; all phases executed in the parent agent (coverage unchanged).
- Excluded backlog/122-letta-mod-review-fixes.md: coordination bookkeeping, out of lead scope
- Excluded backlog/INDEX.md: coordination bookkeeping, out of lead scope
- Excluded packages/letta-mod/\*\*: concurrent in-flight task-122 change set by another agent (modified mid-scan); not part of the task-106 gate
- Excluded docs/research/06-letta-mod-timer-wake-finding.md: concurrent task-122 documentation, out of lead scope

### Scan Summary

| Field | Value |
| --- | --- |
| Reportable findings | 3 |
| Severity mix | low: 3 |
| Confidence mix | high: 3 |
| Coverage | complete |
| Validation mode | static source/control/sink trace against pinned snapshot + repository test suite run from a disposable copy outside the repo |

Canonical artifacts: `scan-manifest.json`, `findings.json`, and `coverage.json`. This report is a deterministic projection of those files.

## Threat Model

The store (folder/git/S3) is a dumb, untrusted blob service: anyone with write access can forge, replace, withhold, or reorder objects under any author name, and read everything. Agents run on dev machines with developer credentials, so content that steers an agent is a shell exploit; co-located prompt-infected agents are in scope. Same-user local processes (the operator's own account) are out of scope. Design rule verified by this gate (task 119 heritage): wake delivery targets come only from the local private 0600 session registry, never from the unsigned, attacker-writable presence page.

### Assets

- Developer-machine credential and shell access of every board agent
- Session wake/delivery channel (idle-session targeting and delivery)
- Session registry (~/.board/sessions) privacy and integrity
- Token/session secrets of co-located agents

### Trust Boundaries

- Store writers (any author name) \<-\> every reader
- Co-located agents (mutually untrusted) \<-\> shared dev machine
- Unsigned presence page \<-\> wake/delivery logic
- Local private session registry (trusted target source) \<-\> store-derived data (untrusted)

### Attacker Capabilities

- Forge/replace/reorder/withhold store objects under any author name
- Write arbitrary content to the presence page
- Run a co-located prompt-infected agent with normal user processes
- Read everything in the store

### Security Objectives

- Wake delivery targets derive only from the local private 0600 registry; presence data can never add targets
- No delivery without a registry entry AND an idle hook presence record (watcher-only presence must never deliver)
- Tokens/session secrets never appear in presence, logs, or the store
- Delivery only to loopback endpoints with ownership/expectation checks
- Store-derived text cannot inject into commands, paths, logs, or cmux notify fallback

### Assumptions

- Same-user local processes are trusted (operator's own account out of scope)
- v1 identity is unsigned; author impersonation via the store is a documented, accepted risk
- The local session registry mode 0600 is enforced by the writing agent

## Findings

| Finding | Severity | Confidence | Detailed write-up |
| --- | --- | --- | --- |
| [Forged mention strings are interpolated into timestamped delivery log lines](#finding-1) | low | high | [Open report](findings/log-line-forgery-forged-mention-echo/log-line-forgery-forged-mention-echo.md) |
| [Watcher refuses to start or silently never wakes for non-UUID runtime ids](#finding-2) | low | high | [Open report](findings/runtime-id-uuid-gate-mismatch/runtime-id-uuid-gate-mismatch.md) |
| [A Claude session-registry write failure silently swallows the poll's unread injection](#finding-3) | low | high | [Open report](findings/poll-wedge-claude-registry-write/poll-wedge-claude-registry-write.md) |

### Confidence Scale

| Label | Meaning |
| --- | --- |
| high | Direct evidence supports the finding with no material unresolved blocker. |
| medium | Evidence supports a plausible issue, but material runtime or reachability proof remains. |
| low | Evidence is incomplete and the item is retained only for explicit follow-up. |

<a id="finding-1"></a>

### [1] Forged mention strings are interpolated into timestamped delivery log lines

| Field | Value |
| --- | --- |
| Severity | low |
| Confidence | high |
| Confidence rationale | Dynamically reproduced in a disposable pinned copy: a forged post was accepted by the read-side parser and the raw multi-line string appeared verbatim inside the timestamped log line. |
| Category | log-injection |
| CWE | CWE-117 |
| Affected lines | packages/cli/src/index.ts:467-469, packages/core/src/post.ts:133-136 |

#### Summary

See the [detailed technical write-up](findings/log-line-forgery-forged-mention-echo/log-line-forgery-forged-mention-echo.md).

#### Validation

See the [detailed technical write-up](findings/log-line-forgery-forged-mention-echo/log-line-forgery-forged-mention-echo.md).

#### Dataflow

See the [detailed technical write-up](findings/log-line-forgery-forged-mention-echo/log-line-forgery-forged-mention-echo.md).

#### Reachability

See the [detailed technical write-up](findings/log-line-forgery-forged-mention-echo/log-line-forgery-forged-mention-echo.md).

#### Severity

See the [detailed technical write-up](findings/log-line-forgery-forged-mention-echo/log-line-forgery-forged-mention-echo.md).

#### Remediation

See the [detailed technical write-up](findings/log-line-forgery-forged-mention-echo/log-line-forgery-forged-mention-echo.md).

<a id="finding-2"></a>

### [2] Watcher refuses to start or silently never wakes for non-UUID runtime ids

| Field | Value |
| --- | --- |
| Severity | low |
| Confidence | high |
| Confidence rationale | Dynamically reproduced: watch --deliver with a non-UUID CODEX_THREAD_ID refused to start with '--session must be a UUID'; the skip path is a direct static consequence of the same predicate. |
| Category | input-validation |
| CWE | CWE-20 |
| Affected lines | packages/cli/src/index.ts:334-343, packages/hooks/src/config.ts:148-154, packages/cli/src/index.ts:484-493 |

#### Summary

See the [detailed technical write-up](findings/runtime-id-uuid-gate-mismatch/runtime-id-uuid-gate-mismatch.md).

#### Validation

See the [detailed technical write-up](findings/runtime-id-uuid-gate-mismatch/runtime-id-uuid-gate-mismatch.md).

#### Dataflow

See the [detailed technical write-up](findings/runtime-id-uuid-gate-mismatch/runtime-id-uuid-gate-mismatch.md).

#### Reachability

See the [detailed technical write-up](findings/runtime-id-uuid-gate-mismatch/runtime-id-uuid-gate-mismatch.md).

#### Severity

See the [detailed technical write-up](findings/runtime-id-uuid-gate-mismatch/runtime-id-uuid-gate-mismatch.md).

#### Remediation

See the [detailed technical write-up](findings/runtime-id-uuid-gate-mismatch/runtime-id-uuid-gate-mismatch.md).

<a id="finding-3"></a>

### [3] A Claude session-registry write failure silently swallows the poll's unread injection

| Field | Value |
| --- | --- |
| Severity | low |
| Confidence | high |
| Confidence rationale | Dynamically reproduced: with a group-accessible registry directory the poll produced zero output while the identical control with a private directory produced the injection. |
| Category | availability |
| CWE | CWE-755 |
| Affected lines | packages/hooks/src/board-hook.ts:77-84, packages/hooks/src/board-hook.ts:90-93 |

#### Summary

See the [detailed technical write-up](findings/poll-wedge-claude-registry-write/poll-wedge-claude-registry-write.md).

#### Validation

See the [detailed technical write-up](findings/poll-wedge-claude-registry-write/poll-wedge-claude-registry-write.md).

#### Dataflow

See the [detailed technical write-up](findings/poll-wedge-claude-registry-write/poll-wedge-claude-registry-write.md).

#### Reachability

See the [detailed technical write-up](findings/poll-wedge-claude-registry-write/poll-wedge-claude-registry-write.md).

#### Severity

See the [detailed technical write-up](findings/poll-wedge-claude-registry-write/poll-wedge-claude-registry-write.md).

#### Remediation

See the [detailed technical write-up](findings/poll-wedge-claude-registry-write/poll-wedge-claude-registry-write.md).

## Structural Hardening

The scan also produced derived, unsealed design guidance based on the complete finding collection. These proposals describe options and tradeoffs; they do not indicate that any finding has been remediated.

[Open the structural hardening portfolio](hardening/hardening.md)

## Reviewed Surfaces

| Surface | Risk Area | Outcome | Notes |
| --- | --- | --- | --- |
| Wake delivery pipeline (deliverMentionedSessions, claims, wake commands) | delivery targeting, dedup, logging | Reported | Presence-derived candidates gated by idle status, per-channel reachability, per-key dedup, and per-machine claims. Registry gating verified for OpenCode (endpoint from 0600 registry + http-loopback-only) and Claude (registry+env socket agreement + token). LOW: unvalidated mention echo into log lines. Evidence: artifacts/05_findings/cand-1-log-line-forgery/candidate_ledger.jsonl |
| Claude session registry (hook heartbeat/poll write path) | secret handling, local registry integrity | Reported | Token never persisted (asserted by tests); registry records 0600 + O_NOFOLLOW + size cap; directory hardened at write. LOW: registry-write failure silently swallows poll injection. Evidence: artifacts/05_findings/cand-2-poll-wedge-registry/candidate_ledger.jsonl |
| Watch target publication (resolveWatchTarget, presence heartbeat) | identity validation, presence publication | Reported | Watcher publishes watching-status presence with runtime/sessionId/socket; registry record written only when token present; token never published. LOW: UUID gate at consumption inconsistent with any-string publication. Evidence: artifacts/05_findings/cand-3-runtime-id-uuid-gate/candidate_ledger.jsonl |
| Wake gate test coverage (cli.test.ts, hooks.test.ts) | security assertions | No issue found | Tests assert: watcher-only presence not deliverable; loopback-only OpenCode; once-only delivery across runs; no token/socket in delivery records; registry 0600 + token absence; bookkeeping failure prevents wake. Gaps noted per finding (no forged-mention log test, no registry-failure poll test, no non-UUID id test). Evidence: artifacts/02_discovery/work_ledger.jsonl |
| Wake documentation (cli/README, hooks/README, backlog/106) | documentation accuracy | No issue found | Documented behavior matches code: token-free owner-only registries, notices contain only post id, watcher stays watching, Letta best-effort cmux fallback never crashes the watcher. Evidence: artifacts/02_discovery/work_ledger.jsonl |
| Codex/Letta/human wake routes (no local registry channel) | delivery targeting | Rejected | Considered as a focus-1 deviation: identifiers are presence-derived (no registry exists for these channels) but UUID-shape validated, passed as argv array elements with a fixed-template message to same-user local processes (out of scope per threat model); once-per-post claim dedup bounds repeated wakes. In-model availability note recorded in gate-review, not a reportable defect. Evidence: artifacts/02_discovery/finding_discovery_report.md |

## Open Questions And Follow Up

- Confirm production Codex CLI 0.152.1 and Letta surface id formats are UUID-variant (backlog/106 defers the live Codex latency check to task 110 acceptance); if not, cand-3 applies to every codex/letta wake.
- Decide whether validatePost should enforce assertName on mention items at read time (cand-1 root fix) versus report-side sanitization only.

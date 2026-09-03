# Security Review: sidekick/tmp (board) — task 111 Stop-hook lead gate

## Scope

Lead security gate for task 111 (Stop hook block-with-reason honouring stop_hook_active, capped Stop reasons with closed untrusted framing, --runtime and delivery-target metadata in generated hook commands, Letta legacy hook config owned-merge install/uninstall). Diff target: base commit 86b29f9 vs current working tree, restricted to the 7 in-scope files fixed by the lead (395 insertions / 48 deletions).

- Scan mode: working_tree
- Target kind: git_diff
- Target ID: target_sha256_9a47520948f7f6ed6d4b5144c8d6fdef0e56c0eb63e027f0cb1fa6a7bb92cb5f
- Revision range: 86b29f9...working tree at scan close (HEAD 86b29f9173a6d6af371405c8f69936d70d32fd48, then advanced to 64f4613e12f1efe2dfe18a7bb39849e0b7541f2e by a backlog-only commit touching no in-scope file, plus uncommitted changes to the in-scope files)
- Revision: 86b29f9173a6d6af371405c8f69936d70d32fd48
- Snapshot digest: security-snapshot/v1:sha256:02e7481d29275f7b7f87e6d483298d347eb4c185cbc5d9533d3973c5c29f1c97
- Inventory strategy: diff
- Included paths: packages/cli/README.md, packages/cli/src/index.ts, packages/cli/src/install.ts, packages/cli/test/install.test.ts, packages/hooks/README.md, packages/hooks/src/board-hook.ts, packages/hooks/test/hooks.test.ts
- Excluded paths: packages/index/\*\*, docs/benchmarks.md, packages/letta-mod/\*\*, docs/research/\*\*, backlog/\*\*
- Runtime or test status: bun test packages/cli packages/hooks (disposable pinned copy): 62 pass, 0 fail, 368 expect() calls; bunx tsc --noEmit: clean; gate probes: 5 pass, 0 fail (artifacts/05_findings/)
- Artifacts reviewed: artifacts/diff_86b29f9_to_worktree_inscope.patch, artifacts/03_snapshot/, artifacts/01_context/threat_model.md, artifacts/gate-review.md, artifacts/scope.md
- Scan context: Clean lead-gate review of codex's uncommitted task-111 work (Stop hook block-with-reason, --runtime metadata, Letta legacy hook config); findings would be reported as robustness/validation defects because the author cannot receive exploit-style analysis — none were required.

Limitations and exclusions:
- The deterministic rank generator structurally excludes 'test'/'docs' directories and README.md/.md filenames; the lead-mandated in-scope test files and READMEs were added back into deep_review_input.jsonl with reasons recorded in the work ledger.
- Two out-of-scope letta-mod rows produced by the raw rank probe were excluded from the review scope per the lead's file list (separate concurrent change set, not snapshotted).
- No subagent delegation available; all phases executed in the parent agent (coverage unchanged).
- Gate close: live working tree re-verified byte-identical to the pinned snapshot for all 7 in-scope files; HEAD advanced to 64f4613 (backlog-only commit) touching no in-scope file.
- Excluded packages/index/\*\*: task 405 work already committed at base 86b29f9; out of the lead's task-111 scope (consulted read-only as supporting context for retention behavior)
- Excluded docs/benchmarks.md: out of the lead's task-111 scope
- Excluded packages/letta-mod/\*\*: task-107/122 mod work owned by other agents (live uncommitted changes in the tree at scan open); not part of the task-111 gate; excluded from snapshot per lead's instruction
- Excluded docs/research/\*\*: research notes out of the lead's scope; docs/research/04-trust.md consumed read-only as the authoritative threat model
- Excluded backlog/\*\*: coordination bookkeeping out of the lead's scope

### Scan Summary

| Field | Value |
| --- | --- |
| Reportable findings | 0 |
| Severity mix | none |
| Confidence mix | none |
| Coverage | complete |
| Validation mode | static source/control/sink trace against pinned snapshot + repository test suite and stop-hook invariant probes run from a disposable copy outside the repo |

Canonical artifacts: `scan-manifest.json`, `findings.json`, and `coverage.json`. This report is a deterministic projection of those files.

## Threat Model

The store (folder/git/S3) is a dumb, untrusted blob service: anyone with write access can forge, replace, withhold, or reorder objects under any author name, and read everything. Agents run on dev machines with developer credentials, so content that steers an agent is a shell exploit; co-located prompt-infected agents are in scope. Same-user local processes (the operator's own account) are out of scope. This gate verifies the Stop hook keeps model-facing injection inside the capped UNTRUSTED frame and cannot loop, and that the installer's generated commands and owned-merge config edits stay within their boundaries.

### Assets

- Developer-machine credential and shell access of every board agent
- Agent session control (the Stop decision channel and turn-boundary context injection)
- Session registry (~/.board/sessions) privacy and integrity
- Local runtime config files (~/.letta/settings.json, ~/.claude/settings.json, ~/.codex/config.toml)

### Trust Boundaries

- Store writers (any author name) \<-\> every reader (hook render path)
- Co-located agents (mutually untrusted) \<-\> shared dev machine
- Runtime hook payloads (Stop events) \<-\> hook decision output
- Installer-generated config \<-\> existing foreign runtime configuration

### Attacker Capabilities

- Forge/replace/reorder/withhold store objects under any author name
- Craft post titles/bodies (≤64 KiB, multi-line, arbitrary Unicode) that reach model-facing hook output
- Run a co-located prompt-infected agent with normal user processes
- Read everything in the store

### Security Objectives

- Stop block-with-reason fires at most once per valid runtime session and can never loop or consume unread mentions without delivering them
- Capped Stop reasons always retain the closed UNTRUSTED framing: closing markers intact, author-controlled lines pipe-quoted, output within the byte cap
- Installer-generated hook commands carry the runtime identity; delivery-target rules (local 0600 registry gating) remain intact
- Letta legacy hook install/uninstall mutates only board-owned config entries
- Tokens/session secrets never appear in presence, logs, store, or hook output

### Assumptions

- Same-user local processes are trusted (operator's own account out of scope)
- v1 identity is unsigned; author impersonation via the store is a documented, accepted risk
- The local session registry mode 0600 is enforced by the writing agent
- Runtime hook payloads (session ids, stop_hook_active) are produced by the local runtime, not by the store

## Findings

### No findings

No reportable findings survived the canonical discovery, validation, and reportability gates.

## Reviewed Surfaces

| Surface | Risk Area | Outcome | Notes |
| --- | --- | --- | --- |
| Stop block-with-reason (runHook stop gate, hook_stop_blocks receipt, decision output) | hook control flow, loop safety, delivery atomicity | No issue found | Triple loop guard verified: stop_hook_active must be exactly false, runtime plus shape-validated session id required, durable receipt keyed (runtime, session_id) checked under the exclusive hook-claim lock and inserted in the same transaction as the post claims. Dynamic probes: 20 concurrent stops -\> exactly one block/receipt/claim; odd stop_hook_active payloads silent with zero claims; silent stops do not consume the once-per-session response and unrendered posts stay deliverable. Evidence: artifacts/02_discovery/work_ledger.jsonl, artifacts/05_findings/probe-stop-loops.test.ts, artifacts/05_findings/probe-output.txt |
| Byte-bounded untrusted framing (renderPosts, renderTruncatedPost, fitQuotedSection) | prompt-injection containment, output bounding | No issue found | Markers reserved before truncation; fixed frame checked before any content; assembly check fail-closes to empty output instead of truncating (old truncateUtf8 removed); per-line quoting parity between quoteUntrusted and the new renderQuotedSection; UTF-8 boundary-stepped binary search; header fields read-validated (ULID ids, assertName author/board) by validatePost before render. Probes: hostile markers in title and body at cap 256 keep both closing markers, stay \<= cap, no U+FFFD. Evidence: artifacts/02_discovery/raw_candidates.jsonl, artifacts/05_findings/probe-output.txt |
| Installer hook-command generation (hookCommand --runtime, claude/codex/letta entries) | runtime identity, delivery targeting | No issue found | All generated Claude/Codex/Letta hook commands carry --runtime (shell-quoted literal); delivery-target extraction reads the full effective env so an explicit runtime no longer drops session/socket/surface metadata (test-asserted incl. ambient CODEX_THREAD_ID non-interference); identity isolation (BOARD_AS only) unchanged; task-119 delivery rules and registry gating byte-identical to the reviewed task-106 state; the only cli/index.ts change is the --store requirement now covering letta. Evidence: artifacts/02_discovery/work_ledger.jsonl, artifacts/gate-review.md |
| Letta legacy hook install/uninstall (mergeGroupedHooks, planJson, atomicWrite) | local config integrity, owned-merge semantics | No issue found | Owned-merge only: strips groups whose handler command anchors to this checkout's hookPath and matches inject/heartbeat/stop (regex extended for the new stop subcommand, preserving upgrade idempotence); foreign config preserved; uninstall removes only owned entries and restores a deep-equal prior file (test-asserted); planJson refuses non-object roots; atomicWrite preserves mode via realpath + temp wx + chmod + rename. Evidence: artifacts/02_discovery/work_ledger.jsonl, artifacts/gate-review.md |
| Task-111 test coverage (hooks.test.ts stop describe, install.test.ts letta/--runtime/Stop-integration) | security assertions | No issue found | Tests assert: once-only block across repeated Stop payloads with newer unread left injectable; stop_hook_active=true silent; no-session silent without claims; next-session blocks; decision reason framing and byte cap; Unicode truncation frame integrity at cap 256; letta merge/uninstall deep-equal restoration; --runtime in generated commands for all three runtimes; generated Codex Stop blocks end-to-end through sh. Evidence: artifacts/02_discovery/work_ledger.jsonl |
| Documentation accuracy (hooks README stop section, cli README install section) | documentation accuracy | No issue found | Documented stop semantics match the code (once-per-session receipt, silent without session id, truncation frame guarantees); letta docs correctly describe legacy hooks, heartbeat-at-Stop with the stderr+exit-2 incompatibility rationale, mod preferred, MCP server-side, owned-merge install. Evidence: artifacts/02_discovery/work_ledger.jsonl |
| hook_stop_blocks receipt scope (runtime+session, not store-scoped) | delivery state scoping | Rejected | Candidate cand-4 considered: the receipt is keyed (runtime, session_id) unlike the store-scoped hook_deliveries, so reusing one index across two store configurations suppresses later stops for the same session id. Suppressed as in-model hygiene: documented scope ('at most once per runtime session'), only reachable via manual BOARD_INDEX reuse (default installs give each runtime its own index), fail-safe direction (silence; no wrong injection; message still delivered by the next inject, probe-confirmed). Evidence: artifacts/02_discovery/raw_candidates.jsonl, artifacts/gate-review.md |

## Open Questions And Follow Up

- Confirm with the Letta maintainers' current hook docs that the legacy Letta Stop protocol still requires stderr + exit 2 before relying on the heartbeat-only Stop choice in lettaHooks (install.ts:619-621); the fail-open rationale is documented but rests on the deprecated surface.
- Decide whether hook_stop_blocks should be store-scoped like hook_deliveries (or pruned by index retention) if manual BOARD_INDEX reuse across stores becomes a supported configuration; today a shared index suppresses later stops for the same session id while inject delivery continues.

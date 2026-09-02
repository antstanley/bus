# Backlog index

Statuses: todo, in-progress, blocked, gated (accepted by review + security gate, awaiting commit), done (on main).


## Phase 1

| id | task | owner | status | est |
|----|------|-------|--------|-----|
| 101 | [hooks: turn-boundary injection for Claude, Codex, Letta](done/101-hooks-turn-boundary-injection-for-claude-codex-l.md) | codex | done | M |
| 102 | [mcp: board as an MCP server (stdio)](done/102-mcp-board-as-an-mcp-server-stdio.md) | letta | done | M |
| 103 | [cli: review fixes](done/103-cli-review-fixes.md) | codex | done | S |
| 104 | [install: `board install <runtime>` idempotent config writer](done/104-install-board-install-runtime-idempotent-config-.md) | codex | done | S |
| 105 | [presence: delivery targets](done/105-presence-delivery-targets.md) | letta | done | S |
| 106 | [wake daemon: deliver new posts to idle sessions](106-wake-daemon-deliver-new-posts-to-idle-sessions.md) | codex | todo | M |
| 107 | [letta mod: board tools and turn_start injection](done/107-letta-mod-board-tools-and-turn-start-injection.md) | letta | done | M |
| 108 | [hygiene policy in AGENTS.md and MCP/hook output](108-hygiene-policy-in-agents-md-and-mcp-hook-output.md) | claude | todo | S |
| 109 | [dogfood: move team coordination from ./bus to the board](109-dogfood-move-team-coordination-from-bus-to-the-b.md) | claude | todo | M |
| 110 | [end-to-end phase 1 acceptance](110-end-to-end-phase-1-acceptance.md) | claude | todo | S |
| 111 | [hooks: Stop block-with-reason and Letta hook config](111-hooks-stop-block-with-reason-and-letta-config.md) | codex | todo | S |
| 112 | [mcp: adopt MCP spec 2026-07-28 via SDK v2](done/112-mcp-adopt-spec-2026-07-28-via-sdk-v2.md) | letta | done | M |
| 113 | [OpenCode adapter: plugin, install, wake via prompt_async](done/113-opencode-adapter-plugin-install-and-wake.md) | codex | done | M |
| 114 | [Pi adapter: extension, install, poll-driven wake](done/114-pi-adapter-extension-install-and-poll-wake.md) | codex | done | M |
| 115 | [security: core post validation hardening (scan 2026-09-01 #3 #4 #6 #10 #12)](done/115-security-core-post-validation-hardening.md) | claude | done | S |
| 116 | [security: mcp/index/s3 follow-ups (scan 2026-09-01 #1 #2 #5 #11)](done/116-security-mcp-index-s3-follow-ups.md) | letta | done | S |
| 117 | [security: hooks/install/store-fs follow-ups (scan 2026-09-01 #7 #8 #9)](done/117-security-hooks-install-store-fs-follow-ups.md) | codex | done | S |
| 118 | [core: scan() stops early on non-day-bucket keys (scan 2026-09-01 core diff, cand-004)](done/118-core-scan-day-bucket-truncation.md) | letta | done | S |
| 119 | [OpenCode wake: delivery targets from a local registry, never from presence](done/119-opencode-wake-target-local-registry.md) | codex | done | S |
| 120 | [install dry-run redaction of reflowed lines; wake scan presence limit](done/120-install-dryrun-redaction-and-presence-limit.md) | codex | done | S |
| 121 | [hooks: strip CR in untrusted quoting; pi default author collision](121-hooks-cr-normalisation-and-pi-default-author.md) | codex | todo | S |
| 122 | [letta-mod: clean review fixes (bun entrypoint, content shape, multiline bodies)](done/122-letta-mod-review-fixes.md) | letta | done | S |

## Phase 2

| id | task | owner | status | est |
|----|------|-------|--------|-----|
| 201 | [core: envelope v2 fields](201-core-envelope-v2-fields.md) | claude | todo | M |
| 202 | [core: request/response helper with deadlines](202-core-request-response-helper-with-deadlines.md) | claude | todo | S |
| 203 | [task lifecycle folded from status posts](203-task-lifecycle-folded-from-status-posts.md) | letta | todo | M |
| 204 | [contract-net profile for work allocation](204-contract-net-profile-for-work-allocation.md) | codex | todo | M |
| 205 | [addressed inbox view](205-addressed-inbox-view.md) | letta | todo | S |
| 206 | [agent cards: publish and list](206-agent-cards-publish-and-list.md) | letta | todo | M |
| 207 | [expiry and TTL semantics](207-expiry-and-ttl-semantics.md) | claude | todo | S |

## Phase 3

| id | task | owner | status | est |
|----|------|-------|--------|-----|
| 301 | [identity: keys, did:key ids, keystore](301-identity-keys-did-key-ids-keystore.md) | claude | todo | M |
| 302 | [sign and verify posts](302-sign-and-verify-posts.md) | claude | todo | M |
| 303 | [key registry with pre-rotation and TOFU](303-key-registry-with-pre-rotation-and-tofu.md) | letta | todo | M |
| 304 | [per-board requireSig policy](304-per-board-requiresig-policy.md) | claude | todo | S |
| 305 | [rate limits and audit view](305-rate-limits-and-audit-view.md) | codex | todo | S |
| 306 | [private boards via HPKE-wrapped board keys](306-private-boards-via-hpke-wrapped-board-keys.md) | letta | todo | L |
| 307 | [red-team fixture and injection test](307-red-team-fixture-and-injection-test.md) | codex | todo | S |

## Phase 4

| id | task | owner | status | est |
|----|------|-------|--------|-----|
| 401 | [per-writer seq and presence heads; gap-driven reconcile](401-per-writer-seq-and-presence-heads-gap-driven-rec.md) | claude | todo | L |
| 402 | [HLC-witnessed ULIDs](402-hlc-witnessed-ulids.md) | claude | todo | S |
| 403 | [S3 change feed via SNS to SQS](403-s3-change-feed-via-sns-to-sqs.md) | letta | todo | M |
| 404 | [fs.watch and git-hook wake hints](404-fs-watch-and-git-hook-wake-hints.md) | codex | todo | S |
| 405 | [day snapshots, compaction, retention](405-day-snapshots-compaction-retention.md) | letta | todo | M |
| 406 | [R2 and MinIO conformance](406-r2-and-minio-conformance.md) | letta | todo | S |
| 407 | [store bridge: replicate a board between stores](407-store-bridge-replicate-a-board-between-stores.md) | codex | todo | M |
| 408 | [load and cost benchmarks](408-load-and-cost-benchmarks.md) | claude | todo | S |

## Phase 5

| id | task | owner | status | est |
|----|------|-------|--------|-----|
| 501 | [A2A gateway](501-a2a-gateway.md) | unassigned | todo | L |
| 502 | [MCP streamable-HTTP transport and subscriptions/listen](502-mcp-streamable-http-transport-and-subscriptions-.md) | letta | todo | M |
| 503 | [adapter conformance kit and recipes](503-adapter-conformance-kit-and-recipes.md) | codex | todo | M |
| 504 | [human TUI and web viewer](504-human-tui-and-web-viewer.md) | unassigned | todo | M |
| 505 | [webhook and email bridges](505-webhook-and-email-bridges.md) | unassigned | todo | M |
| 506 | [hosted relay option on Cloudflare](506-hosted-relay-option-on-cloudflare.md) | unassigned | todo | L |
| 507 | [Prime-Agent adapter: reuse Pi extension, wake via daemon send](507-prime-agent-adapter-daemon-send-wake.md) | unassigned | todo | S |
| 508 | [DeepSeek Harness (dsh) spike (deferred until beta)](508-deepseek-harness-dsh-spike-deferred.md) | unassigned | blocked | S |

## Phase 6

| id | task | owner | status | est |
|----|------|-------|--------|-----|
| 601 | [CI: GitHub Actions with live S3](601-ci-github-actions-with-live-s3.md) | codex | todo | S |
| 602 | [packaging: bunx @board/cli and compiled binary](602-packaging-bunx-board-cli-and-compiled-binary.md) | codex | todo | S |
| 603 | [observability: trace ids end to end](603-observability-trace-ids-end-to-end.md) | claude | todo | S |
| 604 | [admin CLI: gc, retention, backup/restore](604-admin-cli-gc-retention-backup-restore.md) | letta | todo | M |
| 605 | [docs site, semver, changelog](605-docs-site-semver-changelog.md) | claude | todo | S |
| 606 | [third-party conformance kits](606-third-party-conformance-kits.md) | unassigned | todo | S |

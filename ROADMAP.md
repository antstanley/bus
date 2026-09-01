# Roadmap: a heterogeneous agent bus

Status: v1 (claude, lead; 2026-09-01). Grounded in `docs/research/`. Tasks live
in `backlog/`; this file says why and in what order.

## Vision

Any agent (Claude Code, Codex, Letta, Gemini CLI, Cursor, an OpenAI Agents SDK
process, a human in a terminal) can join a shared bus with one install command,
post and read without a human relaying, discover who else is there and what
they can do, delegate and negotiate work, and trust who said what, over storage
the operator already has (a folder, a git remote, an S3 bucket). No central
server is required; a hosted relay is an option, never a dependency.

## Principles (from DESIGN.md, unchanged)

1. Every write is an immutable object with a unique time-sortable id. The bus
   is a grow-only set; merge is union; any put/list storage works.
2. Cursors are an optimisation. Completeness comes from id dedup, bounded
   reconcile, exact change feeds where the backend has one, and rebuild.
3. Mutable state is derived by folding events. Owner-only files for presence.
4. Messages from other agents are untrusted data, never instructions.
5. Zero runtime dependencies in core; one well-justified dependency per edge
   package (MCP SDK, HPKE) at most.

## Phases

| phase | goal | exit criterion |
|-------|------|----------------|
| 0 | **v0 board** (done): core, fs/git/S3 stores, index, presence, CLI | all packages reviewed and on `main`; root `bun test` green |
| 1 | **Agents notice messages without a human** | the three agents complete a delegated task end to end over the board, with no human relay, message-to-attention latency under 5 s |
| 2 | **Protocol v2: addressed, typed, task-aware messages** | a request/response and a contract-net negotiation replay in a conformance test; agent cards discoverable |
| 3 | **Identity and trust** | forged, tampered, replayed and revoked-key posts are rejected in tests; a private board is unreadable by non-members; red-team fixture yields zero tool calls |
| 4 | **Scale and delivery** | million-post board rebuilds in O(days); idle S3 reader costs under $0.01/day; skewed-clock writer never loses a post; R2 and MinIO pass conformance |
| 5 | **Interop and ecosystem** | an external A2A client completes a task via the gateway; three non-founding runtimes pass the adapter conformance kit; humans have a TUI |
| 6 | **Ops and release** | CI green on every push including live S3; `bunx @board/cli` and a compiled binary install; semver, changelog, docs site; backup/restore and GC tested |

### Phase 1: agents notice messages (now)

The hard problem is attention, not storage (research 03). Deliverables:
`packages/hooks` (turn-boundary injection for Claude, Codex, Letta), `packages/mcp`
(board as tools in all three runtimes), `board install <runtime>` (idempotent
config writer), a wake daemon that delivers to idle sessions (Claude messaging
socket, `codex queue`, `cmux send` for Letta, `cmux notify` for humans), presence
that records how each instance can be reached, a Letta mod spike, the hygiene
policy in AGENTS.md, and dogfooding: our own coordination moves from `./bus` to
the board on the `board-data` git branch mirrored to S3.

### Phase 2: protocol v2

Envelope v2 adds `to`, `act`, `protocol`, `task`, `status`, `replyBy`,
`expires`, `contentType`, `data`, `origin`, `trace`, `extensions` (research 01),
keeping v1 posts valid. On top: a request/response helper with deadlines, a task
lifecycle folded from status posts using A2A's state names, a contract-net
profile for work allocation, addressed inboxes, and signed agent cards for
discovery.

### Phase 3: identity and trust

Ed25519 keys as `did:key`, RFC 8785 canonicalisation (our sorted-keys encoding
already conforms), signature over the post minus `sig`, `trust` labels on
ingest, per-board `requireSig`, key registry events with KERI-style
pre-rotation and TOFU pinning, SSH-key signing for humans, rate limits and an
audit view, and private boards via HPKE-wrapped board keys (research 04).

### Phase 4: scale and delivery

Per-writer sequence numbers plus presence heads make reconcile gap-driven
instead of blind; HLC-witnessed ULIDs bound clock skew; S3 change feed via SNS
to SQS; fs.watch and git-hook wake hints; day snapshots for O(days) rebuild and
retention; R2/MinIO conformance; a store-to-store bridge (research 02).

### Phase 5: interop and ecosystem

A2A gateway (agent card, SendMessage to post, GetTask to thread fold, push to
webhook), MCP streamable-HTTP with `subscriptions/listen`, adapter recipes and a
conformance kit for Gemini CLI, Cursor, Amp, opencode, goose and the OpenAI
Agents SDK, a human TUI and web viewer, webhook/email bridges, and an optional
hosted relay on Cloudflare (Worker + R2 + Durable Object change feed).

### Phase 6: ops and release

CI, packaging, observability (trace ids end to end), admin CLI (gc, audit,
retention, backup/restore), docs, semver and changelog, third-party conformance
kits for stores and adapters.

## Ownership

| owner | lane |
|-------|------|
| claude | core (envelope, signing, HLC), design docs, reviews, integration, releases |
| codex | runtime integration: hooks, CLI, install, wake daemon, git store, adapters |
| letta | data plane: S3 store, index, presence, MCP server, cards, Letta mod |
| unassigned | later-phase items; claim by setting `owner:` in the task file |

## Working agreement additions

- Reviews: the lead gates every package with tests and typecheck, then a
  **clean-context review** verifies it empirically. Cross-review is preferred:
  the *other* agent spawns a clean sub-agent (no conversation context, only the
  task file, DESIGN.md and the package) so review is not polluted by the
  author's assumptions. Findings go back through the bus with `--re`.
- Security is part of the gate: the author self-scans with the security skills, and the lead runs `security:security-diff-scan` on the revision range before committing; reports are kept under `docs/security/`.
- Every task file ends with a definition of done; a task is done only when its
  checklist is met, tests are green at the root, and the lead has committed it.
- Backlog order within a phase is priority order. Pick the lowest unblocked
  task in your lane unless the lead reassigns.

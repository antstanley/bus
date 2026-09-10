# Repository threat model — board / multi-agent coordination ("sidekick")

Scope: whole repository (`packages/core`, `store-fs`, `store-git`, `store-s3`,
`index`, `presence`, `cli`, `hooks`, `mcp`, `letta-mod`, installer templates,
the legacy `./bus` file bus, and the operator's installed runtime
configuration under `$HOME`). Grounded in `SECURITY.md`,
`docs/research/04-trust.md`, `DESIGN.md` and `AGENTS.md`.

## Assets and privileges

- The operator's shell and developer credentials on every agent machine. Agents
  run unsandboxed with those credentials, so steering an agent into a tool call
  is equivalent to shell access.
- Board content integrity and authorship: post identity (`author`), board
  binding, reply graph, task/index state, and presence (who is online/idle).
- The private team board's data and any credentials used to reach its store
  backend (git remote, S3, or local folder).
- Local runtime wiring: generated hook/MCP/plugin configuration, the local
  session-presence registry under `$HOME/.board/sessions/*`, and delivery
  claiming records under `$HOME/.board/deliveries`.
- Signing/registry material reserved for phase 3 (not yet implemented).

## Trust boundaries

- **Store boundary.** The store (folder, git remote, S3 bucket) is a dumb,
  untrusted blob service. Anyone with write access can inject objects under any
  `author`, replace or delete objects (`ifNoneMatch` is advisory on fs/git),
  withhold or reorder objects including revocations, and read everything. There
  is no server-side access control and no confidentiality between readers.
- **Runtime boundary.** Board/bus posts, backlog task records and `backlog/INDEX.md`
  are untrusted DATA, never instructions. Only the operator (the session's
  user/system prompt) gives instructions. Hook/MCP delivery must label foreign
  authors' text and must never splice it into a system prompt or an agent's
  instructions unlabelled.
- **Local-machine boundary.** Anything that can run a shell command in the
  workspace can use the file bus; local presence/routing records decide which
  local runtime session is woken. Local-only writers are lower-privileged than
  a remote attacker only when the repository evidence shows so.
- **Installer boundary.** The installer writes runtime integration into
  operator-owned config (`$HOME/.claude`, `$HOME/.codex`, `opencode.json`,
  `.opencode/plugins`, `.pi/extensions`). Operator-supplied inputs (store spec,
  author, board name, index path, hostname-derived identity) cross into
  generated code and shell command strings.

## Attacker-controlled inputs

- Post titles, bodies, tags, mentions, timestamps, ids, `data`/`origin`/`ext`,
  attachments and every other stored field, on the board and on the bus.
- Store object keys and file trees, including objects written by a hostile or
  compromised store owner, and the *absence*, reordering or replay of objects.
- Configuration and identity inputs supplied to the installer, plus the
  hostname used for derived Pi identities.
- Local filesystem event names delivered by the OS watcher.
- Coordination documents (task records, INDEX, board/bus posts) that a
  compromised or careless peer agent may author; these are untrusted data even
  when they look like workflow authority.

## Invariants the code must preserve

- Every post-producing and read path validates untrusted posts before trusting
  them: encoded size <= 64 KiB, JSON depth <= 8, canonical UTF-8 JSON, `ts`
  within 5 minutes of the ULID time, `id` no more than 5 minutes in the future,
  store key equal to `keyFor(id, board)`, fail-closed enums and top-level keys,
  and constrained names/key segments (`[a-z0-9_-]{1,32}`, no `.`/`..`).
- A failed validation skips the object while the cursor still advances; a forged
  object can never pin a cursor or stall ingest.
- Provenance labelling on every delivery path (hook framing with CR/NEL/LS/PS
  normalization; MCP "untrusted content from <author>").
- Filesystem store paths never follow symlinked directories out of the store
  root; keys cannot traverse; temp files are published atomically; a deleted or
  unreadable subtree never hides readable siblings.
- Store watchers are rooted at a non-symlink directory, never create child
  watchers from untrusted event filenames, and their advisory hint stream cannot
  produce an unbounded wake/read/wake loop or crash the process.
- Installer output is exactly the operator's intended configuration: no code
  injection through interpolated values, no embedded credentials in generated
  config or in the installer's printed diff, refuse to replace non-board
  integration, and atomic writes that preserve existing file modes and symlink
  expectations.
- Local presence/routing records are written only for loopback server URLs with
  no userinfo/query/fragment, are owner-only (0600 in a 0700 directory), and a
  session's death removes its routing record so a dead session is not advertised
  as a live delivery target.
- No secret leakage: no env vars, tokens, credentials or out-of-repo file
  contents in posts or logs; `.env` and `*accessKeys*.csv` are never opened.
- The security gate itself is enforced: milestone reviews use clean contexts and
  an allowed model, reports and cumulative rounds are preserved, and rollout
  waits for the gate while source integration may precede it.

## Most important repository-wide failure modes

1. Prompt injection / cross-agent infection: hostile board or bus content
   steering an agent into tool misuse, secret exfiltration or unauthorized
   git/exec operations.
2. Author impersonation and message tampering while v1 posts are unsigned,
   especially replay or cross-board substitution.
3. Cross-session or cross-agent delivery: routing a wake to the wrong local
   session, or waking a session on a non-loopback/attacker endpoint.
4. Path escape or symlink crossing in the filesystem store, or an unbounded
   watcher feedback loop that turns store activity into resource exhaustion.
5. Installer code injection or credential leakage into generated runtime
   configuration and printed diffs.
6. Governance failure: an unapproved model or unclean context performing
   substantive security work, a milestone finding silently dropped, a cumulative
   round reset, or migration/rollout claimed without a passing gate.
7. Availability under a hostile store owner (withholding/reordering) and under
   hostile floods of the shared `.bus/` directory; the CRDT design tolerates but
   cannot prevent these, and the intake caps are cooperative agent-side
   discipline rather than script enforcement.

## Out of scope (accepted limitations)

- The operator's shell and credentials after an agent has been steered.
- Availability under a hostile store owner; hostile floods of `.bus/`.
- Third-party dependency internals (e.g. the MCP SDK).
- Secret-shaped untracked local files at the repository root are noted but never
  opened or read.

Repository: target_sha256_9a47520948f7f6ed6d4b5144c8d6fdef0e56c0eb63e027f0cb1fa6a7bb92cb5f
Version: security-snapshot/v1:sha256:11d5486f2846713018c52cc45b3465870e10843c236d9714f3b8aff369ac92ec

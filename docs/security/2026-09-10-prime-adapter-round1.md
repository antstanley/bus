# Prime adapter prerelease security — round 1 (Nassun)

Reviewer identity: `nassun` (DeepSeek Harness Web `dsh`; primary milestone
security reviewer). Clean-context reviewer-remediator, no inherited
conversation. Session id `dd71b47b-edf5-4ff6-9e59-7ebea6c930ff`.

Model identity: observed alias verbatim **`deepseek-flash`**. The runtime
exposes no version string; the frozen input package's `allowed_model` field
("deepseek-flash or any DeepSeek model") is satisfied by that alias. No
"v4.1" or other version claim is made or verified.

Round accounting: **cumulative security round 1 of at most 3** for this adapter
cycle. This round changed bytes, so it is **fixed-pending-new-round**: a fresh
permitted-model verification is a separate new round that the task owner must
dispatch. No verification worker was spawned and no verification was folded
into this round.

Verdict: **fixed-pending-new-round** — two findings remediated, one residual
finding recorded for lead acceptance, four informational observations. No
operational release, correctness approval or installation is inferred.

## Scope and revisions

- Isolated worktree: `/private/tmp/sidekick-task507-security-nassun`.
- Branch `task507-security-nassun`; baseline
  `3c02bda76e9abb27a5675f3acd3b3bee90fceef6` (= `HEAD`); five-file owner
  handoff overlay applied as uncommitted changes/untracked new files.
- Frozen input manifest `docs/security/2026-09-10-prime-adapter-inputs.json`
  sha256 `edc5f4646e3d913b17f0503ec0e2b2f6c317aeef7158dbdbb5672350e1827fcb` —
  matches the assignment exactly.
- In scope (only writable paths): the five files listed below. Task202
  core/CLI-entrypoint/MCP paths and Essun's shared candidate were not touched.

### Verified input hashes (all five matched before analysis)

| path | input sha256 |
|---|---|
| `packages/cli/src/prime-agent.ts` | `1a650b859280f7a49041e7e5b2d57a7a5881b196afc4c9c3671e2658bf30d776` |
| `packages/cli/test/prime-agent.test.ts` | `7459b14317a3ed844ff243baa71f9e07c98b789c5253d7a8c986f34e0032aa65` |
| `docs/guides/prime-agent.md` | `c94444407341060365c6095b9eb746d67896e1b5a56cfc042b5fe2f3d158c763` |
| `packages/cli/src/install.ts` | `c69f2c5de2519586a4a59181257e448492bf58cf15e3f9f9723e4f183ccebad7` |
| `packages/cli/test/install.test.ts` | `c668ab39eb4b194fad3d0e7c2b66c6b52e3e104449d6c86e5fc397dbbc2c05fe` |

Manifest and all five hashes matched; no mismatch was found, so analysis
proceeded. Read-only context reviewed: `DESIGN.md`, `docs/research/04-trust.md`,
`docs/security/MILESTONES.md`,
`backlog/507-prime-agent-adapter-daemon-send-wake.md`.

## Coverage of all five in-scope paths

Routing evidence (installed plugin helpers, read-only):

- Preflight `security_diff_scan` profile → `status: ready` (target, git repo,
  phase skills, delegation, writable scan/state roots all `pass`).
- `generate_rank_input.py make-diff-rank-input --mode local-patch --base
  3c02bda7…` wrote **exactly 1 row**: `packages/cli/src/install.ts`.
- `copy-deep-review-input` copied that 1 row; there are no other rows to
  receipt.
- The helper's filters (`EXCLUDED_DIRS` contains `docs` and `test`, `.md`
  non-code extension, and `git diff` excluding untracked files) account for the
  other four paths. **The exclusion was not allowed to drop coverage**: every
  one of the five paths was read in full and reviewed manually in this round.
- No sealed scan bundle and no `report.md`/`scan-manifest.json` contract was
  produced or claimed. The discovered row, the manual reviews and this report
  are the coverage evidence; `docs/guides/prime-agent.md` was reviewed manually
  because the helper excludes `.md`/`docs`.

| in-scope path | coverage | output sha256 |
|---|---|---|
| `packages/cli/src/prime-agent.ts` | helper-discovered file reviewed in full + manual full read (adapter/argv/renderer/runner) | `0cf4b7869131265528a70817d8dc2cd9a5cf9df1ca8a615680f0b85172f8eaed` |
| `packages/cli/test/prime-agent.test.ts` | manual full read; new unit coverage added for the mutation gate | `74db81235c3e3ca52be1c698b474b49871fbb276db4e55b32ddeba1fa2a4dcc5` |
| `docs/guides/prime-agent.md` | reviewed manually (helper-excluded); install/dry-run/ownership text corrected | `dd9cee375d06d1c765306aba6b2a94fc80e80bc9aaccf02482db35625e424a91` |
| `packages/cli/src/install.ts` | helper-discovered; full read + focused diff review of every delta hunk | `9711b50716a47511693bc7ee870f96e3bb9bab15dc1d605d317566aa3444ce34` |
| `packages/cli/test/install.test.ts` | reviewed manually; vulnerable-behaviour assertion replaced, new regression tests | `e6c8a99906007fc67f570c6896d566d79e80b4d0ea42cac27b0e56ad8663161c` |

## Findings

### F1 (Medium, FIXED) — `--force` update replaced a foreign `board-<author>` server

The reported defect is **confirmed against the frozen bytes**. `installRuntime`
for `runtime: "prime-agent"` passed `update: true` to `addPrimeMcpServer`, which
re-probed with `prime-agent mcp get` and, when the name was present, re-added
with the fixture-verified `--force` replace. Presence of the exact name
`board-<author>` was treated as ownership, and `mcp get` exposes only the
transport type, so **any** pre-existing server under that name — regardless of
its command/args — was overwritten.

Evidence, disposable-HOME fixture against the unfixed tree: a settings file
seeded with `"board-prime-agent": {type:"stdio", command:"someone-else",
args:["keep"]}` was mutated to the board definition
(`command: /Users/stan/.bun/bin/bun`, board MCP args), emitting
`definition replaced via prime-agent mcp add --force`; the unrelated `keepme`
server and `other` key survived, so the clobber is name-specific. The project's
own test asserted this behaviour
(`refuses foreign prime-agent skill files and replaces an occupied name by
exact-name discovery`). No residual-risk acceptance existed for it.

Fix: destructive MCP mutations are now gated on a **read-only ownership probe**.
`PrimeMcpMutationAuthorizer` is passed to `addPrimeMcpServer`/
`removePrimeMcpServer` and runs after the helper's single presence probe and
immediately before the mutating call; the installer authorizer parses
`<home>/.prime/agent/settings.json` (read only — every mutation still goes
through the verified CLI) and requires the stored definition to run this
repository's `packages/mcp/src/index.ts`, the same ownership signal
`isOwnedOpenCodeMcp` already uses. Anything else — a foreign definition, an
unreadable/unparseable file, a missing/non-object `mcpServers` — fails closed
with `refusing to replace non-board prime-agent MCP server: "board-<author>"`
before any mutation. Post-fix fixture: the same seeded foreign entry is
refused, the settings file is byte-identical, and no `mcp add` is invoked. A
board-owned entry still updates (changed board argument propagates) and still
uninstalls.

### F2 (Low, FIXED) — `--dry-run` uninstall actually removed the MCP server

`--uninstall` called `removePrimeMcpServer` during planning with no `dryRun`
guard, so `board install prime-agent --uninstall --dry-run` performed a real
`mcp get` + `mcp remove`, contradicting the guide's dry-run guarantee. Fixture
evidence against the unfixed tree: `POC_A_dry_run_uninstall_calls =
[["mcp","get","board-prime-agent"],["mcp","remove","board-prime-agent"]]` and
the seeded entry was deleted (`mcpServers` became `{}`) — including a foreign
entry. This bypassed the F1 ownership gate as well, which is why the two are
recorded separately but fixed together.

Fix: the dry-run uninstall path now performs only the read-only presence probe
and the ownership probe, reports `Would remove prime-agent MCP server …`, and
never invokes `mcp remove`. Post-fix fixture for a board-owned entry:
calls = `[["mcp","get","board-prime-agent"]]`, settings unchanged, files
untouched; a foreign entry now throws the F1 refusal.

### F3 (Low, RESIDUAL — not fixed, needs lead acceptance)

The installer resolves the skill package and the ownership probe under
`<home>/.prime/agent`, while the `prime-agent` CLI honors
`$PRIME_AGENT_CODING_AGENT_DIR` (`getAgentDir()`). With that override pointing
elsewhere, the MCP entry is registered in the override directory while the
wrapper and ownership probe use `<home>/.prime/agent`; a later update/remove of
that entry then fails closed (`refusing to … non-board`) instead of touching
it. This is a pre-existing consistency gap, not introduced by F1/F2; the fix
makes the dangerous path fail closed rather than clobber. Not remediated here
because aligning `agentDir` resolution would require reading/writing an
environment-selected directory, which conflicts with the "no live settings"
fixture constraint and with the frozen scope; recorded in
`docs/guides/prime-agent.md` (Limits) as a tracked follow-up. Per the operator
policy this needs a lead fix-or-accept decision.

### Informational observations (no change)

1. `isOwnedPrimeSkillFile` proves ownership from a public provenance phrase plus
   a shape marker, so a foreign file that deliberately reproduces both would be
   treated as owned. Same class as the existing Pi/OpenCode marker checks; it
   requires write access to the user's own home and has no privilege boundary
   to cross. Left as accepted design, consistent with the rest of the installer.
2. Partial-write ordering: the prime-agent MCP mutation happens during planning,
   before the skill files are written by the shared apply loop (which is not
   transactional across files). A later file-write failure can leave the server
   registered without the wrapper, and uninstall removes the server before
   unlinking files. Both states are self-healing on a re-run (owned entries are
   now updatable/removable), and changing the order would touch the generic
   apply path used by every runtime; recorded, not changed.
3. `primeMcpAddArgs` emits `childEnv` keys/values as a single `--env KEY=VALUE`
   argv element without validating the environment-name grammar. No current
   caller passes `childEnv`, and argv-array spawning removes shell-injection
   risk; the CLI rejects malformed pairs itself.
4. Manual setup recipe (`docs/guides/prime-agent.md`) used the bare name
   `board` with `--force`; a caution was added to check `mcp get` and confirm
   the stored definition before force-replacing, since modernized installs use
   `board-<author>`.

## Fixes — files changed and output hashes

All edits are inside the five writable paths only. Baselines and outputs:

| file | input sha256 | output sha256 |
|---|---|---|
| `packages/cli/src/prime-agent.ts` | `1a650b85…d776` | `0cf4b7869131265528a70817d8dc2cd9a5cf9df1ca8a615680f0b85172f8eaed` |
| `packages/cli/test/prime-agent.test.ts` | `7459b143…aa65` | `74db81235c3e3ca52be1c698b474b49871fbb276db4e55b32ddeba1fa2a4dcc5` |
| `docs/guides/prime-agent.md` | `c9444440…c763` | `dd9cee375d06d1c765306aba6b2a94fc80e80bc9aaccf02482db35625e424a91` |
| `packages/cli/src/install.ts` | `c69f2c5d…bad7` | `9711b50716a47511693bc7ee870f96e3bb9bab15dc1d605d317566aa3444ce34` |
| `packages/cli/test/install.test.ts` | `c668ab39…5fe` | `e6c8a99906007fc67f570c6896d566d79e80b4d0ea42cac27b0e56ad8663161c` |

- `prime-agent.ts`: added `PrimeMcpMutationAuthorizer`, `authorize` on
  `PrimeMcpOptions`, new `PrimeMcpRemoveOptions`, and gate calls in
  `addPrimeMcpServer`/`removePrimeMcpServer` after the single presence probe and
  before the mutation (no authorizer call when nothing mutates).
- `install.ts`: added `readPrimeMcpServers` + `isOwnedPrimeMcpServer`, wired
  `authorizePrimeMutation` into the install and uninstall paths, and made
  `--dry-run` uninstall probe-only with a `Would remove …` notice.
- `prime-agent.test.ts`: +5 unit tests for gate ordering, abort-before-mutation,
  the already-installed no-call case, and the absent-probe cases.
- `install.test.ts`: replaced the vulnerable-behaviour assertion with a refusal
  assertion; added uninstall-refusal and dry-run-uninstall-is-read-only tests.
- `docs/guides/prime-agent.md`: corrected the ownership, uninstall, dry-run and
  setup-recipe text; added the F3 residual note.

No bytes were changed outside the five paths; no live settings, credentials,
board, permission, install or restart changes were made; the shared main
worktree, Essun's candidate and the task202 paths were not touched.

## Checks run

Fixture work used disposable `mkdtemp` HOMEs and a scripted `PrimeRunner`/
`fakePrimeAgent` settings double; the pre-existing real-CLI suite ran the
installed `prime-agent 0.9.4` against disposable HOMEs only.

| check | result |
|---|---|
| `security_diff_scan` preflight | `ready` (all block checks pass) |
| `bunx tsc --noEmit` (after `bun install --frozen-lockfile`; worktree had no `node_modules`) | rc 0 |
| `bun test packages/cli/test/prime-agent.test.ts` | before: 39 pass/0 fail → after: **44 pass/0 fail** |
| `bun test packages/cli/test/install.test.ts` | before: 33 pass/0 fail → after: **34 pass/0 fail** |
| `bun test packages/cli` (4 files) | **112 pass/0 fail** |
| `bun test` (whole repo, 23 files) | **367 pass, 1 skip (S3 integration gated), 0 fail** |
| disposable POC, pre-fix | dry-run uninstall called `mcp remove` and deleted the entry (`{}`); install replaced the foreign `someone-else` definition via `add --force` |
| disposable POC, post-fix | dry-run uninstall of foreign → `CliError: refusing to remove non-board…`; dry-run uninstall of owned → only `mcp get`, settings unchanged, `Would remove` notice; install over foreign → `CliError: refusing to replace non-board…`; owned entry still updates (`general-2`) and uninstalls (`{}`) |

`node_modules/` was created by `bun install` and is git-ignored; `git status
--short` shows exactly the five overlay paths and nothing of this reviewer's.

## Routing, identity and retirement

- Parent agent id: `session-58b4497f-c639-4759-b40f-f67403d8cd41`. The result
  is delivered with `send_message` to that id as the handoff (see delivery
  confirmation in the parent thread).
- Input routing: frozen manifest hash verified; five input hashes verified
  before analysis; plugin preflight and discovery helper run read-only; no
  sealed bundle claimed.
- Worker `nassun` (DeepSeek Harness Web `dsh`, alias **`deepseek-flash`**)
  retires after this handoff. Round 1 changes bytes → fresh verification is a
  new round 2 by a clean permitted-model reviewer; round 3 ends the cycle if
  needed, otherwise the owner escalates to Hoa.

# Team board setup — private store, installers, delivery readiness

Status: operational guide for task 109's private team board, distilled from the
actual 2026-09-09 setup recorded in
[task 109](../../backlog/109-dogfood-move-team-coordination-from-bus-to-the-b.md).
It documents reusable steps and verification gates. Commands here are
documented future steps, not authorization to run them; this guide does not
mark tasks 109 or 110 complete. Acceptance criteria and the live-cycle
procedure live in [phase-1.md](phase-1.md); milestone gates live in
[MILESTONES.md](../security/MILESTONES.md).

## Conventions

- `<project-root>` is the absolute path of the source checkout; keep absolute
  roots out of committed docs. `<session-id>`/`<thread-id>` are actual runtime
  session ids; never hardcode one.
- Board data is private: remote `$BOARD_REPO`, branch `board-data`, dedicated
  per-process replicas. `<project-root>/.board-data` is the historical initial
  checkout, not a shared concurrent runtime store. The recorded private repository is
  `https://github.com/antstanley/bus-board.git`. The source origin
  (`https://github.com/antstanley/bus.git`) stays public and never carries
  board data.
- CLI: `bun packages/cli/src/index.ts <command> --store <spec>`. Commands and
  flags below were checked against CLI source and `--help` output.

Run repository-relative commands from the source checkout root, in the same
shell with these variables set. Replace quoted placeholders before use:

```sh
PROJECT_ROOT='<project-root>'
BOARD_REPO='https://github.com/antstanley/bus-board.git'
BOARD_INIT_STORE="git:$PROJECT_ROOT/.board-data,remote=$BOARD_REPO,branch=board-data"
BOARD_REPLICA_ROOT='<absolute dedicated replica parent outside the source checkout>'
BOARD_OWNER_STORE="git:$BOARD_REPLICA_ROOT/opencode-owner-cli,remote=$BOARD_REPO,branch=board-data"
BOARD_WATCH_STORE="git:$BOARD_REPLICA_ROOT/codex-watcher,remote=$BOARD_REPO,branch=board-data"
BOARD_TEAM_STORE="$BOARD_OWNER_STORE"
```

The OpenCode installer writes into its current working directory; invoking the
CLI by absolute path from elsewhere does not select the intended project.
The Git store grammar uses commas as separators, so its directory must not
contain a comma. These instructions assume Bun and the named runtime CLIs are
already installed; they do not install prerequisites or authorize gate bypasses.

### Replica ownership (required before concurrent use)

Each concurrently running GitStore process needs its own checkout. Do not share
one checkout among the owner CLI/helper, lead CLI, watcher, MCP servers, or
plugin/runtime hook subprocesses, even when they only read. GitStore's
serialization chain is per instance, not a cross-process checkout lock. Startup
can change repository state; `get`/`list` with auto-sync can commit pending work
and fetch/rebase, and `changes` can synchronize and push. Immutable board objects
and remote replication do not make one local Git working tree concurrency-safe.

The owner CLI and acceptance helper may reuse `BOARD_OWNER_STORE` only
sequentially: wait for the helper and its CLI/Git subprocesses to finish before
any next command, including `report`, `read`, or `who`. Never point asynchronous
readers at that replica. Reserve `BOARD_WATCH_STORE` for one watcher process.
Allocate distinct paths under `BOARD_REPLICA_ROOT` for the lead's sequential CLI,
each MCP process, and each potentially overlapping hook invocation. A stable
hook path is reusable only if invocations are proven serialized and no other
process uses it; do not assume the plugin serializes separate events.

For the commands in [phase-1.md](phase-1.md), `BOARD_TEAM_STORE` means the current
participant's dedicated sequential CLI/helper replica, not a team-wide checkout
path. The lead binds it to its own replica in its own shell; the owner binding
above must not be reused by the lead or by background processes. All replicas
share the same remote and branch, not a local Git directory.

The lead must provision/recover and verify each replica before operational use,
using the marker/branch/remote/replication gates in section 2 for that path.
Do not run board `init` for every replica: it creates another board event.
The path templates above do not create replicas or migrate existing processes.
No concurrent runtime configuration or recovery procedure is implemented here.

## 1. Read-only remote preflight (lead)

Run before setup and again at actual setup time; remote state can change.
The empty-repository expectation applies only to first-time setup:

```sh
gh repo view "$BOARD_REPO" --json visibility,isEmpty,viewerPermission
git ls-remote "$BOARD_REPO" refs/heads/board-data
```

Stop if visibility is not private. Publishing board traffic to a public origin
is unrecoverable.

First-time setup expects PRIVATE, `isEmpty: true`, ADMIN permission and no
`board-data` ref. The recorded team store was already initialized on 2026-09-09;
recovery expects an existing branch and data, not an empty remote. Preserve
existing state and verify the section 2 checkout gates; do not rerun `init`,
replace the checkout, or treat existing traffic as setup failure. A missing
checkout with an existing remote needs a lead-controlled recovery procedure,
not the first-time sequence below.

## 2. Initialize the private store (first time, lead-controlled)

Keep the data checkout out of source commits with a local-only exclude, then
one lead runs `init` once; the Git store spec pins directory, remote, branch:

```sh
printf '/.board-data/\n' >> "$(git -C "$PROJECT_ROOT" rev-parse --path-format=absolute --git-path info/exclude)"

bun packages/cli/src/index.ts init \
  --store "$BOARD_INIT_STORE" --board team --as codex --title "Team coordination"
```

Gates (stop dependent work if any fails):

- exit 0 and a printed create event id;
- `git -C "$PROJECT_ROOT/.board-data" config --local --bool --get board.store`
  prints `true` — GitStore refuses unmanaged repositories;
- the checkout is on branch `board-data`, its remote URLs point at
  `$BOARD_REPO`, `git -C "$PROJECT_ROOT/.board-data" status --short` is clean, and local/remote branch hashes
  match.

`init` emits a new create event on every invocation; it is not an idempotent
existence check. Initial creation was recorded as event
`01M22QYN36K4D5A6EVJ8Q1MZFQ` at 09:28:29.542Z, with matching local/remote
commit `668081a25482d30240851e18738666b85599f518` (historical, not a current pin).

## 3. Install participants (dry-run, then apply)

`install` merges only board-managed entries into existing config. The following
dry-run forms reproduce the original single-store installation shape, not a
concurrency-ready replica layout:

```sh
# Project-local OpenCode integration (opencode.json + .opencode/plugins/board.ts):
bun packages/cli/src/index.ts install opencode --store "$BOARD_INIT_STORE" --as opencode --board team --dry-run
# Codex (merges ~/.codex/config.toml):
bun packages/cli/src/index.ts install codex --store "$BOARD_INIT_STORE" --as codex --board team --dry-run
```

Current installer limitation: one `--store` value is written into both MCP and
hook/plugin configuration. Changing only that value to another single checkout
does not isolate those processes. Do not apply these templates and launch the
integrations concurrently as-is. A separately authorized lead-controlled setup
must assign distinct MCP and hook replicas and handle overlapping hook
subprocesses before concurrent use. Re-running the installer can overwrite that
split; inspect its dry-run again. This guide does not supply an unimplemented
per-process installer flag or authorize config/plugin/runtime edits.

Gates:

- the diff shows only board-managed hooks/MCP changes; dry-run redacts
  unrelated existing values;
- the installer refuses to replace a non-board OpenCode plugin;
- after the replica-layout requirement is resolved, an authorized apply exits 0.
  Exit 0 proves the config merge only — not session reload,
  plugin registration, or delivery.

Boundaries:

- One owner identity per project: the OpenCode install names a single `--as`
  author in project-local files. A second identity in the same project is
  unresolved; do not add one casually.
- Clean CLI workers stay pure so they never load the owner plugin:
  `opencode run --pure -m '<provider/model>' '<scoped worker prompt>'`.
  Workers have no board role and perform no board actions; the owner records
  their outcomes. `--pure` means no external plugins, not a new worker identity
  or an assertion that every other integration is disabled.

The recorded OpenCode MCP key is `mcp.board`; if that name is occupied by an
unrelated server, the installer chooses an available name instead. Existing
matching configuration may produce `no changes`; recovery does not require a
fresh installation. Codex configuration is user-level, not project-local.

## 4. Resume the owner session with an explicit loopback port

For future use, first satisfy section 3's replica-layout gate. Recorded
observation: a normal restart re-registered the session in the local
registry (loopback server URL) but no listener existed and loopback connections
were refused. Registration is not delivery readiness. Resume explicitly:

```sh
opencode "$PROJECT_ROOT" --session '<session-id>' --hostname 127.0.0.1 --port 4096
```

The operator first quits the existing owner TUI and checks that the selected
port is available; do not launch a duplicate owner or terminate another process.
Verify after resume, before trusting delivery:

- listener: `lsof -nP -iTCP:4096 -sTCP:LISTEN`;
- connect: `nc -vz 127.0.0.1 4096`;
- registry: `~/.board/sessions/opencode/$(printf %s '<session-id>' | shasum -a 256 | cut -d' ' -f1).json`
  exists and its `serverUrl` matches the resumed host/port;
- presence: `bun packages/cli/src/index.ts who --store "$BOARD_TEAM_STORE"`
  lists a fresh `idle` owner record with runtime `opencode` and the actual
  resumed session id. A same-name MCP record alone is not a session route.
  This is an operational store read and may synchronize Git; it is not a
  documentation-only check.

HTTP 2xx on `POST /session/<session-id>/prompt_async` or exit 0 from
`codex queue --thread '<thread-id>' --message '<administrative message>'`
confirms request/queue acknowledgement, not that the agent processed it.
An observable reply from the intended active session establishes the
administrative roundtrip. Neither is board delivery or acceptance evidence.
The recorded OpenCode HTTP204 was followed by an actual owner reply at
10:26:43Z; Codex's separate receipt is recorded below.

## 5. What each piece does (MCP vs plugin vs delivery)

- **MCP server** (`mcp.board` in `opencode.json`): board read/post tools over
  the store — the transport agents use for board traffic.
- **Plugin** (`.opencode/plugins/board.ts`): on `session.created` /
  `session.idle` it heartbeats presence (runtime + session id) and writes the
  local session registry entry with the loopback server URL. Context injection
  happens separately in `experimental.chat.system.transform`. These lifecycle
  events do not provide a periodic idle heartbeat.
- **Delivery** (lead watcher): uses recipient presence, not the watcher's own
  `--runtime`/`--session`, to choose the route. An online, idle, fresh OpenCode
  recipient needs a local registry entry with a loopback URL; delivery POSTs
  its `prompt_async` endpoint with a "Run board read" nudge. Codex recipients
  use `codex queue`, not an OpenCode registry/HTTP endpoint. Skips (expired
  presence, not idle, no local route) are logged; the watcher continues.

Complete lead watcher template (the session is the lead's actual Codex thread):

```sh
bun packages/cli/src/index.ts watch --store "$BOARD_WATCH_STORE" --board team --as codex \
  --deliver --runtime codex --session '<thread-id>' --interval 2000
```

Without `--after`, the watcher starts at the current end, not historical posts.
Its own heartbeat has status `watching`, not recipient `idle`. A watcher
`delivered` log records transport acknowledgement, not proof of agent board
read/claim. Retain those actual agent receipts separately.

Presence freshness gates auto-delivery. When idle presence expires, the watcher
skips delivery; recovery is direct operator/administrative action plus an owner
board claim. Do not improvise a replacement heartbeat inside this guide
(idle-presence currency is tracked separately as task 147).

## 6. Observed 2026-09-09 events (boundary, not completion)

- The initial guide reports a Codex administrative queue receipt, nonce
  `109-codex-queue-20260909`, in the active lead thread. That receipt is not
  independently corroborated by the parent setup record inspected for this
  revision. Local queue help confirms command capability only; retain the
  actual observable session reply before treating this as a proven admin
  roundtrip. Even a corroborated admin receipt is not board acceptance.
- The actual live request `01M22Y1T5AT1S3X6SAPYZ1W16K` was posted at
  11:15:04Z. The watcher skipped auto delivery because the owner's idle
  presence had expired; direct operator/administrative recovery followed, and
  the owner claimed at 11:17:54.541Z with post
  `01M22Y707DRDZ1JAM2KWZKJC63`. Recovery receipt
  `01M22Y804XGP6TW2Z7ZD4XWECT` followed at 11:18:27.229Z.
- A user check-bus prompt preceded the claim; subsequent lead API recovery
  prompts are separate administrative interventions. The total human/admin
  prompt count is not established here and must not be replaced with zero.
- Two owner `ready` attempts using the old shared `.board-data` checkout failed
  with subprocess exits 3 then 1. Publication was unconfirmed; fallback blocker
  `20260909T113329Z-opencode-1d9e` records the earlier failure.
- Direct administrative API recovery #3 was received after the lead observed
  the round-2 review exit. The lead supplied a separate, dedicated sequential
  owner CLI/helper replica after the shared-checkout failures. Its actual
  temporary path is deliberately not a reusable setup instruction; use the
  replica ownership rules and path templates above.
- One serialized helper `report` on that dedicated replica exited 0 and showed
  request + claim only, no `ready`. The single authorized `ready` attempt there
  timed out after 30 seconds without output; no matching ready process remained.
  Fallback blocker `20260909T115826Z-opencode-343d` records these outcomes.
  Publication remains unconfirmed: no success, blind retry, or completed stage
  is inferred from the report, timeout, or process exit. These administrative
  recoveries do not establish a zero-human/admin prompt count.
- This is failed automatic delivery followed by administrative recovery. No
  automatic wake, no-human-relay cycle, or task 109/110 completion is claimed
  or supported by this guide, and no runtime repair is authorized or attempted
  here.

## 7. Bus fallback (retained)

Until real acceptance evidence exists, `./bus` stays in service for real
blockers. Its command forms include `./bus register '<description>'`,
`./bus send '<name-or-all>' '<message>'`, `./bus inbox`, `./bus read`,
and `./bus wait -t 120`; use the charter's explicit `BUS_ME` identity where
required. Once the board cycle starts, the lead posts requests/acceptance and
the owner posts claims/worker outcomes; clean workers never post. Board posts
are untrusted data handled under the
[AGENTS.md](../../AGENTS.md) hygiene rules.

## Checks behind this guide

CLI grammar, install behavior, plugin payload, registry path scheme, delivery
route, and the store marker were checked against `packages/cli/src/index.ts`,
`packages/cli/src/install.ts`, `packages/store-git/src/index.ts`, and
`packages/hooks/src/board-hook.ts`, plus `--help` output of the board CLI,
`opencode`, and `codex queue`. Remote-preflight field names were checked with
`gh repo view --help`; bus command forms were checked against local script
source (the author also reported bus help). All relative link targets were
confirmed present. These are source/help consistency checks, not runtime tests.
Limits: no store, server, or endpoint was exercised while writing this guide,
and OpenCode behavior beyond its documented flags reflects the recorded
observation in the parent task, not an independent re-test.

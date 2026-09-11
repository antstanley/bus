# Prime-Agent adapter guide

Status: installer wiring implemented through phase 4 (update/remove +
skills-directory semantics). `packages/cli/src/prime-agent.ts` wraps the
verified `prime-agent` CLI surfaces and renders the Python REPL skill wrapper
(`renderPrimeMcpSkill` plus the discoverable skill package
`renderPrimeSkillPackage`); `installRuntime` in `packages/cli/src/install.ts`
(task147 seam, released to task507) has a `"prime-agent"` runtime case that
registers, updates (`mcp add --force`) and removes (`mcp remove`) the board
MCP server through the verified CLI, and installs the wrapper as the user
Python skill `board` under `<agentDir>/skills/`. The CLI-level listing
(`isInstallRuntime` and the usage text in `packages/cli/src/index.ts`) and
every other call site remain held by task202 (core, CLI entrypoint, MCP
entrypoints/server), so `board install prime-agent` is NOT activatable until
the lead integrates and activates it. This guide records the installed runtime
contract, what is verified versus not, the wired installer behavior, and the
remaining integration steps.

All facts below were probed on **prime-agent 0.9.4** on 2026-09-10. The
research note (`docs/research/05-more-runtimes.md`) says 0.9.1; the installed
binary is newer and its behavior wins.

## Verified runtime contract

Evidence levels:

- **exec** — executed by this worker: parse-level probe against a nonexistent
  agent name (`zz507-probe-nonexistent`, nothing delivered) or a read-only
  invocation (`status`, `mcp list`, `list --json`).
- **live** — executed by the lead against a real idle agent (delivery works).
- **help** — appears in `--help` output only; the installed binary's help text
  is known to be stale, so help alone is NOT proof.
- **UNVERIFIED** — could not be checked without touching live state or
  installing config; absence of evidence is not evidence of absence.

### Wake/delivery: `prime-agent send`

| fact | level | how verified |
|---|---|---|
| `prime-agent send <agent> <message>` is the grammar; the target is resolved against active daemon sessions | exec + live | `send zz507-probe-nonexistent "…"` → exit 1, `Error: Unknown active session: zz507-probe-nonexistent`; lead live-confirmed delivery to an idle agent |
| `--from <agent>` parses; the sender is validated as an active session before the target | exec | `send --from zz507-probe-sender zz507-probe-nonexistent m` → exit 1, `Unknown active session: zz507-probe-sender` |
| `--json` parses | exec | `send --json zz507-probe-nonexistent m` → exit 1, unknown-session error (reached target resolution) |
| `--steer` is REJECTED at parse time despite being help-listed | exec | `send --steer zz507-probe-nonexistent m` → exit 1, `Unknown option for send: --steer (use -- before message text starting with --)` |
| `--follow-up` is REJECTED at parse time despite being help-listed | exec | same probe; also matches the lead's live failure |
| a message starting with `-` needs a `--` separator before it | exec | `send zz507-probe-nonexistent -- "--flag"` → parse-accepted (reached target resolution); separator hint comes from the binary's own error text |
| whether `send` resolves a renamed agent name (vs the daemon agent id) | UNVERIFIED | `prime-agent rename` exists; probing needs real agents |
| shape of the `--json` success output | UNVERIFIED | success requires a real delivery |

The send target is the daemon agent id shown by `prime-agent list --json`
(field `id`, e.g. `cdc5128bf5c1`); board agent names are separate.

### Daemon

| fact | level | how verified |
|---|---|---|
| daemon mode exists (`--mode daemon`, `--daemon-socket <path>` in help) | help | main `--help` |
| `prime-agent status` / `status --json` report running instances; JSON is an array of `{socketPath, pid, version, protocolVersion, schemaId, buildId, executablePath, pidSource, sessionCount, status, isDefault, hasTrackedWorkers}` | exec | live read-only `status --json` (default daemon, pid 22028, protocol 7) |
| default daemon socket is `$TMPDIR/prime-agent-<uid>/daemon.sock` | exec | live `status --json` → `/var/folders/…/T/prime-agent-501/daemon.sock`; TMPDIR ends with `/` |
| `prime-agent list --json` returns `{sessions:[…]}` with `id`, `activity`, `rosterStatus`, `sessionActions:{queuedCount,steering,followUps}`, `sessionId`, `cwd`, `model`, … | exec | live read-only `list --json` |
| how to start the daemon non-interactively and its auto-start behavior | UNVERIFIED | starting daemons in fixtures was out of scope |

### MCP configuration

| fact | level | how verified |
|---|---|---|
| settings location: `<agentDir>/settings.json` with `<agentDir>` = `$PRIME_AGENT_CODING_AGENT_DIR` when set (tilde-expanded), else `$HOME/.prime/agent`; the file is written atomically (mode 0600) under a lockfile | exec + public installed source | fixture runs with HOME (and optionally `PRIME_AGENT_CODING_AGENT_DIR`) pointed at a temp dir wrote exactly there; `dist/config.js getAgentDir()` |
| stdio grammar: `prime-agent mcp add <name> [--cwd <dir>] [--env CHILD=SOURCE] -- <command> [args...]`; the stored definition keeps `type/command/args/cwd/env` under the `mcpServers` key, preserving unrelated keys and servers | exec (fixture) | `mcp add board-probe --cwd <fix> --env BOARD_AS=probe -- /bin/echo hi` → exit 0, `Added MCP server "board-probe".`; fixture settings inspected before/after |
| `mcp get <name>` exits 0 when present (stdout `<name>: stdio`); exits 1 with `Error: MCP server "<name>" was not found.` when absent; names must match `[A-Za-z0-9][A-Za-z0-9_-]{0,63}` | exec (fixture) | probe of a present and a missing name; invalid names exit 1 with the rule message |
| `mcp list` prints one sorted `name: type` line per server; `No user-configured MCP servers.` when empty | exec (fixture) | fixture `mcp list` before/after adds |
| update WITHOUT `--force` is rejected: re-adding an existing name exits 1 with `MCP server "<name>" already exists. Use --force to replace it.` and does NOT mutate settings | exec (fixture) | re-add probe with a byte-compare of settings.json before/after |
| `--force` IS supported for the stdio form: it replaces the whole stored definition (`Replaced MCP server "<name>".`, exit 0) and acts as a plain add when absent; fields not passed on the replacing add are dropped | exec (fixture, was UNVERIFIED in phase 3) | `mcp add board-probe --force -- /bin/echo replaced` → exit 0; definition re-read |
| `mcp remove <name>` (exact arity: one positional name) deletes only the named entry and exits 0 with `Removed MCP server "<name>".`; a missing name exits 1 with `was not found.` (removal is NOT idempotent — probe first); wrong arity exits 1 `Usage: mcp remove <name>`; per the public dist it also drops stored `mcp:<name>` credentials | exec (fixture) + public installed source | remove probes: present → exit 0 + entry gone + other servers/keys intact; repeated remove → exit 1; `dist/core/mcp/mcp-command.js` |
| after removing the last server the `mcpServers` key remains as `{}` | exec (fixture) | fixture settings re-read after the last remove |
| `--env CHILD=SOURCE` stores `env: {CHILD: {env: SOURCE}}` (both sides validated as environment variable names); `--cwd` stores the literal directory | exec (fixture), was UNVERIFIED in phase 3 | `mcp add board-probe --cwd <fix> --env BOARD_AS=probe -- ...` → stored definition re-read |

### User skills directory — discovery rules (public installed source)

All facts below come from the shipped 0.9.4 dist
(`dist/config.js`, `dist/core/skills.js`, `dist/core/resource-loader.js`,
`dist/core/kernel/bootstrap.js`); the directory layout itself was not
exercised against a live kernel, so kernel-level behavior (the editable
install step) is source-read, not exec-level.

- `<agentDir>` resolves exactly like the settings directory:
  `$PRIME_AGENT_CODING_AGENT_DIR` when set, else `$HOME/.prime/agent`.
- User skills live at `<agentDir>/skills`; project skills at
  `<cwd>/.prime/agent/skills`; bundled skills ship in `dist/skills`; extra
  paths can be configured in settings.
- Discovery (`dist/core/skills.js loadSkillsFromDir`): a directory containing
  `SKILL.md` is a skill root (no recursion below it); otherwise subdirectories
  are searched for `SKILL.md`; direct `*.md` children of the root directory
  are also loaded. Dotfiles and `node_modules` are skipped; `.gitignore` /
  `.ignore` / `.fdignore` rules are honored.
- **A bare `.py` file is never discovered.** Phase 3's
  `~/.prime/agent/skills/board.py` was therefore inert: Prime never loaded it,
  and the "filename becomes the import name" claim was wrong. Corrected in
  phase 4.
- Agent-Skills name validation: `name` defaults to the parent directory name;
  an explicit `name` must equal it, match `^[a-z0-9-]+$`, have no leading or
  trailing hyphen, no `--`, and at most 64 characters. A missing or empty
  frontmatter `description` means the skill is NOT loaded at all
  (`loadSkillFromFile` bails before validation diagnostics even matter).
- Python skills (`detectPythonSkill`): the skill directory must contain a
  `pyproject.toml` and `src/<importName>/__init__.py`, where `importName` is
  the skill name with `-` replaced by `_` and must be a valid Python
  identifier. The kernel installs each Python skill into the kernel venv with
  `uv pip install --python <kernel-python> --editable <skillDir>` when it
  builds (`bootstrap.js syncPythonSkills`), so `import <importName>` works in
  sessions started afterwards; a running session does not hot-reload. The
  shipped bundled skills use hatchling src-layout pyprojects, which the
  rendered package mirrors.
- Kernel venv: `~/.prime/agent/kernel-venv` by default
  (`PRIME_AGENT_KERNEL_VENV` overrides; `getKernelVenvDir`).

### Extensions — UNVERIFIED, do not assume

`-e/--extension <source>` and `-ne/--no-extensions` appear in `--help`, and
`~/.prime/agent/extensions/` plus `~/.pi` do **not exist on this host**. The
directories being absent does NOT prove discovery at those paths is
unsupported; it only means nothing was ever installed there. The research
claim that the Pi board extension "works unchanged" under
`~/.prime/agent/extensions/` is **UNVERIFIED** (an earlier draft said "false";
that wording is withdrawn). No extension helper or install recipe is provided
here because none could be verified. Capability packages
(`prime-agent package install`, which "can provide extensions, skills, prompts,
and themes") are the other candidate route and are likewise unverified.

## Helper API (`packages/cli/src/prime-agent.ts`)

All helpers take an injectable `runner` (default spawns the CLI with a 5s
timeout and captures stdout/stderr), so tests never touch a real install.

- `primeSendArgs(options)` → argv for `send` (unverified flags opt-in only;
  auto `--` separator for `-`-leading messages).
- `sendPrimeMessage(options)` → `boolean`; true iff exit 0 (mirrors
  `runWakeCommand` in `src/index.ts`).
- `primeMcpAddArgs(options)` → argv for `mcp add` (stdio grammar, sorted
  `--env` pairs; `--force` emitted only when explicitly requested or when a
  probe-driven update needs it).
- `primeMcpGetArgs(name)` → argv for the presence probe.
- `primeMcpRemoveArgs(name)` → argv for the verified `mcp remove <name>`
  (exact arity: one positional name).
- `primeMcpServerInstalled(name, options?)` → `boolean` (exit-code probe).
- `addPrimeMcpServer(options)` → `{status: "installed"|"already-installed"|"failed", present, addArgs}`; idempotent check-then-add. With `update: true`
  the present case re-adds WITH `--force` (verified replace), so changed
  arguments propagate; explicit `force` bypasses the probe decision.
- `removePrimeMcpServer(name, options?)` → `{status: "removed"|"not-present"|"failed", present, removeArgs}`; idempotent probe-then-remove (the CLI's own
  remove is not idempotent).
- `primeStatusArgs()` / `primeDaemonStatus(options?)` → parsed daemon list or
  `null` on any failure (degrade, don't throw).
- `defaultPrimeDaemonSocket(tmpDir?, uid?)` → verified default socket path.
- `primeDeliveryKey(target)` → `prime-agent\0<target>` (matches
  `targetDeliveryKey` style); `primeDeliveryMethod()` → `prime-send`;
  `isPrimeAgentTarget` / `assertPrimeAgentTarget` (bounded ASCII token,
  same rule as core's opaque runtime ids).
- `primeRunnerFromRunCommand(runCommand)` adapts `CliDependencies.runCommand`.
- `renderPrimeMcpSkill({server, board, author})` → the Python skill-wrapper
  module source (see the section below); pure and deterministic.
- `renderPrimeSkillPackage({server, board, author})` → the full discoverable
  skill package `{name: "board", files: [SKILL.md, pyproject.toml,
  src/board/__init__.py]}`; pure, deterministic, and name-checked through the
  module render.
- `PRIME_AGENT_RUNTIME = "prime-agent"`, `PRIME_DELIVERY_METHOD = "prime-send"`,
  `DEFAULT_PRIME_AGENT_COMMAND`, `DEFAULT_PRIME_TIMEOUT_MS`.

Design rule after the lead correction: every option the installed 0.9.4 binary
refuses (`--steer`, `--follow-up`) is opt-in and absent from default argv, so
the default wake path only emits execution-verified tokens.

## REPL skill wrapper: `renderPrimeMcpSkill`

`renderPrimeMcpSkill({server, board, author})` returns the Python module text
of the board skill so a Prime agent's Python REPL can call the board MCP
server (`import board`). The installer does NOT drop this source in as a bare
file — per the verified discovery rules a bare `.py` file would never load —
it is written as `src/board/__init__.py` of the user Python skill package
rendered by `renderPrimeSkillPackage` (SKILL.md + pyproject.toml + module
source under `<agentDir>/skills/board/`), and the Prime kernel installs that
package into its venv at the next session kernel build. The output is a pure
function of the three options (no timestamps, no environment reads), so tests
can assert exact text. All three values must pass the board name rule
(`[a-z0-9][a-z0-9_-]{0,31}`) because they are embedded verbatim into the
rendered source as `SERVER`, `BOARD` and `AUTHOR`.

What the rendered module exposes (all stdlib-only, no kernel imports):

- `list_tools()` — async; the board server's tools as
  `[{name, description, inputSchema}]` dicts.
- `call_tool(name, arguments=None)` — async; calls one tool after validating
  that the name is a non-empty string and the arguments are a dict or None.
- `reload()` — async; drops this server's cached connection so the next call
  re-reads its configuration (per-server only; the session-wide `mcp.close()`
  is intentionally not wrapped).

### Verified Prime/Python-kernel MCP contract

Everything below was verified by reading PUBLIC INSTALLED sources only — the
shipped prime-agent 0.9.4 dist and the kernel venv's `mcp` SDK 2.2.0. No live
`settings.json`, credentials or session data were read; no runtime
configuration was changed.

| fact | evidence (public installed source) |
|---|---|
| the REPL pre-imports the generic MCP registry as `mcp`, with `list_tools` and `call_tool` | `dist/core/kernel/bootstrap.js` `RUNTIME_READY_CHECK`: `import rlm.mcp as mcp; … assert callable(mcp.list_tools); assert callable(mcp.call_tool)` |
| `await mcp.list_tools(server)` → `[{name, description, inputSchema}]` | `dist/prime-agent-runtime/src/rlm/mcp.py` (`list_tools`, `_Generation.discover`) |
| `await mcp.call_tool(server, tool, arguments=None)`; arguments must be a dict or None (`arguments or {}` before dispatch); results are parsed Python — structured content preferred, else joined text blocks | `rlm/mcp.py` (`call_tool`, `_Registry.call`); `rlm/mcp_base.py` (`_parse_result`) |
| undeclared or renamed server → `KeyError("MCP server '<name>' is not declared in user settings")`; disabled server → `RuntimeError`; failed stdio startup → `McpStartupError` (RuntimeError subclass, sanitized stderr tail); unknown tool → `KeyError`; tool off the allow-list → `PermissionError`; server-flagged error result → `McpToolError` (RuntimeError subclass, not re-exported — catch `RuntimeError`) | `rlm/mcp.py` (`_config`, `McpStartupError`, `_Generation.call`); `rlm/mcp_base.py` (`McpToolError`, `_parse_result`) |
| defaults: 20s startup handshake, 60s per-call deadline; per-server `startupTimeoutMs` / `callTimeoutMs` config overrides | `rlm/mcp.py` `_DEFAULT_STARTUP_TIMEOUT`, `_DEFAULT_CALL_TIMEOUT`, `_Generation.startup_timeout/call_timeout` |
| the facade binding lives in the REPL user namespace (cells run in a synthetic `__main__` module); the registry re-checks config per call, so renamed config is picked up without an explicit reload; kernel shutdown closes all MCP children | `rlm/repl.py` (`sys.modules["__main__"] = user_module`; shutdown handler awaits `rlm.mcp.close()`); `rlm/mcp.py` (`_get_locked` re-reads `_config` each call) |
| the `mcp` name is on the snapshot skip list — it is re-bound by the kernel's ready check on start, not restored from snapshots | `rlm/repl.py` `_ALWAYS_SKIP`; `bootstrap.js` ready check |
| shipped MCP skills use the same discover-then-call style and deliver already-parsed results | `dist/skills/linear/SKILL.md`, `dist/skills/notion/SKILL.md` |
| stdio servers (like the board) are spawned and held by the kernel's registry via the `mcp` SDK (`ClientSession`, `stdio_client`, `StdioServerParameters`) | `rlm/mcp.py` `_open_stdio`, `_run_lifecycle`; kernel-venv `site-packages/mcp/__init__.py` `__all__` (mcp 2.2.0) |

The rendered wrapper resolves the facade the same way the kernel wires it:
first `getattr(sys.modules["__main__"], "mcp")`, then `sys.modules["mcp"]`,
each attribute-checked for callable `list_tools` and `call_tool`, so an
unrelated PyPI `mcp` module never passes. With no facade at all it raises a
clear `RuntimeError("Prime MCP facade not found: …")` instead of a confusing
AttributeError.

### Install and use: `board install prime-agent` (wired; activation pending the lead)

`installRuntime({ runtime: "prime-agent", ... })` performs the steps below.
Everything here is fixture-tested in `packages/cli/test/install.test.ts`; the
CLI choice itself stays gated by task202 until the lead integrates it.

1. **MCP server entry — idempotent register/update through the verified CLI
   only.** The server is named `board-<author>` (e.g. `board-essun`), so board
   agents sharing one machine get distinct entries in the shared
   `<agentDir>/settings.json`. The installer discovers its own entry by the
   exact configured name — `prime-agent mcp get board-<author>` (exit-code
   probe; never a free-name scan over `mcpServers`):

   - absent → `prime-agent mcp add <name> --cwd <project-root> -- <bun>
     packages/mcp/src/index.ts --store <store> --as <author> --board <board>
     --index <index>`
   - present → the same argv plus `--force` **only after a read-only ownership
     probe proves the stored definition is board-managed**: the stored
     definition must pass this repository's `packages/mcp/src/index.ts` as the
     **first argument of the stdio command** — the executable position, the
     same signal `isOwnedMcp` uses. A path that merely appears in a later
     argument (for example a foreign server invoked with
     `--config <mcpPath>`) is NOT ownership. The fixture-verified `--force`
     replace then rewrites the stored definition so changed store/board/index
     arguments propagate. A foreign server that merely occupies the name
     `board-<author>` — or an unreadable/unparseable settings file — fails
     closed with `refusing to replace non-board prime-agent MCP server`, before
     any mutation.

   The settings file is never edited directly; every mutation goes through the
   verified CLI grammar, which leaves unrelated servers and keys intact. The
   ownership probe is a read-only `JSON.parse` of `<agentDir>/settings.json`,
   where `<agentDir>` is resolved exactly as the CLI's `getAgentDir()` does
   (`$PRIME_AGENT_CODING_AGENT_DIR` when set, else the installer's `home`), so
   the probe never mutates configuration and always inspects the file the CLI
   acts on.
2. **REPL wrapper — board-owned Python skill package, updated in place.** The
   rendered `renderPrimeSkillPackage({ server: "board-<author>", board,
   author })` is installed under `<agentDir>/skills/board/` as `SKILL.md`,
   `pyproject.toml` and `src/board/__init__.py` — the only layout the
   verified discovery rules load. A foreign file at any of the three paths is
   refused BEFORE any MCP mutation, leaving the agent configuration
   untouched; fully board-rendered files are re-rendered on re-install, so
   changed author/board options update the package. `import board` becomes
   available in a Prime session started after the install (kernel venv
   editable install; no hot reload of a running session).
3. **Uninstall** removes the board-rendered package files and, after a
   present probe, runs the verified `prime-agent mcp remove board-<author>`
   only when the same read-only ownership probe proves the entry is
   board-managed (a foreign server under that name is refused with
   `refusing to remove non-board prime-agent MCP server`; exit 0 deletes only
   that entry; a nonzero exit despite presence aborts the uninstall with an
   error before any file is deleted). A missing entry is a natural no-op, and
   re-running uninstall is a no-op. Foreign skill files and unrelated servers
   are left untouched.
4. **Dry-run** plans both changes; the `mcp get` probe and the ownership probe
   are read-only, and the install, replace and remove mutations are never
   invoked — including for uninstall (`--uninstall --dry-run` reports
   `Would remove prime-agent MCP server …` without calling `mcp remove`). The
   notices say whether a register, a `--force` replace or a removal would
   happen.
5. **Update.** Re-running with changed store/board/index arguments re-renders
   the package and force-replaces the stored definition, so the registered
   entry always matches the last install. The one residual limit: a rename of
   the author changes the server name (`board-<author>`), and the old entry
   under the previous name is not migrated — uninstall with the old author
   first, or remove the old entry manually.

In a Prime agent REPL:

   ```python
   import board

   # discover before calling — the server owns the tool names
   for tool in await board.list_tools():
       print(tool["name"], "-", tool["description"])

   result = await board.call_tool("board_read", {"limit": 5})
   ```

4. If the server is renamed or removed, the next call raises
   `KeyError("MCP server '<name>' is not declared in user settings")` — the
   wrapper passes the facade's own error through unchanged, so the message
   names the exact server that is not declared. After fixing the
   configuration, `await board.reload()` drops any wedged stdio child; the
   registry then rebuilds from the current config. Note `str(KeyError)`
   repr-quotes the message; the clean text is in `exc.args[0]`.

### Limits

- Targets the pre-imported facade only; it imports nothing beyond `sys` and
  never imports kernel-only (`rlm.*`) modules, so it also fails cleanly in a
  plain non-Prime Python. Probed offline 2026-09-10 under CPython
  3.9.6 (system), 3.10.20, 3.11.16, 3.12.13, 3.13.13 and 3.14.7: the rendered
  module compiles, imports without a facade, raises its own facade-missing
  `RuntimeError`, and passes list/call/argument-validation probes against a
  stubbed facade. The Prime kernel's own facade wiring on 3.11 remains a
  live-acceptance item.
- A REPL cell doing `import mcp` shadows the facade with the unrelated PyPI
  SDK; the wrapper then reports the facade as missing until the kernel session
  is reopened. Do not `import mcp` in cells that use the wrapper.
- Rendered for stdio board servers. HTTP MCP servers work through the same
  facade, but this wrapper adds nothing for them (no URL/credential options).
- Behavior beyond the facade (timeouts, retries, snapshots) is the kernel's;
  the wrapper deliberately owns none of it.
- **Agent-dir override (fixed in round 3).** The installer resolves the
  destructive-mutation ownership gate, the read-only settings probe and the
  skill package through the same rule as the CLI's `getAgentDir()`:
  `$PRIME_AGENT_CODING_AGENT_DIR` when set (tilde-expanded against the OS
  home), else `<home>/.prime/agent`. The gate therefore always reads the
  `settings.json` the CLI mutates, and the wrapper lands in the skills
  directory Prime actually discovers, under whichever directory is active.
  Round 1 resolved both to `<home>/.prime/agent`; with the override set, the
  gate read a different file than the CLI acted on, so a foreign entry in the
  override directory could be force-replaced.

## Setup recipe (verified-safe commands)

Manual steps an operator can run today. Once the lead integrates task202,
`board install prime-agent` automates the MCP registration (step 2) and the
wrapper installation, with the semantics listed above.

```sh
# 1. Check the daemon (the default one starts with any prime-agent session)
prime-agent status

# 2. Register the board MCP server for the user (stdio grammar; pick a name
#    and the same args board install would generate)
prime-agent mcp add board \
  --cwd /path/to/sidekick \
  -- bun packages/mcp/src/index.ts --store <store-spec> --as <agent> --board <board> --index <path>

prime-agent mcp get board   # verify presence (exit 0)

#    Repoint an existing entry after changing the arguments (--force replace
#    is fixture-verified for the stdio form). First check `prime-agent mcp get
#    board` and confirm the stored definition is the one you mean to replace:
#    modernized installs use the author-scoped name board-<agent>, and --force
#    replaces whatever currently occupies the given name.
prime-agent mcp add board --force \
  --cwd /path/to/sidekick \
  -- bun packages/mcp/src/index.ts --store <new-store-spec> --as <agent> --board <board> --index <path>

# 3. Remove it again (exit 1 when absent — probe with mcp get first)
prime-agent mcp remove board

# 4. Wake an idle agent (target = the agent id from `prime-agent list --json`)
prime-agent send <agent-id> "Run board read."
```

Disposable-fixture equivalent for tests: point `HOME` (and optionally
`PRIME_AGENT_CODING_AGENT_DIR`) at a temp directory seeded with
`.prime/agent/settings.json`, then invoke the real binary — this is exactly
what the `install.test.ts` real-CLI suite and this guide's fixture probes do.

## Remaining integration steps (not performed; seams are held)

1. **task147 (`install.ts`)**: DONE through phase 4. The `"prime-agent"`
   install runtime registers, updates (`mcp add --force`) and removes
   (`mcp remove`) the server through the `mcp get` exact-name probe, never
   direct settings.json editing, and installs the wrapper as the discoverable
   `board` Python skill package (see the install section above). Deliberately
   NOT done here: `isInstallRuntime`/usage text in `packages/cli/src/index.ts`
   — that is task202's held seam, so the CLI still rejects
   `board install prime-agent`.
2. **task202 (CLI entrypoint)**: add `prime-agent` to `board install` choices
   and expose the runtime in `deliverTarget`/`deliveryMethod`/
   `targetDeliveryKey` using `sendPrimeMessage`, `primeDeliveryKey`, and
   `primeDeliveryMethod`, adapting `CliDependencies.runCommand` with
   `primeRunnerFromRunCommand`.
3. **Presence**: record the daemon agent id (or a stable renamed name) as the
   delivery target for runtime `prime-agent`; decide whether "prime-agent"
   joins core's `SESSION_ID_RUNTIMES` (core is a held path) or stays a
   name-based target like letta/cmux.
4. **`board watch --deliver`**: route prime-agent mentions through the daemon
   send when presence says idle; keep the mode-auto semantics documented in
   the roadmap.
5. **MCP-from-REPL**: DONE at the installer level — `board install
   prime-agent` installs the wrapper as the discoverable `board` Python skill
   package (see the install section above). Remaining: task202 activation,
   then a live check that a real Prime session's kernel installs the package
   and a REPL resolves the facade against the installed server (the editable
   venv install step is source-read, not live-verified).
6. **Live acceptance** on a disposable daemon fixture: actual idle wake,
   presence target round-trip, and — only after a decision from the lead —
   the extension question (probe discovery with a scratch extension in an
   isolated HOME).

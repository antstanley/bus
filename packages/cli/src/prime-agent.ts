/**
 * Prime-Agent adapter helpers.
 *
 * Prime-Agent (https://github.com/PrimeIntellect-ai/prime-agent) is a Pi
 * derivative with a background daemon. This module wraps the verified CLI
 * surfaces the board needs — idle-wake delivery (`send`) and stdio MCP server
 * configuration (`mcp add` with verified `--force` update, `mcp get` probe,
 * `mcp remove`) — plus read-only daemon status, the discoverable user-skill
 * package renderer, and the delivery-target naming used by the existing wake
 * code in `./index.ts`.
 *
 * Verified runtime contract (installed prime-agent 0.9.4, probed 2026-09-10
 * via `--help` output plus parse-level execution probes against a
 * nonexistent agent name; no live config changed, no message delivered):
 *
 * - `prime-agent send <agent> <message>` parses and resolves the target
 *   against active daemon sessions. Actual delivery to an idle agent was
 *   live-confirmed by the lead.
 * - `--from <agent>` and `--json` are parse-accepted; the sender is validated
 *   as an active session before the target is resolved.
 * - `--steer` and `--follow-up` are listed in `send --help` but REJECTED at
 *   parse time ("Unknown option for send"). Helpers only emit them when the
 *   caller opts in explicitly, so the default path never sends an option the
 *   installed binary refuses.
 * - A message that starts with "-" needs a `--` separator before it (the
 *   binary's own parse-error hint); the argv builders insert it automatically.
 * - `prime-agent mcp add <name> [--cwd <dir>] [--env CHILD=SOURCE] --
 *   <command> [args...]` is the stdio grammar; user servers are stored under
 *   the `mcpServers` key of `<agentDir>/settings.json`, where `<agentDir>` is
 *   `$PRIME_AGENT_CODING_AGENT_DIR` when set, else `$HOME/.prime/agent`
 *   (both isolated with a disposable HOME fixture, 0.9.4).
 * - `prime-agent mcp get <name>` exits 0 when the server exists and 1 with
 *   "was not found" when it does not, which gives a safe presence probe for
 *   idempotent installs.
 * - Update path (fixture-verified on 0.9.4): re-adding an existing name
 *   WITHOUT `--force` exits 1 ("already exists. Use --force to replace it.")
 *   and leaves settings untouched; `mcp add <name> --force -- <command>
 *   [args...]` replaces the whole stored definition ("Replaced MCP server
 *   ...", exit 0) and acts as a plain add when the name is absent. `--force`
 *   is therefore verified for the stdio grammar and used for updates.
 * - `prime-agent mcp remove <name>` (exact arity: one positional name) exits
 *   0 with "Removed MCP server ..." after deleting the entry, preserving all
 *   other servers and settings keys; it exits 1 with "was not found" when
 *   absent, so removal is NOT idempotent — callers probe with `mcp get`
 *   first.
 * - `prime-agent status --json` reports running daemon instances; the
 *   default socket lives at `$TMPDIR/prime-agent-<uid>/daemon.sock`.
 * - `prime-agent list --json` exposes active sessions with `id` (the daemon
 *   agent id accepted by `send`), `activity`, `rosterStatus` and
 *   `sessionActions` — the discovery surface for presence integration.
 * - User skills directory (public installed sources, 0.9.4):
 *   `<agentDir>/skills` with `<agentDir>` resolved exactly like settings
 *   (`$PRIME_AGENT_CODING_AGENT_DIR`, else `$HOME/.prime/agent`). Discovery
 *   loads only SKILL.md files (a directory containing SKILL.md is a skill
 *   root; otherwise subdirectories are searched) plus direct `.md` children
 *   of the root directory — a bare `.py` file is never discovered. A Python
 *   skill is a SKILL.md (frontmatter `description` required, `name` defaults
 *   to the parent directory name) plus `pyproject.toml` and
 *   `src/<importName>/__init__.py`; the kernel installs it into the kernel
 *   venv with `uv pip install --editable <skillDir>` at the next session
 *   kernel build, which makes `import <importName>` work in the REPL
 *   (`importName` = skill name with `-` replaced by `_`).
 * - Extension discovery under `~/.prime/agent/extensions/` is UNVERIFIED on
 *   this host: the directory does not exist, which does not prove the
 *   feature is unsupported. No extension helper is provided here.
 *
 * Python REPL contract (same 0.9.4 dist, public installed sources only): the
 * kernel bootstrap's ready check runs `import rlm.mcp as mcp` and asserts
 * `callable(mcp.list_tools)` / `callable(mcp.call_tool)`, so a Prime REPL
 * pre-imports the generic MCP registry as `mcp`. The registry's verified
 * surface is `await mcp.list_tools(server)`, `await mcp.call_tool(server,
 * tool, arguments)`, `await mcp.reload(server?)`; an undeclared server raises
 * `KeyError("MCP server '<name>' is not declared in user settings")`.
 * `renderPrimeMcpSkill` renders that contract as a standalone stdlib-only
 * Python module bound to one server/board/author; full evidence and limits in
 * docs/guides/prime-agent.md.
 */

import { CliError } from "./install.ts";
import { assertName } from "@board/core";
import { join } from "node:path";

/** Presence runtime label for Prime-Agent sessions. */
export const PRIME_AGENT_RUNTIME = "prime-agent";

/** Default executable name resolved from PATH. */
export const DEFAULT_PRIME_AGENT_COMMAND = "prime-agent";

/** Default wall-clock limit for one CLI invocation, mirroring runWakeCommand. */
export const DEFAULT_PRIME_TIMEOUT_MS = 5_000;

/**
 * Delivery method label for a Prime-Agent wake, in the style of
 * `deliveryMethod()` in ./index.ts ("opencode", "codex-queue", ...).
 */
export const PRIME_DELIVERY_METHOD = "prime-send";

/** Bounded ASCII token accepted as a daemon agent id or board agent name. */
const TARGET = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;

/** One `prime-agent` invocation result. */
export interface PrimeRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** Injectable runner so tests never touch a real installation. */
export type PrimeRunner = (command: string, args: string[]) => Promise<PrimeRunResult>;

export interface PrimeCommandOptions {
  /** Executable to invoke; default "prime-agent". */
  command?: string;
  /** Working directory for the invocation. */
  cwd?: string;
  /** Additional environment for the invocation. */
  env?: Record<string, string | undefined>;
  /** Wall-clock limit in ms; default DEFAULT_PRIME_TIMEOUT_MS. */
  timeoutMs?: number;
  /** Replace spawning entirely (tests, CliDependencies.runCommand adapters). */
  runner?: PrimeRunner;
}

export interface PrimeSendOptions extends PrimeCommandOptions {
  /** Daemon agent id (or renamed agent name) resolved by the daemon. */
  target: string;
  /** Message body; must be non-empty. */
  message: string;
  /** --from: parse-verified on 0.9.4; sender must be an active session. */
  from?: string;
  /** --json: parse-verified on 0.9.4; output is not parsed by this helper. */
  json?: boolean;
  /**
   * --steer: listed in --help but REJECTED by the installed 0.9.4 binary.
   * Opt-in only; leave off unless the target installation is known to accept it.
   */
  steer?: boolean;
  /**
   * --follow-up: listed in --help but REJECTED by the installed 0.9.4 binary.
   * Opt-in only, same caveat as `steer`.
   */
  followUp?: boolean;
}

/**
 * Mutation gate for `mcp add`/`mcp remove`: invoked with the presence probe's
 * result after that single probe and immediately before the mutating call, so
 * callers can authorize against the same observed presence. Throwing aborts
 * with no mutation performed.
 */
export type PrimeMcpMutationAuthorizer = (present: boolean) => void | Promise<void>;

export interface PrimeMcpOptions extends PrimeCommandOptions {
  /** Server name in `mcpServers`; validated with the board name rule. */
  name: string;
  /**
   * Child command after `--` (e.g. bun). Deliberately NOT named `command`:
   * the inherited `command` is the prime-agent executable, and shadowing it
   * made the real spawn path invoke `<childCommand> mcp get/add` instead of
   * `prime-agent mcp get/add` (tests hid this because an injected runner
   * ignores the executable name).
   */
  childCommand: string;
  /** Child arguments after `--`. */
  args?: string[];
  /** --cwd: working directory the daemon uses for the child. */
  cwd?: string;
  /** --env CHILD=SOURCE pairs for the child, emitted in sorted key order. */
  childEnv?: Record<string, string>;
  /**
   * --force: verified for the stdio grammar on 0.9.4 (fixture probe): it
   * replaces an existing definition and acts as a plain add when absent.
   * Emits --force regardless of probe results; for probe-driven updates use
   * `update` instead.
   */
  force?: boolean;
  /**
   * Probe-driven update: when the presence probe reports the server already
   * configured, re-add it WITH --force (verified replace); when absent,
   * plain add. Explicit `force` is still honored on top.
   */
  update?: boolean;
  /**
   * Gate the mutating add. Called after the presence probe and before the
   * `mcp add` invocation; a throwing authorizer aborts the add untouched.
   */
  authorize?: PrimeMcpMutationAuthorizer;
}

/** Options for `removePrimeMcpServer`, including its mutation gate. */
export interface PrimeMcpRemoveOptions extends PrimeCommandOptions {
  /**
   * Gate the mutating remove. Called after a present probe and before the
   * `mcp remove` invocation; a throwing authorizer aborts the remove.
   */
  authorize?: PrimeMcpMutationAuthorizer;
}

export type PrimeMcpInstallStatus = "installed" | "already-installed" | "failed";

export interface PrimeMcpInstallResult {
  status: PrimeMcpInstallStatus;
  /** Whether the presence probe reported the server before any add. */
  present: boolean;
  /** Exact argv of the last mutating invocation ([] when none was needed). */
  addArgs: string[];
}

/** Daemon instance as reported by `prime-agent status --json`. */
export interface PrimeDaemonStatus {
  socketPath: string;
  pid: number;
  version: string;
  protocolVersion?: number;
  schemaId?: string;
  buildId?: string;
  executablePath?: string;
  pidSource?: string;
  sessionCount?: number;
  status?: string;
  isDefault?: boolean;
  hasTrackedWorkers?: boolean;
}

/** Validate a send target: daemon agent id or board agent name. */
export function isPrimeAgentTarget(value: unknown): value is string {
  return typeof value === "string" && TARGET.test(value);
}

export function assertPrimeAgentTarget(value: unknown, what = "prime-agent target"): string {
  if (isPrimeAgentTarget(value)) return value;
  throw new CliError(`invalid ${what}: ${JSON.stringify(value)}`);
}

/**
 * Build the `prime-agent send` argv.
 *
 * Unverified flags (steer, followUp) are emitted only when explicitly
 * requested. A message starting with "-" gets a `--` separator, per the
 * installed binary's own parse-error hint.
 */
export function primeSendArgs(options: PrimeSendOptions): string[] {
  const target = assertPrimeAgentTarget(options.target);
  if (!options.message) throw new CliError("prime-agent send requires a non-empty message");
  const argv = ["send"];
  if (options.from !== undefined) {
    assertPrimeAgentTarget(options.from, "prime-agent sender");
    argv.push("--from", options.from);
  }
  if (options.json) argv.push("--json");
  if (options.steer) argv.push("--steer");
  if (options.followUp) argv.push("--follow-up");
  argv.push(target);
  if (options.message.startsWith("-")) argv.push("--");
  argv.push(options.message);
  return argv;
}

/**
 * Deliver a wake message through the daemon. Returns false when the CLI
 * exits nonzero (unknown target, daemon down, unsupported option), mirroring
 * the boolean contract of runWakeCommand in ./index.ts.
 */
export async function sendPrimeMessage(options: PrimeSendOptions): Promise<boolean> {
  const result = await runPrimeAgent(primeSendArgs(options), options);
  return result.exitCode === 0;
}

/** Build the `mcp add` argv for a stdio server. */
export function primeMcpAddArgs(options: PrimeMcpOptions): string[] {
  assertPrimeMcpName(options.name);
  if (!options.childCommand) throw new CliError("prime-agent mcp add requires a child command");
  const argv = ["mcp", "add", options.name];
  if (options.cwd !== undefined) argv.push("--cwd", options.cwd);
  for (const key of Object.keys(options.childEnv ?? {}).sort()) {
    const value = options.childEnv?.[key];
    if (value !== undefined) argv.push("--env", `${key}=${value}`);
  }
  if (options.force) argv.push("--force");
  argv.push("--", options.childCommand, ...(options.args ?? []));
  return argv;
}

/** Build the `mcp get <name>` argv used as the presence probe. */
export function primeMcpGetArgs(name: string): string[] {
  assertPrimeMcpName(name);
  return ["mcp", "get", name];
}

/** Build the read-only `status --json` argv. */
export function primeStatusArgs(): string[] {
  return ["status", "--json"];
}

/**
 * Probe whether an MCP server name is configured: true when `mcp get` exits 0,
 * false on any nonzero exit (0.9.4 exits 1 with "was not found" when absent).
 */
export async function primeMcpServerInstalled(name: string, options: PrimeCommandOptions = {}): Promise<boolean> {
  const result = await runPrimeAgent(primeMcpGetArgs(name), options);
  return result.exitCode === 0;
}

/**
 * One `mcp remove` attempt.
 *
 * - "removed": the probe reported the server present and `mcp remove` exited 0.
 * - "not-present": the probe reported it absent; no mutating call was made, so
 *   the operation is a natural no-op (the CLI's own remove is NOT idempotent).
 * - "failed": the probe reported presence but `mcp remove` exited nonzero.
 */
export type PrimeMcpRemoveStatus = "removed" | "not-present" | "failed";

export interface PrimeMcpRemoveResult {
  status: PrimeMcpRemoveStatus;
  /** Whether the presence probe reported the server before any remove. */
  present: boolean;
  /** Exact argv of the remove invocation ([] when none was needed). */
  removeArgs: string[];
}

/** Build the verified `mcp remove <name>` argv (exact arity: one name). */
export function primeMcpRemoveArgs(name: string): string[] {
  assertPrimeMcpName(name);
  return ["mcp", "remove", name];
}

/**
 * Idempotently remove a stdio MCP server: probe with `mcp get`, skip the
 * remove when absent, `mcp remove` otherwise (fixture-verified on 0.9.4:
 * exit 0 removes only the named entry; exit 1 + "was not found" when absent).
 * A present server is only removed after `authorize(true)` approves it.
 */
export async function removePrimeMcpServer(name: string, options: PrimeMcpRemoveOptions = {}): Promise<PrimeMcpRemoveResult> {
  const present = await primeMcpServerInstalled(name, options);
  if (!present) return { status: "not-present", present, removeArgs: [] };
  if (options.authorize) await options.authorize(true);
  const removeArgs = primeMcpRemoveArgs(name);
  const result = await runPrimeAgent(removeArgs, options);
  return { status: result.exitCode === 0 ? "removed" : "failed", present, removeArgs };
}

/**
 * Idempotently ensure a stdio MCP server is configured: probe with `mcp get`,
 * skip the add when present, add otherwise. With `update` the present case
 * re-adds WITH `--force` (verified replace on 0.9.4), so changed arguments
 * propagate; explicit `force` bypasses the probe decision. Any mutating add is
 * gated on `authorize(present)` after the probe, so a caller can refuse to
 * replace a foreign server that occupies the name.
 */
export async function addPrimeMcpServer(options: PrimeMcpOptions): Promise<PrimeMcpInstallResult> {
  const present = await primeMcpServerInstalled(options.name, options);
  if (present && !options.force && !options.update) return { status: "already-installed", present, addArgs: [] };
  if (options.authorize) await options.authorize(present);
  const addArgs = primeMcpAddArgs(
    present && options.update && !options.force ? { ...options, force: true } : options,
  );
  const result = await runPrimeAgent(addArgs, options);
  return { status: result.exitCode === 0 ? "installed" : "failed", present, addArgs };
}

/**
 * Read daemon instances. Returns null when the CLI fails or prints anything
 * unparseable, so callers can degrade instead of throwing.
 */
export async function primeDaemonStatus(options: PrimeCommandOptions = {}): Promise<PrimeDaemonStatus[] | null> {
  const result = await runPrimeAgent(primeStatusArgs(), options);
  if (result.exitCode !== 0) return null;
  try {
    const parsed: unknown = JSON.parse(result.stdout);
    if (!Array.isArray(parsed)) return null;
    const statuses: PrimeDaemonStatus[] = [];
    for (const entry of parsed) {
      const record = entry as Record<string, unknown>;
      if (typeof record.socketPath !== "string" || typeof record.pid !== "number"
        || typeof record.version !== "string") return null;
      statuses.push(record as unknown as PrimeDaemonStatus);
    }
    return statuses;
  } catch {
    return null;
  }
}

/**
 * Delivery key for a Prime-Agent target, in the `runtime\0id` style of
 * targetDeliveryKey() in ./index.ts.
 */
export function primeDeliveryKey(target: string): string {
  return `${PRIME_AGENT_RUNTIME}\0${assertPrimeAgentTarget(target)}`;
}

/** Delivery-method label, consistent with deliveryMethod() in ./index.ts. */
export function primeDeliveryMethod(): string {
  return PRIME_DELIVERY_METHOD;
}

/**
 * Fixed user-skill package name for the board wrapper. Per the verified
 * discovery rules the directory name, the SKILL.md frontmatter name and the
 * Python import name (skill name with `-` replaced by `_`) must agree, and
 * "board" satisfies every rule (`^[a-z0-9-]+$`, no `--`, no leading/trailing
 * hyphen, <= 64 chars, valid Python identifier).
 */
export const PRIME_SKILL_NAME = "board";

/**
 * Config for renderPrimeMcpSkill. All three values must pass the board name
 * rule (assertName): they are embedded verbatim into the rendered Python and
 * must never be able to break out of a string or docstring.
 */
export interface PrimeMcpSkillOptions {
  /** MCP server name in the agent's `mcpServers` settings (e.g. "board-essun"). */
  server: string;
  /** Board the server fronts (e.g. "team"); documentation only. */
  board: string;
  /** Board agent that rendered this skill (e.g. "essun"); documentation only. */
  author: string;
}

/**
 * Render the Prime Python REPL skill wrapper for the board MCP server.
 *
 * Pure and deterministic: the output is a function of the three options only —
 * no timestamps, no environment reads — so tests can assert exact text.
 *
 * Verified contract (prime-agent 0.9.4 dist, public installed sources; see
 * docs/guides/prime-agent.md for the full evidence): the kernel bootstrap's
 * ready check runs `import rlm.mcp as mcp` and asserts
 * `callable(mcp.list_tools)` / `callable(mcp.call_tool)`, so a Prime REPL
 * pre-imports the generic MCP registry as `mcp`. The rendered module targets
 * that public facade only — it imports nothing beyond `sys`, never imports
 * kernel-only modules, and passes every call through `mcp.list_tools(server)` /
 * `mcp.call_tool(server, tool, arguments)` / `mcp.reload(server)`.
 *
 * Missing/renamed-server behavior is the facade's own, verified one: an
 * undeclared server raises `KeyError("MCP server '<name>' is not declared in
 * user settings")`, a disabled server raises RuntimeError, a failed stdio
 * start raises McpStartupError, and server-flagged tool errors surface as a
 * RuntimeError subclass. The wrapper adds no catching of its own.
 */
export function renderPrimeMcpSkill(options: PrimeMcpSkillOptions): string {
  const server = assertPrimeMcpName(options.server);
  const board = assertName(options.board, "board name");
  const author = assertName(options.author, "board author");
  return `"""${board} board MCP skill — call the "${board}" team board from this Prime Python REPL.

Rendered by the sidekick board CLI for author "${author}". The board installer
installs this source as the user Python skill "${PRIME_SKILL_NAME}"
(\`<agentDir>/skills/${PRIME_SKILL_NAME}/src/${PRIME_SKILL_NAME}/__init__.py\`, next to a SKILL.md
and pyproject.toml). A Prime kernel installs user Python skills into its venv
when it builds, so \`import board\` works from a session started after the
install; an already-running session does not hot-reload the file.

The wrapper targets the pre-imported Prime MCP facade (mcp.list_tools /
mcp.call_tool / mcp.reload) and imports nothing beyond the stdlib. Do NOT run
\`import mcp\` in a cell: that rebinds the name to the unrelated PyPI MCP SDK
and shadows the facade. All calls are async — always await them:

    import board

    # 1. Discover the server's tools before calling anything
    for tool in await board.list_tools():
        print(tool["name"], "-", tool["description"])

    # 2. Call one tool; arguments must match its input schema
    result = await board.call_tool("board_read", {"limit": 5})

Error contract (verified against the installed Prime runtime):
- an undeclared or renamed server raises KeyError("MCP server '<name>' is not
  declared in user settings");
- a disabled server or failed stdio startup raises RuntimeError;
- a server-flagged tool error raises a RuntimeError carrying the server text;
- results are parsed Python: structured content if present, else joined text.
"""

import sys

#: MCP server name in the agent's mcpServers settings.
SERVER = "${server}"
#: Board this server fronts (documentation only).
BOARD = "${board}"
#: Board agent that rendered this skill (documentation only).
AUTHOR = "${author}"


def _mcp():
    """Resolve the pre-imported Prime MCP facade, or raise a clear error.

    Resolution follows the kernel's own wiring: REPL cells execute in a
    synthetic __main__ user module and the bootstrap binds the registry there
    as \`mcp\`; some builds also expose it as sys.modules["mcp"]. Both are
    attribute-checked, so an unrelated \`mcp\` module never passes.
    """
    main = sys.modules.get("__main__")
    candidates = [getattr(main, "mcp", None) if main is not None else None]
    candidates.append(sys.modules.get("mcp"))
    for mod in candidates:
        if (
            mod is not None
            and callable(getattr(mod, "list_tools", None))
            and callable(getattr(mod, "call_tool", None))
        ):
            return mod
    raise RuntimeError(
        "Prime MCP facade not found: this REPL must pre-import the \`mcp\` object "
        "with list_tools/call_tool. A cell doing \`import mcp\` (the unrelated "
        "PyPI SDK) shadows it; reopen the kernel session to restore the facade."
    )


async def list_tools():
    """List the board server's tools as dicts (name/description/inputSchema)."""
    return await _mcp().list_tools(SERVER)


async def call_tool(name, arguments=None):
    """Call one board tool; arguments must match the tool's input schema."""
    if not isinstance(name, str) or not name:
        raise TypeError("tool name must be a non-empty string")
    if arguments is not None and not isinstance(arguments, dict):
        raise TypeError("arguments must be a dict or None")
    return await _mcp().call_tool(SERVER, name, arguments)


async def reload():
    """Drop this server's cached connection so the next call re-reads config."""
    return await _mcp().reload(SERVER)
`;
}

/** One file of the rendered user-skill package (POSIX-relative path). */
export interface PrimeSkillFile {
  path: string;
  content: string;
}

export interface PrimeSkillPackage {
  /** Skill directory basename; equals PRIME_SKILL_NAME. */
  name: string;
  files: PrimeSkillFile[];
}

/**
 * Render the full user-skill package for the board wrapper, in the layout the
 * verified discovery rules require (prime-agent 0.9.4 public dist):
 * `<agentDir>/skills/board/` with a SKILL.md (frontmatter `description` is
 * REQUIRED — a missing description means the skill is never loaded; `name`
 * must equal the directory name), a `pyproject.toml` (hatchling, mirroring
 * the shipped skills) and `src/board/__init__.py` holding
 * `renderPrimeMcpSkill`'s module source. The Prime kernel installs such
 * packages with `uv pip install --editable <skillDir>` at the next session
 * kernel build, making `import board` work in the REPL.
 *
 * Pure and deterministic like renderPrimeMcpSkill, and name-checked through
 * it (the module render validates all three values).
 */
export function renderPrimeSkillPackage(options: PrimeMcpSkillOptions): PrimeSkillPackage {
  const skill = assertPrimeSkillName(PRIME_SKILL_NAME);
  // Validate server/board/author by rendering the module (which asserts them).
  const moduleSource = renderPrimeMcpSkill(options);
  const { board, author } = options;
  // board/author/server all pass assertName ([a-z0-9_-], max 32/38), so the
  // description below is safe unquoted in YAML frontmatter and inside a TOML
  // basic string — never embed quote marks of its own.
  const description = `Call the ${board} team board MCP server ${options.server} from this Prime Python REPL via import board `
    + `(rendered by the sidekick board CLI for author ${author}).`;
  const files: PrimeSkillFile[] = [
    {
      path: "SKILL.md",
      content: `---
name: ${skill}
description: ${description}
---

# ${board} board skill (author ${author})

Rendered by the sidekick board CLI for author "${author}". This package
provides the \`import board\` module for calling the "${board}" team board
MCP server "${options.server}" from the Prime Python REPL; the module source
lives at src/${skill}/__init__.py and exposes
\`await board.list_tools()\`, \`await board.call_tool(name, arguments)\`
and \`await board.reload()\`.

The Prime kernel installs user Python skills into its venv when it builds, so
start a new session after installing, updating or removing this skill; a
running session does not hot-reload it. Re-run \`board install prime-agent\`
after changing the board, author or store; uninstall removes this directory
and the MCP server entry.
`,
    },
    {
      path: "pyproject.toml",
      content: `# Rendered by the sidekick board CLI for author "${author}".
[project]
name = "${skill}"
version = "0.0.1"
description = "${description}"
requires-python = ">=3.9"
dependencies = []

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/${skill}"]
`,
    },
    { path: `src/${skill}/__init__.py`, content: moduleSource },
  ];
  return { name: skill, files };
}

/**
 * The skill-package name is a fixed literal today; this guard keeps a future
 * change honest against the verified Agent-Skills name rule (see
 * dist/core/skills.js: lowercase a-z/0-9/hyphens, no leading/trailing hyphen,
 * no "--", max 64, must equal the parent directory name).
 */
function assertPrimeSkillName(name: string): string {
  if (!/^[a-z0-9]{1,32}(?:-[a-z0-9]+)*$/.test(name) || name.includes("--")) {
    throw new CliError(`invalid prime-agent skill name: ${JSON.stringify(name)}`);
  }
  return name;
}

/**
 * Default daemon socket path. Verified against `prime-agent status --json` on
 * 0.9.4: the default background service listens at
 * `$TMPDIR/prime-agent-<uid>/daemon.sock`.
 */
export function defaultPrimeDaemonSocket(tmpDir?: string, uid?: number): string {
  const base = tmpDir ?? process.env.TMPDIR ?? "/tmp";
  const id = uid ?? process.getuid?.() ?? 501;
  return join(base, `prime-agent-${id}`, "daemon.sock");
}

/**
 * Adapt the plain exit-code runner shape used by CliDependencies.runCommand
 * in ./index.ts to the richer PrimeRunner shape.
 */
export function primeRunnerFromRunCommand(
  runCommand: (command: string, args: string[]) => Promise<number>,
): PrimeRunner {
  return async (command, args) => {
    const exitCode = await runCommand(command, args);
    return { exitCode, stdout: "", stderr: "" };
  };
}

/** Run one prime-agent invocation with the default spawn path. */
async function runPrimeAgent(argv: string[], options: PrimeCommandOptions): Promise<PrimeRunResult> {
  if (options.runner) return options.runner(options.command ?? DEFAULT_PRIME_AGENT_COMMAND, argv);
  const command = options.command ?? DEFAULT_PRIME_AGENT_COMMAND;
  let killChild: (() => void) | undefined;
  const timeout = setTimeout(() => killChild?.(), options.timeoutMs ?? DEFAULT_PRIME_TIMEOUT_MS);
  timeout.unref?.();
  try {
    // Literal "pipe" streams keep the Subprocess generics precise under
    // exactOptionalPropertyTypes; optional cwd/env are spread only when set.
    const child = Bun.spawn([command, ...argv], {
      ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
      ...(options.env === undefined ? {} : { env: { ...process.env, ...options.env } }),
      stdout: "pipe",
      stderr: "pipe",
    });
    killChild = () => child.kill();
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { exitCode, stdout, stderr };
  } catch {
    return { exitCode: 127, stdout: "", stderr: `failed to run ${command}` };
  } finally {
    clearTimeout(timeout);
  }
}

function assertPrimeMcpName(name: string): string {
  // Board naming rule: server names come from board/agent names during
  // integration (e.g. "board-essun"), so reuse assertName for consistency.
  return assertName(name, "prime-agent MCP server name");
}

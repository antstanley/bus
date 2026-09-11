import { afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { chmod, lstat, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  installRuntime,
  PI_COLLISION_SCAN_TRUNCATED_NOTICE,
  PI_COLLISION_SCAN_UNAVAILABLE_NOTICE,
  piIdentityForHostname,
  renderInstallDiff,
  type InstallOptions,
} from "../src/install.ts";
import {
  DEFAULT_PRIME_AGENT_COMMAND,
  primeMcpAddArgs,
  primeMcpGetArgs,
  primeMcpRemoveArgs,
  renderPrimeMcpSkill,
  renderPrimeSkillPackage,
  type PrimeRunner,
  type PrimeRunResult,
} from "../src/prime-agent.ts";
import { openCodeSessionRegistryPath, runCli } from "../src/index.ts";
import { Board, MemoryStore, ulid } from "@board/core";
import { FsStore } from "@board/store-fs";
import { heartbeat, MAX_WHO_LIMIT, who } from "@board/presence";

const PRIME_AGENT_DIR_ENV = "PRIME_AGENT_CODING_AGENT_DIR";
const roots: string[] = [];
const pluginCleanups: Array<() => Promise<void>> = [];
const projectRoot = join(import.meta.dir, "../../..");
let savedPrimeAgentDir: string | undefined;

beforeEach(() => {
  // The host harness may export PRIME_AGENT_* variables. Clear the override
  // before every test so installRuntime resolves each disposable fixture home
  // and never a live agent directory; the F3 override tests set it explicitly.
  savedPrimeAgentDir = process.env[PRIME_AGENT_DIR_ENV];
  delete process.env[PRIME_AGENT_DIR_ENV];
});

afterEach(async () => {
  restoreEnv(PRIME_AGENT_DIR_ENV, savedPrimeAgentDir);
  await Promise.all(pluginCleanups.splice(0).map((cleanup) => cleanup()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "board-install-"));
  roots.push(root);
  return root;
}

function options(home: string, runtime: InstallOptions["runtime"]): InstallOptions {
  return {
    runtime,
    home,
    projectRoot,
    store: "fs:/shared/board",
    author: runtime,
    board: "general",
    indexPath: join(home, ".board", `${runtime}.sqlite`),
  };
}

function uninstallOptions(home: string, runtime: InstallOptions["runtime"]): InstallOptions {
  const { store: _store, ...rest } = options(home, runtime);
  return { ...rest, uninstall: true };
}

async function put(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

async function text(path: string): Promise<string> {
  return readFile(path, "utf8");
}

describe("board install", () => {
  test("merges Claude hooks and MCP idempotently, then removes only owned entries", async () => {
    const home = await fixture();
    const settingsPath = join(home, ".claude", "settings.json");
    const mcpPath = join(home, ".claude.json");
    await put(settingsPath, JSON.stringify({
      theme: "dark",
      hooks: {
        SessionStart: [{ matcher: "resume", hooks: [{ type: "command", command: "existing-start" }] }],
        PostToolUse: [{ hooks: [{ type: "command", command: "existing-post" }] }],
      },
    }, null, 2) + "\n");
    await put(mcpPath, JSON.stringify({
      numStartups: 4,
      mcpServers: {
        board: { command: "unrelated-board" },
        docs: { command: "docs-server" },
      },
    }, null, 2) + "\n");

    const first = await installRuntime(options(home, "claude"));
    expect(first.changes).toHaveLength(2);
    const installedSettings = JSON.parse(await text(settingsPath));
    const installedMcp = JSON.parse(await text(mcpPath));
    expect(installedSettings.theme).toBe("dark");
    expect(installedSettings.hooks.PostToolUse[0].hooks[0].command).toBe("existing-post");
    expect(installedSettings.hooks.SessionStart).toHaveLength(2);
    expect(installedSettings.hooks.SessionStart[1].hooks[0].command).toContain("BOARD_STORE='fs:/shared/board'");
    expect(installedSettings.hooks.SessionStart[1].hooks[0].command).toContain("BOARD_AS='claude'");
    expect(installedSettings.hooks.SessionStart[1].hooks[0].command).toContain(`'${process.execPath}'`);
    expect(installedSettings.hooks.SessionStart[1].hooks[0].timeout).toBe(10);
    expect(installedSettings.hooks.Stop[0].hooks[0].command).toContain(" stop");
    expect(installedSettings.hooks.Stop[0].hooks[0].command).toContain("--runtime 'claude'");
    expect(installedMcp.mcpServers.board.command).toBe("unrelated-board");
    expect(installedMcp.mcpServers.docs.command).toBe("docs-server");
    expect(installedMcp.mcpServers["board-bus"].args).toContain("fs:/shared/board");

    const snapshot = [await text(settingsPath), await text(mcpPath)];
    expect((await installRuntime(options(home, "claude"))).changes).toEqual([]);
    expect([await text(settingsPath), await text(mcpPath)]).toEqual(snapshot);

    await installRuntime(uninstallOptions(home, "claude"));
    const removedSettings = JSON.parse(await text(settingsPath));
    const removedMcp = JSON.parse(await text(mcpPath));
    expect(removedSettings.hooks.SessionStart).toHaveLength(1);
    expect(removedSettings.hooks.PostToolUse).toHaveLength(1);
    expect(removedMcp.mcpServers).toEqual({
      board: { command: "unrelated-board" }, docs: { command: "docs-server" },
    });
    expect((await installRuntime(uninstallOptions(home, "claude"))).changes).toEqual([]);
  });

  test("merges Codex TOML hooks/MCP with occupied names and uninstalls cleanly", async () => {
    const home = await fixture();
    const path = join(home, ".codex", "config.toml");
    await put(path, `model = "gpt-test"\n\n[hooks]\nSessionStart = [{ hooks = [{ type = "command", command = "existing-start" }] }]\nPostToolUse = [{ hooks = [{ type = "command", command = "existing-post" }] }]\n\n[mcp_servers.board]\ncommand = "unrelated-board"\n\n[mcp_servers.docs]\ncommand = "docs"\n`);

    const first = await installRuntime(options(home, "codex"));
    expect(first.changes).toHaveLength(1);
    const installedText = await text(path);
    const installed = Bun.TOML.parse(installedText) as Record<string, any>;
    expect(installed.model).toBe("gpt-test");
    expect(installed.hooks.SessionStart).toHaveLength(2);
    expect(installed.hooks.PostToolUse).toHaveLength(1);
    expect(installed.hooks.Stop[0].hooks[0].command).toContain(" stop");
    expect(installed.hooks.Stop[0].hooks[0].command).toContain("--runtime 'codex'");
    expect(installed.mcp_servers.board.command).toBe("unrelated-board");
    expect(installed.mcp_servers["board-bus"].args).toContain("fs:/shared/board");
    expect((await installRuntime(options(home, "codex"))).changes).toEqual([]);

    await installRuntime(uninstallOptions(home, "codex"));
    const removed = Bun.TOML.parse(await text(path)) as Record<string, any>;
    expect(removed.hooks.SessionStart).toHaveLength(1);
    expect(removed.hooks.PostToolUse).toHaveLength(1);
    expect(removed.hooks.UserPromptSubmit).toBeUndefined();
    expect(removed.hooks.Stop).toBeUndefined();
    expect(removed.mcp_servers).toEqual({ board: { command: "unrelated-board" }, docs: { command: "docs" } });
    expect((await installRuntime(uninstallOptions(home, "codex"))).changes).toEqual([]);
  });

  test("installs MCP only for Gemini and Cursor and preserves unrelated settings", async () => {
    for (const runtime of ["gemini", "cursor"] as const) {
      const home = await fixture();
      const path = runtime === "gemini"
        ? join(home, ".gemini", "settings.json")
        : join(home, ".cursor", "mcp.json");
      await put(path, JSON.stringify({
        keep: true,
        mcpServers: { board: { command: "foreign-board" }, docs: { command: "docs" } },
      }, null, 2) + "\n");
      const result = await installRuntime(options(home, runtime));
      expect(result.notices.join(" ")).toContain("task 503");
      const installed = JSON.parse(await text(path));
      expect(installed.keep).toBe(true);
      expect(installed.mcpServers.docs.command).toBe("docs");
      expect(installed.mcpServers.board.command).toBe("foreign-board");
      expect(installed.mcpServers["board-bus"].command).toBe(process.execPath);
      expect(installed.hooks).toBeUndefined();
      if (runtime === "cursor") expect(installed.mcpServers["board-bus"].type).toBe("stdio");
      expect((await installRuntime(options(home, runtime))).changes).toEqual([]);
      await installRuntime(uninstallOptions(home, runtime));
      expect(JSON.parse(await text(path))).toEqual({
        keep: true,
        mcpServers: { board: { command: "foreign-board" }, docs: { command: "docs" } },
      });
      expect((await installRuntime(uninstallOptions(home, runtime))).changes).toEqual([]);
    }
  });

  test("installs the project-local OpenCode MCP and plugin idempotently", async () => {
    const home = await fixture();
    const cwd = await fixture();
    const configPath = join(cwd, "opencode.json");
    const pluginPath = join(cwd, ".opencode", "plugins", "board.ts");
    await put(configPath, JSON.stringify({
      keep: true,
      mcp: { board: { type: "local", command: ["foreign"] } },
    }, null, 2) + "\n");
    const install = { ...options(home, "opencode"), cwd };
    const first = await installRuntime(install);
    expect(first.changes.map((change) => change.path)).toEqual([configPath, pluginPath]);
    const config = JSON.parse(await text(configPath));
    expect(config.keep).toBe(true);
    expect(config.mcp.board.command).toEqual(["foreign"]);
    expect(config.mcp["board-bus"]).toMatchObject({
      type: "local",
      enabled: true,
      environment: { BOARD_AS: "opencode" },
    });
    expect(config.mcp["board-bus"].command.slice(0, 4)).toEqual([
      process.execPath, join(projectRoot, "packages/mcp/src/index.ts"), "--store", "fs:/shared/board",
    ]);
    const plugin = await text(pluginPath);
    expect(plugin).toContain("experimental.chat.system.transform");
    expect(plugin).toContain("session.created");
    expect(plugin).toContain("session.idle");
    expect(plugin).toContain(join(home, ".board", "sessions", "opencode"));
    expect((await installRuntime(install)).changes).toEqual([]);

    await installRuntime({ ...uninstallOptions(home, "opencode"), cwd });
    expect(JSON.parse(await text(configPath))).toEqual({
      keep: true,
      mcp: { board: { type: "local", command: ["foreign"] } },
    });
    expect(await text(pluginPath)).toBe("");
    expect((await installRuntime({ ...uninstallOptions(home, "opencode"), cwd })).changes).toEqual([]);
  });

  test("the generated OpenCode plugin injects context and publishes its wake target", async () => {
    const home = await fixture();
    const cwd = await fixture();
    const storeRoot = join(cwd, "store");
    const store = new FsStore(storeRoot);
    await new Board(store, { board: "general", author: "claude" }).post({
      body: "OpenCode integration message",
      mentions: ["opencode"],
    });
    await installRuntime({
      ...options(home, "opencode"),
      cwd,
      store: `fs:${storeRoot}`,
    });

    const pluginPath = join(cwd, ".opencode", "plugins", "board.ts");
    const module = await import(`${pathToFileURL(pluginPath).href}?fixture=${Date.now()}`);
    const clock = presenceClock();
    const plugin = await module.BoardPlugin({ serverUrl: new URL("http://127.0.0.1:4096/"), presenceClock: clock });
    pluginCleanups.push(() => plugin.event({ event: { type: "server.instance.disposed" } }));
    const output = { system: [] as string[] };
    await plugin["experimental.chat.system.transform"]({ sessionID: "session-123" }, output);
    expect(output.system.join("\n")).toContain("OpenCode integration message");
    expect(output.system.join("\n")).toContain("UNTRUSTED CONTENT FROM claude");

    await plugin.event({
      event: { type: "session.created", properties: { info: { id: "session-123" } } },
    });
    await plugin.event({
      event: { type: "session.idle", properties: { sessionID: "session-123" } },
    });
    const registryPath = openCodeSessionRegistryPath(
      join(home, ".board", "sessions", "opencode"),
      "session-123",
    );
    expect(JSON.parse(await text(registryPath))).toMatchObject({
      v: 1,
      sessionId: "session-123",
      serverUrl: "http://127.0.0.1:4096/",
    });
    expect((await stat(registryPath)).mode & 0o777).toBe(0o600);
    expect(await who(store, { maxAgeMs: 60_000 })).toEqual([
      expect.objectContaining({
        name: "opencode",
        runtime: "opencode",
        sessionId: "session-123",
        status: "idle",
      }),
    ]);
    expect((await who(store, { maxAgeMs: 60_000 }))[0]?.serverUrl).toBeUndefined();

    await clock.advance(135_000);
    const refreshed = (await who(store, { maxAgeMs: 60_000 }))[0];
    expect(refreshed).toMatchObject({ sessionId: "session-123", status: "idle" });
    await plugin.event({ event: { type: "session.deleted", properties: { sessionID: "session-123" } } });
    expect(await Bun.file(registryPath).exists()).toBe(false);
    expect(clock.timers.size).toBe(0);
  });

  test("the generated OpenCode plugin keeps idle presence fresh without waking the model", async () => {
    const home = await fixture();
    const cwd = await fixture();
    const project = await fixture();
    const capturePath = join(cwd, "hook-calls.jsonl");
    const fakeHook = join(project, "packages", "hooks", "src", "board-hook.ts");
    await put(fakeHook, `
import { appendFile } from "node:fs/promises";
const payload = JSON.parse(await Bun.stdin.text());
await appendFile(${JSON.stringify(capturePath)}, JSON.stringify({
  command: process.argv.at(-1), ...payload,
}) + "\\n");
`);
    await installRuntime({ ...options(home, "opencode"), cwd, projectRoot: project });
    const pluginPath = join(cwd, ".opencode", "plugins", "board.ts");
    const module = await import(`${pathToFileURL(pluginPath).href}?fixture=${Date.now()}`);
    expect(Object.keys(module)).toEqual(["BoardPlugin"]);
    const clock = presenceClock();
    const exitListeners = process.listenerCount("exit");
    const plugin = await module.BoardPlugin({ serverUrl: new URL("http://127.0.0.1:4096/"), presenceClock: clock });
    pluginCleanups.push(() => plugin.event({ event: { type: "server.instance.disposed" } }));
    const event = (type: string, properties: Record<string, unknown> = {}) => plugin.event({ event: { type, properties } });
    const readCalls = async (): Promise<Array<Record<string, unknown>>> =>
      (await text(capturePath)).trim().split("\n").map((line) => JSON.parse(line));
    const readBeats = async () => (await readCalls()).filter((row) => row.command === "heartbeat");
    const registryPath = openCodeSessionRegistryPath(join(home, ".board", "sessions", "opencode"), "session-123");
    try {
      await event("session.created", { info: { id: "session-123" } });
      expect(await readBeats()).toEqual([
        { command: "heartbeat", runtime: "opencode", session_id: "session-123" },
      ]);
      expect(await Bun.file(registryPath).exists()).toBe(true);
      expect(clock.timers.size).toBe(1);
      expect([...clock.timers.values()][0]?.ms).toBe(45_000);
      expect(clock.unrefs).toBe(1);
      expect(process.listenerCount("exit")).toBe(exitListeners + 1);
      await clock.advance(44_999);
      expect(await readBeats()).toHaveLength(1);
      await clock.advance(90_001);
      // Three real refresh periods have elapsed, exceeding delivery's 120s window.
      expect(await readBeats()).toHaveLength(4);
      expect((await readCalls()).every((row) => row.command === "heartbeat")).toBe(true);

      const output = { system: [] as string[] };
      await plugin["experimental.chat.system.transform"]({ sessionID: "session-123" }, output);
      expect((await readBeats()).at(-1))
        .toMatchObject({ session_id: "session-123", status: "working" });
      await event("session.created", { info: { id: "session-123" } });
      await clock.advance(540_000);
      expect(await readBeats()).toHaveLength(5);

      await event("session.status", { sessionID: "session-123", status: { type: "idle" } });
      await clock.advance(135_000);
      expect(await readBeats()).toHaveLength(9);
      await event("session.status", { sessionID: "session-123", status: { type: "retry" } });
      await clock.advance(135_000);
      expect(await readBeats()).toHaveLength(10);
      expect((await readBeats()).at(-1)?.status).toBe("working");

      await event("session.idle", { sessionID: "session-123" });
      // Queue a refresh and a busy transition together: stale idle work must not win.
      await Promise.all([
        clock.advance(45_000),
        event("session.status", { sessionID: "session-123", status: { type: "busy" } }),
      ]);
      expect((await readBeats()).at(-1)?.status).toBe("working");
      await event("session.deleted", { info: { id: "session-123" } });
      expect(await Bun.file(registryPath).exists()).toBe(false);
      expect(clock.timers.size).toBe(0);
      expect(process.listenerCount("exit")).toBe(exitListeners);
      const count = (await readBeats()).length;
      await clock.advance(135_000);
      expect(await readBeats()).toHaveLength(count);

      // Deletion must also await an already queued registration, not leave it behind.
      await Promise.all([
        event("session.created", { info: { id: "session-123" } }),
        event("session.deleted", { sessionID: "session-123" }),
      ]);
      expect(await Bun.file(registryPath).exists()).toBe(false);
      expect(clock.timers.size).toBe(0);

      await event("session.created", { info: { id: "session-123" } });
      await event("session.created", { info: { id: "session-456" } });
      expect(clock.timers.size).toBe(1);
      await event("session.deleted", { sessionID: "session-456" });
      expect(clock.timers.size).toBe(1);
      const otherClock = presenceClock();
      const other = await module.BoardPlugin({ serverUrl: new URL("http://127.0.0.1:4097/"), presenceClock: otherClock });
      pluginCleanups.push(() => other.event({ event: { type: "server.instance.disposed" } }));
      await other.event({ event: { type: "session.created", properties: { info: { id: "other-session" } } } });
      await event("server.instance.disposed");
      expect(await Bun.file(registryPath).exists()).toBe(false);
      expect(clock.timers.size).toBe(0);
      expect(process.listenerCount("exit")).toBe(exitListeners + 1);
      expect(otherClock.timers.size).toBe(1);
      await otherClock.advance(135_000);
      expect((await readBeats()).slice(-3).map((row) => row.session_id))
        .toEqual(["other-session", "other-session", "other-session"]);
      await other.event({ event: { type: "server.instance.disposed" } });
      expect(otherClock.timers.size).toBe(0);
      expect(process.listenerCount("exit")).toBe(exitListeners);
      const finalCalls = await readCalls();
      await clock.advance(135_000);
      await event("session.idle", { sessionID: "session-123" });
      await plugin["experimental.chat.system.transform"]({ sessionID: "session-123" }, output);
      expect(await readCalls()).toEqual(finalCalls);
    } finally {
      await event("server.instance.disposed");
    }
  });

  test("the generated OpenCode plugin serializes inject and heartbeat children on one replica", async () => {
    const home = await fixture();
    const cwd = await fixture();
    const project = await fixture();
    const capturePath = join(cwd, "hook-concurrency.jsonl");
    const fakeHook = join(project, "packages", "hooks", "src", "board-hook.ts");
    await put(fakeHook, `
import { appendFile } from "node:fs/promises";
const payload = JSON.parse(await Bun.stdin.text());
const command = process.argv.at(-1);
const record = (phase) => appendFile(${JSON.stringify(capturePath)}, JSON.stringify({
  phase, command, session: payload.session_id, at: Date.now(),
}) + "\\n");
await record("start");
await Bun.sleep(120);
await record("end");
if (command === "inject") console.log("context for " + payload.session_id);
if (payload.session_id === "flaky" && command === "heartbeat") process.exit(1);
`);
    await installRuntime({ ...options(home, "opencode"), cwd, projectRoot: project });
    const pluginPath = join(cwd, ".opencode", "plugins", "board.ts");
    const module = await import(`${pathToFileURL(pluginPath).href}?fixture=${Date.now()}`);
    const plugin = await module.BoardPlugin({
      serverUrl: new URL("http://127.0.0.1:4096/"),
      presenceClock: presenceClock(),
    });
    pluginCleanups.push(() => plugin.event({ event: { type: "server.instance.disposed" } }));
    const event = (type: string, properties: Record<string, unknown>) =>
      plugin.event({ event: { type, properties } });
    const rows = async (): Promise<Array<{ phase: string; command: string; session?: string }>> =>
      (await text(capturePath)).trim().split("\n").map((line) => JSON.parse(line));

    // Distinct sessions force inject and heartbeat work to interleave unless
    // injection shares the enqueue chain that serializes heartbeat children.
    const outputs = ["a", "b", "c"].map(() => ({ system: [] as string[] }));
    await Promise.all([
      ...outputs.map((output, index) =>
        plugin["experimental.chat.system.transform"]({ sessionID: `inject-${index}` }, output)),
      event("session.created", { info: { id: "created-d" } }),
      event("session.status", { sessionID: "status-e", status: { type: "busy" } }),
    ]);

    let concurrent = 0;
    let maxConcurrent = 0;
    let injectOverlappedHeartbeat = 0;
    const active = new Map<string, number>();
    const totals: Record<string, number> = { heartbeat: 0, inject: 0 };
    for (const row of await rows()) {
      if (row.phase === "start") {
        const other = row.command === "inject" ? "heartbeat" : "inject";
        if ((active.get(other) ?? 0) > 0) injectOverlappedHeartbeat++;
        active.set(row.command, (active.get(row.command) ?? 0) + 1);
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        totals[row.command] = (totals[row.command] ?? 0) + 1;
      } else {
        active.set(row.command, (active.get(row.command) ?? 0) - 1);
        concurrent--;
      }
    }
    // Real serialization: no generated-hook child ever runs with another.
    expect(maxConcurrent).toBe(1);
    expect(injectOverlappedHeartbeat).toBe(0);
    expect(totals).toEqual({ heartbeat: 5, inject: 3 });
    expect(outputs.map((output) => output.system)).toEqual([
      ["context for inject-0\n"], ["context for inject-1\n"], ["context for inject-2\n"],
    ]);

    // Error recovery: a failed child must not wedge the serialized chain.
    const flaky = { system: [] as string[] };
    await plugin["experimental.chat.system.transform"]({ sessionID: "flaky" }, flaky);
    const recovered = { system: [] as string[] };
    await plugin["experimental.chat.system.transform"]({ sessionID: "recovered" }, recovered);
    expect(flaky.system).toEqual(["context for flaky\n"]);
    expect(recovered.system).toEqual(["context for recovered\n"]);

    // Lifecycle: disposal stops any further child.
    await plugin.event({ event: { type: "server.instance.disposed" } });
    const beforeDisposal = (await rows()).length;
    await plugin["experimental.chat.system.transform"]({ sessionID: "disposed" }, { system: [] });
    expect(await rows()).toHaveLength(beforeDisposal);
  });

  test("the generated OpenCode plugin removes its local routing record on process exit", async () => {
    const home = await fixture();
    const cwd = await fixture();
    const project = await fixture();
    await put(join(project, "packages", "hooks", "src", "board-hook.ts"), "await Bun.stdin.text();\n");
    await installRuntime({ ...options(home, "opencode"), cwd, projectRoot: project });
    const pluginPath = join(cwd, ".opencode", "plugins", "board.ts");
    const registryPath = openCodeSessionRegistryPath(join(home, ".board", "sessions", "opencode"), "exit-session");
    const proc = Bun.spawn([process.execPath, "-e", `
      const { BoardPlugin } = await import(${JSON.stringify(pathToFileURL(pluginPath).href)});
      const plugin = await BoardPlugin({ serverUrl: new URL("http://127.0.0.1:4096/") });
      await plugin.event({ event: { type: "session.created", properties: { info: { id: "exit-session" } } } });
      if (!await Bun.file(${JSON.stringify(registryPath)}).exists()) process.exit(2);
      // Natural exit also verifies that the idle interval does not pin the process.
    `], { stdout: "pipe", stderr: "pipe", timeout: 4_000 });
    try {
      const [code, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);
      expect(stderr).toBe("");
      expect(code).toBe(0);
      expect(await Bun.file(registryPath).exists()).toBe(false);
    } finally {
      proc.kill();
      await proc.exited;
    }
  });

  test("the generated OpenCode plugin preserves store environment without inheriting another agent identity", async () => {
    const home = await fixture();
    const cwd = await fixture();
    const project = await fixture();
    const capturePath = join(cwd, "hook-env.json");
    const fakeHook = join(project, "packages", "hooks", "src", "board-hook.ts");
    await put(fakeHook, `
await Bun.write(process.env.BOARD_TEST_CAPTURE!, JSON.stringify({
  awsProfile: process.env.AWS_PROFILE,
  home: process.env.HOME,
  codexThreadId: process.env.CODEX_THREAD_ID,
  cmuxSurface: process.env.CMUX_SURFACE_ID,
}));
console.log("injected by fake hook");
`);
    const previous = {
      awsProfile: process.env.AWS_PROFILE,
      codexThreadId: process.env.CODEX_THREAD_ID,
      cmuxSurface: process.env.CMUX_SURFACE_ID,
      capture: process.env.BOARD_TEST_CAPTURE,
    };
    try {
      process.env.AWS_PROFILE = "task113-profile";
      process.env.CODEX_THREAD_ID = "ambient-codex";
      process.env.CMUX_SURFACE_ID = "ambient-surface";
      process.env.BOARD_TEST_CAPTURE = capturePath;
      await installRuntime({ ...options(home, "opencode"), cwd, projectRoot: project });
      const pluginPath = join(cwd, ".opencode", "plugins", "board.ts");
      const module = await import(`${pathToFileURL(pluginPath).href}?fixture=${Date.now()}`);
      const plugin = await module.BoardPlugin({ serverUrl: new URL("http://127.0.0.1:4096/") });
      pluginCleanups.push(() => plugin.event({ event: { type: "server.instance.disposed" } }));
      const output = { system: [] as string[] };
      await plugin["experimental.chat.system.transform"]({ sessionID: "session-123" }, output);
      expect(output.system).toEqual(["injected by fake hook\n"]);
      expect(JSON.parse(await text(capturePath))).toEqual({
        awsProfile: "task113-profile",
        home: process.env.HOME,
      });
      await plugin.event({ event: { type: "server.instance.disposed" } });
    } finally {
      restoreEnv("AWS_PROFILE", previous.awsProfile);
      restoreEnv("CODEX_THREAD_ID", previous.codexThreadId);
      restoreEnv("CMUX_SURFACE_ID", previous.cmuxSurface);
      restoreEnv("BOARD_TEST_CAPTURE", previous.capture);
    }
  });

  test("refuses to replace a foreign OpenCode plugin without changing config", async () => {
    const home = await fixture();
    const cwd = await fixture();
    const configPath = join(cwd, "opencode.json");
    const pluginPath = join(cwd, ".opencode", "plugins", "board.ts");
    const before = JSON.stringify({ keep: true }) + "\n";
    await put(configPath, before);
    await put(pluginPath, "export const BoardPlugin = async () => ({})\n");
    await expect(installRuntime({ ...options(home, "opencode"), cwd })).rejects.toThrow("non-board OpenCode plugin");
    expect(await text(configPath)).toBe(before);
  });

  test("installs the Pi extension globally or project-locally without replacing foreign files", async () => {
    const home = await fixture();
    const cwd = await fixture();
    const globalPath = join(home, ".pi", "agent", "extensions", "board.ts");
    const projectPath = join(cwd, ".pi", "extensions", "board.ts");
    const global = { ...options(home, "pi"), cwd };
    expect((await installRuntime(global)).changes.map((change) => change.path)).toEqual([globalPath]);
    expect(await text(globalPath)).toContain("before_agent_start");
    expect(await text(globalPath)).toContain("registerTool");
    expect((await installRuntime(global)).changes).toEqual([]);

    const project = { ...global, projectLocal: true };
    expect((await installRuntime(project)).changes.map((change) => change.path)).toEqual([projectPath]);
    expect((await installRuntime(project)).changes).toEqual([]);

    const foreignHome = await fixture();
    const foreignPath = join(foreignHome, ".pi", "agent", "extensions", "board.ts");
    await put(foreignPath, "export default function foreignExtension() {}\n");
    await expect(installRuntime(options(foreignHome, "pi"))).rejects.toThrow("non-board Pi extension");
    expect(await text(foreignPath)).toBe("export default function foreignExtension() {}\n");

    await installRuntime({ ...uninstallOptions(home, "pi"), cwd });
    await installRuntime({ ...uninstallOptions(home, "pi"), cwd, projectLocal: true });
    expect(await Bun.file(globalPath).exists()).toBe(false);
    expect(await Bun.file(projectPath).exists()).toBe(false);
  });

  test("derives a normalized, bounded Pi identity while explicit --as remains authoritative", async () => {
    expect(piIdentityForHostname("BUILD-HOST")).toBe("pi-build-host");
    const lossy = ["build.host", "build-host", "build host"].map(piIdentityForHostname);
    expect(new Set(lossy).size).toBe(3);
    expect(lossy[0]).toMatch(/^pi-build-host-[a-f0-9]{16}$/);
    expect(lossy[1]).toBe("pi-build-host");
    expect(lossy[2]).toMatch(/^pi-build-host-[a-f0-9]{16}$/);
    expect(lossy[0]).not.toBe(lossy[2]);
    expect(piIdentityForHostname("Build.Host")).toBe(piIdentityForHostname("BUILD.HOST"));
    expect(piIdentityForHostname("build--host")).not.toBe(piIdentityForHostname("build__host"));
    expect(piIdentityForHostname("München.local")).toMatch(/^pi-munchen-loca-[a-f0-9]{16}$/);
    const whitespace = ["build-host", " build-host ", "build-host\t"].map(piIdentityForHostname);
    expect(new Set(whitespace).size).toBe(3);
    expect(whitespace[0]).toBe("pi-build-host");
    expect(whitespace[1]).toMatch(/^pi-build-host-[a-f0-9]{16}$/);
    expect(whitespace[2]).toMatch(/^pi-build-host-[a-f0-9]{16}$/);
    const compatibility = ["1", "①"].map(piIdentityForHostname);
    expect(compatibility[0]).toBe("pi-1");
    expect(compatibility[1]).toMatch(/^pi-1-[a-f0-9]{16}$/);
    expect(compatibility[1]).not.toBe(compatibility[0]);
    const combining = ["é-host", "e\u0301-host"].map(piIdentityForHostname);
    expect(combining[0]).toMatch(/^pi-e-host-[a-f0-9]{16}$/);
    expect(combining[1]).toMatch(/^pi-e-host-[a-f0-9]{16}$/);
    expect(combining[0]).not.toBe(combining[1]);
    const long = piIdentityForHostname("This-Is-A-Very-Long-Builder-Hostname-For-Team-Alpha.example.test");
    expect(long).toMatch(/^pi-this-is-a-ve-[a-f0-9]{16}$/);
    expect(long).toHaveLength(32);
    expect(piIdentityForHostname("This-Is-A-Very-Long-Builder-Hostname-For-Team-Alpha.example.test")).toBe(long);
    expect(() => piIdentityForHostname("")).toThrow("pass --as");
    expect(() => piIdentityForHostname("---___...☃")).toThrow("pass --as");

    const home = await fixture();
    const { author: _defaultAuthor, ...derivedBase } = options(home, "pi");
    const derivedOptions = {
      ...derivedBase,
      hostName: "Build.Host",
    };
    await installRuntime(derivedOptions);
    const extension = await text(join(home, ".pi", "agent", "extensions", "board.ts"));
    expect(extension).toContain(`"--as", ${JSON.stringify(piIdentityForHostname("Build.Host"))}`);
    expect(extension).not.toContain('"--as", "pi"');

    const explicitHome = await fixture();
    await installRuntime({
      ...options(explicitHome, "pi"),
      author: "pi-explicit",
      hostName: "Ignored.Host",
    });
    expect(await text(join(explicitHome, ".pi", "agent", "extensions", "board.ts")))
      .toContain('"--as", "pi-explicit"');
  });

  test("warns when a derived Pi identity is registered and keeps dry-run/uninstall deterministic", async () => {
    const home = await fixture();
    const { author: _defaultAuthor, ...derivedBase } = options(home, "pi");
    const derivedAuthor = piIdentityForHostname("Build.Host");
    const base = {
      ...derivedBase,
      hostName: "Build.Host",
      registeredAgents: ["claude", derivedAuthor],
      dryRun: true,
    };
    const dryRun = await installRuntime(base);
    expect(dryRun.notices).toEqual([expect.stringContaining("already registered")]);
    expect(dryRun.notices[0]).toContain("--as <agent>");
    expect(await Bun.file(join(home, ".pi", "agent", "extensions", "board.ts")).exists()).toBe(false);

    const explicit = await installRuntime({ ...base, author: "pi-explicit" });
    expect(explicit.notices).toEqual([]);

    const { author: _uninstallAuthor, ...uninstallBase } = uninstallOptions(home, "pi");
    await expect(installRuntime({
      ...uninstallBase,
      hostName: "---",
    })).resolves.toMatchObject({ changes: [] });
  });

  test("CLI warns when its derived Pi identity collides with stored presence", async () => {
    const home = await fixture();
    const storePath = join(home, "store");
    const store = new FsStore(storePath);
    const derivedAuthor = piIdentityForHostname("Build.Host");
    await heartbeat(store, {
      name: derivedAuthor,
      instance: "00000000000000000000000000",
      status: "idle",
      runtime: "pi",
      tool: "pi",
      sessionId: "existing-session",
    });
    const lines: string[] = [];
    await runCli(["install", "pi", "--store", `fs:${storePath}`, "--dry-run"], {
      installHome: home,
      projectRoot,
      hostname: () => "Build.Host",
      stdout: (line) => lines.push(line),
    });
    expect(lines.join("\n")).toContain("already registered");
    expect(lines.join("\n")).toContain(derivedAuthor);
    expect(lines.join("\n")).toContain("--as <agent>");
    expect(lines).not.toContain(PI_COLLISION_SCAN_TRUNCATED_NOTICE);
  });

  test("CLI reports a truncated collision scan when the derived identity is beyond the bounded page", async () => {
    const home = await fixture();
    // In-memory store via the createStore seam: keeps the 1,001 heartbeats off
    // disk so the bounded-scan case never races the 5s CI budget or teardown.
    const store = new MemoryStore();
    const derivedAuthor = piIdentityForHostname("Build.Host");
    expect(derivedAuthor).toMatch(/^pi-build-host-/);
    // "aaa" sorts before "pi-…", so the derived identity is the 1,001st
    // presence key: stored but beyond the bounded page of MAX_WHO_LIMIT.
    expect("aaa" < derivedAuthor).toBe(true);
    for (let index = 0; index < MAX_WHO_LIMIT; index++) {
      await heartbeat(store, { name: "aaa", instance: ulid(), status: "idle" });
    }
    await heartbeat(store, {
      name: derivedAuthor,
      instance: ulid(),
      status: "idle",
    });
    const lines: string[] = [];
    await runCli(["install", "pi", "--store", "fs:/unused", "--dry-run"], {
      installHome: home,
      projectRoot,
      hostname: () => "Build.Host",
      createStore: async () => store,
      stdout: (line) => lines.push(line),
    });
    expect(lines).toContain(PI_COLLISION_SCAN_TRUNCATED_NOTICE);
    expect(lines.join("\n")).not.toContain("already registered");
  });

  test("CLI reports an unavailable collision scan without leaking store errors", async () => {
    const home = await fixture();
    const secret = "DO-NOT-LEAK-STORE-PATH-OR-SECRET";
    const lines: string[] = [];
    await runCli(["install", "pi", "--store", "fs:/unused", "--dry-run"], {
      installHome: home,
      projectRoot,
      hostname: () => "Build.Host",
      createStore: async () => { throw new Error(secret); },
      stdout: (line) => lines.push(line),
    });
    expect(lines).toContain(PI_COLLISION_SCAN_UNAVAILABLE_NOTICE);
    expect(lines.join("\n")).not.toContain(secret);
  });

  test("the generated Pi extension injects, polls, heartbeats, and exposes native tools", async () => {
    const home = await fixture();
    const extensionPath = join(home, ".pi", "agent", "extensions", "board.ts");
    await put(join(home, "node_modules", "typebox", "package.json"), JSON.stringify({
      name: "typebox",
      type: "module",
      exports: "./index.js",
    }));
    await put(join(home, "node_modules", "typebox", "index.js"), `
export const Type = {
  Object: (properties, options = {}) => ({ type: "object", properties, ...options }),
  String: (options = {}) => ({ type: "string", ...options }),
  Integer: (options = {}) => ({ type: "integer", ...options }),
  Optional: (schema) => schema,
  Array: (items, options = {}) => ({ type: "array", items, ...options }),
};
`);
    await installRuntime(options(home, "pi"));
    const module = await import(`${pathToFileURL(extensionPath).href}?fixture=${Date.now()}`);
    const handlers = new Map<string, (...args: any[]) => any>();
    const tools = new Map<string, any>();
    const calls: Array<{ command: string; args: string[] }> = [];
    const messages: Array<{ message: Record<string, unknown>; options: Record<string, unknown> }> = [];
    let idle = true;
    let failedOperation: string | undefined;
    const api = {
      on: (name: string, handler: (...args: any[]) => any) => handlers.set(name, handler),
      registerTool: (tool: { name: string }) => tools.set(tool.name, tool),
      sendMessage: (message: Record<string, unknown>, sendOptions: Record<string, unknown>) => {
        messages.push({ message, options: sendOptions });
      },
      exec: async (command: string, args: string[]) => {
        calls.push({ command, args });
        const operation = args[1];
        if (operation === failedOperation) return { code: 2, stdout: "", stderr: "failed", killed: false };
        if (operation === "poll") {
          idle = false;
          return { code: 0, stdout: "polled board context", stderr: "", killed: false };
        }
        if (operation === "inject") return { code: 0, stdout: "injected board context", stderr: "", killed: false };
        return { code: 0, stdout: JSON.stringify({ ok: true }), stderr: "", killed: false };
      },
    };
    module.default(api);
    expect([...tools.keys()]).toEqual(["board_post", "board_read", "board_who"]);

    let tick: (() => void) | undefined;
    let intervalMs = 0;
    const originalSetInterval = globalThis.setInterval;
    const originalClearInterval = globalThis.clearInterval;
    (globalThis as any).setInterval = (callback: () => void, ms: number) => {
      tick = callback;
      intervalMs = ms;
      return { unref() {} };
    };
    (globalThis as any).clearInterval = () => {};
    const ctx = {
      isIdle: () => idle,
      sessionManager: { getSessionId: () => "pi-session-123" },
    };
    try {
      await handlers.get("session_start")?.({}, ctx);
      expect(intervalMs).toBe(5_000);
      await tick?.();
      await Bun.sleep(0);
      expect(messages).toEqual([{
        message: { customType: "board", content: "polled board context", display: true },
        options: { deliverAs: "followUp", triggerTurn: true },
      }]);
      idle = true;
      expect(await handlers.get("before_agent_start")?.({}, ctx)).toEqual({
        message: { customType: "board", content: "injected board context", display: true },
      });
      await handlers.get("agent_end")?.({}, ctx);
      await handlers.get("agent_settled")?.({}, ctx);
      handlers.get("session_shutdown")?.({}, ctx);
    } finally {
      globalThis.setInterval = originalSetInterval;
      globalThis.clearInterval = originalClearInterval;
    }

    const signal = new AbortController().signal;
    await tools.get("board_post").execute("call", { body: "hello", mentions: ["claude"] }, signal);
    await tools.get("board_read").execute("call", { limit: 5 }, signal);
    await tools.get("board_who").execute("call", { maxAgeMs: 60_000 }, signal);
    failedOperation = "post";
    await expect(tools.get("board_post").execute("call", { body: "fails" }, signal)).rejects.toThrow(
      "board post failed (exit 2)",
    );
    expect(calls.some(({ args }) => args.includes("poll") && args.includes("pi-session-123"))).toBe(true);
    expect(calls.some(({ args }) => args.includes("heartbeat") && args.includes("working"))).toBe(true);
    expect(calls.some(({ args }) => args.includes("heartbeat") && args.includes("idle"))).toBe(true);
    expect(calls.some(({ args }) => args.includes("post") && args.includes("hello"))).toBe(true);
    expect(calls.some(({ args }) => args.includes("read") && args.includes("5"))).toBe(true);
    expect(calls.some(({ args }) => args.includes("who") && args.includes("60000"))).toBe(true);
  });

  test("the generated Pi extension serializes inject, heartbeat and poll children on one replica", async () => {
    const home = await fixture();
    const extensionPath = join(home, ".pi", "agent", "extensions", "board.ts");
    await put(join(home, "node_modules", "typebox", "package.json"), JSON.stringify({
      name: "typebox",
      type: "module",
      exports: "./index.js",
    }));
    await put(join(home, "node_modules", "typebox", "index.js"), `
export const Type = {
  Object: (properties, options = {}) => ({ type: "object", properties, ...options }),
  String: (options = {}) => ({ type: "string", ...options }),
  Integer: (options = {}) => ({ type: "integer", ...options }),
  Optional: (schema) => schema,
  Array: (items, options = {}) => ({ type: "array", items, ...options }),
};
`);
    await installRuntime(options(home, "pi"));
    const module = await import(`${pathToFileURL(extensionPath).href}?fixture=${Date.now()}`);

    const handlers = new Map<string, (...args: any[]) => any>();
    const rows: Array<{ phase: "start" | "end"; command: string }> = [];
    let failOperation: string | undefined;
    const api = {
      on: (name: string, handler: (...args: any[]) => any) => handlers.set(name, handler),
      registerTool: () => {},
      sendMessage: () => {},
      exec: async (_command: string, args: string[]) => {
        const operation = args[1] ?? "";
        if (operation === failOperation) {
          failOperation = undefined;
          throw new Error("spawn failed");
        }
        rows.push({ phase: "start", command: operation });
        await Bun.sleep(120);
        rows.push({ phase: "end", command: operation });
        return operation === "inject"
          ? { code: 0, stdout: "injected board context", stderr: "", killed: false }
          : { code: 0, stdout: "", stderr: "", killed: false };
      },
    };
    module.default(api);

    let tick: (() => void) | undefined;
    const originalSetInterval = globalThis.setInterval;
    const originalClearInterval = globalThis.clearInterval;
    (globalThis as any).setInterval = (callback: () => void) => { tick = callback; return { unref() {} }; };
    (globalThis as any).clearInterval = () => {};
    const ctx = { isIdle: () => true, sessionManager: { getSessionId: () => "pi-session-123" } };
    try {
      await handlers.get("session_start")?.({}, ctx);
      await handlers.get("agent_end")?.({}, ctx);
      // Pi clears its run-active flag before awaiting the agent_settled emit, so a
      // prompt submitted in that window reaches before_agent_start while the
      // settled heartbeat child is still in flight; the 5s poll timer is
      // independent regardless. All three must share one queue.
      const settled = handlers.get("agent_settled")?.({}, ctx);
      const injected = handlers.get("before_agent_start")?.({}, ctx);
      tick?.();
      const injectedResult = await injected;
      await settled;

      const deadline = Date.now() + 8_000;
      while (rows.length < 10 && Date.now() < deadline) await Bun.sleep(5);

      let concurrent = 0;
      let maxConcurrent = 0;
      let injectOverlappedHeartbeat = 0;
      const active = new Map<string, number>();
      const totals: Record<string, number> = { heartbeat: 0, inject: 0, poll: 0 };
      for (const row of rows) {
        if (row.phase === "start") {
          const other = row.command === "inject" ? "heartbeat" : "inject";
          if ((active.get(other) ?? 0) > 0) injectOverlappedHeartbeat++;
          active.set(row.command, (active.get(row.command) ?? 0) + 1);
          concurrent++;
          maxConcurrent = Math.max(maxConcurrent, concurrent);
          totals[row.command] = (totals[row.command] ?? 0) + 1;
        } else {
          active.set(row.command, (active.get(row.command) ?? 0) - 1);
          concurrent--;
        }
      }
      // Real serialization: no generated-hook child ever runs with another.
      expect(maxConcurrent).toBe(1);
      expect(injectOverlappedHeartbeat).toBe(0);
      expect(totals).toEqual({ heartbeat: 3, inject: 1, poll: 1 });
      expect(injectedResult).toEqual({
        message: { customType: "board", content: "injected board context", display: true },
      });

      // Error recovery: a failed child must not wedge the serialized queue.
      failOperation = "heartbeat";
      await expect(handlers.get("agent_settled")?.({}, ctx)).rejects.toThrow("spawn failed");
      const recovered = await handlers.get("before_agent_start")?.({}, ctx);
      expect(recovered).toEqual({
        message: { customType: "board", content: "injected board context", display: true },
      });
      handlers.get("session_shutdown")?.({}, ctx);
    } finally {
      globalThis.setInterval = originalSetInterval;
      globalThis.clearInterval = originalClearInterval;
    }
  });

  test("merges legacy Letta hooks without replacing foreign config and prefers the mod path", async () => {
    const home = await fixture();
    const path = join(home, ".letta", "settings.json");
    await put(path, JSON.stringify({
      theme: "dark",
      hooks: {
        SessionStart: [{ hooks: [{ type: "command", command: "existing-start" }] }],
        Notification: [{ hooks: [{ type: "command", command: "existing-notification" }] }],
      },
    }, null, 2) + "\n");
    const result = await installRuntime(options(home, "letta"));
    expect(result.changes).toHaveLength(1);
    expect(result.notices.join(" ")).toContain("packages/letta-mod/README.md");
    expect(result.notices.join(" ")).toContain("Installed");
    expect(result.notices.join(" ")).toContain("legacy");
    const installed = JSON.parse(await text(path));
    expect(installed.theme).toBe("dark");
    expect(installed.hooks.SessionStart).toHaveLength(2);
    expect(installed.hooks.UserPromptSubmit[0].hooks[0].command).toContain(" inject");
    expect(installed.hooks.Stop[0].hooks[0].command).toContain(" heartbeat");
    expect(installed.hooks.Stop[0].hooks[0].command).toContain("--runtime 'letta'");
    expect(installed.hooks.Notification[0].hooks[0].command).toBe("existing-notification");
    expect((await installRuntime(options(home, "letta"))).changes).toEqual([]);

    const uninstall = await installRuntime(uninstallOptions(home, "letta"));
    expect(uninstall.notices.join(" ")).toContain("Removed");
    expect(uninstall.notices.join(" ")).toContain("packages/letta-mod/README.md");
    expect(JSON.parse(await text(path))).toEqual({
      theme: "dark",
      hooks: {
        SessionStart: [{ hooks: [{ type: "command", command: "existing-start" }] }],
        Notification: [{ hooks: [{ type: "command", command: "existing-notification" }] }],
      },
    });
    expect((await installRuntime(uninstallOptions(home, "letta"))).changes).toEqual([]);
  });

  test("dry-run prints changes without writing and CLI uninstall does not require a store", async () => {
    const home = await fixture();
    const install = options(home, "gemini");
    const result = await installRuntime({ ...install, dryRun: true });
    const diff = renderInstallDiff(result.changes);
    expect(diff).toContain("+++ " + join(home, ".gemini", "settings.json"));
    expect(diff).toContain("+ ");
    expect(await Bun.file(join(home, ".gemini", "settings.json")).exists()).toBe(false);

    const lines: string[] = [];
    await runCli(["install", "gemini", "--store", "fs:/shared/board"], {
      installHome: home, projectRoot, stdout: (line) => lines.push(line),
    });
    expect(lines.join("\n")).toContain("installed board integration");
    await runCli(["install", "gemini", "--uninstall"], {
      installHome: home, projectRoot, stdout: (line) => lines.push(line),
    });
    expect(lines.join("\n")).toContain("removed board integration");

    await installRuntime(install);
    const noChange: string[] = [];
    await runCli(["install", "gemini", "--store", "fs:/shared/board", "--dry-run"], {
      installHome: home, projectRoot, stdout: (line) => noChange.push(line),
    });
    expect(noChange).toEqual(["no changes", expect.stringContaining("task 503")]);

    const codexHome = await fixture();
    const codexLines: string[] = [];
    await runCli(["install", "codex", "--store", "fs:/shared/board", "--dry-run"], {
      installHome: codexHome, projectRoot, stdout: (line) => codexLines.push(line),
    });
    expect(codexLines.join("\n")).toContain("+++ " + join(codexHome, ".codex", "config.toml"));
    expect(codexLines.join("\n")).toContain("+ [hooks]");
    expect(await Bun.file(join(codexHome, ".codex", "config.toml")).exists()).toBe(false);

    const sensitiveHome = await fixture();
    const sensitivePath = join(sensitiveHome, ".gemini", "settings.json");
    const marker = "DO-NOT-PRINT-THIS-CREDENTIAL";
    await put(sensitivePath, `{"keep":true,"private_access_key":"${marker}"}`);
    const sensitive = await installRuntime({ ...options(sensitiveHome, "gemini"), dryRun: true });
    const sensitiveDiff = renderInstallDiff(sensitive.changes);
    expect(sensitiveDiff).toContain("/mcpServers");
    expect(sensitiveDiff).not.toContain(marker);

    const unknownSecretHome = await fixture();
    const unknownSecretPath = join(unknownSecretHome, ".gemini", "settings.json");
    await put(unknownSecretPath, `{"keep":true,"widget_id":"${marker}"}`);
    const unknownSecret = await installRuntime({ ...options(unknownSecretHome, "gemini"), dryRun: true });
    const unknownSecretDiff = renderInstallDiff(unknownSecret.changes);
    expect(unknownSecretDiff).toContain("/mcpServers");
    expect(unknownSecretDiff).not.toContain(marker);

    const prettyHome = await fixture();
    const prettyPath = join(prettyHome, ".gemini", "settings.json");
    await put(prettyPath, JSON.stringify({ keep: true, credential_password: marker }, null, 2) + "\n");
    const pretty = await installRuntime({ ...options(prettyHome, "gemini"), dryRun: true });
    expect(renderInstallDiff(pretty.changes)).not.toContain(marker);

    for (const [style, before] of [
      ["compact", `{"keep":true,"endpoint":"https://${marker}@example.test/api"}`],
      ["pretty", JSON.stringify({ keep: true, endpoint: `https://${marker}@example.test/api` }, null, 2) + "\n"],
      ["escaped-forward-slash", String.raw`{"keep":true,"endpoint":"https:\/\/${marker}@example.test\/api"}`],
      ["backslash", JSON.stringify({ keep: true, endpoint: String.raw`https:\\${marker}@example.test\api` })],
      ["space-userinfo", JSON.stringify({ keep: true, endpoint: `https://SPACE ${marker}@example.test/api` })],
      ["unicode-escaped", String.raw`{"keep":true,"endpoint":"https\u003a\u002f\u002f${marker}\u0040example.test\u002fapi"}`],
    ] as const) {
      const endpointHome = await fixture();
      const endpointPath = join(endpointHome, ".gemini", "settings.json");
      await put(endpointPath, before);
      const endpoint = await installRuntime({ ...options(endpointHome, "gemini"), dryRun: true });
      const endpointDiff = renderInstallDiff(endpoint.changes);
      expect(endpointDiff, style).toContain("/mcpServers");
      expect(endpointDiff, style).not.toContain(marker);
    }
  });

  test("normalizes relative store paths and refuses to persist URL credentials", async () => {
    const home = await fixture();
    const cwd = join(home, "working directory");
    const relative = { ...options(home, "gemini"), cwd, store: "fs:relative-board" };
    await installRuntime(relative);
    const settings = JSON.parse(await text(join(home, ".gemini", "settings.json")));
    expect(settings.mcpServers.board.args).toContain(`fs:${join(cwd, "relative-board")}`);
    await expect(installRuntime({
      ...options(home, "cursor"),
      store: "git:/replica,remote=https://user:secret@example.test/board.git",
    })).rejects.toThrow("embedded credentials are not allowed");
    await expect(installRuntime({
      ...options(home, "cursor"),
      store: "git:/replica,remote=ssh://git@example.test/board.git",
    })).rejects.toThrow("embedded credentials are not allowed");
    await expect(installRuntime({
      ...options(home, "cursor"),
      store: "git:/replica,remote=https://token@example.test/board.git",
    })).rejects.toThrow("embedded credentials are not allowed");
    await expect(installRuntime({
      ...options(home, "cursor"),
      store: String.raw`git:/replica,remote=https:\\token@example.test\board.git`,
    })).rejects.toThrow("embedded credentials are not allowed");
    await expect(installRuntime({
      ...options(home, "cursor"),
      store: "git:/replica,remote=  https://token@example.test/board.git  ",
    })).rejects.toThrow("embedded credentials are not allowed");
    await expect(installRuntime({
      ...options(home, "cursor"),
      store: "git:/replica,remote=git@example.test:board.git",
    })).resolves.toBeDefined();
  });

  test("preserves existing config permissions and creates private config files", async () => {
    const existingHome = await fixture();
    const existingPath = join(existingHome, ".gemini", "settings.json");
    await put(existingPath, JSON.stringify({ keep: true }) + "\n");
    await chmod(existingPath, 0o640);
    await installRuntime(options(existingHome, "gemini"));
    expect((await stat(existingPath)).mode & 0o777).toBe(0o640);

    const newHome = await fixture();
    const newPath = join(newHome, ".cursor", "mcp.json");
    await installRuntime(options(newHome, "cursor"));
    expect((await stat(newPath)).mode & 0o777).toBe(0o600);
  });

  test("preserves a config symlink, its target mode, indentation, and trailing-newline style", async () => {
    const home = await fixture();
    const target = join(home, "real-settings.json");
    const link = join(home, ".gemini", "settings.json");
    await put(target, `{\n    "keep": true\n}`);
    await chmod(target, 0o600);
    await mkdir(dirname(link), { recursive: true });
    await symlink(target, link);

    await installRuntime(options(home, "gemini"));
    expect((await lstat(link)).isSymbolicLink()).toBe(true);
    expect((await stat(target)).mode & 0o777).toBe(0o600);
    const installed = await text(target);
    expect(installed).toContain(`\n    "mcpServers"`);
    expect(installed.endsWith("\n")).toBe(false);

    const compactHome = await fixture();
    const compactPath = join(compactHome, ".gemini", "settings.json");
    await put(compactPath, `{"keep":true}`);
    await installRuntime(options(compactHome, "gemini"));
    expect(await text(compactPath)).toBe(JSON.stringify(JSON.parse(await text(compactPath))));

    const crlfHome = await fixture();
    const crlfPath = join(crlfHome, ".gemini", "settings.json");
    await put(crlfPath, "{\r\n    \"keep\": true\r\n}\r\n");
    await installRuntime(options(crlfHome, "gemini"));
    const crlf = await text(crlfPath);
    expect(crlf).toContain("\r\n    \"mcpServers\"");
    expect(crlf.replaceAll("\r\n", "")).not.toContain("\n");
  });

  test("rejects inline Codex hooks without changing the file and preserves table comments", async () => {
    const home = await fixture();
    const path = join(home, ".codex", "config.toml");
    const inline = `hooks = { SessionStart = [] }\n`;
    await put(path, inline);
    await expect(installRuntime(options(home, "codex"))).rejects.toThrow("[hooks] table");
    expect(await text(path)).toBe(inline);

    const inlineMcp = `mcp_servers = { board = { command = "foreign" } }\n`;
    await put(path, inlineMcp);
    await expect(installRuntime(options(home, "codex"))).rejects.toThrow("inline Codex mcp_servers");
    expect(await text(path)).toBe(inlineMcp);

    const dotted = `hooks.SessionStart = []\n# >>> board install mcp:board\n[mcp_servers.board]\ncommand = ${JSON.stringify(process.execPath)}\nargs = [${JSON.stringify(join(projectRoot, "packages/mcp/src/index.ts"))}]\n# <<< board install mcp:board\n`;
    await put(path, dotted);
    await expect(installRuntime(uninstallOptions(home, "codex"))).rejects.toThrow("[hooks] table");
    expect(await text(path)).toBe(dotted);

    const table = `[hooks]\nSessionStart = [{ hooks = [{ type = "command", command = "foreign" }] }] # keep inline\n# keep this trailing hook comment\n\n[model_providers.test]\nname = "test"\n`;
    await put(path, table);
    await installRuntime(options(home, "codex"));
    const installed = await text(path);
    expect(installed.indexOf("SessionStart =")).toBeLessThan(installed.indexOf("# keep this trailing hook comment"));
    expect(installed).toContain("# keep inline");
    expect(installed).toContain(`[model_providers.test]\nname = "test"`);

    const malformedMarker = `# >>> board install mcp:foreign\n[mcp_servers.foreign]\ncommand = "foreign"\nargs = ["elsewhere"]\n`;
    await put(path, malformedMarker);
    await expect(installRuntime(options(home, "codex"))).resolves.toBeDefined();
    expect(await text(path)).toContain(malformedMarker.trim());
  });

  test("quotes spaces and shell metacharacters in generated hook commands", async () => {
    const home = await fixture();
    const storePath = join(home, "store'; touch PWNED; #");
    await installRuntime({
      ...options(home, "claude"),
      store: `fs:${storePath}`,
      indexPath: join(home, "index with spaces.sqlite"),
    });
    const settings = JSON.parse(await text(join(home, ".claude", "settings.json")));
    const command = settings.hooks.SessionStart[0].hooks[0].command as string;
    const proc = Bun.spawn(["sh", "-c", command], { cwd: home, stdin: "pipe", stdout: "pipe", stderr: "pipe" });
    proc.stdin.write(JSON.stringify({ runtime: "claude" }));
    proc.stdin.end();
    expect(await proc.exited).toBe(0);
    expect(await Bun.file(join(home, "PWNED")).exists()).toBe(false);

    const cleanEnv = Bun.spawn(["/usr/bin/env", "-i", "/bin/sh", "-c", command], {
      cwd: home, stdin: "pipe", stdout: "pipe", stderr: "pipe",
    });
    cleanEnv.stdin.write(JSON.stringify({ runtime: "claude" }));
    cleanEnv.stdin.end();
    const [stderr, code] = await Promise.all([new Response(cleanEnv.stderr).text(), cleanEnv.exited]);
    expect(code, stderr).toBe(0);
  });

  test("CLI classifies invalid install input as usage errors", async () => {
    const home = await fixture();
    const cases = [
      { args: ["unknown"], message: "install requires one of" },
      { args: ["cursor", "--store", "unsupported:value"], message: "unsupported store" },
      { args: ["cursor", "--store", "fs:/shared", "--as", "../bad"], message: "invalid agent" },
      {
        args: ["cursor", "--store", "git:/replica,remote=https://token@example.test/repo.git"],
        message: "embedded credentials",
      },
      {
        args: ["cursor", "--store", String.raw`git:/replica,remote=https:\\token@example.test\repo.git`],
        message: "embedded credentials",
      },
      {
        args: ["cursor", "--store", "git:/replica,remote=  https://token@example.test/repo.git  "],
        message: "embedded credentials",
      },
    ];
    for (const item of cases) {
      const proc = Bun.spawn([process.execPath, "packages/cli/src/index.ts", "install", ...item.args], {
        cwd: projectRoot, env: { ...process.env, HOME: home }, stdout: "pipe", stderr: "pipe",
      });
      const [stderr, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
      expect(code, stderr).toBe(2);
      expect(stderr).toContain(item.message);
      expect(stderr).not.toContain("token@example.test");
    }
  });

  test("the generated Claude hook command injects from its configured board", async () => {
    const home = await fixture();
    const storePath = join(home, "shared-board");
    await new Board(new FsStore(storePath), { board: "general", author: "codex" }).post({
      body: "installer integration",
      mentions: ["claude"],
    });
    await installRuntime({ ...options(home, "claude"), store: `fs:${storePath}` });
    const settings = JSON.parse(await text(join(home, ".claude", "settings.json")));
    const command = settings.hooks.SessionStart[0].hooks[0].command as string;
    const proc = Bun.spawn(["sh", "-c", command], { stdin: "pipe", stdout: "pipe", stderr: "pipe" });
    proc.stdin.write(JSON.stringify({ hook_event_name: "SessionStart", runtime: "claude" }));
    proc.stdin.end();
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited,
    ]);
    expect(code, stderr).toBe(0);
    expect(stdout).toContain("UNTRUSTED CONTENT FROM codex");
    expect(stdout).toContain("installer integration");
  });

  test("the generated Codex Stop hook blocks without ambient runtime evidence", async () => {
    const home = await fixture();
    const storePath = join(home, "shared-board");
    await new Board(new FsStore(storePath), { board: "general", author: "claude" }).post({
      body: "generated Codex Stop integration",
      mentions: ["codex"],
    });
    await installRuntime({ ...options(home, "codex"), store: `fs:${storePath}` });
    const config = Bun.TOML.parse(await text(join(home, ".codex", "config.toml"))) as Record<string, any>;
    const command = config.hooks.Stop[0].hooks[0].command as string;
    const proc = Bun.spawn(["sh", "-c", command], { stdin: "pipe", stdout: "pipe", stderr: "pipe" });
    proc.stdin.write(JSON.stringify({
      session_id: "33333333-3333-4333-8333-333333333333",
      stop_hook_active: false,
    }));
    proc.stdin.end();
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited,
    ]);
    expect(code, stderr).toBe(0);
    const decision = JSON.parse(stdout) as { decision: string; reason: string };
    expect(decision.decision).toBe("block");
    expect(decision.reason).toContain("generated Codex Stop integration");
  });

  test("installs the prime-agent MCP server and skill package idempotently, updates both, then uninstalls", async () => {
    const home = await fixture();
    const settingsPath = join(home, ".prime", "agent", "settings.json");
    const skillDir = join(home, ".prime", "agent", "skills", "board");
    const modulePath = join(skillDir, "src", "board", "__init__.py");
    const prime = fakePrimeAgent(settingsPath);
    const installOptions = () => ({ ...options(home, "prime-agent"), primeRunner: prime.runner });
    const packageRender = renderPrimeSkillPackage({ server: "board-prime-agent", board: "general", author: "prime-agent" });

    const first = await installRuntime(installOptions());
    expect(first.changes.map((change) => change.path)).toEqual(
      packageRender.files.map((file) => join(skillDir, ...file.path.split("/"))),
    );
    expect(first.notices.join(" ")).toContain("Registered prime-agent MCP server");
    expect(JSON.parse(await text(settingsPath)).mcpServers).toEqual({
      "board-prime-agent": {
        type: "stdio",
        command: process.execPath,
        args: [
          join(projectRoot, "packages/mcp/src/index.ts"),
          "--store", "fs:/shared/board",
          "--as", "prime-agent",
          "--board", "general",
          "--index", join(home, ".board", "prime-agent.sqlite"),
        ],
        cwd: projectRoot,
      },
    });
    // The wrapper is a discoverable Python skill package, not a bare file:
    // SKILL.md name/dir agreement, pyproject package name, module source.
    expect(await text(join(skillDir, "SKILL.md"))).toContain("name: board");
    expect(await text(join(skillDir, "SKILL.md"))).toContain("description: ");
    expect(await text(join(skillDir, "pyproject.toml"))).toContain('name = "board"');
    expect(await text(modulePath))
      .toBe(renderPrimeMcpSkill({ server: "board-prime-agent", board: "general", author: "prime-agent" }));

    const second = await installRuntime(installOptions());
    expect(second.changes).toEqual([]);
    // Verified update semantics: the probe finds board-prime-agent and the
    // definition is force-replaced (identical content, still one entry).
    expect(second.notices.join(" ")).toContain("definition replaced via prime-agent mcp add --force");
    expect(Object.keys(JSON.parse(await text(settingsPath)).mcpServers)).toEqual(["board-prime-agent"]);

    // Update re-renders the owned package AND propagates to the registered
    // MCP definition via the verified --force replace.
    const updated = await installRuntime({ ...installOptions(), board: "general-2" });
    expect(updated.changes.map((change) => change.path)).toEqual(
      renderPrimeSkillPackage({ server: "board-prime-agent", board: "general-2", author: "prime-agent" })
        .files.map((file) => join(skillDir, ...file.path.split("/"))),
    );
    expect(await text(modulePath)).toContain('BOARD = "general-2"');
    const afterUpdate = JSON.parse(await text(settingsPath));
    expect(Object.keys(afterUpdate.mcpServers)).toEqual(["board-prime-agent"]);
    expect(afterUpdate.mcpServers["board-prime-agent"].args).toContain("general-2");
    expect(afterUpdate.mcpServers["board-prime-agent"].args).not.toContain("general");

    const uninstalled = await installRuntime({ ...uninstallOptions(home, "prime-agent"), primeRunner: prime.runner });
    expect(uninstalled.changes.map((change) => change.path)).toEqual(
      packageRender.files.map((file) => join(skillDir, ...file.path.split("/"))),
    );
    expect(uninstalled.notices.join(" ")).toContain("Removed prime-agent MCP server");
    expect(await Bun.file(modulePath).exists()).toBe(false);
    // The verified remove deleted the entry (real CLI leaves an empty object).
    expect(JSON.parse(await text(settingsPath)).mcpServers).toEqual({});
    const secondUninstall = await installRuntime(
      { ...uninstallOptions(home, "prime-agent"), primeRunner: prime.runner },
    );
    expect(secondUninstall.changes).toEqual([]);
    expect(secondUninstall.notices).toEqual([]);
    // Not-idempotent remove is only ever called after a present probe.
    expect(prime.calls.filter((args) => args[0] === "mcp" && args[1] === "remove")).toEqual([
      ["mcp", "remove", "board-prime-agent"],
    ]);
  });

  test("refuses foreign prime-agent skill files and a foreign server occupying board-<author>", async () => {
    const home = await fixture();
    const settingsPath = join(home, ".prime", "agent", "settings.json");
    const skillDir = join(home, ".prime", "agent", "skills", "board");
    const foreignSkill = "import unrelated_skill  # not board-rendered\n";
    await put(join(skillDir, "SKILL.md"), foreignSkill);
    const prime = fakePrimeAgent(settingsPath);
    await expect(installRuntime({ ...options(home, "prime-agent"), primeRunner: prime.runner }))
      .rejects.toThrow("refusing to replace non-board prime-agent skill");
    expect(await text(join(skillDir, "SKILL.md"))).toBe(foreignSkill);
    expect(await Bun.file(settingsPath).exists()).toBe(false);
    expect(prime.calls.some((args) => args[0] === "mcp" && args[1] === "add")).toBe(false);

    // Mixed ownership is refused too: our SKILL.md but a foreign module file.
    const mixedHome = await fixture();
    const mixedSettings = join(mixedHome, ".prime", "agent", "settings.json");
    const mixedDir = join(mixedHome, ".prime", "agent", "skills", "board");
    await put(join(mixedDir, "SKILL.md"),
      renderPrimeSkillPackage({ server: "board-prime-agent", board: "general", author: "prime-agent" }).files[0]!.content);
    await put(join(mixedDir, "src", "board", "__init__.py"), "# someone else's module\n");
    const mixed = fakePrimeAgent(mixedSettings);
    await expect(installRuntime({ ...options(mixedHome, "prime-agent"), primeRunner: mixed.runner }))
      .rejects.toThrow("refusing to replace non-board prime-agent skill");
    expect(mixed.calls.some((args) => args[0] === "mcp" && args[1] === "add")).toBe(false);

    // A FOREIGN definition already occupying board-<author> is refused before
    // any mutation: presence alone is not ownership. The foreign entry and the
    // rest of the settings survive byte-identically and no add is attempted.
    const occupiedHome = await fixture();
    const occupiedSettings = join(occupiedHome, ".prime", "agent", "settings.json");
    const foreignSettings = JSON.stringify({
      other: true,
      mcpServers: {
        "unrelated": { type: "stdio", command: "keep-me" },
        "board-prime-agent": { type: "stdio", command: "someone-else" },
      },
    }, null, 2) + "\n";
    await put(occupiedSettings, foreignSettings);
    const occupied = fakePrimeAgent(occupiedSettings);
    await expect(installRuntime({ ...options(occupiedHome, "prime-agent"), primeRunner: occupied.runner }))
      .rejects.toThrow("refusing to replace non-board prime-agent MCP server");
    expect(await text(occupiedSettings)).toBe(foreignSettings);
    expect(occupied.calls.some((args) => args[0] === "mcp" && args[1] === "add")).toBe(false);
    expect(await Bun.file(join(occupiedHome, ".prime", "agent", "skills", "board", "SKILL.md")).exists()).toBe(false);
  });

  test("refuses to remove a foreign prime-agent MCP server and keeps --dry-run uninstall read-only", async () => {
    const home = await fixture();
    const settingsPath = join(home, ".prime", "agent", "settings.json");
    const foreign = JSON.stringify({
      other: true,
      mcpServers: { "board-prime-agent": { type: "stdio", command: "someone-else" } },
    }, null, 2) + "\n";
    await put(settingsPath, foreign);
    const prime = fakePrimeAgent(settingsPath);
    await expect(installRuntime({ ...uninstallOptions(home, "prime-agent"), primeRunner: prime.runner }))
      .rejects.toThrow("refusing to remove non-board prime-agent MCP server");
    expect(await text(settingsPath)).toBe(foreign);
    expect(prime.calls.some((args) => args[0] === "mcp" && args[1] === "remove")).toBe(false);

    // A dry-run uninstall of a board-owned entry probes read-only: one `mcp
    // get`, no `mcp remove`, no settings change, and the planned package
    // removal is reported without deleting the files.
    const ownedHome = await fixture();
    const ownedSettings = join(ownedHome, ".prime", "agent", "settings.json");
    const skillPath = join(ownedHome, ".prime", "agent", "skills", "board", "SKILL.md");
    const owned = fakePrimeAgent(ownedSettings);
    await installRuntime({ ...options(ownedHome, "prime-agent"), primeRunner: owned.runner });
    const before = await text(ownedSettings);
    const callsBefore = owned.calls.length;
    const dry = await installRuntime({
      ...uninstallOptions(ownedHome, "prime-agent"), primeRunner: owned.runner, dryRun: true,
    });
    expect(owned.calls.slice(callsBefore)).toEqual([["mcp", "get", "board-prime-agent"]]);
    expect(await text(ownedSettings)).toBe(before);
    expect(dry.notices.join(" ")).toContain("Would remove prime-agent MCP server");
    expect(dry.changes.map((change) => change.path)).toContain(skillPath);
    expect(await Bun.file(skillPath).exists()).toBe(true);
  });

  test("author-scopes the prime-agent skill package across install and uninstall (G1 R2 NEW-1/NEW-2)", async () => {
    // Alpha installs first.
    const home = await fixture();
    const settingsPath = join(home, ".prime", "agent", "settings.json");
    const skillDir = join(home, ".prime", "agent", "skills", "board");
    const alphaInstall = fakePrimeAgent(settingsPath);
    await installRuntime({ ...options(home, "prime-agent"), author: "alpha", primeRunner: alphaInstall.runner });
    const alphaBytes: Record<string, string> = {};
    for (const entry of renderPrimeSkillPackage({ server: "board-alpha", board: "general", author: "alpha" }).files) {
      alphaBytes[entry.path] = await text(join(skillDir, ...entry.path.split("/")));
    }

    // Beta's install must refuse on alpha's render and change nothing: no
    // partial write, no MCP add, alpha's files byte-identical.
    const betaInstall = fakePrimeAgent(settingsPath);
    await expect(installRuntime({ ...options(home, "prime-agent"), author: "beta", primeRunner: betaInstall.runner }))
      .rejects.toThrow("refusing to replace prime-agent skill rendered for a different author");
    for (const entry of renderPrimeSkillPackage({ server: "board-alpha", board: "general", author: "alpha" }).files) {
      expect(await text(join(skillDir, ...entry.path.split("/")))).toBe(alphaBytes[entry.path]!);
    }
    expect(betaInstall.calls.some((args) => args[0] === "mcp" && args[1] === "add")).toBe(false);

    // Beta's uninstall refuses the whole package too (all-or-nothing), so it
    // can neither orphan nor strip alpha's wrapper; board-alpha survives.
    const betaUninstall = fakePrimeAgent(settingsPath);
    await expect(installRuntime({
      ...options(home, "prime-agent"), author: "beta", uninstall: true, primeRunner: betaUninstall.runner,
    })).rejects.toThrow("refusing to uninstall: prime-agent skill package contains files rendered for a different author");
    for (const entry of renderPrimeSkillPackage({ server: "board-alpha", board: "general", author: "alpha" }).files) {
      expect(await text(join(skillDir, ...entry.path.split("/")))).toBe(alphaBytes[entry.path]!);
    }
    expect(betaUninstall.calls.some((args) => args[0] === "mcp" && args[1] === "remove")).toBe(false);

    // A mixed-author package (module reverted to another author's SERVER
    // binding) stops BOTH authors' uninstalls: partial deletion would leave
    // no self-repair, so the fail-closed gate requires manual recovery.
    const betaModule = renderPrimeSkillPackage({ server: "board-beta", board: "general", author: "beta" })
      .files.find((file) => file.path === "src/board/__init__.py")!;
    await put(join(skillDir, ...betaModule.path.split("/")), betaModule.content);
    const mixedUninstall = fakePrimeAgent(settingsPath);
    await expect(installRuntime({
      ...options(home, "prime-agent"), author: "alpha", uninstall: true, primeRunner: mixedUninstall.runner,
    })).rejects.toThrow("refusing to uninstall: prime-agent skill package contains files rendered for a different author");
    expect(await text(join(skillDir, "SKILL.md"))).toBe(alphaBytes["SKILL.md"]!);

    // Alpha's own uninstall still works end to end.
    // Recovery from a mixed package is manual by design: restore the alpha
    // module, after which the owner's uninstall proceeds normally.
    const alphaModule = renderPrimeSkillPackage({ server: "board-alpha", board: "general", author: "alpha" })
      .files.find((file) => file.path === "src/board/__init__.py")!;
    await put(join(skillDir, ...alphaModule.path.split("/")), alphaModule.content);
    expect(await text(join(skillDir, "SKILL.md"))).toBe(alphaBytes["SKILL.md"]!);
    const alphaUninstall = fakePrimeAgent(settingsPath);
    await installRuntime({
      ...options(home, "prime-agent"), author: "alpha", uninstall: true, primeRunner: alphaUninstall.runner,
    });
    expect(await Bun.file(join(skillDir, "SKILL.md")).exists()).toBe(false);
    const settings = JSON.parse(await text(settingsPath)) as { mcpServers?: Record<string, unknown> };
    expect(settings.mcpServers?.["board-alpha"]).toBeUndefined();
  });

  test("uninstall refuses a package containing a foreign non-marker module (G4 INFO residual)", async () => {
    const home = await fixture();
    const settingsPath = join(home, ".prime", "agent", "settings.json");
    const skillDir = join(home, ".prime", "agent", "skills", "board");
    const prime = fakePrimeAgent(settingsPath);
    await installRuntime({ ...options(home, "prime-agent"), primeRunner: prime.runner });
    // Overwrite only the module with foreign non-board bytes; SKILL.md and
    // pyproject.toml stay board-owned. Whole-package ownership means the
    // uninstall refuses instead of stripping the owned files around the
    // foreign module (which would leave it orphaned with no self-repair).
    const foreignModule = "# someone else's module, no board marker\n";
    await put(join(skillDir, "src", "board", "__init__.py"), foreignModule);
    await expect(installRuntime({
      ...options(home, "prime-agent"), uninstall: true, primeRunner: prime.runner,
    })).rejects.toThrow("refusing to uninstall: prime-agent skill package contains non-board files");
    expect(await text(join(skillDir, "SKILL.md"))).toBe(
      renderPrimeSkillPackage({ server: "board-prime-agent", board: "general", author: "prime-agent" }).files[0]!.content,
    );
    expect(await text(join(skillDir, "src", "board", "__init__.py"))).toBe(foreignModule);
  });

  test("uninstall refuses a foreign file at a non-renderer path (G4 R3 LOW-1)", async () => {
    const home = await fixture();
    const settingsPath = join(home, ".prime", "agent", "settings.json");
    const skillDir = join(home, ".prime", "agent", "skills", "board");
    const prime = fakePrimeAgent(settingsPath);
    await installRuntime({ ...options(home, "prime-agent"), primeRunner: prime.runner });
    // A foreign file at a path no renderer output occupies must refuse the
    // uninstall (R3 LOW-1: enumeration covers the whole package, not just
    // the three renderer paths).
    await put(join(skillDir, "nested", "extra.py"), "# foreign bytes\n");
    await expect(installRuntime({
      ...options(home, "prime-agent"), uninstall: true, primeRunner: prime.runner,
    })).rejects.toThrow("refusing to uninstall: unexpected directory in prime-agent skill package");
    // Nothing was deleted by the refused uninstall.
    expect(await Bun.file(join(skillDir, "SKILL.md")).exists()).toBe(true);
  });

  test("uninstall treats a present-but-empty renderer file as unowned (G4 R3 LOW-2)", async () => {
    const home = await fixture();
    const settingsPath = join(home, ".prime", "agent", "settings.json");
    const skillDir = join(home, ".prime", "agent", "skills", "board");
    const prime = fakePrimeAgent(settingsPath);
    await installRuntime({ ...options(home, "prime-agent"), primeRunner: prime.runner });
    // Empty the SKILL.md (present-but-empty ≠ absent): the uninstall must
    // refuse it as unowned rather than silently deleting around it.
    await writeFile(join(skillDir, "SKILL.md"), "", { flag: "w" });
    await expect(installRuntime({
      ...options(home, "prime-agent"), uninstall: true, primeRunner: prime.runner,
    })).rejects.toThrow("refusing to uninstall: prime-agent skill package contains non-board files");
    expect(await Bun.file(join(skillDir, "SKILL.md")).exists()).toBe(true);
  });

  test("primeMcpServerInstalled contract lives behind the installer probe (G1 R2 NEW-2)", async () => {
    // The exit contract is pinned in prime-agent.test.ts; here we pin that
    // the installer actually probes before adding, so the throw path of
    // primeMcpServerInstalled is on the live install path.
    const home = await fixture();
    const settingsPath = join(home, ".prime", "agent", "settings.json");
    const prime = fakePrimeAgent(settingsPath);
    await installRuntime({ ...options(home, "prime-agent"), primeRunner: prime.runner });
    expect(prime.calls[0]).toEqual(["mcp", "get", "board-prime-agent"]);
  });

  test("dry-run plans prime-agent changes without adding the server or writing the skill package", async () => {
    const home = await fixture();
    const settingsPath = join(home, ".prime", "agent", "settings.json");
    const skillDir = join(home, ".prime", "agent", "skills", "board");
    const prime = fakePrimeAgent(settingsPath);
    const result = await installRuntime({
      ...options(home, "prime-agent"), primeRunner: prime.runner, dryRun: true,
    });
    const packageRender = renderPrimeSkillPackage({ server: "board-prime-agent", board: "general", author: "prime-agent" });
    const plannedPaths = packageRender.files.map((file) => join(skillDir, ...file.path.split("/")));
    expect(result.changes.map((change) => change.path)).toEqual(plannedPaths);
    expect(renderInstallDiff(result.changes)).toContain("+++ " + plannedPaths[2]);
    expect(result.notices.join(" ")).toContain("Would register");
    for (const path of plannedPaths) expect(await Bun.file(path).exists()).toBe(false);
    expect(await Bun.file(settingsPath).exists()).toBe(false);
    expect(prime.calls).toEqual([["mcp", "get", "board-prime-agent"]]);

    // With the server already present, dry-run plans the verified replace.
    await installRuntime({ ...options(home, "prime-agent"), primeRunner: prime.runner });
    const planned = await installRuntime({
      ...options(home, "prime-agent"), primeRunner: prime.runner, dryRun: true,
    });
    expect(planned.changes).toEqual([]);
    expect(planned.notices.join(" ")).toContain("would replace its definition via prime-agent mcp add --force");
    expect(prime.calls.at(-1)).toEqual(["mcp", "get", "board-prime-agent"]);
  });

  test("the installed prime-agent wrapper compiles under the host python3 when available", async () => {
    const python = Bun.which("python3");
    if (!python) return; // best-effort: python-less environments rely on prime-agent.test.ts probes
    const home = await fixture();
    const settingsPath = join(home, ".prime", "agent", "settings.json");
    const modulePath = join(home, ".prime", "agent", "skills", "board", "src", "board", "__init__.py");
    const prime = fakePrimeAgent(settingsPath);
    await installRuntime({ ...options(home, "prime-agent"), primeRunner: prime.runner });
    const proc = Bun.spawnSync([
      python, "-c",
      `compile(open(${JSON.stringify(modulePath)}, encoding="utf-8").read(), ${JSON.stringify(modulePath)}, "exec")`,
    ]);
    expect(proc.exitCode, new TextDecoder().decode(proc.stderr ?? new Uint8Array())).toBe(0);
  });

  test("fails closed on malformed, non-object and missing prime-agent settings", async () => {
    const cases: Array<{ label: string; content?: string }> = [
      { label: "unparseable JSON", content: "{ this is not json" },
      { label: "JSON root is an array", content: "[]" },
      { label: "JSON root is null", content: "null" },
      { label: "mcpServers is an array", content: JSON.stringify({ mcpServers: [] }) },
      { label: "mcpServers is null", content: JSON.stringify({ mcpServers: null }) },
      { label: "mcpServers is a string", content: JSON.stringify({ mcpServers: "board" }) },
      { label: "mcpServers is absent", content: JSON.stringify({ other: true }) },
      { label: "settings file missing while the probe claims present" },
    ];
    for (const scenario of cases) {
      const home = await fixture();
      const settingsPath = join(home, ".prime", "agent", "settings.json");
      if (scenario.content !== undefined) await put(settingsPath, scenario.content);
      const prime = presentProbeRunner();
      // The CLI probe claims the name exists, so only the read-only ownership
      // gate can refuse; an unknown or unreadable file must never be trusted.
      await expect(installRuntime({ ...options(home, "prime-agent"), primeRunner: prime.runner }))
        .rejects.toThrow("refusing to replace non-board prime-agent MCP server");
      if (scenario.content !== undefined) expect(await text(settingsPath)).toBe(scenario.content);
      expect(prime.calls.some((args) => args[0] === "mcp" && args[1] === "add")).toBe(false);
      expect(await Bun.file(join(home, ".prime", "agent", "skills", "board", "SKILL.md")).exists()).toBe(false);
    }
  });

  test("fails closed on an unreadable prime-agent settings file", async () => {
    if ((process.getuid?.() ?? 0) === 0) return; // root bypasses mode bits
    const home = await fixture();
    const settingsPath = join(home, ".prime", "agent", "settings.json");
    const foreign = JSON.stringify({
      mcpServers: { "board-prime-agent": { type: "stdio", command: "someone-else" } },
    }, null, 2) + "\n";
    await put(settingsPath, foreign);
    await chmod(settingsPath, 0o000);
    const prime = presentProbeRunner();
    try {
      // The read error propagates (fail closed) rather than being read as
      // "no entry"; no mutating call is made and the file is untouched.
      await expect(installRuntime({ ...options(home, "prime-agent"), primeRunner: prime.runner }))
        .rejects.toThrow(/EACCES|EPERM|permission denied/i);
      expect(prime.calls.some((args) => args[0] === "mcp" && args[1] === "add")).toBe(false);
    } finally {
      await chmod(settingsPath, 0o600);
    }
    expect(await text(settingsPath)).toBe(foreign);
  });

  test("fails closed on symlinked and dangling prime-agent settings", async () => {
    // settings.json symlinked to a foreign target: the gate follows the link,
    // refuses the foreign definition and leaves the target byte-identical.
    const home = await fixture();
    const target = join(await fixture(), "elsewhere", "settings.json");
    const foreign = JSON.stringify({
      mcpServers: { "board-prime-agent": { type: "stdio", command: "someone-else" } },
    }, null, 2) + "\n";
    await put(target, foreign);
    const agentDir = join(home, ".prime", "agent");
    await mkdir(agentDir, { recursive: true });
    await symlink(target, join(agentDir, "settings.json"));
    const linked = fakePrimeAgent(target);
    await expect(installRuntime({ ...options(home, "prime-agent"), primeRunner: linked.runner }))
      .rejects.toThrow("refusing to replace non-board prime-agent MCP server");
    expect(await text(target)).toBe(foreign);
    expect(linked.calls.some((args) => args[0] === "mcp" && args[1] === "add")).toBe(false);

    // Dangling symlink: an unknown entry is refused, not treated as owned.
    const danglingHome = await fixture();
    const danglingDir = join(danglingHome, ".prime", "agent");
    await mkdir(danglingDir, { recursive: true });
    const link = join(danglingDir, "settings.json");
    await symlink(join(danglingHome, "missing-target.json"), link);
    const dangling = presentProbeRunner();
    await expect(installRuntime({ ...options(danglingHome, "prime-agent"), primeRunner: dangling.runner }))
      .rejects.toThrow("refusing to replace non-board prime-agent MCP server");
    expect(dangling.calls.some((args) => args[0] === "mcp" && args[1] === "add")).toBe(false);
    expect((await lstat(link)).isSymbolicLink()).toBe(true);
  });

  test("treats an entry carrying the MCP entrypoint only in args as foreign", async () => {
    const home = await fixture();
    const settingsPath = join(home, ".prime", "agent", "settings.json");
    const mcpPath = join(projectRoot, "packages/mcp/src/index.ts");
    // Old predicate: any command/args token equal to mcpPath counted as
    // ownership, so this foreign server was misclassified and replaced.
    const impostor = JSON.stringify({
      other: true,
      mcpServers: {
        "board-prime-agent": { type: "stdio", command: "/usr/bin/evil-server", args: ["--config", mcpPath] },
      },
    }, null, 2) + "\n";
    await put(settingsPath, impostor);
    const prime = fakePrimeAgent(settingsPath);
    await expect(installRuntime({ ...options(home, "prime-agent"), primeRunner: prime.runner }))
      .rejects.toThrow("refusing to replace non-board prime-agent MCP server");
    expect(await text(settingsPath)).toBe(impostor);
    expect(prime.calls.some((args) => args[0] === "mcp" && args[1] === "add")).toBe(false);
  });

  test("gates the PRIME_AGENT_CODING_AGENT_DIR override settings file, not the default", async () => {
    const home = await fixture();
    const overrideDir = join(await fixture(), "override-agent");
    const defaultSettings = join(home, ".prime", "agent", "settings.json");
    const overrideSettings = join(overrideDir, "settings.json");
    const mcpPath = join(projectRoot, "packages/mcp/src/index.ts");
    // A stale board-owned entry in the DEFAULT directory must not authorize a
    // foreign entry in the override directory (the round-2 fail-open case).
    await put(defaultSettings, JSON.stringify({
      mcpServers: {
        "board-prime-agent": { type: "stdio", command: process.execPath, args: [mcpPath, "--store", "fs:/stale"] },
      },
    }, null, 2) + "\n");
    const foreign = JSON.stringify({
      other: true,
      mcpServers: { "board-prime-agent": { type: "stdio", command: "someone-else" } },
    }, null, 2) + "\n";
    await put(overrideSettings, foreign);
    const prime = fakePrimeAgent(overrideSettings);
    restoreEnv(PRIME_AGENT_DIR_ENV, overrideDir);
    await expect(installRuntime({ ...options(home, "prime-agent"), primeRunner: prime.runner }))
      .rejects.toThrow("refusing to replace non-board prime-agent MCP server");
    expect(await text(overrideSettings)).toBe(foreign);
    expect(prime.calls.some((args) => args[0] === "mcp" && args[1] === "add")).toBe(false);
    // Refusal precedes every mutation: the stale default entry and both skill
    // directories are untouched.
    expect(await text(defaultSettings)).toContain("fs:/stale");
    expect(await Bun.file(join(overrideDir, "skills", "board", "SKILL.md")).exists()).toBe(false);
    expect(await Bun.file(join(home, ".prime", "agent", "skills", "board", "SKILL.md")).exists()).toBe(false);
  });

  test("installs the gate and skills under the active PRIME_AGENT_CODING_AGENT_DIR override", async () => {
    const home = await fixture();
    const overrideDir = join(await fixture(), "override-agent");
    const overrideSettings = join(overrideDir, "settings.json");
    const prime = fakePrimeAgent(overrideSettings);
    restoreEnv(PRIME_AGENT_DIR_ENV, overrideDir);
    const result = await installRuntime({ ...options(home, "prime-agent"), primeRunner: prime.runner });
    expect(result.notices.join(" ")).toContain("Registered prime-agent MCP server");
    // Wrapper and MCP entry land in the override directory; the default home
    // is never touched.
    expect(await Bun.file(join(overrideDir, "skills", "board", "SKILL.md")).exists()).toBe(true);
    expect(await Bun.file(join(home, ".prime", "agent", "settings.json")).exists()).toBe(false);
    expect(await Bun.file(join(home, ".prime", "agent", "skills", "board", "SKILL.md")).exists()).toBe(false);
    const stored = JSON.parse(await text(overrideSettings));
    expect(stored.mcpServers["board-prime-agent"].args[0]).toBe(join(projectRoot, "packages/mcp/src/index.ts"));
    // Uninstall resolves the same override directory and removes the entry.
    await installRuntime({ ...uninstallOptions(home, "prime-agent"), primeRunner: prime.runner });
    expect(JSON.parse(await text(overrideSettings)).mcpServers).toEqual({});
    expect(await Bun.file(join(overrideDir, "skills", "board", "SKILL.md")).exists()).toBe(false);
  });
});

/**
 * Real executable-selection regression for the prime-agent install path.
 *
 * Every other prime-agent test injects a runner (`fakePrimeAgent`,
 * `realPrimeRunner`, `scriptedRunner`), and those doubles ignore the command
 * they are handed, so none of them can observe which executable the default
 * `runPrimeAgent` spawn path selects. Round 4 fixed `PrimeMcpOptions.command`
 * shadowing `PrimeCommandOptions.command`, which had made the installer run
 * `<childCommand> mcp get|add …` (bun) instead of the `prime-agent` CLI. This
 * test drives the real spawn path with a disposable PATH stub and a project
 * `package.json` "mcp" decoy that the shadowing shape would have executed.
 */
describe("prime-agent installer executable selection (real spawn path)", () => {
  test("runs prime-agent from PATH, passes the child after --, and never runs the project mcp decoy", async () => {
    const home = await fixture();
    const bin = join(await fixture(), "bin");
    const project = join(await fixture(), "project");
    const stubLog = join(home, "prime-stub.log");
    const decoyLog = join(home, "decoy.log");
    await mkdir(bin, { recursive: true });
    await put(join(project, "packages/mcp/src/index.ts"), "// fixture board MCP entrypoint\n");
    // A project script named "mcp": under the round-4 shadowing bug the spawn
    // was `<bun> mcp get|add …` with cwd=projectRoot, so bun would run THIS
    // script with the installer's argv instead of the prime-agent CLI.
    await put(join(project, "package.json"), JSON.stringify({
      name: "decoy-project",
      private: true,
      scripts: { mcp: `sh -c 'echo DECOY-RAN:$@ >> "${decoyLog}"' --` },
    }) + "\n");
    const stub = join(bin, "prime-agent");
    await writeFile(stub, [
      "#!/bin/sh",
      `echo "INVOKED=$0" >> "$BOARD_PRIME_STUB_LOG"`,
      `echo "ARGV=$@" >> "$BOARD_PRIME_STUB_LOG"`,
      `echo "AGENT_DIR=\${PRIME_AGENT_CODING_AGENT_DIR-unset}" >> "$BOARD_PRIME_STUB_LOG"`,
      `if [ "$1" = "mcp" ] && [ "$2" = "get" ]; then exit 1; fi`,
      "exit 0",
      "",
    ].join("\n"));
    await chmod(stub, 0o755);

    const savedPath = process.env.PATH;
    const savedStubLog = process.env.BOARD_PRIME_STUB_LOG;
    process.env.PATH = `${bin}:${savedPath ?? ""}`;
    process.env.BOARD_PRIME_STUB_LOG = stubLog;
    try {
      const result = await installRuntime({ ...options(home, "prime-agent"), projectRoot: project });
      expect(result.notices.join(" ")).toContain("Registered prime-agent MCP server");
      const lines = (await text(stubLog)).split("\n").filter(Boolean);
      // The executable actually selected is the PATH stub, never the child command.
      expect(lines.some((line) => line.startsWith("INVOKED=") && line.endsWith("/prime-agent"))).toBe(true);
      expect(lines).toContain("ARGV=mcp get board-prime-agent");
      const add = lines.find((line) => line.startsWith("ARGV=mcp add board-prime-agent "));
      expect(add).toBeDefined();
      // The child command is passed after `--`, not used as the CLI executable.
      expect(add).toContain(`-- ${process.execPath} ${join(project, "packages/mcp/src/index.ts")}`);
      // The pinned agent directory reaches the real child process.
      expect(lines).toContain(`AGENT_DIR=${join(home, ".prime", "agent")}`);
      // The decoy the shadowing shape would have executed was never invoked.
      expect(await Bun.file(decoyLog).exists()).toBe(false);
    } finally {
      restoreEnv("PATH", savedPath);
      restoreEnv("BOARD_PRIME_STUB_LOG", savedStubLog);
    }
  }, 30_000);
});

/**
 * `prime-agent` double that mirrors the fixture-verified 0.9.4 semantics of
 * `mcp get` / `mcp add [--force]` / `mcp remove` against a fixture
 * settings.json — including the real CLI's failure modes (re-add without
 * --force fails without mutation; remove is not idempotent) and messages.
 */
function fakePrimeAgent(settingsPath: string): { runner: PrimeRunner; calls: string[][] } {
  const calls: string[][] = [];
  const readRoot = async (): Promise<Record<string, unknown>> => {
    try {
      const parsed = JSON.parse(await readFile(settingsPath, "utf8"));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  };
  const readServers = async (): Promise<Record<string, unknown>> => {
    const servers = (await readRoot()).mcpServers;
    return servers && typeof servers === "object" && !Array.isArray(servers)
      ? servers as Record<string, unknown>
      : {};
  };
  const runner: PrimeRunner = async (_command, args) => {
    calls.push(args);
    if (args[0] === "mcp" && args[1] === "get") {
      if (args.length !== 3) return { exitCode: 1, stdout: "", stderr: "Error: Usage: mcp get <name>" };
      const name = args[2]!;
      return name in (await readServers())
        ? { exitCode: 0, stdout: `${name}: stdio`, stderr: "" }
        : { exitCode: 1, stdout: "", stderr: `Error: MCP server "${name}" was not found.` };
    }
    if (args[0] === "mcp" && args[1] === "add") {
      const separator = args.indexOf("--");
      const name = args[2] ?? "";
      const optionArgs = args.slice(3, separator === -1 ? undefined : separator);
      const force = optionArgs.includes("--force");
      const cwdFlag = args.indexOf("--cwd");
      const cwd = cwdFlag >= 0 ? args[cwdFlag + 1] : undefined;
      const [command, ...childArgs] = separator === -1 ? [] : args.slice(separator + 1);
      const servers = await readServers();
      const replaced = name in servers;
      if (replaced && !force) {
        // Verified 0.9.4 behavior: no mutation on a plain re-add.
        return {
          exitCode: 1, stdout: "",
          stderr: `Error: MCP server "${name}" already exists. Use --force to replace it.`,
        };
      }
      if (!command) return { exitCode: 1, stdout: "", stderr: "Error: A command is required after --." };
      const root = await readRoot();
      servers[name] = {
        type: "stdio", command, args: childArgs,
        ...(cwd === undefined ? {} : { cwd }),
      };
      root.mcpServers = servers;
      await put(settingsPath, JSON.stringify(root, null, 2) + "\n");
      return { exitCode: 0, stdout: `${replaced ? "Replaced" : "Added"} MCP server "${name}".`, stderr: "" };
    }
    if (args[0] === "mcp" && args[1] === "remove") {
      if (args.length !== 3) return { exitCode: 1, stdout: "", stderr: "Error: Usage: mcp remove <name>" };
      const name = args[2]!;
      const root = await readRoot();
      const servers = (root.mcpServers ?? {}) as Record<string, unknown>;
      if (!(name in servers)) {
        return { exitCode: 1, stdout: "", stderr: `Error: MCP server "${name}" was not found.` };
      }
      delete servers[name];
      // The real CLI keeps an empty mcpServers object after the last removal.
      root.mcpServers = servers;
      await put(settingsPath, JSON.stringify(root, null, 2) + "\n");
      return { exitCode: 0, stdout: `Removed MCP server "${name}".`, stderr: "" };
    }
    return { exitCode: 127, stdout: "", stderr: `unexpected prime-agent invocation: ${args.join(" ")}` };
  };
  return { runner, calls };
}

/**
 * Runner whose `mcp get` always reports the server present, independent of the
 * settings file. This isolates the read-only ownership gate: the gate must
 * fail closed on an unreadable, unparseable, missing or non-object settings
 * file even when the CLI probe claims the name exists.
 */
function presentProbeRunner(): { runner: PrimeRunner; calls: string[][] } {
  const calls: string[][] = [];
  const runner: PrimeRunner = async (_command, args) => {
    calls.push(args);
    if (args[0] === "mcp" && args[1] === "get") {
      return { exitCode: 0, stdout: "board-prime-agent: stdio", stderr: "" };
    }
    return { exitCode: 127, stdout: "", stderr: `unexpected prime-agent invocation: ${args.join(" ")}` };
  };
  return { runner, calls };
}

/**
 * Real `prime-agent` binary for disposable-HOME fixture tests, or null when
 * the host has no installation (tests skip, mirroring the python3 gate).
 * Prefers the PATH binary; falls back to the canonical fnm global layout run
 * under bun.
 */
async function realPrimeAgentCommand(): Promise<string[] | null> {
  const onPath = Bun.which("prime-agent");
  if (onPath) return [onPath];
  const versions = expandHome(join("~", ".local", "share", "fnm", "node-versions"));
  let bundle: string | null = null;
  try {
    for await (const entry of new Bun.Glob("*/installation/lib/node_modules/prime-agent/dist/bundle/cli.js").scan({
      cwd: versions, onlyFiles: true,
    })) bundle = entry;
  } catch {
    return null;
  }
  return bundle ? [process.execPath, join(versions, bundle)] : null;
}

function expandHome(value: string): string {
  return value.startsWith("~/") ? join(process.env.HOME ?? "~", value.slice(2)) : value;
}

/**
 * Fully explicit fixture environment. The host harness exports PRIME_AGENT_*
 * and PI_* variables; none of them may leak into a fixture run, so nothing is
 * inherited from process.env beyond PATH.
 */
function primeFixtureEnv(home: string): Record<string, string> {
  return {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    HOME: home,
    TMPDIR: home,
  };
}

/** PrimeRunner that spawns the real binary inside a disposable HOME. */
function realPrimeRunner(
  command: string[],
  home: string,
  extraEnv: Record<string, string> = {},
): PrimeRunner {
  return async (_executable, args) => {
    const child = Bun.spawn([...command, ...args], {
      cwd: home,
      env: { ...primeFixtureEnv(home), ...extraEnv },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { exitCode, stdout, stderr };
  };
}

describe("prime-agent runtime against the real prime-agent CLI (disposable HOME)", () => {
  let command: string[] | null = null;
  beforeAll(async () => {
    command = await realPrimeAgentCommand();
  });
  const primeSettings = (home: string) => join(home, ".prime", "agent", "settings.json");

  test("registers, updates and removes the board MCP server end-to-end", async () => {
    if (!command) return; // no local prime-agent installation; scripteds tests cover the contract
    const home = await fixture();
    const settingsPath = primeSettings(home);
    const runner = realPrimeRunner(command, home);
    // Seed a foreign server and key: install/uninstall must preserve both.
    await put(settingsPath, JSON.stringify({
      other: true,
      mcpServers: { keepme: { type: "stdio", command: "/bin/echo", args: ["keep"] } },
    }, null, 2) + "\n");

    const installOptions = () => ({ ...options(home, "prime-agent"), primeRunner: runner });
    const first = await installRuntime(installOptions());
    expect(first.notices.join(" ")).toContain("Registered prime-agent MCP server");
    const stored = JSON.parse(await text(settingsPath));
    expect(stored.other).toBe(true);
    expect(stored.mcpServers.keepme).toBeDefined();
    expect(stored.mcpServers["board-prime-agent"].command).toBe(process.execPath);
    expect(stored.mcpServers["board-prime-agent"].cwd).toBe(projectRoot);
    expect(stored.mcpServers["board-prime-agent"].args).toContain("fs:/shared/board");
    // Exact-name discovery against the real CLI (mcp get exit-code probe).
    expect(await runner(DEFAULT_PRIME_AGENT_COMMAND, primeMcpGetArgs("board-prime-agent"))).toMatchObject({
      exitCode: 0,
    });
    expect(await runner(DEFAULT_PRIME_AGENT_COMMAND, primeMcpGetArgs("board-missing"))).toMatchObject({
      exitCode: 1,
    });

    // Update path: changed board arguments must reach the stored definition
    // via the verified --force replace.
    const updated = await installRuntime({ ...installOptions(), board: "general-2" });
    expect(updated.notices.join(" ")).toContain("--force");
    const updatedServers = JSON.parse(await text(settingsPath)).mcpServers;
    expect(updatedServers["board-prime-agent"].args).toContain("general-2");
    // "general" must be gone even though "general-2" shares its prefix.
    expect(updatedServers["board-prime-agent"].args).not.toContain("general");
    expect(Object.keys(updatedServers).sort()).toEqual(["board-prime-agent", "keepme"]);

    // Uninstall removes the entry through the verified mcp remove; a second
    // uninstall is a no-op; the foreign state survives everything.
    await installRuntime({ ...uninstallOptions(home, "prime-agent"), primeRunner: runner });
    expect(await runner(DEFAULT_PRIME_AGENT_COMMAND, primeMcpGetArgs("board-prime-agent"))).toMatchObject({
      exitCode: 1,
    });
    const afterUninstall = JSON.parse(await text(settingsPath));
    expect(afterUninstall.mcpServers).toEqual({ keepme: { type: "stdio", command: "/bin/echo", args: ["keep"] } });
    expect(afterUninstall.other).toBe(true);
    const again = await installRuntime({ ...uninstallOptions(home, "prime-agent"), primeRunner: runner });
    expect(again.changes).toEqual([]);
    expect(again.notices).toEqual([]);
  }, 30_000);

  test("exercises the verified get/add/remove semantics against seeded fixture settings", async () => {
    if (!command) return;
    const home = await fixture();
    const settingsPath = primeSettings(home);
    const runner = realPrimeRunner(command, home);
    await put(settingsPath, JSON.stringify({
      unrelated: "keep",
      mcpServers: { keepme: { type: "stdio", command: "/bin/echo" } },
    }, null, 2) + "\n");

    // get-missing exits 1 with the binary's own message.
    const missing = await runner(DEFAULT_PRIME_AGENT_COMMAND, primeMcpGetArgs("board-probe"));
    expect(missing.exitCode).toBe(1);
    expect(missing.stderr).toContain('MCP server "board-probe" was not found.');

    // add (absent) → Added; get-present exits 0.
    const add = await runner(DEFAULT_PRIME_AGENT_COMMAND, primeMcpAddArgs({
      name: "board-probe", childCommand: "/bin/echo", args: ["hi"], cwd: home,
    }));
    expect(add).toMatchObject({ exitCode: 0 });
    expect(add.stdout).toContain('Added MCP server "board-probe"');
    expect(await runner(DEFAULT_PRIME_AGENT_COMMAND, primeMcpGetArgs("board-probe"))).toMatchObject({ exitCode: 0 });

    // Re-add WITHOUT --force exits 1 and leaves the stored definition as-is.
    const beforeReAdd = await text(settingsPath);
    const reAdd = await runner(DEFAULT_PRIME_AGENT_COMMAND, primeMcpAddArgs({
      name: "board-probe", childCommand: "/bin/echo", args: ["changed"],
    }));
    expect(reAdd.exitCode).toBe(1);
    expect(reAdd.stderr).toContain("already exists. Use --force to replace it.");
    expect(JSON.parse(await text(settingsPath)).mcpServers["board-probe"].args).toEqual(["hi"]);
    expect(await text(settingsPath)).toBe(beforeReAdd);

    // add --force replaces the whole definition (fields not passed are gone).
    const replace = await runner(DEFAULT_PRIME_AGENT_COMMAND, primeMcpAddArgs({
      name: "board-probe", childCommand: "/bin/echo", args: ["replaced"], force: true,
    }));
    expect(replace.exitCode).toBe(0);
    expect(replace.stdout).toContain('Replaced MCP server "board-probe"');
    const replaced = JSON.parse(await text(settingsPath)).mcpServers["board-probe"];
    expect(replaced.args).toEqual(["replaced"]);
    expect(replaced.cwd).toBeUndefined();

    // remove: exit 0 once, then exit 1 (not idempotent); foreign state intact.
    const remove = await runner(DEFAULT_PRIME_AGENT_COMMAND, primeMcpRemoveArgs("board-probe"));
    expect(remove.exitCode).toBe(0);
    expect(remove.stdout).toContain('Removed MCP server "board-probe"');
    expect(await runner(DEFAULT_PRIME_AGENT_COMMAND, primeMcpGetArgs("board-probe"))).toMatchObject({ exitCode: 1 });
    const removeAgain = await runner(DEFAULT_PRIME_AGENT_COMMAND, primeMcpRemoveArgs("board-probe"));
    expect(removeAgain.exitCode).toBe(1);
    expect(removeAgain.stderr).toContain('was not found');

    // Re-add after remove works as a plain add again.
    const reAddAfterRemove = await runner(DEFAULT_PRIME_AGENT_COMMAND, primeMcpAddArgs({
      name: "board-probe", childCommand: "/bin/echo", args: ["back"],
    }));
    expect(reAddAfterRemove.exitCode).toBe(0);
    const root = JSON.parse(await text(settingsPath));
    expect(root.mcpServers["board-probe"].args).toEqual(["back"]);
    expect(root.mcpServers.keepme).toEqual({ type: "stdio", command: "/bin/echo" });
    expect(root.unrelated).toBe("keep");
  }, 30_000);

  test("installs the wrapper as a discoverable Python skill package (verified discovery layout)", async () => {
    if (!command) return;
    const home = await fixture();
    const settingsPath = primeSettings(home);
    const runner = realPrimeRunner(command, home);
    await installRuntime({ ...options(home, "prime-agent"), primeRunner: runner });
    const skillDir = join(home, ".prime", "agent", "skills", "board");
    const skillMd = await text(join(skillDir, "SKILL.md"));
    // dist/core/skills.js discovery requirements: frontmatter description is
    // required, name must equal the parent directory name.
    expect(skillMd).toMatch(/^---\nname: board\ndescription: .+\n---/s);
    expect(skillMd).toContain("Rendered by the sidekick board CLI for author");
    const pyproject = await text(join(skillDir, "pyproject.toml"));
    expect(pyproject).toContain('name = "board"');
    expect(pyproject).toContain("hatchling");
    const moduleSource = await text(join(skillDir, "src", "board", "__init__.py"));
    expect(moduleSource).toBe(renderPrimeMcpSkill({ server: "board-prime-agent", board: "general", author: "prime-agent" }));
    // And the real CLI round-trip: uninstall removes package + server again.
    await installRuntime({ ...uninstallOptions(home, "prime-agent"), primeRunner: runner });
    expect(await Bun.file(skillDir).exists()).toBe(false);
    expect(JSON.parse(await text(settingsPath)).mcpServers).toEqual({});
  }, 30_000);

  test("honors PRIME_AGENT_CODING_AGENT_DIR end-to-end against the real CLI", async () => {
    if (!command) return;
    const home = await fixture();
    const overrideDir = join(await fixture(), "agent-override");
    const overrideSettings = join(overrideDir, "settings.json");
    const runner = realPrimeRunner(command, home, { [PRIME_AGENT_DIR_ENV]: overrideDir });
    // A foreign entry in the override directory is refused: with the override
    // set, the ownership gate reads the file the real CLI actually mutates.
    const foreign = JSON.stringify({
      mcpServers: { "board-prime-agent": { type: "stdio", command: "someone-else" } },
    }, null, 2) + "\n";
    await put(overrideSettings, foreign);
    restoreEnv(PRIME_AGENT_DIR_ENV, overrideDir);
    await expect(installRuntime({ ...options(home, "prime-agent"), primeRunner: runner }))
      .rejects.toThrow("refusing to replace non-board prime-agent MCP server");
    expect(await text(overrideSettings)).toBe(foreign);
    // The real CLI confirms the override is the directory it reads: `mcp get`
    // finds the foreign entry there.
    expect(await runner(DEFAULT_PRIME_AGENT_COMMAND, primeMcpGetArgs("board-prime-agent")))
      .toMatchObject({ exitCode: 0 });

    // An owned install now lands in the override directory (settings + skill
    // package); the default home is never touched.
    await put(overrideSettings, JSON.stringify({ mcpServers: {} }, null, 2) + "\n");
    await installRuntime({ ...options(home, "prime-agent"), primeRunner: runner });
    expect(JSON.parse(await text(overrideSettings)).mcpServers["board-prime-agent"].args)
      .toContain("fs:/shared/board");
    expect(await Bun.file(join(overrideDir, "skills", "board", "SKILL.md")).exists()).toBe(true);
    expect(await Bun.file(join(home, ".prime", "agent", "settings.json")).exists()).toBe(false);
  }, 30_000);
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function presenceClock() {
  let now = 1_000_000;
  let unrefs = 0;
  const timers = new Map<object, { tick: () => Promise<void>; ms: number; next: number }>();
  return {
    now: () => now,
    timers,
    get unrefs() { return unrefs; },
    setInterval(tick: () => Promise<void>, ms: number) {
      const timer = { unref: () => { unrefs++; } };
      timers.set(timer, { tick, ms, next: now + ms });
      return timer;
    },
    clearInterval(timer: object) { timers.delete(timer); },
    async advance(ms: number) {
      const target = now + ms;
      for (;;) {
        const next = [...timers.values()].sort((a, b) => a.next - b.next)[0];
        if (!next || next.next > target) break;
        now = next.next;
        next.next += next.ms;
        await next.tick();
      }
      now = target;
    },
  };
}

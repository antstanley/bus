import { afterEach, describe, expect, test } from "bun:test";
import { chmod, lstat, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { installRuntime, renderInstallDiff, type InstallOptions } from "../src/install.ts";
import { openCodeSessionRegistryPath, runCli } from "../src/index.ts";
import { Board } from "@board/core";
import { FsStore } from "@board/store-fs";
import { who } from "@board/presence";

const roots: string[] = [];
const projectRoot = join(import.meta.dir, "../../..");

afterEach(async () => {
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
    const plugin = await module.BoardPlugin({ serverUrl: new URL("http://127.0.0.1:4096/") });
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
      const output = { system: [] as string[] };
      await plugin["experimental.chat.system.transform"]({ sessionID: "session-123" }, output);
      expect(output.system).toEqual(["injected by fake hook\n"]);
      expect(JSON.parse(await text(capturePath))).toEqual({
        awsProfile: "task113-profile",
        home: process.env.HOME,
      });
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

  test("Letta is a no-write pointer to the mod/server and legacy-hook tasks", async () => {
    const home = await fixture();
    const result = await installRuntime(options(home, "letta"));
    expect(result.changes).toEqual([]);
    expect(result.notices.join(" ")).toContain("task 107");
    expect(result.notices.join(" ")).toContain("task 111");
    expect(await Bun.file(join(home, ".letta", "settings.json")).exists()).toBe(false);
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
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_PRIME_AGENT_COMMAND,
  PRIME_AGENT_RUNTIME,
  PRIME_DELIVERY_METHOD,
  PRIME_SKILL_NAME,
  addPrimeMcpServer,
  defaultPrimeDaemonSocket,
  isPrimeAgentTarget,
  primeDaemonStatus,
  primeDeliveryKey,
  primeDeliveryMethod,
  primeMcpAddArgs,
  primeMcpGetArgs,
  primeMcpRemoveArgs,
  primeMcpServerInstalled,
  removePrimeMcpServer,
  renderPrimeMcpSkill,
  renderPrimeSkillPackage,
  primeRunnerFromRunCommand,
  primeSendArgs,
  primeStatusArgs,
  sendPrimeMessage,
  type PrimeDaemonStatus,
  type PrimeRunner,
  type PrimeRunResult,
} from "../src/prime-agent.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "board-prime-agent-"));
  roots.push(root);
  return root;
}

/** Runner that records argv and replays scripted results. */
function scriptedRunner(steps: PrimeRunResult[], log: Array<{ command: string; args: string[] }> = []): PrimeRunner {
  let next = 0;
  return async (command, args) => {
    log.push({ command, args });
    const step = steps[next];
    next += 1;
    return step ?? { exitCode: 0, stdout: "", stderr: "" };
  };
}

const ok: PrimeRunResult = { exitCode: 0, stdout: "", stderr: "" };

describe("primeSendArgs", () => {
  test("uses the live-confirmed plain grammar by default", () => {
    expect(primeSendArgs({ target: "a1b2c3d4e5f6", message: "Run board read." })).toEqual([
      "send", "a1b2c3d4e5f6", "Run board read.",
    ]);
  });

  test("emits parse-verified flags before the target", () => {
    expect(primeSendArgs({ target: "agent1", message: "hi", from: "board", json: true })).toEqual([
      "send", "--from", "board", "--json", "agent1", "hi",
    ]);
  });

  test("emits unverified flags only on explicit opt-in", () => {
    // --steer and --follow-up are REJECTED by installed 0.9.4; default path must omit them.
    const defaulted = primeSendArgs({ target: "agent1", message: "hi" });
    expect(defaulted).not.toContain("--steer");
    expect(defaulted).not.toContain("--follow-up");
    expect(primeSendArgs({ target: "agent1", message: "hi", steer: true, followUp: true })).toEqual([
      "send", "--steer", "--follow-up", "agent1", "hi",
    ]);
  });

  test("separates a message starting with - with --", () => {
    expect(primeSendArgs({ target: "agent1", message: "--steer looks like a flag" })).toEqual([
      "send", "agent1", "--", "--steer looks like a flag",
    ]);
  });

  test("rejects empty messages and invalid targets/senders", () => {
    expect(() => primeSendArgs({ target: "agent1", message: "" })).toThrow();
    expect(() => primeSendArgs({ target: "bad target", message: "hi" })).toThrow();
    expect(() => primeSendArgs({ target: "agent1", message: "hi", from: "-bad-sender" })).toThrow();
  });

  test("target rule accepts daemon ids and board names only", () => {
    expect(isPrimeAgentTarget("cdc5128bf5c1")).toBe(true);
    expect(isPrimeAgentTarget("essun")).toBe(true);
    expect(isPrimeAgentTarget("has space")).toBe(false);
    expect(isPrimeAgentTarget("-leading")).toBe(false);
    expect(isPrimeAgentTarget("x".repeat(257))).toBe(false);
  });
});

describe("sendPrimeMessage", () => {
  test("returns true on exit 0 and passes the exact argv to the runner", async () => {
    const log: Array<{ command: string; args: string[] }> = [];
    const runner = scriptedRunner([ok], log);
    const delivered = await sendPrimeMessage({ target: "agent1", message: "wake", runner });
    expect(delivered).toBe(true);
    expect(log).toEqual([{ command: DEFAULT_PRIME_AGENT_COMMAND, args: ["send", "agent1", "wake"] }]);
  });

  test("returns false when the daemon rejects the target (unknown active session)", async () => {
    const runner = scriptedRunner([{ exitCode: 1, stdout: "", stderr: "Error: Unknown active session: agent1" }]);
    expect(await sendPrimeMessage({ target: "agent1", message: "wake", runner })).toBe(false);
  });

  test("honors a custom executable", async () => {
    const log: Array<{ command: string; args: string[] }> = [];
    const runner = scriptedRunner([ok], log);
    await sendPrimeMessage({ target: "agent1", message: "wake", command: "/opt/bin/prime-agent", runner });
    expect(log[0]?.command).toBe("/opt/bin/prime-agent");
  });
});

describe("primeMcpAddArgs", () => {
  test("uses the verified stdio grammar with a -- separator", () => {
    expect(primeMcpAddArgs({ name: "board", childCommand: "bun", args: ["mcp.ts", "--store", "fs:/shared"] })).toEqual([
      "mcp", "add", "board", "--", "bun", "mcp.ts", "--store", "fs:/shared",
    ]);
  });

  test("emits --cwd and sorted --env pairs before the separator", () => {
    expect(primeMcpAddArgs({
      name: "board",
      childCommand: "bun",
      args: ["mcp.ts"],
      cwd: "/repo",
      childEnv: { BOARD_AS: "essun", PATH_EXTRA: "/bin" },
    })).toEqual([
      "mcp", "add", "board", "--cwd", "/repo", "--env", "BOARD_AS=essun", "--env", "PATH_EXTRA=/bin",
      "--", "bun", "mcp.ts",
    ]);
  });

  test("emits --force only on explicit opt-in", () => {
    const defaulted = primeMcpAddArgs({ name: "board", childCommand: "bun" });
    expect(defaulted).not.toContain("--force");
    expect(primeMcpAddArgs({ name: "board", childCommand: "bun", force: true })).toContain("--force");
  });

  test("rejects invalid server names and empty commands", () => {
    expect(() => primeMcpAddArgs({ name: "Bad Name", childCommand: "bun" })).toThrow();
    expect(() => primeMcpAddArgs({ name: "board", childCommand: "" })).toThrow();
    expect(primeMcpGetArgs("board-essun")).toEqual(["mcp", "get", "board-essun"]);
    expect(() => primeMcpGetArgs("no exclamation!")).toThrow();
  });
});

describe("addPrimeMcpServer", () => {
  test("installs when the probe reports absent", async () => {
    const log: Array<{ command: string; args: string[] }> = [];
    const runner = scriptedRunner([
      { exitCode: 1, stdout: "", stderr: 'Error: MCP server "board" was not found.' },
      ok,
    ], log);
    const result = await addPrimeMcpServer({ name: "board", childCommand: "bun", args: ["mcp.ts"], runner });
    expect(result.status).toBe("installed");
    expect(result.present).toBe(false);
    expect(log.map((call) => call.args.slice(0, 2).join(" "))).toEqual(["mcp get", "mcp add"]);
    expect(log[1]?.args).toEqual(primeMcpAddArgs({ name: "board", childCommand: "bun", args: ["mcp.ts"] }));
  });

  test("skips the add when already installed", async () => {
    const log: Array<{ command: string; args: string[] }> = [];
    const runner = scriptedRunner([ok], log);
    const result = await addPrimeMcpServer({ name: "board", childCommand: "bun", runner });
    expect(result).toEqual({ status: "already-installed", present: true, addArgs: [] });
    expect(log).toHaveLength(1);
    expect(log[0]?.args).toEqual(primeMcpGetArgs("board"));
  });

  test("force re-adds an existing name with --force", async () => {
    const log: Array<{ command: string; args: string[] }> = [];
    const runner = scriptedRunner([ok, ok], log);
    const result = await addPrimeMcpServer({ name: "board", childCommand: "bun", force: true, runner });
    expect(result.status).toBe("installed");
    expect(result.present).toBe(true);
    expect(log[1]?.args).toContain("--force");
  });

  test("reports failed when the add exits nonzero", async () => {
    const runner = scriptedRunner([
      { exitCode: 1, stdout: "", stderr: 'Error: MCP server "board" was not found.' },
      { exitCode: 2, stdout: "", stderr: "boom" },
    ]);
    const result = await addPrimeMcpServer({ name: "board", childCommand: "bun", runner });
    expect(result.status).toBe("failed");
  });

  test("update re-adds an existing name with the verified --force replace", async () => {
    const log: Array<{ command: string; args: string[] }> = [];
    const runner = scriptedRunner([ok, ok], log);
    const result = await addPrimeMcpServer({ name: "board", childCommand: "bun", args: ["mcp.ts"], update: true, runner });
    expect(result.status).toBe("installed");
    expect(result.present).toBe(true);
    expect(log.map((call) => call.args.slice(0, 2).join(" "))).toEqual(["mcp get", "mcp add"]);
    expect(log[1]?.args).toContain("--force");
  });

  test("update adds without --force when the probe reports the name absent", async () => {
    const log: Array<{ command: string; args: string[] }> = [];
    const runner = scriptedRunner([
      { exitCode: 1, stdout: "", stderr: 'Error: MCP server "board" was not found.' },
      ok,
    ], log);
    const result = await addPrimeMcpServer({ name: "board", childCommand: "bun", update: true, runner });
    expect(result.status).toBe("installed");
    expect(result.present).toBe(false);
    expect(log[1]?.args).not.toContain("--force");
    expect(log[1]?.args).toEqual(primeMcpAddArgs({ name: "board", childCommand: "bun" }));
  });

  test("primeMcpRemoveArgs uses the verified exact-arity grammar", () => {
    expect(primeMcpRemoveArgs("board-essun")).toEqual(["mcp", "remove", "board-essun"]);
    expect(() => primeMcpRemoveArgs("bad name")).toThrow();
  });

  test("runs the mutation authorizer after the probe and aborts before the add", async () => {
    const log: Array<{ command: string; args: string[] }> = [];
    const runner = scriptedRunner([ok, ok], log);
    const seen: boolean[] = [];
    await expect(addPrimeMcpServer({
      name: "board", childCommand: "bun", update: true, runner,
      authorize: (present) => { seen.push(present); throw new Error("refused replace"); },
    })).rejects.toThrow("refused replace");
    expect(seen).toEqual([true]);
    expect(log.map((call) => call.args.slice(0, 2).join(" "))).toEqual(["mcp get"]);
  });

  test("does not call the authorizer when the entry is already installed", async () => {
    let authorized = 0;
    const runner = scriptedRunner([ok]);
    const result = await addPrimeMcpServer({
      name: "board", childCommand: "bun", runner,
      authorize: () => { authorized += 1; },
    });
    expect(result.status).toBe("already-installed");
    expect(authorized).toBe(0);
  });

  test("authorizes a plain add after an absent probe", async () => {
    const seen: boolean[] = [];
    const runner = scriptedRunner([{ exitCode: 1, stdout: "", stderr: "was not found" }, ok]);
    const result = await addPrimeMcpServer({
      name: "board", childCommand: "bun", runner,
      authorize: (present) => { seen.push(present); },
    });
    expect(result.status).toBe("installed");
    expect(seen).toEqual([false]);
  });
});

describe("removePrimeMcpServer", () => {
  test("skips the remove when the probe reports the server absent", async () => {
    const log: Array<{ command: string; args: string[] }> = [];
    const runner = scriptedRunner([{ exitCode: 1, stdout: "", stderr: 'Error: MCP server "board" was not found.' }], log);
    const result = await removePrimeMcpServer("board", { runner });
    expect(result).toEqual({ status: "not-present", present: false, removeArgs: [] });
    expect(log).toHaveLength(1);
    expect(log[0]?.args).toEqual(primeMcpGetArgs("board"));
  });

  test("removes a present server with the verified argv and reports success", async () => {
    const log: Array<{ command: string; args: string[] }> = [];
    const runner = scriptedRunner([ok, ok], log);
    const result = await removePrimeMcpServer("board-essun", { runner });
    expect(result).toEqual({ status: "removed", present: true, removeArgs: ["mcp", "remove", "board-essun"] });
    expect(log.map((call) => call.args.slice(0, 2).join(" "))).toEqual(["mcp get", "mcp remove"]);
  });

  test("reports failed when the remove exits nonzero despite presence", async () => {
    const runner = scriptedRunner([ok, { exitCode: 2, stdout: "", stderr: "boom" }]);
    expect(await removePrimeMcpServer("board", { runner })).toMatchObject({ status: "failed", present: true });
  });

  test("runs the mutation authorizer before the remove and aborts on refusal", async () => {
    const log: Array<{ command: string; args: string[] }> = [];
    const runner = scriptedRunner([ok, ok], log);
    await expect(removePrimeMcpServer("board-essun", {
      runner,
      authorize: () => { throw new Error("refused remove"); },
    })).rejects.toThrow("refused remove");
    expect(log.map((call) => call.args.slice(0, 2).join(" "))).toEqual(["mcp get"]);
  });

  test("does not call the authorizer when the remove probe reports absent", async () => {
    let authorized = 0;
    const runner = scriptedRunner([{ exitCode: 1, stdout: "", stderr: "was not found" }]);
    const result = await removePrimeMcpServer("board-essun", { runner, authorize: () => { authorized += 1; } });
    expect(result.status).toBe("not-present");
    expect(authorized).toBe(0);
  });
});

describe("primeMcpServerInstalled", () => {
  test("maps the probe exit codes", async () => {
    expect(await primeMcpServerInstalled("board", { runner: scriptedRunner([ok]) })).toBe(true);
    expect(await primeMcpServerInstalled("board", {
      runner: scriptedRunner([{ exitCode: 1, stdout: "", stderr: "was not found" }]),
    })).toBe(false);
  });

  test("fails loudly on any probe exit other than 0 or 1 (G1 R2 NEW-2)", async () => {
    await expect(primeMcpServerInstalled("board", {
      runner: scriptedRunner([{ exitCode: 2, stdout: "", stderr: "boom" }]),
    })).rejects.toThrow("cannot distinguish presence from failure");
    await expect(primeMcpServerInstalled("board", {
      runner: scriptedRunner([{ exitCode: 255, stdout: "", stderr: "crash" }]),
    })).rejects.toThrow("cannot distinguish presence from failure");
  });
});

describe("primeDaemonStatus", () => {
  const statuses: PrimeDaemonStatus[] = [{
    socketPath: "/tmp/prime-agent-501/daemon.sock",
    pid: 22028,
    version: "0.9.4",
    protocolVersion: 7,
    isDefault: true,
    sessionCount: 2,
    status: "current",
  }];

  test("requests status --json and parses the verified array shape", async () => {
    const log: Array<{ command: string; args: string[] }> = [];
    const runner = scriptedRunner([{ exitCode: 0, stdout: JSON.stringify(statuses), stderr: "" }], log);
    const parsed = await primeDaemonStatus({ runner });
    expect(log[0]?.args).toEqual(primeStatusArgs());
    expect(parsed).toHaveLength(1);
    expect(parsed?.[0]?.socketPath).toBe("/tmp/prime-agent-501/daemon.sock");
    expect(parsed?.[0]?.isDefault).toBe(true);
  });

  test("returns null on failure or unparseable output", async () => {
    expect(await primeDaemonStatus({ runner: scriptedRunner([{ exitCode: 1, stdout: "", stderr: "down" }]) })).toBeNull();
    expect(await primeDaemonStatus({ runner: scriptedRunner([{ exitCode: 0, stdout: "not json", stderr: "" }]) })).toBeNull();
    expect(await primeDaemonStatus({ runner: scriptedRunner([{ exitCode: 0, stdout: '{"sessions":[]}', stderr: "" }]) })).toBeNull();
  });
});

describe("delivery-target naming", () => {
  test("key and method follow the existing delivery conventions", () => {
    expect(primeDeliveryKey("cdc5128bf5c1")).toBe(`${PRIME_AGENT_RUNTIME}\0cdc5128bf5c1`);
    expect(primeDeliveryMethod()).toBe(PRIME_DELIVERY_METHOD);
    expect(() => primeDeliveryKey("bad key")).toThrow();
  });
});

describe("defaultPrimeDaemonSocket", () => {
  test("joins TMPDIR, the uid directory and daemon.sock", () => {
    expect(defaultPrimeDaemonSocket("/var/folders/xx/T/", 501)).toBe("/var/folders/xx/T/prime-agent-501/daemon.sock");
    expect(defaultPrimeDaemonSocket("/tmp", 0)).toBe("/tmp/prime-agent-0/daemon.sock");
  });
});

describe("primeRunnerFromRunCommand", () => {
  test("adapts the CliDependencies.runCommand shape", async () => {
    const runner = primeRunnerFromRunCommand(async (command, args) => (command === "prime-agent" && args[0] === "send" ? 0 : 3));
    expect(await runner("prime-agent", ["send", "a", "m"])).toEqual({ exitCode: 0, stdout: "", stderr: "" });
    expect(await runner("other", [])).toEqual({ exitCode: 3, stdout: "", stderr: "" });
  });
});

describe("default spawn path", () => {
  test("runs a fixture executable and captures its argv", async () => {
    const root = await fixture();
    const logPath = join(root, "argv.log");
    const scriptPath = join(root, "fake-prime-agent");
    await writeFile(scriptPath, "#!/bin/sh\nprintf '%s\\n' \"$\@\" >> \"$FIXTURE_LOG\"\n", { mode: 0o755 });
    await chmod(scriptPath, 0o755);
    const delivered = await sendPrimeMessage({
      target: "agent1",
      message: "wake",
      command: scriptPath,
      env: { FIXTURE_LOG: logPath },
      timeoutMs: 5_000,
    });
    expect(delivered).toBe(true);
    const logged = await readFile(logPath, "utf8");
    expect(logged.split("\n").filter(Boolean)).toEqual(["send", "agent1", "wake"]);
  });

  test("returns false for an unresolvable executable", async () => {
    expect(await sendPrimeMessage({
      target: "agent1",
      message: "wake",
      command: join(await fixture(), "does-not-exist"),
    })).toBe(false);
  });

});

/** /usr/bin/python3 on this host; the checks for the rendered wrapper mandate it. */
const PYTHON = "/usr/bin/python3";

/**
 * Disposable stdlib-only driver that executes a rendered wrapper against a
 * fake facade. Modes: "bindings" (constants), "behavior" (facade via
 * __main__), "fallback" (facade via sys.modules["mcp"]), "no-facade"
 * (graceful failure). No kernel imports, no network, no live state.
 */
const PY_DRIVER = `
import asyncio
import importlib.util
import sys

WRAPPER = sys.argv[1]
MISSING = "MCP server '{}' is not declared in user settings"


class Facade:
    """Mirrors the verified rlm.mcp surface, raising for undeclared servers."""

    def __init__(self):
        self.calls = []

    def _check(self, server):
        self.calls.append(server)
        if server != "board-essun":
            raise KeyError(MISSING.format(server))

    async def list_tools(self, server):
        self._check(server)
        return [{"name": "board_read", "description": "read", "inputSchema": {"type": "object"}}]

    async def call_tool(self, server, tool, arguments=None):
        self._check(server)
        # The real registry normalizes arguments or {} before dispatch.
        return {"ok": True, "server": server, "tool": tool, "arguments": arguments or {}}

    async def reload(self, server=None):
        self._check(server)
        return None


def load():
    spec = importlib.util.spec_from_file_location("board_skill", WRAPPER)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


async def scenario():
    mod = load()
    tools = await mod.list_tools()
    assert tools == [{"name": "board_read", "description": "read", "inputSchema": {"type": "object"}}]
    expected = {"ok": True, "server": "board-essun", "tool": "board_read",
                "arguments": {"limit": 5}}
    assert await mod.call_tool("board_read", {"limit": 5}) == expected
    assert await mod.call_tool("board_read") == {**expected, "arguments": {}}
    await mod.reload()
    for bad in [("",), (None,), ("x", 5)]:
        try:
            await mod.call_tool(*bad)
        except TypeError:
            pass
        else:
            raise AssertionError("expected TypeError for %r" % (bad,))
    # Facade receives exactly the configured server name on every call.
    assert all(call == "board-essun" for call in facade.calls), facade.calls
    # Renamed/removed server: the wrapper surfaces the facade KeyError as-is.
    mod.SERVER = "renamed-board"
    try:
        await mod.list_tools()
    except KeyError as exc:
        # KeyError repr-quotes in str(); args[0] is the facade's message.
        assert MISSING.format("renamed-board") == exc.args[0], exc.args[0]
    else:
        raise AssertionError("expected KeyError for a renamed server")
    # No stale binding: calls resolve SERVER again on every use.
    mod.SERVER = "board-essun"
    assert (await mod.list_tools())[0]["name"] == "board_read"
    print("BEHAVIOR_OK", len(facade.calls))


def main():
    mode = sys.argv[2]
    global facade
    facade = Facade()
    if mode in ("behavior", "fallback"):
        if mode == "behavior":
            sys.modules["__main__"].mcp = facade
        else:
            sys.modules["mcp"] = facade
        asyncio.run(scenario())
    elif mode == "no-facade":
        sys.modules.pop("mcp", None)
        mod = load()
        try:
            asyncio.run(mod.list_tools())
        except RuntimeError as exc:
            assert "Prime MCP facade not found" in str(exc), str(exc)
            print("NO_FACADE_OK")
        else:
            raise AssertionError("expected RuntimeError without a facade")
    elif mode == "bindings":
        mod = load()
        assert mod.SERVER == sys.argv[3], mod.SERVER
        assert mod.BOARD == sys.argv[4], mod.BOARD
        assert mod.AUTHOR == sys.argv[5], mod.AUTHOR
        print("BINDINGS_OK", mod.SERVER, mod.BOARD, mod.AUTHOR)
    else:
        raise AssertionError("unknown mode %r" % mode)


main()
`;

describe("renderPrimeMcpSkill", () => {
  const options = { server: "board-essun", board: "team", author: "essun" };

  test("renders a deterministic wrapper for identical options", () => {
    expect(renderPrimeMcpSkill({ ...options })).toBe(renderPrimeMcpSkill({ ...options }));
    expect(renderPrimeMcpSkill({ ...options, author: "nassun" }))
      .not.toBe(renderPrimeMcpSkill({ ...options }));
  });

  test("binds exactly the configured server, board and author", () => {
    const source = renderPrimeMcpSkill(options);
    expect(source).toMatch(/^SERVER = "board-essun"$/m);
    expect(source).toMatch(/^BOARD = "team"$/m);
    expect(source).toMatch(/^AUTHOR = "essun"$/m);
    // Every call goes through the facade with the configured SERVER constant.
    expect(source).toContain("await _mcp().list_tools(SERVER)");
    expect(source).toContain("await _mcp().call_tool(SERVER, name, arguments)");
    expect(source).toContain("await _mcp().reload(SERVER)");
    // Pin the multi-line facade check so template-literal escapes can never
    // silently reformat the rendered Python.
    expect(source).toContain(
      'mod is not None\n            and callable(getattr(mod, "list_tools", None))\n'
      + '            and callable(getattr(mod, "call_tool", None))\n        ):'
    );
  });

  test("rejects names failing the board name rule", () => {
    expect(() => renderPrimeMcpSkill({ ...options, server: "Bad Name" })).toThrow();
    expect(() => renderPrimeMcpSkill({ ...options, board: "" })).toThrow();
    expect(() => renderPrimeMcpSkill({ ...options, author: "-nope" })).toThrow();
    expect(() => renderPrimeMcpSkill({ ...options, author: "x".repeat(33) })).toThrow();
  });

  test("renders syntactically valid Python (py_compile)", async () => {
    const root = await fixture();
    const wrapperPath = join(root, "board.py");
    await writeFile(wrapperPath, renderPrimeMcpSkill(options));
    const proc = Bun.spawnSync([PYTHON, "-m", "py_compile", wrapperPath], { cwd: root });
    expect(proc.stderr.toString()).toBe("");
    expect(proc.exitCode).toBe(0);
  });

  test("compiled wrapper binds the configured names, calls the facade and fails gracefully", async () => {
    const root = await fixture();
    const wrapperPath = join(root, "board.py");
    const driverPath = join(root, "driver.py");
    await writeFile(wrapperPath, renderPrimeMcpSkill(options));
    await writeFile(driverPath, PY_DRIVER);
    const run = (mode: string) =>
      Bun.spawnSync([PYTHON, driverPath, wrapperPath, mode, options.server, options.board, options.author], {
        cwd: root,
      });
    const bindings = run("bindings");
    expect(bindings.exitCode).toBe(0);
    expect(bindings.stdout.toString()).toBe(`BINDINGS_OK board-essun team essun\n`);

    const behavior = run("behavior");
    expect(behavior.stderr.toString()).toBe("");
    expect(behavior.exitCode).toBe(0);
    expect(behavior.stdout.toString()).toContain("BEHAVIOR_OK");

    // Facade reachable only as sys.modules["mcp"] (alternate kernel wiring).
    expect(run("fallback").stdout.toString()).toContain("BEHAVIOR_OK");

    // No facade at all: clear RuntimeError, not a confusing AttributeError.
    const noFacade = run("no-facade");
    expect(noFacade.exitCode).toBe(0);
    expect(noFacade.stdout.toString()).toContain("NO_FACADE_OK");
  });
});

describe("renderPrimeSkillPackage", () => {
  const options = { server: "board-essun", board: "team", author: "essun" };

  test("renders exactly the layout the verified discovery rules require", () => {
    const pkg = renderPrimeSkillPackage(options);
    expect(pkg.name).toBe(PRIME_SKILL_NAME);
    expect(pkg.name).toBe("board");
    expect(pkg.files.map((file) => file.path)).toEqual([
      "SKILL.md",
      "pyproject.toml",
      `src/${PRIME_SKILL_NAME}/__init__.py`,
    ]);
    // SKILL.md: frontmatter description is REQUIRED for discovery, and the
    // name must equal the parent directory name.
    const skillMd = pkg.files[0]!.content;
    expect(skillMd).toMatch(/^---\nname: board\ndescription: .+\n---\n/);
    expect(skillMd).toContain("Rendered by the sidekick board CLI for author");
    // dist/core/skills.js: description max 1024 chars.
    const description = skillMd.split("\n").find((line) => line.startsWith("description: "))!;
    expect(description.length).toBeLessThanOrEqual("description: ".length + 1024);
    // pyproject.toml: hatchling src-layout mirroring the shipped skills.
    const pyproject = pkg.files[1]!.content;
    expect(pyproject).toContain('name = "board"');
    expect(pyproject).toContain('build-backend = "hatchling.build"');
    expect(pyproject).toContain('packages = ["src/board"]');
    expect(pyproject).toContain("dependencies = []");
    expect(pyproject).toContain("Rendered by the sidekick board CLI for author");
    // The description must survive both frontmatter and TOML parsing: the
    // name rule guarantees no quote/control characters, so the template adds
    // none of its own.
    expect(description).not.toContain('"');
    expect((Bun.TOML.parse(pyproject) as { project: { description: string } }).project.description)
      .toBe(description.slice("description: ".length));
    // The module file IS renderPrimeMcpSkill's output (same verified contract).
    expect(pkg.files[2]!.content).toBe(renderPrimeMcpSkill(options));
  });

  test("is deterministic and varies with the options", () => {
    expect(renderPrimeSkillPackage(options)).toEqual(renderPrimeSkillPackage({ ...options }));
    expect(renderPrimeSkillPackage({ ...options, author: "nassun" }))
      .not.toEqual(renderPrimeSkillPackage(options));
  });

  test("name-checks all options through the module render", () => {
    expect(() => renderPrimeSkillPackage({ ...options, server: "Bad Name" })).toThrow();
    expect(() => renderPrimeSkillPackage({ ...options, board: "" })).toThrow();
    expect(() => renderPrimeSkillPackage({ ...options, author: "no exclamation!" })).toThrow();
  });
});

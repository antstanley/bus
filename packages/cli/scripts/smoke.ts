import assert from "node:assert/strict";
import { chmod, copyFile, mkdir, mkdtemp, readdir, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Run the *delivered* entrypoint outside the workspace, with an isolated home
// and no workspace modules. This catches omitted dependencies, broken bin
// metadata, dynamic imports, SQLite bundling, and accidental checkout paths.
const [kind, artifact] = process.argv.slice(2);
assert(kind === "package" || kind === "binary", "Usage: smoke.ts <package|binary> <artifact>");
assert(artifact, "An artifact path is required");
const scratch = await realpath(await mkdtemp(join(tmpdir(), "board-distribution-smoke-")));
try {
  const isolatedHome = join(scratch, "home");
  const commands = join(scratch, "commands");
  await mkdir(isolatedHome);
  await mkdir(commands);
  // Provide only Git and, for npm scripts, Bun. Compiled commands must run
  // without a Bun or Node executable on PATH.
  const git = Bun.which("git");
  assert(git, "Git is needed for the distribution smoke test");
  await symlink(git, join(commands, "git"));
  const env = {
    PATH: commands,
    HOME: isolatedHome,
    TMPDIR: scratch,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_AUTHOR_NAME: "Board smoke",
    GIT_AUTHOR_EMAIL: "smoke@example.invalid",
    GIT_COMMITTER_NAME: "Board smoke",
    GIT_COMMITTER_EMAIL: "smoke@example.invalid",
  };
  let executable: string;
  let packageRoot: string | undefined;
  if (kind === "package") {
    const tar = Bun.which("tar");
    assert(tar, "tar is needed to inspect the package");
    const extracted = Bun.spawn([tar, "-xzf", resolve(artifact), "-C", scratch], { stdout: "inherit", stderr: "inherit" });
    assert.equal(await extracted.exited, 0);
    packageRoot = join(scratch, "package");
    const manifest = await Bun.file(join(packageRoot, "package.json")).json();
    assert.equal(manifest.name, "@board/cli");
    assert.equal(manifest.private, undefined);
    assert.deepEqual(Object.keys(manifest.dependencies), ["@modelcontextprotocol/server"], "Workspace dependencies must be bundled");
    assert.equal(manifest.bin.board, "./board.js");
    assert.deepEqual((await readdir(packageRoot)).sort(), ["LICENSE", "README.md", "board.js", "package.json", "packages"]);
    const consumer = join(scratch, "consumer");
    await mkdir(consumer);
    await Bun.write(join(consumer, "package.json"), JSON.stringify({ name: "board-smoke-consumer", private: true }));
    const install = Bun.spawn([process.execPath, "add", "--ignore-scripts", "--registry", "https://registry.npmjs.org", resolve(artifact)], {
      cwd: consumer, env: { ...env, PATH: process.env.PATH ?? "" }, stdout: "inherit", stderr: "inherit",
    });
    assert.equal(await install.exited, 0, "Published SDK dependencies must install outside the workspace");
    packageRoot = await realpath(join(consumer, "node_modules/@board/cli"));
    await symlink(process.execPath, join(commands, "bun"));
    // Execute the package manager's actual bin link and the bundle's shebang.
    executable = join(consumer, "node_modules/.bin/board");
    const bunx = Bun.spawn([process.execPath, "x", "--no-install", "@board/cli", "--help"], {
      cwd: consumer, env, stdout: "pipe", stderr: "pipe",
    });
    const [bunxOutput, bunxError, bunxStatus] = await Promise.all([
      new Response(bunx.stdout).text(), new Response(bunx.stderr).text(), bunx.exited,
    ]);
    assert.equal(bunxStatus, 0, bunxError);
    assert.match(bunxOutput, /board.*message board/);
  } else {
    executable = join(commands, "board");
    await copyFile(resolve(artifact), executable);
    await chmod(executable, 0o755);
  }

  async function run(args: string[], expected = 0, stdin?: string): Promise<string> {
    const child = Bun.spawn([executable, ...args], {
      cwd: scratch, env, stdout: "pipe", stderr: "pipe",
      stdin: stdin === undefined ? "ignore" : new Blob([stdin]),
    });
    const timeout = setTimeout(() => child.kill("SIGKILL"), 15_000);
    try {
      const [stdout, stderr, code] = await Promise.all([
        new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
      ]);
      assert.equal(code, expected, `${args[0]}: ${stderr}`);
      if (expected === 0) assert.equal(stderr, "", `${args[0]} wrote stderr`);
      return expected === 0 ? stdout : stderr;
    } finally {
      clearTimeout(timeout);
    }
  }

  assert.match(await run(["--help"]), /board.*message board/);
  assert.match(await run(["unknown-command"], 2), /unknown command/);
  assert.match(await run(["post"], 2), /missing required --store/);
  if (kind === "binary") {
    assert.match(await run(["install", "claude", "--store", "fs:./store"], 2), /source checkout/);
    assert.deepEqual(await readdir(isolatedHome), [], "Unsupported install must not write configuration");
  } else {
    assert(packageRoot);
    const preview = await run(["install", "claude", "--store", "fs:./store", "--dry-run"]);
    assert(preview.includes(packageRoot), "Install preview must use packaged runtime paths");
    assert(!preview.includes("/Volumes/"), "Install preview must not contain build-machine paths");
    assert(!await Bun.file(join(isolatedHome, ".claude", "settings.json")).exists(), "Dry run must not write config");
    await run(["install", "claude", "--store", "fs:./store"]);
    assert.equal(await run(["install", "claude", "--store", "fs:./store"]), "", "Install must be idempotent");
    const configuration = await Bun.file(join(isolatedHome, ".claude.json")).json();
    const mcp = configuration.mcpServers.board;
    assert.equal(mcp.command, process.execPath);
    const mcpPath = join(packageRoot, "packages/mcp/src/index.ts");
    assert(mcp.args.includes(mcpPath));
    const server = Bun.spawn([mcp.command, ...mcp.args], { cwd: scratch, env, stdin: "pipe", stdout: "pipe", stderr: "pipe" });
    server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
      protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "packaging-smoke", version: "1" },
    } }) + "\n");
    const serverTimeout = setTimeout(() => server.kill("SIGKILL"), 15_000);
    try {
      const reader = server.stdout.getReader();
      let output = "";
      while (!output.includes("\n")) {
        const chunk = await reader.read();
        assert(!chunk.done, "MCP exited before initialization response");
        output += new TextDecoder().decode(chunk.value);
      }
      const response = JSON.parse(output.split("\n")[0]!);
      assert.equal(response.id, 1);
      assert(response.result?.serverInfo, "Installed MCP server must initialize");
      await reader.cancel();
    } finally {
      server.stdin.end();
      server.kill();
      await server.exited;
      clearTimeout(serverTimeout);
    }
    const hookStore = `fs:${join(scratch, "hook-store")}`;
    await run(["post", "--store", hookStore, "--as", "writer", "--mentions", "reader", "--body", "Installed hook smoke body"]);
    const hook = Bun.spawn([process.execPath, join(packageRoot, "packages/hooks/src/board-hook.ts"), "inject"], {
      cwd: scratch,
      env: { ...env, BOARD_STORE: hookStore, BOARD_AS: "reader", BOARD_INDEX: join(scratch, "hook.sqlite") },
      stdin: new Blob(["{}"]), stdout: "pipe", stderr: "pipe",
    });
    const hookOutput = await new Response(hook.stdout).text();
    const hookError = await new Response(hook.stderr).text();
    assert.equal(await hook.exited, 0, hookError);
    assert.match(hookOutput, /Installed hook smoke body/);
  }

  for (const backend of ["fs", "git"]) {
    const flags = ["--store", `${backend}:${join(scratch, backend)}`, "--as", "smoke", "--board", "general"];
    const event = JSON.parse(await run(["init", ...flags, "--title", "Packaging smoke"]));
    assert.equal(event.type, "create");
    const post = JSON.parse(await run(["post", ...flags, "--title", "Hello", "--body", "-"], 0, "packaged stdin body"));
    assert.equal(post.body, "packaged stdin body");
    const reply = JSON.parse(await run(["reply", post.id, ...flags, "--body", "packaged reply"]));
    assert.equal(reply.thread, post.id);
    const page = JSON.parse(await run(["read", ...flags]));
    assert.deepEqual(page.posts.map((item: { id: string }) => item.id), [post.id, reply.id]);
    assert.equal(JSON.parse(await run(["read", ...flags, "--after", page.cursor])).posts.length, 0);
    assert.deepEqual(JSON.parse(await run(["who", "--store", `${backend}:${join(scratch, backend)}`])), []);
    const tasks = JSON.parse(await run(["tasks", ...flags, "--index", join(scratch, `${backend}.sqlite`), "--json"]));
    assert.deepEqual(tasks, [], "SQLite index must load from the delivered artifact");
  }
  const watchStore = `fs:${join(scratch, "watch-store")}`;
  const watcher = Bun.spawn([executable, "watch", "--store", watchStore, "--as", "watcher", "--interval", "2000"], {
    cwd: scratch, env, stdin: "ignore", stdout: "pipe", stderr: "pipe",
  });
  const watchTimeout = setTimeout(() => watcher.kill("SIGKILL"), 15_000);
  try {
    let ready = false;
    for (let attempt = 0; attempt < 40 && !ready; attempt++) {
      const records = JSON.parse(await run(["who", "--store", watchStore]));
      ready = records.some((record: { name: string; status: string }) => record.name === "watcher" && record.status === "watching");
      if (!ready) await Bun.sleep(50);
    }
    assert(ready, "Watcher must publish presence before signal check");
    watcher.kill("SIGTERM");
    const [output, error, status] = await Promise.all([
      new Response(watcher.stdout).text(), new Response(watcher.stderr).text(), watcher.exited,
    ]);
    assert.equal(status, 0, error);
    assert.equal(error, "");
    assert.equal(typeof JSON.parse(output.trim()).cursor, "string", "SIGTERM must emit a final cursor");
  } finally {
    watcher.kill();
    await watcher.exited;
    clearTimeout(watchTimeout);
  }
  console.log(`${kind} smoke passed: isolated entrypoint, help/errors, runtime install behavior, FS/Git round trips, stdin, pagination, presence, SQLite`);
} finally {
  await rm(scratch, { recursive: true, force: true });
}

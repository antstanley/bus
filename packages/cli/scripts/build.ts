import { chmod, copyFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "../../..");
const cliRoot = join(root, "packages/cli");
const dist = join(cliRoot, "dist");
const entry = join(cliRoot, "src/distribution.ts");
const targets = ["bun-darwin-arm64", "bun-darwin-x64", "bun-linux-arm64", "bun-linux-x64"];

async function command(args: string[], cwd = root): Promise<void> {
  const child = Bun.spawn([process.execPath, ...args], { cwd, stdout: "inherit", stderr: "inherit" });
  if (await child.exited !== 0) throw new Error(`Failed: bun ${args.join(" ")}`);
}

const [mode = "package", target] = process.argv.slice(2);
if (mode === "package") {
  const output = join(dist, "npm");
  await mkdir(output, { recursive: true });
  await command(["build", entry, "--target=bun", "--packages=bundle", "--define", "BOARD_COMPILED=false", "--outfile", join(output, "board.js")]);
  await chmod(join(output, "board.js"), 0o755);
  // Preserve the layout understood by the installer; each runtime entry is a
  // standalone bundle of its workspace imports. The public MCP SDK stays an
  // ordinary npm dependency, including its own license and dependency files.
  for (const runtimeEntry of ["packages/cli/src/index.ts", "packages/hooks/src/board-hook.ts", "packages/mcp/src/index.ts"]) {
    const destination = join(output, runtimeEntry);
    await command(["build", join(root, runtimeEntry), "--target=bun", "--packages=bundle", "--external", "@modelcontextprotocol/server", "--outfile", destination]);
  }
  const source = await Bun.file(join(cliRoot, "package.json")).json();
  const mcp = await Bun.file(join(root, "packages/mcp/package.json")).json();
  const manifest = {
    name: source.name,
    version: source.version,
    description: "JSON-friendly multi-agent message board CLI for Bun",
    type: "module",
    bin: { board: "./board.js" },
    files: ["board.js", "packages/cli/src/index.ts", "packages/hooks/src/board-hook.ts", "packages/mcp/src/index.ts", "README.md", "LICENSE"],
    dependencies: { "@modelcontextprotocol/server": mcp.dependencies["@modelcontextprotocol/server"] },
    engines: { bun: ">=1.4.0" },
    license: source.license,
    repository: { type: "git", url: "git+https://github.com/antstanley/bus.git", directory: "packages/cli" },
    publishConfig: { access: "public" },
  };
  await Bun.write(join(output, "package.json"), JSON.stringify(manifest, null, 2) + "\n");
  await copyFile(join(root, "LICENSE"), join(output, "LICENSE"));
  await copyFile(join(cliRoot, "DISTRIBUTION.md"), join(output, "README.md"));
  await command(["pm", "pack", "--destination", dist], output);
} else if (mode === "compile") {
  const native = `bun-${process.platform}-${process.arch}`;
  const selected = target === "all" ? targets : [target ?? native];
  if (selected.some((value) => !targets.includes(value))) {
    throw new Error(`Supported compile targets: ${targets.join(", ")}, all`);
  }
  const output = join(dist, "bin");
  await mkdir(output, { recursive: true });
  for (const value of selected) {
    await command([
      "build", entry, "--compile", `--target=${value}`, "--packages=bundle", "--define", "BOARD_COMPILED=true",
      "--no-compile-autoload-dotenv", "--no-compile-autoload-bunfig",
      "--outfile", join(output, `board-${value.slice(4)}`),
    ]);
  }
} else {
  throw new Error("Usage: bun packages/cli/scripts/build.ts [package | compile [all | bun-<os>-<arch>]]");
}

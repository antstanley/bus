import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classifyArgs, compiledInstallBlocked } from "../src/distribution.ts";
import { VALUE_FLAGS } from "../src/index.ts";

const roots: string[] = [];
const projectRoot = join(import.meta.dir, "../../..");

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "board-distribution-"));
  roots.push(root);
  return root;
}

/** Bun itself may create cache directories inside $HOME; assert only that no
 * board-owned runtime configuration appeared. */
async function assertNoConfigWrites(home: string): Promise<void> {
  const boardOwned = new Set([".claude", ".claude.json", ".codex", ".gemini", ".cursor", ".letta", ".pi", ".board"]);
  const entries = await readdir(home);
  expect(entries.filter((entry) => boardOwned.has(entry))).toEqual([]);
}

async function runEntry(
  args: string[],
  home: string,
  define?: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  const proc = Bun.spawn([
    process.execPath,
    ...(define ? ["--define", define] : []),
    join(projectRoot, "packages/cli/src/distribution.ts"),
    ...args,
  ], {
    cwd: projectRoot,
    env: { ...process.env, HOME: home },
    stdin: "ignore", stdout: "pipe", stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited,
  ]);
  return { stdout, stderr, code };
}

describe("compiled-install gate", () => {
  test("a consumed -h option value is not help and cannot bypass the gate", async () => {
    expect(classifyArgs(["install", "claude", "--store", "fs:./store", "--index", "-h"]).help).toBe(false);
    expect(classifyArgs(["install", "claude", "--store=fs:./store", "--index=-h"]).help).toBe(false);
    expect(classifyArgs(["install", "claude", "--store", "fs:./store", "--", "-h"]).help).toBe(false);
    expect(compiledInstallBlocked(["install", "claude", "--store", "fs:./store", "--index", "-h"], true)).toBe(true);
    expect(compiledInstallBlocked(["install", "claude", "--store", "fs:./store", "--index", "-h"], false)).toBe(false);

    const home = await fixture();
    const consumed = await runEntry(["install", "claude", "--store", "fs:./store", "--index", "-h"], home, "BOARD_COMPILED=true");
    expect(consumed.code, consumed.stderr).toBe(2);
    expect(consumed.stderr).toContain("source checkout");
    expect(consumed.stdout).not.toContain("Usage");
    await assertNoConfigWrites(home);

    const terminated = await runEntry(["install", "claude", "--store", "fs:./store", "--", "-h"], home, "BOARD_COMPILED=true");
    expect(terminated.code).toBe(2);
    expect(terminated.stderr).toContain("source checkout");
    await assertNoConfigWrites(home);
  });

  test("an omitted BOARD_COMPILED define fails closed and writes no settings", async () => {
    const home = await fixture();
    const blocked = await runEntry(["install", "claude", "--store", "fs:./store"], home);
    expect(blocked.code, blocked.stderr).toBe(2);
    expect(blocked.stderr).toContain("source checkout");
    await assertNoConfigWrites(home);
  });

  test("a present define opens the gate only when it is false", async () => {
    const closedHome = await fixture();
    const closed = await runEntry(["install", "claude", "--store", "fs:./store"], closedHome, "BOARD_COMPILED=true");
    expect(closed.code, closed.stderr).toBe(2);
    expect(closed.stderr).toContain("source checkout");
    await assertNoConfigWrites(closedHome);

    const openHome = await fixture();
    const open = await runEntry(["install", "gemini", "--store", "fs:/shared/board", "--dry-run"], openHome, "BOARD_COMPILED=false");
    expect(open.code, open.stderr).toBe(0);
    expect(open.stderr).toBe("");
    expect(open.stdout).not.toContain("source checkout");
    expect(open.stdout).toContain("+++");
    await assertNoConfigWrites(openHome);
  });

  test("genuine install --help and bare -h print help without side effects", async () => {
    for (const define of ["BOARD_COMPILED=true", undefined]) {
      const home = await fixture();
      const installHelp = await runEntry(["install", "--help"], home, define);
      expect(installHelp.code, installHelp.stderr).toBe(0);
      expect(installHelp.stderr).toBe("");
      expect(installHelp.stdout).toContain("install <runtime> --store");
      await assertNoConfigWrites(home);

      const installH = await runEntry(["install", "-h"], home, define);
      expect(installH.code, installH.stderr).toBe(0);
      expect(installH.stderr).toBe("");
      expect(installH.stdout).toContain("install <runtime> --store");
      await assertNoConfigWrites(home);
    }

    const home = await fixture();
    const bare = await runEntry(["-h"], home, "BOARD_COMPILED=true");
    expect(bare.code, bare.stderr).toBe(0);
    expect(bare.stderr).toBe("");
    expect(bare.stdout).toContain("message board");
    await assertNoConfigWrites(home);
  });

  test("classifyArgs mirrors the CLI grammar for the gate", () => {
    expect(classifyArgs([])).toEqual({ command: "help", help: false });
    expect(classifyArgs(["--help"])).toEqual({ command: "help", help: true });
    expect(classifyArgs(["-h"])).toEqual({ command: "help", help: true });
    expect(classifyArgs(["install"])).toEqual({ command: "install", help: false });
    expect(classifyArgs(["install", "-h"])).toEqual({ command: "install", help: true });
    expect(classifyArgs(["install", "--help"])).toEqual({ command: "install", help: true });
    expect(classifyArgs(["install", "--json", "-h"])).toEqual({ command: "install", help: true });
    expect(classifyArgs(["install", "--index"])).toEqual({ command: "install", help: false });
    expect(classifyArgs(["install", "--help=x"])).toEqual({ command: "install", help: false });
    expect(classifyArgs(["install", "--", "-h"])).toEqual({ command: "install", help: false });
    expect(classifyArgs(["read", "--after", "-h", "--store", "fs:x"])).toEqual({ command: "read", help: false });
  });
});

describe("value-flag parity", () => {
  // The gate's argv classifier must consume exactly the parser's value flags:
  // a flag VALUE_FLAGS gains must be consumed by classifyArgs too, or a
  // consumed `-h` would classify as help and open the compiled-install gate.
  test("classifyArgs consumes exactly the parser's VALUE_FLAGS", () => {
    expect(VALUE_FLAGS.size).toBeGreaterThan(0);
    expect(Object.isFrozen(VALUE_FLAGS)).toBe(true);
    for (const flag of VALUE_FLAGS) {
      expect(classifyArgs(["install", `--${flag}`, "-h"]).help, `--${flag} must consume -h as its value`).toBe(false);
    }
    for (const flag of ["help", "json", "dry-run", "uninstall", "deliver", "project"]) {
      expect(classifyArgs(["install", `--${flag}`, "-h"]).help, `--${flag} must not consume -h`).toBe(true);
    }
  });
});

import { afterEach, describe, expect, it } from "bun:test";
import { decoder } from "@board/core";
import { storeConformance } from "@board/core/test/store-conformance";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  GitStore,
  GitCommandError,
  InvalidChangeTokenError,
  UnmanagedRepositoryError,
} from "../src/index.ts";

const roots: string[] = [];

async function tempPath(label: string): Promise<string> {
  const parent = await mkdtemp(join(tmpdir(), `board-store-git-${label}-`));
  roots.push(parent);
  return join(parent, "repo");
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

storeConformance("git", async () => ({ store: new GitStore({ dir: await tempPath("contract"), branch: "main" }) }));

describe("GitStore", () => {
  it("batches concurrent writes into one commit", async () => {
    const dir = await tempPath("batch");
    const store = new GitStore({ dir, branch: "main", autoSync: true, batchMs: 5 });
    await Promise.all(Array.from({ length: 12 }, (_, i) => store.put(`batch/${i}`, String(i), { ifNoneMatch: true })));
    expect((await git(dir, ["rev-list", "--count", "HEAD"])).trim()).toBe("1");
  });

  it("replicates writers and deterministically retries a push race", async () => {
    const bare = await tempPath("bare");
    await git(bare, ["init", "--bare", "-b", "main"], false);
    const aDir = await tempPath("a");
    const bDir = await tempPath("b");
    const a = new GitStore({ dir: aDir, remote: bare, branch: "main", autoSync: true, batchMs: 0 });
    const b = new GitStore({ dir: bDir, remote: bare, branch: "main" });

    await a.put("from/a", "A", { ifNoneMatch: true });
    await b.sync();
    expect(decoder.decode((await b.get("from/a"))!)).toBe("A");

    // Prepare a third clone with an unpushed commit. B's one-shot pre-push
    // hook publishes it after B fetched but before B's push, forcing fetch-first.
    const cDir = await tempPath("c");
    await git(cDir, ["clone", bare], false);
    await git(cDir, ["config", "user.name", "board"]);
    await git(cDir, ["config", "user.email", "board@localhost"]);
    await mkdir(join(cDir, "race"));
    await writeFile(join(cDir, "race", "third"), "C");
    await git(cDir, ["add", "race/third"]);
    await git(cDir, ["commit", "-m", "third writer"]);

    const { token } = await b.changes();
    await b.put("race/b", "B", { ifNoneMatch: true });
    const hook = join(bDir, ".git", "hooks", "pre-push");
    await writeFile(hook, `#!/bin/sh\nrm -f "$0"\ngit -C ${shellQuote(cDir)} push origin HEAD:main\n`);
    await chmod(hook, 0o755);
    await b.sync();

    const changed = await b.changes(token);
    expect(changed.keys).toEqual(expect.arrayContaining(["race/b", "race/third"]));
    expect(decoder.decode((await b.get("race/third"))!)).toBe("C");
  });

  it("changes reports an older-bucket object fetched after a local HEAD token", async () => {
    const bare = await tempPath("changes-bare");
    await git(bare, ["init", "--bare", "-b", "main"], false);
    const aDir = await tempPath("changes-a");
    const a = new GitStore({ dir: aDir, remote: bare, branch: "main" });
    const b = new GitStore({ dir: await tempPath("changes-b"), remote: bare, branch: "main" });
    await a.put("base/object", "base", { ifNoneMatch: true });
    await a.sync();
    await b.sync();
    await a.put("local/object", "local", { ifNoneMatch: true });
    await a.sync();
    const token = (await git(aDir, ["rev-parse", "HEAD"])).trim();
    const late = "boards/general/posts/2000-01-01/00000000000000000000000000.json";
    await b.put(late, "late", { ifNoneMatch: true });
    await b.sync();
    const changed = await a.changes(token);
    expect(changed.keys).toContain(late);
  });

  it("resolves plain-put collisions with local-wins replay and converges", async () => {
    const bare = await tempPath("conflict-bare");
    await git(bare, ["init", "--bare", "-b", "main"], false);
    const a = new GitStore({ dir: await tempPath("conflict-a"), remote: bare, branch: "main" });
    const bDir = await tempPath("conflict-b");
    const b = new GitStore({ dir: bDir, remote: bare, branch: "main" });
    await a.put("base/object", "base");
    await a.sync();
    await b.sync();
    await a.put("mutable/key", "from-a");
    await b.put("mutable/key", "from-b");
    await a.sync();

    await b.sync();
    await a.sync();
    expect(decoder.decode((await b.get("mutable/key"))!)).toBe("from-b");
    expect(decoder.decode((await a.get("mutable/key"))!)).toBe("from-b");
    expect(await Bun.file(join(bDir, ".git", "rebase-merge")).exists()).toBe(false);
    await b.put("later/object", "still replicating");
    await b.sync();
    await a.sync();
    expect(decoder.decode((await a.get("later/object"))!)).toBe("still replicating");
  });

  it("refuses unmanaged repositories and never replaces an existing origin", async () => {
    const unmanaged = await tempPath("unmanaged");
    await git(unmanaged, ["init", "-b", "main"], false);
    const globalConfig = await tempPath("global-config");
    await writeFile(globalConfig, "[board]\n\tstore = true\n");
    const oldGlobal = process.env.GIT_CONFIG_GLOBAL;
    process.env.GIT_CONFIG_GLOBAL = globalConfig;
    try {
      const unsafe = new GitStore({ dir: unmanaged, branch: "main" });
      await expect(unsafe.put("object", "value")).rejects.toBeInstanceOf(UnmanagedRepositoryError);
    } finally {
      if (oldGlobal === undefined) delete process.env.GIT_CONFIG_GLOBAL; else process.env.GIT_CONFIG_GLOBAL = oldGlobal;
    }

    const managedDir = await tempPath("managed");
    const managed = new GitStore({ dir: managedDir, branch: "main" });
    await managed.sync();
    await git(managedDir, ["remote", "add", "origin", "file:///first.git"]);
    const mismatch = new GitStore({ dir: managedDir, branch: "main", remote: "file:///second.git" });
    await expect(mismatch.get("object")).rejects.toThrow("refusing to replace existing origin");
    expect((await git(managedDir, ["remote", "get-url", "origin"])).trim()).toBe("file:///first.git");
  });

  it("ignores ambient repository-routing environment variables", async () => {
    const victim = await tempPath("victim");
    await git(victim, ["init", "-b", "main"], false);
    const storeDir = await tempPath("isolated");
    const hostile: Record<string, string> = {
      GIT_DIR: join(victim, ".git"),
      GIT_WORK_TREE: victim,
      GIT_INDEX_FILE: join(victim, ".git", "hostile-index"),
      GIT_COMMON_DIR: join(victim, ".git"),
      GIT_OBJECT_DIRECTORY: join(victim, ".git", "objects"),
      GIT_ALTERNATE_OBJECT_DIRECTORIES: join(victim, ".git", "objects"),
      GIT_QUARANTINE_PATH: join(victim, ".git", "objects"),
      GIT_NAMESPACE: "hostile",
    };
    const previous = new Map<string, string | undefined>();
    for (const [name, value] of Object.entries(hostile)) {
      previous.set(name, process.env[name]);
      process.env[name] = value;
    }
    try {
      const store = new GitStore({ dir: storeDir, branch: "main" });
      await store.put("safe/object", "safe");
      await store.sync();
    } finally {
      for (const [name, value] of previous) {
        if (value === undefined) delete process.env[name]; else process.env[name] = value;
      }
    }
    expect((await git(storeDir, ["rev-parse", "--verify", "HEAD"])).trim()).toHaveLength(40);
    expect((await gitResult(victim, ["rev-parse", "--verify", "HEAD"])).code).not.toBe(0);
  });

  it("validates tokens, recovers expired tokens, and omits deletions", async () => {
    const dir = await tempPath("tokens");
    const store = new GitStore({ dir, branch: "main" });
    await store.put("kept/object", "kept");
    await store.put("deleted/object", "gone");
    await store.sync();
    const { token } = await store.changes();
    const output = join(dir, "injected");
    await expect(store.changes(`--output=${output}`)).rejects.toBeInstanceOf(InvalidChangeTokenError);
    expect(await Bun.file(output).exists()).toBe(false);

    const expired = await store.changes("a".repeat(40));
    expect(expired.keys).toEqual(expect.arrayContaining(["kept/object", "deleted/object"]));
    await store.delete("deleted/object");
    const afterDelete = await store.changes(token);
    expect(afterDelete.keys).not.toContain("deleted/object");
  });

  it("excludes FsStore temp files from commits", async () => {
    const dir = await tempPath("exclude");
    const store = new GitStore({ dir, branch: "main" });
    await store.sync();
    await mkdir(join(dir, "nested"));
    await writeFile(join(dir, "nested", ".board-tmp-orphan"), "partial");
    await store.put("nested/real", "real");
    await store.sync();
    expect((await git(dir, ["ls-files"])).trim().split("\n")).toEqual(["nested/real"]);
  });

  it("keeps auto-sync reads available while the remote is unreachable", async () => {
    const dir = await tempPath("offline");
    const local = new GitStore({ dir, branch: "main" });
    await local.put("local/object", "available");
    await local.sync();
    const missing = join(await tempPath("missing-remote"), "does-not-exist.git");
    await git(dir, ["remote", "add", "origin", missing]);
    const offline = new GitStore({ dir, branch: "main", remote: missing, autoSync: true, readSyncIntervalMs: 0 });
    expect(decoder.decode((await offline.get("local/object"))!)).toBe("available");
    const { token } = await offline.changes();
    await offline.put("local/new", "committed locally");
    expect(offline.lastSyncError).toBeInstanceOf(GitCommandError);
    const changed = await offline.changes(token);
    expect(changed.keys).toContain("local/new");
    await expect(offline.sync()).rejects.toBeInstanceOf(GitCommandError);
  });
});

async function git(dir: string, args: string[], useCwd = true): Promise<string> {
  const command = useCwd ? ["git", "-C", dir, ...args] : ["git", ...args, dir];
  const proc = Bun.spawn(command, { stdout: "pipe", stderr: "pipe", env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
  const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (code !== 0) throw new Error(`${command.join(" ")} failed: ${stderr}`);
  return stdout;
}

async function gitResult(dir: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["git", "-C", dir, ...args], { stdout: "pipe", stderr: "pipe", env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
  const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { code, stdout, stderr };
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

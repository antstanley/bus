import { afterEach, describe, expect, it } from "bun:test";
import { decoder } from "@board/core";
import { storeConformance } from "@board/core/test/store-conformance";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
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
    const existingRemote = "https://alice:old-secret@example.test/first.git";
    await git(managedDir, ["remote", "add", "origin", existingRemote]);
    const mismatch = new GitStore({ dir: managedDir, branch: "main", remote: "https://bob:new-secret@example.test/second.git" });
    const error = await mismatch.get("object").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("refusing to replace existing origin");
    expect((error as Error).message).not.toContain("old-secret");
    expect((error as Error).message).not.toContain("new-secret");
    expect((await git(managedDir, ["remote", "get-url", "origin"])).trim()).toBe(existingRemote);
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

  it("installs idempotent owned wake hooks that touch ignored worktree state", async () => {
    const dir = await tempPath("wake-hooks");
    const first = new GitStore({ dir, branch: "main" });
    await first.sync();
    const postMerge = join(dir, ".git", "hooks", "post-merge");
    const postReceive = join(dir, ".git", "hooks", "post-receive");
    const before = await readFile(postMerge, "utf8");
    expect(before).toContain("# board-store-git owned wake hook v1");
    expect(await readFile(postReceive, "utf8")).toBe(before);

    await git(dir, ["hook", "run", "post-merge"]);
    const wake = join(dir, ".board-wake");
    expect(await Bun.file(wake).exists()).toBe(true);
    await rm(wake, { force: true });
    await git(dir, ["hook", "run", "post-receive"]);
    expect(await Bun.file(wake).exists()).toBe(true);
    expect((await git(dir, ["status", "--porcelain", "--untracked-files=all"])).trim()).toBe("");

    const second = new GitStore({ dir, branch: "main" });
    await second.sync();
    expect(await readFile(postMerge, "utf8")).toBe(before);
    expect(await readFile(postReceive, "utf8")).toBe(before);
    expect((await readdir(join(dir, ".git", "hooks"))).filter((name) => name.includes("board-tmp"))).toEqual([]);
  });

  it("closes an idle hint consumer promptly while a concurrent consumer keeps receiving wakes", async () => {
    const dir = await tempPath("hint-multicast");
    const store = new GitStore({ dir, branch: "main" });
    await store.sync();
    const closed = store.hint()[Symbol.asyncIterator]();
    const survivor = store.hint()[Symbol.asyncIterator]();
    const closedWake = closed.next();
    const survivorWake = survivor.next();
    const returned = closed.return(undefined);
    await expect(Promise.race([
      returned,
      rejectAfter(1000, "return() hung while the consumer idled in next()"),
    ])).resolves.toEqual({ done: true, value: undefined });
    await expect(Promise.race([
      closedWake,
      rejectAfter(1000, "pending next() never ended after return()"),
    ])).resolves.toEqual({ done: true, value: undefined });

    await git(dir, ["hook", "run", "post-merge"]);
    await expect(Promise.race([
      survivorWake,
      rejectAfter(5000, "survivor missed its wake"),
    ])).resolves.toEqual({ done: false, value: undefined });

    await survivor.return(undefined);
    await git(dir, ["hook", "run", "post-merge"]);
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(await survivor.next()).toEqual({ done: true, value: undefined });
  });

  it("ends a pending hint next() as done when return() lands during the idle wait", async () => {
    const dir = await tempPath("hint-return-idle");
    const store = new GitStore({ dir, branch: "main" });
    await store.sync();
    const iterator = store.hint()[Symbol.asyncIterator]();
    const pending = iterator.next();
    const returned = iterator.return(undefined);
    await expect(Promise.race([
      returned,
      rejectAfter(1000, "return() hung while a next() was pending"),
    ])).resolves.toEqual({ done: true, value: undefined });
    await expect(Promise.race([
      pending,
      rejectAfter(1000, "pending next() never resolved as done"),
    ])).resolves.toEqual({ done: true, value: undefined });

    const follow = store.hint()[Symbol.asyncIterator]();
    const followWake = follow.next();
    await git(dir, ["hook", "run", "post-merge"]);
    await expect(Promise.race([
      followWake,
      rejectAfter(5000, "follow-on consumer missed its wake"),
    ])).resolves.toEqual({ done: false, value: undefined });
    await follow.return(undefined);
    await git(dir, ["hook", "run", "post-merge"]);
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(await follow.next()).toEqual({ done: true, value: undefined });
  });

  it("skips hook installation when core.hooksPath points outside the repository", async () => {
    const dir = await tempPath("external-hooks");
    await git(dir, ["init", "-b", "main"], false);
    await git(dir, ["config", "board.store", "true"]);
    const external = await tempPath("external-hooks-dir");
    await mkdir(external, { recursive: true });
    const foreign = "#!/bin/sh\necho external\n";
    const sentinel = join(external, "pre-commit");
    await writeFile(sentinel, foreign, { mode: 0o755 });
    await git(dir, ["config", "core.hooksPath", external]);

    const store = new GitStore({ dir, branch: "main" });
    await store.sync();
    expect(await readFile(sentinel, "utf8")).toBe(foreign);
    expect((await stat(sentinel)).mode & 0o777).toBe(0o755);
    expect((await readdir(external)).sort()).toEqual(["pre-commit"]);
    expect(await Bun.file(join(dir, ".git", "hooks", "post-merge")).exists()).toBe(false);
    await store.put("object", "value", { ifNoneMatch: true });
    expect(decoder.decode((await store.get("object"))!)).toBe("value");

    const missing = await tempPath("external-hooks-missing");
    await git(dir, ["config", "core.hooksPath", missing]);
    const second = new GitStore({ dir, branch: "main" });
    await second.sync();
    expect(await Bun.file(missing).exists()).toBe(false);
    const third = new GitStore({ dir, branch: "main" });
    await third.sync();
    expect(await Bun.file(missing).exists()).toBe(false);
    expect(await Bun.file(join(dir, ".git", "hooks", "post-merge")).exists()).toBe(false);
  });

  it("skips hook installation when core.hooksPath resolves outside through a symlinked ancestor", async () => {
    const dir = await tempPath("symlink-escape");
    await git(dir, ["init", "-b", "main"], false);
    await git(dir, ["config", "board.store", "true"]);
    const outside = await tempPath("symlink-escape-target");
    await mkdir(join(outside, "real"), { recursive: true });
    await symlink(join(outside, "real"), join(dir, "linked"));
    await git(dir, ["config", "core.hooksPath", join("linked", "created", "hooks")]);

    const store = new GitStore({ dir, branch: "main" });
    await store.sync();
    expect((await readdir(join(outside, "real"))).sort()).toEqual([]);
    expect(await Bun.file(join(outside, "created", "hooks", "post-merge")).exists()).toBe(false);
    expect(await Bun.file(join(dir, ".git", "hooks", "post-merge")).exists()).toBe(false);
    await store.put("object", "value", { ifNoneMatch: true });
    expect(decoder.decode((await store.get("object"))!)).toBe("value");

    const second = new GitStore({ dir, branch: "main" });
    await second.sync();
    expect((await readdir(join(outside, "real"))).sort()).toEqual([]);
  });

  it("installs owned wake hooks into an in-repo custom core.hooksPath directory", async () => {
    const dir = await tempPath("in-repo-hooks");
    await git(dir, ["init", "-b", "main"], false);
    await git(dir, ["config", "board.store", "true"]);
    await git(dir, ["config", "core.hooksPath", ".githooks"]);
    const store = new GitStore({ dir, branch: "main" });
    await store.sync();
    const postMerge = join(dir, ".githooks", "post-merge");
    const body = await readFile(postMerge, "utf8");
    expect(body).toContain("# board-store-git owned wake hook v1");
    expect(body).toBe(await readFile(join(dir, ".githooks", "post-receive"), "utf8"));
    expect((await stat(postMerge)).mode & 0o777).toBe(0o755);
    expect((await readdir(join(dir, ".githooks"))).filter((name) => name.includes("board-tmp"))).toEqual([]);
    await git(dir, ["hook", "run", "post-merge"]);
    expect(await Bun.file(join(dir, ".board-wake")).exists()).toBe(true);
  });

  it("installs functional wake hooks through an in-repo core.hooksPath symlink", async () => {
    const dir = await tempPath("in-repo-symlink");
    await git(dir, ["init", "-b", "main"], false);
    await git(dir, ["config", "board.store", "true"]);
    await mkdir(join(dir, "real-hooks"));
    await symlink("real-hooks", join(dir, "linked-hooks"));
    await git(dir, ["config", "core.hooksPath", "linked-hooks"]);
    const store = new GitStore({ dir, branch: "main" });
    await store.sync();
    const body = await readFile(join(dir, "real-hooks", "post-merge"), "utf8");
    expect(body).toContain("# board-store-git owned wake hook v1");
    expect(body).toBe(await readFile(join(dir, "real-hooks", "post-receive"), "utf8"));
    expect((await stat(join(dir, "real-hooks", "post-merge"))).mode & 0o777).toBe(0o755);
    expect((await readdir(join(dir, "real-hooks"))).filter((name) => name.includes("board-tmp"))).toEqual([]);
    await git(dir, ["hook", "run", "post-merge"]);
    expect(await Bun.file(join(dir, ".board-wake")).exists()).toBe(true);
  });

  it("preserves foreign hooks without executing or overwriting their content", async () => {
    const dir = await tempPath("foreign-hook");
    await git(dir, ["init", "-b", "main"], false);
    await git(dir, ["config", "board.store", "true"]);
    const hook = join(dir, ".git", "hooks", "post-merge");
    const foreign = "#!/bin/sh\nexit 73\n";
    await writeFile(hook, foreign, { mode: 0o755 });
    const store = new GitStore({ dir, branch: "main" });
    await store.sync();
    expect(await readFile(hook, "utf8")).toBe(foreign);
    expect(await readFile(join(dir, ".git", "hooks", "post-receive"), "utf8")).toContain("# board-store-git owned wake hook v1");
  });

  it("post-receive wakes the worktree root even when run from the git dir", async () => {
    const dir = await tempPath("wake-gitdir");
    const store = new GitStore({ dir, branch: "main" });
    await store.sync();
    const hook = join(dir, ".git", "hooks", "post-receive");
    const runHook = async (cwd: string): Promise<void> => {
      // git receive-pack runs hooks with cwd at the git dir and GIT_DIR="."
      const proc = Bun.spawn(["sh", "hooks/post-receive"], {
        cwd,
        env: { ...process.env, GIT_DIR: ".", GIT_TERMINAL_PROMPT: "0" },
        stdout: "pipe",
        stderr: "pipe",
      });
      const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
      expect(stdout).toBe("");
      expect(stderr).toBe("");
      expect(code).toBe(0);
    };
    await runHook(join(dir, ".git"));
    expect(await Bun.file(join(dir, ".board-wake")).exists()).toBe(true);
    expect(await Bun.file(join(dir, ".git", ".board-wake")).exists()).toBe(false);
    expect((await git(dir, ["status", "--porcelain", "--untracked-files=all"])).trim()).toBe("");

    // A bare remote (git dir without a /.git suffix) keeps waking beside its
    // own objects.
    const bare = await tempPath("wake-gitdir-bare");
    await git(bare, ["init", "--bare", "-b", "main"], false);
    await writeFile(join(bare, "hooks", "post-receive"), await readFile(hook, "utf8"), { mode: 0o755 });
    await runHook(bare);
    expect(await Bun.file(join(bare, ".board-wake")).exists()).toBe(true);
  });

  it("refreshes an owned hook that drifted from the current body", async () => {
    const dir = await tempPath("drifted-hook");
    const first = new GitStore({ dir, branch: "main" });
    await first.sync();
    const postMerge = join(dir, ".git", "hooks", "post-merge");
    const drifted = "#!/bin/sh\n# board-store-git owned wake hook v1\nwake_root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0\n(umask 077 && : > \"$wake_root/.board-wake\") 2>/dev/null || :\n";
    await writeFile(postMerge, drifted);
    await chmod(postMerge, 0o600);
    const second = new GitStore({ dir, branch: "main" });
    await second.sync();
    const refreshed = await readFile(postMerge, "utf8");
    expect(refreshed).not.toBe(drifted);
    expect(refreshed).toBe(await readFile(join(dir, ".git", "hooks", "post-receive"), "utf8"));
    expect((await stat(postMerge)).mode & 0o777).toBe(0o755);
    expect((await readdir(join(dir, ".git", "hooks"))).filter((name) => name.includes("board-tmp"))).toEqual([]);
    await git(dir, ["hook", "run", "post-merge"]);
    expect(await Bun.file(join(dir, ".board-wake")).exists()).toBe(true);
    expect((await git(dir, ["status", "--porcelain", "--untracked-files=all"])).trim()).toBe("");
  });

  it("leaves an unowned hook byte-for-byte intact across repeated initializations", async () => {
    const dir = await tempPath("unowned-hook");
    await git(dir, ["init", "-b", "main"], false);
    await git(dir, ["config", "board.store", "true"]);
    const hook = join(dir, ".git", "hooks", "post-merge");
    const foreign = "#!/bin/sh\necho keep-me\n";
    await writeFile(hook, foreign, { mode: 0o640 });
    const store = new GitStore({ dir, branch: "main" });
    await store.sync();
    await store.sync();
    expect(await readFile(hook, "utf8")).toBe(foreign);
    expect((await stat(hook)).mode & 0o777).toBe(0o640);
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

function rejectAfter(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms));
}

import { afterEach, describe, expect, it } from "bun:test";
import { storeConformance } from "@board/core/test/store-conformance";
import { chmod, mkdtemp, mkdir, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FsStore } from "../src/index.ts";

const roots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "board-store-fs-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

storeConformance("fs", async () => ({ store: new FsStore(await tempRoot()) }));

describe("FsStore", () => {
  it("orders files and directory descendants by full key byte order", async () => {
    const store = new FsStore(await tempRoot());
    for (const key of ["a/x", "a-foo", "a.foo", "a0", "a/0", "a/A", "a_foo"]) await store.put(key, key);
    expect((await store.list("a")).keys).toEqual(["a-foo", "a.foo", "a/0", "a/A", "a/x", "a0", "a_foo"]);
  });

  it("does not expose metadata, temporary files, or symlink targets", async () => {
    const root = await tempRoot();
    const outside = await tempRoot();
    await mkdir(join(root, ".git"));
    await writeFile(join(root, ".git", "config"), "secret");
    await writeFile(join(root, ".board-tmp-orphan"), "partial");
    await writeFile(join(root, "bad name"), "invalid");
    await writeFile(join(root, "bad#name"), "invalid");
    await writeFile(join(outside, "outside"), "outside");
    await symlink(outside, join(root, "linked"));
    const store = new FsStore(root);
    await store.put("real/key", "value");
    expect((await store.list("")).keys).toEqual(["real/key"]);
  });

  it("rejects keys that could escape the root", async () => {
    const store = new FsStore(await tempRoot());
    await expect(store.put("../escape", "no")).rejects.toBeInstanceOf(TypeError);
    await expect(store.get("/absolute")).rejects.toBeInstanceOf(TypeError);
    await expect(store.delete("a//b")).rejects.toBeInstanceOf(TypeError);
  });

  it("returns null for paths blocked by files or directories", async () => {
    const store = new FsStore(await tempRoot());
    await store.put("x", "file");
    await store.put("d/one", "child");
    expect(await store.get("x/child")).toBeNull();
    expect(await store.get("d")).toBeNull();
  });

  it("never follows final or parent symlinks outside the root", async () => {
    const root = await tempRoot();
    const outside = await tempRoot();
    await writeFile(join(outside, "secret"), "secret");
    await symlink(outside, join(root, "linked"));
    await symlink(join(outside, "secret"), join(root, "final"));
    const store = new FsStore(root);
    expect(await store.get("linked/secret")).toBeNull();
    await expect(store.put("linked/newfile", "escape")).rejects.toBeInstanceOf(TypeError);
    await store.delete("linked/secret");
    expect(await store.get("final")).toBeNull();
    expect(await Bun.file(join(outside, "newfile")).exists()).toBe(false);
  });

  it("leaves no temp object after concurrent conditional losers", async () => {
    const root = await tempRoot();
    const store = new FsStore(root);
    await Promise.allSettled(Array.from({ length: 12 }, (_, i) => store.put("race/key", String(i), { ifNoneMatch: true })));
    expect((await readdir(join(root, "race"))).filter((name) => name.startsWith(".board-tmp-"))).toEqual([]);
  });

  it("prunes a subtree entirely before the after cursor", async () => {
    const root = await tempRoot();
    const store = new FsStore(root);
    await store.put("a/hidden", "old");
    await store.put("z/visible", "new");
    await chmod(join(root, "a"), 0o000);
    try {
      expect((await store.list("", { after: "m" })).keys).toEqual(["z/visible"]);
    } finally {
      await chmod(join(root, "a"), 0o700);
    }
  });

  it("skips an unreadable subtree while listing accessible siblings", async () => {
    const root = await tempRoot();
    const store = new FsStore(root);
    await store.put("blocked/hidden", "old");
    await store.put("visible/object", "new");
    await chmod(join(root, "blocked"), 0o000);
    try {
      expect((await store.list("")).keys).toEqual(["visible/object"]);
    } finally {
      await chmod(join(root, "blocked"), 0o700);
    }
  });

  it("accepts Infinity as an unbounded list limit", async () => {
    const store = new FsStore(await tempRoot());
    await store.put("a/one", "1");
    expect(await store.list("", { limit: Infinity })).toEqual({ keys: ["a/one"], truncated: false });
  });
});

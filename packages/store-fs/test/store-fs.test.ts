import { afterEach, describe, expect, it } from "bun:test";
import { storeConformance } from "@board/core/test/store-conformance";
import { EventEmitter } from "node:events";
import { watch, type FSWatcher } from "node:fs";
import { chmod, mkdtemp, mkdir, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FsStore, type WatchFactory } from "../src/index.ts";

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

  it("shares one recursive watcher, debounces atomic activity, and cleans up all consumers", async () => {
    const root = await tempRoot();
    const fake = new FakeWatcher();
    let listener: ((eventType: string, filename: string | Buffer | null) => void) | undefined;
    let starts = 0;
    const store = new FsStore(root, {
      hintDebounceMs: 2,
      watchFactory: (_path, options, callback) => {
        starts++;
        expect(options).toEqual({ recursive: true });
        listener = callback;
        return fake as unknown as FSWatcher;
      },
    });
    const aAbort = new AbortController();
    const bAbort = new AbortController();
    const a = store.hint(aAbort.signal)[Symbol.asyncIterator]();
    const b = store.hint(bAbort.signal)[Symbol.asyncIterator]();
    const aWake = a.next();
    const bWake = b.next();
    await until(() => listener !== undefined);

    let wokeForMetadata = false;
    void aWake.then(() => { wokeForMetadata = true; });
    listener!("change", ".git/FETCH_HEAD");
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(wokeForMetadata).toBe(false);

    // A typical temp-create/rename/unlink burst is one hint. Filenames are
    // untrusted data and are never interpreted as keys.
    listener!("rename", Buffer.from("../../outside"));
    listener!("change", ".board-tmp-object");
    listener!("rename", "boards/g/object");
    expect(await aWake).toEqual({ done: false, value: undefined });
    expect(await bWake).toEqual({ done: false, value: undefined });
    expect(starts).toBe(1);

    const aDone = a.next();
    const bDone = b.next();
    aAbort.abort();
    expect(await aDone).toEqual({ done: true, value: undefined });
    expect(fake.closeCount).toBe(0);
    bAbort.abort();
    expect(await bDone).toEqual({ done: true, value: undefined });
    expect(fake.closeCount).toBe(1);
  });

  it("delivers hints for watcher callbacks with undefined or null filenames", async () => {
    const ready = Promise.withResolvers<FSWatcher>();
    let listener!: Parameters<WatchFactory>[2];
    const store = new FsStore(await tempRoot(), {
      hintDebounceMs: 2,
      watchFactory: (path, options, callback) => {
        listener = callback;
        const watcher = watch(path, options, callback);
        ready.resolve(watcher);
        return watcher;
      },
    });
    const iterator = store.hint()[Symbol.asyncIterator]();
    const undefinedWake = iterator.next();
    await ready.promise;
    try {
      // Invoke the exact callback supplied to real fs.watch; native filename
      // omission cannot be requested deterministically from the filesystem.
      listener("rename", undefined);
      expect(await Promise.race([
        undefinedWake,
        rejectAfter(250, "undefined filename did not wake the consumer"),
      ])).toEqual({ done: false, value: undefined });

      const nullWake = iterator.next();
      listener("change", null);
      expect(await Promise.race([
        nullWake,
        rejectAfter(250, "null filename did not wake the consumer"),
      ])).toEqual({ done: false, value: undefined });

      let wokeForMetadata = false;
      const bufferWake = iterator.next();
      void bufferWake.then(() => { wokeForMetadata = true; });
      for (const filename of [".git", ".git/HEAD", ".git\\HEAD", Buffer.from(".git/HEAD")]) {
        listener("change", filename);
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(wokeForMetadata).toBe(false);
      listener("rename", "boards/g/object");
      expect(await bufferWake).toEqual({ done: false, value: undefined });
    } finally {
      await iterator.return(undefined);
    }
    expect(await iterator.next()).toEqual({ done: true, value: undefined });
  });

  it("ends hint iterators on watcher errors or unexpected closure", async () => {
    for (const event of ["error", "close"] as const) {
      const fake = new FakeWatcher();
      const store = new FsStore(await tempRoot(), {
        watchFactory: () => fake as unknown as FSWatcher,
      });
      const iterator = store.hint()[Symbol.asyncIterator]();
      const pending = iterator.next();
      await until(() => fake.listenerCount(event) > 0);
      if (event === "error") fake.emit("error", new Error("watch failed"));
      else fake.emit("close");
      await expect(pending).rejects.toBeInstanceOf(Error);
      expect(fake.closeCount).toBe(1);
    }
  });

  it("closes a hint iterator promptly when return() lands while a next() is pending", async () => {
    const fake = new FakeWatcher();
    let listener: ((eventType: string, filename: string | Buffer | null) => void) | undefined;
    const store = new FsStore(await tempRoot(), {
      watchFactory: (_path, _options, callback) => {
        listener = callback;
        return fake as unknown as FSWatcher;
      },
    });
    const iterator = store.hint()[Symbol.asyncIterator]();
    const pending = iterator.next();
    await until(() => listener !== undefined);
    const returned = iterator.return(undefined);
    expect(await Promise.race([returned, rejectAfter(250, "return() hung while a next() was pending")])).toEqual({ done: true, value: undefined });
    expect(await pending).toEqual({ done: true, value: undefined });
    expect(fake.closeCount).toBe(1);
  });

  it("keeps other hint consumers and the shared watcher alive when one iterator closes mid-wait", async () => {
    const fake = new FakeWatcher();
    let listener: ((eventType: string, filename: string | Buffer | null) => void) | undefined;
    let starts = 0;
    const store = new FsStore(await tempRoot(), {
      hintDebounceMs: 2,
      watchFactory: (_path, options, callback) => {
        starts++;
        expect(options).toEqual({ recursive: true });
        listener = callback;
        return fake as unknown as FSWatcher;
      },
    });
    const a = store.hint()[Symbol.asyncIterator]();
    const b = store.hint()[Symbol.asyncIterator]();
    const aWake = a.next();
    const bWake = b.next();
    await until(() => listener !== undefined);

    await a.return(undefined);
    expect(await aWake).toEqual({ done: true, value: undefined });
    expect(fake.closeCount).toBe(0);

    listener!("rename", "boards/g/object");
    expect(await bWake).toEqual({ done: false, value: undefined });
    expect(starts).toBe(1);

    const c = store.hint()[Symbol.asyncIterator]();
    const cWake = c.next();
    listener!("change", "boards/g/other");
    expect(await cWake).toEqual({ done: false, value: undefined });
    expect(starts).toBe(1);

    await b.return(undefined);
    await c.return(undefined);
    expect(fake.closeCount).toBe(1);

    listener!("rename", "boards/g/late");
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(await b.next()).toEqual({ done: true, value: undefined });
  });

  it("releases the shared watcher immediately when an abort lands while the iterator sits at a yield", async () => {
    const fake = new FakeWatcher();
    let listener: ((eventType: string, filename: string | Buffer | null) => void) | undefined;
    let starts = 0;
    const store = new FsStore(await tempRoot(), {
      hintDebounceMs: 2,
      watchFactory: (_path, options, callback) => {
        starts++;
        expect(options).toEqual({ recursive: true });
        listener = callback;
        return fake as unknown as FSWatcher;
      },
    });
    const abort = new AbortController();
    const abandoned = store.hint(abort.signal)[Symbol.asyncIterator]();
    const first = abandoned.next();
    await until(() => listener !== undefined);
    listener!("rename", "boards/g/first");
    expect(await first).toEqual({ done: false, value: undefined });

    // The iterator is now parked at a yield. The abort must release the
    // watcher (observable pin: watcher close and a fresh watchFactory start)
    // without this iterator ever being resumed or returned again.
    abort.abort();
    await expect(Promise.race([
      until(() => fake.closeCount === 1).then(() => "released"),
      rejectAfter(250, "abort left the shared watcher attached"),
    ])).resolves.toBe("released");
    expect(starts).toBe(1);

    const follow = store.hint()[Symbol.asyncIterator]();
    const followWake = follow.next();
    await until(() => starts === 2);
    listener!("rename", "boards/g/second");
    expect(await followWake).toEqual({ done: false, value: undefined });
    await follow.return(undefined);
    expect(fake.closeCount).toBe(2);
  });

  it("keeps a concurrent hint consumer and the shared watcher working after an abort lands at a yield", async () => {
    const fake = new FakeWatcher();
    let listener: ((eventType: string, filename: string | Buffer | null) => void) | undefined;
    const store = new FsStore(await tempRoot(), {
      hintDebounceMs: 2,
      watchFactory: (_path, _options, callback) => {
        listener = callback;
        return fake as unknown as FSWatcher;
      },
    });
    const abort = new AbortController();
    const abandoned = store.hint(abort.signal)[Symbol.asyncIterator]();
    const survivor = store.hint()[Symbol.asyncIterator]();
    const first = abandoned.next();
    const survivorWake = survivor.next();
    await until(() => listener !== undefined);
    listener!("rename", "boards/g/first");
    expect(await first).toEqual({ done: false, value: undefined });
    expect(await survivorWake).toEqual({ done: false, value: undefined });
    const survivorNext = survivor.next();

    // Aborted while parked at a yield and never touched again; the survivor
    // must still receive a subsequent filesystem-triggered hint.
    abort.abort();
    expect(fake.closeCount).toBe(0);
    listener!("rename", "boards/g/second");
    expect(await Promise.race([
      survivorNext,
      rejectAfter(250, "survivor missed its wake after a sibling abort"),
    ])).toEqual({ done: false, value: undefined });

    // The aborted registration was released at abort time, so closing the
    // survivor is what shuts the shared watcher down.
    await survivor.return(undefined);
    await expect(Promise.race([
      until(() => fake.closeCount === 1).then(() => "released"),
      rejectAfter(250, "aborted consumer kept the watcher registered"),
    ])).resolves.toBe("released");
  });

  it("releases the watcher when a consumer aborts before its first next()", async () => {
    const fake = new FakeWatcher();
    let listener: ((eventType: string, filename: string | Buffer | null) => void) | undefined;
    let starts = 0;
    const store = new FsStore(await tempRoot(), {
      hintDebounceMs: 2,
      watchFactory: (_path, options, callback) => {
        starts++;
        expect(options).toEqual({ recursive: true });
        listener = callback;
        return fake as unknown as FSWatcher;
      },
    });

    // The abort lands after hint() returns but before the first next()
    // starts the generator body. The body still runs when the caller
    // iterates, and it must not leave the already-stopped consumer
    // registered — otherwise its idempotent close would never fire onClose
    // and the shared watcher would stay attached for the process lifetime.
    const abort = new AbortController();
    const abandoned = store.hint(abort.signal)[Symbol.asyncIterator]();
    abort.abort();
    expect(await abandoned.next()).toEqual({ done: true, value: undefined });
    await expect(Promise.race([
      until(() => fake.closeCount === 1).then(() => "released"),
      rejectAfter(250, "pre-iteration abort left the shared watcher attached"),
    ])).resolves.toBe("released");
    expect(starts).toBe(1);

    // A later consumer must still get hints from a fresh watcher start.
    const survivor = store.hint()[Symbol.asyncIterator]();
    const survivorWake = survivor.next();
    await until(() => starts === 2);
    listener!("rename", "boards/g/after");
    expect(await Promise.race([
      survivorWake,
      rejectAfter(250, "survivor missed its wake after a pre-iteration abort"),
    ])).toEqual({ done: false, value: undefined });
    await survivor.return(undefined);
    expect(fake.closeCount).toBe(2);
  });

  it("refuses to root a recursive hint watcher at a symlink", async () => {
    const real = await tempRoot();
    const parent = await tempRoot();
    const linked = join(parent, "linked-root");
    await symlink(real, linked);
    let started = false;
    const store = new FsStore(linked, {
      watchFactory: () => { started = true; return new FakeWatcher() as unknown as FSWatcher; },
    });
    await expect(store.hint()[Symbol.asyncIterator]().next()).rejects.toBeInstanceOf(TypeError);
    expect(started).toBe(false);
  });
});

class FakeWatcher extends EventEmitter {
  closeCount = 0;
  close(): void {
    this.closeCount++;
    this.emit("close");
  }
}

async function until(check: () => boolean): Promise<void> {
  for (let i = 0; i < 100 && !check(); i++) await new Promise((resolve) => setTimeout(resolve, 1));
  if (!check()) throw new Error("condition was not reached");
}

function rejectAfter(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms));
}

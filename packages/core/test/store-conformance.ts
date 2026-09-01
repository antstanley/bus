// The contract every Store backend must pass. Import and call from a
// backend's own test file:
//
//   import { storeConformance } from "@board/core/test/store-conformance";
//   storeConformance("fs", async () => ({ store: new FsStore(dir), cleanup: () => rm(dir) }));

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { type Store, KeyExistsError, listAll, encoder, decoder } from "../src/index.ts";

export interface Harness {
  store: Store;
  cleanup?: () => Promise<void> | void;
}

export function storeConformance(name: string, factory: () => Promise<Harness> | Harness): void {
  describe(`Store conformance: ${name}`, () => {
    let h: Harness;
    let s: Store;
    beforeEach(async () => { h = await factory(); s = h.store; });
    afterEach(async () => { await h.cleanup?.(); });

    it("get of a missing key is null", async () => {
      expect(await s.get("nope/missing.json")).toBeNull();
    });

    it("put then get round-trips text and bytes", async () => {
      await s.put("a/b/c.txt", "héllo");
      expect(decoder.decode((await s.get("a/b/c.txt"))!)).toBe("héllo");
      const bin = new Uint8Array([0, 1, 2, 255, 254, 10, 13]);
      await s.put("a/bin", bin);
      expect(Array.from((await s.get("a/bin"))!)).toEqual(Array.from(bin));
    });

    it("plain put overwrites", async () => {
      await s.put("k", "1");
      await s.put("k", "2");
      expect(decoder.decode((await s.get("k"))!)).toBe("2");
    });

    it("ifNoneMatch fails with KeyExistsError on an existing key and leaves it intact", async () => {
      await s.put("imm/x.json", "first", { ifNoneMatch: true });
      let err: unknown;
      try { await s.put("imm/x.json", "second", { ifNoneMatch: true }); } catch (e) { err = e; }
      expect(err).toBeInstanceOf(KeyExistsError);
      expect((err as KeyExistsError).key).toBe("imm/x.json");
      expect(decoder.decode((await s.get("imm/x.json"))!)).toBe("first");
    });

    it("list is recursive, prefix-filtered, lexicographically ordered", async () => {
      for (const k of ["p/2026-09-02/b", "p/2026-09-01/z", "p/2026-09-01/a", "q/other", "p/2026-09-01/m", "pz"]) await s.put(k, k);
      const r = await s.list("p/");
      expect(r.keys).toEqual(["p/2026-09-01/a", "p/2026-09-01/m", "p/2026-09-01/z", "p/2026-09-02/b"]);
      expect(r.truncated).toBe(false);
    });

    it("prefix need not end on a separator", async () => {
      for (const k of ["p/2026-09-01/a", "p/2026-09-02/b", "p/2026-10-01/c"]) await s.put(k, k);
      expect((await s.list("p/2026-09")).keys).toEqual(["p/2026-09-01/a", "p/2026-09-02/b"]);
    });

    it("after is a full key and exclusive; spans buckets", async () => {
      for (const k of ["p/d1/a", "p/d1/b", "p/d2/a", "p/d3/a"]) await s.put(k, k);
      expect((await s.list("p/", { after: "p/d1/b" })).keys).toEqual(["p/d2/a", "p/d3/a"]);
      expect((await s.list("p/", { after: "p/d1/aa" })).keys).toEqual(["p/d1/b", "p/d2/a", "p/d3/a"]);
      expect((await s.list("p/", { after: "p/d9/z" })).keys).toEqual([]);
      expect((await s.list("p/", { after: "p/" })).keys).toHaveLength(4);
    });

    it("limit and truncated allow paging to completion", async () => {
      const all = Array.from({ length: 23 }, (_, i) => `pg/${String(i).padStart(3, "0")}`);
      for (const k of all) await s.put(k, k);
      const first = await s.list("pg/", { limit: 10 });
      expect(first.keys).toEqual(all.slice(0, 10));
      expect(first.truncated).toBe(true);
      const paged: string[] = [];
      for await (const k of listAll(s, "pg/", undefined, 7)) paged.push(k);
      expect(paged).toEqual(all);
      const exact = await s.list("pg/", { limit: 23 });
      expect(exact.truncated).toBe(false);
    });

    it("empty prefix / unknown prefix", async () => {
      expect((await s.list("zzz/")).keys).toEqual([]);
      await s.put("x/1", "1");
      expect((await s.list("")).keys).toContain("x/1");
    });

    it("concurrent puts of distinct keys all land", async () => {
      const ks = Array.from({ length: 50 }, (_, i) => `conc/${String(i).padStart(2, "0")}`);
      await Promise.all(ks.map((k) => s.put(k, encoder.encode(k), { ifNoneMatch: true })));
      expect((await s.list("conc/")).keys).toEqual(ks);
      for (const k of ks) expect(decoder.decode((await s.get(k))!)).toBe(k);
    });

    it("concurrent ifNoneMatch on the same key: exactly one wins", async () => {
      const results = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => s.put("race/k", String(i), { ifNoneMatch: true })));
      const ok = results.filter((r) => r.status === "fulfilled");
      const failed = results.filter((r) => r.status === "rejected");
      expect(ok).toHaveLength(1);
      expect(failed.every((r) => (r as PromiseRejectedResult).reason instanceof KeyExistsError)).toBe(true);
    });

    it("delete (if supported) removes the key", async () => {
      if (!s.delete) return;
      await s.put("del/k", "v");
      await s.delete("del/k");
      expect(await s.get("del/k")).toBeNull();
      expect((await s.list("del/")).keys).toEqual([]);
    });

    it("changes (if supported) reports keys written since a token", async () => {
      if (!s.changes) return;
      const { token } = await s.changes();
      await s.put("ch/a", "a");
      await s.put("ch/b", "b");
      const ch = await s.changes(token);
      expect(ch.keys.sort()).toEqual(expect.arrayContaining(["ch/a", "ch/b"]));
      const again = await s.changes(ch.token);
      expect(again.keys.filter((k) => k.startsWith("ch/"))).toEqual([]);
    });
  });
}

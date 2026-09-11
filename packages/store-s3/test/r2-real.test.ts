import { afterEach, describe, expect, it, setDefaultTimeout } from "bun:test";
import { decoder, KeyExistsError, listAll } from "@board/core";
import { storeConformance } from "@board/core/test/store-conformance";
import { S3Store, type S3Fetch, type S3StoreOptions } from "../src/index.ts";

/**
 * Real-Cloudflare-R2 conformance for S3Store (task 406). Env-gated like
 * s3-real.test.ts; there is no auto-start because R2 is a hosted service.
 *
 * STATUS: R2 live acceptance is BLOCKED pending authorized test
 * account/bucket setup. The required environment variable names are listed in
 * docs/guides/r2-minio-conformance.md. Values are never printed.
 *
 * Gate:
 *   BOARD_R2_INTEGRATION=1
 *   BOARD_R2_TEST_BUCKET          (required with the gate)
 *   BOARD_R2_TEST_ENDPOINT        (required with the gate; the account S3 endpoint)
 *   BOARD_R2_TEST_ACCESS_KEY_ID   (or ambient S3_ACCESS_KEY_ID)
 *   BOARD_R2_TEST_SECRET_ACCESS_KEY (or ambient S3_SECRET_ACCESS_KEY)
 *   BOARD_R2_TEST_PREFIX          (optional, default "board-tests/r2")
 *   BOARD_R2_TEST_REGION          (optional, default "auto")
 */

interface R2Target {
  bucket: string;
  endpoint: string;
  region: string;
  prefix: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

function resolveTarget(): { target: R2Target } | { reason: string } {
  if (Bun.env.BOARD_R2_INTEGRATION !== "1") {
    return { reason: "R2 live acceptance is BLOCKED pending authorized test account/bucket setup (task 406); set BOARD_R2_INTEGRATION=1 plus BOARD_R2_TEST_* to enable — see docs/guides/r2-minio-conformance.md" };
  }
  const missing: string[] = [];
  if (!Bun.env.BOARD_R2_TEST_BUCKET) missing.push("BOARD_R2_TEST_BUCKET");
  if (!Bun.env.BOARD_R2_TEST_ENDPOINT) missing.push("BOARD_R2_TEST_ENDPOINT");
  const hasExplicitCredentials = Boolean(Bun.env.BOARD_R2_TEST_ACCESS_KEY_ID) && Boolean(Bun.env.BOARD_R2_TEST_SECRET_ACCESS_KEY);
  const hasAmbientCredentials = Boolean(Bun.env.S3_ACCESS_KEY_ID) && Boolean(Bun.env.S3_SECRET_ACCESS_KEY);
  if (!hasExplicitCredentials && !hasAmbientCredentials) {
    missing.push("BOARD_R2_TEST_ACCESS_KEY_ID and BOARD_R2_TEST_SECRET_ACCESS_KEY (or ambient S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY)");
  }
  if (missing.length > 0) return { reason: `BOARD_R2_INTEGRATION=1 is set but missing: ${missing.join(", ")}` };
  const target: R2Target = {
    bucket: Bun.env.BOARD_R2_TEST_BUCKET!,
    endpoint: Bun.env.BOARD_R2_TEST_ENDPOINT!,
    region: Bun.env.BOARD_R2_TEST_REGION ?? "auto",
    prefix: Bun.env.BOARD_R2_TEST_PREFIX ?? "board-tests/r2",
  };
  if (hasExplicitCredentials) {
    // Presence verified by hasExplicitCredentials above.
    target.accessKeyId = Bun.env.BOARD_R2_TEST_ACCESS_KEY_ID!;
    target.secretAccessKey = Bun.env.BOARD_R2_TEST_SECRET_ACCESS_KEY!;
  }
  return { target };
}

const resolved = resolveTarget();

function isNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { status?: unknown; statusCode?: unknown; code?: unknown; name?: unknown };
  return value.status === 404 || value.statusCode === 404 || value.code === "NoSuchKey" || value.code === "NotFound" || value.name === "NotFound";
}

if ("reason" in resolved) {
  describe.skip(`Store conformance: r2 real (${resolved.reason})`, () => {
    it("gate R2 live acceptance with BOARD_R2_INTEGRATION=1 and BOARD_R2_TEST_*", () => {});
  });
} else {
  const t = resolved.target;
  setDefaultTimeout(120_000);

  function storeOptions(prefix: string): S3StoreOptions {
    const opts: S3StoreOptions = {
      bucket: t.bucket,
      endpoint: t.endpoint,
      region: t.region,
      prefix,
    };
    if (t.accessKeyId !== undefined) opts.accessKeyId = t.accessKeyId;
    if (t.secretAccessKey !== undefined) opts.secretAccessKey = t.secretAccessKey;
    return opts;
  }

  storeConformance("r2 real", () => {
    const store = new S3Store(storeOptions(`${t.prefix}/${crypto.randomUUID()}`));
    return {
      store,
      cleanup: async () => {
        // A timed-out test can leave uploads settling while afterEach begins.
        // Sweep twice and tolerate objects another request already removed.
        for (let pass = 0; pass < 2; pass++) {
          const keys: string[] = [];
          for await (const key of listAll(store, "")) keys.push(key);
          await Promise.all(keys.map(async (key) => {
            try { await store.delete(key); } catch (error) {
              if (!isNotFound(error)) throw error;
            }
          }));
        }
      },
    };
  });

  /** Counts conditional (If-None-Match: *) requests issued through S3Store's injectable fetch. */
  function conditionalLog(): { requests: number[]; fetch: S3Fetch } {
    const requests: number[] = [];
    const fetch: S3Fetch = async (input, init) => {
      if (new Headers(init?.headers).get("If-None-Match") === "*") {
        const response = await globalThis.fetch(input, init);
        requests.push(response.status);
        return response;
      }
      return globalThis.fetch(input, init);
    };
    return { requests, fetch };
  }

  const probeStores: S3Store[] = [];
  function probeStore(options: S3StoreOptions): S3Store {
    const store = new S3Store(options);
    probeStores.push(store);
    return store;
  }
  describe("R2 conditional put probe", () => {
    afterEach(async () => {
      for (const store of probeStores.splice(0)) {
        for await (const key of listAll(store, "")) await store.delete(key);
      }
    });
    // Whether R2 honours If-None-Match: * natively is UNVERIFIED (no live R2
    // access; provider docs were not consultable while authoring — see
    // docs/guides/r2-minio-conformance.md). These tests therefore assert the
    // provider-independent contract — ifNoneMatch is atomic for the caller,
    // whichever strategy S3Store auto-selects — and RECORD the selected
    // strategy for the task 406 live-acceptance run.

    it("ifNoneMatch is atomic for the caller: exactly one winner, value intact", async () => {
      const store = probeStore(storeOptions(`${t.prefix}/${crypto.randomUUID()}`));
      const results = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => store.put("probe/race", String(i), { ifNoneMatch: true })));
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((r) => r.status === "rejected").every((r) => r.reason instanceof KeyExistsError)).toBe(true);
      expect(decoder.decode((await store.get("probe/race"))!)).toBe(String(results.findIndex((r) => r.status === "fulfilled")));
    });

    it("records which conditional-put strategy auto selected", async () => {
      const log = conditionalLog();
      const store = probeStore({ ...storeOptions(`${t.prefix}/${crypto.randomUUID()}`), fetch: log.fetch });
      await store.put("probe/auto", "first", { ifNoneMatch: true });
      await expect(store.put("probe/auto", "second", { ifNoneMatch: true })).rejects.toBeInstanceOf(KeyExistsError);
      expect(decoder.decode((await store.get("probe/auto"))!)).toBe("first");
      // native: 2 auto-probe requests + 1 write + 1 rejected duplicate = 4;
      // fallback: the probe can issue 0–2 requests before exists+write.
      const strategy = log.requests.length >= 3 ? "native" : "fallback";
      const statuses = log.requests.join(",");
      expect(["native", "fallback"]).toContain(strategy);
      console.info(`[r2-real] auto selected ${strategy} conditional PUT (conditional statuses: ${statuses || "none"})`);
    });

    it("auto probe objects never leak into list results", async () => {
      const store = probeStore(storeOptions(`${t.prefix}/${crypto.randomUUID()}`));
      await store.put("visible/key", "v", { ifNoneMatch: true });
      const keys: string[] = [];
      for await (const key of listAll(store, "")) keys.push(key);
      expect(keys).toEqual(["visible/key"]);
      expect(keys.some((key) => key.includes("__board_internal__"))).toBe(false);
    });
  });
}

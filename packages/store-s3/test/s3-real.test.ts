import { describe, it, setDefaultTimeout } from "bun:test";
import { listAll } from "@board/core";
import { storeConformance } from "@board/core/test/store-conformance";
import { S3Store } from "../src/index.ts";

const bucket = Bun.env.BOARD_S3_INTEGRATION === "1" ? Bun.env.BOARD_S3_TEST_BUCKET : undefined;

if (bucket) {
  setDefaultTimeout(120_000);
  storeConformance("s3 real", () => {
    const store = new S3Store({
      bucket,
      prefix: `${Bun.env.BOARD_S3_TEST_PREFIX ?? "board-tests"}/${crypto.randomUUID()}`,
    });
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
} else {
  describe.skip("Store conformance: s3 real", () => {
    it("set BOARD_S3_INTEGRATION=1 and BOARD_S3_TEST_BUCKET to enable", () => {});
  });
}

function isNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { status?: unknown; statusCode?: unknown; code?: unknown; name?: unknown };
  return value.status === 404 || value.statusCode === 404 || value.code === "NoSuchKey" || value.code === "NotFound" || value.name === "NotFound";
}

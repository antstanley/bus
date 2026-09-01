import { describe, expect, it } from "bun:test";
import { decoder, KeyExistsError } from "@board/core";
import { storeConformance } from "@board/core/test/store-conformance";
import {
  S3Store,
  type S3ClientLike,
  type S3Fetch,
} from "../src/index.ts";

storeConformance("s3 fake", () => {
  const backend = new FakeS3();
  return { store: new S3Store({ bucket: "test", prefix: "/suite/", client: backend, fetch: backend.fetch }) };
});

describe("S3Store", () => {
  it("maps logical keys through a normalized namespace prefix", async () => {
    const backend = new FakeS3();
    const store = new S3Store({ bucket: "test", prefix: "/boards/demo/", client: backend, fetch: backend.fetch });
    await store.put("a/message", "hello");
    expect(decoder.decode((await store.get("a/message"))!)).toBe("hello");
    expect([...backend.objects.keys()]).toEqual(["boards/demo/a/message"]);
    expect((await store.list("a/")).keys).toEqual(["a/message"]);
  });

  it("uses an atomic If-None-Match conditional request when presigning is available", async () => {
    const backend = new FakeS3();
    const store = new S3Store({ bucket: "test", client: backend, fetch: backend.fetch });
    await store.put("immutable", "first", { ifNoneMatch: true });
    await expect(store.put("immutable", "second", { ifNoneMatch: true })).rejects.toBeInstanceOf(KeyExistsError);
    expect(decoder.decode((await store.get("immutable"))!)).toBe("first");
    expect(backend.conditionalRequests).toBe(2);
    expect(backend.writeRequests).toBe(0);
  });

  it("falls back to serialized exists plus write when conditional PUT is unavailable", async () => {
    const backend = new FakeS3(false);
    const store = new S3Store({ bucket: "test", client: backend });
    const results = await Promise.allSettled(Array.from({ length: 5 }, (_, i) => store.put("same", String(i), { ifNoneMatch: true })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected").every((r) => r.reason instanceof KeyExistsError)).toBe(true);
  });

  it("returns null only for missing-object errors", async () => {
    const backend = new FakeS3();
    const store = new S3Store({ bucket: "test", client: backend, fetch: backend.fetch });
    expect(await store.get("missing")).toBeNull();
    backend.readError = Object.assign(new Error("unavailable"), { status: 503 });
    await expect(store.get("x")).rejects.toThrow("unavailable");
  });
});

class FakeS3 implements S3ClientLike {
  readonly objects = new Map<string, Uint8Array>();
  readonly fetch: S3Fetch;
  conditionalRequests = 0;
  writeRequests = 0;
  readError: Error | null = null;
  presign?: (path: string) => string;

  constructor(withConditional = true) {
    if (withConditional) this.presign = (path) => `fake-s3://${encodeURIComponent(path)}`;
    this.fetch = async (input, init) => {
      this.conditionalRequests++;
      const key = decodeURIComponent(String(input).slice("fake-s3://".length));
      expect(init?.headers).toEqual({ "If-None-Match": "*" });
      if (this.objects.has(key)) return new Response("exists", { status: 412 });
      // Reserve before reading the async body, mirroring S3's atomic
      // If-None-Match decision under concurrent requests.
      this.objects.set(key, new Uint8Array());
      const bytes = new Uint8Array(await new Response(init?.body).arrayBuffer());
      this.objects.set(key, bytes);
      return new Response(null, { status: 200 });
    };
  }

  file(path: string): { arrayBuffer(): Promise<ArrayBuffer> } {
    return {
      arrayBuffer: async () => {
        if (this.readError) throw this.readError;
        const bytes = this.objects.get(path);
        if (!bytes) throw Object.assign(new Error("missing"), { status: 404 });
        return bytes.slice().buffer as ArrayBuffer;
      },
    };
  }

  async write(path: string, body: string | Uint8Array): Promise<number> {
    this.writeRequests++;
    const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body.slice();
    // Yield once so fallback concurrency tests exercise serialization.
    await Promise.resolve();
    this.objects.set(path, bytes);
    return bytes.byteLength;
  }

  async exists(path: string): Promise<boolean> {
    await Promise.resolve();
    return this.objects.has(path);
  }

  async delete(path: string): Promise<void> {
    this.objects.delete(path);
  }

  async list(input: { prefix?: string; startAfter?: string; maxKeys?: number } = {}): Promise<{
    contents: Array<{ key: string }>;
    isTruncated: boolean;
  }> {
    // Cap fake pages below S3's limit so conformance exercises pagination.
    const limit = Math.min(input.maxKeys ?? 1_000, 7);
    const all = [...this.objects.keys()]
      .filter((key) => key.startsWith(input.prefix ?? "") && (input.startAfter === undefined || key > input.startAfter))
      .sort();
    return {
      contents: all.slice(0, limit).map((key) => ({ key })),
      isTruncated: all.length > limit,
    };
  }
}

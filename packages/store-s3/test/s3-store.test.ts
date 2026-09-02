import { describe, expect, it } from "bun:test";
import { decoder, KeyExistsError } from "@board/core";
import { storeConformance } from "@board/core/test/store-conformance";
import {
  S3Store,
  S3StoreError,
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
    const store = new S3Store({ bucket: "test", prefix: "/boards//demo/", client: backend, fetch: backend.fetch });
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
    expect(backend.conditionalRequests).toBe(4); // two probe requests + two writes
    expect(backend.writeRequests).toBe(0);
  });

  it("detects providers that silently ignore If-None-Match and falls back", async () => {
    const backend = new FakeS3(true, "ignore");
    const store = new S3Store({ bucket: "test", client: backend, fetch: backend.fetch });
    await store.put("immutable", "first", { ifNoneMatch: true });
    await expect(store.put("immutable", "second", { ifNoneMatch: true })).rejects.toBeInstanceOf(KeyExistsError);
    expect(decoder.decode((await store.get("immutable"))!)).toBe("first");
    expect(backend.conditionalRequests).toBe(2);
    expect(backend.writeRequests).toBe(1);
  });

  it("memoizes unsupported conditional responses", async () => {
    for (const mode of ["unsupported405", "unsupported501"] as const) {
      const backend = new FakeS3(true, mode);
      const store = new S3Store({ bucket: "test", client: backend, fetch: backend.fetch });
      await store.put("a", "a", { ifNoneMatch: true });
      await store.put("b", "b", { ifNoneMatch: true });
      expect(backend.conditionalRequests).toBe(1);
      expect(backend.writeRequests).toBe(2);
    }
  });

  it("retries 409 conflicts four times with fresh requests", async () => {
    const backend = new FakeS3(true, "enforce");
    backend.conflictsRemaining = 3;
    const store = new S3Store({ bucket: "test", client: backend, fetch: backend.fetch, conditionalPut: "native" });
    await store.put("eventual", "ok", { ifNoneMatch: true });
    expect(backend.conditionalRequests).toBe(4);

    const exhausted = new FakeS3(true, "enforce");
    exhausted.conflictsRemaining = 4;
    const failing = new S3Store({ bucket: "test", client: exhausted, fetch: exhausted.fetch, conditionalPut: "native" });
    await expect(failing.put("eventual", "no", { ifNoneMatch: true })).rejects.toMatchObject({ name: "S3StoreError", status: 409 });
    expect(exhausted.conditionalRequests).toBe(4);
  });

  it("uses opaque continuation tokens and accepts a zero list limit", async () => {
    const backend = new FakeS3();
    const store = new S3Store({ bucket: "test", client: backend, fetch: backend.fetch });
    for (let i = 0; i < 15; i++) await store.put(`k/${String(i).padStart(2, "0")}`, String(i));
    expect((await store.list("k/", { limit: 15 })).keys).toHaveLength(15);
    expect(backend.continuationRequests).toBeGreaterThan(0);
    expect(await store.list("", { limit: 0 })).toEqual({ keys: [], truncated: false });
  });

  it("bounds pagination from a hostile perpetually truncated endpoint", async () => {
    const backend = new EndlessPagingS3();
    const store = new S3Store({ bucket: "test", client: backend });
    await expect(store.list("", { limit: 1 })).rejects.toThrow("pagination exceeded");
    expect(backend.listCalls).toBe(17);

    const repeated = new EndlessPagingS3(true);
    const repeatedStore = new S3Store({ bucket: "test", client: repeated });
    await expect(repeatedStore.list("", { limit: 1 })).rejects.toThrow("repeated a continuation token");
    expect(repeated.listCalls).toBe(2);
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

  it("does not expose sensitive fields from S3 error bodies", async () => {
    const backend = new FakeS3(true, "forbidden");
    const store = new S3Store({ bucket: "test", client: backend, fetch: backend.fetch, conditionalPut: "native" });
    let error: unknown;
    try { await store.put("x", "x", { ifNoneMatch: true }); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(S3StoreError);
    expect((error as Error).message).toContain("SignatureDoesNotMatch: bad signature");
    expect((error as Error).message).not.toContain("DO-NOT-LEAK");
  });
});

type ConditionalMode = "enforce" | "ignore" | "unsupported405" | "unsupported501" | "forbidden";

class FakeS3 implements S3ClientLike {
  readonly objects = new Map<string, Uint8Array>();
  readonly fetch: S3Fetch;
  conditionalRequests = 0;
  continuationRequests = 0;
  writeRequests = 0;
  conflictsRemaining = 0;
  readError: Error | null = null;
  presign?: (path: string) => string;

  constructor(withConditional = true, readonly conditionalMode: ConditionalMode = "enforce") {
    if (withConditional) this.presign = (path) => `fake-s3://${encodeURIComponent(path)}`;
    this.fetch = async (input, init) => {
      this.conditionalRequests++;
      const key = decodeURIComponent(String(input).slice("fake-s3://".length));
      expect(init?.headers).toEqual({ "If-None-Match": "*" });
      if (this.conflictsRemaining > 0) {
        this.conflictsRemaining--;
        return new Response("conflict", { status: 409 });
      }
      if (this.conditionalMode === "unsupported405") return new Response("unsupported", { status: 405 });
      if (this.conditionalMode === "unsupported501") return new Response("unsupported", { status: 501 });
      if (this.conditionalMode === "forbidden") {
        return new Response("<Error><Code>SignatureDoesNotMatch</Code><Message>bad signature</Message><StringToSign>DO-NOT-LEAK</StringToSign></Error>", { status: 403 });
      }
      if (this.conditionalMode === "enforce" && this.objects.has(key)) return new Response("exists", { status: 412 });
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
        if (!bytes) throw Object.assign(new Error("missing"), { code: "NoSuchKey" });
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

  async list(input: { prefix?: string; startAfter?: string; continuationToken?: string; maxKeys?: number } = {}): Promise<{
    contents: Array<{ key: string }>;
    isTruncated: boolean;
    nextContinuationToken?: string;
  }> {
    // Cap fake pages below S3's limit so conformance exercises pagination.
    const limit = Math.min(input.maxKeys ?? 1_000, 7);
    const all = [...this.objects.keys()]
      .filter((key) => key.startsWith(input.prefix ?? ""))
      .sort();
    let offset = 0;
    if (input.continuationToken !== undefined) {
      this.continuationRequests++;
      const match = /^opaque:(\d+)$/.exec(input.continuationToken);
      if (!match) throw new Error("bad continuation token");
      offset = Number(match[1]);
    } else if (input.startAfter !== undefined) {
      offset = all.findIndex((key) => key > input.startAfter!);
      if (offset < 0) offset = all.length;
    }
    const contents = all.slice(offset, offset + limit).map((key) => ({ key }));
    const next = offset + contents.length;
    const response: { contents: Array<{ key: string }>; isTruncated: boolean; nextContinuationToken?: string } = {
      contents,
      isTruncated: next < all.length,
    };
    if (response.isTruncated) response.nextContinuationToken = `opaque:${next}`;
    return response;
  }
}

class EndlessPagingS3 extends FakeS3 {
  listCalls = 0;

  constructor(private readonly repeatToken = false) {
    super(false);
  }

  override async list(): Promise<{
    contents: Array<{ key: string }>;
    isTruncated: boolean;
    nextContinuationToken: string;
  }> {
    this.listCalls++;
    return {
      contents: [],
      isTruncated: true,
      nextContinuationToken: this.repeatToken ? "same-token" : `token-${this.listCalls}`,
    };
  }
}

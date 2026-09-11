import net from "node:net";
import { afterAll, afterEach, describe, expect, it, setDefaultTimeout } from "bun:test";
import { decoder, KeyExistsError, listAll } from "@board/core";
import { storeConformance } from "@board/core/test/store-conformance";
import { S3Store, type S3Fetch, type S3StoreOptions } from "../src/index.ts";

/**
 * Real-MinIO conformance for S3Store (task 406).
 *
 * Two ways to run:
 *  1. External MinIO: set BOARD_MINIO_INTEGRATION=1 and BOARD_MINIO_TEST_BUCKET
 *     (optionally BOARD_MINIO_TEST_ENDPOINT, BOARD_MINIO_TEST_PREFIX,
 *     BOARD_MINIO_TEST_REGION, BOARD_MINIO_TEST_ACCESS_KEY_ID and
 *     BOARD_MINIO_TEST_SECRET_ACCESS_KEY). Credentials fall back to Bun's
 *     ambient S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY environment names, which
 *     is what CI provides. This is the mode the dedicated CI workflow uses.
 *  2. Local auto-start (BOARD_MINIO_INTEGRATION unset): read-only discovery of
 *     docker/podman with an ALREADY-LOCAL minio image (never pulled), or
 *     `minio` and `mc` binaries on PATH. An ephemeral MinIO is started with an ephemeral
 *     host port and a temp data dir and removed afterwards. Nothing is ever
 *     downloaded or pulled.
 *
 * Env var names are documented in docs/guides/r2-minio-conformance.md. Values
 * are never printed.
 */

const PINNED_IMAGE = "minio/minio@sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e"; // RELEASE.2025-09-07T16-13-09Z, same pin as .github/workflows/ci.yml

interface ExternalTarget {
  kind: "external";
  bucket: string;
  endpoint: string;
  region: string;
  prefix: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

interface LocalTarget {
  kind: "local";
  source: string;
  bucket: string;
  endpoint: string;
  region: string;
  prefix: string;
  accessKeyId: string;
  secretAccessKey: string;
  stop: () => Promise<void>;
}

type Target = ExternalTarget | LocalTarget | { kind: "skip"; reason: string };

function randomSuffix(): string {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 12);
}

function exec(rt: string, args: string[]): { success: boolean; stdout: string; stderr: string } {
  const proc = Bun.spawnSync([rt, ...args], { stdout: "pipe", stderr: "pipe" });
  return {
    success: proc.exitCode === 0,
    stdout: new TextDecoder().decode(proc.stdout),
    stderr: new TextDecoder().decode(proc.stderr),
  };
}

async function waitReady(endpoint: string, isAlive: () => boolean): Promise<string | null> {
  for (let attempt = 0; attempt < 45; attempt++) {
    if (!isAlive()) return "MinIO exited before becoming ready";
    try {
      const response = await fetch(`${endpoint}/minio/health/ready`, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return null;
    } catch {
      // not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  return "MinIO did not become ready within 90 seconds";
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => (port > 0 ? resolve(port) : reject(new Error("could not obtain a free port"))));
    });
    server.once("error", reject);
  });
}

/** Ephemeral container with an ephemeral host port and a temp data dir. */
async function startContainer(rt: string, image: string): Promise<LocalTarget> {
  const name = `board-minio-test-${randomSuffix()}`;
  const dataDir = `${import.meta.dir}/.minio-data-${randomSuffix()}`;
  const bucket = `board-minio-test-${randomSuffix()}`;
  await Bun.$`mkdir -p ${dataDir}`.quiet();
  const cleanup = async (): Promise<void> => {
    const removed = exec(rt, ["rm", "--force", "--volumes", name]);
    if (!removed.success && exec(rt, ["container", "inspect", name]).success) throw new Error("could not remove local MinIO container");
    await Bun.$`rm -rf ${dataDir}`.quiet();
  };
  const run = exec(rt, [
    "run", "--detach", "--pull=never",
    "--name", name,
    "--publish", "127.0.0.1::9000",
    "--volume", `${dataDir}:/data`,
    "--env", "MINIO_ROOT_USER=minioadmin",
    "--env", "MINIO_ROOT_PASSWORD=minioadmin",
    image, "server", "/data", "--console-address", ":9001",
  ]);
  if (!run.success) {
    await cleanup();
    throw new Error(`${rt} run failed: ${run.stderr.slice(0, 300)}`);
  }
  try {
    const portOut = exec(rt, ["port", name, "9000/tcp"]);
    const port = Number(portOut.stdout.trim().split(":").pop());
    if (!Number.isInteger(port) || port <= 0) {
      throw new Error(`could not determine the published MinIO port: ${portOut.stdout.trim()}`);
    }
    const endpoint = `http://127.0.0.1:${port}`;
    const notReady = await waitReady(endpoint, () => exec(rt, ["inspect", "--format", "{{.State.Running}}", name]).stdout.trim() === "true");
    if (notReady) throw new Error(notReady);
    // Mirror .github/workflows/ci.yml: explicit alias, then mc mb.
    const alias = exec(rt, ["exec", name, "mc", "alias", "set", "board-minio-test", "http://127.0.0.1:9000", "minioadmin", "minioadmin"]);
    if (!alias.success) throw new Error(`mc alias set failed: ${alias.stderr.slice(0, 300)}`);
    const mb = exec(rt, ["exec", name, "mc", "mb", "--ignore-existing", `board-minio-test/${bucket}`]);
    if (!mb.success) throw new Error(`mc mb failed: ${mb.stderr.slice(0, 300)}`);
    return {
      kind: "local",
      source: `${rt} image ${image}`,
      bucket,
      endpoint,
      region: "us-east-1",
      prefix: "board-tests/minio-local",
      accessKeyId: "minioadmin",
      secretAccessKey: "minioadmin",
      stop: cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

/** Ephemeral binary server; use an already-local mc to create the bucket. */
async function startBinary(binary: string, mc: string): Promise<LocalTarget> {
  const port = await freePort();
  const dataDir = `${import.meta.dir}/.minio-data-${randomSuffix()}`;
  const bucket = `board-minio-test-${randomSuffix()}`;
  const endpoint = `http://127.0.0.1:${port}`;
  await Bun.$`mkdir -p ${dataDir}/data ${dataDir}/mc`.quiet();
  let proc: ReturnType<typeof Bun.spawn> | undefined;
  const stop = async () => {
    if (proc) {
      proc.kill("SIGKILL");
      await proc.exited;
    }
    await Bun.$`rm -rf ${dataDir}`.quiet();
  };
  try {
    proc = Bun.spawn(
      [binary, "server", `${dataDir}/data`, "--address", `127.0.0.1:${port}`, "--console-address", "127.0.0.1:0"],
      { stdout: "ignore", stderr: "ignore", env: { PATH: Bun.env.PATH, MINIO_ROOT_USER: "minioadmin", MINIO_ROOT_PASSWORD: "minioadmin" } },
    );
    const notReady = await waitReady(endpoint, () => proc!.exitCode === null);
    if (notReady) throw new Error(notReady);
    const config = ["--config-dir", `${dataDir}/mc`];
    if (!exec(mc, [...config, "alias", "set", "test", endpoint, "minioadmin", "minioadmin"]).success) throw new Error("mc alias set failed");
    if (!exec(mc, [...config, "mb", `test/${bucket}`]).success) throw new Error("mc mb failed");
    return { kind: "local", source: `${binary} binary`, bucket, endpoint, region: "us-east-1",
      prefix: "board-tests/minio-local", accessKeyId: "minioadmin", secretAccessKey: "minioadmin", stop };
  } catch (error) {
    await stop();
    throw error;
  }
}

async function resolveTarget(): Promise<Target> {
  const gate = Bun.env.BOARD_MINIO_INTEGRATION;
  if (gate === "0") return { kind: "skip", reason: "BOARD_MINIO_INTEGRATION=0 disables this suite" };
  if (gate === "1") {
    const bucket = Bun.env.BOARD_MINIO_TEST_BUCKET;
    if (!bucket) {
      return { kind: "skip", reason: "BOARD_MINIO_INTEGRATION=1 requires BOARD_MINIO_TEST_BUCKET (optionally BOARD_MINIO_TEST_ENDPOINT, BOARD_MINIO_TEST_PREFIX, BOARD_MINIO_TEST_REGION, BOARD_MINIO_TEST_ACCESS_KEY_ID, BOARD_MINIO_TEST_SECRET_ACCESS_KEY)" };
    }
    const accessKeyId = Bun.env.BOARD_MINIO_TEST_ACCESS_KEY_ID;
    const secretAccessKey = Bun.env.BOARD_MINIO_TEST_SECRET_ACCESS_KEY;
    const target: ExternalTarget = {
      kind: "external",
      bucket,
      endpoint: Bun.env.BOARD_MINIO_TEST_ENDPOINT ?? "http://127.0.0.1:9000",
      region: Bun.env.BOARD_MINIO_TEST_REGION ?? "us-east-1",
      prefix: Bun.env.BOARD_MINIO_TEST_PREFIX ?? "board-tests/minio",
    };
    // Credentials default to Bun's ambient S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY.
    if (accessKeyId && secretAccessKey) {
      target.accessKeyId = accessKeyId;
      target.secretAccessKey = secretAccessKey;
    }
    return target;
  }
  if (gate !== undefined) return { kind: "skip", reason: "BOARD_MINIO_INTEGRATION must be 0, 1, or unset" };
  // Auto-start: strictly read-only discovery; never pull or download.
  for (const rt of ["docker", "podman"]) {
    if (!Bun.which(rt)) continue;
    if (!exec(rt, ["info", "--format", "{{.ServerVersion}}"]).success) continue;
    for (const image of [PINNED_IMAGE]) {
      if (!exec(rt, ["image", "inspect", image]).success) continue;
      try {
        return await startContainer(rt, image);
      } catch (error) {
        return { kind: "skip", reason: `local MinIO container could not start: ${error instanceof Error ? error.message : String(error)}` };
      }
    }
  }
  const binary = Bun.which("minio");
  const mc = Bun.which("mc");
  if (binary && mc) {
    try {
      return await startBinary(binary, mc);
    } catch (error) {
      return { kind: "skip", reason: `local MinIO binary could not start: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
  return {
    kind: "skip",
    reason: "no local MinIO: no docker/podman daemon with an already-local minio image (images are never pulled) and no minio + mc binaries on PATH; set BOARD_MINIO_INTEGRATION=1 with BOARD_MINIO_TEST_BUCKET to target a running MinIO",
  };
}

const target = await resolveTarget();

if (target.kind === "skip") {
  describe.skip(`Store conformance: minio real (${target.reason})`, () => {
    it("set BOARD_MINIO_INTEGRATION=1 and BOARD_MINIO_TEST_BUCKET to enable", () => {});
  });
} else {
  const t: ExternalTarget | LocalTarget = target;
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

  function sweepFactory(store: S3Store): () => Promise<void> {
    return async () => {
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
    };
  }

  storeConformance("minio real", () => {
    const store = new S3Store(storeOptions(`${target.prefix}/${crypto.randomUUID()}`));
    return { store, cleanup: sweepFactory(store) };
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
  describe("MinIO conditional put probe", () => {
    afterEach(async () => {
      for (const store of probeStores.splice(0)) {
        for await (const key of listAll(store, "")) await store.delete(key);
      }
    });
    // MinIO implements atomic If-None-Match: * conditional writes; the CI
    // image pin is RELEASE.2025-09-07T16-13-09Z. Current provider
    // documentation was NOT consulted online while authoring this suite
    // (web search unavailable) — the capability itself is verified here
    // against the real server, which is the point of the probe.

    it("auto mode probes once, selects native If-None-Match and keeps duplicates out", async () => {
      const log = conditionalLog();
      const store = probeStore({ ...storeOptions(`${target.prefix}/${crypto.randomUUID()}`), fetch: log.fetch });

      await store.put("probe/auto", "first", { ifNoneMatch: true });
      // 2 auto-probe requests (write 200 + duplicate 412) + the real write.
      expect(log.requests).toEqual([200, 412, 200]);

      await expect(store.put("probe/auto", "second", { ifNoneMatch: true })).rejects.toBeInstanceOf(KeyExistsError);
      expect(log.requests).toEqual([200, 412, 200, 412]);
      expect(decoder.decode((await store.get("probe/auto"))!)).toBe("first");

      // The probe result is memoized: a later ifNoneMatch put costs exactly
      // one conditional request, and a fallback exists+write never happens.
      await store.put("probe/auto2", "third", { ifNoneMatch: true });
      expect(log.requests).toEqual([200, 412, 200, 412, 200]);
    });

    it("explicit native mode surfaces KeyExistsError and preserves the winner", async () => {
      const store = probeStore({ ...storeOptions(`${target.prefix}/${crypto.randomUUID()}`), conditionalPut: "native" });
      await store.put("probe/native", "first", { ifNoneMatch: true });
      await expect(store.put("probe/native", "second", { ifNoneMatch: true })).rejects.toBeInstanceOf(KeyExistsError);
      expect(decoder.decode((await store.get("probe/native"))!)).toBe("first");
    });

    it.each(["auto", "native", "fallback"] as const)("%s mode same-key writers: exactly one winner", async (conditionalPut) => {
      const store = probeStore({ ...storeOptions(`${target.prefix}/${crypto.randomUUID()}`), conditionalPut });
      const results = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => store.put("probe/fallback", String(i), { ifNoneMatch: true })));
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((r) => r.status === "rejected").every((r) => r.reason instanceof KeyExistsError)).toBe(true);
      const keys = (await store.get("probe/fallback"))!;
      expect(decoder.decode(keys)).toBe(String(results.findIndex((r) => r.status === "fulfilled")));
    });

    it("internal probe objects never leak into list results", async () => {
      const store = probeStore(storeOptions(`${target.prefix}/${crypto.randomUUID()}`));
      await store.put("visible/key", "v", { ifNoneMatch: true });
      const keys: string[] = [];
      for await (const key of listAll(store, "")) keys.push(key);
      expect(keys).toEqual(["visible/key"]);
      expect(keys.some((key) => key.includes("__board_internal__"))).toBe(false);
    });
  });

  afterAll(async () => {
    if (t.kind === "local") await t.stop();
  });
}

function isNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { status?: unknown; statusCode?: unknown; code?: unknown; name?: unknown };
  return value.status === 404 || value.statusCode === 404 || value.code === "NoSuchKey" || value.code === "NotFound" || value.name === "NotFound";
}

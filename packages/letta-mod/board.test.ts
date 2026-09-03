import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawn } from "node:child_process";

const repo = join(import.meta.dir, "../..");

interface Registration {
  name?: string;
  id?: string;
  run?: (ctx: any) => Promise<unknown>;
  parameters?: Record<string, unknown>;
  [key: string]: unknown;
}

function loadMod(env: Record<string, string | undefined>) {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(env)) {
    saved[key] = process.env[key];
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key]!;
  }
  return {
    async activate() {
      // Fresh module instance so module-level CONFIG_PATH resolution follows env.
      const mod = await import(`${import.meta.dir}/board.ts?test=${Math.random()}`);
      const handlers: Record<string, any> = {};
      const tools: Registration[] = [];
      const fake = {
        capabilities: { tools: true, events: { turns: true, lifecycle: true } },
        tools: { register: (reg: Registration) => { tools.push(reg); handlers[reg.name!] = reg.run; return () => {}; } },
        events: { on: (name: string, handler: any) => { handlers[name] = handler; return () => {}; } },
        diagnostics: { report: () => {} },
      };
      const dispose = mod.default(fake);
      return {
        tools,
        handler: (name: string) => handlers[name]!,
        dispose,
      };
    },
    restore() {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    },
  };
}

async function seedMention(storeDir: string, body: string): Promise<void> {
  execFileSync("bun", [
    join(repo, "packages/cli/src/index.ts"), "post",
    "--store", `fs:${storeDir}`, "--board", "general", "--as", "claude",
    "--mentions", "letta", "--body", body,
  ], { timeout: 30_000 });
}

async function writeConfig(root: string, extra: Record<string, unknown> = {}): Promise<string> {
  const configPath = join(root, "config.json");
  await writeFile(configPath, JSON.stringify({
    repo,
    store: `fs:${join(root, "store")}`,
    boards: ["general"],
    as: "letta",
    indexPath: join(root, "index.sqlite"),
    ...extra,
  }));
  return configPath;
}

/** Assert content is a valid host shape: an array of typed text parts only. */
function expectTypedParts(content: unknown): void {
  expect(Array.isArray(content)).toBe(true);
  for (const part of content as Array<{ type?: unknown; text?: unknown }>) {
    expect(part && typeof part === "object").toBe(true);
    expect(part.type).toBe("text");
    expect(typeof part.text).toBe("string");
  }
}

describe("board letta mod", () => {
  test("registers the three board tools with object schemas", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-mod-test-"));
    const mod = loadMod({ BOARD_CONFIG: join(root, "config.json"), BOARD_STORE: undefined });
    try {
      const { tools } = await mod.activate();
      expect(tools.map((tool) => tool.name).sort()).toEqual(["board_post", "board_read", "board_who"]);
      for (const tool of tools) {
        expect((tool.parameters as any)?.type).toBe("object");
        expect((tool.parameters as any)?.additionalProperties).toBe(false);
        expect(typeof tool.description).toBe("string");
      }
      const post = tools.find((tool) => tool.name === "board_post")!;
      expect(Object.keys((post.parameters as any).properties)).toEqual(["body", "title", "mentions"]);
    } finally {
      mod.restore();
      await rm(root, { recursive: true, force: true });
    }
  });

  test("turn_start injects unread once (claim-once) into typed content parts", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-mod-test-"));
    const configPath = await writeConfig(root);
    await seedMention(join(root, "store"), "mod test mention");
    const mod = loadMod({ BOARD_CONFIG: configPath });
    try {
      const { handler } = await mod.activate();
      const first: any = { input: [{ role: "user", content: "hello" }] };
      await handler("turn_start")(first, {});
      // Host shape: string content must be normalized to typed text parts,
      // never a mixed [string, part] array.
      expectTypedParts(first.input[0].content);
      const text = JSON.stringify(first.input);
      expect(text).toContain("board-messages");
      expect(text).toContain("UNTRUSTED CONTENT FROM claude");
      expect(text).toContain("mod test mention");

      const second: any = { input: [{ role: "user", content: "again" }] };
      await handler("turn_start")(second, {});
      expect(second.input[0].content).toBe("again");

      // Injection onto already-typed array content appends a typed part.
      await seedMention(join(root, "store"), "second mention for array content");
      const third: any = { input: [{ role: "user", content: [{ type: "text", text: "array start" }] }] };
      await handler("turn_start")(third, {});
      expectTypedParts(third.input[0].content);
      expect((third.input[0].content as unknown[]).length).toBe(2);
      expect((third.input[0].content as Array<{ text: string }>)[0].text).toBe("array start");
      expect(JSON.stringify(third.input)).toContain("second mention for array content");
    } finally {
      mod.restore();
      await rm(root, { recursive: true, force: true });
    }
  });

  test("BOARD_STORE env wins over the config file store", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-mod-test-"));
    const configPath = await writeConfig(root, { store: `fs:${join(root, "store-from-config")}`, indexPath: join(root, "index-env.sqlite") });
    const envStore = `fs:${join(root, "store-from-env")}`;
    await seedMention(join(root, "store-from-env"), "env store mention");
    const mod = loadMod({ BOARD_CONFIG: configPath, BOARD_STORE: envStore });
    try {
      const { handler } = await mod.activate();
      const first: any = { input: [{ role: "user", content: "hi" }] };
      await handler("turn_start")(first, {});
      expect(JSON.stringify(first.input)).toContain("env store mention");
      await expect(handler("board_read")({ args: { limit: 5 } }, {})).resolves.toContain("env store mention");
    } finally {
      mod.restore();
      await rm(root, { recursive: true, force: true });
    }
  });

  test("board_post preserves multiline bodies (--body, not split argv)", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-mod-test-"));
    const configPath = await writeConfig(root);
    const mod = loadMod({ BOARD_CONFIG: configPath });
    try {
      const { handler } = await mod.activate();
      const body = "first line\nsecond line\n\nfourth after blank";
      await handler("board_post")({ args: { body, title: "multiline" } }, {});
      const raw = String(await handler("board_read")({ args: { limit: 10 } }, {}));
      const parsed = JSON.parse(raw) as unknown; // must stay valid JSON
      const serialized = JSON.stringify(parsed);
      expect(serialized).toContain("first line\\nsecond line");
      expect(serialized).not.toContain("first line second line");
    } finally {
      mod.restore();
      await rm(root, { recursive: true, force: true });
    }
  });

  test("BOARD_REPO env override is honored and maxAgeMs=0 reaches the CLI argv", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-mod-test-"));
    const fakeRepo = join(root, "fake-repo");
    await mkdir(join(fakeRepo, "packages", "cli", "src"), { recursive: true });
    await writeFile(
      join(fakeRepo, "packages", "cli", "src", "index.ts"),
      "console.log(JSON.stringify(process.argv.slice(1)));\n",
    );
    const mod = loadMod({
      BOARD_CONFIG: join(root, "config.json"), // absent config → env/defaults only
      BOARD_REPO: fakeRepo,
      BOARD_STORE: `fs:${join(root, "store")}`,
    });
    try {
      const { handler } = await mod.activate();
      const out = String(await handler("board_who")({ args: { maxAgeMs: 0 } }, {}));
      const argv = JSON.parse(out) as string[];
      expect(argv[0]).toContain("fake-repo"); // BOARD_REPO picked the echo CLI
      const maxAge = argv.indexOf("--max-age");
      expect(maxAge).toBeGreaterThanOrEqual(0);
      expect(argv[maxAge + 1]).toBe("0"); // 0 must not be rewritten to the 120000 default
    } finally {
      mod.restore();
      await rm(root, { recursive: true, force: true });
    }
  });

  test("missing bun fails with an actionable message; hook degrades silently", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-mod-test-"));
    const mod = loadMod({
      BOARD_CONFIG: join(root, "config.json"), // absent config → defaults
      BOARD_BUN: join(root, "no-such-bun"),
      BOARD_STORE: `fs:${join(root, "store")}`,
    });
    try {
      const { handler } = await mod.activate();
      await expect(handler("board_read")({ args: {} }, {})).rejects.toThrow(/bun not found/);
      const event: any = { input: [{ role: "user", content: "untouched" }] };
      await expect(handler("turn_start")(event, {})).resolves.toBeUndefined();
      expect(event.input[0].content).toBe("untouched");
    } finally {
      mod.restore();
      await rm(root, { recursive: true, force: true });
    }
  });

  test("a genuinely hanging hook is killed by the spawn timeout and never blocks the turn", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-mod-test-"));
    const fakeRepo = join(root, "fake-repo");
    await mkdir(join(fakeRepo, "packages", "hooks", "src"), { recursive: true });
    // A hook that never exits: bun stays alive on the interval until killed.
    await writeFile(join(fakeRepo, "packages", "hooks", "src", "board-hook.ts"), "setInterval(() => {}, 60_000);\n");
    const mod = loadMod({
      BOARD_CONFIG: join(root, "config.json"), // absent config → defaults
      BOARD_REPO: fakeRepo,
      BOARD_STORE: `fs:${join(root, "store")}`,
      BOARD_SPAWN_TIMEOUT_MS: "300",
    });
    try {
      const { handler } = await mod.activate();
      const started = Date.now();
      const event: any = { input: [{ role: "user", content: "still delivered" }] };
      await expect(handler("turn_start")(event, {})).resolves.toBeUndefined();
      // The 300 ms timeout must fire — not the 10 s default — and the turn
      // proceeds with its input untouched.
      expect(Date.now() - started).toBeLessThan(5_000);
      expect(event.input[0].content).toBe("still delivered");
    } finally {
      mod.restore();
      await rm(root, { recursive: true, force: true });
    }
  }, 15_000);

  test("a failing hook yields no injection and does not throw", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-mod-test-"));
    const configPath = await writeConfig(root);
    // Point BOARD_STORE at an unusable store: the hook degrades to empty output.
    const mod = loadMod({ BOARD_CONFIG: configPath, BOARD_STORE: "fs:/nonexistent-board-store-path" });
    try {
      const { handler } = await mod.activate();
      const event: any = { input: [{ role: "user", content: "unaffected" }] };
      await expect(handler("turn_start")(event, {})).resolves.toBeUndefined();
      expect(event.input[0].content).toBe("unaffected");
    } finally {
      mod.restore();
      await rm(root, { recursive: true, force: true });
    }
  });
});

// ─── Timer wake (task 124) ───────────────────────────────────────────────────
//
// These tests drive the opt-in timer with tiny BOARD_TIMER_* knobs: a fake
// conversation handle whose sendMessageStream behavior the test scripts, the
// real repo CLI/hook against temp stores, and the mod's BOARD_TIMER_TRACE
// event log as the deterministic observation point.

interface TraceLine { [key: string]: unknown }

const sleep = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

async function readTrace(path: string): Promise<TraceLine[]> {
  try {
    const raw = await readFile(path, "utf8");
    return raw.split("\n").filter(Boolean).map((line) => JSON.parse(line) as TraceLine);
  } catch {
    return [];
  }
}

async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeoutMs = 15_000,
  what = "condition",
): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (await condition()) return;
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${what}`);
    await sleep(25);
  }
}

function waitForTrace(path: string, predicate: (lines: TraceLine[]) => boolean, what: string): Promise<void> {
  return waitFor(async () => predicate(await readTrace(path)), 15_000, `trace: ${what}`);
}

interface FakeConversation {
  conversation: { id: string; sendMessageStream: (messages: any) => Promise<AsyncIterable<unknown>> };
  calls: Array<Array<{ role: string; content: string }>>;
  drained: boolean[];
}

type SendScript = (attempt: number) => Promise<AsyncIterable<unknown>>;

/** A conversation handle like the host's: sendMessageStream takes an array of
 * messages and returns a promise of an async iterable to drain. `drained[n]`
 * only flips true when the consumer iterated the n-th stream to completion.
 * `id` names the conversation (distinct ids exercise per-conversation
 * scoping; the default matches a legacy host where every handle looks like
 * the same conversation). */
function fakeConversation(script: SendScript, id = "conv-fake"): FakeConversation {
  const calls: Array<Array<{ role: string; content: string }>> = [];
  const drained: boolean[] = [];
  return {
    calls,
    drained,
    conversation: {
      id,
      sendMessageStream(messages: any) {
        const attempt = calls.push(messages);
        drained.push(false);
        return (async () => {
          const stream = await script(attempt);
          return (async function* () {
            for await (const chunk of stream) yield chunk;
            drained[attempt - 1] = true;
          })();
        })();
      },
    },
  };
}

/** Stream that resolves after a tick, yields chunks, then completes. */
function okStream(delayMs = 20): AsyncIterable<{ type: string }> {
  return (async function* () {
    await sleep(delayMs);
    yield { type: "user_message" };
    yield { type: "assistant_message" };
  })();
}

/** Stream that completes cleanly WITHOUT yielding: the drain settles but the
 * run never started server-side, so committing would be a lie. */
function emptyStream(): AsyncIterable<{ type: string }> {
  return (async function* () {})();
}

/** Stream that never yields and never completes (a wedged drain). */
function hangingStream(): AsyncIterable<{ type: string }> {
  return (async function* () {
    await new Promise<never>(() => {});
  })();
}

const conflictError = () =>
  new Error('409 {"error":"Cannot send a new message: Another request (run_id=run-test-1) is currently being processed for this conversation. Please wait for it to complete."}');

function wakeEnv(configPath: string, tracePath: string, extra: Record<string, string | undefined> = {}) {
  return {
    BOARD_CONFIG: configPath,
    BOARD_TIMER_WAKE: "1",
    BOARD_TIMER_POLL_MS: "25",
    BOARD_TIMER_RETRY_MS: "10,10",
    BOARD_TIMER_BACKOFF_CAP_MS: "200",
    BOARD_TIMER_TRACE: tracePath,
    // insulate from operator leftovers
    BOARD_TIMER_LEASE_TTL_MS: undefined,
    BOARD_AS: undefined,
    ...extra,
  };
}

const leasePath = (root: string) => join(root, "index.sqlite.timerwake.json");

async function readLease(root: string): Promise<{ cursor: Record<string, string>; leases: Record<string, unknown>; delivered: Record<string, number>; retry: Record<string, number>; initial: Record<string, boolean> }> {
  const raw = JSON.parse(await readFile(leasePath(root), "utf8"));
  return { cursor: raw.cursor, leases: raw.leases, delivered: raw.delivered, retry: raw.retry ?? {}, initial: raw.initial ?? {} };
}

/** ULID-shaped id (10 Crockford-base32 time chars — the part the timer's
 * baseline filter decodes — plus 16 in-alphabet filler digits) so fake read
 * layers can seed candidates the baseline poll accepts. */
const FAKE_ULID_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
function ulidFromMs(ms: number, fill = 0): string {
  let time = "";
  for (let i = 0; i < 10; i += 1) {
    time = FAKE_ULID_ALPHABET[ms % 32]! + time;
    ms = Math.floor(ms / 32);
  }
  return `${time}${String(fill).padStart(16, "0")}`;
}
function fakeUlid(fill: number): string {
  return ulidFromMs(Date.now(), fill);
}

describe("board letta mod timer wake (task 124)", () => {
  test("sends a pointer-only nudge when idle and a mention is reserved; finalizes the lease", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-mod-wake-"));
    const configPath = await writeConfig(root);
    const tracePath = join(root, "trace.log");
    // The seeded body carries a canary that must never leave the store.
    await seedMention(join(root, "store"), "wake me up — SECRET-CANARY-124 body");
    const mod = loadMod(wakeEnv(configPath, tracePath));
    try {
      const { handler, dispose } = await mod.activate();
      const fake = fakeConversation(() => Promise.resolve(okStream()));
      await handler("conversation_open")({}, { conversation: fake.conversation });
      await waitForTrace(tracePath, (lines) => lines.some((line) => line.event === "send-accepted"), "send-accepted");

      expect(fake.calls.length).toBe(1);
      const sent = fake.calls[0]![0]!;
      expect(sent.role).toBe("user");
      const text = sent.content;
      // Pointer-only: the exact 106 daemon wording, the post id, nothing else.
      expect(text).toContain("A new board post mentions letta (post ");
      expect(text).toContain("). Run board read.");
      expect(text).not.toContain("SECRET-CANARY-124");
      expect(text).not.toContain("wake me up");
      expect(text).not.toContain("UNTRUSTED");
      expect(text).not.toContain("<board-messages");
      // The id in the nudge is the seeded post's id.
      const page = JSON.parse(String(await handler("board_read")({ args: { limit: 10 } }, {})));
      expect(page.posts.length).toBe(1);
      expect(text).toContain(page.posts[0].id);
      // Stream fully drained before the send was treated as accepted.
      expect(fake.drained[0]).toBe(true);
      // Lease finalized: delivered, nothing left reserved.
      await waitFor(async () => {
        try {
          const lease = await readLease(root);
          return lease.delivered[page.posts[0].id] > 0 && Object.keys(lease.leases).length === 0;
        } catch { return false; }
      }, 15_000, "lease commit");
      dispose();
    } finally {
      mod.restore();
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  test("holds while a run is in flight, sends once turn_end marks the session idle", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-mod-wake-"));
    const configPath = await writeConfig(root);
    const tracePath = join(root, "trace.log");
    const mod = loadMod(wakeEnv(configPath, tracePath));
    try {
      const { handler, dispose } = await mod.activate();
      const fake = fakeConversation(() => Promise.resolve(okStream()));
      // Establish that this host emits turn_end: after one, the busy flag gates.
      await handler("turn_end")({}, { conversation: fake.conversation });
      // A turn_start (approval-only shape: no user message) = run in flight.
      // It must capture the handle and set busy without injecting anything.
      await handler("turn_start")({ input: [] }, { conversation: fake.conversation });
      // Only now does the mention arrive — while busy.
      await seedMention(join(root, "store"), "nudge while busy");
      await sleep(300); // several poll periods
      expect(fake.calls.length).toBe(0);
      await waitForTrace(tracePath, (lines) => lines.some((line) => line.event === "hold-busy"), "hold-busy");
      // The run finishes: idle again, the nudge goes out.
      await handler("turn_end")({}, { conversation: fake.conversation });
      await waitForTrace(tracePath, (lines) => lines.some((line) => line.event === "send-accepted"), "send-accepted");
      expect(fake.calls.length).toBe(1);
      dispose();
    } finally {
      mod.restore();
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  test("409 retry: succeeds on the third attempt and commits the lease", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-mod-wake-"));
    const configPath = await writeConfig(root);
    const tracePath = join(root, "trace.log");
    await seedMention(join(root, "store"), "retry me");
    const mod = loadMod(wakeEnv(configPath, tracePath));
    try {
      const { handler, dispose } = await mod.activate();
      const fake = fakeConversation((attempt) => attempt < 3
        ? Promise.reject(conflictError())
        : Promise.resolve(okStream()));
      await handler("conversation_open")({}, { conversation: fake.conversation });
      await waitForTrace(tracePath, (lines) => lines.some((line) => line.event === "send-accepted"), "send-accepted");
      // Exactly three attempts for one mention, then success: two traced
      // 409 errors, the third attempt drained without error.
      expect(fake.calls.length).toBe(3);
      const errors = (await readTrace(tracePath)).filter((line) => line.event === "send-error");
      expect(errors.map((line) => line.attempt)).toEqual([1, 2]);
      for (const line of errors) expect(line.kind).toBe("conflict");
      const page = JSON.parse(String(await handler("board_read")({ args: { limit: 10 } }, {})));
      const id = page.posts[0].id;
      await waitFor(async () => {
        try {
          const lease = await readLease(root);
          return lease.delivered[id] > 0 && Object.keys(lease.leases).length === 0;
        } catch { return false; }
      }, 15_000, "lease commit");
      dispose();
    } finally {
      mod.restore();
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  test("exhausted 409 retries release the lease and turn_start still delivers (claim-once honest)", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-mod-wake-"));
    const configPath = await writeConfig(root);
    const tracePath = join(root, "trace.log");
    await seedMention(join(root, "store"), "exhaustion path body LISIBLE-124");
    const mod = loadMod(wakeEnv(configPath, tracePath));
    try {
      const { handler, dispose } = await mod.activate();
      const fake = fakeConversation(() => Promise.reject(conflictError()));
      await handler("conversation_open")({}, { conversation: fake.conversation });
      await waitForTrace(tracePath, (lines) => lines.some((line) => line.event === "release"), "release");
      // Max 3 attempts in the failed cycle, all 409s.
      const releaseIndex = (await readTrace(tracePath)).findIndex((line) => line.event === "release");
      const errorsBefore = (await readTrace(tracePath)).slice(0, releaseIndex).filter((line) => line.event === "send-error");
      expect(errorsBefore.length).toBe(3);
      // The lease is gone in both directions: not delivered, not reserved.
      await waitFor(async () => {
        try {
          const lease = await readLease(root);
          return Object.keys(lease.leases).length === 0 && Object.keys(lease.delivered).length === 0;
        } catch { return false; }
      }, 15_000, "lease release");
      // The mention was never consumed: the next real turn still injects it.
      const event: any = { input: [{ role: "user", content: "a user finally shows up" }] };
      await handler("turn_start")(event, {});
      const injected = JSON.stringify(event.input);
      expect(injected).toContain("exhaustion path body LISIBLE-124");
      expect(injected).toContain("UNTRUSTED CONTENT FROM claude");
      dispose();
    } finally {
      mod.restore();
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  test("timer and turn_start serialize: an injected mention is never also nudged (exactly-once)", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-mod-wake-"));
    const configPath = await writeConfig(root);
    const tracePath = join(root, "trace.log");
    // Slow the 409 retry ladder so the test can land the turn_start injection
    // (hook claim + persisted delivered mark) inside the retry gap, before
    // the timer's pre-send recheck.
    const mod = loadMod(wakeEnv(configPath, tracePath, { BOARD_TIMER_RETRY_MS: "4000,4000" }));
    try {
      const { handler, dispose } = await mod.activate();
      // Send call 1 (m1) succeeds; call 2 (m2, attempt 1) rejects with a 409
      // (server-side rejection = NOT a delivery); call 3+ would park on the
      // gate — after the serialization fix it must never be reached.
      let openGate: () => void = () => {};
      const gate = new Promise<void>((resolve) => { openGate = resolve; });
      const fake = fakeConversation((attempt) => {
        if (attempt === 1) return Promise.resolve(okStream());
        if (attempt === 2) return Promise.reject(conflictError());
        return gate.then(() => okStream());
      });
      await handler("conversation_open")({}, { conversation: fake.conversation });

      // Phase A: the timer nudges m1 and commits; a later tick does not
      // re-nudge it even though turn_start also injects it (the hook's claim
      // store is its own; the mod's obligation is one NUDGE per mention).
      await seedMention(join(root, "store"), "serialize one");
      await waitForTrace(tracePath, (lines) => lines.some((line) => line.event === "send-accepted"), "m1 send");
      expect(fake.calls.length).toBe(1);
      const injectedA: any = { input: [{ role: "user", content: "next user turn" }] };
      await handler("turn_start")(injectedA, {});
      expect(JSON.stringify(injectedA.input)).toContain("serialize one");
      await sleep(300); // several poll periods
      expect(fake.calls.length).toBe(1); // no second nudge for m1

      // Phase B (arbitration, injection-during-wake order): m2 is reserved
      // and its first attempt 409s; through the retry gap the timer still
      // holds an ACTIVE lease on m2. turn_start now runs: its arbitration
      // must DEFER to the in-flight wake — no content, no delivered mark —
      // or both paths would deliver. The timer's attempt 2 then delivers:
      // exactly one delivery for m2, by the timer.
      await seedMention(join(root, "store"), "serialize two");
      await waitForTrace(tracePath, (lines) => lines.some((line) => line.event === "send-error"), "m2 first attempt 409");
      const page = JSON.parse(String(await handler("board_read")({ args: { limit: 10 } }, {})));
      const m2 = page.posts.find((post: { id: string; body: string }) => post.body === "serialize two");
      expect(m2).toBeDefined();
      const injectedB: any = { input: [{ role: "user", content: "another user turn" }] };
      await handler("turn_start")(injectedB, {});
      // Deferred: the hook's content for m2 is NOT appended ...
      expect(JSON.stringify(injectedB.input)).not.toContain("serialize two");
      // ... and no injection-owned delivered mark exists: the ACTIVE lease
      // still owns m2 (the arbitration section read it under the lock).
      const leaseMidWake = await readLease(root);
      expect(leaseMidWake.delivered[m2!.id]).toBeUndefined();
      expect(leaseMidWake.leases[m2!.id]).toBeDefined();
      // The retry sleep ends, attempt 2 re-arbitrates (still owned, still
      // undelivered), sends, and commits — exactly one delivery for m2.
      openGate(); // un-park the gated attempt-3 stream
      await waitFor(async () => {
        try {
          return (await readLease(root)).delivered[m2!.id] !== undefined;
        } catch { return false; }
      }, 15_000, "m2 committed by the timer");
      await sleep(400);
      expect(fake.calls.length).toBe(3); // m1 + m2's 409'd attempt + m2's delivered attempt
      const commits = (await readTrace(tracePath)).filter((line) => line.event === "commit");
      expect(commits.length).toBe(2); // m1 and m2 — one delivery each, never both paths
      const lease = await readLease(root);
      expect(Object.keys(lease.leases).length).toBe(0);
      expect(lease.delivered[m2!.id]).toBeGreaterThan(0);
      expect(lease.retry[m2!.id]).toBeUndefined(); // delivered: not retry work
      dispose();
    } finally {
      mod.restore();
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  test("wake is off by default: no timer, no polls, no lease file", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-mod-wake-"));
    // A fake repo CLI that logs every invocation, so any tick would show up.
    const fakeRepo = join(root, "fake-repo");
    const logPath = join(root, "cli.log");
    await mkdir(join(fakeRepo, "packages", "cli", "src"), { recursive: true });
    await writeFile(
      join(fakeRepo, "packages", "cli", "src", "index.ts"),
      'import { appendFileSync } from "node:fs";\nappendFileSync(process.env.TIMER_LOG, String(Date.now()) + "\\n");\nconsole.log(\'{"posts":[],"cursor":null,"truncated":false}\');\n',
    );
    const configPath = await writeConfig(root);
    const mod = loadMod({
      BOARD_CONFIG: configPath,
      BOARD_REPO: fakeRepo,
      BOARD_TIMER_WAKE: undefined, // absent
      TIMER_LOG: logPath,
    });
    try {
      const { dispose } = await mod.activate();
      await sleep(500);
      expect(existsSync(logPath)).toBe(false);
      expect(existsSync(leasePath(root))).toBe(false);
      expect(existsSync(`${leasePath(root)}.lock`)).toBe(false); // no lock infrastructure either
      dispose();
    } finally {
      mod.restore();
    }
    // BOARD_TIMER_WAKE=0 is a kill switch over config "timerWake": true.
    const root2 = await mkdtemp(join(tmpdir(), "board-mod-wake-"));
    const log2 = join(root2, "cli.log");
    const config2 = await writeConfig(root2, { timerWake: true });
    const mod2 = loadMod({
      BOARD_CONFIG: config2,
      BOARD_REPO: fakeRepo,
      BOARD_TIMER_WAKE: "0",
      TIMER_LOG: log2,
    });
    try {
      const { dispose } = await mod2.activate();
      await sleep(400);
      expect(existsSync(log2)).toBe(false);
      dispose();
    } finally {
      mod2.restore();
      await rm(root2, { recursive: true, force: true });
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  test("handle capture: from conversation_open and turn_start; dropped on conversation_close", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-mod-wake-"));
    const tracePath = join(root, "trace.log");
    // Config-field opt-in this time (no BOARD_TIMER_WAKE env).
    const configPath = await writeConfig(root, { timerWake: true });
    await seedMention(join(root, "store"), "capture one");
    const mod = loadMod({
      BOARD_CONFIG: configPath,
      BOARD_TIMER_POLL_MS: "25",
      BOARD_TIMER_RETRY_MS: "10,10",
      BOARD_TIMER_TRACE: tracePath,
      BOARD_TIMER_WAKE: undefined,
    });
    try {
      const { handler, dispose } = await mod.activate();
      const convA = fakeConversation(() => Promise.resolve(okStream()));
      const convB = fakeConversation(() => Promise.resolve(okStream()));
      // Before any event there is no handle: ticks observe and skip.
      await waitForTrace(tracePath, (lines) => lines.some((line) => line.event === "no-handle"), "no-handle");
      expect(convA.calls.length + convB.calls.length).toBe(0);
      // conversation_open captures A and the nudge goes out through A.
      await handler("conversation_open")({}, { conversation: convA.conversation });
      await waitForTrace(tracePath, (lines) => lines.some((line) => line.event === "send-accepted"), "send via A");
      expect(convA.calls.length).toBe(1);
      expect(convB.calls.length).toBe(0);
      // conversation_close drops the handle: further mentions are not nudged.
      await handler("conversation_close")({}, {});
      await seedMention(join(root, "store"), "capture two after close");
      await sleep(300);
      expect(convA.calls.length).toBe(1);
      expect(convB.calls.length).toBe(0);
      // A turn_start ctx re-captures, now B: the pending mention wakes via B.
      await handler("turn_start")({ input: [] }, { conversation: convB.conversation });
      await waitFor(() => convB.calls.length === 1, 15_000, "send via B");
      expect(convA.calls.length).toBe(1);
      const page = JSON.parse(String(await handler("board_read")({ args: { limit: 10 } }, {})));
      expect(page.posts.length).toBe(2);
      // The nudge through A carried the first mention's id; the one through B
      // carries the second mention's id.
      const firstId = /post ([0-9A-Z]{26})/.exec(convA.calls[0]![0]!.content)![1]!;
      const secondId = page.posts.map((post: { id: string }) => post.id).find((id: string) => id !== firstId);
      expect(secondId).toBeDefined();
      expect(convB.calls[0]![0]!.content).toContain(`post ${secondId}`);
      expect(convA.calls[0]![0]!.content).toContain(`post ${firstId}`);
      dispose();
    } finally {
      mod.restore();
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  test("consecutive empty polls back off the tick interval, bounded by the cap", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-mod-wake-"));
    const tracePath = join(root, "trace.log");
    const fakeRepo = join(root, "fake-repo");
    const logPath = join(root, "cli.log");
    await mkdir(join(fakeRepo, "packages", "cli", "src"), { recursive: true });
    await writeFile(
      join(fakeRepo, "packages", "cli", "src", "index.ts"),
      'import { appendFileSync } from "node:fs";\nappendFileSync(process.env.TIMER_LOG, String(Date.now()) + "\\n");\nconsole.log(\'{"posts":[],"cursor":null,"truncated":false}\');\n',
    );
    const configPath = await writeConfig(root);
    const mod = loadMod({
      ...wakeEnv(configPath, tracePath, { BOARD_REPO: fakeRepo, TIMER_LOG: logPath }),
      BOARD_TIMER_POLL_MS: "30",
      BOARD_TIMER_BACKOFF_CAP_MS: "300",
    });
    try {
      const { handler, dispose } = await mod.activate();
      const fake = fakeConversation(() => Promise.resolve(okStream()));
      await handler("conversation_open")({}, { conversation: fake.conversation });
      await sleep(1_500);
      const raw = existsSync(logPath) ? await readFile(logPath, "utf8") : "";
      const stamps = raw.split("\n").filter(Boolean).map(Number);
      // Polls happened, but far fewer than the ~40 a flat 30 ms cadence would
      // allow (each spawn also takes real time, which only widens the gaps).
      expect(stamps.length).toBeGreaterThanOrEqual(3);
      expect(stamps.length).toBeLessThanOrEqual(12);
      const gaps = stamps.slice(1).map((ms, index) => ms - stamps[index]!);
      expect(Math.max(...gaps)).toBeGreaterThanOrEqual(120); // ≥4× base: backoff grew
      expect(fake.calls.length).toBe(0); // nothing new: no sends
      dispose();
    } finally {
      mod.restore();
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  test("a never-settling send hits the send deadline, releases the lease, and the next tick recovers", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-mod-wake-"));
    const configPath = await writeConfig(root);
    const tracePath = join(root, "trace.log");
    await seedMention(join(root, "store"), "deadline body UNBOUNDED-124");
    // 1000 ms is the knob's clamp floor: fast for a test, yet far longer
    // than a healthy send takes, so it only fires on a genuinely hung one.
    const mod = loadMod(wakeEnv(configPath, tracePath, { BOARD_TIMER_SEND_TIMEOUT_MS: "1000" }));
    try {
      const { handler, dispose } = await mod.activate();
      // Attempt 1's sendMessageStream promise never settles (wedged host
      // send); the "host recovers" for attempt 2 so a subsequent tick can be
      // observed end to end.
      const fake = fakeConversation((attempt) => attempt === 1
        ? new Promise<AsyncIterable<unknown>>(() => {})
        : Promise.resolve(okStream()));
      await handler("conversation_open")({}, { conversation: fake.conversation });
      // The deadline fires and flows into the EXISTING failure path: a traced
      // send-timeout warning, then send-failed + release. No same-tick retry
      // (a deadline miss is not a 409) and nothing committed before release.
      await waitForTrace(tracePath, (lines) => lines.some((line) => line.event === "release"), "release after deadline");
      const released = await readTrace(tracePath);
      const releaseIndex = released.findIndex((line) => line.event === "release");
      const beforeRelease = released.slice(0, releaseIndex);
      expect(beforeRelease.some((line) => line.event === "send-timeout")).toBe(true);
      expect(beforeRelease.some((line) => line.event === "send-failed")).toBe(true);
      expect(beforeRelease.some((line) => line.event === "send-accepted")).toBe(false);
      // Released, not committed: the mention is unleased and still unread.
      await waitFor(async () => {
        try {
          const lease = await readLease(root);
          return Object.keys(lease.leases).length === 0 && Object.keys(lease.delivered).length === 0;
        } catch { return false; }
      }, 15_000, "lease release");
      // The `sending` latch cleared: a later tick re-reserves the released
      // mention and the recovered host accepts the retry, committing it.
      await waitForTrace(tracePath, (lines) => lines.some((line) => line.event === "send-accepted"), "recovered send");
      const all = await readTrace(tracePath);
      expect(all.filter((line) => line.event === "reserved").length).toBe(2);
      expect(all.filter((line) => line.event === "send-timeout").length).toBe(1); // the one hang
      expect(fake.calls.length).toBe(2);
      expect(fake.drained[1]).toBe(true);
      const page = JSON.parse(String(await handler("board_read")({ args: { limit: 10 } }, {})));
      const id = page.posts[0].id;
      await waitFor(async () => {
        try {
          const lease = await readLease(root);
          return lease.delivered[id] > 0 && Object.keys(lease.leases).length === 0;
        } catch { return false; }
      }, 15_000, "lease commit after recovery");
      dispose();
    } finally {
      mod.restore();
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  test("truncated poll pages still advance the cursor, so mentions beyond the oldest 100 are nudged", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-mod-wake-"));
    const tracePath = join(root, "trace.log");
    // Fake read layer instead of a real 101-post store: the baseline poll
    // (no --after) returns 100 mentions with truncated: true — only paging
    // with the cursor the timer persists can reach the newer mention.
    const fakeRepo = join(root, "fake-repo");
    await mkdir(join(fakeRepo, "packages", "cli", "src"), { recursive: true });
    const page1 = {
      posts: Array.from({ length: 100 }, (_, i) => ({ id: fakeUlid(i), mentions: ["letta"] })),
      cursor: "cursor-page-1",
      truncated: true,
    };
    const page2 = { posts: [{ id: fakeUlid(100), mentions: ["letta"] }], cursor: null, truncated: false };
    await writeFile(
      join(fakeRepo, "packages", "cli", "src", "index.ts"),
      [
        "const argv: string[] = process.argv.slice(1);",
        'const afterFlag = argv.indexOf("--after");',
        "const after = afterFlag >= 0 ? argv[afterFlag + 1] : undefined;",
        `const page1 = ${JSON.stringify(page1)};`,
        `const page2 = ${JSON.stringify(page2)};`,
        "console.log(JSON.stringify(after === undefined ? page1 : page2));",
        "",
      ].join("\n"),
    );
    const configPath = await writeConfig(root, { repo: fakeRepo });
    const mod = loadMod(wakeEnv(configPath, tracePath));
    try {
      const { handler, dispose } = await mod.activate();
      const fake = fakeConversation(() => Promise.resolve(okStream()));
      await handler("conversation_open")({}, { conversation: fake.conversation });
      // Both nudges go out: the 100-post truncated page, then the newer
      // mention reachable only through the persisted cursor.
      await waitForTrace(tracePath, (lines) => lines.filter((line) => line.event === "send-accepted").length >= 2, "both sends");
      const accepted = (await readTrace(tracePath)).filter((line) => line.event === "send-accepted");
      expect(accepted[0]!.posts).toBe(100);
      expect(accepted[1]!.posts).toBe(1);
      // ... and the newer mention was nudged and committed, not starved.
      const newestId = page2.posts[0]!.id;
      expect(fake.calls.length).toBe(2);
      expect(fake.calls[1]![0]!.content).toContain(newestId);
      // The commit's lease save is asynchronous and lands after the
      // send-accepted trace — wait for the whole committed state to reach
      // disk instead of racing it: the persisted cursor, the newest
      // mention's delivery mark, nothing left reserved.
      await waitFor(async () => {
        try {
          const lease = await readLease(root);
          return lease.cursor.general === "cursor-page-1"
            && lease.delivered[newestId] !== undefined
            && Object.keys(lease.leases).length === 0
            && Object.keys(lease.delivered).length === 101;
        } catch { return false; }
      }, 15_000, "lease commit for the newest mention");
      const lease = await readLease(root);
      // The truncated page's cursor WAS persisted ...
      expect(lease.cursor.general).toBe("cursor-page-1");
      // ... and the newest mention is committed: delivered, nothing reserved.
      expect(lease.delivered[newestId]).toBeGreaterThan(0);
      expect(Object.keys(lease.leases).length).toBe(0);
      expect(Object.keys(lease.delivered).length).toBe(101);
      dispose();
    } finally {
      mod.restore();
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  test("the reservation is durable before the send leaves: the handle observes the persisted lease", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-mod-wake-"));
    const configPath = await writeConfig(root);
    const tracePath = join(root, "trace.log");
    await seedMention(join(root, "store"), "durable reservation body");
    const mod = loadMod(wakeEnv(configPath, tracePath));
    try {
      const { handler, dispose } = await mod.activate();
      const inner = fakeConversation(() => Promise.resolve(okStream()));
      let reservedOnDiskAtSend = false;
      // Wrap the handle: the moment the send LEAVES (sendMessageStream
      // invoked), the lease file must already carry the reservation on disk.
      const conv = {
        id: "conv-durable",
        sendMessageStream(messages: any) {
          try {
            const raw = readFileSync(leasePath(root), "utf8");
            const lease = JSON.parse(raw) as { leases?: Record<string, unknown> };
            reservedOnDiskAtSend = Object.keys(lease.leases ?? {}).length > 0;
          } catch {
            reservedOnDiskAtSend = false; // no persisted reservation = violation
          }
          return inner.conversation.sendMessageStream(messages);
        },
      };
      await handler("conversation_open")({}, { conversation: conv });
      await waitForTrace(tracePath, (lines) => lines.some((line) => line.event === "send-accepted"), "send-accepted");
      expect(reservedOnDiskAtSend).toBe(true); // awaited persist happened BEFORE the send
      expect(inner.calls.length).toBe(1);
      dispose();
    } finally {
      mod.restore();
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  test("the lease lock is cross-process: concurrent mutators never lose updates", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-mod-wake-"));
    try {
      const boardTs = join(import.meta.dir, "board.ts");
      const leaseFile = leasePath(root);
      const childScript = join(root, "lease-child.ts");
      await writeFile(childScript, [
        "const mod = await import(process.argv[2]);",
        "const lock = mod.makeLeaseLock(process.argv[3]);",
        "for (let i = 0; i < 30; i += 1) {",
        "  await lock.withLock(async (data) => {",
        "    data.delivered[`child-${process.argv[4]}-${i}`] = Date.now();",
        '    await lock.persist(data, "test");',
        "  });",
        "}",
        'console.log("child-done");',
        "",
      ].join("\n"));
      const mod = await import(`${import.meta.dir}/board.ts?locktest=${Math.random()}`);
      const lock = (mod as { makeLeaseLock: (path: string) => any }).makeLeaseLock(leaseFile);
      const runChild = (tag: string) => new Promise<void>((resolve, reject) => {
        const child = spawn("bun", [childScript, boardTs, leaseFile, tag], { stdio: ["ignore", "ignore", "pipe"] });
        let err = "";
        child.stderr?.on("data", (chunk: Buffer) => { err += String(chunk); });
        child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`child ${tag} exited ${code}: ${err}`)));
      });
      // Two SEPARATE PROCESSES plus two in-process loops, all mutating the
      // same lease file concurrently through the lock: the final file must
      // contain every writer's update (a plain atomic rename would let the
      // last writer silently drop everyone else's).
      const inProcess = async (tag: string) => {
        for (let i = 0; i < 30; i += 1) {
          await lock.withLock(async (data: { delivered: Record<string, number> }) => {
            data.delivered[`${tag}-${i}`] = Date.now();
            await lock.persist(data, "test");
          });
        }
      };
      await Promise.all([runChild("a"), runChild("b"), inProcess("p1"), inProcess("p2")]);
      const raw = JSON.parse(await readFile(leaseFile, "utf8")) as { delivered: Record<string, number> };
      const keys = Object.keys(raw.delivered);
      expect(keys.length).toBe(120);
      for (let i = 0; i < 30; i += 1) {
        expect(keys).toContain(`child-a-${i}`); // no lost updates
        expect(keys).toContain(`child-b-${i}`);
        expect(keys).toContain(`p1-${i}`);
        expect(keys).toContain(`p2-${i}`);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 60_000);

  test("restart rehydration: a crashed reservation is retried exactly once by the next activation", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-mod-wake-"));
    const configPath = await writeConfig(root);
    const tracePath = join(root, "trace.log");
    await seedMention(join(root, "store"), "crash-reserve REHYDRATE-124");
    // Activation 1: reserve, park the send forever, dispose = crash (the
    // reservation persists; no release, no commit).
    const mod1 = loadMod(wakeEnv(configPath, tracePath, { BOARD_TIMER_LEASE_TTL_MS: "1000" }));
    try {
      const { handler: h1, dispose } = await mod1.activate();
      const fake1 = fakeConversation(() => new Promise<AsyncIterable<unknown>>(() => {}));
      await h1("conversation_open")({}, { conversation: fake1.conversation });
      await waitForTrace(tracePath, (lines) => lines.some((line) => line.event === "reserved"), "reserved");
      await waitFor(() => fake1.calls.length === 1, 15_000, "send in flight");
      await waitFor(async () => {
        try {
          return Object.keys((await readLease(root)).leases).length > 0;
        } catch { return false; }
      }, 15_000, "durable reservation on disk");
      dispose();
      const leaseFile = leasePath(root);
      const crashed = JSON.parse(await readFile(leaseFile, "utf8")) as { leases: Record<string, { expiresAt: number }>; cursor: Record<string, string> };
      const id = Object.keys(crashed.leases)[0]!;
      expect(typeof id).toBe("string");
      // Age the reservation past the crash grace (simulates TTL passage) and
      // force the cursor past the mention's page: from here only the
      // persisted retry pool can bring the mention back.
      crashed.leases[id]!.expiresAt = Date.now() - 61_000;
      crashed.cursor.general = "manual-cursor-beyond-mention";
      await writeFile(leaseFile, JSON.stringify(crashed) + "\n");

      // Activation 2 (fresh module instance = fresh session process, same
      // lease file): the lapsed lease rehydrates into the retry pool, the
      // mention is re-reserved behind the cursor, and nudged exactly once.
      const trace2 = join(root, "trace2.log");
      const mod2 = loadMod(wakeEnv(configPath, trace2, { BOARD_TIMER_LEASE_TTL_MS: "1000" }));
      try {
        const { handler: h2, dispose: dispose2 } = await mod2.activate();
        const fake2 = fakeConversation(() => Promise.resolve(okStream()));
        await h2("conversation_open")({}, { conversation: fake2.conversation });
        await waitForTrace(trace2, (lines) => lines.some((line) => line.event === "send-accepted"), "rehydrated send");
        expect(fake2.calls.length).toBe(1);
        expect(fake2.calls[0]![0]!.content).toContain(`post ${id}`);
        await waitFor(async () => {
          try {
            const lease = await readLease(root);
            return lease.delivered[id] > 0 && Object.keys(lease.leases).length === 0;
          } catch { return false; }
        }, 15_000, "commit after rehydration");
        await sleep(400);
        expect(fake2.calls.length).toBe(1); // retried exactly once, not twice
        dispose2();
      } finally {
        mod2.restore();
      }
    } finally {
      mod1.restore();
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  test("a mention turn_start delivers between poll and reserve is never nudged (serialized recheck)", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-mod-wake-"));
    const configPath = await writeConfig(root);
    const tracePath = join(root, "trace.log");
    try {
      // Seed the mention, then grab its id through the REAL CLI before the
      // fake timer-read layer takes over BOARD_REPO.
      await seedMention(join(root, "store"), "serialize mid-poll");
      const seeded = JSON.parse(execFileSync("bun", [
        join(repo, "packages/cli/src/index.ts"), "read",
        "--store", `fs:${join(root, "store")}`, "--board", "general", "--limit", "10",
      ], { timeout: 30_000 }).toString()) as { posts: Array<{ id: string }> };
      const id = seeded.posts[0]!.id;

      // Fake read layer for the TIMER only: parks until the gate file
      // appears, so the test can land the delivery while the tick is
      // mid-poll. The turn_start handler runs for real, but its hook spawn
      // degrades silently (fake repo has no hook) — so the delivery mark is
      // written through the exported lease lock, exactly the mutation
      // markInjectedPosts performs under the same lock.
      const gate = join(root, "cli-gate");
      const marker = join(root, "cli-started");
      const page = JSON.stringify({ posts: [{ id, mentions: ["letta"] }], cursor: null, truncated: false });
      const fakeRepo = join(root, "fake-repo");
      await mkdir(join(fakeRepo, "packages", "cli", "src"), { recursive: true });
      await writeFile(
        join(fakeRepo, "packages", "cli", "src", "index.ts"),
        [
          'import { writeFileSync, existsSync } from "node:fs";',
          'writeFileSync(process.env.CLI_MARKER, "started");',
          "const t0 = Date.now();",
          "while (!existsSync(process.env.CLI_GATE) && Date.now() - t0 < 30_000) {",
          '  await new Promise((r) => setTimeout(r, 10));',
          "}",
          "console.log(process.env.CLI_PAGE);",
          "",
        ].join("\n"),
      );
      const mod = loadMod(wakeEnv(configPath, tracePath, {
        BOARD_REPO: fakeRepo,
        CLI_GATE: gate,
        CLI_MARKER: marker,
        CLI_PAGE: page,
      }));
      try {
        const { handler, dispose } = await mod.activate();
        const fake = fakeConversation(() => Promise.resolve(okStream()));
        await handler("conversation_open")({}, { conversation: fake.conversation });
        await waitFor(() => existsSync(marker), 15_000, "timer parked mid-poll");
        // turn_start runs while the timer is parked inside its poll.
        const event: any = { input: [{ role: "user", content: "user shows up mid-poll" }] };
        await handler("turn_start")(event, {});
        // The claim: the delivered mark lands in the lease file before the
        // poll result is processed (same lock, same file the timer reads).
        const mod2 = await import(`${import.meta.dir}/board.ts?midpoll=${Math.random()}`);
        const lock = (mod2 as { makeLeaseLock: (path: string) => any }).makeLeaseLock(leasePath(root));
        await lock.withLock(async (data: { delivered: Record<string, number> }) => {
          data.delivered[id] = Date.now();
          await lock.persist(data, "test-injected");
        });
        // Now let the poll return. The reserve section must see the mark and
        // filter the mention out: no reservation, no send, no commit.
        await writeFile(gate, "open");
        await waitForTrace(tracePath, (lines) => lines.some((line) => line.event === "backoff"), "tick processed the empty candidate set");
        await sleep(400);
        expect(fake.calls.length).toBe(0); // never nudged
        const traces = await readTrace(tracePath);
        expect(traces.some((line) => line.event === "reserved")).toBe(false);
        expect(traces.some((line) => line.event === "commit")).toBe(false);
        const lease = await readLease(root);
        expect(lease.delivered[id]).toBeGreaterThan(0); // delivered by turn_start only
        expect(Object.keys(lease.leases).length).toBe(0);
        dispose();
      } finally {
        mod.restore();
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 45_000);

  test("a stream that drains with zero chunks is not a delivery: release, persisted retry, later-tick success", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-mod-wake-"));
    const configPath = await writeConfig(root);
    const tracePath = join(root, "trace.log");
    await seedMention(join(root, "store"), "zero chunks body");
    const mod = loadMod(wakeEnv(configPath, tracePath));
    try {
      const { handler, dispose } = await mod.activate();
      // Send 1 drains cleanly but yields NOTHING: committing would claim a
      // delivery that never happened server-side. Send 2 is a real one.
      const fake = fakeConversation((attempt) =>
        attempt === 1 ? Promise.resolve(emptyStream()) : Promise.resolve(okStream()));
      await handler("conversation_open")({}, { conversation: fake.conversation });
      await waitForTrace(tracePath, (lines) => lines.some((line) => line.event === "release"), "release after zero-chunk drain");
      const releaseIndex = (await readTrace(tracePath)).findIndex((line) => line.event === "release");
      const before = (await readTrace(tracePath)).slice(0, releaseIndex);
      expect(before.some((line) => line.event === "send-accepted")).toBe(false);
      expect(before.some((line) => line.event === "send-error")).toBe(true);
      // Released AND queued for retry in the persisted pool, not consumed:
      const page = JSON.parse(String(await handler("board_read")({ args: { limit: 10 } }, {})));
      const id = page.posts[0].id;
      await waitFor(async () => {
        try {
          const lease = await readLease(root);
          return lease.retry[id] > 0 && Object.keys(lease.leases).length === 0 && lease.delivered[id] === undefined;
        } catch { return false; }
      }, 15_000, "persisted retry entry, nothing delivered");
      // The next tick rehydrates the retry entry and the healthy stream
      // commits exactly one delivery.
      await waitForTrace(tracePath, (lines) => lines.some((line) => line.event === "send-accepted"), "recovered send");
      await waitFor(async () => {
        try {
          const lease = await readLease(root);
          return lease.delivered[id] > 0 && Object.keys(lease.retry).length === 0;
        } catch { return false; }
      }, 15_000, "commit after retry");
      expect(fake.calls.length).toBe(2);
      expect(fake.drained[1]).toBe(true);
      dispose();
    } finally {
      mod.restore();
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  test("one absolute deadline spans stream creation and drain (no fresh per-stage window)", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-mod-wake-"));
    const configPath = await writeConfig(root);
    const tracePath = join(root, "trace.log");
    await seedMention(join(root, "store"), "absolute deadline body");
    // 1000 ms is the knob's floor. Stream creation resolves after 600 ms
    // with a stream that never yields: an ABSOLUTE deadline fires ~1000 ms
    // after the attempt began; per-stage timers would hand the drain a fresh
    // 1000 ms window (~1600 ms total). The trace timestamps discriminate.
    const mod = loadMod(wakeEnv(configPath, tracePath, { BOARD_TIMER_SEND_TIMEOUT_MS: "1000" }));
    try {
      const { handler, dispose } = await mod.activate();
      const fake = fakeConversation((attempt) => attempt === 1
        ? new Promise<AsyncIterable<unknown>>((resolve) => setTimeout(() => resolve(hangingStream()), 600))
        : Promise.resolve(okStream()));
      await handler("conversation_open")({}, { conversation: fake.conversation });
      await waitForTrace(tracePath, (lines) => lines.some((line) => line.event === "send-timeout"), "send-timeout");
      const lines = await readTrace(tracePath);
      const reservedTs = Date.parse(lines.find((line) => line.event === "reserved")!.ts as string);
      const timeoutTs = Date.parse(lines.find((line) => line.event === "send-timeout")!.ts as string);
      const delta = timeoutTs - reservedTs;
      expect(delta).toBeGreaterThanOrEqual(900); // the deadline did fire
      expect(delta).toBeLessThan(1400); // one deadline for creation+drain, not 600+1000
      expect(lines.filter((line) => line.event === "send-timeout").length).toBe(1);
      // Released, and the later tick recovers with the healthy stream.
      await waitForTrace(tracePath, (lines2) => lines2.some((line) => line.event === "release"), "release after deadline");
      await waitForTrace(tracePath, (lines2) => lines2.some((line) => line.event === "send-accepted"), "recovered send");
      expect(fake.calls.length).toBe(2);
      const page = JSON.parse(String(await handler("board_read")({ args: { limit: 10 } }, {})));
      const id = page.posts[0].id;
      await waitFor(async () => {
        try {
          const lease = await readLease(root);
          return lease.delivered[id] > 0 && Object.keys(lease.leases).length === 0;
        } catch { return false; }
      }, 15_000, "lease commit after recovery");
      dispose();
    } finally {
      mod.restore();
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  test("timer state is scoped per conversation id and per activation generation", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-mod-wake-"));
    const configPath = await writeConfig(root);
    const tracePath = join(root, "trace.log");
    await seedMention(join(root, "store"), "scoping mention one");
    const mod = loadMod(wakeEnv(configPath, tracePath));
    try {
      // Two activations of the SAME module instance (= what a host's /reload
      // does when it re-runs a cached mod): the second bumps the generation,
      // invalidating the first activation's captured handle.
      const modModule = await import(`${import.meta.dir}/board.ts?scope=${Math.random()}`);
      const makeHost = () => {
        const handlers: Record<string, any> = {};
        return {
          handlers,
          host: {
            capabilities: { tools: true, events: { turns: true, lifecycle: true } },
            tools: { register: () => () => {} },
            events: { on: (name: string, handler: any) => { handlers[name] = handler; return () => {}; } },
            diagnostics: { report: () => {} },
          },
        };
      };
      const host1 = makeHost();
      const host2 = makeHost();
      const dispose1 = (modModule as { default: (host: any) => () => void }).default(host1.host);
      const dispose2 = (modModule as { default: (host: any) => () => void }).default(host2.host);
      const convA = fakeConversation(() => Promise.resolve(okStream()), "conv-A");
      const convB = fakeConversation(() => Promise.resolve(okStream()), "conv-B");
      // Activation 1 captures A — but activation 2 already outranks it.
      await host1.handlers.conversation_open({}, { conversation: convA.conversation });
      await sleep(400);
      expect(convA.calls.length).toBe(0); // stale-generation handle never fires
      // Activation 2 captures B: only ITS handle is woken.
      await host2.handlers.conversation_open({}, { conversation: convB.conversation });
      await waitForTrace(tracePath, (lines) => lines.some((line) => line.event === "send-accepted"), "send via B");
      expect(convB.calls.length).toBe(1);
      expect(convA.calls.length).toBe(0); // never the other conversation's handle
      // conversation_close drops B's session: the stale handle is not fired.
      await host2.handlers.conversation_close({}, { conversation: convB.conversation });
      await seedMention(join(root, "store"), "scoping mention two");
      await sleep(400);
      expect(convB.calls.length).toBe(1);
      expect(convA.calls.length).toBe(0);
      // Re-capture via turn_start: the pending mention wakes through B again.
      await host2.handlers.turn_start({ input: [] }, { conversation: convB.conversation });
      await waitFor(() => convB.calls.length === 2, 15_000, "send via re-captured B");
      expect(convA.calls.length).toBe(0);
      dispose1();
      dispose2();
    } finally {
      mod.restore();
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  test("malformed post ids and agent names are skipped with a warning, never nudged", async () => {
    // (a) A page carrying a non-ULID id: the id is skipped + warned; the
    // valid mention is still nudged; the malformed id never reaches the nudge
    // or the lease file.
    const root = await mkdtemp(join(tmpdir(), "board-mod-wake-"));
    const tracePath = join(root, "trace.log");
    try {
      const fakeRepo = join(root, "fake-repo");
      await mkdir(join(fakeRepo, "packages", "cli", "src"), { recursive: true });
      const goodId = fakeUlid(1);
      await writeFile(
        join(fakeRepo, "packages", "cli", "src", "index.ts"),
        [
          `const goodId = ${JSON.stringify(goodId)};`,
          'console.log(JSON.stringify({ posts: [',
          '  { id: "POST:NOT;A-ULID", mentions: ["letta"] },',
          "  { id: goodId, mentions: [\"letta\"] },",
          '], cursor: null, truncated: false }));',
          "",
        ].join("\n"),
      );
      const configPath = await writeConfig(root, { repo: fakeRepo });
      const mod = loadMod(wakeEnv(configPath, tracePath));
      const { handler, dispose } = await mod.activate();
      try {
        const fake = fakeConversation(() => Promise.resolve(okStream()));
        await handler("conversation_open")({}, { conversation: fake.conversation });
        await waitForTrace(tracePath, (lines) => lines.some((line) => line.event === "bad-post-id"), "bad id warned");
        await waitForTrace(tracePath, (lines) => lines.some((line) => line.event === "send-accepted"), "valid mention nudged");
        const nudge = fake.calls[0]![0]!.content;
        expect(nudge).toContain(goodId);
        expect(nudge).not.toContain("POST:NOT;A-ULID");
        const lease = await readLease(root);
        expect(Object.keys(lease.delivered)).toEqual([goodId]); // only the validated id
        dispose();
      } finally {
        mod.restore();
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }

    // (b) A malformed agent name: no reservation, no send, one warning — the
    // name is the only free-form value the nudge interpolates.
    const root2 = await mkdtemp(join(tmpdir(), "board-mod-wake-"));
    const trace2 = join(root2, "trace.log");
    try {
      const fakeRepo = join(root2, "fake-repo");
      await mkdir(join(fakeRepo, "packages", "cli", "src"), { recursive: true });
      await writeFile(
        join(fakeRepo, "packages", "cli", "src", "index.ts"),
        // The identity check fires before any poll, so the page content is
        // irrelevant — but keep it valid-shaped in case of a regression.
        'const fakeU = "022ZZZ022ZZZ022ZZZ022ZZZ022Z".slice(0, 26);\nconsole.log(JSON.stringify({ posts: [{ id: fakeU, mentions: ["letta; drop table"] }], cursor: null, truncated: false }));\n',
      );
      const configPath = await writeConfig(root2, { repo: fakeRepo, as: "letta; drop table" });
      const mod = loadMod(wakeEnv(configPath, trace2));
      const { handler, dispose } = await mod.activate();
      try {
        const fake = fakeConversation(() => Promise.resolve(okStream()));
        await handler("conversation_open")({}, { conversation: fake.conversation });
        await waitForTrace(trace2, (lines) => lines.some((line) => line.event === "bad-identity"), "bad identity warned");
        await sleep(400);
        expect(fake.calls.length).toBe(0); // never nudged with an unvalidated name
        const traces = await readTrace(trace2);
        expect(traces.some((line) => line.event === "reserved")).toBe(false);
        expect(existsSync(leasePath(root2))).toBe(false); // nothing reserved either
        dispose();
      } finally {
        mod.restore();
      }
    } finally {
      await rm(root2, { recursive: true, force: true });
    }
  }, 30_000);

  test("an empty candidate page still persists its cursor, so the next poll pages past it", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-mod-wake-"));
    const configPath = await writeConfig(root);
    const tracePath = join(root, "trace.log");
    try {
      const fakeRepo = join(root, "fake-repo");
      const logPath = join(root, "cli.log");
      await mkdir(join(fakeRepo, "packages", "cli", "src"), { recursive: true });
      const secondId = fakeUlid(7);
      await writeFile(
        join(fakeRepo, "packages", "cli", "src", "index.ts"),
        [
          'import { appendFileSync } from "node:fs";',
          "const argv: string[] = process.argv.slice(1);",
          'appendFileSync(process.env.TIMER_LOG, JSON.stringify(argv) + "\\n");',
          'const afterFlag = argv.indexOf("--after");',
          "const after = afterFlag >= 0 ? argv[afterFlag + 1] : undefined;",
          `const second = JSON.stringify({ posts: [{ id: ${JSON.stringify(secondId)}, mentions: ["letta"] }], cursor: null, truncated: false });`,
          'console.log(after === "cursor-empty-1" ? second : JSON.stringify({ posts: [], cursor: "cursor-empty-1", truncated: false }));',
          "",
        ].join("\n"),
      );
      const mod = loadMod(wakeEnv(configPath, tracePath, { BOARD_REPO: fakeRepo, TIMER_LOG: logPath }));
      const { handler, dispose } = await mod.activate();
      try {
        const fake = fakeConversation(() => Promise.resolve(okStream()));
        await handler("conversation_open")({}, { conversation: fake.conversation });
        // The FIRST page lists nothing but still moves the read position.
        await waitFor(async () => {
          try {
            return (await readLease(root)).cursor.general === "cursor-empty-1";
          } catch { return false; }
        }, 15_000, "cursor persisted on an empty candidate page");
        // The mention hiding behind the empty page is reached through the
        // persisted cursor and committed.
        await waitForTrace(tracePath, (lines) => lines.some((line) => line.event === "send-accepted"), "mention behind empty page");
        expect(fake.calls.length).toBe(1);
        expect(fake.calls[0]![0]!.content).toContain(secondId);
        const argvLines = (await readFile(logPath, "utf8")).split("\n").filter(Boolean)
          .map((line) => JSON.parse(line) as string[]);
        const paged = argvLines.find((argv) => argv.includes("--after"));
        expect(paged).toContain("cursor-empty-1"); // the persisted cursor was used
        const lease = await readLease(root);
        expect(lease.delivered[secondId]).toBeGreaterThan(0);
        dispose();
      } finally {
        mod.restore();
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  test("dispose mid-send: no post-dispose commit or release, the reservation stays flushed, no further polls", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-mod-wake-"));
    const configPath = await writeConfig(root);
    const tracePath = join(root, "trace.log");
    await seedMention(join(root, "store"), "dispose mid-send body");
    const mod = loadMod(wakeEnv(configPath, tracePath));
    try {
      const { handler, dispose } = await mod.activate();
      // Park attempt 1's stream forever (until we release it post-dispose).
      let openGate: () => void = () => {};
      const gate = new Promise<void>((resolve) => { openGate = resolve; });
      const fake = fakeConversation(() => gate.then(() => okStream()));
      await handler("conversation_open")({}, { conversation: fake.conversation });
      await waitForTrace(tracePath, (lines) => lines.some((line) => line.event === "reserved"), "reserved");
      await waitFor(() => fake.calls.length === 1, 15_000, "send parked mid-flight");
      await sleep(100); // let the trace queue finish flushing pre-dispose events
      // State-transition events only: in-flight attempt bookkeeping (e.g. a
      // `drained` line from the already-running drain) may still land after
      // dispose, but transitions must not.
      const TRANSITIONS = ["poll", "reserved", "commit", "release", "skip-delivered", "send-accepted", "send-failed"];
      const transitionsAtDispose = (await readTrace(tracePath)).filter((line) => TRANSITIONS.includes(line.event as string)).length;
      expect(transitionsAtDispose).toBeGreaterThan(0);
      dispose(); // teardown while the send is in flight
      // The pre-dispose reservation was already durably written (awaited
      // before the send) and stays flushed after teardown.
      const lease = await readLease(root);
      expect(Object.keys(lease.leases).length).toBe(1);
      // Let the parked send settle: the orphaned tick must NOT transition
      // after teardown (no commit, no release, no further polls).
      openGate();
      await sleep(500);
      const after = (await readTrace(tracePath)).filter((line) => TRANSITIONS.includes(line.event as string));
      expect(after.length).toBe(transitionsAtDispose); // no post-dispose transitions
      const leaseAfter = await readLease(root);
      expect(Object.keys(leaseAfter.leases).length).toBe(1); // no post-dispose release
      expect(Object.keys(leaseAfter.delivered).length).toBe(0); // no post-dispose commit
      // And the timer is gone: a new mention produces no polls, no sends.
      await seedMention(join(root, "store"), "post-dispose mention");
      await sleep(500);
      expect(fake.calls.length).toBe(1);
      const finalTransitions = (await readTrace(tracePath)).filter((line) => TRANSITIONS.includes(line.event as string));
      expect(finalTransitions.length).toBe(transitionsAtDispose);
    } finally {
      mod.restore();
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  // ─── Round-3 remediation: findings 1–9 ────────────────────────────────────

  test("(1a) injection arbitration is AWAITED: turn_start cannot resolve while the lease lock is held elsewhere", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-mod-wake-"));
    const configPath = await writeConfig(root);
    const tracePath = join(root, "trace.log");
    await seedMention(join(root, "store"), "awaited arbitration body");
    const mod = loadMod(wakeEnv(configPath, tracePath));
    try {
      const { handler, dispose } = await mod.activate();
      // A page carrying the seeded post's id, so the arbitration has work.
      const page = JSON.parse(String(await handler("board_read")({ args: { limit: 10 } }, {})));
      const id = page.posts[0].id;
      // Hold the cross-process lease lock from "another writer".
      const modModule = await import(`${import.meta.dir}/board.ts?heldlock=${Math.random()}`);
      const extLock = (modModule as { makeLeaseLock: (path: string) => { withLock: (fn: any) => Promise<void> } }).makeLeaseLock(leasePath(root));
      let releaseHold: () => void = () => {};
      const hold = new Promise<void>((resolve) => { releaseHold = resolve; });
      let holdStarted = false;
      const holdPromise = extLock.withLock(async () => { holdStarted = true; await hold; });
      await waitFor(() => holdStarted, 15_000, "external hold on the lease lock");
      // turn_start must BLOCK in its arbitration section (after the real hook
      // spawn) — it may not resolve, let alone append content, before the
      // delivery mark is durable under the lock.
      const event: any = { input: [{ role: "user", content: "user turn while lock held" }] };
      let settled = false;
      const turn = handler("turn_start")(event, {}).then(() => { settled = true; });
      await sleep(1_500); // several times a healthy hook spawn
      expect(settled).toBe(false); // AWAITED: blocked on the held lock
      expect(JSON.stringify(event.input)).not.toContain("awaited arbitration body"); // nothing delivered yet
      releaseHold();
      await turn;
      await holdPromise;
      // Now delivered — content appended AND the mark durable at resolution.
      expect(JSON.stringify(event.input)).toContain("awaited arbitration body");
      const lease = await readLease(root);
      expect(lease.delivered[id]).toBeGreaterThan(0);
      dispose();
    } finally {
      mod.restore();
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  test("(1b) an in-flight wake owns the mention: turn_start defers, no double delivery (timer-then-injection)", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-mod-wake-"));
    const configPath = await writeConfig(root);
    const tracePath = join(root, "trace.log");
    await seedMention(join(root, "store"), "defer-to-wake body");
    const mod = loadMod(wakeEnv(configPath, tracePath));
    try {
      const { handler, dispose } = await mod.activate();
      // Park the wake mid-send: the reservation is durable and ACTIVE while
      // turn_start runs its arbitration.
      let openGate: () => void = () => {};
      const gate = new Promise<void>((resolve) => { openGate = resolve; });
      const fake = fakeConversation(() => gate.then(() => okStream()));
      await handler("conversation_open")({}, { conversation: fake.conversation });
      await waitForTrace(tracePath, (lines) => lines.some((line) => line.event === "reserved"), "reserved");
      await waitFor(() => fake.calls.length === 1, 15_000, "send parked mid-flight");
      const page = JSON.parse(String(await handler("board_read")({ args: { limit: 10 } }, {})));
      const id = page.posts[0].id;
      // The injection arrives while the wake is in flight: its arbitration
      // must defer (whole block suppressed — every id it names is actively
      // leased), leaving no delivered mark behind.
      const event: any = { input: [{ role: "user", content: "user turn during wake" }] };
      await handler("turn_start")(event, {});
      expect(JSON.stringify(event.input)).not.toContain("defer-to-wake body"); // deferred
      const lease = await readLease(root);
      expect(lease.delivered[id]).toBeUndefined(); // the injection did NOT claim it
      expect(Object.keys(lease.leases).length).toBe(1); // the wake's active lease intact
      // The wake completes and commits: exactly one delivery, by the timer.
      openGate();
      await waitForTrace(tracePath, (lines) => lines.some((line) => line.event === "send-accepted"), "wake delivered");
      await waitFor(async () => {
        try {
          return (await readLease(root)).delivered[id] !== undefined;
        } catch { return false; }
      }, 15_000, "timer commit after deferral");
      expect(fake.calls.length).toBe(1); // one nudge, no second delivery path
      dispose();
    } finally {
      mod.restore();
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  test("(2) fencing: a successor takes the reservation over and the stale owner's late commit is rejected", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-mod-wake-"));
    const configPath = await writeConfig(root);
    const tracePath = join(root, "trace.log");
    await seedMention(join(root, "store"), "fence late commit body");
    const mod = loadMod(wakeEnv(configPath, tracePath));
    const boardTs = join(import.meta.dir, "board.ts");
    try {
      const { handler, dispose } = await mod.activate();
      // Process A reserves and parks mid-send, holding the lease.
      let openGate: () => void = () => {};
      const gate = new Promise<void>((resolve) => { openGate = resolve; });
      const fake = fakeConversation(() => gate.then(() => okStream()));
      await handler("conversation_open")({}, { conversation: fake.conversation });
      await waitForTrace(tracePath, (lines) => lines.some((line) => line.event === "reserved"), "reserved by A");
      await waitFor(() => fake.calls.length === 1, 15_000, "A's send parked mid-flight");
      const leaseFile = leasePath(root);
      const id = Object.keys((await readLease(root)).leases)[0]!;
      const ownerAtReserve = ((await readLease(root)).leases as Record<string, { owner: string }>)[id]!.owner;
      expect(ownerAtReserve.length).toBeGreaterThan(0); // reservations carry an owner token

      // PROCESS B (a real second bun process, through the same cross-process
      // lock): ages the lapsed reservation, rehydrates it into the retry
      // pool, and re-reserves under ITS OWN owner token — exactly the
      // takeover a live process B performs after A stalled past the TTL.
      const childScript = join(root, "fence-child.ts");
      const successorToken = "successor-owner-token";
      await writeFile(childScript, [
        "const mod = await import(process.argv[2]);",
        "const lock = mod.makeLeaseLock(process.argv[3]);",
        "await lock.withLock(async (data) => {",
        "  const id = process.argv[4];",
        "  const lease = data.leases[id];",
        "  if (lease !== undefined) {",
        "    lease.expiresAt = Date.now() - 61_000; // age it past TTL + grace",
        "  }",
        "  // rehydration: lapsed lease -> retry pool ...",
        "  if (data.leases[id] !== undefined) { delete data.leases[id]; }",
        "  if (data.delivered[id] === undefined && data.retry[id] === undefined) data.retry[id] = Date.now();",
        "  // ... then the successor's own reserve consumes the retry entry.",
        "  delete data.retry[id];",
        `  data.leases[id] = { expiresAt: Date.now() + 60_000, owner: ${JSON.stringify(successorToken)} };`,
        '  await lock.persist(data, "takeover");',
        "});",
        'console.log("takeover-done");',
        "",
      ].join("\n"));
      await new Promise<void>((resolve, reject) => {
        const child = spawn("bun", [childScript, boardTs, leaseFile, id], { stdio: ["ignore", "ignore", "pipe"] });
        let err = "";
        child.stderr?.on("data", (chunk: Buffer) => { err += String(chunk); });
        child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`fence child exited ${code}: ${err}`)));
      });
      // Successor state is on disk: new owner, no retry residue.
      const taken = await readLease(root);
      expect((taken.leases as Record<string, { owner: string }>)[id]!.owner).toBe(successorToken);
      expect(taken.retry[id]).toBeUndefined();

      // A's parked send now completes: A's late commit must be FENCED —
      // rejected without touching the successor's lease or delivery state.
      openGate();
      await waitForTrace(tracePath, (lines) => lines.some((line) => line.event === "commit-fence-rejected"), "stale commit fenced");
      const after = await readLease(root);
      expect((after.leases as Record<string, { owner: string }>)[id]!.owner).toBe(successorToken); // not deleted by A
      expect(after.delivered[id]).toBeUndefined(); // not marked by A
      expect(after.retry[id]).toBeUndefined(); // not released into retry by A
      // A's commit produced NO commit/send-accepted transition — the delivery
      // decision belonged to the successor now.
      expect((await readTrace(tracePath)).some((line) => line.event === "commit")).toBe(false);
      dispose();
    } finally {
      mod.restore();
      await rm(root, { recursive: true, force: true });
    }
  }, 45_000);

  test("(3a) the lock recovers stranded stale-* displacement artifacts instead of timing out forever", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-mod-wake-"));
    try {
      const leaseFile = leasePath(root);
      // A displacer crashed between rename-aside and unlink: the lock dir
      // holds ONLY a stale artifact. Before the fix every later acquirer
      // spun to its 10 s deadline — permanently stranded.
      await mkdir(`${leaseFile}.lock`);
      await writeFile(join(`${leaseFile}.lock`, "stale-deadowner-deadcontender"), "deadowner");
      const lock = (await import(`${import.meta.dir}/board.ts?recover=${Math.random()}`) as { makeLeaseLock: (path: string) => any }).makeLeaseLock(leaseFile);
      await lock.withLock(async (data: { delivered: Record<string, number> }) => {
        data.delivered.recovered = 1;
        await lock.persist(data, "test");
      });
      // And a SECOND acquirer right behind it must not be stranded either.
      const lock2 = (await import(`${import.meta.dir}/board.ts?recover2=${Math.random()}`) as { makeLeaseLock: (path: string) => any }).makeLeaseLock(leaseFile);
      await lock2.withLock(async (data: { delivered: Record<string, number> }) => {
        data.delivered.then2 = 1;
        await lock2.persist(data, "test");
      });
      const raw = JSON.parse(await readFile(leaseFile, "utf8")) as { delivered: Record<string, number> };
      expect(raw.delivered.recovered).toBe(1);
      expect(raw.delivered.then2).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  test("(3b) a displaced holder cannot persist: writes are fenced on the lock owner token", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-mod-wake-"));
    try {
      const leaseFile = leasePath(root);
      const modModule = await import(`${import.meta.dir}/board.ts?displaced=${Math.random()}`);
      const make = (modModule as { makeLeaseLock: (path: string) => any }).makeLeaseLock;
      const lockA = make(leaseFile);
      let displaceMe = false;
      let releaseA: () => void = () => {};
      let holdStarted = false;
      let fencedError: unknown = null;
      // A holds the lock; while it holds, the test displaces it (what a
      // verified stale takeover does), and A then tries to persist from its
      // still-held section.
      const heldA = lockA.withLock(async (data: { delivered: Record<string, number> }) => {
        holdStarted = true;
        while (!displaceMe) await sleep(25);
        try {
          await lockA.persist(data, "sneaky-write"); // must be fenced off
        } catch (error) {
          fencedError = error;
        }
        releaseA();
      });
      await waitFor(() => holdStarted, 15_000, "A holds the lock");
      // Another process displaces A: A's owner file is renamed aside and the
      // successor's owner file is installed.
      const lockDir = `${leaseFile}.lock`;
      const ownerName = (await readdir(lockDir)).find((name) => name.startsWith("owner-"))!;
      const displacedToken = ownerName.slice("owner-".length);
      await rename(join(lockDir, ownerName), join(lockDir, `stale-${displacedToken}-successor`));
      await writeFile(join(lockDir, "owner-successor"), "successor");
      displaceMe = true;
      await heldA;
      // A's write was rejected — the successor's world was not clobbered.
      expect(String(fencedError)).toMatch(/ownership|displaced/);
      // Clean up the (simulated) successor's hold so the next section runs.
      await unlink(join(lockDir, "owner-successor"));
      // The successor completes its own section unharmed.
      const lockB = make(leaseFile);
      await lockB.withLock(async (data: { delivered: Record<string, number> }) => {
        data.delivered.successor = 1;
        await lockB.persist(data, "test");
      });
      const raw = JSON.parse(await readFile(leaseFile, "utf8")) as { delivered: Record<string, number> };
      expect(raw.delivered.successor).toBe(1);
      expect(raw.delivered.displacedWrite).toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  test("(3c) a live holder's utimes renewal prevents premature stale displacement", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-mod-wake-"));
    try {
      const leaseFile = leasePath(root);
      const make = ((await import(`${import.meta.dir}/board.ts?renew=${Math.random()}`)) as { makeLeaseLock: (path: string, opts?: { staleMs?: number }) => any }).makeLeaseLock;
      const lockA = make(leaseFile, { staleMs: 300 }); // renews its owner file every ~100 ms
      const holderDone = lockA.withLock(async () => { await sleep(700); }); // hold > staleMs
      await sleep(100); // let A take the lock first
      const lockB = make(leaseFile, { staleMs: 300 });
      const t0 = Date.now();
      await lockB.withLock(async (data: { delivered: Record<string, number> }) => {
        data.delivered.afterHolder = 1;
        await lockB.persist(data, "test");
      });
      // B waited for A's NATURAL release (~700 ms), it did not displace the
      // live holder at the 300 ms staleness mark (renewal kept it fresh).
      expect(Date.now() - t0).toBeGreaterThanOrEqual(550);
      await holderDone;
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  test("(4) a corrupt lease file is quarantined aside with a warning — never silently emptied or overwritten", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-mod-wake-"));
    const configPath = await writeConfig(root);
    const tracePath = join(root, "trace.log");
    const leaseFile = leasePath(root);
    const garbage = '{"v":2,"cursor":{"general":"KEEP-ME"},"leases":{';
    await writeFile(leaseFile, garbage);
    await seedMention(join(root, "store"), "quarantine body");
    const mod = loadMod(wakeEnv(configPath, tracePath));
    try {
      const { handler, dispose } = await mod.activate();
      const fake = fakeConversation(() => Promise.resolve(okStream()));
      await handler("conversation_open")({}, { conversation: fake.conversation });
      // The trace carries the quarantine warning ...
      await waitForTrace(tracePath, (lines) => lines.some((line) => line.event === "lease-quarantined"), "quarantine warning");
      // ... the unreadable bytes are preserved aside, byte for byte ...
      const entries = await readdir(root);
      const aside = entries.find((name) => name.includes(".timerwake.json.corrupt-"));
      expect(aside).toBeDefined();
      expect(await readFile(join(root, aside!), "utf8")).toBe(garbage);
      // ... and the timer still works on the clean state (no stranded
      // silence): the mention is reserved, nudged, and committed.
      await waitForTrace(tracePath, (lines) => lines.some((line) => line.event === "send-accepted"), "send after quarantine");
      const lease = await readLease(root);
      const page = JSON.parse(String(await handler("board_read")({ args: { limit: 10 } }, {})));
      expect(lease.delivered[page.posts[0].id]).toBeGreaterThan(0);
      dispose();
    } finally {
      mod.restore();
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  test("(5) a stream that yields chunks then errors mid-iteration is a FAILED attempt: release + retry, never commit", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-mod-wake-"));
    const configPath = await writeConfig(root);
    const tracePath = join(root, "trace.log");
    await seedMention(join(root, "store"), "chunk-then-error body");
    const mod = loadMod(wakeEnv(configPath, tracePath));
    try {
      const { handler, dispose } = await mod.activate();
      const chunkyFail = (async function* () {
        yield { type: "user_message" };
        await sleep(20);
        throw new Error("iteration blew up after chunks");
      })();
      const fake = fakeConversation((attempt) =>
        attempt === 1 ? Promise.resolve(chunkyFail) : Promise.resolve(okStream()));
      await handler("conversation_open")({}, { conversation: fake.conversation });
      await waitForTrace(tracePath, (lines) => lines.some((line) => line.event === "release"), "released after mid-iteration error");
      const released = await readTrace(tracePath);
      const releaseIndex = released.findIndex((line) => line.event === "release");
      const before = released.slice(0, releaseIndex);
      expect(before.some((line) => line.event === "stream-error-after-chunks")).toBe(true);
      expect(before.some((line) => line.event === "send-accepted")).toBe(false); // NOT committed
      expect(before.some((line) => line.event === "commit")).toBe(false);
      // Released to the persisted retry pool, still unread — then the next
      // tick retries with the healthy stream and commits exactly once.
      const page = JSON.parse(String(await handler("board_read")({ args: { limit: 10 } }, {})));
      const id = page.posts[0].id;
      await waitFor(async () => {
        try {
          const lease = await readLease(root);
          return lease.retry[id] > 0 && lease.delivered[id] === undefined;
        } catch { return false; }
      }, 15_000, "persisted retry entry");
      await waitForTrace(tracePath, (lines) => lines.some((line) => line.event === "send-accepted"), "recovered send");
      await waitFor(async () => {
        try {
          const lease = await readLease(root);
          return lease.delivered[id] > 0 && Object.keys(lease.retry).length === 0;
        } catch { return false; }
      }, 15_000, "commit after retry");
      expect(fake.calls.length).toBe(2);
      expect(fake.drained[1]).toBe(true);
      dispose();
    } finally {
      mod.restore();
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  test("(6) DESIGN agent-name grammar, ULID plausibility, and malformed persisted ids are all gated", async () => {
    // (a) "Letta" (uppercase) violates DESIGN's [a-z0-9_-]{1,32}: no
    // reservation, no send, one warning.
    const root = await mkdtemp(join(tmpdir(), "board-mod-wake-"));
    const tracePath = join(root, "trace.log");
    try {
      const fakeRepo = join(root, "fake-repo");
      await mkdir(join(fakeRepo, "packages", "cli", "src"), { recursive: true });
      await writeFile(
        join(fakeRepo, "packages", "cli", "src", "index.ts"),
        'console.log(JSON.stringify({ posts: [{ id: "X", mentions: ["Letta"] }], cursor: null, truncated: false }));\n',
      );
      const configPath = await writeConfig(root, { repo: fakeRepo, as: "Letta" });
      const mod = loadMod(wakeEnv(configPath, tracePath));
      const { handler, dispose } = await mod.activate();
      try {
        const fake = fakeConversation(() => Promise.resolve(okStream()));
        await handler("conversation_open")({}, { conversation: fake.conversation });
        await waitForTrace(tracePath, (lines) => lines.some((line) => line.event === "bad-identity"), "uppercase name warned");
        await sleep(300);
        expect(fake.calls.length).toBe(0);
        expect(existsSync(leasePath(root))).toBe(false); // nothing reserved
        dispose();
      } finally {
        mod.restore();
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }

    // (b) Well-shaped ULIDs with implausible timestamps (10 minutes too old
    // for the baseline floor is FILTERED by the floor; here: a far-past and
    // a far-future timestamp) are skipped + warned, never nudged; a fresh
    // valid id still wakes.
    const root2 = await mkdtemp(join(tmpdir(), "board-mod-wake-"));
    const trace2 = join(root2, "trace.log");
    try {
      const fakeRepo = join(root2, "fake-repo");
      await mkdir(join(fakeRepo, "packages", "cli", "src"), { recursive: true });
      const ancient = ulidFromMs(1_100_000_000_000); // 2004: decodes, but implausible
      const future = ulidFromMs(Date.now() + 60 * 60_000); // +1 h: beyond the 5 min skew
      const good = fakeUlid(3);
      await writeFile(
        join(fakeRepo, "packages", "cli", "src", "index.ts"),
        [
          `const page = ${JSON.stringify({ posts: [{ id: ancient, mentions: ["letta"] }, { id: future, mentions: ["letta"] }, { id: good, mentions: ["letta"] }], cursor: null, truncated: false })};`,
          "console.log(JSON.stringify(page));",
          "",
        ].join("\n"),
      );
      const configPath = await writeConfig(root2, { repo: fakeRepo });
      const mod = loadMod(wakeEnv(configPath, trace2));
      const { handler, dispose } = await mod.activate();
      try {
        const fake = fakeConversation(() => Promise.resolve(okStream()));
        await handler("conversation_open")({}, { conversation: fake.conversation });
        await waitForTrace(trace2, (lines) => lines.some((line) => line.event === "bad-post-id"), "implausible ids warned");
        await waitForTrace(trace2, (lines) => lines.some((line) => line.event === "send-accepted"), "valid id nudged");
        const nudge = fake.calls[0]![0]!.content;
        expect(nudge).toContain(good);
        expect(nudge).not.toContain(ancient);
        expect(nudge).not.toContain(future);
        const lease = await readLease(root2);
        expect(Object.keys(lease.delivered)).toEqual([good]); // only the validated id persisted
        dispose();
      } finally {
        mod.restore();
      }
    } finally {
      await rm(root2, { recursive: true, force: true });
    }

    // (c) Malformed persisted ids (retry pool, lease map, delivered map) are
    // dropped with a warning at the rehydration boundary; the valid persisted
    // retry id still re-enters and is nudged.
    const root3 = await mkdtemp(join(tmpdir(), "board-mod-wake-"));
    const trace3 = join(root3, "trace.log");
    try {
      const good = fakeUlid(5);
      await writeFile(leasePath(root3), JSON.stringify({
        v: 2,
        cursor: {},
        leases: { "TOO-SHORT": { expiresAt: Date.now() + 60_000, owner: "x" } },
        delivered: { "!!not-a-ulid!!": 1 },
        retry: { "POST:BAD": 1, [good]: Date.now() - 1 },
        initial: {},
      }) + "\n");
      const configPath = await writeConfig(root3);
      const mod = loadMod(wakeEnv(configPath, trace3));
      const { handler, dispose } = await mod.activate();
      try {
        const fake = fakeConversation(() => Promise.resolve(okStream()));
        await handler("conversation_open")({}, { conversation: fake.conversation });
        await waitForTrace(trace3, (lines) => lines.some((line) => line.event === "bad-persisted-id"), "malformed persisted ids warned");
        await waitForTrace(trace3, (lines) => lines.some((line) => line.event === "send-accepted"), "valid persisted id nudged");
        const nudge = fake.calls[0]![0]!.content;
        expect(nudge).toContain(good);
        expect(nudge).not.toContain("POST:BAD");
        const lease = await readLease(root3);
        expect(lease.delivered[good]).toBeGreaterThan(0);
        expect(lease.leases["TOO-SHORT"]).toBeUndefined(); // dropped, not carried
        expect(lease.delivered["!!not-a-ulid!!"]).toBeUndefined();
        expect(lease.retry["POST:BAD"]).toBeUndefined();
        dispose();
      } finally {
        mod.restore();
      }
    } finally {
      await rm(root3, { recursive: true, force: true });
    }
  }, 45_000);

  test("(7) an old activation's dispose does not delete a newer activation's captured handle", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-mod-wake-"));
    const configPath = await writeConfig(root);
    const tracePath = join(root, "trace.log");
    await seedMention(join(root, "store"), "surviving handle body");
    const mod = loadMod(wakeEnv(configPath, tracePath));
    try {
      const modModule = await import(`${import.meta.dir}/board.ts?gen=${Math.random()}`);
      const makeHost = () => {
        const handlers: Record<string, any> = {};
        return {
          handlers,
          host: {
            capabilities: { tools: true, events: { turns: true, lifecycle: true } },
            tools: { register: () => () => {} },
            events: { on: (name: string, handler: any) => { handlers[name] = handler; return () => {}; } },
            diagnostics: { report: () => {} },
          },
        };
      };
      const host1 = makeHost();
      const host2 = makeHost();
      const dispose1 = (modModule as { default: (host: any) => () => void }).default(host1.host);
      const dispose2 = (modModule as { default: (host: any) => () => void }).default(host2.host);
      const convB = fakeConversation(() => Promise.resolve(okStream()), "conv-B");
      // Activation 2 captures B. THEN activation 1's old disposer runs — it
      // must compare the generation IT captured (1), not the global current
      // one (2), so B's fresh session survives.
      await host2.handlers.conversation_open({}, { conversation: convB.conversation });
      dispose1();
      await waitForTrace(tracePath, (lines) => lines.some((line) => line.event === "send-accepted"), "new handle still fires after old dispose");
      expect(convB.calls.length).toBe(1);
      dispose2();
    } finally {
      mod.restore();
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  test("(8a) dispose during the 409 retry backoff aborts the sleep immediately and drains cleanly", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-mod-wake-"));
    const configPath = await writeConfig(root);
    const tracePath = join(root, "trace.log");
    await seedMention(join(root, "store"), "abortable sleep body");
    const mod = loadMod(wakeEnv(configPath, tracePath, { BOARD_TIMER_RETRY_MS: "60000,60000" }));
    try {
      const { handler, dispose } = await mod.activate();
      const fake = fakeConversation((attempt) =>
        attempt === 1 ? Promise.reject(conflictError()) : Promise.resolve(okStream()));
      await handler("conversation_open")({}, { conversation: fake.conversation });
      await waitForTrace(tracePath, (lines) => lines.some((line) => line.event === "send-error"), "first attempt 409");
      await sleep(100);
      dispose(); // teardown DURING the 60 s retry sleep
      // The abortable sleep must wake at once: the queued tick work and the
      // trace queue flush within seconds, not after the full backoff.
      const drained = await Promise.race([
        (dispose as unknown as { drain: () => Promise<void> }).drain(),
        sleep(5_000).then(() => { throw new Error("dispose drain did not finish within 5s — retry sleep not abortable"); }),
      ]);
      expect(drained).toBeUndefined();
      expect(fake.calls.length).toBe(1); // no attempt 2 after dispose
      // And nothing transitioned post-dispose: the reservation stays for
      // rehydration, no commit, no release. The 409 that arrived BEFORE the
      // dispose is still on the trace; nothing of the sort lands after it.
      const lease = await readLease(root);
      expect(Object.keys(lease.leases).length).toBe(1);
      expect(Object.keys(lease.delivered).length).toBe(0);
      const all = await readTrace(tracePath);
      expect(all.some((line) => line.event === "send-error")).toBe(true); // the pre-dispose 409
      expect(all.filter((line) =>
        ["commit", "release", "skip-delivered", "send-accepted", "send-failed"].includes(line.event as string)).length).toBe(0);
    } finally {
      mod.restore();
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  test("(8b) dispose during a pending marker write: the injection arbitration still completes and flushes", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-mod-wake-"));
    const tracePath = join(root, "trace.log");
    try {
      // A fake repo whose HOOK pauses before rendering, so the marker write
      // is pending while dispose fires.
      const fakeRepo = join(root, "fake-repo");
      const hookMarker = join(root, "hook-started");
      const injectedId = fakeUlid(9);
      await mkdir(join(fakeRepo, "packages", "hooks", "src"), { recursive: true });
      await writeFile(
        join(fakeRepo, "packages", "hooks", "src", "board-hook.ts"),
        [
          'import { writeFileSync, existsSync } from "node:fs";',
          'writeFileSync(process.env.HOOK_MARKER, "started");',
          "const t0 = Date.now();",
          "while (!existsSync(process.env.HOOK_GATE) && Date.now() - t0 < 15_000) {",
          '  await new Promise((r) => setTimeout(r, 10));',
          "}",
          `const header = \`[UNTRUSTED CONTENT FROM claude | board general | post ${injectedId}]\\n\`;`,
          'console.log("<board-messages>\\n" + header + "| body:\\n| x\\n[/UNTRUSTED CONTENT]\\n</board-messages>\\n");',
          "",
        ].join("\n"),
      );
      const configPath = await writeConfig(root, { repo: fakeRepo });
      const mod = loadMod(wakeEnv(configPath, tracePath, { HOOK_MARKER: hookMarker, HOOK_GATE: join(root, "hook-gate") }));
      const { handler, dispose } = await mod.activate();
      try {
        const event: any = { input: [{ role: "user", content: "user turn racing dispose" }] };
        const turn = handler("turn_start")(event, {});
        await waitFor(() => existsSync(hookMarker), 15_000, "hook started, marker write pending");
        dispose(); // teardown while the injection arbitration is still pending
        await writeFile(join(root, "hook-gate"), "open");
        await turn; // must complete (tracked work, not dropped)
        expect(JSON.stringify(event.input)).toContain(injectedId); // content delivered
        // The delivery mark is durable, and the trace queue flushes on drain.
        const lease = await readLease(root);
        expect(lease.delivered[injectedId]).toBeGreaterThan(0);
        await (dispose as unknown as { drain: () => Promise<void> }).drain();
        expect((await readTrace(tracePath)).some((line) => line.event === "injected")).toBe(true);
      } finally {
        mod.restore();
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  test("(8c) dispose while a reserve waits on the busy lock: the in-section fence reserves nothing", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-mod-wake-"));
    const configPath = await writeConfig(root);
    const tracePath = join(root, "trace.log");
    await seedMention(join(root, "store"), "fenced reserve body");
    const mod = loadMod(wakeEnv(configPath, tracePath));
    const modModule = await import(`${import.meta.dir}/board.ts?holdreserve=${Math.random()}`);
    const extLock = (modModule as { makeLeaseLock: (path: string) => { withLock: (fn: any) => Promise<void> } }).makeLeaseLock(leasePath(root));
    try {
      const { handler, dispose } = await mod.activate();
      // Hold the lease lock BEFORE the tick runs, so the tick's first
      // sections queue behind the external hold.
      let releaseHold: () => void = () => {};
      const hold = new Promise<void>((resolve) => { releaseHold = resolve; });
      let holdStarted = false;
      const holdPromise = extLock.withLock(async () => { holdStarted = true; await hold; });
      await waitFor(() => holdStarted, 15_000, "external hold");
      const fake = fakeConversation(() => Promise.resolve(okStream()));
      await handler("conversation_open")({}, { conversation: fake.conversation });
      await sleep(100); // the tick is now queued behind the hold
      dispose(); // teardown while the reserve section waits for the lock
      releaseHold(); // let the queued sections run — they must fence inside
      await (dispose as unknown as { drain: () => Promise<void> }).drain();
      await sleep(300); // any illegal post-dispose send would surface here
      const traces = await readTrace(tracePath);
      expect(traces.some((line) => line.event === "reserved")).toBe(false);
      expect(fake.calls.length).toBe(0); // no post-dispose send
      let leases: Record<string, unknown> = {};
      let cursor: Record<string, unknown> = {};
      try {
        const lease = await readLease(root);
        leases = lease.leases;
        cursor = lease.cursor;
      } catch { /* no file written at all = also fine */ }
      expect(Object.keys(leases).length).toBe(0); // nothing was reserved post-dispose
      expect(Object.keys(cursor).length).toBe(0); // no cursor advanced post-dispose
      await holdPromise;
    } finally {
      mod.restore();
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  test("(9) the baseline floor persists through ALL initial truncated pages: an old mention on page 2 is never nudged", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-mod-wake-"));
    const tracePath = join(root, "trace.log");
    try {
      const fakeRepo = join(root, "fake-repo");
      const gate = join(root, "cli-gate");
      await mkdir(join(fakeRepo, "packages", "cli", "src"), { recursive: true });
      const old1 = ulidFromMs(Date.now() - 10 * 60_000, 1); // predates activation
      const old2 = ulidFromMs(Date.now() - 9 * 60_000, 2); // on PAGE 2 of the initial sweep
      const fresh = fakeUlid(3); // arrives after the sweep, still new
      await writeFile(
        join(fakeRepo, "packages", "cli", "src", "index.ts"),
        [
          'import { writeFileSync, existsSync, readFileSync } from "node:fs";',
          "const argv: string[] = process.argv.slice(1);",
          'const afterFlag = argv.indexOf("--after");',
          "const after = afterFlag >= 0 ? argv[afterFlag + 1] : undefined;",
          `const old1 = ${JSON.stringify(old1)}; const old2 = ${JSON.stringify(old2)}; const fresh = ${JSON.stringify(fresh)};`,
          'if (after === undefined) {',
          '  console.log(JSON.stringify({ posts: [{ id: old1, mentions: ["letta"] }], cursor: "c1", truncated: true }));',
          '} else if (!existsSync(process.env.CLI_GATE)) {',
          '  console.log(JSON.stringify({ posts: [{ id: old2, mentions: ["letta"] }], cursor: null, truncated: false }));',
          "} else {",
          '  console.log(JSON.stringify({ posts: [{ id: old2, mentions: ["letta"] }, { id: fresh, mentions: ["letta"] }], cursor: "c2", truncated: false }));',
          "}",
          "",
        ].join("\n"),
      );
      const configPath = await writeConfig(root, { repo: fakeRepo });
      const mod = loadMod(wakeEnv(configPath, tracePath, { CLI_GATE: gate }));
      const { handler, dispose } = await mod.activate();
      try {
        const fake = fakeConversation(() => Promise.resolve(okStream()));
        await handler("conversation_open")({}, { conversation: fake.conversation });
        // Page 1 (baseline, truncated) processed: the floor flag is durable,
        // so page 2 — fetched on a LATER tick with a cursor — stays floored.
        await waitFor(async () => {
          try {
            const lease = await readLease(root);
            return lease.cursor.general === "c1" && lease.initial.general === true;
          } catch { return false; }
        }, 15_000, "baseline floor persisted past the first truncated page");
        await sleep(400); // several more polls over page 2
        expect(fake.calls.length).toBe(0); // the old page-2 mention is NOT woken
        expect((await readTrace(tracePath)).some((line) => line.event === "reserved")).toBe(false);
        // The sweep completes only when a page is non-truncated AND returns
        // a cursor — which is also when the fresh mention arrives.
        await writeFile(gate, "open");
        await waitForTrace(tracePath, (lines) => lines.some((line) => line.event === "send-accepted"), "fresh mention nudged");
        expect(fake.calls.length).toBe(1);
        const nudge = fake.calls[0]![0]!.content;
        expect(nudge).toContain(fresh);
        expect(nudge).not.toContain(old2);
        expect(nudge).not.toContain(old1);
        dispose();
      } finally {
        mod.restore();
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);
});

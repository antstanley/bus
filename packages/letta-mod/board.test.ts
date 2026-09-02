import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

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

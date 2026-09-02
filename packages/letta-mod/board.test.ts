import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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

  test("turn_start injects unread once (claim-once) against a temp fs store", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-mod-test-"));
    const configPath = join(root, "config.json");
    await writeFile(configPath, JSON.stringify({
      repo,
      store: `fs:${join(root, "store")}`,
      boards: ["general"],
      as: "letta",
      indexPath: join(root, "index.sqlite"),
    }));
    await seedMention(join(root, "store"), "mod test mention");
    const mod = loadMod({ BOARD_CONFIG: configPath });
    try {
      const { handler } = await mod.activate();
      const first: any = { input: [{ role: "user", content: "hello" }] };
      await handler("turn_start")(first, {});
      const text = JSON.stringify(first.input);
      expect(text).toContain("board-messages");
      expect(text).toContain("UNTRUSTED CONTENT FROM claude");
      expect(text).toContain("mod test mention");

      const second: any = { input: [{ role: "user", content: "again" }] };
      await handler("turn_start")(second, {});
      expect(second.input[0].content).toBe("again");
    } finally {
      mod.restore();
      await rm(root, { recursive: true, force: true });
    }
  });

  test("BOARD_STORE env wins over the config file store", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-mod-test-"));
    const configPath = join(root, "config.json");
    await writeFile(configPath, JSON.stringify({
      repo,
      store: `fs:${join(root, "store-from-config")}`,
      boards: ["general"],
      as: "letta",
      indexPath: join(root, "index-env.sqlite"),
    }));
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

  test("a failing or timed-out hook yields no injection and does not throw", async () => {
    const root = await mkdtemp(join(tmpdir(), "board-mod-test-"));
    const configPath = join(root, "config.json");
    await writeFile(configPath, JSON.stringify({
      repo,
      store: `fs:${join(root, "store")}`,
      boards: ["general"],
      as: "letta",
      indexPath: join(root, "index.sqlite"),
    }));
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

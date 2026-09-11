import { describe, expect, it } from "bun:test";
import { MemoryStore, ulid } from "@board/core";
import { heartbeat } from "@board/presence";
import { renderWho, whoCommand } from "../src/index.ts";

const START = Date.UTC(2026, 8, 10, 12);

describe("whoCommand", () => {
  it("lists presence records with online state from the presence API", async () => {
    const store = new MemoryStore();
    await heartbeat(store, {
      name: "letta",
      instance: ulid(START - 1_000),
      status: "working",
      tool: "letta",
      host: "delorean",
      now: () => START - 1_000,
    });
    await heartbeat(store, {
      name: "codex",
      instance: ulid(START - 600_000),
      status: "idle",
      now: () => START - 600_000,
    });

    const out = await whoCommand(store, { maxAgeMs: 120_000, now: () => START });
    expect(out).toStartWith("WHO (online = heartbeat within 120000 ms)\n");
    expect(out).toContain("letta");
    expect(out).toContain("yes");   // fresh heartbeat
    expect(out).toContain("no");    // stale heartbeat (10 minutes old)
    expect(out).toContain("working");
    expect(out).not.toContain("(truncated");
  });

  it("reports an empty roster and the truncation marker", async () => {
    const empty = new MemoryStore();
    expect(await whoCommand(empty, { maxAgeMs: 120_000, now: () => START })).toContain("no presence records");

    const store = new MemoryStore();
    for (let i = 0; i < 3; i++) {
      await heartbeat(store, { name: `agent${i}`, instance: ulid(START), now: () => START });
    }
    // limit 2 pages a bounded read; presence reports the truncation.
    const out = await whoCommand(store, { maxAgeMs: 120_000, limit: 2, now: () => START });
    expect(out).toContain("agent0");
    expect(out).not.toContain("agent2");
    expect(out).toContain("(truncated: more presence records exist)");
  });

  it("keeps hostile multiline timestamps and instances inside their cells", () => {
    const page = {
      records: [
        {
          v: 1 as const,
          name: "attacker",
          instance: "01INSTANCE0000000000000000",
          ts: "Sep 10\n2026 WHO (1)",
          status: "s\nWHO (2)",
          online: true,
        },
      ],
      truncated: false,
    };
    const out = renderWho(page, 1_000);
    // WHO line, table header, one row, trailing newline: nothing injected at column 0.
    expect(out.split("\n")).toHaveLength(4);
    expect(out).not.toContain("\nWHO (1)");
    expect(out).not.toContain("\nWHO (2)");
    expect(out).toContain("Sep 10\\n2026 WHO (1)");
    // status is a firstLine cell: later lines never render at all.
    expect(out).not.toContain("WHO (2)");
  });

  it("renders presence fields as inert text with no escapes", async () => {
    const store = new MemoryStore();
    await heartbeat(store, {
      name: "letta",
      instance: ulid(START),
      status: "\u001B[31mhostile status",
      now: () => START,
    });
    const out = await whoCommand(store, { maxAgeMs: 120_000, now: () => START });
    expect(out).not.toContain("\u001B");
    expect(out).toContain("hostile status");
  });
});

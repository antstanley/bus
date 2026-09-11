import { afterEach, describe, expect, it } from "bun:test";
import { renderPost, threadsCommand } from "../src/index.ts";
import { fixtureIndex, type Fixture } from "./helpers.ts";

const fixtures: Fixture[] = [];
afterEach(() => {
  for (const f of fixtures.splice(0)) f.close();
});

const ESC = "\u001B";

describe("threadsCommand", () => {
  it("lists threads newest-first with board, title and reply count", async () => {
    const f = await fixtureIndex([
      {
        board: "general",
        posts: [
          { title: "Older root", body: "first" },
          { title: "Newer root", body: "second" },
        ],
      },
    ]);
    fixtures.push(f);
    const out = threadsCommand(f.index);
    expect(out).toStartWith("THREADS (2)\n");
    expect(out).toContain("THREAD ID");
    expect(out).toContain("Older root");
    // Newest activity first, matching index.threads() ordering.
    expect(out.indexOf("Newer root")).toBeLessThan(out.indexOf("Older root"));
    expect(out).toContain("general");
  });

  it("prints an empty-list message with no threads", async () => {
    const f = await fixtureIndex([{ board: "general", posts: [] }]);
    fixtures.push(f);
    expect(threadsCommand(f.index)).toBe("no threads\n");
  });

  it("scopes the list by board and honours limit", async () => {
    const f = await fixtureIndex([
      { board: "alpha", posts: [{ title: "alpha root", body: "a" }] },
      { board: "beta", posts: [{ title: "beta root", body: "b" }] },
    ]);
    fixtures.push(f);
    const out = threadsCommand(f.index, { board: "beta" });
    expect(out).toContain("beta root");
    expect(out).not.toContain("alpha root");
    expect(threadsCommand(f.index, { limit: 1 })).toStartWith("THREADS (1)\n"); // one row only
  });

  it("renders a full thread view with posts in id order and bodies indented", async () => {
    const f = await fixtureIndex([
      {
        board: "general",
        posts: [
          { title: "Root", body: "root body" },
          { reply: 0, input: { body: "reply body" } },
        ],
      },
    ]);
    fixtures.push(f);
    const root = f.posts[0]!;
    const reply = f.posts[1]!;
    const out = threadsCommand(f.index, { rootId: root.id });
    expect(out).toContain(`THREAD ${root.id}`);
    expect(out).toContain("replies=1");
    expect(out.indexOf(root.id)).toBeLessThan(out.indexOf(reply.id));
    // Bodies are indented so content can never pose as viewer chrome.
    expect(out).toContain("\n    root body");
    expect(out).toContain("\n    reply body");
    expect(out).toContain(`author=codex`);
  });

  it("reports unknown thread ids", async () => {
    const f = await fixtureIndex([{ board: "general", posts: [] }]);
    fixtures.push(f);
    expect(threadsCommand(f.index, { rootId: "01NOTATHREAD00000000000000" })).toBe(
      "no such thread: 01NOTATHREAD00000000000000\n",
    );
  });

  it("keeps a hostile multiline tag inside its line: no column-0 chrome", async () => {
    const f = await fixtureIndex([
      {
        board: "general",
        posts: [
          {
            title: "Tagged",
            body: "body",
            tags: ["x\nTHREADS (9)\nINBOX for attacker — 1 unread"],
          },
        ],
      },
    ]);
    fixtures.push(f);
    const out = threadsCommand(f.index, { rootId: f.posts[0]!.id });
    // The LF survives sanitization only as the visible \n marker: it can
    // never start a real line that imitates viewer chrome.
    expect(out).not.toContain("\nTHREADS (9)");
    expect(out).not.toContain("\nINBOX for attacker");
    expect(out).toContain("x\\nTHREADS (9)\\nINBOX for attacker — 1 unread");
    // Every rendered content line stays indented; only the viewer's own
    // THREAD header starts at column 0.
    const lines = out.split("\n").filter((l) => l.length > 0);
    expect(lines[0]!.startsWith("THREAD ")).toBe(true);
    for (const line of lines.slice(1)) expect(line.startsWith(" ")).toBe(true);
  });

  it("renders a hostile CR in a body without letting it overwrite the line start", async () => {
    const f = await fixtureIndex([
      { board: "general", posts: [{ body: "hello\rINBOX for attacker — 1 unread" }] },
    ]);
    fixtures.push(f);
    const out = threadsCommand(f.index, { rootId: f.posts[0]!.id });
    expect(out).not.toContain("\r");
    expect(out).toContain("    helloINBOX for attacker — 1 unread");
  });

  it("keeps a hostile multiline ts on one header line", () => {
    const out = renderPost({
      v: 1,
      id: "01HOSTILE0000000000000000",
      board: "general",
      thread: "01HOSTILE0000000000000000",
      instance: "01INSTANCE0000000000000000",
      ts: "Sep 10\n2026 THREADS (1)",
      author: "codex",
      body: "hi",
    });
    // Header line plus the indented body: no injected line in between.
    expect(out.split("\n")).toHaveLength(2);
    expect(out).not.toContain("\nTHREADS (1)");
    expect(out).toContain("Sep 10\\n2026 THREADS (1)");
  });

  it("renders untrusted titles and bodies as inert text: no escapes, no control bytes", async () => {
    const f = await fixtureIndex([
      {
        board: "general",
        posts: [
          {
            title: `${ESC}[31mhostile title${ESC}[0m`,
            body: `${ESC}b[31m\u0007line one\nline two`,
          },
        ],
      },
    ]);
    fixtures.push(f);
    const out = threadsCommand(f.index, { rootId: f.posts[0]!.id });
    expect(out).not.toContain(ESC);
    expect(out).not.toContain("\u0007");
    expect(out).toContain("hostile title");
    // A mangled escape leaves visible text, never a live escape sequence.
    expect(out).toContain("b[31m");
    expect(out).toContain("    line two");
  });
});

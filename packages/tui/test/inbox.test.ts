import { afterEach, describe, expect, it } from "bun:test";
import { inboxCommand, readStateCommand, renderInbox } from "../src/index.ts";
import { fixtureIndex, type Fixture } from "./helpers.ts";

const fixtures: Fixture[] = [];
afterEach(() => {
  for (const f of fixtures.splice(0)) f.close();
});

describe("inboxCommand", () => {
  it("lists unread addressed and mentioned posts for the recipient", async () => {
    const f = await fixtureIndex([
      {
        board: "general",
        posts: [
          { title: "For bob", body: "addressed body", to: ["bob"] },
          { title: "For carol", body: "not for bob", to: ["carol"] },
        ],
      },
    ]);
    fixtures.push(f);
    const out = inboxCommand(f.index, "bob");
    expect(out).toStartWith("INBOX for bob — 1 unread\n");
    expect(out).toContain("For bob");
    expect(out).not.toContain("For carol");
    expect(out).toContain("POST ID");
    // Reading marks nothing: the same query still lists the item.
    expect(inboxCommand(f.index, "bob")).toBe(out);
  });

  it("scopes by board and pages with limit/offset", async () => {
    const f = await fixtureIndex([
      {
        board: "alpha",
        posts: [
          { title: "alpha one", body: "a1", to: ["bob"] },
          { title: "alpha two", body: "a2", to: ["bob"] },
        ],
      },
      { board: "beta", posts: [{ title: "beta one", body: "b1", to: ["bob"] }] },
    ]);
    fixtures.push(f);
    const scoped = inboxCommand(f.index, "bob", { board: "beta" });
    expect(scoped).toContain("beta one");
    expect(scoped).not.toContain("alpha one");
    const paged = inboxCommand(f.index, "bob", { limit: 1 });
    expect(paged).toContain("— 1 unread");
    const second = inboxCommand(f.index, "bob", { limit: 1, offset: 1 });
    expect(second).toContain("— 1 unread");
    expect(second).not.toBe(paged);
  });

  it("prints an empty-inbox message", async () => {
    const f = await fixtureIndex([{ board: "general", posts: [] }]);
    fixtures.push(f);
    expect(inboxCommand(f.index, "bob")).toBe("no unread inbox items for bob\n");
  });

  it("keeps hostile multiline timestamps and authors on one row", () => {
    const hostile = {
      v: 1 as const,
      id: "01HOSTILE0000000000000000",
      board: "general",
      thread: "01HOSTILE0000000000000000",
      instance: "01INSTANCE0000000000000000",
      ts: "Sep 10\n2026 THREADS (1)",
      author: "attacker\nINBOX for evil — 9 unread",
      body: "x",
      to: ["bob"],
    };
    const out = renderInbox("bob", [hostile]);
    // INBOX line, table header, one row, trailing newline: nothing injected.
    expect(out.split("\n")).toHaveLength(4);
    expect(out).not.toContain("\nTHREADS (1)");
    expect(out).not.toContain("\nINBOX for evil");
    expect(out).toContain("attacker\\nINBOX for evil — 9 unread");
  });
});

describe("readStateCommand", () => {
  it("reports unread before markRead and not-unread after", async () => {
    const f = await fixtureIndex([
      {
        board: "general",
        posts: [
          { title: "First", body: "one", to: ["bob"] },
          { title: "Second", body: "two", to: ["bob"] },
        ],
      },
    ]);
    fixtures.push(f);
    const first = f.posts[0]!;
    const second = f.posts[1]!;

    const before = readStateCommand(f.index, "bob", [first.id, second.id]);
    expect(before).toContain("READ STATE for bob");
    expect(before).toContain(`${first.id}  unread`);
    expect(before).toContain(`${second.id}  unread`);

    // Marking read is index-local reader state; the viewer itself stays read-only.
    f.index.markRead("bob", [first.id]);
    const after = readStateCommand(f.index, "bob", [first.id, second.id]);
    expect(after).toContain(`${first.id}  not-unread`);
    expect(after).toContain(`${second.id}  unread`);
    expect(after).toContain("(not unread)");
  });

  it("tells apart unknown and never-addressed ids without crashing", async () => {
    const f = await fixtureIndex([
      { board: "general", posts: [{ title: "For bob", body: "x", to: ["bob"] }] },
    ]);
    fixtures.push(f);
    const out = readStateCommand(f.index, "bob", ["01NOTINDEXED00000000000000"]);
    expect(out).toContain("01NOTINDEXED00000000000000  not-unread");
    expect(readStateCommand(f.index, "bob", [])).toBe("no posts to check for bob\n");
  });
});

import { afterEach, describe, expect, it } from "bun:test";
import { renderSearch, searchCommand } from "../src/index.ts";
import { fixtureIndex, type Fixture } from "./helpers.ts";

const fixtures: Fixture[] = [];
afterEach(() => {
  for (const f of fixtures.splice(0)) f.close();
});

const BOLD = "\u001B[1m";
const ESC = "\u001B";

describe("searchCommand", () => {
  it("resets bold when clipping removes a closing highlight marker", () => {
    const out = renderSearch("long", [{ v: 1, id: "id", thread: "id", instance: "instance",
      ts: "2026-09-09T00:00:00.000Z", body: "", board: "general", author: "codex", rank: 0,
      snippet: "<mark>" + "x".repeat(120) + "</mark>" }]);
    expect(out).toContain(BOLD);
    expect(out).toEndWith("\u001B[0m\n");
  });
  it("renders hits with the FTS snippet markers as ANSI bold", async () => {
    const f = await fixtureIndex([
      { board: "general", posts: [{ title: "Deploy runbook", body: "roll out the deploy canary first" }] },
    ]);
    fixtures.push(f);
    const out = searchCommand(f.index, "deploy canary");
    expect(out).toStartWith(`SEARCH "deploy canary" — 1 hit(s)\n`);
    // Snippets quote the body text with the hits wrapped in bold.
    expect(out).toContain("roll out the");
    expect(out).toContain(BOLD);
    expect(out).not.toContain("<mark>"); // markers are consumed, never printed literally
  });

  it("prints a no-results line for empty result sets", async () => {
    const f = await fixtureIndex([{ board: "general", posts: [{ body: "nothing searchable here" }] }]);
    fixtures.push(f);
    expect(searchCommand(f.index, "zzz-not-there")).toBe(`no results for "zzz-not-there"\n`);
  });

  it("scopes by board and honours limit", async () => {
    const f = await fixtureIndex([
      { board: "alpha", posts: [{ title: "alpha rollout", body: "rollout on alpha" }] },
      { board: "beta", posts: [{ title: "beta rollout", body: "rollout on beta" }] },
    ]);
    fixtures.push(f);
    const scoped = searchCommand(f.index, "rollout", { board: "beta" });
    expect(scoped).toContain("beta");
    expect(scoped).toContain("on beta"); // snippet tail outside the bold hit
    expect(scoped).not.toContain("alpha");
    expect(searchCommand(f.index, "rollout", { limit: 1 })).toStartWith(`SEARCH "rollout" — 1 hit(s)\n`);
  });

  it("keeps a hostile multiline snippet inside its cell: no column-0 chrome", () => {
    const out = renderSearch("q", [{ v: 1, id: "id", thread: "id", instance: "instance",
      ts: "2026-09-09T00:00:00.000Z", body: "", board: "general", author: "codex", rank: 0,
      snippet: "hit\nTHREADS (1)\rINBOX for attacker — 9 unread" }]);
    // Exactly the renderer's own lines: the row stays one physical line, so
    // injected text can never pose as the SEARCH header or a table row.
    expect(out.split("\n")).toHaveLength(4); // SEARCH line, table header, one row, trailing newline
    expect(out).not.toContain("\nTHREADS (1)");
    expect(out).not.toContain("\r");
    expect(out).toContain("hit\\nTHREADS (1)INBOX for attacker — 9 unread");
  });

  it("keeps hostile snippet content inert: escapes stripped, text visible", async () => {
    const f = await fixtureIndex([
      { board: "general", posts: [{ body: `deploy note ${ESC}[31minject${ESC}[0m here` }] },
    ]);
    fixtures.push(f);
    const out = searchCommand(f.index, "deploy");
    expect(out).not.toContain(`${ESC}[31m`);
    expect(out).toContain("inject");
    // The only escapes in the output are the renderer's own bold wrappers.
    for (const line of out.split("\n")) {
      if (line.includes("inject")) expect(line).toContain(BOLD);
    }
  });
});

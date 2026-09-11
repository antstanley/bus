import { describe, expect, it } from "bun:test";
import { loadSnapshotModel } from "../src/index.ts";
import { escapeHtml, renderHtml } from "../src/index.ts";
import { HOSTILE_BODY, HOSTILE_TITLE, hostilePost, snapshotFixture } from "./helpers.ts";

async function renderFixtureBoard(): Promise<string> {
  const f = await snapshotFixture([{ board: "general", posts: [hostilePost()] }]);
  try {
    const { FsStore } = await import("@board/store-fs");
    const model = await loadSnapshotModel(new FsStore(f.dir));
    return renderHtml(model, { generatedAt: "2026-09-10T00:00:00.000Z" });
  } finally {
    await f.close();
  }
}

describe("escapeHtml", () => {
  it("neutralises markup and attribute-breaking characters", () => {
    expect(escapeHtml(`<script>alert("x")</script>`)).toBe("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(escapeHtml(`a&b'c"d`)).toBe("a&amp;b&#39;c&quot;d");
    expect(escapeHtml("plain text stays plain")).toBe("plain text stays plain");
  });
});

describe("renderHtml inertness", () => {
  it("renders a hostile post fully escaped: no script, handlers, or external refs", async () => {
    const html = await renderFixtureBoard();

    // Every hostile byte arrives only in escaped form.
    expect(html).toContain(escapeHtml(HOSTILE_BODY));
    expect(html).toContain(escapeHtml(HOSTILE_TITLE));
    expect(html).toContain(escapeHtml("<b>bold</b>"));
    for (const hostile of ['<script>alert("xss")</script>', '<img src=x onerror="alert(1)">', '"><svg onload="alert(2)">']) {
      expect(html).not.toContain(hostile);
    }

    // Structural inertness: every raw tag in the document is one of the
    // renderer's own; hostile content can only contribute escaped text.
    // (Escaped onerror=&quot; text is inert; a live handler needs a real tag.)
    expect(html).toContain('onerror=&quot;alert(1)&quot;');
    expect(html).toContain('onload=&quot;alert(2)&quot;');
    const tags = [...html.matchAll(/<\/?([a-z][a-z0-9-]*)/gi)].map((m) => m[1]!.toLowerCase());
    const allow = new Set([
      "html", "head", "meta", "title", "style", "body",
      "h1", "h2", "p", "article", "section", "strong", "span",
    ]);
    const foreign = tags.filter((tag) => !allow.has(tag));
    expect(foreign).toEqual([]);
    expect(html).not.toMatch(/<script|<iframe|<object|<embed|javascript:/i);
    expect(html).not.toMatch(/<\/?img|<svg/i);
    // Nothing loads from anywhere: none of the raw tags carries a src or
    // href, and no absolute URL appears anywhere (escaped content included).
    const rawTags = html.match(/<[^>]*>/g) ?? [];
    for (const tag of rawTags) expect(tag).not.toMatch(/\s(src|href)\s*=/i);
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).toContain(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">`);
  });

  it("renders one complete document with static style only", async () => {
    const html = await renderFixtureBoard();
    expect(html).toStartWith("<!doctype html>");
    expect(html).toContain("<style>");
    expect(html.endsWith("</html>\n")).toBe(true);
  });

  it("escapes caller-supplied model fields: snapshot days and counts are untrusted too", () => {
    const hostile = {
      boards: [],
      days: ['2026-01-01 <script>alert("days")</script>'],
      threads: [
        {
          board: "general",
          rootId: "01ROOT00000000000000000000",
          title: null,
          lastActivity: "2026-01-01T00:00:00.000Z",
          replyCount: '<img src=x onerror="alert(3)">' as unknown as number,
          posts: [],
        },
      ],
      postCount: 1,
      corruptLines: 2,
      foreignBoardLines: 3,
      generatedAt: "2026-09-10T00:00:00.000Z",
    };
    const html = renderHtml(hostile);
    // The normal snapshot path constrains days to digits/hyphen, but a
    // caller-supplied model can carry anything: it must arrive escaped.
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).toContain(escapeHtml('2026-01-01 <script>alert("days")</script>'));
    expect(html).toContain(escapeHtml('<img src=x onerror="alert(3)">'));
    expect(html).not.toMatch(/<script|<iframe|javascript:/i);
  });

  it("renders the empty store with a visible empty note", () => {
    const empty = {
      boards: [],
      days: [],
      threads: [],
      postCount: 0,
      corruptLines: 0,
      foreignBoardLines: 0,
      generatedAt: "2026-09-10T00:00:00.000Z",
    };
    const html = renderHtml(empty);
    expect(html).toContain("No snapshot posts found.");
    expect(html).toContain("posts 0");
  });
});

describe("renderHtml completeness", () => {
  it("shows every post of every thread across boards", async () => {
    const f = await snapshotFixture([
      {
        board: "general",
        posts: [
          { title: "First", body: "first body" },
          { reply: 0, input: { body: "first reply" } },
        ],
      },
      { board: "letta", posts: [{ title: "Second board thread", body: "letta body" }] },
    ]);
    try {
      const { FsStore } = await import("@board/store-fs");
      const model = await loadSnapshotModel(new FsStore(f.dir));
      const html = renderHtml(model);
      expect(html).toContain("First");
      expect(html).toContain("first body");
      expect(html).toContain("first reply");
      expect(html).toContain("Second board thread");
      expect(html).toContain("letta body");
      for (const post of model.threads.flatMap((t) => t.posts)) {
        expect(html).toContain(post.id);
      }
      expect(model.threads.length).toBe(2);
      // Header counts match the model.
      expect(html).toContain(`threads ${model.threads.length}`);
      expect(html).toContain(`posts ${model.postCount}`);
    } finally {
      await f.close();
    }
  });
});

// CloudEvents interop (task 201): post -> CloudEvent -> post reproduces the
// canonical bytes, for v1 and fully-loaded v2 posts alike.
import { describe, it, expect } from "bun:test";
import {
  Board, MemoryStore, InvalidPostError, LIMITS,
  type CloudEvent, type Post,
  encodePost, fromCloudEvent, toCloudEvent,
} from "../src/index.ts";

const TRACEPARENT = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01";

async function richPost(): Promise<{ post: Post; root: Post }> {
  const b = new Board(new MemoryStore(), { board: "general", author: "claude" });
  const root = await b.request("codex", { body: "summarize the thread", title: "Task" }, { replyBy: "2026-09-10T09:00:00Z" });
  const post = await b.reply(root, {
    body: "**bid**: 3 units",
    tags: ["net"],
    mentions: ["codex"],
    to: ["codex", "letta"],
    act: "propose",
    protocol: "contract-net",
    task: root.id,
    replyBy: "2026-09-11T17:00:00Z",
    expires: "2000-01-01T00:00:00Z", // long past: legal, readers skip
    contentType: "text/markdown",
    data: { bid: 3, criteria: { cost: 1, speed: 2 } },
    dataSchema: "https://example.com/schemas/bid.json",
    origin: { source: "https://slack.example/T1/C2", id: "1743000000.000100" },
    trace: { traceparent: TRACEPARENT, tracestate: "congo=t61rcWkgMzE" },
    extensions: ["https://example.com/ext/capabilities/v1"],
    ext: { free: "form", nested: { a: [1, 2] } },
  });
  return { post, root };
}

function v1Post(): Post {
  const id = "01K46Q1234567890ABCDEFGHJK";
  return {
    v: 1,
    id,
    board: "general",
    thread: id,
    author: "letta",
    instance: "01K46Q1234567890ABCDEFGH77",
    ts: "2025-09-03T02:38:22.820Z",
    body: "plain v1",
    tags: ["design"],
  };
}

describe("CloudEvents round-trip", () => {
  it("maps a v1 post to a CloudEvent and back byte-identically", () => {
    const post = v1Post();
    const ce = toCloudEvent(post);
    expect(ce.specversion).toBe("1.0");
    expect(ce.id).toBe(post.id);
    expect(ce.type).toBe("board.post"); // no act -> no suffix
    expect(ce.source).toBe(`urn:board:${post.author}:${post.instance}`);
    expect(ce.subject).toBe(post.thread);
    expect(ce.time).toBe(post.ts);
    expect(ce.boardversion).toBe(1);
    expect(ce.datacontenttype).toBeUndefined(); // absent <-> absent
    const back = fromCloudEvent(ce);
    expect(back.v).toBe(1);
    expect(encodePost(back)).toBe(encodePost(post));
  });

  it("maps a fully-loaded v2 post and back byte-identically", async () => {
    const { post, root } = await richPost();
    const ce = toCloudEvent(post);
    expect(ce.type).toBe("board.post.propose");
    expect(ce.subject).toBe(post.thread);
    expect(ce.causationid).toBe(post.replyTo);
    expect(ce.datacontenttype).toBe(post.contentType);
    expect(ce.dataschema).toBe("https://example.com/schemas/bid.json");
    expect(ce.data).toEqual({ bid: 3, criteria: { cost: 1, speed: 2 } });
    expect(ce.expirytime).toBe("2000-01-01T00:00:00Z");
    expect(ce.traceparent).toBe(TRACEPARENT);
    expect(ce.tracestate).toBe("congo=t61rcWkgMzE");
    expect(ce.boardto).toEqual(["codex", "letta"]);
    expect(ce.boardtask).toBe(root.id);
    expect(ce.boardorigin).toEqual({ source: "https://slack.example/T1/C2", id: "1743000000.000100" });
    expect(ce.boardreplyby).toBe("2026-09-11T17:00:00Z");
    expect(ce.boardversion).toBe(2);
    const back = fromCloudEvent(ce);
    expect(back.v).toBe(2);
    expect(back.act).toBe("propose");
    expect(back.status).toBeUndefined();
    expect(encodePost(back)).toBe(encodePost(post));
  });

  it("carries an explicit act (including inform) and A2A status through the type attribute", async () => {
    const b = new Board(new MemoryStore(), { board: "g", author: "claude" });
    for (const act of ["inform", "status"] as const) {
      const post = await b.post({ body: "x", act, ...(act === "status" ? { status: "working" as const } : {}) });
      expect(toCloudEvent(post).type).toBe(`board.post.${act}`);
      expect(encodePost(fromCloudEvent(toCloudEvent(post)))).toBe(encodePost(post));
    }
  });

  it("carries the version explicitly, so v:2 with no v2-only field still round-trips", () => {
    const id = "01K46Q1234567890ABCDEFGHJK";
    const post = { v: 2 as const, id, board: "g", thread: id, author: "letta", instance: "01K46Q1234567890ABCDEFGH77", ts: "2025-09-03T02:38:22.820Z", body: "bare" };
    const back = fromCloudEvent(toCloudEvent(post));
    expect(back.v).toBe(2);
    expect(encodePost(back)).toBe(encodePost(post));
  });

  it("round-trips trace without tracestate byte-identically (absent <-> absent)", async () => {
    const b = new Board(new MemoryStore(), { board: "g", author: "claude" });
    const post = await b.post({ body: "traced", trace: { traceparent: TRACEPARENT } });
    const ce = toCloudEvent(post);
    expect(ce.traceparent).toBe(TRACEPARENT);
    expect(ce.tracestate).toBeUndefined();
    const back = fromCloudEvent(ce);
    expect(back.trace).toEqual({ traceparent: TRACEPARENT });
    expect(encodePost(back)).toBe(encodePost(post));
  });

  it("rejects an oversize event: fromCloudEvent never emits a post parsePost would skip", () => {
    const ce = toCloudEvent(v1Post());
    ce.data = { blob: "x".repeat(LIMITS.maxBytes) };
    // Same guard, same message as parsePost's size check.
    expect(() => fromCloudEvent(ce)).toThrow(/larger than 65536 bytes/);
    expect(() => fromCloudEvent(ce)).toThrow(InvalidPostError);
  });

  it("rejects foreign or corrupted events instead of fabricating a post (fail-closed)", async () => {
    const base = toCloudEvent(v1Post());
    const mutated = (over: Record<string, unknown>): CloudEvent => ({ ...base, ...over }) as CloudEvent;
    expect(() => fromCloudEvent(mutated({ type: "com.example.other" }))).toThrow(/not a board post type/);
    expect(() => fromCloudEvent(mutated({ type: "board.post.requast" }))).toThrow(/unknown act/);
    expect(() => fromCloudEvent(mutated({ type: "board.post.inform.extra" }))).toThrow(/unknown act/);
    expect(() => fromCloudEvent(mutated({ source: "https://other.example/x" }))).toThrow(/not a board post source/);
    expect(() => fromCloudEvent(mutated({ specversion: "0.3" as "1.0" }))).toThrow(/specversion/);
    expect(() => fromCloudEvent(mutated({ boardversion: 3 }))).toThrow(/unsupported post version/);
    expect(() => fromCloudEvent(mutated({ boardbody: 42 }))).toThrow(/boardbody is not a string/);
    expect(() => fromCloudEvent(mutated({ boardstatus: "completed" }))).toThrow(/status is only valid when act is "status"/);
    expect(() => fromCloudEvent(mutated({ data: "not an object" }))).toThrow(/data is not an object/);
    expect(() => fromCloudEvent(mutated({ boardorigin: { source: "only-source" } }))).toThrow(/origin/);
    expect(() => fromCloudEvent(mutated({ traceparent: "garbage" }))).toThrow(/traceparent/);
    expect(() => fromCloudEvent(mutated({ tracestate: "congo=t61rcWkgMzE" }))).toThrow(/tracestate without traceparent/);
    expect(() => fromCloudEvent(mutated({ board: 7 }))).toThrow(/board is not a string/);
    expect(() => fromCloudEvent(mutated({ subject: undefined }))).toThrow(/subject/);
  });

  it("drops foreign extension attributes but still reproduces the post", () => {
    const post = v1Post();
    const ce = toCloudEvent(post);
    const withForeign = { ...ce, foodelivery: "x", myappnote: 3 };
    expect(encodePost(fromCloudEvent(withForeign))).toBe(encodePost(post));
  });
});

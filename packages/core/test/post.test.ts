// Envelope v2 (task 201): new optional fields, fail-closed validation, and the
// hard invariants — a v1 post's canonical bytes and validation are unchanged.
import { describe, it, expect } from "bun:test";
import {
  ACTS, STATUSES, DEFAULT_ACT, DEFAULT_CONTENT_TYPE, InvalidPostError,
  LIMITS, canonicalize, encodePost, parsePost, validatePost, hasV2Fields,
  ulid, type Post,
} from "../src/index.ts";

// Fixed ids from Sept 2025: always in the past, so no future-id interference.
const ID = "01K46Q1234567890ABCDEFGHJK";
const INSTANCE = "01K46Q1234567890ABCDEFGH77";

/** A minimal valid v1 post, overridable field by field. */
function basePost(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    v: 1,
    id: ulid(Date.UTC(2026, 8, 1, 12, 0, 0)),
    board: "general",
    thread: ID,
    author: "letta",
    instance: INSTANCE,
    ts: "2026-09-01T12:00:00.000Z",
    body: "hello",
    ...over,
  };
}

function bytesOf(p: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(canonicalize(p) + "\n");
}

/** Object nested k levels deep: {d:{d:{...:1}}}. */
function nest(k: number): Record<string, unknown> {
  let v: unknown = 1;
  for (let i = 0; i < k; i++) v = { d: v };
  return v as Record<string, unknown>;
}

describe("envelope v2", () => {
  it("a v1 post encodes byte-identically to its pre-v2 form (hard invariant)", () => {
    // Snapshot: a v1 post with every v1 field set, encoded before envelope v2
    // existed. The bytes below were produced by the pre-v2 encodePost and must
    // never change.
    const post = {
      v: 1 as const,
      id: ID,
      board: "general",
      thread: ID,
      replyTo: "01K46Q1234567890ABCDEFGHJ5",
      author: "letta",
      instance: INSTANCE,
      ts: "2025-09-03T02:38:22.820Z",
      title: "hello",
      body: "first post",
      tags: ["design"],
      mentions: ["codex"],
      attachments: [{ sha256: "aa".repeat(32), name: "a.png", size: 1, type: "image/png" }],
      sig: { keyId: "letta-1", alg: "ed25519", value: "c2lnbmF0dXJl" },
      ext: { free: "form", n: 1 },
    };
    const bytes = encodePost(post);
    expect(bytes).toBe(
      `{"attachments":[{"name":"a.png","sha256":"${"aa".repeat(32)}","size":1,"type":"image/png"}],"author":"letta",` +
      `"board":"general","body":"first post","ext":{"free":"form","n":1},"id":"${ID}",` +
      `"instance":"${INSTANCE}","mentions":["codex"],` +
      `"replyTo":"01K46Q1234567890ABCDEFGHJ5","sig":{"alg":"ed25519","keyId":"letta-1","value":"c2lnbmF0dXJl"},` +
      `"tags":["design"],"thread":"${ID}","title":"hello","ts":"2025-09-03T02:38:22.820Z","v":1}\n`,
    );
    // And it still validates and re-encodes to the same bytes.
    expect(encodePost(parsePost(new TextEncoder().encode(bytes)))).toBe(bytes);
  });

  it("a v1 post without new fields validates exactly as before: no fields added, none defaulted", () => {
    const p = basePost({ title: "t", tags: ["x"], mentions: ["codex"], ext: { a: 1 } });
    const out = validatePost(p);
    // No act/contentType defaults are materialized into the stored form.
    expect(out).toEqual(p as unknown as Post);
    expect(Object.keys(out).sort()).toEqual(Object.keys(p).sort());
    expect(canonicalize(out)).toBe(canonicalize(p));
  });

  it("accepts v:1 and v:2 and rejects every other version", () => {
    expect(validatePost(basePost()).v).toBe(1);
    expect(validatePost(basePost({ v: 2 })).v).toBe(2);
    // Readers are permissive about v:1 posts that carry v2 fields (the writer
    // would have set v:2; the signature covers the bytes either way).
    expect(validatePost(basePost({ v: 1, act: "request" })).act).toBe("request");
    for (const bad of [0, 3, 1.5, -1, "1", "2", null, true]) {
      expect(() => validatePost(basePost({ v: bad }))).toThrow(/unsupported post version/);
    }
  });

  it("accepts every act value; absent act means inform; unknown acts are rejected", () => {
    for (const act of ACTS) expect(validatePost(basePost({ v: 2, act })).act).toBe(act);
    expect(validatePost(basePost()).act).toBeUndefined();
    expect(DEFAULT_ACT).toBe("inform");
    for (const bad of ["requast", "REQUEST", "Inform", "", "request ", "cfp\nforged", null, 42, true]) {
      expect(() => validatePost(basePost({ v: 2, act: bad }))).toThrow(InvalidPostError);
      expect(() => validatePost(basePost({ v: 2, act: bad }))).toThrow(/unknown act/);
    }
  });

  it("accepts every status value on act=status and rejects status otherwise (fail-closed)", () => {
    for (const status of STATUSES) {
      const p = validatePost(basePost({ v: 2, act: "status", status }));
      expect(p.status).toBe(status);
    }
    for (const act of ACTS) {
      if (act === "status") continue;
      expect(() => validatePost(basePost({ v: 2, act, status: "completed" }))).toThrow(/status is only valid when act is "status"/);
    }
    expect(() => validatePost(basePost({ v: 2, status: "completed" }))).toThrow(/got no act/);
    for (const bad of ["complete", "cancelled", "WORKING", "", "working\n", null, 7]) {
      expect(() => validatePost(basePost({ v: 2, act: "status", status: bad }))).toThrow(/unknown status/);
    }
  });

  it("rejects unknown top-level keys so nothing can smuggle past the canonical form", () => {
    for (const smuggled of [{ exec: "*" }, { v: 9 }, { act: "inform" }, 1, "x", [1], null]) {
      expect(() => validatePost(basePost({ smuggled }))).toThrow(/unknown post field: smuggled/);
    }
    // ...on v1 and v2 posts alike
    expect(() => validatePost(basePost({ v: 2, act: "request", "board.raw": "x" }))).toThrow(/unknown post field: board\.raw/);
    expect(() => parsePost(bytesOf(basePost({ extra: { deep: true } })))).toThrow(InvalidPostError);
  });

  it("validates `to` recipients with the agent-name rules, like mentions", () => {
    expect(validatePost(basePost({ v: 2, to: ["codex", "claude_2"] })).to).toEqual(["codex", "claude_2"]);
    for (const bad of ["Codex", "bad name", "a/b", "../etc", "", "x".repeat(33)]) {
      expect(() => validatePost(basePost({ v: 2, to: ["ok", bad] }))).toThrow(/invalid to/);
    }
    expect(() => validatePost(basePost({ v: 2, to: "codex" }))).toThrow(/to is not a string\[\]/);
    expect(() => validatePost(basePost({ v: 2, to: [42] }))).toThrow(/to is not a string\[\]/);
  });

  it("requires task, thread and replyTo to be ULIDs", () => {
    expect(validatePost(basePost({ v: 2, task: ID })).task).toBe(ID);
    for (const bad of ["nope", "01K4", 123, null]) {
      expect(() => validatePost(basePost({ v: 2, task: bad }))).toThrow(/task is not a ulid/);
    }
    expect(() => validatePost(basePost({ thread: "nope" }))).toThrow(/thread is not a ulid/);
    expect(() => validatePost(basePost({ replyTo: "01K4" }))).toThrow(/replyTo is not a ulid/);
  });

  it("parses replyBy/expires as dates and accepts a past expires", () => {
    const p = validatePost(basePost({ v: 2, replyBy: "2026-09-04T12:00:00.000Z", expires: "2000-01-01T00:00:00Z" }));
    expect(p.replyBy).toBe("2026-09-04T12:00:00.000Z");
    expect(p.expires).toBe("2000-01-01T00:00:00Z"); // past: legal, readers skip
    expect(() => validatePost(basePost({ v: 2, replyBy: "tomorrow" }))).toThrow(/replyBy is not a date/);
    expect(() => validatePost(basePost({ v: 2, replyBy: "2026-13-40T00:00:00Z" }))).toThrow(/replyBy is not a date/);
    expect(() => validatePost(basePost({ v: 2, expires: "next friday" }))).toThrow(/expires is not a date/);
    expect(() => validatePost(basePost({ v: 2, expires: 1756867102820 }))).toThrow(/expires is not a date/);
  });

  it("validates protocol with the key-segment charset", () => {
    expect(validatePost(basePost({ v: 2, protocol: "request" })).protocol).toBe("request");
    expect(validatePost(basePost({ v: 2, protocol: "contract-net" })).protocol).toBe("contract-net");
    expect(validatePost(basePost({ v: 2, protocol: "a2a_task.v2" })).protocol).toBe("a2a_task.v2");
    for (const bad of ["no/slashes", "..", ".", "", "x y"]) {
      expect(() => validatePost(basePost({ v: 2, protocol: bad }))).toThrow(/invalid protocol/);
    }
    expect(() => validatePost(basePost({ v: 2, protocol: 7 }))).toThrow(/protocol is not a string/);
  });

  it("validates contentType, dataSchema and extensions", () => {
    expect(validatePost(basePost({ v: 2, contentType: "application/json" })).contentType).toBe("application/json");
    expect(validatePost(basePost({ v: 2, contentType: "text/plain; charset=utf-8" })).contentType).toBe("text/plain; charset=utf-8");
    expect(DEFAULT_CONTENT_TYPE).toBe("text/markdown");
    for (const bad of ["text", "a/b/c", "", "/json", "text/"]) {
      expect(() => validatePost(basePost({ v: 2, contentType: bad }))).toThrow(/contentType is not a MIME type/);
    }
    expect(validatePost(basePost({ v: 2, dataSchema: "https://example.com/schemas/task.json" })).dataSchema).toBe("https://example.com/schemas/task.json");
    expect(() => validatePost(basePost({ v: 2, dataSchema: "not a uri" }))).toThrow(/dataSchema is not a URI/);
    expect(() => validatePost(basePost({ v: 2, dataSchema: "/relative/only" }))).toThrow(/dataSchema is not a URI/);
    const ok = validatePost(basePost({ v: 2, extensions: ["https://example.com/ext/capabilities/v1", "urn:example:ext"] }));
    expect(ok.extensions).toHaveLength(2);
    expect(() => validatePost(basePost({ v: 2, extensions: ["no-scheme"] }))).toThrow(/extension is not a URI/);
    expect(() => validatePost(basePost({ v: 2, extensions: "https://x" }))).toThrow(/extensions is not a string\[\]/);
  });

  it("counts data toward the depth and size limits and requires a plain object", () => {
    // The post is level 1 and data level 2: 7 nested object levels stay within
    // depth 8, an 8th level breaks it.
    const withData = validatePost(basePost({ v: 2, data: nest(7) }));
    expect(withData.data).toBeDefined();
    expect(() => validatePost(basePost({ v: 2, data: nest(8) }))).toThrow(/nesting deeper than 8/);
    for (const bad of [[1, 2, 3], "text", 42, null]) {
      expect(() => validatePost(basePost({ v: 2, data: bad }))).toThrow(/data is not an object/);
    }
    // Size: parsePost bounds the whole encoded object, data included.
    const big = basePost({ v: 2, data: { blob: "x".repeat(LIMITS.maxBytes) } });
    expect(() => parsePost(bytesOf(big))).toThrow(/larger than 65536 bytes/);
    const fits = basePost({ v: 2, data: { blob: "x".repeat(1024) } });
    expect(parsePost(bytesOf(fits)).data).toEqual({ blob: "x".repeat(1024) });
  });

  it("validates origin as {source, id} for bridged-message dedup", () => {
    const origin = { source: "https://slack.example/T1/C2", id: "1743000000.000100" };
    const p = validatePost(basePost({ v: 2, origin }));
    expect(p.origin).toEqual(origin);
    expect(p.origin?.source).toBe("https://slack.example/T1/C2");
    expect(p.origin?.id).toBe("1743000000.000100");
    for (const bad of [{ source: "s" }, { id: "i" }, { source: "", id: "" }, "s=i", { source: 1, id: 2 }, 42]) {
      expect(() => validatePost(basePost({ v: 2, origin: bad }))).toThrow(InvalidPostError);
    }
  });

  it("validates trace lightly: traceparent shape, optional tracestate", () => {
    const tp = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01";
    expect(validatePost(basePost({ v: 2, trace: { traceparent: tp } })).trace?.traceparent).toBe(tp);
    expect(validatePost(basePost({ v: 2, trace: { traceparent: tp, tracestate: "congo=t61rcWkgMzE" } })).trace?.tracestate).toBe("congo=t61rcWkgMzE");
    // Shape sanity only (documented): wrong lengths, non-hex, uppercase hex are rejected.
    for (const bad of ["00-abc-01", "00-0AF7651916CD43DD8448EB211C80319C-b7ad6b7169203331-01", "0-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01", "injected"]) {
      expect(() => validatePost(basePost({ v: 2, trace: { traceparent: bad } }))).toThrow(/traceparent/);
    }
    expect(() => validatePost(basePost({ v: 2, trace: { traceparent: tp, tracestate: "" } }))).toThrow(/tracestate/);
    expect(() => validatePost(basePost({ v: 2, trace: { tracestate: "congo=t61rcWkgMzE" } }))).toThrow(/traceparent/);
  });

  it("hasV2Fields mirrors the writer rule: v bumps to 2 only when a v2-only field is set", () => {
    expect(hasV2Fields(basePost())).toBe(false);
    expect(hasV2Fields(basePost({ title: "v1 fields only" }))).toBe(false);
    for (const f of ["to", "act", "protocol", "task", "status", "replyBy", "expires", "contentType", "data", "dataSchema", "origin", "trace", "extensions"]) {
      expect(hasV2Fields(basePost({ [f]: "x" }))).toBe(true);
    }
    // Absent beats empty: tags: [] is a v1 field; to: [] is set but pointless.
    expect(hasV2Fields({ act: undefined })).toBe(false);
  });

  it("v2 posts round-trip canonical bytes through parse/encode like v1 posts", () => {
    const p = basePost({
      v: 2, act: "request", to: ["codex"], protocol: "a2a-task", task: ID,
      replyBy: "2026-09-04T12:00:00.000Z", contentType: "application/json",
      data: { parts: [{ kind: "text", text: "summarize" }] }, dataSchema: "https://example.com/s.json",
      origin: { source: "https://a2a.example/agents/x", id: "msg-1" },
      trace: { traceparent: "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01" },
      extensions: ["https://example.com/ext/v1"],
    });
    const bytes = bytesOf(p);
    expect(encodePost(parsePost(bytes))).toBe(canonicalize(p) + "\n");
  });
});

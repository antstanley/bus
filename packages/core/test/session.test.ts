import { describe, expect, test } from "bun:test";
import {
  InvalidSessionIdError,
  assertRuntimeSessionId,
  isRuntimeSessionId,
} from "../src/index.ts";

describe("runtime session identifiers", () => {
  test("accepts UUIDs for Claude and Codex", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(isRuntimeSessionId("claude", id)).toBe(true);
    expect(assertRuntimeSessionId("codex", id)).toBe(id);
  });

  test("accepts bounded opaque ids used by Letta, OpenCode, and Pi", () => {
    expect(isRuntimeSessionId("letta", "conversation-456")).toBe(true);
    expect(isRuntimeSessionId("opencode", "ses_123/child:2")).toBe(true);
    expect(isRuntimeSessionId("pi", "pi-session-123")).toBe(true);
  });

  test("rejects non-UUID Claude/Codex ids and unsafe opaque ids", () => {
    expect(() => assertRuntimeSessionId("codex", "thread-123")).toThrow(InvalidSessionIdError);
    expect(() => assertRuntimeSessionId("claude", "11111111-1111-0111-8111-111111111111")).toThrow(
      "claude session id must be a UUID",
    );
    expect(() => assertRuntimeSessionId("letta", "conversation\nforged")).toThrow(
      "letta session id must be a 1-256 character ASCII token",
    );
    expect(isRuntimeSessionId("opencode", "x".repeat(257))).toBe(false);
    expect(isRuntimeSessionId("pi", " leading-space")).toBe(false);
  });
});

import { describe, it, expect } from "bun:test";
import { keys, assertName, assertSegment, dayBucket, nextDay, prevDay, InvalidKeyError } from "../src/index.ts";

describe("keys", () => {
  it("rejects traversal and separators in every user-controlled segment", () => {
    for (const bad of ["..", ".", "a/b", "a\\b", "", "A", "-x", "x y", "a".repeat(33), "../etc"]) {
      expect(() => assertName(bad)).toThrow(InvalidKeyError);
    }
    for (const bad of ["..", ".", "a/b", "", "x y"]) expect(() => assertSegment(bad)).toThrow(InvalidKeyError);
    expect(() => keys.post("../x", "01J6XY0000000000000000000A", 0)).toThrow(InvalidKeyError);
    expect(() => keys.presence("ok", "../../x")).toThrow(InvalidKeyError);
  });
  it("builds the documented layout", () => {
    const ms = Date.UTC(2026, 8, 1, 18, 0, 0);
    expect(keys.post("general", "01K46Q1234567890ABCDEFGHJK", ms)).toBe("boards/general/posts/2026-09-01/01K46Q1234567890ABCDEFGHJK.json");
    expect(keys.presence("codex", "01K46Q1234567890ABCDEFGHJK")).toBe("agents/codex/presence/01K46Q1234567890ABCDEFGHJK.json");
  });
  it("day arithmetic is UTC", () => {
    expect(dayBucket(Date.UTC(2026, 11, 31, 23, 59, 59))).toBe("2026-12-31");
    expect(nextDay("2026-12-31")).toBe("2027-01-01");
    expect(prevDay("2027-01-01")).toBe("2026-12-31");
  });
});

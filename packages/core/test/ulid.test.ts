import { describe, it, expect } from "bun:test";
import { ulid, isUlid, ulidTime } from "../src/index.ts";

describe("ulid", () => {
  it("is 26 chars of Crockford base32 and round-trips its timestamp", () => {
    const t = 1_756_750_000_123;
    const id = ulid(t);
    expect(isUlid(id)).toBe(true);
    expect(ulidTime(id)).toBe(t);
  });
  it("is strictly increasing within a ms and across ms", () => {
    const a = ulid(1000), b = ulid(1000), c = ulid(1001);
    expect(a < b).toBe(true);
    expect(b < c).toBe(true);
    expect(a.slice(0, 10)).toBe(b.slice(0, 10));
  });
  it("rejects junk", () => {
    expect(isUlid("nope")).toBe(false);
    expect(isUlid("8ZZZZZZZZZZZZZZZZZZZZZZZZZ")).toBe(false);
  });
});

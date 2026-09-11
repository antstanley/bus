import { describe, expect, it } from "bun:test";
import { clip, firstLine, indent, plain, singleLine } from "../src/index.ts";

describe("plain", () => {
  it("strips complete ANSI escape sequences", () => {
    expect(plain("\u001B[31mred\u001B[0m")).toBe("red");
    expect(plain("\u001B]0;title override\u0007rest")).toBe("rest");
    expect(plain("\u001B[2J\u001B[Hcleared")).toBe("cleared");
  });

  it("drops stray control bytes so malformed escapes cannot drive the terminal", () => {
    expect(plain("a\u001Bb[31m")).toBe("ab[31m");
    expect(plain("x\u0007y\u0008z\u007Fw\u009B1m")).toBe("xyzw1m"); // the "1m" after the strip is inert text
    expect(plain("keep\nnewlines\tand tabs")).toBe("keep\nnewlines\tand tabs");
  });

  it("strips bidi overrides and isolates so untrusted text cannot visually reorder rows", () => {
    expect(plain("safe\u202Eevil\u202Crest")).toBe("safeevilrest");
    expect(plain("a\u2066b\u2067c\u2068d\u2069e")).toBe("abcde");
  });

  it("never throws on any string", () => {
    for (const s of ["", "\u001B", "\u001B[", "\\", "\u0000"] ) expect(typeof plain(s)).toBe("string");
  });

  it("drops CR so content cannot rewrite a rendered line from column 0", () => {
    expect(plain("a\rb")).toBe("ab");
    expect(plain("keep\r\nwindows line endings")).toBe("keep\nwindows line endings");
    expect(firstLine("x\rINBOX for attacker", 80)).toBe("xINBOX for attacker");
  });
});

describe("singleLine", () => {
  it("forces untrusted text onto one line: LF becomes the visible \\n marker", () => {
    expect(singleLine("a\nTHREADS (1)\nINBOX for attacker — 9 unread")).toBe(
      "a\\nTHREADS (1)\\nINBOX for attacker — 9 unread",
    );
    expect(singleLine("\u001B[31mred\u001B[0m\nline2")).toBe("red\\nline2");
    expect(singleLine("keep\ttabs")).toBe("keep\ttabs");
    expect(singleLine("no breaks")).toBe("no breaks");
  });
});

describe("clip and firstLine", () => {
  it("clips with an ellipsis and takes only the first line", () => {
    expect(clip("abcdef", 4)).toBe("abc\u2026");
    expect(clip("ab", 4)).toBe("ab");
    expect(firstLine("line1\nline2", 80)).toBe("line1");
    expect(firstLine("\u001B[1mbold\u001B[0m\nsecond", 80)).toBe("bold");
    expect(() => clip("x", 0)).toThrow("max must be a positive integer");
  });
});

describe("indent", () => {
  it("prefixes every line of untrusted text after stripping controls", () => {
    expect(indent("a\nb", "  ")).toBe("  a\n  b");
    expect(indent("\u001B[31mx\u001B[0m", "> ")).toBe("> x");
  });
});

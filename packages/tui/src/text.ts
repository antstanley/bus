// Untrusted-data discipline for terminal rendering.
//
// Post titles, bodies, tags, snippets, author names and presence fields are
// untrusted store content (AGENTS.md message-hygiene rules apply). In the TUI
// they are rendered as plain text lines only: every string below has passed
// through `plain`, which removes terminal escape sequences and control
// characters so hostile content cannot drive the terminal (cursor moves,
// colour changes, title overrides, keyboard re-assignment), and no renderer
// ever emits content on a line that could be mistaken for chrome: bodies are
// indented under a fixed prefix, and every other fragment (list rows, header
// fields, snippets) goes through `singleLine`, so a line break inside
// untrusted content can never start a fresh line at column 0.

/** C0 controls except \n and \t, plus DEL and the C1 range. CR (U+000D) is
 * dropped too: a lone CR moves the cursor to column 0, so content carrying
 * one could overwrite the start of a rendered line and imitate chrome. */
const CONTROL_CHARS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;
/** Complete CSI sequences (ESC [ ... final byte). */
const CSI = /\u001B\[[0-?]*[ -/]*[@-~]/g;
/** Complete OSC sequences (ESC ] ... BEL or ST), tolerating truncation. */
const OSC = /\u001B\][^\u0007\u001B]*(?:\u0007|\u001B\\)?/g;
/** Bidi overrides and isolates (G1 review LOW): invisible controls that
 * visually reorder following text, enabling display spoofing. */
const BIDI = /[\u202A-\u202E\u2066-\u2069]/g;

/**
 * Reduce untrusted text to inert plain text: well-formed ANSI escape
 * sequences are removed whole, control characters (including bidi
 * overrides/isolates) are dropped, and everything else (including literal
 * "[31m" remnants of a malformed escape) passes through as visible text.
 * Never throws on any string input.
 */
export function plain(text: string): string {
  return text.replace(OSC, "").replace(CSI, "").replace(BIDI, "").replace(CONTROL_CHARS, "");
}

/** Visible stand-in rendered for a line break inside a single-line cell. */
const BREAK = "\\n";

/**
 * Untrusted text forced onto one line: `plain`, then every LF rendered as
 * the visible `\n` marker instead of a real break. Use for every header
 * fragment and table cell: a real LF there would continue the line at
 * column 0 and let content imitate the viewer's own chrome.
 */
export function singleLine(text: string): string {
  return plain(text).replaceAll("\n", BREAK);
}

/** Clip one logical line to `max` characters, marking the cut with an ellipsis. */
export function clip(text: string, max: number): string {
  if (!Number.isInteger(max) || max < 1) throw new Error("max must be a positive integer");
  return text.length <= max ? text : text.slice(0, max - 1) + "\u2026";
}

/**
 * First line of untrusted text, clipped: list rows show one line only, so a
 * body's later lines never impersonate table rows.
 */
export function firstLine(text: string, max: number): string {
  return clip(plain(text).split("\n", 1)[0] ?? "", max);
}

/**
 * Every line of untrusted text, each prefixed so content can never align
 * with the viewer's own chrome, control characters already stripped.
 */
export function indent(text: string, prefix: string): string {
  return plain(text)
    .split("\n")
    .map((line) => prefix + line)
    .join("\n");
}

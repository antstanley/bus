// Pure text renderers for the four viewer commands. Every function takes
// already-queried data and returns a string; nothing here touches the index,
// the store, or the clock, which is what keeps the renderers trivially
// testable against fixtures. All untrusted fields pass through `plain`/
// `firstLine`/`indent`/`singleLine` (see text.ts) and are rendered as plain
// text lines: header fragments and table cells are single-line (`singleLine`),
// bodies are indented (`indent`), so no content line can pose as chrome.

import type { Post } from "@board/core";
import type { PresencePage } from "@board/presence";
import type { SearchResult, ThreadSummary, ThreadView } from "@board/index";
import { clip, firstLine, indent, plain, singleLine } from "./text.ts";

/** Highlight wrapper the index's FTS snippet() emits around query hits. */
const MARK = "<mark>";
const MARK_END = "</mark>";
/** ANSI bold, applied only after a snippet has been reduced to inert text. */
const BOLD = "\u001B[1m";
const RESET = "\u001B[0m";

/** Display width of a cell: ANSI bold wrappers (ours alone) count as zero. */
function width(cell: string): number {
  return cell.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "").length;
}

/** One aligned table: two-space gutters, columns sized to the widest cell. */
function table(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((row) => width(row[i]!))));
  const line = (row: string[]) =>
    row
      .map((cell, i) => {
        const pad = widths[i]! - width(cell);
        return pad > 0 ? cell + " ".repeat(pad) : cell;
      })
      .join("  ")
      .trimEnd();
  return [line(headers), ...rows.map(line)].join("\n");
}

const TITLE_WIDTH = 60;
const SNIPPET_WIDTH = 80;

/** Thread list: one row per thread, newest activity first (index order). */
export function renderThreadList(threads: ThreadSummary[]): string {
  if (threads.length === 0) return "no threads\n";
  const header = ["THREAD ID", "BOARD", "TITLE", "REPLIES", "LAST ACTIVITY"];
  const rows = threads.map((t) => [
    singleLine(t.rootId),
    singleLine(t.board),
    firstLine(t.title ?? "(no title)", TITLE_WIDTH),
    String(t.replyCount),
    singleLine(t.lastActivity),
  ]);
  return `THREADS (${threads.length})\n${table(header, rows)}\n`;
}

/** One thread: header line, then every post in id order, bodies indented. */
export function renderThread(view: ThreadView): string {
  const lines = [
    `THREAD ${singleLine(view.rootId)}  board=${singleLine(view.board)}  replies=${view.replyCount}  last=${singleLine(view.lastActivity)}`,
  ];
  for (const post of view.posts) lines.push(renderPost(post));
  return lines.join("\n") + "\n";
}

/** One post: a header line, optional title, then the body as indented lines. */
export function renderPost(post: Post): string {
  const tags = post.tags === undefined ? "" : `  tags=${singleLine(post.tags.join(","))}`;
  const to = post.to === undefined ? "" : `  to=${singleLine(post.to.join(","))}`;
  const lines = [
    `  [${singleLine(post.id)}] ${singleLine(post.ts)}  author=${singleLine(post.author)}${tags}${to}`,
  ];
  if (post.title !== undefined) lines.push(`  ${firstLine(post.title, TITLE_WIDTH)}`);
  for (const line of indent(post.body, "    ").split("\n")) lines.push(line);
  return lines.join("\n");
}

/** The addressed inbox: unread items only (the index lists nothing else). */
export function renderInbox(agent: string, posts: Post[]): string {
  if (posts.length === 0) return `no unread inbox items for ${singleLine(agent)}\n`;
  const header = ["POST ID", "BOARD", "FROM", "RECEIVED", "TITLE"];
  const rows = posts.map((p) => [
    singleLine(p.id),
    singleLine(p.board),
    singleLine(p.author),
    singleLine(p.ts),
    firstLine(p.title ?? firstLine(p.body, TITLE_WIDTH), TITLE_WIDTH),
  ]);
  return `INBOX for ${singleLine(agent)} — ${posts.length} unread\n${table(header, rows)}\n`;
}

/** Read state of specific posts for one recipient. */
export interface ReadStateEntry {
  postId: string;
  /** "unread" = currently listed in the inbox; "not-unread" = everything else. */
  state: "unread" | "not-unread";
  /** Title when the post is unread (the index cannot fetch posts by id). */
  title: string | null;
}

/**
 * Per-post read state for one recipient. "not-unread" means marked read OR
 * not addressed to the agent: the index exposes no marker enumeration, so
 * the two are indistinguishable through the public API (documented limit).
 */
export function renderReadState(agent: string, entries: ReadStateEntry[]): string {
  if (entries.length === 0) return `no posts to check for ${singleLine(agent)}\n`;
  const header = ["POST ID", "STATE", "TITLE"];
  const rows = entries.map((e) => [
    singleLine(e.postId),
    e.state,
    e.title === null ? "(not unread)" : firstLine(e.title, TITLE_WIDTH),
  ]);
  return `READ STATE for ${singleLine(agent)}\n${table(header, rows)}\n`;
}

/** Recent presence: online state as reported by @board/presence. */
export function renderWho(page: PresencePage, maxAgeMs: number): string {
  const lines = [`WHO (online = heartbeat within ${maxAgeMs} ms)`];
  if (page.records.length === 0) lines.push("no presence records");
  else {
    const header = ["AGENT", "INSTANCE", "ONLINE", "STATUS", "TOOL", "HOST", "LAST HEARTBEAT"];
    const rows = page.records.map((r) => [
      singleLine(r.name),
      singleLine(r.instance),
      r.online ? "yes" : "no",
      firstLine(r.status ?? "", 24),
      firstLine(r.tool ?? "", 24),
      firstLine(r.host ?? "", 24),
      singleLine(r.ts),
    ]);
    lines.push(table(header, rows));
  }
  if (page.truncated) lines.push("(truncated: more presence records exist)");
  return lines.join("\n") + "\n";
}

/** Search results: one row per hit; <mark> hits render bold. */
export function renderSearch(query: string, results: SearchResult[]): string {
  if (results.length === 0) return `no results for ${JSON.stringify(plain(query))}\n`;
  const header = ["POST ID", "BOARD", "FROM", "RANK", "SNIPPET"];
  const rows = results.map((r) => [
    singleLine(r.id),
    singleLine(r.board),
    singleLine(r.author),
    String(r.rank),
    highlight(singleLine(r.snippet), SNIPPET_WIDTH),
  ]);
  return `SEARCH ${JSON.stringify(plain(query))} — ${results.length} hit(s)\n${table(header, rows)}\n`;
}

/**
 * Translate the index snippet markers to ANSI bold. The snippet is already
 * inert (`plain` above), so the escapes added here are the only ones in the
 * string; a hostile body cannot smuggle escapes by containing "<mark>".
 */
function highlight(inertSnippet: string, max: number): string {
  const clipped = clip(inertSnippet, max + MARK.length + MARK_END.length);
  // Clipping can remove a closing marker. Never leave the terminal bold.
  const highlighted = clipped.split(MARK).join(BOLD).split(MARK_END).join(RESET);
  return highlighted.includes(BOLD) ? highlighted + RESET : highlighted;
}

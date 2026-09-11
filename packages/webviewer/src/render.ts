// Static HTML renderer for a snapshot model.
//
// The rendered file is fully self-contained and inert: one inline <style>
// (static, authored here), no <script>, no event-handler attributes, no
// external references, and a default-denying CSP. Every dynamic value —
// titles, bodies, authors, tags, ids, names, timestamps, and the model's
// own counts and snapshot days (a caller-supplied model is untrusted too) —
// is HTML-escaped and placed in element text, never in an attribute, so
// board content can only ever display as text.

import type { SnapshotModel } from "./snapshot.ts";

/** Escape a value for use as HTML text content (and only text content). */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export interface HtmlOptions {
  /** Page <title> and <h1>; escaped like everything else. */
  title?: string;
  /** Generated-at line; defaults to the model's own stamp. */
  generatedAt?: string;
}

const STYLE = `
  :root { color-scheme: light dark; }
  body { font-family: system-ui, sans-serif; margin: 2rem auto; max-width: 52rem; padding: 0 1rem; line-height: 1.45; }
  h1 { font-size: 1.4rem; }
  h2 { font-size: 1.1rem; margin-bottom: 0.25rem; overflow-wrap: anywhere; }
  article.thread { border-top: 1px solid #8884; margin-top: 2rem; padding-top: 0.5rem; }
  .meta { color: #888; font-size: 0.85rem; overflow-wrap: anywhere; }
  section.post { margin: 0.75rem 0 0.75rem 1rem; }
  .post-meta { color: #888; font-size: 0.8rem; overflow-wrap: anywhere; }
  .post-body { white-space: pre-wrap; overflow-wrap: anywhere; margin: 0.15rem 0 0 0; }
  .tag { display: inline-block; background: #8882; border-radius: 0.6rem; font-size: 0.75rem; margin-right: 0.3rem; padding: 0 0.45rem; }
`.trim();

/**
 * Render the whole model as one static HTML document. Deterministic apart
 * from the generated-at stamp, so the same snapshot renders byte-identical
 * output at options level.
 */
export function renderHtml(model: SnapshotModel, opts: HtmlOptions = {}): string {
  const title = opts.title ?? "board snapshot viewer";
  const generatedAt = opts.generatedAt ?? model.generatedAt;
  const e = escapeHtml;
  const parts: string[] = [];

  parts.push('<!doctype html>');
  parts.push('<html lang="en">');
  parts.push("<head>");
  parts.push('<meta charset="utf-8">');
  parts.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
  // Default-deny: even if an escape were ever missed, the document may not
  // load scripts, styles, frames, or connections from anywhere but this
  // file's own inline style.
  parts.push(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">`);
  parts.push(`<title>${e(title)}</title>`);
  parts.push(`<style>${STYLE}</style>`);
  parts.push("</head>");
  parts.push("<body>");
  parts.push(`<h1>${e(title)}</h1>`);
  parts.push(
    `<p class="meta">boards ${e(String(model.boards.length))} · threads ${e(String(model.threads.length))}`
    + ` · posts ${e(String(model.postCount))}`
    + ` · corrupt lines skipped ${e(String(model.corruptLines + model.foreignBoardLines))}`
    + ` · days ${e(model.days.join(", ")) || "none"}`
    + ` · generated ${e(generatedAt)}</p>`,
  );
  if (model.threads.length === 0) parts.push("<p>No snapshot posts found.</p>");
  for (const thread of model.threads) {
    parts.push('<article class="thread">');
    parts.push(`<h2>${e(thread.title ?? `(untitled thread ${thread.rootId})`)}</h2>`);
    parts.push(
      `<p class="meta">board ${e(thread.board)} · root ${e(thread.rootId)} · last activity ${e(thread.lastActivity)}`
      + ` · ${e(String(thread.replyCount))} ${thread.replyCount === 1 ? "reply" : "replies"}</p>`,
    );
    for (const post of thread.posts) {
      parts.push('<section class="post">');
      parts.push(
        `<p class="post-meta">${e(post.author)} · ${e(post.ts)} · ${e(post.id)}`
        + `${post.act === undefined ? "" : ` · ${e(post.act)}`}</p>`,
      );
      if (post.title !== undefined) parts.push(`<p class="post-body"><strong>${e(post.title)}</strong></p>`);
      parts.push(`<p class="post-body">${e(post.body)}</p>`);
      const labels = [
        ...(post.tags ?? []).map((t) => `tag:${t}`),
        ...(post.to ?? []).map((t) => `to:${t}`),
        ...(post.mentions ?? []).map((t) => `@${t}`),
      ];
      if (labels.length > 0) {
        parts.push(`<p>${labels.map((label) => `<span class="tag">${e(label)}</span>`).join("")}</p>`);
      }
      parts.push("</section>");
    }
    parts.push("</article>");
  }
  parts.push("</body>");
  parts.push("</html>");
  return parts.join("\n") + "\n";
}

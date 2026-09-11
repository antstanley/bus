// The four viewer commands: threads, inbox, who, search. Each command
// queries an existing public API (BoardIndex for threads/inbox/read-state/
// search, @board/presence for who) and hands the result to a renderer.
// Read-only by design: a viewer never ingests, marks read, or writes —
// read markers stay reader-local state owned by other tools.

import type { Store } from "@board/core";
import { BoardIndex, type InboxQueryOptions, type QueryOptions, type ThreadQueryOptions } from "@board/index";
import { whoPage } from "@board/presence";
import {
  renderInbox,
  renderReadState,
  renderSearch,
  renderThread,
  renderThreadList,
  renderWho,
  type ReadStateEntry,
} from "./render.ts";

/** Deepest unread inbox the read-state view scans before reporting not-unread. */
export const READ_STATE_SCAN_LIMIT = 10_000;

export interface ThreadsCommandOptions extends ThreadQueryOptions {
  /** Print this thread in full instead of listing threads. */
  rootId?: string;
}

/** `threads`: list summaries, or one thread with every post when rootId is given. */
export function threadsCommand(index: BoardIndex, opts: ThreadsCommandOptions = {}): string {
  const { rootId, ...query } = opts;
  if (rootId !== undefined) {
    const view = index.thread(rootId);
    return view === null ? `no such thread: ${rootId}\n` : renderThread(view);
  }
  return renderThreadList(index.threads(query));
}

export interface InboxCommandOptions extends InboxQueryOptions {
  /** Check these post ids instead of listing: per-post read state. */
  readStateFor?: readonly string[];
}

/**
 * `inbox`: list the recipient's unread items, or — with readStateFor —
 * report each named post as unread/not-unread for that recipient. The
 * command only reads; marking read stays with `index.markRead` callers.
 */
export function inboxCommand(index: BoardIndex, agent: string, opts: InboxCommandOptions = {}): string {
  const { readStateFor, ...query } = opts;
  if (readStateFor !== undefined) return readStateCommand(index, agent, readStateFor);
  return renderInbox(agent, index.inbox(agent, query));
}

/**
 * `inbox <ids>` read-state view. "unread" = currently listed in the inbox
 * within the most recent READ_STATE_SCAN_LIMIT unread items; "not-unread" =
 * marked read, or never addressed to the agent (the index exposes no marker
 * enumeration, so the two are indistinguishable; documented limit).
 */
export function readStateCommand(index: BoardIndex, agent: string, postIds: readonly string[]): string {
  const titles = new Map(index.inbox(agent, { limit: READ_STATE_SCAN_LIMIT }).map((p) => [p.id, p]));
  const entries: ReadStateEntry[] = postIds.map((postId) => {
    const post = titles.get(postId);
    return { postId, state: post === undefined ? "not-unread" : "unread", title: post?.title ?? null };
  });
  return renderReadState(agent, entries);
}

export interface WhoCommandOptions {
  /** Heartbeats older than this are offline (presence semantics). */
  maxAgeMs: number;
  limit?: number;
  now?: (() => number) | undefined;
}

/** `who`: recent presence, online state derived by @board/presence. */
export async function whoCommand(store: Store, opts: WhoCommandOptions): Promise<string> {
  const page = await whoPage(store, {
    maxAgeMs: opts.maxAgeMs,
    ...(opts.limit === undefined ? {} : { limit: opts.limit }),
    ...(opts.now === undefined ? {} : { now: opts.now }),
  });
  return renderWho(page, opts.maxAgeMs);
}

/** `search`: full-text query over the index; hits carry FTS snippets. */
export function searchCommand(index: BoardIndex, query: string, opts: QueryOptions = {}): string {
  return renderSearch(query, index.search(query, opts));
}

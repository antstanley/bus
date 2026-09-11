// Shared fixture builders: in-memory boards seeded with posts and replies,
// folded into an in-memory BoardIndex. No disk, no store directory, no clock
// dependence.

import { Board, MemoryStore, type Post } from "@board/core";
import { BoardIndex } from "@board/index";

export type NewPostInput = Parameters<Board["post"]>[0];
export type ReplyInput = Parameters<Board["reply"]>[1];

export type SeedPost = NewPostInput | { reply: number; input: ReplyInput };

export interface BoardSeed {
  board: string;
  author?: string;
  posts: SeedPost[];
}

export interface Fixture {
  index: BoardIndex;
  /** Every seeded post in insertion order (ids ascend with the fake clock). */
  posts: Post[];
  close(): void;
}

function isReply(seed: SeedPost): seed is { reply: number; input: ReplyInput } {
  return typeof seed === "object" && "reply" in seed;
}

/**
 * Seed one or more boards (posts stamped 1 ms apart in seed order, starting
 * at a fixed epoch; `{ reply: n, input }` replies to the nth seeded post)
 * and ingest everything into one in-memory index, exactly the way the CLI
 * sync path feeds the index.
 */
export async function fixtureIndex(seeds: BoardSeed[], startMs = Date.UTC(2026, 8, 10, 12)): Promise<Fixture> {
  const store = new MemoryStore();
  const posts: Post[] = [];
  const stored: Post[] = [];
  let time = startMs;
  for (const seed of seeds) {
    const board = new Board(store, {
      board: seed.board,
      author: seed.author ?? "codex",
      now: () => time,
    });
    for (const item of seed.posts) {
      posts.push(isReply(item) ? await board.reply(posts[item.reply]!.id, item.input) : await board.post(item));
      time += 1;
    }
    stored.push(...(await board.since()).posts);
  }
  const index = new BoardIndex(":memory:");
  for (const post of stored) index.ingest(post);
  return { index, posts, close: () => index.close() };
}

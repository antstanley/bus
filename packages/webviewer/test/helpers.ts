// Fixture builder: a store snapshot export directory in a temp dir, plus a
// few posts kept around for assertions. Layout mirrors the compaction
// writer: boards/<board>/snapshots/<day>.jsonl, one encodePost line each.

import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Board, MemoryStore, encodePost, type Post } from "@board/core";

export type NewPostInput = Parameters<Board["post"]>[0];
export type ReplyInput = Parameters<Board["reply"]>[1];
export type SeedPost = NewPostInput | { reply: number; input: ReplyInput };

export interface SnapshotFixture {
  dir: string;
  /** Every seeded post in insertion order (ids ascend with the fake clock). */
  posts: Post[];
  close(): Promise<void>;
}

function isReply(seed: SeedPost): seed is { reply: number; input: ReplyInput } {
  return typeof seed === "object" && "reply" in seed;
}

/** Post contents that must never survive rendering as markup or script. */
export const HOSTILE_BODY = `<script>alert("xss")</script>\n<img src=x onerror="alert(1)">`;
export const HOSTILE_TITLE = `"><svg onload="alert(2)">&'`;

/** Malicious post fields, overridable field by field. */
export function hostilePost(overrides: Partial<NewPostInput> = {}): NewPostInput {
  const post: NewPostInput = { title: HOSTILE_TITLE, body: HOSTILE_BODY, tags: ["<b>bold</b>"] };
  return { ...post, ...overrides };
}

/**
 * Write an export snapshot dir for the given boards' posts (stamped 1 ms
 * apart from a fixed epoch) plus one planted corrupt line. Days are
 * derived from the post timestamps, split at `splitAfter` posts so some
 * fixtures span two day snapshots.
 */
export async function snapshotFixture(
  seeds: Array<{ board: string; posts: SeedPost[] }>,
  opts: { corruptLine?: string; splitAfter?: number } = {},
): Promise<SnapshotFixture> {
  const dir = await mkdtemp(join(tmpdir(), "board-webviewer-test-"));
  const store = new MemoryStore();
  const posts: Post[] = [];
  let time = Date.UTC(2026, 8, 9, 23);
  for (const seed of seeds) {
    const board = new Board(store, { board: seed.board, author: "codex", now: () => time });
    for (const item of seed.posts) {
      posts.push(isReply(item) ? await board.reply(posts[item.reply]!.id, item.input) : await board.post(item));
      time += 1;
    }
  }

  const splitAfter = opts.splitAfter ?? posts.length;
  const day1 = "2026-09-09";
  const day2 = "2026-09-10";
  let first = true;
  for (const seed of seeds) {
    // Each board's snapshot file holds only that board's own lines: a line
    // for another board would be (correctly) rejected as foreign.
    const own = posts.filter((p) => p.board === seed.board).map((p) => encodePost(p).trimEnd());
    const part1 = own.slice(0, splitAfter);
    const part2 = own.slice(splitAfter);
    if (first && opts.corruptLine !== undefined) part1.push(opts.corruptLine);
    first = false;
    await mkdir(join(dir, "boards", seed.board, "snapshots"), { recursive: true });
    await writeFile(
      join(dir, "boards", seed.board, "snapshots", `${day1}.jsonl`),
      part1.join("\n") + (part1.length ? "\n" : ""),
    );
    if (part2.length) {
      await writeFile(join(dir, "boards", seed.board, "snapshots", `${day2}.jsonl`), part2.join("\n") + "\n");
    }
  }
  // A live post object that must be ignored: this viewer reads snapshots only.
  await mkdir(join(dir, "boards", seeds[0]!.board, "posts", day2), { recursive: true });
  await writeFile(join(dir, "boards", seeds[0]!.board, "posts", day2, "01FAKEPOST0000000000000000.json"), "{}");
  return { dir, posts, close: () => rm(dir, { recursive: true, force: true }) };
}

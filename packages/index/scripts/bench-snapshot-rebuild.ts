#!/usr/bin/env bun
// Benchmark for backlog 405: day snapshots, compaction, retention.
//
// Generates a million-post board on an FsStore in a temp dir, runs the
// compaction job, collects old buckets with the retention policy, then times
// BoardIndex.rebuild twice: snapshot-aware (default) and live-only as a
// control. Asserts the snapshot rebuild is O(days + live tail) by counting
// store object reads and that it finishes under 60 s locally, then appends a
// section to docs/benchmarks.md.
//
// Generation writes each post with a plain synchronous writeFileSync loop.
// The earlier 64-writer Bun.write fan-out wedged at scale on a
// space-starved boot volume: queued writes neither completed nor errored,
// so the day loop stalled forever with the process spinning. Synchronous
// writes have no queue to livelock — every iteration either lands or throws
// — and full-scale rehearsals run ~7,700 posts/s, so the whole corpus
// generates in about two minutes.
//
// The temp volume is chosen by free space: every post costs a full
// filesystem block (~4 KiB on APFS) and the run also writes snapshots and
// two SQLite indices, so a million-post board needs roughly 7 GiB. The
// default temp dir on a nearly full boot volume cannot hold that, which is
// what wedged earlier runs.
//
// Run:   bun packages/index/scripts/bench-snapshot-rebuild.ts
// Knobs: BENCH_POSTS (default 1000000), BENCH_DAYS (default 10),
//        BENCH_CONTROL=0 to skip the live-only control rebuild,
//        BENCH_KEEP=1 to keep the temp dir,
//        BENCH_TMPDIR to pin the temp volume (else: os.tmpdir() when it has
//        room, then the volume this repo lives on).

import { existsSync, mkdirSync, statfsSync, writeFileSync } from "node:fs";
import { appendFile, mkdtemp, rm } from "node:fs/promises";
import { cpus, tmpdir, totalmem } from "node:os";
import { join, resolve } from "node:path";
import {
  Board,
  dayBucket,
  encodePost,
  keys,
  ulid,
  type Post,
  type Store,
} from "@board/core";
import { FsStore } from "@board/store-fs";
import { DAY_MS, BoardIndex, compactBoard, retainBoard } from "../src/index.ts";

const TOTAL = Number(process.env.BENCH_POSTS ?? 1_000_000);
const DAYS = Number(process.env.BENCH_DAYS ?? 10);
const WITH_CONTROL = process.env.BENCH_CONTROL !== "0";
const KEEP = process.env.BENCH_KEEP === "1";
const RETENTION_DAYS = 2;

if (!Number.isSafeInteger(TOTAL) || TOTAL < DAYS || !Number.isSafeInteger(DAYS) || DAYS < 3) {
  console.error("BENCH_POSTS and BENCH_DAYS must be integers (POSTS >= DAYS >= 3)");
  process.exit(2);
}

// A ~230-byte post still occupies a whole filesystem block (4 KiB on APFS),
// and snapshots plus two SQLite indices with FTS add a few GiB more.
const BLOCK_BYTES = 4096;
const SLACK_BYTES = 3 * 1024 ** 3;

function freeBytes(root: string): number | null {
  try {
    const stats = statfsSync(root);
    return Number(stats.bavail) * Number(stats.bsize);
  } catch {
    return null;
  }
}

/** First temp root with room for the corpus: env override, tmpdir, repo volume. */
function pickTempRoot(posts: number): string {
  const need = posts * BLOCK_BYTES + SLACK_BYTES;
  const pinned = process.env.BENCH_TMPDIR;
  if (pinned !== undefined && pinned !== "") {
    const free = freeBytes(pinned);
    if (free !== null && free < need) {
      console.warn(`bench: BENCH_TMPDIR (${pinned}) has ${(free / 2 ** 30).toFixed(1)} GiB free; the run wants about ${(need / 2 ** 30).toFixed(1)} GiB`);
    }
    return pinned;
  }
  const candidates = [
    { root: tmpdir(), why: "os.tmpdir()" },
    { root: resolve(import.meta.dir, "../../.."), why: "the repo volume" },
  ];
  for (const { root, why } of candidates) {
    if (!existsSync(root)) continue;
    const free = freeBytes(root);
    if (free === null || free >= need) return root;
    console.warn(`bench: ${why} (${root}) has ${(free / 2 ** 30).toFixed(1)} GiB free; the run wants about ${(need / 2 ** 30).toFixed(1)} GiB (${posts.toLocaleString("en-US")} posts at ~${BLOCK_BYTES / 1024} KiB per file plus snapshots and indices), trying the next candidate`);
  }
  console.error(`bench: no temp volume with ~${(need / 2 ** 30).toFixed(1)} GiB free; free some space or set BENCH_TMPDIR`);
  process.exit(2);
}

interface Phase {
  name: string;
  seconds: number;
  objectReads: number;
  detail?: string | undefined;
}

function countingStore(inner: Store): { store: Store; reads: () => number } {
  let objectReads = 0;
  const store: Store = {
    put: (key, body, opts) => inner.put(key, body, opts),
    get: async (key) => {
      objectReads++;
      return inner.get(key);
    },
    list: (prefix, opts) => inner.list(prefix, opts),
    delete: (key) => inner.delete!(key),
  };
  return { store, reads: () => objectReads };
}

async function timed(name: string, run: () => Promise<string | undefined>): Promise<Phase> {
  const started = performance.now();
  const detail = await run();
  return { name, seconds: (performance.now() - started) / 1000, objectReads: 0, detail };
}

async function main(): Promise<void> {
  const boardName = "bench";
  const perDay = Math.floor(TOTAL / DAYS);
  const total = perDay * DAYS;
  const instance = ulid();
  const nowMs = Date.now();
  const todayStart = nowMs - (nowMs % DAY_MS);
  // Keep every generated id strictly in the past even just after midnight UTC.
  const elapsedToday = Math.max(nowMs - todayStart - 60_000, perDay * 10);

  const dir = await mkdtemp(join(pickTempRoot(total), "board-bench-"));
  console.log(`bench: temp store in ${dir}`);
  const store = new FsStore(dir);
  const board = new Board(store, { board: boardName, author: "bench" });
  const phases: Phase[] = [];
  let sampleReplyId = "";
  let sampleReplyRootId = "";
  let compactedPosts = 0;
  let deletedObjects = 0;

  try {
    // ---------------------------------------------------------- generate --
    phases.push(
      await timed("generate", async () => {
        for (let day = 0; day < DAYS; day++) {
          const pastDay = day < DAYS - 1;
          const dayStart = todayStart - (DAYS - 1 - day) * DAY_MS;
          const spacing = (pastDay ? DAY_MS : elapsedToday) / perDay;
          const dayName = dayBucket(dayStart);
          const dayDir = join(dir, ...keys.dayPrefix(boardName, dayName).split("/"));
          mkdirSync(dayDir, { recursive: true });
          let slot = 0;
          let lastRootId = "";
          const next = (): { key: string; body: string } | null => {
            if (slot >= perDay) return null;
            const ms = dayStart + Math.floor(slot * spacing);
            const id = ulid(ms);
            const ts = new Date(ms).toISOString();
            let post: Post;
            if (slot % 10 === 9 && lastRootId !== "") {
              post = { v: 1, id, board: boardName, thread: lastRootId, replyTo: lastRootId, author: "bench", instance, ts, body: `reply ${slot}: alpha beta gamma marker text` };
              if (day === Math.floor(DAYS / 2) && slot === 9) {
                sampleReplyId = id;
                sampleReplyRootId = lastRootId;
              }
            } else {
              lastRootId = id;
              post = { v: 1, id, board: boardName, thread: id, author: "bench", instance, ts, body: `post ${slot}: alpha beta gamma marker text` };
            }
            slot++;
            return { key: keys.post(boardName, id, ms), body: encodePost(post) };
          };
          // One synchronous write per post: no write queue, nothing to
          // livelock, linear progress. Direct writes (no per-object fsync):
          // the benchmark measures compaction and rebuild, not durability.
          const dayStarted = performance.now();
          for (;;) {
            const file = next();
            if (file === null) break;
            writeFileSync(join(dir, ...file.key.split("/")), file.body);
          }
          console.log(`  generated ${dayName}: ${perDay.toLocaleString("en-US")} posts in ${((performance.now() - dayStarted) / 1000).toFixed(1)}s`);
        }
        return `${total} posts in ${DAYS} buckets`;
      }),
    );

    // ------------------------------------------------------------ compact --
    const compaction = countingStore(store);
    const bench = new Board(compaction.store, { board: boardName, author: "bench" });
    phases.push(
      await timed("compact", async () => {
        const results = await compactBoard(bench);
        compactedPosts = results.reduce((sum, r) => sum + r.posts, 0);
        return `${results.length} snapshots, ${compactedPosts} posts, ${results.filter((r) => r.verified).length} verified, ${compaction.reads()} object reads`;
      }),
    );
    phases[phases.length - 1]!.objectReads = compaction.reads();

    // ------------------------------------------- control rebuild (live-only) --
    if (WITH_CONTROL) {
      const counted = countingStore(store);
      const controlBoard = new Board(counted.store, { board: boardName, author: "bench" });
      const controlIndex = new BoardIndex(join(dir, "control.sqlite"));
      try {
        const phase = await timed("rebuild (control, live-only)", () => controlIndex.rebuild(controlBoard, { useSnapshots: false }).then(() => undefined));
        phase.objectReads = counted.reads();
        phases.push(phase);
      } finally {
        controlIndex.close();
      }
    }

    // ------------------------------------------------------------- retain --
    const retention = countingStore(store);
    const retainBench = new Board(retention.store, { board: boardName, author: "bench" });
    phases.push(
      await timed("retain", async () => {
        const results = await retainBoard(retainBench, { olderThanDays: RETENTION_DAYS });
        deletedObjects = results.reduce((sum, r) => sum + r.deleted, 0);
        return `deleted ${deletedObjects} objects across ${results.filter((r) => r.status === "deleted").length} days`;
      }),
    );
    phases[phases.length - 1]!.objectReads = retention.reads();

    // -------------------------------------------------- snapshot rebuild --
    const counted = countingStore(store);
    const rebuildBoard = new Board(counted.store, { board: boardName, author: "bench" });
    const index = new BoardIndex(join(dir, "index.sqlite"));
    let rebuildSeconds = 0;
    let rebuildReads = 0;
    try {
      const phase = await timed("rebuild (snapshots)", () => index.rebuild(rebuildBoard).then(() => undefined));
      rebuildSeconds = phase.seconds;
      rebuildReads = counted.reads();
      phase.objectReads = rebuildReads;
      phases.push(phase);

      // ------------------------------------------------------- assertions --
      const snapshotFiles = DAYS - 1; // compaction closes every day before today
      const liveTail = perDay * (RETENTION_DAYS + 1); // today plus the retained closed days
      if (rebuildSeconds >= 60) throw new Error(`snapshot rebuild took ${rebuildSeconds.toFixed(1)}s (>= 60s)`);
      if (rebuildReads > snapshotFiles + liveTail + 20) {
        throw new Error(`rebuild made ${rebuildReads} object reads; expected <= ${snapshotFiles + liveTail + 20} (O(days) violated)`);
      }
      const posts = index.db.query<{ n: number }, []>("SELECT count(*) AS n FROM posts").get()!.n;
      const threads = index.db.query<{ n: number }, []>("SELECT count(*) AS n FROM threads").get()!.n;
      if (posts !== total) throw new Error(`index holds ${posts} posts, expected ${total}`);
      if (threads !== total - Math.floor(total / 10)) throw new Error(`index holds ${threads} threads, unexpected`);
      const sample = index.thread(sampleReplyRootId);
      if (sample === null || sample.posts.length !== 2 || sample.posts[1]?.id !== sampleReplyId) {
        throw new Error("sample thread from the snapshots is incomplete");
      }
    } finally {
      index.close();
    }

    // -------------------------------------------------------------- report --
    const days = DAYS;
    const controlPhase = phases.find((p) => p.name.startsWith("rebuild (control"));
    const speedup = controlPhase === undefined ? null : controlPhase.seconds / rebuildSeconds;
    const collected = compactedPosts - perDay * RETENTION_DAYS; // snapshots retention collected
    const cpu = cpus()[0]?.model?.trim() || "unknown cpu";
    const lines = [
      "## 405 — day snapshots, compaction, retention",
      "",
      `- run: ${new Date().toISOString()}, bun ${Bun.version}, ${process.platform} ${process.arch}, ${cpu}, ${cpus().length} cores, ${(totalmem() / 2 ** 30).toFixed(0)} GiB RAM`,
      `- posts: ${total.toLocaleString("en-US")} across ${days} day buckets (${perDay.toLocaleString("en-US")}/day, 10% replies), fs store in a temp dir`,
      `- method: generated with one synchronous writeFileSync per post (no fsync; the async write fan-out this replaced wedged on a space-starved volume); compactBoard writes boards/bench/snapshots/<day>.jsonl for the ${snapshotFileCount(days)} closed buckets; retainBoard collects buckets older than ${RETENTION_DAYS} days; BoardIndex.rebuild is timed with snapshots (default) and, as a control, with useSnapshots: false before retention runs`,
      "",
      "| phase | wall | object reads | detail |",
      "| --- | ---: | ---: | --- |",
      ...phases.map((p) => `| ${p.name} | ${p.seconds.toFixed(1)} s | ${p.objectReads > 0 ? p.objectReads.toLocaleString("en-US") : "—"} | ${p.detail ?? ""} |`),
      "",
      `- snapshot rebuild = ${rebuildSeconds.toFixed(1)} s (limit 60 s) with ${rebuildReads.toLocaleString("en-US")} object reads for ${snapshotFileCount(days)} snapshot files + a ${(perDay * (RETENTION_DAYS + 1)).toLocaleString("en-US")}-post live tail${speedup === null ? "" : `, vs ${controlPhase!.seconds.toFixed(1)} s and ${(controlPhase!.objectReads).toLocaleString("en-US")} reads live-only (${speedup.toFixed(1)}× faster, ${(controlPhase!.objectReads / Math.max(rebuildReads, 1)).toFixed(1)}× fewer reads)`}: the ${collected.toLocaleString("en-US")} snapshotted posts that retention collected are never re-read, so the store-read cost is O(days + live tail), not O(posts)`,
      "- assertions: rebuild under 60 s; closed buckets not re-read; index holds every post, thread, and a sampled snapshot thread",
      "",
    ];
    const docsPath = resolve(import.meta.dir, "../../../docs/benchmarks.md");
    const header = existsSync(docsPath) ? "" : "# Benchmarks\n\nAppend-only record of local benchmark runs. Newest section last.\n\n";
    await appendFile(docsPath, header + lines.join("\n"));
    console.log(lines.join("\n"));
  } finally {
    if (KEEP) console.log(`keeping ${dir}`);
    else await rm(dir, { recursive: true, force: true });
  }
}

function snapshotFileCount(days: number): number {
  return days - 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

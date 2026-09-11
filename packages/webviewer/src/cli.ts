#!/usr/bin/env bun
// Standalone CLI for the static snapshot viewer (backlog 504).
//
//   board-webviewer --store <export-dir> [--out <file>] [--board <name>] [--title <text>]
//
// The `board ui` wiring into packages/cli/src/index.ts is a HELD seam
// (task202 owns that file); this package-local entry exists so the viewer
// runs standalone today. When the seam opens, `board ui --web` should call
// runWebviewerCli with the resolved store directory.
//
// Read-only: the only store operations used are get/list. No network, no
// live board, no credentials; the output file is the single write.

import { writeFile } from "node:fs/promises";
import { assertName, type Store } from "@board/core";
import { FsStore } from "@board/store-fs";
import { loadSnapshotModel } from "./snapshot.ts";
import { renderHtml } from "./render.ts";

const USAGE = `board-webviewer — render a store snapshot export as one static HTML file

usage:
  bun packages/webviewer/src/cli.ts --store <export-dir> [--out <file>] [--board <name>] [--title <text>]

options:
  --store <dir>   store export directory to read (fs layout; required)
  --out <file>    output HTML file (default: board.html)
  --board <name>  only render this board's snapshots
  --title <text>  page title (default: board snapshot viewer)

The rendered file is self-contained and inert: no scripts, no event
handlers, no external assets; all board content is HTML-escaped text.
`;

/** Invalid command-line use; the caller prints usage and exits non-zero. */
export class WebviewerUsageError extends Error {
  override name = "WebviewerUsageError";
}

export interface WebviewerCliDependencies {
  /** Store factory for the --store directory (default: FsStore). */
  createStore?: (dir: string) => Store;
  /** Output file writer (default: node:fs/promises writeFile). */
  writeOut?: (path: string, contents: string) => Promise<void>;
  /** Progress line sink (default: console.log). */
  log?: (line: string) => void;
  /** Injectable clock for deterministic output. */
  now?: () => number;
}

export interface WebviewerCliResult {
  outPath: string;
  boards: string[];
  threads: number;
  posts: number;
  skippedLines: number;
}

/** Run one viewer invocation. Throws WebviewerUsageError on bad arguments. */
export async function runWebviewerCli(argv: string[], deps: WebviewerCliDependencies = {}): Promise<WebviewerCliResult> {
  let storeDir: string | undefined;
  let outPath = "board.html";
  let board: string | undefined;
  let title = "board snapshot viewer";

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const value = argv[i + 1];
    switch (arg) {
      case "--store":
      case "--out":
      case "--board":
      case "--title": {
        if (value === undefined) throw new WebviewerUsageError(`${arg} requires a value`);
        if (arg === "--store") storeDir = value;
        else if (arg === "--out") outPath = value;
        else if (arg === "--board") {
          // Board names are store key segments; validate before any read.
          try {
            board = assertName(value, "board");
          } catch (cause) {
            throw new WebviewerUsageError(cause instanceof Error ? cause.message : String(cause));
          }
        } else title = value;
        i++;
        break;
      }
      case "--help":
      case "-h":
        throw new WebviewerUsageError(USAGE.trimEnd());
      default:
        throw new WebviewerUsageError(`unknown argument: ${arg}`);
    }
  }
  if (storeDir === undefined) throw new WebviewerUsageError("missing required --store <export-dir>");

  const store = (deps.createStore ?? ((dir: string) => new FsStore(dir)))(storeDir);
  const model = await loadSnapshotModel(store, {
    ...(board === undefined ? {} : { board }),
    ...(deps.now === undefined ? {} : { now: deps.now }),
  });
  const html = renderHtml(model, { title });
  await (deps.writeOut ?? writeFile)(outPath, html);

  const skippedLines = model.corruptLines + model.foreignBoardLines;
  const log = deps.log ?? ((line: string) => console.log(line));
  log(
    `wrote ${outPath}: boards=${model.boards.length} threads=${model.threads.length} posts=${model.postCount}`
    + ` skipped=${skippedLines}`,
  );
  return { outPath, boards: model.boards, threads: model.threads.length, posts: model.postCount, skippedLines };
}

async function main(): Promise<void> {
  try {
    await runWebviewerCli(process.argv.slice(2));
  } catch (error) {
    if (error instanceof WebviewerUsageError) {
      console.error(`error: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

// Run when executed directly; harmless when imported for tests.
if (import.meta.main) await main();

#!/usr/bin/env bun

import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { BoardMcpServer, type BoardMcpOptions } from "./server.ts";
import { createStore, McpConfigError, parseMcpArgs, type McpConfig, type StoreSpec } from "./config.ts";

export async function startBoardMcp(config: McpConfig, overrides: Partial<Pick<BoardMcpOptions, "heartbeatMs" | "resourcePollMs">> = {}): Promise<BoardMcpServer> {
  const options: BoardMcpOptions = {
    store: await createStore(config.store),
    author: config.author,
    defaultBoard: config.board,
    indexPath: config.indexPath,
  };
  if (overrides.heartbeatMs !== undefined) options.heartbeatMs = overrides.heartbeatMs;
  if (overrides.resourcePollMs !== undefined) options.resourcePollMs = overrides.resourcePollMs;
  const app = new BoardMcpServer(options);
  await app.start();
  app.attachStdio(serveStdio(({ era }) => app.createProtocolServer(era), {
    legacy: "serve",
    onerror: (error) => { console.error(error.message); },
  }));
  return app;
}

async function main(): Promise<void> {
  const config = parseMcpArgs(process.argv.slice(2));
  const app = await startBoardMcp(config);
  let closing = false;
  const stop = () => {
    if (closing) return;
    closing = true;
    void app.close().finally(() => { process.exitCode = 0; });
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    // stdout is reserved exclusively for MCP JSON-RPC frames.
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = error instanceof McpConfigError ? 2 : 1;
  });
}

export { BoardMcpServer } from "./server.ts";
export { createStore, parseMcpArgs, parseStoreSpec, McpConfigError } from "./config.ts";
export type { BoardMcpOptions } from "./server.ts";
export type { McpConfig, StoreSpec } from "./config.ts";

#!/usr/bin/env bun

import { CliError, DegradedReplicationError, runCli, sanitizeSecrets, VALUE_FLAGS } from "./index.ts";
import { resolve } from "node:path";

declare const BOARD_COMPILED: boolean;

export interface GateArgs {
  command: string;
  help: boolean;
}

/** Tokenize argv the way runCli's parser does, exposing only what the
 * compiled-install gate needs: the command and whether a `-h`/`--help` sits
 * in a real flag position. A `-h` consumed as an option value (`--index -h`)
 * or following `--` is not help, so it cannot bypass the gate. */
export function classifyArgs(argv: string[]): GateArgs {
  if (argv.length === 0) return { command: "help", help: false };
  if (argv[0] === "--help" || argv[0] === "-h") return { command: "help", help: true };
  const [command = "help", ...rest] = argv;
  let options = true;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (options && arg === "--") {
      options = false;
      continue;
    }
    if (options && arg === "-h") return { command, help: true };
    if (!options || !arg.startsWith("--")) continue;
    const equals = arg.indexOf("=");
    const name = arg.slice(2, equals < 0 ? undefined : equals);
    if (name === "help" && equals < 0) return { command, help: true };
    if (equals < 0 && VALUE_FLAGS.has(name)) i++; // the next token is this flag's value
  }
  return { command, help: false };
}

/** Whether the compiled-install guard rejects this invocation: only a
 * genuine help request in flag position escapes the guard. */
export function compiledInstallBlocked(argv: string[], compiled: boolean): boolean {
  const parsed = classifyArgs(argv);
  return compiled && parsed.command === "install" && !parsed.help;
}

// Fail closed: an absent BOARD_COMPILED define (a future compile path that
// forgot --define) must keep `install` rejected, not silently enable it.
function isCompiledBinary(): boolean {
  try {
    return BOARD_COMPILED !== false;
  } catch {
    return true;
  }
}

// Runtime integration installation currently needs the checkout's hook/MCP
// files and a Bun interpreter. Neither exists alongside a single-file CLI.
// Fail before writing configuration that would point at nonexistent files.
async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (compiledInstallBlocked(argv, isCompiledBinary())) {
    throw new CliError("Runtime installation requires a source checkout and Bun: run bun packages/cli/src/index.ts install <runtime> from the checkout. Distributed board commands do not include hook/MCP installation assets.");
  }
  const controller = new AbortController();
  const stop = () => controller.abort();
  if (argv[0] === "watch") {
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  }
  try {
    await runCli(argv, {
      signal: controller.signal,
      projectRoot: resolve(import.meta.dir),
      ...(!process.stdin.isTTY ? { stdin: () => Bun.stdin.text() } : {}),
    });
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(sanitizeSecrets(error instanceof Error ? error.message : String(error)));
    process.exitCode = error instanceof CliError ? 2 : error instanceof DegradedReplicationError ? 3 : 1;
  });
}

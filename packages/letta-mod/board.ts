// board mod for Letta Code — task 107
//
// Registers board_post / board_read / board_who tools and injects unread
// board mentions at turn_start. Installed at ~/.letta/mods/board.ts.
//
// The mod is a thin driver over this checkout's board CLI and hook: it never
// links @board/* packages (mods load outside any workspace) and never sees
// store credentials beyond what the shared ~/.board/config.json already
// holds. Spawned children use argument arrays — no shell interpolation.

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const DEFAULT_REPO = "/Volumes/Delorean/code/sidekick/tmp";
const CONFIG_PATH = process.env.BOARD_CONFIG ?? join(homedir(), ".board", "config.json");
const SPAWN_TIMEOUT_MS = 10_000;

interface BoardConfig {
  repo?: string;
  store?: string;
  boards?: string[] | string;
  board?: string;
  as?: string;
  indexPath?: string;
  maxOutputBytes?: number | string;
}

function loadConfig(raw: string): BoardConfig {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as BoardConfig;
  } catch {}
  return {};
}

function configEnv(config: BoardConfig, extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  const store = process.env.BOARD_STORE ?? config.store;
  if (store) env.BOARD_STORE = store;
  const index = process.env.BOARD_INDEX ?? config.indexPath;
  if (index) env.BOARD_INDEX = index;
  const as = process.env.BOARD_AS ?? config.as;
  if (as) env.BOARD_AS = as;
  let boards: string | undefined;
  if (Array.isArray(config.boards)) boards = config.boards.join(",");
  else if (typeof config.boards === "string") boards = config.boards;
  else if (config.board) boards = config.board;
  boards = process.env.BOARD_BOARDS ?? boards;
  if (boards) env.BOARD_BOARDS = boards;
  const cap = process.env.BOARD_MAX_OUTPUT_BYTES
    ?? (config.maxOutputBytes === undefined ? undefined : String(config.maxOutputBytes));
  if (cap) env.BOARD_MAX_OUTPUT_BYTES = cap;
  return { ...env, ...extra };
}

export default function activate(letta: any) {
  const disposers: Array<() => void> = [];

  let repo = DEFAULT_REPO;
  let config: BoardConfig = {};
  // Config loads asynchronously; a turn_start or tool call that races ahead of
  // it would run with defaults, so await a shared promise everywhere.
  let configReady: Promise<void> = Promise.resolve();
  try {
    configReady = readFile(CONFIG_PATH, "utf8").then((raw) => {
      config = loadConfig(raw);
      if (typeof config.repo === "string" && config.repo.length > 0) repo = config.repo;
    }).catch(() => {}); // missing/malformed config falls back to defaults
  } catch {}

  const cliPath = () => join(repo, "packages", "cli", "src", "index.ts");
  const hookPath = () => join(repo, "packages", "hooks", "src", "board-hook.ts");

  /** Spawn one board entrypoint. Returns stdout; throws on non-zero exit. */
  function runBoard(
    script: () => string,
    args: string[],
    env: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<string> {
    return configReady.then(() => new Promise((resolve, reject) => {
      const child = execFile(
        process.execPath,
        [script(), ...args],
        { env: { ...process.env, ...env }, timeout: SPAWN_TIMEOUT_MS, signal, maxBuffer: 4 * 1024 * 1024 },
        (error, stdout) => {
          if (error) {
            // Deliberately generic: Node's error message embeds the full argv
            // (store spec and post body included), which must not reach tool
            // output. Exit-code shape only.
            const code = typeof (error as { code?: unknown }).code === "number" || typeof (error as { code?: string }).code === "string"
              ? ` (${(error as { code?: unknown }).code})`
              : "";
            reject(new Error(`board command failed${code}`));
          } else {
            resolve(stdout);
          }
        },
      );
      // The hook reads stdin (Bun.stdin.text()); execFile leaves the stdin
      // pipe open forever, so close it immediately or every spawn times out.
      child.stdin?.end();
    }));
  }

  if (letta.capabilities.tools) {
    disposers.push(letta.tools.register({
      name: "board_post",
      description: "Post a message to the team's shared board. Use to send coordination messages to other agents; mentions wake or notify the named agents.",
      parameters: {
        type: "object",
        properties: {
          body: { type: "string", description: "Message body (markdown text)." },
          title: { type: "string", description: "Optional short title." },
          mentions: {
            type: "array",
            items: { type: "string" },
            maxItems: 32,
            description: "Agent names to mention (e.g. [\"claude\", \"codex\"]).",
          },
        },
        required: ["body"],
        additionalProperties: false,
      },
      requiresApproval: false,
      parallelSafe: false,
      async run(ctx) {
        await configReady; // config file may still be loading at first call
        const body = String(ctx.args.body ?? "");
        if (!body.trim()) return { status: "error", content: "body is required" };
        const store = process.env.BOARD_STORE ?? config.store;
        if (!store) return { status: "error", content: "no board store configured; set store in ~/.board/config.json" };
        const args = ["--store", store];
        args.push("--as", process.env.BOARD_AS ?? config.as ?? "letta");
        const boards = process.env.BOARD_BOARDS
          ?? (Array.isArray(config.boards) ? config.boards.join(",") : config.boards ?? config.board);
        if (boards) args.push("--board", boards.split(",")[0]?.trim() || "general");
        if (ctx.args.title !== undefined) args.push("--title", String(ctx.args.title));
        const mentions = ctx.args.mentions;
        if (Array.isArray(mentions) && mentions.length > 0) {
          args.push("--mentions", mentions.map((m) => String(m)).join(","));
        }
        args.push("--", ...body.split("\n")); // "--" ends option parsing; positional body words, argv array, no shell
        const stdout = await runBoard(cliPath, ["post", ...args], configEnv(config), ctx.signal);
        return stdout.trim() || "posted";
      },
    }));

    disposers.push(letta.tools.register({
      name: "board_read",
      description: "Read recent posts from the shared board. Returns JSON with posts, cursor, and truncated. Pass the previous cursor back as `after` to page.",
      parameters: {
        type: "object",
        properties: {
          after: { type: "string", description: "Cursor from a previous read for paging." },
          limit: { type: "integer", minimum: 1, maximum: 100, description: "Page size (default 100)." },
        },
        additionalProperties: false,
      },
      requiresApproval: false,
      parallelSafe: true,
      async run(ctx) {
        await configReady; // config file may still be loading at first call
        const store = process.env.BOARD_STORE ?? config.store;
        if (!store) return { status: "error", content: "no board store configured; set store in ~/.board/config.json" };
        const args = ["read", "--store", store];
        const boards = process.env.BOARD_BOARDS
          ?? (Array.isArray(config.boards) ? config.boards.join(",") : config.boards ?? config.board);
        if (boards) args.push("--board", boards.split(",")[0]?.trim() || "general");
        if (ctx.args.after !== undefined) args.push("--after", String(ctx.args.after));
        if (ctx.args.limit !== undefined) args.push("--limit", String(Math.max(1, Math.min(100, Number(ctx.args.limit) || 100))));
        const stdout = await runBoard(cliPath, args, configEnv(config), ctx.signal);
        return stdout.trim() || "no posts";
      },
    }));

    disposers.push(letta.tools.register({
      name: "board_who",
      description: "List which agents are currently online on the shared board (recent presence with runtime and session info).",
      parameters: {
        type: "object",
        properties: {
          maxAgeMs: { type: "integer", minimum: 0, maximum: 3_600_000, description: "Freshness window in ms (default 120000)." },
        },
        additionalProperties: false,
      },
      requiresApproval: false,
      parallelSafe: true,
      async run(ctx) {
        await configReady; // config file may still be loading at first call
        const store = process.env.BOARD_STORE ?? config.store;
        if (!store) return { status: "error", content: "no board store configured; set store in ~/.board/config.json" };
        const args = ["who", "--store", store];
        if (ctx.args.maxAgeMs !== undefined) {
          args.push("--max-age", String(Math.max(0, Math.min(3_600_000, Number(ctx.args.maxAgeMs) || 120_000))));
        }
        const stdout = await runBoard(cliPath, args, configEnv(config), ctx.signal);
        return stdout.trim() || "nobody";
      },
    }));
  }

  // turn_start injection + presence heartbeats need the events capability.
  if (letta.capabilities.events.turns || letta.capabilities.events.lifecycle) {
    const spawnHook = (args: string[], signal?: AbortSignal) =>
      runBoard(hookPath, args, configEnv(config, { BOARD_AS: process.env.BOARD_AS ?? config.as ?? "letta" }), signal)
        .catch(() => ""); // hook failures must never block a turn (101 contract)

    if (letta.capabilities.events.lifecycle) {
      let open = false;
      disposers.push(letta.events.on("conversation_open", async (_event, ctx) => {
        if (open) return;
        open = true;
        // Working: a session just opened; the first turn will inject context.
        await spawnHook(["heartbeat", "--runtime", "letta", "--status", "working"], ctx.signal);
      }));
      disposers.push(letta.events.on("conversation_close", async (_event, ctx) => {
        if (!open) return;
        open = false;
        await spawnHook(["heartbeat", "--runtime", "letta", "--status", "idle"], ctx.signal);
      }));
    }

    if (letta.capabilities.events.turns) {
      disposers.push(letta.events.on("turn_start", async (event, ctx) => {
        const userMessage = Array.isArray(event.input) ? event.input.find((item: any) => item?.role === "user") : undefined;
        if (!userMessage) return; // approval-only continuation: never inject
        const output = await spawnHook(["inject", "--runtime", "letta"], ctx.signal);
        if (!output) return; // no unread mentions, or the hook degraded silently
        // Append the framed, size-capped block as an extra text part of the
        // user message. The hook output already carries the
        // UNTRUSTED CONTENT framing and the 4 KiB cap.
        const part = { type: "text", text: output };
        if (Array.isArray(userMessage.content)) userMessage.content.push(part);
        else userMessage.content = [userMessage.content, part];
        return { input: event.input };
      }));
    }
  }

  return () => {
    for (const dispose of disposers.reverse()) dispose();
  };
}

import { chmod, lstat, mkdir, readFile, realpath, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { assertName } from "@board/core";

export type InstallRuntime = "claude" | "codex" | "letta" | "gemini" | "cursor" | "opencode" | "pi";

export interface InstallOptions {
  runtime: InstallRuntime;
  home: string;
  projectRoot: string;
  cwd?: string;
  store?: string;
  author?: string;
  board?: string;
  indexPath?: string;
  dryRun?: boolean;
  uninstall?: boolean;
  projectLocal?: boolean;
}

export interface InstallChange {
  path: string;
  before: string;
  after: string;
}

export interface InstallResult {
  changes: InstallChange[];
  notices: string[];
}

type JsonObject = Record<string, unknown>;

export class CliError extends Error {
  override name = "CliError";
}

/** Merge or remove the board integration without disturbing unrelated config. */
export async function installRuntime(options: InstallOptions): Promise<InstallResult> {
  const runtime = options.runtime;
  const notices: string[] = [];
  if (runtime === "letta") {
    notices.push("Letta local install is deferred: use task 107 for the mod/server MCP path and task 111 for legacy hooks.");
    return { changes: [], notices };
  }
  if (!options.uninstall && !options.store) throw new CliError("install requires --store");

  const author = installName(options.author ?? runtime, "agent");
  const board = installName(options.board ?? "general", "board");
  const cwd = options.cwd ?? process.cwd();
  const store = options.uninstall ? "" : normalizeStoreSpec(options.store ?? "", cwd);
  const indexInput = options.indexPath ?? join(options.home, ".board", `${runtime}.sqlite`);
  const indexPath = isAbsolute(indexInput) ? indexInput : resolve(cwd, indexInput);
  const hookPath = resolve(options.projectRoot, "packages/hooks/src/board-hook.ts");
  const cliPath = resolve(options.projectRoot, "packages/cli/src/index.ts");
  const mcpPath = resolve(options.projectRoot, "packages/mcp/src/index.ts");
  const executable = process.execPath;
  const mcp = mcpDefinition(executable, mcpPath, store, author, board, indexPath, runtime === "cursor");
  const changes: InstallChange[] = [];
  const removals = new Set<string>();

  if (runtime === "codex") {
    const path = join(options.home, ".codex", "config.toml");
    const before = await readText(path);
    const after = mergeCodex(before, {
      uninstall: options.uninstall ?? false, executable, hookPath, mcpPath, mcp, store, author, board, indexPath,
    });
    if (after !== before) changes.push({ path, before, after });
  } else if (runtime === "pi") {
    const extensionPath = options.projectLocal
      ? join(cwd, ".pi", "extensions", "board.ts")
      : join(options.home, ".pi", "agent", "extensions", "board.ts");
    const before = await readText(extensionPath);
    if (!options.uninstall && before && !isOwnedPiExtension(before, hookPath)) {
      throw new CliError(`refusing to replace non-board Pi extension: ${extensionPath}`);
    }
    const after = options.uninstall
      ? isOwnedPiExtension(before, hookPath) ? "" : before
      : piExtension(executable, hookPath, cliPath, store, author, board, indexPath);
    if (after !== before) {
      changes.push({ path: extensionPath, before, after });
      if (options.uninstall) removals.add(extensionPath);
    }
  } else if (runtime === "opencode") {
    const configPath = join(cwd, "opencode.json");
    const openCodeMcp = openCodeMcpDefinition(executable, mcpPath, store, author, board, indexPath);
    await planJson(changes, configPath, (root) => {
      mergeOpenCodeMcp(root, openCodeMcp, options.uninstall ?? false, mcpPath);
    });
    const pluginPath = join(cwd, ".opencode", "plugins", "board.ts");
    const before = await readText(pluginPath);
    if (!options.uninstall && before && !isOwnedOpenCodePlugin(before, hookPath)) {
      throw new CliError(`refusing to replace non-board OpenCode plugin: ${pluginPath}`);
    }
    const after = options.uninstall
      ? isOwnedOpenCodePlugin(before, hookPath) ? "" : before
      : openCodePlugin(
        executable,
        hookPath,
        store,
        author,
        board,
        indexPath,
        join(options.home, ".board", "sessions", "opencode"),
      );
    if (after !== before) changes.push({ path: pluginPath, before, after });
  } else {
    if (runtime === "claude") {
      await planJson(changes, join(options.home, ".claude", "settings.json"), (root) => {
        mergeGroupedHooks(root, claudeHooks(executable, hookPath, store, author, board, indexPath), options.uninstall ?? false, hookPath);
      });
      await planJson(changes, join(options.home, ".claude.json"), (root) => {
        mergeMcp(root, mcp, options.uninstall ?? false, mcpPath);
      });
    } else if (runtime === "gemini") {
      await planJson(changes, join(options.home, ".gemini", "settings.json"), (root) => {
        mergeMcp(root, mcp, options.uninstall ?? false, mcpPath);
      });
      notices.push("Gemini hooks are deferred to task 503; its hooks require runtime-specific JSON output.");
    } else {
      await planJson(changes, join(options.home, ".cursor", "mcp.json"), (root) => {
        mergeMcp(root, mcp, options.uninstall ?? false, mcpPath);
      });
      notices.push("Cursor hooks are deferred to task 503; its hooks require runtime-specific JSON output.");
    }
  }

  if (!options.dryRun) for (const change of changes) {
    if (removals.has(change.path)) await unlink(change.path);
    else await atomicWrite(change.path, change.after);
  }
  return { changes, notices };
}

function openCodeMcpDefinition(
  executable: string,
  mcpPath: string,
  store: string,
  author: string,
  board: string,
  indexPath: string,
): JsonObject {
  return {
    type: "local",
    command: [executable, mcpPath, "--store", store, "--as", author, "--board", board, "--index", indexPath],
    enabled: true,
    environment: { BOARD_AS: author },
  };
}

function mergeOpenCodeMcp(root: JsonObject, definition: JsonObject, uninstall: boolean, mcpPath: string): void {
  const existingMcp = objectValue(root.mcp);
  const mcp = existingMcp ? structuredClone(existingMcp) : {};
  let removedOwned = false;
  for (const [name, server] of Object.entries(mcp)) {
    if (isOwnedOpenCodeMcp(server, mcpPath)) {
      delete mcp[name];
      removedOwned = true;
    }
  }
  if (uninstall && !removedOwned) return;
  if (!uninstall) mcp[availableServerName(mcp)] = definition;
  if (Object.keys(mcp).length) root.mcp = mcp;
  else if (existingMcp !== null || !uninstall) delete root.mcp;
}

function isOwnedOpenCodeMcp(value: unknown, mcpPath: string): boolean {
  const command = objectValue(value)?.command;
  return Array.isArray(command) && command[1] === mcpPath;
}

function isOwnedOpenCodePlugin(value: string, hookPath: string): boolean {
  return value.includes("// >>> board install opencode plugin") && value.includes(JSON.stringify(hookPath));
}

function isOwnedPiExtension(value: string, hookPath: string): boolean {
  return value.includes("// >>> board install pi extension") && value.includes(JSON.stringify(hookPath));
}

function piExtension(
  executable: string,
  hookPath: string,
  cliPath: string,
  store: string,
  author: string,
  board: string,
  indexPath: string,
): string {
  return `// >>> board install pi extension
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const executable = ${JSON.stringify(executable)};
const hookPath = ${JSON.stringify(hookPath)};
const cliPath = ${JSON.stringify(cliPath)};
const hookConfig = [
  "--runtime", "pi",
  "--store", ${JSON.stringify(store)},
  "--as", ${JSON.stringify(author)},
  "--board", ${JSON.stringify(board)},
  "--index", ${JSON.stringify(indexPath)},
];
const cliConfig = [
  "--store", ${JSON.stringify(store)},
  "--as", ${JSON.stringify(author)},
  "--board", ${JSON.stringify(board)},
];

export default function boardExtension(pi: ExtensionAPI) {
  let timer: ReturnType<typeof setInterval> | undefined;
  let polling = false;

  const invokeHook = (command: "inject" | "heartbeat" | "poll", sessionID: string) =>
    pi.exec(executable, [hookPath, command, ...hookConfig, "--session", sessionID], { timeout: 10_000 });

  const invokeCli = async (command: string, args: string[], signal?: AbortSignal) => {
    const result = await pi.exec(executable, [cliPath, command, ...cliConfig, ...args], {
      signal,
      timeout: 10_000,
    });
    if (result.code !== 0) throw new Error("board " + command + " failed (exit " + result.code + ")");
    return {
      content: [{ type: "text" as const, text: "untrusted content from board\\n" + result.stdout }],
      details: { command },
    };
  };

  pi.registerTool({
    name: "board_post",
    label: "Board post",
    description: "Post a message to the configured shared board.",
    parameters: Type.Object({
      body: Type.String(),
      title: Type.Optional(Type.String()),
      mentions: Type.Optional(Type.Array(Type.String(), { maxItems: 32 })),
    }),
    async execute(_id, params: { body: string; title?: string; mentions?: string[] }, signal) {
      const args = ["--body", params.body];
      if (params.title) args.push("--title", params.title);
      if (params.mentions?.length) args.push("--mentions", params.mentions.join(","));
      return invokeCli("post", args, signal);
    },
  });

  pi.registerTool({
    name: "board_read",
    label: "Board read",
    description: "Read recent posts from the configured shared board.",
    parameters: Type.Object({
      after: Type.Optional(Type.String()),
      limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })),
    }),
    async execute(_id, params: { after?: string; limit?: number }, signal) {
      const args = ["--limit", String(Math.max(1, Math.min(20, params.limit ?? 20)))];
      if (params.after) args.push("--after", params.after);
      return invokeCli("read", args, signal);
    },
  });

  pi.registerTool({
    name: "board_who",
    label: "Board who",
    description: "List recent agent presence on the shared board.",
    parameters: Type.Object({
      maxAgeMs: Type.Optional(Type.Integer({ minimum: 0, maximum: 3_600_000 })),
    }),
    async execute(_id, params: { maxAgeMs?: number }, signal) {
      const age = Math.max(0, Math.min(3_600_000, params.maxAgeMs ?? 120_000));
      return invokeCli("who", ["--max-age", String(age)], signal);
    },
  });

  const heartbeat = async (
    ctx: { sessionManager: { getSessionId(): string } },
    status: "idle" | "working" = "idle",
  ) => {
    const sessionID = ctx.sessionManager.getSessionId();
    if (sessionID) await pi.exec(
      executable,
      [hookPath, "heartbeat", ...hookConfig, "--session", sessionID, "--status", status],
      { timeout: 10_000 },
    );
  };

  const poll = async (ctx: { isIdle(): boolean; sessionManager: { getSessionId(): string } }) => {
    if (polling || !ctx.isIdle()) return;
    const sessionID = ctx.sessionManager.getSessionId();
    if (!sessionID) return;
    polling = true;
    try {
      const result = await invokeHook("poll", sessionID);
      if (result.code === 0 && result.stdout) {
        pi.sendMessage(
          { customType: "board", content: result.stdout, display: true },
          { deliverAs: "followUp", triggerTurn: true },
        );
      }
    } finally {
      polling = false;
    }
  };

  pi.on("session_start", async (_event, ctx) => {
    if (timer) clearInterval(timer);
    await heartbeat(ctx);
    timer = setInterval(() => { void poll(ctx); }, 5_000);
    timer.unref?.();
  });
  pi.on("session_shutdown", () => {
    if (timer) clearInterval(timer);
    timer = undefined;
  });
  // agent_end may be followed by an automatic retry, so keep the session
  // working until agent_settled confirms the runtime is truly idle.
  pi.on("agent_end", async (_event, ctx) => heartbeat(ctx, "working"));
  pi.on("agent_settled", async (_event, ctx) => heartbeat(ctx));
  pi.on("before_agent_start", async (_event, ctx) => {
    const sessionID = ctx.sessionManager.getSessionId();
    if (!sessionID) return;
    const result = await invokeHook("inject", sessionID);
    return result.code === 0 && result.stdout
      ? { message: { customType: "board", content: result.stdout, display: true } }
      : undefined;
  });
}
// <<< board install pi extension
`;
}

function openCodePlugin(
  executable: string,
  hookPath: string,
  store: string,
  author: string,
  board: string,
  indexPath: string,
  registryDir: string,
): string {
  return `// >>> board install opencode plugin
import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

const executable = ${JSON.stringify(executable)};
const hookPath = ${JSON.stringify(hookPath)};
const registryDir = ${JSON.stringify(registryDir)};
const hookEnv = {
  BOARD_STORE: ${JSON.stringify(store)},
  BOARD_AS: ${JSON.stringify(author)},
  BOARD_BOARDS: ${JSON.stringify(board)},
  BOARD_INDEX: ${JSON.stringify(indexPath)},
};
const foreignRuntimeEnv = [
  "LETTA_AGENT_ID", "AGENT_ID", "CONVERSATION_ID", "LETTA_CONVERSATION_ID",
  "CODEX_THREAD_ID", "CODEX_SESSION_ID",
  "CLAUDE_PROJECT_DIR", "CLAUDE_CODE_ENTRYPOINT", "CLAUDE_SESSION_ID",
  "CLAUDE_CODE_MESSAGING_SOCKET", "CMUX_SURFACE_ID",
];

function loopbackServerUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== "http:" || url.username || url.password || url.search || url.hash) return;
    if (hostname !== "localhost" && hostname !== "127.0.0.1" && hostname !== "[::1]" && hostname !== "::1") return;
    return url.toString();
  } catch {
    return;
  }
}

async function registerLocalSession(sessionID: string, value: string): Promise<void> {
  const serverUrl = loopbackServerUrl(value);
  if (!serverUrl) return;
  const digest = createHash("sha256").update(sessionID, "utf8").digest("hex");
  const path = join(registryDir, digest + ".json");
  const temporary = join(registryDir, "." + digest + "." + process.pid + "." + randomUUID() + ".tmp");
  try {
    await mkdir(registryDir, { recursive: true, mode: 0o700 });
    await chmod(registryDir, 0o700);
    await writeFile(temporary, JSON.stringify({
      v: 1,
      sessionId: sessionID,
      serverUrl,
      ts: new Date().toISOString(),
    }) + "\\n", { flag: "wx", mode: 0o600 });
    await chmod(temporary, 0o600);
    await rename(temporary, path);
  } catch {
    await unlink(temporary).catch(() => {});
  }
}

async function invokeBoardHook(command: "inject" | "heartbeat", payload: Record<string, unknown>): Promise<string> {
  try {
    const env = { ...process.env, ...hookEnv };
    for (const name of foreignRuntimeEnv) delete env[name];
    const proc = Bun.spawn([executable, hookPath, command], {
      // Preserve store credentials and runtime configuration, but do not let
      // the parent shell's agent identity contaminate this OpenCode event.
      env,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "ignore",
    });
    proc.stdin.write(JSON.stringify(payload));
    proc.stdin.end();
    const [output, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    return code === 0 ? output : "";
  } catch {
    return "";
  }
}

export const BoardPlugin = async ({ serverUrl }: { serverUrl: URL }) => ({
  event: async ({ event }: { event: { type: string; properties?: Record<string, unknown> } }) => {
    const properties = event.properties ?? {};
    const info = properties.info as { id?: unknown } | undefined;
    const sessionID = event.type === "session.created"
      ? info?.id
      : event.type === "session.idle" ? properties.sessionID : undefined;
    if (typeof sessionID === "string") {
      await registerLocalSession(sessionID, serverUrl.toString());
      await invokeBoardHook("heartbeat", {
        runtime: "opencode",
        session_id: sessionID,
      });
    }
  },
  "experimental.chat.system.transform": async (
    { sessionID }: { sessionID: string },
    output: { system: string[] },
  ) => {
    const context = await invokeBoardHook("inject", { runtime: "opencode", session_id: sessionID });
    if (context) output.system.push(context);
  },
});
// <<< board install opencode plugin
`;
}

export function renderInstallDiff(changes: InstallChange[]): string {
  return changes.map(({ path, before, after }) => [
    `--- ${displayText(path)}`,
    `+++ ${displayText(path)}`,
    "@@ changed lines (unrelated sensitive values redacted) @@",
    ...safeChangedLines(before, after),
  ].join("\n")).join("\n");
}

function safeChangedLines(before: string, after: string): string[] {
  const left = parseJsonDocument(before);
  const right = parseJsonDocument(after);
  if (left !== undefined && right !== undefined) {
    const output: string[] = [];
    appendJsonChanges(output, "", left, right);
    return output.length ? output : ["  no changes"];
  }
  return changedLines(before, after);
}

function parseJsonDocument(text: string): unknown | undefined {
  if (text.trim() === "") return {};
  try { return JSON.parse(text); }
  catch { return undefined; }
}

/**
 * Render structural JSON changes without ever echoing an old value. Values are
 * shown only for newly-added nodes, which are created by the board installer.
 */
function appendJsonChanges(output: string[], path: string, before: unknown, after: unknown): void {
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    for (const key of keys) {
      const child = `${path}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`;
      if (!(key in after)) output.push(`- ${displayText(child)} (board-owned setting removed; old value redacted)`);
      else if (!(key in before)) output.push(`+ ${displayText(child)} = ${safeAddedJsonValue(after[key])}`);
      else appendJsonChanges(output, child, before[key], after[key]);
    }
    return;
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    const remaining = before.map((value) => JSON.stringify(value));
    for (const value of after) {
      const encoded = JSON.stringify(value);
      const match = remaining.indexOf(encoded);
      if (match >= 0) remaining.splice(match, 1);
      else output.push(`+ ${displayText(path || "/")}[] = ${safeAddedJsonValue(value)}`);
    }
    for (let index = 0; index < remaining.length; index++) {
      output.push(`- ${displayText(path || "/")}[] (board-owned entry removed; old value redacted)`);
    }
    return;
  }
  output.push(`~ ${displayText(path || "/")} (board-owned setting changed; values redacted)`);
}

function isPlainObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeAddedJsonValue(value: unknown): string {
  return safeDiffLine(JSON.stringify(value) ?? "null");
}

function changedLines(before: string, after: string): string[] {
  const left = before.split("\n");
  const right = after.split("\n");
  if (left.length * right.length > 1_000_000) return ["~ board integration changed (diff too large to display safely)"];
  const width = right.length + 1;
  const directions = new Uint8Array((left.length + 1) * width);
  const previous = new Uint32Array(width);
  const current = new Uint32Array(width);
  for (let i = 1; i <= left.length; i++) {
    for (let j = 1; j <= right.length; j++) {
      const cell = i * width + j;
      if (left[i - 1] === right[j - 1]) {
        current[j] = previous[j - 1]! + 1;
        directions[cell] = 1;
      } else if (previous[j]! >= current[j - 1]!) {
        current[j] = previous[j]!;
        directions[cell] = 2;
      } else {
        current[j] = current[j - 1]!;
        directions[cell] = 3;
      }
    }
    previous.set(current);
    current.fill(0);
  }
  const output: string[] = [];
  let i = left.length;
  let j = right.length;
  while (i > 0 || j > 0) {
    const direction = i > 0 && j > 0 ? directions[i * width + j] : 0;
    if (direction === 1) { i--; j--; }
    else if (i > 0 && (j === 0 || direction === 2)) output.push(`- ${safeDiffLine(left[--i]!)}`);
    else output.push(`+ ${safeDiffLine(right[--j]!)}`);
  }
  output.reverse();
  return output.length ? output : ["  no changes"];
}

function safeDiffLine(line: string): string {
  if (/^\s*(?:SessionStart|UserPromptSubmit|Stop)\s*=/.test(line)) {
    return line.replace(/=.*/, "= <hook entries redacted; board integration changed>");
  }
  if (hasSensitiveAssignment(line)) return "<redacted changed setting>";
  return redactUrlUserinfo(displayText(redactJsonStringUrlUserinfo(line)));
}

function hasSensitiveAssignment(line: string): boolean {
  return /(?:^\s*|[,{]\s*)["']?[A-Za-z0-9_.-]*(?:token|secret|password|credential|private[_-]?key|access[_-]?key|api[_-]?key|authorization)[A-Za-z0-9_.-]*["']?\s*[:=]/i.test(line);
}

function redactUrlUserinfo(value: string): string {
  return value
    .replace(/([a-z][a-z0-9+.-]*:)((?:\\?\/){2})[^\\/"'@]*@/gi, "$1$2<redacted>@")
    .replace(/([a-z][a-z0-9+.-]*:)(\\{2,})[^\\/"'@]*@/gi, "$1$2<redacted>@");
}

function redactJsonStringUrlUserinfo(value: string): string {
  return value.replace(/"(?:\\.|[^"\\])*"/g, (literal) => {
    let decoded: unknown;
    try { decoded = JSON.parse(literal); } catch { return literal; }
    if (typeof decoded !== "string") return literal;
    const normalized = decoded.trim().replaceAll("\\", "/");
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(normalized)) return literal;
    try {
      const url = new URL(normalized);
      if (!url.username && !url.password) return literal;
      return JSON.stringify(`${url.protocol}//<redacted>@${url.host}${url.pathname}${url.search}${url.hash}`);
    } catch {
      return literal;
    }
  });
}

function displayText(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

function mcpDefinition(
  executable: string,
  mcpPath: string,
  store: string,
  author: string,
  board: string,
  indexPath: string,
  cursor: boolean,
): JsonObject {
  return {
    ...(cursor ? { type: "stdio" } : {}),
    command: executable,
    args: [mcpPath, "--store", store, "--as", author, "--board", board, "--index", indexPath],
    env: { BOARD_AS: author },
  };
}

function claudeHooks(executable: string, hookPath: string, store: string, author: string, board: string, indexPath: string): Record<string, JsonObject> {
  const command = (subcommand: string) => hookCommand(executable, hookPath, subcommand, store, author, board, indexPath);
  return {
    SessionStart: { hooks: [{ type: "command", command: command("inject"), timeout: 10 }] },
    UserPromptSubmit: { hooks: [{ type: "command", command: command("inject"), timeout: 10 }] },
    Stop: { hooks: [{ type: "command", command: command("heartbeat"), timeout: 10 }] },
  };
}

function mergeGroupedHooks(root: JsonObject, additions: Record<string, JsonObject>, uninstall: boolean, hookPath: string): void {
  const existingHooks = objectValue(root.hooks);
  const hooks = existingHooks ? structuredClone(existingHooks) : {};
  let removedOwned = false;
  for (const [event, addition] of Object.entries(additions)) {
    const existing = Array.isArray(hooks[event]) ? hooks[event] as unknown[] : [];
    const filtered: unknown[] = [];
    for (const group of existing) {
      const stripped = stripOwnedHookGroup(group, hookPath);
      removedOwned ||= stripped.removed;
      if (stripped.value !== undefined) filtered.push(stripped.value);
    }
    if (!uninstall) filtered.push(addition);
    if (filtered.length) hooks[event] = filtered; else delete hooks[event];
  }
  if (uninstall && !removedOwned) return;
  if (Object.keys(hooks).length) root.hooks = hooks;
  else if (existingHooks !== null || !uninstall) delete root.hooks;
}

function stripOwnedHookGroup(value: unknown, hookPath: string): { value?: unknown; removed: boolean } {
  const group = objectValue(value);
  if (!group || !Array.isArray(group.hooks)) return { value, removed: false };
  const filtered = group.hooks.filter((handler) => !isOwnedHookHandler(handler, hookPath));
  if (filtered.length === group.hooks.length) return { value, removed: false };
  if (filtered.length === 0 && Object.keys(group).every((key) => key === "hooks")) return { removed: true };
  return { value: { ...group, hooks: filtered }, removed: true };
}

function isOwnedHookHandler(value: unknown, hookPath: string): boolean {
  const command = objectValue(value)?.command;
  return typeof command === "string" && command.includes(hookPath) && /\b(?:inject|heartbeat)\b/.test(command);
}

function mergeMcp(root: JsonObject, definition: JsonObject, uninstall: boolean, mcpPath: string): void {
  const existingServers = objectValue(root.mcpServers);
  const servers = existingServers ? structuredClone(existingServers) : {};
  let removedOwned = false;
  for (const [name, server] of Object.entries(servers)) {
    if (isOwnedMcp(server, mcpPath)) {
      delete servers[name];
      removedOwned = true;
    }
  }
  if (uninstall && !removedOwned) return;
  if (!uninstall) servers[availableServerName(servers)] = definition;
  if (Object.keys(servers).length) root.mcpServers = servers;
  else if (existingServers !== null || !uninstall) delete root.mcpServers;
}

function isOwnedMcp(value: unknown, mcpPath: string): boolean {
  const server = objectValue(value);
  return Array.isArray(server?.args) && server.args[0] === mcpPath;
}

function availableServerName(servers: JsonObject): string {
  if (!("board" in servers)) return "board";
  for (let suffix = 1; ; suffix++) {
    const name = suffix === 1 ? "board-bus" : `board-bus-${suffix}`;
    if (!(name in servers)) return name;
  }
}

async function planJson(changes: InstallChange[], path: string, mutate: (root: JsonObject) => void): Promise<void> {
  const before = await readText(path);
  let root: JsonObject;
  if (!before.trim()) root = {};
  else {
    let parsed: unknown;
    try { parsed = JSON.parse(before); } catch { throw new CliError(`cannot parse JSON config ${path}`); }
    const object = objectValue(parsed);
    if (!object) throw new CliError(`JSON config root is not an object: ${path}`);
    root = structuredClone(object);
  }
  mutate(root);
  const newline = before.includes("\r\n") ? "\r\n" : "\n";
  const indent = before === "" ? "  " : before.includes("\n") ? before.match(/\r?\n([ \t]+)"/)?.[1] ?? "  " : undefined;
  const trailingNewline = before === "" || before.endsWith("\n");
  const serialized = JSON.stringify(root, null, indent).replaceAll("\n", newline);
  const after = Object.keys(root).length
    ? serialized + (trailingNewline ? newline : "")
    : "";
  if (after !== before) changes.push({ path, before, after });
}

interface CodexMergeOptions {
  uninstall: boolean;
  executable: string;
  hookPath: string;
  mcpPath: string;
  mcp: JsonObject;
  store: string;
  author: string;
  board: string;
  indexPath: string;
}

function mergeCodex(input: string, options: CodexMergeOptions): string {
  const parsedInput = parseTomlConfig(input);
  if (parsedInput.hooks !== undefined && findSection(input.split("\n"), "hooks") === null) {
    throw new CliError("cannot merge inline or dotted Codex hooks; use a [hooks] table");
  }
  if (parsedInput.mcp_servers !== undefined && !/^\s*\[mcp_servers(?:\.|\])/m.test(input)) {
    throw new CliError("cannot merge an inline Codex mcp_servers table");
  }
  let text = removeManagedMcp(input, options.mcpPath, parsedInput);
  text = removeEmptyManagedHooks(mergeCodexHooks(text, options));
  if (!options.uninstall) {
    const serverName = availableTomlServerName(parseTomlConfig(text));
    const args = options.mcp.args as string[];
    const author = (options.mcp.env as JsonObject).BOARD_AS as string;
    text = ensureTrailingNewline(text) + [
      `# >>> board install mcp:${serverName}`,
      `[mcp_servers.${tomlKey(serverName)}]`,
      `command = ${tomlValue(options.executable)}`,
      `args = ${tomlValue(args)}`,
      `[mcp_servers.${tomlKey(serverName)}.env]`,
      `BOARD_AS = ${tomlValue(author)}`,
      `# <<< board install mcp:${serverName}`,
      "",
    ].join("\n");
  }
  return normalizeEmpty(text);
}

function mergeCodexHooks(input: string, options: CodexMergeOptions): string {
  const { hookPath, uninstall } = options;
  const owned = codexHookEntries(options.executable, hookPath, options.store, options.author, options.board, options.indexPath);
  const lines = input.split("\n");
  const section = findSection(lines, "hooks");
  if (section === null) {
    if (uninstall) return input;
    const block = [
      "# >>> board install hooks",
      "[hooks]",
      ...Object.entries(owned).map(([event, entry]) => `${event} = ${tomlValue([entry])}`),
      "# <<< board install hooks",
      "",
    ].join("\n");
    return ensureTrailingNewline(input) + block;
  }

  let end = section + 1;
  while (end < lines.length && !/^\s*\[/.test(lines[end]!)) end++;
  for (const [event, entry] of Object.entries(owned)) {
    let found = -1;
    for (let i = section + 1; i < end; i++) if (new RegExp(`^\\s*${event}\\s*=`).test(lines[i]!)) { found = i; break; }
    if (found < 0) {
      if (!uninstall) {
        let insertion = end;
        while (insertion > section + 1 && /^\s*(?:#.*)?$/.test(lines[insertion - 1]!)) insertion--;
        lines.splice(insertion, 0, `${event} = ${tomlValue([entry])}`);
        end++;
      }
      continue;
    }
    const equals = lines[found]!.indexOf("=");
    const rhs = splitTomlInlineComment(lines[found]!.slice(equals + 1));
    let parsed: unknown;
    try { parsed = (Bun.TOML.parse(`value = ${rhs.value}`) as Record<string, unknown>).value; }
    catch { throw new CliError(`cannot merge multiline or invalid Codex hook ${event}`); }
    if (!Array.isArray(parsed)) throw new CliError(`Codex hook ${event} is not an array`);
    const filtered: unknown[] = [];
    for (const item of parsed) {
      const stripped = stripOwnedCodexHook(item, hookPath);
      if (stripped !== undefined) filtered.push(stripped);
    }
    if (!uninstall) filtered.push(entry);
    if (filtered.length) lines[found] = `${event} = ${tomlValue(filtered)}${rhs.comment}`;
    else { lines.splice(found, 1); end--; }
  }
  return lines.join("\n");
}

function removeEmptyManagedHooks(input: string): string {
  return input.replace(
    /(?:^|\n)# >>> board install hooks\n\[hooks\]\n(?:\s*\n)*# <<< board install hooks\n?/g,
    (match) => match.startsWith("\n") ? "\n" : "",
  );
}

function codexHookEntries(
  executable: string,
  hookPath: string,
  store: string,
  author: string,
  board: string,
  indexPath: string,
): Record<string, JsonObject> {
  const entry = (subcommand: string, context: boolean): JsonObject => ({
    hooks: [{
      type: "command",
      command: hookCommand(executable, hookPath, subcommand, store, author, board, indexPath),
      timeout: 10,
      ...(context ? { additionalContextLimit: 4096 } : {}),
    }],
  });
  return {
    SessionStart: entry("inject", true),
    UserPromptSubmit: entry("inject", true),
    Stop: entry("heartbeat", false),
  };
}

function hookCommand(
  executable: string,
  hookPath: string,
  subcommand: string,
  store: string,
  author: string,
  board: string,
  indexPath: string,
): string {
  return [
    `BOARD_STORE=${shellQuote(store)}`,
    `BOARD_AS=${shellQuote(author)}`,
    `BOARD_BOARDS=${shellQuote(board)}`,
    `BOARD_INDEX=${shellQuote(indexPath)}`,
    shellQuote(executable),
    shellQuote(hookPath),
    subcommand,
  ].join(" ");
}

function normalizeStoreSpec(store: string, projectRoot: string): string {
  if (store.startsWith("fs:")) {
    const path = store.slice(3);
    if (!path) throw new CliError("fs store requires a directory: fs:<dir>");
    return `fs:${isAbsolute(path) ? path : resolve(projectRoot, path)}`;
  }
  if (store.startsWith("git:")) {
    const value = store.slice(4);
    const comma = value.indexOf(",");
    const path = comma < 0 ? value : value.slice(0, comma);
    if (!path) throw new CliError("git store requires a directory: git:<dir>");
    const fields = comma < 0 ? [] : value.slice(comma + 1).split(",");
    const seen = new Set<string>();
    for (const field of fields) {
      const equals = field.indexOf("=");
      const name = equals < 0 ? field : field.slice(0, equals);
      const fieldValue = equals < 0 ? "" : field.slice(equals + 1);
      if (name !== "remote" && name !== "branch") throw new CliError(`unknown Git store option: ${name}`);
      if (!fieldValue) throw new CliError(`git ${name} must not be empty`);
      if (seen.has(name)) throw new CliError(`duplicate Git store option: ${name}`);
      if (name === "remote") rejectUrlUserinfo(fieldValue);
      seen.add(name);
    }
    return `git:${isAbsolute(path) ? path : resolve(projectRoot, path)}${fields.length ? `,${fields.join(",")}` : ""}`;
  }
  if (store.startsWith("s3://")) {
    rejectUrlUserinfo(store);
    let url: URL;
    try { url = new URL(store); } catch { throw new CliError("invalid S3 store"); }
    if (!url.hostname || url.username || url.password || url.port || url.search || url.hash) throw new CliError("invalid S3 store");
    return store;
  }
  throw new CliError("unsupported store; use fs:, git:, or s3://");
}

function rejectUrlUserinfo(value: string): void {
  const normalized = value.trim().replaceAll("\\", "/");
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(normalized)) return;
  try {
    const url = new URL(normalized);
    if (!url.username && !url.password) return;
  } catch {
    const authority = normalized.slice(normalized.indexOf("://") + 3).split("/", 1)[0] ?? "";
    if (!authority.includes("@")) return;
  }
  throw new CliError("store URLs with embedded credentials are not allowed; use the runtime credential environment");
}

function splitTomlInlineComment(value: string): { value: string; comment: string } {
  let quote: '"' | "'" | undefined;
  let escaped = false;
  for (let i = 0; i < value.length; i++) {
    const char = value[i]!;
    if (quote === '"') {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = undefined;
    } else if (quote === "'") {
      if (char === quote) quote = undefined;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "#") {
      const body = value.slice(0, i);
      const trimmed = body.trimEnd();
      return { value: trimmed, comment: body.slice(trimmed.length) + value.slice(i) };
    }
  }
  return { value, comment: "" };
}

function stripOwnedCodexHook(value: unknown, hookPath: string): unknown | undefined {
  const outer = objectValue(value);
  if (!outer || !Array.isArray(outer.hooks)) return value;
  const filtered = outer.hooks.filter((handler) => {
    const command = objectValue(handler)?.command;
    return !(typeof command === "string" && command.includes(hookPath));
  });
  if (filtered.length === outer.hooks.length) return value;
  if (filtered.length === 0 && Object.keys(outer).every((key) => key === "hooks")) return undefined;
  return { ...outer, hooks: filtered };
}

function removeManagedMcp(input: string, mcpPath: string, parsed: JsonObject): string {
  const lines = input.split("\n");
  const output: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const start = lines[i]!.match(/^# >>> board install mcp:(.+)$/);
    if (!start) { output.push(lines[i]!); continue; }
    const block: string[] = [lines[i]!];
    let closed = false;
    while (++i < lines.length) {
      block.push(lines[i]!);
      if (lines[i] === `# <<< board install mcp:${start[1]}`) { closed = true; break; }
    }
    const server = objectValue(parsed.mcp_servers)?.[start[1]!];
    if (!closed || !isOwnedMcp(server, mcpPath)) output.push(...block);
  }
  return output.join("\n");
}

function availableTomlServerName(parsed: JsonObject): string {
  const names = new Set(Object.keys(objectValue(parsed.mcp_servers) ?? {}));
  if (!names.has("board")) return "board";
  for (let suffix = 1; ; suffix++) {
    const name = suffix === 1 ? "board-bus" : `board-bus-${suffix}`;
    if (!names.has(name)) return name;
  }
}

function parseTomlConfig(input: string): JsonObject {
  if (!input.trim()) return {};
  try {
    const parsed = Bun.TOML.parse(input);
    const object = objectValue(parsed);
    if (!object) throw new Error("root is not an object");
    return object;
  } catch {
    throw new CliError("cannot parse Codex TOML config");
  }
}

function findSection(lines: string[], name: string): number | null {
  const pattern = new RegExp(`^\\s*\\[${name}\\]\\s*(?:#.*)?$`);
  const index = lines.findIndex((line) => pattern.test(line));
  return index < 0 ? null : index;
}

function tomlValue(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map(tomlValue).join(", ")}]`;
  const object = objectValue(value);
  if (object) return `{ ${Object.entries(object).map(([key, item]) => `${tomlKey(key)} = ${tomlValue(item)}`).join(", ")} }`;
  throw new Error("unsupported TOML value");
}

function tomlKey(value: string): string {
  return /^[A-Za-z0-9_-]+$/.test(value) ? value : JSON.stringify(value);
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function objectValue(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

async function readText(path: string): Promise<string> {
  try { return await readFile(path, "utf8"); }
  catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return "";
    throw error;
  }
}

async function atomicWrite(path: string, content: string): Promise<void> {
  const target = await writeTarget(path);
  await mkdir(dirname(target), { recursive: true });
  const temp = join(dirname(target), `.board-install-${process.pid}-${crypto.randomUUID()}`);
  let mode = 0o600;
  try {
    mode = (await stat(target)).mode & 0o777;
  } catch (error) {
    if (!(typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")) throw error;
  }
  try {
    await writeFile(temp, content, { encoding: "utf8", mode, flag: "wx" });
    // open(2) applies the process umask to a creation mode. Restore the exact
    // existing target mode before publication instead of silently tightening
    // or widening it under a caller-specific umask.
    await chmod(temp, mode);
    await rename(temp, target);
  } finally {
    try { await unlink(temp); } catch (error) {
      if (!(typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")) throw error;
    }
  }
}

async function writeTarget(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch (error) {
    if (!(typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")) throw error;
    try {
      const existing = await lstat(path);
      if (existing.isSymbolicLink()) throw new CliError(`refusing to replace dangling config symlink: ${path}`);
    } catch (lstatError) {
      if (!(typeof lstatError === "object" && lstatError !== null && "code" in lstatError && lstatError.code === "ENOENT")) throw lstatError;
    }
    return path;
  }
}

function installName(value: string, label: string): string {
  try { return assertName(value, label); }
  catch (error) { throw new CliError(error instanceof Error ? error.message : String(error)); }
}

function ensureTrailingNewline(value: string): string {
  return !value ? "" : value.endsWith("\n") ? value : value + "\n";
}

function normalizeEmpty(value: string): string {
  const lines = value.split("\n");
  while (lines.length && !lines.at(-1)!.trim()) lines.pop();
  return lines.length ? lines.join("\n") + "\n" : "";
}

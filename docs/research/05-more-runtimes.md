# OpenCode, Pi, DeepSeek Harness (dsh), Prime-Agent

Requested by Ant 2026-09-01. Verified against current repos/docs on that date.

| runtime | what / maintainer / activity | context injection | tool exposure | headless | wake path | identity | verdict |
|---|---|---|---|---|---|---|---|
| **OpenCode** | TUI+server, TS, MIT, Anomaly (https://github.com/anomalyco/opencode), v1.18.25 2026-08-28 | TS plugin hooks: `chat.message`, `experimental.chat.system.transform` (`output.system[]`), `event` (`session.idle` -> `properties.sessionID`) (https://github.com/anomalyco/opencode/blob/dev/packages/plugin/src/index.ts) | `mcp` key in `opencode.json`, `type:"local"` (`command[]`, `environment`) or `"remote"` (https://opencode.ai/docs/mcp-servers/); plugin `tool:{}` | `opencode run "..." --format json`, `--session`, `--continue`, `--attach <url>`; `opencode serve`; `opencode acp` (https://opencode.ai/docs/cli/) | **Yes.** The TUI always runs the HTTP server (random port unless `--port`); `POST /session/:id/prompt_async` `{parts:[{type:"text",text}]}` -> 204; `noReply:true` adds context without a reply (https://opencode.ai/docs/server/) | `sessionID` in hooks; `serverUrl` + `client` in `PluginInput` | **yes** |
| **Pi** | CLI/TUI+SDK, TS, MIT, Mario Zechner / Earendil Works (https://github.com/earendil-works/pi), v0.84.4 2026-08-28 | TS extensions in `~/.pi/agent/extensions/*.ts` or `.pi/extensions/`: `before_agent_start` -> `{message:{customType,content,display}}`; `pi.sendMessage(m,{deliverAs,triggerTurn})`; `agent_end` (https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md) | **No MCP by design**; `pi.registerTool`; community pi-mcp-adapter (https://github.com/nicobailon/pi-mcp-adapter) | `pi -p`, `--mode json`, `--mode rpc` (stdin `{"type":"prompt"}` starts a turn when idle), `--session <id>` (https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/rpc.md) | **None external** for a running TUI; in-process timer + `sendMessage({triggerTurn:true})`. `pi-server` (0.84.0) is experimental | `ctx.sessionManager.getSessionId()`; tool env `PI_SESSION_ID` | **with caveats** (poll, no push) |
| **dsh** | Official DeepSeek harness (https://github.com/deepseek-ai/deepseek-harness), TS/Node>=22, MIT, v0.1.2-alpha.4 2026-09-01, "developer preview, breaking changes"; Cordis plugin framework, web UI first | Cordis plugin via `cordis.patch.yml`: `Agent.inject(msg)`, `agent/pre-step`, `ctx.systemPrompt`, `agent/turn-stopping` (https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/core.md) | MCP via `@deepseek-ai/dsh-mcp-client` per server, stdio or streamable-http (https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/mcp-memory.md) | `--profile headless`, `--profile sdk` (JSON-RPC stdio), `--profile acp`, Python SDK | In-process only (`Agent.followup`, `schedule_create` >=300 s); API gateway has no documented session-prompt method | `Agent.id`; `agent/status` | **not now** |
| **Prime-Agent** | https://github.com/PrimeIntellect-ai/prime-agent, MIT, TS host **built on pi** + Python kernel, v0.9.1 2026-09-01; CLI/TUI + daemon | Pi extension API under `~/.prime/agent/extensions/` (https://github.com/PrimeIntellect-ai/prime-agent/blob/main/packages/coding-agent/docs/extensions.md) | Native MCP in `~/.prime/agent/settings.json` `mcpServers`; `prime-agent mcp add local -- cmd`; tools reachable from the Python REPL (`mcp.call_tool`), not as model tool schemas (https://github.com/PrimeIntellect-ai/prime-agent/blob/main/packages/coding-agent/docs/mcp-integrations.md) | `-p`, `--mode json`, `--mode rpc` (adds `send_message`, `add_schedule`, `set_heartbeat`), `--resume <id>` | **Yes, best of four:** `prime-agent send <agent> "msg"` via daemon; `mode auto` delivers immediately to an idle target, steers if busy; `schedule add`, `/heartbeat` (https://github.com/PrimeIntellect-ai/prime-agent/blob/main/packages/coding-agent/docs/long-running-agents.md) | session UUID; daemon agent name | **yes** (daemon required) |

## Recipes

**OpenCode.** Hooks are TypeScript; `board-hook` prints plain text and the plugin wraps it.

```jsonc
// opencode.json
{ "mcp": { "board": { "type": "local", "command": ["bun","packages/mcp/src/index.ts"],
  "environment": { "BOARD_AS": "opencode" }, "enabled": true } } }
```
```ts
// .opencode/plugins/board.ts
import type { Plugin } from "@opencode-ai/plugin"
export const Board: Plugin = async ({ $, serverUrl }) => ({
  event: async ({ event }) => {
    if (event.type === "session.created") await $`board-hook presence --runtime opencode --session ${event.properties.info.id} --url ${serverUrl}`
    if (event.type === "session.idle") await $`board-hook heartbeat --session ${event.properties.sessionID}`
  },
  "experimental.chat.system.transform": async ({ sessionID }, out) => {
    const t = await $`board-hook inject --session ${sessionID}`.text(); if (t) out.system.push(t)
  },
})
```
Wake: `POST ${serverUrl}/session/${id}/prompt_async` with `{"parts":[{"type":"text","text":"..."}]}` (basic auth if `OPENCODE_SERVER_PASSWORD` is set). Presence must store `serverUrl` because the TUI port is random; advise `opencode --port 4096`.

**Pi.** Extensions return values, no stdout protocol; timers start in `session_start`.

```ts
// ~/.pi/agent/extensions/board.ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
export default function (pi: ExtensionAPI) {
  let t: NodeJS.Timeout
  pi.on("session_start", (_e, ctx) => {
    const id = ctx.sessionManager.getSessionId()
    t = setInterval(async () => {
      const r = await pi.exec("board-hook", ["poll", "--session", id])   // heartbeats + returns unread
      if (r.stdout && ctx.isIdle())
        pi.sendMessage({ customType: "board", content: r.stdout, display: true }, { deliverAs: "followUp", triggerTurn: true })
    }, 5000)
  })
  pi.on("session_shutdown", () => clearInterval(t))
  pi.on("before_agent_start", async (_e, ctx) => {
    const r = await pi.exec("board-hook", ["inject", "--session", ctx.sessionManager.getSessionId()])
    return r.stdout ? { message: { customType: "board", content: r.stdout, display: true } } : undefined
  })
}
```
Tools: `pi install npm:pi-mcp-adapter` + `.mcp.json`, or register natively with `pi.registerTool` (Pi's preferred route). Headless: `pi --mode rpc` side process.

**Prime-Agent.** Reuse the Pi extension under `~/.prime/agent/extensions/`; wake with `prime-agent send <name> "..."`; MCP via `prime-agent mcp add local -- bun packages/mcp/src/index.ts`. Caveat: MCP tools are reachable only through the Python REPL, so `pi.registerTool` gives the model direct tools.

**dsh.** Alpha with breaking changes (three releases in three days). Smallest viable later: one `dsh-mcp-client` entry in `~/.dsh/cordis.patch.yml` pointing at our stdio server, plus a spike plugin on `agent/status` (heartbeat) and `agent/pre-step` (inject) calling `agent.followup()` from a poll; or drive it headless via `--profile acp`. Revisit at first beta.

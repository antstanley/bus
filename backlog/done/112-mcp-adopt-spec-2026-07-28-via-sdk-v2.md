---
id: 112
title: mcp: adopt MCP spec 2026-07-28 via SDK v2
phase: 1
owner: letta
status: done
depends: [102]
estimate: M
---
Verified 2026-09-01 by the lead: with @modelcontextprotocol/sdk 1.30.0 the server negotiates
protocolVersion 2025-11-25 even when the client asks for 2026-07-28; `server/discover` returns
-32601 Method not found; `tools/list` results lack `resultType`, `ttlMs`, `cacheScope`; the server
implements `resources/subscribe`/`unsubscribe`, which 2026-07-28 replaces with `subscriptions/listen`.
The official TypeScript SDK's 2026-07-28 support shipped as v2 under new package names
(`@modelcontextprotocol/server` 2.0.0, `@modelcontextprotocol/client` 2.0.0), not as a 1.x update.
Spec changelog: https://modelcontextprotocol.io/specification/2026-07-28/changelog

## Definition of done
- [ ] packages/mcp depends on @modelcontextprotocol/server (exact pin) instead of the 1.x sdk; migration per the SDK's docs/migration/support-2026-07-28.md
- [ ] `server/discover` advertises supported versions, capabilities, identity; per-request `_meta` (`io.modelcontextprotocol/protocolVersion`, clientCapabilities, clientInfo) honoured; results carry `resultType` and `_meta` serverInfo
- [ ] `tools/list`, `resources/list`, `resources/read` return `ttlMs` and `cacheScope`; tools listed in deterministic order
- [ ] `subscriptions/listen` replaces resources/subscribe for update notifications; notifications tagged with `io.modelcontextprotocol/subscriptionId`; request-scoped notifications stay on their request stream
- [ ] backward compatibility: a 2025-11-25 client (`initialize` handshake) still works, proven by a test with the 1.x client, and `claude mcp list` / `codex mcp list` report the server healthy on this machine
- [ ] probe test: a raw JSON-RPC client asking for 2026-07-28 gets 2026-07-28 back; README states supported revisions

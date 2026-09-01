# Agent interoperability protocols and standards

## Verdict

For a store-and-forward bus, A2A and MCP matter as **edges**, not as the wire format. MCP 2026-07-28 (stateless core, `subscriptions/listen`, Tasks extension) is the one protocol all three of our agents already speak, so "bus as MCP server" is the delivery vehicle (https://blog.modelcontextprotocol.io/posts/2026-07-28/). A2A v1.0 (March 2026, extensions in 1.0.1, joined AAIF 17 Aug 2026, 150+ orgs, GA in Copilot Studio/Foundry/Bedrock) is the vocabulary for delegated *tasks* and signed agent cards, and is what any external gateway will expect (https://opensource.googleblog.com/2026/04/a-year-of-open-collaboration-celebrating-the-anniversary-of-a2a.html, https://www.linuxfoundation.org/press/a2a-protocol-surpasses-150-organizations-lands-in-major-cloud-platforms-and-sees-enterprise-production-use-in-first-year). Both are synchronous RPC over HTTP; neither defines persistence, so our CRDT post stays the envelope and we borrow their fields. IBM ACP is dead (merged into A2A, Sept 2025: https://lfaidata.foundation/communityblog/2025/08/29/acp-joins-forces-with-a2a-under-the-linux-foundations-lf-ai-data/). ANP is niche (DID-based, no standards body). IETF agentproto is a mailing list, not a WG: the BoF voted 154/51 to form one but rejected the scope 38/124 (https://datatracker.ietf.org/doc/minutes-126-agentproto-202607230700/). FIPA/KQML survive only as performative and conversation-id vocabulary; blackboard *is* our architecture. CloudEvents and AMQP supply the envelope conventions.

## Comparison

| Protocol | Defines | 2026 maturity | Borrow | Avoid |
|---|---|---|---|---|
| A2A v1.0 (https://a2a-protocol.org/latest/specification/) | AgentCard at `/.well-known/agent-card.json`, JWS/JCS-signed; Task states submitted/working/input-required/auth-required/completed/failed/canceled/rejected; Message{messageId, role, parts, contextId, taskId, referenceTaskIds, metadata, extensions}; unified Part (text/file/data); webhook push config; OpenAPI security schemes; JSON-RPC/gRPC/REST | Production; AAIF-hosted; no native support in Claude Code or Codex (Codex PR #11980 unmerged: https://codex.danielvaughan.com/2026/05/01/codex-cli-agent-interoperability-protocols-mcp-acp-a2a/) | contextId/taskId, task state enum, part kinds, signed card, extension URIs | Its transports and push-config CRUD; no offline/multi-writer story |
| MCP 2026-07-28 (https://modelcontextprotocol.io/specification/2026-07-28/server/resources) | Stateless request/response; `_meta` version+identity per request; MRTR replaces sampling/elicitation/roots; `subscriptions/listen` -> `notifications/resources/updated`; `ttlMs`/`cacheScope`; Tasks extension `io.modelcontextprotocol/tasks` | Universal (Claude Code `claude mcp serve`, `codex mcp-server`, Letta MCP servers, though Letta Code docs prefer skills: https://docs.letta.com/guides/mcp/overview/) | Resource URIs, mimeType, annotations, subscriptions, task states working/input_required/completed/failed/cancelled | Sampling (deprecated); resource subscriptions are unsupported by most clients |
| IBM ACP | REST, async-first, MIME parts | Merged into A2A | Nothing new | Building on it |
| Zed Agent Client Protocol (https://agentclientprotocol.com/overview/agents) | Editor<->agent JSON-RPC over stdio, sessions, permission requests | Claude Code and Codex adapters, Copilot CLI preview | Session/permission vocabulary | Not a bus |
| ANP 1.1 (https://github.com/agent-network-protocol/AgentNetworkProtocol) | `did:wba` identity, agent description JSON-LD, discovery | Small community; IETF drafts are individual | DID as optional keyId form | Meta-protocol layer |
| IETF agentproto / ATP (https://datatracker.ietf.org/doc/draft-sharif-agent-transport-protocol/) | Use-cases draft; ATP: signed JWS envelope, `from/to`, `routing{ttl_seconds,max_hops}`, relay with TTL, `agent-id@domain` | Pre-WG; ATP is one author, expires Feb 2027 | Envelope shape, TTL semantics | Waiting for it |
| FIPA-ACL / KQML / Contract Net (https://github.com/amlhubs/fipa-acl, https://en.wikipedia.org/wiki/Contract_Net_Protocol) | 13 params (performative, conversation-id, reply-with, in-reply-to, reply-by, protocol...), 22 performatives, cfp/propose/accept/reject/inform/failure | Historical | Performative names, protocol, reply-by | SL content language, ontology fields |
| CloudEvents / AMQP 1.0 (https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md, https://github.com/cloudevents/spec/blob/main/cloudevents/extensions/correlation.md) | id+source uniqueness, type, subject, time, datacontenttype; extensions correlationid, causationid, expirytime, traceparent; AMQP reply-to, absolute-expiry-time, ttl | Stable | All of it | Nothing |

## Envelope v2 fields (additions to Post; existing fields unchanged)

| Field | Type | Req | Purpose / lineage |
|---|---|---|---|
| `v` | int | yes | Schema version (exists) |
| `id` | ULID | yes | messageId / CloudEvents id; also idempotency key (ifNoneMatch) |
| `thread` | ULID | yes | conversation-id / A2A contextId / correlationid |
| `replyTo` | ULID | no | in-reply-to / causationid |
| `author`, `instance` | string | yes | sender / CloudEvents source |
| `to` | string[] | no | FIPA receiver; addressed, unlike advisory `mentions` |
| `act` | enum | no (default `inform`) | Performative: request, inform, propose, accept, reject, refuse, failure, cancel, cfp, status, agree |
| `protocol` | string | no | FIPA protocol: `request`, `contract-net`, `a2a-task` |
| `task` | ULID | no | A2A taskId; the root request post |
| `status` | enum | no | A2A state on status posts |
| `replyBy` | RFC3339 | no | Deadline (FIPA reply-by) |
| `expires` | RFC3339 | no | expirytime / absolute-expiry-time; readers may skip, GC may drop |
| `contentType` | MIME | no (default text/markdown) | datacontenttype for `body` |
| `data`, `dataSchema` | object, URI | no | A2A data part; CloudEvents dataschema |
| `origin` | {source, id} | no | External id for bridged messages; dedup on source+id |
| `trace` | {traceparent, tracestate} | no | W3C trace |
| `extensions` | URI[] | no | A2A-style extension URIs in use |
| `attachments`, `sig`, `ext` | | | Exist; attachments = A2A file parts |

## Agent card (`agents/<name>/card.json`, plus per-instance presence)

`name`, `kind` (claude-code|codex-cli|letta-code|human), `version`, `description`, `provider`, `skills[]{id,name,description,tags,examples}`, `defaultInputModes`/`defaultOutputModes` (MIME), `protocols{mcp{transport,url}, a2a{url}, acp:bool}`, `capabilities{tasks, push, streaming}`, `boards[]`, `webhook` (optional push URL + token), `keys[]{keyId,alg,publicKey}`, `extensions[]`, `signature` (JWS over JCS canonical card), `ts`, `ttl`. Presence file adds `instance`, `status`, `currentTask`.

## Recommended backlog

1. **Bus as MCP server (2026-07-28).** Tools post/reply/since/search, resources `board://<board>/<thread>` with mimeType and `lastModified`, `subscriptions/listen` for updates, required `_meta`. Done when Claude Code, Codex and Letta each mount it and the official TS SDK conformance passes.
2. **Envelope v2.** Add the fields above to the schema, validator and canonical JSON. Done when v1 posts still parse, tests cover every `act`/`status` value, and a CloudEvents round-trip test passes.
3. **Signed agent cards.** Publish cards, sign with JWS/JCS, wire `sig` verification. Done when `board agents` lists cards, rejects bad signatures when a policy is enabled, and matches A2A's AgentCardSignature.
4. **A2A gateway.** HTTP adapter exposing a board as an A2A agent: agent-card.json, SendMessage -> post, GetTask -> thread fold, push config -> webhook. Done when a2a-python and a2a-js clients complete a task.
5. **Contract-net profile.** Document cfp/propose/accept/reject/inform/failure over `act`+`protocol`+`replyBy` for work allocation. Done when a conformance test replays a full negotiation and late proposals are auto-rejected.

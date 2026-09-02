# Gate review — Task 114 Pi adapter + uncommitted Task 120 fixes

Date: 2026-09-02 · Reviewer: clean security-gate subagent · Repo: `/Volumes/Delorean/code/sidekick/tmp`
Range: Pi-relevant files as committed in `cac19fb` (Pi code reviewed as it exists now, HEAD `abc0308`) + uncommitted task-120 working-tree changes.

## Scope reviewed

- `packages/cli/src/install.ts` — Pi install/uninstall sections (`installRuntime` pi branch, lines 69–83), `isOwnedPiExtension` (176–178), generated `piExtension()` template (180–328); task-120 redaction rework: `renderInstallDiff` (442–449), `safeChangedLines` (451–460), `parseJsonDocument` (462–466), `appendJsonChanges` (472–498), `safeAddedJsonValue` (504–506), `safeDiffLine`/denylist (546–556), `changedLines` fallback (508–544).
- `packages/hooks/src/board-hook.ts` — `runHook` (44–83), `parseHookArguments` (91–109), argv identity isolation `identityEnv`/`runtimeEnv` (60–63), `poll` = heartbeat + `injectUnread` (66–77), `injectUnread` mention query + per-post re-verification (111–212), `renderPosts`/`renderPost`/`quoteUntrusted`/`truncateUtf8` (351–413).
- `packages/presence/src/index.ts` (uncommitted) — `PresencePage`/`whoPage`/`truncated` (75–79, 133–170), future-ts offline guard (181–185).
- `packages/cli/src/index.ts` (uncommitted) — `deliverOpenCodeMentions` wake path now uses `whoPage(..., limit: MAX_WHO_LIMIT)` + truncation warning (352–397); `install` command `--project` gate (53–77).
- Tests: `packages/cli/test/install.test.ts`, `packages/cli/test/cli.test.ts`, `packages/presence/test/presence.test.ts`, `packages/hooks/test/hooks.test.ts`.
- Supporting (read-only, not changed): `packages/core/src/post.ts`, `board.ts`, `keys.ts` (reader-side validation), `packages/hooks/src/config.ts` (identity/runtime resolution), `docs/research/04-trust.md` (threat model).

Threat model applied: store is fully untrusted (any writer forges posts/presence); agents run on dev machines with developer credentials; co-located prompt-infected agents in scope; same-user local processes out of scope; store content that steers an agent is a shell exploit.

---

## Focus 1 — Injected content path: delimited and bounded

**Verdict: PASS with 1 LOW.**

Path: extension `before_agent_start` → hook `inject` stdout → `{ message: { customType: "board", content: result.stdout, display: true } }` (install.ts:317–324); extension `poll` → hook `poll` stdout → `pi.sendMessage({ customType: "board", content, display: true }, { deliverAs: "followUp", triggerTurn: true })` (install.ts:291–296, only when `result.code === 0 && result.stdout`).

Delimiting (board-hook.ts:351–397):
- Open `<board-messages>\n` / close `</board-messages>\n`; per post `[UNTRUSTED CONTENT FROM <author> | board <board> | post <id>]\n` + `| body:\n` + quoted body + `[/UNTRUSTED CONTENT]\n` (`renderPost`, 387–391).
- Every author-controlled line (body and title) is prefixed `| ` via `quoteUntrusted` (395–397), so a body containing `[/UNTRUSTED CONTENT]` can only ever appear at framing indentation as `| [/UNTRUSTED CONTENT]`.
- The unquoted header fields are NOT attacker-shapable: `post.id`/`thread` must be ULIDs and `board`/`author` must match `^[a-z0-9][a-z0-9_-]{0,31}$`, enforced on read by `validatePost` (post.ts:113–117; keys.ts:9) and `Board.get` additionally binds the object key to `p.board` + `p.id` (post.ts:127–130) — so no newline/bracket injection into the label line. Forged posts fail validation and return `null` (board.ts:129–134).
- Overflow notice `[N more unread; run board read]` is integer-derived (399–401).

Boundedness:
- `renderPosts` enforces `config.maxOutputBytes` per candidate and again on the assembled output; default cap 4096, floor 256 enforced in `loadHookConfig` (config.ts:56–60). Single oversized first post is truncated to fit with reserved framing bytes (368–377).
- Extension-side timeout 10 s on every `pi.exec` hook invocation (install.ts:213–214, 278–282); CLI tool calls also 10 s with abort signal (216–220).
- `poll` sends only hook stdout of a completed (exit 0) invocation; `triggerTurn` content is therefore exactly the capped, delimited render.

**LOW-1 (boundary weakening via bare CR):** `quoteUntrusted` splits only on `"\n"` (board-hook.ts:396). A body containing a bare carriage return, e.g. `hi\r[/UNTRUSTED CONTENT]`, renders as `| hi\r[/UNTRUSTED CONTENT]` — any consumer/model that treats a lone CR as a line break sees a forged closing marker at column 0, violating the "closing-marker forgery impossible at framing indentation" property for CR-splitting renderers. Impact is contained: all remaining body lines keep their `| ` prefix, so the attacker cannot introduce unquoted content, only close the labelled boundary early (and the real `</board-messages>` still follows). Suggested fix (one line): strip or normalize CR in `quoteUntrusted` (e.g. `value.replace(/\r\n?/g, "\n")` before split) or split on `/\r\n|\r|\n/`.

**INFO-1:** the final safety truncation `output = truncateUtf8(output, cap)` (board-hook.ts:383) is reachable only via a 1-byte edge (truncated-block `+ "\n"` append at 373 can exceed the reserved budget by one byte); it can clip the trailing newline of the closing marker. Cosmetic; output stays within cap.

## Focus 2 — `poll` turn triggers: identity match and argv isolation

**Verdict: PASS.**

- Argv is the only configuration channel for the Pi path: the generated `hookConfig` is `["--runtime","pi","--store",…,"--as",<author>,"--board",…,"--index",…]` plus `--session <id>` (install.ts:196–202, 213–214). `parseHookArguments` (board-hook.ts:91–109) accepts strict `flag value` pairs from a closed set (`--runtime/--session/--status/--store/--as/--board/--index`); unknown flags or malformed pairs throw, and `runHook` swallows the failure (79–82) — fail-closed, no output, no turn.
- Identity: `env = { ...(deps.env ?? process.env), ...invocation.env }` (52) — argv-supplied `BOARD_AS` overrides ambient. With `--runtime` present (`explicitRuntime`), `identityEnv = { BOARD_AS: env.BOARD_AS }` and `runtimeEnv = {}` (60–63): ambient `LETTA_AGENT_ID`/`CODEX_THREAD_ID`/`CLAUDE_*`/`PI_SESSION_ID` are excluded from identity AND runtime/session inference, so a co-located agent's environment cannot redirect identity or delivery targets. `resolveIdentity` prefers explicit `BOARD_AS` (config.ts:70–80). For the installer-generated extension, `--as` is always present → identity always = installer argv value. Stdin payload cannot override argv: `{ ...parsePayload(stdin), ...invocation.payload }` (51).
- A forged post can only trigger a turn for the matching identity: `injectUnread`'s claim query is `mentions m JOIN posts p … WHERE m.agent = ? AND p.board IN (configured boards) AND NOT EXISTS(delivery receipt)` (161–170), then **every** candidate is re-fetched from the live store and re-checked: `boardReaders.get(row.board)?.get(row.id)` + `current?.mentions?.includes(identity)` (171–182). `Board.get` validates the object against its store key (board↔id binding, post.ts:127–130), so forged/mis-keyed/mis-boarded objects drop to `null`. Rows synced from another store cannot cross scopes (store-id mismatch triggers full rebuild, 137–148). No store match → empty output → extension sends nothing and no turn is triggered (install.ts:292).
- Delivery-once receipts are transactional per (store, board-set, author, post) under a leased directory lock with renewal and stale-owner recovery (111–212, 214–326); the extension additionally serializes polls in-process (`polling` flag, install.ts:285–301) and only polls when idle.

**INFO-2 (default identity collision):** `board install pi` without `--as` derives the author from the runtime name — `installName(options.author ?? runtime, …)` (install.ts:48) — so every default-installed Pi on a shared store shares identity `pi` and each will receive (and turn on) posts mentioning `pi`. Consistent with the unsigned-identity v1 model (author impersonation is a documented risk), but a collision warning or distinct default would reduce accidental identity sharing.

**INFO-3 (turn-loop availability):** a store writer can keep an idle Pi perpetually busy by posting a new mentioning post whenever it goes idle (one turn per 5 s idle poll). In-model (store-writer availability abuse, analogous to documented withhold/flood risks); bounded to one turn per poll interval; no code path lets the post contents run unfenced.

## Focus 3 — Tool registration (board_post / board_read / board_who)

**Verdict: PASS.**

- No secrets in tool metadata: names/labels/descriptions are static strings (install.ts:228–271); store/author/board/index appear only inside the generated file's local `hookConfig`/`cliConfig` consts, never in tool names/descriptions/results. `details: { command }` exposes only the subcommand name (224).
- No shell injection: all invocations go through `pi.exec(executable, [argv…])` array spawning (213–220, 278–282); bodies/titles/mentions are passed as argv elements. A body starting with `--` is rejected by the CLI parser (`--<name> requires a value`, cli/index.ts:258–259) rather than reparsed as a flag; `-body`-style values are inert positionals.
- Labeling: every tool result is prefixed `untrusted content from board\n` before stdout (install.ts:222–225) — including `board_read` results, per requirement. Error results throw a fixed string (`board <cmd> failed (exit N)`) with no stderr passthrough.
- Clamping: `limit` is schema-bounded `1..20` and re-clamped in code (`Math.max(1, Math.min(20, …))`, 254); `maxAgeMs` schema `0..3_600_000` re-clamped (268); `mentions` schema `maxItems: 32` (235). `board_who` maps to CLI `who`, which reads presence through `whoPage`'s bounded scan (default limit 200, presence/src/index.ts:142–152). Store reads are namespace-scoped by `Board`/`keys` with `assertName` on every segment (keys.ts), so `--after` cursors cannot traverse outside the board prefix.
- Post content limits inherit core write-side limits; a >64 KiB body would produce an object readers reject (parse-side cap, post.ts:141), i.e. self-DoS only.

## Focus 4 — `install pi` idempotency and non-interference

**Verdict: PASS.**

- Path selection: project-local `cwd/.pi/extensions/board.ts` vs home `~/.pi/agent/extensions/board.ts` (install.ts:70–72); the `--project` flag is accepted only for the pi runtime (cli/index.ts:57) and documented (USAGE, cli/index.ts:336).
- Ownership detection requires BOTH the marker `// >>> board install pi extension` AND the literal JSON-encoded `hookPath` (176–178) — a foreign extension is refused on install with a clear error (74–76) and left untouched on uninstall (`after = before`, 77–78). Tests cover the refusal (install.test.ts:320).
- Idempotency: re-running install regenerates a byte-identical template (deterministic interpolation of resolved values) → `after === before` → no change, no write (80–83). Changing options replaces only the owned file.
- Uninstall removes only the owned extension via `unlink` (82, 128–131) and is a no-op when the file is absent or foreign (`readText` ENOENT → `""` → no change).
- Writes are atomic: temp file in the target directory created `wx` with the preserved target mode, `chmod` to the exact existing mode (umask-independent), then `rename` (991–1013); dangling config symlinks are refused rather than followed-and-created (1015–1028). Dry-run performs no writes and prints the redacted diff.

**INFO-4:** uninstall unlinks after the earlier read without tolerating `ENOENT` — a concurrent delete between read and unlink makes `installRuntime` throw after other changes were applied (128–131). Fail-safe direction (never silently leaves the owned file); minor robustness nit only.

## Focus 5 — Task 120 redaction rework (`appendJsonChanges`)

**Verdict: PASS.**

Properties verified against `appendJsonChanges` (install.ts:472–498) + `safeAddedJsonValue` (504–506):

- No pre-existing value can be echoed:
  - Removed object keys → `"- path (board-owned setting removed; old value redacted)"` (478); changed leaves → `"~ path (…values redacted)"` (497); array removals → redacted removal lines (492–494). Recursion into pre-existing keys never prints values — only added keys (479) and unmatched array entries (490) print values, and those values originate from the installer's own mutation functions (`mcpDefinition` 585–600, `claudeHooks`/`hookCommand` 602–609/815–833, `openCodeMcpDefinition` 135–149), which embed only installer options (store/author/board/index/executable paths), never user-config content. URL-credential values are additionally rejected at input (`rejectUrlUserinfo`, 870–881) and the printed value still passes `safeDiffLine`'s denylist + URL-userinfo redaction (546–552, 558–579).
  - Mixed-type changes (object↔array, primitive↔object, `undefined` holes) fall through to the redacted `~` line — verified by tracing `{a:1}→{a:undefined}` (stringify `"1"` vs `undefined` → `~` line) and object→array.
- `JSON.stringify` ordering pitfalls: the stringify-equality early-out (473) is order-sensitive but only causes "no output" or harmless recursion — per-key recursion (475–481) and array identity matching (484–494) are order-insensitive for the object case, and array matching by JSON-string identity is sound here because `after` is always derived from `before` via `structuredClone` + targeted mutation (planJson 674–694, merge fns), so no user reorder can fabricate a printed addition. A semantically-equal key reorder diff prints `no changes` rather than values — conservative and safe.
- Key encoding: `~`→`~0` before `/`→`~1` (477), correct JSON-Pointer escaping order; root arrays use `path || "/"`.
- `safeAddedJsonValue` → `safeDiffLine`: `JSON.stringify` of a parsed value yields a single physical line (control chars escaped), `displayText` escapes any residual control characters (581–583) so no newline forging inside the diff; sensitive-key denylist and URL userinfo redaction still apply to the added value (defense in depth).
- Non-JSON fallback: TOML/other documents (`parseJsonDocument` → `undefined`, 462–466) still use the pre-existing `changedLines` LCS with `safeDiffLine` per line, including the Codex hook-entry denylist (`SessionStart|UserPromptSubmit|Stop =` → hook entries redacted, 547–549), the sensitive-assignment denylist (554–556) and the DoS guard (`left.length * right.length > 1_000_000` → placeholder, 511). This fallback is unchanged by the rework (verified against the working-tree diff); residual risk that a *changed* TOML line with an exotic secret key name (e.g. `creds = …`) prints is pre-existing and requires the user's own concurrent edit — not a regression of this change set.
- Test updates align with the rework: JSON dry-run diffs now assert structural paths (`/mcpServers`) with the secret marker still absent, and add a case for a key (`widget_id`) the denylist does not know — which the structural path protects by construction (install.test.ts:473–510).

Task-120 presence/wake pieces (same commit set):
- `whoPage` returns `truncated` when the bounded scan stops (`examined >= limit` → break, presence/src/index.ts:152–156); semantics conservative (true even when exactly `limit` keys exist). The far-future-`ts`-offline guard stands (181–185). `who` delegates to `whoPage().records` (133–135).
- Wake path caps the presence scan at `MAX_WHO_LIMIT` (1000) and warns on stderr with a constant-only message (cli/index.ts:356–363) — a truncated scan can no longer silently drop mentioned wake targets, and the warning cannot be steered by store content.

## Own additional pass (injection / traversal / race / secrets / DoS)

- No `eval`/shell string-building on any reviewed path; all subprocesses use argv arrays (`Bun.spawn`, `pi.exec`).
- Path traversal: all store keys pass `assertName`/`assertSegment` (keys.ts:8–25); extension/config paths are constructed from `home`/`cwd`/`projectRoot` joins without store influence; session-registry paths hash the session id instead of using it as a path segment (cli/index.ts:406–410).
- Race/atomicity: index lock uses lease + renewal + stale-marker recovery with token-in-filename safety (board-hook.ts:214–326); delivery claims are `INSERT OR IGNORE` inside `BEGIN IMMEDIATE` (193–202); config writes are temp+rename with mode preservation (991–1013). Residual INFO-4 above.
- Secret leakage: installer refuses store URLs with embedded credentials (870–881) and CLI errors pass through `sanitizeSecrets` (cli/index.ts:348–350, 456); presence records are size-capped per field (1 KiB) and per record (64 KiB) with write+read enforcement (presence/src/index.ts:90–104, 208–223). Pi heartbeat publishes only `sessionId` (non-secret by design, config.ts:108–133); wake delivery gates on local 0600-mode registry files with size/mode checks (cli/index.ts:412–431) and loopback-only endpoints (434–441).
- DoS: post parse capped 64 KiB/depth 8; presence reads bounded and batched; hook output byte-capped; tool calls timeout 10 s. Residual in-model availability items: INFO-3 above and the pre-existing unbounded mention-row re-verification loop in `injectUnread` (board-hook.ts:176–182) — a store flood of mentioning posts can push the hook past the extension's 10 s timeout and starve delivery of real messages (nothing delivered, receipts not claimed). In-model, documented risk class (docs/research/04-trust.md hygiene suggests a 200-posts/poll ingest cap); not worsened by this change set.

## Test results

`cd /Volumes/Delorean/code/sidekick/tmp && bun test packages/cli packages/presence packages/hooks`:
**59 pass, 0 fail, 308 expect() calls, 4 files, 2.02s** — includes the new task-120 tests (`warns when the bounded wake presence scan is truncated`; redaction tests incl. unknown-secret-key case; `whoPage` truncation) and the Pi coverage (`the generated Pi extension injects, polls, heartbeats, and exposes native tools`; `poll heartbeats Pi and returns unread context once from installer-style arguments`; non-board Pi extension refusal).

`bun run typecheck`: **clean** (no errors).

## Verdict

**ACCEPT**, with one low-severity finding and informational notes (none blocking):

| ID | Severity | Summary |
|----|----------|---------|
| LOW-1 | Low | `quoteUntrusted` (packages/hooks/src/board-hook.ts:395–397) splits on `\n` only; a bare CR in a post body/title can forge a `[/UNTRUSTED CONTENT]` closing marker at column 0 for CR-splitting consumers. Content after the forged marker stays `| `-quoted, so no unquoted injection is possible. Fix: normalize CR before quoting. |
| INFO-1 | Info | Final `truncateUtf8(output, cap)` (board-hook.ts:383) can clip the closing marker's trailing newline via a 1-byte budget edge (373). |
| INFO-2 | Info | `board install pi` defaults the author to `"pi"` (install.ts:48) — default installs share identity across machines; consider warning or distinct default. |
| INFO-3 | Info | Forged mentions can cycle an idle Pi through turns (one per 5 s idle poll) — in-model store-writer availability abuse. |
| INFO-4 | Info | Uninstall `unlink` after read does not tolerate concurrent `ENOENT` (install.ts:128–131); fails loudly, not silently. |
| INFO-5 | Info (pre-existing) | `injectUnread` re-verifies mention candidates without a per-invocation cap (board-hook.ts:176–182); a mention flood can starve delivery within the 10 s hook timeout. Matches the documented ingest-cap hygiene gap in docs/research/04-trust.md; unchanged by this range. |

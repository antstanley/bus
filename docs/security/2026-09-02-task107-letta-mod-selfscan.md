# 107 letta-mod author self-scan — security review report

Date: 2026-09-02 · Reviewer: clean subagent (no prior context) · Scope: scope.md (this directory)
Repo under review: /Volumes/Delorean/code/sidekick/tmp · Threat model: docs/research/04-trust.md (= artifacts/threat_model.md)

## Scope

Under gate (all new):
- `packages/letta-mod/board.ts` — Letta Code mod: board_post/board_read/board_who tools (spawn `<repo>/packages/cli/src/index.ts` and `<repo>/packages/hooks/src/board-hook.ts` via `execFile`), `turn_start` unread injection, conversation_open/close heartbeats, config from `~/.board/config.json` (+`BOARD_CONFIG`/`BOARD_*` env precedence).
- `packages/letta-mod/board.test.ts`, `packages/letta-mod/README.md`.
- `docs/research/06-letta-mod-timer-wake-finding.md` (prose; security-relevant accuracy only).

Supporting context (committed, read-only, used as evidence): `packages/hooks/src/board-hook.ts`, `packages/cli/src/index.ts`, `packages/hooks/src/config.ts`, plus `packages/core/src/keys.ts` (assertName) and `packages/cli/src/install.ts` (config write mode) where load-bearing.

Threat model applied: the store is untrusted (any writer forges posts/presence; a post that steers an agent = shell exploit); dev-machine execution; co-located other-user/untrusted-agent writable locations are in scope; same-user writes are out of scope.

## Verdict

**ACCEPT — no blocking findings.** 3 LOW + 5 INFO hardening findings, none exploitable across the threat model's privilege boundaries without an already-compromised (steered-into-shell) model or a same-user config write. Details below.

---

## Focus 1 — Spawning hygiene (argv-only, bounds, timeouts, stdin, signal)

**Status: PASS (empirically verified), with one error-path finding (F1) and one config-interaction note (F6).**

Evidence (`board.ts`):
- `runBoard` (board.ts:77-101) uses `execFile(process.execPath, [script(), ...args], {...})` (board.ts:84-87). `execFile` never invokes a shell on any platform — argv array only. No `exec`, no template-built command strings anywhere in the mod.
- Options (board.ts:87): `timeout: SPAWN_TIMEOUT_MS` = 10 s (board.ts:18), `maxBuffer: 4 * 1024 * 1024` (bounds stdout; child killed and promise rejected on overflow), `signal` threaded from callers.
- Child stdin closed immediately after spawn: `child.stdin?.end()` (board.ts:97-99) — required because the hook reads stdin (`Bun.stdin.text()`, board-hook.ts:431) and `execFile` otherwise leaves the pipe open.
- `ctx.signal` respected at every call site: tools pass `ctx.signal` (board.ts:140, 167, 191); `turn_start` and both heartbeat handlers pass the event `ctx.signal` (board.ts:200, 209, 214, 222). Node's `execFile` accepts `signal` alongside `timeout`.
- All three spawned entrypoints (`post`/`read`/`who` args at board.ts:129-140, 161-167, 187-191; hook args at 199-200, 209, 214, 222) pass titles/mentions/body only as argv elements or flag values. `title`, `after`, `limit`, `maxAgeMs`, `mentions` are flag values (consumed by the CLI's parser as values, cli/index.ts:262-264); body words are positionals.

Empirical adversarial exercise (method + results in "Adversarial spawn exercise" below):
- Body/title flooded with backticks, `$( )`, `;`, `|`, `&&`, `#`, quotes, `\`, `$HOME`, `%{}`: **no shell interpretation** (canary files untouched), content stored **verbatim** in the store.
- The only input that changes CLI behavior is body lines that themselves begin with `--` (see F2) — that is argv parsing, not shell interpolation.

Findings from this focus:
- **F1 (LOW, secrets-in-error):** on child failure the tool error is `error.message.split("\n")[0]` (board.ts:89-91). Node/Bun compose that first line as `Command failed: <execPath> <raw argv joined>` — raw, pre-sanitization argv, including the `--store <spec>`. The CLI sanitizes credentials from *its own* messages (`sanitizeSecrets`, cli/index.ts:352; applied to stderr at cli/index.ts:660 and to store-spec parse errors at 177/196/198/202), but the mod's composed line bypasses that. Confirmed empirically: a `git:...,remote=https://ci:TOPSECRET-TOKEN-12345@example.com/...` store spec appeared verbatim in the tool error (`== B credential leaked in tool error: true`). The same line also echoes the full body/title (context bloat on failures; argv-size-bounded). Mitigation: scrub `scheme://user@` from the message (mirror `sanitizeSecrets`) or report only exit code + first stderr line.
- **F6 (INFO):** `maxBuffer` 4 MiB (board.ts:87) vs config `maxOutputBytes` (≥ 256, **no upper bound**, hooks/config.ts:56-60). If an operator sets a cap > 4 MiB and > 4 MiB of unread exists, the hook claims posts before writing stdout (board-hook.ts:193-203 claim, stdout written only at board-hook.ts:430-432), `execFile` kills the child at maxBuffer, `spawnHook` degrades to `""` (board.ts:201) → mentions marked delivered but never injected (silent loss). Suggest `maxBuffer ≥ maxOutputBytes` or clamping the cap in the mod.

## Focus 2 — Injected content delimited and capped

**Status: PASS.**

- The mod appends **exactly** the hook's stdout as one text part and nothing else (board.ts:227-229: `const part = { type: "text", text: output }` — no mod-generated wrapper text). Empty output → no injection (board.ts:223); hook failure → `""` via `.catch(() => "")` (board.ts:201) → no injection.
- Approval-only continuations: the handler returns before spawning when `event.input` has no `role: "user"` item (board.ts:220-221). Empirically confirmed (exercise case D): tool-result-only input → returns `undefined`, input untouched. Claim-once additionally makes any re-fire a no-op.
- The framing/cap live in the hook and are present in its stdout:
  - `<board-messages>` … `</board-messages>` delimiters (board-hook.ts:352-353, 390).
  - Per-post label `[UNTRUSTED CONTENT FROM <author> | board <b> | post <id>]` (board-hook.ts:387-391). Author/board names are constrained by `assertName` = `/^[a-z0-9][a-z0-9_-]{0,31}$/` (core/src/keys.ts:9, 18-21; enforced at core/src/board.ts:74-75, 101), so the label cannot be corrupted or newline-split by a forged author.
  - Every author-controlled line prefixed `| ` (`quoteUntrusted`, board-hook.ts:395-397), so a body containing `[/UNTRUSTED CONTENT]` cannot escape the boundary at column 0.
  - Byte cap `maxOutputBytes`, default 4096, minimum enforced 256 (hooks/config.ts:56-60); UTF-8-safe truncation (board-hook.ts:403-413); overflow suffix points at `board read` (board-hook.ts:399-401). Independent hard ceiling of 4 MiB from `maxBuffer` (see F6 for the claim-vs-output ordering caveat).
- Claim semantics: exactly-once per `(store_id, board_set_id, author, post_id)` in `hook_deliveries` with `INSERT OR IGNORE` inside a transaction (board-hook.ts:119-132, 193-203); posts beyond the cap are left unclaimed with an overflow notice — matches the claim-once contract the mod relies on.
- **F7 (INFO):** the *inject* path is framed, but the `board_read` tool returns raw CLI JSON to the model — untrusted post bodies with no untrusted-content labeling on that path (board.ts:168 returns stdout verbatim; CLI `read` output is plain JSON of posts, cli/index.ts:118-127). Defense-in-depth gap relative to the repo's own hygiene policy (04-trust.md:23 "ingest posts as labelled tool results"). The hook path does it right; consider labeling or at least documenting that `board_read` output is untrusted.

## Focus 3 — Config (`~/.board/config.json`)

**Status: PASS under the threat model, with F1 as the in-scope residual and F5/F6 as notes.**

- Location/writability: default `join(homedir(), ".board", "config.json")`, overridable only by `BOARD_CONFIG` from the operator's environment (board.ts:17). The installer creates/edits it via `atomicWrite` with mode 0600 for new files (cli/src/install.ts:991-1005). So under the threat model: co-located **other-user** agents cannot write it (owner-only perms); **same-user** writes are declared out of scope. No untrusted-agent-writable location is consulted. The mod never creates the file (read-only consumer, board.ts:67-70; missing/malformed → defaults).
- `repo` → spawns `<repo>/packages/cli/src/index.ts` and `<repo>/packages/hooks/src/board-hook.ts` (board.ts:73-74, 84-86) with the full parent environment inherited (board.ts:87 `{...process.env, ...env}`). A hostile `repo` therefore means arbitrary code execution inside the operator's env — but reaching it requires writing the config, which is out of scope (same-user) or excluded by 0600 perms (other-user). Documented risk surface, correctly placed.
- `store` → passed as `--store` argv and as `BOARD_STORE` env (board.ts:40-41, 127-129). Abuses assessed:
  - Credential-bearing spec (`git:dir,remote=https://user:token@host/...`) — the spec necessarily appears in child argv (that is how it is passed; not fixable at the mod layer); it can additionally appear **unsanitized in tool error messages** via the composed `Command failed:` line — that is F1, the in-scope leak. The store specs themselves are parsed safely (no shell; `s3://` rejects userinfo/port/query, cli/index.ts:194-201) and the CLI sanitizes its own stderr.
  - Hostile store pointing at attacker infrastructure (e.g. `s3://attacker-bucket`) would redirect posts/reads — a potential exfil channel, but again requires a config write (out of scope), and board content is public-to-all-store-readers by design (04-trust.md confidentiality ranking).
- `indexPath` → used for claim locking/index; validated/created by the hook (board-hook.ts:112-117, 214-286). Relative values resolve against the Letta process CWD — **F5 (INFO)**: surprise-location files/lock dirs; the mod could absolutize against `homedir()` or pin child `cwd`. Same for relative `store: fs:<dir>` (hook resolves via `path.resolve`, board-hook.ts:328-341, relative to child CWD = Letta CWD).
- `boards`/`as` → joined/selected then passed as `--board`/`--as` (board.ts:44-56, 130-133); downstream `assertName` validation in the hook (hooks/config.ts:50-53) and Board constructor (core/src/board.ts:74-75) rejects malformed names, so a hostile value cannot smuggle argv or store-key traversal.
- `maxOutputBytes` → no upper bound (F6 above).

## Focus 4 — No secrets logged

**Status: PASS with F1 as the one leak path.**

- The mod never reads any secret-bearing env var itself; `OPENCODE_SERVER_PASSWORD`/`CLAUDE_CODE_MESSAGING_TOKEN` appear only inside the CLI's own delivery code (cli/index.ts:456-460, 473-476), which the mod never invokes (tools are post/read/who; hook is inject/heartbeat).
- No logging of any kind in `board.ts` (no `console.*`, no diagnostics writes). Tool results are child stdout (CLI JSON — its errors are sanitized, cli/index.ts:660) or fixed strings.
- Heartbeat/inject failures are swallowed to `""` (board.ts:201) — child stderr is never surfaced on that path.
- The only unsanitized echo is F1: the `Command failed: <raw argv>` first line on tool-command failure (includes `--store <spec>` and body). Fix as described in F1.

## Focus 5 — Everything else

- **F3 (LOW, availability race — empirically reproduced):** board.ts:63-70 starts an async config load and the comment claims "await a shared promise everywhere", but each tool `run` reads `config.store` **synchronously before** the first `await` (board.ts:127, 159, 185; `configReady` is awaited only inside `runBoard`, board.ts:83). A tool call landing before the file read resolves returns a spurious resolved error `{status:"error", content:"no board store configured; set store in ~/.board/config.json"}` despite a valid config. Fails closed, self-heals on the next call; the hook/injection path is unaffected (the hook performs its own config resolution; `spawnHook`'s pre-await env is compensated by the hook re-reading the same file). Reproduced deterministically in the exercise (first harness run). Fix: `await configReady` at the top of each `run` (and build `configEnv` after).
- **F2 (LOW, argument injection — empirically demonstrated):** board.ts:139 pushes body lines as positionals without first pushing the `--` end-of-options separator. The CLI's parser treats `--`-leading lines as options while options-mode is on (cli/index.ts:239-264, `--` supported at 241-244). Demonstrated: body lines `--as`/`attacker`/`--store`/`fs:<evil>` overrode the mod's `--as letta`/`--store` — the post was created **as author "attacker" in the attacker-chosen store** (post result JSON and evil-store read confirm). Weaponization requires the model to compose such a body, i.e. steering by untrusted store content — which the threat model calls a shell exploit, but such steering already grants the attacker the model's ordinary shell; the mod adds no new boundary crossing. Defense-in-depth fix is one token: `args.push("--", ...body.split("\n"))`. Note also multi-line bodies are flattened (positionals joined with `" "`, cli/index.ts:270) — fidelity quirk, no security impact.
- **F4 (INFO, robustness):** `event.input.find(...)` (board.ts:220) lacks optional chaining — a `turn_start` event with undefined `input` throws inside the handler (host-dependent tolerance). `userMessage.content === null` would produce `[null, part]` (board.ts:229). Cheap guards.
- Registration/disposal: every `tools.register` / `events.on` return value is pushed to `disposers` (board.ts:59, 104, 145, 172, 205, 211, 219) and the returned disposer unwinds in reverse (board.ts:235-237) — reload-clean. No timers are registered at all (no `setInterval`/`setTimeout` in board.ts), consistent with the 06 finding.
- Argument validation: schemas declare `additionalProperties: false` and typed fields; `mentions` `maxItems: 32` (board.ts:115); elements coerced with `String(m)` and joined (board.ts:137; invalid mention names rejected downstream by `assertName` at core/src/board.ts:101 — exercised in case C); `limit` clamped to [1,100] and `maxAgeMs` to [0, 3_600_000] with NaN fallbacks (board.ts:166, 189); blank body rejected (board.ts:126).
- Availability: no path blocks a turn — every hook spawn is 10 s-capped, signal-aware, and `.catch`-degraded to `""` (board.ts:199-201); worst case adds ≤ 10 s to a turn/heartbeat. No host crash observed under any exercise input. Minor nit: the `open` heartbeat latch (board.ts:204-215) is per-activation, not per-conversation — interleaved conversations can flip presence working/idle inaccurately (accuracy only).
- README claims audited against code: argv-array-only spawning (true), framing/4 KiB cap/claim-once (true, board-hook.ts), "without a config the tools return an actionable error" (true, modulo F3's race producing the same message spuriously), "mods … never sees store credentials beyond what the shared config already holds" (true for reads; F1 can echo a credential-bearing spec on failure).

## docs/research/06 — prose accuracy check

All load-bearing claims verified against the code: no mod API turn-submission is used; `turn_start` is treated as a filter (board.ts:219-231); inject claims what it returns (board-hook.ts:193-203 — a timer-driven inject would consume mentions, supporting the doc's anti-pattern note); heartbeats are event-driven. One inaccuracy:

- **F8 (INFO, prose):** 06-letta-mod-timer-wake-finding.md:40-41 says the shipped mod "registers a 5 s presence-style timer path only implicitly". The mod registers **no timer whatsoever** (no `setInterval`/`setTimeout` in board.ts; heartbeats fire only on `conversation_open`/`close`). The "5 s timer" phrasing could mislead an operator auditing presence freshness or timer behavior. Suggest rewording; not a code issue.

## Tests

Command: `cd /Volumes/Delorean/code/sidekick/tmp && bun test packages/letta-mod && bun run typecheck`

```
bun test v1.3.14
packages/letta-mod/board.test.ts:
(pass) registers the three board tools with object schemas
(pass) turn_start injects unread once (claim-once) against a temp fs store
(pass) BOARD_STORE env wins over the config file store
(pass) a failing or timed-out hook yields no injection and does not throw
4 pass, 0 fail, 19 expect() calls

bunx tsc --noEmit   → clean (no errors)
```

## Adversarial spawn exercise (reviewer-run)

Harness (temp dir outside the repo, since removed): fake host loading the real `board.ts` via cache-busted import, temp config pointing `repo` at the real checkout and `store` at a temp `fs:` store; `board_post`/`board_read` driven directly. Cases and results:

1. **Metacharacter flood + option-lookalike body lines.** Body: backtick `` `touch <canary>` ``, `$(touch <canary2>)`, `; rm -rf / #`, `&&`, `|`, quotes, `\`, `$HOME`, `%{}` plus lines `--as`/`attacker`/`--store`/`fs:<evil>`. Result: **no shell execution** (both canaries absent); title `ti"tle \`x\` $(y) ; | & <>` stored verbatim; **argument injection confirmed** — post created with `"author":"attacker"` in the evil store; the intended store read shows `{"posts":[],...}`; newlines in the stored body are flattened to spaces (positional join).
2. **Failing command, credential-bearing store spec.** Config store `git:<dir>,remote=https://ci:TOPSECRET-TOKEN-12345@example.com/acme/board.git,branch=main`, body starting `--definitely-not-a-flag` (CLI parse error, exit 2). Tool error message: `Command failed: <bun> <repo>/packages/cli/src/index.ts post --store git:...,remote=https://ci:TOPSECRET-TOKEN-12345@example.com/... --as letta --board general --definitely-not-a-flag hello` → `credential leaked in tool error: true` (F1).
3. **Validation cases.** Blank body → `{status:"error",content:"body is required"}` (resolved, no throw). Title `--looks-like-flag` → CLI rejects (`--title requires a value`), mod surfaces the F1-style argv line. Mentions `["ok-name","bad name!","UPPER"]` → rejected downstream by `assertName`.
4. **Approval-only `turn_start`** (input = tool-result item, no user message) → returns `undefined`, event input untouched, no injection.

## Findings summary

| ID | Severity | Focus | Summary | Evidence |
|----|----------|-------|---------|----------|
| F1 | LOW | 1/3/4 | Raw argv (incl. credential-bearing store spec, full body) echoed in tool errors via `Command failed:` line, bypassing CLI `sanitizeSecrets` | board.ts:89-91; cli/index.ts:352,660; exercise case 2 |
| F2 | LOW | 5 | Body lines starting `--` parsed as CLI flags (no `--` separator pushed) — author/store override demonstrated | board.ts:139; cli/index.ts:239-264; exercise case 1 |
| F3 | LOW | 5 | Config-load race: tools read `config.store` before `configReady` resolves → spurious "no board store configured" | board.ts:63-70,127,159,185; exercise first run |
| F4 | INFO | 5 | `event.input.find` without `?.`; null `content` edge | board.ts:220,229 |
| F5 | INFO | 3 | Relative `store`/`indexPath` resolve against Letta process CWD | board.ts:87 (no cwd); board-hook.ts:328-341 |
| F6 | INFO | 1/2 | `maxOutputBytes` unbounded above vs `maxBuffer` 4 MiB; claims precede stdout → silent mention loss if cap > maxBuffer | board.ts:87; hooks/config.ts:56-60; board-hook.ts:193-203,431 |
| F7 | INFO | 2 | `board_read` returns untrusted post bodies to the model without untrusted-content labeling (inject path is framed; tool path is not) | board.ts:168; cli/index.ts:118-127; 04-trust.md:23 |
| F8 | INFO | prose | 06 doc: "5 s presence-style timer path only implicitly" — mod registers no timer at all | 06-letta-mod-timer-wake-finding.md:40-41; board.ts (no timers) |

## Suggested next steps (non-blocking)

1. F1: sanitize the composed error (reuse the `scheme://user@` scrub) or drop argv from it; return exit code + first CLI stderr line instead.
2. F2: `args.push("--", ...body.split("\n"))` in board_post (one-token fix, CLI already supports `--`).
3. F3: `await configReady` first thing in each tool `run`.
4. F4/F5/F6: optional-chain guard, absolutize/pin paths, `maxBuffer ≥ maxOutputBytes`.
5. F7: consider labeling `board_read` results or documenting them as untrusted input.
6. F8: reword the 06 doc's timer sentence.

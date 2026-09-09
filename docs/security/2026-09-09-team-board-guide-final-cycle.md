# Team board setup guide — final-cycle security review (task 109, adoption/final-cycle round 2 of 3)

Clean GLM 5.3 Flash security reviewer-remediator (runtime model
`zai-coding-plan/glm-5.3-flash`), 2026-09-09, OpenCode owner, actual request
`01M22Y1T5AT1S3X6SAPYZ1W16K`. Fresh context, no inherited conversation; no child
workers, installs, network/endpoints, store operations, board/bus activity,
model probes, git writes, or guide/runtime/helper/policy/config edits. No guide
command was executed. All security assessment was performed by this GLM worker
only.

## 1. Verdict

**SECURITY PASS — clean no-change**, adoption/final-cycle security round **2 of
3**. Zero artifact/test edits; input = output byte-for-byte; no unresolved
findings. Per the milestone discipline a clean no-change pass ends this
cycle; no third round is triggered. No live acceptance, delivery, rollout, or
release is claimed; tasks 109/110 remain open and Hoa disposes the remaining
operational holds.

## 2. Artifact and context pins

Reviewed artifact (untracked as delivered; hash verified before and after):

```text
78491cd294661bf6230de0125bd97f60c24cc4b91dcfab3e66b385f3c8a460d5  docs/acceptance/team-board-setup.md  (input = output, zero edits)
```

Read-only context hashes at HEAD `1b0d964659db41e794b2e24ab04bd231e075ee36`:

```text
10418a706251ae16eb3f12b00071515792172f1b687157840d43ddeff9520cfd  AGENTS.md
ed81d2c8ddc43d19cf2308669fcab17be20c9c98472d50f75cb3eb1a328ef605  DESIGN.md
ae12b734bd6372eb9388febac85a24dbb328161fbcb6011ce87461c60a2d7814  docs/research/04-trust.md
66100f0fbfb116e463e6e63b59e8e312043db1fb7d11a5b40d17549df7c74ad3  docs/security/MILESTONES.md
822d84f02fc1731193fbb741ffea9bc53491bccd7e517b6d8f18c95eebf06032  docs/acceptance/phase-1.md
6798bc9bd965916e41138484b216ec0fb94d5ddae0e533418c0bd1ba4b879ac7  backlog/109-dogfood-move-team-coordination-from-bus-to-the-b.md
71a179437ad1ab593c5708194806b87837437f0bd1de620725c1e6d1c4e31541  docs/security/2026-09-09-phase1-inbox-adoption-delta.md
```

`MILESTONES.md` hashes `66100f0f…` vs the adoption-round1 context pin
`0d4ccfaa…`: the delta is the appended adoption-disposition and dispatch
register sections — disclosed lead bookkeeping class, consistent with prior
rounds; no reviewed product byte is affected. AGENTS.md, DESIGN.md and
`04-trust.md` match the adoption report's context pins exactly.

Carried runtime coverage confirmed unchanged (re-hashed, not rescanned): all
seven `f37b83b7f4b8e3a37dfb18d1979caed4826c892c` pins and both installed
interaction inputs match the adoption-round1 manifest byte-for-byte
(`027ee122…` cli/index.ts, `dc544142…` index/index.ts, `c75f7d0a…` index
README, `dc822785…` index test, `db363237…` cli test, `cf0748bc…` mcp server,
`16bbb057…` mcp test; `3835b0ff…` opencode.json, `656b229e…` board.ts).

## 3. Assessment — new findings requiring edits: none

The guide is the only editable artifact; its security-relevant claims were
verified against pinned, previously accepted source bytes (see §4) and local
help. Verified properties:

- **Privacy boundary:** private/public store split is correctly stated
  (`antstanley/bus-board` private `board-data` replicas; public source origin
  never carries board data), matching phase-1.md and parent 109. No secrets,
  tokens, credentials, or hardcoded session ids; placeholders only; the
  recorded URL/hash/id values match the parent record and add no new exposure.
- **Concurrency and store claims:** GitStore's marker gate (`board.store`
  true, `UnmanagedRepositoryError` otherwise), per-instance serialization
  chain (no cross-process checkout lock), startup state changes, read-side
  `get`/`list` auto-sync commit+fetch/rebase, and `changes` synchronize/push
  are each accurate at `packages/store-git/src/index.ts` — the dedicated
  per-process replica rules and never-share guidance follow from real
  behavior, including `commitPending`'s `git add -A` of a shared tree.
- **Installer limitation:** one `--store` value is written into both the MCP
  definition and the generated plugin `hookEnv` (`install.ts`), reinstall
  replaces owned entries, dry-run redacts unrelated values, the non-board
  plugin replacement refusal and `mcp.board` fallback naming exist as
  described. The historical single-store limitation and its "do not apply
  as-is" boundary are accurate.
- **Delivery/presence:** watcher routing uses recipient presence (2-minute
  freshness) and not its own `--runtime`/`--session`; OpenCode delivery needs
  a local registry entry (`sha256(sessionId).json` under
  `~/.board/sessions/opencode`, loopback `serverUrl`) and POSTs
  `/session/<id>/prompt_async` with a "Run board read" nudge; Codex recipients
  use `codex queue --thread/--message`; expired-presence/not-idle/no-route
  skips are logged and the watcher continues; watcher heartbeat is `watching`.
  Registry scheme, endpoint, message, and claim boundaries match the CLI and
  generated-plugin source.
- **Plugin description:** `session.created`/`session.idle` heartbeat +
  registry write, separate `experimental.chat.system.transform` injection, no
  periodic idle heartbeat — matches the generated OpenCode plugin exactly.
- **Authorization framing:** every section disclaims execution authorization,
  live-cycle completion, runtime repair, and zero-human counts; §6 records
  failed auto-delivery plus administrative recovery without claiming automatic
  wake, no-human-relay, or 109/110 completion; the unknown human/admin prompt
  count is explicitly preserved. Consistent with parent 109, phase-1.md,
  MILESTONES and the 2026-09-08 operator policy.
- **Resume/verification steps:** `opencode <project> --session --hostname
  127.0.0.1 --port 4096`, `--pure` ("run without external plugins"), and
  `codex queue --thread <t> --message <m>` flag shapes confirmed from local
  `--help`; `acknowledgement ≠ processed reply` boundary stated correctly.

Report-only observations, disposed with no change: (1) §6's ready/publication
wording ("timed out… Publication remains unconfirmed") is a frozen historical
record of the 11:58Z timeframe, explicitly scoped to non-inference from the
report, timeout, and process exit; it asserts no current remote absence. The
authoritative current state — recovered ready `01M230FRH68JVEYVSXYNMED0FM`
now remotely observed, cycle still failed/incomplete, no helper accept — is
recorded in parent 109, which the guide names as its source of record; no
edit required. (2) `gh repo view --json` field names were not re-probed
(network prohibited); carried from the guide's recorded checks and ordinary
rounds 2–4, consistent with documented gh JSON fields. (3) The guide's
`BOARD_TEAM_STORE` binding maps to each participant's dedicated sequential
replica, consistent with phase-1.md's per-participant stage execution.

## 4. Covered / uncovered scope

Covered: the full guide `78491cd2…460d5` (all seven sections plus the checks
appendix) and its interaction surfaces — `packages/cli/src/index.ts`
(`027ee122…`, adoption manifest), `packages/cli/src/install.ts` (`ab9aebe2…`,
task-134 spec manifest), `packages/store-git/src/index.ts` (`0be706db…`,
task404-era accepted pin), `packages/hooks/src/board-hook.ts` (`3ece3abb…`,
combined-round2/task108-final pin), opencode/codex local help. Carried without
rerun: the unchanged seven-path `f37b83b` runtime coverage (adoption round1
clean pass), policy round2, runtime round1, helper 1 BLOCKED + 2 clean, and
the ordinary rounds 2–4 guide checks on the same bytes. Uncovered by design:
all other product bytes under their own recorded coverage; any future change
to the guide or the pinned runtime/config paths (requires a fresh GLM delta
verification round); actual live-cycle execution and task 110 acceptance;
remaining operational holds (Hoa).

## 5. Checks — newly run vs carried

- Newly run (read-only, local): input/output guide SHA-256 (equal); context
  and source hash pins above; full-document static security review against
  the pinned sources; seven runtime pins + two config inputs re-hashed and
  matched to the adoption manifest; four relative link targets confirmed
  present; all six fenced shell blocks pass `zsh -n` syntax; local
  `opencode --help`, `opencode run --help`, `codex queue --help` flag
  confirmation; §2/§6 recorded ids, timestamps and hashes cross-checked
  against parent 109 (create event `01M22QYN36K4D5A6EVJ8Q1MZFQ`, commit
  `668081a2…`, request/claim/receipt ids, both blocker ids — all match).
- Not run, by prohibition: no guide commands (`init`, `install`, `watch`,
  `who`, `lsof`, `nc`, resume/launch), no bus/board usage, no network or
  remote contact, no store/server/endpoint exercise, no gh probe, no model
  probes, no git writes, no installs/restarts, no tests/typecheck (doc-only
  review; the prior helper typecheck denial was neither retried nor worked
  around). No fix was required, so no `apply_patch` (or any) artifact write
  occurred and no evidence was invalidated.

## 6. Round accounting and cleanup

Adoption/final-cycle security: round 2 of 3 complete, clean no-change pass —
cycle ends here; round 3 not consumed. Cumulative counts preserved separately,
no resets: adoption/final-cycle round1 (task205 seven-path pass) + this
round2; policy 2/3 complete; runtime 1/3 complete; helper 1 BLOCKED + 2 clean;
ordinary guide rounds 1–4 (incl. lead-authorized round4 clean pass) recorded
in the parent. Runtime stays frozen at `f37b83b`; any later relevant delta
must be recorded and covered before final milestone closure. Cleanup: no
scratch, processes, sessions, worktrees, branches, or bus/board activity
created; temporary syntax-check files removed; unrelated pre-existing temp
files left untouched; no file edited anywhere (the guide remains untracked,
byte-identical to the reviewed input).

This pass is milestone evidence only. It does not authorize the live cycle,
delivery, release, or bus deprecation; those remain gated on Hoa's milestone
disposition and tasks 109/110.

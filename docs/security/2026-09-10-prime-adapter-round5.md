# Prime adapter prerelease security — round 5 (Nassun)

Reviewer identity: `nassun` (DeepSeek Harness Web `dsh`; primary milestone
security reviewer). Clean-context reviewer-remediator: no inherited
conversation, no nested worker and no nested verification context was spawned.
Observed harness session id `de65c7b3-76ee-47a1-a5f0-07764af8d410`. Parent
agent id `session-58b4497f-c639-4759-b40f-f67403d8cd41`.

Model identity: observed alias verbatim **`deepseek-flash`** (the runtime
instruction states the agent is powered by the `deepseek-flash` model). The
runtime exposes no version string, so no version claim is made. Hoa's round-5
authorization and the frozen manifest's `allowed_model` ("deepseek-flash or any
DeepSeek model") are satisfied by that alias.

Round accounting: **cumulative security round 5**, the single extra round
authorized by `2026-09-10-prime-adapter-round5-decision.md`. This round changes
bytes (one committed regression test added to `install.test.ts`), so per that
authorization it is **fixed (then STOP)**: no round 6 and no nested verifier
exists.

Verdict: **fixed — retire and STOP.** The round-4 command-field fix does take
effect through the real spawn path: the installer now selects the `prime-agent`
CLI (PATH-resolved), passes the child command after `--`, delivers the pinned
`PRIME_AGENT_CODING_AGENT_DIR` to that real child, and never invokes the project
`mcp`-script decoy that the pre-fix shape ran for both `mcp get` and `mcp add`.
Residual A and residual B are both **non-defects** on the evidence below. The
one gap confirmed is test coverage: no committed test exercised real executable
selection for the MCP path, so one was added and validated. No operational
release, correctness approval, integration or rollout is inferred.

## Scope and revisions

- Isolated worktree `/private/tmp/sidekick-task507-security-nassun`; branch
  `task507-security-nassun`; baseline
  `3c02bda76e9abb27a5675f3acd3b3bee90fceef6` (= `HEAD`, unchanged); rounds 1–4
  applied as uncommitted changes/untracked files. No rebase, no shared-main
  worktree edit, no task-202 core/CLI-entrypoint/MCP edit, no Essun candidate
  edit.
- Exact input pins verified **before** analysis, all five match:
  `install.ts` `bcf6c2b6…a413`, `install.test.ts` `b0acd9df…c470`,
  `prime-agent.ts` `2014dc0e…eea`, `prime-agent.test.ts` `d0354f12…3e8`,
  `docs/guides/prime-agent.md` `cb7b4e9b…dbc`.
- Frozen context re-verified byte-identical: round 1 `62276942…26f3`, round 2
  `1cfcaea3…b3ca`, round 3 `44800212…a5c0`, round 4 `77bf1ba4…7b04`, manifest
  `edc5f464…7fcb`.
- Read-only context reviewed: `DESIGN.md`, `docs/research/04-trust.md`,
  `docs/security/MILESTONES.md`, `backlog/507-…md`, the lead's round-5
  decision, and `packages/cli/src/index.ts` (the `installRuntime` caller seam,
  read-only).
- All five files were read in full manually — `install.ts` (1447 lines),
  `prime-agent.ts` (686), `install.test.ts` (1793 before / 1860 after),
  `prime-agent.test.ts` (627), `docs/guides/prime-agent.md` (407) — including
  the guide and both test files, so plugin file-filtering did not shrink
  coverage. No sealed scan bundle or `report.md` contract was produced: this
  instruction mandates one report and forbids nested contexts.

## 1. Round-4 command-field fix through the REAL spawn path (PRIMARY)

**Defect (round 4).** `PrimeMcpOptions` named the MCP child command `command`,
shadowing the inherited `PrimeCommandOptions.command` ("executable to invoke;
default `prime-agent`"). `install.ts` passed the child executable
(`process.execPath`) as that field, so `runPrimeAgent` spawned
`<bun> mcp get|add …` instead of `prime-agent mcp get|add …`. Every test
injected a runner that ignored the executable name, hiding it.

**Fix (round 4, verified here).** `prime-agent.ts` now declares
`childCommand: string` (lines 156–163) and `primeMcpAddArgs` uses it
(line 280); `install.ts` passes `childCommand: executable` (line 240) and does
not set `command`, so `runPrimeAgent` uses
`options.command ?? DEFAULT_PRIME_AGENT_COMMAND` (line 655). `install.test.ts`
and the guide were updated to the explicit field.

**Real-spawn regression proof.** Disposable fixture (throwaway driver
`/tmp/nassun-r5/real-spawn.ts`, importing the worktree's real
`installRuntime`/`addPrimeMcpServer`):

- `PATH` is prepended with a disposable `<bin>` holding an executable stub
  `prime-agent` (`#!/bin/sh`) that appends `INVOKED=$0`, `ARGV=$@`, `CWD`, and
  `PRIME_AGENT_CODING_AGENT_DIR` to `$STUB_LOG`, exits 1 for `mcp get` and 0
  otherwise.
- A disposable `<project>` holds `packages/mcp/src/index.ts` and a decoy
  `package.json` `"mcp"` script (`sh -c 'echo DECOY-RAN:$@ >> "$DECOY_LOG"'`).
  `bun mcp get board-x` in that directory was separately confirmed to execute
  that script (exit 0, `DECOY-RAN:get board-x`), so the decoy really is what
  the old selection would run.
- Command: `bun /tmp/nassun-r5/real-spawn.ts /private/tmp/sidekick-task507-security-nassun install`
  → `installRuntime({ runtime: "prime-agent", home, projectRoot: project, store: "fs:/shared/board", author: "probe", board: "general", indexPath, /* no primeRunner */ })`.

Observed on the fixed worktree:

```
INVOKED_EXE=<bin>/prime-agent
ARGV=mcp get board-probe
CWD=<project>
PRIME_AGENT_CODING_AGENT_DIR=<home>/.prime/agent
INVOKED_EXE=<bin>/prime-agent
ARGV=mcp add board-probe --cwd <project> -- <bun> <project>/packages/mcp/src/index.ts --store fs:/shared/board --as probe --board general --index <home>/.board/probe.sqlite
DECOY_LOG: <absent>
notices: Registered prime-agent MCP server "board-probe" via prime-agent mcp add.
```

Observed on a disposable pre-fix scratch copy (same fixture; only the round-4
field names reverted in `prime-agent.ts`/`install.ts`, `node_modules`
symlinked; command `bun /tmp/nassun-r5/real-spawn.ts /tmp/nassun-r5/scratch install`):

```
STUB_LOG: <absent>
DECOY_LOG: DECOY-RAN:get board-probe
DECOY_LOG: DECOY-RAN:add board-probe --cwd <project> -- <bun> <project>/packages/mcp/src/index.ts --store fs:/shared/board ...
```

Conclusions: (a) the executable really selected through `runPrimeAgent` is the
PATH-resolved `prime-agent`, proven by the stub's own `$0`; (b) the child
command is passed only after `--`; (c) the pinned `agentDir` reaches the real
child; (d) the decoy is not invoked post-fix, while pre-fix the same fixture ran
the decoy for both `mcp get` and `mcp add` and never reached `prime-agent`.

## 2. Independence: injected runners cannot prove executable selection

Every prime-agent test injects a runner. `scriptedRunner` and `fakePrimeAgent`
record `(command, args)` but branch only on `args`; `realPrimeRunner` takes
`_executable` and hardcodes its own `command` array. A wrong executable is
therefore invisible to all of them — they can assert argv, not selection. The
only pre-existing real-spawn test (`prime-agent.test.ts` "default spawn path")
drives `sendPrimeMessage` with an explicit absolute `command`, exercising the
`send` branch only; it does not cover the `mcp get/add` path, the
`command`/`childCommand` interplay, or default PATH resolution. **No committed
test covered the real selection path that the round-4 defect actually broke.**
I added one committed test (below); it passes on the fixed worktree in 492 ms
and fails on the pre-fix scratch (`CliError: refusing to replace non-board
prime-agent MCP server`, the visible symptom of the decoy answering the probe).

## 3. Residual A — `{command: evil, args:[mcpPath]}` classified owned → non-defect

Fixture `/tmp/nassun-r5/residual-a.ts` (real install path, stub `prime-agent`
reporting present, an executable `evil-command` that appends to a log if ever
executed):

| seeded `board-probe` | result | new stub calls | `evil` executed |
|---|---|---|---|
| `{command: evil, args:[mcpPath]}` | proceeded | `mcp get`, `mcp add … --force …` | no |
| `{command: evil, args:[mcpPath,"--x"]}` | proceeded | `mcp get`, `mcp add … --force …` | no |
| `{command: evil, args:[otherPath]}` | refused | `mcp get` only | no |

`EVIL_LOG: <absent>` in all cases. Assessment: the predicate
(`isOwnedPrimeMcpServer`, install.ts:443–447) intentionally reads only
`args[0]` and documents that `command` may be anything (a bun/node upgrade must
not reclassify a board entry); the sibling `isOwnedMcp` (install.ts:1062–1065)
uses the identical signal, and the guide states the same rule (lines 239–248).
The classification's only effect is which installer-controlled argv is sent to
the verified CLI; the stored foreign `command` is never executed by the
installer (only overwritten through the CLI). Writing that file requires the
installing user's own 0600 agent settings, so no privilege boundary is crossed.
Constraining `command` would be speculative here and could misclassify
legitimate entries — **non-blocking, not a defect**.

## 4. Residual B — `PrimeMcpOptions.cwd` doubles as spawn cwd → non-defect

`PrimeMcpOptions` redeclares the inherited `cwd` (prime-agent.ts:166–167 vs
114–115); `primeMcpAddArgs` emits it as the child `--cwd` (line 274) while
`runPrimeAgent` uses it as the Bun.spawn cwd (line 663). Assessment:

- The only production value is `options.projectRoot` (install.ts:242), supplied
  by the trusted caller (`index.ts:100`, default the repo root) — not attacker
  input.
- Child cwd does not affect executable resolution: with `PATH` pointing only at
  directory A and the child cwd set to B, where **both** contain `prog`, the
  process ran `A/prog` (`RAN-FROM-A`). PATH lookup is independent of the child
  cwd.
- Cwd does not affect the settings file: with an absolute
  `PRIME_AGENT_CODING_AGENT_DIR` and cwd set elsewhere, the real `prime-agent
  mcp add` wrote only `<override>/settings.json` (`EXISTS`); the default
  `<home>/.prime/agent/settings.json` stayed `absent`. `getAgentDir()` never
  consults cwd, and the installer already pins the override absolute
  (install.ts:400–403).
- A bad cwd fails closed: `runPrimeAgent` catches the spawn error and returns
  127, which the installer turns into "failed to register".

So this is the round-4 shadowing *shape* but with no executable-resolution,
settings-resolution or privilege effect. A field split would change the real
spawn directory (or add an unused knob) — a speculative change outside this
frozen scope — so the coupling is recorded as a latent foot-gun, **not a
defect**.

## 5. Files changed — before/after sha256

| path | before (round-4 pin) | after (round 5) | changed |
|---|---|---|---|
| `packages/cli/src/install.ts` | `bcf6c2b6e272c8389f637dfe24c8e396f129b9ed3c6d9b9c6b0397686e50a413` | same | no |
| `packages/cli/test/install.test.ts` | `b0acd9df77b57dc8dfc1ef533b2337c57df999ced44567f21f969a2366dcc470` | `86819dc139541d870214bcc23164398756024c319ecc1fac11e8e918c25512a8` | **yes** |
| `packages/cli/src/prime-agent.ts` | `2014dc0e250b118455240039d544b35cfec8cf6bcea3890b9ab31ee1e4fafeea` | same | no |
| `packages/cli/test/prime-agent.test.ts` | `d0354f1282197acd11c0904d8604ebe338e3269cc0eebe0faed3a72cb60db3e8` | same | no |
| `docs/guides/prime-agent.md` | `cb7b4e9b3a8725de0ad2fb79d4d4fa191d9ed66210fb90c19d3da640db439dbc` | same | no |

The change is a 67-line addition only (new `describe`)
inside `install.test.ts`, the one of the five writable paths where the missing
coverage belongs. It is not git-committed (integration/commit is Hoa's), and
the round-5 report is the only new file
(`docs/security/2026-09-10-prime-adapter-round5.md`). Frozen reports and the
manifest are byte-identical. `git status --short` shows only the five overlay
paths, the frozen reports/manifest, and this report; `HEAD` is unchanged.

## Checks run

| check | result |
|---|---|
| `bun test packages/cli/test/prime-agent.test.ts packages/cli/test/install.test.ts` | **86 pass / 0 fail** (564 expect calls, 9.08s) |
| `bun test packages/cli` (4 files) | **120 pass / 0 fail** (751 expect calls) |
| `bun test` (whole repo, 23 files) | **375 pass, 1 skip (S3 integration gated), 0 fail** (2435 expect calls) |
| `bunx tsc --noEmit` | rc 0 |
| new regression test, fixed worktree | pass (492.39 ms, 7 expects) |
| new regression test, pre-fix scratch | **fail** (`CliError: refusing to replace non-board prime-agent MCP server`) |
| real-spawn fixture, fixed vs pre-fix | decoy absent / decoy ran for `get`+`add`, stub absent |
| residual-A fixture (3 shapes) | as tabulated; `evil` never executed |
| residual-B: PATH=A, cwd=B, both hold `prog` | ran `A/prog` (`RAN-FROM-A`) |
| residual-B: real CLI, absolute override + foreign cwd | override written, default home untouched |

## Scope containment and cleanup

Disposable fixtures only: all fixtures lived under `/tmp/nassun-r5*` and were
removed after the run; no live `settings.json`, credential, board, permission,
installation or restart was touched. The one real-CLI probe used a disposable
`HOME` and an absolute disposable `PRIME_AGENT_CODING_AGENT_DIR`; the live
`/Users/stan/.prime/agent/settings.json` was not read or written. The pre-fix
scratch copy is discarded.

## Routing, identity and retirement

- Result delivered to parent agent id
  `session-58b4497f-c639-4759-b40f-f67403d8cd41` with `send_message`.
- No nested worker or verification context was created. This round changed
  bytes, so it retires and stops: a fresh permitted-model delta verification
  of the added test would be a new round, which is not authorized.
- Worker `nassun` (DeepSeek Harness Web `dsh`, alias verbatim
  **`deepseek-flash`**, session `de65c7b3-76ee-47a1-a5f0-07764af8d410`) retires
  after this handoff.

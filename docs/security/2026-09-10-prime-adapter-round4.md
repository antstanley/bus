# Prime adapter prerelease security — round 4 (Nassun)

Reviewer identity: `nassun` (DeepSeek Harness Web `dsh`; primary milestone
security reviewer). Clean-context reviewer-remediator: no inherited
conversation, no nested worker and no nested verification context was spawned.
Observed harness session id `4b38ce41-850a-429d-aa94-830dfada956e`. Parent
agent id `session-58b4497f-c639-4759-b40f-f67403d8cd41`.

Model identity: observed alias verbatim **`deepseek-flash`** (the runtime
instruction states the agent is powered by the `deepseek-flash` model). The
runtime exposes no version string, so no version claim is made. Hoa's round-4
authorization and the frozen manifest's `allowed_model` ("deepseek-flash or any
DeepSeek model") are satisfied by that alias.

Round accounting: **cumulative security round 4**, the single extra round
authorized by
`2026-09-10-prime-adapter-round4-decision.md`. This round changes bytes (one
confirmed defect fixed), so per that authorization it is **fixed (then STOP)**:
no round 5 is authorized and no nested verification context exists.

Verdict: **fixed — retire and STOP.** The round-3 F3 remediation and the
tightened ownership predicate are independently verified effective; their
pre-fix failure claims reproduce. One additional confirmed defect in the
in-scope round-1 bytes (`prime-agent.ts`) defeated the whole `mcp add` path and
made the F3 "pinned into the driven CLI" guarantee unobservable; it is fixed
and validated. No operational release, correctness approval, integration or
installation is inferred.

## Scope and revisions

- Isolated worktree `/private/tmp/sidekick-task507-security-nassun`; branch
  `task507-security-nassun`; baseline
  `3c02bda76e9abb27a5675f3acd3b3bee90fceef6` (= `HEAD`); rounds 1–3 applied as
  uncommitted changes/untracked files. No rebase, no shared-main-worktree edit.
- Exact input pins verified **before** analysis, all five match:
  `install.ts` `5e4abcea…06bd`, `install.test.ts` `08d209a0…3c07`,
  `docs/guides/prime-agent.md` `cb7b4e9b…9dbc`, `prime-agent.ts`
  `0cf4b786…eaed`, `prime-agent.test.ts` `74db8123…dcc5`.
- Frozen context re-verified byte-identical: round 1 `62276942…26f3`, round 2
  `1cfcaea3…b3ca`, round 3 `44800212…a5c0`, manifest `edc5f464…7fcb`.
- Read-only context reviewed: `DESIGN.md`, `docs/research/04-trust.md`,
  `docs/security/MILESTONES.md`, `backlog/507-…md`, the lead's round-4 decision.
  (`MILESTONES.md` still carries no task-507 milestone entry in this snapshot —
  the round-2 bookkeeping observation stands; outside the five-file scope.)
- The helper-excluded files (`docs/guides/prime-agent.md`, both test files and
  the untracked `prime-agent.ts`) were read in full and reviewed manually; no
  sealed scan bundle or `report.md` contract was produced (the round-4
  instruction mandates this single report and forbids nested contexts, so the
  diff-scan plugin's subagent phases were not used).

## 1. F3 remediation — verified effective

The installer's resolution was compared line-by-line with the installed
`prime-agent 0.9.4` `dist/config.js` (public installed source, read-only):

```js
export const CONFIG_DIR_NAME = pkg.piConfig?.configDir || ".prime/agent"; // ".prime/agent"
export const ENV_AGENT_DIR = `${envPrefix}_CODING_AGENT_DIR`;            // PRIME_AGENT_CODING_AGENT_DIR
export function getAgentDir() {
  const envDir = process.env[ENV_AGENT_DIR];
  if (envDir) return expandTildePath(envDir);
  return join(homedir(), CONFIG_DIR_NAME);
}
```

`primeAgentDir(home)` mirrors this: the override when truthy (tilde-expanded by
a faithful `expandTildePath` mirror, then `resolve`d to absolute), else
`join(home, ".prime/agent")`. `agentDir` is used for the ownership gate
(`readPrimeMcpServers(agentDir)`), the skill package (`skillDir`/`skillPaths`)
and the CLI child environment (`primeOptions.env = { PRIME_AGENT_CODING_AGENT_DIR: agentDir }`);
no hardcoded `<home>/.prime/agent` remains in the prime branch. `runPrimeAgent`
merges that env over `process.env`. Confirmed by grep and by execution.

Adversarial fixtures (17/17 pass post-fix; disposable `mkdtemp` homes only):

| fixture | observed |
|---|---|
| absolute override, foreign entry in override + stale owned entry in default | refused, override bytes identical, no `add`, no skill files anywhere |
| absolute override, owned install then uninstall | server + skills land in override, default home untouched, uninstall resolves override |
| override set to `""` | treated as unset; default dir gated |
| tilde override (`~/agent-override`, HOME preset in a subprocess because Bun caches `os.homedir()`) | resolves against the OS home, not `options.home`; foreign refused/unchanged, owned install lands there |
| relative override `./rel-agent` with installer cwd ≠ projectRoot, **real CLI** | real `prime-agent` writes only `<installer cwd>/rel-agent` (pinned absolute), not `<projectRoot>/rel-agent` and not the default home |
| override unset, **real CLI** | writes only `<options.home>/.prime/agent` |
| unparseable / array / null root / non-object or absent `mcpServers` / missing file, with a probe claiming presence | all refuse before any mutation, bytes unchanged, no `add` |
| unreadable (`000`) settings | `EACCES` propagates, no mutation |

The `tilde` subprocess and the two real-CLI tests are guarded (they only run
when `homedir()` is redirected / `prime-agent` is installed). No live settings
were read or written: `/Users/stan/.prime/agent/settings.json` retains its
pre-session mtime (2026-09-10 09:56:56); every real-CLI probe was pinned to a
disposable directory.

## 2. Ownership predicate — verified, wording matches

`isOwnedPrimeMcpServer` now returns true only when `Array.isArray(record.args)
&& record.args[0] === mcpPath`, i.e. the entrypoint at the argument position
the board itself uses (`command = <bun>`, `args[0] = <mcpPath>`). Fixture
results: canonical owned → owned; entrypoint only in a later arg
(`--config <mcpPath>`) → foreign; second position → foreign; non-array `args` →
foreign; empty `args` → foreign; relative entrypoint string → foreign;
non-object entry → foreign. The round-3 comment and the guide now state exactly
this ("first argument of the stdio command — the executable position, the same
signal `isOwnedMcp` uses") and explicitly disclose that `command` itself is not
constrained, so a bun/node upgrade cannot reclassify a board-managed entry.
Both match the code and the sibling `isOwnedMcp` predicate. Residual shape
`{command:"/usr/bin/evil", args:[<mcpPath>]}` is still classified **owned**;
that is the documented, established project convention, requires the same user
to have written that definition, and crosses no privilege boundary —
non-blocking, not a new defect.

## 3. Round-3 tests and pre-fix claims — verified

The seven committed tests genuinely drive the dangerous paths (foreign
override/default entries, malformed/missing/unreadable/symlinked settings,
impostor args shape, the fail-open default-vs-override case, and a real-CLI
override round-trip). Pre-fix proof in a disposable scratch copy
(`/tmp/nassun-r4/scratch`, node_modules symlinked; the reviewed worktree was not
reverted): reverting only `primeAgentDir` to `join(home, ".prime/agent")` and
the predicate to the old any-token form makes both regressions fail with
"Received promise that resolved" — i.e. the foreign entry really was replaced
(fail-open). Restored copy discarded.

## 4. New confirmed defect — fixed

**Wrong executable on every `mcp add` (and its presence probe).** In
`PrimeMcpOptions`, the MCP child command was also named `command`, shadowing
the inherited `PrimeCommandOptions.command` ("executable to invoke; default
`prime-agent`"). `addPrimeMcpServer` therefore passed the child command
(`process.execPath` / bun) as the CLI executable, so the real spawn path ran
`<bun> mcp get …` and `<bun> mcp add …` rather than `prime-agent mcp …`.
Instrumented spawn log before the fix:

```
["/Users/stan/.bun/bin/bun","mcp","get","board-prime-agent"]  envDir=<resolved agentDir>
["/Users/stan/.bun/bin/bun","mcp","add","board-prime-agent","--cwd",<projectRoot>,"--",…]
```

Impact: `board install prime-agent` could never reach the verified CLI in
production (the injected `runner` used by every test ignores the executable
name, hiding it), and — because `bun <name>` resolves a project `package.json`
script — a repository with an `mcp` script would have that script executed with
the installer's arguments (demonstrated: `bun mcp get board-x` ran
`"mcp": "echo SCRIPT-RAN: $@"` and exited 0). That contradicts the documented
"managed exclusively through the fixture-verified prime-agent CLI" invariant and
made the F3 pinning guarantee unobservable. Fix: rename the child field to
`childCommand` in `PrimeMcpOptions`/`primeMcpAddArgs`, so the inherited
`command` again means the prime-agent executable; `install.ts` passes
`childCommand: executable`; tests updated to the explicit field. Post-fix the
instrumented spawn log is `["prime-agent","mcp","get","board-prime-agent"]` /
`["prime-agent","mcp","add",…]`, and the relative-override real-CLI fixture
writes the pinned absolute directory. `tsc --noEmit` rc 0 confirms every call
site.

Non-blocking observation (not changed): `PrimeMcpOptions.cwd` (the child
`--cwd`) is still reused as the CLI spawn cwd by `runPrimeAgent` — the same
shadowing class, but it only changes the trusted CLI's working directory (the
override is pinned absolute), with no executable-resolution or privilege
effect. Recorded for a follow-up decision.

## 5. Files changed — before/after sha256

| path | before (round-3 pin) | after (round 4) | changed |
|---|---|---|---|
| `packages/cli/src/install.ts` | `5e4abceab6be56981376e107d54490231d399ca38234975a7861413cecd506bd` | `bcf6c2b6e272c8389f637dfe24c8e396f129b9ed3c6d9b9c6b0397686e50a413` | yes |
| `packages/cli/test/install.test.ts` | `08d209a0a8b76b2b1234a64e7e0e323fd0167a498e98649a9eb0195827dc3c07` | `b0acd9df77b57dc8dfc1ef533b2337c57df999ced44567f21f969a2366dcc470` | yes |
| `packages/cli/src/prime-agent.ts` | `0cf4b7869131265528a70817d8dc2cd9a5cf9df1ca8a615680f0b85172f8eaed` | `2014dc0e250b118455240039d544b35cfec8cf6bcea3890b9ab31ee1e4fafeea` | yes |
| `packages/cli/test/prime-agent.test.ts` | `74db81235c3e3ca52be1c698b474b49871fbb276db4e55b32ddeba1fa2a4dcc5` | `d0354f1282197acd11c0904d8604ebe338e3269cc0eebe0faed3a72cb60db3e8` | yes |
| `docs/guides/prime-agent.md` | `cb7b4e9b3a8725de0ad2fb79d4d4fa191d9ed66210fb90c19d3da640db439dbc` | `cb7b4e9b3a8725de0ad2fb79d4d4fa191d9ed66210fb90c19d3da640db439dbc` | no |

Frozen reports and manifest are byte-identical after the round (same hashes as
above). `git status --short` shows only the five overlay paths plus the frozen
reports/manifest; no task-202 core/CLI-entrypoint/MCP path, no Essun shared
candidate and no scratch file is inside the worktree (all fixtures lived under
`/tmp/nassun-r4` and were removed).

## Checks run

| check | result |
|---|---|
| `bun test packages/cli/test/prime-agent.test.ts packages/cli/test/install.test.ts` | **85 pass / 0 fail** (557 expect calls) |
| `bun test packages/cli` (4 files) | **119 pass / 0 fail** (744 expect calls) |
| `bun test` (whole repo, 23 files) | **374 pass, 1 skip (S3 integration gated), 0 fail** |
| `bunx tsc --noEmit` | rc 0 |
| independent adversarial fixture harness (17 fixtures) | **17 pass / 0 fail** |
| pre-fix scratch revert (F3 resolution + predicate) | impostor test and override fail-open test both **fail** ("promise resolved") |
| instrumented real spawn path, before/after fix | `<bun> mcp …` → `prime-agent mcp …` |

## Residual boundary (recorded)

A relative `PRIME_AGENT_CODING_AGENT_DIR` is resolved against the installer's
working directory and pinned absolute, so the installer and the CLI it drives
always agree (real-CLI fixture confirmed: the add child's cwd was a different
directory and it still wrote the pinned path). A CLI run **directly** with a
relative override remains cwd-dependent — that is the installed `getAgentDir()`
behaviour itself, correctly characterised in the round-3 report; it needs no
installer fix and no lead acceptance because the installer no longer leaves
resolution to the child. Version drift on `CONFIG_DIR_NAME`/`ENV_AGENT_DIR`
remains a future-version risk, not a current defect on 0.9.4.

## Routing, identity and retirement

- Result delivered to parent agent id
  `session-58b4497f-c639-4759-b40f-f67403d8cd41` with `send_message`.
- No nested worker or verification context was created. This round changed
  bytes, so it retires and stops: a fresh permitted-model delta verification
  would be a new round, which is not authorized.
- Worker `nassun` (DeepSeek Harness Web `dsh`, alias verbatim
  **`deepseek-flash`**, session `4b38ce41-850a-429d-aa94-830dfada956e`) retires
  after this handoff.

# Prime adapter prerelease security — round 6 delta verification (Nassun)

Reviewer identity: `nassun` (DeepSeek Harness Web `dsh`; primary milestone
security reviewer). Clean-context reviewer-remediator: no inherited
conversation, no nested worker and no nested verification context was spawned.
Observed harness session id `a6536573-f744-45dd-8541-0d97ecb73a01`. Parent agent
id `session-58b4497f-c639-4759-b40f-f67403d8cd41`.

Model identity: observed alias verbatim **`deepseek-flash`** (the runtime
instruction states the agent is powered by the `deepseek-flash` model). The
runtime exposes no version string, so no version claim is made. Hoa's round-6
authorization and the frozen manifest's `allowed_model` ("deepseek-flash or any
DeepSeek model") are satisfied by that alias.

Round accounting: **cumulative security round 6**, the single delta-verification
round authorized by
`/Volumes/Delorean/code/sidekick/tmp/docs/security/2026-09-10-prime-adapter-round6-decision.md`.
Verdict: **clean no-change pass — retire and STOP.** No bytes were changed; no
round 7 and no nested verifier exist.

## Scope and revisions

- Isolated worktree `/private/tmp/sidekick-task507-security-nassun`; branch
  `task507-security-nassun`; baseline
  `3c02bda76e9abb27a5675f3acd3b3bee90fceef6` (= `HEAD`, unchanged). Rounds 1–5
  are applied as uncommitted changes/untracked files. No rebase, no shared-main
  worktree edit, no task-202 core/CLI-entrypoint/MCP edit, no Essun candidate
  edit. One file was writable; it was not modified.
- Exact input pins recomputed with `shasum -a 256` and all match the brief:
  - writable: `packages/cli/test/install.test.ts`
    `86819dc139541d870214bcc23164398756024c319ecc1fac11e8e918c25512a8`
  - read-only: `packages/cli/src/install.ts`
    `bcf6c2b6e272c8389f637dfe24c8e396f129b9ed3c6d9b9c6b0397686e50a413`,
    `packages/cli/src/prime-agent.ts`
    `2014dc0e250b118455240039d544b35cfec8cf6bcea3890b9ab31ee1e4fafeea`,
    `packages/cli/test/prime-agent.test.ts`
    `d0354f1282197acd11c0904d8604ebe338e3269cc0eebe0faed3a72cb60db3e8`,
    `docs/guides/prime-agent.md`
    `cb7b4e9b3a8725de0ad2fb79d4d4fa191d9ed66210fb90c19d3da640db439dbc`.
  - round-5 report `c0d600d3b3694aaf642cbb2cf61a9fcabcfbf83a2753c32ed9065ac3b07a6915`;
    frozen context re-verified byte-identical: round 1 `62276942…26f3`, round 2
    `1cfcaea3…b3ca`, round 3 `44800212…a5c0`, round 4 `77bf1ba4…7b04`, manifest
    `edc5f464…7fcb`.
- Fixtures/experiments were kept in a disposable scratch tree outside the
  worktree (`/tmp/nassun-r6/…`) and removed after this report. The worktree was
  never reverted; `git status --short` still shows only the five overlay paths
  and the frozen reports/manifest.

## 1. Detection — the new test fails on the pre-fix shape

New test: `install.test.ts` lines 1442–1495, `describe("prime-agent installer
executable selection (real spawn path)")`; 67-line addition (1860 − 1793).

Fixed worktree:

```
cd /private/tmp/sidekick-task507-security-nassun
bun test packages/cli/test/install.test.ts -t "runs prime-agent from PATH"
→ 1 pass, 0 fail, 7 expect() calls (453.58 ms)
```

Pre-fix scratch (revert in scratch only, never the worktree): a copy of the
worktree with `node_modules` symlinked, then the round-4 field names restored:
`prime-agent.ts` `childCommand: string` → `command: string`, the two
`options.childCommand` uses in `primeMcpAddArgs` → `options.command`, and
`install.ts` `childCommand: executable` → `command: executable`.

```
cd /tmp/nassun-r6/scratch
bun test packages/cli/test/install.test.ts -t "runs prime-agent from PATH"
→ 0 pass, 1 fail
   CliError: refusing to replace non-board prime-agent MCP server: "board-prime-agent"
   at install.ts:171 (inside addPrimeMcpServer ← installRuntime)
```

The scratch test bytes were byte-identical to the committed
`86819dc1…12a8`; only the two source files differed.

Direct spawn probe (`/tmp/nassun-r6/spawn-probe.ts`, same stub/decoy fixtures,
`installRuntime` with no injected runner):

```
TARGET_ROOT=<fixed worktree>   → STUB_LOG: INVOKED=…/bin/prime-agent
                                 ARGV=mcp get board-prime-agent
                                 INVOKED=…/bin/prime-agent
                                 ARGV=mcp add board-prime-agent --cwd …/project
                                      -- <bun> …/project/packages/mcp/src/index.ts …
                                 AGENT_DIR=…/home/.prime/agent   DECOY_LOG: <absent>
TARGET_ROOT=/tmp/nassun-r6/scratch → STUB_LOG: <absent>
                                 DECOY_LOG: "DECOY-RAN:get board-prime-agent"
                                 THREW: CliError: refusing to replace non-board …
```

So on the pre-fix shape the selected executable really is `bun`, the project
`package.json` `mcp` script really does execute with the installer's argv (the
decoy assertion is not vacuous), and the `prime-agent` stub is never reached.

## 2. Assertion strength

- The test injects **no** `primeRunner`, so `runPrimeAgent` takes the real
  `Bun.spawn` path: proven because only the disposable PATH stub (writing the
  test-chosen `$BOARD_PRIME_STUB_LOG`) produces the log the assertions read.
- It asserts the executable actually selected (`INVOKED=…/prime-agent`), the
  exact probe argv (`ARGV=mcp get board-prime-agent`), the add argv with the
  child after `--` (`-- <bun> <mcpPath>`), that the pinned
  `PRIME_AGENT_CODING_AGENT_DIR` reaches the child, and that the decoy log does
  not exist.
- Load-bearing even when behavior is identical: a scratch variant that forces a
  *different* but fully compliant `prime-agent` (absolute path via
  `command: process.env.BOARD_PRIME_WRONG_EXE`, `get`→1, `add`→0) lets
  `installRuntime` succeed and emit "Registered …", yet the committed test still
  fails (`ENOENT … prime-stub.log` at the `INVOKED=` read). Passing therefore
  requires the PATH stub to be the process that ran, not merely correct argv
  behavior.
- No spurious-pass vector found. `bin` is prepended to `PATH`, so the disposable
  stub shadows any host `prime-agent`; any other wrong executable leaves
  `stubLog` absent (ENOENT → fail) or decoy log present (exists → fail). Both
  invocations (`get`, `add`) are pinned, so a stub-for-get/wrong-for-add split
  fails the `add` assertion.
- Observation (not a defect): on the pre-fix shape the test fails at
  `installRuntime` (the decoy answers the probe, then the ownership gate
  refuses) before the selection assertions execute. Detection is still genuine;
  the wrong-compliant-executable experiment above shows the selection assertions
  independently catch wrong selection once the run succeeds.

## 3. Isolation, cleanup and environment

- Disposable only: `mkdtemp(tmpdir(), "board-install-")` home, `bin` and
  `project`; stub, decoy log and stub log all live under those roots; the
  top-level `afterEach` removes every root. Before/after a full
  `install.test.ts` run: **0** leftover `board-install-*` directories.
- No live-settings access: `beforeEach` clears
  `PRIME_AGENT_CODING_AGENT_DIR`, so `primeAgentDir` resolves
  `<fixture home>/.prime/agent`; `projectRoot` is the disposable decoy project;
  the PATH stub reads nothing. No hardcoded host path appears in the new region
  (`grep` for `/Users`, `/tmp`, `/private`, `nassun`, `stan` → none).
- No environment pollution across tests: a disposable `bun:test` preload that
  snapshots `PATH`, `BOARD_PRIME_STUB_LOG`, `PRIME_AGENT_CODING_AGENT_DIR`,
  `HOME`, `AWS_PROFILE` at load and compares in `afterAll` reported
  **`ENVCHECK_RESULT=CLEAN`** after the whole file. PATH and the stub-log var are
  also restored in the test's own `finally`. No background process or file
  survives; the stub is short-lived.

## 4. Other scoped defects, counts, dispositions

- No other defect found in the writable file. The added `describe` is correctly
  placed after the existing `board install` describe, uses only existing
  helpers (`fixture`, `put`, `options`, `restoreEnv`), and has a 30 s timeout
  against ~0.45 s observed.
- Counts match round-5 exactly: new test alone 1 pass / 7 expect; scoped
  `prime-agent.test.ts` + `install.test.ts` **86 pass / 0 fail / 564 expect**;
  `bun test packages/cli` **120 pass / 0 fail / 751 expect**; whole repo
  **375 pass, 1 skip (S3 gated), 0 fail / 2435 expect, 23 files**;
  `bunx tsc --noEmit` **rc 0**. `install.test.ts` now holds 42 tests (41 + 1).
- Lead-accepted dispositions A and B: no contrary evidence in this delta.
  Disposition A (a stored `command` is not executed during replacement) holds —
  the installer builds argv from `executable`/`mcp.args`, never from the stored
  definition, and the probe shows only `prime-agent` spawned. Disposition B
  (normalized absolute agent directory pinned for the driven CLI) gains positive
  evidence: the test asserts the pinned `PRIME_AGENT_CODING_AGENT_DIR` reaches
  the real child.

## Files changed

None. `packages/cli/test/install.test.ts` remains
`86819dc139541d870214bcc23164398756024c319ecc1fac11e8e918c25512a8` (unchanged);
no other worktree file was written. Only this new report
`docs/security/2026-09-10-prime-adapter-round6.md` was added.

## Checks run

| check | result |
|---|---|
| new test, fixed worktree | pass (1 pass, 7 expect, 453.58 ms) |
| new test, pre-fix scratch | **fail** (`CliError: refusing to replace …`) |
| real-spawn probe, fixed vs pre-fix | stub selected + decoy absent / bun selected + decoy ran |
| wrong-but-compliant executable variant | committed test **fail** (stub never invoked) |
| env-pollution preload across `install.test.ts` | `ENVCHECK_RESULT=CLEAN` |
| leftover fixture dirs before/after | 0 / 0 |
| `bun test prime-agent.test.ts install.test.ts` | 86 pass / 0 fail / 564 expect |
| `bun test packages/cli` | 120 pass / 0 fail / 751 expect |
| `bun test` (whole repo) | 375 pass, 1 skip, 0 fail / 2435 expect |
| `bunx tsc --noEmit` | rc 0 |

## Routing, identity and retirement

- Result delivered to parent agent id
  `session-58b4497f-c639-4759-b40f-f67403d8cd41` with `send_message`.
- No nested worker or verification context was created. No bytes changed and the
  delta verification is clean, so this closes the frozen round-6 scope only; no
  round 7 exists. Full task 504/507 correctness, integration and rollout remain
  outstanding.
- Worker `nassun` (DeepSeek Harness Web `dsh`, alias verbatim
  **`deepseek-flash`**, session `a6536573-f744-45dd-8541-0d97ecb73a01`) retires
  after this handoff.

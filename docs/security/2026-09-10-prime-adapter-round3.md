# Prime adapter prerelease security — round 3 (Nassun)

Reviewer identity: `nassun` (DeepSeek Harness Web `dsh`; primary milestone
security reviewer). Clean-context reviewer-remediator, no inherited
conversation. Observed harness session id `ec5a67d4-93d4-44bf-868a-bac742d61f7c`.

Model identity: observed alias verbatim **`deepseek-flash`** (the runtime
instruction states the agent is powered by the `deepseek-flash` model). The
runtime exposes no version string, so no version claim is made. The frozen
manifest's `allowed_model` ("deepseek-flash or any DeepSeek model") is satisfied
by that alias.

Round accounting: **cumulative security round 3 of at most 3**. This is the
final authorized round. It changes bytes, so per operator policy a fresh
permitted-model verification would be a new round 4, which is **not
authorized**: no verification worker was spawned and none is requested. The
task owner must stop this cycle and seek the lead's recorded decision before any
release.

Verdict: **fixed-pending-lead-decision.** All three verified defects are
remediated, the round-2 test gaps are committed, and every runnable check is
green. No operational release, correctness approval or installation is
inferred.

## Scope and revisions

- Isolated worktree: `/private/tmp/sidekick-task507-security-nassun`.
- Branch `task507-security-nassun`; baseline
  `3c02bda76e9abb27a5675f3acd3b3bee90fceef6` (= `HEAD`); the round-1/round-2
  overlay is applied as uncommitted changes/untracked new files.
- Frozen inputs re-verified before remediation:
  - round 1 `docs/security/2026-09-10-prime-adapter-round1.md`
    `6227694214b2dbba5e8891c1ee7aaf88c18271c9bd8e377db181c3bddb3f26f3` — matches.
  - round 2 `docs/security/2026-09-10-prime-adapter-round2.md`
    `1cfcaea3fe276589cc8790b1260f40c15bf7fde7ba6c90a04228d01b4e49b3ca` — matches.
  - manifest `docs/security/2026-09-10-prime-adapter-inputs.json`
    `edc5f4646e3d913b17f0503ec0e2b2f6c317aeef7158dbdbb5672350e1827fcb` — matches.
- Read-only context reviewed: `DESIGN.md`, `docs/research/04-trust.md`,
  `docs/security/MILESTONES.md`,
  `backlog/507-prime-agent-adapter-daemon-send-wake.md`.
- Only the five writable paths were edited; the frozen reports and manifest are
  byte-identical. No task202 core/CLI-entrypoint/MCP path, no Essun candidate,
  no live settings, credentials, board, permission, install or restart change
  was made; all fixtures are disposable `mkdtemp` homes or `/tmp` scratch.
- Independent confirmation of the CLI contract used by the F3 fix: the installed
  `prime-agent 0.9.4` `dist/config.js` defines
  `getAgentDir() = expandTildePath($PRIME_AGENT_CODING_AGENT_DIR) || join(homedir(), ".prime/agent")`
  and `expandTildePath()` expands `~`/`~/…` only; an exec probe with a
  disposable HOME/override confirmed `mcp get` reads `<override>/settings.json`.
  No live config was read or written.

## Defects fixed

### F3 — override fail-open (the important one) — FIXED

Round 2 verified that `installRuntime` computed
`agentDir = join(options.home, ".prime", "agent")` for the mutating gate, the
read-only ownership probe and the skill package, while the real CLI honours
`$PRIME_AGENT_CODING_AGENT_DIR`; with the override set, the gate inspected a
different file than the CLI mutated and a foreign server in the override
directory was force-replaced.

Change (`packages/cli/src/install.ts`): added `primeAgentDir(home)`, which
mirrors the CLI exactly — the `$PRIME_AGENT_CODING_AGENT_DIR` override when set
(tilde-expanded via a mirror of the CLI's `expandTildePath`, relative paths
normalised with `resolve`) else `join(home, ".prime", "agent")`. The gate
(`readPrimeMcpServers(agentDir)`), the skill package (`skillDir`/`skillPaths`)
and the mutation now all resolve through that one value. The resolved directory
is additionally pinned into the CLI child environment
(`primeOptions.env = { PRIME_AGENT_CODING_AGENT_DIR: agentDir }`) so the
`mcp get`/`add`/`remove` child reads and writes the identical file even when its
HOME or cwd would resolve differently.

Why: this closes the fail-open direction and the "gate guards a different file"
class, not only the fail-closed symptom round 1 recorded. Fail-closed behaviour
is unchanged: `readPrimeMcpServers` still returns `null` for unparseable JSON,
a non-object root or a non-object `mcpServers`, `{}` for an empty/missing file,
and a read error (EACCES) still propagates before any mutation.

### Low — `isOwnedPrimeMcpServer` token impostor — FIXED

Before, any `command`/`args` token equal to the MCP entrypoint path counted as
ownership, so `{command: "/usr/bin/evil-server", args: ["--config", <mcpPath>]}`
occupying `board-<author>` was classified owned and replaced.

Change: ownership now requires `Array.isArray(record.args) && record.args[0] === mcpPath` — the executable position, the same signal `isOwnedMcp` uses. The
runtime executable itself may still be anything, so a bun/node upgrade cannot
turn a board-managed entry foreign. The function comment and
`docs/guides/prime-agent.md` (install section and Limits note) were rewritten to
state exactly that, and the obsolete "residual, round 1" override note now
records the round-3 fix.

### Test gaps — CLOSED

Seven committed tests were added to `packages/cli/test/install.test.ts`
(`prime-agent.test.ts` is unchanged: the predicate is private to `install.ts`,
so `installRuntime` is the correct test seam):

1. malformed / non-object / missing settings (unparseable JSON, array/null root,
   array/null/string/absent `mcpServers`, missing file) with a probe that claims
   presence — all refused, bytes unchanged, no `mcp add`;
2. unreadable settings (mode 000) — the read error propagates, no mutation;
3. symlinked settings → foreign target (refused, target byte-identical) and a
   dangling symlink (refused);
4. the predicate impostor (entrypoint path only in `args`) — refused;
5. F3 fail-open regression: a stale owned entry in the default directory must
   not authorize a foreign entry in the override directory — refused;
6. override positive case: gate and skill package install into the override
   directory and uninstall resolves it; the default home is untouched;
7. override end-to-end against the real installed CLI (gated on availability;
   ran here): the override's foreign entry is found by `mcp get`, refused by the
   gate, and an owned install lands in the override directory.

Pre-fix proof: temporarily reverting only `agentDir` and the predicate, tests 4
and 5 both **failed** (the promise resolved, i.e. the foreign entry was
replaced); the fixed file was restored and its hash re-verified before the final
runs.

## Files changed — before/after sha256

| path | before (round-2 output) | after (round 3) | changed |
|---|---|---|---|
| `packages/cli/src/install.ts` | `9711b50716a47511693bc7ee870f96e3bb9bab15dc1d605d317566aa3444ce34` | `5e4abceab6be56981376e107d54490231d399ca38234975a7861413cecd506bd` | yes |
| `packages/cli/test/install.test.ts` | `e6c8a99906007fc67f570c6896d566d79e80b4d0ea42cac27b0e56ad8663161c` | `08d209a0a8b76b2b1234a64e7e0e323fd0167a498e98649a9eb0195827dc3c07` | yes |
| `docs/guides/prime-agent.md` | `dd9cee375d06d1c765306aba6b2a94fc80e80bc9aaccf02482db35625e424a91` | `cb7b4e9b3a8725de0ad2fb79d4d4fa191d9ed66210fb90c19d3da640db439dbc` | yes |
| `packages/cli/src/prime-agent.ts` | `0cf4b7869131265528a70817d8dc2cd9a5cf9df1ca8a615680f0b85172f8eaed` | `0cf4b7869131265528a70817d8dc2cd9a5cf9df1ca8a615680f0b85172f8eaed` | no |
| `packages/cli/test/prime-agent.test.ts` | `74db81235c3e3ca52be1c698b474b49871fbb276db4e55b32ddeba1fa2a4dcc5` | `74db81235c3e3ca52be1c698b474b49871fbb276db4e55b32ddeba1fa2a4dcc5` | no |

Frozen inputs after the round (byte-identical to the verified values above):
round 1 `622769…26f3`, round 2 `1cfcae…b3ca`, manifest `edc5f4…7fcb`.

## Checks run

| check | result |
|---|---|
| `bun test packages/cli/test/prime-agent.test.ts packages/cli/test/install.test.ts` | **85 pass / 0 fail** (round 2: 78; +7) |
| `bun test packages/cli` (4 files) | **119 pass / 0 fail** (round 2: 112) |
| `bun test` (whole repo, 23 files) | **374 pass, 1 skip (S3 integration gated), 0 fail** (round 2: 367 + 1 skip) |
| `bunx tsc --noEmit` | rc 0 |
| pre-fix revert of the F3 resolution + predicate | impostor test and override fail-open test both fail (promise resolves) |
| exec probe, installed `prime-agent 0.9.4`, disposable HOME/override | `mcp get` reads `<override>/settings.json` (exit 0 for a seeded entry) |

`git status --short` shows only the five overlay paths plus the two frozen
reports and the manifest; no scratch file of this worker remains in the repo
(scratch lived under `/tmp` and was removed).

## Residual boundary (recorded, non-blocking)

For an **absolute or `~`-prefixed** override — the documented and
fixture-verified form — the gate, the probe, the skills and the pinned CLI all
resolve to the same directory. A relative override is normalised against the
installer's working directory and pinned, so the installer and the CLI it drives
still agree; the CLI used directly with a relative override remains
cwd-dependent, which is its own `getAgentDir()` behaviour and not a property of
this fix.

## Routing, identity and retirement

- Parent agent id: `session-58b4497f-c639-4759-b40f-f67403d8cd41`; this result is
  delivered to that id with `send_message` as the handoff.
- No verification worker was spawned (round 4 is not authorized). Task owner:
  stop the cycle and seek the lead's recorded decision before release.
- Worker `nassun` (DeepSeek Harness Web `dsh`, alias verbatim
  **`deepseek-flash`**, session `ec5a67d4-93d4-44bf-868a-bac742d61f7c`) retires
  after this handoff.

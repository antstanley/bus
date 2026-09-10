# Prime adapter prerelease security — round 2 (Nassun)

Reviewer identity: `nassun` (DeepSeek Harness Web `dsh`; primary milestone
security reviewer). Clean-context verification worker, no inherited
conversation. Observed harness session id `33433c83-9d64-4e9c-a5eb-a84407fff248`.

Model identity: observed alias verbatim **`deepseek-flash`**. The runtime
exposes no version string; no "v4.1" or other version claim is made. The frozen
manifest's `allowed_model` ("deepseek-flash or any DeepSeek model") is satisfied
by that alias.

Round accounting: **cumulative security round 2 of at most 3** for this adapter
cycle. This is a no-change verification round: it edits no source or
documentation byte and writes only this report. It does not end the cycle
because it carries defects (below); round 3 remains available if the owner
changes bytes to remediate.

Verdict: **verification carrying defects.** F1 and F2 are verified effective
under the default configuration (no `PRIME_AGENT_CODING_AGENT_DIR` override) and
resist every falsification attempt that does not exploit the residual F3
mismatch. F3 is **mischaracterised as fail-closed only**; it also fails *open*
and defeats the F1 gate under a supported configuration (real-CLI confirmed). A
second, lower-impact weakness exists in the new ownership predicate. No
operational release, correctness approval or installation is inferred.

## Scope and revisions

- Isolated worktree: `/private/tmp/sidekick-task507-security-nassun`.
- Branch `task507-security-nassun`; baseline
  `3c02bda76e9abb27a5675f3acd3b3bee90fceef6` (= `HEAD`); round-1 overlay applied
  as uncommitted modifications/untracked new files.
- Frozen inputs re-verified before analysis:
  - `docs/security/2026-09-10-prime-adapter-round1.md`
    sha256 `6227694214b2dbba5e8891c1ee7aaf88c18271c9bd8e377db181c3bddb3f26f3` —
    matches.
  - `docs/security/2026-09-10-prime-adapter-inputs.json`
    sha256 `edc5f4646e3d913b17f0503ec0e2b2f6c317aeef7158dbdbb5672350e1827fcb` —
    matches.
- Read-only context reviewed: `DESIGN.md`, `docs/research/04-trust.md`,
  `docs/security/MILESTONES.md`,
  `backlog/507-prime-agent-adapter-daemon-send-wake.md`.

### Recomputed output hashes (all five match the assignment exactly)

| path | recomputed sha256 | expected prefix |
|---|---|---|
| `packages/cli/src/prime-agent.ts` | `0cf4b7869131265528a70817d8dc2cd9a5cf9df1ca8a615680f0b85172f8eaed` | `0cf4b786…` ✓ |
| `packages/cli/test/prime-agent.test.ts` | `74db81235c3e3ca52be1c698b474b49871fbb276db4e55b32ddeba1fa2a4dcc5` | `74db8123…` ✓ |
| `docs/guides/prime-agent.md` | `dd9cee375d06d1c765306aba6b2a94fc80e80bc9aaccf02482db35625e424a91` | `dd9cee37…` ✓ |
| `packages/cli/src/install.ts` | `9711b50716a47511693bc7ee870f96e3bb9bab15dc1d605d317566aa3444ce34` | `9711b507…` ✓ |
| `packages/cli/test/install.test.ts` | `e6c8a99906007fc67f570c6896d566d79e80b4d0ea42cac27b0e56ad8663161c` | `e6c8a999…` ✓ |

### Scope containment — PASS

`git diff --name-status 3c02bda…` reports exactly `M packages/cli/src/install.ts`
and `M packages/cli/test/install.test.ts`; the remaining three in-scope paths are
untracked new files (`packages/cli/src/prime-agent.ts`,
`packages/cli/test/prime-agent.test.ts`, `docs/guides/prime-agent.md`). No other
tracked or untracked product path differs. `packages/mcp/**`, `packages/core/**`,
the CLI entrypoint and all task-202 paths are byte-identical to baseline; Essun's
shared candidate was not touched. No live settings, board, credentials, install
or restart changes were made; all fixtures were disposable `mkdtemp` homes with
`HOME`/`TMPDIR` redirected.

## F1 — adversarial verification of the fix

Method: disposable-HOME fixtures driving `installRuntime` with both a scripted
`PrimeRunner` settings double and the real installed `prime-agent 0.9.4`
(`/Users/stan/.local/.../bin/prime-agent`). The five-file source was not edited.

Falsification attempts and results (18 fixture scenarios + 8 real-CLI scenarios;
26/26 behaved consistently):

| attempt | observed result |
|---|---|
| install over a foreign `board-prime-agent` | refused `refusing to replace non-board prime-agent MCP server`, settings byte-identical, **no** `mcp add` |
| uninstall over a foreign entry | refused `refusing to remove non-board…`, byte-identical, **no** `mcp remove` |
| `--dry-run` install/uninstall over foreign | refused, byte-identical, no mutating call |
| unparseable `settings.json` (probe claims present) | refused, byte-identical, no add |
| missing `settings.json` (probe claims present) | refused, no add |
| `mcpServers` = array / string / null | refused, file unchanged, no add |
| unreadable `settings.json` (mode 000) | `EACCES` propagates, **no mutation** (fail closed) |
| symlinked `settings.json` → foreign target | refused, target byte-identical |
| dangling symlink | refused, no add |
| owned entry register / update (`board`→`board-2`) / uninstall, real CLI | updated in place (`--force`), args propagate, uninstall removes only `board-<author>` |
| plain re-add without `--force` over a foreign name (real CLI) | exits 1, settings unchanged (probe-absent path cannot clobber) |

Conclusion: for the default configuration the gate genuinely fails closed,
refusals leave `settings.json` byte-identical, owned entries still update and
uninstall, and no command/args shape tested gets a foreign entry replaced
through the ordinary path. The **one** successful bypass is the F3 override
mismatch below.

## F2 — result

Verified fixed. `--uninstall --dry-run` now performs only
`primeMcpServerInstalled` plus the read-only ownership probe; `mcp remove` is
never invoked. Fixture and real-CLI evidence: calls are exactly
`[["mcp","get","board-prime-agent"]]`, a board-owned `settings.json` is
byte-identical, the planned package removal is reported as `Would remove …`
without deleting files, and the ownership gate still refuses a foreign entry.
Structurally, `install.ts:178-182` gates the dry-run path away from
`removePrimeMcpServer`. No falsification of the F2 fix succeeded.

## F3 — independent assessment (corrected characterisation)

Round 1 recorded F3 as a residual that "fails closed". That is **incomplete**.
The installer resolves the ownership probe and the skill package under
`options.home/.prime/agent` (`install.ts:146`, `readPrimeMcpServers`), while the
real `prime-agent` honors `PRIME_AGENT_CODING_AGENT_DIR` (confirmed with the
installed binary: with the override set, `mcp add` wrote only
`<override>/settings.json` and not `<home>/.prime/agent/settings.json`). The
gate therefore reads a **different file** than the CLI mutates.

- Fail-closed direction (round 1): gate file foreign/missing, effective dir
  owned → update/remove refused. Reproduced.
- **Fail-open direction (missed by round 1):** gate file owned, effective dir
  foreign → the gate approves on the wrong file and `mcp add --force` clobbers
  the foreign server. Reproduced with the real CLI: a foreign
  `board-prime-agent` in the override dir was force-replaced by the board
  definition while the gate file was left unchanged. The skill package is also
  written where Prime does not discover it.

Real impact: whenever an operator sets the documented `PRIME_AGENT_CODING_AGENT_DIR`
override *and* a stale board-owned entry remains in `<home>/.prime/agent/settings.json`,
the F1 ownership guarantee does not hold for the effective directory. This
should be **fixed**, not accepted on the stated "fail-closed" basis: resolve
`agentDir` with the same rule as the CLI's `getAgentDir()` (tilde-expanded env
override, else `<home>/.prime/agent`) for both the probe and the skill paths, or
gate on the file the CLI actually reads. If the lead instead accepts it, the
acceptance must be written against the fail-open direction and the operational
requirement that the override be unset.

## New defect / weakness introduced by the round-1 fix (Low)

`isOwnedPrimeMcpServer` (`install.ts:393-402`) returns true when **any** command
or args token equals `mcpPath`; the accompanying comment and
`docs/guides/prime-agent.md` claim the definition "must run this repository's
`packages/mcp/src/index.ts`", which is stronger than the predicate. Fixture
evidence: an entry `{command: "/usr/bin/evil-server", args: ["--config", <mcpPath>]}`
occupying `board-prime-agent` is classified owned, the gate approves, and it is
force-replaced. This is a configuration-integrity over-classification rather
than a privilege boundary (the actor already controls the same user's
settings), so severity is Low; the sibling `isOwnedOpenCodeMcp` requires the
command array to be `[executable, mcpPath]` and is narrower. Recommend tightening
the predicate to require `mcpPath` in the executable position, and correcting the
comment/guide wording.

## Test adequacy

The changed tests do exercise the dangerous paths, not only the happy path:
`install.test.ts` covers foreign-server install refusal with a byte-identical
settings assertion and a no-`add` assertion, foreign uninstall refusal,
dry-run-uninstall read-only behaviour, and foreign skill-file refusal before any
MCP mutation; `prime-agent.test.ts` covers authorizer ordering (after probe,
before mutation), abort-before-mutation, and the already-installed/absent cases.

Coverage gaps (not defects; verified externally by this round): no committed
test for unparseable/missing/unreadable `settings.json`, non-object
`mcpServers`, symlinked settings, the token-impostor predicate, or the
env-override divergence. Adding regressions for the first four and for the F3
fail-open case would be worthwhile in the remediation round.

## Checks run (all re-run independently in this round)

| check | result |
|---|---|
| `bun test packages/cli/test/prime-agent.test.ts packages/cli/test/install.test.ts` | **78 pass / 0 fail** |
| `bun test packages/cli` (4 files) | **112 pass / 0 fail** |
| `bun test` (whole repo, 23 files) | **367 pass, 1 skip (S3 integration gated), 0 fail** |
| `bunx tsc --noEmit` | rc 0 |
| adversarial fixture harness (scripted runner) | 18/18 expected outcomes |
| adversarial real-CLI harness (`prime-agent 0.9.4`, disposable HOME) | 8/8 expected outcomes |

The whole-repo counts match round 1 exactly. `git status --short` shows only the
five overlay paths plus the two frozen security documents; no scratch file of
this worker is in the repo (fixtures live under `/private/tmp/nassun-r2`).

## Process observation (non-blocking)

`docs/security/MILESTONES.md` contains no "Prime adapter" / task-507 milestone
entry in this snapshot, so this cycle's baseline, scope owner and round counter
are established by the assignment and the frozen input manifest rather than the
register. Flagged for the lead's bookkeeping; it is outside the five-file scope
and does not affect this verification.

## Routing, identity and retirement

- Parent agent id: `session-58b4497f-c639-4759-b40f-f67403d8cd41`; this result is
  delivered to that id with `send_message` as the handoff.
- Worker `nassun` (DeepSeek Harness Web `dsh`, alias verbatim **`deepseek-flash`**)
  retires after this handoff. This round changed no bytes; F1/F2 are verified
  effective under the default configuration, and the F3 correction plus the
  predicate weakness require an owner fix-or-accept decision before any release.

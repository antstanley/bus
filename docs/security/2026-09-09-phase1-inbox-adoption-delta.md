# Inbox adoption delta security review — phase 1 (task 205, security round 1 of 3)

Clean GLM 5.3 Flash security reviewer-remediator (runtime model
`zai-coding-plan/glm-5.3-flash`), 2026-09-09, OpenCode owner; scope transferred
from the withdrawn OpenCode Reviewer dispatch (`20260909T101602Z-codex-1a41` →
`20260909T102938Z-codex-2594`) with no prior worker start. No inherited
conversation, bus, child workers, installs, network, model probes or live
board/store/git-write activity. All substantive analysis ran in a disposable
`git archive` extraction of the fixed commit under the approved temp directory
(no worktree/branch/index writes); shared main and Letta's removed worktree were
never written. Threat model: `docs/research/04-trust.md`.

## 1. Verdict

**SECURITY PASS — clean no-change** for the previously uncovered inbox-adoption
scope, security round **1 of 3**. Zero artifact/test edits; no unresolved
findings; applicable evidence carries on unchanged bytes. The whole
remote-board milestone and the live cycle remain **held with Hoa**; this report
claims no live acceptance, delivery or rollout authorization.

## 2. Baseline, pins and manifests

Fixed baseline `f37b83b7f4b8e3a37dfb18d1979caed4826c892c` (verified commit,
"Add addressed inbox views and persistent local read markers"); base
`bcda545f3964f5a523bd2fbc9f43a971b1c7f62b` verified. Delta confinement
re-verified by `git diff --stat`: exactly the seven product paths plus two
read-only bookkeeping files (`backlog/205-addressed-inbox-view.md`,
`backlog/INDEX.md`). All seven pins were hashed in the isolated archive before
analysis and match the root-corrected parent-205 manifest byte-for-byte;
input = output (zero edits):

```text
dc5441422aaa1043c4e90e22fbddf7aca969a2090e5b915f5b1393cae590607b  packages/index/src/index.ts
c75f7d0a00bb4e642978de80c7efc8a772ef01f08fce747c0f8bc8112a38db80  packages/index/README.md
dc822785d1680d4da98288e42bd963ad41a488e06d07e1284dbd1dca88989ac6  packages/index/test/inbox.test.ts
027ee1229ecac679e2e5f24a112e6efa140799281a18b491224533ec63850809  packages/cli/src/index.ts
db363237b6506b614ceade250ad3c7d5dd19de2a9e5c1f648bbd604296a77a8b  packages/cli/test/cli.test.ts
cf0748bc921a8610a7d6f09c401f1baed8412f243919677ca25a97edc4932569  packages/mcp/src/server.ts
16bbb0579f9791d89694a2b37d99b6308557db859d7ec6374e8b13d2ddf733d1  packages/mcp/test/mcp.test.ts
```

Read-only installed interaction inputs (observed live-tree hashes):

```text
3835b0ff256525089c0cec06d417e1e6d1710101e41b87cd47946ce5ec951a3f  opencode.json
656b229eb0f9783c5d8fa4dca002223a2f785dbef28fbc3460f984858c53ffec  .opencode/plugins/board.ts
```

Read-only context hashes:

```text
10418a706251ae16eb3f12b00071515792172f1b687157840d43ddeff9520cfd  AGENTS.md
ed81d2c8ddc43d19cf2308669fcab17be20c9c98472d50f75cb3eb1a328ef605  DESIGN.md
ae12b734bd6372eb9388febac85a24dbb328161fbcb6011ce87461c60a2d7814  docs/research/04-trust.md
cf0f78c2012fac581b7f67693e255252c8f71cdd357471ab7f046342a5cca175  docs/agents/task-workflow.md
56cee49fd4ef87a7e7a19fcefd1af5a315d7bd0bdeda0fa53fc946334763a625  docs/agents/opencode.md
0d4ccfaaf23b1810591146740bfe63a05f0c485ca7b331da01f55806e7dcba42  docs/security/MILESTONES.md
be6a1b4611176bbf40e811d3b41291d4e16460b6223c31f008dc74f42e95a3b8  backlog/205-addressed-inbox-view.md
f712fc3b48e21916f0253757de694779775b5480631009a1eb3c052c3abcc446  backlog/INDEX.md
3a616b8c70cbc1d4e657baf613f5fe20433782aa640844ad8f0087238af91d1e  docs/security/2026-09-08-remote-board-policy-milestone.md
897f98810319ce14b06729afa872835c993fb3c4f1e4639c33d342aabcf50fb2  docs/security/2026-09-08-remote-board-runtime-milestone.md
860589307e4e9f7431f01d7d92dd31d771d2d504f7b975dbbef18048585c3ccd  docs/security/2026-09-08-remote-board-helper-milestone.md
cc99f04fc1a96d0488b6f33ee672815cfc235466bc08536a4abc4d6ca596199f  docs/security/2026-09-09-remote-board-combined-round2.md
```

`MILESTONES.md` hashes `0d4ccfaa…` vs the combined-round2-era pin `8446b001…`:
the delta is the appended assignment/dispatch register sections (disclosed lead
bookkeeping class, consistent with prior rounds' reconciliation); no reviewed
product byte is affected. The three prior report hashes match the
register-recorded values exactly.

## 3. Delta assessment — new findings requiring edits: none

The delta adds: an `addressees` table (ingest + bulk paths) with a same-version
backfill migration; a `read_markers` table preserved across syncs, restarts,
rebuilds and version-mismatch schema drops; `BoardIndex.inbox()`/`markRead()`;
CLI `inbox`/`inbox-read` (with `--id` repeat accumulation) and MCP
`board_inbox`/`board_inbox_read`; tests and README documentation. Verified
properties (static analysis in the isolated archive):

- **SQL handling:** every new query is static SQL with bound parameters; no
  store- or client-controlled data reaches SQL text (the only interpolation is
  the constant `PRAGMA user_version`). Invalid/unknown agent names, board names
  and post ids match nothing; they cannot inject or enumerate.
- **Inbox semantics:** `to[]`/`mentions` dedup via `UNION`; newest-first ULID
  ordering; listing is non-destructive; `markRead` is explicit, idempotent,
  per-(agent, board, post), skips non-indexed ids, and reports true new-mark
  counts; `limit`/`offset` are validated positive/non-negative integers.
- **Migration safety:** `SCHEMA_VERSION` is unchanged (3), so existing indexes
  take the additive path (CREATE IF NOT EXISTS + transactional `INSERT OR
  IGNORE` backfill from stored post JSON whose `to` entries core already
  validates via `assertName` at ingest); a version-mismatch rebuild drops
  derived tables but keeps markers by design, documented and tested. The
  backfill is idempotent, so the shared local index used by concurrently
  installed CLI/MCP/hook processes (per the observed `opencode.json` /
  `board.ts` wiring) upgrades safely; read markers are separate from the
  hook/MCP delivery receipt tables, so delivery surfaces cannot mutate inbox
  state.
- **Untrusted-data handling:** MCP inbox results pass through the unchanged
  `toolResult`/`labelUntrusted`/`labelRecord` path — record-level
  `trust: "unsigned"` and author provenance spread after store data; the
  injection-label test coverage was extended to `to[]`. No new network, exec,
  secrets or URLs; tests are MemoryStore/tmpdir-local.
- **Docs:** `packages/index/README.md` claims match observed behavior
  (dedup, non-destructive listing, marker persistence/rebuild behavior,
  backfill, orphan-marker bounds).

Observations, disposed with no change (report-only): (1) `board_inbox_read`
`ids` has no array/item size cap — it matches the existing `STRING_ARRAY`
precedent (`board_post` tags/mentions), arguments are local-client trust
domain, and per-id work is indexed; no store-boundary crossing. (2) MCP inbox
tools are per-board scoped while the CLI defaults to cross-board — an ordinary
semantics choice already accepted by the task's correctness rounds; no security
impact. (3) CLI inbox JSON output is unlabeled, identical to the existing CLI
`read` convention; trust labelling is enforced at the hook/MCP delivery
surfaces by design.

## 4. Covered / uncovered scope

Covered: the seven pinned paths at `f37b83b` (full delta plus the surrounding
migrate/rebuild/ingest/labelling code it interacts with) and the two installed
config interaction inputs. Uncovered by design: all other product bytes (they
remain under their own recorded coverage — runtime eight-path round1, policy
round2, combined 25-path round2, each to its exact pinned bytes); any future
change to these seven paths (requires a fresh GLM delta verification round);
actual live adoption, participant readiness and rollout gating (tasks 109/110).

## 5. Checks — carried vs newly run

- Newly run (read-only): SHA-256 of the seven pins in the isolated archive and
  of config/context inputs; `git rev-parse` of both pinned commits;
  `git diff --stat` delta confinement; static analysis of the delta and
  interaction surfaces (§3).
- Carried without rerun (unchanged bytes; lead-verified existing evidence):
  exact-commit CI run 34339206661 SUCCESS and CLI packaging run 34339206667
  SUCCESS at `f37b83b`, plus the parent-recorded ordinary-round scoped/root
  test and typecheck results.
- Not run, by prohibition/authorization: no test or typecheck execution — the
  prior helper typecheck denial was neither retried nor worked around; no
  installs; no live board/store operations. No fix was required, so no
  `apply_patch` (or any) artifact write occurred; no evidence was invalidated.

## 6. Round accounting and cleanup

Inbox-adoption security scope: round 1 of 3 complete, clean no-change pass —
no next round triggered. Cumulative counts preserved separately: policy 2/3,
runtime 1/3, helper 1 (BLOCKED) + 2 (clean) — no resets. Owned cleanup: the
isolated archive and delta scratch files are deleted; `git status` over
`packages/` is clean; no processes, sessions, worktrees, branches or bus/board
activity were created. Coordination-temp files `adoption205-runner.*` in the
shared temp directory are not this worker's and were left untouched.

This pass is milestone evidence only. It does not authorize the live cycle,
delivery, or release; those remain gated on Hoa's milestone disposition and
task 109/110.

# Finding discovery — cumulative changed delta f37b83b..fe382d305db19078446750020ede9f6b9a0d5348

Scan mode: `diff` (Git-backed change set). Baseline `f37b83b`, candidate `fe382d305db19078446750020ede9f6b9a0d5348`
(milestone "remote-board adoption/final cycle", cumulative security round 3).

## Deterministic worklist

`rank_input.jsonl` was generated with
`generate_rank_input.py make-diff-rank-input --mode revisions` and every row was
copied verbatim into `deep_review_input.jsonl` (4 rows, no ranking/dropping):

| Row | Path | Receipt | Disposition |
|---|---|---|---|
| 1 | `packages/cli/src/install.ts` | wl-001 (full read, 1225 lines) | reviewed; cand-01/cand-02 suppressed |
| 2 | `packages/store-fs/src/index.ts` | wl-002 (full read, 513 lines) | reviewed; cand-03 suppressed |
| 3 | `scripts/codex-coordination-monitor.py` | wl-003 (hash-identity check) | not applicable — separate exact-byte gate |
| 4 | `scripts/test-codex-coordination-monitor.py` | wl-004 (hash-identity check) | not applicable — separate exact-byte gate |

Supporting files added back because the frozen package lists them and they are
needed to understand the changed behaviour: `packages/cli/test/install.test.ts`,
`packages/store-fs/test/store-fs.test.ts`,
`packages/store-git/test/store-git.test.ts`, and the changed governance
documents (`AGENTS.md`, `SECURITY.md`, `docs/agents/*`). Receipts are wl-005..wl-019.

## Candidates

1. **cand-01** — generated OpenCode plugin deletes local presence-routing
   records by session digest on `session.deleted` / process exit
   (`packages/cli/src/install.ts:507-525,580-584`). Suppressed at validation:
   hex-digest path construction, per-instance tracking, and an existing
   regression test proving a second instance's record survives.
2. **cand-02** — the 45s idle-presence refresh can keep advertising a session
   that never emits a deletion event (`packages/cli/src/install.ts:527-566`).
   Suppressed at validation: local-only/self-only impact, delivery still
   requires online+fresh+idle+reachable loopback routing and logs failures.
3. **cand-03** — filename-less watcher events bypass the `.git` metadata filter
   (`packages/store-fs/src/index.ts:212-224,432-436`). Suppressed at validation:
   local watcher probe shows `.git` writes still report concrete filenames, the
   debounce/consumer guards bound wake rate, and the pre-change behaviour for an
   undefined filename was a thrown `TypeError`.

## Distinct families

The changed code touches three families: process/child lifecycle and cleanup,
local presence/heartbeat state, and filesystem watch hints. No injection,
deserialization, path-traversal, authz, SSRF or credential-handling control is
changed by this delta; those families were confirmed absent from the changed
hunks rather than enumerated repository-wide.

## Discovery conclusion

No technically plausible candidate survived with a realistic attacker path and
material security impact. No reportable finding was carried to attack-path
analysis, so that phase has no rows to process.

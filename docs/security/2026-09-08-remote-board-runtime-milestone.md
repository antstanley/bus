# Security review — remote-board milestone, runtime scope (task 108, security round 1 of 3)

Clean GLM 5.3 Flash security reviewer-remediator, 2026-09-08. Requested
provider/model: `zai-coding-plan/glm-5.3-flash` (recorded as the request; the
coordinator verifies runtime selection). Isolated-tree execution: HEAD archive
plus only the eight candidate paths, frozen dependencies copied in with
relative links; no bus, board, install, git-write or network activity; the only
workspace writes are this report. Threat model: `docs/research/04-trust.md`.

## 1. Verdict

**SECURITY PASS — clean no-change** for the runtime eight-path sub-scope.
Cumulative security round **1 of 3** for the newly assigned milestone runtime
assessment (per the lead disposition of 2026-09-08; prior accepted exact-byte
cycles remain carried evidence, not additional rounds). Zero artifact edits;
all candidate bytes are identical to the previously accepted frozen pins and
all checks pass, so the fresh-review trigger is not set. The whole milestone
remains **pending**: the policy sub-scope, helper/144 coverage and combined
final-candidate verification are separate obligations; no milestone pass and
no release/rollout approval is claimed or implied.

## 2. Baseline, candidate manifest and pin verification

Baseline HEAD: `b11145c7be4e32dec22599f11737ea663d158785` — matches the
milestone register's inventory anchor; no commits after it exist. Candidate =
working-tree bytes of the eight reserved paths, overlaid on a `git archive` of
that HEAD. SHA-256 computed before assessment (full eight-file manifest):

```text
b79efc8fc45c6c4ebfe8d3c60bc3db6deb039b92eb8179270e3d1b83fdc5f2c4  packages/hooks/README.md
3ece3abb374f7aa9d59a6b7c2cc31cd8c3b64e2da1e9f7074ee6b9e1fd52df35  packages/hooks/src/board-hook.ts
6485b292fdedaa6fc2f7283b4cdd128bc4b227a2f6efde0dda3d666a98b669db  packages/hooks/test/hooks.test.ts
22346bcacc20d9e435e898fa3106c3518b4f283c1027f3cbf2500c1d4f1561c0  packages/mcp/README.md
dc1b80c477b8b78274a272427714fbd3e46b73b17dace5d31f2c370f3684eb33  packages/mcp/src/server.ts
f5e52c62c2d2f8d39fd7105b2edfc59b0961c9b28669d627687e6bed3625ae74  packages/mcp/test/mcp.test.ts
bbf4e61bc2e324fe792d60efebeadd9fd58a014bfa6976ddc96c19b19b23d60b  fixtures/hygiene/README.md
dec7ac909b8d17b0eed787493e82585d5e06d8ea2ee73038789dcb267a6984de  fixtures/hygiene/board.json
```

All eight match the lead-observed manifest in parent 108
(dispatch `20260905T205939Z-codex-3eab`) exactly: the frozen candidate has not
changed by a single byte since its acceptance. HEAD-side hashes of the six
tracked files differ (they are uncommitted candidates over `b11145c`); the
fixture pair is untracked. Read-only milestone metadata hash, captured with
the manifest:

```text
be2490441c80bfd4a03ba9744dcea8d9730d28020c2bc30aa7caefd8ddec36c6  docs/security/MILESTONES.md
ae12b734bd6372eb9388febac85a24dbb328161fbcb6011ce87461c60a2d7814  docs/research/04-trust.md (context)
```

## 3. Carried coverage (verified against current bytes, not inherited)

- `docs/security/2026-09-05-task108-final-gate.md` — ACCEPT. Covers the exact
  current bytes of `packages/hooks/README.md`, `packages/hooks/src/board-hook.ts`,
  `packages/hooks/test/hooks.test.ts`, `fixtures/hygiene/README.md`,
  `fixtures/hygiene/board.json` (pins match this manifest).
- `docs/security/2026-09-05-task108-mcp-trust-delta-gate.md` — ACCEPT; the
  accepted minor (delivery-metadata `trust` authority) **closed**. Covers the
  exact current bytes of `packages/mcp/src/server.ts`,
  `packages/mcp/README.md`, `packages/mcp/test/mcp.test.ts` (pins match).
- `20260906T135204Z-letta-02cb` — isolated composition validation of
  `b11145c` + only these eight paths: 305 passed / 1 skip / 0 failed,
  root typecheck exit 0, links inside the snapshot.
- Scoped correctness READY `20260905T150053Z-opencode-reviewer-7e23` and the
  task 404/130 committed integration included in the 2026-09-06 composition.

This round re-verified the load-bearing properties of the current bytes rather
than assuming the reports: hook delimiting (`| ` prefix after normalizing the
full separator set, header with author/board/id/`trust unsigned`, 200-post and
byte caps, fail-closed final re-check, transactional claims, per-candidate
store re-verification, hashed 0600 session-registry records with symlink/owner
checks, allow-listed argv, fail-silent degradation); MCP trust framing
(server-stamped record-level `trust`/`provenance` spread after store data,
resource metadata that never echoes untrusted titles, bounded typed inputs
with `additionalProperties: false`, ≤512-byte board-bound canonical cursors,
fixed/client-input-only error strings); fixture injection posts asserted
labelled across hook and MCP delivery surfaces and both resource views; README
trust sections state exactly what the code does, including nested `trust`
lookalikes being attacker data.

## 4. Cumulative delta assessment

- **Runtime dependencies unchanged since coverage.** HEAD is the same commit
  the 2026-09-06 composition validated; working-tree modifications since then
  are governance/docs/backlog deltas plus untracked out-of-scope files —
  nothing under `packages/` other than the six reserved hook/MCP paths.
  Supporting modules consulted read-only: `packages/hooks/src/config.ts`
  (installer-authoritative argv, ambient-identity drop), core post key-set
  rejection (record-level `trust` lookalikes unreachable at ingest), session
  registry and store spec validation — consistent with the carried reports.
- **Prior accepted findings remain disposed.** The three logged hardening
  items (heartbeat `status` unbounded but local-client-facing; redundant
  per-resource poll syncs; two labelRecord test-depth notes, unreachable via
  core's closed post key set) stay accepted/disposed with the lead's recorded
  dispositions; none was re-opened. No new blocker, major or minor finding.
- **Report-only observations, outside this scope** (for the lead; not edited
  here): (1) an untracked credential-named CSV sits at the repo root
  (`agent-s3_accessKeys.csv`); it was not opened per hygiene policy, but it is
  secret-shaped material in the tree ahead of integration and should be
  removed/ignored by its owner. (2) Untracked `scripts/phase1-acceptance.ts`
  is outside this composition (task 110 scope) and outside the validated set.

## 5. Checks (isolated tree, this round)

1. Isolated build: `git archive b11145c` + the eight candidate files + frozen
   `node_modules` copies (root and per-package). Symlink audit: 297 links,
   **0** resolve outside the tree; **22** workspace links all resolve to
   `packages/*` inside it; no absolute-path links. No link back to the live
   checkout; the live tree was never written.
2. Candidate pins re-hashed inside the tree after the audit: all eight equal
   the §2 manifest.
3. `bun test` (root, isolated tree): **305 pass / 1 skip (live-S3
   environment) / 0 fail, 2,027 assertions, 21 files — exit 0.** Identical to
   the carried 2026-09-06 composition counts.
4. `bunx tsc --noEmit` (root, isolated tree): **exit 0.**
5. `git status` before/after in the live tree: untouched by this worker except
   this report file.

No artifact edit was required, so no `apply_patch` fix pass occurred.
Process note: `apply_patch` is not installed in this harness; this evidence
report used the harness's native file tool, per parent 131 precedent, recorded
as a process deviation. No reserved artifact byte was modified with any tool.

## 6. Round accounting and unresolved coverage

- Runtime/108 milestone assessment: this is **round 1 of 3**. Clean no-change
  pass recorded here; no reset of any other cycle. If any of these bytes
  change, a fresh clean GLM 5.3 Flash reviewer is required before approval.
- Still pending for the milestone (not covered here, no pass claimed):
  policy sub-scope report `2026-09-08-remote-board-policy-milestone.md`
  (separate round 2-of-3 cycle), helper/144 security review (awaits its
  corrected frozen snapshot), and GLM-only cross-scope interaction/delta
  verification against one final candidate. Release/rollout stays gated;
  the existing rollout hold stands.
- Uncovered by design: supporting modules outside the eight paths remain under
  their own packages' milestone coverage; the untracked out-of-scope files in
  §4 are the lead's to scope.

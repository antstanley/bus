# Helper milestone security review — combined completion (helper round 2 of 3)

Requested worker model: `zai-coding-plan/glm-5.3-flash` (recorded as the
request; runtime identity is coordinator-verified, not self-attested). Fresh
clean context; no bus activity, child workers, git writes, installs, posts or
live board operations; no test or typecheck execution. Authorized editable
scope: `scripts/phase1-acceptance.ts`, `docs/acceptance/phase-1.md` and this
report. Persistence note: no `apply_patch` route exists in this harness
(verified absent from `PATH`), so the worker wrote no files; this report text
is returned verbatim for coordinator apply_patch persistence, per the helper
round-1 precedent. Original prior reports preserved unchanged.

## 1. Scope, baseline, and 25-path pin verification

Fixed baseline `ba567d59d604e2dacfb4cbf6084b88501e8bc658` (verified commit);
HEAD `6ce18baa685cd87e52e59ca67da355b6a17fe788` treated as coordination
metadata and reconciled, not silently adopted as new coverage. Candidate: 25
product paths = policy 15 artifacts (per the parent-131 reconciliation: the
policy report's 16-row reserved manifest minus the excluded changing test
log) + runtime 8 paths + helper 2 paths. Every hash below is a working-tree
SHA-256 computed this round; input = output (zero changes):

```text
10418a706251ae16eb3f12b00071515792172f1b687157840d43ddeff9520cfd  AGENTS.md
5e7591739d9abc9231638a6460d8cda4ce26b176867048a62f9c5619c1249a53  ROADMAP.md
72504e0ef72ca0b87c29b9fbf5279891b38245ee56c4bd039eaa73058ce0de46  SECURITY.md
8523e48f9d8d86ed71771bd8c4e835026e7c0ebe1e1e8156c52e4ab4f265e9e8  backlog/README.md
ed81d2c8ddc43d19cf2308669fcab17be20c9c98472d50f75cb3eb1a328ef605  DESIGN.md
018277eeeba634672495b4e200784f991d52ee7c812f9a5b222da711a13f72dc  docs/agents/README.md
cf0f78c2012fac581b7f67693e255252c8f71cdd357471ab7f046342a5cca175  docs/agents/task-workflow.md
5fd148fda7bc5a78a80b764a7a3751d15f2f2c350e80f986d7a800c05b891478  docs/agents/claude.md
a80a75b8847d7130a648abc20245bec6fc7b53b25f131fd217b71dd4cf4ed239  docs/agents/codex.md
a8268145e54805b0ec6a117073fce3f5655536d26aa324b3edbf1b4e2eace766  docs/agents/codex-architect.md
1cf3b3cbe21f67ee2cfe53d61f3cdba326bfdd9a245f32f69365124e55389b74  docs/agents/letta.md
6b1d26bda4fa37051766daa3775dbf75d9cc4c14cd54fb1f75be256101e52754  docs/agents/letta-flash.md
56cee49fd4ef87a7e7a19fcefd1af5a315d7bd0bdeda0fa53fc946334763a625  docs/agents/opencode.md
35bfe1cc7da306aa93a3bf15ca4da562a95b7b926c510fcb2e90f7e07471a79a  docs/agents/opencode-reviewer.md
8446b00145b07ef7c72b1720d10aa5f5dd6765b5ef79e1fbe5e244cf016f1028  docs/security/MILESTONES.md
b79efc8fc45c6c4ebfe8d3c60bc3db6deb039b92eb8179270e3d1b83fdc5f2c4  packages/hooks/README.md
3ece3abb374f7aa9d59a6b7c2cc31cd8c3b64e2da1e9f7074ee6b9e1fd52df35  packages/hooks/src/board-hook.ts
6485b292fdedaa6fc2f7283b4cdd128bc4b227a2f6efde0dda3d666a98b669db  packages/hooks/test/hooks.test.ts
22346bcacc20d9e435e898fa3106c3518b4f283c1027f3cbf2500c1d4f1561c0  packages/mcp/README.md
dc1b80c477b8b78274a272427714fbd3e46b73b17dace5d31f2c370f3684eb33  packages/mcp/src/server.ts
f5e52c62c2d2f8d39fd7105b2edfc59b0961c9b28669d627687e6bed3625ae74  packages/mcp/test/mcp.test.ts
bbf4e61bc2e324fe792d60efebeadd9fd58a014bfa6976ddc96c19b19b23d60b  fixtures/hygiene/README.md
dec7ac909b8d17b0eed787493e82585d5e06d8ea2ee73038789dcb267a6984de  fixtures/hygiene/board.json
e5cc85ac4ca1f21f60f6988d43ea51873f79080aa28f06fd9166fc7231b33b4e  scripts/phase1-acceptance.ts
822d84f02fc1731193fbb741ffea9bc53491bccd7e517b6d8f18c95eebf06032  docs/acceptance/phase-1.md
```

Pin reconciliation (no silent baseline change):

- 14 of 15 policy artifacts byte-match the policy round-2 manifest exactly.
- `docs/security/MILESTONES.md`: policy-era pin `be249044…` → current
  `8446b001…`. Verified via `git diff ba567d5..HEAD` that the delta is three
  appended register sections only (helper round1 blocker + round2
  authorization dispatch `20260908T104426Z-codex-1774`; round1 retirement
  confirmation). Disclosed lead/coordinator assignment/bookkeeping class,
  same class the policy report §4 accepted; reviewed policy wording rows are
  unchanged. Not a policy-artifact change.
- Excluded changing test log `docs/agents/model-spawn-test-2026-09-08.md`
  now hashes `9d83933c…` — continued expected probe/cleanup bookkeeping under
  Hoa's recorded F-1 disposition in parent 131; excluded from the gated
  policy artifact set. The unsigned-evidence chain-of-evidence caveat stays
  open until phase-3 signing (report-only).
- All 25 paths are clean vs HEAD (path-scoped `git status` empty); commits
  `ba567d5`→`6ce18ba` are backlog/coordination bookkeeping only. Product
  bytes are identical across `b11145c` (policy/runtime review baseline),
  `8e06278` (helper round-1 baseline; exact-head CI `34214935470`),
  `ba567d5` and the working tree, so carried evidence applies to unchanged
  relevant bytes.

Prior report inputs verified read-only: policy report
`3a616b8c70cbc1d4e657baf613f5fe20433782aa640844ad8f0087238af91d1e`, runtime
report `897f98810319ce14b06729afa872835c993fb3c4f1e4639c33d342aabcf50fb2`,
helper round-1 report
`860589307e4e9f7431f01d7d92dd31d771d2d504f7b975dbbef18048585c3ccd`; parent
144 (round-2 authorization), MILESTONES.md, task-workflow, DESIGN, SECURITY,
research-04 and done/108 + done/131 evidence read this round.

## 2. Carried evidence (unchanged bytes; not rerun)

- Policy/131: security round 2 of 3 **PASS — no-change** (its completed
  cycle, preserved; ordinary correctness round 2 separate).
- Runtime/108: security round 1 of 3 **SECURITY PASS — clean no-change**;
  all eight pins re-verified byte-identical this round.
- Helper/144: ordinary correctness round 1 CORRECT/COMPLETE on identical
  bytes; helper round-1 GLM checks on these exact bytes (nine fail-closed
  probes exit 1, smoke exit 0 with 8 guards, root bun test 306/1 skip/
  0 fail) carried.
- Exact-head CI `34214935470` at `8e06278` — "Tests and typecheck" job and
  "Run typecheck" step SUCCESS, lead-verified — carried as the typecheck
  evidence for the unchanged helper/guide bytes, exactly as the round-2
  authorization permits. The denied typecheck execution and equivalents/
  workarounds remain prohibited; nothing was rerun absent changes or new
  concerns.
- Historical: 2026-09-05 task108 final/MCP-delta gates; 2026-09-06
  `b11145c` composition (305 pass / 1 skip / 0 fail); closed 109/110 gates.

## 3. Combined interactions assessed (policy 15 + runtime 8 + helper 2)

- Intake caps/bounds: helper 200-post read window with truncation refusal
  and 64 KiB body skip mirror AGENTS.md caps and hook/MCP bounds; the guide
  documents both. No unbounded trust window.
- Untrusted-data handling: helper output self-labels `trust: "unsigned"`
  with asserted authors; evidence recognition is schema+stage+tag-bound with
  per-stage field dropping and bounded fields (model ≤128, security ≤512,
  round integer 1–3); legacy v1 records hard-fail (fail-closed tripwire);
  non-conforming posts are skipped. Combined with unchanged core read-side
  validation and hook/MCP labelling, no path from hostile board content into
  recognized evidence was found.
- Role model: lead `codex`, owners exactly `letta|opencode|opencode-reviewer`
  — matches the task-owner set in AGENTS.md/task-workflow/MILESTONES;
  author/stage/reply-chain validation blocks self-acceptance and out-of-order
  stages.
- Security-state semantics: the helper enforces an explicit pending/approved
  state at accept; pending never implies approval; the helper records
  references only and performs no authorization; rollout gating lives in
  MILESTONES.md, the guide and AGENTS.md. Consistent across all scopes.
- Round budgets: helper rounds 1–3 bounded with stop-at-three and lead
  continuation recorded in the parent, matching the workflow. Cumulative
  security accounting preserved: policy 2 of 3 complete, runtime 1 of 3
  complete, helper round 1 BLOCKED + this round 2. No reset anywhere.
- Rollout holds: guide, MILESTONES.md and done/108 hold live board
  init/install/posts; integration-before-gate is consistently stated without
  rollout. Holds intact.
- Secrets/URLs: helper has no network access, uses argv-array subprocesses
  with stdin ignored and 30s SIGKILL, static error strings, typed CLI
  response validation. The guide's two GitHub URLs are the operator-design
  board-data/source split already recorded in parent 144 (not a new
  disclosure). No secret-access path; `.env`/`*accessKeys*.csv` prohibitions
  untouched.

Covered: all interactions and deltas among the 25 paths at `ba567d5`.
Uncovered by design: product modules outside the 25 paths (own package
milestone coverage); runtime adoption/live rollout (gated); any later change
to these bytes (would require fresh GLM delta verification).

## 4. Round-1 observation — assessed and disposed (this worker)

Finding (helper round 1, optional, coordinator-unassessed):
`securityStateOk` (`/(^|\W)(pending|approved)(\W|$)/i`) accepts negated
forms such as "non-approved" because `-` is a non-word character.

Assessment (verified in code): the check gates only whether an accept-stage
reference *states* a state; the reference is stored and echoed verbatim; no
helper branch treats the matched word as approval; accept is lead-author-only;
no authorization, release or rollout decision flows through the helper — the
milestone gate is external. A "non-approved" reference stays visibly
non-approving in the recorded evidence. No combined-scope security impact.

Disposition: **accepted-optional, no change this round.** An edit would
change helper bytes, invalidate the carried exact-bytes CI typecheck evidence
(rerun prohibited), and consume round 3 for a labeling-precision nuance with
no authorization effect. Recommended future hardening (lead-scheduled,
ordinary): reject negated forms — e.g. require the state word not preceded by
negation text ("non-"/"not") or accept an explicit `state: pending|approved`
form — with a fresh GLM reviewer and new applicable validation evidence when
made.

Report-only re-flags (outside this scope, for the lead): (1) the
secret-shaped untracked `agent-s3_accessKeys.csv` remains at the repo root
(not opened, per policy) — remove/ignore before integration; (2) the
model-spawn-test log drift continues per the F-1 disposition (now
`9d83933c…`); keep it excluded from gated sets.

## 5. New findings requiring artifact edits

None.

## 6. Checks

Newly run (read-only only): SHA-256 of all 25 paths and the three prior
reports (all match expected pins/manifests); `git rev-parse` of both pinned
commits; path-scoped `git status` (all 25 clean vs HEAD) and
`git diff ba567d5..HEAD` (register/test-log appends only; no product bytes);
static code analysis of the helper security-state path and the combined
interactions in §3. Not run, by prohibition/authorization: no tests, no
typecheck (denied execution and workarounds prohibited; CI `34214935470`
carried on unchanged bytes), no installs, no network, no writes.
`apply_patch` is unavailable; no native write was substituted for any file.

## 7. Verdict and round accounting

**SECURITY PASS — clean no-change** for helper/144 security round 2 of 3,
including the authorized combined interactions/deltas assessment at fixed
`ba567d5`. Zero artifact/test edits; all findings disposed; applicable
evidence carried on unchanged relevant bytes. The helper security cycle ends
clean; round 3 is not required and is not started. Cumulative counts
preserved separately: policy security round 2 of 3 complete; runtime security
round 1 of 3 complete; helper security rounds 1 (BLOCKED) + 2 (clean) of 3;
ordinary correctness cycles remain separate recorded results. The
remote-board milestone release/rollout decision remains **pending with Hoa**;
this pass claims no rollout authorization, and live board init/install/posts
stay held.

Cleanup: the worker created no files, scratch, processes, worktrees, sessions
or bus messages; only read-only shell inspection. This report's own SHA-256
is recorded by the owner after coordinator apply_patch persistence (a file
cannot contain its own hash).

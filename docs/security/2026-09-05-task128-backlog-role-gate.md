# Security gate — task128: backlog role and dependency alignment (planning metadata)

- Gate record: `backlog/128-security-gate-backlog-role-alignment.md`
- Baseline / pin: `bb3ee1730d8f28c9e95153bc012717d8a4801de5` (= HEAD at gate time; all scoped changes are uncommitted working-tree edits)
- Dispatch: `20260905T215116Z-codex-6bc2`; worker start confirmed `20260905T215300Z-letta-7089`
- Scope type: planning-metadata review only (role/authority boundaries and hold semantics). No code, spec, or implementation review. Review-only; the worker edited nothing in the repository except this report file at `docs/security/2026-09-05-task128-backlog-role-gate.md`.

## VERDICT

**ACCEPT** — zero blocking findings. The frozen scope was reproduced exactly; every gate check passes. All observed defects are outside the frozen scope and are reported as suppressed observations for the lead, not as gate findings.

## Frozen-hash reproduction (exact)

Scope clarification in the gate record (`20260905T215341Z-codex-3f75`) resolved: the binary diff hash covers ONLY the fifteen task files; the selected INDEX rows are hashed separately as content. Both reproduce exactly on first derivation:

1. Fifteen-task-file diff: `git diff bb3ee17 -- <15 files below>` →
   `8949255b367d2d5c1f2130af083dd7367ae4293539ce2e7e939114c67fecf630` — **MATCH**
2. Selected INDEX rows (ids 126 207 301 302 303 304 305 307 401 402 407 408 503 603 605, file order, trailing line feeds) →
   `1fe6bbdccd6252c2041fa7429f1abc4fce59f7672539dfaead629033a30c0c6b` — **MATCH** (exactly 15 rows selected)

Derived in-scope file list (15): `backlog/126-board-info-bounds.md`, `backlog/207-expiry-and-ttl-semantics.md`, `backlog/301-identity-keys-did-key-ids-keystore.md`, `backlog/302-sign-and-verify-posts.md`, `backlog/303-key-registry-with-pre-rotation-and-tofu.md`, `backlog/304-per-board-requiresig-policy.md`, `backlog/305-rate-limits-and-audit-view.md`, `backlog/307-red-team-fixture-and-injection-test.md`, `backlog/401-per-writer-seq-and-presence-heads-gap-driven-rec.md`, `backlog/402-hlc-witnessed-ulids.md`, `backlog/407-store-bridge-replicate-a-board-between-stores.md`, `backlog/408-load-and-cost-benchmarks.md`, `backlog/503-adapter-conformance-kit-and-recipes.md`, `backlog/603-observability-trace-ids-end-to-end.md`, `backlog/605-docs-site-semver-changelog.md` — plus ONLY their INDEX rows.

Full-backlog enumeration vs `bb3ee17` produced no unexpected items. Excluded, each accounted for: `backlog/README.md` (owner/status enum + spec-workflow conventions; separately reviewed), task files 108, 109, 110, 125, 204, 404, 602 (task-specific lead/validation narratives and status updates outside the frozen manifest), non-selected INDEX row changes (109, 110, 125, 204; new rows 128, 217, 218, 308–311), and seven untracked new task records (128, 217, 218, 308, 309, 310, 311). No unexplained delta exists in `backlog/`.

## Gate checks

**1. Reassignment authority — PASS.**
Fourteen stale owners reassigned; every move lands on letta or opencode (charters: `docs/agents/letta.md`, `docs/agents/opencode.md` — implementation + security reviews): claude→letta 207/301/304/401/603, claude→opencode 126/302/402/408/605, codex→letta 305/503, codex→opencode 307/407. Precisely: 126→opencode, 207→letta, 301→letta, 302→opencode, 304→letta, 305→letta, 307→opencode, 401→letta, 402→opencode, 407→opencode, 408→opencode, 503→letta, 603→letta, 605→opencode; 303 already letta, only hold/planning clarification changed (owner line untouched in its diff). No in-scope task is owned by claude (inactive per `docs/agents/claude.md`) or letta-flash (retired per `docs/agents/letta-flash.md`); `grep` over INDEX shows claude/letta-flash only on historical `done/` rows (101, 115, 509). All 15 are product implementation tasks; none is a review task (those remain opencode-reviewer, e.g. 311) or a spec-authoring task (codex-architect, e.g. 217/308). Lead retains orchestration ownership only of its own tasks 109/110 — both outside this frozen scope and consistent with `docs/agents/codex.md` ("Do not implement product code… Own orchestration").

**2. Hold semantics — PASS.**
Held tasks carry `status: blocked` plus dependency and narrative guards that cannot be read as approval or dispatch:
- 126: `status: blocked`, `depends: [115, 404]` (404 added); note: "This is not implementation dispatch; await an explicit scoped lead handoff before starting work. Task404 must land first to release the shared core scope; no implementation is started by this owner update." 404 itself is opencode/in-progress.
- 301–305: `status: blocked`, each `depends` extended with 311 (301: `[]`→`[311]`; 302/303: `+311`; 304/305: `+311`); 311 is "spec review: enrollment, round 2", opencode-reviewer, in-progress. Each file: "not implementation dispatch; await an explicit scoped lead handoff before starting work. The legacy brief above must be reconciled with the settled enrollment specification after review311 and its required security gate; draft availability is not implementation approval."
Legacy briefs remain verbatim original text with the reconciliation guard above them — they cannot be mistaken for active dispatch. Reassigned-but-not-held tasks (207, 307, 401, 402, 407, 408, 503, 603, 605) stay `status: todo` with unchanged dependencies and the same "not implementation dispatch" guard — no task is marked ready while held.

**3. Metadata-only — PASS.**
The complete 15-file diff (pinned `8949255b…f630`) was inspected hunk by hunk: every change is frontmatter `owner:` / `status:` / `depends:` lines plus one appended "Lead planning update" paragraph placed after the original brief and before `## Definition of done`. Baseline description lines, every `## Definition of done` checkbox, and all acceptance criteria appear as unchanged context lines; no `−`/`+` touches them in any of the 15 files. No spec, DoD, description, or acceptance-criterion content was rewritten (the description/DoD rewording visible in the working tree in task 110 is outside this frozen scope).

**4. INDEX consistency — PASS.**
All 15 selected rows match file frontmatter exactly (owner/status): 126 opencode/blocked, 207 letta/todo, 301 letta/blocked, 302 opencode/blocked, 303 letta/blocked, 304 letta/blocked, 305 letta/blocked, 307 opencode/todo, 401 letta/todo, 402 opencode/todo, 407 opencode/todo, 408 opencode/todo, 503 letta/todo, 603 letta/todo, 605 opencode/todo — 15/15 MATCH, zero divergence. The rows hash reproduces `1fe6bbdc…c6b`. Out-of-scope rows also show no file/index divergence in the working tree (109, 110, 125, 204, 404 all agree with their files).

**5. No authority creep — PASS.**
No in-scope change grants codex (lead) implementation or review roles — the lead's only task ownership anywhere touched is its own orchestration tasks 109/110 (outside scope; "Lead coordination only; code is delegated"). No in-scope change grants any agent lead powers: the planning notes explicitly reserve dispatch ("await an explicit scoped lead handoff"), backlog ownership, and integration with the lead, matching the charters. No in-scope file alters the owner/status enum; the enum expansion lives in `backlog/README.md`, which is excluded and separately reviewed.

**6. Standard hygiene — PASS.**
Professional, consistent tone; content limited to ownership/status/hold language, audit hashes, and dispatch IDs; no secrets, no transient machine paths, no attack narratives, no leakage. The notes strengthen security boundaries (explicit non-dispatch, reconciliation and gate requirements) consistent with `docs/research/04-trust.md`.

## Findings (ranked)

None blocking within the frozen scope. No ACCEPT-blocking defects.

## Suppressed observations (4) — out of scope, for lead awareness only

1. `backlog/README.md` enum expansion (adds `opencode`, `opencode-reviewer`, `codex-architect`, `gated`) is what makes the in-scope `owner: opencode` values enum-valid; the two edits should integrate together. README is excluded and separately reviewed — suppressed, not a defect here.
2. `backlog/125` file (todo→in-progress) and its INDEX row changed outside the frozen 15; file and row agree, and 125 is a letta work-status update, not a role reassignment — suppressed per the gate record's exclusion.
3. Content-bearing lead edits exist in the working tree outside this scope (108, 109, 404, 602 narratives; 110 description/DoD rewording; 204 planning note) — not reviewed by this gate; each belongs to its own task flow — suppressed.
4. New INDEX rows 128, 217, 218, 308–311 reference untracked (new) task records — expected in-flight state, outside selected rows — suppressed.

## Per-file SHA-256 (pinned snapshot)

```text
022d39847c06ea130c9d09d5508802a8b96f3c30f2726614d191e94a36d16bf2  backlog/126-board-info-bounds.md
f763b0dce5cde3487074d129458a2b55f2ec99c1c975d49cf93fbf436a8d6abe  backlog/207-expiry-and-ttl-semantics.md
578e5c1c9337c9eb72c4776802081773a4052b5f971f500bec5fad28b4227483  backlog/301-identity-keys-did-key-ids-keystore.md
a3a5fc174b678ab873e402df295422f819628eea05583ea22d109c94a5224e10  backlog/302-sign-and-verify-posts.md
02b592b4cb7f8eabf019bf4d3d8e8dabb89b60826f7bcba2d24302a257a8bdb2  backlog/303-key-registry-with-pre-rotation-and-tofu.md
4def74ca880060fcafe81247dcc64eb8a9793a46b49ce948cb829311582ad32f  backlog/304-per-board-requiresig-policy.md
0b73da38812d65f305f18938dc74a25c69dcb15ccf9247fbb47bcbda591a7439  backlog/305-rate-limits-and-audit-view.md
62054da14805c769d69064c582a3b8ecb8d042aafe15ac123c7861c03a6ee29a  backlog/307-red-team-fixture-and-injection-test.md
56fcc2a550af237eac504beecf95f08e48ff595aac342930d2439c69c36dbb9a  backlog/401-per-writer-seq-and-presence-heads-gap-driven-rec.md
b47d75def61d634800e228580b2a9c42c8c5a81f23409d60aadb92c7d21f2ee7  backlog/402-hlc-witnessed-ulids.md
876774dbee36962c6958bb1b134636ff5b1e1f7a4f0143c019f3af5d7a0acb28  backlog/407-store-bridge-replicate-a-board-between-stores.md
57a6ecf6ec732476915b2b24d05b774be5cfb2b58cf7358e7362ebe087420284  backlog/408-load-and-cost-benchmarks.md
cf96e93ec741dea4a218347ef5f9d0a2b9623f72e1e812d800471f3943294272  backlog/503-adapter-conformance-kit-and-recipes.md
0609e6676db44e6e7a83a7b4a9c7badc733231cde0c286337029c3036a35de91  backlog/603-observability-trace-ids-end-to-end.md
6063ce1402cab740bcb7e00aeba89ec0a129350f3186d8ca38ac9c5ac4cd7337  backlog/605-docs-site-semver-changelog.md
f320e450409779166df50f0088b6bbe1d10c65882db7e79d7aaee475a10b1e76  backlog/INDEX.md
```

All 15 task-file hashes match the frozen manifest in `backlog/128-security-gate-backlog-role-alignment.md` exactly.

## Drift check at seal

Re-verified at seal time, after all reads and immediately before/after writing this report: HEAD still `bb3ee1730d8f28c9e95153bc012717d8a4801de5`; 15-file diff hash still `8949255b…f630`; selected-rows hash still `1fe6bbdc…c6b`; all 16 per-file hashes unchanged (`shasum -c` OK on the worker's full-copy snapshot). **No drift.** The worker's audit evidence (change.diff, index-rows.txt, scope derivation, full file snapshot + SHA256SUMS) is retained outside the repository per the gate record's cleanup rules; this document is the only repository artifact written by this gate.

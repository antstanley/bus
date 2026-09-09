# Helper milestone security review — task 144 helper/guide (round 1)

Requested worker model: `zai-coding-plan/glm-5.3-flash` (recorded as requested;
runtime identity is coordinator-verified, not self-attested). Fresh clean
context, no bus/child workers. This report was persisted by the coordinator
via apply_patch: no apply_patch route was available to the worker, and no
artifact/test edits were made by the worker.

## Scope, baseline, manifest

- Fixed baseline `8e06278e28fa9a0868367d37481a3f66d32cae1c` (= HEAD at pin),
  plus ONLY the two candidate files; runtime/policy/dependencies read-only.
- helper `scripts/phase1-acceptance.ts`
  `e5cc85ac4ca1f21f60f6988d43ea51873f79080aa28f06fd9166fc7231b33b4e`
- guide `docs/acceptance/phase-1.md`
  `822d84f02fc1731193fbb741ffea9bc53491bccd7e517b6d8f18c95eebf06032`
- Output artifacts: none (worker wrote no files; archive was disposable).
- Round reconciliation: archived 146 has no worker/round/verdict; prior
  OpenCode Reviewer helper dispatch withdrawn unstarted → initial helper
  milestone round 1 of 3. Correctness round 1 (Astra, clean no-change,
  identical bytes) remains separate.

## Cumulative coverage

Delta vs closed exact-byte 109/110 gates (helper `2d21ce9a…`, guide
`c936365c…`): owner-managed lead/owner roles, `--owner`/`--worker` alias with
conflict rejection, v2 payload with legacy v1 identify-and-reject, bounded
model/round/security evidence fields, explicit pending/approved security-state
enforcement, stop-at-three guidance, expanded smoke (8 guards). Preserved
properties re-verified: read/post/reply-only subprocess surface, argv arrays,
30s SIGKILL, 64 KiB skip, 200-post window + truncation refusal, core-key
cursor with fail-closed tripwire, typed CLI-response validation, verdict
enum-gating, static error strings, no secret reads, advisory identity and
non-attestation labels, pending never implying approval, rollout holds intact.
Guide accuracy verified against helper behavior. Policy/runtime milestone
reports are context, not re-reviewed; combined-candidate interactions are
separately scoped by Hoa.

## Checks (isolated baseline archive + candidate overlay, frozen copied
dependencies, internal relative workspace links)

- Archive overlay hashes match the pins exactly.
- Helper --help exit 0; nine fail-closed probes exit 1 (unknown command,
  unknown flag, missing --store, duplicate flag, invalid owner, alias
  conflict, wrong author, invalid board).
- Smoke exit 0: complete 5-message cycle, 8/8 rejection guards, synthetic
  labels intact, temp store removed.
- Root bun test exit 0: 306 tests / 21 files; captured "1 skip", "0 fail".
- Typecheck (tsc --noEmit): NOT COMPLETED — the worker's launch command was
  denied by operator permission; no exit status exists.

## Findings

None blocking. Observation (unremediated, for lead disposition): the enforced
security-state check accepts negated forms such as "non-approved" (hyphen is
a non-word character); no helper path distinguishes the words and no
authorization flows through the helper, so this is optional hardening only.

## Verdict: BLOCKED

Applicable typecheck did not complete (tool-permission denial), so this is
not a clean pass. Helper security round count: 1 of 3 consumed; the next
clean GLM 5.3 Flash reviewer starts at round 2 with typecheck required and
the budget preserved. No milestone pass is claimed; live rollout holds remain
in force.

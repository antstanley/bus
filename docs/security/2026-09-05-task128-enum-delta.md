# Security gate — task128 supplemental: backlog/README.md owner:/status: enum delta

- Baseline: `bb3ee1730d8f28c9e95153bc012717d8a4801de5` (= observed HEAD at seal; the README delta is uncommitted working-tree state, same posture as the prior gate)
- Frozen pin (whole file): `d4dadf7ab9911c1bda34aee192f8b058eee7d362d2475fb7f7d99a8d16332135`
- Prior gate: `docs/security/2026-09-05-task128-backlog-role-gate.md` (its suppressed observation #1 — "INFO-1" — recommended this README enum expansion ship together with the owner reassignments)
- Scope: ONLY the template `owner:`/`status:` enum-line changes in `backlog/README.md` vs bb3ee17, plus their necessary glue. Review-only; no repository writes except this staged report copy.

## VERDICT

**ACCEPT** — zero blocking findings. All four gate checks pass; every diff hunk is classified (enum-scope or necessary glue or pre-existing-reviewed); nothing unexpected.

## Gate checks

**1. Whole-file pin — PASS.**
Observed sha256 of `backlog/README.md` (working tree; snapshot at `artifacts/03_snapshot/README.md`, `shasum -c` OK):

    d4dadf7ab9911c1bda34aee192f8b058eee7d362d2475fb7f7d99a8d16332135

Frozen pin: `d4dadf7ab9911c1bda34aee192f8b058eee7d362d2475fb7f7d99a8d16332135` — exact **MATCH** on first derivation. No STOP blocker.

**2. Enum lines — PASS.**

Before (`git show bb3ee17:backlog/README.md`, template lines 12–13):

    owner: codex | letta | claude | unassigned
    status: todo | in-progress | blocked | done

After (pinned copy `d4dadf7a…3135`, template lines 12–13):

    owner: codex | letta | opencode | opencode-reviewer | codex-architect | unassigned
    status: todo | in-progress | blocked | gated | done

- Owner alignment: the 15 reassigned tasks are owned by `letta` (8: 207, 301, 303, 304, 305, 401, 503, 603) and `opencode` (7: 126, 302, 402, 407, 408, 605) — both current implementation/security owner tokens are present. `claude` (inactive) is removed; `letta-flash` appears in neither the before nor after enum, and a grep of the entire pinned README for `claude|letta-flash` returns no matches — neither inactive agent is presented anywhere as a current-owner option. Remaining tokens `codex` / `opencode-reviewer` / `codex-architect` name roles already documented in the prior gate (lead orchestration; review tasks e.g. 311; spec-authoring tasks e.g. 217/308) and match the expansion INFO-1 described ("adds `opencode`, `opencode-reviewer`, `codex-architect`, `gated`").
- Status alignment: statuses actually carried by the 15 reassigned tasks are exactly `todo` (9: 207, 307, 401, 402, 407, 408, 503, 603, 605) and `blocked` (6: 126, 301, 302, 303, 304, 305) — independently re-derived from the task frontmatter, matching the prior gate's check 4. Both are in the enum; pre-existing `in-progress`/`done` are retained; the new `gated` has its documented semantics in the README's spec-workflow section ("An authored frozen draft can be `gated` while its review is active."). Every status in use is enum-valid; the enum is a superset with no dangling states.

**3. Delta-only — PASS (all hunks classified; nothing unexpected).**
The diff vs bb3ee17 (`artifacts/readme.diff`) contains exactly **2 hunks**; the file length is fully accounted for by the diff arithmetic (28 baseline newlines − 2 + 2 − 1 + 1 + 22 = 50), so no unexplained delta exists:

- Hunk 1 (`@@ -9,8 +9,8 @@`): **enum-scope.** Exactly the two template `owner:`/`status:` lines (2 del / 2 add, quoted above). Nothing else in the hunk.
- Hunk 2 (`@@ -25,4 +25,26 @@`): mixed, fully classifiable, **not unexpected**:
  - (a) **enum-glue** (1 del / 1 add):
    `-ends with a bus message to claude and a review.`
    `+ends with a bus message to the operator-appointed lead, Codex, and a review.`
    This removes the final stale reference to the inactive `claude`, consistent with — and necessary to — the enum's removal of `claude`; it restates the existing lead structure (codex as operator-appointed lead per its charter) and grants nothing new.
  - (b) **pre-existing-reviewed** (22 added lines): the `## Specifications use the same backlog` section. This is the lead's spec-workflow coordination content, explicitly accounted for in the prior gate report's exclusion list ("`backlog/README.md` (owner/status enum + spec-workflow conventions; separately reviewed)"). It also documents the semantics of the new `gated` status, so it partially serves as glue for the status-enum expansion. Outside this gate's frozen scope; noted, not flagged.

No unexpected hunks. The title, intro, claim-a-task instructions, DoD-implied-tests paragraph, and template body are all unchanged context lines.

**4. No new issues — PASS.**
- Role power: the enum is template metadata listing valid owner/status tokens — a convenience for well-formed task files, not an authority grant. Authority still flows from the agent charters (`docs/agents/*.md`) and explicit lead dispatch, none of which this delta touches. No dispatch, approval, escalation, or "ready to start" language is introduced; held tasks remain guarded by their existing "await an explicit scoped lead handoff" narratives (unchanged, out of scope).
- Leakage: none — no secrets, keys, machine paths, transient dispatch IDs, or audit internals in the delta.
- Tone: terse, imperative, professional; consistent with the baseline README.

## Findings

None blocking. Non-blocking classification notes: hunk 2(a) is necessary glue for the claude removal; hunk 2(b) is the lead's already-reviewed spec-workflow coordination content, documented in the prior gate's exclusions and outside this gate's frozen scope.

## Evidence summary

- Observed README sha256 (full, transcribed): `d4dadf7ab9911c1bda34aee192f8b058eee7d362d2475fb7f7d99a8d16332135`
- Pin: `d4dadf7ab9911c1bda34aee192f8b058eee7d362d2475fb7f7d99a8d16332135` — MATCH
- Baseline: `bb3ee1730d8f28c9e95153bc012717d8a4801de5`; HEAD at seal: `bb3ee1730d8f28c9e95153bc012717d8a4801de5`
- Exact two-line evidence — the template enum lines as they now read (`backlog/README.md` lines 12–13):

      owner: codex | letta | opencode | opencode-reviewer | codex-architect | unassigned
      status: todo | in-progress | blocked | gated | done

- Drift: re-verified at seal — HEAD unchanged (`bb3ee17…`), README sha256 unchanged (`d4dadf7a…`), `git status` still shows ` M backlog/README.md` (uncommitted working-tree edit, as expected). **No drift.**
- Sealed bundle: `20260905T-task128-enum-delta` (evidence retained outside the repository per the gate record's cleanup rules; the path is recorded in the dispatch record). Bundle contents: `artifacts/03_snapshot/README.md` + `README.sha256` (pinned snapshot), `artifacts/readme.diff` (diff vs bb3ee17), `report.md` (this report; staged copy at `docs/security/2026-09-05-task128-enum-delta.md`).

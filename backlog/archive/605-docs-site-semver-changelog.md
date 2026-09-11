---
id: 605
title: docs site, semver, changelog
phase: 6
owner: syenite
status: in-progress
depends: []
estimate: S
---

Use the [owner-managed task workflow](../docs/agents/task-workflow.md) for sequential clean reviewer-remediators and evidence in this task. Security belongs to the [applicable milestone](../docs/security/MILESTONES.md), not mandatory per-task scans; preserve prior findings, consumed rounds, exact-snapshot evidence and rollout holds. Verify requested model capability before dispatch.

## Retirement handover (2026-09-11)

Operator authorized OpenCode retirement and transfer to lead syenite. Status
in-progress and ordinary rounds0/3 preserved. Worker
ses_f7132515effe1Va5UMxLa5z47G (verified zai-coding-plan/glm-5.3-flash) is
retired without further dispatch: final worker8868/runner8845 already exited0
at1789103394841; all previously recorded author/runner PIDs are absent.
Isolated /private/tmp/sidekick-task605-opencode (task605-docs-site, abb3dce)
has clean git status at handover: NOTHING APPLIED. The patch-text-only request
covered the local static docs builder, navigation/link handling, CSS, tests,
usage and scoped manifest/workflow, but the final captured stream contains
only start/session/exit records, NO patch text or final implementation handoff.
Do not claim pending patch completeness, build/test success or review.

Preserve the session record (not deleted) and all owner logs/runner under
/var/folders/ft/6fdqp3c914xfdlk47w5cblzc0000gn/T/opencode/:
task605-runner.mjs, task605-author.out, task605-author-patch.out,
task605-author-finalpatch.out. Lead may recover any session output; none was
discarded during retirement. Implementation, validation and fresh ordinary
review remain. Retention transfers to syenite; no cleanup/worktree deletion.
Scope remains docs-site/** and dedicated docs build workflow only; no root
package/lock/source changes, tag/version/deploy/publication or live config.
CHANGELOG Unreleased is reserved for109/110, whose priority/holds remain.

Published docs from DESIGN, ROADMAP, research and package READMEs; conventional commits and a changelog.

Lead planning update (2026-09-05): opencode owns this task under the current
role split. This is not implementation dispatch; await an explicit scoped lead
handoff before starting work.

## Definition of done
- [ ] docs build; v0.1.0 tagged

## Active lead assignment

Lead dispatch 2026-09-11: start the local docs-site build slice of605 while109/110 awaits lead runtime prerequisites. Preserve priority109/110 when runnable. Use an isolated worktree from current main, record baseline, and reserve only docs-site/ plus dedicated docs build workflow if needed. Clean GLM5.3Flash implementer then fresh Astra LOW correctness reviewer-remediators, ordinary cap3. Produce a reproducible local static documentation build and usage guide drawing from current DESIGN, ROADMAP, research and package READMEs, with working navigation and links; avoid duplicating stale generated source documentation. No root package/lockfile or existing source edits without a concrete scope request. Do not modify CHANGELOG: its Unreleased slice stays reserved for the genuine109/110 acceptance cycle. No version bump, tag, publication, deployment, domain or live config changes; full605 remains incomplete pending those held deliverables. Record scope/hash/check evidence, actual models, retire workers. No retry of previously denied Codex shim or unrelated cleanup. Announce and reread current ownership before starting; integration remains Hoa's.

### Owner setup reconciliation

Owner read the canonical dispatch and team post `01M27ABV0WPAQ7EYN8E08KM8WZ`.
Proposed exact reservation: `docs-site/**` and dedicated
`.github/workflows/docs-site.yml`, no other workflow/root/source files.
Initial worktree inventory had no605 checkout, and no path/baseline was supplied
in the dispatch. The charter reserves branch/worktree mutations to Hoa.
Provisioning requested on team in `01M27AN9S6TTPQ8WAR94KF0WRC`, mirrored as a
setup blocker in fallback message `20260911T041658Z-opencode-68f3`.
Current source observation was abb3dce; do not infer a worker/candidate baseline
until the lead supplies the isolated checkout. No worker has started, no
product file has changed, ordinary rounds0/3. Owner coordination is active;
implementation starts immediately after provisioned scope/baseline verification.
CHANGELOG and109/110 priority holds remain intact.

### Isolation supplied; queued behind150

Hoa supplied `/private/tmp/sidekick-task605-opencode`, branch task605-docs-site,
baseline `abb3dce9c304cefa90e7a92e0309bd32196e7cd9`; owner verified the exact
baseline and clean state. Provisioning blocker resolved. Board dispatch
`01M27BPJZWB7R3X5XJQVQ83RMH` gives150 ordinary review priority before605;
that reviewer is now running. No605 implementation worker or code change yet.
Existing source/CHANGELOG/root-package/lockfile/deployment restrictions stay.

### Implementation started

After150 ordinary R1 clean handoff (`01M27CK0Z2V1VEZC0VT68HFVEW`), owner
started fresh pure `zai-coding-plan/glm-5.3-flash` implementer
`ses_f7132515effe1Va5UMxLa5z47G` on the provisioned abb3dce checkout.
Runner59766/worker59804; runtime start1789102238377. Model is requested,
pending exported runtime identity verification at handoff. Plugins and board/
CodeGraph MCP connections are disabled. Reserved scope remains docs-site/**
and dedicated docs workflow only; ordinary rounds0/3. No publication or full
605 completion is implied.109/110 priority and CHANGELOG hold preserved.

Turn-boundary board CLI inbox timed out after45s on the verified dedicated
board-data replica; fallback start receipt `20260911T045421Z-opencode-3f92`
sent to codex. Awaiting implementation artifact/check handoff; no review
started concurrently.

Runtime export verified provider/model `zai-coding-plan/glm-5.3-flash`.
Owner interrupted initial worker after it reported absent apply_patch and
proposed git apply, before any candidate writes (isolated status still clean).
Resumed the same unretired author context with explicit isolated --dir and
patch-output-only instructions: no substitute manual write mechanism; owner
will mechanically persist exact authored patch through apply_patch, then
continue author validation before final handoff. No ordinary round consumed.

The --dir resume produced no streamed handoff and was interrupted. A synchronous
status-only resume confirmed the same author received the correction, completed
its scoped reading, and had made no writes. Authoring-only continuation now
runs as runner8845/worker8868, runtime start1789102767410; no model/session
substitution. Patch remains pending; build/tests and review remain unrun.
Fallback update sent as `20260911T050044Z-opencode-36a9`.

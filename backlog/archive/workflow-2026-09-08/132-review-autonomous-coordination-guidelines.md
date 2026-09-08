---
id: 132
title: "review autonomous coordination guidelines"
phase: 1
owner: opencode-reviewer
status: gated
kind: documentation-review
parent: 131
related: [108]
depends: [131]
estimate: S
---

Follow-up gate on the frozen author handoff from131, not a specification-review
round. Dependency131 means its complete frozen candidate is available, not
that131 is committed/done (avoid a gate dependency cycle). Once131 publishes
pins, claim this task without waiting for lead dispatch. Use a clean independent
reviewer and131's operator requirements, committed DESIGN as context, exact
new scope only. Review the full five-document governance delta vs committed
HEAD (superseding108's queued five-doc correctness review) plus changed charter
documents/index. Do not review or edit108/404/130 runtime candidates here.

Check autonomous charter-limited claiming, cooperative collision handling,
task/follow-up maintenance, durable restart guidance, no hidden dispatch gate,
role boundaries (Hoa idle code review only), sole lead git authority,
independent gates, three-round spec limit, no premature done, frozen-scope
preservation and consistent old-restriction supersession. No source/spec fixes
or self-review. Report READY or concrete defects, path/line and exact hashes;
record results and linked remediation as needed. Cleanup and audit evidence.

- [ ] Complete final131 candidate pins published; claim announced.
- [ ] Independent verdict and evidence recorded; no unresolved contradictions.
- [ ] Cleanup confirmed; lead integration pending or complete explicitly stated.

Final12-document freeze published in131, baseline7190f83, all hashes lead
verified. Review dispatched2026-09-06; actual worker acknowledgment/verdict
pending. This covers the new parent/related convention as well as autonomy.

CHANGES REQUIRED `20260906T132136Z-opencode-reviewer-1df0`, clean child
ses_f89224758ffejFk5IzDnex7FLH; all12pins stable, diff341d6517...4d0de versus
7190f83, no edits/tests/artifacts. ThreeP2 corrections required:

1. Letta/OpenCode charter claim wording wrongly excludes valid review of
   published frozen inputs. Distinguish read-only review input from edit
   reservation, retaining no duplicate gate and no input edits.
2. AGENTS current package-map/dormancy and DESIGN dispatch-only wording must
   match current implementation lanes and autonomous charter-scoped pickup.
3. Bare bus read/wait do not enforce stated200-post/64KiB/provenance rules.
   Document actual bounded preflight intake and untrusted provenance without
   claiming nonexistent script enforcement; no source/wire change needed.

Parent/related/depends, round cap, one ledger and runtime precedence otherwise
coherent. Lead requires fixes, waits133 same-freeze security before combined
linked remediation. Policy not ready to commit; no source approvals altered.

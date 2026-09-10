---
id: 507
title: Prime-Agent adapter: reuse Pi extension, wake via daemon send
phase: 5
owner: essun
status: in-progress
depends: [114]
estimate: S
---

Use the [owner-managed task workflow](../docs/agents/task-workflow.md) for sequential clean reviewer-remediators and evidence in this task. Security belongs to the [applicable milestone](../docs/security/MILESTONES.md), not mandatory per-task scans; preserve prior findings, consumed rounds, exact-snapshot evidence and rollout holds. Verify requested model capability before dispatch.

Prime-Agent is a Pi derivative with a daemon (research 05): the Pi extension works unchanged
under ~/.prime/agent/extensions/ and `prime-agent send <name>` delivers to an idle session.

## Definition of done
- [ ] extension installed under ~/.prime/agent/extensions/; `board install prime-agent`
- [ ] `board watch --deliver` uses `prime-agent send <agent>` (mode auto); presence records the daemon agent name
- [ ] MCP entry via `prime-agent mcp add local`, plus a Python skill wrapper so the REPL can `mcp.call_tool("board", ...)`

## Lead dispatch — 2026-09-10

Operator requested work for Essun after granting task-owner and GLM 5.3 Flash
security-review parity. Hoa assigns this parent to Essun. Dependency114 is
complete. This independent adapter work may proceed alongside the priority
108/109/110 chain; it does not relax its runtime/rollout holds.

Baseline: `155653327f7f5b23a6d537ac914c074f3bb9b601`. Hoa provisions an isolated
`task507-prime-agent` checkout; the live shared checkout/configurations are
not implementation targets. Essun owns the completion cycle and task/INDEX
bookkeeping, with no prior implementation or review rounds recorded here.

Initial edit reservation (buildable preparatory implementation, then handoff):

- New `packages/cli/src/prime-agent.ts` and `packages/cli/test/prime-agent.test.ts`
  for Prime-specific adapter helpers and isolated fixture tests.
- New `docs/guides/prime-agent.md` for the verified installed-harness contract,
  setup recipe and remaining integration steps.
- This parent and only INDEX row507 for coordination evidence.

Use existing Pi/install/delivery interfaces as read-only inputs. Implement
useful Prime-specific configuration/delivery helpers and tests in these new
paths, with the exact API boundaries established by the clean worker. Report
any additional needed path before editing it. Do not add disconnected fake
integration or claim the full task complete from helpers alone.

**Shared wiring hold:** task147 retains `packages/cli/src/install.ts` and
`packages/cli/test/install.test.ts`; task202 retains core Board/exports, CLI
entrypoint and MCP entrypoints/server. Do not edit these paths, even in the
isolated checkout, until Hoa releases the seams after the owners' handoffs.
Other shared schema/presence/hook edits likewise need an explicit reservation.
After the initial helper handoff, Hoa sequences the remaining wiring and
baseline update inside this same parent; no separate integration task or
review counter reset. Freeze the complete assembled candidate for ordinary
review after those changes.

The original research assertions above are hypotheses to verify against the
installed Prime/Pi runtime. Local live probing already confirmed native
`prime-agent send <agent-id> <message>` and MCP stdio access from the Python
kernel. Installed help and actual options can differ; do not assume
`--follow-up`, `mcp add local`, extension compatibility, or the Python wrapper
API without checking. Preserve the original acceptance intent (idempotent
installation, actual idle wake, presence target, usable MCP from the REPL),
and report exact supported commands/API and any material design choice.
Use disposable homes/stores/daemon fixtures for tests; no live agent config
changes, messages to other agents, operational rollout or private board writes
from workers.

Dispatch a clean native `zai/glm-5.3-flash` implementer, requested thinking
`high`, with only task/DESIGN/relevant research/scoped source and exact
instruction. Keep the bus-reading parent as coordinator. Preserve native
worker/model metadata, input/output hashes and checks before retirement.
Then use clean `openai-codex/gpt-6-astra` ordinary reviewer-remediators on the
complete candidate; requested/effective reasoning must be reported accurately.
Stop after three ordinary rounds without a clean no-change CORRECT/COMPLETE
pass; changed deliverables/tests require a fresh reviewer. Security work only
through clean GLM 5.3 Flash workers, with separately preserved cumulative
rounds. No per-task security scan is started by this dispatch.

Security coverage is pending the later adapter/release batch in the milestone
register; Hoa must freeze its cumulative scope, owner and boundary before
release or operational rollout. Existing phase1 holds remain. Record relevant
root tests/typecheck, acceptance evidence, final hashes, rounds, integration/CI
and cleanup in this parent. Initial checkpoint: actual worker start with
model/scope, then first concrete files/tests or a specific blocker; avoid an
open-ended discovery-only run.

## Completion evidence

- Implementation: clean GLM implementer dispatched — worker sub-1d54087e (task507-impl-glm, zai/glm-5.3-flash, requested thinking high), started 2026-09-10T08:15:16Z on worktree task507-prime-agent baseline 8f475c2e000e408335ecd28939421d1c5af145fa (clean). Scope: new packages/cli/src/prime-agent.ts, packages/cli/test/prime-agent.test.ts, docs/guides/prime-agent.md only; held seams 147/202 untouched. Handoff received and validated — see implementation bullet below. Runtime facts handed to worker, with lead correction 08:17Z: only basic `prime-agent send <agent-id> <message>` is execution-confirmed — installed help is stale, `--follow-up` FAILED on real execution (Unknown option), `--steer`/`--json`/`--follow-up` count as unverified unless probed by the worker; mcp-add stdio grammar verified. Absent ~/.prime/agent/extensions and ~/.pi mean directories absent only; extension compatibility/path behavior is UNVERIFIED, not false (earlier 'false here' wording withdrawn). Thinking levels remain requested settings only.
- Implementation handoff received 2026-09-10, independently validated by essun (orchestrator check, not a review verdict): hashes reproduce — src b71f96d0a1681f215269d04cabebb985f47f0cabdcb5897667997d907d3f38f5, test d3dfd362d26a663e52c39dace38ca841a5cfea82f5a8e171d0689930b13475bb, guide c1e4b5a94a2f4a561d89ccd24bb296ee9ef85be477dc1d1e7a399e3c48da951e; scoped tests 25 pass/0 fail (56 expects), cli regression 83 pass/0 fail (4 files), bunx tsc --noEmit rc 0; git diff vs baseline on held 147/202 paths empty. Worker runtime contract re-probed post-correction: send <agent> <message> exec+live; --from/--json parse-accepted; --steer and --follow-up PARSE-REJECTED (installed help stale); '-'-leading messages need '--'; mcp add/get/list grammar verified against live settings.json; extension paths recorded unverified-absent; daemon status/list --json parsed live read-only. Helper API (packages/cli/src/prime-agent.ts): primeSendArgs/sendPrimeMessage, primeMcpAddArgs/primeMcpGetArgs/addPrimeMcpServer (idempotent check-then-add), primeDaemonStatus, defaultPrimeDaemonSocket, primeDeliveryKey/primeDeliveryMethod/isPrimeAgentTarget, primeRunnerFromRunCommand; unverified flags opt-in only, default argv carries exec-verified tokens only. Open design choices for lead: (a) prime-agent in core SESSION_ID_RUNTIMES vs name-based target (worker used name-based, letta/cmux shape); (b) uninstall route: mcp remove (help-listed only) vs direct settings.json edit; (c) mcp add stdio --force/update semantics. Remaining integration pending seam release: installRuntime case (147), board install/delivery wiring + presence daemon-id target + watch --deliver route (202), REPL skill wrapper, live acceptance on disposable daemon fixture. Worker sub-1d54087e retired after evidence preserved.
- Ordinary review rounds: 0; no verdict. Astra review deferred to complete assembled candidate per dispatch.
- Security review rounds: 0 for this task's new adapter scope; no coverage claimed.
- Integration, live acceptance and cleanup: pending.


## Lead next build slice — 2026-09-10

Hoa updated the isolated task507-prime-agent checkout to fe382d3, preserving
all three frozen helper hashes above. Task147 is source-integrated. Its
installer files now belong to the pending Nassun phase1 security delta, so
that installer seam remains reserved until its handoff. Task202 core/CLI/MCP
seams likewise remain held. Do not race those scopes even in isolated trees.

Essun resumes productive task507 work now through a NEW clean GLM5.3Flash
implementer: complete the usable Prime/Python REPL board-skill wrapper as a
renderable helper, disposable fixture tests and verified setup documentation
within the EXISTING three reserved507 paths. Verify the actual Prime/RLM MCP
calling contract from public installed harness code/help and fixtures; do
not read credentials/live settings or change live runtime configuration.
Do not claim full installer/delivery integration before held seams land.
The later daemon target is the native opaque agent ID accepted by the proven
prime-agent send command; do not broaden core session-ID schemas implicitly.
Uninstall/update semantics stay unverified until actually demonstrated in
fixtures. Preserve the initial handoff and retire this new build worker;
ordinary review remains0 until the complete assembled candidate is frozen.
No extra security review is assigned to Essun while507 is queued; Nassun is
now primary under the updated operator model/scheduling policy.

- Phase-2 implementation: dispatched; worker start receipt — clean GLM5.3Flash
  implementer sub-a0f9c4ae (task507-impl2-glm, requested thinking high),
  started 2026-09-10T10:31:35Z on worktree @ fe382d3 (frozen phase-1 helper
  hashes b71f96d0…/d3dfd362…/c1e4b5a9… verified pre-dispatch). Scope: renderable
  Prime/Python REPL board-skill wrapper + fixture tests + guide section within
  the existing three reserved paths; contract verified from public installed
  dist/SDK sources only (no live settings/credentials); installer seam (147,
  now Nassun phase1 security delta) and 202 core/CLI/MCP seams remain held.
  149 cleanup confirmed for lead: all five 149 workers retired, no essun-owned
  scratch outside the provisioned 149 worktree — ready for worktree removal.
- Phase-2 handoff received 2026-09-10 (~10:5xZ), validated by essun (orchestrator
  check, not a review verdict): only the three reserved paths changed; held-seam
  diff vs 439bad8 empty; hashes reproduce — monitor-side src
  6d7c8a360cefd00c8297a9c5454f1f2d19fe733b35912c8b363c6edec4df57a8, tests
  38c1f188e91b131df5946bc855b9f75a59a19e52466b5832bbbb49124db109e3, guide
  5ef0fbdebc683358e7b8258e81ed94a54895352c65b59d0983a7947d1e17a0e8; scoped 30
  pass/0 fail (25 prior + 5 new), cli regression 90 pass/0 fail, tsc clean;
  rendered wrapper fixture py_compile rc0. renderPrimeMcpSkill(options): string
  renders stdlib-only Python wrapper (SERVER/BOARD/AUTHOR bound, list_tools/
  call_tool/reload, facade via __main__.mcp then sys.modules fallback, explicit
  failure when absent) per the VERIFIED installed RLM contract
  (mcp.list_tools(server)/call_tool(server,tool,args)/reload/close, error
  taxonomy, __main__ binding) — evidence from public dist/SDK sources only.
  Known open items: kernel-venv 3.11 driver execution untested (3.9 fixture
  verified); mcp.close() not wrapped (session-shutdown owned by kernel);
  skills-dir install documented as manual steps; uninstall/update semantics
  still unverified. Worker sub-a0f9c4ae retired after evidence preserved.
  ORDINARY REVIEW REMAINS 0 — Astra review deferred to the frozen assembled
  candidate after held-seam integration lands (lead sequencing).


### Lead installer-seam release — 2026-09-10

Nassun's frozen phase1 product review has ended with no product edits. Hoa
releases only the task147 installer reservation for task507 implementation
in the isolated checkout. New clean GLM5.3Flash implementer may edit the
existing three507 helper/test/guide paths plus `packages/cli/src/install.ts`
and `packages/cli/test/install.test.ts` to wire the Prime installer and rendered
wrapper, with disposable fixtures for install/reinstall/update/uninstall
semantics. Preserve integrated147 behavior. No live settings, credentials,
board stores or deployment changes. Task202 core, CLI entrypoint and MCP
seams remain reserved; do not modify them or implicitly broaden session IDs.
Use native opaque daemon IDs under the existing task design. Kernel3.11
wrapper execution remains unverified until an actual disposable fixture check.
Retire this implementer after exact hashes/checks. Ordinary review remains0
until the complete assembled candidate; later security is Nassun's milestone
scope, not an idle fallback for Essun with queued507 work. This source-scope
release does not authorize installation or any phase1 operational rollout.
- Installer-phase implementation: dispatched; worker start receipt — clean
  GLM5.3Flash implementer sub-485b0600 (task507-impl3-glm, requested thinking
  high), started 2026-09-10T10:58:31Z on worktree @ fe382d3. Scope: released
  installer source only (install.ts/install.test.ts) + the three reserved
  paths — prime-agent runtime case wired through addPrimeMcpServer +
  renderPrimeMcpSkill with install/reinstall/update/uninstall fixture
  coverage; integrated task147 behavior preservation is a hard gate (existing
  installer tests unmodified + green); task202 core/CLI entrypoint/MCP seams
  remain held; native opaque daemon IDs only; no live settings/stores/
  deployment; kernel-3.11 best-effort fixture check requested. Handoff with
  hashes/checks pending; ordinary review remains 0 until the complete
  assembled candidate is frozen.
  (Bookkeeping note: this receipt was first mis-spliced at byte 94 during a
  concurrent-edit anchor mismatch — self-caught, file restored byte-exact,
  then re-inserted here; verified head/frontmatter/tail integrity.)
- Installer-phase handoff received 2026-09-10 (~11:1xZ), validated by essun
  (orchestrator check, not a review verdict): all five hashes reproduce;
  scoped 30/30 + full cli regression 94/94 + tsc clean; held 202 seams
  (index.ts, core, mcp) byte-identical to 439bad8. Installer wiring: prime-agent
  runtime case (addPrimeMcpServer with author-scoped board-<author> server
  name + renderPrimeMcpSkill skills-dir install), idempotent reinstall,
  add-only MCP update with owned-wrapper re-render, uninstall removes
  board-owned wrapper only, dry-run read-only, foreign-wrapper refusal before
  any mutation. task147 preservation: 26 pre-existing installer tests unmodified
  (insertions only), usage-error held-behavior test green. Wrapper
  execution-verified on CPython 3.9.6/3.10/3.11.16/3.12/3.13/3.14 fixtures;
  kernel facade wiring on 3.11 remains live-acceptance. Open lead choices:
  CLI usage/isInstallRuntime listings fold into task202 release; MCP
  update/remove semantics ruling (add-only by construction); board-<author>
  server-name scheme vs free-name scan; user skills-dir caveat documented.
  Implementer sub-485b0600 retired after evidence preserved. 507-scoped
  implementation COMPLETE — assembled candidate frozen pending lead decision
  on ordinary review timing (202 seams are task202 scope).


### Lead assembly sequencing — 2026-09-10

Installer handoff is received; complete task507 acceptance is not yet met.
Ordinary review remains deferred until the CLI listing/runtime selection and
watch-delivery wiring can be assembled after task202 releases its paths.
Do not treat the five-file partial candidate as full-task CORRECT/COMPLETE.
Keep task202's active core/CLI/MCP reservation intact.

Use the stable author-scoped `board-<author>` server name consistently in the
installer and rendered wrapper; discover that exact configured name rather
than silently assuming a free-name scan convention. Add-only MCP setup is
an explicitly limited current behavior, not verified update/remove support.
Hoa authorizes a fresh clean GLM5.3Flash build worker, within the existing
five paths only, to establish update/remove and skills-directory behavior
using public installed harness code/help and disposable homes/settings/daemon
fixtures, implement supported behavior or document a precise unsupported case,
and add relevant fixture coverage. No live settings/credentials, direct
production configuration writes or unverified force/remove operations. Preserve
prior hashes/evidence and retire after handoff. A remaining material acceptance
gap must be reported before full assembly, not silently waived. Ordinary count
remains0; no independent approval is inferred from build verification.

- Update/remove + skills-dir slice: dispatched; worker start receipt — clean
  GLM5.3Flash implementer sub-4f2ff459 (task507-impl4-glm, requested thinking
  high), started 2026-09-10T11:29:51Z on worktree @ fe382d3 (five frozen input
  hashes verified pre-dispatch). Method: disposable HOME fixtures exercising
  the REAL installed prime-agent mcp add/get/list/remove against seeded
  settings (never live state), public dist/SDK read-only for skill-discovery
  rules. Scope: establish update/remove semantics (wire verified behavior or
  document precise unsupported case), skills-dir path/discovery correction,
  exact-name board-<author> discovery on reinstall/update, fixture coverage.
  task202 scope untouched; ordinary count remains 0. Handoff pending.
- Phase-4 handoff received 2026-09-10 (~11:5xZ), validated by essun (orchestrator
  check, not a review verdict): five hashes reproduce — src
  1a650b859280f7a49041e7e5b2d57a7a5881b196afc4c9c3671e2658bf30d776, tests
  7459b14317a3ed844ff243baa71f9e07c98b789c5253d7a8c986f34e0032aa65, guide
  c94444407341060365c6095b9eb746d67896e1b5a56cfc042b5fe2f3d158c763,
  install.ts c69f2c5de2519586a4a59181257e448492bf58cf15e3f9f9723e4f183ccebad7,
  install.test.ts c668ab39eb4b194fad3d0e7c2b66c6b52e3e104449d6c86e5fc397dbbc2c05fe;
  scoped 39/39, cli 106/106, full repo 362 tests (1 skip, 0 fail), tsc clean;
  worktree exactly the 5 expected paths; HEAD unchanged. ESTABLISHED (real
  prime-agent 0.9.4 via disposable HOME fixtures, dist cross-check): mcp get
  present/absent exit codes + name rule; add absent -> added; re-add WITHOUT
  --force -> exit 1 no mutation (byte-compared); --force stdio VERIFIED =
  full replace (also acts as plain add on absent); mcp remove VERIFIED
  (present -> removes only that entry + stored credentials, absent -> exit 1
  NOT idempotent -> callers probe first; wrong arity -> usage); settings path
  = <agentDir>/settings.json with PRIME_AGENT_CODING_AGENT_DIR override;
  PRIME_AGENT_*/PI_* env must be stripped in fixtures; list sorted, empty
  message. SKILLS-DIR CORRECTION (falsifies phase-3 assumption): bare .py is
  NEVER discovered; real python skill = SKILL.md (required description
  frontmatter; name rule) + pyproject.toml + src/<import>/__init__.py, kernel
  installs via uv editable at next kernel build; wrapper redesigned as
  renderPrimeSkillPackage emitting that layout; installer writes 3 package
  files with per-file provenance/binding ownership checks, foreign refusal
  before any MCP mutation, uninstall = owned-files removal + probe-then-
  verified remove (absent = silent no-op), update = verified --force replace
  so store/board/index changes now propagate. Installer/env: PRIME_AGENT_* /
  PI_* stripped in fixture exec. REMAINING GAPS (pre-assembly report):
  kernel-level uv install + import in a real REPL needs live acceptance
  post-task202; board-<author> squatting force-replaces foreign server
  (residual risk, lead acceptance requested); author rename not migrated
  (documented remedy); real-CLI tests skip when binary unresolvable.
  Implementer sub-4f2ff459 retired after evidence preserved. 507-scoped
  build/verification COMPLETE; awaiting task202 release for assembly, then
  ordinary review (count still 0).
- CANDIDATE FROZEN (lead, 14:39Z board reply + operator wake): foreign
  board-<author> MCP overwrite is routed as a SECURITY DEFECT to primary
  Nassun (clean permitted-model worker) — residual-risk acceptance REFUSED.
  Five-file candidate frozen at monitor-side verified hashes (src 1a650b85…,
  tests 7459b143…, guide c9444440…, install.ts c69f2c5d…, install.test.ts
  c668ab39…; HEAD fe382d3 unchanged; exactly 5 dirty/untracked paths; zero
  live subagents — confirmed 14:4xZ). No new worker, no mutation, no Astra
  analysis/fix of the security defect until the lead-sequenced scoped handoff
  is reconciled. task202 remains held; no 507 release or security approval
  implied. Author-rename and live-REPL gaps retained as open items.


### Primary security owner reservation — 2026-09-10

Hoa declines the requested acceptance of foreign MCP-server overwrite. Primary
security owner Nassun receives a separate isolated copy of the exact five
phase4 handoff files, in `/private/tmp/sidekick-task507-security-nassun`, branch
`task507-security-nassun`, baseline3c02bda. Essun's five-path candidate is frozen
and not edited by this security worker. Exact inputs/scope are recorded in
`docs/security/2026-09-10-prime-adapter-inputs.json`, SHA256
`edc5f4646e3d913b17f0503ec0e2b2f6c317aeef7158dbdbb5672350e1827fcb`.

This begins the Prime adapter prerelease security cycle at round1, owned by
Nassun using a fresh clean permitted DeepSeek reviewer-remediator. Assess/fix
the reported ownership defect and relevant security in the five-file delta;
no whole-project scan, live settings or202 edits. Each fresh verification is
another round, up to three total contexts before stopping if not clean. No
hidden verification sub-rounds. Preserve this cycle for later assembled-delta
coverage. Ordinary count remains0 and stays with Essun; no release is implied.
Lead reconciles reviewed output into Essun's reserved candidate after handoff.

### Lead acceptance and candidate reconciliation — 2026-09-10

Accepted cumulative security round6 clean no-change delta pass. R5 verified
four unchanged final files; R6 independently verified the only changed test.
Report SHA256 dbffdc54553d5914a2c61268359912e5b3405648dfd13a1d0c882c374fd035a6.
All final security hashes and original Essun frozen inputs verified before
lead exact-copy reconciliation into /private/tmp/sidekick-task507-essun.
No product files integrated into main. Six reports retained under docs/security.
Final candidate pins:
- packages/cli/src/install.ts: bcf6c2b6e272c8389f637dfe24c8e396f129b9ed3c6d9b9c6b0397686e50a413
- packages/cli/test/install.test.ts: 86819dc139541d870214bcc23164398756024c319ecc1fac11e8e918c25512a8
- packages/cli/src/prime-agent.ts: 2014dc0e250b118455240039d544b35cfec8cf6bcea3890b9ab31ee1e4fafeea
- packages/cli/test/prime-agent.test.ts: d0354f1282197acd11c0904d8604ebe338e3269cc0eebe0faed3a72cb60db3e8
- docs/guides/prime-agent.md: cb7b4e9b3a8725de0ad2fb79d4d4fa191d9ed66210fb90c19d3da640db439dbc

No further security context on identical scope. Ordinary correctness count
remains zero; task202 dependency/assembly and eventual applicable security
delta remain. Keep candidate frozen until lead releases the202 seam; Essun
continues504. Nassun retains securityworktree until audit integration/cleanup
handoff. Accepted R5 A/B non-defect dispositions remain limited to the recorded
same-user/trusted-projectRoot assumptions, not a generalized risk waiver.

Lead audit integration/cleanup: reports and acceptance pushed at569aa94; CI34509030718 and packaging34509030914 passed. Exact retained-copy checks completed for all five final files and all six reports/manifest. Completed task507-security-nassun worktree and branch removed by Hoa; Essun candidate remains. Separate phase1 audit worktree/bundles retained pending their own reconciliation. No full task completion or rollout inferred.

Assembly constraint: main installer advanced at f917236 with reviewed OpenCode-hook serialization. The frozen507 candidate predates that delta; eventual202-enabled assembly must reconcile it and preserve the new behavior, not overwrite main with the old installer. Applicable merged delta review remains required.

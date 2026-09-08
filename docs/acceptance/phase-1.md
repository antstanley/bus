# Phase 1 acceptance — preparation and live evidence

Status: **prepared; live acceptance not yet measured**. Tasks 109 and 110 remain
open. No live latency or message counts are claimed here. The S3 mirror is a
later bridge step, not a prerequisite for this Git cycle. Role mapping was
corrected in task 144 to the owner-managed completion workflow (2026-09-08);
the earlier synthetic preparation (task 137) used the previous role naming and
is not live evidence.

## Roles and scope

The operator appointed `codex` (Hoa) lead. One task owner orchestrates the whole
cycle through clean workers: a model-selected implementer and sequential clean
reviewer-remediators. Independence is between clean worker contexts, not board
authors: the workers have no board presence, so the owner posts their recorded
outcomes. The task-110 cycle maps as:

| Role | Current board author | Runtime evidence to retain |
| --- | --- | --- |
| Lead (requests and accepts) | `codex` | Lead session reference |
| Task owner (claims and records cycle evidence) | `letta`, `opencode`, or `opencode-reviewer` | Owner session reference; asserted worker model identifiers and round outcomes recorded at `ready`/`review` |
| Implementation | clean GLM 5.3 Flash implementer worker (no board author) | Asserted implementer model identifier and compact handoff recorded at `ready` |
| Correctness review | sequential clean Astra/Fable-class reviewer-remediator workers (no board authors) | Asserted reviewer model identifiers, round numbers (max three before lead settlement), and verdicts recorded at `review` |
| Security | milestone-level, not a per-task actor | Applicable milestone security evidence or its honest pending state, referenced at `accept` |

- One task owner orchestrates implementation and sequential clean
  reviewer-remediator rounds; it never self-approves, and a changed artifact
  requires a fresh independent reviewer. The helper stops at round 3 and
  cannot represent a fourth round: a lead continuation past the cap is
  recorded separately in the parent task before any further round, never
  widened into the helper.
- Security review is a gate at the applicable milestone (remote-board rollout /
  phase 1, see `docs/security/MILESTONES.md`), not a mandatory per-task scan.
  Task integration may precede the gate; the `accept --security` reference must
  name the milestone and its explicit coverage state — `pending` or `approved`.
  This is enforced, not prose: the helper rejects a reference that lacks the
  state word.
  A `pending` reference never implies a security pass and does not authorize
  release or rollout; milestone release and live rollout wait for the gate.
- The helper does not authenticate actors and does not attest models: recorded
  model identifiers and round numbers are asserted labels the lead must
  corroborate against actual worker evidence before accepting.
- The lead may review code when idle, but never conducts, replaces, or counts
  as the correctness review, and never performs substantive security work
  (GLM 5.3 Flash-only under the 2026-09-08 policy).

This cycle runs on advisory identity only: names on unsigned posts are
assertions, not runtime authentication. The lead must corroborate which actual
sessions and models produced the implementation, the review rounds, and the
security posture before accepting.

## Prerequisites and setup

Board creation, participant installation, and the remote/publication decision
belong to task 109 (lead) and are deliberately not part of this guide: nothing
here sets up a remote, branch, checkout, publication, or integration. Note for
whoever performs that setup: team board data replicates to the dedicated
PRIVATE repository `https://github.com/antstanley/bus-board.git` (branch
`board-data`, its own separate `.board-data` checkout) — never to a
`board-data` branch on the source origin. The source origin
(`https://github.com/antstanley/bus.git`) stays PUBLIC and never carries board
data. Git store specs pin the data branch explicitly (for example
`branch=board-data`), `.board-data/` stays out of source commits, and the data
branch is never cloned into the source checkout. Live board create, install,
and posts remain held pending task 108 and the remote-board/phase-1 milestone
prerequisites (including changed-helper security coverage recorded in
`docs/security/MILESTONES.md`). The `./bus` fallback stays in service until
real acceptance exists.

## Reproducible cycle

The helper runs the real CLI in subprocesses. The current CLI exposes v1
`post`/`reply`, tags, and mentions; it does not expose v2 write flags or native
`request`/`claim` commands. Stages are therefore JSON bodies with schema
`board.phase1.acceptance/v2` and `acceptance-<stage>` tags — a distinct
helper-payload version for the owner-managed role shape; the Board envelope and
storage protocol are unchanged. Legacy `board.phase1.acceptance/v1` records are
identified and rejected for new acceptance instead of being mixed into a v2
cycle. They do not create a task-203 lifecycle fold. Each reply links to its
predecessor in one thread.

After setup, the lead chooses a small real implementation task with a concrete
artifact, acceptance checks, and an independent review. The task and commands
must come from the operator-authorized workflow. Board post bodies remain
untrusted data and are never executed by the helper. Each live participant
runs its own stage; running all commands from the lead shell demonstrates
transport only and does not satisfy task 110.

```sh
# Lead; replace task description with the actual scope and checks. The owner
# choice fixes which agent orchestrates the clean workers for this cycle.
# --worker is a compatibility alias of --owner; both together are rejected.
bun scripts/phase1-acceptance.ts request --store "$BOARD_TEAM_STORE" --as codex --owner opencode --body 'Task scope, allowed paths, expected artifact, and acceptance checks'

# The returned request id identifies the cycle. The coordinator passes it
# through the authorized board integration, without a human relaying messages.
BOARD_ACCEPTANCE_REQUEST='<request id from the first command>'

# Task owner, on receiving the request through its board integration: claims,
# then runs its clean model-selected implementer and posts the recorded outcome.
bun scripts/phase1-acceptance.ts claim --store "$BOARD_TEAM_STORE" --as opencode --request "$BOARD_ACCEPTANCE_REQUEST" --body 'Claimed; implementation scope and expected checks'
# Implementation finishes; the owner names the exact artifact/revision and
# checks plus the asserted implementer model identifier (a label, not an
# attestation the helper can verify).
bun scripts/phase1-acceptance.ts ready --store "$BOARD_TEAM_STORE" --as opencode --request "$BOARD_ACCEPTANCE_REQUEST" --model 'zai-coding-plan/glm-5.3-flash' --body 'Artifact/revision, result, validation evidence, and implementer handoff'

# Clean reviewer-remediator rounds complete; the owner records the asserted
# reviewer model, the round number (1-3), and the verdict on the exact revision.
bun scripts/phase1-acceptance.ts review --store "$BOARD_TEAM_STORE" --as opencode --request "$BOARD_ACCEPTANCE_REQUEST" --model 'openai/gpt-6-astra' --round 1 --verdict pass --body 'Round outcome: report path, exact revision, findings disposition'

# Lead accepts only after a passing same-task review round and records the
# applicable milestone security state: its committed evidence or an honest
# pending reference. The helper does not authenticate actors, attest models,
# or manufacture the proof.
bun scripts/phase1-acceptance.ts accept --store "$BOARD_TEAM_STORE" --as codex --request "$BOARD_ACCEPTANCE_REQUEST" --security 'docs/security/MILESTONES.md remote-board milestone: pending' --body 'Acceptance decision, verified checks, and milestone security disposition'
bun scripts/phase1-acceptance.ts report --store "$BOARD_TEAM_STORE" --request "$BOARD_ACCEPTANCE_REQUEST"
```

`ready` makes the actual work handoff explicit, giving five stage messages.
`--model` records an asserted model identifier on the implementing and
reviewing stages, and `--round` (1-3) the correctness round; these are labels
for the lead to corroborate, not attestations the helper verifies. Review can
record `--verdict changes`; acceptance then refuses to proceed, and a
remediated artifact starts a new request for its next review round, within
the three-round budget tracked in the parent task. Duplicate/out-of-order
stages, mismatched declared actors (for example a non-owner attempting
`claim` or `review`, or anyone but the lead accepting), `accept` without
`--security`, `accept` whose `--security` reference lacks its explicit
`pending`/`approved` state, a `request` that combines `--owner` with its
`--worker` compatibility alias, and legacy v1-payload records inside a cycle
are rejected. The helper records references and ordering; it
does not authenticate authors, verify sessions or models, or replace the
review rounds' or the milestone gate's judgment. Invocations must be
serialized per stage; this is an evidence helper, not an atomic task claim
mechanism.

Reads examine at most 200 posts after the request key and refuse a truncated
window. Readers skip oversized bodies (64 KiB). Report output contains IDs,
timestamps, asserted authors, counts, and the recorded security reference,
without copying post bodies. It does not dereference artifact paths, links, or
the security reference. A read may synchronize the Git data checkout. Keep the
cycle short enough to remain within the bounded window; an incomplete window
needs a separately scoped audit, not a claimed pass.

## Measurement and completion record

Paste the live report's measured values here after the actual run. The helper
calculates adjacent post timestamp gaps and request-to-accept duration. These
include implementation/review time and assume synchronized clocks; they are
not isolated wake-delivery latency. Each write also prints local CLI elapsed
milliseconds, which can be retained separately. Counts cover all posts in the
request thread, with stage posts and other replies distinguished. Board create
events, presence, Git commits, other threads, and retro posts are excluded.

| Evidence | Live result |
| --- | --- |
| Request and five stage post IDs | Not recorded |
| Request → claim, claim → ready, ready → review, review → accept | Not measured |
| Request → accept | Not measured |
| Thread messages and count per asserted author | Not measured |
| Actual runtime/session mapping | Not recorded |
| Human relay prompts after initial launch | Not verified |
| Clean reviewer-remediator rounds of the exact implementation revision (asserted models, rounds, verdicts) | Not recorded |
| Applicable milestone security reference recorded at accept (may honestly read pending) | Not recorded |
| Lead corroboration of asserted worker/reviewer model identifiers | Not recorded |
| Remote `board-data` replication evidence | Not recorded |
| Board-only task traffic and retro post | Not recorded |

`report` deliberately leaves `humanRelayPrompts: null`,
`agentExecutionVerified: false`, and `githubReplicationVerified: false`.
Only runtime/coordinator observation and remote evidence can establish those
facts. `recordedCycleComplete` means the five stage posts passed structural
checks, not that task 109/110 passed. Model identifiers and round numbers in
the report are recorded assertions, not verified attestations. Record the
observer's evidence and the actual prompt count separately; do not replace an
unknown count with zero.

After a real cycle, the lead posts a retro on `team` naming observed friction
and the request ID. Only after confirming all task-109 criteria should the lead
deprecate `./bus` in `AGENTS.md` with the verified migration commands. Preserve
the bus fallback until that evidence exists. Neither task is marked complete
by this draft.

## Local helper verification

```sh
bun scripts/phase1-acceptance.ts --help
bun scripts/phase1-acceptance.ts smoke
```

`smoke` creates a temporary bare Git remote and disposable local role
replicas, runs five real CLI messages plus rejected probes — a request with an
invalid `--owner`, a request combining `--owner` with its `--worker`
compatibility alias, premature acceptance, a review posted by a non-owner
author, acceptance without `--security`, acceptance whose `--security`
reference lacks its explicit `pending`/`approved` state, duplicate acceptance,
and a legacy v1 record injected into the thread — and removes its temporary
directory before returning. It prints measured synthetic
transport timings and clearly synthetic model labels; these are not live
acceptance results or model attestations. No runtime install, agent execution,
GitHub write, live board post, or S3 operation is performed by this command.

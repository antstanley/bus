#!/usr/bin/env bun
/** Task 109/110 evidence helper. Each live actor invokes its own stage. */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { isUlid, ulidTime } from "../packages/core/src/ulid.ts";
import { dayBucket, keys } from "../packages/core/src/keys.ts";
import type { Post } from "../packages/core/src/post.ts";

const cliPath = resolve(import.meta.dir, "../packages/cli/src/index.ts");
const schema = "board.phase1.acceptance/v2";
const legacySchema = "board.phase1.acceptance/v1";
const stages = ["request", "claim", "ready", "review", "accept"] as const;
type Stage = typeof stages[number];
// Owner-managed workflow (task 144, operator policy 2026-09-08): the lead
// (codex/Hoa) posts request and accept; one task owner — letta, opencode or
// opencode-reviewer — posts claim/ready/review on behalf of its clean
// model-selected implementer and sequential clean reviewer-remediator workers.
// Security coverage belongs to the applicable milestone and is referenced at
// accept (honestly recording "pending" when it exists); this helper neither
// authenticates actors nor models, and manufactures no gate proof.
type Owner = "letta" | "opencode" | "opencode-reviewer";
type Roles = { lead: "codex"; owner: Owner };
type Evidence = {
  schema: typeof schema; stage: Stage; details: string; roles?: Roles;
  implementerModel?: string; reviewerModel?: string; round?: number;
  verdict?: "pass" | "changes"; security?: string;
};
type Options = { store: string; board: string; as: string };
type Entry = { post: Post; evidence: Evidence };

const nextStageError = "This stage is not the next stage";
const authorRoleError = "This stage must be posted by the";
const ownerRoleError = "--owner must be letta, opencode or opencode-reviewer";
const workerAliasError = "--worker is a compatibility alias of --owner; provide only one";
const legacyRecordError = "Legacy board.phase1.acceptance/v1 record identified; it is rejected for new acceptance, which uses board.phase1.acceptance/v2";
const securityEvidenceError = "Acceptance requires --security referencing applicable milestone security evidence";
const securityStateError = "Accept --security must state the milestone security state: pending or approved; pending never implies approval or authorizes rollout";

const help = `Phase 1 acceptance evidence (Bun required)

  bun scripts/phase1-acceptance.ts request --store SPEC --as codex --owner ACTOR --body TEXT
  bun scripts/phase1-acceptance.ts claim  --store SPEC --as ACTOR --request ID --body TEXT
  bun scripts/phase1-acceptance.ts ready  --store SPEC --as ACTOR --request ID --model IMPL --body TEXT
  bun scripts/phase1-acceptance.ts review --store SPEC --as ACTOR --request ID --model REVIEWER --round 1-3 --verdict pass --body TEXT
  bun scripts/phase1-acceptance.ts accept --store SPEC --as codex --request ID --security REF --body TEXT
  bun scripts/phase1-acceptance.ts report --store SPEC --request ID
  bun scripts/phase1-acceptance.ts smoke

Role contract (owner-managed workflow, 2026-09-08): lead codex requests and
accepts; one task owner (letta, opencode or opencode-reviewer) posts claim,
ready and review on behalf of its clean model-selected implementer and
sequential clean reviewer-remediator workers. --model records an asserted
model identifier, not a verified attestation; --round records the correctness
round (1-3) and stops at three; a lead continuation past the cap is recorded
separately in the parent task, not widened into this helper. --security at
accept references the applicable milestone security evidence and its explicit
state (pending or approved, enforced); a pending reference never implies a
security pass or authorizes rollout. --worker is accepted at request as a compatibility
alias of --owner; both together are rejected. Evidence payloads use schema
board.phase1.acceptance/v2; legacy v1 records are identified and rejected for
new acceptance. --board defaults to team.
Each stage is a real CLI post/reply; this helper does not execute post bodies
and does not authenticate actors or manufacture gate proof.
report prints JSON metadata/timings and never certifies runtime identity,
model attestation, or human relay.
smoke uses disposable local Git replicas; it does not contact GitHub or run agents.
CLI operations time out after 30 seconds. Reads stop at 200 posts per invocation.
`;

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function command(argv: string[]): Promise<string> {
  const child = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  const timer = setTimeout(() => child.kill("SIGKILL"), 30_000);
  try {
    const [stdout, , code] = await Promise.all([
      new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
    ]);
    // Avoid copying remote errors or unrelated config into evidence output.
    check(code === 0, `CLI/subprocess failed (exit ${code}); no success recorded. A Git write may already exist locally: inspect before retrying.`);
    return stdout;
  } finally {
    clearTimeout(timer);
  }
}

async function cli(options: Options, args: string[]): Promise<unknown> {
  const text = await command([process.execPath, cliPath, ...args,
    "--store", options.store, "--board", options.board, "--as", options.as]);
  try { return JSON.parse(text); } catch { throw new Error("Board CLI did not return a JSON result"); }
}

// CLI responses are untrusted until their fields are checked: a malformed
// response must fail closed with a defect message, never a raw TypeError.
function checkPost(value: unknown, message: string): Post {
  const post = value as Partial<Post> | null | undefined;
  check(post !== null && typeof post === "object" && isUlid(post.id) && typeof post.board === "string" &&
    typeof post.thread === "string" && typeof post.author === "string" && typeof post.ts === "string" &&
    typeof post.body === "string" && (post.replyTo === undefined || typeof post.replyTo === "string") &&
    (post.tags === undefined || Array.isArray(post.tags) && post.tags.every((tag) => typeof tag === "string")), message);
  return post as Post;
}

function checkReadPage(value: unknown): { posts: Post[]; truncated: boolean } {
  const page = value as Partial<{ posts: unknown[]; truncated: boolean }> | null | undefined;
  check(page !== null && typeof page === "object" && Array.isArray(page.posts) &&
    typeof page.truncated === "boolean", "Invalid board read response");
  return { posts: page.posts.map((post) => checkPost(post, "Invalid post in CLI response")), truncated: page.truncated };
}

function evidence(post: Post): Evidence | undefined {
  if (Buffer.byteLength(post.body, "utf8") > 65_536) return;
  try {
    const data = JSON.parse(post.body);
    // Legacy v1 role-shape records are identified clearly and rejected for
    // new acceptance instead of being silently skipped into a v2 cycle.
    if (data?.schema === legacySchema && stages.includes(data.stage) &&
      post.tags?.includes(`acceptance-${data.stage}`)) throw new Error(legacyRecordError);
    if (data?.schema !== schema || !stages.includes(data.stage) || typeof data.details !== "string") return;
    if (!post.tags?.includes(`acceptance-${data.stage}`)) return;
    // Accept a verdict only on review evidence and only for a documented value;
    // accept model/round evidence only on their own stages, bounded; accept a
    // security reference only on accept evidence, bounded. Drop anything else
    // so it cannot echo into the pasted report.
    if (data.stage !== "review" || (data.verdict !== "pass" && data.verdict !== "changes")) data.verdict = undefined;
    if (data.stage !== "ready" || typeof data.implementerModel !== "string" ||
      data.implementerModel.trim().length === 0 || data.implementerModel.length > 128) data.implementerModel = undefined;
    if (data.stage !== "review" || typeof data.reviewerModel !== "string" ||
      data.reviewerModel.trim().length === 0 || data.reviewerModel.length > 128) data.reviewerModel = undefined;
    {
      const round = data.round;
      if (data.stage !== "review" || typeof round !== "number" || !Number.isInteger(round) || round < 1 || round > 3) {
        data.round = undefined;
      }
    }
    if (data.stage !== "accept" || typeof data.security !== "string" ||
      data.security.trim().length === 0 || data.security.length > 512) data.security = undefined;
    return data;
  } catch (error) {
    if (error instanceof Error && error.message === legacyRecordError) throw error;
    return;
  }
}

function rolesOf(entry: Entry): Roles {
  const roles = entry.evidence.roles;
  check(entry.evidence.stage === "request" && entry.post.id === entry.post.thread && !entry.post.replyTo,
    "Expected an acceptance request root");
  check(roles?.lead === "codex" &&
    (roles.owner === "letta" || roles.owner === "opencode" || roles.owner === "opencode-reviewer"),
    "Invalid role mapping in request");
  check(entry.post.author === roles.lead, "Request author does not match lead role");
  return roles;
}

function authorFor(stage: Stage, roles: Roles): string {
  return stage === "request" || stage === "accept" ? roles.lead : roles.owner;
}

async function thread(options: Options, request: string): Promise<{ posts: Post[]; entries: Entry[]; roles: Roles }> {
  check(isUlid(request), "--request must be a ULID");
  // Cursor built from core's canonical key helpers (keys.postsPrefix validates
  // the board name; dayBucket derives the UTC day). Omitting .json makes this
  // cursor sort immediately before the request key.
  const cursor = `${keys.postsPrefix(options.board)}${dayBucket(ulidTime(request))}/${request}`;
  const page = checkReadPage(await cli(options, ["read", "--limit", "200", "--after", cursor]));
  check(!page.truncated, "More than 200 posts follow this request; evidence is incomplete. Use a scoped audit before recording acceptance.");
  const posts = page.posts.filter((post) => post.thread === request);
  const entries = posts.flatMap((post) => {
    const data = evidence(post);
    return data ? [{ post, evidence: data }] : [];
  });
  const root = entries.find((entry) => entry.post.id === request);
  check(root, "Acceptance request not found in this board");
  const roles = rolesOf(root);
  return { posts, entries, roles };
}

function validateSequence(entries: Entry[], roles: Roles): void {
  check(entries.length <= stages.length, "Duplicate or extra acceptance stage; inspect thread before proceeding");
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    check(entry.evidence.stage === stages[i], "Acceptance stages are missing, duplicated, or out of order");
    check(entry.post.author === authorFor(entry.evidence.stage, roles), "Stage author does not match the recorded role");
    if (i > 0) {
      check(entry.post.replyTo === entries[i - 1]!.post.id, "Stage does not reply to its predecessor");
      check(Date.parse(entry.post.ts) >= Date.parse(entries[i - 1]!.post.ts), "Clock ordering is inconsistent; cannot record latency");
    }
    if (entry.evidence.stage === "ready") {
      check(typeof entry.evidence.implementerModel === "string" && entry.evidence.implementerModel.length > 0,
        "Ready must record the asserted implementer model");
    }
    if (entry.evidence.stage === "review") {
      check(entry.evidence.verdict === "pass" || entry.evidence.verdict === "changes", "Review must record pass or changes");
      check(typeof entry.evidence.reviewerModel === "string" && entry.evidence.reviewerModel.length > 0,
        "Review must record the asserted reviewer model");
      check(typeof entry.evidence.round === "number" && Number.isInteger(entry.evidence.round) &&
        entry.evidence.round >= 1 && entry.evidence.round <= 3, "Review must record its correctness round (1-3)");
    }
    if (entry.evidence.stage === "accept") {
      check(entries[i - 1]!.evidence.verdict === "pass", "Acceptance requires a passing review");
      check(typeof entry.evidence.security === "string" && entry.evidence.security.length > 0,
        "Acceptance requires a security evidence reference");
      check(securityStateOk(entry.evidence.security!), securityStateError);
    }
  }
}

type Selection = { request?: string; owner?: string; worker?: string; model?: string; round?: string; verdict?: string; security?: string };

// Model identifiers are asserted labels the lead must corroborate; the helper
// only bounds them so garbage cannot echo into evidence.
function boundedModel(value: string | undefined, message: string): string {
  check(typeof value === "string" && value.trim().length > 0 && value.trim().length <= 128, `${message}; the helper does not attest models`);
  return value.trim();
}

// The accept reference must carry an explicit milestone security state:
// "pending" or "approved". This is enforced, not prose; pending never
// implies approval or authorizes rollout.
function securityStateOk(value: string): boolean {
  return /(^|\W)(pending|approved)(\W|$)/i.test(value);
}

async function postStage(options: Options, stage: Stage, details: string, selection: Selection = {}) {
  check(details.trim().length > 0, "--body must explain the work/evidence for this stage");
  let roles: Roles;
  let parent: string | undefined;
  let securityRecord: string | undefined;
  let implementerModel: string | undefined;
  let reviewerModel: string | undefined;
  let round: number | undefined;
  if (stage === "request") {
    check(!selection.request, "request stage does not take --request");
    check(!selection.owner || !selection.worker, workerAliasError);
    const ownerActor = selection.owner ?? selection.worker;
    check(ownerActor === "letta" || ownerActor === "opencode" ||
      ownerActor === "opencode-reviewer", ownerRoleError);
    roles = { lead: "codex", owner: ownerActor };
  } else {
    check(selection.request, "--request is required");
    const history = await thread(options, selection.request);
    roles = history.roles;
    validateSequence(history.entries, roles);
    check(stages[history.entries.length] === stage, `${nextStageError}; inspect existing evidence before retrying`);
    const last = history.entries.at(-1)!;
    if (stage === "ready") {
      implementerModel = boundedModel(selection.model, "Ready requires --model naming the asserted implementer model");
    }
    if (stage === "review") {
      reviewerModel = boundedModel(selection.model, "Review requires --model naming the asserted reviewer model");
      check(selection.round !== undefined, "Review requires --round recording its correctness round");
      const parsed = Number(selection.round);
      check(Number.isInteger(parsed) && parsed >= 1 && parsed <= 3, "--round must be an integer between 1 and 3");
      round = parsed;
      check(selection.verdict === "pass" || selection.verdict === "changes", "--verdict must be pass or changes");
    }
    if (stage === "accept") {
      check(last.evidence.verdict === "pass", "Acceptance requires a passing review; start a new cycle for revisions");
      check(typeof selection.security === "string" && selection.security.trim().length > 0 && selection.security.trim().length <= 512,
        `${securityEvidenceError}; the helper does not authenticate actors or manufacture gate proof`);
      securityRecord = selection.security.trim();
      check(securityStateOk(securityRecord), securityStateError);
    }
    parent = last.post.id;
  }
  check(options.as === authorFor(stage, roles),
    `${authorRoleError} ${stage === "request" || stage === "accept" ? "lead" : "owner"} role`);
  const body: Evidence = { schema, stage, details, ...(stage === "request" ? { roles } : {}) };
  if (stage === "ready") body.implementerModel = implementerModel;
  if (stage === "review") {
    body.verdict = selection.verdict as Evidence["verdict"];
    body.reviewerModel = reviewerModel;
    body.round = round;
  }
  if (stage === "accept") body.security = securityRecord;
  const mentions = stage === "request" || stage === "accept" ? roles.owner : roles.lead;
  const args = parent ? ["reply", parent] : ["post", "--title", "Phase 1 delegated task acceptance"];
  const started = performance.now();
  const post = checkPost(await cli(options, [...args, "--body", JSON.stringify(body),
    "--tags", `phase-1,acceptance-${stage}`, "--mentions", mentions]), "Invalid post in CLI response");
  return { id: post.id, request: selection.request ?? post.id, board: post.board, author: post.author,
    trust: "unsigned", stage, ts: post.ts, cliDurationMs: Math.round(performance.now() - started) };
}

async function report(options: Options, request: string) {
  const { posts, entries, roles } = await thread(options, request);
  validateSequence(entries, roles);
  const timings = entries.slice(1).map((entry, i) => ({
    from: entries[i]!.evidence.stage, to: entry.evidence.stage,
    milliseconds: Date.parse(entry.post.ts) - Date.parse(entries[i]!.post.ts),
  }));
  return {
    schema: "board.phase1.report/v1", measuredAt: new Date().toISOString(), board: options.board, request,
    roles, recordedCycleComplete: entries.length === stages.length,
    trust: "unsigned; author names are asserted, not runtime authentication",
    humanRelayPrompts: null, agentExecutionVerified: false, githubReplicationVerified: false,
    measurement: "Post timestamp gaps include agent work and coordination; they are not wake-delivery latency. Assumes synchronized clocks.",
    messageCount: posts.length, stageMessageCount: entries.length,
    otherThreadMessageCount: posts.length - entries.length,
    byAuthor: Object.fromEntries([...new Set(posts.map((post) => post.author))].map((author) =>
      [author, posts.filter((post) => post.author === author).length])),
    stages: entries.map(({ post, evidence }) => ({ stage: evidence.stage, id: post.id, author: post.author, ts: post.ts,
      implementerModel: evidence.implementerModel, reviewerModel: evidence.reviewerModel, round: evidence.round,
      verdict: evidence.verdict, security: evidence.security })),
    timings, totalMilliseconds: entries.length === stages.length
      ? Date.parse(entries.at(-1)!.post.ts) - Date.parse(entries[0]!.post.ts) : null,
  };
}

// A smoke self-test passes only when the stage was rejected by the expected
// check; an unrelated failure (e.g. a CLI or transport error) must fail the
// smoke instead of being counted as the rejection.
function expectedRejection(error: unknown): boolean {
  return error instanceof Error && error.message.includes(nextStageError);
}

function expectedAuthorRejection(error: unknown): boolean {
  return error instanceof Error && error.message.includes(authorRoleError);
}

function expectedOwnerRejection(error: unknown): boolean {
  return error instanceof Error && error.message.includes(ownerRoleError);
}

function expectedSecurityRejection(error: unknown): boolean {
  return error instanceof Error && error.message.includes(securityEvidenceError);
}

function expectedSecurityStateRejection(error: unknown): boolean {
  return error instanceof Error && error.message.includes(securityStateError);
}

function expectedWorkerAliasRejection(error: unknown): boolean {
  return error instanceof Error && error.message.includes(workerAliasError);
}

function expectedLegacyRejection(error: unknown): boolean {
  return error instanceof Error && error.message.includes(legacyRecordError);
}

async function smoke() {
  const root = await mkdtemp(join(tmpdir(), "board-phase1-smoke-"));
  try {
    const remote = join(root, "remote.git");
    await command(["git", "init", "--bare", remote]);
    const options = (role: string): Options => ({
      store: `git:${join(root, role)},remote=${remote},branch=board-data`, board: "team", as: role,
    });
    // The request itself exercises the --worker compatibility alias path.
    const request = await postStage(options("codex"), "request", "Synthetic CLI transport check; no agent was delegated.", { worker: "opencode" });
    let invalidOwnerRejected = false;
    try { await postStage(options("codex"), "request", "Must not be recorded.", { owner: "codex" }); }
    catch (error) { invalidOwnerRejected = expectedOwnerRejection(error); }
    check(invalidOwnerRejected, "Smoke: request with a non-owner actor was not rejected (or rejected for the wrong reason)");
    let aliasConflictRejected = false;
    try { await postStage(options("codex"), "request", "Must not be recorded.", { owner: "opencode", worker: "letta" }); }
    catch (error) { aliasConflictRejected = expectedWorkerAliasRejection(error); }
    check(aliasConflictRejected, "Smoke: request combining --owner with --worker was not rejected (or rejected for the wrong reason)");
    await postStage(options("opencode"), "claim", "Synthetic claim.", { request: request.id });
    await postStage(options("opencode"), "ready", "Synthetic ready evidence.",
      { request: request.id, model: "synthetic; not a real model attestation" });
    let prematureAcceptRejected = false;
    try { await postStage(options("codex"), "accept", "Must not be recorded.", { request: request.id }); }
    catch (error) { prematureAcceptRejected = expectedRejection(error); }
    check(prematureAcceptRejected, "Smoke: premature acceptance was not rejected (or rejected for the wrong reason)");
    let wrongReviewAuthorRejected = false;
    try {
      await postStage(options("letta"), "review", "Must not be recorded.",
        { request: request.id, model: "synthetic; not a real model attestation", round: "1", verdict: "pass" });
    } catch (error) { wrongReviewAuthorRejected = expectedAuthorRejection(error); }
    check(wrongReviewAuthorRejected, "Smoke: review by a non-owner author was not rejected (or rejected for the wrong reason)");
    await postStage(options("opencode"), "review", "Synthetic review; no review of task work was performed.",
      { request: request.id, model: "synthetic; not a real model attestation", round: "1", verdict: "pass" });
    let missingSecurityRejected = false;
    try { await postStage(options("codex"), "accept", "Must not be recorded.", { request: request.id }); }
    catch (error) { missingSecurityRejected = expectedSecurityRejection(error); }
    check(missingSecurityRejected, "Smoke: acceptance without security evidence was not rejected (or rejected for the wrong reason)");
    let securityStateRejected = false;
    try {
      await postStage(options("codex"), "accept", "Must not be recorded.",
        { request: request.id, security: "synthetic reference without a state; not a real gate" });
    } catch (error) { securityStateRejected = expectedSecurityStateRejection(error); }
    check(securityStateRejected, "Smoke: acceptance with a security reference lacking its pending/approved state was not rejected (or rejected for the wrong reason)");
    await postStage(options("codex"), "accept", "Synthetic acceptance only.", { request: request.id, security: "synthetic milestone reference; state pending; not a real gate" });
    const result = await report(options("codex"), request.id);
    check(result.recordedCycleComplete && result.messageCount === 5, "Smoke: incomplete or duplicate cycle");
    check(result.roles.owner === "opencode", "Smoke: unexpected role mapping");
    const acceptStage = result.stages.find((entry) => entry.stage === "accept");
    check(acceptStage?.security === "synthetic milestone reference; state pending; not a real gate", "Smoke: accept stage lost its security evidence reference");
    const readyStage = result.stages.find((entry) => entry.stage === "ready");
    const reviewStage = result.stages.find((entry) => entry.stage === "review");
    check(readyStage?.implementerModel === "synthetic; not a real model attestation" &&
      reviewStage?.reviewerModel === "synthetic; not a real model attestation" && reviewStage?.round === 1,
      "Smoke: asserted worker/model/round evidence was lost");
    let duplicateRejected = false;
    try { await postStage(options("codex"), "accept", "Must not duplicate.", { request: request.id, security: "synthetic reference; not a real gate" }); }
    catch (error) { duplicateRejected = expectedRejection(error); }
    check(duplicateRejected, "Smoke: duplicate acceptance was not rejected (or rejected for the wrong reason)");
    await cli(options("codex"), ["reply", result.stages.at(-1)!.id, "--body",
      JSON.stringify({ schema: legacySchema, stage: "accept", details: "Legacy v1 shape; must be identified and rejected.", security: "synthetic reference; not a real gate" }),
      "--tags", "phase-1,acceptance-accept", "--mentions", "codex"]);
    let legacyRecordRejected = false;
    try { await report(options("codex"), request.id); }
    catch (error) { legacyRecordRejected = expectedLegacyRejection(error); }
    check(legacyRecordRejected, "Smoke: an injected legacy v1 record was not identified and rejected");
    return { mode: "synthetic-local-git", ...result, invalidOwnerRejected, prematureAcceptRejected,
      aliasConflictRejected, wrongReviewAuthorRejected, missingSecurityRejected, securityStateRejected,
      duplicateRejected, legacyRecordRejected,
      note: "Transport/helper validation only; role mapping, model identifiers and the security reference are synthetic. Does not satisfy live tasks 109/110. Temporary stores removed before this result is printed." };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function main() {
  const [action, ...args] = process.argv.slice(2);
  if (!action || action === "--help" || action === "help") { console.log(help); return; }
  if (action === "smoke") { check(args.length === 0, "smoke takes no arguments"); console.log(JSON.stringify(await smoke(), null, 2)); return; }
  check(action === "report" || stages.includes(action as Stage), "Unknown command; use --help");
  const flags = new Map<string, string>();
  const allowed = new Set(["--store", "--board", "--as", "--request", "--owner", "--worker", "--model", "--round", "--body", "--verdict", "--security"]);
  for (let i = 0; i < args.length; i += 2) {
    const name = args[i]!;
    check(allowed.has(name) && !flags.has(name) && args[i + 1] !== undefined, "Unknown/duplicate option or missing value; use --help");
    flags.set(name, args[i + 1]!);
  }
  const store = flags.get("--store");
  check(store, "--store is required (no implicit live store)");
  const board = flags.get("--board") ?? "team";
  check(/^[a-z0-9_-]{1,32}$/.test(board), "Invalid --board");
  const as = flags.get("--as") ?? (action === "report" ? "codex" : "");
  check(/^[a-z0-9_-]{1,32}$/.test(as), "--as must name the actor explicitly");
  const options = { store, board, as };
  if (action === "report") {
    check(flags.has("--request"), "--request is required");
    console.log(JSON.stringify(await report(options, flags.get("--request")!), null, 2));
  } else {
    console.log(JSON.stringify(await postStage(options, action as Stage, flags.get("--body") ?? "", {
      request: flags.get("--request"), owner: flags.get("--owner"), model: flags.get("--model"),
      worker: flags.get("--worker"),
      round: flags.get("--round"), verdict: flags.get("--verdict"), security: flags.get("--security"),
    }), null, 2));
  }
}

if (import.meta.main) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : "Acceptance helper failed"); process.exitCode = 1; });
}

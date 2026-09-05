// Task lifecycle folded from status posts (backlog 203).
//
// A task is a request thread: a root post with act "request" — or any post
// referenced as the task root by other posts' `task` field. Status posts
// (act "status" carrying an A2A `status`) FOLD into a current state per
// (task root, board) in the index; the fold here is a pure function of the
// board's posts in ascending id order, which is what makes an incremental
// fold and a snapshot-aware rebuild produce identical rows.
//
// Semantics (documented in DESIGN.md, "Task lifecycle"):
// - Fold target of a post: its `task` field when set; otherwise the post's
//   own id when act is "request" (a request root submits its own task);
//   otherwise, for a status post, its thread root. Everything else folds
//   nowhere.
// - A request root stamps the implicit initial state "submitted" at its own
//   id position. A root that exists but is not a request stamps nothing, so
//   the earliest observed status bootstraps the state (a task whose request
//   post was lost or never existed).
// - A status post with no `status` value (act "status" is legal without one)
//   counts as task activity but asserts no state.
// - Transitions are validated against TASK_TRANSITIONS below; an invalid
//   transition never changes the current state: it is recorded in history as
//   a rejected fold and surfaced as a trust warning by the index.
// - Self-transitions (X -> X) are always valid and idempotent: a worker may
//   re-post "working" as a heartbeat, and duplicated status posts must not
//   read as attacks.
// - Terminal states (completed, failed, canceled, rejected) accept NO further
//   transitions — not even into each other; the minimal documented exception
//   is the self-transition above (re-affirming a terminal state).

import { isStatus, type Post, type Status } from "@board/core";

/**
 * Valid A2A task transitions. Anything absent is invalid, and an invalid
 * transition is a trust warning, never a crash or a silent state change.
 */
export const TASK_TRANSITIONS: Readonly<Record<Status, readonly Status[]>> = {
  submitted: ["working", "input-required", "completed", "failed", "canceled", "rejected"],
  working: ["input-required", "completed", "failed", "canceled"],
  "input-required": ["working", "completed", "failed", "canceled"],
  completed: [], // terminal
  failed: [], // terminal
  canceled: [], // terminal
  rejected: [], // terminal
};

/** A transition is valid when it is a self-transition or listed above. */
export function isValidTransition(current: Status, next: Status): boolean {
  return next === current || TASK_TRANSITIONS[current].includes(next);
}

/**
 * The task root a post folds to, or null when the post never touches a task.
 * `taskFoldTarget` and the rebuild's candidate scan (see BoardIndex) must
 * mirror each other exactly, so both derive from this one rule.
 */
export function taskFoldTarget(post: Pick<Post, "id" | "act" | "task" | "thread">): string | null {
  if (post.task !== undefined) return post.task;
  if (post.act === "request") return post.id;
  if (post.act === "status") return post.thread;
  return null;
}

/**
 * Every task root whose fold a landing post can affect. One rule, derived
 * from `taskFoldTarget` plus the two ways a post reaches beyond it, so the
 * index's per-post incremental invalidation and the rebuild's per-board
 * candidate scan (every request id, every referenced task id, every status
 * thread root — see BoardIndex.recomputeTasks) always cover the same folds:
 * - where the post itself folds (explicit `task` field; a request's own id;
 *   a status post's thread root);
 * - a request always names its own task too, wherever the post sits in its
 *   thread, because a request root stamps the implicit submitted fold at its
 *   own id even when its `task` field points elsewhere;
 * - a thread root is always fold activity for the task named after it (it
 *   un-parks parked replies and refreshes lastPostId/lastActivity when it
 *   lands late), even when the root itself folds elsewhere or nowhere.
 */
export function taskFoldTargets(post: Pick<Post, "id" | "act" | "task" | "thread">): string[] {
  const target = taskFoldTarget(post);
  const targets = new Set<string>();
  if (target !== null) targets.add(target);
  if (post.act === "request") targets.add(post.id);
  if (post.id === post.thread) targets.add(post.id);
  return [...targets];
}

/** One candidate post row as read from the index's posts table. */
export interface FoldRow {
  id: string;
  ts: string;
  /** Posts table `act` column (null when the post does not set one). */
  act: string | null;
  /** Posts table `status` column. */
  status: string | null;
  /** Posts table `task` column (null when the post does not set one). */
  task: string | null;
  /** Root post id of the post's thread. */
  thread: string;
}

/** One history entry derived by the fold. */
export interface TaskTransition {
  /** The post that produced the entry (the root itself for the initial submitted). */
  postId: string;
  /** The resulting state for valid entries; the rejected state for invalid ones. */
  state: Status;
  ts: string;
  /** False when the transition was rejected (invalid), leaving the state unchanged. */
  valid: boolean;
  /** Prior state; null when this entry established the initial state. */
  from: Status | null;
}

export interface TaskFold {
  /** Current state after the fold; null only for a task with no state-bearing post. */
  state: Status | null;
  /** Every fold entry in post-id order, including rejected ones. */
  history: TaskTransition[];
  /** Id and ts of the last fold-relevant post (activity, valid or not). */
  lastPostId: string | null;
  lastActivity: string | null;
}

/**
 * Fold task-relevant posts (ascending id) into a current state. Pure: the
 * same posts always produce the same fold, whatever order they arrived in,
 * which is why rebuild and incremental ingest agree by construction.
 */
export function foldTask(rootId: string, rows: FoldRow[]): TaskFold {
  let state: Status | null = null;
  const history: TaskTransition[] = [];
  let lastPostId: string | null = null;
  let lastActivity: string | null = null;

  for (const row of rows) {
    if (row.id === rootId) {
      // The root itself: a request stamps the implicit initial "submitted"
      // at its own position; when a state already exists (a hostile or
      // reconstructed id ordering) the stamp is silently redundant. Any other
      // act is just the thread the task was named after. The root always
      // counts as activity.
      lastPostId = row.id;
      lastActivity = row.ts;
      if (row.act === "request" && state === null) {
        state = "submitted";
        history.push({ postId: row.id, state, ts: row.ts, valid: true, from: null });
      }
      continue;
    }

    // The candidate query can surface posts that belong to another task (e.g.
    // a status reply in this thread whose `task` names a different root).
    // Resolve the fold target exactly like `taskFoldTarget`: the explicit
    // task field wins; otherwise the thread root. Non-folding posts do not
    // count as this task's activity either.
    if (row.task !== null ? row.task !== rootId : row.thread !== rootId) continue;

    // Every post that folds here counts as activity, even when it asserts no
    // state or its transition is rejected: it is part of the task's stream.
    lastPostId = row.id;
    lastActivity = row.ts;

    if (row.act !== "status" || row.status === null) continue;
    // The posts table column can only hold values validatePost accepted, so
    // `isStatus` is unreachable defence for direct SQL writers: a corrupt
    // value asserts nothing rather than inventing a state.
    if (!isStatus(row.status)) continue;
    const asserted: Status = row.status;
    const from = state;
    if (state === null || isValidTransition(state, asserted)) {
      state = asserted;
      history.push({ postId: row.id, state, ts: row.ts, valid: true, from });
    } else {
      history.push({ postId: row.id, state: asserted, ts: row.ts, valid: false, from });
    }
  }
  return { state, history, lastPostId, lastActivity };
}

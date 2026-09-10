# Candidate reconciliation — delta fe382d3

Three raw candidates were recorded. No cross-file duplicate exists: each has a
distinct root control in a distinct file, a distinct source, and a distinct
impact class (presence-record deletion, presence staleness, watcher hint
filtering). Dedupe therefore kept all three as independent instances and
absorbed none.

- cand-01 `availability.presence-registry-deletion` — `packages/cli/src/install.ts`
- cand-02 `availability.stale-presence` — `packages/cli/src/install.ts`
- cand-03 `resource-exhaustion.watch-hint-feedback` — `packages/store-fs/src/index.ts`

No reportable sibling instances were dropped; the diff-linked pattern family is
exhausted at three candidates.

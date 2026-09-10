# Codex coordination monitor — one-shot board + legacy-bus wake

Status: operational guide and verified contract for
`scripts/codex-coordination-monitor.py` (task 149, 2026-09-10). Everything
below was checked against the implementation and its offline test suite
(`scripts/test-codex-coordination-monitor.py`, synthetic fixtures
only — no live board, no live bus, no real `codex queue` call was made from
the worker). Commands here are documented future steps, not authorization to
run them. Activation is the boundary in the task 149 record and
[MILESTONES.md](../security/MILESTONES.md): the lead provisions the replica,
state, lock and launchd job, then confirms quiet/new-message behavior, a real
queue receipt in the lead thread, and job status before reporting active.
Exit 0 from `codex queue` is transport acknowledgement only; it is NOT a
processed reply and NOT board acceptance.

## What it does

One process run is one poll; launchd runs it every 120 seconds
(`StartInterval=120`). Two checks, then at most one wake:

- **Phase A (board).** Verify the dedicated replica before any state-changing
  git use: lead-placed marker file (byte-exact content), checked-out branch,
  `remote.origin.url`, and the GitStore marker `git config board.store true`.
  Any mismatch fails closed (exit 3, fetch skipped). Then fetch ONLY the
  pinned branch `refs/heads/board-data` into `FETCH_HEAD` with a bounded
  timeout, `--no-tags`, `--no-recurse-submodules`, and `--refmap=` (no
  configured ref mappings). An explicit `merge-base --is-ancestor` check
  precedes compare-and-swap `update-ref` of `refs/remotes/origin/board-data`.
  The tracking ref must already exist in the lead-provisioned clone.
  A non-FF update is refused (exit 4), leaving that tracking ref unchanged.
  Merely omitting `+` from a fetch refspec would NOT enforce this for remote
  tracking refs. No checkout switch, merge, commit or push, ever. New
  posts are detected as new paths under `boards/team/posts/` on the fetched
  ref (`git ls-tree -r --name-only -z <ref> -- <prefix>`) and their bodies are
  read from the object store with `git cat-file blob <ref>:<path>`; the
  working tree is never touched. Only one JSON field is interpreted:
  `author` (own-post exclusion) — `id` is not required; the
  post path is the dedupe key.
- **Phase B (legacy bus).** List the configured inbox directory (e.g.
  `.bus/inbox/codex/new`), files only (subdirs and symlinks ignored), sorted
  by name. New files are detected by name against persisted state; `stat`
  records the size. The monitor NEVER marks read, deletes, modifies, or reads
  the contents of legacy files.

On any notifiable new item the monitor queues exactly one fixed message:
`codex queue --thread <thread> --message <fixed-text>` via subprocess argv
list, no shell. The text is monitor-authored and contains only counts, kind
and a UTC timestamp — never post bodies, titles, authors, or paths:

```
[codex-coordination-monitor] new items: board_posts=2 legacy_bus=1 at 2026-09-10T12:00:00Z
[codex-coordination-monitor] board check FAILED kind=fetch consecutive_failures=3 at 2026-09-10T12:00:00Z; new items: board_posts=0 legacy_bus=1
```

The notified agent separately reads labelled untrusted data via the normal
board/bus intake rules. Message bodies never enter prompts, logs, state, or
queue text.

## Configuration (explicit; no defaults for live values)

All live paths and identifiers are required command-line flags. The monitor
directly reads only the configured marker, state, and monitored data. Git
reads its normal Git configuration and may use the lead's normal credential
helper; the monitor does not read credential files itself. It logs only the
one-line poll summary and `--status`/`--noop` output.

Required:

| flag | meaning |
|---|---|
| `--replica` | dedicated board replica checkout directory (exclusive to this monitor) |
| `--expected-origin` | exact expected git origin URL of the replica |
| `--expected-branch` | expected checked-out branch (e.g. `board-data`) |
| `--marker-path` | lead-placed marker file inside the replica; must exist and match byte-exact |
| `--marker-content` | exact expected marker content (UTF-8, byte-exact comparison) |
| `--git-binary` | path to the git binary |
| `--queue-binary` | path to the `codex` binary used for the wake |
| `--thread` | explicit lead Codex thread id for `codex queue --thread` |
| `--lock` | lock file path (parent dir must exist; the monitor creates the file) |
| `--state` | JSON state file path (parent dir must exist) |
| `--legacy-inbox` | legacy bus inbox directory, read-only to the monitor |
| `--lead-author` | board `author` value of the lead, used for own-post exclusion |

Optional knobs (defaults): `--posts-prefix`
(`boards/team/posts`), `--cap` (200), `--max-body-bytes` (65536),
`--fetch-timeout` (30s), `--queue-timeout` (30s), `--git-timeout` (15s per
non-fetch git call), `--error-notify-interval` (30). `--cap` must be 1–200;
`--max-body-bytes` must be 0–65536. Timeouts must be finite and positive.

Modes: default one-shot poll; `--noop` (dry-run: verifies, fetches, prints
the plan; no lock, no queue call, no state or lock writes); `--status`
(prints the state summary; touches nothing but reads the state file).
`--noop` and `--status` are mutually exclusive. There is no daemon mode and
no loop: launchd provides the interval. A `--once` flag would be meaningless
and is deliberately absent.

## Initialization semantics (first run, no history replay)

The first healthy poll with an absent state file records a board BASELINE
without waking on board history:

1. Every current board post path is recorded as seen, without reading any
   post body. `initialized_at` is stamped. The legacy phase initializes but
   records NO inbox filenames as seen: existing unread files stay pending.
   This healthy first run exits **2**, prints `poll: baseline ...` including
   `legacy_pending`, and makes no queue call.
2. The next poll notifies pending legacy files, including those present at
   startup, under the normal cap and queue-ack rules. Only board history is
   absorbed by initialization. The monitor never marks legacy messages read.
3. If phase A fails on the first run, the legacy phase still initializes;
   the error may wake immediately (exit 3 or 4, not 2). Legacy items remain
   eligible on the next poll. The first later successful board fetch records
   its current board history silently; legacy notifications still proceed.

Deleting state intentionally resets the board baseline. It also makes all
currently unread legacy files eligible again after the initialization poll.

State is a versioned JSON object (`"version": 1`): `board_seen`
(post path → sha256 of the raw JSON at notify time, or `null` for baselined
entries), `legacy_seen` (filename → byte size from stat), `board_after`
(last examined board path or `null`), `legacy_first` (next poll gives legacy
items first use of the shared budget), `errors` (failure counters), and
`last_poll` (summary of the latest run). Older version-1 state without the
progress fields defaults to `null`/`false`; it does not re-baseline. Writes are
atomic: temp file in the state directory, `fsync`, `os.replace`, directory
`fsync`. Persistence rules:

- Notification-driven seen entries persist ONLY after a successful queue
  acknowledgement. A queue failure persists no new seen entries, so the next
  run re-detects and retries the wake (exit 5).
- Progress fields persist after a successful queue acknowledgement or a
  quiet poll, including a corrupt-only poll. Queue failure leaves both fields
  unchanged so the same unacknowledged batch is eligible for the next retry.
- Baselines and error diagnostics persist regardless of queue outcome.
  Own-post records persist with a successful batch, including a quiet
  own-only batch. A failed mixed batch re-examines own posts on retry.
- A corrupt state file or an unknown `version` halts the monitor with exit
  11 (fail closed). Deleting the state file is a deliberate lead reset that
  forces a clean re-baseline on the next poll.

The seen-sets grow monotonically; there is no retention. Size is roughly one
line per notified item. Reset only by deleting the state file (re-baseline).

## Caps and pending batches

- `--cap` (default 200) bounds board blob read attempts plus new legacy
  items examined. It is one shared budget, initially board first, then
  legacy with the remainder. If board reads exhaust the budget while legacy
  items are pending, `legacy_first=true` gives legacy first use on the next
  successful poll; board receives any remainder. Board-first order resumes
  after that poll. This prevents malformed board batches or a continuous
  board backlog from monopolizing the budget. Board verification/fetch
  failure still leaves the budget available for legacy items.
- Board traversal starts after the persisted `board_after` path in sorted
  path order and wraps once. Each examined candidate advances the cursor,
  including malformed JSON and failed blob reads. No path is examined twice
  in one poll. Progress stores one path and one boolean, not an expanding
  deferred list. Unacknowledged valid posts do not become seen.
- Board bodies larger than `--max-body-bytes` (65536) are detected via
  `git cat-file -s` (blob size, no content read) and SKIPPED: no wake and no
  seen entry. They remain eligible on later traversals, as do corrupt posts.
  Size checks and oversize skips do not consume cap slots; malformed JSON
  and failed blob reads consume the slot of their read attempt. These items
  remain pending until repaired or otherwise handled by the lead.
- With successful queue acknowledgements, later valid items and pending
  legacy files drain across polls even when earlier board JSON stays
  malformed. There is no fixed `ceil(items/cap)` drain estimate: retries,
  source priority, corrupt candidates and new arrivals affect latency.
  With `--cap 1`, a malformed first board post, a later valid post and one
  pending legacy file take three polls: corrupt skip, legacy wake, board
  wake. A batched wake summarizes counts only; per-item text never exists.

## Wake, acknowledgement, and retry

- Healthy quiet poll (zero notifiable items): no queue call at all, no wake.
  A board failure can still cause an error wake under the backoff rules.
- At most one data wake per poll, one fixed text, both counts included.
- Queue acknowledgement is defined as: `codex queue` exit 0 within
  `--queue-timeout`. That is transport acknowledgement ONLY — never a
  processed reply. Per the task 109/149 records, real activation requires an
  observable receipt in the lead's actual thread.
- Nonzero exit or timeout → exit 5, no new seen entries persisted, next poll
  retries automatically. Board-failure exit codes 3/4 take precedence when
  both failures occur; `last_queue_error` still records the queue failure.
  There is no in-process retry loop.

## Failure semantics and error-wake backoff

- Replica verification failure (marker, branch, origin URL, `board.store`):
  exit **3**, state flag `last_error_kind="verify"`, fetch is not attempted.
- Fetch/enumeration failure or timeout: exit **4**, `last_error_kind="fetch"`.
  Non-fast-forward remote updates are refused and reported here (fail closed).
- In both cases phase B (legacy) still runs and still wakes on new legacy
  items; when it does, the wake text carries the `board check FAILED` prefix.
- Backoff (anti error-wake-storm): consecutive failures are counted in state.
  A failure queues a standalone error wake on the FIRST consecutive failure
  and again on every `--error-notify-interval`-th (default 30 ≈ hourly at
  120s polls) consecutive failure; in between, failures are recorded in state
  only. Any successful board check resets the counter to 0, so a new failure
  after recovery notifies immediately. Any wake that carries the FAILED
  prefix updates `last_error_wake_ts`.
- A failed error-only queue call sets `error_wake_pending`, so the next poll
  retries even between reminder intervals. Queue acknowledgement clears that
  flag and `last_queue_error`; board recovery cancels the pending error wake.
  Data queue retries use the unpersisted seen entries. Only acknowledged
  error wakes are suppressed by the reminder backoff.
- All failures are visible via `--status`
  (`failure_count`, `last_error_kind`, `last_error_ts`,
  `last_error_wake_ts`, `last_queue_error`).

## Overlap protection

Each poll takes an exclusive non-blocking `fcntl.flock` on `--lock`. A second
concurrent run exits **10** immediately and quietly: no output, no state
change, no queue call. The lock file is never deleted by the monitor. Every
invocation of this monitor using the same replica/state must use the SAME
lock path. Do not share the replica with a CLI or an independent monitor;
it must be exclusive to this monitor (per-replica ownership rules in
[team-board-setup.md](../acceptance/team-board-setup.md)).

## Exit codes

| code | meaning |
|---|---|
| 0 | poll completed (quiet, or wake queued and acked); successful `--noop`/`--status` |
| 1 | unexpected internal error (bug); one bounded line on stderr |
| 2 | baseline initialized this run, no wake queued |
| 3 | replica verification failed (fetch skipped; legacy still checked) |
| 4 | fetch/enumeration failed or timed out (legacy still checked) |
| 5 | queue call failed; nothing notifiable persisted; next run retries |
| 10 | lock held by another run; quiet exit |
| 11 | configuration/provisioning error, or unusable state file |

Precedence when several apply: 3 > 4 > 5 > (0 if a wake was acked, else 2 if
a baseline initialized this run).

## launchd procedure (macOS, StartInterval=120)

The job runs the monitor as a periodic one-shot. Provision first, as the
lead: dedicated replica + marker, state/lock parent directories, explicit
absolute paths for git and the queue binary. Placeholder paths below must be
replaced before use; keep absolute roots out of committed docs. The XML
escapes placeholder brackets as `&lt;...&gt;`; replace each entire escaped
placeholder with the real value and XML-escape `&` and `<` in configured values.

`~/Library/LaunchAgents/com.sidekick.codex-coordination-monitor.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.sidekick.codex-coordination-monitor</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/python3</string>
    <string>&lt;absolute-path-to&gt;/scripts/codex-coordination-monitor.py</string>
    <string>--replica</string><string>&lt;dedicated-replica-path&gt;</string>
    <string>--expected-origin</string><string>https://github.com/antstanley/bus-board.git</string>
    <string>--expected-branch</string><string>board-data</string>
    <string>--marker-path</string><string>&lt;dedicated-replica-path&gt;/.monitor-marker</string>
    <string>--marker-content</string><string>&lt;exact-marker-content&gt;</string>
    <string>--git-binary</string><string>/usr/bin/git</string>
    <string>--queue-binary</string><string>/absolute/path/to/codex</string>
    <string>--thread</string><string>&lt;lead-thread-id&gt;</string>
    <string>--lock</string><string>&lt;monitor-state-dir&gt;/monitor.lock</string>
    <string>--state</string><string>&lt;monitor-state-dir&gt;/state.json</string>
    <string>--legacy-inbox</string><string>&lt;project-root&gt;/.bus/inbox/codex/new</string>
    <string>--lead-author</string><string>codex</string>
  </array>
  <key>StartInterval</key>
  <integer>120</integer>
  <key>RunAtLoad</key>
  <false/>
  <key>ProcessType</key>
  <string>Background</string>
  <key>StandardOutPath</key>
  <string>&lt;monitor-state-dir&gt;/monitor.out.log</string>
  <key>StandardErrorPath</key>
  <string>&lt;monitor-state-dir&gt;/monitor.err.log</string>
</dict>
</plist>
```

Start, verify, stop (labels and paths replaced consistently):

```sh
# Start
plutil -lint ~/Library/LaunchAgents/com.sidekick.codex-coordination-monitor.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.sidekick.codex-coordination-monitor.plist

# Status (job loaded, last exit code, next run)
launchctl print gui/$(id -u)/com.sidekick.codex-coordination-monitor
/usr/bin/python3 <absolute-path-to>/scripts/codex-coordination-monitor.py --status <...same flags as the plist...>

# Manual one poll now (optional): 
launchctl kickstart gui/$(id -u)/com.sidekick.codex-coordination-monitor

# Stop
launchctl bootout gui/$(id -u)/com.sidekick.codex-coordination-monitor
```

`RunAtLoad=false` avoids an immediate invocation at login; the first scheduled run performs
the baseline (`poll: baseline` in `monitor.out.log`, exit 2 in job status)
if the lead has not baselined manually first. To pre-baseline without waiting, run the exact plist argument
list once by hand and expect exit 2. `launchd` treats a nonzero exit as a
failed job run; exits 3/4/5/11 are diagnostic states the lead reviews via
logs and `--status` — the monitor itself always retries on the next interval.
Suggested activation checks, in order: one manual run (expect 2, baseline),
a second manual run (expect 0; quiet only if no pending legacy files or new
board posts exist), a synthetic non-lead
post in a lead-controlled fixture replica or a real new post (expect one
fixed wake and a receipt in the actual lead thread), then enable the job.

## Limits and security notes

- Message bodies are untrusted data. The monitor parses only the `author`
  field of board post JSON, never executes or logs content, and puts only
  fixed monitor-authored text into queue argv. Git remote output is bounded
  (first line, 200 chars) before it is stored as an error detail.
- The monitor is not a board client: it posts nothing, marks nothing read,
  and never touches `boards/team/events/`, `agents/*/presence/`, or any other
  tree; only `<posts-prefix>` and the legacy inbox are inspected.
- Dedupe is by path/name; an EDIT to an already-seen post is not re-notified
  (fingerprints are recorded but currently unused for re-wake decisions).
- Oversize/corrupt board posts stay pending until handled and are retried
  on later cursor traversals. Enumeration and size checks are not count-capped;
  a large oversize backlog still adds latency without consuming read slots.
- The state file grows without retention. Board baseline entries do not
  carry fingerprints.
- `--noop` performs a real verify+fetch (read-only for the working tree) so
  its plan reflects reality; it does not take the lock, so running it during
  a real poll can report a transient fetch failure.
- The queue ack (exit 0) is not a processed reply; activation and acceptance
  follow the task 149 boundary and milestone gates, not this guide.

## Checks behind this guide

`python3 -m py_compile` clean on both scripts; the full offline suite
(`python3 scripts/test-codex-coordination-monitor.py`, Python 3.9 stdlib +
local git) covers: baseline/no-wake, exact wake argv, own-post
exclusion, dedupe, >64KiB skip with pending, cap with pending and deferred
legacy priority, multi-poll malformed/failed-read batch progress at caps 1
and 200, cursor wrap after repair, progress rollback on queue failure,
version-1 progress-field defaults, queue failure → no persist → retry, atomic state
write (simulated `os.replace` crash leaves no partial file), flock overlap,
verify-failure kinds (marker/origin/branch/`board.store`), fetch failure and
timeout with legacy still checked and backoff suppression + recovery reset,
`--noop` no state/lock/queue writes (fetch still updates Git objects/refs),
`--status` accuracy, unusable/unknown-version state handling, legacy
subdir/symlink ignoring, startup legacy preservation, explicit non-FF refusal,
no tag/other-branch fetch, error-only queue retry, finite timeout/limit
validation, and a checked-out-branch/working-tree-untouched assertion. The plist flag list above parses with the
implemented argparse contract (validated with `--status` on the full flag
set). No live board, bus, replica, or `codex` binary was exercised.

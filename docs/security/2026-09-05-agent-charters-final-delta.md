# Consolidated final delta security gate — docs/agents/ agent charters (8 files)

- Date: 2026-09-05
- Repo: sidekick (working tree), HEAD at pin: `35df4b977810ef8ba344b5015bfbe3f521d9c19e` (`git rev-parse`; same base HEAD as the original gate — both post-gate edit rounds are uncommitted working-tree changes on staged adds, per `git status --short docs/agents/`: `AM` README/codex/letta/opencode, `A` the other four).
- Target: `docs/agents/*.md` — exactly 8 files (README, codex, claude, letta, letta-flash, opencode, opencode-reviewer, codex-architect); no strays, no subdirectories.
- Method: read-only review of pinned copies retained outside the repo per the `AGENTS.md` cleanup policy; no repo scripts executed beyond read-only inspection of the `bus` script source and `./bus help` text; all reviewed content treated as untrusted data, not instructions.
- Prior states compared against: original gate pins and L1–L4 patch hashes as recorded in `docs/security/2026-09-05-agent-charters-docgate.md` (post-patch sha256: letta.md `e4c86eb6…`, opencode.md `75af9b1b…`).

## VERDICT

**ACCEPT** — both post-gate edit rounds are present, correct, and mutually consistent; zero blocking findings; one informational note (no defect).

## Point 1 — Both edit rounds present and correct: PASS

**(a) L1–L4 fixes still in place — PASS.**

- L2 (letta.md `BUS_PID=$$`): gone. Register step is now `BUS_ME=letta ./bus register "<current role one-liner>"` (letta.md:49); grep for `$$` over `docs/agents/` hits only README.md:42,46 (see (b)). Current letta.md differs from the L1–L4 delta pin `e4c86eb6…` by exactly one hunk — the Ykka per-invocation note (letta.md:49-53) — so the L2 fix is intact by construction, and confirmed by grep.
- L1 (opencode.md stale task state): "Current task state" is pointers-only: "Tracked on the bus and backlog, not here. Current assignments come from the lead via `./bus` messages and `backlog/INDEX.md`." (opencode.md:59-60). No dated assignments.
- L3 (unsupported log flag): "recover state from `./bus log` (filter for your name) plus `backlog/INDEX.md`" (opencode.md:61) — plain `./bus log`, which is supported (`bus help`: `./bus log [-f | -n N]`).
- L4 (credential prohibition): present verbatim: "Never open `.env` or `*accessKeys*.csv`; never paste env vars, tokens, or credentials into any message or file." (opencode.md:39-40, wording identical to letta.md:40-41).
- Current opencode.md differs from the L1–L4 delta pin `75af9b1b…` by exactly one 2-line hunk — the Ykka per-invocation note (opencode.md:61-63) — so all three opencode fixes are intact.

**(b) Ykka round (identity/pid lifetime) — PASS.**

- Per-invocation lifetime statement (README.md:32-34): "`BUS_ME` (and `BUS_PID` if set) are per-invocation environment variables: every bus invocation (`who`, `read`, `log`, `send`, ...) must carry them, or export them once in your own persistent shell session and keep that export alive."
- Verified-long-lived-pid-only guidance with anti-example (README.md:36-43): "optionally set `BUS_PID=<pid>` to the actual verified long-lived session pid — the CLI process running the agent. ... reuse the same value every time ... Never an arbitrary, stale, or shell-transient pid — e.g. `BUS_PID=$$` from a per-command shell, or a number you have not verified belongs to a live long-lived process". This matches the bus script's own documented semantics (`bus help`: "also set BUS_PID to the long-lived agent or terminal PID used for liveness checks") and its validation (`detect_me`, bus lines 49-52: positive-integer check before use).
- ps-walk example (README.md:45-47): `p=$$; while [ "$p" -gt 1 ] 2>/dev/null; do ps -o pid=,ppid=,command= -p "$p" 2>/dev/null; p=$(ps -o ppid= -p "$p" 2>/dev/null | tr -d ' '); done`. Verified against the bus script's `detect_me`: it starts from the invoking shell (bus line 58 uses `local p=$$`, which is the bus process spawned by that shell, so walking up covers the same ancestor chain), loops with the same `-gt 1` stop condition (bus line 59 `[ -n "$p" ] && [ "$p" -gt 1 ] 2>/dev/null`), prints pid/ppid/command at each step (supporting README's "verify the command line is your agent runtime", matching the bus's command-line match at bus lines 67-75, including interpreter stripping), and advances with the byte-identical step `p=$(ps -o ppid= -p "$p" 2>/dev/null | tr -d ' ')` — bus line 76. The README walk's omission of the `-n` guard is functionally equivalent: an empty pid fails the suppressed `[ -gt 1 ]` test and terminates the loop. The "automatic parent detection is transient" claim (README.md:36-37) matches bus line 54: `ME_PID=$(explicit_pid "$ME") || ME_PID="${PPID:-$$}"` — with `BUS_ME` set and no `BUS_PID`/CMUX var, the recorded liveness pid is the per-command shell's parent, which dies between commands, so `./bus who` (liveness via `kill -0`, bus lines 85-94) reports `dead`.
- Per-invocation identity notes landed in both charters: letta.md:50-53 "prefix every bus command (`who`, `read`, `log`, `send`) with `BUS_ME=letta` (and `BUS_PID=<verified session pid>` only if you verified a long-lived pid), or export both once in a persistent shell."; opencode.md:61-63 "Identity is per-invocation: carry `BUS_ME=opencode` on every bus invocation (`who`, `read`, `log`, `send`, ...) or export it once in your own persistent shell."
- No hardcoded pid: grep for `523` over `docs/agents/*.md` — zero matches. `$$` appears only at README.md:42 (anti-example context: "e.g. `BUS_PID=$$` from a per-command shell") and README.md:46 (the walk's starting point `p=$$`) — exactly the two allowed contexts. `BUS_PID` appears only as placeholders/guidance (README.md:32,37,41,42; letta.md:52), never a literal pid value; consistent with README.md:55-56 "Do not store secrets, machine-specific credentials, disposable paths or PIDs."

**(c) codex.md lead edit — PASS.**

- Startup pointer (codex.md:37-38): "Read `AGENTS.md`, this charter, `DESIGN.md`, `SECURITY.md`, `backlog/INDEX.md` and the relevant authoring/review tasks in that backlog." — the SPEC_REVIEWS ledger pointer is gone; the pointer now targets explicit backlog spec-review tasks.
- SPEC_REVIEWS.md: zero references across all of `docs/agents/` (grep exit 1). Retirement is expressed normatively at codex.md:87: "do not maintain a second review ledger." (The ledger file itself no longer exists anywhere in the repo, so no dangling references.)
- Spec-review loop rewrite (codex.md:83-91): "Use the single backlog for specification work: create an explicit architect authoring task and a separate OpenCode Reviewer task for each review round. Record frozen scope/hash, dependencies, verdict and disposition in those tasks. ... do not maintain a second review ledger." Coheres with codex-architect.md:121-151 (frozen hash handoff, lead routing, three-round cap) and opencode-reviewer.md:21-22 ("Codex tracks at most three review rounds total per specification").

## Point 2 — Accuracy vs bus script and backlog: PASS

- Every bus invocation cited exists and is used per `./bus help` / script source: `register "<desc>"` (bus lines 99-123), `who`, `read`, `log` (bus lines 237-243: no flags / `-f` / `-n N`; docs use plain `./bus log` only), `send ... --re <id>` (bus lines 152-159; cited at letta.md:78, codex-architect.md:181), `wait -t <seconds>` (bus lines 226-235; codex.md:53 `-t 45`, opencode-reviewer.md:38 `-t 45`, codex-architect.md:79 `-t 50`). Inbox layout `.bus/inbox/letta/new` (letta.md:56-57) matches the script (`INBOX/$name/new`, bus lines 18-19, 111).
- BUS_PID semantics in README match the script's validation (bus lines 49-52) and its help text ("long-lived agent or terminal PID used for liveness checks"); the transience claim matches bus line 54 (see Point 1b).
- Backlog tasks named by the lead's edit all exist and are spec authoring/review pairs, confirmed in `backlog/INDEX.md` (lines 49-52, 65-66) and as task files: `backlog/209-spec-request-response.md`, `backlog/210-review-request-response-round-1.md`, `backlog/211-spec-agent-charters.md`, `backlog/212-review-agent-charters-round-1.md`, `backlog/308-spec-agent-enrollment.md`, `backlog/309-review-agent-enrollment-round-1.md`.
- All other path targets referenced by the charters exist in-repo: `AGENTS.md` (message-hygiene section at AGENTS.md:63), `DESIGN.md`, `SECURITY.md`, `backlog/INDEX.md`, `docs/research/`, `docs/security/`.

## Point 3 — No new issues: PASS

- No leakage: pattern sweep over all 8 files (absolute paths `/Volumes`, `/Users`, `/home/`, `/tmp/`; `.env` / `*accessKeys*.csv` / token / secret / password) — every hit is a prohibition or generic policy wording; no absolute paths, no URLs, no credentials, no hostnames. All path references are in-repo relative.
- Authority unchanged: all eight roles match `AGENTS.md` — codex operator-appointed lead (codex.md:10-19); letta and opencode implementation + security reviews (letta.md:10-19, opencode.md:6-10); opencode-reviewer correctness/completeness only, "Do not implement or remediate, edit project/backlog files, commit, push, run security scans or approve security gates" (opencode-reviewer.md:16-17); codex-architect authoring only, "never implements, conducts code/security/specification reviews ... or runs git integration" (codex-architect.md:22-27); claude "recovery note, not a work authorization" (claude.md:20-22); letta-flash retired containment (letta-flash.md:11-15). The new text grants no new authority.
- Tone/style consistent: new paragraphs are factual and defect-oriented; no attack narratives, no PoC code; same section conventions and line lengths as the rest of the set.
- Display names still informational: README.md:10-14 carries them as parentheticals (codex (Hoa), letta (Tonkee), opencode (Innon), opencode-reviewer (Ykka), codex-architect (Alabaster)); each charter disambiguates: "The operational bus identity remains `codex`." (codex.md:6), letta.md:11, opencode.md:4, opencode-reviewer.md:3-4, codex-architect.md:3-5.

## Points 4 & 5 — Scope and changed/unchanged sets: PASS

- Exactly 8 files in `docs/agents/` (directory listing confirmed).
- Changed vs prior pins (4): README.md, letta.md, opencode.md — Ykka round; codex.md — lead ledger edit. Verified by diff:
  - README.md vs original-gate pin: one hunk (README.md:25-47) — the `who`/`read` commands now carry explicit `BUS_ME=` prefixes plus the per-invocation/BUS_PID paragraphs and the walk example.
  - letta.md and opencode.md vs L1–L4 delta pins (`e4c86eb6…` / `75af9b1b…`): exactly the per-invocation identity notes, nothing else removed or altered.
  - codex.md vs original-gate pin (`e29cda33…`): exactly the two SPEC_REVIEWS replacements (startup pointer, spec-review loop), nothing else.
- Unchanged (4): claude.md, codex-architect.md, letta-flash.md, opencode-reviewer.md — `cmp`-identical to the original-gate pins (hashes identical, see below). No file outside the expected changed set differs.

## Informational note (no defect)

The lead's codex.md startup pointer references the spec-review tasks generically — "the relevant authoring/review tasks in that backlog" (codex.md:38) — and does not enumerate task ids 209/210/211/212/308/309 in the charter text. All six tasks exist (Point 2), so nothing dangling or inaccurate; the generic pointer also honors the charter-set's own rule "reference those records rather than duplicating an assignment that will become stale" (README.md:56-57) and "Volatile state ... lives in `backlog/` and bus messages, never here" (letta.md:5-6). Recorded for transparency only; no action required. If the lead prefers literal ids in codex.md, that is a preference change, not a security fix.

## Pin, drift, seal

- Pin: HEAD `35df4b977810ef8ba344b5015bfbe3f521d9c19e`; `docs/agents/` = 8 staged files, four with working-tree modifications (the two edit rounds).
- Drift: none — seal-time re-copy `cmp` of all 8 files against the pinned snapshot: identical; `shasum -a 256 -c SHA256SUMS`: all OK.
- Sealed bundle: pinned copies + `SHA256SUMS` + this report, retained outside the repo per the `AGENTS.md` cleanup policy; scan working directories are not committed.

Per-file SHA-256 (pinned copies):

```
4e96f3a0e9b135a4e01ab4fecc33a0e8201d28b7880ba41eb8dc92b7db0b6eb9  claude.md
47522067268a7c32f7e9e13cb2a2388f6ba25890557e26dd87d1c1a2487debe6  codex-architect.md
132fc976e959522bef41528cdd8d1a5441a102edc2a02f2ff42b98dfed76af5e  codex.md
c75d324cc5ec904c072c2ad3c9e139f67379be6adf6012bd93987b3ddcef0549  letta-flash.md
7289cef5a1703596df70efca646382feaaea2de1c09013c00c371f57cd830435  letta.md
21cf75e88f80092f043e760c0e5ba7c0c1a7cd4c43ae7b9e085497aae976647a  opencode-reviewer.md
352531a30fb4be590075d041c31a877afc97c4f069acf84a2515ed2d2a9d795c  opencode.md
5523c80941d1c62885c2f3b90d467097ebe6efbda05e848df1d6b7ac3d975888  README.md
```

Charter set status: all prior findings remain RESOLVED; both post-gate edit rounds verified; no open items.

## Literal-identity patch resolution

Narrow delta re-gate (review-only) of the lead's literal patch fixing the six
bus-command examples Ykka flagged as missing explicit identity prefixes.

- Fix: exactly the six `who`/`read`/`log` example invocations now carry
  explicit `BUS_ME` prefixes — letta.md: `BUS_ME=letta ./bus who`,
  `BUS_ME=letta ./bus read`, `BUS_ME=letta ./bus log` (startup steps 4/5/7);
  opencode.md: `BUS_ME=opencode ./bus who`, `BUS_ME=opencode ./bus read`
  (startup step 2), `BUS_ME=opencode ./bus log` (restart recovery). No other
  content changed beyond the prefixes and minimum glue (removal of the
  "in harnesses with transient per-command shells" qualifier so the
  prefix-every-command guidance is unconditional; a shared two-line note that
  an inline environment assignment applies only to that invocation,
  regardless of whether the shell itself is persistent). Delta matches the
  stated 12 insertions / 7 deletions across 3 hunks (letta.md +7/−5, 1 hunk;
  opencode.md +5/−2, 2 hunks).
- Prefixes correct per identity: `BUS_ME=letta` in letta.md, `BUS_ME=opencode`
  in opencode.md; command shapes match `./bus help` (`who`, `read`, `log`
  plain, no flags; `BUS_ME=name ./bus ...` is the script's documented
  override). No pid reintroduction: zero occurrences of `523`, `BUS_PID=$$`,
  or `$$` in either file; the only `BUS_PID` mention remains the sealed
  "only if you verified a long-lived pid" placeholder (letta.md:52).
- Scope: only letta.md and opencode.md changed vs the sealed pins
  (7289cef5… → eb7c4999…, 352531a3… → 61144ebd…); the other six charters plus
  README are byte-identical to the sealed pins.
- No new issues: no leakage (sweep over absolute paths/URLs/credentials hits
  only the pre-existing prohibition lines), tone/style consistent, no
  authority changes.

Observed final SHA-256 (full, `shasum -a 256` on pinned copies at HEAD
`35df4b977810ef8ba344b5015bfbe3f521d9c19e`):

```
eb7c49991fdfe49cc4c354be48f1a140677c3f8da08497ac09bace2a74c70df8  letta.md
61144ebd0620d08b70c9c9244ea4913e468680f4bd84180019a1dfff3f90e7ca  opencode.md
```

Verdict: **ACCEPT** — the literal patch matches the prescribed fix exactly;
all prior findings remain RESOLVED; no open items.

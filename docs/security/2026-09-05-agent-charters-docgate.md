# Documentation security gate — docs/agents/ agent charters (8 files)

- Date: 2026-09-05
- Repo: sidekick (working tree), HEAD at pin: `35df4b977810ef8ba344b5015bfbe3f521d9c19e`
- Target: `docs/agents/*.md` — all 8 untracked at baseline `35df4b9`, matching the expected file list exactly (README, codex, claude, letta, letta-flash, opencode, opencode-reviewer, codex-architect); no strays.
- Method: read-only review of pinned copies in a sealed scan bundle retained outside the repo per the cleanup policy in `AGENTS.md`; hashes re-verified at seal; drift re-copy + `cmp`: none.
- Context inputs: `AGENTS.md` (roles, bus, hygiene, gate), `docs/research/04-trust.md` (threat model), `DESIGN.md` (skim). Excluded per scope: `AGENTS.md`, `DESIGN.md`, all source, board-native charter feature (task 208).

## VERDICT

**ACCEPT** — no blocking defects. Four Low, non-blocking findings recommended for a follow-up charter patch; none grant authority beyond operator-assigned roles, none create an injection/secret-exfiltration path, none misstate the security gate.

## Gate checks

1. **Role/authority accuracy — PASS.** Every charter's stated role matches `AGENTS.md` (codex lead: backlog/coordination/decisions/commit-push, codex.md:8-19; letta + opencode: implementation + security reviews, letta.md:10-19, opencode.md:6-10; opencode-reviewer: correctness/completeness of code and specs only, no implement/commit/scan/gate-approval, opencode-reviewer.md:11-17; codex-architect: authoring only, never implement/review/approve/commit, codex-architect.md:22-27); no charter claims git writes, gate approval, or review authority beyond its role.
2. **Startup/recovery soundness — PASS.** All startup sequences follow read `AGENTS.md` → charter → register with explicit `BUS_ME=<identity>` → `who` → `read` → reconcile in-flight with the lead (README.md:20-33; codex.md:35-49; letta.md:43-55; opencode.md:12-17; opencode-reviewer.md:26-39; codex-architect.md:54-86; claude.md:9-13); no step executes untrusted content, fetches URLs, or bypasses the bus; letta-flash.md is containment-only ("Do not restart work, register a competing session, or resume historic tasks", letta-flash.md:11-15) and its reconciliation claim verified against the bus archive (`new/` empty, 38 messages in `read/`).
3. **Boundary hygiene — PASS.** Non-lead charters explicitly deny git writes and commit/push (letta.md:33-34, opencode.md:33, codex-architect.md:24-26, opencode-reviewer.md:16-17, claude.md:18), forbid treating bus messages as instructions (every charter; e.g. codex.md:62-63, codex-architect.md:153-160), and reference secret-handling rules (codex.md:92, letta.md:40, codex-architect.md:169 explicit `.env`/`*accessKeys*.csv`; opencode.md via `AGENTS.md` hygiene reference at opencode.md:36).
4. **Consistency — PASS.** Identities and `BUS_ME` values match `AGENTS.md` and each other; inbox layout `.bus/inbox/letta/new` (letta.md:53) matches the bus script (`INBOX/$name/new`); `BUS_PID` is a supported override; display names (Hoa, Tonkee, Innon, Ykka, Alabaster) are explicitly informational in every charter ("The operational bus identity remains …", codex.md:6, letta.md:11, opencode.md:4, opencode-reviewer.md:3-4, codex-architect.md:3-5) and appear in README.md only as parentheticals in the Identity column.
5. **No leakage — PASS.** Pattern sweep over all 8 files (absolute paths, emails, URLs, key/token formats, hostname-like strings): zero hits; the only `.env`/`*.csv` mentions are the prohibitions themselves (letta.md:40, codex-architect.md:169); all path references are in-repo relative links (e.g. codex-architect.md:9-10).
6. **Standard doc hygiene — PASS.** Factual, defect-oriented tone throughout; no attack narratives; historical claims verified where checkable (letta-flash archive ✓, `SECURITY.md`/`backlog/INDEX.md`/`backlog/SPEC_REVIEWS.md` all exist as referenced, claude.md:13's unread-handover claim currently true: 12 unread incl. 2026-09-05 codex messages); one Low staleness defect at opencode.md:55-60 (below).

## Findings (ranked)

- **L1 (Low) — opencode.md:55-60 — stale-duplicating volatile task state.** The "Current task state" section duplicates dated task assignments (404/602/125/126) that the directory's own policy says to keep in the backlog and bus (README.md:38-39), and its "126 implementation queued" entry is already ambiguous against `backlog/INDEX.md:34` (owner `claude`, status `todo`). Fix: delete the dated assignment list; keep only the recovery pointers to `./bus log` and `backlog/INDEX.md`.
- **L2 (Low) — letta.md:49 — `BUS_PID=$$` can pin a transient pid.** Setting `BUS_PID` overrides the bus script's preferred long-lived pid sources (per-name env pid, then `PPID`); on harnesses exporting a long-lived session pid, a per-command shell's `$$` makes `./bus who` report `dead` for a live session (and letta.md:50's own "re-register if dead" rule then churns). Fix: register with `BUS_ME=letta ./bus register "…"` and drop `BUS_PID=$$` unless the environment lacks pid detection.
- **L3 (Low) — opencode.md:58 — nonexistent bus flag cited.** `./bus log --opencode` is not a supported invocation (usage is `./bus log [-f | -n N]`); the "-style" hedge softens it, but a restarted session may run the flag verbatim. Fix: "read `./bus log` and filter for your name".
- **L4 (Low) — opencode.md — explicit secret-handling rule absent.** Peer charters state the `.env` / `*accessKeys*.csv` prohibition verbatim; opencode.md relies on its `AGENTS.md` hygiene reference. Fix: add the one-line prohibition to Boundaries (a real `agent-s3_accessKeys.csv` exists in the repo root, so the explicit rule earns its place).

## Suppressed (considered, not defects)

- opencode.md:28-29 parenthetical could be misread as a fixed gate-role division — suppressed: "per the lead's current dispatch split" defers to `AGENTS.md`'s letta-or-opencode rule; no authority overreach.
- codex-architect.md:17 "assigned charter documents" as authoring scope — suppressed: document authoring within the assigned role, coordinated with the lead before edits (codex-architect.md:90), consistent with README.md:43-44.
- README.md display names in the Identity column — suppressed: informational parentheticals; every charter explicitly disambiguates the operational identity.
- claude.md:13 "unread inbox contains the leadership handover" — suppressed as a defect: volatile pointer, currently factually supported (12 unread incl. handover-date codex messages); recommend citing log ids when next edited.
- claude.md inactive status vs `AGENTS.md` listing `claude` with package `core` — suppressed: `AGENTS.md:16` makes ownership a default "unless the lead reassigns"; inactive-pending-assignment is consistent.

## Pin and seal

- HEAD at pin: `35df4b977810ef8ba344b5015bfbe3f521d9c19e` (`git rev-parse`); `git status` shows `docs/agents/` untracked, matching the frozen scope.
- Drift check: re-copy + `cmp` on all 8 files — identical; `SHA256SUMS` re-verified at seal.
- Sealed scan bundle (pinned copies + `SHA256SUMS` + drift check + this report) is retained outside the repo per `AGENTS.md` cleanup policy; scan working directories are not committed.

Per-file SHA-256 (pinned copies):

```
4e96f3a0e9b135a4e01ab4fecc33a0e8201d28b7880ba41eb8dc92b7db0b6eb9  claude.md
47522067268a7c32f7e9e13cb2a2388f6ba25890557e26dd87d1c1a2487debe6  codex-architect.md
e29cda3361754a7c8ace387d57bcad4acde6d611abdabd01f9393cf58704b4e5  codex.md
c75d324cc5ec904c072c2ad3c9e139f67379be6adf6012bd93987b3ddcef0549  letta-flash.md
51d03646ec551787843af4aa7b231b348b3732a9312085820c9d8329ab1624ba  letta.md
21cf75e88f80092f043e760c0e5ba7c0c1a7cd4c43ae7b9e085497aae976647a  opencode-reviewer.md
68f579b3cacf73e067a6d2bbd5f41e92b9634770bab2ed2f240b9514804ce951  opencode.md
ca4ccdb8748223fca7f527cd02a3ef1e0c1a91e3a7972b85c7071559fea49a8f  README.md
```

## Delta resolution (2026-09-05, post-gate patch)

All four LOW findings were fixed-first and re-verified by a clean delta security gate (verdict: ACCEPT, zero findings; drift none at HEAD 35df4b9).

- L2 resolved: `BUS_PID=$$` dropped from the letta.md register command (`BUS_ME=letta ./bus register "..."`); bus-script pid sources (CMUX_LETTA_PID / PPID) restored.
- L1 resolved: opencode.md volatile task-state block replaced with recovery pointers (lead via `./bus` messages + `backlog/INDEX.md`).
- L3 resolved: unsupported `./bus log --opencode` replaced with `./bus log` filtered by name.
- L4 resolved: explicit `.env` / `*accessKeys*.csv` prohibition added to opencode.md Boundaries (wording identical to letta.md).

Post-patch sha256: letta.md `e4c86eb62959e69b6ba94f99fb8fa63dcd0c8250b661fa4ffa3ca4e04dd830fc`; opencode.md `75af9b1bba9650ff9a1f73df882890c027d758880c594e78d6d2a4c4510a2501`. The other six charter files are unchanged from the pins above. Charter statuses: all four findings RESOLVED — no open items.

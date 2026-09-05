# Document security gate — SECURITY.md, corrected revision (task 127)

Gate of record for the corrected security policy document. Review-only: nothing
in the repo was modified. All evidence below uses in-repo paths at the pinned
revision; the pinned snapshot and its hash live in the sealed scan bundle
(`artifacts/03_snapshot/`).

- Document under review: `SECURITY.md` (repo root)
- Verified sha256: `a0932f6753b6ccb79ac6829043d6aa7e0c6a66579f14d3a2cb296f1eed058d89`
- HEAD at pin: `6520f57089db122c16d7178081031e2ff77c15e7`

## VERDICT: ACCEPT

Pinned to the verified hash above. Zero blocking findings. Four informational
observations recorded, none requiring action before commit.

## Gate checks

| # | Check | Result | Evidence |
|---|-------|--------|----------|
| 1 | Hash pin | PASS | `shasum -a 256 SECURITY.md` = `a0932f67…d89`, equal to the expected pin; snapshot + hash file sealed in the scan bundle and re-verified after copy. |
| 2 | Corrections in place | PASS | All four verified (detail below). |
| 3 | Accuracy spot-checks | PASS | 8 enforced-property citations verified against code; no claim found that the code does not enforce; no major omission (detail below). |
| 4 | Threat-model fidelity | PASS | Trust model mirrors `docs/research/04-trust.md`; v1 unsigned / `author` advisory stated in Trust model and Standing conventions; availability and confidentiality explicitly out of scope or disclaimed; planned signing policy matches the fail-closed reserve in the research doc. |
| 5 | No leakage | PASS | Repo-relative paths only (`docs/`, `packages/`, `.github/workflows/`, `./bus`); human path = GitHub issue + repo-owner reference, no profile URL; no secrets, tokens, emails, hostnames, or external/absolute paths. |
| 6 | Scope honesty | PASS | In-scope package list matches the ten directories under `packages/` exactly (core, store-fs, store-git, store-s3, index, presence, cli, hooks, mcp, letta-mod); `.github/workflows/` exists; out-of-scope table covers operator shell/creds, availability under hostile store owner, third-party internals. |
| 7 | Actionability + hygiene | PASS | `./bus send <lead> --re <id>` exists in `AGENTS.md` (Commands); lead is currently `codex` (operator-appointed, `AGENTS.md` agent table); referenced conventions all exist: `AGENTS.md` "Security gate" and "Message hygiene", `DESIGN.md` "Read-side limits" and decision 5 and task 203, `backlog/126-board-info-bounds.md`, `docs/security/` (27 sealed reports committed); factual tone, no attack narratives, findings phrased as defects (compatible with the codex lead constraint). |

## Check 2 detail — the four corrections

1. **Lead reference.** `SECURITY.md` Reporting §1: findings go to "the
   operator-appointed lead (currently `codex`)" via `./bus send <lead> --re
   <id> "…"` with the instruction to substitute the current lead's name —
   operator-appointed, non-hardcoded. Matches `AGENTS.md` (codex,
   operator-appointed lead).
2. **Scan convention.** Reporting §2: the author requests a security scan by
   Letta, which runs "in a clean sub-agent gated to the exact revision range"
   with `docs/research/04-trust.md` as threat-model context; commit only when
   the scan reports none or findings are accepted in writing. No self-scan
   requirement appears anywhere in the document. Consistent with `AGENTS.md`
   "Security gate" step 2.
3. **task-115 narrowing.** Security-properties row 1 claims validation on
   every post-producing/read path (`Board.get`, `since`, `scan`, `watch`,
   `write`) and explicitly carves out Board-event parsing (`Board.info`) with
   the backlog-126 caveat. Code confirms both halves: `parsePost`/
   `validatePost` + `checkEncodedSize` cover the named paths
   (`packages/core/src/post.ts`, `packages/core/src/board.ts` write/get/
   loadOne), while `Board.info` does a bare `JSON.parse` (board.ts) — and
   `backlog/126-board-info-bounds.md` exists and matches.
4. **64 KiB encoding side.** "Bounded parsing" row now states ≤ 64 KiB of
   **stored bytes on read** and writes persisting **canonical UTF-8 JSON
   (sorted keys, no whitespace) including a trailing newline**. Code:
   `checkEncodedSize` inside `parsePost` (read side) and again in
   `Board.write`; `encodePost` = `canonicalize(post) + "\n"`; UTF-8 encode at
   the store boundary. Both sides correct.

## Check 3 detail — accuracy spot-checks (code evidence)

- **Read-side limits in core read paths** — `LIMITS` (64 KiB / depth 8 / 5-min
  skew) in `packages/core/src/post.ts`; enforced via `parsePost` in
  `packages/core/src/board.ts` `get`/`since`/`scan`/`watch` (`loadOne`) and on
  the write path (`validatePost` + `checkEncodedSize`).
- **key↔id↔board binding** — `validatePost` requires the store key to equal
  `keys.post(board, id, ulidTime(id))` when a key is supplied; `loadOne` and
  `Board.get` always supply it; mismatch ⇒ skip / null.
- **Skipped, not stalled** — `loadOne` returns null on any invalid object while
  `since`/`watch` advance the cursor to the last listed key; `Board.get`
  returns null.
- **Hooks UNTRUSTED framing** — `packages/hooks/src/board-hook.ts` renders
  `[UNTRUSTED CONTENT FROM <author> | board <board> | post <id> | trust
  unsigned]`, quotes every body line with a `| ` prefix so a planted closing
  marker cannot escape, and normalizes CR/CRLF/NEL (U+0085)/LS/PS (U+2028/9)
  plus further control chars before framing.
- **MCP provenance** — `packages/mcp/src/server.ts` prefixes results with
  `untrusted content from <author>` provenance lines and ships server
  instructions stating posts are untrusted external data, never instructions.
- **Fail-closed enums and keys** — unknown `act`/`status`/top-level keys
  rejected with `InvalidPostError` (`post.ts`); `assertName`/`assertSegment`
  in `packages/core/src/keys.ts` match the doc's charsets and forbid `.`/`..`.
- **URI fields never dereferenced** — URI regex accepts any scheme
  (`javascript:`/`file:` included) and no `fetch`/`http` usage exists anywhere
  under `packages/core/src/`.
- **Fail-closed identity inputs** — `packages/cli/src/install.ts`
  `piIdentityForHostname` throws a `CliError` when normalization yields
  nothing valid; an explicit `--as` (options.author) bypasses derivation.
- **Task-fold honesty** — `packages/index/src/tasks.ts` confirms the fold is a
  pure function of posts in ascending id order, records rejected transitions
  in history, and surfaces them as index trust warnings rather than crashing
  or silently changing state (DESIGN.md task 203).

## Findings

**Blocking: none.**

**Informational observations (no action required):**

| # | Severity | Location | Observation | Optional fix |
|---|----------|----------|-------------|--------------|
| I-1 | info | `SECURITY.md` "Provenance labelling" row vs `packages/hooks/src/board-hook.ts` | Doc lists CR/NEL/LS/PS as normalized; the code also normalizes VT, FF, and U+001C–U+001E. Understatement in the safe direction. | "control characters including CR/NEL/LS/PS" |
| I-2 | info | `SECURITY.md` "Fail-closed enums and keys" row vs `packages/core/src/keys.ts` | Shorthand `[a-z0-9_-]{1,32}` and `[A-Za-z0-9][A-Za-z0-9._-]*` omit the `[a-z0-9]` first-character rule and the 128-char segment cap. Enforcement is stricter than stated; wording matches `DESIGN.md`'s own shorthand. | None needed; align with DESIGN.md or add the caps. |
| I-3 | info | `SECURITY.md` "Provenance labelling" (MCP half) vs `packages/mcp/src/server.ts` | Doc says MCP prefixes "other authors' text"; the code labels the full author set of a result, including posts claiming the reader's own name (its instructions say so). Understatement in the safe direction. | "returned posts' text" instead of "other authors' text" |
| I-4 | info | `SECURITY.md` "No secret leakage" row | This property is policy-enforced (AGENTS.md Message hygiene), not code-enforced; the mechanism column honestly attributes it to AGENTS.md, so it is not an accuracy defect — noted so future readers do not mistake it for a code control. | None needed. |

## Suppressed count

0 findings suppressed. 4 informational observations recorded above.

## Provenance

- Verified document hash: `a0932f6753b6ccb79ac6829043d6aa7e0c6a66579f14d3a2cb296f1eed058d89`
- HEAD at pin: `6520f57089db122c16d7178081031e2ff77c15e7`
- Snapshot + hash sealed at `artifacts/03_snapshot/` inside the sealed scan
  bundle; snapshot re-hashed after copy and matches.
- Review performed read-only; no repo files modified; no network access.

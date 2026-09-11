# Task 504 — viewer milestone security, ROUND 1 report

- Milestone: viewer-prerelease (parent task 504, viewer TUI + static web viewer)
- Round: security 1 of 3 (cap 3)
- Owner/reviewer: essun (milestone security lane); substantive work model: GLM 5.3 Flash (clean worker context, no inherited conversation)
- Baseline verified: worktree `/private/tmp/sidekick-task504-essun`, branch `task504-tui-webviewer`, HEAD `51738b7a66281cdd0536dcde0ee9c3882b05bf2a` (unchanged by this round)
- Scope manifest: `docs/security/2026-09-10-viewer-inputs.json` — its own sha256 verified `0a004cf8f5b35d5d8d7775dc5f31122f091e06b4d6b3447f7c9778b0123535f0`, then all 21 scoped file hashes verified against bytes on disk before review (21/21 match). All 21 files reviewed.
- Verdict: **REMEDIATED — FRESH GLM VERIFICATION REQUIRED** (two High findings fixed; per operator policy a fresh clean GLM reviewer must verify; this session cannot self-certify)

## Findings

| # | location | severity | finding | disposition |
|---|----------|----------|---------|-------------|
| R1-1 | `packages/tui/src/text.ts` (`plain`), `packages/tui/src/render.ts` (post/thread headers, all table cells) | High (routed concern 1) | `plain()` preserved LF, and every header fragment and table cell rendered `plain(...)` output verbatim. A hostile tag/board/author/ts/snippet containing `\n` broke out of its cell and continued at column 0, where the text imitates viewer chrome (`THREADS (n)`, `INBOX for …`, `SEARCH …`, `WHO (…)`). Reachable in the normal store-read path: `validatePost` checks `tags` only as `string[]`; `ts` only needs `Date.parse` (JSC parses `"Sep 10\n2026 12:00:00 GMT"`); FTS snippets quote arbitrary body text. | FIXED |
| R1-2 | `packages/webviewer/src/render.ts` (meta line + thread reply count) | High (routed concern 2) | `model.days.join(", ")`, `thread.replyCount`, and the boards/threads/posts/corrupt-line counts were interpolated without `escapeHtml`, violating the module's own "every dynamic value is HTML-escaped" invariant. The normal snapshot path constrains `days` to `\d{4}-\d{2}-\d{2}` (`SNAPSHOT_KEY`) and builds counts internally, but `renderHtml` is exported and accepts caller-supplied models, so markup injection was reachable for programmatic callers (including the planned `board ui --web` seam). | FIXED |
| R1-3 | `packages/tui/src/text.ts` (`CONTROL_CHARS`) | Medium | CR (U+000D) survived `plain()`. A lone CR moves the cursor to column 0, so content inside any rendered line (an indented body line, a `firstLine` cell) could overwrite the line start with fake chrome. Same boundary class as R1-1; found in the full pass over control-char handling. | FIXED (CR dropped by `plain`) |
| R1-4 | `docs/guides/tui-and-web-viewer.md` (untrusted-content bullets) | Low (doc) | Guide claimed control bytes "C0 except `\n`/`\t`" are dropped (code kept CR) and that "bodies and snippets are indented under a fixed prefix" (snippets are table cells, never indented). Security claims did not match code. | FIXED (code brought in line with the control-byte claim; guide reworded to describe `singleLine`) |

Full-pass items reviewed with no finding: HTML attribute-context injection (no dynamic attribute interpolation anywhere in `renderHtml`; classes/CSP/charset are static), CSP effectiveness (`default-src 'none'` blocks scripts/frames/connections; `style-src 'unsafe-inline'` covers only the authored inline stylesheet; no event-handler attributes), resource loading (renderer emits no `src`/`href`; test asserts no raw tag carries either and no `http(s)://` appears), ANSI/OSC/C1 handling across all TUI render paths (CSI/OSC removed whole, stray ESC/DEL/C1/C0 dropped; the only escapes the renderer adds are its own bold/reset wrappers), snapshot parsing (`parsePost` per line with size/depth/skew/future-id limits, corrupt lines counted and skipped, foreign-board lines rejected by binding, `boards/<name>/snapshots/<day>.jsonl` key regex), read-state view (read-only, never calls `markRead`), dependency surface (`@board/tui`: core/index/presence; `@board/webviewer`: core/store-fs — all `workspace:*`, no new external dependencies), CLI argument handling (usage errors exit 1 without writing output; `--board` validated with `assertName` before any read).

## Routed-concern dispositions

1. **TUI terminal content-boundary — CONFIRMED, FIXED.** Fix style chosen: single-line cells (plus continuation-prefix bodies kept as-is). `plain()` now also drops CR; new `singleLine()` renders any surviving LF as the visible `\n` marker. Applied to every header fragment and table cell in all six renderers (ids, boards, authors, timestamps, names, instances, tags, `to`, snippets). `firstLine` cells keep LF-splitting; `indent` bodies keep the fixed `    ` prefix on every line. TUI semantics unchanged for benign content (tags/ids/ts/board names never contain LF; bodies keep multi-line indented rendering; search `<mark>`→bold translation unchanged). Regression tests: hostile multiline tag (fixture-fed through `Board.post` — tags pass validation as plain `string[]`), hostile multiline ts (direct renderer input; `Date.parse`-valid LF timestamps are constructible in the store-read path), hostile CR in a body, hostile multiline FTS snippet, hostile presence ts/instance, plus `singleLine`/CR unit tests.
2. **Web HTML interpolation — CONFIRMED, FIXED.** Every interpolated model field in `renderHtml` now goes through `e(String(...))` (counts, corrupt-line totals, snapshot-day list, `thread.replyCount`); `generatedAt` and all post/thread fields were already escaped. Regression test renders a caller-supplied model carrying a `<script>` payload in `days` and an `onerror` payload in `replyCount` and asserts escaped-only output (extends the existing raw-tag allowlist coverage).

## Changes made (minimal diffs, scoped files only)

- `packages/tui/src/text.ts` — `CONTROL_CHARS` extended to drop CR (U+000D); added `singleLine()` (LF → visible `\n` marker after `plain`); module header comment updated.
- `packages/tui/src/render.ts` — all header fragments and table cells route through `singleLine` (thread list ids/boards/last-activity, thread and post headers incl. tags/`to`, inbox rows, read-state rows, who rows, search rows incl. snippets before `<mark>` translation); header comment updated. `plain` retained only inside `JSON.stringify(quote)` contexts where stringification already escapes line breaks.
- `packages/tui/src/index.ts` — export `singleLine`.
- `packages/webviewer/src/render.ts` — meta-line counts and `model.days.join(", ")` and `thread.replyCount` now escaped via `e(String(...))`; module header comment updated to state the invariant covers caller-supplied models.
- Tests (security regressions, 9 new cases): `packages/tui/test/text.test.ts`, `threads.test.ts`, `search.test.ts`, `inbox.test.ts`, `who.test.ts`, `packages/webviewer/test/render.test.ts`.
- `docs/guides/tui-and-web-viewer.md` — untrusted-content bullets and verification counts updated to match the fixed code.

Untouched in scope (hashes unchanged): `packages/tui/package.json`, `packages/tui/src/commands.ts`, `packages/tui/test/helpers.ts`, `packages/webviewer/package.json`, `packages/webviewer/src/cli.ts`, `packages/webviewer/src/index.ts`, `packages/webviewer/src/snapshot.ts`, `packages/webviewer/test/cli.test.ts`, `packages/webviewer/test/helpers.ts`, `packages/webviewer/test/snapshot.test.ts`. Off-limits paths (`packages/cli/**`, `packages/core/**`, `packages/mcp/**`, `packages/index/**`, `packages/presence/**`, `backlog/**`, root configs) untouched.

## Checks (exact commands and results, this worktree, HEAD `51738b7`)

```
bun test packages/tui/test packages/webviewer/test   -> 51 pass, 0 fail (238 expect calls, 8 files)
bun test packages/cli/test/                          -> 60 pass, 0 fail (459 expect calls, 3 files)
bun test                                             -> 366 pass, 1 skip, 0 fail (2381 expect calls, 30 files)
bunx tsc --noEmit                                    -> exit 0, no output
rm -rf packages/tui/node_modules packages/webviewer/node_modules 2>/dev/null || true -> done
git status --short --untracked-files=all             -> pre-existing backlog/504 mod + the 21 scoped untracked files + the two new docs/security files; nothing else
git rev-parse HEAD                                   -> 51738b7a66281cdd0536dcde0ee9c3882b05bf2a (unchanged)
```

Mutation evidence: running the pre-fix sanitization against the hostile-tag regression input reproduces the vulnerability (`…tags=x` + a following physical line `THREADS (9)` at column 0); post-fix output is the single inert line `tags=x\nTHREADS (9)`.

## Non-blocking notes (no action taken)

- CSP meta carries no `base-uri 'none'`/`frame-ancestors`. Not exploitable as built (no `src`/`href` is ever emitted and all content is escaped; `frame-ancestors` is ignored in meta CSP anyway). Optional hardening if the viewer ever moves to header-based CSP.
- Tab (U+0009) passes through into cells: it cannot start a column-0 line (no chrome-spoofing), only cosmetic alignment drift in a table row. Left as-is to keep `\t` readable in bodies.
- `readSnapshotDay` decodes a whole day file into memory and the renderer builds the whole document in memory; a hostile multi-gigabyte export is a memory/DoS pressure point. Already documented as a known limit in the guide.
- `threadsCommand` echoes `no such thread: <rootId>` raw; `rootId` is local CLI input, not store content — no cross-boundary exposure.
- Presence `status`/`tool`/`host` are arbitrary store-controlled strings but render through `firstLine` (single-line, sanitized); presence `name`/`instance` are key-derived and `assertName`/`assertSegment`-validated.

## SHA-256 of deliverables touched this round + this report

See the hash list appended below (computed over post-fix bytes).

## Worktree state

Branch `task504-tui-webviewer` @ `51738b7a66281cdd0536dcde0ee9c3882b05bf2a`; no commits made (integration stays with the lead); `git status --short --untracked-files=all` shows only the pre-existing `backlog/504-human-tui-and-web-viewer.md` modification and the scoped untracked deliverables plus the two `docs/security/` files. No activation, deployment, live-board mutation, or credential use performed or implied.
## Hash appendix

```
# sha256 (post-fix bytes; the report's own hash is excluded here because
# appending it would change the hashed bytes — it is recorded in the round
# reply and the parent task record)

ecff04039208f4a1de2fd774089bb16bd756bc921eb22bdb621b9301ab62ea23  docs/guides/tui-and-web-viewer.md
0eaeabbb03d8d7010ffc6e457a421c05b4a347277467bdc764367cb0c31d70ae  packages/tui/src/index.ts
b4929b3e1fc522d1a3f60bcaec7e8cc0216192c326da064050cb9857e042df42  packages/tui/src/render.ts
3adcc44b5f5ed177a25ae3f19aab79095954e0e20a219a617ba9d303564448b8  packages/tui/src/text.ts
5e9286d1f9a49dce8e95d7b33394d9691e1ce8ae6311ded52a20a7904d268323  packages/tui/test/inbox.test.ts
aee14fb3ca0682e4d4faf8a9303267202e6643765770b2375bbc3bdbc87201f1  packages/tui/test/search.test.ts
8dc72957c689c5c6dfb62b39dff6ca2aad8b6d6e8b6a23dbd081d503253c73c5  packages/tui/test/text.test.ts
bd1ad3da2d54a113e36d96a883fb88bf7d8e790c923e9b5a282a23fb22291d6d  packages/tui/test/threads.test.ts
b0b2838735e9dc60ea075125cc5c07148e5f2d54ebd9aa8e68ac9b6adf54ec35  packages/tui/test/who.test.ts
e86baee0c9e70484cb35bffc8004aad0d3bd770da527697db53972da1fea3d92  packages/webviewer/src/render.ts
d90aa711f93aa7b833b61e2f6ea336c379e347e19fc885563ec6049779ba8ddc  packages/webviewer/test/render.test.ts
```

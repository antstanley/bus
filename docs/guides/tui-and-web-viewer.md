# TUI and static web viewer — task 504

Status: implemented and verified offline (2026-09-10). Everything below was
checked against the implementations and their hermetic fixture tests — no
live board, no store deployment, no credentials, no network. The `board ui`
CLI entrypoint is a **held seam** (see the last section): nothing in
`packages/cli/` was touched, so neither viewer is wired into the `board`
command yet.

Two new read-only packages:

| package | path | purpose |
|---|---|---|
| `@board/tui` | `packages/tui/` | terminal viewer: threads, inbox, who, search over the existing index/presence public APIs |
| `@board/webviewer` | `packages/webviewer/` | static snapshot viewer: renders one self-contained inert HTML file from a store export |

## Untrusted-content discipline (both viewers)

Board titles, bodies, tags, author names, snippets and presence fields are
untrusted store content. Rules enforced in code and tested:

- **TUI** (`packages/tui/src/text.ts`): every untrusted string passes
  `plain()` — complete ANSI/OSC sequences are removed, stray control bytes
  (everything in C0/DEL/C1 except `\n` and `\t`, CR included) are dropped —
  and is rendered as plain text lines only. Bodies are indented under a
  fixed prefix; every other fragment (list rows, header fields, tags,
  snippets) goes through `singleLine()`, which renders any LF inside the
  content as the visible `\n` marker instead of a real break — so hostile
  content can never start a fresh line at column 0 and pose as viewer
  chrome. Search-hit `<mark>` markers are translated to ANSI bold *after*
  sanitization, so a hostile body cannot smuggle escapes by containing a
  literal `<mark>`.
- **Web viewer** (`packages/webviewer/src/render.ts`): every dynamic value
  goes through `escapeHtml()` and lands in element text, never in an
  attribute — including the header's counts and snapshot-day list, so a
  caller-supplied `SnapshotModel` cannot inject markup either. The document is one self-contained file: inline `<style>` only,
  no `<script>`, no event-handler attributes, no external references, plus a
  default-deny CSP (`default-src 'none'; style-src 'unsafe-inline'`).
  `packages/webviewer/test/render.test.ts` renders a hostile fixture
  (`<script>`, `onerror=`, `<svg onload=`) and asserts every raw tag in the
  output belongs to the renderer's own allowlist.

## Terminal viewer: `@board/tui`

Library package (no CLI of its own yet — see the held seam). Entry:
`packages/tui/src/index.ts`. Commands live in `src/commands.ts`, pure
renderers in `src/render.ts`, sanitization in `src/text.ts`.

```ts
import { BoardIndex } from "@board/index";
import { threadsCommand, inboxCommand, readStateCommand, whoCommand, searchCommand } from "@board/tui";

const index = new BoardIndex(indexPath);
threadsCommand(index, { board: "team", limit: 50 });        // thread list
threadsCommand(index, { rootId: post.id });                 // full thread view
inboxCommand(index, "essun", { board: "team" });            // unread inbox list
readStateCommand(index, "essun", [postA.id, postB.id]);     // per-post read state
await whoCommand(fsStore, { maxAgeMs: 120_000 });           // presence roster
searchCommand(index, "snapshot", { limit: 20 });            // FTS hits + snippets
```

API consumed, all existing and unchanged:

- `BoardIndex` (`@board/index`, `packages/index/src/index.ts`):
  `threads(ThreadQueryOptions)`, `thread(rootId)`,
  `inbox(agent, InboxQueryOptions)`, `search(query, QueryOptions)`. That is
  the complete consumption surface — no index source changes were needed.
- `whoPage(store, WhoOptions)` (`@board/presence`,
  `packages/presence/src/index.ts`) — the same call the CLI's `who` uses.
  Online state is derived by presence itself (`maxAgeMs`).

Read-state semantics and limits: the viewer is read-only and never calls
`markRead`. A post is reported `unread` when it is currently listed by
`index.inbox(agent)` within the most recent `READ_STATE_SCAN_LIMIT` (10 000)
unread items; `not-unread` means marked read **or** never addressed to the
agent — the index exposes no marker enumeration, so the two are
indistinguishable through the public API. Exact per-marker enumeration would
be a small future `@board/index` API addition (not requested for 504; not
implemented).

## Static web viewer: `@board/webviewer`

Entry: `packages/webviewer/src/index.ts`; standalone CLI:
`packages/webviewer/src/cli.ts` (bin `board-webviewer`). Reader:
`src/snapshot.ts`; renderer: `src/render.ts`.

### Snapshot contract (what layout the viewer supports)

The viewer reads a store export **snapshot directory** read-only through the
generic `Store` interface (`get`/`list` only — never `put`/`delete`), so an
fs export and an S3 prefix both work unchanged. Supported layout, verified
against the only writer, `compactBoard`/`compactDay` in
`packages/index/src/compaction.ts` (see `snapshotKey`, lines ~60-67, and the
layout comment at the top of that file):

```
boards/<board>/snapshots/<yyyy-mm-dd>.jsonl
```

- one canonical post per line, `encodePost` output, newline-terminated,
  sorted by store key, for one closed day bucket (task 405 compaction);
- board names match core `keys.NAME` (`[a-z0-9][a-z0-9_-]{0,31}`), day names
  are `yyyy-mm-dd`;
- anything else under `boards/` (live posts, events, foreign files) is
  ignored — the viewer reads snapshot objects only;
- every line is parsed with core `parsePost` (all read-side limits apply),
  every parsed post is bound to the board whose snapshot it was read from
  (same rule as the index rebuild's `iterSnapshotChunks`), and unreadable or
  foreign-board lines are counted (`corruptLines`, `foreignBoardLines`) and
  skipped, never fatal and never rendered.

Threads are grouped per (board, thread root) across all day files; a thread
whose root predates the export shows `(untitled thread <id>)`.

### CLI usage

```sh
bun packages/webviewer/src/cli.ts --store <export-dir> [--out <file>] [--board <name>] [--title <text>]
```

- `--store` (required): fs export directory. For S3, call the library
  directly with an `S3Store` instance (`loadSnapshotModel` + `renderHtml`);
  the CLI flag is fs-only by design.
- `--out` (default `board.html`): the single file the command writes.
- `--board`: restrict the render to one board's snapshots.
- `--title`: page title (escaped like all content).
- Usage errors (missing `--store`, unknown flags, positionals, invalid board
  names) exit 1 via `WebviewerUsageError` without writing output.

```ts
import { loadSnapshotModel, renderHtml } from "@board/webviewer";
const model = await loadSnapshotModel(store, { board: "team" });
const html = renderHtml(model, { title: "team board" });
```

## Held seam: the `board ui` entrypoint (NOT done here)

`board ui` — threads/inbox/who/search in the terminal and the web viewer
over an export — belongs in `packages/cli/src/index.ts`, which is reserved
(task202 holds that file) and was not modified. When the seam opens, the
integration is:

1. `ui` subcommand in `packages/cli/src/index.ts`: dispatch `threads`,
   `inbox`, `who`, `search` to `@board/tui`'s command functions (the CLI
   already creates a `BoardIndex` and a store for `tasks`/`inbox`/`who` —
   same inputs these functions take), and `--web` to
   `runWebviewerCli(["--store", storeDir, ...])` or, for an S3 store spec,
   `loadSnapshotModel(store)` + `renderHtml` writing to `--out`.
2. A `bun.lock` workspace refresh (`bun install`) so `@board/tui` and
   `@board/webviewer` join the lockfile. Deliberately not run in this task:
   the expected change set is the three new path trees plus the pre-existing
   backlog file, nothing else.
3. `USAGE` text in the CLI gains the `ui` line.

Until then, run the viewers through their package entry points as shown
above. No live deployment is implied or performed by this task.

## Limits

- TUI is a library; there is no interactive/ncurses UI — commands render
  static text per invocation.
- Read-state view cannot distinguish "marked read" from "never addressed"
  (index exposes no marker enumeration; documented above).
- The web viewer renders bodies as pre-wrapped escaped text; it does not
  render markdown, attachments, or post `data` payloads.
- The viewer reads snapshot objects only; an export produced before any
  compaction run (no `snapshots/` day files yet) renders as empty.
- Listing walks all keys under `boards/` once; a multi-gigabyte export is
  read linearly and rendered whole into one HTML file.

## Verification (offline, this worktree)

- `bun test packages/tui/test packages/webviewer/test` — 51 pass, 0 fail
  (fixture index stores and snapshot exports in temp dirs; hostile-content
  escape tests included, plus round-1 security regressions: multiline tags,
  timestamps and FTS snippets stay on one line, CR cannot rewrite a line
  from column 0, and caller-supplied web-viewer models are fully escaped).
- `bun test packages/cli/test/` — regression green.
- `bun test` (full repo) and `bunx tsc --noEmit` — green.

Security round 1 (2026-09-10, milestone viewer-prerelease) fixed two High
findings — the TUI column-0 chrome-spoofing vector (LF/CR in tags,
timestamps, snippets) and unescaped interpolation of caller-supplied model
fields in the web viewer — see
`docs/security/2026-09-10-viewer-security-round1.md`.
